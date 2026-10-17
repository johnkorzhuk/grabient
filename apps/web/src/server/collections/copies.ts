import { msg } from "@grabient/i18n";
import { all, first, run } from "@grabient/server/db/d1.ts";
import { itemKey } from "../../features/collections/address.ts";
import {
  type CollectionInput,
  type CollectionItemInput,
  collectionItem,
  MAX_COLLECTION_ITEMS,
  type Refusal,
  refusal
} from "../../features/collections/schema.ts";
import type { CollectionDocument, CopyStanding } from "../../features/collections/types.ts";
import { risingSaved } from "../gallery/scores.ts";
import {
  type CollectionOwner,
  type CollectionRecord,
  collectionBySlug,
  collectionRecord,
  colorsOf,
  leadSeedsOf,
  ownedBy,
  type Reader,
  recordById
} from "./read.ts";
import { ITEM_KEY, insertCollection, recountCopies, updateCollection } from "./write.ts";

/* Saved collections. Save on someone else's public collection makes the account's own private copy of it, once. The
   copy keeps its source as it stood when it last took from it (forked_base), so Update can tell what changed in the
   source from what the account changed in its copy: it brings the one in and keeps the other. Reset makes the copy the
   source as it stands. A source made private or deleted leaves the copy a collection of its own. */

type Writer = { DB: D1Database };

/** A collection's words and palettes, without who sees it: what a copy is compared with its source by. */
export type CollectionContent = Omit<CollectionInput, "visibility">;

const contentOf = ({ title, description, tags, items }: CollectionContent): CollectionContent => ({
  title,
  description,
  tags,
  items
});
const sameView = (a: CollectionItemInput, b: CollectionItemInput) =>
  a.style === b.style && a.steps === b.steps && a.angle === b.angle;
const sameWords = (a: CollectionItemInput, b: CollectionItemInput) =>
  (a.title ?? "") === (b.title ?? "") && (a.description ?? "") === (b.description ?? "");
const sameTags = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((tag, i) => tag === b[i]);
/** Whether two collections hold the same words and the same palettes, drawn alike in the same order with the same
    words. */
export const sameContent = (a: CollectionContent, b: CollectionContent): boolean =>
  a.title === b.title &&
  a.description === b.description &&
  sameTags(a.tags, b.tags) &&
  a.items.length === b.items.length &&
  a.items.every(
    (item, i) =>
      item.seed === b.items[i]!.seed && sameView(item, b.items[i]!) && sameWords(item, b.items[i]!)
  );
/** An item with the words of another. */
const wordedAs = (item: CollectionItemInput, words: CollectionItemInput): CollectionItemInput => ({
  seed: item.seed,
  style: item.style,
  steps: item.steps,
  angle: item.angle,
  ...(words.title ? { title: words.title } : {}),
  ...(words.description ? { description: words.description } : {})
});
const wordOf = (value: unknown) => (typeof value === "string" && value ? value : undefined);

/** The source as its copy keeps it: each palette its seed and view, then its words where it has any. */
export const baseText = (content: CollectionContent) =>
  JSON.stringify({
    title: content.title,
    description: content.description,
    tags: content.tags,
    items: content.items.map(item => [
      item.seed,
      item.style,
      item.steps,
      item.angle,
      ...(item.title || item.description ? [item.title ?? null, item.description ?? null] : [])
    ])
  });
function baseOf(raw: string | null | undefined): CollectionContent | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof value.title !== "string" ||
      typeof value.description !== "string" ||
      !Array.isArray(value.tags) ||
      !Array.isArray(value.items)
    )
      return null;
    const items = value.items.map((entry: unknown) => {
      const item = Array.isArray(entry)
        ? collectionItem({ seed: entry[0], style: entry[1], steps: entry[2], angle: entry[3] })
        : null;
      if (!item || !Array.isArray(entry)) return null;
      const [title, description] = [wordOf(entry[4]), wordOf(entry[5])];
      return { ...item, ...(title ? { title } : {}), ...(description ? { description } : {}) };
    });
    if (items.some(item => !item)) return null;
    return {
      title: value.title,
      description: value.description,
      tags: value.tags.filter((tag): tag is string => typeof tag === "string"),
      items: items as CollectionItemInput[]
    };
  } catch {
    return null;
  }
}

/* one side's change over no change; where both changed the same thing, the copy's own */
const pick = <T>(base: T, source: T, copy: T, same: (a: T, b: T) => boolean): T =>
  same(source, base) ? copy : same(copy, base) ? source : copy;
/** Whether the items two lists share keep the same order in both. */
function sameOrder(a: readonly CollectionItemInput[], b: readonly CollectionItemInput[]): boolean {
  const inA = new Set(a.map(itemKey));
  const inB = new Set(b.map(itemKey));
  const x = a.filter(item => inB.has(itemKey(item)));
  const y = b.filter(item => inA.has(itemKey(item)));
  return x.every((item, i) => itemKey(item) === itemKey(y[i]!));
}
/** `order` with each key of `others` it lacks placed after the key that came before it in `others`, or first. */
function interleave(order: readonly string[], others: readonly string[]): string[] {
  const out = [...order];
  const held = new Set(out);
  let after = -1;
  for (const key of others) {
    if (held.has(key)) {
      after = out.indexOf(key);
      continue;
    }
    out.splice(++after, 0, key);
    held.add(key);
  }
  return out;
}

/** Update: what changed in the source since the copy took it (`base`), brought into the copy, which keeps its own
    changes. An item is a palette in one view: one the source added joins and one it took out leaves; one the copy took
    out stays out and one it added stays. A palette the source redrew (its one view gone, one new view come) is the same
    item redrawn, which takes the place the copy gave the old view where the copy still holds that. Where both changed
    the same words, a collection's or a palette's, the copy's win. The order is the source's unless the copy moved its items; the other side's items
    follow the item they followed there. A copy nobody changed comes out as the source. */
export function mergeCopy(
  base: CollectionContent,
  source: CollectionContent,
  copy: CollectionContent
): CollectionContent {
  const was = new Set(base.items.map(itemKey));
  const now = new Set(source.items.map(itemKey));
  const held = new Set(copy.items.map(itemKey));
  const viewsOf = (list: readonly CollectionItemInput[], seed: string) =>
    list.filter(item => item.seed === seed);
  const redrawn = new Map<string, CollectionItemInput>();
  for (const item of base.items) {
    if (now.has(itemKey(item)) || viewsOf(base.items, item.seed).length !== 1) continue;
    const fresh = viewsOf(source.items, item.seed).filter(other => !was.has(itemKey(other)));
    if (fresh.length === 1) redrawn.set(itemKey(item), fresh[0]!);
  }
  const renamed = (key: string) => (redrawn.has(key) ? itemKey(redrawn.get(key)!) : key);
  const redraws = new Set([...redrawn.values()].map(itemKey));
  const before = new Map(base.items.map(item => [itemKey(item), item]));
  const after = new Map(source.items.map(item => [itemKey(item), item]));
  /* a palette's words the source changed and the copy kept as they were come in */
  const worded = (key: string, item: CollectionItemInput) => {
    const old = before.get(key);
    const fresh = after.get(key);
    return old && fresh && !sameWords(fresh, old) && sameWords(item, old)
      ? wordedAs(item, fresh)
      : item;
  };
  const kept = new Map<string, CollectionItemInput>();
  for (const item of copy.items) {
    const key = itemKey(item);
    if (redrawn.has(key)) kept.set(renamed(key), redrawn.get(key)!);
    else if (!was.has(key) || now.has(key)) kept.set(key, worded(key, item));
  }
  for (const item of source.items) {
    const key = itemKey(item);
    if (!redraws.has(key) && !was.has(key) && !held.has(key)) kept.set(key, item);
  }
  const [lead, follow] = sameOrder(base.items, copy.items)
    ? [source.items, copy.items]
    : [copy.items, source.items];
  const keys = (list: readonly CollectionItemInput[]) =>
    list.map(item => renamed(itemKey(item))).filter(key => kept.has(key));
  return {
    title: pick(base.title, source.title, copy.title, Object.is),
    description: pick(base.description, source.description, copy.description, Object.is),
    tags: pick(base.tags, source.tags, copy.tags, sameTags),
    items: interleave(keys(lead), keys(follow)).map(key => kept.get(key)!)
  };
}

/** The account's copy of a collection: the one changed last, where an account saved one more than once before saving
    was once. */
export async function heldCopy(
  env: Reader,
  sourceId: string,
  owner: CollectionOwner
): Promise<string | null> {
  const row = await first<{ slug: string }>(
    env.DB,
    `SELECT slug FROM k_collections WHERE forked_from = ? AND owner_kind = ? AND owner_id = ?
     ORDER BY updated_at DESC, id LIMIT 1`,
    sourceId,
    owner.kind,
    owner.id
  );
  return row?.slug ?? null;
}

/** Save a collection: the account's private copy of its words and palettes, which keeps the source as it stood. An
    account holds one copy of a collection: saving it again answers with the one it holds, and `made` is false. */
export async function forkCollection(
  env: Writer,
  source: CollectionRecord,
  owner: CollectionOwner
): Promise<{ collection: CollectionDocument; made: boolean }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const slug = await insertCollection(
      env,
      owner,
      { ...source.input, visibility: "private" },
      { forkedFrom: source.id, forkedBase: baseText(contentOf(source.input)) }
    );
    if (slug) {
      await recountCopies(
        env,
        source.id,
        risingSaved(Date.now(), "visibility = 'public' AND held.saves > fork_count")
      );
      const collection = await collectionBySlug(env, slug, true);
      if (collection) return { collection, made: true };
    }
    /* the copy the account holds; gone again in between, the save is tried once more */
    const held = await heldCopy(env, source.id, owner);
    const doc = held ? await collectionBySlug(env, held, true) : null;
    if (doc) return { collection: doc, made: false };
  }
  throw new Error("The collection could not be saved.");
}

interface CopyPair {
  copy: CollectionRecord;
  source: CollectionRecord;
  base: CollectionContent;
  /** the source's first palettes in the order its page opens in, which its colors are read from */
  lead: string | null;
}
/** A saved collection and its source, while the account may still read the source: a public one, or its own. A copy
    saved before copies kept their source reads it from when the source's palettes joined: those there when the copy
    was made, as the source draws and words them now. */
async function copyPair(
  env: Reader,
  copy: CollectionRecord,
  owner: CollectionOwner,
  known?: CollectionRecord
): Promise<CopyPair | null> {
  if (!copy.forkedFrom || !ownedBy(copy, owner)) return null;
  const source = known?.id === copy.forkedFrom ? known : await recordById(env, copy.forkedFrom);
  if (!source || (source.input.visibility !== "public" && !ownedBy(source, owner))) return null;
  const kept = await first<{ forked_base: string | null; lead: string | null }>(
    env.DB,
    `SELECT forked_base, ${leadSeedsOf("?")} AS lead FROM k_collections WHERE id = ?`,
    source.id,
    copy.id
  );
  let base = baseOf(kept?.forked_base);
  if (!base) {
    const then = new Set(
      (
        await all<{ key: string }>(
          env.DB,
          `SELECT ${ITEM_KEY} AS key FROM k_collection_items WHERE collection_id = ? AND COALESCE(created_at, ?) <= ?`,
          source.id,
          source.createdAt,
          copy.createdAt
        )
      ).map(row => row.key)
    );
    base = {
      ...contentOf(source.input),
      items: source.input.items.filter(item => then.has(itemKey(item)))
    };
  }
  return { copy, source, base, lead: kept?.lead ?? null };
}
const standingOf = ({ copy, source, base, lead }: CopyPair): CopyStanding => {
  const mine = contentOf(copy.input);
  const theirs = contentOf(source.input);
  return {
    slug: copy.slug,
    // the source's colors as its tag and its link elsewhere show them
    source: { slug: source.slug, title: source.input.title, colors: colorsOf(lead) },
    behind: !sameContent(mergeCopy(base, theirs, mine), mine),
    differs: !sameContent(mine, theirs)
  };
};

/** How a collection stands with the account's saved copies: the account's own copy against its source, or the
    account's copy of this collection. Null when it is neither, or the source is no longer the account's to read. */
export async function copyStanding(
  env: Reader,
  record: CollectionRecord,
  owner: CollectionOwner
): Promise<CopyStanding | null> {
  if (ownedBy(record, owner)) {
    const pair = await copyPair(env, record, owner);
    return pair ? standingOf(pair) : null;
  }
  if (record.input.visibility !== "public") return null;
  const slug = await heldCopy(env, record.id, owner);
  const copy = slug ? await collectionRecord(env, slug) : null;
  const pair = copy ? await copyPair(env, copy, owner, record) : null;
  return pair ? standingOf(pair) : null;
}

/** Update brings what changed in the source into the account's saved collection and keeps its own changes; Reset makes
    it the source as it stands. Either way the copy then keeps the source as it stands, its address and who sees it.
    Null when the collection is not the account's saved collection of a source it may read. */
export async function syncCopy(
  env: Writer,
  copy: CollectionRecord,
  owner: CollectionOwner,
  mode: "update" | "reset"
): Promise<{ ok: true; copy: CopyStanding } | Refusal | null> {
  const pair = await copyPair(env, copy, owner);
  if (!pair) return null;
  const theirs = contentOf(pair.source.input);
  const mine = contentOf(copy.input);
  const next = mode === "reset" ? theirs : mergeCopy(pair.base, theirs, mine);
  if (next.items.length > MAX_COLLECTION_ITEMS)
    return refusal(msg("Your copy would hold more than {max} palettes. Remove some first."), {
      max: String(MAX_COLLECTION_ITEMS)
    });
  const input = { ...next, visibility: copy.input.visibility };
  /* nothing to change but what the copy keeps of its source: that alone is written, and the copy keeps its time */
  if (sameContent(next, mine))
    await run(
      env.DB,
      "UPDATE k_collections SET forked_base = ? WHERE id = ?",
      baseText(theirs),
      copy.id
    );
  else await updateCollection(env, copy.id, input, { forkedBase: baseText(theirs), owner });
  return {
    ok: true,
    copy: standingOf({ ...pair, copy: { ...copy, input }, base: theirs })
  };
}
