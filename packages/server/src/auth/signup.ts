import { run } from "../db/d1.ts";
import type { Env } from "../env.ts";

/* How an account was made, kept on its row in the columns the old site's referral tracking filled (attribution_*):
   - the page of the site its sign-in returned to: medium "page", landing the path. The sign-in's own request names it
     (Google's state, an email link's address), read as the account is made (library.ts);
   - the app it was made to connect: medium "app", source the app's name, told by the authorization step that follows
     the sign-in (apps/web oauth/authorize.ts).
   Nothing is stored in the browser and no other request is read, so it needs no consent. The first word stands: a page
   or an app is never written over, and an account older than half an hour is never said to be made for an app. */

/** How long after an account is made the first app it connects counts as what it was made for. */
export const MADE_FOR_MS = 30 * 60_000;

const PATH_MAX = 200;

/** The page of the site a sign-in returns to, as its path without the query; null for another site, an app's
    authorization (which names the app itself), or nothing given. */
export function signupPage(back: unknown, origin: string): string | null {
  if (typeof back !== "string" || !back.trim()) return null;
  let url: URL;
  try {
    url = new URL(back, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin || url.pathname.startsWith("/oauth/")) return null;
  return url.pathname.slice(0, PATH_MAX);
}

/** Keeps the page an account was made from, unless the account says how it was made already. */
export const keepSignupPage = (env: Pick<Env, "DB">, userId: string, page: string) =>
  run(
    env.DB,
    "UPDATE auth_user SET attribution_medium = 'page', attribution_landing = ?, attribution_at = ? WHERE id = ? AND attribution_medium IS NULL",
    page,
    Date.now(),
    userId
  );

/** Keeps the app an account made in the last half hour was made to connect, unless it says how it was made already. */
export const keepSignupApp = (env: Pick<Env, "DB">, userId: string, app: string) =>
  run(
    env.DB,
    "UPDATE auth_user SET attribution_source = ?, attribution_medium = 'app', attribution_at = ? WHERE id = ? AND created_at > ? AND attribution_medium IS NULL",
    app,
    Date.now(),
    userId,
    Date.now() - MADE_FOR_MS
  );

/** What a sign-in's request says of where it returns to: Google's state on its callback, or an email link's address. */
export interface MadeFrom {
  request?: Request;
  query?: unknown;
}

/** Keeps the page of the site an account's sign-in returns to as where it was made: Google's state names it on its
    callback (`state`), an email link in its own address. Never stands in the way of the sign-in. */
export async function keepWhereMade(
  env: Pick<Env, "DB" | "BETTER_AUTH_URL">,
  userId: string,
  context: MadeFrom | null | undefined,
  state: { callbackURL?: unknown } | null
): Promise<void> {
  try {
    const back =
      state?.callbackURL ?? (context?.query as { callbackURL?: unknown } | undefined)?.callbackURL;
    const origin = context?.request ? new URL(context.request.url).origin : env.BETTER_AUTH_URL;
    const page = origin ? signupPage(back, origin) : null;
    if (page) await keepSignupPage(env, userId, page);
  } catch (error) {
    console.error(
      "sign-up: the page the account was made from was not kept",
      error instanceof Error ? error.message : error
    );
  }
}
