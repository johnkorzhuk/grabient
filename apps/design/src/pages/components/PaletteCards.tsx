import { PaletteCard } from "@grabient/ui/PaletteCard.tsx";
import { createSignal, untrack } from "solid-js";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import { hexes, POPULAR, type Sample } from "../../samples.ts";
import styles from "./PaletteCards.module.css";

/* Three cards as a list draws them, each a palette from the gallery in its saved view: at rest, with its tools as the
   pointer finds them, and liked and in the selection. The heart and the plus are live. */
function Card(props: {
  sample: Sample;
  age: string;
  hover?: boolean;
  liked?: boolean;
  selected?: boolean;
}) {
  const [liked, setLiked] = createSignal(untrack(() => !!props.liked));
  const [selected, setSelected] = createSignal(untrack(() => !!props.selected));
  /* the count without the reader's own like, which the heart adds back */
  const others = untrack(() => props.sample.likes - (props.liked ? 1 : 0));
  return (
    <PaletteCard
      seed={props.sample.seed}
      stops={hexes(props.sample.seed, props.sample.steps)}
      style={props.sample.style}
      angle={props.sample.angle}
      age={props.age}
      likes={others + (liked() ? 1 : 0)}
      liked={liked()}
      hover={props.hover}
      selected={selected()}
      onLike={() => setLiked(!liked())}
      onSelect={() => setSelected(!selected())}
    />
  );
}

export function PaletteCards() {
  return (
    <Section id="palette-card" summary="One palette in a list: the picture, its age and its heart.">
      <div class={styles.grid}>
        <figure class={styles.figure}>
          <Card sample={POPULAR[2]} age="12 days" />
        </figure>
        <figure class={styles.figure}>
          <Card sample={POPULAR[5]} age="3 months" hover />
        </figure>
        <figure class={styles.figure}>
          <Card sample={POPULAR[4]} age="May 2025" liked selected />
        </figure>
      </div>
      <Block title="Rules">
        <Rules
          rules={[
            "One height at every width: a wider column makes a wider picture.",
            "Hover or focus in the picture fades in the glow and the tools; nothing moves.",
            "On touch the tools wait for a tap on the picture, one card at a time.",
            "An article named by its palette, so its Edit is that palette's Edit."
          ]}
        />
      </Block>
    </Section>
  );
}
