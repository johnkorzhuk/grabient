import { CollectionCard } from "@grabient/ui/CollectionCard.tsx";
import { For } from "solid-js";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import { COLLECTIONS, hexes } from "../../samples.ts";
import styles from "./CollectionCards.module.css";

/* Three collections from the home page, drawn from three, six and eight of their palettes, so each way the mosaic
   fills its picture is seen. */
const SHOWN = [3, 6, 8];

export function CollectionCards() {
  return (
    <Section
      id="cards"
      summary="One collection in a list: its first palettes as one picture, then its title and how many it holds."
    >
      <div class={styles.grid}>
        <For each={COLLECTIONS}>
          {(collection, i) => (
            <CollectionCard
              href={`https://grabient.com/${collection.slug}`}
              title={collection.title}
              palettes={collection.seeds.slice(0, SHOWN[i()]).map(seed => hexes(seed, 12))}
              count={collection.count}
              owner="Grabient"
              age="3 weeks"
            />
          )}
        </For>
      </div>
      <Block title="Rules">
        <Rules
          rules={[
            "The picture is always full: one row up to three palettes, two up to eight, three past that.",
            "The seams are the page's own ground, so the glow shows around the picture and never through it.",
            "A collection has no heart. Its title's tooltip holds its description, owner and age."
          ]}
        />
      </Block>
    </Section>
  );
}
