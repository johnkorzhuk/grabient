import { json, overLimit } from "../auth/http.ts";
import type { Env } from "../env.ts";
import { flagOff } from "../flags/flags.ts";
import type { LimitCheck, LimitEnv } from "./check.ts";
import { limitOf } from "./config.ts";

/* An account's writes, from the site's pages and from its apps: likes, collections, votes. Each passes two things
   before it is made. First the `saving` flag, which an admin turns off to stop every account's writes at once while
   reads go on: a write answers 503 with when to try again, and a page's sync keeps the change and shows it, as it does
   offline. Then its limits. Staging's sign-in is open to anyone, so there an admin's `work` limits alone allow
   STAGING_WORK_SCALE times as much, and an admin's share of a site ceiling is counted under a key of its own: the
   contributors keep their allowance, and every other account has production's limits and production's ceilings. */

/** How long a write refused while saving is paused waits before it is sent again, in seconds. */
export const SAVING_RETRY_SECONDS = 300;

/** The checks of an account's work as its role counts them. */
export function workChecks(
  env: Pick<LimitEnv, "DEPLOYMENT">,
  role: string | null | undefined,
  checks: readonly LimitCheck[]
): readonly LimitCheck[] {
  if (env.DEPLOYMENT !== "staging" || role !== "admin") return checks;
  return checks.map((check): LimitCheck => {
    const [identifier, names, n] = check;
    const work = (typeof names === "string" ? [names] : names).filter(name => limitOf(name).work);
    if (!work.length) return check;
    const site = work.some(name => limitOf(name).site);
    return [site ? `${identifier}:admins` : identifier, names, n, true];
  });
}

/** Whether an admin has paused every account's writes. */
export const savingPaused = (env: Pick<Env, "DB">) => flagOff(env, "saving");

/** The answer to an account's write that may not be made now: 503 while saving is paused, 429 past a limit, 503 when
    the limits cannot be counted; null when it may. `role` is the account's, read with the request. */
export async function writeRefusal(
  env: Pick<Env, "DB"> & LimitEnv,
  role: string | null | undefined,
  checks: readonly LimitCheck[]
): Promise<Response | null> {
  if (await savingPaused(env)) {
    return json({ error: "Couldn't save." }, 503, { "Retry-After": String(SAVING_RETRY_SECONDS) });
  }
  return overLimit(env, workChecks(env, role, checks));
}
