import { decodePalette } from "@grabient/engine/codec.ts";
import type { Language } from "@grabient/engine/message.ts";
import { isSwatchFormat, swatchFile, swatchPalette } from "@grabient/engine/swatches.ts";
import type { Style } from "@grabient/engine/view.ts";
import { locale, msg, t } from "@grabient/i18n";
import { APPEARANCE_OPTIONS, AppearanceMenu, styleLabel } from "@grabient/ui/Appearance.tsx";
import { announce } from "@grabient/ui/announce.ts";
import { Button } from "@grabient/ui/Button.tsx";
import { copyText } from "@grabient/ui/copy.ts";
import { type Format, FormatStrip, SWATCH_CHIPS } from "@grabient/ui/FormatStrip.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { composing } from "@grabient/ui/keys.ts";
import { reducesNow } from "@grabient/ui/motion.ts";
import { Placeholder } from "@grabient/ui/Placeholder.tsx";
import { StopStrip } from "@grabient/ui/StopStrip.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  onSettled,
  Show
} from "solid-js";
import { copyPng } from "./copies.ts";
import styles from "./PaletteView.module.css";
import {
  artOf,
  cssOf,
  type FileFormat,
  fileUrl,
  nameOf,
  paletteUrl,
  stopsOf,
  svgOf,
  type Tile,
  type TileView,
  takesAngle
} from "./tiles.ts";

/* The palettes show_palettes shows, drawn in the AI app that called it from their seeds alone: a card for one, a
   carousel for more, numbered as the model's reply numbers them, and full screen, where the chosen palette's view can
   change (style, steps, angle; the seed never does). Each picture carries a gallery card's format strip, and where the
   app takes no copy, the text comes out under the picture to copy by hand. No press reaches the server or changes
   anything on Grabient: the palette chosen in full screen is handed to `onChoose`, which tells the app's model what is
   on screen. The chrome takes the app's colors and type through the host tokens; the palettes are the only color of
   Grabient's own. main.tsx wires the bridge. */

/** At most this many cards inline; the rest are a card away: full screen, or every card in a grid inside the frame
    where the app has no full screen. */
export const INLINE_MAX = 8;
export type Mode = "inline" | "fullscreen";
export type DownloadFormat = Exclude<FileFormat, "md">;

export interface PaletteViewProps {
  /** null until the call's palettes arrive: a still block where the card will be */
  tiles: readonly Tile[] | null;
  /** nothing came and nothing the view knows of is on its way: a sentence and the site in the block's place */
  silent?: boolean;
  /** the site the palettes' pages and files are on */
  origin: string;
  mode: Mode;
  /** the app can show the view full screen */
  fullscreen?: boolean;
  /** in full screen, the app can return the view inline */
  inline?: boolean;
  /** the app saves files the view hands it */
  download?: boolean;
  /** the palette full screen shows, by its place in `tiles` */
  selected?: number;
  onSelect?: (index: number) => void;
  /** a person chose a palette in full screen, or changed its view there: the tile as it is drawn now */
  onChoose?: (tile: Tile) => void;
  /** asks the app for a display mode; full screen opens on the palette at `index` */
  onMode?: (mode: Mode, index?: number) => void;
  /** opens an address through the app: true when it took the press, so the link does not open itself */
  onOpen?: (url: string) => boolean;
  onDownload?: (tile: Tile, format: DownloadFormat) => void;
}

const COPY: readonly Format[] = ["url", "css", "svg", "png"];
const DOWNLOAD: readonly Format[] = ["css", "svg", "png"];
/* the addresses of the files the site serves for a palette: the Markdown, which holds its JSON among its words, then
   CSS, SVG and PNG */
const LINK: readonly Format[] = ["md", "css", "svg", "png"];
const STEPS = msg("{count, plural, one {# step} other {# steps}}");
const PALETTE = msg("Palette {number}: {name}");
const COUNT = msg("{count, plural, one {# palette} other {# palettes}}");

/** The words a palette's name is said in: the reader's. */
const language = (): Language => ({ t, locale: locale() });
const named = (tile: Tile) => nameOf(tile, language());
/** A view in words: its style, its stops, and its angle where the style turns. */
const viewWords = (view: TileView) =>
  [
    styleLabel(view.style),
    t(STEPS, { count: view.steps }),
    ...(takesAngle(view.style) ? [`${view.angle}°`] : [])
  ].join(" · ");

/** A copy the app would not take, out under its palette's picture: the text and its format's name, the chip that asked
    and its answer, settled once the whole text is copied or the text is put away. */
interface HandCopy {
  tile: number;
  text: string;
  label: string;
  from: HTMLElement | null;
  settle: (copied: boolean) => void;
}
/** A format's chip in a strip, found by its name: the press that asked, where the press took no focus (Safari). */
const chipOf = (strip: HTMLElement | undefined, format: Format): HTMLElement | null =>
  [...(strip?.querySelectorAll("button") ?? [])].find(
    chip => chip.textContent?.trim().toUpperCase() === format.toUpperCase()
  ) ?? null;

export function PaletteView(props: PaletteViewProps) {
  /* a view changed in full screen, by tile number: this frame's alone, so the server never hears of it */
  const [views, setViews] = createSignal<Readonly<Record<number, TileView>>>({});
  const tileAt = (tile: Tile): Tile => ({ ...tile, ...views()[tile.tile] });
  const setView = (tile: Tile, change: Partial<TileView>) => {
    putAway(false, false);
    const next = { ...tileAt(tile), ...change };
    setViews(all => ({
      ...all,
      [tile.tile]: { style: next.style, steps: next.steps, angle: next.angle }
    }));
    props.onChoose?.(next);
  };
  /* the one copy out to take by hand */
  const [hand, setHand] = createSignal<HandCopy | null>(null);
  const open = (e: MouseEvent, url: string) => {
    if (props.onOpen?.(url)) e.preventDefault();
  };
  const tiles = () => props.tiles ?? [];
  const chosen = () =>
    tiles()[Math.min(Math.max(0, props.selected ?? 0), Math.max(0, tiles().length - 1))];
  const handId = createUniqueId();

  /** Puts the text out to copy away, copied or not, which answers the press that asked. `back` returns the focus to
      that press, for a put away that started in the text. */
  function putAway(copied: boolean, back: boolean) {
    const was = hand();
    if (!was) return;
    setHand(null);
    was.from?.removeAttribute("aria-expanded");
    was.from?.removeAttribute("aria-controls");
    was.settle(copied);
    if (back && was.from?.isConnected) was.from.focus({ preventScroll: true });
  }
  /** Puts a text out under its palette's picture, selected to copy by hand; the chip that asked controls it, and its
      answer waits for the person's copy. */
  function out(
    tile: Tile,
    text: string,
    label: string,
    from: HTMLElement | null,
    why: string
  ): Promise<boolean> {
    return new Promise<boolean>(settle => {
      putAway(false, false);
      setHand({ tile: tile.tile, text, label, from, settle });
      from?.setAttribute("aria-expanded", "true");
      from?.setAttribute("aria-controls", handId);
      announce(why);
    });
  }
  /** A press of a strip: the format, or in link mode its file's address, copied inside the press. The PNG goes over as
      an image; where the app takes none, the file is saved through the app, or else its address comes out, so a link
      never takes the picture's place unseen. Text the app will not take comes out to copy by hand. */
  async function take(
    tile: Tile,
    format: Format,
    link: boolean,
    strip: HTMLElement | undefined
  ): Promise<boolean> {
    const active = document.activeElement;
    const from =
      active instanceof HTMLElement && strip?.contains(active) ? active : chipOf(strip, format);
    /* the chip whose text is out puts it away, as its expanded state says */
    if (from && hand()?.from === from) {
      putAway(false, true);
      return false;
    }
    let text: string;
    let label = "URL";
    if (link) text = fileUrl(props.origin, tile, format as FileFormat);
    else if (format === "png") {
      if (await copyPng(tile)) {
        putAway(false, false);
        return true;
      }
      putAway(false, false);
      if (props.download && props.origin) {
        props.onDownload?.(tile, "png");
        announce(t("Images can't be copied here, so the file was downloaded."));
        return false;
      }
      if (!props.origin) {
        announce(t("Images can't be copied here."));
        return false;
      }
      return out(
        tile,
        fileUrl(props.origin, tile, "png"),
        label,
        from,
        t("Images can't be copied here.")
      );
    } else if (isSwatchFormat(format)) {
      /* the swatch files that are text, written as the site writes them */
      const palette = swatchPalette(tile.seed, tile, props.origin, {
        name: named(tile),
        language: language()
      });
      const file = palette ? swatchFile(format, [palette]) : "";
      text = typeof file === "string" ? file : "";
      label = format === "tokens" ? "Tokens" : format.toUpperCase();
    } else {
      const stops = stopsOf(tile);
      text =
        format === "url"
          ? paletteUrl(props.origin, tile)
          : format === "css"
            ? cssOf(stops, tile)
            : svgOf(stops, tile, props.origin);
      label = format.toUpperCase();
    }
    if (await copyText(text)) {
      putAway(false, false);
      return true;
    }
    return out(tile, text, label, from, t("Couldn't copy. Select the text and copy it."));
  }

  /* A press that changes the display mode is gone in the next one, so the focus moves on: to the palette's name in full
     screen, and back to its card or the Full screen press inline. Only a change this frame asked for moves it; one the
     app made leaves the focus where the person is. A carousel card's picture asks for full screen on its palette
     (`pick`), which is said to the app once full screen shows it. */
  let picked: number | undefined;
  const ask = (mode: Mode, index?: number, pick?: Tile) => {
    picked = pick?.tile;
    props.onMode?.(mode, index);
  };
  createEffect(
    () => props.mode,
    (mode, was) => {
      if (was === undefined || mode === was) return;
      const shown = chosen();
      if (mode === "fullscreen" && shown && shown.tile === picked) props.onChoose?.(tileAt(shown));
      picked = undefined;
      requestAnimationFrame(() => {
        putAway(false, false);
        if (
          !document.hasFocus() ||
          (document.activeElement && document.activeElement !== document.body)
        )
          return;
        const find = (selector: string) => document.querySelector<HTMLElement>(selector);
        const target =
          mode === "fullscreen"
            ? find("[data-heading]")
            : (find(`[data-tile="${chosen()?.tile}"] button`) ??
              find("[data-all] button") ??
              find(`button[aria-label="${CSS.escape(t("Full screen"))}"]`));
        target?.focus();
      });
    }
  );

  /** A palette's strip in its picture's far corner, as on a gallery card. A carousel card's shows while a pointer rests
      on its picture. The page's address and its files' need the site's. */
  const Strip = (p: { tile: Tile; size: "md" | "lg"; slide?: boolean }) => {
    let box: HTMLSpanElement | undefined;
    return (
      <span class={styles.corner} data-slide={p.slide ? "" : undefined}>
        <span
          ref={el => {
            box = el;
          }}
          class={styles.reach}
          data-part="strip"
        >
          <FormatStrip
            size={p.size}
            variant="art"
            copy={props.origin ? COPY : COPY.filter(f => f !== "url")}
            download={props.download ? DOWNLOAD : undefined}
            swatches={{
              copy: SWATCH_CHIPS.copy,
              download: props.download ? SWATCH_CHIPS.download : undefined,
              link: props.origin ? SWATCH_CHIPS.link : undefined
            }}
            link={props.origin ? LINK : undefined}
            onMode={() => putAway(false, false)}
            onCopy={f => take(p.tile, f, false, box)}
            onLink={f => take(p.tile, f, true, box)}
            onDownload={f =>
              props.onDownload?.(
                p.tile,
                f === "png" || f === "css" || isSwatchFormat(f) ? (f as DownloadFormat) : "svg"
              )
            }
          />
        </span>
      </span>
    );
  };
  /** The copy out under a palette's picture. */
  const Hand = (p: { tile: number }) => (
    <Show when={hand()?.tile === p.tile ? hand() : null} keyed>
      {h => <HandText hand={h} />}
    </Show>
  );
  /** The text in a read-only field, selected as it comes out so the keys that copy take it whole. A copy of the whole
      text confirms the press that asked and puts the text away, as Escape and Close do; a part copied leaves it. */
  function HandText(p: { hand: HandCopy }) {
    let area: HTMLTextAreaElement | undefined;
    const [cut, setCut] = createSignal(false);
    /* as tall as its text up to its style's lines: a field does not grow, so the height is measured */
    const fit = () => {
      if (!area) return;
      area.style.height = "0px";
      area.style.height = `${area.scrollHeight}px`;
      setCut(area.scrollHeight > area.clientHeight + 1);
    };
    onSettled(() => {
      if (!area) return;
      const held = area;
      let width = held.clientWidth;
      fit();
      /* a narrower frame wraps the text onto more lines */
      const sizes = new ResizeObserver(() => {
        if (held.clientWidth === width) return;
        width = held.clientWidth;
        fit();
      });
      sizes.observe(held);
      held.focus();
      held.select();
      held.scrollTop = 0;
      return () => sizes.disconnect();
    });
    const copied = (e: ClipboardEvent) => {
      const field = e.currentTarget as HTMLTextAreaElement;
      if (field.selectionStart === 0 && field.selectionEnd === field.value.length)
        requestAnimationFrame(() => putAway(true, true));
    };
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: Escape from the field or Close puts the text away
      <div
        class={styles.hand}
        data-hand
        onKeyDown={e => {
          if (e.key !== "Escape" || composing(e)) return;
          e.preventDefault();
          e.stopPropagation();
          putAway(false, true);
        }}
      >
        <textarea
          ref={el => {
            area = el;
          }}
          id={handId}
          class={styles.handText}
          data-cut={cut() ? "" : undefined}
          dir="ltr"
          readonly
          rows={1}
          spellcheck="false"
          aria-label={t("{label}, as text", { label: p.hand.label })}
          value={p.hand.text}
          onCopy={copied}
        />
        <Button
          icon
          variant="ghost"
          aria-label={t("Close")}
          tip={t("Close")}
          onClick={() => putAway(false, true)}
        >
          <Icon name="close" size={14} />
        </Button>
      </div>
    );
  }
  const Open = (p: { tile: Tile }) => (
    <Button
      size="lg"
      href={paletteUrl(props.origin, p.tile)}
      external
      onClick={e => open(e, paletteUrl(props.origin, p.tile))}
    >
      {t("Open on Grabient")}
    </Button>
  );
  const Badge = (p: { n: number }) => (
    <span class={styles.badge} aria-hidden="true">
      <Text variant="num">{p.n}</Text>
    </span>
  );
  const Full = (p: { index?: number }) => (
    <Show when={props.fullscreen}>
      <Button
        icon
        variant="ghost"
        aria-label={t("Full screen")}
        tip={t("Full screen")}
        onClick={() => ask("fullscreen", p.index)}
      >
        <Icon name="expand" size={14} />
      </Button>
    </Show>
  );

  /** One palette inline: its picture with its strip, its words, its colors, and Open. */
  function Card(p: { tile: Tile }) {
    const tile = () => tileAt(p.tile);
    const stops = createMemo(() => stopsOf(tile()));
    return (
      <article
        class={styles.root}
        aria-label={t(PALETTE, { number: tile().tile, name: named(tile()) })}
      >
        <div class={styles.frame}>
          <div
            class={styles.art}
            data-size="card"
            style={{ background: artOf(stops(), tile()) }}
            dir="ltr"
            aria-hidden="true"
            data-part="picture"
          />
          <Strip tile={tile()} size="md" />
        </div>
        <Hand tile={tile().tile} />
        <div class={styles.head}>
          <div class={styles.words} data-part="words">
            <Text variant="h3" dir="auto">
              {named(tile())}
            </Text>
            <Text variant="small">{viewWords(tile())}</Text>
            <Text variant="mono" dir="ltr">
              {tile().seed}
            </Text>
          </div>
          <Full index={0} />
        </div>
        <div class={styles.strip}>
          <StopStrip stops={stops()} short />
        </div>
        <Show when={props.origin}>
          <div class={styles.actions} data-part="actions">
            <Open tile={tile()} />
          </div>
        </Show>
      </article>
    );
  }

  /** A carousel card: the picture with its number and strip, and a line of words. */
  function Slide(p: { tile: Tile; index: number; all: boolean }) {
    const tile = () => tileAt(p.tile);
    const stops = createMemo(() => stopsOf(tile()));
    return (
      <li
        class={styles.slide}
        data-all={p.all ? "" : undefined}
        data-tile={tile().tile}
        aria-label={t(PALETTE, { number: tile().tile, name: named(tile()) })}
      >
        <div class={styles.frame} data-slide="">
          <Show
            when={props.fullscreen}
            fallback={
              <div
                class={styles.art}
                data-size="slide"
                style={{ background: artOf(stops(), tile()) }}
                dir="ltr"
                aria-hidden="true"
                data-part="picture"
              >
                <Badge n={tile().tile} />
              </div>
            }
          >
            <button
              type="button"
              class={styles.art}
              data-size="slide"
              style={{ background: artOf(stops(), tile()) }}
              dir="ltr"
              data-part="picture"
              aria-label={t("Open palette {number} in full screen", { number: tile().tile })}
              onClick={() => ask("fullscreen", p.index, tile())}
            >
              <Badge n={tile().tile} />
            </button>
          </Show>
          <Strip tile={tile()} size="md" slide />
        </div>
        <Hand tile={tile().tile} />
        <div class={styles.words}>
          <Text variant="ui" strong truncate dir="auto">
            {named(tile())}
          </Text>
          <Text variant="small" truncate>
            {viewWords(tile())}
          </Text>
        </div>
      </li>
    );
  }

  /** The row: up to eight cards in tile order, then a card that leads to the rest. A fine pointer has buttons that move
      the row a card at a time, since a mouse's wheel stays the conversation's; a finger swipes; the arrow keys walk from
      card to card in the reading direction. */
  function Carousel() {
    let row: HTMLUListElement | undefined;
    const [all, setAll] = createSignal(false);
    const over = () => tiles().length > INLINE_MAX;
    const cards = () => (all() || !over() ? tiles() : tiles().slice(0, INLINE_MAX));
    /* whether the row runs on before and after what shows, in its reading direction */
    const [more, setMore] = createSignal({ before: false, after: false });
    const measure = () => {
      if (!row) return;
      const room = row.scrollWidth - row.clientWidth;
      const along = Math.abs(row.scrollLeft);
      setMore({ before: room > 1 && along > 1, after: room - along > 1 });
    };
    const step = (way: 1 | -1) => {
      if (!row) return;
      const card = row.querySelector<HTMLElement>("li");
      const look = getComputedStyle(row);
      const by = (card?.offsetWidth ?? row.clientWidth) + (Number.parseFloat(look.columnGap) || 0);
      row.scrollBy({
        left: way * by * (look.direction === "rtl" ? -1 : 1),
        behavior: reducesNow() ? "auto" : "smooth"
      });
    };
    onSettled(() => {
      if (!row) return;
      const held = row;
      const sizes = new ResizeObserver(measure);
      sizes.observe(held);
      held.addEventListener("scroll", measure, { passive: true });
      measure();
      return () => {
        sizes.disconnect();
        held.removeEventListener("scroll", measure);
      };
    });
    /* cards that arrive or leave change how far the row runs, which its own size does not show */
    createEffect(
      () => cards().length,
      () => {
        requestAnimationFrame(measure);
      }
    );
    /* the arrows walk the cards, but not out of a copy's text, where they move through it */
    const walk = (e: KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      if ((e.target as Element | null)?.closest?.("[data-hand]")) return;
      const list = e.currentTarget as HTMLElement;
      const rtl = getComputedStyle(list).direction === "rtl";
      const items = [...list.children] as HTMLElement[];
      const at = items.findIndex(item => item.contains(document.activeElement));
      const next = items[at + ((e.key === "ArrowRight") !== rtl ? 1 : -1)];
      const target = next?.querySelector<HTMLElement>("button, a");
      if (!target) return;
      e.preventDefault();
      target.focus({ preventScroll: true });
      next.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    /** The rest: full screen on the first not shown, where the app has it; else every card here, the first that was
        not shown taking the focus. */
    const rest = () => {
      if (props.fullscreen) {
        ask("fullscreen", INLINE_MAX);
        return;
      }
      setAll(true);
      requestAnimationFrame(() =>
        row
          ?.querySelector<HTMLElement>(`[data-tile="${tiles()[INLINE_MAX]?.tile}"] button`)
          ?.focus()
      );
    };
    const fewer = () => {
      setAll(false);
      requestAnimationFrame(() => row?.querySelector<HTMLElement>("[data-all] button")?.focus());
    };
    return (
      <div class={styles.root}>
        <div class={styles.bar}>
          <Text variant="small">{t(COUNT, { count: tiles().length })}</Text>
          <div class={styles.presses}>
            <Show when={!all() && (more().before || more().after)}>
              <span class={styles.steps} data-steps>
                <Button
                  icon
                  variant="ghost"
                  aria-label={t("Previous palettes")}
                  disabled={!more().before}
                  keep
                  onClick={() => step(-1)}
                >
                  <Icon name="chevronLeft" size={14} />
                </Button>
                <Button
                  icon
                  variant="ghost"
                  aria-label={t("More palettes")}
                  disabled={!more().after}
                  keep
                  onClick={() => step(1)}
                >
                  <Icon name="chevronRight" size={14} />
                </Button>
              </span>
            </Show>
            <Show when={all() && over()}>
              <Button variant="ghost" aria-expanded={true} onClick={fewer}>
                {t("Show fewer")}
              </Button>
            </Show>
            <Full />
          </div>
        </div>
        <ul
          ref={el => {
            row = el;
          }}
          class={styles.row}
          data-all={all() ? "" : undefined}
          aria-label={t("Palettes")}
          onKeyDown={walk}
        >
          <For each={cards()} keyed={false}>
            {(tile, i) => <Slide tile={tile()} index={i} all={all()} />}
          </For>
          <Show when={over() && !all()}>
            <li class={styles.allItem} data-all>
              <button
                type="button"
                class={styles.all}
                aria-expanded={props.fullscreen ? undefined : "false"}
                onClick={rest}
              >
                <Icon name="grid" size={15} />
                <Text variant="ui" strong>
                  {t("All palettes")}
                </Text>
                <Text variant="num">{tiles().length}</Text>
              </button>
            </li>
          </Show>
        </ul>
      </div>
    );
  }

  /** Full screen: the chosen palette large with its strip, its panel with its view, and every palette as a grid. */
  function Fullscreen() {
    const tile = () => tileAt(chosen());
    const stops = createMemo(() => stopsOf(tile()));
    const [peek, setPeek] = createSignal<Style | null>(null);
    const art = () => artOf(stops(), { ...tile(), style: peek() ?? tile().style });
    const keyframes = () => decodePalette(tile().seed)?.anchors.length ?? 2;
    return (
      <div class={styles.root} data-full="">
        <div class={styles.bar}>
          <Text variant="h3" as="p">
            {t(COUNT, { count: tiles().length })}
          </Text>
          <Show when={props.inline}>
            <Button
              icon
              variant="ghost"
              aria-label={t("Exit full screen")}
              tip={t("Exit full screen")}
              onClick={() => ask("inline")}
            >
              <Icon name="collapse" size={14} />
            </Button>
          </Show>
        </div>
        <div class={styles.body}>
          <div class={styles.stage}>
            <div class={styles.frame}>
              <div
                class={styles.art}
                data-size="stage"
                style={{ background: art() }}
                dir="ltr"
                aria-hidden="true"
                data-part="picture"
              >
                <Show when={tiles().length > 1}>
                  <Badge n={tile().tile} />
                </Show>
              </div>
              <Strip tile={tile()} size="lg" />
            </div>
            <Hand tile={tile().tile} />
          </div>
          <section
            class={styles.panel}
            aria-label={t(PALETTE, { number: tile().tile, name: named(tile()) })}
          >
            <div class={styles.words}>
              <div class={styles.heading} tabindex={-1} data-heading>
                <Text variant="h2" as="h2" dir="auto">
                  {named(tile())}
                </Text>
              </div>
              <Text variant="small">{viewWords(tile())}</Text>
              <Text variant="mono" dir="ltr">
                {tile().seed}
              </Text>
            </div>
            <div class={styles.strip}>
              <StopStrip stops={stops()} short />
            </div>
            <Show when={props.origin}>
              <div class={styles.actions}>
                <Open tile={tile()} />
              </div>
            </Show>
            <AppearanceMenu
              options={APPEARANCE_OPTIONS}
              style={tile().style}
              steps={tile().steps}
              angle={takesAngle(tile().style) ? tile().angle : null}
              stepsMin={Math.max(3, keyframes())}
              bg={style => artOf(stops(), { ...tile(), style })}
              onPeek={setPeek}
              onStyle={style => {
                if (style !== "auto") setView(chosen(), { style });
              }}
              onSteps={steps => {
                if (steps !== "auto") setView(chosen(), { steps });
              }}
              onAngle={angle => {
                if (angle !== "auto") setView(chosen(), { angle });
              }}
            />
          </section>
          <Show when={tiles().length > 1}>
            <ul class={styles.grid} aria-label={t("Palettes")}>
              <For each={tiles()} keyed={false}>
                {(item, i) => {
                  const at = () => tileAt(item());
                  const on = () => i === (props.selected ?? 0);
                  return (
                    <li class={styles.tile}>
                      <button
                        type="button"
                        class={styles.art}
                        data-size="tile"
                        data-chosen={on() ? "" : undefined}
                        style={{ background: artOf(stopsOf(at()), at()) }}
                        dir="ltr"
                        aria-label={t(PALETTE, { number: at().tile, name: named(at()) })}
                        aria-pressed={on() ? "true" : "false"}
                        onClick={() => {
                          putAway(false, false);
                          props.onSelect?.(i);
                          props.onChoose?.(at());
                          window.scrollTo({ top: 0 });
                        }}
                      >
                        <Badge n={at().tile} />
                      </button>
                      <Text variant="small" truncate dir="auto">
                        {named(at())}
                      </Text>
                    </li>
                  );
                }}
              </For>
            </ul>
          </Show>
        </div>
      </div>
    );
  }

  return (
    <Show
      when={props.tiles}
      fallback={
        /* the card on its way at the card's own size, with no words while it may still come; once the app has gone
           silent, a sentence and the site stand in its place, in one status there from the start, so a reader who
           listens hears the sentence when it comes */
        <div class={styles.root} role="status" aria-busy={props.silent ? undefined : "true"}>
          <Show
            when={props.silent}
            fallback={
              <>
                <Placeholder height="200px" round="surface" />
                <Placeholder width="40%" height="12px" />
                <Placeholder width="24%" height="9px" />
              </>
            }
          >
            <Text variant="ui">{t("Couldn't load palettes.")}</Text>
            <Show when={props.origin}>
              <div class={styles.actions}>
                <Button size="lg" href={props.origin} external onClick={e => open(e, props.origin)}>
                  {t("Open Grabient")}
                </Button>
              </div>
            </Show>
          </Show>
        </div>
      }
    >
      <Show
        when={tiles().length}
        fallback={
          <div class={styles.root}>
            <Text variant="ui">{t("No palettes.")}</Text>
          </div>
        }
      >
        <Show
          when={props.mode === "fullscreen"}
          fallback={
            <Show when={tiles().length > 1} fallback={<Card tile={tiles()[0]} />}>
              <Carousel />
            </Show>
          }
        >
          <Fullscreen />
        </Show>
      </Show>
    </Show>
  );
}
