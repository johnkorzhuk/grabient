import { delocalizePath } from "@grabient/i18n";
import { isServer } from "@solidjs/web";
import type { PostHog } from "posthog-js";
import { browserOptedOut, type Consent, consent, initConsent } from "./consent.ts";

/* Two tools, each behind its own consent (consent.ts). Zaraz, configured on the zone, carries the site's events to GA4
   under Analytics; under Marketing a signed-in reader's events carry a hash of the account's id, so GA4 counts that
   reader's visits on every device as one person's. PostHog records sessions under Session replay, through the site's
   own proxy (/e), and does nothing else: no events, pageviews, person profiles or identities, so a recording is
   anonymous and nothing of it outlives an account. Both run on grabient.com alone, never for a bot, and never before
   the reader has pressed or typed something on the page. An app's request and the account's answer to it (the consent
   page, and sign-in on the way there) and the newsletter's unsubscribe page stay out of both. Browser only. */

declare global {
  interface Window {
    zaraz?: {
      track?: (event: string, properties: Record<string, string | number | boolean>) => void;
      consent?: {
        APIReady?: boolean;
        purposes?: Record<string, unknown>;
        set(value: Record<string, boolean>): void;
        sendQueuedEvents(): void;
      };
    };
    posthog?: PostHog;
  }
}

type Properties = Record<string, string | number | boolean>;
interface AnalyticsUser {
  id?: string;
  createdAt?: string | Date;
}

const POSTHOG_KEY = "phc_YtRERLNG3jXUoOisN6NXQS9sI5Iz0gAUkiY7nX7puTK";
const HOSTS = new Set(["grabient.com", "www.grabient.com"]);
const BOTS = /bot|crawl|spider|headless|lighthouse|pagespeed|slurp|preview/i;
/** the query parts a page's address keeps for analytics: the view and the page, never a token or the words */
const KEPT_PARAMS = ["style", "steps", "angle", "view", "graph", "page", "limit", "sort"];
/** a press within this long of the same press for the same palette is the same press */
const REPEAT_MS = 1000;
/** a sign-in pressed here counts as done once the account arrives within this long */
const LOGIN_MS = 3_600_000;
const LOGIN_KEY = "gb_login";

const landing = isServer
  ? null
  : { url: location.href, referrer: document.referrer, at: Date.now() };
let initialized = false;
let interacted = false;
let preferences: Consent | null = null;
let sdk: PostHog | null = null;
let loading: Promise<void> | null = null;
let user: AnalyticsUser | null = null;
let internal = false;
let queued: [string, Properties][] = [];
let lastPage: string | null = null;
let pageSent = false;
const toolsUsed = new Set<string>();
const recent = new Map<string, number>();

function withheld(): boolean {
  const path = delocalizePath(location.pathname).path;
  return (
    path === "/connect" ||
    path === "/unsubscribe" ||
    path.startsWith("/unsubscribe/") ||
    (path === "/login" &&
      (new URLSearchParams(location.search).get("redirect") ?? "").startsWith("/oauth/"))
  );
}
const enabled = () =>
  !isServer && HOSTS.has(location.hostname) && !withheld() && !BOTS.test(navigator.userAgent);
const analyticsAllowed = () => enabled() && interacted && !!preferences?.categories.analytics;
/* a recording is never made for a browser that says Do Not Track, whatever the switch says */
const replayAllowed = () =>
  enabled() && interacted && !!preferences?.categories.sessionReplay && !browserOptedOut();
const marketingAllowed = () =>
  analyticsAllowed() && !!preferences?.categories.marketing && !browserOptedOut();

/** The account as GA4 knows it: a 64-bit FNV-1a hash of its id, so GA4 never holds the id the database does. */
export function accountKey(id: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(id))
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
  return hash.toString(16).padStart(16, "0");
}

/** The page's address as analytics may hold it: the view and the page, and on a visit's first page its campaign. */
export function cleanPage(href: string, campaign?: string): string {
  const url = new URL(href);
  const clean = new URLSearchParams();
  for (const key of KEPT_PARAMS) {
    const value = url.searchParams.get(key);
    if (value) clean.set(key, value.slice(0, 200));
  }
  if (campaign) {
    for (const [key, value] of new URL(campaign).searchParams)
      if (/^utm_[a-z_]{1,20}$/.test(key)) clean.set(key, value.slice(0, 200));
  }
  return `${url.origin}${url.pathname}${clean.size ? `?${clean}` : ""}`;
}

/* Zaraz itself, only once analytics is allowed: while the zone injects it on every page it is here already */
let zarazAsked = false;
function loadZaraz() {
  if (window.zaraz || zarazAsked || !analyticsAllowed()) return;
  zarazAsked = true;
  const script = document.createElement("script");
  script.src = "/cdn-cgi/zaraz/i.js";
  script.referrerPolicy = "origin";
  script.onload = flushEvents;
  script.onerror = () => {
    zarazAsked = false;
  };
  document.head.append(script);
}
/* what was tracked before Zaraz was here, sent once it is */
function flushEvents() {
  const track = window.zaraz?.track;
  if (!track || !analyticsAllowed()) return;
  const due = queued;
  queued = [];
  for (const [name, values] of due) {
    try {
      track(name, values);
    } catch {
      /* the zone's integration is optional */
    }
  }
}
function send(name: string, values: Properties) {
  /* GA4 reads the page from dl and its title from dt, or else the browser's own address, query and all */
  let out: Properties = { dl: cleanPage(location.href), dt: document.title, ...values };
  /* an admin's own browsing is the site at work: GA4's internal-traffic filter drops what carries this */
  if (internal) out = { ...out, traffic_type: "internal" };
  if (user?.id && marketingAllowed()) out = { ...out, uid: accountKey(user.id) };
  const track = window.zaraz?.track;
  if (track) {
    try {
      track(name, out);
    } catch {
      /* the zone's integration is optional */
    }
  } else {
    queued.push([name, out]);
    if (queued.length > 100) queued.shift();
  }
}

function firstTouch(): Record<string, string | number> | null {
  if (!landing) return null;
  const url = new URL(landing.url);
  const value: Record<string, string | number> = { t: landing.at, l: url.pathname.slice(0, 200) };
  for (const [field, param] of [
    ["s", "utm_source"],
    ["m", "utm_medium"],
    ["c", "utm_campaign"]
  ]) {
    const text = url.searchParams.get(param);
    if (text) value[field] = text.slice(0, 200);
  }
  try {
    const host = new URL(landing.referrer).hostname;
    if (host !== url.hostname) value.r = host.slice(0, 200);
  } catch {
    /* no referrer from another site */
  }
  return value;
}
/* how a reader first arrived, kept first-party: stored with the account if one is made, sent to neither tool */
function keepAttribution() {
  if (!analyticsAllowed()) return;
  try {
    if (/(?:^|;\s*)gb_attr=/.test(document.cookie)) return;
    const value = firstTouch();
    if (value)
      // biome-ignore lint/suspicious/noDocumentCookie: Firefox has no Cookie Store API
      document.cookie = `gb_attr=${encodeURIComponent(JSON.stringify(value))}; Path=/; Max-Age=7776000; SameSite=Lax; Secure`;
  } catch {
    /* a sandboxed frame keeps no cookies */
  }
}
function context(properties: Record<string, unknown>): Properties {
  const all: Record<string, unknown> = {
    route: location.pathname,
    locale: document.documentElement.lang || "en",
    signed_in: !!user?.id,
    ...properties
  };
  const out: Properties = {};
  for (const [key, value] of Object.entries(all)) {
    if (typeof value === "string") out[key] = value.slice(0, 500);
    else if (typeof value === "number" || typeof value === "boolean") out[key] = value;
  }
  return out;
}
/* PostHog's cookie and storage removed, so a reader who turns replay off leaves nothing of it behind */
function forgetPostHog() {
  try {
    const names = document.cookie
      .split(";")
      .map(c => c.trim().split("=")[0])
      .filter(n => n.startsWith("ph_"));
    const bare = location.hostname.replace(/^www\./, "");
    for (const name of names) {
      for (const domain of ["", `; domain=${location.hostname}`, `; domain=.${bare}`]) {
        // biome-ignore lint/suspicious/noDocumentCookie: Firefox has no Cookie Store API
        document.cookie = `${name}=; Path=/; Max-Age=0${domain}`;
      }
    }
    for (const store of [localStorage, sessionStorage]) {
      for (const key of Object.keys(store))
        if (key.startsWith("ph_") || key.startsWith("__ph_")) store.removeItem(key);
    }
  } catch {
    /* storage refused: nothing was kept */
  }
}
/* a sign-in pressed here, finished when the account arrives; a new account is a sign-up instead */
function signInConversions() {
  let started: { method?: unknown; at?: unknown } | null = null;
  try {
    started = JSON.parse(localStorage.getItem(LOGIN_KEY) ?? "null");
    if (started && !(typeof started.at === "number" && Date.now() - started.at < LOGIN_MS)) {
      localStorage.removeItem(LOGIN_KEY);
      started = null;
    }
  } catch {
    /* storage refused */
  }
  if (!analyticsAllowed() || !user?.id) return;
  const fresh = !!user.createdAt && Date.now() - new Date(user.createdAt).getTime() < 300_000;
  const method = typeof started?.method === "string" ? started.method : null;
  try {
    if (started) {
      localStorage.removeItem(LOGIN_KEY);
      if (!fresh && method) trackEvent("login", { method });
    }
    const key = `gb_su_${user.id}`;
    if (fresh && !sessionStorage.getItem(key)) {
      trackEvent("sign_up", { method: method ?? "session" });
      sessionStorage.setItem(key, "1");
    }
  } catch {
    /* the markers are optional */
  }
}
function apply() {
  if (analyticsAllowed()) {
    loadZaraz();
    keepAttribution();
    if (!pageSent && lastPage !== null) sendPage();
    signInConversions();
  } else {
    queued = [];
    if (enabled() && preferences && !preferences.categories.analytics) {
      try {
        // biome-ignore lint/suspicious/noDocumentCookie: Firefox has no Cookie Store API
        document.cookie = "gb_attr=; Path=/; Max-Age=0; SameSite=Lax; Secure";
        localStorage.removeItem(LOGIN_KEY);
      } catch {
        /* nothing was kept */
      }
    }
  }
  if (replayAllowed()) {
    if (sdk) {
      if (!sdk.has_opted_in_capturing()) sdk.opt_in_capturing({ captureEventName: null });
      sdk.startSessionRecording();
    } else void loadRecorder();
  } else {
    if (sdk) {
      sdk.stopSessionRecording();
      sdk.opt_out_capturing();
    }
    if (preferences && !preferences.categories.sessionReplay) forgetPostHog();
  }
}
function loadRecorder(): Promise<void> {
  if (!replayAllowed() || sdk) return Promise.resolve();
  loading ??= import("posthog-js")
    .then(
      ({ default: posthog }) =>
        new Promise<void>(resolve => {
          /* the choice may have changed while the recorder downloaded */
          if (!replayAllowed()) return resolve();
          posthog.init(POSTHOG_KEY, {
            api_host: `${location.origin}/e`,
            ui_host: "https://us.posthog.com",
            person_profiles: "never",
            capture_pageview: false,
            capture_pageleave: false,
            capture_performance: false,
            capture_exceptions: false,
            autocapture: false,
            capture_dead_clicks: false,
            capture_heatmaps: false,
            disable_surveys: true,
            respect_dnt: true,
            advanced_disable_decide: true,
            opt_out_capturing_by_default: true,
            opt_out_persistence_by_default: true,
            disable_session_recording: true,
            session_recording: {
              maskAllInputs: true,
              maskTextSelector: "*",
              blockClass: "ph-no-capture",
              blockSelector: "img, picture, video, canvas"
            },
            loaded: loaded =>
              setTimeout(() => {
                /* the instance is the library's own PostHog; its callback's type leaves out what opting in takes */
                const instance = loaded as PostHog;
                sdk = instance;
                window.posthog = instance;
                /* an identity an older build left in this browser goes: a recording here is anonymous */
                if (instance.get_property("$user_state") === "identified") instance.reset();
                apply();
                resolve();
              })
          });
        })
    )
    .catch(() => {
      /* analytics never breaks a press */
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** Starts both tools behind the reader's consent. Once, after the page is live. */
export function initializeAnalytics(): void {
  if (!enabled() || initialized) return;
  initialized = true;
  window.addEventListener("grabient:consent", event => {
    preferences = (event as CustomEvent<Consent>).detail;
    apply();
  });
  const interact = (event: Event) => {
    if (!event.isTrusted) return;
    interacted = true;
    apply();
    document.removeEventListener("pointerdown", interact, true);
    document.removeEventListener("keydown", interact, true);
  };
  document.addEventListener("pointerdown", interact, true);
  document.addEventListener("keydown", interact, true);
  window.addEventListener("load", flushEvents);
  void initConsent().then(() => {
    preferences = consent();
    apply();
  });
}

/** The account, for the sign-in conversions, whether a reader is signed in, and under Marketing a hash of its id. Its
    name and email address go to neither tool. */
export function setAnalyticsUser(next: AnalyticsUser | null): void {
  user = next;
  if (!next) internal = false;
  if (initialized) signInConversions();
}
/** The account is an admin's: its events are the site at work. */
export function setAnalyticsInternal(on: boolean): void {
  internal = on;
}
/** Whether the account signed in here is an admin's. */
export const analyticsInternal = (): boolean => internal;
/** Recording off and PostHog's storage gone: for an account being deleted, before the page leaves. */
export function forgetAnalytics(): void {
  if (sdk) {
    sdk.stopSessionRecording();
    sdk.opt_out_capturing();
  }
  if (!isServer) forgetPostHog();
}

/** An event to GA4, where analytics is allowed. The same press for the same palette within a second is one. */
export function trackEvent(name: string, properties: Record<string, unknown> = {}): void {
  if (!analyticsAllowed()) return;
  const key = `${name}:${properties.seed ?? ""}`;
  const now = Date.now();
  if (now - (recent.get(key) ?? 0) < REPEAT_MS) return;
  recent.set(key, now);
  if (recent.size > 100) for (const [k, at] of recent) if (now - at > 10_000) recent.delete(k);
  send(name, context(properties));
}
/** A press that needs an account, made signed out. */
export const trackSignInPrompt = (reason: "like" | "vote" | "saved" | "menu" | "search"): void =>
  trackEvent("sign_in_prompt", { reason });
/** A sign-in pressed: counted as begun, and as done once the account arrives. */
export function trackLoginStart(method: "magic_link" | "google"): void {
  trackEvent("login_start", { method });
  if (!analyticsAllowed()) return;
  try {
    localStorage.setItem(LOGIN_KEY, JSON.stringify({ method, at: Date.now() }));
  } catch {
    /* the marker is optional */
  }
}
/* A pageview: the zone's Zaraz sends none, so the visit's first page is sent here once analytics is allowed, with the
   campaign the visit arrived with */
function sendPage() {
  const page = cleanPage(location.href, pageSent ? undefined : landing?.url);
  pageSent = true;
  send("Pageview", { dl: page, route: new URL(page).pathname });
}
/** A page reached, named by its route: the same page again, an edit or a change of view sends nothing. A page reached
    before analytics was allowed is sent when it is. */
export function trackPageView(page: string): void {
  const previous = lastPage;
  lastPage = page;
  if (previous !== page) toolsUsed.clear();
  if (previous === page || !analyticsAllowed()) return;
  sendPage();
}
/** One of the editor's tools used: edit_<tool>, once a page. */
export function trackTool(tool: string): void {
  if (!analyticsAllowed() || toolsUsed.has(tool)) return;
  toolsUsed.add(tool);
  trackEvent(`edit_${tool}`);
}
