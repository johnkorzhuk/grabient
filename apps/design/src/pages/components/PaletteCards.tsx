import { PaletteCard } from "@grabient/ui/PaletteCard.tsx";
import { createSignal, untrack } from "solid-js";
import { cardTools, sampleName, sampleTitle } from "../../doc/cards.tsx";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import { hexes, POPULAR, type Sample } from "../../samples.ts";
import styles from "./PaletteCards.module.css";

/* Three cards as a list draws them, each a palette from the gallery in its saved view: at rest, with its tools and its
   title as the pointer finds them, and liked and in the selection. The heart and the plus are live. */
function Card(props: {
  sample: Sample;
  age: string;
  title?: string;
  description?: string;
  credit?: string;
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
      name={sampleName(props.sample)}
      stops={hexes(props.sample.seed, props.sample.steps)}
      style={props.sample.style}
      angle={props.sample.angle}
      href={`/${props.sample.seed}`}
      age={props.age}
      title={props.title}
      called={props.title ? sampleTitle(props.sample) : undefined}
      description={props.description}
      credit={props.credit}
      likes={others + (liked() ? 1 : 0)}
      liked={liked()}
      state={props.hover ? "hover" : undefined}
      selected={selected()}
      onLike={() => setLiked(!liked())}
      onSelect={() => setSelected(!selected())}
      tools={cardTools}
    />
  );
}

export function PaletteCards() {
  return (
    <Section id="palette-card" summary="One palette in a list: the picture, its age and its heart.">
      <div class={styles.grid}>
        <figure class={styles.figure}>
          <Card sample={POPULAR[2]} age="12 days" credit="Grabient" />
        </figure>
        <figure class={styles.figure}>
          <Card
            sample={POPULAR[5]}
            age="3 months"
            title="Violet hour"
            description="Cobalt through magenta into a gold horizon."
            credit="ada"
            hover
          />
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
            "A palette's title, where it has one, stands in its age's place under the pointer or focus; the owner of a collection writes one there.",
            "The title's tooltip says what the palette's colors call it in the reader's language and a person's own words for it, then, a step quieter, its age and who brought it: 12 days · Grabient.",
            "With no title, the age says who brought it after itself while the card is open, in the room it keeps unseen at rest.",
            "Who brought it: Grabient, where the site made the palette: its own collections or an admin's held it first, the gallery held it before anyone liked it, as it holds 2017's, or a script liked it first; an admin by their username, only where their own like brought it; else the first person to like it, only if they chose to show their username.",
            "On touch the tools wait for a tap on the picture, one card at a time.",
            "An article named by its palette, so its Edit is that palette's Edit."
          ]}
        />
      </Block>
    </Section>
  );
}
