import { msg } from "@grabient/i18n";
import { all, run } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { newId } from "../site.ts";

/* The admins' record (k_admin_actions): every action an admin takes on a palette or a collection, from the site's own
   pages or a connected app. Each row keeps the state it changed as it was and as it became, so a view change says what
   a palette moved from and to; the collection is named by its id, slug and title at the time, since the row outlives
   it. The seeding queue reads removals as "keep it out" (queue.ts removedSeeds). Never pruned. */

export const ADMIN_ACTION_KINDS = [
  // a palette taken out of one collection
  "remove",
  // a palette deleted from the gallery, and from Grabient's collections that held it when the scope said so
  "delete",
  // a palette's style, steps or angle changed, in a collection or in the gallery
  "view",
  // a palette saved over by an edited one: `after.seed` is the palette it became
  "edit",
  "collection.delete",
  "collection.visibility",
  // an admin's fit vote, which is a ruling
  "vote",
  // a note left for the agents
  "note"
] as const;
export type AdminActionKind = (typeof ADMIN_ACTION_KINDS)[number];

/** The faults an admin can name when taking a palette out or redrawing it: a word for a chip and the line its tooltip
    shows, which the agents read too. English here for the agents and the record; a page translates them. */
export const CURATION_REASONS = [
  { key: "muddy", label: msg("Muddy"), hint: msg("Gray or brown through the middle") },
  { key: "banding", label: msg("Banding"), hint: msg("Hard steps where a blend was meant") },
  { key: "dull", label: msg("Dull"), hint: msg("Flat, with little color or change") },
  { key: "harsh", label: msg("Harsh"), hint: msg("Glaring, clipped or too neon") },
  { key: "dark", label: msg("Too dark"), hint: msg("Mostly near black") },
  { key: "light", label: msg("Too light"), hint: msg("Mostly near white") },
  { key: "ugly", label: msg("Ugly turn"), hint: msg("Passes through a color that spoils it") },
  { key: "alike", label: msg("Looks alike"), hint: msg("Too close to another palette here") },
  { key: "off", label: msg("Off title"), hint: msg("Doesn't fit the collection") },
  { key: "form", label: msg("Wrong form"), hint: msg("Wrong style, steps or angle") }
] as const;
export const CURATION_COMMENT_MAX = 500;

/** The reasons sent, kept to the list and in its order, each once. */
export const curationReasons = (value: unknown): string[] =>
  Array.isArray(value)
    ? CURATION_REASONS.map(reason => reason.key).filter(key => value.includes(key))
    : [];

export interface Why {
  reasons: string[];
  comment: string;
}
const cleanComment = (value: unknown): string =>
  typeof value === "string"
    ? value
        .normalize("NFKC")
        .replace(/\p{Cc}/gu, " ")
        .replace(/\s+/gu, " ")
        .trim()
        .slice(0, CURATION_COMMENT_MAX)
    : "";
/** The reasons and the comment of a request, bounded. Absent is fine. */
export const parseWhy = (body: Record<string, unknown> | null | undefined): Why => ({
  reasons: curationReasons(body?.reasons),
  comment: cleanComment(body?.comment)
});

export interface AdminActionInput {
  actorId: string;
  action: AdminActionKind;
  seed?: string | null;
  collection?: { id: string; slug: string; title: string } | null;
  before?: unknown;
  after?: unknown;
  why?: Partial<Why> | null;
}

export async function recordAction(env: Pick<Env, "DB">, input: AdminActionInput): Promise<string> {
  const id = newId();
  await run(
    env.DB,
    `INSERT INTO k_admin_actions (id, actor_id, action, seed, collection_id, slug, title, before, after, reasons, comment,
       created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.actorId,
    input.action,
    input.seed ?? null,
    input.collection?.id ?? null,
    input.collection?.slug ?? null,
    input.collection?.title ?? null,
    input.before === undefined ? null : JSON.stringify(input.before),
    input.after === undefined ? null : JSON.stringify(input.after),
    JSON.stringify(curationReasons(input.why?.reasons)),
    cleanComment(input.why?.comment),
    Date.now()
  );
  return id;
}

/** An admin's removal taken back by its undo: the row goes, so the record says what stands. Only the admin's own
    removal of that palette. */
export async function forgetRemoval(
  env: Pick<Env, "DB">,
  id: string,
  actorId: string,
  seed: string
) {
  await run(
    env.DB,
    "DELETE FROM k_admin_actions WHERE id = ? AND actor_id = ? AND action = 'remove' AND seed = ?",
    id,
    actorId,
    seed
  );
}

export interface AdminAction {
  id: string;
  action: AdminActionKind;
  seed: string | null;
  slug: string | null;
  title: string | null;
  /** the collection still exists under that id */
  held: boolean;
  before: unknown;
  after: unknown;
  reasons: string[];
  comment: string;
  createdAt: number;
  /** who, as the record names accounts */
  actor: string;
}

const parse = (raw: string | null): unknown => {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};
/** An account as the record names it: its name, else its username, else Admin. */
export const actorName = (name: string | null, username: string | null) =>
  name?.trim() || (username ? `@${username}` : "Admin");

const ACTIONS_MAX = 2000;

/** The record, newest first. */
export async function listActions(
  env: Pick<Env, "DB">,
  query: {
    since?: number;
    limit?: number;
    seed?: string;
    slug?: string;
    kinds?: readonly AdminActionKind[];
  } = {}
): Promise<AdminAction[]> {
  const where: string[] = [];
  const bind: (string | number)[] = [];
  if (query.since) {
    where.push("a.created_at > ?");
    bind.push(Math.floor(query.since));
  }
  if (query.seed) {
    where.push("a.seed = ?");
    bind.push(query.seed);
  }
  if (query.slug) {
    where.push("a.slug = ?");
    bind.push(query.slug);
  }
  if (query.kinds?.length) {
    where.push("a.action IN (SELECT value FROM json_each(?))");
    bind.push(JSON.stringify(query.kinds));
  }
  const limit = Math.max(1, Math.min(ACTIONS_MAX, Math.floor(query.limit ?? 500)));
  const rows = await all<{
    id: string;
    action: AdminActionKind;
    seed: string | null;
    slug: string | null;
    title: string | null;
    before: string | null;
    after: string | null;
    reasons: string;
    comment: string;
    created_at: number;
    username: string | null;
    name: string | null;
    held: number;
  }>(
    env.DB,
    `SELECT a.id, a.action, a.seed, a.slug, a.title, a.before, a.after, a.reasons, a.comment, a.created_at,
       u.username, u.name, EXISTS (SELECT 1 FROM k_collections c WHERE c.id = a.collection_id) AS held
     FROM k_admin_actions a LEFT JOIN auth_user u ON u.id = a.actor_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY a.created_at DESC, a.id LIMIT ?`,
    ...bind,
    limit
  );
  return rows.map(row => ({
    id: row.id,
    action: row.action,
    seed: row.seed,
    slug: row.slug,
    title: row.title,
    held: Boolean(row.held),
    before: parse(row.before),
    after: parse(row.after),
    reasons: curationReasons(parse(row.reasons)),
    comment: row.comment ?? "",
    createdAt: Number(row.created_at),
    actor: actorName(row.name, row.username)
  }));
}

/** The view fields of a request, each valid when given: what an admin sends to change how a palette is drawn. */
export function viewPatch<T extends { style: string; steps: number; angle: number }>(
  body: Record<string, unknown> | null,
  current: T
): { view: T; changed: boolean } | null {
  if (!body) return null;
  const next = { ...current };
  if (body.style !== undefined) {
    if (typeof body.style !== "string") return null;
    next.style = body.style;
  }
  if (body.steps !== undefined) {
    if (!Number.isInteger(body.steps)) return null;
    next.steps = Number(body.steps);
  }
  if (body.angle !== undefined) {
    if (!Number.isInteger(body.angle)) return null;
    next.angle = Number(body.angle);
  }
  const changed =
    next.style !== current.style || next.steps !== current.steps || next.angle !== current.angle;
  return { view: next, changed };
}
