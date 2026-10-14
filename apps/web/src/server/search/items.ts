/* The palettes a search may show. D1 is the authority: the snapshot names candidates, and only what D1 holds now is
   shown, each as a list shows it with how fast it rises in each frame, which a search sorts by. */
import { all } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import type { SearchItem } from "../../features/gallery/schema.ts";
import { canonicalPaletteSeed } from "../files/resolve.ts";
import { itemOf, type PaletteRow, ROW } from "../gallery/list.ts";

/** A palette as a search shows it, before its score for the words. */
export type Item = Omit<SearchItem, "score">;

interface RisenRow extends PaletteRow {
  rising?: number;
  rising_3m?: number;
  rising_1y?: number;
}

const risingOf = (stored?: number) => Math.round((Number(stored) || 0) * 1e4) / 1e4;

function rowItem(row: RisenRow): Item | null {
  const item: Item | null = itemOf(row);
  if (!item) return null;
  if (risingOf(row.rising) > 0) item.rising = risingOf(row.rising);
  if (risingOf(row.rising_3m) > 0) item.rising3m = risingOf(row.rising_3m);
  if (risingOf(row.rising_1y) > 0) item.rising1y = risingOf(row.rising_1y);
  return item;
}

const marks = (n: number) => Array.from({ length: n }, () => "?").join(",");

/** What D1 shows of these palettes, by canonical seed: a gallery palette with its own view and likes, else a palette
    of a public collection drawn as its oldest public membership saved it. Anything else is no longer on the site. */
export async function searchableItems(
  env: Pick<Env, "DB">,
  rawSeeds: readonly string[]
): Promise<Map<string, Item>> {
  const seeds = [...new Set(rawSeeds.slice(0, 96).flatMap(raw => canonicalPaletteSeed(raw) ?? []))];
  const found = new Map<string, Item>();
  if (!seeds.length) return found;
  const gallery = await all<RisenRow>(
    env.DB,
    `SELECT ${ROW}, rising, rising_3m, rising_1y FROM k_palettes WHERE seed IN (${marks(seeds.length)})`,
    ...seeds
  );
  for (const row of gallery) {
    const item = rowItem(row);
    if (item) found.set(item.kseed, item);
  }
  const rest = seeds.filter(seed => !found.has(seed));
  if (!rest.length) return found;
  // CROSS JOIN keeps SQLite on the items' seed index
  const members = await all<RisenRow>(
    env.DB,
    `SELECT i.seed, i.style, i.steps, i.angle, COALESCE(i.created_at, c.created_at) AS created_at
     FROM k_collection_items i CROSS JOIN k_collections c ON c.id = i.collection_id
     WHERE c.visibility = 'public' AND i.seed IN (${marks(rest.length)}) ORDER BY created_at ASC`,
    ...rest
  );
  for (const row of members) {
    const item = found.has(row.seed) ? null : rowItem(row);
    if (item) found.set(item.kseed, item);
  }
  return found;
}
