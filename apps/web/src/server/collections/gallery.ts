import { decodePalette } from "@grabient/engine";
import { STEPS_MIN, type Style } from "@grabient/engine/view.ts";
import { all, batch, first, type Statement } from "@grabient/server/db/d1.ts";
import type { CollectionItemInput } from "../../features/collections/schema.ts";
import { agentCollectionsHolding, type Reader } from "./read.ts";
import { forgetTitles } from "./search.ts";
import { LIKES_SUM } from "./write.ts";

/* An admin's curation of the gallery: a palette deleted, drawn another way, or saved over by an edit, in the gallery
   and in Grabient's own collections that hold it. Account collections are their owners' and are never touched. The
   admin role is checked again in every write, so a role taken away between the read and the write changes nothing. A
   palette any person liked is never changed: the routes refuse it before they write. */

type Writer = { DB: D1Database };
const ADMIN = "EXISTS (SELECT 1 FROM auth_user WHERE id = ? AND role = 'admin')";
const AGENTS = `owner_kind = 'agent' AND ${ADMIN}`;

export interface GalleryPalette extends CollectionItemInput {
  likes: number;
  createdAt: number;
}

/** One gallery palette as the gallery keeps it, or null. */
export async function galleryPalette(env: Reader, seed: string): Promise<GalleryPalette | null> {
  const row = await first<{
    seed: string;
    style: Style;
    steps: number;
    angle: number;
    likes_count: number;
    created_at: number;
  }>(
    env.DB,
    "SELECT seed, style, steps, angle, likes_count, created_at FROM k_palettes WHERE seed = ?",
    seed
  );
  return row
    ? {
        seed: row.seed,
        style: row.style,
        steps: Number(row.steps),
        angle: Number(row.angle),
        likes: Number(row.likes_count) || 0,
        createdAt: Number(row.created_at)
      }
    : null;
}

/** Where a palette stands for an admin: the gallery's row, and Grabient's collections that hold it. */
export interface PaletteStanding {
  gallery: GalleryPalette | null;
  collections: Awaited<ReturnType<typeof agentCollectionsHolding>>;
}
export async function paletteStanding(env: Reader, seed: string): Promise<PaletteStanding> {
  const [gallery, collections] = await Promise.all([
    galleryPalette(env, seed),
    agentCollectionsHolding(env, seed)
  ]);
  return { gallery, collections };
}

/** A palette out of the gallery: its row and every account's like of it. */
export async function deleteGalleryPalette(
  env: Writer,
  seed: string,
  adminId: string
): Promise<boolean> {
  const [, deleted] = await batch(env.DB, [
    [`DELETE FROM k_likes WHERE palette_id = ? AND ${ADMIN}`, seed, adminId],
    [`DELETE FROM k_palettes WHERE seed = ? AND ${ADMIN}`, seed, adminId]
  ]);
  return (deleted?.meta.changes ?? 0) > 0;
}

/** The gallery draws a palette another way. */
export async function setGalleryPaletteView(
  env: Writer,
  seed: string,
  view: Pick<CollectionItemInput, "style" | "steps" | "angle">,
  adminId: string
): Promise<boolean> {
  const [result] = await batch(env.DB, [
    [
      `UPDATE k_palettes SET style = ?, steps = ?, angle = ? WHERE seed = ? AND ${ADMIN}`,
      view.style,
      view.steps,
      view.angle,
      seed,
      adminId
    ]
  ]);
  return (result?.meta.changes ?? 0) > 0;
}

/** `to` takes the place of `from` wherever `from` stands (an admin's edit saved from the editor): in the gallery, where
    the new palette takes the old one's row, its date, its likes and its heat, and in each of Grabient's collections
    that holds it, at its place and in that collection's view, the steps raised to the new palette's keyframes. Its
    likes, its written words and the queue's plans for it move with it. Where `to` already stands, `from` leaves. One
    batch; false when the admin may not. `standing` is where `from` stood as the caller read it. */
export async function replacePalette(
  env: Writer,
  from: string,
  to: string,
  adminId: string,
  standing: PaletteStanding
): Promise<boolean> {
  const palette = decodePalette(to);
  if (!palette || from === to) return false;
  const floor = Math.max(STEPS_MIN, palette.anchors.length);
  const now = Date.now();
  const { gallery, collections: holding } = standing;
  const ids = holding.map(c => c.id);
  const [target, already] = await Promise.all([
    gallery ? galleryPalette(env, to) : null,
    ids.length
      ? all<{ id: string }>(
          env.DB,
          "SELECT DISTINCT collection_id AS id FROM k_collection_items WHERE seed = ? AND collection_id IN (SELECT value FROM json_each(?))",
          to,
          JSON.stringify(ids)
        )
      : []
  ]);
  const both = new Set(already.map(row => row.id));
  const statements: Statement[] = [[`SELECT 1 AS allowed WHERE ${ADMIN}`, adminId]];
  if (gallery) {
    statements.push(
      [
        `INSERT INTO k_palettes (seed, style, steps, angle, legacy_likes_count, likes_count, created_at, hot, rising,
           rising_3m, rising_1y)
         SELECT ?, style, MAX(steps, ?), angle, legacy_likes_count, likes_count, created_at, hot, rising, rising_3m,
           rising_1y FROM k_palettes WHERE seed = ? AND ${ADMIN} ON CONFLICT(seed) DO NOTHING`,
        to,
        floor,
        from,
        adminId
      ],
      // an account that liked both keeps its like of the new palette alone
      [
        `UPDATE OR IGNORE k_likes SET palette_id = ?, steps = MAX(steps, ?) WHERE palette_id = ? AND ${ADMIN}`,
        to,
        floor,
        from,
        adminId
      ],
      [`DELETE FROM k_likes WHERE palette_id = ? AND ${ADMIN}`, from, adminId]
    );
    if (target)
      statements.push([
        `UPDATE k_palettes SET likes_count = legacy_likes_count + (SELECT COUNT(*) FROM k_likes WHERE palette_id = ?)
         WHERE seed = ? AND ${ADMIN}`,
        to,
        to,
        adminId
      ]);
  }
  for (const id of ids) {
    /* each view moves to the new palette; two views that become one keep the first, and what could not move leaves */
    if (!both.has(id))
      statements.push([
        `UPDATE OR IGNORE k_collection_items SET seed = ?, steps = MAX(steps, ?) WHERE collection_id = ? AND seed = ?
         AND EXISTS (SELECT 1 FROM k_collections WHERE id = ? AND ${AGENTS})`,
        to,
        floor,
        id,
        from,
        id,
        adminId
      ]);
    statements.push(
      [
        `DELETE FROM k_collection_items WHERE collection_id = ? AND seed = ?
         AND EXISTS (SELECT 1 FROM k_collections WHERE id = ? AND ${AGENTS})`,
        id,
        from,
        id,
        adminId
      ],
      [
        `UPDATE k_collections SET item_count = (SELECT COUNT(*) FROM k_collection_items WHERE collection_id = ?),
         updated_at = ? WHERE id = ? AND ${AGENTS}`,
        id,
        now,
        id,
        adminId
      ]
    );
  }
  statements.push(
    [
      `INSERT INTO k_palette_texts (seed, title, embed, tags, agent, created_at, updated_at, embedded_at)
       SELECT ?, title, embed, tags, agent, created_at, ?, NULL FROM k_palette_texts WHERE seed = ? AND ${ADMIN}
       ON CONFLICT(seed) DO NOTHING`,
      to,
      now,
      from,
      adminId
    ],
    // what the agents planned for it (a persona's like, a place in a collection) lands on the palette it became
    [
      `UPDATE k_queue SET payload = REPLACE(payload, ?, ?) WHERE status = 'due' AND instr(payload, ?) > 0 AND ${ADMIN}`,
      JSON.stringify(from),
      JSON.stringify(to),
      JSON.stringify(from),
      adminId
    ]
  );
  if (gallery)
    statements.push([`DELETE FROM k_palettes WHERE seed = ? AND ${ADMIN}`, from, adminId]);
  if (ids.length)
    statements.push([
      `UPDATE k_collections SET likes_sum = (${LIKES_SUM}) WHERE id IN (SELECT value FROM json_each(?))`,
      JSON.stringify(ids)
    ]);
  const [allowed] = await batch(env.DB, statements);
  if (!allowed?.results.length) return false;
  if (ids.length) forgetTitles();
  return true;
}
