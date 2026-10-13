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
import { useNavigate } from "@tanstack/solid-router";
import { createEffect, createMemo, createSignal, For, Loading, onSettled, Show } from "solid-js";
import { likeCount, liked, toggleLike } from "../account/likes.ts";
import { account, isAdmin } from "../account/session.ts";
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
import { createFit } from "./fit.ts";
import { type ListView, listSearch } from "./params.ts";
import { collectionsQuery, failed, type ListKey, ownQuery, tagsQuery } from "./queries.ts";
import type { CollectionPage, CollectionPreview, CollectionSummary, RisingFrame } from "./types.ts";

/* The collections lists: Popular (/collections), Rising in its frame (/collections/rising), and the account's own
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
/* the groups the server draws: about a phone's first screen and a desktop's */
const INITIAL = 3;
/* the next page is asked for this far before its mark comes into view */
const AHEAD = "0px 0px 1200px 0px";

export interface ListPlace {
  order: Order;
  frame: RisingFrame;
  query: string;
  page: number;
  limit: number;
  view: ListView;
}

const listPath = (order: Order, frame: RisingFrame) =>
  order === "saved"
    ? "/collections/saved"
    : order === "rising"
      ? frame === "1w"
        ? "/collections/rising"
        : `/collections/rising/${frame}`
      : "/collections";

export function CollectionsPage(props: { place: ListPlace }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const place = () => props.place;
  const mine = () => place().order === "saved";
  const key = (): ListKey => ({
    sort: place().order === "rising" ? "rising" : "popular",
    frame: place().frame,
    query: place().query,
    page: place().page,
    limit: place().limit
  });
  /* the account's own are read once the account is known; until then their feed stands as its placeholders */
  const publicList = useQuery(() => ({ ...collectionsQuery(key()), enabled: !mine() }));
  const ownList = useQuery(() => ({
    ...ownQuery(account()?.id ?? "", { ...key(), sort: "newest" }),
    enabled: mine() && !!account()
  }));
  const list = {
    get data() {
      return mine() ? ownList.data : publicList.data;
    },
    refetch: () => (mine() ? ownList : publicList).refetch()
  };
  const tags = useQuery(() => ({ ...tagsQuery(place().query), enabled: !mine() }));
  const head = (): CollectionPage | null => (list.data && !failed(list.data) ? list.data : null);
  const headError = () => (failed(list.data) ? list.data.failed : "");
  const [note, setNote] = createSignal("");

  /* the pages after the address's own, joined as the reader nears the end; a failed one waits for Retry */
  const [joined, setJoined] = createSignal<readonly CollectionPage[]>([]);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [moreError, setMoreError] = createSignal("");
  const last = () => joined().at(-1) ?? head();
  const hasMore = () => {
    const tail = last();
    return !!tail && tail.page < tail.totalPages;
  };
  const loadMore = async (retry = false) => {
    const tail = last();
    if (!tail || !hasMore() || loadingMore() || mine() || (moreError() && !retry)) return;
    setLoadingMore(true);
    setMoreError("");
    try {
      const next = await client.fetchQuery(collectionsQuery({ ...key(), page: tail.page + 1 }));
      if (failed(next)) setMoreError(next.failed);
      else setJoined(pages => [...pages, next]);
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
  /* every collection once, in the order the pages came */
  const items = createMemo(() => {
    const seen = new Set<string>();
    const out: CollectionSummary[] = [];
    for (const page of [head(), ...joined()])
      for (const item of page?.items ?? [])
        if (!seen.has(item.slug)) {
          seen.add(item.slug);
          out.push(item);
        }
    return out;
  });
  const now = () => minuteOf(head()?.fetchedAt ?? Date.now());

  /* a searched list's thumbs rate each palette's fit for its group's collection */
  const fit = createFit({
    slugs: () => (place().query ? items().map(c => c.slug) : []),
    say: setNote
  });
  /* an admin deletes, from under its card in one of Grabient's groups, a palette no person liked */
  const deletable = createDeletable();
  const [gone, setGone] = createSignal<ReadonlySet<string>>(new Set());
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
  const kept = (c: CollectionSummary) =>
    gone().size ? c.preview.filter(p => !gone().has(p.seed)) : c.preview;
  const removeEverywhere = async (seed: string, why: object) => {
    await deletePalette(seed, why);
    setGone(set => new Set([...set, seed]));
    setNote(t("Palette deleted."));
  };
  const checklists = createChecklists(setNote);
  /* a collection opened from Rising opens with its palettes rising first */
  const openOrder = (): PaletteOrder => (place().order === "rising" ? "rising" : "popular");
  const groupHref = (slug: string) => localHref(collectionHref(slug, openOrder()) + pageView());
  const pageView = () => listSearch({ view: place().view });

  const card = (preview: () => CollectionPreview, collection: () => CollectionSummary) => {
    const palette = createMemo(() => drawnAs(inputOf(preview()), place().view));
    const stops = createMemo(() => hexesOf(palette().seed, palette().steps));
    const seed = () => preview().seed;
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
        selected={selected(seed())}
        onSelect={() => toggle(seed())}
        collect={<CollectPress collect={checklists.card(() => inputOf(preview()))} />}
        fit={
          place().query ? (
            <Fit
              value={fit.of(collection().slug, seed())}
              admin={isAdmin() && collection().owner.kind === "agent"}
              collection={collection().title}
              onVote={next => fit.vote(collection().slug, seed(), next)}
            />
          ) : undefined
        }
        lead={
          <Show
            when={
              isAdmin() && collection().owner.kind === "agent" && deletable.of(seed()) !== undefined
            }
          >
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

  /* the words, the order and the frame of another list, keeping the view */
  const listHref = (order: Order, query = place().query) =>
    localHref(
      listPath(order, order === "rising" ? place().frame : "1w") +
        listSearch({ query, view: place().view })
    );
  const [typed, setTyped] = createSignal("");
  const search = (words: string) => {
    const query = words.trim();
    void navigate({
      href: listPath(place().order, place().frame) + listSearch({ query, view: place().view })
    });
  };
  const shownTags = () => {
    const hits = mine() ? [] : (tags.data ?? []);
    return hits.map(hit => ({
      label: hit.title,
      href: localHref(collectionHref(hit.slug, openOrder()) + pageView()),
      colors: hit.colors
    }));
  };
  const signedOut = () => mine() && account() === null;
  const emptyNote = () =>
    mine()
      ? place().query
        ? t("No results.")
        : t("No collections yet.")
      : place().query
        ? t("No results.")
        : t("No public collections yet.");
  const message = () =>
    headError() ||
    moreError() ||
    note() ||
    (loadingMore() ? t("Loading more…") : head() && !items().length ? emptyNote() : "");
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

  return (
    <main id="main" class={styles.page}>
      <div class={styles.find}>
        <form
          class={styles.search}
          onSubmit={e => {
            e.preventDefault();
            search(typed());
          }}
        >
          <input
            class={styles.searchField}
            type="search"
            name="q"
            value={place().query}
            maxlength={2048}
            placeholder={t("Search collections")}
            aria-label={t("Search collections")}
            autocomplete="off"
            enterkeyhint="search"
            dir="auto"
            onInput={e => setTyped(e.currentTarget.value)}
          />
        </form>
        <Show when={shownTags().length}>
          <nav class={styles.tags} aria-label={place().query ? t("Collections") : t("Popular")}>
            <For each={shownTags()} keyed={false}>
              {tag => (
                <a class={styles.tag} href={tag().href} dir="auto">
                  {tag().label}
                </a>
              )}
            </For>
          </nav>
        </Show>
      </div>
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
          onSection={section =>
            void navigate({
              href:
                section === "palettes"
                  ? `/palettes${listSearch({ query: place().query })}`
                  : listPath(place().order, place().frame)
            })
          }
          onOrder={order =>
            void navigate({
              href:
                order === "saved" && account() === null
                  ? `/login?redirect=${encodeURIComponent(listPath("saved", "1w"))}`
                  : listPath(order, place().frame) +
                    listSearch({ query: place().query, view: place().view })
            })
          }
          sectionHref={section =>
            section === "palettes"
              ? localHref(`/palettes${listSearch({ query: place().query })}`)
              : listHref(place().order)
          }
          orderHref={order => (order === "saved" ? undefined : listHref(order))}
        />
      </div>
      <Show
        when={!signedOut()}
        fallback={
          <div class={styles.empty}>
            <Text variant="h3">{t("Sign in to see your collections.")}</Text>
            <Button
              variant="primary"
              size="lg"
              href={localHref(`/login?redirect=${encodeURIComponent(listPath("saved", "1w"))}`)}
            >
              {t("Sign in")}
            </Button>
          </div>
        }
      >
        <Loading fallback={<For each={[0, 1]}>{() => <CollectionGroupPlaceholder />}</For>}>
          <GroupFeed
            items={items()}
            key={c => c.slug}
            estimate={estimate}
            initial={INITIAL}
            group={collection => (
              <CollectionGroup
                title={collection().title}
                href={groupHref(collection().slug)}
                description={collection().description}
                owner={ownerLabel(collection().owner, isAdmin())}
                age={relativeAge(collection().updatedAt, now())}
                count={
                  collection().itemCount - (collection().preview.length - kept(collection()).length)
                }
                private={collection().visibility === "private"}
                palettes={kept(collection())}
                card={preview => card(preview, collection)}
              />
            )}
          />
        </Loading>
        <div ref={mark} aria-hidden="true" />
        <div class={styles.status}>
          <Status error={!!headError() || !!moreError()}>{message()}</Status>
          <Show when={headError()}>
            <Button size="sm" onClick={() => void list.refetch()}>
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
          <Show when={hasMore() && !loadingMore() && !moreError() && !headError() && !mine()}>
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
