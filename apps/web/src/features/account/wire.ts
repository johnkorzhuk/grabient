import { STYLES, type Style } from "@grabient/engine/view.ts";
import * as v from "valibot";
import {
  CollectionEntry,
  CollectionItem,
  type CollectionItemInput,
  itemTitle,
  MAX_COLLECTION_ITEMS,
  RESTORE_TOKEN_MAX,
  type Visibility,
  withWords
} from "../collections/schema.ts";
import type { CollectionDocument, CollectionPreview } from "../collections/types.ts";

/* The wire of POST /api/me/sync: the changes a browser's copy sends and what it hears back. Browsers keep the
   changes they could not send yet in this shape, in IndexedDB, so no field ever changes its meaning in place. */

export type { CollectionItemInput, Visibility };
export interface ItemView {
  style: Style;
  steps: number;
  angle: number;
}

/** How one of the account's likes stands: the palette, the view it was saved in, when, and the palette's likes as the
    server counted them. `title` is the account's own name for it, which only a connected app gives. */
export interface SyncLike extends ItemView {
  seed: string;
  at: number;
  likes: number;
  title?: string;
}

/** One of the account's collections, whole, as its page reads it, with the id the log names it by, its address, and
    the preview a list's card of it draws. */
export type SyncCollection = CollectionDocument & {
  id: string;
  url: string;
  preview: CollectionPreview[];
};

/** Where an admin pressed a like: the words of the search it answered, or the collection whose page showed it. */
export interface LikeFrom {
  q?: string;
  collection?: string;
}

/** A change named by its collection's address, and by its id once the browser has heard it: the server may move a
    collection before the change arrives (a new title, who may see it, a new username), and the id finds it. */
type Named = { slug: string; id?: string };
export type SyncOp =
  | (ItemView & {
      op: "like";
      seed: string;
      liked: boolean;
      /** an undo puts a like back at its own time, with the title an unsave took */
      at?: number;
      title?: string;
      from?: LikeFrom;
    })
  | {
      op: "collection.create";
      slug: string;
      title: string;
      visibility: Visibility;
      items: CollectionItemInput[];
    }
  | (Named & { op: "collection.add"; items: CollectionItemInput[] })
  /* one view of the palette, or every view of it without one */
  | (Named & { op: "collection.remove"; seed: string; view?: ItemView })
  /* the removal's token, or with none the palette at the end */
  | (Named & {
      op: "collection.restore";
      seed: string;
      restore?: string;
      item?: CollectionItemInput;
    })
  | (Named & { op: "collection.update"; visibility: Visibility })
  /* a palette's title in one view of it in the collection, or none ("") */
  | (Named & { op: "collection.name"; seed: string; view: ItemView; title: string })
  | (Named & { op: "collection.delete" });

/** One change's outcome. A refused change (`ok` false) is done with: the server holds what it held. */
export interface SyncResult {
  id: number;
  ok: boolean;
  error?: string;
  i18n?: { message: string; params?: Record<string, string> };
  /** a like's: the palette's likes now, and the like an unsave took (an undo puts it back) */
  likesCount?: number | null;
  was?: (ItemView & { at: number; title?: string }) | null;
  /** a removal's token, which an undo sends back */
  restore?: string;
  /** where the server made a new collection */
  slug?: string;
}

/** The account as the menu and Settings show it. Nothing the server trusts: every write goes by the session cookie. */
export interface Profile {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  username: string | null;
  /** when the account was made, in ms */
  createdAt: number;
  /** the app reviewers' account, which gives itself the password their sign-in takes */
  reviewer?: true;
}

export interface SyncResponse {
  /** the log row the answer is read to: the next sync sends it back */
  cursor: number;
  /** the answer is everything, and the browser drops what it held */
  reset: boolean;
  likes: SyncLike[];
  unliked: string[];
  collections: SyncCollection[];
  /** ids of collections gone */
  removed: string[];
  /** the last change of this client the server applied or refused */
  lastMutation: number;
  results: SyncResult[];
  admin: boolean;
  /** the account has a language kept, so the browser stops naming its page's */
  language?: boolean;
  /** seconds before the rest of the changes may be sent: a limit was reached, or a write failed */
  retryAfter?: number;
  /** the account as the server read it for this sync, so a change made on another device reaches the menu */
  account?: Profile;
}

/** What a browser sends: its name under the account, the cursor its copy is read to, the changes it made in order,
    the page's language until the account has one, and the account its copy belongs to. */
export interface SyncRequest {
  client: string;
  cursor: number | null;
  mutations: { id: number; op: SyncOp }[];
  locale?: string;
  account?: string;
}

export const COLLECTION_MAX = MAX_COLLECTION_ITEMS;
/** The longest name an app may give a palette. */
export const PALETTE_TITLE_MAX = 80;

const integer = v.pipe(v.number(), v.integer());
const style = v.picklist(STYLES);
// An address as collections are kept: a top-level word, or a private one under its owner's handle.
const slug = v.pipe(
  v.string(),
  v.maxLength(120),
  v.regex(/^(?:@[a-z0-9_-]{3,30}\/)?[a-z0-9]+(?:-[a-z0-9]+)*$/)
);
// A collection's id as the server makes them; one that is not one is left out, and the address alone names it.
const id = v.pipe(
  v.optional(v.unknown()),
  v.transform(value =>
    typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : undefined
  )
);
const visibility = v.picklist(["public", "private"]);
// palettes with the words they bring, if any
const items = v.pipe(
  v.array(CollectionEntry),
  v.minLength(1),
  v.maxLength(MAX_COLLECTION_ITEMS),
  v.transform(sent => withWords(sent))
);
const entry = v.pipe(
  CollectionEntry,
  v.transform(sent => withWords([sent])[0]!)
);
/* the view a change names, read as a collection reads a palette's view, to the same bounds */
const viewOf = (seed: string, view: Record<string, unknown>) => {
  const read = v.safeParse(CollectionItem, { ...view, seed });
  if (!read.success) return null;
  const { seed: canonical, ...kept } = read.output;
  return { seed: canonical, view: kept };
};

/** A palette's own name, as a connected app gives one: one line of 1 to PALETTE_TITLE_MAX characters, or nothing. */
export function titleInput(value: unknown): string | undefined {
  // refused by length before composing, whose cost for a run of marks grows with its square
  if (typeof value !== "string" || value.length > PALETTE_TITLE_MAX * 4) return undefined;
  const clean = value
    .normalize("NFC")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters become spaces
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return clean && clean.length <= PALETTE_TITLE_MAX ? clean : undefined;
}

const words = (value: unknown) => (typeof value === "string" ? value : undefined);
const strip = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, kept]) => kept !== undefined)) as T;

const Like = v.pipe(
  v.object({
    op: v.literal("like"),
    seed: v.pipe(v.string(), v.maxLength(240)),
    liked: v.boolean(),
    style,
    steps: integer,
    angle: integer,
    at: v.optional(v.unknown()),
    title: v.optional(v.unknown()),
    from: v.optional(v.unknown())
  }),
  v.transform(({ at, title, from, ...like }): SyncOp => {
    const time = Number.isInteger(at) ? (at as number) : undefined;
    // the site never names a palette: a title rides only with an undo's like, the one its unsave took
    const name = like.liked && time !== undefined ? titleInput(title) : undefined;
    const pressed = from && typeof from === "object" ? (from as Record<string, unknown>) : null;
    const place = pressed && strip({ q: words(pressed.q), collection: words(pressed.collection) });
    return {
      ...like,
      ...(time === undefined ? {} : { at: time }),
      ...(name ? { title: name } : {}),
      ...(place && Object.keys(place).length ? { from: place } : {})
    };
  })
);

const named = <T extends v.ObjectEntries>(entries: T) =>
  v.pipe(
    v.object({ slug, id, ...entries }),
    v.transform(op => strip(op))
  );

const OPS = {
  like: Like,
  "collection.create": v.object({
    op: v.literal("collection.create"),
    slug,
    title: v.pipe(v.string(), v.maxLength(200)),
    visibility,
    items
  }),
  "collection.add": named({ op: v.literal("collection.add"), items }),
  "collection.remove": v.pipe(
    named({
      op: v.literal("collection.remove"),
      seed: v.pipe(v.string(), v.maxLength(64)),
      view: v.optional(v.record(v.string(), v.unknown()))
    }),
    v.rawTransform(({ dataset, addIssue, NEVER }) => {
      const { view, ...op } = dataset.value;
      if (!view) return op;
      const read = viewOf(op.seed, view);
      if (!read) {
        addIssue();
        return NEVER;
      }
      return { ...op, view: read.view };
    })
  ),
  "collection.restore": named({
    op: v.literal("collection.restore"),
    seed: v.pipe(v.string(), v.maxLength(64)),
    restore: v.optional(v.pipe(v.string(), v.maxLength(RESTORE_TOKEN_MAX))),
    item: v.optional(entry)
  }),
  "collection.update": named({ op: v.literal("collection.update"), visibility }),
  "collection.name": v.pipe(
    named({
      op: v.literal("collection.name"),
      seed: v.pipe(v.string(), v.maxLength(64)),
      view: v.record(v.string(), v.unknown()),
      title: v.string()
    }),
    v.rawTransform(({ dataset, addIssue, NEVER }) => {
      const { view, title, ...op } = dataset.value;
      const read = viewOf(op.seed, view);
      const kept = itemTitle(title);
      if (!read || kept === undefined) {
        addIssue();
        return NEVER;
      }
      return { ...op, seed: read.seed, view: read.view, title: kept ?? "" };
    })
  ),
  "collection.delete": named({ op: v.literal("collection.delete") })
};

/** A change as the server takes it, or null for one it cannot read. */
export function readOp(value: unknown): SyncOp | null {
  const name = value && typeof value === "object" ? (value as { op?: unknown }).op : undefined;
  if (typeof name !== "string" || !Object.hasOwn(OPS, name)) return null;
  const read = v.safeParse(OPS[name as keyof typeof OPS], value);
  return read.success ? (read.output as SyncOp) : null;
}

const list = v.array(v.unknown());
/** An answer the copy can take: a cursor, the lists, and the last change applied. Anything else is a failed sync. */
export const SyncAnswer = v.looseObject({
  cursor: v.pipe(integer, v.minValue(0)),
  reset: v.optional(v.boolean(), false),
  likes: list,
  unliked: list,
  collections: list,
  removed: list,
  lastMutation: v.pipe(integer, v.minValue(0)),
  results: list,
  admin: v.optional(v.boolean(), false)
});
