import { itemKey, sortCollectionItems } from "../collections/address.ts";
import type { CollectionItem, CollectionPreview } from "../collections/types.ts";
import {
  COLLECTION_MAX,
  type CollectionItemInput,
  type ItemView,
  type SyncCollection,
  type SyncLike,
  type SyncOp,
  type SyncResponse
} from "./wire.ts";

/* The browser's copy of the account's own things, as pure functions over plain data. What the server held at the last
   sync is the snapshot; the changes made here since, not yet heard back, are pending. What a page shows is the
   snapshot with the pending changes made over it again, in order, whenever either moves: a change the server has
   applied is in the snapshot and leaves the pending list in the same step, so nothing a page shows blinks. The server
   applies each change itself; what is made here is the page's prediction of it. */

export interface Snapshot {
  /** the server's log row this copy is read to; null before the first sync */
  cursor: number | null;
  admin: boolean;
  likes: ReadonlyMap<string, SyncLike>;
  /** by address: a collection made here has one before the server knows it */
  collections: ReadonlyMap<string, SyncCollection>;
}
export interface Pending {
  /** the outbox's number: the order the changes were made in, and what the server keeps the last of */
  id: number;
  /** the change's own name, which the tab that made it waits on and a removal's undo points at */
  key: string;
  op: SyncOp;
  /** when it was made: the predicted time of what it changed */
  at: number;
  /** what the prediction needs and the server does not: a removed palette as it stood, and the removal an undo
      takes back */
  local?: { item?: CollectionItem; removal?: string };
}
export interface View {
  likes: ReadonlyMap<string, SyncLike>;
  collections: ReadonlyMap<string, SyncCollection>;
}
/** Whose collections a prediction makes: the account's names as its collections show them, and the site's origin. */
export interface Maker {
  name: string | null;
  display: string | null;
  origin: string;
}
export type CollectionSummary = Omit<SyncCollection, "items" | "id">;

export const EMPTY_VIEW: View = { likes: new Map(), collections: new Map() };
const PREVIEW_ITEMS = 12;
/** The latest saved palettes Saved pages through, as the server's list stops. */
export const SAVED_PAGED = 1000;

const heldKey = (item: CollectionItem) =>
  itemKey({ seed: item.kseed, style: item.style, steps: item.steps, angle: item.angle });
const sameView = (a: ItemView, b: ItemView) =>
  a.style === b.style && a.steps === b.steps && a.angle === b.angle;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A collection's first palettes in its page's order, as the server writes them. */
export function previewOf(items: readonly CollectionItem[]): CollectionPreview[] {
  return sortCollectionItems(items)
    .slice(0, PREVIEW_ITEMS)
    .map(item => ({
      seed: item.kseed,
      style: item.style,
      steps: item.steps,
      angle: item.angle,
      createdAt: item.createdAt,
      likes: item.likes,
      position: item.position
    }));
}
const withItems = (doc: SyncCollection, items: CollectionItem[], at: number): SyncCollection => ({
  ...doc,
  items,
  itemCount: items.length,
  preview: previewOf(items),
  updatedAt: Math.max(doc.updatedAt, at)
});

/** A change to one of the account's collections names its id too, once the copy knows it, so it lands where the
    collection lives when the server moved it before the change arrived. */
export function withCollectionId(op: SyncOp, view: View): SyncOp {
  if (op.op === "like" || op.op === "collection.create" || op.id) return op;
  const id = view.collections.get(op.slug)?.id;
  return id ? { ...op, id } : op;
}

// the collection a change names where the copy holds it now: at its address, or by its id, moved since
function named(
  collections: ReadonlyMap<string, SyncCollection>,
  op: { slug: string; id?: string }
): SyncCollection | undefined {
  const at = collections.get(op.slug);
  if (!op.id || at?.id === op.id) return at;
  for (const doc of collections.values()) if (doc.id === op.id) return doc;
  return undefined;
}

/** One change made over the copy as the server would make it; what the server would refuse changes nothing. */
function applyOne(
  likes: Map<string, SyncLike>,
  collections: Map<string, SyncCollection>,
  change: Pending,
  maker: Maker
) {
  const { op, at } = change;
  // a palette's likes and its age as the copy knows them anywhere, for a palette the prediction adds
  const known = (seed: string) => {
    for (const doc of collections.values()) {
      const item = doc.items.find(entry => entry.kseed === seed);
      if (item) return { likes: item.likes, createdAt: item.createdAt };
    }
    return { likes: likes.get(seed)?.likes ?? 0, createdAt: at };
  };
  const itemOf = (input: CollectionItemInput, position: number): CollectionItem => ({
    kseed: input.seed,
    style: input.style,
    steps: input.steps,
    angle: input.angle,
    ...known(input.seed),
    position
  });
  const lastPosition = (doc: SyncCollection) =>
    doc.items.reduce((most, item) => Math.max(most, item.position), -1);
  switch (op.op) {
    case "like": {
      if (!op.liked) likes.delete(op.seed);
      // a like the server holds keeps its time, its view and its title
      else if (!likes.has(op.seed)) {
        likes.set(op.seed, {
          seed: op.seed,
          style: op.style,
          steps: op.steps,
          angle: op.angle,
          at: op.at ?? at,
          likes: known(op.seed).likes,
          ...(op.title ? { title: op.title } : {})
        });
      }
      return;
    }
    case "collection.create": {
      if (collections.has(op.slug)) return;
      const items = op.items.map(itemOf);
      collections.set(op.slug, {
        id: "",
        slug: op.slug,
        url: `${maker.origin}/${op.slug}`,
        title: op.title,
        description: "",
        tags: [],
        visibility: op.visibility,
        owner: { kind: "user", name: maker.name, display: maker.display },
        itemCount: items.length,
        createdAt: at,
        updatedAt: at,
        saves: 0,
        preview: previewOf(items),
        items
      });
      return;
    }
    case "collection.add": {
      const doc = named(collections, op);
      if (!doc) return;
      const held = new Set(doc.items.map(heldKey));
      const added = op.items.filter(item => !held.has(itemKey(item)) && held.add(itemKey(item)));
      // the server refuses an add past the collection's size whole
      if (!added.length || doc.items.length + added.length > COLLECTION_MAX) return;
      let position = lastPosition(doc);
      collections.set(
        doc.slug,
        withItems(doc, [...doc.items, ...added.map(item => itemOf(item, ++position))], at)
      );
      return;
    }
    case "collection.restore": {
      const doc = named(collections, op);
      if (!doc || doc.items.length >= COLLECTION_MAX) return;
      // back where it stood, as the removal's token puts it; without one, at the end
      const was = change.local?.item;
      const item =
        was && was.kseed === op.seed
          ? was
          : op.item
            ? itemOf(op.item, lastPosition(doc) + 1)
            : null;
      if (!item || doc.items.some(entry => heldKey(entry) === heldKey(item))) return;
      const items = [...doc.items, item].sort((a, b) => a.position - b.position);
      collections.set(doc.slug, withItems(doc, items, at));
      return;
    }
    case "collection.remove": {
      const doc = named(collections, op);
      const view = op.view;
      const goes = (item: CollectionItem) =>
        item.kseed === op.seed && (!view || sameView(item, view));
      if (doc?.items.some(goes)) {
        collections.set(
          doc.slug,
          withItems(
            doc,
            doc.items.filter(item => !goes(item)),
            at
          )
        );
      }
      return;
    }
    case "collection.update": {
      const doc = named(collections, op);
      if (doc && doc.visibility !== op.visibility) {
        collections.set(doc.slug, {
          ...doc,
          visibility: op.visibility,
          updatedAt: Math.max(doc.updatedAt, at)
        });
      }
      return;
    }
    case "collection.delete": {
      const doc = named(collections, op);
      if (doc) collections.delete(doc.slug);
      return;
    }
  }
}

/** What a page shows: the snapshot with the pending changes made over it in order. */
export function rebase(snapshot: Snapshot, pending: readonly Pending[], maker: Maker): View {
  const likes = new Map(snapshot.likes);
  const collections = new Map(snapshot.collections);
  for (const change of pending) applyOne(likes, collections, change, maker);
  return { likes, collections };
}

const slugOf = (op: SyncOp): string | null => (op.op === "like" ? null : op.slug);

/** The pending list with a new change in it, folded where it can be, as presses fold into one write: a like
    supersedes the like of the same palette not yet sent, and neither goes when the press ends where the server will
    be; two changes of who sees a collection fold the same way; an undo of a removal not yet sent takes it back and
    sends nothing; deleting a collection made here and not yet sent sends nothing for it at all. Changes up to
    `sending` are on their way and stay as they are. */
export function fold(
  pending: readonly Pending[],
  next: Pending,
  sending: number,
  snapshot: Snapshot
): Pending[] {
  const unsent = (change: Pending) => change.id > sending;
  const op = next.op;
  /* A press on one thing that the server will hold once what is on its way lands: that change's value, or the
     snapshot's. The unsent presses on it go, and the new one stays only when it asks for something else. */
  const settle = <T>(same: (change: Pending) => boolean, read: (change: Pending) => T, held: T) => {
    const sent = pending.filter(change => !unsent(change) && same(change)).at(-1);
    const landing = sent ? read(sent) : held;
    const rest = pending.filter(change => !(unsent(change) && same(change)));
    return landing === read(next) ? rest : [...rest, next];
  };
  if (op.op === "like") {
    return settle(
      change => change.op.op === "like" && change.op.seed === op.seed,
      change => (change.op as Extract<SyncOp, { op: "like" }>).liked,
      snapshot.likes.has(op.seed)
    );
  }
  if (op.op === "collection.update") {
    return settle(
      change => change.op.op === "collection.update" && change.op.slug === op.slug,
      change => (change.op as Extract<SyncOp, { op: "collection.update" }>).visibility,
      snapshot.collections.get(op.slug)?.visibility
    );
  }
  if (op.op === "collection.restore" && next.local?.removal) {
    const removal = pending.find(change => change.key === next.local?.removal);
    if (removal && unsent(removal)) return pending.filter(change => change !== removal);
  }
  if (op.op === "collection.delete") {
    const made = pending.find(
      change => change.op.op === "collection.create" && change.op.slug === op.slug
    );
    // what was going to change it goes; a collection the server never had needs no deletion either
    const rest = pending.filter(change => !(unsent(change) && slugOf(change.op) === op.slug));
    return made && unsent(made) ? rest : [...rest, next];
  }
  return [...pending, next];
}

/** The snapshot an answer moves the copy to. A collection is one by its id, whatever address it had. */
export function settled(snapshot: Snapshot, answer: SyncResponse): Snapshot {
  const likes = new Map(answer.reset ? [] : snapshot.likes);
  const collections = new Map(answer.reset ? [] : snapshot.collections);
  for (const like of answer.likes) likes.set(like.seed, like);
  for (const seed of answer.unliked) likes.delete(seed);
  const gone = new Set([...answer.removed, ...answer.collections.map(doc => doc.id)]);
  for (const [slug, doc] of collections) if (doc.id && gone.has(doc.id)) collections.delete(slug);
  for (const doc of answer.collections) collections.set(doc.slug, doc);
  return { cursor: answer.cursor, admin: answer.admin, likes, collections };
}

/** A palette of Saved, as the server's list answers one. */
export interface SavedItem extends ItemView {
  kseed: string;
  likes: number;
  createdAt: number;
}
// a view stands until the copy changes, and every visit to Saved reads it: an account can hold thousands of likes
const savedOf = new WeakMap<View, readonly SavedItem[]>();
/** The account's saved palettes, the latest saved first, as Saved lists them. */
export function savedItems(view: View): readonly SavedItem[] {
  let items = savedOf.get(view);
  if (!items) {
    items = [...view.likes.values()]
      .sort((a, b) => b.at - a.at || compare(a.seed, b.seed))
      .slice(0, SAVED_PAGED)
      .map(like => ({
        kseed: like.seed,
        style: like.style,
        steps: like.steps,
        angle: like.angle,
        likes: like.likes,
        createdAt: like.at
      }));
    savedOf.set(view, items);
  }
  return items;
}

/** The account's own collections, the latest changed first. */
export function ownSummaries(view: View): CollectionSummary[] {
  return [...view.collections.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt || compare(a.id, b.id))
    .map(({ items: _items, id: _id, ...summary }) => summary);
}

/** A page of a list, as the server pages it. */
export function pageOf<T>(all: readonly T[], page: number, limit: number) {
  const total = all.length;
  return {
    items: all.slice((page - 1) * limit, page * limit),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit))
  };
}

/* Words as the server's search reads them: letters with the marks that follow them, and digits. One character is a
   whole word only in Chinese, Japanese and Korean. */
const WORDS = /(?:\p{L}\p{M}*|\p{N})+/gu;
const ONE_CHARACTER_WORD =
  /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u;

/** One slip between two words of four letters or more: a letter added, dropped, changed, or two swapped. */
function near(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1 || a.length < 4) return false;
  let i = 0;
  let j = 0;
  let slips = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++slips > 1) return false;
    if (a.length === b.length && a[i] === b[j + 1] && a[i + 1] === b[j]) {
      i += 2;
      j += 2;
    } else if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return slips + (a.length - i) + (b.length - j) <= 1;
}

/** Whether every word of a search is in what an account wrote for its collection (its title, description or a tag),
    a slip allowed in longer words, or as the start of a longer one. The server reads what the words mean too; this is
    what the browser can do alone, offline. */
export function matchesWords(
  summary: Pick<CollectionSummary, "title" | "description" | "tags">,
  query: string
): boolean {
  const asked = (query.toLowerCase().normalize("NFKC").match(WORDS) ?? []).filter(
    word => word.length > 1 || ONE_CHARACTER_WORD.test(word)
  );
  if (!asked.length) return false;
  const text = [summary.title, summary.description, ...summary.tags]
    .join(" ")
    .toLowerCase()
    .normalize("NFKC");
  const tokens = text.match(WORDS) ?? [];
  return asked.every(
    word =>
      text.includes(word) ||
      tokens.some(
        token =>
          near(token, word) ||
          (token.length > word.length && near(token.slice(0, word.length + 1), word))
      )
  );
}

/** A page of the account's collections from the copy, searched by their own words or not. */
export function minePage(view: View, params: { page: number; limit: number; query?: string }) {
  const query = params.query ?? "";
  const all = ownSummaries(view).filter(summary => !query || matchesWords(summary, query));
  return { ...pageOf(all, params.page, params.limit), query };
}
