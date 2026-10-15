import { localHref, t } from "@grabient/i18n";
import { queryColors } from "@grabient/search/colors.ts";
import { BackToTop } from "@grabient/ui/BackToTop.tsx";
import { Button } from "@grabient/ui/Button.tsx";
import { CollectionGroup, shownAt } from "@grabient/ui/CollectionGroup.tsx";
import { Fit } from "@grabient/ui/Fit.tsx";
import { GroupFeed } from "@grabient/ui/GroupFeed.tsx";
import hidden from "@grabient/ui/hidden.module.css";
import { ListNav } from "@grabient/ui/ListNav.tsx";
import { PaletteFeed } from "@grabient/ui/PaletteFeed.tsx";
import { columnsAt } from "@grabient/ui/PaletteGrid.tsx";
import { PaletteGridPlaceholder } from "@grabient/ui/PalettePlaceholder.tsx";
import { Status } from "@grabient/ui/Status.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import {
  useElementScrollRestoration,
  useNavigate,
  useRouter,
  useRouterState
} from "@tanstack/solid-router";
import {
  createEffect,
  createMemo,
  deep,
  For,
  isHydrating,
  isPending,
  Loading,
  NoHydration,
  onSettled,
  Show,
  useContext
} from "solid-js";
import {
  createOfflineList,
  listUnavailable,
  offline,
  signInUnavailable
} from "../../app/connection.ts";
import { AppPage } from "../../app/Frames.tsx";
import { OfflineList } from "../../app/OfflineList.tsx";
import { heading } from "../../lib/page-meta.ts";
import { account, isAdmin, sessionReady } from "../account/session.ts";
import { trackEvent, trackSignInPrompt } from "../analytics/analytics.ts";
import { ownerLabel } from "../collections/drawing.ts";
import { createFit } from "../collections/fit.ts";
import { collectionGone, paletteGone } from "../collections/overlay.ts";
import type { CollectionPage, CollectionSummary } from "../collections/types.ts";
import { AppearanceContext, inView } from "../list/appearance.ts";
import { searchAnswered } from "../search/count.ts";
import { createSearchFit } from "../search/fit.ts";
import { createPicture } from "../search/picture.ts";
import { selection } from "../selection/selection.ts";
import { createAccountSearch } from "./account.ts";
import { type ListParams, listHref, listSearch, withView } from "./address.ts";
import { createCuration } from "./curate.tsx";
import { homePaint, madeItems, minuteOf, relativeAge } from "./drawing.ts";
import { Find } from "./Find.tsx";
import { createFeed, FIRST_SCREEN, inPlace, joinNext, preloadHref } from "./feed.ts";
import { GalleryCard } from "./GalleryCard.tsx";
import styles from "./gallery.module.css";
import { ListHeading } from "./ListHeading.tsx";
import { Made } from "./Made.tsx";
import { readerOrder, recallOrder } from "./order.ts";
import { createGalleryPage, GalleryContext } from "./page.tsx";
import { type Failed, failed, homeCollectionsQuery, homeHeadQuery } from "./queries.ts";
import { HOT_PALETTES, SEARCH_PALETTES } from "./schema.ts";
import { sortSearch } from "./sort.ts";
import { metaPage, searchedName, searchedTitle } from "./titles.ts";

/* The home: the hottest palettes under Trending, then the hot collections as their groups, more joining as the reader
   nears the end. Searched (`/?q=words`) it keeps the shape: the palette list's search, the most liked first, then the
   collections list's. The server draws the head and the first groups; the rest stand as their height until the page
   settles, and only the groups near the viewport are drawn after (GroupFeed). */

const TOOL = {
  name: "search_grabient",
  description:
    "Search Grabient for color palettes, CSS gradients and collections of them by color, mood, theme, hex code or palette link. Opens the palettes that answer the words, then the collections that do, on this page. A palette link or seed finds the palettes and collections like that palette.",
  words: "Words such as sunset or pastel blue, a hex code, or a Grabient palette link or seed."
};

/** The groups the server draws after the head: what a first screen shows of them. They stand still until the reader
    moves; an account's hearts and a selection's checks are the reader's own, so once either is known they are live
    without waiting. */
const FIRST_GROUPS = 2;
/* a group before it is measured: its title line and the gap under it, then two rows of cards (three on a phone) */
const GROUP_HEAD = 40 + 32;
const CARD = 300 + 12 + 32;
const ROW_GAP = 40;

const estimate = (collection: CollectionSummary, width: number) => {
  const columns = columnsAt(width);
  const rows = Math.max(1, Math.ceil(shownAt(columns, collection.preview.length) / columns));
  return GROUP_HEAD + rows * CARD + (rows - 1) * ROW_GAP;
};

export function Home(props: { params: ListParams }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();
  const restoring = useElementScrollRestoration({ getElement: () => window })?.scrollY;
  const navigating = useRouterState({ select: state => state.status === "pending" });
  const params = () => props.params;
  const words = () => params().words;
  const head = useQuery(() => homeHeadQuery(words()));
  /* What stood last, the head and the first collections: a read that fails leaves it on screen beside its reason. A
     query's store takes each answer in the place of the one before, a failure too, so what stands is a copy. */
  const standingHead = createMemo((last?: Exclude<typeof head.data, Failed>) =>
    failed(head.data) ? last : deep(head.data)
  );
  const first = useQuery(() => homeCollectionsQuery(words(), params().page));
  const standingFirst = createMemo((last?: CollectionPage) =>
    failed(first.data) ? last : deep(first.data)
  );
  const feed = createFeed<CollectionPage>({
    key: () => `home\n${words()}`,
    start: () => params().page,
    head: () => first.data,
    kept: n => {
      const read = client.getQueryData(homeCollectionsQuery(words(), n).queryKey);
      return read && !failed(read) ? read : undefined;
    },
    read: n => {
      trackEvent("paginate", { page_number: n, surface: "home" });
      return client.fetchQuery(homeCollectionsQuery(words(), n));
    }
  });
  /* The page after the last is read ahead, so it joins from memory: at once on a home reached inside the app, and
     after each page that joins. A document's own first page asks for nothing the reader has not neared. */
  const reached = !isHydrating();
  createEffect(
    () => {
      const last = (feed.joined().at(-1) ?? standingFirst())?.page;
      return feed.more() && last !== undefined && (reached || feed.joined().length)
        ? homeCollectionsQuery(words(), last + 1)
        : null;
    },
    ahead => {
      if (ahead) void client.prefetchQuery(ahead);
    }
  );
  /* every collection on the feed once, in the order the pages came, less what this tab deleted; each with when its
     page was read */
  const loaded = createMemo(() => {
    const readAt = new Map<string, number>();
    const groups: CollectionSummary[] = [];
    for (const read of [standingFirst(), ...feed.joined()]) {
      for (const item of read?.items ?? []) {
        if (readAt.has(item.slug) || collectionGone(item.slug)) continue;
        readAt.set(item.slug, read!.fetchedAt);
        groups.push(item);
      }
    }
    return { groups, readAt };
  });
  const groups = () => loaded().groups;
  /* a group's palettes without the ones an admin deleted here */
  const kept = (collection: CollectionSummary) =>
    collection.preview.filter(preview => !paletteGone(preview.seed));

  const page = createGalleryPage({
    path: () => "/",
    params,
    surface: () => "home",
    counted: "home",
    painted: () => homePaint(palettes(), groups(), params())
  });
  const look = useContext(AppearanceContext)!;
  onSettled(recallOrder);

  /* Words the public search could not read for everyone, or read in part, are the account's own search to answer, once
     the account is known: its best palettes take the head's place. */
  const found = createAccountSearch({
    words,
    wanted: () => {
      const read = standingHead();
      return !!words() && !!read && (read.tier === "account" || !!read.partial);
    }
  });
  const palettes = createMemo(() => {
    const own = found.items();
    return (
      own ? sortSearch(own, "popular").slice(0, SEARCH_PALETTES) : (standingHead()?.palettes ?? [])
    ).filter(item => !paletteGone(item.kseed));
  });
  /* signed out, and the words need the account's search: the way in where the palettes would stand */
  const unsigned = () => !!words() && sessionReady() && account() === null;
  const signInToSearch = () => unsigned() && standingHead()?.tier === "account";
  const signInForMore = () =>
    unsigned() && !!standingHead()?.partial && standingHead()?.tier !== "account";

  /* every palette the search answers carries thumbs named for its words; one in a collection's group is part of that
     collection, whatever the words found it, and carries its thumbs instead */
  const fits = createSearchFit({
    query: words,
    account: () => (sessionReady() ? (account()?.id ?? null) : undefined),
    signIn: () => {
      trackSignInPrompt("vote");
      void navigate({ href: page.signIn() });
    },
    fail: page.say,
    offline,
    named: asked => searchedName(asked) ?? asked
  });
  const groupFits = createFit({
    slugs: () => (words() ? groups().map(group => group.slug) : []),
    say: page.say
  });
  /* an admin deletes a palette no person liked from under its card: the gallery's own, or one in an agent's collection */
  const curation = createCuration({
    seeds: () => [
      ...palettes().map(item => item.kseed),
      ...groups()
        .filter(group => group.owner.kind === "agent")
        .flatMap(group => group.preview.map(preview => preview.seed))
    ],
    say: page.say
  });

  /* a picture is searched by its colors on the palette list, where it stands beside its palettes; its colors are
     nobody's words, so they are not counted */
  const picture = createPicture();
  const searchImage = async (file: File) => {
    const colors = await picture.take(file);
    if (!colors) return page.refuse(t("Couldn't read this image."));
    void navigate({ href: toSection("palettes", colors) });
  };
  /* words that hold hex colors lead with the palettes those colors make */
  const made = createMemo(() => madeItems(queryColors(words())));
  /* what a search found, told once its answer is this page's */
  createEffect(
    () => {
      const read = standingHead();
      const collections = standingFirst();
      return words() && read && collections && !navigating()
        ? {
            words: words(),
            kind:
              read.tier === "similar"
                ? ("palette" as const)
                : read.tier === "color"
                  ? ("colors" as const)
                  : undefined,
            tier: read.tier,
            results: read.palettes.length,
            collections: collections.total
          }
        : null;
    },
    told => {
      if (told) searchAnswered(told.words, "home", told);
    }
  );

  /* the ages the server printed are told against the minute the head was read in, and hydration agrees */
  const now = () => minuteOf(standingHead()?.fetchedAt ?? 0);
  /* when the head's counts were read: the account's own answer is as fresh as it is */
  const headReadAt = () => (found.items() ? undefined : standingHead()?.fetchedAt);
  const searched = createMemo(() =>
    searchedTitle(words(), made(), params(), look.draft(), look.peek())
  );
  /* reads that failed with no connection are said in the head's place, and made again as the connection returns */
  const headUnread = createOfflineList({
    failed: () => failed(head.data),
    readAt: () => head.dataUpdatedAt,
    read: () => void head.refetch()
  });
  const firstUnread = createOfflineList({
    failed: () => failed(first.data),
    readAt: () => first.dataUpdatedAt,
    read: () => void first.refetch()
  });
  const headError = () => (!headUnread() && failed(head.data) ? head.data.failed : "");
  const firstError = () => (!firstUnread() && failed(first.data) ? first.data.failed : "");
  /* A head standing while it is read again, for other words or in place once it is old. Until the read lands, the
     query holds its data and every line that reads it, so this is said first, from the read on its way alone. */
  const updating = () => navigating() || isPending(() => head.data);
  /* a signed-out search whose words need an account: the block over the grid says No results, and the line says it
     unseen, where a screen reader hears what a search found */
  const said = () => (signInToSearch() ? <span class={hidden.text}>{t("No results.")}</span> : "");
  const message = () =>
    (updating() ? (words() ? t("Searching…") : t("Updating…")) : "") ||
    headError() ||
    firstError() ||
    feed.reason() ||
    page.line()?.message ||
    (feed.loading() ? t("Loading more…") : "") ||
    found.note() ||
    (signInForMore() && !feed.more() ? t("Sign in to search with all your words.") : "") ||
    (!standingHead() || groups().length
      ? ""
      : pastEnd()
        ? t("Page {page} doesn't exist.", { page: String(params().page) })
        : !words()
          ? t("No collections yet.")
          : !palettes().length && !signInToSearch()
            ? t("No results.")
            : "");
  const searchHref = (to: string, linked?: URLSearchParams) =>
    `/${listSearch(withView({ ...params(), words: to, page: 1, selection: false }, linked))}`;
  /* a section opens its list in the order the reader chose last, searched for the home's words; with no connection,
     the account's own */
  const toSection = (section: "palettes" | "collections", asked = words()) =>
    listHref(section, offline() ? "saved" : readerOrder().order, readerOrder().frame, {
      ...params(),
      words: asked
    });
  /* an old link to a page past the feed's end: said so, with the way to its first page */
  const pastEnd = () => {
    const read = standingFirst();
    return !!read && !read.items.length && params().page > Math.max(1, read.totalPages);
  };
  const nextHref = () => {
    const last = feed.joined().at(-1) ?? standingFirst();
    return localHref(
      `/${listSearch(params(), { page: (last?.page ?? params().page) + 1, selection: false })}`
    );
  };
  const signIn = (size: "sm" | "lg") => (
    <Button
      variant={size === "lg" ? "primary" : undefined}
      size={size}
      href={page.signIn()}
      disabled={signInUnavailable()}
      onClick={() => trackSignInPrompt("search")}
    >
      {t("Sign in")}
    </Button>
  );

  return (
    <GalleryContext value={page}>
      <AppPage feed floats bare={page.chosen.open()}>
        {/* the page stays mounted and out of sight under the export screen, so Close returns to the same depth */}
        <main id="main" class={styles.page} hidden={page.chosen.open()}>
          <Find
            surface="home"
            placeholder={t("Search palettes and collections")}
            tool={TOOL}
            to={searchHref}
            counts
            disabled={offline()}
            onImage={file => void searchImage(file)}
          />
          <h1 class={styles.hidden}>{heading(metaPage({ kind: "home", params: params() }))}</h1>
          {/* the two sections, neither chosen: the home is neither list */}
          <div class={styles.row}>
            <ListNav
              section={null}
              order={null}
              disabled={listUnavailable}
              onSection={section => void navigate({ href: toSection(section) })}
              onIntent={target => {
                if (target.section) preloadHref(router, toSection(target.section));
              }}
              sectionHref={section => localHref(toSection(section))}
            />
            {page.chosen.button()}
          </div>
          {page.chosen.float()}
          <div class={styles.stack}>
            <Show when={made().length}>
              <Made title={t("From your colors")} items={made()} />
            </Show>
            <div>
              <ListHeading title={t("Trending")} words={words()} palette={searched()} />
              <Show when={signInToSearch()}>
                <div class={styles.empty}>
                  <Text variant="h3">{t("No results.")}</Text>
                  <Text variant="body">
                    {t(
                      "Try a color, mood or theme, like navy, cozy or sunset. Or sign in to search in any language."
                    )}
                  </Text>
                  {signIn("lg")}
                </div>
              </Show>
              <Loading
                fallback={
                  <PaletteGridPlaceholder count={words() ? SEARCH_PALETTES : HOT_PALETTES} />
                }
              >
                <Show
                  when={palettes().length}
                  fallback={headUnread() && <OfflineList ways={["palettes", "collections"]} />}
                >
                  <PaletteFeed
                    items={palettes()}
                    key={item => item.kseed}
                    live={FIRST_SCREEN}
                    still={!account() && !selection().length}
                    depth={restoring}
                    card={item => (
                      <GalleryCard
                        item={item()}
                        now={now()}
                        readAt={headReadAt()}
                        at={() => ({
                          position: palettes().findIndex(entry => entry.kseed === item().kseed)
                        })}
                        fit={
                          <Show when={fits.fitOf(item().kseed)}>
                            <Fit
                              value={fits.fitOf(item().kseed)?.value}
                              query={fits.fitOf(item().kseed)?.query}
                              onVote={next => fits.fitOf(item().kseed)?.onVote(next)}
                              disabled={offline()}
                            />
                          </Show>
                        }
                        lead={curation.presses(item, { scopes: true })}
                      />
                    )}
                  />
                </Show>
              </Loading>
            </div>
            <Loading fallback={null}>
              <GroupFeed
                items={groups()}
                key={collection => collection.slug}
                estimate={estimate}
                initial={FIRST_GROUPS}
                live={account() || selection().length ? FIRST_GROUPS : 0}
                depth={restoring}
                group={collection => {
                  const path = () => inView(`/${collection().slug}`, params());
                  const agents = () => collection().owner.kind === "agent";
                  return (
                    <CollectionGroup
                      title={collection().title}
                      href={localHref(path())}
                      onIntent={() => preloadHref(router, path())}
                      description={collection().description}
                      owner={ownerLabel(collection().owner, isAdmin())}
                      age={relativeAge(collection().updatedAt, now())}
                      count={
                        collection().itemCount -
                        (collection().preview.length - kept(collection()).length)
                      }
                      private={collection().visibility === "private"}
                      palettes={kept(collection())}
                      card={preview => {
                        const item = createMemo(() => ({
                          kseed: preview().seed,
                          style: preview().style,
                          steps: preview().steps,
                          angle: preview().angle,
                          likes: preview().likes ?? 0,
                          createdAt: preview().createdAt ?? collection().updatedAt
                        }));
                        return (
                          <GalleryCard
                            item={item()}
                            now={now()}
                            readAt={loaded().readAt.get(collection().slug)}
                            at={() => ({
                              collection: collection().slug,
                              position: kept(collection()).findIndex(
                                entry => entry.seed === preview().seed
                              )
                            })}
                            fit={
                              <Show when={words()}>
                                <Fit
                                  value={groupFits.of(collection().slug, preview().seed)}
                                  admin={isAdmin() && agents()}
                                  collection={collection().title}
                                  onVote={next =>
                                    groupFits.vote(collection().slug, preview().seed, next)
                                  }
                                  disabled={offline()}
                                />
                              </Show>
                            }
                            lead={<Show when={agents()}>{curation.presses(item, {})}</Show>}
                          />
                        );
                      }}
                    />
                  );
                }}
              />
            </Loading>
            {/* the rest of this page's collections, for a reader without scripts, whom no window draws them for */}
            <NoHydration>
              <noscript>
                <ul>
                  <For each={groups().slice(FIRST_GROUPS)}>
                    {collection => (
                      <li>
                        <a href={localHref(inView(`/${collection.slug}`, params()))}>
                          {collection.title}
                        </a>
                      </li>
                    )}
                  </For>
                </ul>
              </noscript>
            </NoHydration>
          </div>
          <div class={styles.mark} ref={feed.mark} aria-hidden="true" />
          <div class={styles.status}>
            <Status
              error={!!headError() || !!firstError() || !!feed.reason() || !!page.line()?.error}
            >
              {message() || said()}
            </Status>
            <Show when={headError()}>
              <Button size="sm" onClick={() => void head.refetch()}>
                {t("Retry")}
              </Button>
            </Show>
            <Show when={!headError() && (firstError() || feed.reason())}>
              <Button
                size="sm"
                onClick={() => void (firstError() ? first.refetch() : feed.next(true))}
              >
                {t("Retry")}
              </Button>
            </Show>
            <Show when={signInForMore() && !feed.more()}>{signIn("sm")}</Show>
            <Show when={pastEnd()}>
              <Button
                size="sm"
                href={localHref(`/${listSearch(params(), { page: 1, selection: false })}`)}
              >
                {t("First page")}
              </Button>
            </Show>
            {/* a link for readers without scripts; a plain press asks for the page in place */}
            <Show when={feed.more() && !feed.loading() && !feed.reason()}>
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
        </main>
        {page.chosen.screen()}
        {/* on a phone it stands above the floating Selection press */}
        <BackToTop raised={selection().length > 0 && !page.chosen.open()} />
      </AppPage>
    </GalleryContext>
  );
}
