import { all } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { curationReasons } from "@grabient/ui/curation.ts";
import type { AdminActionKind } from "../../collections/record.ts";

/* The admins' record as their tools read it. The collections area writes it (collections/record.ts), from the site's
   own pages and from these tools alike: each row keeps the state it changed as it was and as it became, and names the
   collection by its address and title at the time, since the row outlives it. The seeding queue reads removals as
   "keep it out" (queue.ts removedSeeds). Never pruned. */

/** Every kind of action the record holds, as a call may ask for them. */
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
] as const satisfies readonly AdminActionKind[];

export interface RecordedAction {
  action: AdminActionKind;
  seed: string | null;
  /** the collection's address when the action was taken */
  slug: string | null;
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

/** The record, newest first. */
export async function listActions(
  env: Pick<Env, "DB">,
  query: {
    since?: number;
    limit: number;
    seed?: string;
    slug?: string;
    kinds?: readonly AdminActionKind[];
  }
): Promise<RecordedAction[]> {
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
  const rows = await all<{
    action: AdminActionKind;
    seed: string | null;
    slug: string | null;
    before: string | null;
    after: string | null;
    reasons: string;
    comment: string;
    created_at: number;
    username: string | null;
    name: string | null;
  }>(
    env.DB,
    `SELECT a.action, a.seed, a.slug, a.before, a.after, a.reasons, a.comment, a.created_at, u.username, u.name
     FROM k_admin_actions a LEFT JOIN auth_user u ON u.id = a.actor_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY a.created_at DESC, a.id LIMIT ?`,
    ...bind,
    query.limit
  );
  return rows.map(row => ({
    action: row.action,
    seed: row.seed,
    slug: row.slug,
    before: parse(row.before),
    after: parse(row.after),
    reasons: curationReasons(parse(row.reasons)),
    comment: row.comment ?? "",
    createdAt: Number(row.created_at),
    actor: actorName(row.name, row.username)
  }));
}
