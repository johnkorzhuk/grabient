import { delocalizePath } from "@grabient/i18n";
import { isServer } from "@solidjs/web";

/* Stands in for the accounts area's session (U08) until it lands, under its names: no one is signed in here, and the
   session counts as known once the page is live. */

export interface Account {
  id: string;
  username: string | null;
  name: string;
  image: string | null;
  role: "admin" | "user";
}

/** The account signed in here, or null. Null on the server and until the first check answers. */
export const account = (): Account | null => null;

/** The first session check has answered, or failed. */
export const sessionReady = (): boolean => !isServer;

export const isAdmin = (): boolean => account()?.role === "admin";

/** Sign in, then back to `returnTo` (by default this page, without its language). */
export function loginHref(returnTo?: string): string {
  const here = isServer ? "/" : delocalizePath(location.pathname + location.search).path;
  return `/login?redirect=${encodeURIComponent(returnTo ?? here)}`;
}
