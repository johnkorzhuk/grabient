import { decodePalette, encodePalette } from "@grabient/engine";
import { parseView } from "@grabient/engine/view.ts";
import { all, type Db, first, replica } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import type { PaletteItem } from "../../features/gallery/schema.ts";
import { DEFAULT_FRAME, type ListSort, type RisingFrame } from "../../lib/orders.ts";
import { RISE_COLUMN } from "./scores.ts";

/* The gallery's palettes as lists read them. Every order reads an index: popular by likes_count (triggers keep it),
   rising by a frame's score, hot by the hot score, the API's dates by created_at. No request sorts likes. */

export type GallerySort = ListSort | "hot";
export interface ListOptions {
  sort?: GallerySort;
  /** Rising's frame; any other order ignores it */
  frame?: RisingFrame;
  page?: number;
  limit?: number;
  /** false for a caller that shows the items alone (the home's head): the gallery is not counted for it */
  count?: boolean;
}
export interface PalettePage {
  items: PaletteItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const PAGE_MAX = 10_000;
export const LIMIT_MAX = 96;
export const DEFAULT_LIMIT = 24;
/** The lists are up to five minutes old at the edge already, so an isolate keeps the gallery's count as long. */
const COUNT_TTL = 300_000;

export const bounded = (value: unknown, fallback: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value as number))) : fallback;

export interface PaletteRow {
  seed: string;
  style: string;
  steps: number;
  angle: number;
  likes_count?: number | null;
  created_at: number;
}
export const ROW = "seed, style, steps, angle, likes_count, created_at";

/** A row as a list shows it, or null for a seed the codec would write otherwise: only canonical seeds enter lists. Its
    steps are never fewer than its keyframes. */
export function itemOf(row: PaletteRow): PaletteItem | null {
  const palette = decodePalette(row.seed);
  if (!palette || encodePalette(palette) !== row.seed) return null;
  const view = parseView({
    get: name =>
      name === "style" ? row.style : name === "steps" || name === "angle" ? String(row[name]) : null
  });
  return {
    kseed: row.seed,
    style: view.style,
    steps: Math.max(view.steps, palette.anchors.length),
    angle: view.angle,
    likes: Math.max(0, Number(row.likes_count) || 0),
    createdAt: Number(row.created_at)
  };
}
export const itemsOf = (rows: readonly PaletteRow[]): PaletteItem[] =>
  rows.flatMap(row => itemOf(row) ?? []);

/* The gallery's count, kept per isolate and database binding: a COUNT reads every entry of an index. A write this
   isolate makes forgets it; the other isolates count again within COUNT_TTL. A count read while a write was
   forgetting it is not kept, since it may be the count from before the write. */
const counts = new WeakMap<D1Database, { at: number; epoch: number; n: number }>();
let epoch = 0;

/** The gallery changed in this isolate: lists count it again. */
export const forgetGalleryCount = () => {
  epoch++;
};

function heldCount(binding: D1Database): number | null {
  const held = counts.get(binding);
  return held && held.epoch === epoch && Date.now() - held.at < COUNT_TTL ? held.n : null;
}

async function countGallery(binding: D1Database, db: Db): Promise<number> {
  const asked = epoch;
  const at = Date.now();
  const n = Number(
    (await first<{ n: number }>(db, "SELECT COUNT(*) AS n FROM k_palettes"))?.n ?? 0
  );
  if (asked === epoch) counts.set(binding, { at, epoch: asked, n });
  return n;
}

const ORDER: Record<Exclude<GallerySort, "rising">, string> = {
  popular: "likes_count DESC, seed",
  hot: "hot DESC, likes_count DESC, seed",
  newest: "created_at DESC, seed",
  oldest: "created_at ASC, seed"
};

/** A page of the gallery in an order. A page past the end of the gallery as this isolate counted it reads nothing,
    since an OFFSET walks every entry it skips; the first page is always read. */
export async function listPalettes(
  env: Pick<Env, "DB">,
  options: ListOptions = {}
): Promise<PalettePage> {
  const db = replica(env);
  const page = bounded(options.page, 1, 1, PAGE_MAX);
  const limit = bounded(options.limit, DEFAULT_LIMIT, 1, LIMIT_MAX);
  const sort = options.sort ?? "popular";
  const offset = (page - 1) * limit;
  const kept = heldCount(env.DB);
  const pageOf = (items: PaletteItem[], total: number): PalettePage => ({
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  });
  if (kept !== null && page > 1 && offset >= kept) return pageOf([], kept);
  const order =
    sort === "rising"
      ? `${RISE_COLUMN[options.frame ?? DEFAULT_FRAME]} DESC, created_at DESC, seed`
      : ORDER[sort];
  const counting = options.count !== false;
  const [counted, rows] = await Promise.all([
    kept ?? (counting ? countGallery(env.DB, db) : null),
    all<PaletteRow>(
      db,
      `SELECT ${ROW} FROM k_palettes ORDER BY ${order} LIMIT ? OFFSET ?`,
      limit,
      offset
    )
  ]);
  const shown = rows.length ? offset + rows.length : 0;
  /* the page holds more than the kept count says: the gallery grew since, so it is counted again */
  const total =
    counting && counted !== null && shown > counted
      ? await countGallery(env.DB, db)
      : (counted ?? shown);
  return pageOf(itemsOf(rows), Math.max(total, shown));
}

/** The gallery's own rows for these seeds, at most 96, by seed. */
export async function galleryItems(
  db: Db,
  seeds: readonly string[]
): Promise<Map<string, PaletteItem>> {
  const asked = [...new Set(seeds)].slice(0, LIMIT_MAX);
  if (!asked.length) return new Map();
  const rows = await all<PaletteRow>(
    db,
    `SELECT ${ROW} FROM k_palettes WHERE seed IN (${asked.map(() => "?").join(",")})`,
    ...asked
  );
  return new Map(itemsOf(rows).map(item => [item.kseed, item]));
}
