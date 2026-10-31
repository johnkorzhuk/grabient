import type { Deployment, Env } from "@grabient/server/env.ts";

/* The counts of the site's own work (usage/count.ts) read back from Workers Analytics Engine through the deploy's
   ANALYTICS binding, for the site_usage tool: which dataset the deploy writes, and its rows made into totals and
   named columns. The binding speaks the Analytics SQL API: one SELECT a query, the dataset under
   events.analyticsEngine, a lower bound on the time, and sums already weighed by each point's sample interval. */

/** The datasets cloudflare.config.ts binds as USAGE. A Preview writes none. */
export const DATASETS: Partial<Record<Deployment, string>> = {
  production: "grabient_usage",
  staging: "grabient_staging_usage",
  development: "grabient_dev_usage"
};

/** What each event's blobs say, in order after the event itself. */
const USAGE_COLUMNS = {
  mcp: ["server", "tool", "outcome", "address", "client"],
  oauth: ["step", "what", "outcome", "client"],
  limit: ["limit", "kind"],
  legacy: ["resolved", "who"],
  image: ["picture", "answeredBy"],
  "client-error": ["page", "browser"],
  "script-load": ["page", "browser"],
  file: ["format", "from", "who"],
  failure: ["status", "kind"],
  ga4: ["what", "country", "browser", "network"],
  render: ["what", "lane", "answer", "kind"]
} as const;
type UsageEventName = keyof typeof USAGE_COLUMNS;
/** Every event the dataset holds, in the order a report lists them. */
export const USAGE_EVENTS = Object.keys(USAGE_COLUMNS) as UsageEventName[];

export interface UsageReport {
  dataset: string;
  days: number;
  /** nothing counted in the window: a dataset holds nothing until its first point */
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
  Object.fromEntries(USAGE_EVENTS.map(event => [event, 0])) as Record<UsageEventName, number>;
const whole = (value: unknown) => Math.round(Number(value) || 0);
const isEvent = (value: unknown): value is UsageEventName =>
  typeof value === "string" && value in USAGE_COLUMNS;

/** The last `days` of the deploy's dataset, or the sentence that says why the deploy cannot read one. A query the
    service refuses throws. */
export async function readUsage(
  env: Pick<Env, "ANALYTICS" | "DEPLOYMENT">,
  days: number
): Promise<UsageReport | string> {
  const binding = env.ANALYTICS;
  const dataset = DATASETS[env.DEPLOYMENT];
  if (!binding || !dataset) return "This deploy has no ANALYTICS binding to read its counts with.";
  const sql = async (query: string): Promise<Record<string, unknown>[]> => {
    const answer = (await binding.query({ query })) as { data?: unknown } | null;
    return Array.isArray(answer?.data) ? answer.data : [];
  };
  const span = Math.max(1, Math.min(90, Math.floor(days) || 7));
  // visits are read apart (visits.ts): their many labels would crowd the other events out of the rows
  const from = `FROM events.analyticsEngine.${dataset} WHERE timestamp >= NOW() - INTERVAL '${span}' DAY AND blob1 != 'visit'`;
  const [rows, daily] = await Promise.all([
    sql(`SELECT blob1 AS event, blob2 AS a, blob3 AS b, blob4 AS c, blob5 AS d, blob6 AS e, SUM(double1) AS n
      ${from} GROUP BY event, a, b, c, d, e ORDER BY n DESC LIMIT 5000`),
    sql(`SELECT toStartOfDay(timestamp) AS day, blob1 AS event, SUM(double1) AS n
      ${from} GROUP BY day, event ORDER BY day`)
  ]);
  const report: UsageReport = {
    dataset,
    days: span,
    empty: !rows.length,
    totals: zero(),
    events: Object.fromEntries(
      USAGE_EVENTS.map(event => [event, []])
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
