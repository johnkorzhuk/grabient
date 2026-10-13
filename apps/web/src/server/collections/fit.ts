import { all, first, run } from "@grabient/server/db/d1.ts";
import type { FitVote } from "../../features/collections/schema.ts";
import type { PaletteFit } from "../../features/collections/types.ts";
import type { Reader } from "./read.ts";

/* Whether a palette fits the collection it is in: one vote per account per palette per collection, up or down. An
   admin's down slates the palette for the next seeding run, and five votes or more, two thirds of them down, mark it
   unfit; the search leaves both out of that collection. No count is shown to readers: the crowd's is the agents'. */

const FIT_MIN_VOTES = 5;
const FIT_DOWN_SHARE = 2 / 3;

export const fitOf = (up: number, down: number, adminDown: number): PaletteFit => ({
  up,
  down,
  slated: adminDown > 0,
  unfit: up + down >= FIT_MIN_VOTES && down >= FIT_DOWN_SHARE * (up + down)
});

const COUNTS = `SUM(CASE WHEN v.vote = 1 THEN 1 ELSE 0 END) AS up, SUM(CASE WHEN v.vote = -1 THEN 1 ELSE 0 END) AS down,
  SUM(CASE WHEN v.vote = -1 AND u.role = 'admin' THEN 1 ELSE 0 END) AS admin_down`;
interface Counts {
  up: number | null;
  down: number | null;
  admin_down: number | null;
}
const fitFrom = (row: Counts | null | undefined) =>
  fitOf(Number(row?.up) || 0, Number(row?.down) || 0, Number(row?.admin_down) || 0);

/** One account's word on one palette in one collection: up, down, or null to take it back. What readers now say of the
    palette's fit, or null when the collection does not hold the palette. */
export async function castFitVote(
  env: { DB: D1Database },
  collectionId: string,
  seed: string,
  userId: string,
  vote: FitVote | null
): Promise<PaletteFit | null> {
  const held = await first(
    env.DB,
    "SELECT 1 AS yes FROM k_collection_items WHERE collection_id = ? AND seed = ?",
    collectionId,
    seed
  );
  if (!held) return null;
  const now = Date.now();
  if (vote === null)
    await run(
      env.DB,
      "DELETE FROM k_collection_votes WHERE collection_id = ? AND seed = ? AND user_id = ?",
      collectionId,
      seed,
      userId
    );
  else
    await run(
      env.DB,
      `INSERT INTO k_collection_votes (collection_id, seed, user_id, vote, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (collection_id, seed, user_id) DO UPDATE SET vote = excluded.vote, updated_at = excluded.updated_at`,
      collectionId,
      seed,
      userId,
      vote === "up" ? 1 : -1,
      now,
      now
    );
  return fitFrom(
    await first<Counts>(
      env.DB,
      `SELECT ${COUNTS} FROM k_collection_votes v LEFT JOIN auth_user u ON u.id = v.user_id
       WHERE v.collection_id = ? AND v.seed = ?`,
      collectionId,
      seed
    )
  );
}

/** The account's own votes on a collection's palettes, by seed. */
export async function ownFitVotes(
  env: Reader,
  collectionId: string,
  userId: string
): Promise<Record<string, FitVote>> {
  const rows = await all<{ seed: string; vote: number }>(
    env.DB,
    "SELECT seed, vote FROM k_collection_votes WHERE collection_id = ? AND user_id = ?",
    collectionId,
    userId
  );
  return Object.fromEntries(rows.map(row => [row.seed, row.vote === 1 ? "up" : "down"]));
}

/** The account's own votes on the palettes of several collections, by address and then by seed: a list's page of
    groups in one read, for the collections it may vote on, the public ones and its own. */
export async function ownFitVotesBySlug(
  env: Reader,
  slugs: readonly string[],
  userId: string
): Promise<Record<string, Record<string, FitVote>>> {
  const out: Record<string, Record<string, FitVote>> = {};
  if (!slugs.length) return out;
  const rows = await all<{ slug: string; seed: string; vote: number }>(
    env.DB,
    `SELECT c.slug, v.seed, v.vote FROM k_collections c JOIN k_collection_votes v ON v.collection_id = c.id
     WHERE c.slug IN (SELECT value FROM json_each(?)) AND v.user_id = ?
       AND (c.visibility = 'public' OR (c.owner_kind = 'user' AND c.owner_id = ?))`,
    JSON.stringify(slugs),
    userId,
    userId
  );
  for (const row of rows) {
    out[row.slug] ??= {};
    out[row.slug]![row.seed] = row.vote === 1 ? "up" : "down";
  }
  return out;
}

/** What readers said of each palette of a collection, by seed: the admins' tools and the search's snapshot read it. */
export async function itemFits(
  env: Reader,
  collectionId: string
): Promise<Map<string, PaletteFit>> {
  const rows = await all<Counts & { seed: string }>(
    env.DB,
    `SELECT v.seed, ${COUNTS} FROM k_collection_votes v LEFT JOIN auth_user u ON u.id = v.user_id
     WHERE v.collection_id = ? GROUP BY v.seed`,
    collectionId
  );
  return new Map(rows.map(row => [row.seed, fitFrom(row)]));
}
