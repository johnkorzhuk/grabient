import { delocalizePath, t } from "@grabient/i18n";

/* A stand-in for the accounts feature's session module, written to its contract so the frame builds against it: the
   account signed in (signed out here), whether it is an admin's, the way to sign in and the way out. The accounts
   feature's own module takes its place. */

export interface Account {
  id: string;
  username: string | null;
  name: string | null;
  image: string | null;
  role: string | null;
}

/** The account signed in in this browser, or null. */
export const account = (): Account | null => null;
/** Whether the account signed in is an admin's. */
export const isAdmin = (): boolean => account()?.role === "admin";

/** The sign-in page, leading back to `to` (the page's own address without its language by default). */
export function loginHref(to?: string): string {
  const back =
    to ??
    (typeof location === "undefined"
      ? "/"
      : delocalizePath(location.pathname + location.search).path);
  return back === "/" ? "/login" : `/login?redirect=${encodeURIComponent(back)}`;
}

/** Signs this browser out, then loads `to`. Rejects with the words to show when the server would not. */
export async function signOut(to = "/"): Promise<void> {
  const answer = await fetch("/api/auth/sign-out", { method: "POST" });
  if (!answer.ok) throw new Error(t("Couldn't sign out."));
  location.assign(to);
}
