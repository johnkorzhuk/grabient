import { localHref, msg, t } from "@grabient/i18n";
import { BackToTop } from "@grabient/ui/BackToTop.tsx";
import { Button } from "@grabient/ui/Button.tsx";
import { ListNav, type Order } from "@grabient/ui/ListNav.tsx";
import { PaletteFeed } from "@grabient/ui/PaletteFeed.tsx";
import { PaletteGridPlaceholder } from "@grabient/ui/PalettePlaceholder.tsx";
import { Status } from "@grabient/ui/Status.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { type UndefinedInitialDataOptions, useQuery, useQueryClient } from "@tanstack/solid-query";
import {
  useElementScrollRestoration,
  useNavigate,
  useRouter,
  useRouterState
} from "@tanstack/solid-router";
import { createMemo, Loading, Show } from "solid-js";
import { DEFAULT_FRAME, nextFrame, type RisingFrame } from "../../lib/orders.ts";
import { account } from "../account/session.ts";
import { AppearanceToolbar, listView } from "../list/appearance.ts";
import { SearchField } from "../search/SearchField.tsx";
import { Tags } from "../search/Tags.tsx";
import { type GalleryPlace, LIST_PATHS, listSearch, orderHref } from "./address.ts";
import { drawnAs, hexesOf, minuteOf, nameOf, paletteHref } from "./drawing.ts";
import { createFeed, FIRST_SCREEN, inPlace, preloadHref } from "./feed.ts";
import { GalleryCard } from "./GalleryCard.tsx";
import styles from "./gallery.module.css";
import { ListHeading } from "./ListHeading.tsx";
import { type Failed, failed, framesQuery } from "./queries.ts";
import type { PaletteItem } from "./schema.ts";
import { keptPage, type ListSource, type Page, pageQuery, readPage } from "./sources.ts";
import { heading, searchedName } from "./titles.ts";

/* The palette lists: Popular (/palettes) and Rising in its frame (/palettes/rising), each searched with `?q=`, and the
   account's Saved. A list is a feed: its address's own page, then each page after it joining as the reader nears the
   end, with only the rows near the viewport drawn. A switch to another list keeps the cards standing until the next
   one's first page lands; a failed read keeps them too, beside the reason and Retry. */

type ListPlace = Exclude<GalleryPlace, { kind: "home" }>;

export function Palettes(props: { place: ListPlace }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();
  const preload = (href: string) => preloadHref(router, href);
  const restoring = useElementScrollRestoration({ getElement: () => window })?.scrollY;
  const navigating = useRouterState({ select: state => state.status === "pending" });
  const params = () => props.place.params;
  const words = () => params().words;
  const order = (): Order => (props.place.kind === "saved" ? "saved" : props.place.order);
  /* Rising's frame: the list's own, or the week's, where a press on Rising leads */
  const frame = (): RisingFrame =>
    props.place.kind === "list" ? props.place.frame : DEFAULT_FRAME;
  const frames = useQuery(() => framesQuery());
  const offered = () => frames.data;
  /* what the list reads: Saved only once the account is known */
  const source = createMemo((): ListSource | null => {
    const place = props.place;
    if (place.kind === "list") {
      return { kind: "list", sort: place.order, frame: place.frame, params: place.params };
    }
    const owner = account()?.id;
    return owner ? { kind: "saved", owner, params: place.params } : null;
  });
  const signedOut = () => props.place.kind === "saved" && account() === null;

  type HeadOptions = ReturnType<UndefinedInitialDataOptions<unknown, Error, Page | Failed>>;
  const head = useQuery((): HeadOptions => {
    const from = source();
    if (!from) return { queryKey: ["saved", "unknown"], queryFn: () => null, enabled: false };
    const { options, shape } = pageQuery(from, params().page);
    return { ...(options as unknown as HeadOptions), select: shape };
  });
  /* the last page that stood: a read that fails leaves it on screen beside its reason */
  const standing = createMemo((last?: Page) => (failed(head.data) ? last : head.data));
  const feed = createFeed<Page>({
    key: () => JSON.stringify(source()),
    start: () => params().page,
    head: () => head.data,
    kept: n => {
      const from = source();
      return from ? keptPage(client, from, n) : undefined;
    },
    read: n => readPage(client, source()!, n)
  });
  const items = createMemo(() => {
    const seen = new Set<string>();
    const out: PaletteItem[] = [];
    for (const page of [standing(), ...feed.joined()]) {
      for (const item of page?.items ?? []) {
        if (!seen.has(item.kseed)) {
          seen.add(item.kseed);
          out.push(item);
        }
      }
    }
    return out;
  });

  const view = () => listView(params());
  const now = () => minuteOf(standing()?.fetchedAt ?? 0);
  const pastEnd = () => {
    const page = standing();
    return !!page && params().page > Math.max(1, page.totalPages);
  };
  /* a palette searched by stands in the title as the card it would be, leading to its page */
  const searched = createMemo(() => {
    const name = words() ? searchedName(words()) : null;
    if (!name) return null;
    const shown = drawnAs({ seed: words(), style: "linearGradient", steps: 7, angle: 90 }, view());
    return {
      stops: hexesOf(shown.seed, shown.steps),
      style: shown.style,
      angle: shown.angle,
      name: nameOf(shown),
      href: paletteHref(shown, params().size)
    };
  });
  const feedTitle = () =>
    t(
      order() === "saved"
        ? msg("Saved", "order")
        : order() === "rising"
          ? msg("Rising", "order")
          : msg("Popular", "order"),
      { $context: "order" }
    );
  const headError = () => (failed(head.data) ? head.data.failed : "");
  const empty = () =>
    pastEnd()
      ? t("Page {page} doesn't exist.", { page: String(params().page) })
      : props.place.kind !== "saved"
        ? t("No results.")
        : !words()
          ? t("Palettes you like appear here.")
          : standing()?.tier === "account"
            ? t("No results. Try a color, mood or theme.")
            : t("No results.");
  /* the placeholders say a cold list is on its way; the line speaks only for what the cards cannot */
  const message = () =>
    headError() ||
    feed.reason() ||
    (navigating() ? t("Updating…") : feed.loading() ? t("Loading more…") : "") ||
    (standing() && !items().length ? empty() : "");

  /* where each list lives, keeping the words and the view; a press on Rising while it is the order moves its frame */
  const here = () => ({ ...params(), page: 1, selection: false });
  const toOrder = (to: Order) =>
    orderHref(
      to,
      to === "rising" && order() === "rising" ? nextFrame(frame(), offered()) : frame(),
      here()
    );
  const toSection = (section: "palettes" | "collections") =>
    section === "palettes"
      ? orderHref(order(), frame(), here())
      : `/collections${listSearch(here())}`;
  const pick = (to: Order) => {
    /* in the page's own place in the history, so Back leaves Rising in one press */
    if (to === "rising" && order() === "rising") {
      if ((offered()?.length ?? 1) > 1) void navigate({ href: toOrder(to), replace: true });
      return;
    }
    const target = toOrder(to);
    void navigate({
      href:
        to === "saved" && account() === null
          ? `/login?redirect=${encodeURIComponent(target)}`
          : target
    });
  };
  const nextHref = () => {
    const last = feed.joined().at(-1) ?? standing();
    const path = toOrder(order()).split("?")[0]!;
    return localHref(
      path + listSearch(params(), { page: (last?.page ?? params().page) + 1, selection: false })
    );
  };

  return (
    <main id="main" class={styles.page}>
      <div class={styles.find}>
        <SearchField
          surface="palettes"
          words={words()}
          placeholder={t("Search palettes")}
          to={w => orderHref(order(), frame(), { ...here(), words: w })}
        />
        <Tags surface="palettes" words={words()} />
      </div>
      <h1 class={styles.hidden}>{heading(props.place)}</h1>
      <div class={styles.row}>
        <ListNav
          section="palettes"
          order={order()}
          frame={(offered()?.length ?? 1) > 1 ? frame() : undefined}
          frames={offered()}
          onSection={section => void navigate({ href: toSection(section) })}
          onOrder={pick}
          onIntent={target => {
            if (target.order && target.order !== "saved") preload(toOrder(target.order));
            if (target.section === "palettes") preload(toSection("palettes"));
          }}
          sectionHref={section => localHref(toSection(section))}
          orderHref={to => (to === "saved" ? undefined : localHref(toOrder(to)))}
        />
        <AppearanceToolbar view={view()} />
      </div>
      <ListHeading title={feedTitle()} words={words()} palette={searched()} />
      <Show
        when={!signedOut()}
        fallback={
          <div class={styles.empty}>
            <Text variant="h3" as="h2">
              {t("Sign in to see your saved palettes.")}
            </Text>
            <Button
              variant="primary"
              size="lg"
              href={localHref(
                `/login?redirect=${encodeURIComponent(LIST_PATHS.saved + listSearch(here()))}`
              )}
            >
              {t("Sign in")}
            </Button>
          </div>
        }
      >
        <div aria-busy={navigating() ? "true" : "false"}>
          <Loading fallback={<PaletteGridPlaceholder count={params().limit} />}>
            <PaletteFeed
              items={items()}
              key={item => item.kseed}
              live={FIRST_SCREEN}
              depth={restoring}
              card={item => <GalleryCard item={item()} view={view()} now={now()} words={words()} />}
            />
          </Loading>
        </div>
        <div class={styles.mark} ref={feed.mark} aria-hidden="true" />
        <div class={styles.status}>
          <Status error={!!headError() || !!feed.reason()}>{message()}</Status>
          <Show when={headError()}>
            <Button size="sm" onClick={() => void head.refetch()}>
              {t("Retry")}
            </Button>
          </Show>
          <Show when={feed.reason() && !headError()}>
            <Button size="sm" onClick={() => void feed.next(true)}>
              {t("Retry")}
            </Button>
          </Show>
          <Show when={pastEnd()}>
            <Button size="sm" href={localHref(orderHref(order(), frame(), here()))}>
              {t("First page")}
            </Button>
          </Show>
          {/* a link for readers without scripts; a plain press asks for the page in place */}
          <Show when={feed.more() && !feed.loading() && !feed.reason() && !headError()}>
            <Button size="sm" href={nextHref()} onClick={e => inPlace(e, () => void feed.next())}>
              {t("More palettes")}
            </Button>
          </Show>
        </div>
      </Show>
      <BackToTop />
    </main>
  );
}
