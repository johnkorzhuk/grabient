import { run } from "../db/d1.ts";
import type { Env } from "../env.ts";
import { authFor } from "./library.ts";
import { accountRole, adminsOnly } from "./roles.ts";

export type Session = NonNullable<Awaited<ReturnType<typeof readSession>>>;

const readSession = (env: Env, headers: Headers, fresh: boolean) =>
  authFor(env).api.getSession({ headers, query: { disableCookieCache: fresh } });

/**
 * The account signed in on a request, or null. `fresh` reads the session from the database instead of its signed
 * five-minute copy in a cookie: every write asks for it, so a sign-out elsewhere counts at once.
 *
 * Where only admins sign in, every read is fresh and the role is read with it. A session whose account is not an
 * admin, one made before the rule or an admin's since demoted, ends there: its account's sessions are deleted and it
 * reads as none.
 */
export async function getSession(
  env: Env,
  headers: Headers,
  options: { fresh?: boolean } = {}
): Promise<Session | null> {
  const restricted = adminsOnly(env);
  const session = await readSession(env, headers, restricted || options.fresh === true);
  if (!session || !restricted || (await accountRole(env, session.user.id)) === "admin")
    return session;
  await run(env.DB, "DELETE FROM auth_session WHERE user_id = ?", session.user.id);
  return null;
}
