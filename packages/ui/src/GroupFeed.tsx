import { type Element, For } from "solid-js";
import styles from "./GroupFeed.module.css";
import { createHeights, createWindow, type WindowRoom } from "./window.ts";

/* the room and the heights of the groups as they last stood, so a feed returned to lays out at its depth */
const room: WindowRoom = { top: 0, width: 0 };
const heights = new Map<string, number>();
/* the space between groups: the feed's gap in its styles (--space-s16) */
const GAP = 64;

/** A feed of groups of their own heights (a collection and its first palettes): only the groups near the viewport are
    drawn (window.ts), measured once drawn and estimated before. The server draws the first `initial`, the rest stand
    as padding until the page settles. */
export function GroupFeed<T>(props: {
  items: readonly T[];
  key: (item: T) => string;
  group: (item: () => T) => Element;
  /** a group's height before it is measured, at the feed's width */
  estimate: (item: T, width: number) => number;
  initial: number;
  depth?: number;
}) {
  const measured = createHeights(heights);
  const win = createWindow({
    count: () => props.items.length,
    size: (i, width) => {
      const item = props.items[i]!;
      return measured.of(props.key(item)) ?? props.estimate(item, width);
    },
    gap: () => GAP,
    initial: () => props.initial,
    depth: props.depth,
    room
  });
  const shown = () => {
    const [start, end] = win.range();
    return props.items.slice(start, end);
  };
  return (
    <div
      ref={win.ref}
      class={styles.feed}
      data-count={props.items.length}
      style={{ "padding-top": `${win.before()}px`, "padding-bottom": `${win.after()}px` }}
    >
      <For each={shown()} keyed={props.key}>
        {item => {
          const measure = measured.measure(() => props.key(item()));
          return (
            <div ref={measure} data-group={props.key(item())}>
              {props.group(item)}
            </div>
          );
        }}
      </For>
    </div>
  );
}
