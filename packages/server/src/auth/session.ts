import type { Env } from "../env.ts";
import { authFor } from "./library.ts";

const readSession = (env: Env, headers: Headers, fresh: boolean) =>
  authFor(env).api.getSession({ headers, query: { disableCookieCache: fresh } });

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
