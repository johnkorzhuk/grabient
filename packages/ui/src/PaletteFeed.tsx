import {
  createEffect,
  createSignal,
  type Element,
  For,
  NoHydration,
  Show,
  untrack
} from "solid-js";
import styles from "./PaletteFeed.module.css";
import { columnsAt, PaletteGrid } from "./PaletteGrid.tsx";
import { createWindow, type WindowRoom } from "./window.ts";

/* a row before one is measured: the picture, the gap to its line and the line; and the grid's own gap */
const room: WindowRoom = { top: 0, width: 0 };
const kept = { card: 300 + 12 + 32, gap: 40 };

/** A palette list as a feed: every palette loaded so far, with only the rows near the viewport drawn (window.ts).
    Every card is one size, so the rows are measured from the first palette's card and its grid's gap, and kept, so a
    list returned to lays out at its depth on its first frame. The server draws every card it was given; the first
    `live` are hydrated and the rest stand still until the reader moves, the list holds other cards, or the page draws
    the cards for the reader (`still` false). A `lead` stands in the first cell, before the palettes, on a card's
    footprint, and is drawn while the window holds the first row and the list holds a palette. */
export function PaletteFeed<T>(props: {
  items: readonly T[];
  /** what keeps a card as the window slides: the palette's seed */
  key: (item: T) => string;
  card: (item: () => T) => Element;
  /** a card before the palettes, in the first cell: the list's ad */
  lead?: () => Element;
  /** the cards the page starts with live, out of those the server drew: the first screen's */
  live?: number;
  /** false once the cards are the reader's own (an account's hearts, a selection's checks), which the server's still
      ones cannot show */
  still?: boolean;
  /** the depth a return is about to restore */
  depth?: number;
}) {
  const [card, setCard] = createSignal(kept.card);
  const [gap, setGap] = createSignal(kept.gap);
  /* the lead's cell, then a palette's each; a list with no palettes has no lead either */
  const leadCell = () => (props.lead && props.items.length ? 1 : 0);
  const rows = (width: number) => Math.ceil((props.items.length + leadCell()) / columnsAt(width));
  const drawn = untrack(() => props.items.map(props.key));
  const win = createWindow({
    count: rows,
    size: () => card(),
    gap,
    initial: rows,
    drawn: () =>
      props.still !== false &&
      props.items.length === drawn.length &&
      props.items.every((item, i) => props.key(item) === drawn[i]),
    depth: props.depth,
    room
  });
  const live = () =>
    win.started()
      ? props.items.length
      : Math.min(props.items.length, props.live ?? props.items.length);
  const shown = () => {
    if (!win.started()) return props.items.slice(0, live());
    const [start, end] = win.range();
    const columns = columnsAt(win.width());
    return props.items.slice(
      Math.max(0, start * columns - leadCell()),
      Math.max(0, end * columns - leadCell())
    );
  };
  const leads = () => !!leadCell() && (!win.started() || win.range()[0] === 0);
  let host: HTMLDivElement | undefined;
  /* new palettes may be the first to give the feed its size (it was hidden or empty): the rows are measured again */
  createEffect(
    () => props.items.length,
    () => {
      const grid = host?.firstElementChild?.firstElementChild;
      /* a palette's card: the lead's cell stands on its footprint, and is no palette */
      const first = grid?.querySelector(":scope > :not([data-lead])");
      const height = first?.getBoundingClientRect().height;
      if (!grid || !height) return;
      kept.card = height;
      kept.gap = Number.parseFloat(getComputedStyle(grid).rowGap) || kept.gap;
      setCard(kept.card);
      setGap(kept.gap);
      win.remeasure();
    }
  );
  return (
    <div
      ref={el => {
        host = el;
        win.ref(el);
      }}
      class={styles.feed}
      data-count={props.items.length}
      style={{ "padding-top": `${win.before()}px`, "padding-bottom": `${win.after()}px` }}
    >
      <PaletteGrid>
        <Show when={leads()}>
          <div class={styles.lead} data-lead="">
            {props.lead?.()}
          </div>
        </Show>
        <For each={shown()} keyed={props.key}>
          {item => props.card(item)}
        </For>
        <Show when={!win.started() && live() < props.items.length}>
          <div class={styles.still} ref={win.wake}>
            <NoHydration>
              <For each={props.items.slice(live())}>{item => props.card(() => item)}</For>
            </NoHydration>
          </div>
        </Show>
      </PaletteGrid>
    </div>
  );
}
