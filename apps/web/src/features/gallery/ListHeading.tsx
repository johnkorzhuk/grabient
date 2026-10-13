import type { Style } from "@grabient/engine/view.ts";
import { rich } from "@grabient/i18n";
import { Text } from "@grabient/ui/Text.tsx";
import { Thumbnail } from "@grabient/ui/Thumbnail.tsx";
import type { Element } from "solid-js";
import styles from "./gallery.module.css";

export interface SearchedPalette {
  stops: readonly string[];
  style: Style;
  angle: number;
  name: string;
  href: string;
}

/** A feed's title, and the words it was searched for after it: the palette searched by stands there as a small picture
    of itself that leads to it. */
export function ListHeading(props: {
  title: string;
  words?: string;
  palette?: SearchedPalette | null;
}) {
  const subject = (words: (string | Element)[]): Element =>
    props.palette ? (
      <Thumbnail
        stops={props.palette.stops}
        style={props.palette.style}
        angle={props.palette.angle}
        name={props.palette.name}
        href={props.palette.href}
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
    </div>
  );
}
