import type { Env } from "../env.ts";
import { authFor } from "./library.ts";

/* A session in use is extended a day after it was last extended: the library moves its row's expiry and sets its
   cookie again for seven days, on the answer that read it. An answer that drops that cookie leaves the database
   keeping a session whose cookie runs out, so only two reads extend one: the page's own session check (the library's
   route) and renewSession, whose callers carry its cookies. Every other read leaves the session as it stands. */

const readSession = (env: Env, headers: Headers, fresh: boolean) =>
  authFor(env).api.getSession({
    headers,
    query: { disableCookieCache: fresh, disableRefresh: true }
  });

export type Session = NonNullable<Awaited<ReturnType<typeof readSession>>>;

/**
 * The account signed in on a request, or null. `fresh` reads the session from the database instead of its signed
 * five-minute copy in a cookie: every write asks for it, so a sign-out elsewhere counts at once.
 */
export async function getSession(
  env: Env,
  headers: Headers,
  options: { fresh?: boolean } = {}
): Promise<Session | null> {
  return readSession(env, headers, options.fresh === true);
}

/** The account signed in on a request, read fresh and extended when it is due, with the cookies the answer must
    carry: the session's own, set again when it was extended, and its signed copy. */
export async function renewSession(
  env: Env,
  headers: Headers
): Promise<{ session: Session | null; cookies: Headers }> {
  const read = await authFor(env).api.getSession({
    headers,
    query: { disableCookieCache: true },
    returnHeaders: true
  });
  const cookies = new Headers();
  for (const cookie of read.headers.getSetCookie()) cookies.append("Set-Cookie", cookie);
  return { session: read.response, cookies };
}
