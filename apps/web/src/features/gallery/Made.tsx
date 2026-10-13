import { PaletteGrid } from "@grabient/ui/PaletteGrid.tsx";
import { type Element, For } from "solid-js";
import type { ListView } from "./address.ts";
import { GalleryCard } from "./GalleryCard.tsx";
import { ListHeading } from "./ListHeading.tsx";
import type { PaletteItem } from "./schema.ts";

/** The palettes a search's colors make, ahead of the palettes it found: from the colors written in its words, or from a
    picture's points, the picture standing first in the grid. */
export function Made(props: {
  title: string;
  items: readonly PaletteItem[];
  view: ListView;
  picture?: Element;
}) {
  return (
    <section aria-label={props.title}>
      <ListHeading title={props.title} />
      <PaletteGrid>
        {props.picture}
        <For each={props.items} keyed={false}>
          {item => <GalleryCard item={item()} view={props.view} />}
        </For>
      </PaletteGrid>
    </section>
  );
}
