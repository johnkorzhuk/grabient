import { dominantColors } from "@grabient/engine/dominant.ts";
import { localHref, msg, t } from "@grabient/i18n";
import type { CollectChoice } from "@grabient/ui/CollectList.tsx";
import type { CardCollect } from "@grabient/ui/CollectPress.tsx";
import { createSignal } from "solid-js";
import { signInUnavailable } from "../../app/connection.ts";
import { record } from "../../app/undo.ts";
import { shownError } from "../../lib/query.ts";
import {
  addOwnPalettes,
  canMakeOwn,
  deleteOwnCollection,
  makeOwnCollection,
  ownCollectionDoc,
  ownCollectionsHolding,
  ownsCollection,
  removeOwnPalette,
  restoreOwnPalette,
  serverWrote
} from "../account/collections.ts";
import { account, accountKnown, isAdmin, loginHref, sessionReady } from "../account/session.ts";
import { trackEvent } from "../analytics/analytics.ts";
import { itemKey } from "./address.ts";
import {
  addSitePalettes,
  changeCollection,
  deleteCollection,
  makeCollection,
  readOwn,
  readSiteCollections,
  readSiteHolding,
  readState,
  removePalette,
  restorePalette,
  unaddSitePalette
} from "./client.ts";
import { recallCollection } from "./overlay.ts";
import { type CollectionItemInput, MAX_COLLECTION_ITEMS } from "./schema.ts";

/* The account's collections as a checklist for the palettes at hand: a card's Add to collection, and the export
   column's Save. One list for every card of a page, read when a list opens: from the account's copy, which knows what
   each holds, or from the server, which lists them without that. An admin's checklist adds Grabient's collections
   under their name: those that hold the palettes at hand and the five changed last, the rest found by the search row.
   Each pick is written at once, said on the page's line, and is a step of the page's undo. */

const SITE_SHOWN = 5;
const SITE_KEPT_MS = 5 * 60_000;
type Item = CollectionItemInput;

const signedOut = () => sessionReady() && !account();
const viewOf = (item: Item) => ({ style: item.style, steps: item.steps, angle: item.angle });

/** The palettes into one of the account's own, after the ones it holds, each view once: the ones it took. */
async function putIn(
  slug: string,
  items: readonly Item[]
): Promise<{ title: string; added: Item[] }> {
  if (ownsCollection(slug)) {
    const put = addOwnPalettes(slug, items);
    if (put.added.length) trackEvent("add_to_collection", { slug, items: put.added.length });
    return put;
  }
  const state = await readState(slug);
  if (!state.owned || !state.collection) throw new Error(t("That collection isn't yours anymore."));
  const held = state.collection.items.map(i => ({
    seed: i.kseed,
    style: i.style,
    steps: i.steps,
    angle: i.angle
  }));
  const seen = new Set(held.map(itemKey));
  const added = items.filter(item => !seen.has(itemKey(item)) && seen.add(itemKey(item)));
  if (held.length + added.length > MAX_COLLECTION_ITEMS)
    throw new Error(
      t("Collections hold up to {max} palettes.", { max: String(MAX_COLLECTION_ITEMS) })
    );
  if (!added.length) return { title: state.collection.title, added };
  const { collection } = await changeCollection(slug, { items: [...held, ...added] });
  serverWrote();
  trackEvent("add_to_collection", { slug: collection.slug, items: added.length });
  return { title: collection.title, added };
}
/** The palettes out of one of the account's own, each with the token that puts it back. */
async function takeOut(slug: string, items: readonly Item[]) {
  let title = "";
  const tokens: { item: Item; token: string | null }[] = [];
  for (const item of items) {
    const answer = ownsCollection(slug)
      ? removeOwnPalette(slug, item.seed, viewOf(item))
      : await removePalette(slug, item);
    title = answer.collection.title;
    tokens.push({ item, token: answer.restore ?? null });
  }
  if (!ownsCollection(slug)) serverWrote();
  return { title, tokens };
}
async function putBack(slug: string, tokens: readonly { item: Item; token: string | null }[]) {
  for (const { item, token } of tokens) {
    if (!token) continue;
    if (ownsCollection(slug)) restoreOwnPalette(slug, item.seed, token);
    else await restorePalette(slug, item.seed, token);
  }
}
/** A new private collection of the palettes: made in the copy where it can be, else by the server. */
async function makeOwn(
  title: string,
  items: readonly Item[]
): Promise<{ slug: string; title: string }> {
  let made: { slug: string; title: string };
  if (canMakeOwn()) made = makeOwnCollection(title, items);
  else {
    made = (await makeCollection(title, items)).collection;
    serverWrote();
  }
  recallCollection(made.slug);
  trackEvent("create_collection", { slug: made.slug, visibility: "private", items: items.length });
  return made;
}

/** A new collection's undo: it goes while it holds just the palettes it was made with (`wanted`, their keys) under that
    title. Read and deleted through the copy where the copy holds it, as it was made, with no connection too; else by
    the server, at the address it lives at now. */
async function unmake(at: { slug: string; title: string }, wanted: string) {
  const own = await ownCollectionDoc(at.slug);
  const held = own ?? (await readState(at.slug)).collection;
  const keys = held?.items
    .map(i => itemKey({ seed: i.kseed, style: i.style, steps: i.steps, angle: i.angle }))
    .sort()
    .join("\n");
  if (!held || held.title !== at.title || keys !== wanted)
    throw new Error(t("{title} has changed, so it stays.", { title: at.title }));
  if (own) deleteOwnCollection(own.slug);
  else {
    await deleteCollection(held.slug);
    serverWrote();
  }
}

export function createChecklists(say: (message: string, error?: boolean) => void) {
  const [own, setOwn] = createSignal<
    readonly (CollectChoice & { keys?: ReadonlySet<string> })[] | null
  >(null);
  const [site, setSite] = createSignal<readonly CollectChoice[] | null>(null);
  const [holding, setHolding] = createSignal<{
    asked: string;
    counts: Readonly<Record<string, number>>;
  } | null>(null);
  let siteRead = 0;
  /* the palettes this page put into one of Grabient's collections, with the token that takes each out as if never
     put in: taking it out again is the add's undo, and leaves nothing on the admins' record */
  const siteAdds = new Map<string, string>();
  const siteKey = (slug: string, item: Item) => `${slug}\n${itemKey(item)}`;

  /* once the page knows who reads it: a reader signed out has no collections to ask the server for, and the side
     leads to sign in */
  const readOwnList = () =>
    void accountKnown().then(() => {
      if (!account()) return;
      const copy = ownCollectionsHolding();
      if (copy) {
        setOwn(
          copy.map(c => ({
            slug: c.slug,
            title: c.title,
            count: c.count,
            keys: c.keys,
            colors: dominantColors(c.seeds)
          }))
        );
        return;
      }
      readOwn("?limit=96").then(
        page =>
          setOwn(
            page.items.map(c => ({
              slug: c.slug,
              title: c.title,
              count: c.itemCount,
              colors: dominantColors(c.preview.map(p => p.seed))
            }))
          ),
        () => setOwn(list => list ?? [])
      );
    });
  const askedKey = (items: readonly Item[]) => items.map(itemKey).sort().join("\n");
  function readSite(items: readonly Item[]) {
    if (!isAdmin() || !items.length) return;
    if (Date.now() - siteRead > SITE_KEPT_MS) {
      siteRead = Date.now();
      readSiteCollections().then(
        ({ collections }) =>
          setSite(
            collections.map(c => ({
              slug: c.slug,
              title: c.title,
              count: c.count,
              colors: dominantColors(c.seeds)
            }))
          ),
        () => {
          siteRead = 0;
        }
      );
    }
    const asked = askedKey(items);
    readSiteHolding(items).then(
      ({ holding: counts }) => setHolding({ asked, counts }),
      () => {}
    );
  }
  /* whether a collection holds the palettes at hand: all, some or none; unknown where the server listed them */
  const holds = (
    keys: ReadonlySet<string> | undefined,
    wanted: readonly string[]
  ): CollectChoice["has"] => {
    if (!keys) return undefined;
    const n = wanted.filter(key => keys.has(key)).length;
    return n === 0 ? false : n === wanted.length ? true : "some";
  };
  function choices(items: readonly Item[]): CollectChoice[] | null {
    const list = own();
    if (!list) return null;
    const wanted = items.map(itemKey);
    const mine = list.map(({ keys, ...c }) => ({ ...c, has: holds(keys, wanted) }));
    if (!isAdmin()) return mine;
    const known = holding();
    const counts = known?.asked === askedKey(items) ? known.counts : null;
    const n = new Set(wanted).size;
    return [
      ...mine,
      ...(site() ?? []).map((c, i) => {
        const inIt = counts?.[c.slug] ?? 0;
        return {
          ...c,
          group: "Grabient",
          more: i >= SITE_SHOWN && !inIt,
          has: !counts ? undefined : inIt === 0 ? false : inIt >= n ? true : ("some" as const)
        };
      })
    ];
  }
  const isSite = (slug: string) => !!site()?.some(c => c.slug === slug);
  /* a step's undo or redo that fails says why where the step was made */
  const fail = (reason: unknown) => say(failedWrite(reason), true);

  /* Each pick is a step of the page's undo. The checklist may be closed by the time it is taken back or made again, so
     the page's line says what each undo and redo did. A pick that put nothing in is no step. */
  const addedTo = (title: string) => say(t("Added to {title}.", { title }));
  const removedFrom = (title: string) => say(t("Removed from {title}.", { title }));

  /* the account's own: the palettes in, or out, and the step that takes it back */
  async function ownIn(slug: string, items: readonly Item[], refresh: () => void) {
    const put = await putIn(slug, items);
    let title = put.title;
    addedTo(title);
    if (!put.added.length) return;
    let tokens: Awaited<ReturnType<typeof takeOut>>["tokens"] = [];
    record({
      undo: async () => {
        ({ title, tokens } = await takeOut(slug, put.added));
        removedFrom(title);
        refresh();
      },
      redo: async () => {
        await putBack(slug, tokens);
        addedTo(title);
        refresh();
      },
      fail
    });
  }
  async function ownOut(slug: string, items: readonly Item[], refresh: () => void) {
    let { title, tokens } = await takeOut(slug, items);
    removedFrom(title);
    record({
      undo: async () => {
        await putBack(slug, tokens);
        addedTo(title);
        refresh();
      },
      redo: async () => {
        ({ title, tokens } = await takeOut(slug, items));
        removedFrom(title);
        refresh();
      },
      fail
    });
  }
  /* Grabient's: an add's undo takes out exactly the membership it made, with nothing recorded; taking out one this tab
     did not add records an admin's removal, which its undo puts back and takes off the record */
  async function siteIn(slug: string, items: readonly Item[], refresh: () => void) {
    const add = async () => {
      const answer = await addSitePalettes(slug, items);
      for (const row of answer.added) siteAdds.set(siteKey(slug, row as Item), row.token);
      return answer;
    };
    const put = await add();
    let title = put.title;
    addedTo(title);
    if (!put.added.length) return;
    record({
      undo: async () => {
        for (const row of put.added) {
          const item = row as Item;
          const token = siteAdds.get(siteKey(slug, item));
          if (token) title = (await unaddSitePalette(slug, item, token)).collection.title;
          siteAdds.delete(siteKey(slug, item));
        }
        removedFrom(title);
        refresh();
      },
      redo: async () => {
        ({ title } = await add());
        addedTo(title);
        refresh();
      },
      fail
    });
  }
  async function siteOut(slug: string, items: readonly Item[], refresh: () => void) {
    const out = async () => {
      let title = "";
      const tokens: { item: Item; token: string | null }[] = [];
      for (const item of items) {
        const added = siteAdds.get(siteKey(slug, item));
        const answer = added
          ? await unaddSitePalette(slug, item, added)
          : await removePalette(slug, item, { reasons: [], comment: "" });
        siteAdds.delete(siteKey(slug, item));
        title = answer.collection.title;
        tokens.push({ item, token: added ? null : (answer.restore ?? null) });
      }
      return { title, tokens };
    };
    let { title, tokens } = await out();
    removedFrom(title);
    record({
      undo: async () => {
        for (const { item, token } of tokens)
          if (token) await restorePalette(slug, item.seed, token);
          else await addSitePalettes(slug, [item]);
        addedTo(title);
        refresh();
      },
      redo: async () => {
        ({ title, tokens } = await out());
        removedFrom(title);
        refresh();
      },
      fail
    });
  }
  /* a new collection's undo deletes it while it still holds exactly the palettes it was made with, under that title */
  async function made(title: string, items: readonly Item[], refresh: () => void) {
    let at = await makeOwn(title, items);
    addedTo(at.title);
    const wanted = items.map(itemKey).sort().join("\n");
    record({
      undo: async () => {
        await unmake(at, wanted);
        say(t("{title} deleted.", { title: at.title }));
        refresh();
      },
      redo: async () => {
        at = await makeOwn(title, items);
        addedTo(at.title);
        refresh();
      },
      fail
    });
  }

  function writes(items: () => readonly Item[], opened: () => void) {
    /* the checklist says why a pick failed as it is told, so it is told in the reader's words */
    const worded = async (write: () => Promise<void>) => {
      try {
        await write();
      } catch (reason) {
        throw new Error(failedWrite(reason));
      }
    };
    return {
      onToggle: (slug: string, on: boolean) =>
        worded(async () => {
          const at = items();
          if (isSite(slug)) await (on ? siteIn : siteOut)(slug, at, opened);
          else await (on ? ownIn : ownOut)(slug, at, opened);
          opened();
        }),
      onNew: (title: string) =>
        worded(async () => {
          await made(title, items(), opened);
          opened();
        })
    };
  }
  const signIn = () => (signedOut() ? localHref(loginHref()) : undefined);

  /** A card's Add to collection, for the palette it shows. */
  const card = (palette: () => Item): CardCollect => {
    const opened = () => {
      readOwnList();
      readSite([palette()]);
    };
    return {
      get own() {
        return choices([palette()]);
      },
      onOpen: opened,
      ...writes(() => [palette()], opened),
      get signIn() {
        return signIn();
      },
      /* signed out with no connection, the press has nowhere to lead */
      get disabled() {
        return signInUnavailable();
      }
    };
  };
  /** The export column's Save, for the selection. */
  const selection = (palettes: () => readonly Item[]) => {
    const opened = () => {
      readOwnList();
      readSite(palettes());
    };
    return {
      get own() {
        return choices(palettes());
      },
      onOwn: opened,
      ...writes(palettes, opened),
      get signIn() {
        return signIn();
      }
    };
  };
  return { card, selection };
}

/** Why a write failed, in the reader's words: the server's or the copy's, else the page's own for a write that never
    reached the server. */
export const failedWrite = (reason: unknown, fallback = msg("Couldn't save.")): string =>
  shownError(reason, fallback);
