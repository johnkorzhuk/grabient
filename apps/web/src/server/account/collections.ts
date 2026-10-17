import { msg } from "@grabient/i18n";
import { all } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { writeRefusal } from "@grabient/server/limits/writes.ts";
import type { SyncCollection, SyncOp } from "../../features/account/wire.ts";
import { isPrivateSlug, itemKey } from "../../features/collections/address.ts";
import {
  type CollectionItemInput,
  MAX_COLLECTION_ITEMS,
  MAX_OWN_COLLECTIONS,
  validateCollection
} from "../../features/collections/schema.ts";
import { removeMembership, restoreMembership } from "../collections/curation.ts";
import {
  type CollectionOwner,
  type CollectionRecord,
  type CollectionRow,
  collectionRecord,
  itemsOf,
  ownedBy,
  previewOf,
  SELECT,
  summaryOf
} from "../collections/read.ts";
import { recordAction } from "../collections/record.ts";
import { readRestoreToken, restoreToken } from "../collections/tokens.ts";
import {
  addressAfter,
  collectionWriteLimits,
  createCollection,
  deleteCollection,
  isUniqueError,
  nameItem,
  ownCollectionsFull,
  ownerHandle,
  SlugTaken,
  updateCollection
} from "../collections/write.ts";
import { done, fromResponse, type Outcome, refused } from "./outcome.ts";

/* The account's own collections as its copy changes them: each change made through the collections' own writes,
   under the rules and limits a page's press meets on the collections' routes, and the account's collections read
   whole for the copy. */

type CollectionOp = Exclude<SyncOp, { op: "like" }>;
/** The account a sync writes for: its id, and whether it is an admin's, read fresh for this sync. */
export interface Writer {
  id: string;
  admin: boolean;
}
/** The account's role, as its limits are counted by. */
export const roleOf = (account: Writer) => (account.admin ? "admin" : "user");

/** The most collections a reset reads, and how many of them are read at once. */
const COLLECTIONS_READ_AT_ONCE = 8;
const IDS_A_READ = 90;

const gone = () => refused(404, msg("That collection isn't yours anymore."));
const full = () =>
  refused(409, msg("Collections hold up to {max} palettes."), {
    max: String(MAX_COLLECTION_ITEMS)
  });
/** What stands before a write: saving paused for every account, then the write's limits, the account's collection
    writes or its palettes taken out and put back. */
async function limited(env: Env, account: Writer, items = false): Promise<Outcome | null> {
  const over = await writeRefusal(
    env,
    roleOf(account),
    items
      ? [[`collection-items:${account.id}`, ["collectionItems", "collectionItemsDaily"]]]
      : collectionWriteLimits(account.id)
  );
  return over && fromResponse(over);
}
async function owned(env: Env, account: Writer, slug: string): Promise<CollectionRecord | null> {
  const record = await collectionRecord(env, slug);
  return record && ownedBy(record, owner(account)) ? record : null;
}
const owner = (account: Writer): CollectionOwner => ({ kind: "user", id: account.id });

/* A new private collection at the address the browser showed it at, kept when it is this title's under this account
   and free; the same address sent again by its owner is the collection made once. Only an admin's may be public. */
async function create(
  env: Env,
  account: Writer,
  op: Extract<CollectionOp, { op: "collection.create" }>
): Promise<Outcome> {
  const over = await limited(env, account);
  if (over) return over;
  const valid = validateCollection({ title: op.title, visibility: op.visibility, items: op.items });
  if (!valid.ok)
    return {
      status: 400,
      body: { error: valid.error, ...(valid.i18n ? { i18n: valid.i18n } : {}) }
    };
  if (await ownCollectionsFull(env, account.id)) {
    return refused(409, msg("You can have up to {max} collections."), {
      max: String(MAX_OWN_COLLECTIONS)
    });
  }
  const input = account.admin ? valid.input : { ...valid.input, visibility: "private" as const };
  const proposed =
    input.visibility === "private" &&
    isPrivateSlug(op.slug, input.title, await ownerHandle(env, account.id))
      ? op.slug
      : undefined;
  try {
    return done({
      slug: (await createCollection(env, owner(account), input, { slug: proposed })).slug
    });
  } catch (error) {
    if (!proposed || !(error instanceof SlugTaken)) throw error;
  }
  const held = await owned(env, account, proposed);
  if (held) return done({ slug: held.slug });
  return done({ slug: (await createCollection(env, owner(account), input)).slug });
}

/* Palettes after the ones the collection holds, each view of a palette once, written as the collection's whole list
   so a palette another device added meanwhile stays. Nothing new adds nothing; past the most it holds is refused. */
async function add(
  env: Env,
  account: Writer,
  slug: string,
  items: readonly CollectionItemInput[]
): Promise<Outcome> {
  const record = await owned(env, account, slug);
  if (!record) return gone();
  const held = new Set(record.input.items.map(itemKey));
  const added = items.filter(item => !held.has(itemKey(item)) && held.add(itemKey(item)));
  if (!added.length) return done();
  if (record.input.items.length + added.length > MAX_COLLECTION_ITEMS) return full();
  const over = await limited(env, account);
  if (over) return over;
  const wrote = await updateCollection(
    env,
    record.id,
    { ...record.input, items: [...record.input.items, ...added] },
    { owner: owner(account) }
  );
  return wrote ? done() : gone();
}

async function remove(
  env: Env,
  account: Writer,
  op: Extract<CollectionOp, { op: "collection.remove" }>
): Promise<Outcome> {
  const record = await owned(env, account, op.slug);
  if (!record) return gone();
  const over = await limited(env, account, true);
  if (over) return over;
  const { allowed, removed } = await removeMembership(
    env,
    "owner",
    record.id,
    op.seed,
    account.id,
    op.view
  );
  if (!allowed) return gone();
  return done(removed ? { restore: await restoreToken(env, account.id, record.id, removed) } : {});
}

/* The undo of a removal: the membership back as its token says it stood, or with no token (its answer was lost) the
   palette at the end, as an add. */
async function restore(
  env: Env,
  account: Writer,
  op: Extract<CollectionOp, { op: "collection.restore" }>
): Promise<Outcome> {
  if (!op.restore) return add(env, account, op.slug, op.item ? [op.item] : []);
  const record = await owned(env, account, op.slug);
  if (!record) return gone();
  const over = await limited(env, account, true);
  if (over) return over;
  const row = await readRestoreToken(env, op.restore, account.id, record.id);
  if (!row || row.seed !== op.seed) return refused(400, msg("This palette can't be put back."));
  const put = await restoreMembership(env, "owner", record.id, row, account.id);
  if (!put.allowed) return gone();
  return put.full ? full() : done();
}

/* Who sees a collection: an admin's change. A private collection lives under its owner and a public one at its
   title's address, so the change moves it. */
async function setVisibility(
  env: Env,
  account: Writer,
  op: Extract<CollectionOp, { op: "collection.update" }>
): Promise<Outcome> {
  const record = await owned(env, account, op.slug);
  if (!record) return gone();
  if (record.input.visibility === op.visibility) return done();
  if (!account.admin) return refused(403, msg("Only admins can change who sees a collection."));
  const over = await limited(env, account);
  if (over) return over;
  const input = { ...record.input, visibility: op.visibility };
  let to = await addressAfter(env, record, input);
  try {
    await updateCollection(env, record.id, input, {
      owner: owner(account),
      ...(to ? { slug: to } : {})
    });
  } catch (error) {
    // another write took the address in between: the next free one
    if (!to || !isUniqueError(error)) throw error;
    to = await addressAfter(env, record, input);
    await updateCollection(env, record.id, input, {
      owner: owner(account),
      ...(to ? { slug: to } : {})
    });
  }
  const now = to ?? record.slug;
  await recordAction(env, {
    actorId: account.id,
    action: "collection.visibility",
    collection: { id: record.id, slug: now, title: record.input.title },
    before: { visibility: record.input.visibility, slug: record.slug },
    after: { visibility: op.visibility, slug: now }
  });
  return done();
}

/* A palette's title in the account's collection, in one view of it: given, changed, or taken away. A palette the
   collection no longer holds there is a quiet success, as a removal already made is. */
async function name(
  env: Env,
  account: Writer,
  op: Extract<CollectionOp, { op: "collection.name" }>
): Promise<Outcome> {
  const record = await owned(env, account, op.slug);
  if (!record) return gone();
  const item = { seed: op.seed, ...op.view };
  if (!record.input.items.some(held => itemKey(held) === itemKey(item))) return done();
  const over = await limited(env, account);
  if (over) return over;
  return (await nameItem(env, record.id, item, op.title || null, owner(account))) ? done() : gone();
}

async function erase(env: Env, account: Writer, slug: string): Promise<Outcome> {
  const record = await owned(env, account, slug);
  if (!record) return refused(404, msg("Not found"));
  const over = await limited(env, account);
  if (over) return over;
  return (await deleteCollection(env, record.id, account.id, { own: true }))
    ? done({ deleted: slug })
    : refused(404, msg("Not found"));
}

/** One change to the account's collections, as the collections' routes would have made it. */
export function applyCollectionOp(env: Env, account: Writer, op: CollectionOp): Promise<Outcome> {
  switch (op.op) {
    case "collection.create":
      return create(env, account, op);
    case "collection.add":
      return add(env, account, op.slug, op.items);
    case "collection.remove":
      return remove(env, account, op);
    case "collection.restore":
      return restore(env, account, op);
    case "collection.update":
      return setVisibility(env, account, op);
    case "collection.name":
      return name(env, account, op);
    case "collection.delete":
      return erase(env, account, op.slug);
  }
}

/** The account's own collections, whole, with their ids and addresses: the ones named, or with none named the
    latest changed. */
export async function ownDocuments(
  env: { DB: D1Database },
  userId: string,
  origin: string,
  ids?: readonly string[]
): Promise<SyncCollection[]> {
  const own = "c.owner_kind = 'user' AND c.owner_id = ?";
  const rows: CollectionRow[] = [];
  if (!ids) {
    rows.push(
      ...(await all<CollectionRow>(
        env.DB,
        `${SELECT} WHERE ${own} ORDER BY c.updated_at DESC, c.id LIMIT ?`,
        userId,
        MAX_OWN_COLLECTIONS
      ))
    );
  } else {
    for (let i = 0; i < ids.length; i += IDS_A_READ) {
      const part = ids.slice(i, i + IDS_A_READ);
      rows.push(
        ...(await all<CollectionRow>(
          env.DB,
          `${SELECT} WHERE c.id IN (${part.map(() => "?").join(",")}) AND ${own}`,
          ...part,
          userId
        ))
      );
    }
  }
  const docs: SyncCollection[] = [];
  for (let i = 0; i < rows.length; i += COLLECTIONS_READ_AT_ONCE) {
    const turn = rows.slice(i, i + COLLECTIONS_READ_AT_ONCE);
    const items = await Promise.all(turn.map(row => itemsOf(env, row)));
    turn.forEach((row, at) => {
      const held = items[at] ?? [];
      docs.push({
        ...summaryOf(row, previewOf(held)),
        items: held,
        id: row.id,
        url: `${origin}/${row.slug}`
      });
    });
  }
  return docs;
}

/** Where one of the account's collections lives now, found by its id; null when it is gone or not the account's. */
export async function ownSlug(
  env: { DB: D1Database },
  userId: string,
  id: string
): Promise<string | null> {
  const [row] = await all<{ slug: string }>(
    env.DB,
    "SELECT slug FROM k_collections WHERE id = ? AND owner_kind = 'user' AND owner_id = ?",
    id,
    userId
  );
  return row?.slug ?? null;
}
