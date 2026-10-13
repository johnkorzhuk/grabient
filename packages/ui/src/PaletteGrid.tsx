import type { Element } from "solid-js";
import styles from "./PaletteGrid.module.css";

/** How many columns a list's grid draws in a room this wide: the ranges of its container queries, for code that must
    know them (a window's rows, a group's estimate). */
export const columnsAt = (width: number): number =>
  width >= 2960
    ? 6
    : width >= 1808
      ? 5
      : width >= 1424
        ? 4
        : width >= 1168
          ? 3
          : width >= 728
            ? 2
            : 1;

/** The lists' grid: one to six columns by the room it has (the page widths 768 to 3072 less their gutters), 40px apart
    each way. `dense`, beside the export column, fits as many columns of at least 320px as there is room for. */
export function PaletteGrid(props: { dense?: boolean; children: Element }) {
  return (
    <div class={styles.host}>
      <div class={styles.grid} data-dense={props.dense ? "" : undefined}>
        {props.children}
      </div>
    </div>
  );
}
