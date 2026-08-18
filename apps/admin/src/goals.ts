// Goals: long-term objectives as data, so "are we on track" is a query.
//
// The whole check-in is one SQL statement: each goal's aggregate + window
// pulls its current value straight out of metric_daily. Progress is measured
// against the BASELINE, not against zero — the SEO baselines were taken
// 2026-08-17, and a goal that ignores them would report progress the work did
// not produce.

import { isoDay } from "./range";
import { metricDef } from "./metrics";

export interface GoalRow {
  slug: string;
  title: string;
  metric_key: string;
  direction: "up" | "down";
  aggregate: "last" | "sum" | "avg";
  window_days: number;
  baseline_value: number;
  baseline_day: string;
  target_value: number;
  target_day: string;
  status: "active" | "met" | "missed" | "abandoned";
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface GoalWithProgress extends GoalRow {
  current: number | null;
  as_of: string | null;
  progress_pct: number | null;
  /** Straight-line arithmetic against remaining time — not a forecast. */
  on_track: boolean | null;
  metric_caveat: string | null;
}

export async function listGoals(
  db: D1Database | undefined,
  now: Date,
  includeInactive = false,
): Promise<GoalWithProgress[]> {
  if (!db) return [];
  const today = isoDay(now);
  try {
    const res = await db
      .prepare(
        `SELECT g.*,
          CASE g.aggregate
            WHEN 'sum' THEN (SELECT SUM(m.value) FROM metric_daily m
                              WHERE m.metric_key = g.metric_key
                                AND m.day > date(?1, '-' || g.window_days || ' day')
                                AND m.day <= ?1)
            WHEN 'avg' THEN (SELECT AVG(m.value) FROM metric_daily m
                              WHERE m.metric_key = g.metric_key
                                AND m.day > date(?1, '-' || g.window_days || ' day')
                                AND m.day <= ?1)
            ELSE            (SELECT m.value FROM metric_daily m
                              WHERE m.metric_key = g.metric_key AND m.day <= ?1
                              ORDER BY m.day DESC LIMIT 1)
          END AS current,
          (SELECT MAX(m.day) FROM metric_daily m
            WHERE m.metric_key = g.metric_key AND m.day <= ?1) AS as_of
         FROM goal g
        ${includeInactive ? "" : "WHERE g.status = 'active'"}
        ORDER BY g.target_day`,
      )
      .bind(today)
      .all<GoalRow & { current: number | null; as_of: string | null }>();

    return (res.results ?? []).map((g) => {
      const span = g.target_value - g.baseline_value;
      const current = g.current;
      const progress =
        current === null || span === 0
          ? null
          : Math.round(((current - g.baseline_value) / span) * 1000) / 10;
      const totalDays = daysBetween(g.baseline_day, g.target_day);
      const elapsed = daysBetween(g.baseline_day, today);
      const expectedPct = totalDays > 0 ? (elapsed / totalDays) * 100 : null;
      return {
        ...g,
        current: current === null ? null : Math.round(current * 100) / 100,
        as_of: g.as_of,
        progress_pct: progress,
        on_track:
          progress === null || expectedPct === null ? null : progress >= Math.min(expectedPct, 100),
        metric_caveat: metricDef(g.metric_key)?.caveat ?? null,
      };
    });
  } catch (err) {
    console.error("listGoals failed (migration pending?)", err);
    return [];
  }
}

export interface GoalUpsertInput {
  slug: string;
  title?: string;
  metric_key?: string;
  direction?: "up" | "down";
  aggregate?: "last" | "sum" | "avg";
  window_days?: number;
  baseline_value?: number;
  baseline_day?: string;
  target_value?: number;
  target_day?: string;
  status?: GoalRow["status"];
  notes?: string;
}

export async function upsertGoal(
  db: D1Database,
  input: GoalUpsertInput,
  now: Date,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = await db
    .prepare(`SELECT * FROM goal WHERE slug = ?1`)
    .bind(input.slug)
    .first<GoalRow>();
  if (!existing) {
    const missing = (
      ["title", "metric_key", "direction", "baseline_value", "baseline_day", "target_value", "target_day"] as const
    ).filter((k) => input[k] === undefined);
    if (missing.length) {
      return { ok: false, error: `Creating a goal requires ${missing.join(", ")}.` };
    }
  }
  const ts = now.getTime();
  try {
    if (!existing) {
      // A plain INSERT, not an upsert: SQLite evaluates NOT NULL against the
      // candidate row before it ever considers the conflict clause, so
      // COALESCE inside DO UPDATE cannot rescue a null here — the insert fails
      // first. Create and update are genuinely different statements.
      await db
        .prepare(
          `INSERT INTO goal (slug, title, metric_key, direction, aggregate, window_days,
                             baseline_value, baseline_day, target_value, target_day, status,
                             notes, created_at, updated_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?13)`,
        )
        .bind(
          input.slug,
          input.title!,
          input.metric_key!,
          input.direction!,
          input.aggregate ?? "last",
          input.window_days ?? 28,
          input.baseline_value!,
          input.baseline_day!,
          input.target_value!,
          input.target_day!,
          input.status ?? "active",
          input.notes ?? null,
          ts,
        )
        .run();
      return { ok: true };
    }

    // Update: every column keeps its stored value unless the caller sent a new
    // one. `aggregate` and `window_days` are the dangerous pair — they used to
    // be bound with `?? "last"` / `?? 28`, so any update that omitted them
    // silently rewrote a sum-over-28-days goal into a last-value goal and
    // collapsed its reported progress.
    await db
      .prepare(
        `UPDATE goal SET
           title = COALESCE(?2, title),
           metric_key = COALESCE(?3, metric_key),
           direction = COALESCE(?4, direction),
           aggregate = COALESCE(?5, aggregate),
           window_days = COALESCE(?6, window_days),
           baseline_value = COALESCE(?7, baseline_value),
           baseline_day = COALESCE(?8, baseline_day),
           target_value = COALESCE(?9, target_value),
           target_day = COALESCE(?10, target_day),
           status = COALESCE(?11, status),
           notes = COALESCE(?12, notes),
           updated_at = ?13
         WHERE slug = ?1`,
      )
      .bind(
        input.slug,
        input.title ?? null,
        input.metric_key ?? null,
        input.direction ?? null,
        input.aggregate ?? null,
        input.window_days ?? null,
        input.baseline_value ?? null,
        input.baseline_day ?? null,
        input.target_value ?? null,
        input.target_day ?? null,
        input.status ?? null,
        input.notes ?? null,
        ts,
      )
      .run();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err).slice(0, 300) };
  }
}

export async function checkinGoal(
  db: D1Database,
  slug: string,
  now: Date,
  value?: number,
  note?: string,
): Promise<void> {
  await db
    .prepare(`INSERT INTO goal_checkin (goal_slug, at, value, note) VALUES (?1, ?2, ?3, ?4)`)
    .bind(slug, now.getTime(), value ?? null, note ?? null)
    .run();
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
