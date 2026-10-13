import { sendEmail } from "@grabient/server/email/send.ts";
import type { Env } from "@grabient/server/env.ts";
import { type AnalyticsRows, analyticsRows } from "../mcp/admin/usage.ts";
import { countUsage } from "@grabient/server/usage/count.ts";
import { CLIENT_DOCUMENTS } from "./client-documents.data.ts";
import { authorizationServer, siteOrigin } from "./server.ts";

/* The six-hour job's care of connected apps: expired grants and tokens purged, each saved client document compared
   with the one its maker publishes, and the owner told by email of what nobody would otherwise see until an app
   failed to connect. */

/** The site's own address, which owner alerts go to. English, never translated: they go to the people who run it. */
const SITE_ADDRESS = "hello@grabient.com";
const ALERT_KEPT_SECONDS = 2 * 86400;

/** Emails the site's address at most once a day for each `key`, by a marker in OAUTH_KV. False when it sent nothing:
    already sent today, or no EMAIL or OAUTH_KV binding (a Preview). */
export async function alertOwner(
  env: Env,
  key: string,
  subject: string,
  lines: readonly string[],
  now = Date.now()
): Promise<boolean> {
  if (!env.EMAIL || !env.OAUTH_KV) return false;
  const marker = `alert:${key}:${new Date(now).toISOString().slice(0, 10)}`;
  if (await env.OAUTH_KV.get(marker)) return false;
  const escaped = (text: string) => text.replace(/[&<>]/g, char => `&#${char.charCodeAt(0)};`);
  await sendEmail(env, {
    to: SITE_ADDRESS,
    subject,
    text: lines.join("\n\n"),
    html: lines.map(line => `<p>${escaped(line)}</p>`).join("\n")
  });
  await env.OAUTH_KV.put(marker, "1", { expirationTtl: ALERT_KEPT_SECONDS });
  return true;
}

/** A batch of expired and orphaned grants and tokens, resumed where the last run stopped. */
export async function purgeOAuth(env: Env) {
  if (!env.OAUTH_KV) return null;
  const cursor = (await env.OAUTH_KV.get("purge-cursor")) ?? undefined;
  const result = await authorizationServer(env, siteOrigin(env)).purgeExpiredData(env, {
    batchSize: 100,
    cursor
  });
  if (result.cursor) await env.OAUTH_KV.put("purge-cursor", result.cursor);
  else if (cursor) await env.OAUTH_KV.delete("purge-cursor");
  return result;
}

/** How a saved copy compares with the document its maker publishes now. */
export interface DocumentCheck {
  clientId: string;
  state: "same" | "changed" | "unreachable";
  /** the top-level fields that differ, for a changed one */
  fields: string[];
  /** why an unreachable one could not be read: its HTTP status, or the fetch's error */
  why?: string;
  /** what the owner is told of now: a document that turned changed, or one unreachable for a week */
  notify: "changed" | "unreachable" | null;
}
interface DocumentRecord {
  state: DocumentCheck["state"];
  hash?: string;
  since?: number;
  notified?: boolean;
}

const DOCUMENT_TIMEOUT_MS = 5000;
const DOCUMENT_MAX = 5 * 1024;
const UNREACHABLE_DAYS = 7;
const RECORD_KEPT_SECONDS = 30 * 86400;

const sorted = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(sorted)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map(key => [key, sorted((value as Record<string, unknown>)[key])])
        )
      : value;
const canonical = (value: unknown) => JSON.stringify(sorted(value));

async function sha256(text: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  );
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

/** The document its maker publishes now, or why it could not be read. No redirect is followed. */
async function publishedDocument(clientId: string): Promise<Record<string, unknown> | string> {
  try {
    const response = await fetch(clientId, {
      headers: { Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(DOCUMENT_TIMEOUT_MS)
    });
    if (response.status !== 200) return `HTTP ${response.status}`;
    const text = await response.text();
    if (text.length > DOCUMENT_MAX) return "larger than 5 KB";
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : "not a JSON object";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Each saved copy against the document its maker publishes. The last state of each is kept in OAUTH_KV, so the owner
    hears of a change once (`report` answers whether the email went) and of a document unreachable for a week once.
    Nothing here changes a copy: only a reviewed commit does. */
export async function checkClientDocuments(
  env: Env,
  report: (check: DocumentCheck) => Promise<boolean>,
  now = Date.now()
): Promise<DocumentCheck[]> {
  const checks: DocumentCheck[] = [];
  for (const [clientId, saved] of Object.entries(CLIENT_DOCUMENTS)) {
    const key = `client-document:${clientId}`;
    const live = await publishedDocument(clientId);
    let previous: DocumentRecord | null = null;
    try {
      previous = JSON.parse((await env.OAUTH_KV?.get(key)) ?? "null") as DocumentRecord | null;
    } catch {
      previous = null;
    }
    let record: DocumentRecord;
    let check: DocumentCheck;
    if (typeof live === "string") {
      const wasUnreachable = previous?.state === "unreachable";
      const since = wasUnreachable && previous?.since ? previous.since : now;
      const told = wasUnreachable && Boolean(previous?.notified);
      const due = now - since >= UNREACHABLE_DAYS * 86_400_000 && !told;
      record = { state: "unreachable", since, notified: told };
      check = {
        clientId,
        state: "unreachable",
        fields: [],
        why: live,
        notify: due ? "unreachable" : null
      };
    } else if (canonical(live) === canonical(saved)) {
      record = { state: "same" };
      check = { clientId, state: "same", fields: [], notify: null };
    } else {
      const hash = await sha256(canonical(live));
      const fields = [...new Set([...Object.keys(saved), ...Object.keys(live)])]
        .filter(field => canonical(saved[field]) !== canonical(live[field]))
        .sort();
      const told =
        previous?.state === "changed" && previous.hash === hash && Boolean(previous.notified);
      record = { state: "changed", hash, notified: told };
      check = { clientId, state: "changed", fields, notify: told ? null : "changed" };
    }
    if (check.notify && (await report(check))) record.notified = true;
    await env.OAUTH_KV?.put(key, JSON.stringify(record), { expirationTtl: RECORD_KEPT_SECONDS });
    checks.push(check);
  }
  return checks;
}

const COPIES = "apps/web/src/server/oauth/client-documents.data.ts";

/** The email for a saved document that changed or stopped answering. */
export function documentAlert(env: Env, check: DocumentCheck, now = Date.now()): Promise<boolean> {
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

/** The last six hours of apps signing in, mailed when the counts show a refresh race or a token used in two places
    (`refresh_token_mismatch`) or KV refusing writes (`kv_rate_limited`). */
export async function signInDigest(
  env: Env
): Promise<{ skipped?: string; watched: number; emailed: boolean }> {
  const read = await analyticsRows(env);
  if (typeof read === "string") return { skipped: read, watched: 0, emailed: false };
  const { sql, dataset, written } = read;
  if (!written) return { skipped: `${dataset} has no data yet`, watched: 0, emailed: false };
  const since = "timestamp > NOW() - INTERVAL '6' HOUR";
  const errors =
    await sql(`SELECT blob3 AS category, blob4 AS reason, SUM(_sample_interval * double1) AS n
    FROM ${dataset} WHERE blob1 = 'oauth' AND blob2 = 'error' AND ${since} GROUP BY category, reason ORDER BY n DESC`);
  const watched = errors.filter(row => WATCHED.has(String(row.reason)));
  if (!watched.length) return { watched: 0, emailed: false };
  const refused =
    await sql(`SELECT blob3 AS grant, blob5 AS client, SUM(_sample_interval * double1) AS n
    FROM ${dataset} WHERE blob1 = 'oauth' AND blob2 = 'token' AND blob4 = '400' AND ${since}
    GROUP BY grant, client ORDER BY n DESC`);
  const count = (row: AnalyticsRows[number]) => Math.round(Number(row.n) || 0);
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

/** The six-hour job's steps for connected apps, each failing alone (jobs.ts runSteps). What each returns is logged. */
export const OAUTH_STEPS = {
  "connected apps past keeping": async (env: Env) => {
    const purged = await purgeOAuth(env);
    return purged?.grantsPurged || purged?.tokensPurged ? purged : undefined;
  },
  "client documents": async (env: Env) => {
    const checks = await checkClientDocuments(env, check => documentAlert(env, check));
    for (const check of checks) {
      const document = new URL(check.clientId);
      countUsage(env, "oauth", "client-document", document.host + document.pathname, check.state);
    }
    const changed = checks.filter(check => check.state !== "same");
    return changed.length ? changed : undefined;
  },
  "sign-in digest": (env: Env) => signInDigest(env)
} as const;
