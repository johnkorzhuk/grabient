import { t } from "@grabient/i18n";
import {
  accountHandle,
  collectionHref,
  itemKey,
  privateSlug,
  sortCollectionItems
} from "../collections/address.ts";
import { minePage, type View } from "./model.ts";
import { account, accountForCopy, copyEngine, engineNow, keptUserId } from "./session.ts";
import { movedCollection, viewNow } from "./state.ts";
import {
  COLLECTION_MAX,
  type CollectionItemInput,
  type ItemView,
  type SyncCollection,
  type Visibility
} from "./wire.ts";

/* The pages' reads and writes of the account's own collections, answered from the browser's copy (sync.ts) once it
   holds them: the account's collections and each of their pages show at once and with no connection, and a press
   changes the copy and returns as the server's answer would have. What the copy cannot answer (a search of meaning
   while online, another account's collection, an edit of a collection's words) goes to the server, and the copy
   then syncs. Pages read accountView() (state.ts) to follow the copy as it changes. */

export type OwnedDoc = SyncCollection & { owned: true; canCurate: false; canDelete: true };
const owned = (doc: SyncCollection): OwnedDoc => ({
  ...doc,
  owned: true,
  canCurate: false,
  canDelete: true
});

/** The account the copy is open for, once it has heard from the server: the one its pages may be drawn from. */
function reader(): string | null {
  const id = account()?.id;
  return id && engineNow()?.copyReady(id) ? id : null;
}
const viewIfReady = (): View | null => (reader() ? viewNow() : null);
const online = () => navigator.onLine !== false;

/** The copy to read from, once it can say: open in this tab, and synced behind the page when it is old (`fresh`).
    Null signed out, or when the copy has never heard from the server, and the page asks the server instead. */
async function readable(fresh = true): Promise<View | null> {
  const user = await accountForCopy();
  const sync = await copyEngine();
  if (!user || !sync.copyReady(user)) return null;
  if (fresh) sync.freshen(user);
  return sync.currentView(user);
}
/* the account's collection at an address, or the one that lived there before the server moved it */
const heldAt = (view: View, slug: string) =>
  view.collections.get(
    view.collections.has(slug) ? slug : (movedCollection(keptUserId(), slug) ?? slug)
  );

/** Whether the copy holds the account's collection at this address now. */
export const ownsCollection = (slug: string): boolean => !!viewIfReady()?.collections.has(slug);
/** Where the server moved one of the account's collections from this address, as this browser heard; its page leads
    on there. Null where nothing moved. */
export const ownCollectionMoved = (slug: string): string | null =>
  movedCollection(keptUserId(), slug);
/** The same as ownsCollection, once the copy is open: for a read that must not go to the server for the account's
    own. */
export async function ownsCollectionSoon(slug: string): Promise<boolean> {
  const view = await readable(false);
  return !!view && !!heldAt(view, slug);
}
/** The account's collection from the copy, read at an address it moved from too, where it answers with its new one;
    undefined when the copy cannot say, and the page asks the server. */
export async function ownCollectionDoc(slug: string): Promise<OwnedDoc | undefined> {
  const view = await readable();
  const doc = view && heldAt(view, slug);
  return doc ? owned(doc) : undefined;
}
/** A page of the account's collections from the copy, the latest changed first: every one, or with words, those whose
    own words hold them. Online, a search pressed (not `typing`) goes to the server, which also reads what the words
    mean: null then, as when the copy cannot say. */
export async function ownCollectionsPage(
  params: { page?: number; limit?: number; query?: string },
  typing = false
) {
  const query = params.query ?? "";
  if (query && !typing && online()) return null;
  const view = await readable();
  return view && minePage(view, { page: params.page ?? 1, limit: params.limit ?? 24, query });
}
/** The account's collections from the copy, the latest changed first, with the palettes each holds in each view:
    what Add to collection and the export column's Save offer. Each one's seeds come in the order its page opens in,
    which its colors are read from. Null when the copy cannot say. */
export function ownCollectionsHolding() {
  const view = viewIfReady();
  return (
    view &&
    [...view.collections.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt || (a.slug < b.slug ? -1 : 1))
      .map(doc => ({
        slug: doc.slug,
        title: doc.title,
        count: doc.items.length,
        seeds: sortCollectionItems(doc.items).map(item => item.kseed),
        keys: new Set(
          doc.items.map(item =>
            itemKey({ seed: item.kseed, style: item.style, steps: item.steps, angle: item.angle })
          )
        )
      }))
  );
}
/** The copy can take a new collection: open, and heard from the server. */
export const canMakeOwn = (): boolean => !!reader();

/** The server took a write of the account's things straight (a copy saved, a collection's words edited, an admin's
    tool): the copy asks for it. */
export const serverWrote = () => void copyEngine().then(sync => sync.schedule(0, true));

const inputOf = ({ seed, style, steps, angle }: CollectionItemInput): CollectionItemInput => ({
  seed,
  style,
  steps,
  angle
});
/* a write the copy shows at once and the server follows; its refusal reaches the account menu */
const settle = (done: Promise<void>) => void done.catch(() => {});

/** A new private collection, made in the copy at an address the browser picks: the first free one for its title
    under the account, which the copy can say offline since it holds all of the account's. The server keeps it. */
export function makeOwnCollection(
  title: string,
  items: readonly CollectionItemInput[]
): { href: string; title: string; slug: string } {
  const sync = engineNow();
  const user = account();
  const held = viewIfReady()?.collections;
  if (!sync || !user) throw new Error(t("Sign in to save collections."));
  const slug = privateSlug(title, accountHandle(user), taken => !!held?.has(taken));
  settle(
    sync.changeAccount({
      op: "collection.create",
      slug,
      title,
      visibility: "private",
      items: items.map(inputOf)
    })
  );
  return { href: collectionHref(slug), title, slug };
}

/** Palettes join one of the account's collections after the ones it holds, each view of one once. Returns the ones
    it took; throws when the collection is not the account's or would hold more than it may. */
export function addOwnPalettes(
  slug: string,
  items: readonly CollectionItemInput[]
): { href: string; title: string; added: CollectionItemInput[] } {
  const sync = engineNow();
  const doc = viewIfReady()?.collections.get(slug);
  if (!sync || !doc) throw new Error(t("That collection isn't yours anymore."));
  const held = new Set(
    doc.items.map(item =>
      itemKey({ seed: item.kseed, style: item.style, steps: item.steps, angle: item.angle })
    )
  );
  const added = items
    .filter(item => !held.has(itemKey(item)) && held.add(itemKey(item)))
    .map(inputOf);
  if (doc.items.length + added.length > COLLECTION_MAX) {
    throw new Error(t("Collections hold up to {max} palettes.", { max: String(COLLECTION_MAX) }));
  }
  if (added.length) settle(sync.changeAccount({ op: "collection.add", slug, items: added }));
  return { href: collectionHref(slug), title: doc.title, added };
}

/* the palettes taken out here, by their removal's key, for the undo that puts one back where it stood */
const removed = new Map<string, SyncCollection["items"][number]>();
const REMOVALS_KEPT = 256;
const LOCAL = "local:";
const sameView = (a: ItemView, b: ItemView) =>
  a.style === b.style && a.steps === b.steps && a.angle === b.angle;

/** One palette out of the account's collection: one view of it, or every view without one. Answers with the
    collection as it now stands and the token its undo hands back, as the server's own removal answers. */
export function removeOwnPalette(
  slug: string,
  seed: string,
  view?: ItemView
): { collection: OwnedDoc; restore: string } {
  const sync = engineNow();
  const doc = viewIfReady()?.collections.get(slug);
  if (!sync || !doc) throw new Error(t("That collection isn't yours anymore."));
  const goes = (item: SyncCollection["items"][number]) =>
    item.kseed === seed && (!view || sameView(item, view));
  const item = doc.items.find(goes);
  const { key, done } = sync.makeChange(
    {
      op: "collection.remove",
      slug,
      seed,
      ...(view ? { view: { style: view.style, steps: view.steps, angle: view.angle } } : {})
    },
    item ? { item } : undefined
  );
  settle(done);
  if (item) {
    removed.set(key, item);
    if (removed.size > REMOVALS_KEPT) removed.delete(removed.keys().next().value!);
  }
  const now = viewNow().collections.get(slug) ?? {
    ...doc,
    items: doc.items.filter(entry => !goes(entry))
  };
  return { collection: owned(now), restore: LOCAL + key };
}

/** The undo of a removal: one still waiting to be sent is taken back and nothing reaches the server; one already sent
    puts the palette back from its token once the removal's answer brought it, or with none at the end. */
export function restoreOwnPalette(
  slug: string,
  seed: string,
  token: string
): { collection: OwnedDoc } {
  const sync = engineNow();
  const doc = viewIfReady()?.collections.get(slug);
  if (!sync || !doc) throw new Error(t("That collection isn't yours anymore."));
  const key = token.startsWith(LOCAL) ? token.slice(LOCAL.length) : "";
  const item = key ? removed.get(key) : undefined;
  const local = { ...(key ? { removal: key } : {}), ...(item ? { item } : {}) };
  if (key && sync.removalState(key) === "pending") {
    settle(sync.changeAccount({ op: "collection.restore", slug, seed }, local));
  } else {
    const back = item && {
      seed: item.kseed,
      style: item.style,
      steps: item.steps,
      angle: item.angle,
      ...(item.title ? { title: item.title } : {}),
      ...(item.description ? { description: item.description } : {})
    };
    settle(
      sync.changeAccount(
        {
          op: "collection.restore",
          slug,
          seed,
          ...(key ? {} : { restore: token }),
          ...(back ? { item: back } : {})
        },
        local
      )
    );
  }
  return { collection: owned(viewNow().collections.get(slug) ?? doc) };
}

/** A palette's title in the account's collection, in one view of it: given, changed, or taken away (""). The copy
    shows it at once, offline too, and the server follows. Answers with the collection as it now stands. */
export function nameOwnPalette(
  slug: string,
  item: CollectionItemInput,
  title: string
): { collection: OwnedDoc } {
  const sync = engineNow();
  const doc = viewIfReady()?.collections.get(slug);
  if (!sync || !doc) throw new Error(t("That collection isn't yours anymore."));
  settle(
    sync.changeAccount({
      op: "collection.name",
      slug,
      seed: item.seed,
      view: { style: item.style, steps: item.steps, angle: item.angle },
      title
    })
  );
  return { collection: owned(viewNow().collections.get(slug) ?? doc) };
}

/** The words the account's collections give a palette, for its page: those of the collection it was opened from
    (`from`) where that one gives it any, else of the latest changed one that does; in the page's view where an entry
    has it, else in any view. Null where none does, or the copy cannot say. */
export function ownPaletteWords(
  seed: string,
  view: ItemView,
  from?: string | null
): { slug: string; title?: string; description?: string } | null {
  const held = viewIfReady()?.collections;
  if (!held) return null;
  const docs = [...held.values()].sort(
    (a, b) =>
      Number(b.slug === from) - Number(a.slug === from) ||
      b.updatedAt - a.updatedAt ||
      (a.slug < b.slug ? -1 : 1)
  );
  for (const doc of docs) {
    const worded = doc.items.filter(
      item => item.kseed === seed && (item.title || item.description)
    );
    const entry = worded.find(item => sameView(item, view)) ?? worded[0];
    if (entry)
      return {
        slug: doc.slug,
        ...(entry.title ? { title: entry.title } : {}),
        ...(entry.description ? { description: entry.description } : {})
      };
  }
  return null;
}

/** Who sees the account's collection, an admin's change: the server decides who may publish, and its refusal turns
    the press back. It can move the address with the change; the answer names where the collection lives then. */
export async function setOwnVisibility(
  slug: string,
  visibility: Visibility
): Promise<{ collection: OwnedDoc }> {
  const sync = engineNow();
  const doc = viewIfReady()?.collections.get(slug);
  if (!sync || !doc) throw new Error(t("That collection isn't yours anymore."));
  await sync.changeAccount({ op: "collection.update", slug, visibility });
  const now = viewNow().collections;
  const moved = doc.id ? [...now.values()].find(held => held.id === doc.id) : undefined;
  return { collection: owned(now.get(slug) ?? moved ?? doc) };
}

/** The account's collection goes. */
export function deleteOwnCollection(slug: string): { deleted: string } {
  const sync = engineNow();
  if (!sync) throw new Error(t("That collection isn't yours anymore."));
  settle(sync.changeAccount({ op: "collection.delete", slug }));
  return { deleted: slug };
}
