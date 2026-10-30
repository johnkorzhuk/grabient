import { decodePalette } from "@grabient/engine";
import { namedColor } from "@grabient/engine/named-colors.ts";
import { localHref, msg, rich, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { Curation } from "@grabient/ui/Curation.tsx";
import { Fit, type FitVote } from "@grabient/ui/Fit.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { PaletteGrid } from "@grabient/ui/PaletteGrid.tsx";
import { PaletteCardPlaceholder } from "@grabient/ui/PalettePlaceholder.tsx";
import { Placeholder } from "@grabient/ui/Placeholder.tsx";
import { RemovePress, UndoPress } from "@grabient/ui/RemovePress.tsx";
import { SaveToCollection } from "@grabient/ui/SaveToCollection.tsx";
import { Segmented } from "@grabient/ui/Segmented.tsx";
import { Status } from "@grabient/ui/Status.tsx";
import { Tags } from "@grabient/ui/Tags.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { useNavigate, useRouter } from "@tanstack/solid-router";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onSettled,
  Show,
  untrack,
  useContext
} from "solid-js";
import {
  createOfflineList,
  marked,
  offline,
  signInUnavailable,
  unreachable
} from "../../app/connection.ts";
import { AppPage } from "../../app/Frames.tsx";
import { goTo } from "../../app/go.ts";
import list from "../../app/list.module.css";
import { OfflineWays } from "../../app/OfflineList.tsx";
import { ShellContext } from "../../app/shell.ts";
import { isNextUndo, record, type Step, undo } from "../../app/undo.ts";
import { collectionSheet, relTo, SHEET_SIZE } from "../../lib/page-meta.ts";
import { hexesOf } from "../../lib/palette.ts";
import { failed } from "../../lib/query.ts";
import { listWords } from "../../lib/words.ts";
import {
  nameOwnPalette,
  ownCollectionDoc,
  ownCollectionMoved,
  ownsCollection,
  removeOwnPalette,
  restoreOwnPalette,
  serverWrote
} from "../account/collections.ts";
import { account, isAdmin, loginHref, sessionReady } from "../account/session.ts";
import { accountView, onAccountChange, syncStatus } from "../account/state.ts";
import { minuteOf, relativeAge } from "../gallery/drawing.ts";
import { drawnIn, type ListView } from "../list/appearance.ts";
import { useCollectionSeen } from "../palette-use/use.ts";
import { createSelectionScreen } from "../selection/SelectionScreen.tsx";
import { selection } from "../selection/selection.ts";
import { Actions } from "./Actions.tsx";
import { collectionHref, type PaletteOrder, sortCollectionItems } from "./address.ts";
import {
  castVote,
  changeCollection,
  deletePalette,
  inputOf,
  keyOf,
  removePalette,
  restorePalette,
  setPaletteView
} from "./client.ts";
import { createChecklists, failedWrite } from "./collect.ts";
import styles from "./collections.module.css";
import { createDeletable } from "./deletable.ts";
import { Heading } from "./Heading.tsx";
import { ItemCard } from "./ItemCard.tsx";
import { Notes } from "./Notes.tsx";
import { listBack, recallList, rememberOrder } from "./navigation.ts";
import { collectionGone, forgetPalette, paletteGone, recallCollection } from "./overlay.ts";
import { listSearch, pageSearch } from "./params.ts";
import { collectionQuery, type Found, forgetStates, stateQuery } from "./queries.ts";
import { ITEM_TITLE_MAX, type Visibility } from "./schema.ts";
import type { CollectionDocument, CollectionItem, CopyStanding, ViewerState } from "./types.ts";

type ViewerRead = ViewerState & { collection?: CollectionDocument };

/* One collection's page, at /{slug} and /{slug}/rising, or under its owner at /@{handle}/{slug}; its route draws a new
   one for each collection, so nothing of one collection's page stands on the next. The server draws a public
   collection whole; a private one is its owner's alone, so the server answers 404 naming it private, and the owner's
   browser fills it in from the account's copy or its own read. Once the reader is known, one read says what else they
   may do here: save a copy or bring one up to date, vote on each palette's fit, change their own (its words, who sees
   it, its palettes), and for an admin curate Grabient's and leave the agents notes. With no connection every press
   that needs the server keeps its place, disabled. */

/* a palette taken out stands faded, with Undo over it, this long before it leaves the grid; a mouse resting on it or
   the keyboard in it holds it, checked again each second */
const REMOVED_STAYS_MS = 6000;
const HOLD_MS = 1000;
const PLACEHOLDERS_MAX = 24;
/** The bar and the water read at most this many palettes. */
const PAINTED = 8;
const ORDERS: readonly { value: PaletteOrder; label: string }[] = [
  { value: "popular", label: msg("Popular", "order") },
  { value: "rising", label: msg("Rising", "order") }
];

interface Removal {
  item: CollectionItem;
  token: string | null;
  /** the step of the page's undo that took it out */
  step: Step;
}

/* Words saved under a new title move the collection to a new address, where its page is drawn anew: the heading drawn
   there takes back the keyboard the form had. The page it leads to has this long to be drawn. */
const RENAMED_MS = 4000;
let renamed: { slug: string; at: number } | null = null;

/** Why a palette stays where a person liked it: no curation takes it out. */
const likedBlock = (deletable?: boolean) => (deletable ? undefined : t("Liked by someone"));

export function CollectionPage(props: {
  slug: string;
  order: PaletteOrder;
  view: ListView;
  /** the server saw no session with the request: nobody here can be the owner of a private collection */
  signedOut?: boolean;
}) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();
  const shell = useContext(ShellContext)!;
  /* drawn at the address a rename on the page before it moved the collection to */
  const landed = untrack(() => {
    const was = renamed;
    if (!was || was.slug !== props.slug || performance.now() - was.at > RENAMED_MS) return false;
    renamed = null;
    return true;
  });
  const found = useQuery(() => collectionQuery(props.slug));
  const [note, setNote] = createSignal("");
  const [error, setError] = createSignal(false);
  const say = (message: string, isError = false) => {
    setNote(message);
    setError(isError);
  };
  /* the loader read the collection before the page was drawn, so its answer is always at hand */
  const answer = () => found.data;
  /* what the page was read as: a read that failed keeps what it showed, a list's summary or the collection */
  const data = () => {
    const read = answer();
    return read && "fetchedAt" in read ? read : null;
  };
  const readFailed = () => {
    const read = answer();
    return failed(read) ? read.failed : "";
  };
  /* a read that failed, asked again: once it answers, the route reads it as well, so the tab's title, the description and
     the card follow the collection the page now shows */
  const retry = async () => {
    const read = await found.refetch();
    if (!read.data || failed(read.data)) return;
    const here = router.state.matches.at(-1)?.id;
    await router.invalidate({ filter: match => match.id === here });
  };
  /* a collection that could not be read with no connection says so in its place, and is read as the connection
     returns */
  const unread = createOfflineList({
    failed: () => !!readFailed(),
    readAt: () => found.dataUpdatedAt,
    read: () => void retry()
  });
  const lineError = () => (unread() ? "" : readFailed());

  /* what the account may do here, and whether its copy holds the collection: read once the reader is known, private,
     and never part of what the page is drawn from first */
  const reader = () => (account() ? `${account()!.id} ${props.slug}` : "");
  type Viewer = { state?: ViewerRead | null; copy?: CollectionDocument | null };
  const [read, setRead] = createSignal<{ by: string } & Viewer>({ by: "" });
  const mineNow = () => (read().by && read().by === reader() ? read() : null);
  const state = () => mineNow()?.state ?? null;
  const readState = (who: string, slug: string, fresh = false) =>
    client.fetchQuery({ ...stateQuery(who, slug), ...(fresh ? { staleTime: 0 } : {}) });
  /* who sees it while an admin's press is on its way, which the heading shows; while it is, the collection may leave
     this address, and what was read of it stands */
  const [turning, setTurning] = createSignal<Visibility | null>(null);
  createEffect(
    () => {
      const who = account()?.id;
      /* an address the account's collection moved from leads on to it, where its state is read */
      return who && !ownCollectionMoved(props.slug)
        ? { by: reader(), who, slug: props.slug }
        : null;
    },
    asked => {
      if (!asked || untrack(turning)) return;
      const { by, who, slug } = asked;
      let live = true;
      const keep = (part: Viewer) => {
        if (live) setRead(now => ({ ...(now.by === by ? now : {}), by, ...part }));
      };
      readState(who, slug).then(
        state => keep({ state }),
        () => keep({ state: null })
      );
      void untrack(() => ownCollectionDoc(slug)).then(
        copy => keep({ copy: copy ?? null }),
        () => keep({ copy: null })
      );
      return () => {
        live = false;
      };
    }
  );
  /* the account's own, once its copy holds it: the page follows the copy as it changes, here, in another tab, or by an
     undo made from another page */
  const copied = createMemo(() => {
    const held = mineNow()?.copy;
    return held ? (accountView().collections.get(held.slug) ?? held) : undefined;
  });
  /* the answer of a write the server took straight, which stands until the copy holds as new a collection */
  const [own, setOwn] = createSignal<CollectionDocument | null>(null);
  /* a collection this tab deleted is not here, whatever an answer kept from before says; read as the page opens, so
     the page it was deleted on stands until the reader has left it */
  const deleted = untrack(() => collectionGone(props.slug));
  const doc = (): CollectionDocument | null => {
    if (deleted) return null;
    const wrote = own();
    const held = copied();
    return (
      (wrote && held && held.updatedAt >= wrote.updatedAt ? held : (wrote ?? held)) ??
      state()?.collection ??
      data()?.doc ??
      null
    );
  };
  const owned = () => !!copied() || !!state()?.owned;
  const curating = () => !!state()?.canCurate && isAdmin();
  const provisional = () => !own() && !copied() && !state()?.collection && !!data()?.provisional;
  /* when the page's data was read, and its minute: the clock its ages are told against, the same for the server and
     hydration */
  const readAt = () => data()?.fetchedAt ?? Date.now();
  const now = () => minuteOf(readAt());

  /* the account's private collection its title just moved is its own at the new address, which the copy has not heard
     of yet: the copy and the private read fill the page there, and the public read could only refuse it */
  const ownAt = (moved: CollectionDocument) => {
    if (moved.visibility !== "private" || moved.slug === props.slug) return;
    const own: Found = { doc: null, own: true, fetchedAt: Date.now() };
    client.setQueryData(collectionQuery(moved.slug).queryKey, own);
  };
  /* a collection the server moved (a new title, who sees it, a new username) is followed to its new address; a move of
     the page's own press waits for the press's writes to end, so every press lands on one page */
  const follow = (slug: string) => {
    if (slug !== props.slug)
      void navigate({
        href: collectionHref(slug, props.order) + pageSearch(props.view),
        replace: true
      });
  };
  createEffect(
    () => {
      const moved = account() && !turning() ? ownCollectionMoved(props.slug) : null;
      return moved && moved !== props.slug
        ? collectionHref(moved, props.order) + pageSearch(props.view)
        : null;
    },
    href => {
      if (href) void untrack(() => navigate({ href, replace: true }));
    }
  );
  /* the tab says the collection once the owner's read brings one the server could not draw */
  createEffect(
    () => (data()?.doc ? null : doc()?.title),
    title => {
      if (title) document.title = `${title} | Grabient`;
    }
  );
  /* a public collection's page seen, counted once for the seeding agents beside what its readers take: the page's
     reads settle again and again, and an effect runs each time its compute does */
  let seen = "";
  createEffect(
    () => (doc()?.visibility === "public" ? doc()!.slug : ""),
    slug => {
      if (!slug || slug === seen) return;
      seen = slug;
      useCollectionSeen(slug);
    }
  );

  /* the copy standing: the account's copy of this one, or this one as the account's copy. A copy this tab deleted is
     none, whatever a read answered before the server heard of it says */
  const [copy, setCopy] = createSignal<CopyStanding | null | undefined>(undefined);
  const standing = () => {
    const held = copy() === undefined ? (state()?.copy ?? null) : copy()!;
    return held && collectionGone(held.slug) ? null : held;
  };
  /* a copy made or taken back by a press here, or by its undo from another page: no kept answer says so */
  const stand = (next: CopyStanding | null) => {
    if (next) recallCollection(next.slug);
    setCopy(next);
    forgetStates();
  };
  /* the account's copy went or moved while the page stands, on another page's undo or in another tab */
  onSettled(() =>
    onAccountChange(change => {
      const held = untrack(standing);
      if (!held) return;
      const to = change.moved.get(held.slug);
      if (to) setCopy({ ...held, slug: to });
      else if (change.removed.has(held.slug)) setCopy(null);
    })
  );
  const savedFrom = () => {
    const held = standing();
    return held && owned() && held.slug === props.slug ? held : null;
  };
  /* a saved collection the account changed stands differently against its source: asked again once the changes
     waiting for the server are all sent */
  createEffect(
    () => {
      const sync = syncStatus();
      return sync.pending ? 0 : sync.syncedAt;
    },
    (at, was) => {
      const who = untrack(() => account()?.id);
      if (!at || was !== 0 || !who || !untrack(savedFrom)) return;
      const slug = untrack(() => props.slug);
      readState(who, slug, true).then(
        state => {
          if (state && untrack(reader) === `${who} ${slug}`) setCopy(state.copy);
        },
        () => {}
      );
    }
  );

  /* the palettes taken out while the page stands, each keeping its place a while, faded, with Undo over it */
  const [removals, setRemovals] = createSignal<ReadonlyMap<string, Removal>>(new Map());
  const leaving = new Map<string, ReturnType<typeof setTimeout>>();
  onSettled(() => {
    recallList();
    return () => {
      for (const timer of leaving.values()) clearTimeout(timer);
    };
  });
  const showRemoved = (key: string, removal: Removal | null) => {
    clearTimeout(leaving.get(key));
    leaving.delete(key);
    setRemovals(shown => {
      const next = new Map(shown);
      if (removal) next.set(key, removal);
      else next.delete(key);
      return next;
    });
    if (!removal) return;
    const later = (after: number) =>
      leaving.set(
        key,
        setTimeout(() => {
          const card = document.querySelector(`[data-item="${CSS.escape(key)}"]`);
          const rested =
            !!card &&
            ((!matchMedia("(pointer: coarse)").matches && card.matches(":hover")) ||
              !!card.querySelector(":focus-visible"));
          if (rested) later(HOLD_MS);
          else showRemoved(key, null);
        }, after)
      );
    later(REMOVED_STAYS_MS);
  };
  /* the palettes in the order the address says, by the likes the page was sent, so a like moves a count, never a card */
  const ordered = createMemo(() =>
    sortCollectionItems(
      (doc()?.items ?? []).filter(item => !paletteGone(item.kseed)),
      props.order
    )
  );
  const shown = createMemo(() => {
    const held = new Set(ordered().map(keyOf));
    const gone = [...removals().values()].map(r => r.item).filter(item => !held.has(keyOf(item)));
    return gone.length ? sortCollectionItems([...ordered(), ...gone], props.order) : ordered();
  });
  const removedKey = (item: CollectionItem) => {
    const key = keyOf(item);
    return removals().has(key) && !doc()?.items.some(i => keyOf(i) === key) ? key : null;
  };
  /* the collection's palettes as the page draws them, in its order: what Add all takes and the frame paints */
  const palettes = createMemo(() => ordered().map(item => drawnIn(inputOf(item), props.view)));

  /* the owner takes a palette out: through the account's copy where it holds the collection, else the server. The
     removal is a step of the page's undo, and its token puts the palette back where it stood */
  const [busyItem, setBusyItem] = createSignal("");
  const removeFrom = async (slug: string, item: CollectionItem) => {
    const answer = ownsCollection(slug)
      ? removeOwnPalette(slug, item.kseed, {
          style: item.style,
          steps: item.steps,
          angle: item.angle
        })
      : await removePalette(slug, inputOf(item));
    if (!ownsCollection(slug)) {
      serverWrote();
      setOwn(answer.collection);
    }
    return answer.restore ?? null;
  };
  const restoreTo = async (slug: string, item: CollectionItem, token: string) => {
    const answer = ownsCollection(slug)
      ? restoreOwnPalette(slug, item.kseed, token)
      : await restorePalette(slug, item.kseed, token);
    if (!ownsCollection(slug)) {
      serverWrote();
      setOwn(answer.collection);
    }
  };
  const takeOut = async (item: CollectionItem) => {
    const current = doc();
    if (!current || busyItem()) return;
    const key = keyOf(item);
    setBusyItem(key);
    say("");
    try {
      const slug = current.slug;
      let token = await removeFrom(slug, item);
      const step: Step = {
        undo: async () => {
          if (!token) throw new Error(t("This palette can't be put back."));
          await restoreTo(slug, item, token);
          showRemoved(key, null);
          say(t("Palette put back."));
        },
        redo: async () => {
          token = await removeFrom(slug, item);
          showRemoved(key, { item, token, step });
          say(t("Palette removed."));
        },
        fail: reason => say(failedWrite(reason, msg("Couldn't put the palette back.")), true)
      };
      showRemoved(key, { item, token, step });
      record(step);
      say(t("Palette removed."));
    } catch (reason) {
      say(failedWrite(reason, msg("Couldn't remove the palette.")), true);
      throw reason;
    } finally {
      setBusyItem("");
    }
  };
  /* the owner names a palette, or takes its title away: in the account's copy, offline too, as a step of the page's
     undo */
  const rename = (item: CollectionItem, title: string) => {
    const current = doc();
    if (!current || !ownsCollection(current.slug)) return;
    const slug = current.slug;
    const input = inputOf(item);
    const was = item.title ?? "";
    const name = async (words: string) => {
      nameOwnPalette(slug, input, words);
    };
    try {
      nameOwnPalette(slug, input, title);
    } catch (reason) {
      say(failedWrite(reason, msg("Couldn't save.")), true);
      return;
    }
    record({
      undo: () => name(was),
      redo: () => name(title),
      fail: reason => say(failedWrite(reason, msg("Couldn't save.")), true)
    });
  };
  /* Undo on a faded card: the page's own undo while its removal is the last step, so Mod+Shift+Z takes it out again;
     else it puts the palette back as a step of its own */
  const putBack = async (key: string) => {
    const removal = removals().get(key);
    const current = doc();
    if (!removal || !current) return;
    if (isNextUndo(removal.step)) return undo();
    setBusyItem(key);
    say("");
    try {
      if (!removal.token) throw new Error(t("This palette can't be put back."));
      const slug = current.slug;
      await restoreTo(slug, removal.item, removal.token);
      showRemoved(key, null);
      say(t("Palette put back."));
      let token: string | null = null;
      record({
        undo: async () => {
          token = await removeFrom(slug, removal.item);
          showRemoved(key, { ...removal, token });
        },
        redo: async () => {
          if (token) await restoreTo(slug, removal.item, token);
          showRemoved(key, null);
        },
        fail: reason => say(failedWrite(reason), true)
      });
    } catch (reason) {
      say(failedWrite(reason, msg("Couldn't put the palette back.")), true);
      throw reason;
    } finally {
      setBusyItem("");
    }
  };

  /* an admin's curation of one of Grabient's: a palette drawn another way, or deleted everywhere */
  const deletable = createDeletable();
  createEffect(
    () => (curating() ? (doc()?.items ?? []).map(item => item.kseed) : []),
    seeds => {
      if (seeds.length) deletable.learn(seeds);
    }
  );
  const setView = async (
    item: CollectionItem,
    view: { style: string; steps: number; angle: number },
    why: object
  ) => {
    const current = doc();
    if (!current) return;
    const answer = await setPaletteView(current.slug, inputOf(item), view, why);
    setOwn(answer.collection);
    forgetStates();
    say(t("View saved."));
  };
  const deleteEverywhere = async (item: CollectionItem, why: object) => {
    const current = doc();
    if (!current) return;
    await deletePalette(item.kseed, why);
    forgetPalette(item.kseed);
    forgetStates();
    const items = current.items.filter(entry => entry.kseed !== item.kseed);
    setOwn({ ...current, items, itemCount: items.length, updatedAt: Date.now() });
    void client.invalidateQueries({ queryKey: ["collections"] });
    say(t("Palette deleted."));
  };

  /* the reader's fit votes: a press shows at once, one write per palette at a time, the last press winning; a failure
     puts the vote back */
  const [pressed, setPressed] = createSignal<Readonly<Record<string, FitVote | null>>>({});
  const voteOf = (seed: string): FitVote | null => {
    const mine = pressed();
    return seed in mine ? (mine[seed] ?? null) : (state()?.votes[seed] ?? null);
  };
  const showVote = (seed: string, to: FitVote | null) =>
    setPressed(all => ({ ...all, [seed]: to }));
  const waiting = new Map<string, FitVote | null>();
  const vote = async (item: CollectionItem, next: FitVote | null) => {
    const current = doc();
    if (!current) return;
    if (!account()) {
      if (!sessionReady()) return;
      return goTo(localHref(loginHref()));
    }
    const seed = item.kseed;
    const sending = waiting.has(seed);
    let before = voteOf(seed);
    showVote(seed, next);
    waiting.set(seed, next);
    if (sending) return;
    try {
      while (waiting.has(seed)) {
        const asked = waiting.get(seed) ?? null;
        await castVote(current.slug, seed, asked);
        before = asked;
        if (waiting.get(seed) === asked) waiting.delete(seed);
      }
      forgetStates();
    } catch (reason) {
      waiting.delete(seed);
      showVote(seed, before);
      say(failedWrite(reason, msg("Couldn't save your vote.")), true);
    }
  };

  /* the selection: its press at the head of the row's actions, its export screen in the page's place, and its Save
     into the account's collections */
  const checklists = createChecklists(say);
  const saving = checklists.selection(() => selection().map(inputOf));
  const sel = createSelectionScreen({
    note: say,
    save: () => (
      <SaveToCollection
        own={saving.own}
        onOwn={saving.onOwn}
        onChanged={saving.onChanged}
        onToggle={saving.onToggle}
        onNew={saving.onNew}
        signIn={saving.signIn}
        disabled={signInUnavailable()}
      />
    )
  });
  /* after the selection's own, so this one stands: the selection while its screen is shown, else the page's first
     palettes; with none of its own yet, whatever the loader read */
  shell.paint(() =>
    sel.open() ? selection() : palettes().length ? palettes().slice(0, PAINTED) : null
  );

  /* a tag's colors, as a read of the collection brought them: the account's copy and a write's answer bring none, so a
     tag they show takes the colors a read gave the same words */
  const colorsOf = (tag: string) => {
    const read = [doc(), state()?.collection, data()?.doc].find(
      d => d?.tagColors && d.tags.includes(tag)
    );
    return read?.tagColors?.[read.tags.indexOf(tag)];
  };
  /* the collection's tags, each the palettes searched for it in the page's order: as in every row of tags, words
     search palettes and only a collection's title opens collections */
  const tags = () =>
    marked(
      (doc()?.tags ?? []).map(tag => {
        const href = localHref(
          `/palettes${props.order === "rising" ? "/rising" : ""}${listSearch({ query: listWords(tag), view: props.view })}`
        );
        return { label: tag, colors: colorsOf(tag), href, rel: relTo(href) };
      })
    );
  const pageHref = (order: PaletteOrder) =>
    localHref(collectionHref(props.slug, order) + pageSearch(props.view));
  /* the collection's two orders; while it is not here, each keeps its place and leads nowhere */
  const orders = (here: boolean) => (
    <div class={styles.order}>
      <Segmented
        aria-label={t("Order")}
        value={props.order}
        options={ORDERS.map(o => ({
          value: o.value,
          label: t(o.label, { $context: "order" }),
          href: pageHref(o.value),
          rel: relTo(pageHref(o.value)),
          disabled: !here
        }))}
        onChange={value => {
          if (!here) return;
          rememberOrder(value as PaletteOrder);
          void navigate({
            href: collectionHref(props.slug, value as PaletteOrder) + pageSearch(props.view),
            resetScroll: false
          });
        }}
      />
    </div>
  );
  const back = () => listBack(props.order, props.view);
  /* nothing public lives here, and whether this reader may see more is not known yet: until the session answers
     (unless the request came with none), and then until the account's own read does, the page waits to say */
  const unknown = () => {
    if (doc() || !data()) return false;
    if (!sessionReady()) return !props.signedOut;
    const mine = mineNow();
    return !!account() && !(mine && mine.state !== undefined && mine.copy !== undefined);
  };
  /* a private collection's words for a reader not signed in: the way to sign in as its owner */
  const privateHere = () => !doc() && !!data()?.private && !unknown() && !account();
  const missing = () => !doc() && !!data() && !unknown() && !privateHere();
  const empty = () => !!doc() && !provisional() && !doc()!.items.length;
  const waitingFor = () => {
    const drawn = shown().length;
    const count = doc()?.itemCount;
    return Math.max(0, Math.min(count ?? 6, PLACEHOLDERS_MAX) - drawn);
  };
  const place = () => ({ surface: "collection" as const });

  return (
    <AppPage floats bare={sel.open()}>
      {/* the page stays mounted and out of sight while the export screen takes its place, so Close returns to the
          same cards */}
      <main
        id="main"
        class={list.column}
        hidden={sel.open()}
        aria-busy={(provisional() && !readFailed()) || unknown() ? "true" : "false"}
      >
        {/* the lists' band above the row: the way back where their search stands, the tags where theirs stand */}
        <div class={list.find}>
          <div class={styles.back}>
            <Button size="sm" href={localHref(back())} disabled={unreachable(back())}>
              <Icon name="back" size={13} /> {t("Collections")}
            </Button>
          </div>
          <Show when={doc() || unread()}>
            <Tags tags={tags()} />
          </Show>
        </div>
        <Show when={unread() && !doc()}>
          <div class={list.row}>
            {orders(false)}
            {/* the presses every reader has on a collection not theirs, in their places: no palettes here to add,
                and no connection to save with */}
            <div class={styles.actions}>
              {sel.button()}
              <Button
                icon
                size="lg"
                aria-label={t("Add all to selection")}
                tip={t("Add all to selection")}
                disabled
              >
                <Icon name="plus" size={15} />
              </Button>
              <Button icon size="lg" aria-label={t("Save")} tip={t("Save")} disabled>
                <Icon name="bookmark" size={15} />
              </Button>
            </div>
          </div>
          {sel.float()}
          <div class={styles.body}>
            <div class={styles.heading}>
              <Text variant="title" as="h1">
                {t("You're offline.")}
              </Text>
            </div>
            <div class={styles.words}>
              <Text variant="lede">
                {t("This collection opens offline once you've seen it online.")}
              </Text>
              <OfflineWays ways={["collections"]} />
            </div>
          </div>
        </Show>
        <Show
          when={doc()}
          fallback={
            <Show when={!unread() && ((data() && !unknown()) || readFailed())}>
              <div class={styles.words}>
                <Text variant="title" as="h1">
                  {t(
                    privateHere()
                      ? msg("This collection is private.")
                      : readFailed()
                        ? msg("Couldn't load this collection.")
                        : msg("Collection not found")
                  )}
                </Text>
                <Show when={privateHere() || missing()}>
                  <Text variant="lede">
                    {privateHere()
                      ? rich("<signin>Sign in</signin> as its owner to see it.", {
                          signin: words => (
                            <a
                              class={styles.inline}
                              href={localHref(loginHref(collectionHref(props.slug, props.order)))}
                            >
                              {words}
                            </a>
                          )
                        })
                      : t("It may have been deleted.")}
                  </Text>
                </Show>
              </div>
            </Show>
          }
        >
          {current => (
            <>
              <div class={list.row}>
                {orders(true)}
                <Actions
                  slug={props.slug}
                  doc={current()}
                  palettes={palettes()}
                  owned={owned()}
                  canDelete={owned() || curating()}
                  copy={standing()}
                  provisional={provisional()}
                  selection={sel.button()}
                  say={say}
                  onDoc={setOwn}
                  onCopy={stand}
                  onMoved={follow}
                  onTurning={setTurning}
                  onDeleted={() => void navigate({ href: owned() ? "/collections/saved" : back() })}
                />
              </div>
              {sel.float()}
              <div class={styles.body}>
                <Heading
                  doc={current()}
                  color={namedColor(props.slug)}
                  visibility={turning() ?? current().visibility}
                  savedFrom={savedFrom()}
                  now={now()}
                  admin={isAdmin()}
                  editable={owned() && current().owner.kind === "user"}
                  landed={landed}
                  onWords={async words => {
                    const answer = await changeCollection(current().slug, words);
                    serverWrote();
                    setOwn(answer.collection);
                    ownAt(answer.collection);
                    const to = answer.collection.slug;
                    if (to === props.slug) return false;
                    renamed = { slug: to, at: performance.now() };
                    follow(to);
                    return true;
                  }}
                />
                <PaletteGrid>
                  <For each={shown()} keyed={item => keyOf(item)}>
                    {item => {
                      const gone = () => removedKey(item());
                      const seed = () => item().kseed;
                      return (
                        <div class={styles.cell} data-item={keyOf(item())}>
                          <ItemCard
                            own={inputOf(item())}
                            words={{ title: item().title, description: item().description }}
                            naming={
                              owned() &&
                              current().owner.kind === "user" &&
                              ownsCollection(current().slug) &&
                              !gone()
                                ? {
                                    max: ITEM_TITLE_MAX,
                                    onName: (title: string) => rename(item(), title)
                                  }
                                : undefined
                            }
                            view={props.view}
                            age={relativeAge(item().createdAt, now())}
                            likes={item().likes}
                            readAt={readAt()}
                            collection={current().slug}
                            place={place}
                            at={() => ({
                              collection:
                                current().visibility === "public" ? current().slug : undefined,
                              position: shown().findIndex(entry => entry.kseed === seed())
                            })}
                            collect={checklists.card}
                            note={say}
                            removed={!!gone()}
                            fit={
                              <Fit
                                value={voteOf(seed())}
                                admin={curating()}
                                collection={current().title}
                                disabled={offline()}
                                onVote={next => void vote(item(), next)}
                              />
                            }
                            lead={
                              <Show
                                when={!gone()}
                                fallback={
                                  <UndoPress
                                    item={keyOf(item())}
                                    onUndo={() => putBack(gone()!)}
                                    disabled={!!busyItem()}
                                  />
                                }
                              >
                                <Show when={owned() && current().owner.kind === "user"}>
                                  <RemovePress
                                    item={keyOf(item())}
                                    onRemove={() => takeOut(item())}
                                    disabled={!!busyItem()}
                                  />
                                </Show>
                                <Show when={curating() && deletable.of(seed()) !== undefined}>
                                  <Curation
                                    mode="view"
                                    icon="sliders"
                                    blocked={likedBlock(deletable.of(seed()))}
                                    stops={hexesOf(inputOf(item()))}
                                    view={inputOf(item())}
                                    stopsAt={steps => hexesOf({ seed: seed(), steps })}
                                    minSteps={decodePalette(seed())?.anchors.length}
                                    onConfirm={result =>
                                      setView(item(), result.view!, {
                                        reasons: result.reasons,
                                        comment: result.comment
                                      })
                                    }
                                  />
                                  <Curation
                                    mode="delete"
                                    icon="trash"
                                    blocked={likedBlock(deletable.of(seed()))}
                                    stops={hexesOf(inputOf(item()))}
                                    view={inputOf(item())}
                                    onConfirm={result =>
                                      deleteEverywhere(item(), {
                                        reasons: result.reasons,
                                        comment: result.comment
                                      })
                                    }
                                  />
                                </Show>
                              </Show>
                            }
                          />
                        </div>
                      );
                    }}
                  </For>
                  <For
                    each={Array.from(
                      { length: provisional() && !readFailed() ? waitingFor() : 0 },
                      (_, i) => i
                    )}
                  >
                    {() => (
                      <div class={styles.cell}>
                        <PaletteCardPlaceholder />
                      </div>
                    )}
                  </For>
                </PaletteGrid>
                {/* its first palettes as one picture under its cards, which image searches show, and its file */}
                <Show
                  when={
                    !provisional() &&
                    (turning() ?? current().visibility) === "public" &&
                    current().items.length > 0
                  }
                >
                  <figure class={styles.sheet}>
                    <img
                      class={styles.sheetPicture}
                      src={collectionSheet(current().slug, current().updatedAt)}
                      alt={t("{title}: a collection of color palettes", { title: current().title })}
                      width={SHEET_SIZE.width}
                      height={SHEET_SIZE.height}
                      loading="lazy"
                      decoding="async"
                    />
                    <figcaption>
                      <Button
                        size="sm"
                        href={collectionSheet(current().slug, current().updatedAt)}
                        download={`${current().slug.split("/").pop()}.png`}
                        disabled={offline()}
                      >
                        <Icon name="download" size={13} /> {t("Download PNG")}
                      </Button>
                    </figcaption>
                  </figure>
                </Show>
              </div>
            </>
          )}
        </Show>
        <Show when={unknown() || (!doc() && !data() && !readFailed())}>
          <div class={styles.body}>
            <div class={styles.heading}>
              <Placeholder width="320px" height="32px" />
            </div>
            <PaletteGrid>
              <For each={Array.from({ length: 6 }, (_, i) => i)}>
                {() => <PaletteCardPlaceholder />}
              </For>
            </PaletteGrid>
          </div>
        </Show>
        <div class={styles.line}>
          <Status error={error() || !!lineError() || (missing() && !note())}>
            {lineError() ||
              note() ||
              (missing()
                ? t("Collection not found. It may have been deleted.")
                : empty()
                  ? t("This collection is empty.")
                  : "")}
          </Status>
          <Show when={lineError()}>
            <Button size="sm" onClick={() => void retry()}>
              {t("Retry")}
            </Button>
          </Show>
          {/* its owner fills it again from the lists: the selection's Save adds to a collection of theirs */}
          <Show when={empty() && owned()}>
            <Button size="sm" href={localHref("/palettes")} disabled={offline()}>
              {t("Browse palettes")}
            </Button>
          </Show>
        </div>
        <Show when={isAdmin() && doc() && state()?.notes}>
          {notes => <Notes slug={untrack(() => props.slug)} notes={notes()} now={now()} />}
        </Show>
      </main>
      {sel.screen()}
    </AppPage>
  );
}
