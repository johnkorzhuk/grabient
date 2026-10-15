import { run } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { countUsage } from "@grabient/server/usage/count.ts";
import { pruneExpired, pruneSync } from "./account/changes.ts";
import { documentAlert, failingAlert, signInDigest } from "./alerts/alerts.ts";
import { rescore } from "./gallery/rescore.ts";
import { applyQueue } from "./mcp/admin/queue.ts";
import { checkClientDocuments, purgeOAuth } from "./oauth/upkeep.ts";
import { prunePaletteUse } from "./palette-use/use.ts";
import { pruneSearchCounts, refreshPopular } from "./search/counts.ts";
import { pruneScheduled } from "./search/schedule.ts";
import { syncSnapshot } from "./search/sync.ts";
import { sendIndexNow } from "./seo/indexnow.ts";
import { refreshStars } from "./seo/stars.ts";

/* The scheduled work, one job per trigger in cloudflare.config.ts. A job runs its steps in order; a step that fails
   is logged and the rest still run, and the run then fails as a whole so the dashboard shows it. A step answers what
   is worth a log line, and nothing when it found nothing to do. A feature adds its step to the job it belongs to, in
   the order the job needs. */

type Steps = Readonly<Record<string, (env: Env) => Promise<unknown>>>;

/** Runs a job's steps in order: what a step returns is logged, and a failure is logged and kept for the end. */
export async function runSteps(job: string, steps: Steps, env: Env) {
  const failed: unknown[] = [];
  for (const [name, step] of Object.entries(steps)) {
    try {
      const report = await step(env);
      if (report !== undefined) console.log(name, JSON.stringify(report));
    } catch (error) {
      console.error(`${name}: the step failed`, error instanceof Error ? error.message : error);
      failed.push(error);
    }
  }
  if (failed.length)
    throw new AggregateError(failed, `${job}: ${failed.length} of its steps failed`);
}

/** A step's report when it did something, else nothing to log. */
const when = <T>(did: unknown, report: T): T | undefined => (did ? report : undefined);

/** Every ten minutes. The owner hears first if the site is failing, before any step that a failing database could
    hold. IndexNow follows the queue, so the palettes it just published are on this pass's list, and the search
    snapshot comes last, built again only when something public changed. */
export const TEN_MINUTES: Steps = {
  "failing site": async env => {
    const check = await failingAlert(env);
    return when(check.skipped || check.emailed.length, check);
  },
  "github stars": async env => {
    const stars = await refreshStars(env);
    return when(stars.asked, stars);
  },
  "seeding queue": async env => {
    const report = await applyQueue(env);
    return when(report?.claimed, report);
  },
  indexnow: async env => {
    const report = await sendIndexNow(env);
    return when("marked" in report || ("status" in report && report.status), report);
  },
  "search snapshot": async env => {
    const report = await syncSnapshot(env);
    return when(report.status !== "unchanged", report);
  }
};

/** Every six hours: the query planner's statistics, what is past keeping deleted, the connected apps' upkeep with
    the owner's alerts, the Popular tags (which write once a day), then the scores, which take the most queries of
    the run and so come last. */
export const SIX_HOURS: Steps = {
  // without them SQLite guesses join orders, and a wrong guess reads every public collection for one palette's page
  "database statistics": async env => {
    await run(env.DB, "PRAGMA optimize");
  },
  "expired sign-in rows": async env => {
    const pruned = await pruneExpired(env);
    return when(pruned.sessions || pruned.verifications, pruned);
  },
  "connected apps past keeping": async env => {
    const purged = await purgeOAuth(env);
    return when(purged?.grantsPurged || purged?.tokensPurged, purged);
  },
  "client documents": async env => {
    const checks = await checkClientDocuments(env, check => documentAlert(env, check));
    for (const check of checks) {
      const document = new URL(check.clientId);
      countUsage(env, "oauth", "client-document", document.host + document.pathname, check.state);
    }
    const changed = checks.filter(check => check.state !== "same");
    return when(changed.length, changed);
  },
  "sign-in digest": async env => {
    const digest = await signInDigest(env);
    return when(digest.skipped || digest.watched, digest);
  },
  "search counts past keeping": async env => (await pruneSearchCounts(env)) || undefined,
  "palette use past keeping": async env => (await prunePaletteUse(env)) || undefined,
  "account sync past keeping": async env => {
    const pruned = await pruneSync(env);
    return when(pruned.log || pruned.clients, pruned);
  },
  "popular searches": async env => {
    const popular = await refreshPopular(env);
    return when(popular.ran, popular);
  },
  "scheduled searches past keeping": async env => (await pruneScheduled(env)) || undefined,
  scores: env => rescore(env)
};

/** The jobs by their trigger's schedule, which must match cloudflare.config.ts to the character. */
export const JOBS: Readonly<Record<string, (env: Env) => Promise<void>>> = {
  "*/10 * * * *": env => runSteps("every ten minutes", TEN_MINUTES, env),
  "5 */6 * * *": env => runSteps("every six hours", SIX_HOURS, env)
};
