import { dominantColors } from "@grabient/engine/dominant.ts";
import { localHref, msg, t } from "@grabient/i18n";
import type { CollectChoice } from "@grabient/ui/CollectList.tsx";
import type { CardCollect } from "@grabient/ui/CollectPress.tsx";
import { createSignal } from "solid-js";
import { ownCollectionsHeld } from "../account/collections.ts";
import { account, isAdmin } from "../account/session.ts";
import { itemKey } from "./address.ts";
import {
  addSitePalettes,
  changeCollection,
  makeCollection,
  readOwn,
  readSiteCollections,
  readSiteHolding,
  readState,
  removePalette,
  unaddSitePalette
} from "./client.ts";
import { type CollectionItemInput, MAX_COLLECTION_ITEMS } from "./schema.ts";

/* The account's collections as a checklist for the palettes at hand: a card's Add to collection, and the export column's
   Save. One list for every card of a page, read when a list opens: from the account's copy, which knows what each
   holds, or from the server, which lists them without that. An admin's checklist adds Grabient's collections under
   their name: those that hold the palettes at hand and the five changed last, the rest found by the search row. Each
   pick is written at once and said on the page's line. */

const SITE_SHOWN = 5;
const SITE_KEPT_MS = 5 * 60_000;

/** Signed out, a checklist's press leads to sign in and back to the page. */
const signInHref = () =>
  localHref(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`);

export function createChecklists(say: (message: string) => void) {
  const [own, setOwn] = createSignal<
    readonly (CollectChoice & { keys?: ReadonlySet<string> })[] | null
  >(null);
  const [site, setSite] = createSignal<readonly CollectChoice[] | null>(null);
  const [holding, setHolding] = createSignal<{
    asked: string;
    counts: Readonly<Record<string, number>>;
  } | null>(null);
  let siteRead = 0;
  /* the palettes this page put into one of Grabient's collections, with the token that takes each out as if never put
     in: taking it out again is the add's undo, and leaves nothing on the admins' record */
  const siteAdds = new Map<string, string>();

  function readOwnList() {
    const copy = ownCollectionsHeld();
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
    readOwn(`?limit=96`).then(
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
  }
  const askedKey = (items: readonly CollectionItemInput[]) => items.map(itemKey).sort().join("\n");
  function readSite(items: readonly CollectionItemInput[]) {
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
  function choices(items: readonly CollectionItemInput[]): CollectChoice[] | null {
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

  /** The palettes into one of the account's collections, after the ones it holds, each view once. */
  async function putIn(slug: string, items: readonly CollectionItemInput[]) {
    const state = await readState(slug);
    const held =
      state.collection?.items.map(i => ({
        seed: i.kseed,
        style: i.style,
        steps: i.steps,
        angle: i.angle
      })) ?? [];
    if (!state.owned) throw new Error(t("That collection isn't yours anymore."));
    const seen = new Set(held.map(itemKey));
    const added = items.filter(item => !seen.has(itemKey(item)) && seen.add(itemKey(item)));
    if (held.length + added.length > MAX_COLLECTION_ITEMS)
      throw new Error(
        t("Collections hold up to {max} palettes.", { max: String(MAX_COLLECTION_ITEMS) })
      );
    const { collection } = added.length
      ? await changeCollection(slug, { items: [...held, ...added] })
      : { collection: state.collection! };
    say(t("Added to {title}.", { title: collection.title }));
  }
  async function takeOut(slug: string, items: readonly CollectionItemInput[]) {
    let title = "";
    for (const item of items) {
      const token = siteAdds.get(`${slug}\n${itemKey(item)}`);
      const answer = token
        ? await unaddSitePalette(slug, item, token)
        : await removePalette(slug, item, isSite(slug) ? { reasons: [], comment: "" } : undefined);
      siteAdds.delete(`${slug}\n${itemKey(item)}`);
      title = answer.collection.title;
    }
    say(t("Removed from {title}.", { title }));
  }
  async function putInSite(slug: string, items: readonly CollectionItemInput[]) {
    const { title, added } = await addSitePalettes(slug, items);
    for (const row of added)
      siteAdds.set(`${slug}\n${itemKey(row as CollectionItemInput)}`, row.token);
    say(t("Added to {title}.", { title }));
  }

  function writes(items: () => readonly CollectionItemInput[], opened: () => void) {
    return {
      onToggle: async (slug: string, on: boolean) => {
        const at = items();
        if (on) await (isSite(slug) ? putInSite(slug, at) : putIn(slug, at));
        else await takeOut(slug, at);
        opened();
      },
      onNew: async (title: string) => {
        const { collection } = await makeCollection(title, items());
        say(t("Added to {title}.", { title: collection.title }));
        opened();
      }
    };
  }

  /** A card's Add to collection, for the palette it shows. */
  const card = (palette: () => CollectionItemInput): CardCollect => {
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
        return account() === null ? signInHref() : undefined;
      }
    };
  };
  /** The export column's Save, for the selection. */
  const selection = (palettes: () => readonly CollectionItemInput[]) => {
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
        return account() === null ? signInHref() : undefined;
      }
    };
  };
  return { card, selection };
}

/** Why a write failed, in the reader's words. */
export const failedWrite = (reason: unknown, fallback = msg("Couldn't save.")): string =>
  reason instanceof Error && reason.message ? reason.message : t(fallback);
