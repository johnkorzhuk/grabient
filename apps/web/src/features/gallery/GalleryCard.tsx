import { PaletteCard } from "@grabient/ui/PaletteCard.tsx";
import { useNavigate } from "@tanstack/solid-router";
import { createMemo } from "solid-js";
import { likeCount, liked, toggleLike } from "../account/likes.ts";
import { selected, toggle } from "../selection/selection.ts";
import type { ListView } from "./address.ts";
import { drawnAs, hexesOf, nameOf, paletteHref, relativeAge } from "./drawing.ts";
import { inPlace } from "./feed.ts";
import type { PaletteItem } from "./schema.ts";

/** A palette of a gallery list as its card: drawn in the list's view, liked and selected as the account's, and
    opened in the editor in place. */
export function GalleryCard(props: {
  item: PaletteItem;
  view: ListView;
  /** the clock its age is told against; none for a palette no gallery holds yet */
  now?: number;
  /** the words the list was searched for, which an admin's like answers */
  words?: string;
  /** why a press could not be done, for the page's line */
  onNote?: (message: string) => void;
}) {
  const navigate = useNavigate();
  const shown = createMemo(() =>
    drawnAs(
      {
        seed: props.item.kseed,
        style: props.item.style,
        steps: props.item.steps,
        angle: props.item.angle
      },
      props.view
    )
  );
  const path = () => paletteHref(shown(), props.view.size);
  const isLiked = () => liked(props.item.kseed);
  return (
    <PaletteCard
      seed={props.item.kseed}
      name={nameOf(shown())}
      stops={hexesOf(shown().seed, shown().steps)}
      style={shown().style}
      angle={shown().angle}
      href={path()}
      age={props.now ? relativeAge(props.item.createdAt, props.now) : ""}
      likes={likeCount(props.item.kseed, props.item.likes)}
      liked={isLiked()}
      onLike={() =>
        void toggleLike(props.item.kseed, !isLiked(), { query: props.words || undefined }).catch(
          (error: unknown) => {
            if (error instanceof Error && error.message) props.onNote?.(error.message);
          }
        )
      }
      selected={selected(shown())}
      onSelect={() => void toggle(shown())}
      onOpen={e => inPlace(e, () => void navigate({ href: path() }))}
    />
  );
}
