// Digest generation: buildBrief() over the live sources, rendered to
// deterministic markdown and persisted through the report store. buildBrief
// itself stays in brief.ts — this file is orchestration and period
// arithmetic only.

import { buildBrief, type Brief } from "./brief";
import { listEvents } from "./events";
import { loadGa4 } from "./ga4";
import { listGoals } from "./goals";
import { loadAttribution, loadMetrics } from "./queries";
import { loadSearchConsole } from "./search-console";
import { loadAcquisition, loadReferrers, loadTraffic } from "./traffic";
import {
  digestMarkdown,
  periodBounds,
  writeReport,
  type PeriodType,
  type WriteReportResult,
} from "./reports";

/** The live digest, exactly as /brief.json builds it — one place, one shape. */
export async function buildLiveBrief(env: Env, now: Date): Promise<Brief> {
  const [metrics, traffic, acquisition, search] = await Promise.all([
    loadMetrics(env.DB, now),
    loadTraffic(env, now),
    loadAcquisition(env, now),
    loadSearchConsole(env, now),
  ]);
  const [attribution, referrers, ga4] = await Promise.all([
    loadAttribution(env.DB),
    loadReferrers(env, now),
    loadGa4(env, now),
  ]);
  return buildBrief(metrics, traffic, acquisition, search, attribution, referrers, ga4);
}

export async function generateDigest(
  env: Env,
  now: Date,
  periodType: PeriodType,
  authorRef: string,
  author: "cron" | "agent" = "cron",
): Promise<WriteReportResult | { ok: false; error: string }> {
  const db = env.ADMIN_DB;
  if (!db) return { ok: false, error: "ADMIN_DB is not configured." };
  const period = { type: periodType, ...periodBounds(periodType, now) };
  const brief = await buildLiveBrief(env, now);
  const [events, goals] = await Promise.all([
    listEvents(db, { from: period.start, to: period.end, includeHidden: false }, now),
    listGoals(db, now),
  ]);
  const { title, markdown } = digestMarkdown(brief, period, {
    events: events.map((e) => ({ on: e.occurred_on, kind: e.kind, label: e.label })),
    goals: goals.map((g) => ({
      slug: g.slug,
      title: g.title,
      progressPct: g.progress_pct,
      current: g.current,
      target: g.target_value,
    })),
  });
  return writeReport(
    db,
    {
      title,
      markdown,
      kind: "digest",
      period,
      payload: brief,
      author,
      authorRef,
    },
    now,
  );
}
