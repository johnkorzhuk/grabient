import { localHref, msg, t } from "@grabient/i18n";
import { queryColor, queryColors } from "@grabient/search/colors.ts";
import { BackToTop } from "@grabient/ui/BackToTop.tsx";
import { Button } from "@grabient/ui/Button.tsx";
import { CollectionCard } from "@grabient/ui/CollectionCard.tsx";
import { Fit } from "@grabient/ui/Fit.tsx";
import hidden from "@grabient/ui/hidden.module.css";
import { ListNav, type Order } from "@grabient/ui/ListNav.tsx";
import { PaletteFeed } from "@grabient/ui/PaletteFeed.tsx";
import { PaletteGrid } from "@grabient/ui/PaletteGrid.tsx";
import { PaletteGridPlaceholder } from "@grabient/ui/PalettePlaceholder.tsx";
import { Status } from "@grabient/ui/Status.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { type UndefinedInitialDataOptions, useQuery, useQueryClient } from "@tanstack/solid-query";
import { useElementScrollRestoration, useNavigate, useRouter } from "@tanstack/solid-router";
import {
  createEffect,
  createMemo,
  createSignal,
  deep,
  For,
  isPending,
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
import { useNavigating } from "../../app/navigation.ts";
import { OfflineList } from "../../app/OfflineList.tsx";
import { DEFAULT_FRAME, nextFrame, type RisingFrame } from "../../lib/orders.ts";
import { heading, relTo } from "../../lib/page-meta.ts";
import { hexesOf } from "../../lib/palette.ts";
import { account, isAdmin, loginHref, sessionReady } from "../account/session.ts";
import { onAccountChange } from "../account/state.ts";
import { ownerLabel } from "../collections/drawing.ts";
import { paletteGone } from "../collections/overlay.ts";
import { collectionsQuery } from "../collections/queries.ts";
import { AppearanceContext, inView } from "../list/appearance.ts";
import { createSearchFit } from "../search/fit.ts";
import { PictureSampler } from "../search/PictureSampler.tsx";
import { createPicture } from "../search/picture.ts";
import { selection } from "../selection/selection.ts";
import { createAccountSearch } from "./account.ts";
import { type GalleryPlace, listHref, listIdentity, listSearch, withView } from "./address.ts";
import { createCuration } from "./curate.tsx";
import { madeItems, minuteOf, paintOf, picturedAs, relativeAge } from "./drawing.ts";
import { Find } from "./Find.tsx";
import { createFeed, FIRST_SCREEN, inPlace, joinNext, preloadHref } from "./feed.ts";
import { GalleryCard } from "./GalleryCard.tsx";
import styles from "./gallery.module.css";
import { ListHeading } from "./ListHeading.tsx";
import { Made } from "./Made.tsx";
import { readerOrder, rememberOrder } from "./order.ts";
import { createGalleryPage, GalleryContext } from "./page.tsx";
import { type Failed, failed, framesQuery } from "./queries.ts";
import type { PaletteItem } from "./schema.ts";
import { sortSearch } from "./sort.ts";
import { keptPage, type ListSource, type Page, pageView, readPage } from "./sources.ts";
import { metaPage, searchedName, searchedTitle } from "./titles.ts";

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
/* An order pressed between Saved and the public lists, which are pages of their own: the choice leaves with the page
   it was pressed on, and the page that replaces it gives the focus back to its own. A press in the browser alone. */
let pressed: Order | null = null;

export function Palettes(props: { place: ListPlace }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();
  const go = (href: string, replace = false) => void navigate({ href, replace });
  const restoring = useElementScrollRestoration({ getElement: () => window })?.scrollY;
  const navigating = useNavigating();
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
  const readOwn = (asked: { of: string; from: ListSource | null; page: number }, fresh = false) => {
    const { of, from, page } = asked;
    const at = likes;
    if (!from || !of) return;
    reading = of;
    void readPage(client, from, page, fresh).then(read => {
      if (of !== ownKey()) return;
      if (at !== likes) readOwn(asked, true);
      else setOwn({ of, page: read });
    });
  };
  const asked = () => ({ of: ownKey(), from: source(), page: params().page });
  if (saved) {
    /* a page is read once: a palette unliked here stays where it stood, its heart off, until the next visit */
    createEffect(asked, now => {
      if (now.of !== reading) readOwn(now);
    });
    /* a read waits for the copy's first sync, so that sync's reset is in what it reads */
    onSettled(() =>
      onAccountChange(change => {
        if (!change.reset && change.likes.size) likes++;
      })
    );
  }
  const head = (): Page | Failed | undefined => {
    if (listed) return listed.data;
    const read = own();
    return read && read.of === ownKey() ? read.page : undefined;
  };
  const failure = () => {
    const read = head();
    return read && failed(read) ? read.failed : "";
  };
  /* The last page that stood, while it is the same reader's: a read that fails leaves it on screen beside its reason,
     and no account's page outlives its account. A query's store takes each answer in the place of the one before, a
     failure too, so what stands is a copy. */
  const stood = createMemo((last?: { owner: string; page: Page }) => {
    const read = head();
    if (read && !failed(read)) return { owner: owner(), page: deep(read) };
    return last && last.owner === owner() && !signedOut() ? last : undefined;
  });
  const standing = () => stood()?.page;
  const retry = () => (listed ? void listed.refetch() : readOwn(asked(), true));
  /* a public list that could not be read with no connection says so in its place, and is read as the connection
     returns; Saved is the account's copy's to answer */
  const unread = createOfflineList({
    failed: () => !!listed && !!failure(),
    readAt: () => listed?.dataUpdatedAt ?? 0,
    read: retry
  });
  const headError = () => (unread() ? "" : failure());

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
     which are open to everyone. They are read through the cache, so Back finds them drawn and the page returns to its
     depth; while they are on their way the page stands without them. */
  const unsigned = () => !saved && !!words() && sessionReady() && account() === null;
  const signInToSearch = () => unsigned() && standing()?.tier === "account";
  const signInForMore = () => unsigned() && !!standing()?.partial && standing()?.tier !== "account";
  const matching = useQuery(() => ({
    ...collectionsQuery({ sort: "popular", query: words(), page: 1, limit: OFFER_ASKED }),
    enabled: signInToSearch(),
    placeholderData: (): Failed => ({ failed: "" })
  }));
  const offers = () => {
    const read = matching.data;
    return read && !failed(read) && signInToSearch()
      ? { items: read.items.slice(0, OFFER_SHOWN), total: read.total }
      : null;
  };

  /* every palette a search answers carries thumbs named for its words, or for the palette it is by */
  const fits = createSearchFit({
    query: () => (saved ? "" : words()),
    account: () => (sessionReady() ? (account()?.id ?? null) : undefined),
    signIn: () => {
      go(page.signIn());
    },
    fail: page.say,
    offline,
    named: asked => searchedName(asked) ?? asked
  });
  /* none on Saved: every palette there is the account's own like, which curation never changes */
  const curation = saved
    ? null
    : createCuration({ seeds: () => items().map(item => item.kseed), say: page.say });

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
  /* the picture's points search again in place: the reader stays at the depth they were editing at */
  const searchPoints = (colors: string | null) => {
    if (colors && colors !== words())
      void navigate({ href: searchHref(colors), replace: true, resetScroll: false });
  };
  /* a search by colors leads with the palettes the colors make, a picture's as its points move */
  const made = createMemo(() =>
    saved ? [] : madeItems(held()?.points.map(point => point.hex) ?? queryColors(words()))
  );

  const now = () => minuteOf(standing()?.fetchedAt ?? 0);
  const pastEnd = () => {
    const read = standing();
    return !answered() && !!read && params().page > Math.max(1, read.totalPages);
  };
  /* a palette searched by stands in the title as the card it would be, leading to its page */
  const searched = createMemo(() =>
    searchedTitle(words(), made(), params(), look.draft(), look.peek())
  );
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
  /* The cards standing while their list is read: another list, or this one again once it is old. Until the read lands,
     the query holds its data and every line that reads it, so this is said first, from the read on its way alone. */
  const updating = () => navigating() || (!!listed && isPending(() => listed.data));
  /* a signed-out search whose words need an account: the block over the grid says No results, and the line says it
     unseen, where a screen reader hears what a search found */
  const said = () => (signInToSearch() ? <span class={hidden.text}>{t("No results.")}</span> : "");
  /* the placeholders say a cold list is on its way; the line speaks only for what the cards cannot */
  const message = () =>
    (updating() ? t("Updating…") : "") ||
    headError() ||
    feed.reason() ||
    page.line()?.message ||
    (feed.loading() ? t("Loading more…") : "") ||
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
      return go(loginHref(target));
    }
    if ((to === "saved") !== saved) pressed = to;
    go(target);
  };
  let row!: HTMLDivElement;
  onSettled(() => {
    const was = pressed;
    pressed = null;
    const at = document.activeElement;
    // the row's last chosen choice is its order's, after its section's
    if (was === order() && (!at || at === document.body || at.id === "main"))
      [...row.querySelectorAll<HTMLElement>('[aria-current="page"]')].at(-1)?.focus();
  });
  const nextHref = () => {
    const last = feed.joined().at(-1) ?? standing();
    return localHref(
      toOrder(order()).split("?")[0]! +
        listSearch(params(), { page: (last?.page ?? params().page) + 1, selection: false })
    );
  };
  /* the way in */
  const signIn = () => (
    <Button variant="primary" size="lg" href={page.signIn()} disabled={signInUnavailable()}>
      {t("Sign in")}
    </Button>
  );

  return (
    <GalleryContext value={page}>
      <AppPage feed floats bare={page.chosen.open()}>
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
          <div class={styles.row} ref={row}>
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
              rel={relTo}
            />
            {page.chosen.button()}
          </div>
          {page.chosen.float()}
          <div class={styles.list} aria-busy={updating() ? "true" : "false"}>
            <Show when={held() || made().length}>
              <Made
                title={t(held() ? msg("From your image") : msg("From your colors"))}
                items={made()}
                picture={
                  <Show when={held()}>
                    {shown => (
                      <PictureSampler picture={picture} shown={shown()} search={searchPoints} />
                    )}
                  </Show>
                }
              />
            </Show>
            <ListHeading
              title={feedTitle()}
              words={words()}
              palette={searched()}
              color={saved ? null : queryColor(words())}
            />
            <Show
              when={!signedOut()}
              fallback={
                <div class={styles.empty}>
                  <Text variant="h3" as="h2">
                    {t("Sign in to see your saved palettes.")}
                  </Text>
                  {signIn()}
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
                  {signIn()}
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
                          rel={relTo(
                            localHref(listHref("collections", "popular", DEFAULT_FRAME, params()))
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
                  fallback={
                    unread() ? (
                      <OfflineList ways={["palettes"]} />
                    ) : (
                      <PaletteGridPlaceholder count={params().limit} />
                    )
                  }
                >
                  <PaletteFeed
                    items={items()}
                    key={item => item.kseed}
                    live={FIRST_SCREEN}
                    still={!account() && !selection().length}
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
                        lead={curation?.presses(item, { view: true, scopes: true })}
                      />
                    )}
                  />
                </Show>
              </Loading>
              <div class={styles.mark} ref={feed.mark} aria-hidden="true" />
              <div class={styles.status}>
                <Status error={!!headError() || !!feed.reason() || !!page.line()?.error}>
                  {message() || said()}
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
                  <Button size="sm" href={page.signIn()} disabled={signInUnavailable()}>
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
                    onClick={e =>
                      inPlace(e, () => void joinNext(() => feed.next(), "main article"))
                    }
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
