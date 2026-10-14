import { decodePalette } from "@grabient/engine";
import { sampleStops } from "@grabient/engine/curve.ts";
import { seedName } from "@grabient/engine/name.ts";
import { DEFAULT_SIZE } from "@grabient/engine/view.ts";
import { locale, localHref, msg, t } from "@grabient/i18n";
import { CollectionGroup, CollectionGroupPlaceholder } from "@grabient/ui/CollectionGroup.tsx";
import { type Format, FormatStrip, SWATCH_CHIPS } from "@grabient/ui/FormatStrip.tsx";
import { PaletteCard } from "@grabient/ui/PaletteCard.tsx";
import { PaletteSheet } from "@grabient/ui/PaletteSheet.tsx";
import { Segmented } from "@grabient/ui/Segmented.tsx";
import { SolidPane } from "@grabient/ui/SolidPane.tsx";
import { useQueryClient } from "@tanstack/solid-query";
import { useRouter } from "@tanstack/solid-router";
import {
  createEffect,
  createMemo,
  createSignal,
  type Element,
  Loading,
  lazy,
  onSettled,
  Show,
  untrack
} from "solid-js";
import { signInUnavailable, unreachable } from "../../app/connection.ts";
import { SiteFooter } from "../../app/Frames.tsx";
import { toast } from "../../app/toast.ts";
import { DEFAULT_FRAME, framePath, nextFrame, type RisingFrame } from "../../lib/orders.ts";
import { heading } from "../../lib/page-meta.ts";
import { type Drawn, hexesOf } from "../../lib/palette.ts";
import { likeCount, liked, noteCounts, readLikeCounts, toggleLike } from "../account/likes.ts";
import { account, shownError } from "../account/session.ts";
import { accountView } from "../account/state.ts";
import { collectionHref } from "../collections/address.ts";
import { relativeAge } from "../gallery/drawing.ts";
import { inPlace } from "../gallery/feed.ts";
import { framesQuery } from "../gallery/queries.ts";
import { sortSearch } from "../gallery/sort.ts";
import { drawnIn, type ListView, viewParams } from "../list/appearance.ts";
import { useOpened, useTaken } from "../palette-use/use.ts";
import { roomNote, selected, toggle } from "../selection/selection.ts";
import { openedFrom, seedAddress } from "./address.ts";
import { codeSources } from "./code.ts";
import type { PaletteEditor } from "./editor.ts";
import {
  copyContrast,
  copyFormat,
  copyLink,
  NO_IMAGE_CLIPBOARD,
  STRIP_COPY,
  STRIP_FILES,
  saveContrast,
  saveFormat,
  type Taken
} from "./formats.ts";
import { keepOrder, keptOrder, type SimilarOrder } from "./order.ts";
import type { PaletteData } from "./page.ts";
import type { Rest } from "./rest.ts";
import { type Similar, similarQuery } from "./similar.ts";

/* The editor's sheet: the palette's name, the collections that hold it, which of its colors read on which and on the
   reader's own text colors, its path through the color solid, the palette as text, and the palettes like it. All but
   the last two are read from the palette, in the browser, and the reader's own collections from the account's copy.
   The palettes like it, and the public collections the answer names, are asked for only while the sheet has a good
   part of the window and the palette has rested: a palette opened and edited on the first screen asks the server
   nothing however many edits it takes. */

/* Rising's frames as its press says them: short after its name, in full to a reader who listens. The lists' row says
   the same (the design system's ListNav), which is a component and would bring its styles with it. */
const FRAMES: Readonly<Record<RisingFrame, { short: string; name: string }>> = {
  "1w": { short: msg("1w", "frame"), name: msg("Rising, 1 week") },
  "3m": { short: msg("3m", "frame"), name: msg("Rising, 3 months") },
  "1y": { short: msg("1y", "frame"), name: msg("Rising, 1 year") }
};
/* how many of the palettes like this one are drawn */
const SHOWN = 12;
/* the sheet has the window's lower two fifths: the reader has left the first screen for it */
const LOWER = 0.4;
const CONTRAST: Format[] = ["svg", "png"];
const INKS_KEY = "grabient-contrast-inks";
const INKS_MAX = 12;
/* where a palette taken from one of these cards was taken, for the counts */
const PLACE = { surface: "editor" } as const;

type Item = Similar["items"][number];
type Holding = typeof import("./Collect.tsx").ownHolding;
/* a signed-out reader who selects nothing loads none of the account's collections */
const AddToCollection = lazy(() =>
  import("./Collect.tsx").then(m => ({ default: m.AddToCollection }))
);

/** The reader's own text colors for the contrast grid, kept in this browser, written once they rest. */
function createInks() {
  const [inks, setInks] = createSignal<string[]>([]);
  onSettled(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(INKS_KEY) ?? "[]");
      if (Array.isArray(raw))
        setInks(
          [
            ...new Set(
              raw.filter((h): h is string => typeof h === "string" && /^#[0-9a-f]{6}$/.test(h))
            )
          ].slice(0, INKS_MAX)
        );
    } catch {
      /* none kept */
    }
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const write = (next: string[]) => {
    setInks(next);
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        if (next.length) localStorage.setItem(INKS_KEY, JSON.stringify(next));
        else localStorage.removeItem(INKS_KEY);
      } catch {
        /* a browser that keeps no site data: they last as long as the page */
      }
    }, 300);
  };
  return [inks, write] as const;
}

/** A copy that says why it could not be made, in the reader's words; true when it was. */
const copied = (work: Promise<void>): Promise<boolean> =>
  work.then(
    () => true,
    (reason: unknown) => {
      toast(
        reason instanceof Error && reason.message === NO_IMAGE_CLIPBOARD
          ? t("Images can't be copied here.")
          : t("Couldn't copy the palette.")
      );
      return false;
    }
  );

export function Sheet(props: {
  editor: PaletteEditor;
  rest: Rest;
  facts: () => PaletteData["facts"];
  /** Rising's frames as the server told this document, where it drew the page */
  frames: PaletteData["frames"];
  heading: () => string | undefined;
  opened: () => string;
  taken: () => Taken;
  used: (action: "copy" | "download", format: string) => void;
  actions: Element;
  /** the way into the selection, at the end of the row of palettes like this one */
  selection: Element;
  resting: boolean;
  clear: boolean;
  onBand: (height: number) => void;
}) {
  const e = untrack(() => props.editor);
  const rest = untrack(() => props.rest);
  const queries = useQueryClient();
  const router = useRouter();
  let sheet!: HTMLElement;
  const [inks, setInks] = createInks();
  const view = () => ({ style: e.style(), steps: e.steps(), angle: e.angle() });
  /* the figures under the sheet's head come a task after it: neither is on the first screen, and a phone answers
     between the two */
  const [figured, setFigured] = createSignal(false);
  onSettled(() => {
    const timer = setTimeout(() => setFigured(true), 0);
    return () => clearTimeout(timer);
  });

  /* the palettes like this one: the answer read last, or one the browser keeps, so a palette an undo or Back returns
     to shows its palettes at once */
  const [inView, setInView] = createSignal(false);
  onSettled(() => {
    const seen = new IntersectionObserver(
      entries => setInView(entries[entries.length - 1].isIntersecting),
      { rootMargin: `0px 0px -${LOWER * 100}% 0px` }
    );
    seen.observe(sheet);
    return () => seen.disconnect();
  });
  const [answered, setAnswered] = createSignal<{ seed: string; answer: Similar } | null>(null);
  const [failed, setFailed] = createSignal<string | null>(null);
  const answer = createMemo((): Similar | null => {
    const seed = e.seed();
    const got = answered();
    if (got?.seed === seed) return got.answer;
    return queries.getQueryData(similarQuery(seed, locale()).queryKey) ?? null;
  });
  createEffect(
    () => [inView(), e.seed()] as const,
    ([inside, seed]) => {
      if (!inside) return;
      const options = similarQuery(seed, locale());
      /* a fresh answer the browser keeps is no ask: it neither waits nor lengthens the next wait */
      const kept = queries.getQueryState(options.queryKey);
      if (kept?.data && Date.now() - kept.dataUpdatedAt < 5 * 60_000) return;
      setFailed(null);
      rest.is(seed);
      const timer = setTimeout(() => {
        /* a palette opened from a card here lands on its first screen before the observer says the sheet left */
        if (sheet.getBoundingClientRect().top > innerHeight * (1 - LOWER)) return;
        rest.asked(seed);
        queries.fetchQuery(options).then(
          got => setAnswered({ seed, answer: got }),
          () => setFailed(seed)
        );
      }, rest.left());
      return () => {
        clearTimeout(timer);
        void queries.cancelQueries({ queryKey: options.queryKey });
      };
    }
  );

  /* The order is the reader's, the one the lists are in, kept for the tab: the most liked first, or the rising in a
     frame. Rising's frames are the ones an admin has left on: the document's own where the server drew this page, a
     list's where the reader came from one, and otherwise asked for once the sheet is in the window. Rising pressed
     while it is the order moves to the next of them. The answer holds every palette like this one, so an order sorts
     what the page holds and asks nothing. */
  const [order, setOrder] = createSignal(keptOrder());
  const told = untrack(() => props.frames);
  if (told && !queries.getQueryData(framesQuery().queryKey))
    queries.setQueryData(framesQuery().queryKey, [...told]);
  const [offered, setOffered] = createSignal<readonly RisingFrame[]>(
    queries.getQueryData(framesQuery().queryKey) ?? [DEFAULT_FRAME]
  );
  createEffect(inView, seen => {
    if (seen && !queries.getQueryData(framesQuery().queryKey))
      void queries.fetchQuery(framesQuery()).then(setOffered, () => {
        /* the week's frame stands */
      });
  });
  const frame = () => {
    const kept = order().frame;
    return offered().includes(kept) ? kept : DEFAULT_FRAME;
  };
  const pickOrder = (next: string) => {
    const now = order();
    const picked: SimilarOrder =
      next !== "rising"
        ? { ...now, sort: "popular" }
        : now.sort !== "rising"
          ? { ...now, sort: "rising" }
          : { sort: "rising", frame: nextFrame(frame(), offered()) };
    setOrder(picked);
    keepOrder(picked);
  };
  /* Rising's name and a frame's short one, as the lists' own row says them */
  const rising = () => t("Rising", { $context: "order" });
  const short = (f: RisingFrame) => t(FRAMES[f].short, { $context: "frame" });
  const like = createMemo(() => {
    const got = answer();
    return got
      ? sortSearch(
          got.items.filter(item => item.kseed !== e.seed()),
          order().sort,
          frame()
        ).slice(0, SHOWN)
      : null;
  });
  /* the counts beside the cards' hearts keep the age of the answer that brought them, and the old ones are asked for
     again only while the cards are in the window */
  createEffect(
    () => (inView() ? like() : null),
    items => {
      if (!items?.length) return;
      noteCounts(
        items.map(item => ({ seed: item.kseed, likes: item.likes })),
        untrack(answer)?.fetchedAt
      );
      void readLikeCounts(items.map(item => item.kseed)).catch(() => {});
    }
  );

  /* The collections that hold the palette: the reader's own first, private ones too, from the account's copy, which
     knows what each holds, so a pick in Add to collection shows here at once. Then the public ones, each once: the
     server's, where it sent the page for this palette, else the answer's. A collection's page needs the server, so
     with no connection its link stays in its place and leads nowhere; the account's own opens from the copy. */
  const [holding, setHolding] = createSignal<Holding | null>(null);
  createEffect(
    () => !!account(),
    signedIn => {
      if (signedIn) void import("./Collect.tsx").then(m => setHolding(() => m.ownHolding));
    }
  );
  const own = createMemo(() => {
    accountView();
    return holding()?.(e.seed()) ?? [];
  });
  const collections = () => {
    const mine = own();
    const held: readonly { slug: string; title: string; colors?: readonly string[] }[] =
      props.facts()?.heldBy ?? answer()?.heldBy ?? [];
    return [...mine, ...held.filter(c => !mine.some(m => m.slug === c.slug))].map(c => {
      const href = collectionHref(c.slug);
      return { title: c.title, href: unreachable(href) ? undefined : href, colors: c.colors };
    });
  };
  /* What the reader set on this page (a style, steps or an angle) goes for every palette drawn here, as a list's
     choice goes for its cards; otherwise each is drawn as it was saved. The stage's size goes with every link. */
  const listed = (): ListView => {
    const set = e.opened().set;
    return {
      style: set.style ? e.style() : "auto",
      steps: set.steps ? e.steps() : "auto",
      angle: set.angle ? e.angle() : "auto",
      size: e.size()
    };
  };
  const likeHref = () => {
    const query = new URLSearchParams({ q: e.seed() });
    for (const [name, value] of Object.entries(viewParams(listed())))
      if (value !== undefined) query.set(name, String(value));
    const list = order().sort === "rising" ? framePath("/palettes/rising", frame()) : "/palettes";
    return `${list}?${query}`;
  };
  const title = () =>
    props.heading() ||
    heading({
      kind: "palette",
      seed: e.seed(),
      palette: e.palette(),
      view: view(),
      ...(props.facts()?.written ? { written: props.facts()?.written } : {})
    }) ||
    t("Palette editor");

  /* the clock the cards' ages are told against */
  const now = Date.now();
  /** One of the palettes like this one, as a list's card: liked, selected, collected, taken and opened from here. */
  const card = (item: () => Item, position: number) => {
    const palette = createMemo(() => drawnIn(itemDrawn(item()), listed()));
    const seed = () => item().kseed;
    const address = () => seedAddress({ seed: seed(), view: { ...palette(), size: e.size() } });
    /* a card's pictures are the stage's size once the reader set one, and its files' addresses name it */
    const taken = (): Taken => {
      const decoded = decodePalette(seed());
      return {
        ...palette(),
        size: e.size(),
        pixels: e.size() ? props.taken().pixels : DEFAULT_SIZE,
        stops: decoded ? sampleStops(decoded, palette().steps) : []
      };
    };
    const count = (action: "copy" | "download", format: string) =>
      useTaken(action, format, PLACE, [palette()], { position });
    /* where no picture can go on the clipboard, the file is saved instead */
    const copy = (f: Format) =>
      copyFormat(f, taken()).then(
        () => {
          count("copy", f);
          return true;
        },
        (reason: unknown) => {
          if (f !== "png" || !(reason instanceof Error) || reason.message !== NO_IMAGE_CLIPBOARD)
            return copied(Promise.reject(reason));
          return saveFormat(f, taken()).then(
            () => {
              toast(t("Images can't be copied here, so the file was downloaded."));
              count("download", f);
              return false;
            },
            () => copied(Promise.reject(reason))
          );
        }
      );
    return (
      <PaletteCard
        seed={seed()}
        name={
          seedName(seed(), palette().style, palette().steps, { t, locale: locale() }) ||
          t("Palette")
        }
        stops={hexesOf(palette())}
        style={palette().style}
        angle={palette().angle}
        href={localHref(address())}
        age={relativeAge(item().createdAt, now)}
        likes={likeCount(seed(), item().likes)}
        liked={liked(seed())}
        likeDisabled={signInUnavailable()}
        onLike={() => {
          const { seed: _, ...shown } = palette();
          toggleLike(seed(), !liked(seed()), { view: shown }).catch((reason: unknown) =>
            toast(shownError(reason, msg("Couldn't save.")))
          );
        }}
        selected={selected(palette())}
        onSelect={() => {
          if (toggle(palette()) === "made room") toast(roomNote(1));
        }}
        collect={
          <Loading>
            <AddToCollection palette={palette} />
          </Loading>
        }
        onOpen={event => {
          useOpened(PLACE, palette(), { position });
          /* opened in place, the palette's page is told its own view and which parts were set here */
          inPlace(event, () => {
            const handed = openedFrom(itemDrawn(item()), listed());
            void router.navigate({ href: address(), ...(handed ? { state: handed } : {}) });
          });
        }}
        tools={() => (
          <FormatStrip
            size="sm"
            variant="art"
            copy={STRIP_COPY}
            download={STRIP_FILES}
            swatches={SWATCH_CHIPS}
            link={STRIP_FILES}
            onCopy={copy}
            onDownload={f =>
              void saveFormat(f, taken()).then(
                () => count("download", f),
                () => toast(t("Couldn't download the file."))
              )
            }
            onLink={f =>
              copied(copyLink(f, taken())).then(done => {
                if (done) count("copy", `link:${f}`);
                return done;
              })
            }
          />
        )}
      />
    );
  };
  return (
    <PaletteSheet
      ref={el => {
        sheet = el;
      }}
      title={title()}
      onBand={props.onBand}
      clear={props.clear}
      resting={props.resting}
      actions={props.actions}
      selection={props.selection}
      collections={collections()}
      order={
        <Segmented
          aria-label={t("Order")}
          value={order().sort}
          options={[
            { value: "popular", label: t("Popular", { $context: "order" }) },
            {
              value: "rising",
              label: rising(),
              /* its name starts with the words it shows, then says the frame in full */
              ...(offered().length > 1
                ? {
                    detail: short(frame()),
                    forms: offered().map(short),
                    name: `${rising()} ${short(frame())}, ${t(FRAMES[frame()].name)}`
                  }
                : {})
            }
          ]}
          onChange={pickOrder}
        />
      }
      sources={codeSources(
        e.palette(),
        view(),
        e.seed(),
        () => ({ facts: props.facts(), opened: props.opened() === e.seed() }),
        rest
      )}
      onCopy={(id, _text, spelling) =>
        props.used("copy", spelling ? `code:${id}:${spelling}` : `code:${id}`)
      }
      colors={figured() ? e.stops() : []}
      contrastCopies={
        <FormatStrip
          size="sm"
          variant="paper"
          copy={CONTRAST}
          download={CONTRAST}
          onCopy={f =>
            copied(copyContrast(f, props.taken(), inks())).then(done => {
              if (done) props.used("copy", `contrast:${f}`);
              return done;
            })
          }
          onDownload={f =>
            void saveContrast(f, props.taken(), inks()).then(
              () => props.used("download", `contrast:${f}`),
              () => toast(t("Couldn't download the file."))
            )
          }
        />
      }
      inks={inks()}
      onInks={setInks}
      solid={
        figured() && (
          <SolidPane
            palette={e.shownPalette()}
            wide={e.wide()}
            steps={e.steps()}
            stepped={e.style().endsWith("Swatches")}
            selection={e.held()}
            onSelect={e.pick}
            onSweep={e.sweep}
            onHover={e.setReading}
            seed={e.seed()}
            style={e.style()}
            angle={e.angle()}
            onTake={(action, f) => props.used(action, `space:${f}`)}
          />
        )
      }
      foot={<SiteFooter />}
    >
      <Show
        when={like()}
        fallback={
          <Show when={inView() && failed() !== e.seed()}>
            <CollectionGroupPlaceholder count={SHOWN} />
          </Show>
        }
      >
        {list => (
          <Show when={list().length}>
            <CollectionGroup
              title={t("Similar palettes")}
              href={unreachable(likeHref()) ? undefined : localHref(likeHref())}
              palettes={list()}
              card={card}
              whole
            />
          </Show>
        )}
      </Show>
    </PaletteSheet>
  );
}

/** A palette of the answer as it was saved. */
const itemDrawn = (item: Item): Drawn => ({
  seed: item.kseed,
  style: item.style,
  steps: item.steps,
  angle: item.angle
});
