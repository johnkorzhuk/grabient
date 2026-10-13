import { decodePalette, encodePalette } from "@grabient/engine/codec.ts";
import { readPalette, titleFaults, paletteTitle as titleOfReading } from "@grabient/engine/name.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import {
  DEFAULT_ANGLE,
  DEFAULT_STEPS,
  DEFAULT_STYLE,
  isStyle,
  STEPS_MAX,
  STEPS_MIN,
  type Style
} from "@grabient/engine/view.ts";
import { LOCALE_SEGMENTS } from "@grabient/i18n";
import { all, batch, first, run, type Statement } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import type { LimitCheck } from "@grabient/server/limits/check.ts";
import type { ViewGiven } from "./cards.ts";

/* The rest of the site as the MCP tools and the seeding queue use it: palettes and their words, the gallery, likes,
   collections and search, each in the shape the site's own pages use, so the tools hold to the same rules.

   These belong to other areas of the site and are written there; this module stands in for them until they meet
   here, and each section names the module it expects to give way to. Reads are real queries, so the tools answer
   from the database; a write that is another area's own (a like's scores, a collection's private address, a
   curation) throws until its module is wired in, and the tools that need it say so when called. */

type DB = Pick<Env, "DB">;

/** A function another area of the site writes, not yet wired in here. */
class NotWired extends Error {
  constructor(what: string) {
    super(`${what} is not wired to the MCP server yet`);
    this.name = "NotWired";
  }
}

/* —— Seeds (expected: the engine's codec and the Worker's legacy maps, server/legacy.ts) —— */

/** A palette's canonical seed, from its seed or an old grabient.com id the legacy maps hold; null for anything else. */
export function canonicalPaletteSeed(raw: string): string | null {
  if (typeof raw !== "string" || raw.length > 400) return null;
  const palette = decodePalette(raw);
  return palette ? encodePalette(palette) : null;
}

/** What a palette's colors are called in a view: its title when nothing was written for it. */
export function paletteTitle(palette: Palette, view: { style: Style; steps: number }): string {
  return titleOfReading(readPalette(palette, view.style, view.steps), view.style);
}

/* —— Palette texts: the words written for a palette (expected: server/collections/texts.ts) —— */

export const PALETTE_TITLE_MAX = 80;
export const PALETTE_EMBED_MAX = 1200;
export interface PaletteText {
  seed: string;
  title: string;
  embed: string;
  agent: string | null;
  updatedAt: number;
}
export interface PaletteTextInput {
  seed: string;
  title: string;
  embed: string;
}

/** Text as it was typed, composed (never folded), on one line, within `max`; null past it or for anything but text. */
function line(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > max * 4) return null;
  const clean = value
    .normalize("NFC")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return clean.length > max ? null : clean;
}

/** A palette's title as sent: one line of 1 to PALETTE_TITLE_MAX characters, or null. */
export const paletteTitleInput = (value: unknown): string | null =>
  line(value, PALETTE_TITLE_MAX) || null;

/** One entry of texts: a canonical seed, a title within its length, a description within its length or none. */
export function paletteTextInput(value: unknown): PaletteTextInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const item = collectionItem({ seed: input.seed });
  const title = paletteTitleInput(input.title);
  const embed = line(input.embed, PALETTE_EMBED_MAX);
  return item && title && embed !== null ? { seed: item.seed, title, embed } : null;
}

export async function paletteTexts(env: DB, seeds: readonly string[]): Promise<PaletteText[]> {
  if (!seeds.length) return [];
  const rows = await all<{
    seed: string;
    title: string;
    embed: string;
    agent: string | null;
    updated_at: number;
  }>(
    env.DB,
    "SELECT seed, title, embed, agent, updated_at FROM k_palette_texts WHERE seed IN (SELECT value FROM json_each(?))",
    JSON.stringify([...new Set(seeds)])
  );
  return rows.map(row => ({ ...row, updatedAt: Number(row.updated_at) }));
}

/** A palette's written words as a page or an agent is shown them: the title only where the palette's colors bear it
    out, and the description only beside it and where it holds too. Null: the palette goes by its colors. */
export function heldWords(
  text: PaletteText | null | undefined,
  palette: Palette | null
): { title: string; embed: string } | null {
  if (!text || !palette || titleFaults(text.title, palette).length) return null;
  return {
    title: text.title,
    embed: text.embed && !titleFaults(text.embed, palette).length ? text.embed : ""
  };
}

/** Texts sent to be written, sorted by whether the palettes' colors bear their words out. A text is kept whole or not
    at all, so a description never outlives its title's check. */
export function checkTexts(texts: readonly PaletteTextInput[]) {
  const held: PaletteTextInput[] = [];
  const refused: { seed: string; words: string[] }[] = [];
  for (const text of texts) {
    const palette = decodePalette(text.seed);
    const words = palette
      ? [...new Set([...titleFaults(text.title, palette), ...titleFaults(text.embed, palette)])]
      : [];
    if (words.length) refused.push({ seed: text.seed, words });
    else held.push(text);
  }
  return { held, refused };
}

/** What a refused text's answer says, the same for every writer. */
export const REFUSED_TEXT = "Not written: the palette shows nothing these words name.";

/** Writes or replaces texts. An entry without a description keeps the one the palette has; a text sent again as it
    stands writes nothing. */
export async function upsertPaletteTexts(
  env: DB,
  agent: string | null,
  texts: readonly PaletteTextInput[]
): Promise<number> {
  if (!texts.length) return 0;
  const now = Date.now();
  await batch(
    env.DB,
    texts.map(
      (text): Statement => [
        `INSERT INTO k_palette_texts (seed, title, embed, agent, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(seed) DO UPDATE SET title = excluded.title, agent = excluded.agent, updated_at = excluded.updated_at,
           embed = CASE WHEN excluded.embed = '' THEN k_palette_texts.embed ELSE excluded.embed END
         WHERE k_palette_texts.title IS NOT excluded.title OR k_palette_texts.agent IS NOT excluded.agent
           OR (excluded.embed <> '' AND k_palette_texts.embed IS NOT excluded.embed)`,
        text.seed,
        text.title,
        text.embed,
        agent,
        now,
        now
      ]
    )
  );
  return texts.length;
}

/* —— Collection rules (expected: server/collections/schema.ts and address.ts) —— */

export const MAX_COLLECTION_ITEMS = 100;
export const MAX_OWN_COLLECTIONS = 200;
export const COLLECTION_TITLE_MAX = 80;
const DESCRIPTION_MAX = 500;
const TAGS_MAX = 12;
const SLUG_MAX = 80;

export interface CollectionItemInput {
  seed: string;
  style: Style;
  steps: number;
  angle: number;
}
export interface CollectionInput {
  title: string;
  description: string;
  tags: string[];
  visibility: "public" | "private";
  items: CollectionItemInput[];
}
export type CollectionOwner = { kind: "user" | "agent"; id: string };

/** A member palette: canonical seed, one of the six styles, steps raised to the palette's keyframes. */
export function collectionItem(value: unknown): CollectionItemInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.seed !== "string" || input.seed.length > 64) return null;
  const palette = decodePalette(input.seed);
  if (!palette) return null;
  if (input.style !== undefined && !isStyle(input.style)) return null;
  const whole = (v: unknown, min: number, max: number) =>
    Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
  if (input.steps !== undefined && !whole(input.steps, 1, STEPS_MAX)) return null;
  if (input.angle !== undefined && !whole(input.angle, 0, 360)) return null;
  return {
    seed: encodePalette(palette),
    style: (input.style as Style | undefined) ?? DEFAULT_STYLE,
    steps: Math.max(
      STEPS_MIN,
      palette.anchors.length,
      (input.steps as number | undefined) ?? DEFAULT_STEPS
    ),
    angle: (input.angle as number | undefined) ?? DEFAULT_ANGLE
  };
}

const TOP_LEVEL = [
  "newest",
  "oldest",
  "saved",
  "collections",
  "palettes",
  "search",
  "login",
  "connect",
  "oauth",
  "settings",
  "unsubscribe",
  "newsletter",
  "bindings",
  "mcp-server",
  "about",
  "privacy",
  "terms",
  "contact",
  "random",
  "api",
  "assets",
  "fonts",
  "e",
  "mcp",
  "edit",
  "import",
  "sitemap",
  "robots",
  "llms"
];
const RESERVED = new Set([
  "mine",
  "popular",
  "new",
  "suggest",
  ...TOP_LEVEL,
  "og",
  "i18n",
  "cdn-cgi",
  "en",
  ...LOCALE_SEGMENTS
]);
const SLUG = /^(?:@[a-z0-9_-]{3,30}\/)?[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A collection's address: lowercase words and digits joined by hyphens, never a page's name or a seed. */
export const isCollectionSlug = (slug: string) =>
  slug.length <= SLUG_MAX && !RESERVED.has(slug) && SLUG.test(slug) && !decodePalette(slug);

/** A title as an address. */
export const slugify = (title: string) =>
  title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");

/** A search's words as every list's address writes them: one space between words, lowercase, at most 100 characters,
    or a palette's seed in its own case. */
export function normalizeListQuery(raw: string | null | undefined): string {
  const q = (raw ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (!q || q.length > 100 || /\p{Cc}/u.test(q)) return "";
  return canonicalPaletteSeed(q) ?? q.toLowerCase();
}

const TAG = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} -]*$/u;

/** A collection's words and palettes as a writer sends them, over `base` where one exists. */
export function validateCollection(
  fields: Record<string, unknown>,
  base?: CollectionInput
): { ok: true; input: CollectionInput } | { ok: false; error: string } {
  const title =
    fields.title === undefined && base ? base.title : line(fields.title, COLLECTION_TITLE_MAX);
  if (!title) return { ok: false, error: `A title is 1 to ${COLLECTION_TITLE_MAX} characters.` };
  const description =
    fields.description === undefined && base
      ? base.description
      : line(fields.description, DESCRIPTION_MAX);
  if (description === null)
    return { ok: false, error: `A description is at most ${DESCRIPTION_MAX} characters.` };
  const sentTags = fields.tags === undefined ? (base?.tags ?? []) : fields.tags;
  if (!Array.isArray(sentTags) || sentTags.length > TAGS_MAX)
    return { ok: false, error: `A collection takes at most ${TAGS_MAX} tags.` };
  const tags = [
    ...new Set(
      sentTags.map(tag =>
        typeof tag === "string"
          ? tag.toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim()
          : ""
      )
    )
  ];
  if (tags.some(tag => tag.length < 2 || tag.length > 32 || !TAG.test(tag)))
    return { ok: false, error: "A tag is 2 to 32 letters, digits, spaces or hyphens." };
  const visibility =
    fields.visibility === "public" || fields.visibility === "private"
      ? fields.visibility
      : (base?.visibility ?? "private");
  const sentItems = fields.items === undefined ? (base?.items ?? []) : fields.items;
  if (!Array.isArray(sentItems) || sentItems.length < 1 || sentItems.length > MAX_COLLECTION_ITEMS)
    return { ok: false, error: `A collection holds 1 to ${MAX_COLLECTION_ITEMS} palettes.` };
  const items: CollectionItemInput[] = [];
  for (const sent of sentItems) {
    const item = collectionItem(sent);
    if (!item)
      return { ok: false, error: "A palette is a seed, with any style, steps or angle valid." };
    items.push(item);
  }
  return { ok: true, input: { title, description, tags, visibility, items } };
}

/* —— Collections, read (expected: server/collections/read.ts) —— */

export interface CollectionRecord {
  id: string;
  slug: string;
  owner: CollectionOwner;
  input: CollectionInput;
}
export interface CollectionSummary {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  itemCount: number;
  visibility: "public" | "private";
  updatedAt: number;
  /** its first palettes in order, each in its view there */
  preview: CollectionItemInput[];
}
export interface CollectionItem extends CollectionItemInput {
  kseed: string;
  likes: number;
  createdAt: number | null;
  fit?: { up: number; down: number };
}
export interface CollectionDocument extends CollectionSummary {
  items: CollectionItem[];
}

interface CollectionRow {
  id: string;
  slug: string;
  owner_kind: "user" | "agent";
  owner_id: string;
  title: string;
  description: string;
  tags: string;
  visibility: "public" | "private";
  item_count: number;
  updated_at: number;
}
const COLLECTION_COLUMNS =
  "id, slug, owner_kind, owner_id, title, description, tags, visibility, item_count, updated_at";
const tagsOf = (raw: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
};

async function itemsOf(env: DB, ids: readonly string[]) {
  const rows = ids.length
    ? await all<{
        collection_id: string;
        seed: string;
        style: Style;
        steps: number;
        angle: number;
        created_at: number | null;
        likes: number;
      }>(
        env.DB,
        `SELECT i.collection_id, i.seed, i.style, i.steps, i.angle, i.created_at, COALESCE(p.likes_count, 0) AS likes
         FROM k_collection_items i LEFT JOIN k_palettes p ON p.seed = i.seed
         WHERE i.collection_id IN (SELECT value FROM json_each(?)) ORDER BY i.collection_id, i.position`,
        JSON.stringify(ids)
      )
    : [];
  const byCollection = new Map<string, CollectionItem[]>();
  for (const row of rows) {
    const item: CollectionItem = {
      kseed: row.seed,
      seed: row.seed,
      style: row.style,
      steps: Number(row.steps),
      angle: Number(row.angle),
      likes: Number(row.likes),
      createdAt: row.created_at === null ? null : Number(row.created_at)
    };
    byCollection.set(row.collection_id, [...(byCollection.get(row.collection_id) ?? []), item]);
  }
  return byCollection;
}

const summaryOf = (
  row: CollectionRow,
  items: readonly CollectionItem[],
  preview: number
): CollectionSummary => ({
  slug: row.slug,
  title: row.title,
  description: row.description,
  tags: tagsOf(row.tags),
  itemCount: Number(row.item_count),
  visibility: row.visibility,
  updatedAt: Number(row.updated_at),
  preview: items
    .slice(0, preview)
    .map(({ seed, style, steps, angle }) => ({ seed, style, steps, angle }))
});

/** A collection by its address, with its words and palettes, whoever owns it; null for none. */
export async function collectionRecord(env: DB, slug: string): Promise<CollectionRecord | null> {
  const row = await first<CollectionRow>(
    env.DB,
    `SELECT ${COLLECTION_COLUMNS} FROM k_collections WHERE slug = ?`,
    slug
  );
  if (!row) return null;
  const items = (await itemsOf(env, [row.id])).get(row.id) ?? [];
  return {
    id: row.id,
    slug: row.slug,
    owner: { kind: row.owner_kind, id: row.owner_id },
    input: {
      title: row.title,
      description: row.description,
      tags: tagsOf(row.tags),
      visibility: row.visibility,
      items: items.map(({ seed, style, steps, angle }) => ({ seed, style, steps, angle }))
    }
  };
}

/** A collection's document: a public one, or with `owner` that owner's own whatever its visibility. */
export async function collectionBySlug(
  env: DB,
  slug: string,
  owner?: CollectionOwner
): Promise<CollectionDocument | null> {
  const row = await first<CollectionRow>(
    env.DB,
    `SELECT ${COLLECTION_COLUMNS} FROM k_collections WHERE slug = ?
     AND (visibility = 'public' OR (owner_kind = ? AND owner_id = ?))`,
    slug,
    owner?.kind ?? "",
    owner?.id ?? ""
  );
  if (!row) return null;
  const items = (await itemsOf(env, [row.id])).get(row.id) ?? [];
  return { ...summaryOf(row, items, 6), items };
}

async function collectionPage(
  env: DB,
  where: string,
  bind: (string | number)[],
  order: string,
  page: number,
  limit: number,
  preview: number
) {
  const [total, rows] = await Promise.all([
    first<{ n: number }>(env.DB, `SELECT COUNT(*) AS n FROM k_collections WHERE ${where}`, ...bind),
    all<CollectionRow>(
      env.DB,
      `SELECT ${COLLECTION_COLUMNS} FROM k_collections WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
      ...bind,
      limit,
      (page - 1) * limit
    )
  ]);
  const items = preview
    ? await itemsOf(
        env,
        rows.map(row => row.id)
      )
    : new Map();
  return {
    total: Number(total?.n ?? 0),
    page,
    limit,
    items: rows.map(row => summaryOf(row, items.get(row.id) ?? [], preview))
  };
}

/** An owner's collections, latest change first. */
export const ownerCollections = (
  env: DB,
  owner: CollectionOwner,
  at: { page?: number; limit: number }
) =>
  collectionPage(
    env,
    "owner_kind = ? AND owner_id = ?",
    [owner.kind, owner.id],
    "updated_at DESC, id",
    at.page ?? 1,
    at.limit,
    0
  );

/** The public collections, most liked first, or those whose words hold `query`. Stands in for the collection search
    (server/collections/search.ts), which reads what a collection means. */
export const publicCollections = (env: DB, at: { query: string; page?: number; limit: number }) =>
  collectionPage(
    env,
    `visibility = 'public'${at.query ? " AND instr(search_text, ?) > 0" : ""}`,
    at.query ? [at.query.toLowerCase()] : [],
    "likes_sum DESC, updated_at DESC, id",
    at.page ?? 1,
    at.limit,
    6
  );

/** The public collections that hold each palette, up to `max` each, most saved first. */
export async function collectionsHoldingEach(env: DB, seeds: readonly string[], max: number) {
  const rows = seeds.length
    ? await all<{ seed: string; slug: string }>(
        env.DB,
        `SELECT DISTINCT i.seed, c.slug FROM k_collection_items i JOIN k_collections c ON c.id = i.collection_id
         WHERE c.visibility = 'public' AND i.seed IN (SELECT value FROM json_each(?))
         ORDER BY c.fork_count DESC, c.slug`,
        JSON.stringify([...new Set(seeds)])
      )
    : [];
  const held = new Map<string, { slug: string }[]>();
  for (const row of rows) {
    const list = held.get(row.seed) ?? [];
    if (list.length < max) held.set(row.seed, [...list, { slug: row.slug }]);
  }
  return held;
}

/** Grabient's collections that hold a palette, with its place and view in each. */
export async function agentCollectionsHolding(env: DB, seed: string) {
  const rows = await all<{
    id: string;
    slug: string;
    title: string;
    style: Style;
    steps: number;
    angle: number;
    position: number;
  }>(
    env.DB,
    `SELECT c.id, c.slug, c.title, i.style, i.steps, i.angle, i.position FROM k_collection_items i
     JOIN k_collections c ON c.id = i.collection_id WHERE c.owner_kind = 'agent' AND i.seed = ? ORDER BY c.slug`,
    seed
  );
  return rows.map(row => ({
    ...row,
    steps: Number(row.steps),
    angle: Number(row.angle),
    position: Number(row.position)
  }));
}

export async function ownCollectionCount(env: DB, userId: string): Promise<number> {
  const row = await first<{ n: number }>(
    env.DB,
    "SELECT COUNT(*) AS n FROM k_collections WHERE owner_kind = 'user' AND owner_id = ?",
    userId
  );
  return Math.min(MAX_OWN_COLLECTIONS, Number(row?.n ?? 0));
}

export const ownCollectionsFull = async (env: DB, userId: string) =>
  (await ownCollectionCount(env, userId)) >= MAX_OWN_COLLECTIONS;

/** The admins' notes on a collection, newest first. */
export async function listNotes(env: DB, collectionId: string) {
  const rows = await all<{
    text: string;
    created_at: number;
    username: string | null;
    name: string | null;
  }>(
    env.DB,
    `SELECT n.text, n.created_at, u.username, u.name FROM k_collection_notes n LEFT JOIN auth_user u ON u.id = n.author_id
     WHERE n.collection_id = ? ORDER BY n.created_at DESC`,
    collectionId
  );
  return rows.map(row => ({
    text: row.text,
    createdAt: Number(row.created_at),
    author: row.name?.trim() || (row.username ? `@${row.username}` : "Admin")
  }));
}

/* —— Collections, written (expected: server/collections/write.ts and curation.ts) —— */

/** The address a collection is made at was taken meanwhile. */
export class SlugTaken extends Error {}

const ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function newId(length = 20): string {
  let out = "";
  for (const byte of crypto.getRandomValues(new Uint8Array(length)))
    out += ID_ALPHABET[byte % ID_ALPHABET.length];
  return out;
}
const searchText = (input: CollectionInput) =>
  [input.title, input.description, ...input.tags].join(" ").toLowerCase();
const itemStatements = (
  id: string,
  items: readonly CollectionItemInput[],
  from: number,
  now: number
): Statement[] =>
  items.map((item, i) => [
    `INSERT OR IGNORE INTO k_collection_items (collection_id, position, seed, style, steps, angle, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    from + i,
    item.seed,
    item.style,
    item.steps,
    item.angle,
    now
  ]);

/** A new collection at `slug`, or at its title's address with a short word after it where that is taken. Stands in for
    the collection writer, which gives an account's private collection its address under the account. */
export async function createCollection(
  env: DB,
  owner: CollectionOwner,
  input: CollectionInput,
  options: { slug?: string } = {}
): Promise<{ slug: string; itemCount: number }> {
  if (owner.kind === "user") throw new NotWired("Making an account's collection");
  const base = slugify(input.title) || "collection";
  const slug =
    options.slug ??
    ((await collectionRecord(env, base)) || !isCollectionSlug(base) ? `${base}-${newId(5)}` : base);
  const id = newId();
  const now = Date.now();
  try {
    await batch(env.DB, [
      [
        `INSERT INTO k_collections (id, slug, owner_kind, owner_id, title, description, tags, visibility, item_count,
           search_text, created_at, updated_at, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        slug,
        owner.kind,
        owner.id,
        input.title,
        input.description,
        JSON.stringify(input.tags),
        input.visibility,
        input.items.length,
        searchText(input),
        now,
        now,
        input.visibility === "public" ? now : null
      ],
      ...itemStatements(id, input.items, 0, now)
    ]);
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw new SlugTaken(slug);
    throw error;
  }
  return { slug, itemCount: input.items.length };
}

/** The palettes a collection lacks, appended at its end: nothing it holds moves or leaves. */
export async function appendCollectionItems(
  env: DB,
  id: string,
  items: readonly CollectionItemInput[]
): Promise<{ added: number; held: number }> {
  const held = await all<{ seed: string; position: number }>(
    env.DB,
    "SELECT seed, position FROM k_collection_items WHERE collection_id = ?",
    id
  );
  const has = new Set(held.map(row => row.seed));
  const fresh = items
    .filter(item => !has.has(item.seed))
    .slice(0, Math.max(0, MAX_COLLECTION_ITEMS - held.length));
  if (!fresh.length) return { added: 0, held: items.length };
  const now = Date.now();
  const from = held.reduce((most, row) => Math.max(most, Number(row.position) + 1), 0);
  await batch(env.DB, [
    ...itemStatements(id, fresh, from, now),
    [
      "UPDATE k_collections SET item_count = (SELECT COUNT(*) FROM k_collection_items WHERE collection_id = ?), updated_at = ? WHERE id = ?",
      id,
      now,
      id
    ]
  ]);
  return { added: fresh.length, held: items.length - fresh.length };
}

export async function updateCollection(
  _env: DB,
  _id: string,
  _input: CollectionInput,
  _options: { slug?: string; owner?: CollectionOwner } = {}
): Promise<boolean> {
  throw new NotWired("Changing a collection");
}
/** The address a private collection moves to when its title changes, or null to stay. */
export async function addressAfter(
  _env: DB,
  _record: CollectionRecord,
  _input: CollectionInput
): Promise<string | null> {
  throw new NotWired("A renamed collection's address");
}
export async function deleteAccountCollection(
  _env: DB,
  _id: string,
  _userId: string
): Promise<boolean> {
  throw new NotWired("Deleting a collection");
}
export async function replacePalette(
  _env: DB,
  _from: string,
  _to: string,
  _adminId: string,
  _standing: PaletteStanding
): Promise<boolean> {
  throw new NotWired("Replacing a palette");
}
export async function deleteGalleryPalette(
  _env: DB,
  _seed: string,
  _adminId: string
): Promise<boolean> {
  throw new NotWired("Deleting a gallery palette");
}
export async function setGalleryPaletteView(
  _env: DB,
  _seed: string,
  _view: CollectionItemInput,
  _adminId: string
): Promise<boolean> {
  throw new NotWired("Redrawing a gallery palette");
}
export async function setAgentCollectionPaletteView(
  _env: DB,
  _collectionId: string,
  _seed: string,
  _view: CollectionItemInput,
  _adminId: string
): Promise<boolean> {
  throw new NotWired("Redrawing a collection's palette");
}
export async function removeAgentCollectionPalette(
  _env: DB,
  _collectionId: string,
  _seed: string,
  _adminId: string
): Promise<boolean> {
  throw new NotWired("Taking a palette out of a collection");
}

/** An app's collection change: the account's hour and day, which its pages share, then the apps' day. */
export const collectionWriteLimits = (userId: string): LimitCheck[] => [
  [`collections:${userId}`, ["collectionWrite", "collectionWriteDaily"]],
  ["mcp-collections", "mcpCollectionWritesSite"]
];

/* —— The gallery and likes (expected: server/gallery/list.ts and server/likes.ts) —— */

export interface GalleryRow {
  seed: string;
  style: Style;
  steps: number;
  angle: number;
  likes: number;
  createdAt: number;
}
const galleryOf = (row: {
  seed: string;
  style: Style;
  steps: number;
  angle: number;
  likes_count: number;
  created_at: number;
}): GalleryRow => ({
  seed: row.seed,
  style: row.style,
  steps: Number(row.steps),
  angle: Number(row.angle),
  likes: Number(row.likes_count),
  createdAt: Number(row.created_at)
});

/** The gallery's rows of these palettes. */
export async function knownPaletteItems(
  env: DB,
  seeds: readonly string[]
): Promise<Map<string, GalleryRow>> {
  const rows = seeds.length
    ? await all<{
        seed: string;
        style: Style;
        steps: number;
        angle: number;
        likes_count: number;
        created_at: number;
      }>(
        env.DB,
        "SELECT seed, style, steps, angle, likes_count, created_at FROM k_palettes WHERE seed IN (SELECT value FROM json_each(?))",
        JSON.stringify([...new Set(seeds)])
      )
    : [];
  return new Map(rows.map(row => [row.seed, galleryOf(row)]));
}

export const galleryPalette = async (env: DB, seed: string) =>
  (await knownPaletteItems(env, [seed])).get(seed) ?? null;

/** The view Grabient shows each palette in: the gallery's row, else the oldest public collection that holds it. */
export async function searchableItems(
  env: DB,
  seeds: readonly string[]
): Promise<Map<string, ViewGiven>> {
  if (!seeds.length) return new Map();
  const asked = JSON.stringify([...new Set(seeds)]);
  const rows = await all<{ seed: string; style: Style; steps: number; angle: number }>(
    env.DB,
    `SELECT seed, style, steps, angle FROM k_palettes WHERE seed IN (SELECT value FROM json_each(?1))
     UNION ALL
     SELECT seed, style, steps, angle FROM (
       SELECT i.seed, i.style, i.steps, i.angle, ROW_NUMBER() OVER (PARTITION BY i.seed ORDER BY c.created_at, c.id) AS n
       FROM k_collection_items i JOIN k_collections c ON c.id = i.collection_id
       WHERE c.visibility = 'public' AND i.seed IN (SELECT value FROM json_each(?1))
         AND i.seed NOT IN (SELECT seed FROM k_palettes)
     ) WHERE n = 1`,
    asked
  );
  return new Map(
    rows.map(row => [
      row.seed,
      { style: row.style, steps: Number(row.steps), angle: Number(row.angle) }
    ])
  );
}

export type GallerySort = "popular" | "rising" | "newest" | "hot";
const GALLERY_ORDER: Record<GallerySort, string> = {
  popular: "likes_count DESC, created_at DESC, seed",
  rising: "rising DESC, created_at DESC, seed",
  newest: "created_at DESC, seed",
  hot: "hot DESC, likes_count DESC, seed"
};

/** A page of the public gallery. */
export async function listPalettes(
  env: DB,
  at: { sort: GallerySort; page?: number; limit: number }
) {
  const page = at.page ?? 1;
  const [total, rows] = await Promise.all([
    first<{ n: number }>(env.DB, "SELECT COUNT(*) AS n FROM k_palettes"),
    all<{ seed: string; style: Style; steps: number; angle: number; likes_count: number }>(
      env.DB,
      `SELECT seed, style, steps, angle, likes_count FROM k_palettes ORDER BY ${GALLERY_ORDER[at.sort]} LIMIT ? OFFSET ?`,
      at.limit,
      (page - 1) * at.limit
    )
  ]);
  return {
    total: Number(total?.n ?? 0),
    page,
    limit: at.limit,
    items: rows.map(row => ({
      kseed: row.seed,
      style: row.style,
      steps: Number(row.steps),
      angle: Number(row.angle),
      likes: Number(row.likes_count)
    }))
  };
}

/** Lists palettes in the gallery; a palette already there keeps its row. */
export async function publishPalettes(
  env: DB,
  items: readonly CollectionItemInput[]
): Promise<void> {
  if (!items.length) return;
  const now = Date.now();
  await batch(
    env.DB,
    items.map(
      (item): Statement => [
        "INSERT INTO k_palettes (seed, style, steps, angle, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(seed) DO NOTHING",
        item.seed,
        item.style,
        item.steps,
        item.angle,
        now
      ]
    )
  );
}

/** Of these palettes, the ones a person liked: an account that is none of the personas, or grabient.com's readers,
    whose likes came over as a count. One JSON list a query, so a whole collection is read. */
export async function likedByPeople(env: DB, seeds: readonly string[]): Promise<Set<string>> {
  const liked = new Set<string>();
  for (let at = 0; at < seeds.length; at += 96) {
    const asked = JSON.stringify(seeds.slice(at, at + 96));
    const rows = await all<{ seed: string }>(
      env.DB,
      `SELECT seed FROM k_palettes WHERE seed IN (SELECT value FROM json_each(?1)) AND legacy_likes_count > 0
       UNION SELECT palette_id AS seed FROM k_likes WHERE palette_id IN (SELECT value FROM json_each(?1))
       AND user_id NOT IN (SELECT user_id FROM k_personas)`,
      asked
    );
    for (const row of rows) liked.add(row.seed);
  }
  return liked;
}

/** Where a palette stands for a curation: the gallery's row, and Grabient's collections that hold it. */
export type PaletteStanding = {
  gallery: GalleryRow | null;
  collections: Awaited<ReturnType<typeof agentCollectionsHolding>>;
};
export async function paletteStanding(env: DB, seed: string): Promise<PaletteStanding> {
  const [gallery, collections] = await Promise.all([
    galleryPalette(env, seed),
    agentCollectionsHolding(env, seed)
  ]);
  return { gallery, collections };
}

/** Saved palettes counted as the Saved page counts them, at most a thousand. */
export async function savedCount(env: DB, userId: string): Promise<number> {
  const row = await first<{ n: number }>(
    env.DB,
    "SELECT COUNT(*) AS n FROM (SELECT 1 FROM k_likes WHERE user_id = ? LIMIT 1000)",
    userId
  );
  return Number(row?.n ?? 0);
}

/** An app's save: the account's minute and day, which its hearts share, then the apps' day. */
export const likeLimits = (userId: string): LimitCheck[] => [
  [`user:${userId}`, ["toggleLike", "toggleLikeDaily"]],
  ["mcp-likes", "mcpLikesDaily"]
];
/** An app's save of a palette new to the site, which joins the public gallery unreviewed: fifty a day an account. */
export const publishLimits = (userId: string): LimitCheck[] => [
  [`user:${userId}`, "mcpPublishDaily"]
];

export interface LikeInput extends CollectionItemInput {
  liked: boolean;
  /** how the like was made, kept for an admin's like alone */
  via: string;
  /** the view a public collection holds it in, where the palette is new to the gallery */
  shown?: ViewGiven;
  title?: string;
}
export interface LikeResult {
  liked: boolean;
  change: "added" | "removed" | "kept";
  style: Style | null;
  steps: number | null;
  angle: number | null;
  likesCount: number | null;
  inGallery: boolean;
  /** this like brought the palette into the gallery */
  joined: boolean;
}

/** An account's like, set or taken away: a palette new to the gallery joins it with its first like, and a like kept
    keeps its first view. Stands in for the site's own (server/likes.ts), which also moves the hot and rising scores. */
export async function setLike(
  env: DB,
  account: { id: string; role: string },
  input: LikeInput
): Promise<LikeResult> {
  const now = Date.now();
  if (!input.liked) {
    const removed = await run(
      env.DB,
      "DELETE FROM k_likes WHERE user_id = ? AND palette_id = ?",
      account.id,
      input.seed
    );
    const count = await recount(env, input.seed);
    return {
      liked: false,
      change: removed.changes ? "removed" : "kept",
      style: null,
      steps: null,
      angle: null,
      likesCount: count,
      inGallery: count !== null,
      joined: false
    };
  }
  const view = { ...input, ...(input.shown ?? {}) };
  const [joined, liked] = await batch(env.DB, [
    [
      "INSERT INTO k_palettes (seed, style, steps, angle, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(seed) DO NOTHING",
      input.seed,
      view.style ?? input.style,
      view.steps ?? input.steps,
      view.angle ?? input.angle,
      now
    ],
    [
      `INSERT INTO k_likes (user_id, palette_id, steps, style, angle, created_at, via, title) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, palette_id) DO UPDATE SET title = COALESCE(excluded.title, k_likes.title)`,
      account.id,
      input.seed,
      input.steps,
      input.style,
      input.angle,
      now,
      account.role === "admin" ? input.via : null,
      input.title ?? null
    ]
  ]);
  const kept = await first<{ style: Style; steps: number; angle: number }>(
    env.DB,
    "SELECT style, steps, angle FROM k_likes WHERE user_id = ? AND palette_id = ?",
    account.id,
    input.seed
  );
  return {
    liked: true,
    change: liked?.meta.changes ? "added" : "kept",
    style: kept?.style ?? input.style,
    steps: kept ? Number(kept.steps) : input.steps,
    angle: kept ? Number(kept.angle) : input.angle,
    likesCount: await recount(env, input.seed),
    inGallery: true,
    joined: Boolean(joined?.meta.changes)
  };
}
async function recount(env: DB, seed: string): Promise<number | null> {
  await run(
    env.DB,
    "UPDATE k_palettes SET likes_count = legacy_likes_count + (SELECT COUNT(*) FROM k_likes WHERE palette_id = ?) WHERE seed = ?",
    seed,
    seed
  );
  const row = await first<{ likes_count: number }>(
    env.DB,
    "SELECT likes_count FROM k_palettes WHERE seed = ?",
    seed
  );
  return row ? Number(row.likes_count) : null;
}

/* —— Search (expected: server/search/*, server/tags/*, server/palette-use.ts) —— */

/** The most characters of words a search reads. */
export const QUERY_MAX = 100;
export interface SearchItem {
  kseed: string;
  style: Style;
  steps: number;
  angle: number;
  likes: number;
}
export interface SearchResult {
  query: string;
  read: { phrases: string[]; unread: string[]; excluded: string[] };
  total: number;
  items: SearchItem[];
  /** colors asked for that no palette comes near */
  far?: string[];
  /** how the search answered: `unavailable` when it could not load its index, `account` when only the model could read the words */
  tier: "unavailable" | "words" | "account" | "palette" | "colors";
  /** the model is at its limit */
  limited?: boolean;
  retryAfter?: number;
}

/** The site's search, as the gallery's search field asks it. Stands in until the search's module is wired: it answers
    that its index is not available. */
export async function searchPalettes(
  _env: Env,
  query: string,
  _options: {
    limit: number;
    offset: number;
    request: Request;
    ctx: ExecutionContext;
    who: string;
    self: boolean;
    colors: string[];
  }
): Promise<SearchResult> {
  if (query.length > 400) throw new RangeError("query");
  return {
    query,
    read: { phrases: [], unread: [], excluded: [] },
    total: 0,
    items: [],
    tier: "unavailable"
  };
}
/** An old grabient.com id only its page can read. */
export const unreadPalette = (query: string) => query.startsWith("_");
/** A typed search counted once a day per account for the readers' tags (server/search/counts.ts). */
export async function countSearch(
  _env: Env,
  _page: string,
  _words: string,
  _who: string
): Promise<void> {}

/** The search's vocabulary, which the tags and the demand read; null while it is not wired. */
export async function loadVocabulary(_env: Env): Promise<unknown | null> {
  return null;
}
export type Counted = { day: number; page: string; words: string; count: number };
export const rankSearches = (_vocabulary: unknown, _counts: unknown): { words: string }[] => [];
export const tally = (rows: readonly Counted[], _today: number) => rows;
export const leadRow = (_vocabulary: unknown, _lists: unknown): string[] => [];
export const risingSearches = (_rows: readonly Counted[], _today: number): unknown[] => [];
export const popularSearches = async (_env: Env, _n: number): Promise<{ query: string }[]> => [];
export const popularLists = async (_env: Env, _now: number): Promise<unknown> => ({});
export const forgetPopular = (_env: Env) => {};
export interface Scheduled {
  id: string;
  words: string;
  startsAt: number;
  endsAt: number;
  label: string;
}
export const SCHEDULE_MAX = 48;
export const SCHEDULE_AHEAD_DAYS = 400;
export const SCHEDULE_DEFAULT_DAYS = 7;
export const SCHEDULE_SPAN_DAYS = 120;
export async function scheduleSearches(
  _env: Env,
  _userId: string,
  _entries: Record<string, unknown>[],
  _label: string,
  _now: number
): Promise<{ scheduled: number; refused: { words: string; why: string; nearest?: string[] }[] }> {
  throw new NotWired("Scheduling the tags under the search");
}
export const listScheduled = async (_env: Env, _now: number): Promise<Scheduled[]> => [];
export async function removeScheduled(
  _env: Env,
  _target: { ids: string[]; label?: string }
): Promise<number> {
  throw new NotWired("Removing scheduled tags");
}

/** What readers did with the public palettes in a window, counted with no address, account or cookie. */
export interface UseRecord {
  uses: {
    seed: string;
    action: string;
    format: string;
    surface: string;
    collection: string;
    words?: string;
    position: number;
    view: string;
    count: number;
  }[];
  edits: {
    seed: string;
    collection: string;
    n: number;
    anchors: number;
    meanL: number;
    rangeL: number;
    meanC: number;
    maxC: number;
    hueSpan: number;
  }[];
  collectionViews: { day: number; slug: string; count: number }[];
  truncated: boolean;
}
export const useRecord = async (_env: Env, _at: { days: number }): Promise<UseRecord> => ({
  uses: [],
  edits: [],
  collectionViews: [],
  truncated: false
});
export interface SearchUseRecord {
  ranked: { rank: number; words: string; score?: number }[];
  counted: { page: string; words: string; count: number; used: number }[];
  unread: { page: string; words: string; count: number }[];
  votes: { words: string; seed: string; up: number; down: number }[];
}
export const searchRecord = async (_env: Env, _at: { days: number }): Promise<SearchUseRecord> => ({
  ranked: [],
  counted: [],
  unread: [],
  votes: []
});
export const signalSite = async (_env: Env, _seeds: readonly string[]) => ({
  collections: [],
  gallery: []
});
