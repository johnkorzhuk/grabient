import type { Deployment, Env } from "../../env.ts";

/* The counts of the site's own work (usage/count.ts) read back from Workers Analytics Engine through the deploy's
   ANALYTICS binding: which dataset the deploy writes, and the rows made into totals and named columns. For the
   site_usage tool and the six-hour sign-in digest. */

/** The datasets cloudflare.config.ts binds as USAGE. A Preview writes none. */
const DATASETS: Partial<Record<Deployment, string>> = {
  production: "grabient_usage",
  staging: "grabient_staging_usage",
  development: "grabient_dev_usage"
};

/** What each event's blobs say, in order after the event itself. */
export const USAGE_COLUMNS = {
  mcp: ["server", "tool", "outcome", "address", "client"],
  oauth: ["step", "what", "outcome", "client"],
  limit: ["limit", "kind"],
  legacy: ["resolved", "who"],
  image: ["picture", "answeredBy"],
  "client-error": ["page", "browser"],
  file: ["format", "from", "who"]
} as const;
export type UsageEventName = keyof typeof USAGE_COLUMNS;
const EVENTS = Object.keys(USAGE_COLUMNS) as UsageEventName[];

export type AnalyticsRows = Record<string, unknown>[];
type Sql = (query: string) => Promise<AnalyticsRows>;

/** The deploy's dataset and a way to query it, with whether it holds anything yet (a dataset appears with its first
    point), or why the deploy cannot read one. */
export async function analyticsRows(
  env: Pick<Env, "ANALYTICS" | "DEPLOYMENT">
): Promise<{ sql: Sql; dataset: string; written: boolean } | string> {
  const binding = env.ANALYTICS;
  const dataset = DATASETS[env.DEPLOYMENT];
  if (!binding || !dataset) return "This deploy has no ANALYTICS binding to read its counts with.";
  const sql: Sql = async query => {
    const answer = (await binding.query({ query })) as { data?: unknown } | null;
    return Array.isArray(answer?.data) ? (answer.data as AnalyticsRows) : [];
  };
  const tables = await sql("SHOW TABLES");
  return { sql, dataset, written: tables.some(row => row.dataset === dataset) };
}

export interface UsageReport {
  dataset: string;
  days: number;
  /** nothing written yet: the dataset appears with its first point */
  empty: boolean;
  totals: Record<UsageEventName, number>;
  /** each event's rows, most first, its blobs under their names and `count` */
  events: Record<UsageEventName, Record<string, string | number>[]>;
  /** each day's count of each event */
  daily: ({ day: string } & Record<UsageEventName, number>)[];
  /** the site-wide ceilings that refused, with how many requests */
  ceilings: { limit: string; count: number }[];
}

const zero = () =>
  Object.fromEntries(EVENTS.map(event => [event, 0])) as Record<UsageEventName, number>;
const whole = (value: unknown) => Math.round(Number(value) || 0);
const isEvent = (value: unknown): value is UsageEventName =>
  typeof value === "string" && value in USAGE_COLUMNS;

/** The last `days` of a dataset. A point stands for `_sample_interval` points once Analytics Engine samples, so every
    sum weighs by it. */
export async function readUsage(sql: Sql, dataset: string, days: number): Promise<UsageReport> {
  if (!/^[a-z0-9_]+$/.test(dataset)) throw new Error("Not a dataset name.");
  const span = Math.max(1, Math.min(90, Math.floor(days) || 7));
  const since = `timestamp > NOW() - INTERVAL '${span}' DAY`;
  const [rows, daily] = await Promise.all([
    sql(`SELECT blob1 AS event, blob2 AS a, blob3 AS b, blob4 AS c, blob5 AS d, blob6 AS e,
      SUM(_sample_interval * double1) AS n FROM ${dataset} WHERE ${since}
      GROUP BY event, a, b, c, d, e ORDER BY n DESC LIMIT 5000`),
    sql(`SELECT toStartOfDay(timestamp) AS day, blob1 AS event, SUM(_sample_interval * double1) AS n
      FROM ${dataset} WHERE ${since} GROUP BY day, event ORDER BY day`)
  ]);
  const report: UsageReport = {
    dataset,
    days: span,
    empty: !rows.length,
    totals: zero(),
    events: Object.fromEntries(
      EVENTS.map(event => [event, []])
    ) as unknown as UsageReport["events"],
    daily: [],
    ceilings: []
  };
  for (const row of rows) {
    if (!isEvent(row.event)) continue;
    const event = row.event;
    const count = whole(row.n);
    const blobs = [row.a, row.b, row.c, row.d, row.e];
    const named: Record<string, string | number> = Object.fromEntries(
      USAGE_COLUMNS[event].map((column, i) => [column, String(blobs[i] ?? "")])
    );
    named.count = count;
    report.totals[event] += count;
    report.events[event].push(named);
    if (event === "limit" && row.b === "site")
      report.ceilings.push({ limit: String(row.a), count });
  }
  const byDay = new Map<string, { day: string } & Record<UsageEventName, number>>();
  for (const row of daily) {
    if (!isEvent(row.event)) continue;
    const day = String(row.day).slice(0, 10);
    const held = byDay.get(day) ?? { day, ...zero() };
    held[row.event] += whole(row.n);
    byDay.set(day, held);
  }
  report.daily = [...byDay.values()];
  return report;
}
