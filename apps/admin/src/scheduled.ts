// The scheduled() dispatcher.
//
// controller.cron is matched CHARACTER FOR CHARACTER against wrangler.jsonc.
// Editing a schedule there without editing CRON here silently disables the
// job: the switch falls through and nothing runs, with no error anywhere.
// That is why the default branch shouts, and why job_run + /ops exist.

import { closeRun, openRun, upsertMetrics } from "./db";
import {
  TRAILING_DAYS,
  collectCloudflare,
  collectD1,
  collectGa4,
  collectGsc,
  collectVerifiedBots,
} from "./collect";
import { collectBing } from "./bing";
import { generateDigest } from "./briefs";
import { periodsClosing } from "./reports";
import { runSweep } from "./sweep";

export const CRON = {
  snapshot: "20 4 * * *",
  sweep: "40 5 * * *",
  // One digest cron; periodsClosing() decides which periods closed today
  // (weekly on Mondays, monthly on the 1st, quarterly on quarter firsts).
  // Calendar logic in testable code beats four cron strings to keep in sync.
  digests: "10 6 * * *",
} as const;

interface JobResult {
  rowsWritten: number;
  detail: unknown;
}

export async function scheduled(
  controller: ScheduledController,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  // scheduledTime, not Date.now(): a delayed trigger must still stamp the day
  // it was scheduled for, or a 23:58 job firing at 00:03 writes the wrong day.
  const now = new Date(controller.scheduledTime);

  switch (controller.cron) {
    case CRON.snapshot:
      return track(env, "snapshot", controller.cron, () => runSnapshot(env, now));
    case CRON.sweep:
      return track(env, "sweep", controller.cron, async () => {
        const result = await runSweep(env, now, { trigger: "cron" });
        return { rowsWritten: result.inspected, detail: result };
      });
    case CRON.digests:
      return track(env, "digests", controller.cron, async () => {
        const periods = periodsClosing(now);
        const results = [];
        for (const period of periods) {
          results.push({ period, result: await generateDigest(env, now, period, "cron") });
        }
        return { rowsWritten: results.length, detail: results.length ? results : "no periods closed today" };
      });
    default:
      console.error(
        `Unrecognised cron "${controller.cron}". wrangler.jsonc and CRON in scheduled.ts have diverged — NOTHING RAN.`,
      );
  }
}

/**
 * Opens a job_run row, runs the job, closes it. Never throws: a failed job
 * must leave a row saying it failed, not an unhandled rejection nobody reads.
 */
async function track(
  env: Env,
  job: string,
  cron: string,
  fn: () => Promise<JobResult>,
): Promise<void> {
  const id = await openRun(env.ADMIN_DB, job, cron, Date.now());
  try {
    const result = await fn();
    await closeRun(env.ADMIN_DB, id, true, result.rowsWritten, result.detail);
  } catch (err) {
    console.error(`Job ${job} failed`, err);
    await closeRun(env.ADMIN_DB, id, false, 0, { error: String(err).slice(0, 500) });
  }
}

/**
 * The daily snapshot: every collector over its trailing window, upserted
 * idempotently. allSettled, never all — one refusing API costs one source's
 * day, not the snapshot.
 */
export async function runSnapshot(env: Env, now: Date): Promise<JobResult> {
  const db = env.ADMIN_DB;
  if (!db) return { rowsWritten: 0, detail: "ADMIN_DB not configured" };
  const results = await Promise.allSettled([
    collectGsc(env, now, TRAILING_DAYS.gsc),
    collectGa4(env, now, TRAILING_DAYS.ga4),
    collectCloudflare(env, now, TRAILING_DAYS.cf),
    collectD1(env, now, TRAILING_DAYS.d1),
    collectVerifiedBots(env, now, 1),
    collectBing(env, now),
  ]);
  const names = ["gsc", "ga4", "cf", "d1", "verified_bots", "bing"];
  const points = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const { written, revised } = await upsertMetrics(db, points, now.getTime());
  return {
    rowsWritten: written,
    detail: {
      revised,
      sources: Object.fromEntries(
        results.map((r, i) => [
          names[i],
          r.status === "fulfilled" ? `${r.value.length} points` : `failed: ${String(r.reason).slice(0, 120)}`,
        ]),
      ),
    },
  };
}
