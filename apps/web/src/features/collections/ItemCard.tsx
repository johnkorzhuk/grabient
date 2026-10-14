import { msg } from "@grabient/i18n";
import { type CardCollect, CollectPress } from "@grabient/ui/CollectPress.tsx";
import { PaletteCard } from "@grabient/ui/PaletteCard.tsx";
import { createMemo, type Element, onSettled, untrack, useContext } from "solid-js";
import { signInUnavailable } from "../../app/connection.ts";
import { type Drawn, hexesOf } from "../../lib/palette.ts";
import { likeCount, liked, noteCounts, readLikeCounts, toggleLike } from "../account/likes.ts";
import { shownError } from "../account/session.ts";
import { nameOf } from "../gallery/drawing.ts";
import { AppearanceContext, drawnIn, type ListView } from "../list/appearance.ts";
import { type UseAt, type UsePlace, useOpened } from "../palette-use/use.ts";
import { roomNote, selected, toggle } from "../selection/selection.ts";
import { paletteHref, picturedAs } from "./drawing.ts";
import { cardTools } from "./tools.tsx";

/** A palette of a collection as its card, on the collection's page and in a list's group: drawn in the page's view
    over the one the collection saved it in, its picture following the header's control as it is set; liked, selected,
    collected, copied and opened as on every list, each counted with where the card stands. The page adds what is its
    own: the thumbs, and the presses beside Edit. */
export function ItemCard(props: {
  /** the palette as the collection saved it */
  own: Drawn;
  view: ListView;
  age: string;
  /** its likes as the page read them, and when, shown until the shared counts say more */
  likes: number;
  readAt: number;
  /** the collection the card stands in, which an admin's like is told */
  collection: string;
  /** the page, and where on it the card stands, read at a press */
  place: () => UsePlace;
  at: () => UseAt;
  /** the account's collections as a checklist for the palette the card draws */
  collect: (palette: () => Drawn) => CardCollect;
  /** the page's line: what a press could not do */
  note: (message: string, error?: boolean) => void;
  fit?: Element;
  lead?: Element;
  removed?: boolean;
}) {
  const look = useContext(AppearanceContext)!;
  const shown = createMemo(() => drawnIn(props.own, props.view));
  const picture = createMemo(() => picturedAs(props.own, props.view, look.draft(), look.peek()));
  const seed = () => props.own.seed;
  const collect = props.collect(shown);
  const tools = cardTools({
    palette: shown,
    place: () => props.place(),
    at: () => props.at(),
    note: (message, error) => props.note(message, error)
  });
  /* a card drawn is on screen or near it: its count starts as the page read it and is asked again where it is old */
  onSettled(() => {
    const read = untrack(() => ({ seed: seed(), likes: props.likes, at: props.readAt }));
    noteCounts([read], read.at);
    void readLikeCounts([read.seed]).catch(() => {});
  });
  const like = () => {
    const { style, steps, angle } = shown();
    toggleLike(seed(), !liked(seed()), {
      view: { style, steps, angle },
      collectionId: props.collection
    }).catch((reason: unknown) => props.note(shownError(reason, msg("Couldn't save.")), true));
  };
  return (
    <PaletteCard
      seed={seed()}
      name={nameOf(shown())}
      stops={hexesOf(picture())}
      style={picture().style}
      angle={picture().angle}
      href={paletteHref(shown(), props.view.size)}
      age={props.age}
      likes={likeCount(seed(), props.likes)}
      liked={liked(seed())}
      onLike={like}
      likeDisabled={signInUnavailable()}
      selected={selected(shown())}
      onSelect={() => {
        if (toggle(shown()) === "made room") props.note(roomNote(1));
      }}
      onOpen={() => useOpened(props.place(), shown(), props.at())}
      collect={<CollectPress collect={collect} />}
      tools={tools}
      fit={props.fit}
      lead={props.lead}
      removed={props.removed}
    />
  );
}
