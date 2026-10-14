import { PaletteGrid } from "@grabient/ui/PaletteGrid.tsx";
import { type Element, For } from "solid-js";
import { GalleryCard } from "./GalleryCard.tsx";
import styles from "./gallery.module.css";
import { ListHeading } from "./ListHeading.tsx";
import type { PaletteItem } from "./schema.ts";

/** The palettes a search's colors make, ahead of the palettes it found: from the colors written in its words, or from a
    picture's points, the picture standing first in the grid. No gallery holds them yet, so a card tells no age and
    takes no vote. */
export function Made(props: { title: string; items: readonly PaletteItem[]; picture?: Element }) {
  return (
    <section class={styles.made} aria-label={props.title}>
      <ListHeading title={props.title} />
      <PaletteGrid>
        {props.picture}
        <For each={props.items} keyed={false}>
          {(item, position) => <GalleryCard item={item()} at={() => ({ position })} />}
        </For>
      </PaletteGrid>
    </section>
  );
}
