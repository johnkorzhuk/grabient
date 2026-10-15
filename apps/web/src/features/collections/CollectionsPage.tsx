import { localHref, t } from "@grabient/i18n";
import { BackToTop } from "@grabient/ui/BackToTop.tsx";
import { Button } from "@grabient/ui/Button.tsx";
import {
  CollectionGroup,
  CollectionGroupPlaceholder,
  shownAt
} from "@grabient/ui/CollectionGroup.tsx";
import { Curation } from "@grabient/ui/Curation.tsx";
import { Fit } from "@grabient/ui/Fit.tsx";
import { GroupFeed } from "@grabient/ui/GroupFeed.tsx";
import { ListNav } from "@grabient/ui/ListNav.tsx";
import { columnsAt, PaletteGrid } from "@grabient/ui/PaletteGrid.tsx";
import { SaveToCollection } from "@grabient/ui/SaveToCollection.tsx";
import { Status } from "@grabient/ui/Status.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { useElementScrollRestoration, useNavigate, useRouterState } from "@tanstack/solid-router";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Loading,
  onSettled,
  Show,
  untrack,
  useContext
} from "solid-js";
import {
  createOfflineList,
  listUnavailable,
  offline,
  signInUnavailable
} from "../../app/connection.ts";
import { AppPage } from "../../app/Frames.tsx";
import list from "../../app/list.module.css";
import { OfflineList } from "../../app/OfflineList.tsx";
import { ShellContext } from "../../app/shell.ts";
import { DEFAULT_FRAME, framePath, nextFrame, type Order } from "../../lib/orders.ts";
import { heading } from "../../lib/page-meta.ts";
import { hexesOf } from "../../lib/palette.ts";
import { type Failed, failed } from "../../lib/query.ts";
import { account, isAdmin, loginHref, sessionReady } from "../account/session.ts";
import { trackEvent } from "../analytics/analytics.ts";
import { minuteOf, relativeAge } from "../gallery/drawing.ts";
import { createFeed, inPlace, joinNext } from "../gallery/feed.ts";
import { ListHeading } from "../gallery/ListHeading.tsx";
import { framesQuery } from "../gallery/queries.ts";
import { searchAnswered, searchedHere } from "../search/count.ts";
import { PictureSampler } from "../search/PictureSampler.tsx";
import { createPicture } from "../search/picture.ts";
import { createSelectionScreen } from "../selection/SelectionScreen.tsx";
import { selection } from "../selection/selection.ts";
import { collectionHref, type PaletteOrder } from "./address.ts";
import { deletePalette, inputOf } from "./client.ts";
import { createChecklists } from "./collect.ts";
import styles from "./collections.module.css";
import { createDeletable } from "./deletable.ts";
import { ownerLabel } from "./drawing.ts";
import { Find } from "./Find.tsx";
import { createFit } from "./fit.ts";
import { ItemCard } from "./ItemCard.tsx";
import { rememberList } from "./navigation.ts";
import { collectionGone, forgetPalette, paletteGone } from "./overlay.ts";
import { type ListPlace, listKey, listPath, listSearch, viewWith } from "./params.ts";
import { collectionQuery, collectionsQuery, ownQuery } from "./queries.ts";
import { listMeta, listPaint } from "./route.ts";
import type { CollectionPage, CollectionPreview, CollectionSummary } from "./types.ts";

/* The collections lists: Popular (/collections), Rising in its frame (/collections/rising) and the account's own
   (/collections/saved), each searched with `?q=`. A list is a feed: its address's own page, then each page after it
   joining as the reader nears the end, at the same address, with only the groups near the viewport drawn. Each
   collection is a group of its first palettes; a searched list's cards carry thumbs that rate a palette's fit for its
   group's collection, never for the words. The selection's export screen takes the feed's place while it is open,
   and the feed stays mounted beneath it. */

/* a group's height before it is measured: its line, and its rows of cards with the gaps between them */
const HEAD = 72;
const CARD = 344;
const ROW_GAP = 40;
const estimate = (item: CollectionSummary, width: number) => {
  const columns = columnsAt(width);
  const rows = Math.max(1, Math.ceil(shownAt(columns, item.preview.length) / columns));
  return HEAD + rows * CARD + (rows - 1) * ROW_GAP;
};
/* the groups the server draws, a first screen and more, standing still until the reader moves (as the home's do): a
   group's cards are most of a page's start, and a phone shows three of each group's twelve. An account's hearts, an
   admin's presses and a selection's checks are the reader's own, so once either is known the groups are live without
   waiting. */
const INITIAL = 3;
/* an own list not read yet: no page, and none to join */
const UNREAD: Failed = { failed: "" };

/** Why a palette stays where a person liked it: no curation takes it out. */
const likedBlock = (deletable?: boolean) => (deletable ? undefined : t("Liked by someone"));

export function CollectionsPage(props: {
  place: ListPlace;
  /** the server saw no session with the request: Saved draws the way in from its first paint */
  signedOut?: boolean;
}) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const shell = useContext(ShellContext)!;
  const go = (href: string) => void navigate({ href });
  const restoring = useElementScrollRestoration({ getElement: () => window })?.scrollY;
  const navigating = useRouterState({ select: state => state.status === "pending" });
  const place = () => props.place;
  const mine = () => place().order === "saved";
  const signedOut = () => mine() && (sessionReady() ? !account() : !!props.signedOut);
  const frames = useQuery(() => framesQuery());
  const offered = () => frames.data;

  /* A public list reads through its query, which the route's loader filled. The account's own are private and read
     once the account is known: fetched through the same cache into the page's own state, so no read waits on a
     query that was off, which has no value to wait for. */
  const publicList = useQuery(() => ({ ...collectionsQuery(listKey(place())), enabled: !mine() }));
  const ownKey = () => {
    const who = account()?.id;
    return mine() && who ? { who, key: { ...listKey(place()), sort: "newest" as const } } : null;
  };
  const [own, setOwn] = createSignal<{ id: string; page: CollectionPage | Failed } | null>(null);
  const readOwn = (asked: NonNullable<ReturnType<typeof ownKey>>, fresh = false) => {
    const id = JSON.stringify(asked);
    const query = ownQuery(asked.who, asked.key);
    const read = fresh ? client.fetchQuery({ ...query, staleTime: 0 }) : client.fetchQuery(query);
    return read.then(
      page => setOwn({ id, page }),
      () => {}
    );
  };
  createEffect(ownKey, asked => {
    if (asked) void untrack(() => readOwn(asked));
  });
  const headData = () => {
    if (!mine()) return publicList.data;
    const asked = ownKey();
    const read = own();
    return asked && read?.id === JSON.stringify(asked) ? read.page : undefined;
  };
  const retry = () => {
    const asked = ownKey();
    if (!mine()) void publicList.refetch();
    else if (asked) void readOwn(asked, true);
  };
  /* the page as it stands: a read that failed keeps the groups it showed beside the reason */
  const head = (): CollectionPage | null => {
    const data = headData();
    return data && "items" in data ? data : null;
  };
  const failure = () => {
    const data = headData();
    return failed(data) ? data.failed : "";
  };
  /* a public list that could not be read with no connection says so in its place, and is read as the connection
     returns; the account's own are its copy's to answer */
  const unread = createOfflineList({
    failed: () => !mine() && !!failure(),
    readAt: () => publicList.dataUpdatedAt,
    read: retry
  });
  const headError = () => (unread() ? "" : failure());
  const [note, setNote] = createSignal("");
  const [fieldError, setFieldError] = createSignal("");

  /* the pages after the address's own join as the reader nears the end, and a list returned to stands as deep as it
     was left, from the cache */
  const pageKey = (n: number) => ({ ...listKey(place()), page: n });
  const keptPage = (n: number) => {
    const page = mine()
      ? client.getQueryData(
          ownQuery(account()?.id ?? "", { ...pageKey(n), sort: "newest" }).queryKey
        )
      : client.getQueryData(collectionsQuery(pageKey(n)).queryKey);
    return page && !failed(page) ? page : undefined;
  };
  const feed = createFeed<CollectionPage>({
    key: () => JSON.stringify([mine() ? account()?.id : "", listKey(place())]),
    start: () => place().page,
    head: () => headData() ?? UNREAD,
    kept: keptPage,
    read: n => {
      trackEvent("paginate", { page_number: n, surface: "collections" });
      return mine()
        ? client.fetchQuery(ownQuery(account()?.id ?? "", { ...pageKey(n), sort: "newest" }))
        : client.fetchQuery(collectionsQuery(pageKey(n)));
    }
  });
  /* every collection once, in the order the pages came, less what this tab deleted */
  const items = createMemo(() => {
    const seen = new Set<string>();
    const out: CollectionSummary[] = [];
    for (const page of [head(), ...feed.joined()])
      for (const item of page?.items ?? [])
        if (!seen.has(item.slug) && !collectionGone(item.slug)) {
          seen.add(item.slug);
          out.push(item);
        }
    return out;
  });
  const readAt = () => head()?.fetchedAt ?? Date.now();
  const now = () => minuteOf(readAt());
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

  /* the selection: its press at the row's end, its export screen in the feed's place, and its Save into the account's
     collections, after which Saved reads its list again */
  const checklists = createChecklists(setNote);
  const saving = checklists.selection(() => selection().map(inputOf));
  const saved = () => {
    const asked = ownKey();
    if (asked) void readOwn(asked, true);
  };
  const sel = createSelectionScreen({
    note: setNote,
    save: () => (
      <SaveToCollection
        own={saving.own}
        onOwn={saving.onOwn}
        onChanged={saving.onChanged}
        onToggle={(slug, on) => saving.onToggle(slug, on).then(saved)}
        onNew={title => saving.onNew(title).then(saved)}
        signIn={saving.signIn}
        disabled={signInUnavailable()}
      />
    )
  });
  /* after the selection's own, so this one stands: the selection while its screen is shown, else the page's palettes */
  shell.paint(() => (sel.open() ? selection() : listPaint(items(), place().view)));
  /* the list a collection opened from here leads back to */
  createEffect(place, rememberList);

  /* where the page stands, for counting what a reader opens and takes */
  const usePlace = () => ({
    surface: mine() ? ("saved" as const) : ("collections" as const),
    ...(mine() || !place().query
      ? {}
      : { words: place().query, searched: searchedHere(place().query, "collections") })
  });
  /* a collection opened from Rising opens with its palettes rising first */
  const openOrder = (): PaletteOrder => (place().order === "rising" ? "rising" : "popular");
  const pageView = () => listSearch({ view: place().view });
  const groupHref = (slug: string) =>
    localHref(collectionHref(slug, mine() ? "popular" : openOrder()) + pageView());

  const card = (preview: () => CollectionPreview, collection: () => CollectionSummary) => {
    const seed = () => preview().seed;
    const agents = () => isAdmin() && collection().owner.kind === "agent";
    return (
      <ItemCard
        own={inputOf(preview())}
        view={place().view}
        age={relativeAge(preview().createdAt ?? collection().updatedAt, now())}
        likes={preview().likes ?? 0}
        readAt={readAt()}
        collection={collection().slug}
        place={usePlace}
        at={() => ({
          collection: collection().slug,
          position: kept(collection()).findIndex(entry => entry.seed === seed())
        })}
        collect={checklists.card}
        note={setNote}
        fit={
          place().query ? (
            <Fit
              value={fit.of(collection().slug, seed())}
              admin={agents()}
              collection={collection().title}
              disabled={offline()}
              onVote={next => fit.vote(collection().slug, seed(), next)}
            />
          ) : undefined
        }
        lead={
          <Show when={agents() && deletable.of(seed()) !== undefined}>
            <Curation
              mode="delete"
              icon="trash"
              blocked={likedBlock(deletable.of(seed()))}
              stops={hexesOf(preview())}
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
  /* the picture's points search again in place: the reader stays at the depth they were editing at */
  const searchColors = (colors: string | null) => {
    if (colors && colors !== place().query)
      void navigate({ href: searchHref(colors), replace: true, resetScroll: false });
  };
  /* what a search of the public collections found, told once its answer is this page's */
  createEffect(
    () => {
      const first = head();
      const words = place().query;
      return !mine() && words && first && first.query === words
        ? { words, kind: held() ? ("image" as const) : undefined, results: first.total }
        : null;
    },
    found => {
      if (found) searchAnswered(found.words, "collections", found);
    }
  );

  /* where each list lives, keeping the words and the view; a press on Rising while it is the order moves its frame */
  const here = () => listSearch({ query: place().query, view: place().view });
  const orderTarget = (order: Order) =>
    listPath(
      order,
      order === "rising" && place().order === "rising"
        ? nextFrame(place().frame, offered())
        : place().frame
    ) + here();
  /* the other section in this list's order; with no connection the account's own, which open from its copy */
  const sectionTarget = (section: "palettes" | "collections") => {
    const order = offline() ? "saved" : place().order;
    if (section === "collections") return listPath(order, place().frame) + here();
    const path =
      order === "saved"
        ? "/palettes/saved"
        : order === "rising"
          ? framePath("/palettes/rising", place().frame)
          : "/palettes";
    return path + here();
  };
  const pickOrder = (order: Order) => {
    /* in the page's own place in the history, so Back leaves Rising in one press */
    if (order === "rising" && place().order === "rising") {
      if ((offered()?.length ?? 1) > 1) void navigate({ href: orderTarget(order), replace: true });
      return;
    }
    if (order === "saved" && sessionReady() && !account()) return go(loginHref(orderTarget(order)));
    /* Rising chosen on purpose reads its list again */
    if (order === "rising") void client.invalidateQueries({ queryKey: ["collections", "rising"] });
    go(orderTarget(order));
  };
  const intent = (target: { order?: Order }) => {
    const order = target.order;
    if (!order || order === "saved" || order === place().order || offline()) return;
    void client.prefetchQuery(
      collectionsQuery({
        ...listKey(place()),
        sort: order,
        frame: order === "rising" ? place().frame : DEFAULT_FRAME,
        page: 1
      })
    );
  };

  /* an old link to a page past the list's end: said so, with the way to its first page, as the palettes list does */
  const pastEnd = () => {
    const read = head();
    return !!read && !read.items.length && place().page > Math.max(1, read.totalPages);
  };
  const emptyNote = () =>
    pastEnd()
      ? t("Page {page} doesn't exist.", { page: String(place().page) })
      : place().query
        ? t("No results.")
        : mine()
          ? t("No collections yet.")
          : t("No public collections yet.");
  const message = () =>
    headError() ||
    feed.reason() ||
    fieldError() ||
    note() ||
    (navigating() && head() ? t("Updating…") : feed.loading() ? t("Loading more…") : "") ||
    (head() && !items().length ? emptyNote() : "");
  const nextHref = () => {
    const tail = feed.joined().at(-1) ?? head();
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
    <AppPage feed bare={sel.open()}>
      {/* the page stays mounted and out of sight while the export screen takes its place, so Close returns to the
          same groups at the same depth */}
      <main
        id="main"
        class={list.column}
        hidden={sel.open()}
        aria-busy={navigating() ? "true" : "false"}
      >
        <Find
          place={place()}
          to={searchHref}
          onError={setFieldError}
          onImage={file => void searchImage(file)}
        />
        <h1 class={styles.hidden}>{heading(listMeta(place()))}</h1>
        <div class={list.row}>
          <ListNav
            section="collections"
            order={place().order}
            frame={(offered()?.length ?? 1) > 1 ? place().frame : undefined}
            frames={offered()}
            disabled={listUnavailable}
            onSection={section => go(sectionTarget(section))}
            onOrder={pickOrder}
            onIntent={intent}
            sectionHref={section => localHref(sectionTarget(section))}
            orderHref={order => (order === "saved" ? undefined : localHref(orderTarget(order)))}
          />
          {sel.button()}
        </div>
        {sel.float()}
        <div class={styles.under}>
          <Show when={held()}>
            {shown => (
              <section class={styles.picture} aria-label={t("Your image")}>
                <ListHeading title={t("Your image")} />
                <PaletteGrid>
                  <PictureSampler picture={picture} shown={shown()} search={searchColors} />
                </PaletteGrid>
              </section>
            )}
          </Show>
          <Show
            when={!signedOut()}
            fallback={
              <div class={styles.empty}>
                <Text variant="h3" as="h2">
                  {t("Sign in to see your collections.")}
                </Text>
                <Button
                  variant="primary"
                  size="lg"
                  href={localHref(loginHref(listPath("saved") + here()))}
                  disabled={offline()}
                >
                  {t("Sign in")}
                </Button>
              </div>
            }
          >
            <Loading fallback={placeholders()}>
              <Show
                when={head() || headError()}
                fallback={unread() ? <OfflineList ways={["collections"]} /> : placeholders()}
              >
                <GroupFeed
                  items={items()}
                  key={c => c.slug}
                  estimate={estimate}
                  initial={INITIAL}
                  live={account() || selection().length ? INITIAL : 0}
                  depth={restoring}
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
                      onIntent={() => {
                        if (!offline())
                          void client.prefetchQuery(collectionQuery(collection().slug));
                      }}
                    />
                  )}
                />
              </Show>
              <div class={styles.mark} ref={feed.mark} aria-hidden="true" />
              <div class={styles.status}>
                <Status error={!!headError() || !!feed.reason() || !!fieldError()}>
                  {message()}
                </Status>
                <Show when={headError()}>
                  <Button size="sm" onClick={retry}>
                    {t("Retry")}
                  </Button>
                </Show>
                <Show when={feed.reason() && !headError()}>
                  <Button size="sm" onClick={() => void feed.next(true)}>
                    {t("Retry")}
                  </Button>
                </Show>
                <Show when={pastEnd()}>
                  <Button
                    size="sm"
                    href={localHref(
                      listPath(place().order, place().frame) +
                        listSearch({
                          query: place().query,
                          view: place().view,
                          limit: place().limit
                        })
                    )}
                  >
                    {t("First page")}
                  </Button>
                </Show>
                {/* the gallery's palettes for the same words, in the same view */}
                <Show when={mine() && head() && !items().length}>
                  <Button size="sm" href={localHref(`/palettes${here()}`)} disabled={offline()}>
                    {t("Browse palettes")}
                  </Button>
                </Show>
                {/* a link for readers without scripts; a plain press asks for the page in place */}
                <Show when={feed.more() && !feed.loading() && !feed.reason() && !headError()}>
                  <Button
                    size="sm"
                    href={nextHref()}
                    onClick={e =>
                      inPlace(e, () => void joinNext(() => feed.next(), "main section[aria-label]"))
                    }
                  >
                    {t("More collections")}
                  </Button>
                </Show>
              </div>
            </Loading>
          </Show>
        </div>
      </main>
      {sel.screen()}
      {/* the way back up a feed that has no end; on a phone it stands above the Selection press */}
      <BackToTop raised={selection().length > 0 && !sel.open()} />
    </AppPage>
  );
}
