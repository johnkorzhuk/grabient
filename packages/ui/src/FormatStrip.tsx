import { type Component, createMemo, createSignal, For, Show, untrack } from "solid-js";
import { announce } from "./announce.ts";
import { createDone } from "./done.ts";
import styles from "./FormatStrip.module.css";
import { Icon, type IconName } from "./Icon.tsx";
import { msg, t } from "./i18n.ts";
import { openSwatches, swatchesOpen } from "./swatch-book.ts";
import { tooltip } from "./Tooltip.tsx";

/* The copies, the downloads and the links as one strip: first the mode, its glyph alone, which a press turns from
   copying to downloading to links and back, with a dot for each mode over it while the pointer or the keyboard is on
   it; then a chip per format, an icon and its name, on a card's strip its name alone; and at the end the swatch book,
   which opens the swatch files the mode takes in the formats' place and turns to Back. A format keeps its place in
   every mode (placesOf) and each chip holds the names its place can take, so as the mode turns nothing moves but what
   changes; it is named for what it does (Copy CSS, Download PNG). A chip confirms on itself: its icon, or a name alone,
   is a check for a moment. The formats' names are their own, never translated. A strip with less room than its chips
   take gives up their padding evenly, then scrolls the formats sideways between the mode and the book, so no chip ever
   runs over another. A download made as it is asked for (an effect's MP4) is drawn by its page while it is made, its
   icon saying how far along it is, its tooltip that and what a press does now, and its name only what a press does,
   so a screen reader is not told each step; it is checked once the file is handed over. The strip runs the way of the
   place it stands in. */
export type Format =
  | "css"
  | "svg"
  | "png"
  | "jpeg"
  | "url"
  | "json"
  | "js"
  | "html"
  | "md"
  | "mp4"
  | "ase"
  | "gpl"
  | "grd"
  | "tokens"
  | "figma";
/** What a chip does: copies its format, saves it as a file, or copies the address the site serves it at. */
export type StripMode = "copy" | "download" | "link";
/** A palette's swatch files by mode: the two that are text copy, all four save and link. */
export const SWATCH_CHIPS: Readonly<Record<StripMode, readonly Format[]>> = {
  copy: ["tokens", "gpl"],
  download: ["ase", "grd", "tokens", "gpl"],
  link: ["ase", "grd", "tokens", "gpl"]
};
const ICON: Readonly<Record<Format, IconName>> = {
  css: "code",
  svg: "vector",
  png: "image",
  jpeg: "image",
  url: "link",
  json: "braces",
  js: "braces",
  html: "codeXml",
  md: "fileText",
  mp4: "film",
  ase: "swatchGrid",
  gpl: "palette",
  grd: "rainbow",
  tokens: "cube",
  figma: "figma"
};
const LABEL: Readonly<Record<Format, string>> = {
  css: "CSS",
  svg: "SVG",
  png: "PNG",
  jpeg: "JPEG",
  url: "URL",
  json: "JSON",
  js: "JS",
  html: "HTML",
  md: "MD",
  mp4: "MP4",
  ase: "ASE",
  gpl: "GPL",
  grd: "GRD",
  tokens: "Tokens",
  figma: "Figma"
};
/** A format's name on its chip, its own in every language. */
export const formatName = (f: Format): string => LABEL[f];
const MODES: readonly StripMode[] = ["copy", "download", "link"];
const MODE_ICON: Readonly<Record<StripMode, IconName>> = {
  copy: "copy",
  download: "download",
  link: "link"
};
const GROUP: Readonly<Record<StripMode, string>> = {
  copy: msg("Copy"),
  download: msg("Download"),
  link: msg("Copy link")
};
const CHIP: Readonly<Record<StripMode, string>> = {
  copy: msg("Copy {format}"),
  download: msg("Download {format}"),
  link: msg("Copy {format} link")
};
/* a chip named for where its copy goes rather than what it is: Figma takes its layers off the clipboard */
const CHIP_FOR: Readonly<Partial<Record<Format, string>>> = { figma: msg("Copy for {format}") };
const chipOf = (f: Format, mode: StripMode) => (mode === "copy" && CHIP_FOR[f]) || CHIP[mode];
/* what the strip does now and what a press on the mode turns it to: one without downloads turns from copying to links */
const TURN: Readonly<Record<StripMode, Partial<Record<StripMode, string>>>> = {
  copy: { download: msg("Copying. Switch to download"), link: msg("Copying. Switch to links") },
  download: { link: msg("Downloading. Switch to links"), copy: msg("Downloading. Switch to copy") },
  link: { copy: msg("Copying links. Switch to copy") }
};

/* every strip on the page is one strip: a turn of one turns them all, and the swatch files open on all that have them
   (swatch-book.ts), for as long as the page is open. Only a press writes these, so the server, which never presses,
   draws Copy */
const [sharedMode, shareMode] = createSignal<StripMode>("copy");
/** The mode every strip is in, for a place that names it; a strip that lacks it shows Copy. */
export const stripMode = (): StripMode => sharedMode();

/** The places a layer's chips stand in, the same in every mode, so a format keeps its place as the mode turns. Two
    formats no mode shows together may share a place; a mode without a place's format leaves it empty. Each list is
    read in order, a format taking the first place after the last one it took that holds it, or holds nothing shown
    with it. */
export function placesOf(lists: readonly (readonly Format[])[]): Format[][] {
  const places: Format[][] = [];
  const together = (a: Format, b: Format) =>
    lists.some(list => list.includes(a) && list.includes(b));
  for (const list of lists) {
    let at = -1;
    for (const f of list) {
      let i = places.findIndex((place, j) => j > at && place.includes(f));
      if (i < 0) {
        i = places.findIndex((place, j) => j > at && place.every(g => !together(g, f)));
        if (i < 0) {
          i = at + 1;
          places.splice(i, 0, [f]);
        } else places[i].push(f);
      }
      at = i;
    }
  }
  return places;
}

const samePlaces = (a: readonly (readonly Format[])[], b: readonly (readonly Format[])[]) =>
  a.length === b.length &&
  a.every((place, i) => place.length === b[i].length && place.every((f, j) => f === b[i][j]));

/** A download being made, as its page shows it on its chip: how far along it is, 0 to 1, drawn by `Icon` in the chip's
    icon's place (MakingIcon.tsx); the chip's name, which says what a press does now and stays as it is until the file
    is made; and its tooltip, which says how far along it is besides. */
export interface StripMaking {
  format: Format;
  done: number;
  name: string;
  label: string;
  Icon: Component<{ done: number; size: number }>;
}

export interface FormatStripProps {
  /** the formats that can be copied, in order */
  copy: readonly Format[];
  download?: readonly Format[];
  /** the swatch files each mode takes, behind the swatch book at the strip's end */
  swatches?: Partial<Record<StripMode, readonly Format[]>>;
  /** the formats whose addresses can be copied: the files the site serves at the palette's address */
  link?: readonly Format[];
  /** a copy answers whether it happened: false shows no check; nothing is taken at its word */
  onCopy?: (format: Format) => unknown;
  /** answers as onCopy does, once the file is handed over: a download made as it is asked for shows its check then */
  onDownload?: (format: Format) => unknown;
  /** a download still being made, shown on its chip in the downloads; a press on it is onDownload's to answer */
  making?: StripMaking;
  /** answers as onCopy does */
  onLink?: (format: Format) => unknown;
  /** sm 28px over a card (with the art variant, each format's chip its name alone), md 32px among controls, lg 40px on
      the stage and in the export */
  size?: "sm" | "md" | "lg";
  variant?: "art" | "paper";
  /** stretched to the row, the chips sharing it */
  full?: boolean;
  onMode?: (mode: StripMode) => void;
}

export function FormatStrip(props: FormatStripProps) {
  const listOf = (m: StripMode) =>
    m === "download" ? (props.download ?? []) : m === "link" ? (props.link ?? []) : props.copy;
  const swatchesOf = (m: StripMode) => props.swatches?.[m] ?? [];
  /* copying, then each mode that has formats or swatch files */
  const modes = () =>
    MODES.filter(m => m === "copy" || listOf(m).length > 0 || swatchesOf(m).length > 0);
  const mode = () => (modes().includes(sharedMode()) ? sharedMode() : "copy");
  const next = () => {
    const all = modes();
    return all[(all.indexOf(mode()) + 1) % all.length];
  };
  const swatched = () => modes().some(m => swatchesOf(m).length > 0);
  /* the swatch files stay open as the mode turns; the formats come back with Back */
  const swatching = () => swatchesOpen() && swatchesOf(mode()).length > 0;
  const formats = () => (swatching() ? swatchesOf(mode()) : listOf(mode()));
  /* the places as they stood while the formats are the same, so a page that hands the strip its lists anew draws
     nothing anew */
  const formatPlaces = createMemo(() => placesOf(modes().map(listOf)), { equals: samePlaces });
  const swatchPlaces = createMemo(
    () => placesOf(modes().map(m => (swatchesOf(m).length > 0 ? swatchesOf(m) : listOf(m)))),
    { equals: samePlaces }
  );
  const places = () => (swatchesOpen() && swatched() ? swatchPlaces() : formatPlaces());
  /* each layer drawn unseen keeps the strip at the wider one's width; chips that share the row need none */
  const layers = () =>
    props.full ? [] : swatched() ? [formatPlaces(), swatchPlaces()] : [formatPlaces()];
  const turns = () => modes().length > 1;
  const turn = () => t(TURN[mode()][next()] ?? "");
  const book = () => t(swatching() ? msg("Back") : msg("Swatches"));
  const [done, mark] = createDone<Format>();
  /* a download being made, on its chip in the downloads alone */
  const making = (f: Format) =>
    mode() === "download" && props.making?.format === f ? props.making : undefined;
  /* a chip's name says what a press does now, the same while its download is made; its tooltip says how far along */
  const chipName = (f: Format) => t(chipOf(f, mode()), { format: LABEL[f] });
  const label = (f: Format) => making(f)?.name ?? chipName(f);
  const tipText = (f: Format) => making(f)?.label ?? chipName(f);
  /* a reader who listens hears a copy as a reader who looks sees its check, once it is so; a download is checked once
     its file is handed over, if the strip still downloads */
  const act = async (f: Format) => {
    const m = mode();
    if (m === "download") {
      if ((await props.onDownload?.(f)) === false) return;
      if (mode() === m) mark(f);
      return;
    }
    if ((await (m === "link" ? props.onLink : props.onCopy)?.(f)) === false) return;
    mark(f);
    announce(t("Copied"));
  };
  const glyph = () => (props.size === "lg" ? 14 : 13);
  /* over a card each format's chip is its name alone, where an icon before every name made the row too dense to read;
     the mode and the swatch book, which have no name, keep their glyphs */
  const named = untrack(() => (props.size ?? "sm") === "sm" && (props.variant ?? "art") === "art");
  /* the icon before a format's name, on every strip but a card's */
  const icon = (f: Format) => (named ? null : <Icon name={ICON[f]} size={glyph()} />);
  const tipMode = tooltip(turn, { turns: true });
  const tipBook = tooltip(book, { turns: true });
  /* a chip's name, holding the names of the other formats its place takes so its width never changes; after an icon,
     with the space before it */
  const name = (f: Format, place: readonly Format[]) => {
    const others = place.filter(g => g !== f).map(g => LABEL[g]);
    return (
      <span class={styles.name} data-a={others[0] ?? LABEL[f]} data-b={others[1] ?? LABEL[f]}>
        <span class={styles.word}>{named ? LABEL[f] : ` ${LABEL[f]}`}</span>
      </span>
    );
  };
  return (
    /* biome-ignore lint/a11y/useSemanticElements: a row of presses named by what they do now, which a fieldset would box */
    <span
      class={styles.strip}
      data-size={props.size ?? "sm"}
      data-variant={props.variant ?? "art"}
      data-full={props.full ? "" : undefined}
      data-named={named ? "" : undefined}
      role="group"
      aria-label={t(GROUP[mode()])}
    >
      <For each={layers()} keyed={false}>
        {layer => (
          <span class={styles.row} data-unseen="" aria-hidden="true">
            <Show when={turns()}>
              <span class={styles.chip} data-mode="">
                <Icon name="copy" size={glyph()} />
              </span>
            </Show>
            <For each={layer()} keyed={false}>
              {place => (
                <span class={styles.chip}>
                  {icon(place()[0])}
                  {name(place()[0], place())}
                </span>
              )}
            </For>
            <Show when={swatched()}>
              <span class={styles.chip} data-square="">
                <Icon name="swatches" size={glyph()} />
              </span>
            </Show>
          </span>
        )}
      </For>
      <span class={styles.row}>
        <Show when={turns()}>
          <button
            ref={tipMode}
            type="button"
            class={styles.chip}
            data-mode=""
            aria-label={turn()}
            onClick={() => {
              const to = next();
              shareMode(to);
              props.onMode?.(to);
            }}
          >
            <Icon name={MODE_ICON[mode()]} size={glyph()} />
            <span class={styles.dots} aria-hidden="true">
              <For each={modes()}>
                {m => <span class={styles.dot} data-on={m === mode() ? "" : undefined} />}
              </For>
            </span>
          </button>
        </Show>
        {/* the formats, between the mode and the book: where the strip has less room than their names, they scroll */}
        <span class={styles.formats}>
          <For each={places()} keyed={false}>
            {place => {
              const shown = () => place().find(f => formats().includes(f));
              const tip = tooltip(() => {
                const f = shown();
                return f ? tipText(f) : null;
              });
              return (
                <Show
                  when={shown()}
                  fallback={
                    <span class={styles.chip} data-hole="" aria-hidden="true">
                      {icon(place()[0])}
                      {name(place()[0], place())}
                    </span>
                  }
                >
                  {f => (
                    <button
                      ref={tip}
                      type="button"
                      class={styles.chip}
                      data-done={named && done() === f() ? "" : undefined}
                      aria-label={label(f())}
                      onClick={() => void act(f())}
                    >
                      {named ? null : (
                        <Show
                          when={making(f())}
                          fallback={
                            <Icon name={done() === f() ? "check" : ICON[f()]} size={glyph()} />
                          }
                        >
                          {m => {
                            /* the page's ring, the same for as long as the file is made: read once */
                            const Making = untrack(() => m().Icon);
                            return <Making done={m().done} size={glyph()} />;
                          }}
                        </Show>
                      )}
                      {name(f(), place())}
                      {/* a name alone confirms with a check in its place, the name keeping the chip's width */}
                      <Show when={named && done() === f()}>
                        <span class={styles.check}>
                          <Icon name="check" size={glyph()} />
                        </span>
                      </Show>
                    </button>
                  )}
                </Show>
              );
            }}
          </For>
        </span>
        <Show when={swatched()}>
          <Show
            when={swatchesOf(mode()).length > 0}
            fallback={<span class={styles.chip} data-square="" data-hole="" aria-hidden="true" />}
          >
            <button
              ref={tipBook}
              type="button"
              class={styles.chip}
              data-square=""
              aria-label={book()}
              onClick={() => openSwatches(!swatching())}
            >
              <Icon name={swatching() ? "back" : "swatches"} size={glyph()} />
            </button>
          </Show>
        </Show>
      </span>
    </span>
  );
}
