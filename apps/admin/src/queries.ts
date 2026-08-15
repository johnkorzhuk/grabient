// Every read the dashboard performs, in one round trip.
//
// Read-only: this worker issues SELECTs against the production database and
// nothing else. Keep it that way — there is no migrations_dir in wrangler.jsonc
// precisely so that a stray write here cannot become a schema change.
//
// All timestamps in D1 are `integer` milliseconds (see auth-schema.ts), hence
// the `created_at / 1000` in every strftime call.

export interface MonthRow {
  /** "YYYY-MM" */
  month: string;
  count: number;
}

export interface CohortRow {
  month: string;
  users: number;
  activated: number;
}

export interface LikersRow {
  month: string;
  likers: number;
  likes: number;
}

export interface Totals {
  users: number;
  likes: number;
  palettes: number;
  /** Distinct users who have ever liked at least one palette. */
  activated: number;
}

export interface Metrics {
  totals: Totals;
  /** Complete calendar months only — see `splitCurrentMonth`. */
  signups: MonthRow[];
  likers: LikersRow[];
  cohorts: CohortRow[];
  /** Signups so far in the in-progress month, excluded from the series above. */
  currentMonth: { month: string; count: number; dayOfMonth: number; daysInMonth: number };
  generatedAt: Date;
}

const MONTH_KEY = "strftime('%Y-%m', created_at / 1000, 'unixepoch')";

export async function loadMetrics(db: D1Database, now: Date): Promise<Metrics> {
  const [totalsRes, signupsRes, likersRes, cohortsRes] = await db.batch<any>([
    db.prepare(
      `SELECT
         (SELECT COUNT(*) FROM auth_user) AS users,
         (SELECT COUNT(*) FROM likes) AS likes,
         (SELECT COUNT(*) FROM palettes) AS palettes,
         (SELECT COUNT(DISTINCT user_id) FROM likes) AS activated`,
    ),
    db.prepare(
      `SELECT ${MONTH_KEY} AS month, COUNT(*) AS count
         FROM auth_user GROUP BY month ORDER BY month`,
    ),
    // "Active" here means a user who liked at least one palette that month.
    // Sessions would be the more obvious signal but auth_session only retains a
    // rolling window (nothing before 2025-12) and a returning user inside their
    // 7-day session never creates a new row, so it undercounts badly. Likes are
    // an append-only log and are the honest activity series.
    db.prepare(
      `SELECT ${MONTH_KEY} AS month,
              COUNT(DISTINCT user_id) AS likers,
              COUNT(*) AS likes
         FROM likes GROUP BY month ORDER BY month`,
    ),
    // Activation by signup cohort: of everyone who signed up in month M, how
    // many have ever liked anything since?
    db.prepare(
      `SELECT ${MONTH_KEY.replace(/created_at/, "u.created_at")} AS month,
              COUNT(*) AS users,
              SUM(CASE WHEN l.user_id IS NOT NULL THEN 1 ELSE 0 END) AS activated
         FROM auth_user u
         LEFT JOIN (SELECT DISTINCT user_id FROM likes) l ON l.user_id = u.id
        GROUP BY month ORDER BY month`,
    ),
  ]);

  const totals = (totalsRes.results?.[0] ?? {
    users: 0,
    likes: 0,
    palettes: 0,
    activated: 0,
  }) as Totals;

  const currentKey = monthKey(now);
  const signupRows = (signupsRes.results ?? []) as MonthRow[];
  const currentRow = signupRows.find((r) => r.month === currentKey);

  return {
    totals,
    signups: fillMonths(signupRows.filter((r) => r.month < currentKey), (month) => ({
      month,
      count: 0,
    })),
    likers: fillMonths(
      ((likersRes.results ?? []) as LikersRow[]).filter((r) => r.month < currentKey),
      (month) => ({ month, likers: 0, likes: 0 }),
    ),
    cohorts: ((cohortsRes.results ?? []) as CohortRow[]).filter(
      (r) => r.month < currentKey,
    ),
    currentMonth: {
      month: currentKey,
      count: currentRow?.count ?? 0,
      dayOfMonth: now.getUTCDate(),
      daysInMonth: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
      ).getUTCDate(),
    },
    generatedAt: now,
  };
}

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthDate(month: string): Date {
  const [year, mon] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, mon! - 1, 1));
}

/**
 * A month with no rows is absent from a GROUP BY, and plotting a time series
 * with holes in it silently redraws the x-axis — the gap closes up and the
 * trend looks smoother than it is. Insert the missing months as zeroes.
 */
function fillMonths<T extends { month: string }>(
  rows: readonly T[],
  empty: (month: string) => T,
): T[] {
  if (rows.length === 0) return [];
  const out: T[] = [];
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  const cursor = monthDate(rows[0]!.month);
  const last = monthDate(rows[rows.length - 1]!.month);
  while (cursor <= last) {
    const key = monthKey(cursor);
    out.push(byMonth.get(key) ?? empty(key));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

/** Running total of `signups`, plus a final point for the in-progress month. */
export function cumulative(metrics: Metrics): { date: Date; total: number }[] {
  const points: { date: Date; total: number }[] = [];
  let total = 0;
  for (const row of metrics.signups) {
    total += row.count;
    // Stamp each point at the END of its month: the running total is only true
    // once the month is over. Stamping at the 1st would shift the whole curve a
    // month earlier.
    const end = monthDate(row.month);
    end.setUTCMonth(end.getUTCMonth() + 1);
    points.push({ date: end, total });
  }
  points.push({
    date: metrics.generatedAt,
    total: total + metrics.currentMonth.count,
  });
  return points;
}


export interface AttributionRow {
  source: string;
  users: number;
  activated: number;
}

/**
 * Signups grouped by first-touch source, with how many of each group went on to
 * like something.
 *
 * The activation column is the point. Raw signups-per-channel tells you which
 * channel is loudest; signups that *activate* tells you which channel sends
 * people who stay, and those are routinely not the same channel.
 *
 * Only accounts created after migration 0021 have attribution — everything
 * earlier is excluded by the `attribution_at IS NOT NULL` filter rather than
 * being lumped into "direct", which would silently attribute 3,554 historical
 * accounts to a channel none of them came from.
 */
export async function loadAttribution(db: D1Database): Promise<AttributionRow[]> {
  // Wrapped because this is the one query that references columns the deployed
  // database may not have yet: the dashboard and the migration ship
  // independently, and an admin page that 500s because a migration is pending is
  // a worse failure than an empty card.
  try {
    const result = await db
      .prepare(
      `SELECT COALESCE(NULLIF(u.attribution_source, ''), NULLIF(u.attribution_referrer, ''), 'direct') AS source,
              COUNT(*) AS users,
              SUM(CASE WHEN l.user_id IS NOT NULL THEN 1 ELSE 0 END) AS activated
         FROM auth_user u
         LEFT JOIN (SELECT DISTINCT user_id FROM likes) l ON l.user_id = u.id
        WHERE u.attribution_at IS NOT NULL
        GROUP BY source
        ORDER BY users DESC
        LIMIT 12`,
      )
      .all<AttributionRow>();
    return result.results ?? [];
  } catch (err) {
    console.error("Attribution query failed (has migration 0021 been applied?)", err);
    return [];
  }
}
