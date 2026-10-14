import { delocalizePath, localHref, msg, t } from "@grabient/i18n";
import { isServer } from "@solidjs/web";
import { createSignal } from "solid-js";
import * as v from "valibot";
import { READ_TIMEOUT } from "../../lib/query.ts";
import { setAnalyticsInternal, setAnalyticsUser, trackEvent } from "../analytics/analytics.ts";
import { onAccountChange } from "./state.ts";
import type { Profile } from "./wire.ts";

/* Who is signed in, as this browser knows it. The page asks the server (GET /api/auth/get-session) after its first
   render: public HTML never carries an account. The account last signed in here is kept in local storage, so the
   site opens signed in with no connection and the account's own things open from its copy (sync.ts), which this
   module loads only once an account is known. Nothing kept here is trusted by the server: every write goes by the
   session cookie. The account's role comes from its copy, which the server answers fresh, never from the session. */

export type Role = "admin" | "user";
export interface Account extends Profile {
  role: Role;
}

const SessionAnswer = v.nullable(
  v.object({
    user: v.object({
      id: v.string(),
      name: v.string(),
      email: v.string(),
      emailVerified: v.boolean(),
      image: v.nullable(v.string()),
      username: v.nullable(v.string()),
      createdAt: v.number(),
      reviewer: v.optional(v.literal(true))
    })
  })
);

// a session read within this long is the session, unless a check asks for a fresh one
const SESSION_FRESH_MS = 60_000;
const KEPT_USER = "grabient-account";
const ADMIN_TOOLS = "grabient-admin-tools";

/* the account as last heard, and its role, read at once: a signal's write shows a microtask later */
let user: Profile | null = null;
let admin = false;
const [current, setCurrent] = createSignal<Account | null>(null);
const [ready, setReady] = createSignal(false);
function publish() {
  setCurrent(user ? { ...user, role: admin ? "admin" : "user" } : null);
}

/** The account signed in here, or null signed out. Undefined until the first check answers, and on the server, which
    never knows: a page tells "not yet known" from "signed out" and draws neither before it knows. */
export const account = (): Account | null | undefined =>
  isServer || !ready() ? undefined : current();
/** The first session check has answered, or failed. */
export const sessionReady = (): boolean => !isServer && ready();
/** The account is an admin's, whatever this browser shows of the admin tools. */
export const adminAccount = (): boolean => account()?.role === "admin";

/* An admin can put the admin tools away in this browser and see the site as any account does. Every tool asks
   isAdmin(), so the switch lives here alone; the server still enforces the role. Only off is stored, so a new browser
   shows the tools, and other tabs follow a change. */
const toolsKept = () => {
  try {
    return localStorage.getItem(ADMIN_TOOLS) !== "off";
  } catch {
    return true;
  }
};
const [tools, setTools] = createSignal(true);
export const adminTools = (): boolean => isServer || tools();
export function setAdminTools(on: boolean) {
  setTools(on);
  try {
    if (on) localStorage.removeItem(ADMIN_TOOLS);
    else localStorage.setItem(ADMIN_TOOLS, "off");
  } catch {
    // this page keeps the choice
  }
}
/** The account is an admin's and the admin tools are on in this browser. */
export const isAdmin = (): boolean => adminAccount() && adminTools();

/** The account last signed in here, as kept. */
function keptUser(): Profile | null {
  try {
    const kept = JSON.parse(localStorage.getItem(KEPT_USER) || "null");
    if (typeof kept?.id !== "string" || typeof kept.name !== "string") return null;
    return {
      id: kept.id,
      name: kept.name,
      email: typeof kept.email === "string" ? kept.email : "",
      emailVerified: kept.emailVerified === true,
      image: typeof kept.image === "string" ? kept.image : null,
      username: typeof kept.username === "string" ? kept.username : null,
      // an older build kept the time as text
      createdAt: new Date(kept.createdAt).getTime() || 0
    };
  } catch {
    return null;
  }
}
function keepUser(next: Profile | null) {
  try {
    if (next) localStorage.setItem(KEPT_USER, JSON.stringify(next));
    else localStorage.removeItem(KEPT_USER);
  } catch {
    // nothing kept, or no storage
  }
}
/** The account this browser holds, read at once: the session's, or before any check the one kept here. */
export const keptUserId = (): string | null =>
  isServer ? null : (user?.id ?? keptUser()?.id ?? null);
/** A line for a document's head: it marks `<html data-account>` before anything paints when this browser kept an
    account, so a document that draws for an account or for a visitor shows the likely one until the session answers. */
export const keptAccountScript = `try{document.documentElement.toggleAttribute("data-account",!!localStorage.getItem(${JSON.stringify(KEPT_USER)}))}catch(e){}`;

/* The copy's engine, loaded once an account is known. */
type Engine = typeof import("./sync.ts");
let engineLoaded: Engine | null = null;
let engineLoading: Promise<Engine> | null = null;
/** The account copy's engine (sync.ts), loaded the first time something needs it. */
export const copyEngine = (): Promise<Engine> => engine();
/** The engine, when it has loaded: it has whenever the account's copy is open. */
export const engineNow = (): Engine | null => engineLoaded;
function engine(): Promise<Engine> {
  engineLoading ??= import("./sync.ts").then(sync => {
    sync.onSessionEnded(() => void loadAccount(true));
    sync.onProfile(profile => {
      if (profile.id === openUser) heard(profile);
    });
    engineLoaded = sync;
    return sync;
  });
  return engineLoading;
}
/** The account whose copy is open (or opening) in this tab, and how its collections name it. */
let openUser: string | null = null;
const copyUser = (profile: Profile) => ({
  id: profile.id,
  name: profile.username,
  display: profile.name.trim() || null
});
/* the copy's deletion on its way, which a sign-out waits for before the page leaves */
let forgetting: Promise<void> = Promise.resolve();
/** The copy open here closes; `ended` says the server ended the account's session, so what the copy held of the
    server goes from this browser with it (the changes not yet sent wait for its next sign-in here). */
function closeCopy(ended: boolean) {
  const id = openUser;
  openUser = null;
  admin = false;
  setAnalyticsInternal(false);
  if (id) forgetting = engine().then(sync => sync.closeAccount(id, ended).catch(() => {}));
}

if (!isServer) {
  setTools(toolsKept());
  addEventListener("storage", event => {
    if (event.key === ADMIN_TOOLS || event.key === null) setTools(toolsKept());
  });
  onAccountChange(change => {
    if (change.admin === admin) return;
    admin = change.admin;
    setAnalyticsInternal(admin);
    publish();
  });
}

/** What the server said of the session: the copy follows a change of account, and a new username renames it. */
function heard(next: Profile | null) {
  const was = user?.id ?? keptUser()?.id ?? null;
  const opened = openUser;
  const now = next?.id ?? null;
  /* the copy open here is another account's, or nobody's now: it closes, and what it held of the server goes. Two
     checks can overlap, and the copy may already be open for the account an older check found: nothing changed */
  if (opened !== null && opened !== now) closeCopy(true);
  else if (opened === null && user && user.id !== now) admin = false;
  // the account last signed in here has no session now: its copy's server data goes, its unsent changes wait
  if (!next && was && was !== opened) {
    forgetting = engine().then(sync => sync.closeAccount(was, true).catch(() => {}));
  }
  /* a new username, given here or on another device: the account's private collections moved under it on the server,
     so the copy takes the name for what it makes and asks where they live now */
  const renamed =
    next !== null && opened === next.id && user?.id === next.id && user.username !== next.username;
  checkedAt = Date.now();
  keepUser(next);
  user = next;
  publish();
  setReady(true);
  setAnalyticsUser(next && { id: next.id, createdAt: new Date(next.createdAt) });
  if (renamed && engineLoaded) {
    void engineLoaded.openAccount(copyUser(next));
    engineLoaded.schedule(0, true);
  }
}

let request: Promise<Profile | null> | null = null;
let requestFresh = false;
let checkedAt = 0;
let generation = 0;
/** Asks the server who is signed in: one ask at a time, and a check made within the last minute answers again unless
    `fresh` asks the database instead of the session's signed five-minute copy. A failed check never signs anyone out:
    with no connection, or none that answers, the account last signed in here stands. */
export function refreshSession(fresh = false): Promise<Profile | null> {
  if (isServer) return Promise.resolve(null);
  if (request && (!fresh || requestFresh)) return request;
  if (!fresh && checkedAt && Date.now() - checkedAt < SESSION_FRESH_MS) {
    return Promise.resolve(user);
  }
  // a newer check, or a sign-out, wins over an answer still on its way
  const ticket = ++generation;
  requestFresh = fresh;
  const work = (async () => {
    try {
      const response = await fetch(
        `/api/auth/get-session${fresh ? "?disableCookieCache=true" : ""}`,
        { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(READ_TIMEOUT) }
      );
      if (!response.ok) throw new Error(`session ${response.status}`);
      const next = v.parse(SessionAnswer, await response.json())?.user ?? null;
      if (ticket === generation) heard(next);
      return next;
    } catch {
      if (ticket === generation) {
        // the next ask goes out at once
        checkedAt = 0;
        if (!user) {
          user = keptUser();
          publish();
        }
        setReady(true);
      }
      return user;
    } finally {
      if (ticket === generation) {
        request = null;
        requestFresh = false;
      }
    }
  })();
  request = work;
  return work;
}

let loading: Promise<void> | null = null;
/** The account and its copy: the session is checked, the account's copy opens the first time (or syncs, when
    `force`d and already open), and a browser new to the account waits for its first sync, three seconds at most. */
export function loadAccount(force = false): Promise<void> {
  if (isServer) return Promise.resolve();
  if (!loading || force) {
    const work = (async () => {
      const next = await refreshSession(force);
      if (!next) return;
      const sync = await engine();
      if (openUser !== next.id) {
        openUser = next.id;
        await sync.openAccount(copyUser(next));
      } else if (force) sync.schedule(0, true);
      await sync.copySettled(next.id);
    })().finally(() => {
      if (loading === work) loading = null;
    });
    loading = work;
  }
  return loading;
}

/** A look back at the window: with the copy open its forced sync answers who is signed in (a session gone answers
    401, which checks the session); with none, the session is asked. */
export function checkAccount() {
  if (openUser && engineLoaded?.copyOpen(openUser)) engineLoaded.schedule(0, true);
  else void loadAccount(true);
}

/** What a press needs of the account before it acts, waited for only while the page does not know it. A press never
    waits on a session check the page already made; a write whose session ended is refused by the server. */
export function accountKnown(): Promise<void> {
  const known = account();
  const open = !!known && openUser === known.id && !!engineLoaded?.copyOpen(known.id);
  return sessionReady() && (!known || open) ? Promise.resolve() : loadAccount();
}

/** The account whose copy a page may draw from, once the page knows it and its copy is open here; null signed out. */
export async function accountForCopy(): Promise<string | null> {
  if (!sessionReady() || (user && openUser !== user.id)) await loadAccount();
  const known = user;
  if (!known) return null;
  await (await engine()).whenOpen(known.id);
  return openUser === known.id ? known.id : null;
}

/** Signs out here, then loads `to` in the page's language: the consent page sends the reader on to sign in as
    another account. */
export async function signOut(to = "/"): Promise<void> {
  const answer = await authPost("/api/auth/sign-out");
  if (!answer.ok) throw new Error(authError(answer.body, msg("Couldn't sign out.")));
  trackEvent("logout");
  setAnalyticsUser(null);
  generation++;
  request = null;
  checkedAt = Date.now();
  closeCopy(true);
  keepUser(null);
  user = null;
  publish();
  setReady(true);
  await forgetting;
  location.assign(localHref(to));
}

/** The account was deleted: everything this browser kept of it goes, before the page leaves. */
export async function forgetAccount(): Promise<void> {
  const id = user?.id ?? keptUser()?.id;
  openUser = null;
  admin = false;
  keepUser(null);
  await forgetting;
  if (id) await (await engine()).eraseAccount(id).catch(() => {});
}

/** Only a path on this site: one slash, then no backslash and no control character. Anything else is home. */
export function safeRedirect(raw: string | null | undefined): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is refused
  if (!raw?.startsWith("/") || raw.startsWith("//") || /[\\\u0000-\u001f]/.test(raw)) {
    return "/";
  }
  return raw;
}
/** Sign in, then back to `returnTo` (by default this page, without its language). */
export function loginHref(returnTo?: string): string {
  const here = isServer ? "/" : delocalizePath(location.pathname + location.search).path;
  return `/login?redirect=${encodeURIComponent(safeRedirect(returnTo ?? here))}`;
}

/** A POST to the sign-in library, through the Worker's gate: the answer's status and body. */
export async function authPost(path: string, body: unknown = {}) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return {
    status: response.status,
    ok: response.ok,
    body: (await response.json().catch(() => ({}))) as unknown
  };
}
/** A failed call to the sign-in library, in the reader's words: the library says what went wrong in `message`, the
    Worker's gate in front of it in `error`. */
export const authError = (body: unknown, fallback: string): string => {
  const said = (body ?? {}) as { message?: unknown; error?: unknown };
  return t(
    typeof said.message === "string" && said.message
      ? said.message
      : typeof said.error === "string" && said.error
        ? said.error
        : fallback
  );
};
/** A private JSON call to the site, with the session's cookie. A refusal throws the server's words, translated: the
    Worker names the ones a page shows with msg(), with their values in `i18n`. A call the server never answers ends
    as a failure, which shownError says in the page's own words. */
export async function api<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST"
): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(READ_TIMEOUT),
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  });
  const answer = (await response.json().catch(() => ({}))) as {
    error?: unknown;
    i18n?: { message?: unknown; params?: Record<string, string> };
  };
  if (!response.ok) {
    const i18n = answer.i18n;
    throw new Error(
      typeof i18n?.message === "string"
        ? t(i18n.message, i18n.params)
        : t(
            typeof answer.error === "string"
              ? answer.error
              : msg("Something went wrong. Try again.")
          )
    );
  }
  return answer as T;
}
