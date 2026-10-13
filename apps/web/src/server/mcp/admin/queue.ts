import { all, batch, first, run, type Statement } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import {
  appendCollectionItems,
  type CollectionItemInput,
  checkTexts,
  collectionItem,
  collectionRecord,
  createCollection,
  isCollectionSlug,
  MAX_COLLECTION_ITEMS,
  newId,
  type PaletteTextInput,
  paletteTextInput,
  SlugTaken,
  setLike,
  upsertPaletteTexts,
  validateCollection
} from "../site.ts";
import { personaIds, SITE_AGENT } from "./personas.ts";

/* The seeding queue: likes by a persona and palettes for a collection, each with the time it is due. An admin's app
   fills it ahead (the schedule tool) and the ten-minute job applies what is due (applyQueue).

   A like brings the palette into the gallery as a reader's like does. A collection item only adds: palettes the
   collection lacks join it, nothing it holds moves or leaves, and its words stay as first written. A palette on the
   admins' record is never liked or added. Every apply is idempotent, so an item whose claim died is simply due again,
   and rows are never deleted: done, failed and cancelled rows are the record. */

type QueueKind = "like" | "collection";
export const QUEUE_STATUSES = ["due", "running", "done", "failed", "cancelled"] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export interface QueueInput {
  kind: QueueKind;
  actor: string | null;
  dueAt: number;
  payload: Record<string, unknown>;
}
export interface QueueItem extends QueueInput {
  id: string;
  label: string;
  status: QueueStatus;
  result: unknown;
}

const LIST_MAX = 5000;
const APPLY_LIMIT = 40;
/** A claimed item nobody finished in this long is due again: the isolate died mid-apply. */
const STALE_RUNNING_MS = 30 * 60_000;
/** How far ahead a plan may reach, and how far back a due time may lie. */
const DUE_AHEAD_MS = 400 * 86_400_000;
const DUE_BEHIND_MS = 30 * 86_400_000;
const LABEL_MAX = 80;
/** A day alone is due at 14:00 UTC: the middle of the afternoon in Europe, the morning in America. */
const DAY_AT = 14 * 3_600_000;
/** Tries in all for an item that failed through no fault of its own, the next one this much later each time. */
const ATTEMPTS = 3;
const RETRY_MS = 30 * 60_000;

/** A due time: milliseconds, a day (`2026-10-05`), or a moment (`2026-10-05T09:30:00Z`), within a month back and 400
    days ahead. */
export function parseDue(value: unknown, now = Date.now()): number | null {
  let at: number;
  if (typeof value === "number") at = value;
  else if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    at = Date.parse(`${value}T00:00:00Z`) + DAY_AT;
  else if (typeof value === "string") at = Date.parse(value);
  else return null;
  if (!Number.isFinite(at) || at < now - DUE_BEHIND_MS || at > now + DUE_AHEAD_MS) return null;
  return Math.floor(at);
}

export const queueLabel = (value: unknown): string =>
  typeof value === "string"
    ? value.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, LABEL_MAX)
    : "";

/** One item of a plan, checked the way its apply will read it: a like names a persona and a palette; a collection
    names its slug and validates as a public collection. Its payload is stored normalized. */
export function queueInput(
  raw: unknown,
  personas: ReadonlySet<string>,
  now = Date.now()
): { ok: true; item: QueueInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { ok: false, error: "Not an object." };
  const value = raw as Record<string, unknown>;
  const kind = value.kind;
  if (kind !== "like" && kind !== "collection")
    return { ok: false, error: "kind is like or collection." };
  const dueAt = parseDue(value.due, now);
  if (dueAt === null) {
    return {
      ok: false,
      error: "due is a day, a moment or milliseconds, within a month back and 400 days ahead."
    };
  }
  const payload =
    value.payload && typeof value.payload === "object" && !Array.isArray(value.payload)
      ? (value.payload as Record<string, unknown>)
      : null;
  if (!payload) return { ok: false, error: "payload is an object." };
  if (kind === "like") {
    const actor = typeof value.actor === "string" ? value.actor : "";
    if (!personas.has(actor))
      return { ok: false, error: "actor names a persona of this agent (its id)." };
    const item = collectionItem(payload);
    if (!item) {
      return {
        ok: false,
        error: "payload is a palette: seed, and any style, steps or angle given must be valid."
      };
    }
    return { ok: true, item: { kind, actor, dueAt, payload: { ...item } } };
  }
  const slug = payload.slug;
  if (typeof slug !== "string" || !isCollectionSlug(slug)) {
    return { ok: false, error: "payload.slug names the collection." };
  }
  const valid = validateCollection({ visibility: "public", ...payload });
  if (!valid.ok) return { ok: false, error: valid.error };
  // a title the palettes' colors contradict is not kept for later; the palettes are
  const sent = Array.isArray(payload.texts) ? payload.texts.map(paletteTextInput) : [];
  const texts = checkTexts(sent.filter((text): text is PaletteTextInput => text !== null)).held;
  const { title, description, tags, visibility, items } = valid.input;
  return {
    ok: true,
    item: {
      kind,
      actor: null,
      dueAt,
      payload: {
        slug,
        title,
        description,
        tags,
        visibility,
        items,
        ...(texts.length ? { texts } : {})
      }
    }
  };
}

/** An item's key: a hash of what it is, so the same item planned twice is queued once. */
async function keyOf(item: QueueInput): Promise<string> {
  const text = JSON.stringify([SITE_AGENT, item.kind, item.actor, item.dueAt, item.payload]);
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  );
  return `h:${Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** Queues items under a label. An item the queue holds already is not queued again (`existing`). */
export async function enqueue(
  env: Pick<Env, "DB">,
  label: string,
  items: readonly QueueInput[]
): Promise<{ queued: number; existing: number }> {
  const now = Date.now();
  let queued = 0;
  for (let at = 0; at < items.length; at += 50) {
    const part = items.slice(at, at + 50);
    const keys = await Promise.all(part.map(keyOf));
    const results = await batch(
      env.DB,
      part.map(
        (item, i): Statement => [
          `INSERT INTO k_queue (id, key, agent, kind, actor, payload, label, due_at, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'due', ?) ON CONFLICT(key) DO NOTHING`,
          newId(),
          keys[i]!,
          SITE_AGENT,
          item.kind,
          item.actor,
          JSON.stringify(item.payload),
          label,
          item.dueAt,
          now
        ]
      )
    );
    queued += results.filter(result => result.meta.changes).length;
  }
  return { queued, existing: items.length - queued };
}

interface QueueRow {
  id: string;
  kind: QueueKind;
  actor: string | null;
  payload: string;
  label: string;
  due_at: number;
  status: QueueStatus;
  result: string | null;
}
const parse = (text: string | null): unknown => {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};
const itemOf = (row: QueueRow): QueueItem => ({
  id: row.id,
  kind: row.kind,
  actor: row.actor,
  payload: (parse(row.payload) as Record<string, unknown> | null) ?? {},
  label: row.label,
  dueAt: Number(row.due_at),
  status: row.status,
  result: parse(row.result)
});

/** The queue's items, soonest first. */
export async function listQueue(
  env: Pick<Env, "DB">,
  query: {
    status: readonly QueueStatus[];
    kind?: QueueKind;
    label?: string;
    from?: number;
    to?: number;
    limit: number;
  }
): Promise<QueueItem[]> {
  const where = ["agent = ?", "status IN (SELECT value FROM json_each(?))"];
  const bind: (string | number)[] = [SITE_AGENT, JSON.stringify(query.status)];
  if (query.kind) {
    where.push("kind = ?");
    bind.push(query.kind);
  }
  if (query.label) {
    where.push("label = ?");
    bind.push(query.label);
  }
  if (query.from !== undefined) {
    where.push("due_at >= ?");
    bind.push(query.from);
  }
  if (query.to !== undefined) {
    where.push("due_at <= ?");
    bind.push(query.to);
  }
  const rows = await all<QueueRow>(
    env.DB,
    `SELECT id, kind, actor, payload, label, due_at, status, result FROM k_queue WHERE ${where.join(" AND ")}
     ORDER BY due_at, id LIMIT ?`,
    ...bind,
    Math.max(1, Math.min(LIST_MAX, Math.floor(query.limit)))
  );
  return rows.map(itemOf);
}

/** The plan in numbers: by status and kind, the next and the last due, and by week (from Monday, UTC). */
export async function queueSummary(env: Pick<Env, "DB">) {
  const [groups, weeks] = await Promise.all([
    all<{
      status: QueueStatus;
      kind: QueueKind;
      n: number;
      next_due: number | null;
      last_due: number | null;
    }>(
      env.DB,
      `SELECT status, kind, COUNT(*) AS n, MIN(CASE WHEN status = 'due' THEN due_at END) AS next_due,
         MAX(CASE WHEN status IN ('due', 'running') THEN due_at END) AS last_due
       FROM k_queue WHERE agent = ? GROUP BY status, kind`,
      SITE_AGENT
    ),
    all<{
      week: string;
      due: number;
      done: number;
      failed: number;
      likes: number;
      collections: number;
    }>(
      env.DB,
      `SELECT date(due_at / 1000, 'unixepoch', '-6 days', 'weekday 1') AS week,
         SUM(status IN ('due', 'running')) AS due, SUM(status = 'done') AS done, SUM(status = 'failed') AS failed,
         SUM(status != 'cancelled' AND kind = 'like') AS likes,
         SUM(status != 'cancelled' AND kind = 'collection') AS collections
       FROM k_queue WHERE agent = ? GROUP BY week ORDER BY week`,
      SITE_AGENT
    )
  ]);
  const byStatus: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  let nextDue: number | null = null;
  let lastDue: number | null = null;
  for (const group of groups) {
    byStatus[group.status] = (byStatus[group.status] ?? 0) + Number(group.n);
    byKind[group.kind] = (byKind[group.kind] ?? 0) + Number(group.n);
    if (group.next_due !== null) nextDue = Math.min(nextDue ?? Infinity, Number(group.next_due));
    if (group.last_due !== null) lastDue = Math.max(lastDue ?? -Infinity, Number(group.last_due));
  }
  return {
    byStatus,
    byKind,
    nextDue,
    lastDue,
    weeks: weeks.map(week => ({
      week: week.week,
      due: Number(week.due),
      done: Number(week.done),
      failed: Number(week.failed),
      likes: Number(week.likes),
      collections: Number(week.collections)
    }))
  };
}

/** Takes due items out of the plan, by id or by the label they were planned under. */
export async function cancelQueue(
  env: Pick<Env, "DB">,
  target: { ids: readonly string[]; label?: string }
): Promise<number> {
  const now = Date.now();
  let cancelled = 0;
  if (target.label) {
    const result = await run(
      env.DB,
      "UPDATE k_queue SET status = 'cancelled', done_at = ? WHERE agent = ? AND status = 'due' AND label = ?",
      now,
      SITE_AGENT,
      target.label
    );
    cancelled += Number(result.changes) || 0;
  }
  if (target.ids.length) {
    const result = await run(
      env.DB,
      `UPDATE k_queue SET status = 'cancelled', done_at = ?
       WHERE agent = ? AND status = 'due' AND id IN (SELECT value FROM json_each(?))`,
      now,
      SITE_AGENT,
      JSON.stringify(target.ids)
    );
    cancelled += Number(result.changes) || 0;
  }
  return cancelled;
}

/** Of these palettes, the ones an admin took out of anything or edited into another: never liked, never added. */
export async function removedSeeds(
  env: Pick<Env, "DB">,
  seeds: readonly string[]
): Promise<Set<string>> {
  if (!seeds.length) return new Set();
  const rows = await all<{ seed: string }>(
    env.DB,
    `SELECT DISTINCT seed FROM k_admin_actions WHERE action IN ('remove', 'delete', 'edit')
     AND seed IN (SELECT value FROM json_each(?))`,
    JSON.stringify([...new Set(seeds)])
  );
  return new Set(rows.map(row => row.seed));
}

/** An item the queue's own rules refuse: applying it again would refuse it again, so it fails at once. Anything else
    that goes wrong (the database away for a moment) is not the item's doing, and it is tried again later. */
class Refusal extends Error {}

async function applyLike(env: Pick<Env, "DB">, item: QueueItem) {
  const palette = collectionItem(item.payload);
  if (!palette) throw new Refusal("The payload is not a palette.");
  if ((await removedSeeds(env, [palette.seed])).size)
    throw new Refusal("The admin took this palette out; it stays out.");
  const held = await first(
    env.DB,
    `SELECT 1 AS n FROM k_palettes WHERE seed = ?1 UNION SELECT 1 FROM k_collection_items i
     JOIN k_collections c ON c.id = i.collection_id WHERE i.seed = ?1 AND c.visibility = 'public' LIMIT 1`,
    palette.seed
  );
  if (!held)
    throw new Refusal(
      "The site does not hold this palette: not in the gallery, not in a public collection."
    );
  // the same writes as a reader's like: a persona's like locks nothing (the lock reads people's likes alone)
  const done = await setLike(
    env,
    { id: item.actor!, role: "user" },
    { ...palette, liked: true, via: "queue" }
  );
  return { seed: palette.seed, liked: done.change === "added", published: done.joined };
}

async function applyCollection(env: Pick<Env, "DB">, item: QueueItem) {
  const slug = item.payload.slug;
  if (typeof slug !== "string" || !isCollectionSlug(slug))
    throw new Refusal("The payload names no collection.");
  const valid = validateCollection({ visibility: "public", ...item.payload });
  if (!valid.ok) throw new Refusal(valid.error);
  const removed = await removedSeeds(
    env,
    valid.input.items.map(entry => entry.seed)
  );
  const items: CollectionItemInput[] = valid.input.items.filter(entry => !removed.has(entry.seed));
  const record = await collectionRecord(env, slug);
  if (record && (record.owner.kind !== "agent" || record.owner.id !== SITE_AGENT))
    throw new Refusal("The slug belongs to someone else.");
  let status: "created" | "updated";
  let added: number;
  let held: number;
  if (record) {
    ({ added, held } = await appendCollectionItems(env, record.id, items));
    status = "updated";
  } else {
    if (!items.length) throw new Refusal("Nothing to add: every palette is on the admin's record.");
    try {
      await createCollection(
        env,
        { kind: "agent", id: SITE_AGENT },
        { ...valid.input, items: items.slice(0, MAX_COLLECTION_ITEMS) },
        { slug }
      );
    } catch (error) {
      if (error instanceof SlugTaken)
        throw new Refusal("The slug was taken while the item waited.");
      throw error;
    }
    status = "created";
    added = Math.min(items.length, MAX_COLLECTION_ITEMS);
    held = 0;
  }
  // checked again as it is applied: a title queued under an older check still has to hold
  const sent = Array.isArray(item.payload.texts) ? item.payload.texts.map(paletteTextInput) : [];
  const { held: texts, refused } = checkTexts(
    sent.filter((text): text is PaletteTextInput => text !== null && !removed.has(text.seed))
  );
  const written = await upsertPaletteTexts(env, SITE_AGENT, texts);
  return {
    slug,
    status,
    added,
    held,
    skipped: [...removed],
    texts: written,
    ...(refused.length ? { untitled: refused } : {})
  };
}

export interface QueueReport {
  claimed: number;
  done: number;
  failed: number;
  retried: number;
  items: { id: string; kind: QueueKind; status: "done" | "failed" | "retried"; result: unknown }[];
}

/** One pass of the ten-minute job: what is due, claimed one by one so two passes never apply the same item, applied,
    and written back. The job recomputes the hot scores when any item was done. */
export async function applyQueue(
  env: Pick<Env, "DB">,
  now = Date.now(),
  limit = APPLY_LIMIT
): Promise<QueueReport> {
  const report: QueueReport = { claimed: 0, done: 0, failed: 0, retried: 0, items: [] };
  await run(
    env.DB,
    "UPDATE k_queue SET status = 'due', started_at = NULL WHERE status = 'running' AND started_at < ?",
    now - STALE_RUNNING_MS
  );
  const rows = await all<QueueRow>(
    env.DB,
    `SELECT id, kind, actor, payload, label, due_at, status, result FROM k_queue
     WHERE status = 'due' AND due_at <= ? ORDER BY due_at, id LIMIT ?`,
    now,
    limit
  );
  if (!rows.length) return report;
  const personas = await personaIds(env);
  for (const row of rows) {
    const claim = await run(
      env.DB,
      "UPDATE k_queue SET status = 'running', started_at = ? WHERE id = ? AND status = 'due'",
      now,
      row.id
    );
    if (!claim.changes) continue;
    report.claimed++;
    const item = itemOf(row);
    let result: unknown;
    let status: "done" | "failed";
    try {
      if (item.kind === "like" && (!item.actor || !personas.has(item.actor)))
        throw new Refusal("The actor is no persona.");
      result = item.kind === "like" ? await applyLike(env, item) : await applyCollection(env, item);
      status = "done";
    } catch (error) {
      const attempts = (Number((item.result as { attempts?: unknown } | null)?.attempts) || 0) + 1;
      result = { error: error instanceof Error ? error.message : String(error), attempts };
      // an apply is idempotent, so an item the database let down is due again later instead of failed for good
      if (!(error instanceof Refusal) && attempts < ATTEMPTS) {
        await run(
          env.DB,
          "UPDATE k_queue SET status = 'due', started_at = NULL, due_at = ?, result = ? WHERE id = ?",
          Date.now() + attempts * RETRY_MS,
          JSON.stringify(result),
          row.id
        );
        report.retried++;
        report.items.push({ id: row.id, kind: item.kind, status: "retried", result });
        continue;
      }
      status = "failed";
    }
    await run(
      env.DB,
      "UPDATE k_queue SET status = ?, result = ?, done_at = ? WHERE id = ?",
      status,
      JSON.stringify(result),
      Date.now(),
      row.id
    );
    report[status]++;
    report.items.push({ id: row.id, kind: item.kind, status, result });
  }
  return report;
}
