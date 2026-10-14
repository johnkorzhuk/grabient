import { localHref, msg, t } from "@grabient/i18n";
import { queryColors } from "@grabient/search/colors.ts";
import { BackToTop } from "@grabient/ui/BackToTop.tsx";
import { Button } from "@grabient/ui/Button.tsx";
import { CollectionCard } from "@grabient/ui/CollectionCard.tsx";
import { Fit } from "@grabient/ui/Fit.tsx";
import { ListNav, type Order } from "@grabient/ui/ListNav.tsx";
import { PaletteFeed } from "@grabient/ui/PaletteFeed.tsx";
import { PaletteGrid } from "@grabient/ui/PaletteGrid.tsx";
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
import { listUnavailable, offline, signInUnavailable } from "../../app/connection.ts";
import { AppPage } from "../../app/Frames.tsx";
import { record } from "../../app/undo.ts";
import { DEFAULT_FRAME, nextFrame, type RisingFrame } from "../../lib/orders.ts";
import { heading } from "../../lib/page-meta.ts";
import { hexesOf } from "../../lib/palette.ts";
import { account, isAdmin, loginHref, sessionReady } from "../account/session.ts";
import { onAccountChange } from "../account/state.ts";
import { trackEvent, trackSignInPrompt } from "../analytics/analytics.ts";
import { ownerLabel } from "../collections/drawing.ts";
import { paletteGone } from "../collections/overlay.ts";
import { collectionsQuery } from "../collections/queries.ts";
import type { CollectionSummary } from "../collections/types.ts";
import { AppearanceContext, drawnIn, inView } from "../list/appearance.ts";
import { searchAnswered } from "../search/count.ts";
import { createSearchFit } from "../search/fit.ts";
import { createPicture, type Settled } from "../search/picture.ts";
import { Sampler } from "../search/Sampler.tsx";
import { selection } from "../selection/selection.ts";
import { createAccountSearch } from "./account.ts";
import { type GalleryPlace, listHref, listIdentity, listSearch, withView } from "./address.ts";
import { createCuration } from "./curate.tsx";
import {
  madeItems,
  minuteOf,
  nameOf,
  ownOf,
  paletteHref,
  picturedAs,
  relativeAge
} from "./drawing.ts";
import { Find } from "./Find.tsx";
import { createFeed, FIRST_SCREEN, inPlace, preloadHref } from "./feed.ts";
import { GalleryCard } from "./GalleryCard.tsx";
import styles from "./gallery.module.css";
import { ListHeading } from "./ListHeading.tsx";
import { paintOf } from "./load.ts";
import { Made } from "./Made.tsx";
import { readerOrder, rememberOrder } from "./order.ts";
import { createGalleryPage, GalleryContext } from "./page.tsx";
import { type Failed, failed, framesQuery } from "./queries.ts";
import type { PaletteItem } from "./schema.ts";
import { sortSearch } from "./sort.ts";
import { keptPage, type ListSource, type Page, pageView, readPage } from "./sources.ts";
import { metaPage, searchedName } from "./titles.ts";

/* The palette lists: Popular (/palettes) and Rising in its frame (/palettes/rising), each searched with `?q=`, and the
   account's Saved. A list is a feed: its address's own page, then each page after it joining as the reader nears the
   end, with only the rows near the viewport drawn. A switch to another list keeps the cards standing until the next
   one's first page lands; a failed read keeps them too, beside the reason and Retry. Saved is the account's alone: it
   is read once the account is known, from the account's copy where that can say. */

type ListPlace = Exclude<GalleryPlace, { kind: "home" }>;
type HeadOptions = ReturnType<UndefinedInitialDataOptions<unknown, Error, Page | Failed>>;

const TOOL = {
  name: "search_palettes",
  description:
    "Search Grabient for color palettes and CSS gradients by color, mood, theme, hex code or palette link. Opens the results on this page. A palette link or seed finds the palettes like that palette.",
  words:
    "Words such as sunset or pastel blue, a hex code such as #ff6b6b, or a Grabient palette link or seed."
};
/** The collections offered where the palettes cannot answer: twelve asked for, eight shown. */
const OFFER_ASKED = 12;
const OFFER_SHOWN = 8;

export function Palettes(props: { place: ListPlace }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();
  const go = (href: string, replace = false) => void navigate({ href, replace });
  const restoring = useElementScrollRestoration({ getElement: () => window })?.scrollY;
  const navigating = useRouterState({ select: state => state.status === "pending" });
  const params = () => props.place.params;
  const words = () => params().words;
  /* a route's list is one kind for as long as its page stands */
  const saved = untrack(() => props.place.kind === "saved");
  const order = (): Order => (props.place.kind === "saved" ? "saved" : props.place.order);
  const frames = useQuery(() => framesQuery());
  const offered = () => frames.data;
  /* Rising's frame: the list's own, or the one read last, where a press on Rising leads from another order */
  const frame = (): RisingFrame => {
    if (props.place.kind === "list" && props.place.order === "rising") return props.place.frame;
    const last = readerOrder().frame;
    return offered()?.includes(last) ? last : DEFAULT_FRAME;
  };
  createEffect(
    () => [order(), props.place.kind === "list" ? props.place.frame : undefined] as const,
    ([shown, read]) => rememberOrder(shown, shown === "rising" ? read : undefined)
  );

  /* what the list reads: Saved only once the account is known */
  const source = createMemo((): ListSource | null => {
    const place = props.place;
    if (place.kind === "list") {
      return { kind: "list", sort: place.order, frame: place.frame, params: place.params };
    }
    const owner = account()?.id;
    return owner ? { kind: "saved", owner, params: place.params } : null;
  });
  const signedOut = () => saved && sessionReady() && account() === null;

  /* A public list's first page is the route's own read, which the loader filled. Saved is private and read once the
     account is known, through the same cache into the page's own state: a query that waits for an account has no
     value for a page to wait on. */
  const listed = saved
    ? null
    : useQuery((): HeadOptions => pageView(source()!, params().page) as unknown as HeadOptions);
  const owner = () => {
    const from = source();
    return from?.kind === "saved" ? from.owner : "";
  };
  const [own, setOwn] = createSignal<{ of: string; page: Page | Failed } | null>(null);
  const ownKey = () =>
    owner() ? JSON.stringify([owner(), words(), params().limit, params().page]) : "";
  /* the account's likes changed while a page was being read: that read is from before, and is read again */
  let likes = 0;
  let reading = "";
  const readOwn = (fresh = false) => {
    const from = source();
    const of = ownKey();
    const at = likes;
    if (!from || !of) return;
    reading = of;
    void readPage(client, from, params().page, fresh).then(read => {
      if (of !== ownKey()) return;
      if (at !== likes) readOwn(true);
      else setOwn({ of, page: read });
    });
  };
  if (saved) {
    /* a page is read once: a palette unliked here stays where it stood, its heart off, until the next visit */
    createEffect(ownKey, of => {
      if (of !== reading) readOwn();
    });
    /* a like made or taken back leaves the kept pages behind: the next visit reads them again */
    onSettled(() =>
      onAccountChange(change => {
        if (!change.reset && !change.likes.size) return;
        likes++;
        void client.invalidateQueries({ queryKey: ["saved"] });
      })
    );
  }
  const head = (): Page | Failed | undefined => {
    if (listed) return listed.data;
    const read = own();
    return read && read.of === ownKey() ? read.page : undefined;
  };
  const headError = () => {
    const read = head();
    return read && failed(read) ? read.failed : "";
  };
  /* the last page that stood, while it is the same reader's: a read that fails leaves it on screen beside its reason,
     and no account's page outlives its account */
  const stood = createMemo((last?: { owner: string; page: Page }) => {
    const read = head();
    if (read && !failed(read)) return { owner: owner(), page: read };
    return last && last.owner === owner() && !signedOut() ? last : undefined;
  });
  const standing = () => stood()?.page;
  const retry = () => (listed ? void listed.refetch() : readOwn(true));

  const page = createGalleryPage({
    path: () => listHref("palettes", order(), frame(), params()).split("?")[0]!,
    params,
    surface: () => (saved ? "saved" : words() ? "search" : "list"),
    counted: "palettes",
    painted: () => paintOf(items(), params())
  });
  const look = useContext(AppearanceContext)!;

  /* Words the public search could not read for everyone, or read in part, are the account's own search to answer, once
     the account is known: its palettes stand where the public ones stood, as one list in the list's order. */
  const found = createAccountSearch({
    words,
    wanted: () => {
      const read = standing();
      return !saved && !!words() && !!read && (read.tier === "account" || !!read.partial);
    }
  });
  const answered = createMemo(() => {
    const items = found.items();
    const place = props.place;
    return items && place.kind === "list"
      ? sortSearch(items, place.order, place.frame).slice((params().page - 1) * params().limit)
      : null;
  });
  const feed = createFeed<Page>({
    key: () => listIdentity(props.place, account()?.id),
    start: () => params().page,
    head: () => (answered() ? undefined : head()),
    kept: n => {
      const from = source();
      return from ? keptPage(client, from, n) : undefined;
    },
    read: n => {
      trackEvent("paginate", { page_number: n, surface: page.place().surface });
      return readPage(client, source()!, n);
    }
  });
  /* every palette on the feed once, in the order the pages came, less what an admin deleted here; each with when its
     count was read */
  const loaded = createMemo(() => {
    const readAt = new Map<string, number>();
    const out: PaletteItem[] = [];
    const whole = answered();
    for (const read of whole ? [] : [standing(), ...feed.joined()]) {
      for (const item of read?.items ?? []) {
        if (readAt.has(item.kseed) || paletteGone(item.kseed)) continue;
        readAt.set(item.kseed, read!.countsAt ?? read!.fetchedAt);
        out.push(item);
      }
    }
    return { items: whole ? whole.filter(item => !paletteGone(item.kseed)) : out, readAt };
  });
  const items = () => loaded().items;

  /* signed out, and the words need the account's search: the way in, and the collections that answer the same words,
     which are open to everyone */
  const unsigned = () => !saved && !!words() && sessionReady() && account() === null;
  const signInToSearch = () => unsigned() && standing()?.tier === "account";
  const signInForMore = () => unsigned() && !!standing()?.partial && standing()?.tier !== "account";
  const [offer, setOffer] = createSignal<{
    words: string;
    items: CollectionSummary[];
    total: number;
  } | null>(null);
  createEffect(
    () => (signInToSearch() ? words() : ""),
    asked => {
      if (!asked) return;
      void client
        .fetchQuery(
          collectionsQuery({ sort: "popular", query: asked, page: 1, limit: OFFER_ASKED })
        )
        .then(read => {
          if (!failed(read))
            setOffer({
              words: asked,
              items: read.items.slice(0, OFFER_SHOWN),
              total: read.total
            });
        });
    }
  );
  const offers = () => {
    const held = offer();
    return held && held.words === words() && signInToSearch() ? held : null;
  };

  /* every palette a search answers carries thumbs named for its words, or for the palette it is by */
  const fits = createSearchFit({
    query: () => (saved ? "" : words()),
    account: () => (sessionReady() ? (account()?.id ?? null) : undefined),
    signIn: () => {
      trackSignInPrompt("vote");
      go(page.signIn());
    },
    fail: page.say,
    offline,
    named: asked => searchedName(asked) ?? asked
  });
  const curation = createCuration({
    seeds: () => (saved ? [] : items().map(item => item.kseed)),
    say: page.say
  });

  const searchHref = (to: string, linked?: URLSearchParams) =>
    listHref("palettes", order(), frame(), withView({ ...params(), words: to }, linked));

  /* A picture is searched by its colors: read in this browser and held in this tab, so a reload or Back finds it
     beside its search. Its colors are nobody's words and are not counted. A point that comes to rest searches its
     colors in this page's place in the history, so Back leaves the search by image in one press, and the change is a
     step of the page's undo. */
  const picture = createPicture();
  onSettled(() => picture.restore(untrack(words)));
  const held = () => (saved ? null : picture.pictureFor(words()));
  const searchImage = async (file: File) => {
    const colors = await picture.take(file);
    if (!colors) return page.refuse(t("Couldn't read this image."));
    go(searchHref(colors));
  };
  const searchPoints = (colors: string | null) => {
    if (colors && colors !== words()) go(searchHref(colors), true);
  };
  const rest = (done: Settled | null) => {
    if (!done) return;
    const show = (points: Settled["before"]) => async () => searchPoints(picture.show(points));
    record({ undo: show(done.before), redo: show(done.after) });
    searchPoints(done.colors);
  };
  /* a search by colors leads with the palettes the colors make, a picture's as its points move */
  const made = createMemo(() =>
    saved ? [] : madeItems(held()?.points.map(point => point.hex) ?? queryColors(words()))
  );
  /* what a search found, told once its answer is this page's */
  createEffect(
    () => {
      const read = standing();
      return !saved && words() && read && !navigating()
        ? {
            words: words(),
            kind: held()
              ? ("image" as const)
              : read.tier === "similar"
                ? ("palette" as const)
                : read.tier === "color"
                  ? ("colors" as const)
                  : undefined,
            tier: read.tier,
            results: read.total
          }
        : null;
    },
    told => {
      if (told) searchAnswered(told.words, "palettes", told);
    }
  );

  const now = () => minuteOf(standing()?.fetchedAt ?? 0);
  const pastEnd = () => {
    const read = standing();
    return !answered() && !!read && params().page > Math.max(1, read.totalPages);
  };
  /* a palette searched by stands in the title as the card it would be, leading to its page */
  const searched = createMemo(() => {
    const name = words() ? searchedName(words()) : null;
    /* a search by colors is titled by the palette its colors make as written */
    const item = name
      ? { kseed: words(), style: "linearGradient" as const, steps: 7, angle: 90 }
      : made()[0];
    if (!item) return null;
    const shown = drawnIn(ownOf(item), params());
    const drawn = picturedAs(ownOf(item), params(), look.draft(), look.peek());
    return {
      stops: hexesOf(drawn),
      style: drawn.style,
      angle: drawn.angle,
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
  const empty = () =>
    pastEnd()
      ? t("Page {page} doesn't exist.", { page: String(params().page) })
      : !saved
        ? t("No results.")
        : !words()
          ? t("Palettes you like appear here.")
          : standing()?.tier === "account"
            ? t("No results. Try a color, mood or theme.")
            : t("No results.");
  const more = () => feed.more() && !headError();
  /* the placeholders say a cold list is on its way; the line speaks only for what the cards cannot */
  const message = () =>
    headError() ||
    feed.reason() ||
    page.line()?.message ||
    (navigating() ? t("Updating…") : feed.loading() ? t("Loading more…") : "") ||
    found.note() ||
    (signInForMore() && !more() ? t("Sign in to search with all your words.") : "") ||
    (standing() && !items().length && !signInToSearch() ? empty() : "");

  /* where each list lives, keeping the words and the view; with no connection the sections lead to the account's own */
  const toOrder = (to: Order) =>
    listHref(
      "palettes",
      to,
      to === "rising" && order() === "rising" ? nextFrame(frame(), offered()) : frame(),
      params()
    );
  const toSection = (section: "palettes" | "collections") =>
    listHref(section, offline() ? "saved" : order(), frame(), params());
  const pick = (to: Order) => {
    /* in the page's own place in the history, so Back leaves Rising in one press */
    if (to === "rising" && order() === "rising") {
      if ((offered()?.length ?? 1) > 1) go(toOrder(to), true);
      return;
    }
    const target = toOrder(to);
    if (to === "saved" && sessionReady() && account() === null) {
      trackSignInPrompt("saved");
      return go(loginHref(target));
    }
    go(target);
  };
  const nextHref = () => {
    const last = feed.joined().at(-1) ?? standing();
    return localHref(
      toOrder(order()).split("?")[0]! +
        listSearch(params(), { page: (last?.page ?? params().page) + 1, selection: false })
    );
  };
  const signIn = (reason: "search" | "saved") => (
    <Button
      variant="primary"
      size="lg"
      href={page.signIn()}
      disabled={signInUnavailable()}
      onClick={() => trackSignInPrompt(reason)}
    >
      {t("Sign in")}
    </Button>
  );

  return (
    <GalleryContext value={page}>
      <AppPage feed bare={page.chosen.open()}>
        {/* the page stays mounted and out of sight under the export screen, so Close returns to the same depth */}
        <main id="main" class={styles.page} hidden={page.chosen.open()}>
          <Find
            surface="palettes"
            placeholder={t("Search palettes")}
            tool={TOOL}
            to={searchHref}
            counts={!saved}
            disabled={listUnavailable(order())}
            onImage={file => void searchImage(file)}
          />
          <h1 class={styles.hidden}>{heading(metaPage(props.place))}</h1>
          <div class={styles.row}>
            <ListNav
              section="palettes"
              order={order()}
              frame={(offered()?.length ?? 1) > 1 ? frame() : undefined}
              frames={offered()}
              disabled={listUnavailable}
              onSection={section => go(toSection(section))}
              onOrder={pick}
              onIntent={target => {
                if (target.order && target.order !== "saved")
                  preloadHref(router, toOrder(target.order));
                if (target.section === "palettes") preloadHref(router, toSection("palettes"));
              }}
              sectionHref={section => localHref(toSection(section))}
              orderHref={to => (to === "saved" ? undefined : localHref(toOrder(to)))}
            />
            {page.chosen.button()}
          </div>
          {page.chosen.float()}
          <div class={styles.list} aria-busy={navigating() ? "true" : "false"}>
            <Show when={held() || made().length}>
              <Made
                title={held() ? t("From your image") : t("From your colors")}
                items={made()}
                picture={
                  <Show when={held()}>
                    {shown => (
                      <Sampler
                        src={shown().src}
                        width={shown().width}
                        height={shown().height}
                        label={t("Your image")}
                        points={shown().points}
                        onMove={(i, x, y) => void picture.move(i, x, y)}
                        onRelease={() => void picture.settle().then(rest)}
                        onReset={
                          picture.moved(shown()) ? () => void picture.reset().then(rest) : undefined
                        }
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
                    )}
                  </Show>
                }
              />
            </Show>
            <ListHeading title={feedTitle()} words={words()} palette={searched()} />
            <Show
              when={!signedOut()}
              fallback={
                <div class={styles.empty}>
                  <Text variant="h3" as="h2">
                    {t("Sign in to see your saved palettes.")}
                  </Text>
                  {signIn("saved")}
                </div>
              }
            >
              <Show when={signInToSearch()}>
                <div class={styles.empty}>
                  <Text variant="h3">{t("No results.")}</Text>
                  <Text variant="body">
                    {t(
                      "Try a color, mood or theme, like navy, cozy or sunset. Or sign in to search in any language."
                    )}
                  </Text>
                  {signIn("search")}
                </div>
                <Show when={offers()?.items.length}>
                  <section class={styles.offer} aria-label={t("Matching collections")}>
                    <div class={styles.row}>
                      <Text variant="h3" as="h2">
                        {t("Matching collections")}
                      </Text>
                      <Show when={offers()!.total > offers()!.items.length}>
                        <Button
                          size="sm"
                          href={localHref(
                            listHref("collections", "popular", DEFAULT_FRAME, params())
                          )}
                        >
                          {t("{count, plural, one {All #} other {All #}}", {
                            count: offers()!.total
                          })}
                        </Button>
                      </Show>
                    </div>
                    <PaletteGrid>
                      <For each={offers()!.items} keyed={false}>
                        {collection => {
                          const path = () => inView(`/${collection().slug}`, params());
                          /* resting on an offered collection asks for it before the press */
                          let asked = "";
                          const intent = () => {
                            if (asked === path()) return;
                            asked = path();
                            preloadHref(router, asked);
                          };
                          return (
                            <div class={styles.cell} onPointerOver={intent} onFocusIn={intent}>
                              <CollectionCard
                                href={localHref(path())}
                                title={collection().title}
                                description={collection().description}
                                palettes={collection().preview.map(preview => {
                                  const drawn = picturedAs(
                                    preview,
                                    params(),
                                    look.draft(),
                                    look.peek()
                                  );
                                  return {
                                    stops: hexesOf(drawn),
                                    style: drawn.style,
                                    angle: drawn.angle
                                  };
                                })}
                                count={collection().itemCount}
                                owner={ownerLabel(collection().owner, isAdmin())}
                                age={relativeAge(collection().updatedAt, now())}
                                private={collection().visibility === "private"}
                              />
                            </div>
                          );
                        }}
                      </For>
                    </PaletteGrid>
                  </section>
                </Show>
              </Show>
              <Loading fallback={<PaletteGridPlaceholder count={params().limit} />}>
                <Show
                  when={standing() || headError()}
                  fallback={<PaletteGridPlaceholder count={params().limit} />}
                >
                  <PaletteFeed
                    items={items()}
                    key={item => item.kseed}
                    live={FIRST_SCREEN}
                    depth={restoring}
                    card={item => (
                      <GalleryCard
                        item={item()}
                        now={now()}
                        readAt={loaded().readAt.get(item().kseed)}
                        at={() => ({
                          position: items().findIndex(entry => entry.kseed === item().kseed)
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
                        lead={curation.presses(item, { view: true, scopes: true })}
                      />
                    )}
                  />
                </Show>
              </Loading>
              <div class={styles.mark} ref={feed.mark} aria-hidden="true" />
              <div class={styles.status}>
                <Status error={!!headError() || !!feed.reason() || !!page.line()?.error}>
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
                <Show when={signInForMore() && !more()}>
                  <Button
                    size="sm"
                    href={page.signIn()}
                    disabled={signInUnavailable()}
                    onClick={() => trackSignInPrompt("search")}
                  >
                    {t("Sign in")}
                  </Button>
                </Show>
                <Show when={pastEnd()}>
                  <Button size="sm" href={localHref(toOrder(order()))}>
                    {t("First page")}
                  </Button>
                </Show>
                {/* a link for readers without scripts; a plain press asks for the page in place */}
                <Show when={more() && !feed.loading() && !feed.reason()}>
                  <Button
                    size="sm"
                    href={nextHref()}
                    onClick={e => inPlace(e, () => void feed.next())}
                  >
                    {t("More palettes")}
                  </Button>
                </Show>
              </div>
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
