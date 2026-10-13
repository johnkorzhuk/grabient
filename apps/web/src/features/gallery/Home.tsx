import { localHref, t } from "@grabient/i18n";
import { BackToTop } from "@grabient/ui/BackToTop.tsx";
import { Button } from "@grabient/ui/Button.tsx";
import { CollectionGroup, shownAt } from "@grabient/ui/CollectionGroup.tsx";
import { GroupFeed } from "@grabient/ui/GroupFeed.tsx";
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
import { createMemo, Loading, Show } from "solid-js";
import { account, isAdmin } from "../account/session.ts";
import { AppearanceToolbar, listView } from "../list/appearance.ts";
import { SearchField } from "../search/SearchField.tsx";
import { Tags } from "../search/Tags.tsx";
import { homeHref, type ListParams, listSearch, orderHref } from "./address.ts";
import type { CollectionPage, CollectionSummary } from "./collections.ts";
import { drawnAs, hexesOf, minuteOf, nameOf, paletteHref, relativeAge } from "./drawing.ts";
import { createFeed, FIRST_SCREEN, inPlace, preloadHref } from "./feed.ts";
import { GalleryCard } from "./GalleryCard.tsx";
import styles from "./gallery.module.css";
import { ListHeading } from "./ListHeading.tsx";
import { collectionsPageQuery, type Failed, failed, homeHeadQuery } from "./queries.ts";
import { heading, searchedName } from "./titles.ts";

/* The home: the hottest palettes under Trending, then the hot collections as their groups, more joining as the reader
   nears the end. Searched (`/?q=words`) it keeps the shape: the palette list's search, the most liked first, then the
   collections list's. The server draws the head and the first groups; the rest stand as their height until the page
   settles, and only the groups near the viewport are drawn after (GroupFeed). */

/** The groups the server draws after the head: what a first screen shows of them. */
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

/** Who made a collection, as its group's tooltip says it. */
function ownerOf(collection: CollectionSummary): string {
  const { owner } = collection;
  if (owner.kind === "agent") {
    return isAdmin() && owner.name ? t("{name} (agent)", { name: owner.name }) : "Grabient";
  }
  return owner.display || (owner.name ? `@${owner.name}` : t("Grabient user"));
}

export function Home(props: { params: ListParams }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();
  const restoring = useElementScrollRestoration({ getElement: () => window })?.scrollY;
  const navigating = useRouterState({ select: state => state.status === "pending" });
  const words = () => props.params.words;
  const order = () => (words() ? "popular" : "hot");
  const head = useQuery(() => homeHeadQuery(words()));
  const standingHead = createMemo((last?: Exclude<typeof head.data, Failed>) =>
    failed(head.data) ? last : head.data
  );
  const first = useQuery(() => collectionsPageQuery(order(), words(), props.params.page));
  const standingFirst = createMemo((last?: CollectionPage) =>
    failed(first.data) ? last : first.data
  );
  const feed = createFeed<CollectionPage>({
    key: () => `${order()}\n${words()}`,
    start: () => props.params.page,
    head: () => first.data,
    kept: n => {
      const page = client.getQueryData(collectionsPageQuery(order(), words(), n).queryKey);
      return page && !failed(page) ? page : undefined;
    },
    read: n => client.fetchQuery(collectionsPageQuery(order(), words(), n))
  });
  /* every collection on the feed once, in the order the pages came */
  const groups = createMemo(() => {
    const seen = new Set<string>();
    const out: CollectionSummary[] = [];
    for (const page of [standingFirst(), ...feed.joined()]) {
      for (const item of page?.items ?? []) {
        if (!seen.has(item.slug)) {
          seen.add(item.slug);
          out.push(item);
        }
      }
    }
    return out;
  });

  const view = () => listView(props.params);
  /* the ages the server printed are told against the minute the head was read in, and hydration agrees */
  const now = () => minuteOf(standingHead()?.fetchedAt ?? 0);
  const searched = createMemo(() => {
    const name = words() ? searchedName(words()) : null;
    if (!name) return null;
    const shown = drawnAs({ seed: words(), style: "linearGradient", steps: 7, angle: 90 }, view());
    return {
      stops: hexesOf(shown.seed, shown.steps),
      style: shown.style,
      angle: shown.angle,
      name: nameOf(shown),
      href: paletteHref(shown, props.params.size)
    };
  });
  /* signed out, and the words need the account's search: the way in where the palettes would stand */
  const signInToSearch = () => standingHead()?.tier === "account" && account() === null;
  const signInForMore = () => !!standingHead()?.partial && account() === null;
  const headError = () => (failed(head.data) ? head.data.failed : "");
  const firstError = () => (failed(first.data) ? first.data.failed : "");
  const message = () =>
    headError() ||
    firstError() ||
    feed.reason() ||
    (navigating()
      ? words()
        ? t("Searching…")
        : t("Updating…")
      : feed.loading()
        ? t("Loading more…")
        : "") ||
    (signInForMore() && !feed.more() ? t("Sign in to search with all your words.") : "") ||
    (!standingHead() || groups().length
      ? ""
      : !words()
        ? t("No collections yet.")
        : !standingHead()?.palettes.length && !signInToSearch()
          ? t("No results.")
          : "");
  const here = () => ({ ...props.params, page: 1, selection: false });
  const toSection = (section: "palettes" | "collections") =>
    section === "palettes"
      ? orderHref("popular", "1w", here())
      : `/collections${listSearch(here())}`;
  const nextHref = () => {
    const last = feed.joined().at(-1) ?? standingFirst();
    return localHref(
      `/${listSearch(props.params, { page: (last?.page ?? props.params.page) + 1, selection: false })}`
    );
  };
  const loginHere = () =>
    localHref(
      `/login?redirect=${encodeURIComponent(`/${listSearch(props.params, { selection: false })}`)}`
    );

  return (
    <main id="main" class={styles.page}>
      <div class={styles.find}>
        <SearchField
          surface="home"
          words={words()}
          placeholder={t("Search palettes and collections")}
          to={homeHref}
        />
        <Tags surface="home" words={words()} />
      </div>
      <h1 class={styles.hidden}>{heading({ kind: "home", params: props.params })}</h1>
      {/* the two sections, neither chosen: the home is neither list */}
      <div class={styles.row}>
        <ListNav
          section={null}
          order={null}
          onSection={section => void navigate({ href: toSection(section) })}
          onIntent={target => {
            if (target.section) preloadHref(router, toSection(target.section));
          }}
          sectionHref={section => localHref(toSection(section))}
        />
        <AppearanceToolbar view={view()} />
      </div>
      <div class={styles.stack}>
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
              <Button variant="primary" size="lg" href={loginHere()}>
                {t("Sign in")}
              </Button>
            </div>
          </Show>
          <Loading fallback={<PaletteGridPlaceholder count={words() ? 60 : 24} />}>
            <Show when={standingHead()?.palettes.length}>
              <PaletteFeed
                items={standingHead()?.palettes ?? []}
                key={item => item.kseed}
                live={FIRST_SCREEN}
                depth={restoring}
                card={item => (
                  <GalleryCard item={item()} view={view()} now={now()} words={words()} />
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
            live={0}
            depth={restoring}
            group={collection => (
              <CollectionGroup
                title={collection().title}
                href={localHref(`/${collection().slug}`)}
                description={collection().description}
                owner={ownerOf(collection())}
                age={relativeAge(collection().updatedAt, now())}
                count={collection().itemCount}
                private={collection().visibility === "private"}
                palettes={collection().preview}
                card={palette => (
                  <GalleryCard
                    item={{
                      kseed: palette().seed,
                      style: palette().style,
                      steps: palette().steps,
                      angle: palette().angle,
                      likes: palette().likes ?? 0,
                      createdAt: palette().createdAt ?? collection().updatedAt
                    }}
                    view={view()}
                    now={now()}
                  />
                )}
              />
            )}
          />
        </Loading>
      </div>
      <div class={styles.mark} ref={feed.mark} aria-hidden="true" />
      <div class={styles.status}>
        <Status error={!!headError() || !!firstError() || !!feed.reason()}>{message()}</Status>
        <Show when={headError()}>
          <Button size="sm" onClick={() => void head.refetch()}>
            {t("Retry")}
          </Button>
        </Show>
        <Show when={!headError() && (firstError() || feed.reason())}>
          <Button size="sm" onClick={() => void (firstError() ? first.refetch() : feed.next(true))}>
            {t("Retry")}
          </Button>
        </Show>
        <Show when={signInForMore() && !feed.more()}>
          <Button size="sm" href={loginHere()}>
            {t("Sign in")}
          </Button>
        </Show>
        {/* a link for readers without scripts; a plain press asks for the page in place */}
        <Show when={feed.more() && !feed.loading() && !feed.reason()}>
          <Button size="sm" href={nextHref()} onClick={e => inPlace(e, () => void feed.next())}>
            {t("More collections")}
          </Button>
        </Show>
      </div>
      <BackToTop />
    </main>
  );
}
