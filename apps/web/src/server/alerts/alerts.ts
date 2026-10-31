import { CONTACT_EMAIL } from "@grabient/email/addresses.ts";
import type { Env } from "@grabient/server/env.ts";
import { flagOff } from "@grabient/server/flags/flags.ts";
import { LIMITS } from "@grabient/server/limits/config.ts";
import { DATASETS } from "../mcp/admin/usage.ts";

/* Emails to the site's own address from the scheduled jobs, about what nobody would otherwise see: the site failing,
   and what shows only once an app fails to connect. At most one a day of each kind, by a marker in OAUTH_KV kept two
   days. English and never translated: they go to the people who run the site. */

const KEPT_SECONDS = 2 * 86_400;

/** Sends the site's address an alert unless one of this kind went today. False when nothing went: one went today, the
    deploy has no EMAIL or OAUTH_KV, or the send failed, which is logged so one alert never stops the job's others.
    Every deploy but production names itself in the subject, so staging's alert never reads as grabient.com's. */
export async function alertOwner(
  env: Pick<Env, "DEPLOYMENT" | "EMAIL" | "EMAIL_FROM" | "OAUTH_KV">,
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
      subject: env.DEPLOYMENT === "production" ? subject : `[${env.DEPLOYMENT}] ${subject}`,
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
    and knows no column of that name. A dataset no point has reached yet answers no rows, so a query that fails is its
    step failing: it throws, and the step fails where Workers Issues shows it. */
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
  const errors = await rows(`SELECT blob3 AS category, blob4 AS reason, SUM(double1) AS n
    FROM ${from} WHERE blob1 = 'oauth' AND blob2 = 'error' AND ${since} GROUP BY category, reason ORDER BY n DESC`);
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
   report 20 an hour (client-errors.ts). One browser, by its name and major version, counts for 20 of them at most:
   a program driving one browser from many addresses (a scraper whose scripts the firewall refused, on 17 Oct 2026)
   sends hundreds, while a fault of the site's reaches readers on more than one. A script the browser could not load is
   counted apart (script-load, client-errors.ts) and never weighed here. */
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
    each: 20,
    subject: "Grabient: pages are failing in readers' browsers",
    lead: "readers' browsers reported these errors, by kind of page and browser"
  }
] as const;
type Failing = (typeof FAILING)[number]["event"];

/** The browser errors as the alert weighs them: each browser's (a row's `b`) counted up to `each`. */
function weighed(found: readonly Row[], each: number): number {
  const browsers = new Map<string, number>();
  for (const row of found)
    browsers.set(String(row.b), (browsers.get(String(row.b)) ?? 0) + whole(row));
  return [...browsers.values()].reduce((sum, n) => sum + Math.min(n, each), 0);
}

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
  const rows = await rowsOf(
    analytics,
    `SELECT blob1 AS event, blob2 AS a, blob3 AS b, SUM(double1) AS n FROM events.analyticsEngine."${dataset}"
    WHERE blob1 IN ('failure', 'client-error') AND timestamp > NOW() - INTERVAL '10' MINUTE
    GROUP BY event, a, b ORDER BY n DESC`
  );
  const issues = `https://dash.cloudflare.com/?to=/:account/workers/services/view/grabient-${env.DEPLOYMENT}/production/issues`;
  const emailed: Failing[] = [];
  for (const kind of FAILING) {
    const found = rows.filter(row => row.event === kind.event);
    counted[kind.event] = found.reduce((sum, row) => sum + whole(row), 0);
    if (("each" in kind ? weighed(found, kind.each) : counted[kind.event]) < kind.at) continue;
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

/* The site's ceilings on work no cache holds (ceiling.ts), heard of in the last ten minutes. A pool ran out: each
   isolate or data center that learned so wrote one refusal, never one per page. Or work was drawn while the limiter
   could not count it, which the sampled answers weigh. While draw-past-ceiling is on, a pool that ran out only says
   what would have stood in. */
const POOLS = new Set(["pageRender", "dataMiss", "renderSignedIn", "renderHttp3", "renderPreview"]);
/** Answers drawn uncounted in ten minutes past what one isolate's passing fault makes. */
const UNMETERED_AT = 200;
type Ceiling = "ceiling" | "ceiling-unmetered";

/** The site's ceilings, mailed when a pool ran out or the limiter could not count, at most once a day each. The
    ten-minute job's step, which reads the counts, and the flags only when a pool ran out. */
export async function ceilingAlert(
  env: Counted & Pick<Env, "DB">,
  now = Date.now()
): Promise<{ skipped?: string; pools: number; unmetered: number; emailed: Ceiling[] }> {
  const dataset = DATASETS[env.DEPLOYMENT];
  const analytics = env.ANALYTICS;
  if (!analytics || !dataset) {
    return {
      skipped: "This deploy has no usage counts to read",
      pools: 0,
      unmetered: 0,
      emailed: []
    };
  }
  const rows = await rowsOf(
    analytics,
    `SELECT blob1 AS event, blob2 AS a, blob3 AS b, blob4 AS c, SUM(double1) AS n FROM events.analyticsEngine."${dataset}"
    WHERE blob1 IN ('limit', 'render') AND timestamp > NOW() - INTERVAL '10' MINUTE
    GROUP BY event, a, b, c ORDER BY n DESC`
  );
  const pools = rows.filter(
    row => row.event === "limit" && row.b === "site" && POOLS.has(String(row.a))
  );
  const answers = rows.filter(row => row.event === "render");
  const unmetered = answers
    .filter(row => row.c === "unmetered")
    .reduce((sum, row) => sum + whole(row), 0);
  const counts = [
    "The answers, by what, lane and answer, weighed from one in twenty:",
    ...(answers.length
      ? answers.slice(0, 12).map(row => `- ${row.a}, ${row.b}, ${row.c}: ${whole(row)}`)
      : ["- none counted"])
  ].join("\n");
  const emailed: Ceiling[] = [];
  if (pools.length) {
    const enforced = await flagOff(env, "draw-past-ceiling");
    // each subject goes once a day, so "is on" still goes the day "would be on" went
    const sent = await alertOwner(
      env,
      enforced ? "ceiling-on" : "ceiling",
      enforced ? "Grabient: the render ceiling is on" : "Grabient: the render ceiling would be on",
      [
        [
          "In the last ten minutes these pools ran out, by the refusals isolates and data centers learned it from:",
          ...pools.map(row => `- ${row.a}: ${whole(row)}`)
        ].join("\n"),
        counts,
        enforced
          ? "draw-past-ceiling is off in Settings, so readers past a pool without a lane got what stands in: the app's frame for a page, JSON 429 for data, and the site's card or a 429 for a search's picture. Turn it on to draw every page again."
          : "draw-past-ceiling is on in Settings, so every reader was drawn and the ceiling only counted. Turn it off to have readers past a pool without a lane get what stands in.",
        "This alert goes at most once a day. The site_usage tool shows every count."
      ],
      now
    );
    if (sent) emailed.push("ceiling");
  }
  if (unmetered >= UNMETERED_AT) {
    const sent = await alertOwner(
      env,
      "ceiling-unmetered",
      "Grabient: the render ceiling cannot count",
      [
        `In the last ten minutes about ${unmetered} answers were drawn while the limiter could not count them: it failed or took more than two seconds, and each isolate counted alone, up to ${LIMITS.renderLocal.requests} pages in ten minutes. The Worker's logs say why under "rate limiter unavailable".`,
        counts,
        "This alert goes at most once a day. The site_usage tool shows every count."
      ],
      now
    );
    if (sent) emailed.push("ceiling-unmetered");
  }
  return { pools: pools.length, unmetered, emailed };
}
