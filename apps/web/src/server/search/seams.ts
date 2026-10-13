/* What search takes from the areas around it: palette addresses and old ids (routing), the palettes D1 shows (the
   gallery), and collections' votes and holdings (collections). Each is the least that area's own module does, under
   the name its spec gives it, and search reads it only from here. */
import { decodePalette, encodePalette } from "@grabient/engine";
import { alignedLegacySeed, legacyTarget } from "@grabient/engine/legacy.ts";
import { parseView, type Style } from "@grabient/engine/view.ts";
import { delocalizePath } from "@grabient/i18n";
import { all } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import legacyGallery from "../../../data/legacy-k.json" with { type: "json" };
import legacyLinks from "../../../data/legacy-links.json" with { type: "json" };
import { fitOf } from "../collections/fit.ts";
import { collectionsHolding as holding } from "../collections/read.ts";
import { publicCollections, suggestCollections } from "../collections/search.ts";
import { localizeHeld, translatedLocale } from "../mcp/admin/translations.ts";

/* palettes and old ids */

const OLD_SEED = /^[_~][A-Za-z0-9_-]{6,}$/;
const migrated: Readonly<Record<string, string>> = legacyGallery;
const links: Readonly<Record<string, string>> = legacyLinks;
const legacySeed = (id: string): string | undefined => migrated[id] ?? links[id];

/** A palette's canonical seed from its seed or an old id the migration maps know; null for anything else. */
export function canonicalPaletteSeed(raw: string): string | null {
  const palette = decodePalette(legacyTarget(raw, legacySeed)?.seed ?? raw);
  return palette ? encodePalette(palette) : null;
}

/** A palette named in place of words: a seed as the codec writes it, or an old grabient.com id as its `_` form, which
    the maps or the browser's fit turn into a seed. Null for anything else. */
export function paletteId(raw: string): string | null {
  const palette = decodePalette(raw);
  return palette ? encodePalette(palette) : OLD_SEED.test(raw) ? raw : alignedLegacySeed(raw);
}

/* addresses */

const PALETTE_HOSTS = new Set([
  "grabient.com",
  "www.grabient.com",
  "grabient-lite.jkorzhuk.workers.dev",
  "grabient4.jkorzhuk.workers.dev"
]);
const LIST_PAGE = /^\/(?:(?:palettes|collections)(?:\/rising(?:\/(?:3m|1y))?|\/saved)?)?$/;
const QUERY_MAX = 100;

/** Whether text reads as an address: one with its scheme, a host and a path, or a path of this site. */
export const looksLikeLink = (raw: string): boolean =>
  /^\s*(?:https?:\/\/|[^/\s]+\.[^/\s]+\/|\/)/i.test(raw);

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/* What a Grabient link searches for: the palette it names (its page in any language, /edit, its picture or data), or
   the words of a list's address. "" for a link off the site or to a page that names neither. */
function linkQuery(raw: string): string {
  const value = raw.trim();
  let url: URL;
  try {
    url = new URL(
      /^https?:\/\//i.test(value)
        ? value
        : value.startsWith("/")
          ? `https://grabient.com${value}`
          : `https://${value}`
    );
  } catch {
    return "";
  }
  const own = PALETTE_HOSTS.has(url.hostname.toLowerCase()) || value.startsWith("/");
  if (!own || url.username || url.password) return "";
  const path = delocalizePath(url.pathname).path;
  if (/^\/api\/(?:og|png|palette(?:\.json)?)$/.test(path))
    return paletteId(url.searchParams.get("seed") ?? "") ?? "";
  const page = path.replace(/\.(?:png|svg|json|md)$/, "");
  const one = /^\/([^/]+?)(?:\/edit)?\/?$/.exec(page);
  const named = one && paletteId(safeDecode(one[1]));
  if (named) return named;
  const asked = url.searchParams.get("q") ?? url.searchParams.get("query");
  if (asked && LIST_PAGE.test(page)) return normalizeListQuery(asked);
  const words = /^\/palettes\/([^/]+)$/.exec(page);
  if (!words) return "";
  const said = safeDecode(words[1]);
  return normalizeListQuery(paletteId(said) ?? said.replace(/-/g, " "));
}

/** Words as a collections search takes them: NFKC, one space, 100 characters at most, no control characters. */
export function normalizeCollectionQuery(raw: string | null | undefined): string {
  const q = (raw ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters are what is refused
  return q.length > QUERY_MAX || /[\u0000-\u001f\u007f]/u.test(q) ? "" : q;
}

/** The words of a search as every list's address writes them: lowercase, one space, 100 characters at most; a palette's
    seed in its own case; a Grabient link as the seed or words it names. Empty when there is nothing to search for. */
export function normalizeListQuery(raw: string | null | undefined): string {
  if (!raw) return "";
  if (looksLikeLink(raw)) return linkQuery(raw);
  const q = normalizeCollectionQuery(raw);
  return q && (paletteId(q) ?? q.toLowerCase());
}

/** What a search field holds, as its tags are asked for: the words in lowercase, 100 characters at most, or a
    palette's seed in its own case. */
export function normalizeTypedQuery(raw: string | null | undefined): string {
  const typed = (raw ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();
  return paletteId(typed) ?? typed.toLowerCase().slice(0, QUERY_MAX);
}

/* the palettes a search may show */

export type ListSort = "popular" | "rising" | "newest" | "oldest";
export type RisingFrame = "week" | "3m" | "1y";

/** A palette as a list shows it: its own view, likes and age, and how fast it rises in each frame. */
export interface Item {
  kseed: string;
  style: Style;
  steps: number;
  angle: number;
  likes: number;
  createdAt: number;
  rising?: number;
  rising3m?: number;
  rising1y?: number;
}

export function parseSearchSort(value?: string | null): ListSort {
  return value === "rising" || value === "newest" || value === "oldest" ? value : "popular";
}

/** A search's order: Popular is the most liked, then the best answer; Rising the frame's score, then the newest. Ties go
    by seed code point, never by a reader's collation, so pages cut alike on every side. */
export function sortSearchItems<T extends Item & { score?: number }>(
  items: readonly T[],
  sort: ListSort = "popular",
  frame: RisingFrame = "week"
): T[] {
  const risen = (item: T) =>
    (frame === "3m" ? item.rising3m : frame === "1y" ? item.rising1y : item.rising) ?? 0;
  const order = (a: T, b: T) =>
    sort === "rising"
      ? risen(b) - risen(a) || b.createdAt - a.createdAt
      : sort === "newest"
        ? b.createdAt - a.createdAt
        : sort === "oldest"
          ? a.createdAt - b.createdAt
          : b.likes - a.likes || (b.score ?? 0) - (a.score ?? 0);
  return [...items].sort(
    (a, b) => order(a, b) || (a.kseed < b.kseed ? -1 : a.kseed > b.kseed ? 1 : 0)
  );
}

interface PaletteRow {
  seed: string;
  style: string;
  steps: number;
  angle: number;
  created_at: number;
  likes_count?: number;
  rising?: number;
  rising_3m?: number;
  rising_1y?: number;
}

const risingOf = (stored?: number) => Math.round((Number(stored) || 0) * 1e4) / 1e4;

function rowItem(row: PaletteRow): Item | null {
  const palette = decodePalette(row.seed);
  if (!palette || encodePalette(palette) !== row.seed) return null;
  const view = parseView(
    new URLSearchParams({ style: row.style, steps: String(row.steps), angle: String(row.angle) })
  );
  const item: Item = {
    kseed: row.seed,
    style: view.style,
    steps: Math.max(view.steps, palette.anchors.length),
    angle: view.angle,
    likes: Math.max(0, row.likes_count || 0),
    createdAt: row.created_at
  };
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
  const gallery = await all<PaletteRow>(
    env.DB,
    `SELECT seed, style, steps, angle, created_at, likes_count, rising, rising_3m, rising_1y FROM k_palettes
     WHERE seed IN (${marks(seeds.length)})`,
    ...seeds
  );
  for (const row of gallery) {
    const item = rowItem(row);
    if (item) found.set(item.kseed, item);
  }
  const rest = seeds.filter(seed => !found.has(seed));
  if (!rest.length) return found;
  // CROSS JOIN keeps SQLite on the items' seed index
  const members = await all<PaletteRow>(
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

/* collections */

/** A palette voted out of a collection: an admin's down, or enough votes and most of them down. */
export const votedOut = (up: number, down: number, adminDown: number): boolean => {
  const fit = fitOf(up, down, adminDown);
  return fit.slated || fit.unfit;
};

/** The public collections that hold a palette, as a search by that palette names them beside its answer: each title in
    the reader's language where Grabient's is translated. */
export async function collectionsHolding(
  env: Pick<Env, "DB">,
  seed: string,
  locale: string
): Promise<{ slug: string; title: string }[]> {
  const held = await holding(env, seed);
  return localizeHeld(
    env,
    translatedLocale(locale),
    held.map(({ slug, title }) => ({ slug, title }))
  );
}

export { publicCollections, suggestCollections };
