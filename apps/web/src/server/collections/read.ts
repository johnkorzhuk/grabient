import { decodePalette } from "@grabient/engine";
import { DOMINANT_PALETTES, dominantColors } from "@grabient/engine/dominant.ts";
import { DEFAULT_STYLE, isStyle, STEPS_MIN, type Style } from "@grabient/engine/view.ts";
import { all, type Db, first } from "@grabient/server/db/d1.ts";
import {
  isCollectionSlug,
  type PaletteOrder,
  sortCollectionItems
} from "../../features/collections/address.ts";
import {
  type CollectionInput,
  type CollectionItemInput,
  MAX_COLLECTION_ITEMS,
  type Visibility
} from "../../features/collections/schema.ts";
import type {
  CollectionDocument,
  CollectionItem,
  CollectionPage,
  CollectionPreview,
  CollectionSort,
  CollectionSummary
} from "../../features/collections/types.ts";
import type { RisingFrame } from "../../lib/orders.ts";

/* Reading collections: one public collection by its address, a page of a list, the collections that hold a palette,
   and the rows the sitemap, the share cards and the admin's checklist read. Every read is bounded: a page of rows, a
   strip of palettes a row, a collection's hundred palettes. A private collection is its owner's alone: a public read
   names `visibility = 'public'` in its query, and only a caller that has checked who is asking reads past it. */

/** A database to read: the primary (env.DB), or a request's replica session for a public read. */
export type Reader = { DB: Db };

export type OwnerKind = "user" | "agent";
export interface CollectionOwner {
  kind: OwnerKind;
  id: string;
}
/** The stored values behind a collection, for ownership checks and changes. Never sent to a client. */
export interface CollectionRecord {
  id: string;
  slug: string;
  owner: CollectionOwner;
  input: CollectionInput;
  createdAt: number;
  /** a saved copy: the id of the collection it was saved from */
  forkedFrom: string | null;
}

export interface CollectionRow {
  id: string;
  slug: string;
  owner_kind: OwnerKind;
  owner_id: string;
  title: string;
  description: string;
  tags: string;
  visibility: Visibility;
  item_count: number;
  created_at: number;
  updated_at: number;
  fork_count: number;
  forked_from: string | null;
  owner_name: string | null;
  owner_display: string | null;
}
/** A collection's columns and its owner's names: an account's username and display name, an agent's own name. */
export const SELECT = `SELECT c.id, c.slug, c.owner_kind, c.owner_id, c.title, c.description, c.tags, c.visibility,
  c.item_count, c.created_at, c.updated_at, c.fork_count, c.forked_from,
  CASE WHEN c.owner_kind = 'user' THEN u.username ELSE c.owner_id END AS owner_name,
  CASE WHEN c.owner_kind = 'user' THEN u.name END AS owner_display
  FROM k_collections c LEFT JOIN auth_user u ON c.owner_kind = 'user' AND u.id = c.owner_id`;

/** How many palettes a list's card of a collection draws, its page's first. */
export const PREVIEW_ITEMS = 12;
/** How many palettes a preview read by position holds, for a caller that names palettes and draws no card. */
export const FIRST_ITEMS = 6;

/** A collection's tags as written; an unreadable list reads as none. */
export function tagsOf(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

export const summaryOf = (row: CollectionRow, preview: CollectionPreview[]): CollectionSummary => ({
  slug: row.slug,
  title: row.title,
  description: row.description,
  tags: tagsOf(row.tags),
  visibility: row.visibility,
  owner: {
    kind: row.owner_kind,
    name: row.owner_name ?? null,
    ...(row.owner_kind === "user" ? { display: row.owner_display?.trim() || null } : {})
  },
  itemCount: Number(row.item_count) || 0,
  createdAt: Number(row.created_at),
  updatedAt: Number(row.updated_at),
  saves: Math.max(0, Number(row.fork_count) || 0),
  preview
});

/* When a palette was made: the first time the site showed it, in the gallery or in a public collection. An agent makes
   most palettes inside a collection and a like brings them into the gallery later, so the gallery's own time alone would
   read as that like's. A private collection's times are its owner's, never another reader's. The collection's own
   membership counts on its own page. A row from before memberships kept times reads as its collection's. */
const FIRST_PUBLIC = (seed: string) => `(SELECT MIN(COALESCE(j.created_at, jc.created_at))
  FROM k_collection_items j JOIN k_collections jc ON jc.id = j.collection_id
  WHERE j.seed = ${seed} AND jc.visibility = 'public')`;
const madeAt = (...times: unknown[]): number | undefined => {
  const known = times.map(Number).filter(time => Number.isFinite(time) && time > 0);
  return known.length ? Math.min(...known) : undefined;
};

interface ItemRow {
  collection_id: string;
  position: number;
  seed: string;
  style: string;
  steps: number;
  angle: number;
  created_at?: number | null;
  likes_count?: number | null;
  rising?: number | null;
  gallery_at?: number | null;
  first_public?: number | null;
}
const styleOf = (raw: string): Style => (isStyle(raw) ? raw : DEFAULT_STYLE);

/** A collection's palettes in its own order, each with its likes, its week's rising score and when it was made. */
export async function itemsOf(
  env: Reader,
  row: Pick<CollectionRow, "id" | "created_at">
): Promise<CollectionItem[]> {
  const rows = await all<ItemRow>(
    env.DB,
    `SELECT i.position, i.seed, i.style, i.steps, i.angle, i.created_at, p.likes_count, p.rising,
       p.created_at AS gallery_at, ${FIRST_PUBLIC("i.seed")} AS first_public
     FROM k_collection_items i LEFT JOIN k_palettes p ON p.seed = i.seed
     WHERE i.collection_id = ? ORDER BY i.position LIMIT ?`,
    row.id,
    MAX_COLLECTION_ITEMS
  );
  return rows.flatMap(item => {
    const palette = decodePalette(item.seed);
    if (!palette) return [];
    const rising = Number(item.rising) || 0;
    return [
      {
        kseed: item.seed,
        style: styleOf(item.style),
        steps: Math.max(STEPS_MIN, palette.anchors.length, Number(item.steps) || 0),
        angle: Number(item.angle) || 0,
        likes: Math.max(0, Number(item.likes_count) || 0),
        createdAt:
          madeAt(item.gallery_at, item.first_public, item.created_at ?? row.created_at) ??
          Number(row.created_at),
        position: Number(item.position),
        ...(rising > 0 ? { rising: Math.round(rising * 1e4) / 1e4 } : {})
      }
    ];
  });
}

/** A collection's first palettes as a list's card draws them: the first of its page's own order, each with its place. */
export const previewOf = (items: readonly CollectionItem[]): CollectionPreview[] =>
  sortCollectionItems(items)
    .slice(0, PREVIEW_ITEMS)
    .map(({ kseed, style, steps, angle, createdAt, likes, position }) => ({
      seed: kseed,
      style,
      steps,
      angle,
      createdAt,
      likes,
      position
    }));

/** Each collection's preview palettes, by its id. `first` reads the first few as the collection orders them, by its
    order's index alone; otherwise the ones its page shows first, the most liked leading, each with its likes and when
    it was made. */
async function previews(
  env: Reader,
  rows: readonly CollectionRow[],
  first: boolean
): Promise<Map<string, CollectionPreview[]>> {
  const map = new Map<string, CollectionPreview[]>(rows.map(row => [row.id, []]));
  if (!rows.length) return map;
  const ids = JSON.stringify(rows.map(row => row.id));
  if (first) {
    const held = await all<ItemRow>(
      env.DB,
      `SELECT collection_id, position, seed, style, steps, angle FROM (
         SELECT i.collection_id, i.position, i.seed, i.style, i.steps, i.angle,
           ROW_NUMBER() OVER (PARTITION BY i.collection_id ORDER BY i.position) AS n
         FROM k_collection_items i WHERE i.collection_id IN (SELECT value FROM json_each(?)))
       WHERE n <= ? ORDER BY collection_id, n`,
      ids,
      FIRST_ITEMS
    );
    for (const row of held)
      map.get(row.collection_id)?.push({
        seed: row.seed,
        style: styleOf(row.style),
        steps: Number(row.steps),
        angle: Number(row.angle),
        position: Number(row.position)
      });
    return map;
  }
  const created = new Map(rows.map(row => [row.id, Number(row.created_at)]));
  const held = await all<ItemRow>(
    env.DB,
    `SELECT t.collection_id, t.position, t.seed, t.style, t.steps, t.angle, t.created_at, t.likes_count, t.gallery_at,
       ${FIRST_PUBLIC("t.seed")} AS first_public
     FROM (SELECT i.collection_id, i.position, i.seed, i.style, i.steps, i.angle, i.created_at, p.likes_count,
         p.created_at AS gallery_at,
         ROW_NUMBER() OVER (PARTITION BY i.collection_id ORDER BY COALESCE(p.likes_count, 0) DESC, i.position) AS n
       FROM k_collection_items i LEFT JOIN k_palettes p ON p.seed = i.seed
       WHERE i.collection_id IN (SELECT value FROM json_each(?))) t
     WHERE t.n <= ? ORDER BY t.collection_id, t.n`,
    ids,
    PREVIEW_ITEMS
  );
  for (const row of held)
    map.get(row.collection_id)?.push({
      seed: row.seed,
      style: styleOf(row.style),
      steps: Number(row.steps),
      angle: Number(row.angle),
      createdAt:
        madeAt(
          row.gallery_at,
          row.first_public,
          row.created_at ?? created.get(row.collection_id)
        ) ?? created.get(row.collection_id),
      likes: Math.max(0, Number(row.likes_count) || 0),
      position: Number(row.position)
    });
  return map;
}

/** Which palettes each collection of a page comes with: the ones its page shows first (a list's cards), the first few
    by position (a caller that names palettes and draws none), or none. */
export type Previews = "page" | "first" | false;

export interface PageOf {
  query: string;
  sort: CollectionSort;
  frame?: RisingFrame;
  page: number;
  limit: number;
  total: number;
  unkept?: boolean;
}

/** A page of summaries. */
export async function pageOf(
  env: Reader,
  rows: readonly CollectionRow[],
  head: PageOf,
  strip: Previews = "page"
): Promise<CollectionPage> {
  const strips = strip ? await previews(env, rows, strip === "first") : new Map();
  return {
    ...head,
    totalPages: Math.max(1, Math.ceil(head.total / head.limit)),
    items: rows.map(row => summaryOf(row, strips.get(row.id) ?? [])),
    fetchedAt: Date.now()
  };
}

/** A public collection by its address, whole. A caller that has checked who is asking (the owner, an admin on one of
    Grabient's collections) reads a private one with `trusted`. */
export async function collectionBySlug(
  env: Reader,
  slug: string,
  trusted = false
): Promise<CollectionDocument | null> {
  if (!isCollectionSlug(slug)) return null;
  const row = await first<CollectionRow>(
    env.DB,
    `${SELECT} WHERE c.slug = ?${trusted ? "" : " AND c.visibility = 'public'"}`,
    slug
  );
  if (!row) return null;
  const { preview: _, ...summary } = summaryOf(row, []);
  return { ...summary, items: await itemsOf(env, row) };
}

/** Whether a collection lives at this address, and who may see it: a one-segment address resolves by it. */
export async function collectionVisibility(env: Reader, slug: string): Promise<Visibility | null> {
  if (!isCollectionSlug(slug)) return null;
  const row = await first<{ visibility: Visibility }>(
    env.DB,
    "SELECT visibility FROM k_collections WHERE slug = ?",
    slug
  );
  return row?.visibility ?? null;
}

async function recordBy(
  env: Reader,
  column: "slug" | "id",
  value: string
): Promise<CollectionRecord | null> {
  const row = await first<CollectionRow>(env.DB, `${SELECT} WHERE c.${column} = ?`, value);
  if (!row) return null;
  const items = await all<{ seed: string; style: string; steps: number; angle: number }>(
    env.DB,
    "SELECT seed, style, steps, angle FROM k_collection_items WHERE collection_id = ? ORDER BY position LIMIT ?",
    row.id,
    MAX_COLLECTION_ITEMS
  );
  return {
    id: row.id,
    slug: row.slug,
    owner: { kind: row.owner_kind, id: row.owner_id },
    createdAt: Number(row.created_at),
    forkedFrom: row.forked_from ?? null,
    input: {
      title: row.title,
      description: row.description,
      tags: tagsOf(row.tags),
      visibility: row.visibility,
      items: items.map(item => ({
        seed: item.seed,
        style: styleOf(item.style),
        steps: Number(item.steps),
        angle: Number(item.angle)
      }))
    }
  };
}
/** The stored values behind an address, whoever owns it. */
export const collectionRecord = (env: Reader, slug: string) =>
  isCollectionSlug(slug) ? recordBy(env, "slug", slug) : Promise.resolve(null);
export const recordById = (env: Reader, id: string) => recordBy(env, "id", id);

export const ownedBy = (record: Pick<CollectionRecord, "owner">, owner: CollectionOwner) =>
  record.owner.kind === owner.kind && record.owner.id === owner.id;

/** Public collections by their addresses, in the order asked, at most fifty. */
export async function collectionsBySlugs(
  env: Reader,
  slugs: readonly string[],
  strip: Previews = "page"
): Promise<CollectionSummary[]> {
  const wanted = [...new Set(slugs)].filter(isCollectionSlug).slice(0, 50);
  if (!wanted.length) return [];
  const rows = await all<CollectionRow>(
    env.DB,
    `${SELECT} WHERE c.visibility = 'public' AND c.slug IN (SELECT value FROM json_each(?))`,
    JSON.stringify(wanted)
  );
  const page = await pageOf(
    env,
    rows,
    { query: "", sort: "popular", page: 1, limit: wanted.length, total: rows.length },
    strip
  );
  const bySlug = new Map(page.items.map(item => [item.slug, item]));
  return wanted.flatMap(slug => bySlug.get(slug) ?? []);
}

/* A collection's colors are read from its first palettes, about a millisecond, and only for the rows a request shows. They
   are a pure function of those palettes, so they are kept by them, the oldest out first. */
const COLORS_KEPT = 512;
const colorsBySeeds = new Map<string, string[]>();
/** One to five colors of the palettes a collection leads with: what its tag shows under the pointer. */
export function colorsOf(seeds: string | null): string[] {
  const key = seeds ?? "";
  const known = colorsBySeeds.get(key);
  if (known) return known;
  const colors = dominantColors(key.split(" ").filter(Boolean));
  if (colorsBySeeds.size >= COLORS_KEPT) colorsBySeeds.delete(colorsBySeeds.keys().next().value!);
  colorsBySeeds.set(key, colors);
  return colors;
}
/** A collection's first palettes by position, space separated, as a column of a query over collections `c`. */
export const LEAD_SEEDS = `(SELECT group_concat(seed, ' ') FROM (SELECT p.seed FROM k_collection_items p
  WHERE p.collection_id = c.id ORDER BY p.position LIMIT ${DOMINANT_PALETTES}))`;

/** The public collections that hold a palette, each once however many views of it it holds, the most saved first:
    where a palette's page leads on to. */
export async function collectionsHolding(
  env: Reader,
  seed: string,
  limit = 6
): Promise<{ slug: string; title: string; colors: string[] }[]> {
  // CROSS JOIN keeps SQLite on the items' seed index
  const rows = await all<{ slug: string; title: string; seeds: string | null }>(
    env.DB,
    `SELECT c.slug, c.title, ${LEAD_SEEDS} AS seeds FROM k_collections c
     WHERE c.id IN (SELECT i.collection_id FROM k_collection_items i WHERE i.seed = ?) AND c.visibility = 'public'
     ORDER BY c.fork_count DESC, c.updated_at DESC, c.id LIMIT ?`,
    seed,
    Math.max(1, Math.min(24, Math.floor(limit) || 6))
  );
  return rows.map(row => ({ slug: row.slug, title: row.title, colors: colorsOf(row.seeds) }));
}

/** collectionsHolding for several palettes in one query, by seed. */
export async function collectionsHoldingEach(
  env: Reader,
  seeds: readonly string[],
  limit = 6
): Promise<Map<string, { slug: string; title: string }[]>> {
  const held = new Map<string, { slug: string; title: string }[]>();
  if (!seeds.length) return held;
  const rows = await all<{ seed: string; slug: string; title: string }>(
    env.DB,
    `SELECT seed, slug, title FROM (
       SELECT seed, slug, title,
         ROW_NUMBER() OVER (PARTITION BY seed ORDER BY fork_count DESC, updated_at DESC, id) AS n
       FROM (SELECT DISTINCT i.seed, c.id, c.slug, c.title, c.fork_count, c.updated_at
         FROM k_collection_items i CROSS JOIN k_collections c ON c.id = i.collection_id
         WHERE i.seed IN (SELECT value FROM json_each(?)) AND c.visibility = 'public'))
     WHERE n <= ? ORDER BY seed, n`,
    JSON.stringify([...new Set(seeds)].slice(0, 96)),
    Math.max(1, Math.min(24, Math.floor(limit) || 6))
  );
  for (const row of rows)
    held.set(row.seed, [...(held.get(row.seed) ?? []), { slug: row.slug, title: row.title }]);
  return held;
}

/** Every public collection's address and when it last changed, newest first: the sitemap's rows. */
export async function collectionSitemapRows(
  env: Reader,
  limit = 45_000
): Promise<{ slug: string; updatedAt: number }[]> {
  const rows = await all<{ slug: string; updated_at: number }>(
    env.DB,
    "SELECT slug, updated_at FROM k_collections WHERE visibility = 'public' ORDER BY updated_at DESC, id LIMIT ?",
    Math.max(1, Math.min(45_000, Math.floor(limit)))
  );
  return rows.map(row => ({ slug: row.slug, updatedAt: Number(row.updated_at) }));
}

/** The palettes a public collection's page shows first, in the page's order, each as the collection saved it: what
    its share card draws. A private one has no picture. */
export async function collectionImagePalettes(
  env: Reader,
  slug: string,
  limit = 9,
  order: PaletteOrder = "popular"
): Promise<CollectionItemInput[]> {
  const doc = await collectionBySlug(env, slug);
  if (!doc) return [];
  return sortCollectionItems(doc.items, order)
    .slice(0, Math.max(1, Math.min(MAX_COLLECTION_ITEMS, Math.floor(limit))))
    .map(item => ({ seed: item.kseed, style: item.style, steps: item.steps, angle: item.angle }));
}

/** One of Grabient's collections as an admin's checklist offers it: its first palettes give its colors. */
export interface SiteCollectionChoice {
  slug: string;
  title: string;
  count: number;
  updatedAt: number;
  seeds: string[];
}
const SITE_CHOICE_SEEDS = 6;
/** Grabient's collections, any visibility, the latest changed first. */
export async function siteCollectionChoices(env: Reader): Promise<SiteCollectionChoice[]> {
  const [lists, firsts] = await Promise.all([
    all<{ id: string; slug: string; title: string; count: number; updatedAt: number }>(
      env.DB,
      `SELECT id, slug, title, item_count AS count, updated_at AS updatedAt FROM k_collections
       WHERE owner_kind = 'agent' ORDER BY updated_at DESC, id`
    ),
    all<{ id: string; seed: string }>(
      env.DB,
      `SELECT id, seed FROM (SELECT i.collection_id AS id, i.seed,
         ROW_NUMBER() OVER (PARTITION BY i.collection_id ORDER BY i.position) AS n
       FROM k_collection_items i JOIN k_collections c ON c.id = i.collection_id WHERE c.owner_kind = 'agent')
       WHERE n <= ?`,
      SITE_CHOICE_SEEDS
    )
  ]);
  const seeds = new Map<string, string[]>();
  for (const row of firsts) seeds.set(row.id, [...(seeds.get(row.id) ?? []), row.seed]);
  return lists.map(row => ({
    slug: row.slug,
    title: row.title,
    count: Number(row.count),
    updatedAt: Number(row.updatedAt),
    seeds: seeds.get(row.id) ?? []
  }));
}

const ITEM_KEY = "seed || ' ' || style || ' ' || steps || ' ' || angle";
/** How many of these items each of Grabient's collections holds, for the ones that hold any. */
export async function siteCollectionsHolding(
  env: Reader,
  items: readonly CollectionItemInput[]
): Promise<Record<string, number>> {
  const keys = [...new Set(items.map(i => `${i.seed} ${i.style} ${i.steps} ${i.angle}`))];
  const rows = await all<{ slug: string; n: number }>(
    env.DB,
    `SELECT c.slug, COUNT(*) AS n FROM k_collection_items i JOIN k_collections c ON c.id = i.collection_id
     WHERE c.owner_kind = 'agent' AND i.seed IN (SELECT value FROM json_each(?))
       AND ${ITEM_KEY} IN (SELECT value FROM json_each(?)) GROUP BY c.slug`,
    JSON.stringify([...new Set(items.map(item => item.seed))]),
    JSON.stringify(keys)
  );
  return Object.fromEntries(rows.map(row => [row.slug, Number(row.n)]));
}

/** Grabient's collections that hold a palette, with its place and view in each: what a gallery deletion takes it out of. */
export async function agentCollectionsHolding(
  env: Reader,
  seed: string
): Promise<
  {
    id: string;
    slug: string;
    title: string;
    agent: string;
    position: number;
    style: Style;
    steps: number;
    angle: number;
  }[]
> {
  const rows = await all<{
    id: string;
    slug: string;
    title: string;
    agent: string;
    position: number;
    style: string;
    steps: number;
    angle: number;
  }>(
    env.DB,
    `SELECT c.id, c.slug, c.title, c.owner_id AS agent, i.position, i.style, i.steps, i.angle
     FROM k_collection_items i JOIN k_collections c ON c.id = i.collection_id
     WHERE i.seed = ? AND c.owner_kind = 'agent' ORDER BY c.slug LIMIT 200`,
    seed
  );
  return rows.map(row => ({
    ...row,
    style: styleOf(row.style),
    position: Number(row.position),
    steps: Number(row.steps),
    angle: Number(row.angle)
  }));
}
