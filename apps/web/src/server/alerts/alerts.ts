import { CONTACT_EMAIL } from "@grabient/email/addresses.ts";
import type { Env } from "@grabient/server/env.ts";
import { DATASETS } from "../mcp/admin/usage.ts";

/* Emails to the site's own address from the six-hour job, about what nobody would otherwise see until an app failed to
   connect. At most one a day of each kind, by a marker in OAUTH_KV kept two days. English and never translated: they go
   to the people who run the site. */

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

const WATCHED = new Set(["refresh_token_mismatch", "kv_rate_limited"]);
type Row = Record<string, unknown>;

/** The last six hours of apps signing in, mailed when the counts show an app racing itself or a refresh token used in
    two places (`refresh_token_mismatch`), or KV refusing writes (`kv_rate_limited`). The six-hour job's step. The
    binding weighs a sum by each point's sample interval itself, and knows no column of that name. */
export async function signInDigest(
  env: Pick<Env, "ANALYTICS" | "DEPLOYMENT" | "EMAIL" | "EMAIL_FROM" | "OAUTH_KV">
): Promise<{ skipped?: string; watched: number; emailed: boolean }> {
  const dataset = DATASETS[env.DEPLOYMENT];
  const analytics = env.ANALYTICS;
  if (!analytics || !dataset) {
    return { skipped: "This deploy has no usage counts to read", watched: 0, emailed: false };
  }
  const since = "timestamp > NOW() - INTERVAL '6' HOUR";
  const from = `events.analyticsEngine."${dataset}"`;
  const rows = async (query: string): Promise<Row[]> => {
    const answer = (await analytics.query({ query })) as { data?: unknown } | null;
    return Array.isArray(answer?.data) ? (answer.data as Row[]) : [];
  };
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
  const count = (row: Row) => Math.round(Number(row.n) || 0);
  const emailed = await alertOwner(env, "sign-in-digest", "Grabient: apps signing in", [
    [
      "Connected apps, the last six hours:",
      ...watched.map(row => `- ${row.category}/${row.reason}: ${count(row)}`)
    ].join("\n"),
    [
      "The token endpoint's 400s by grant and kind of app:",
      ...(refused.length
        ? refused.map(row => `- ${row.grant} ${row.client}: ${count(row)}`)
        : ["- none"])
    ].join("\n"),
    "A refresh_token_mismatch is an app that raced itself, or a refresh token used in two places. A kv_rate_limited is two writes to one grant within a second. The site_usage tool shows every count."
  ]);
  return { watched: watched.reduce((sum, row) => sum + count(row), 0), emailed };
}
