// ADMIN_DB write and read plumbing.
//
// This is the only file that knows D1's 100-bound-parameter cap. The repo has
// been bitten by it before (likes lookups had to be chunked to <=90 keys —
// see packages/data-ops/src/queries/palettes.ts), so the arithmetic lives in
// one place and every writer goes through it.
//
// The other rule enforced here by shape: persistence must never take the
// dashboard down with it. The precedent is loadAttribution (queries.ts): the
// dashboard and the migration ship independently, and a page that 500s
// because a table is pending is a worse failure than an empty card. Reads
// return empty series, writes log and skip, and ADMIN_DB itself is optional.

const D1_MAX_BOUND_PARAMS = 100;
const HEADROOM = 10;
/** How many statements one db.batch() carries — bounded so a failure loses a slice, not the run. */
const STATEMENTS_PER_BATCH = 50;

/** Rows that fit in one multi-row INSERT for a table with N bound columns. */
export const rowsPerStatement = (paramsPerRow: number): number =>
  Math.max(1, Math.floor((D1_MAX_BOUND_PARAMS - HEADROOM) / paramsPerRow));

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * A failed write costs one day of history, not the request. Callers get null
 * and carry on; the error is in the log with a label that says which store.
 */
export async function persist<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.error(`Persistence failed: ${label}`, err);
    return null;
  }
}

export interface MetricPoint {
  key: string;
  /** 'YYYY-MM-DD' in the source's own calendar (documented per key in metrics.ts). */
  day: string;
  value: number;
  meta?: unknown;
  provisional?: boolean;
}

/**
 * Idempotent daily upsert.
 *
 * The WHERE on DO UPDATE skips rows whose value did not change, so what comes
 * back is a free signal about how much the sources moved — with two caveats
 * worth stating here, because /ops prints these numbers as facts:
 *
 *   changes      counts inserts AND updates, so on a fresh day it equals the
 *                number of new rows rather than the number of revisions. Read
 *                it as "rows the statement touched".
 *   rows_written is D1's own figure and includes INDEX writes; metric_daily
 *                carries its primary key plus metric_daily_day_idx, so expect
 *                roughly 3x the logical row count.
 */
export async function upsertMetrics(
  db: D1Database,
  input: readonly MetricPoint[],
  capturedAt: number,
): Promise<{ written: number; revised: number }> {
  let points: readonly MetricPoint[] = input;
  if (points.length === 0) return { written: 0, revised: 0 };
  // Collapse duplicate (key, day) pairs first. Two rows for the same key in
  // one statement resolve last-write-wins, not sum — and slugify can map two
  // distinct upstream labels ("(other)" and "Other") onto one key, which would
  // silently drop the smaller bucket instead of adding it.
  const merged = new Map<string, MetricPoint>();
  for (const point of points) {
    const id = `${point.key}\u0000${point.day}`;
    const prior = merged.get(id);
    merged.set(id, prior ? { ...point, value: prior.value + point.value } : point);
  }
  points = [...merged.values()];
  const perStmt = rowsPerStatement(6); // 6 bound columns -> 15 rows/statement
  const statements = chunk(points, perStmt).map((group) => {
    const placeholders = group.map(() => "(?,?,?,?,?,?)").join(",");
    const params = group.flatMap((p) => [
      p.key,
      p.day,
      p.value,
      p.meta === undefined ? null : JSON.stringify(p.meta),
      p.provisional ? 1 : 0,
      capturedAt,
    ]);
    return db
      .prepare(
        `INSERT INTO metric_daily (metric_key, day, value, meta, provisional, captured_at)
         VALUES ${placeholders}
         ON CONFLICT (metric_key, day) DO UPDATE SET
           value = excluded.value,
           meta = excluded.meta,
           provisional = excluded.provisional,
           captured_at = excluded.captured_at
         WHERE metric_daily.value IS NOT excluded.value
            OR metric_daily.provisional IS NOT excluded.provisional
            OR metric_daily.meta IS NOT excluded.meta`,
      )
      .bind(...params);
  });

  let written = 0;
  let revised = 0;
  for (const group of chunk(statements, STATEMENTS_PER_BATCH)) {
    const results = await db.batch(group);
    for (const r of results) {
      revised += r.meta.changes ?? 0;
      written += r.meta.rows_written ?? 0;
    }
  }
  return { written, revised };
}

export interface SeriesPoint {
  day: string;
  value: number;
  provisional: boolean;
}

/** One metric over an inclusive day range — a contiguous PK scan. */
export async function readSeries(
  db: D1Database,
  key: string,
  since: string,
  until: string,
): Promise<SeriesPoint[]> {
  try {
    const res = await db
      .prepare(
        `SELECT day, value, provisional FROM metric_daily
          WHERE metric_key = ?1 AND day BETWEEN ?2 AND ?3 ORDER BY day`,
      )
      .bind(key, since, until)
      .all<{ day: string; value: number; provisional: number }>();
    return (res.results ?? []).map((r) => ({
      day: r.day,
      value: r.value,
      provisional: r.provisional === 1,
    }));
  } catch (err) {
    // Pending migration or missing binding: an empty series, not a 500.
    console.error(`readSeries(${key}) failed (migration pending?)`, err);
    return [];
  }
}

/**
 * Every key under a prefix in one indexed scan. An explicit range rather than
 * LIKE: LIKE 'prefix%' is only a range scan under case_sensitive_like, and
 * '~' sorts above every character the key alphabet uses.
 */
export async function readSeriesPrefix(
  db: D1Database,
  prefix: string,
  since: string,
  until: string,
): Promise<Map<string, SeriesPoint[]>> {
  const out = new Map<string, SeriesPoint[]>();
  try {
    const res = await db
      .prepare(
        `SELECT metric_key, day, value, provisional FROM metric_daily
          WHERE metric_key >= ?1 AND metric_key < ?2 AND day BETWEEN ?3 AND ?4
          ORDER BY metric_key, day`,
      )
      .bind(prefix, `${prefix}~`, since, until)
      .all<{ metric_key: string; day: string; value: number; provisional: number }>();
    for (const r of res.results ?? []) {
      const list = out.get(r.metric_key) ?? [];
      list.push({ day: r.day, value: r.value, provisional: r.provisional === 1 });
      out.set(r.metric_key, list);
    }
  } catch (err) {
    console.error(`readSeriesPrefix(${prefix}) failed (migration pending?)`, err);
  }
  return out;
}

/** Which days each metric actually has, for "the series starts here" honesty. */
export async function seriesExtent(
  db: D1Database,
  keys: readonly string[],
): Promise<Map<string, { first: string; last: string; days: number }>> {
  const out = new Map<string, { first: string; last: string; days: number }>();
  if (keys.length === 0) return out;
  try {
    const placeholders = keys.map(() => "?").join(",");
    const res = await db
      .prepare(
        `SELECT metric_key, MIN(day) AS first, MAX(day) AS last, COUNT(*) AS days
           FROM metric_daily WHERE metric_key IN (${placeholders}) GROUP BY metric_key`,
      )
      .bind(...keys)
      .all<{ metric_key: string; first: string; last: string; days: number }>();
    for (const r of res.results ?? []) {
      out.set(r.metric_key, { first: r.first, last: r.last, days: r.days });
    }
  } catch (err) {
    console.error("seriesExtent failed (migration pending?)", err);
  }
  return out;
}

/** Opens a job_run row; null (and a log line) when the store is unavailable. */
export async function openRun(
  db: D1Database | undefined,
  job: string,
  cron: string | null,
  startedAt: number,
): Promise<number | null> {
  if (!db) return null;
  try {
    const res = await db
      .prepare(`INSERT INTO job_run (job, cron, started_at) VALUES (?1, ?2, ?3)`)
      .bind(job, cron, startedAt)
      .run();
    return (res.meta.last_row_id as number) ?? null;
  } catch (err) {
    console.error(`openRun(${job}) failed`, err);
    return null;
  }
}

export async function closeRun(
  db: D1Database | undefined,
  id: number | null,
  ok: boolean,
  rowsWritten: number,
  detail: unknown,
): Promise<void> {
  if (!db || id === null) return;
  try {
    await db
      .prepare(
        `UPDATE job_run SET finished_at = ?2, ok = ?3, rows_written = ?4, detail = ?5 WHERE id = ?1`,
      )
      .bind(id, Date.now(), ok ? 1 : 0, rowsWritten, JSON.stringify(detail).slice(0, 8000))
      .run();
  } catch (err) {
    console.error("closeRun failed", err);
  }
}
