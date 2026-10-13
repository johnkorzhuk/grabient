import { all, batch, first, type Param, run, type Statement } from "@grabient/server/db/d1.ts";
import type { LimitCheck } from "@grabient/server/limits/check.ts";
import {
  accountHandle,
  isCollectionSlug,
  isPrivateSlug,
  itemKey,
  privateSlug,
  slugifyTitle
} from "../../features/collections/address.ts";
import {
  type CollectionInput,
  type CollectionItemInput,
  MAX_COLLECTION_ITEMS,
  MAX_OWN_COLLECTIONS
} from "../../features/collections/schema.ts";
import type { CollectionDocument } from "../../features/collections/types.ts";
import { folded } from "./letters.ts";
import {
  type CollectionOwner,
  type CollectionRecord,
  collectionBySlug,
  type Reader
} from "./read.ts";
import { scoreArrival } from "./scores.ts";
import { forgetTitles } from "./search.ts";

/* Writing collections: a new one, a change, palettes added, a deletion. Each is one batch, which D1 runs as one
   transaction. A write that names its owner holds every statement to that owner's collection, so a caller that did
   not check whose it holds changes nothing of another's. A private collection lives at its title's address under its
   owner, so a new title moves it; a public one keeps its address, since others hold its links. */

type Writer = { DB: D1Database };

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
/** A random word of the letters and digits no one misreads. */
export function randomWord(length: number): string {
  let out = "";
  for (const byte of crypto.getRandomValues(new Uint8Array(length)))
    out += ALPHABET[byte % ALPHABET.length];
  return out;
}

/** The words a search compares, folded: the title, the description and the tags. */
const searchText = (input: Pick<CollectionInput, "title" | "description" | "tags">) =>
  folded([input.title, input.description, ...input.tags].join(" "));

/** An address another collection took between the read and the write. */
export class SlugTaken extends Error {
  readonly slug: string;
  constructor(slug: string) {
    super("That address is taken.");
    this.slug = slug;
  }
}
export const isUniqueError = (error: unknown) =>
  /UNIQUE|constraint/i.test(error instanceof Error ? error.message : String(error));

const slugHeld = async (env: Reader, slug: string) =>
  !!(await first(env.DB, "SELECT 1 AS held FROM k_collections WHERE slug = ?", slug));

/** The handle an account's private collections live under. */
export async function ownerHandle(env: Reader, userId: string): Promise<string> {
  const row = await first<{ username: string | null }>(
    env.DB,
    "SELECT username FROM auth_user WHERE id = ?",
    userId
  );
  return accountHandle({ id: userId, username: row?.username });
}

/** The first free private address of a title under an account. `keep` is an address the collection holds now, which
    stays its own. */
export async function privateAddress(
  env: Reader,
  userId: string,
  title: string,
  keep?: string
): Promise<string> {
  const handle = await ownerHandle(env, userId);
  const base = privateSlug(title, handle, () => false);
  /* the title's address and its numbered ones stand together in the index of addresses, from the address itself to the
     last that begins with it and a hyphen ('.' follows '-'): one range of the index */
  const held = new Set(
    (
      await all<{ slug: string }>(
        env.DB,
        "SELECT slug FROM k_collections WHERE slug >= ? AND slug < ?",
        base,
        `${base}.`
      )
    ).map(row => row.slug)
  );
  return privateSlug(title, handle, slug => slug !== keep && held.has(slug));
}

/** Where an account's collection lives after a change, or undefined where it stays. A private one lives at its
    title's address under its owner: a new title moves it, to the address a browser proposes (made offline) when that is
    this title's and free, else to the first free one. One made public takes its title's own top-level address, or that
    and a short word when the title's is taken. */
export async function addressAfter(
  env: Reader,
  record: CollectionRecord,
  next: Pick<CollectionInput, "title" | "visibility">,
  proposed?: string
): Promise<string | undefined> {
  if (record.owner.kind !== "user") return undefined;
  if (next.visibility === "private") {
    const handle = await ownerHandle(env, record.owner.id);
    if (
      proposed &&
      proposed !== record.slug &&
      isCollectionSlug(proposed) &&
      isPrivateSlug(proposed, next.title, handle) &&
      !(await slugHeld(env, proposed))
    )
      return proposed;
    if (record.input.visibility === "private" && isPrivateSlug(record.slug, next.title, handle))
      return undefined;
    return privateAddress(env, record.owner.id, next.title, record.slug);
  }
  if (record.input.visibility === "public") return undefined;
  const own = slugifyTitle(next.title);
  if (isCollectionSlug(own) && !(await slugHeld(env, own))) return own;
  for (let attempt = 0; attempt < 4; attempt++) {
    const word = `${own}-${randomWord(4)}`;
    if (isCollectionSlug(word) && !(await slugHeld(env, word))) return word;
  }
  return undefined;
}

/** An account's handle changed (a username set or changed): every private collection under the old one moves under
    the new, at the same title's address, or the next free one where the new holds it already. */
export async function moveAccountAddresses(
  env: Writer,
  userId: string,
  from: string,
  to: string
): Promise<number> {
  if (from === to) return 0;
  const rows = await all<{ id: string; slug: string; title: string }>(
    env.DB,
    `SELECT id, slug, title FROM k_collections WHERE owner_kind = 'user' AND owner_id = ?
       AND visibility = 'private' AND substr(slug, 1, ?) = ?`,
    userId,
    from.length + 2,
    `@${from}/`
  );
  for (const row of rows) {
    const wanted = `@${to}/${row.slug.slice(from.length + 2)}`;
    const slug =
      isCollectionSlug(wanted) && !(await slugHeld(env, wanted))
        ? wanted
        : await privateAddress(env, userId, row.title);
    await run(env.DB, "UPDATE k_collections SET slug = ? WHERE id = ?", slug, row.id);
  }
  if (rows.length) forgetTitles();
  return rows.length;
}

/** How many collections an account holds, counted through the owner's index and never past the cap. */
export async function ownCollectionCount(env: Reader, userId: string): Promise<number> {
  const row = await first<{ n: number }>(
    env.DB,
    "SELECT COUNT(*) AS n FROM (SELECT 1 FROM k_collections WHERE owner_kind = 'user' AND owner_id = ? LIMIT ?)",
    userId,
    MAX_OWN_COLLECTIONS
  );
  return Number(row?.n ?? 0);
}
export const ownCollectionsFull = async (env: Reader, userId: string) =>
  (await ownCollectionCount(env, userId)) >= MAX_OWN_COLLECTIONS;

/** An account's collection write, counted before it is made: the account's own by the hour and the day, then a day for
    every account together, which a connected app's writes (`via` mcp) count apart, so a flood through apps stops the
    apps' and never the site's own pages. */
export const collectionWriteLimits = (userId: string, via?: "mcp"): LimitCheck[] => [
  [`collections:${userId}`, ["collectionWrite", "collectionWriteDaily"]],
  via === "mcp"
    ? ["mcp-collections", "mcpCollectionWritesSite"]
    : ["collections-site", "collectionWritesSite"]
];

const itemStatements = (
  id: string,
  items: readonly CollectionItemInput[],
  now: number,
  withRow: boolean
): Statement[] =>
  items.map(
    (item, position): Statement => [
      `INSERT INTO k_collection_items (collection_id, position, seed, style, steps, angle, created_at)
     SELECT ?, ?, ?, ?, ?, ?, ?${withRow ? " WHERE EXISTS (SELECT 1 FROM k_collections WHERE id = ?)" : ""}`,
      id,
      position,
      item.seed,
      item.style,
      item.steps,
      item.angle,
      now,
      ...(withRow ? [id] : [])
    ]
  );

/** Writes a new collection and its palettes in one batch, at `slug` or at an address made for it: a private one under
    its owner, an agent's private one at its title and a word nobody would guess, a public one at its title and a short
    word. A generated address another write took meanwhile is made again. A copy (`forkedFrom`) is written only while
    the account holds no copy of that collection, checked in the write itself: null when it does. */
export async function insertCollection(
  env: Writer,
  owner: CollectionOwner,
  input: CollectionInput,
  options: { slug?: string; forkedFrom?: string; forkedBase?: string } = {}
): Promise<string | null> {
  const now = Date.now();
  const copy = options.forkedFrom ?? null;
  for (let attempt = 0; ; attempt++) {
    const id = randomWord(20);
    const slug =
      options.slug ??
      (input.visibility !== "private"
        ? `${slugifyTitle(input.title)}-${randomWord(5)}`
        : owner.kind === "user"
          ? await privateAddress(env, owner.id, input.title)
          : `${slugifyTitle(input.title)}-${randomWord(8)}`);
    let wrote: number;
    try {
      const [made] = await batch(env.DB, [
        [
          `INSERT INTO k_collections (id, slug, owner_kind, owner_id, title, description, tags, visibility, item_count,
             search_text, created_at, updated_at, published_at, forked_from, forked_base)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${
             copy
               ? " WHERE NOT EXISTS (SELECT 1 FROM k_collections WHERE forked_from = ? AND owner_kind = ? AND owner_id = ?)"
               : ""
           }`,
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
          input.visibility === "public" ? now : null,
          copy,
          options.forkedBase ?? null,
          ...(copy ? [copy, owner.kind, owner.id] : [])
        ],
        ...itemStatements(id, input.items, now, !!copy)
      ]);
      wrote = made?.meta.changes ?? 0;
    } catch (error) {
      if (!isUniqueError(error)) throw error;
      if (options.slug) throw new SlugTaken(options.slug);
      if (attempt >= 2) throw error;
      continue;
    }
    if (!wrote) return null;
    forgetTitles();
    if (input.visibility === "public") await scoreArrival(env, id, now);
    return slug;
  }
}

/** A new collection, as its owner reads it. */
export async function createCollection(
  env: Writer,
  owner: CollectionOwner,
  input: CollectionInput,
  options: { slug?: string } = {}
): Promise<CollectionDocument> {
  const slug = await insertCollection(env, owner, input, options);
  const doc = slug ? await collectionBySlug(env, slug, true) : null;
  if (!doc) throw new Error("The collection was not written");
  return doc;
}

/* the likes of a collection's palettes, each palette once however many views of it the collection holds */
export const LIKES_SUM = `SELECT COALESCE(SUM(p.likes_count), 0) FROM
  (SELECT DISTINCT seed FROM k_collection_items WHERE collection_id = k_collections.id) i
  JOIN k_palettes p ON p.seed = i.seed`;
/** An item row's key, as itemKey writes it. */
export const ITEM_KEY = "seed || ' ' || style || ' ' || steps || ' ' || angle";

/** Replaces every field and writes the palettes as a difference: an item the collection holds keeps its row and the time
    it joined (its place follows the input), a new item joins with this write's time, and an item no longer in the input
    goes. A saved copy's Update and Reset also write its source as it stands (`forkedBase`), and a collection that moves
    takes its new address (`slug`). With `owner`, every statement writes only while the collection is theirs. False when
    nothing was written: no such collection, or not theirs. */
export async function updateCollection(
  env: Writer,
  id: string,
  input: CollectionInput,
  options: { forkedBase?: string; slug?: string; owner?: CollectionOwner } = {}
): Promise<boolean> {
  const now = Date.now();
  const { owner } = options;
  const owned = owner ? " AND owner_kind = ? AND owner_id = ?" : "";
  const whose: Param[] = owner ? [owner.kind, owner.id] : [];
  const ofOwner = owner
    ? " AND EXISTS (SELECT 1 FROM k_collections WHERE id = ? AND owner_kind = ? AND owner_id = ?)"
    : "";
  const through: Param[] = owner ? [id, owner.kind, owner.id] : [];
  /* a collection made public reaches the public lists now: written first, while the row still says who saw it */
  const arriving = input.visibility === "public";
  const statements: Statement[] = [
    ...(arriving
      ? [
          [
            `UPDATE k_collections SET published_at = ? WHERE id = ? AND visibility <> 'public'${owned}`,
            now,
            id,
            ...whose
          ] as Statement
        ]
      : []),
    [
      `UPDATE k_collections SET title = ?, description = ?, tags = ?, visibility = ?, item_count = ?, search_text = ?,
         updated_at = ?${options.slug ? ", slug = ?" : ""} WHERE id = ?${owned}`,
      input.title,
      input.description,
      JSON.stringify(input.tags),
      input.visibility,
      input.items.length,
      searchText(input),
      now,
      ...(options.slug ? [options.slug] : []),
      id,
      ...whose
    ],
    /* the kept items as one JSON value, since a statement binds a hundred values at most */
    [
      `DELETE FROM k_collection_items WHERE collection_id = ? AND ${ITEM_KEY} NOT IN (SELECT value FROM json_each(?))${ofOwner}`,
      id,
      JSON.stringify(input.items.map(itemKey)),
      ...through
    ],
    ...input.items.map(
      (item, position): Statement => [
        `INSERT INTO k_collection_items (collection_id, position, seed, style, steps, angle, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ? WHERE 1${ofOwner}
         ON CONFLICT(collection_id, seed, style, steps, angle) DO UPDATE SET position = excluded.position
           WHERE position IS NOT excluded.position`,
        id,
        position,
        item.seed,
        item.style,
        item.steps,
        item.angle,
        now,
        ...through
      ]
    )
  ];
  /* last, a public collection's likes summed again: the triggers keep the sum of public collections alone, so one made
     public here starts from a private one's zero. Written only when the sum is not already right */
  if (arriving)
    statements.push([
      `UPDATE k_collections SET likes_sum = (${LIKES_SUM})
       WHERE id = ? AND visibility = 'public' AND likes_sum IS NOT (${LIKES_SUM})${owned}`,
      id,
      ...whose
    ]);
  if (options.forkedBase !== undefined)
    statements.push([
      `UPDATE k_collections SET forked_base = ? WHERE id = ?${owned}`,
      options.forkedBase,
      id,
      ...whose
    ]);
  const results = await batch(env.DB, statements);
  forgetTitles();
  if (arriving && results[0]?.meta.changes) await scoreArrival(env, id, now);
  return (results[arriving ? 1 : 0]?.meta.changes ?? 0) > 0;
}

/** Palettes into a collection the site holds, after the ones it holds, with the time they joined: nothing held moves or
    leaves, the words stand, and another view of a palette it holds is no addition (that is a person's choice). What
    Grabient's own publishing does. */
export async function appendCollectionItems(
  env: Writer,
  id: string,
  items: readonly CollectionItemInput[]
): Promise<{ added: number; held: number }> {
  const rows = await all<{ seed: string; position: number }>(
    env.DB,
    "SELECT seed, position FROM k_collection_items WHERE collection_id = ?",
    id
  );
  const seen = new Set(rows.map(row => row.seed));
  const additions: CollectionItemInput[] = [];
  for (const item of items) {
    if (seen.has(item.seed) || rows.length + additions.length >= MAX_COLLECTION_ITEMS) continue;
    seen.add(item.seed);
    additions.push(item);
  }
  if (!additions.length) return { added: 0, held: rows.length };
  const now = Date.now();
  let position = rows.reduce((last, row) => Math.max(last, Number(row.position)), -1);
  await batch(env.DB, [
    ...additions.map(
      (item): Statement => [
        "INSERT INTO k_collection_items (collection_id, position, seed, style, steps, angle, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        id,
        ++position,
        item.seed,
        item.style,
        item.steps,
        item.angle,
        now
      ]
    ),
    [
      "UPDATE k_collections SET item_count = (SELECT COUNT(*) FROM k_collection_items WHERE collection_id = ?), updated_at = ? WHERE id = ?",
      id,
      now,
      id
    ]
  ]);
  forgetTitles();
  return { added: additions.length, held: rows.length };
}

/** The accounts that hold a copy of a collection, as its saves count, counted from the rows rather than added to. A new
    save lifts a public collection's Rising scores. */
export async function recountCopies(env: Writer, id: string, lift = ""): Promise<void> {
  await run(
    env.DB,
    `UPDATE k_collections SET fork_count = held.saves${lift ? `, ${lift}` : ""}
     FROM (SELECT COUNT(DISTINCT f.owner_id) AS saves FROM k_collections f
       WHERE f.forked_from = ? AND f.owner_kind = 'user') held
     WHERE k_collections.id = ?`,
    id,
    id
  );
}

/** Deletes a collection, the account's own, or one of Grabient's for an admin, both checked in the write itself.
    Memberships, notes and votes go with it; the gallery, likes and saved copies stay. `own` holds the delete to the
    account's own whatever its role, for a caller whose deletes are never an admin's curation (a connected app). */
export async function deleteCollection(
  env: Writer,
  id: string,
  userId: string,
  options: { own?: boolean } = {}
): Promise<boolean> {
  const source = await first<{ forked_from: string | null }>(
    env.DB,
    "SELECT forked_from FROM k_collections WHERE id = ?",
    id
  );
  const deleted = await run(
    env.DB,
    `DELETE FROM k_collections WHERE id = ? AND ((owner_kind = 'user' AND owner_id = ?)${
      options.own
        ? ""
        : " OR (owner_kind = 'agent' AND EXISTS (SELECT 1 FROM auth_user WHERE id = ? AND role = 'admin'))"
    })`,
    id,
    userId,
    ...(options.own ? [] : [userId])
  );
  if (!deleted.changes) return false;
  forgetTitles();
  /* a copy that goes takes its account off its source's saves */
  if (source?.forked_from) await recountCopies(env, source.forked_from);
  return true;
}
