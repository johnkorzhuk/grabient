import { accountRole } from "@grabient/server/auth/roles.ts";
import { getSession } from "@grabient/server/auth/session.ts";
import type { Env } from "@grabient/server/env.ts";
import { flagOff } from "@grabient/server/flags/flags.ts";

/* Who reads the newsletter: everyone once an admin has turned it on in Site features, and before then admins alone,
   who see it as readers will. A request with no session is no admin, and asks the database nothing; an admin's role
   is read from the database, never from the session's copy. */

/** How a request reads the newsletter: as `everyone`, as an `admin` before it is on, or not at all. */
export type NewsletterReader = "everyone" | "admin" | null;

export async function newsletterReader(env: Env, request: Request): Promise<NewsletterReader> {
  if (!(await flagOff(env, "newsletter"))) return "everyone";
  if (!env.BETTER_AUTH_SECRET) return null;
  const session = await getSession(env, request.headers);
  return session && (await accountRole(env, session.user.id)) === "admin" ? "admin" : null;
}
