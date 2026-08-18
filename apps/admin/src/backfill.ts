// One-shot history reconstruction, as a route rather than a job queue: every
// source's date-dimensioned API returns its whole range in ONE request, so a
// full backfill is a handful of subrequests and a few thousand idempotent
// upserts. Safe to re-run any number of times; a no-op re-run writes zero
// rows and reports revised: 0.
//
// Deliberately NOT exposed via MCP: an agent retrying a backfill in a loop is
// a quota risk; a human hitting an Access-protected POST is not.

import { closeRun, openRun, upsertMetrics, type MetricPoint } from "./db";
import { collectBing } from "./bing";
import {
  collectCloudflare,
  collectD1,
  collectGa4,
  collectGsc,
  collectVerifiedBots,
} from "./collect";

export type BackfillSource = "gsc" | "ga4" | "cf" | "d1" | "bots" | "bing" | "all";

export interface BackfillReport {
  ok: boolean;
  dry: boolean;
  sources: Record<
    string,
    { points: number; firstDay?: string; lastDay?: string; written?: number; revised?: number; error?: string }
  >;
}

export async function runBackfill(
  env: Env,
  now: Date,
  options: { source?: BackfillSource; days?: number; dry?: boolean },
): Promise<BackfillReport> {
  const db = env.ADMIN_DB;
  const dry = options.dry ?? false;
  const source = options.source ?? "all";
  const report: BackfillReport = { ok: true, dry, sources: {} };
  if (!db) {
    return { ok: false, dry, sources: { all: { points: 0, error: "ADMIN_DB not configured" } } };
  }

  const runId = dry ? null : await openRun(db, "backfill", null, Date.now());
  // Longest history first: if a later source fails, the charts already have
  // their deep history.
  const plan: Array<[string, () => Promise<MetricPoint[]>]> = [];
  if (source === "all" || source === "d1") plan.push(["d1", () => collectD1(env, now, null)]);
  if (source === "all" || source === "cf") plan.push(["cf", () => collectCloudflare(env, now, null)]);
  if (source === "all" || source === "ga4")
    plan.push(["ga4", () => collectGa4(env, now, options.days ?? null)]);
  if (source === "all" || source === "gsc")
    plan.push(["gsc", () => collectGsc(env, now, options.days ?? null)]);
  if (source === "all" || source === "bots")
    // Adaptive retention is ~7 days; this is the whole recoverable window.
    plan.push(["bots", () => collectVerifiedBots(env, now, 6)]);
  if (source === "all" || source === "bing") plan.push(["bing", () => collectBing(env, now)]);

  let totalWritten = 0;
  for (const [name, collect] of plan) {
    try {
      const points = await collect();
      const days = points.map((p) => p.day).sort();
      const entry: BackfillReport["sources"][string] = {
        points: points.length,
        firstDay: days[0],
        lastDay: days[days.length - 1],
      };
      if (!dry && points.length) {
        const { written, revised } = await upsertMetrics(db, points, now.getTime());
        entry.written = written;
        entry.revised = revised;
        totalWritten += written;
      }
      report.sources[name] = entry;
    } catch (err) {
      report.ok = false;
      report.sources[name] = { points: 0, error: String(err).slice(0, 300) };
    }
  }
  if (!dry) await closeRun(db, runId, report.ok, totalWritten, report.sources);
  return report;
}
