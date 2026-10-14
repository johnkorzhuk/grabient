import type { Env } from "@grabient/server/env.ts";
import { publicOrigin } from "../seo/site.ts";
import { CLIENT_DOCUMENTS } from "./client-documents.data.ts";
import { canonical, differingFields, publishedDocument } from "./documents.ts";
import { authorizationServer } from "./server.ts";

/* The six-hour job's care of connected apps: expired grants and tokens purged, and each saved client document compared
   with the one its maker publishes, so the owner hears of a change before an app fails to connect. The alert itself is
   the caller's to send (alerts/alerts.ts). */

/** A batch of expired and orphaned grants and tokens, resumed where the last run stopped. */
export async function purgeOAuth(env: Env) {
  if (!env.OAUTH_KV) return null;
  const cursor = (await env.OAUTH_KV.get("purge-cursor")) ?? undefined;
  const result = await authorizationServer(env, publicOrigin(env)).purgeExpiredData(env, {
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
const UNREACHABLE_DAYS = 7;
const RECORD_KEPT_SECONDS = 30 * 86400;

async function sha256(text: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  );
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Each saved copy against the document its maker publishes. The last state of each is kept in OAUTH_KV, so the owner
    hears of a change once (`alert` answers whether the email went) and of a document unreachable for a week once.
    Nothing here changes a copy: only a reviewed commit does. */
export async function checkClientDocuments(
  env: Pick<Env, "OAUTH_KV">,
  alert: (check: DocumentCheck) => Promise<boolean>,
  now = Date.now()
): Promise<DocumentCheck[]> {
  const checks: DocumentCheck[] = [];
  for (const [clientId, saved] of Object.entries(CLIENT_DOCUMENTS)) {
    const key = `client-document:${clientId}`;
    const live = await publishedDocument(clientId, DOCUMENT_TIMEOUT_MS);
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
      const fields = differingFields(saved, live);
      const told =
        previous?.state === "changed" && previous.hash === hash && Boolean(previous.notified);
      record = { state: "changed", hash, notified: told };
      check = { clientId, state: "changed", fields, notify: told ? null : "changed" };
    }
    if (check.notify && (await alert(check))) record.notified = true;
    await env.OAUTH_KV?.put(key, JSON.stringify(record), { expirationTtl: RECORD_KEPT_SECONDS });
    checks.push(check);
  }
  return checks;
}
