import { CONTACT_EMAIL } from "@grabient/email/addresses.ts";
import type { Env } from "@grabient/server/env.ts";
import { DATASETS } from "../mcp/admin/usage.ts";

/* Emails to the site's own address from the scheduled jobs, about what nobody would otherwise see: the site failing,
   and what shows only once an app fails to connect. At most one a day of each kind, by a marker in OAUTH_KV kept two
   days. English and never translated: they go to the people who run the site. */

const KEPT_SECONDS = 2 * 86_400;

/** Sends the site's address an alert unless one of this kind went today. False when nothing went: one went today, the
    deploy has no EMAIL or OAUTH_KV, or the send failed, which is logged so one alert never stops the job's others. */
export async function alertOwner(
  env: Pick<Env, "EMAIL" | "EMAIL_FROM" | "OAUTH_KV">,
  key: string,
  subject: string,
  paragraphs: readonly string[],
  now = Date.now()
): Promise<boolean> {
  if (!env.EMAIL || !env.OAUTH_KV) return false;
  const marker = `alert:${key}:${new Date(now).toISOString().slice(0, 10)}`;
  if (await env.OAUTH_KV.get(marker)) return false;
  try {
    await env.EMAIL.send({
      from: { name: "Grabient", email: env.EMAIL_FROM },
      to: CONTACT_EMAIL,
      subject,
      text: paragraphs.join("\n\n")
    });
  } catch (error) {
    console.error("alert: not sent", key, error instanceof Error ? error.message : error);
    return false;
  }
  await env.OAUTH_KV.put(marker, "1", { expirationTtl: KEPT_SECONDS });
  return true;
}

/** What the client document check (oauth) reports: a saved copy that changed, or one unreachable for a week. */
export interface DocumentNotice {
  clientId: string;
  /** the top-level fields that differ */
  fields: readonly string[];
  /** why it could not be read the last time */
  why?: string;
  notify: "changed" | "unreachable" | null;
}
const COPIES = "apps/web/src/server/oauth/client-documents.data.ts";

/** The alert for a saved client metadata document, sent once: `checkClientDocuments` marks the record told only when
    this answers true. */
export function documentAlert(env: Env, check: DocumentNotice, now = Date.now()): Promise<boolean> {
  if (check.notify === "changed") {
    return alertOwner(
      env,
      `client-document:${check.clientId}`,
      "Grabient: a saved client document changed",
      [
        `The client metadata document at ${check.clientId} no longer matches the copy in ${COPIES}.`,
        `Fields that differ: ${check.fields.join(", ") || "none at the top level"}.`,
        "Until the copy is updated, a redirect the document added is refused for new connections, and one it removed is still accepted.",
        "Compare and rewrite the copy from apps/web: node scripts/client-documents.ts, then --write, then review and deploy."
      ],
      now
    );
  }
  return alertOwner(
    env,
    `client-document-unreachable:${check.clientId}`,
    "Grabient: a client document has been unreachable for a week",
    [
      `The six-hour job could not read ${check.clientId} for seven days (${check.why ?? "no answer"} the last time). Its saved copy in ${COPIES} keeps the app connecting.`,
      "Its host may be refusing Workers: compare from a dev machine with node scripts/client-documents.ts (from apps/web)."
    ],
    now
  );
}

type Row = Record<string, unknown>;
type Counted = Pick<Env, "ANALYTICS" | "DEPLOYMENT" | "EMAIL" | "EMAIL_FROM" | "OAUTH_KV">;

/** What a query of the deploy's own counts answers. The binding weighs a sum by each point's sample interval itself,
    and knows no column of that name. */
async function rowsOf(analytics: NonNullable<Env["ANALYTICS"]>, query: string): Promise<Row[]> {
  const answer = (await analytics.query({ query })) as { data?: unknown } | null;
  return Array.isArray(answer?.data) ? (answer.data as Row[]) : [];
}
const whole = (row: Row) => Math.round(Number(row.n) || 0);

const WATCHED = new Set(["refresh_token_mismatch", "kv_rate_limited"]);

/** The last six hours of apps signing in, mailed when the counts show an app racing itself or a refresh token used in
    two places (`refresh_token_mismatch`), or KV refusing writes (`kv_rate_limited`). The six-hour job's step. */
export async function signInDigest(
  env: Counted
): Promise<{ skipped?: string; watched: number; emailed: boolean }> {
  const dataset = DATASETS[env.DEPLOYMENT];
  const analytics = env.ANALYTICS;
  if (!analytics || !dataset) {
    return { skipped: "This deploy has no usage counts to read", watched: 0, emailed: false };
  }
  const since = "timestamp > NOW() - INTERVAL '6' HOUR";
  const from = `events.analyticsEngine."${dataset}"`;
  const rows = (query: string) => rowsOf(analytics, query);
  let errors: Row[];
  try {
    errors = await rows(`SELECT blob3 AS category, blob4 AS reason, SUM(double1) AS n
      FROM ${from} WHERE blob1 = 'oauth' AND blob2 = 'error' AND ${since} GROUP BY category, reason ORDER BY n DESC`);
  } catch (error) {
    // a dataset appears with its first point: until then there is nothing to read
    return {
      skipped: `${dataset}: ${error instanceof Error ? error.message : error}`,
      watched: 0,
      emailed: false
    };
  }
  const watched = errors.filter(row => WATCHED.has(String(row.reason)));
  if (!watched.length) return { watched: 0, emailed: false };
  const refused = await rows(`SELECT blob3 AS grant, blob5 AS client, SUM(double1) AS n
    FROM ${from} WHERE blob1 = 'oauth' AND blob2 = 'token' AND blob4 = '400' AND ${since}
    GROUP BY grant, client ORDER BY n DESC`);
  const emailed = await alertOwner(env, "sign-in-digest", "Grabient: apps signing in", [
    [
      "Connected apps, the last six hours:",
      ...watched.map(row => `- ${row.category}/${row.reason}: ${whole(row)}`)
    ].join("\n"),
    [
      "The token endpoint's 400s by grant and kind of app:",
      ...(refused.length
        ? refused.map(row => `- ${row.grant} ${row.client}: ${whole(row)}`)
        : ["- none"])
    ].join("\n"),
    "A refresh_token_mismatch is an app that raced itself, or a refresh token used in two places. A kv_rate_limited is two writes to one grant within a second. The site_usage tool shows every count."
  ]);
  return { watched: watched.reduce((sum, row) => sum + whole(row), 0), emailed };
}

/* What says the site is failing, counted over the last ten minutes. Ten answers it could not give are more than a
   passing fault makes, and so are 25 errors from readers' browsers, which one address alone never sends: it may
   report 20 an hour (client-errors.ts). */
const FAILING = [
  {
    event: "failure",
    at: 10,
    subject: "Grabient: answers are failing",
    lead: "the site could not give these answers, by status and kind of address"
  },
  {
    event: "client-error",
    at: 25,
    subject: "Grabient: pages are failing in readers' browsers",
    lead: "readers' browsers reported these errors, by kind of page and browser"
  }
] as const;
type Failing = (typeof FAILING)[number]["event"];

/** The answers the site could not give in the last ten minutes (pipeline.ts) and the errors readers' browsers
    reported, each mailed when there are more than a passing fault makes, at most once a day each. The ten-minute
    job's step, which reads nothing but the counts. */
export async function failingAlert(
  env: Counted,
  now = Date.now()
): Promise<{ skipped?: string; counted: Record<Failing, number>; emailed: Failing[] }> {
  const counted = { failure: 0, "client-error": 0 };
  const dataset = DATASETS[env.DEPLOYMENT];
  const analytics = env.ANALYTICS;
  if (!analytics || !dataset) {
    return { skipped: "This deploy has no usage counts to read", counted, emailed: [] };
  }
  let rows: Row[];
  try {
    rows = await rowsOf(
      analytics,
      `SELECT blob1 AS event, blob2 AS a, blob3 AS b, SUM(double1) AS n FROM events.analyticsEngine."${dataset}"
      WHERE blob1 IN ('failure', 'client-error') AND timestamp > NOW() - INTERVAL '10' MINUTE
      GROUP BY event, a, b ORDER BY n DESC`
    );
  } catch (error) {
    // a dataset appears with its first point: until then there is nothing to read
    return {
      skipped: `${dataset}: ${error instanceof Error ? error.message : error}`,
      counted,
      emailed: []
    };
  }
  const issues = `https://dash.cloudflare.com/?to=/:account/workers/services/view/grabient-${env.DEPLOYMENT}/production/issues`;
  const emailed: Failing[] = [];
  for (const kind of FAILING) {
    const found = rows.filter(row => row.event === kind.event);
    counted[kind.event] = found.reduce((sum, row) => sum + whole(row), 0);
    if (counted[kind.event] < kind.at) continue;
    const sent = await alertOwner(
      env,
      `failing:${kind.event}`,
      kind.subject,
      [
        [
          `In the last ten minutes ${kind.lead}, ${counted[kind.event]} in all:`,
          ...found.slice(0, 12).map(row => `- ${row.a}, ${row.b}: ${whole(row)}`)
        ].join("\n"),
        `Workers Issues holds each error with its stack and the requests it failed: ${issues}`,
        "This alert goes at most once a day. The site_usage tool shows every count."
      ],
      now
    );
    if (sent) emailed.push(kind.event);
  }
  return { counted, emailed };
}
