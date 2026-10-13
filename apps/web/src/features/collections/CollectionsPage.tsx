import { localHref, msg, t } from "@grabient/i18n";
import { BackToTop } from "@grabient/ui/BackToTop.tsx";
import { Button } from "@grabient/ui/Button.tsx";
import {
  CollectionGroup,
  CollectionGroupPlaceholder,
  shownAt
} from "@grabient/ui/CollectionGroup.tsx";
import { CollectPress } from "@grabient/ui/CollectPress.tsx";
import { Curation } from "@grabient/ui/Curation.tsx";
import { Fit } from "@grabient/ui/Fit.tsx";
import { GroupFeed } from "@grabient/ui/GroupFeed.tsx";
import { ListNav, type Order } from "@grabient/ui/ListNav.tsx";
import { PaletteCard } from "@grabient/ui/PaletteCard.tsx";
import { columnsAt } from "@grabient/ui/PaletteGrid.tsx";
import { Status } from "@grabient/ui/Status.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { useNavigate, useRouterState } from "@tanstack/solid-router";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Loading,
  onSettled,
  Show,
  untrack
} from "solid-js";
import { record } from "../../app/undo.ts";
import { likeCount, liked, noteCounts, readLikeCounts, toggleLike } from "../account/likes.ts";
import { account, isAdmin, loginHref, sessionReady } from "../account/session.ts";
import { createPicture, type Settled } from "../search/picture.ts";
import { Sampler } from "../search/Sampler.tsx";
import { selected, toggle } from "../selection/selection.ts";
import { collectionHref, type PaletteOrder } from "./address.ts";
import { deletePalette, inputOf } from "./client.ts";
import { createChecklists } from "./collect.ts";
import styles from "./collections.module.css";
import { createDeletable } from "./deletable.ts";
import {
  drawnAs,
  hexesOf,
  minuteOf,
  nameOf,
  ownerLabel,
  paletteHref,
  relativeAge
} from "./drawing.ts";
import { Find, viewWith } from "./Find.tsx";
import { createFit } from "./fit.ts";
import { followInPlace } from "./navigation.ts";
import { collectionGone, forgetPalette, paletteGone } from "./overlay.ts";
import { type ListPlace, listKey, listPath, listSearch } from "./params.ts";
import { collectionQuery, collectionsQuery, failed, ownQuery } from "./queries.ts";
import type { CollectionPage, CollectionPreview, CollectionSummary, RisingFrame } from "./types.ts";

/* The collections lists: Popular (/collections), Rising in its frame (/collections/rising) and the account's own
   (/collections/saved), each searched with `?q=`. A list is a feed: its address's own page, then each page after it
   joining as the reader nears the end, at the same address, with only the groups near the viewport drawn. Each
   collection is a group of its first palettes; a searched list's cards carry thumbs that rate a palette's fit for its
   group's collection, never for the words. */

/* a group's height before it is measured: its line, and its rows of cards with the gaps between them */
const HEAD = 72;
const CARD = 344;
const ROW_GAP = 40;
const estimate = (item: CollectionSummary, width: number) => {
  const columns = columnsAt(width);
  const rows = Math.max(1, Math.ceil(shownAt(columns, item.preview.length) / columns));
  return HEAD + rows * CARD + (rows - 1) * ROW_GAP;
};
/* the groups the server draws, and of them the ones a page starts with live */
const INITIAL = 3;
const LIVE = 2;
/* the next page is asked for this far before its mark comes into view */
const AHEAD = "0px 0px 1200px 0px";
const FRAMES: readonly RisingFrame[] = ["1w", "3m", "1y"];

export function CollectionsPage(props: { place: ListPlace }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const go = (href: string) => void navigate({ href });
  const navigating = useRouterState({ select: state => state.status === "pending" });
  const place = () => props.place;
  const mine = () => place().order === "saved";
  const signedOut = () => mine() && sessionReady() && !account();

  const publicList = useQuery(() => ({ ...collectionsQuery(listKey(place())), enabled: !mine() }));
  const ownList = useQuery(() => ({
    ...ownQuery(account()?.id ?? "", { ...listKey(place()), sort: "newest" }),
    enabled: mine() && !!account()
  }));
  /* a query's data is read once it has answered: an unanswered one has no value to read outside a Loading boundary */
  const headData = () =>
    mine()
      ? account() && ownList.isSuccess
        ? ownList.data
        : undefined
      : publicList.isSuccess
        ? publicList.data
        : undefined;
  const head = (): CollectionPage | null => {
    const data = headData();
    return data && !failed(data) ? data : null;
  };
  const headError = () => {
    const data = headData();
    return failed(data) ? data.failed : "";
  };
  const [note, setNote] = createSignal("");
  const [fieldError, setFieldError] = createSignal("");

  /* the pages after the address's own, joined as the reader nears the end, for the list they joined; a failed one
     waits for Retry */
  const listId = () => JSON.stringify([mine(), listKey(place())]);
  const [more, setMore] = createSignal<{ id: string; pages: readonly CollectionPage[] }>({
    id: "",
    pages: []
  });
  const joined = () => (more().id === listId() ? more().pages : []);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [moreError, setMoreError] = createSignal("");
  const last = () => joined().at(-1) ?? head();
  const hasMore = () => {
    const tail = last();
    return !!tail && tail.page < tail.totalPages;
  };
  const readPage = (n: number) =>
    mine()
      ? client.fetchQuery(
          ownQuery(account()?.id ?? "", { ...listKey(place()), sort: "newest", page: n })
        )
      : client.fetchQuery(collectionsQuery({ ...listKey(place()), page: n }));
  const loadMore = async (retry = false) => {
    const tail = last();
    if (!tail || !hasMore() || loadingMore() || (moreError() && !retry)) return;
    const id = listId();
    setLoadingMore(true);
    setMoreError("");
    try {
      const next = await readPage(tail.page + 1);
      if (id !== listId()) return;
      if (failed(next)) setMoreError(next.failed);
      else setMore({ id, pages: [...joined(), next] });
    } finally {
      setLoadingMore(false);
    }
  };
  let mark: HTMLDivElement | undefined;
  onSettled(() => {
    const watcher = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: AHEAD }
    );
    if (mark) watcher.observe(mark);
    return () => watcher.disconnect();
  });
  /* every collection once, in the order the pages came, less what this tab deleted */
  const items = createMemo(() => {
    const seen = new Set<string>();
    const out: CollectionSummary[] = [];
    for (const page of [head(), ...joined()])
      for (const item of page?.items ?? [])
        if (!seen.has(item.slug) && !collectionGone(item.slug)) {
          seen.add(item.slug);
          out.push(item);
        }
    return out;
  });
  const now = () => minuteOf(head()?.fetchedAt ?? Date.now());
  /* the counts beside the hearts start as each page read them */
  createEffect(
    () => [head(), ...joined()],
    pages => {
      for (const page of pages)
        if (page)
          noteCounts(
            page.items.flatMap(c => c.preview.map(p => ({ seed: p.seed, likes: p.likes ?? 0 }))),
            page.fetchedAt
          );
    }
  );

  /* a searched list's thumbs rate each palette's fit for its group's collection */
  const fit = createFit({
    slugs: () => (place().query ? items().map(c => c.slug) : []),
    say: setNote
  });
  /* an admin deletes, from under its card in one of Grabient's groups, a palette no person liked */
  const deletable = createDeletable();
  createEffect(
    () =>
      isAdmin()
        ? items()
            .filter(c => c.owner.kind === "agent")
            .flatMap(c => c.preview.map(p => p.seed))
        : [],
    seeds => {
      if (seeds.length) deletable.learn(seeds);
    }
  );
  const kept = (c: CollectionSummary) => c.preview.filter(p => !paletteGone(p.seed));
  const removeEverywhere = async (seed: string, why: object) => {
    await deletePalette(seed, why);
    forgetPalette(seed);
    void client.invalidateQueries({ queryKey: ["collection"] });
    setNote(t("Palette deleted."));
  };
  const checklists = createChecklists(setNote);
  /* a collection opened from Rising opens with its palettes rising first */
  const openOrder = (): PaletteOrder => (place().order === "rising" ? "rising" : "popular");
  const pageView = () => listSearch({ view: place().view });
  const groupHref = (slug: string) =>
    localHref(collectionHref(slug, mine() ? "popular" : openOrder()) + pageView());

  const card = (preview: () => CollectionPreview, collection: () => CollectionSummary) => {
    const palette = createMemo(() => drawnAs(inputOf(preview()), place().view));
    const stops = createMemo(() => hexesOf(palette().seed, palette().steps));
    const seed = () => preview().seed;
    const agents = () => isAdmin() && collection().owner.kind === "agent";
    /* a group drawn is a group in the window: its counts are asked again where they are old */
    onSettled(() => void readLikeCounts([untrack(seed)]));
    return (
      <PaletteCard
        seed={seed()}
        name={nameOf(palette())}
        stops={stops()}
        style={palette().style}
        angle={palette().angle}
        href={paletteHref(palette(), place().view.size)}
        age={relativeAge(preview().createdAt ?? collection().updatedAt, now())}
        likes={likeCount(seed(), preview().likes ?? 0)}
        liked={liked(seed())}
        onLike={() => void toggleLike(seed(), !liked(seed()), { collectionId: collection().slug })}
        selected={selected(palette())}
        onSelect={() => toggle(palette())}
        collect={<CollectPress collect={checklists.card(() => inputOf(preview()))} />}
        fit={
          place().query ? (
            <Fit
              value={fit.of(collection().slug, seed())}
              admin={agents()}
              collection={collection().title}
              onVote={next => fit.vote(collection().slug, seed(), next)}
            />
          ) : undefined
        }
        lead={
          <Show when={agents() && deletable.of(seed()) !== undefined}>
            <Curation
              mode="delete"
              icon="trash"
              blocked={deletable.of(seed()) ? undefined : t("Liked by someone")}
              stops={stops()}
              view={inputOf(preview())}
              onConfirm={result =>
                removeEverywhere(seed(), { reasons: result.reasons, comment: result.comment })
              }
            />
          </Show>
        }
      />
    );
  };

  /* A picture is searched by its colors: read in this browser and held in this tab, so a reload or Back finds it beside
     its search. Its colors are nobody's words and no title. A point that comes to rest searches its colors in this
     page's place in the history, and the change is a step of the page's undo. */
  const picture = createPicture();
  onSettled(() => picture.restore(untrack(() => place().query)));
  const held = () => (mine() ? null : picture.pictureFor(place().query));
  const searchHref = (words: string, view?: URLSearchParams) =>
    listPath(place().order, place().frame) +
    listSearch({ query: words, view: viewWith(place().view, view) });
  const searchImage = async (file: File) => {
    const colors = await picture.take(file);
    if (!colors) return setFieldError(t("Couldn't read this image."));
    go(searchHref(colors));
  };
  const searchColors = (colors: string | null) => {
    if (colors && colors !== place().query)
      void navigate({ href: searchHref(colors), replace: true });
  };
  const rest = (done: Settled | null) => {
    if (!done) return;
    const show = (points: Settled["before"]) => async () => searchColors(picture.show(points));
    record({ undo: show(done.before), redo: show(done.after) });
    searchColors(done.colors);
  };

  /* where each list lives, keeping the words and the view; a press on Rising while it is the order moves its frame */
  const nextFrame = () => FRAMES[(FRAMES.indexOf(place().frame) + 1) % FRAMES.length]!;
  const orderTarget = (order: Order) =>
    listPath(
      order,
      order === "rising" ? (place().order === "rising" ? nextFrame() : place().frame) : "1w"
    ) + listSearch({ query: place().query, view: place().view });
  const sectionTarget = (section: "palettes" | "collections") =>
    section === "palettes"
      ? `/palettes${listSearch({ query: place().query, view: place().view })}`
      : listPath(place().order, place().frame) +
        listSearch({ query: place().query, view: place().view });
  const pickOrder = (order: Order) => {
    /* in the page's own place in the history, so Back leaves Rising in one press */
    if (order === "rising" && place().order === "rising")
      return void navigate({ href: orderTarget(order), replace: true });
    if (order === "saved" && !account()) return go(loginHref(orderTarget(order)));
    /* Rising chosen on purpose reads its list again */
    if (order === "rising") void client.invalidateQueries({ queryKey: ["collections", "rising"] });
    go(orderTarget(order));
  };
  const intent = (target: { order?: Order }) => {
    const order = target.order;
    if (!order || order === "saved" || order === place().order) return;
    void client.prefetchQuery(
      collectionsQuery({
        ...listKey(place()),
        sort: order,
        frame: order === "rising" ? place().frame : "1w",
        page: 1
      })
    );
  };

  const emptyNote = () =>
    place().query
      ? t("No results.")
      : mine()
        ? t("No collections yet.")
        : t("No public collections yet.");
  const message = () =>
    headError() ||
    moreError() ||
    fieldError() ||
    note() ||
    (navigating() && head() ? t("Updating…") : loadingMore() ? t("Loading more…") : "") ||
    (head() && !items().length ? emptyNote() : "");
  const nextHref = () => {
    const tail = last();
    return localHref(
      listPath(place().order, place().frame) +
        listSearch({
          query: place().query,
          view: place().view,
          page: (tail?.page ?? place().page) + 1,
          limit: place().limit
        })
    );
  };
  const placeholders = () => <For each={[0, 1]}>{() => <CollectionGroupPlaceholder />}</For>;

  return (
    <main id="main" class={styles.page}>
      <Find
        place={place()}
        to={searchHref}
        onError={setFieldError}
        onImage={file => void searchImage(file)}
      />
      <h1 class={styles.hidden}>
        {t(
          mine()
            ? msg("Your collections")
            : place().order === "rising"
              ? msg("Rising gradient and color palette collections")
              : msg("Gradient and color palette collections")
        )}
      </h1>
      <div class={styles.nav}>
        <ListNav
          section="collections"
          order={place().order}
          frame={place().frame}
          frames={FRAMES}
          onSection={section => go(sectionTarget(section))}
          onOrder={pickOrder}
          onIntent={intent}
          sectionHref={section => localHref(sectionTarget(section))}
          orderHref={order => (order === "saved" ? undefined : localHref(orderTarget(order)))}
        />
      </div>
      <Show when={held()}>
        {shown => (
          <div class={styles.picture}>
            <Sampler
              src={shown().src}
              width={shown().width}
              height={shown().height}
              label={t("Your image")}
              points={shown().points}
              onMove={(i, x, y) => void picture.move(i, x, y)}
              onRelease={() => void picture.settle().then(rest)}
              onReset={picture.moved(shown()) ? () => void picture.reset().then(rest) : undefined}
              onAdd={(x, y) => {
                void picture.add(x, y);
                void picture.settle().then(rest);
              }}
              onRemove={
                picture.canRemove(shown())
                  ? i => {
                      void picture.remove(i);
                      void picture.settle().then(rest);
                    }
                  : undefined
              }
            />
          </div>
        )}
      </Show>
      <Show
        when={!signedOut()}
        fallback={
          <div class={styles.empty}>
            <Text variant="h3">{t("Sign in to see your collections.")}</Text>
            <Button variant="primary" size="lg" href={localHref(loginHref("/collections/saved"))}>
              {t("Sign in")}
            </Button>
          </div>
        }
      >
        {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: the titles and cards
            are links, which the keyboard follows; this only keeps a plain press in the page */}
        <div onClick={e => followInPlace(e, go)}>
          <Loading fallback={placeholders()}>
            <Show when={head() || headError()} fallback={placeholders()}>
              <GroupFeed
                items={items()}
                key={c => c.slug}
                estimate={estimate}
                initial={INITIAL}
                live={LIVE}
                group={collection => (
                  <CollectionGroup
                    title={collection().title}
                    href={groupHref(collection().slug)}
                    description={collection().description}
                    owner={ownerLabel(collection().owner, isAdmin())}
                    age={relativeAge(collection().updatedAt, now())}
                    count={
                      collection().itemCount -
                      (collection().preview.length - kept(collection()).length)
                    }
                    private={collection().visibility === "private"}
                    palettes={kept(collection())}
                    card={preview => card(preview, collection)}
                    onIntent={() => void client.prefetchQuery(collectionQuery(collection().slug))}
                  />
                )}
              />
            </Show>
          </Loading>
        </div>
        <div ref={mark} aria-hidden="true" />
        <div class={styles.status}>
          <Status error={!!headError() || !!moreError() || !!fieldError()}>{message()}</Status>
          <Show when={headError()}>
            <Button size="sm" onClick={() => void (mine() ? ownList : publicList).refetch()}>
              {t("Retry")}
            </Button>
          </Show>
          <Show when={moreError() && !headError()}>
            <Button size="sm" onClick={() => void loadMore(true)}>
              {t("Retry")}
            </Button>
          </Show>
          <Show when={mine() && head() && !items().length}>
            <Button size="sm" href={localHref(`/palettes${listSearch({ query: place().query })}`)}>
              {t("Browse palettes")}
            </Button>
          </Show>
          <Show when={hasMore() && !loadingMore() && !moreError() && !headError()}>
            <Button
              size="sm"
              href={nextHref()}
              onClick={e => {
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                void loadMore();
              }}
            >
              {t("More collections")}
            </Button>
          </Show>
        </div>
      </Show>
      <BackToTop />
    </main>
  );
}
