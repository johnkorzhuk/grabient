import { localHref, msg, t } from "@grabient/i18n";
import { isServer } from "@solidjs/web";
import { createSignal } from "solid-js";

/* What every page has from the frame (whether the site can be reached, analytics), and stand-ins for what the account
   feature gives (who is signed in, features/account/session.ts). Each stand-in keeps the name and meaning of the export
   it stands for, so the merge with that feature makes this file a list of re-exports. Until then the session is read
   once from the sign-in library and no account reads as an admin's. */

/* the frame follows the connection on every page (Shell.tsx), so a page asking for it again changes nothing */
export {
  offline,
  unreachable,
  watchConnection as installConnection
} from "../../app/connection.ts";
export { trackEvent } from "../analytics/analytics.ts";

export type Role = "admin" | "user";
export interface Account {
  id: string;
  email: string;
  role: Role;
}

const [current, setCurrent] = createSignal<Account | null>(null);
/** The account signed in here, or null: null on the server and until the session is read. */
export const account = (): Account | null => (isServer ? null : current());
/** The account is an admin's. */
export const adminAccount = (): boolean => account()?.role === "admin";

let asked: Promise<void> | undefined;
/** Reads the session once the page is live: public HTML never carries an account. */
export function loadAccount(): Promise<void> {
  asked ??= fetch("/api/auth/get-session", { credentials: "same-origin", cache: "no-store" })
    .then(response => (response.ok ? response.json() : null))
    .then(body => {
      const user = (body as { user?: { id?: unknown; email?: unknown } } | null)?.user;
      if (typeof user?.id === "string")
        setCurrent({ id: user.id, email: String(user.email ?? ""), role: "user" });
    })
    .catch(() => undefined);
  return asked;
}

/** Signs out here, then loads `to` in the page's language. */
export async function signOut(to = "/"): Promise<void> {
  const response = await fetch("/api/auth/sign-out", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
  if (!response.ok) throw new Error(t(msg("Couldn't sign out.")));
  location.assign(localHref(to));
}

/** A private JSON call to the site with the session's cookie; a refusal throws the server's words, translated. */
export async function api<T>(path: string, body: unknown = {}): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const answer = (await response.json().catch(() => ({}))) as { error?: unknown };
  if (!response.ok)
    throw new Error(t(typeof answer.error === "string" && answer.error ? answer.error : FAILED));
  return answer as T;
}
const FAILED = msg("Something went wrong. Try again.");

/** A failure in the reader's words: the server's own, or the page's fallback for a request that never reached it. */
export const shownError = (reason: unknown, fallback: string): string =>
  reason instanceof Error && reason.message && !(reason instanceof TypeError)
    ? reason.message
    : t(fallback);
