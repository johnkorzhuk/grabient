import { type Element, For, Show } from "solid-js";
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

/** Cards on their way on the list's own grid, so the page has the size it will have: after the list's `lead`, which
    stands in its first cell as the list will have it (PaletteFeed). */
export function PaletteGridPlaceholder(props: {
  count: number;
  dense?: boolean;
  lead?: () => Element;
}) {
  return (
    <PaletteGrid dense={props.dense}>
      <Show when={props.lead}>
        {lead => (
          <div class={styles.lead} data-lead="">
            {lead()()}
          </div>
        )}
      </Show>
      <For each={Array.from({ length: Math.max(0, props.count) }, (_, i) => i)}>
        {() => <PaletteCardPlaceholder />}
      </For>
    </PaletteGrid>
  );
}
