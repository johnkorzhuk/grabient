import { decodePalette } from "@grabient/engine/codec.ts";
import type { Effect } from "@grabient/engine/effect.ts";
import type { Style } from "@grabient/engine/view.ts";
import { rich } from "@grabient/i18n";
import { ColorCodes } from "@grabient/ui/ColorCodes.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { Thumbnail } from "@grabient/ui/Thumbnail.tsx";
import { type Element, Loading, lazy, Show } from "solid-js";
import styles from "./gallery.module.css";

/* an effect's still comes with a list that plays one, by its export's name, so a page the server drew hydrates it */
const EffectSwatch = lazy(() => import("../list/ListEffects.tsx"), { export: "EffectSwatch" });

export interface SearchedPalette {
  seed: string;
  stops: readonly string[];
  style: Style;
  angle: number;
  /** the effect the list's cards play, in this palette's own shape */
  effect: Effect | null;
  name: string;
  href: string;
}

/** A feed's title, and the words it was searched for after it: the palette searched by stands there as a small picture
    of itself that leads to it, playing the list's effect as the cards do, and the one color searched for by its name or
    its hex, after the words, as its codes. */
export function ListHeading(props: {
  title: string;
  words?: string;
  palette?: SearchedPalette | null;
  color?: { hex: string; name?: string } | null;
}) {
  const subject = (words: (string | Element)[]): Element =>
    props.palette ? (
      <Thumbnail
        stops={props.palette.stops}
        style={props.palette.style}
        angle={props.palette.angle}
        name={props.palette.name}
        href={props.palette.href}
        art={
          props.palette.effect
            ? () => (
                <Loading>
                  <EffectSwatch
                    effect={props.palette!.effect!}
                    palette={decodePalette(props.palette!.seed)!}
                    angle={props.palette!.angle}
                  />
                </Loading>
              )
            : undefined
        }
      />
    ) : (
      <span dir="auto">{words}</span>
    );
  return (
    <div class={styles.heading}>
      <Text variant="title" as="h2" truncate={!props.palette}>
        {props.words
          ? rich(
              "{title}: <subject>{subject}</subject>",
              { subject },
              { title: props.title, subject: props.words }
            )
          : props.title}
      </Text>
      <Show when={props.color}>
        {color => <ColorCodes hex={color().hex} name={color().name} alone />}
      </Show>
    </div>
  );
}
