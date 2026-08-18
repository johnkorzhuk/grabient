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
  // allSettled, not all: every one of these already returns null when its
  // source is unconfigured or unhappy, and buildBrief drops those sections —
  // but a THROW from any of them would have taken the whole digest down. Only
  // loadMetrics can realistically throw (it is the one loader with no internal
  // try/catch), and losing the weekly digest to a transient D1 hiccup is a bad
  // trade for a job that runs once a week.
  const settled = await Promise.allSettled([
    loadMetrics(env.DB, now),
    loadTraffic(env, now),
    loadAcquisition(env, now),
    loadSearchConsole(env, now),
    loadAttribution(env.DB),
    loadReferrers(env, now),
    loadGa4(env, now),
  ]);
  const value = <T,>(index: number, fallback: T): T =>
    settled[index]!.status === "fulfilled" ? ((settled[index] as PromiseFulfilledResult<T>).value ?? fallback) : fallback;
  for (const [i, result] of settled.entries()) {
    if (result.status === "rejected") console.error(`brief source ${i} threw`, result.reason);
  }
  // metrics is the one input with no null-safe shape, so a rejection there is
  // still fatal — but it is now the ONLY thing that can be.
  if (settled[0]!.status === "rejected") throw settled[0]!.reason;
  return buildBrief(
    (settled[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof loadMetrics>>>).value,
    value(1, null),
    value(2, null),
    value(3, null),
    value(4, []),
    value(5, null),
    value(6, null),
  );
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
