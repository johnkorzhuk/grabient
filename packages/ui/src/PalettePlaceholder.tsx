import { For } from "solid-js";
import { PaletteGrid } from "./PaletteGrid.tsx";
import styles from "./PalettePlaceholder.module.css";

/** A palette card on its way, at the card's own size: the picture, and the line beneath with its age and like. Still,
    as every placeholder is. */
export function PaletteCardPlaceholder() {
  return (
    <div class={styles.card} aria-hidden="true">
      <span class={styles.art} />
      <span class={styles.line}>
        <span class={styles.age} />
        <span class={styles.like} />
      </span>
    </div>
  );
}

/** Cards on their way on the list's own grid, so the page has the size it will have. */
export function PaletteGridPlaceholder(props: { count: number; dense?: boolean }) {
  return (
    <PaletteGrid dense={props.dense}>
      <For each={Array.from({ length: Math.max(0, props.count) }, (_, i) => i)}>
        {() => <PaletteCardPlaceholder />}
      </For>
    </PaletteGrid>
  );
}
