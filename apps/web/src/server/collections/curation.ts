import { all, batch, type Param, type Statement } from "@grabient/server/db/d1.ts";
import { itemKey } from "../../features/collections/address.ts";
import {
  type CollectionItemInput,
  MAX_COLLECTION_ITEMS
} from "../../features/collections/schema.ts";
import { forgetTitles } from "./search.ts";
import type { Membership } from "./tokens.ts";

/* One palette in or out of a collection: the owner's own, or an admin's on one of Grabient's. Who may is checked in the
   write itself, never only before it, so a role taken away between the read and the write changes nothing. A removal
   keeps every other row as it was and counts what remains; a membership already gone is a quiet success. */

type Writer = { DB: D1Database };

/** Who may change a collection's palettes, as a condition on its row: each binds the collection's id, then the
    account's. An admin on one of Grabient's, or the account that owns it. */
export type Allowed = "curator" | "owner";
const ALLOWED: Record<Allowed, string> = {
  curator: `id = ? AND owner_kind = 'agent' AND EXISTS (SELECT 1 FROM auth_user WHERE id = ? AND role = 'admin')`,
  owner: `id = ? AND owner_kind = 'user' AND owner_id = ?`
};

/** A palette's view, naming one item where a collection holds the palette in several. */
export interface View {
  style: string;
  steps: number;
  angle: number;
}
const viewWhere = (view?: View) => (view ? " AND style = ? AND steps = ? AND angle = ?" : "");
const viewBinds = (view?: View): Param[] => (view ? [view.style, view.steps, view.angle] : []);
const recount = (allowed: string): string =>
  `UPDATE k_collections SET item_count = (SELECT COUNT(*) FROM k_collection_items WHERE collection_id = ?), updated_at = ?
   WHERE changes() > 0 AND ${allowed}`;

/** Takes a palette out, in `view` alone or every view of it: false `allowed` when the account may not, and the
    membership as it stood (the first, where several views went) when one went. */
export async function removeMembership(
  env: Writer,
  who: Allowed,
  id: string,
  seed: string,
  accountId: string,
  view?: View
): Promise<{ allowed: boolean; removed: Membership | null }> {
  const allowed = ALLOWED[who];
  const results = await batch(env.DB, [
    [
      `SELECT seed, style, steps, angle, position, created_at AS createdAt FROM k_collection_items
       WHERE collection_id = ? AND seed = ?${viewWhere(view)} AND EXISTS (SELECT 1 FROM k_collections WHERE ${allowed})
       ORDER BY position`,
      id,
      seed,
      ...viewBinds(view),
      id,
      accountId
    ],
    [
      `DELETE FROM k_collection_items WHERE collection_id = ? AND seed = ?${viewWhere(view)}
       AND EXISTS (SELECT 1 FROM k_collections WHERE ${allowed})`,
      id,
      seed,
      ...viewBinds(view),
      id,
      accountId
    ],
    [recount(allowed), id, Date.now(), id, accountId],
    [`SELECT 1 AS allowed FROM k_collections WHERE ${allowed}`, id, accountId]
  ]);
  const deleted = (results[1]?.meta.changes ?? 0) > 0;
  if (deleted) forgetTitles();
  const row = deleted ? (results[0]?.results[0] as Membership | undefined) : undefined;
  return {
    allowed: (results[3]?.results.length ?? 0) > 0,
    removed: row
      ? {
          seed: row.seed,
          style: row.style,
          steps: Number(row.steps),
          angle: Number(row.angle),
          position: Number(row.position),
          createdAt: row.createdAt == null ? null : Number(row.createdAt)
        }
      : null
  };
}

/** Puts a membership back as it stood: its place, its view and the time it joined. A collection that holds it again
    stays as it is (`present`), and one that is full refuses it (`full`). */
export async function restoreMembership(
  env: Writer,
  who: Allowed,
  id: string,
  row: Membership,
  accountId: string
): Promise<{ allowed: boolean; present: boolean; full: boolean }> {
  const allowed = ALLOWED[who];
  const results = await batch(env.DB, [
    [
      `INSERT INTO k_collection_items (collection_id, position, seed, style, steps, angle, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM k_collections WHERE ${allowed})
         AND (SELECT COUNT(*) FROM k_collection_items WHERE collection_id = ?) < ?
       ON CONFLICT (collection_id, seed, style, steps, angle) DO NOTHING`,
      id,
      row.position,
      row.seed,
      row.style,
      row.steps,
      row.angle,
      row.createdAt,
      id,
      accountId,
      id,
      MAX_COLLECTION_ITEMS
    ],
    [recount(allowed), id, Date.now(), id, accountId],
    [
      `SELECT (SELECT COUNT(*) FROM k_collection_items WHERE collection_id = ? AND seed = ? AND style = ? AND steps = ?
         AND angle = ?) AS present, (SELECT COUNT(*) FROM k_collection_items WHERE collection_id = ?) AS held
       FROM k_collections WHERE ${allowed}`,
      id,
      row.seed,
      row.style,
      row.steps,
      row.angle,
      id,
      id,
      accountId
    ]
  ]);
  if ((results[0]?.meta.changes ?? 0) > 0) forgetTitles();
  const answer = results[2]?.results[0] as { present?: number; held?: number } | undefined;
  const present = Number(answer?.present) > 0;
  return {
    allowed: !!answer,
    present,
    full: !!answer && !present && Number(answer.held) >= MAX_COLLECTION_ITEMS
  };
}

/** An admin puts palettes into one of Grabient's collections by hand, as a person adds to their own: each view of a
    palette once, after the ones it holds; past the collection's size the whole add is refused. Answers the memberships
    it made, which an undo takes out again. */
export async function addSitePalettes(
  env: Writer,
  id: string,
  items: readonly CollectionItemInput[],
  adminId: string
): Promise<{ allowed: boolean; full: boolean; added: Membership[] }> {
  const rows = await all<{
    seed: string;
    style: string;
    steps: number;
    angle: number;
    position: number;
  }>(
    env.DB,
    "SELECT seed, style, steps, angle, position FROM k_collection_items WHERE collection_id = ?",
    id
  );
  const held = new Set(rows.map(row => itemKey(row)));
  const additions = items.filter(item => !held.has(itemKey(item)) && held.add(itemKey(item)));
  if (rows.length + additions.length > MAX_COLLECTION_ITEMS)
    return { allowed: true, full: true, added: [] };
  let position = rows.reduce((last, row) => Math.max(last, Number(row.position)), -1);
  const now = Date.now();
  const made: Membership[] = additions.map(item => ({
    seed: item.seed,
    style: item.style,
    steps: item.steps,
    angle: item.angle,
    position: ++position,
    createdAt: now
  }));
  const results = await batch(env.DB, [
    ...made.map(
      (row): Statement => [
        `INSERT INTO k_collection_items (collection_id, position, seed, style, steps, angle, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM k_collections WHERE ${ALLOWED.curator})
         ON CONFLICT (collection_id, seed, style, steps, angle) DO NOTHING`,
        id,
        row.position,
        row.seed,
        row.style,
        row.steps,
        row.angle,
        now,
        id,
        adminId
      ]
    ),
    [
      `UPDATE k_collections SET item_count = (SELECT COUNT(*) FROM k_collection_items WHERE collection_id = ?),
         updated_at = ? WHERE ${ALLOWED.curator}`,
      id,
      now,
      id,
      adminId
    ]
  ]);
  const added = made.filter((_, i) => (results[i]?.meta.changes ?? 0) > 0);
  if (added.length) forgetTitles();
  return { allowed: (results.at(-1)?.meta.changes ?? 0) > 0, full: false, added };
}

/** The undo of an admin's add: the membership goes while it is still the one the add made, its view and its time.
    Nothing was curated, so nothing goes on the record. False when the admin may not. */
export async function unaddSitePalette(
  env: Writer,
  id: string,
  row: Membership,
  adminId: string
): Promise<boolean> {
  const results = await batch(env.DB, [
    [
      `DELETE FROM k_collection_items WHERE collection_id = ? AND seed = ? AND style = ? AND steps = ? AND angle = ?
       AND created_at IS ? AND EXISTS (SELECT 1 FROM k_collections WHERE ${ALLOWED.curator})`,
      id,
      row.seed,
      row.style,
      row.steps,
      row.angle,
      row.createdAt,
      id,
      adminId
    ],
    [recount(ALLOWED.curator), id, Date.now(), id, adminId],
    [`SELECT 1 AS allowed FROM k_collections WHERE ${ALLOWED.curator}`, id, adminId]
  ]);
  if ((results[0]?.meta.changes ?? 0) > 0) forgetTitles();
  return (results[2]?.results.length ?? 0) > 0;
}

/** Draws one palette of one of Grabient's collections another way, keeping its place and the time it joined. `from`
    names the item where the collection holds the palette in several views. False when the collection does not hold it,
    holds it in that view already, or the admin may not. */
export async function setSitePaletteView(
  env: Writer,
  id: string,
  seed: string,
  view: View,
  adminId: string,
  from?: View
): Promise<boolean> {
  const results = await batch(env.DB, [
    [
      `UPDATE OR IGNORE k_collection_items SET style = ?, steps = ?, angle = ? WHERE collection_id = ? AND seed = ?${viewWhere(from)}
       AND EXISTS (SELECT 1 FROM k_collections WHERE ${ALLOWED.curator})`,
      view.style,
      view.steps,
      view.angle,
      id,
      seed,
      ...viewBinds(from),
      id,
      adminId
    ],
    [
      `UPDATE k_collections SET updated_at = ? WHERE changes() > 0 AND ${ALLOWED.curator}`,
      Date.now(),
      id,
      adminId
    ]
  ]);
  const changed = (results[0]?.meta.changes ?? 0) > 0;
  if (changed) forgetTitles();
  return changed;
}

/** Of these palettes, the ones a person liked: an account that is none of the seeding agents' personas and not
    `except` (the admin asking, whose own likes the page knows), or grabient.com's readers, whose likes came over as a
    count. An admin never changes one of these. One query for each 96, as one JSON list. */
export async function likedByPeople(
  env: { DB: D1Database | D1DatabaseSession },
  seeds: readonly string[],
  except?: string
): Promise<Set<string>> {
  const liked = new Set<string>();
  for (let at = 0; at < seeds.length; at += 96) {
    const asked = JSON.stringify(seeds.slice(at, at + 96));
    const rows = await all<{ seed: string }>(
      env.DB,
      `SELECT seed FROM k_palettes WHERE seed IN (SELECT value FROM json_each(?)) AND legacy_likes_count > 0
       UNION SELECT palette_id AS seed FROM k_likes WHERE palette_id IN (SELECT value FROM json_each(?))
       AND user_id NOT IN (SELECT user_id FROM k_personas)${except ? " AND user_id <> ?" : ""}`,
      asked,
      asked,
      ...(except ? [except] : [])
    );
    for (const row of rows) liked.add(row.seed);
  }
  return liked;
}
