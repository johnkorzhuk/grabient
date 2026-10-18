import { msg } from "@grabient/i18n";
import { type CardCollect, CollectPress } from "@grabient/ui/CollectPress.tsx";
import { FormatStrip, SWATCH_CHIPS } from "@grabient/ui/FormatStrip.tsx";
import { PaletteCard } from "@grabient/ui/PaletteCard.tsx";
import { createMemo, type Element, onSettled, untrack, useContext } from "solid-js";
import { signInUnavailable } from "../../app/connection.ts";
import { relTo } from "../../lib/page-meta.ts";
import { type Drawn, hexesOf } from "../../lib/palette.ts";
import { shownError } from "../../lib/query.ts";
import { likeCount, liked, noteCounts, readLikeCounts, toggleLike } from "../account/likes.ts";
import { askFacts } from "../editor/page.ts";
import { askCredit, creditName, creditOf } from "../gallery/credit.ts";
import { nameOf, paletteHref, picturedAs } from "../gallery/drawing.ts";
import { cardTakings } from "../gallery/take.ts";
import { cardWords, type Words } from "../gallery/words.ts";
import { AppearanceContext, drawnIn, type ListView } from "../list/appearance.ts";
import { type UseAt, type UsePlace, useOpened } from "../palette-use/use.ts";
import { roomNote, selected, toggle } from "../selection/selection.ts";
import { rememberOpening } from "./navigation.ts";

/** A palette of a collection as its card, on the collection's page and in a list's group: drawn in the page's view
    over the one the collection saved it in, its picture following the header's control as it is set, and called by the
    title the collection gives it; liked, selected, collected, copied and opened as on every list, each counted with
    where the card stands. The page adds what is its own: the thumbs, the presses beside Edit, and its owner's naming. */
export function ItemCard(props: {
  /** the palette as the collection saved it */
  own: Drawn;
  /** the words the collection gives it */
  words?: Words;
  /** the owner names it on the card */
  naming?: { max: number; onName: (title: string) => void };
  view: ListView;
  age: string;
  /** its likes as the page read them, and when, shown until the shared counts say more */
  likes: number;
  readAt: number;
  /** the collection the card is in, which an admin's like is told and its palette's page names it by */
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
  const words = () => cardWords(shown(), props.words);
  const href = () => paletteHref(shown(), props.view.size);
  const collect = props.collect(shown);
  const take = cardTakings({
    palette: shown,
    place: () => props.place(),
    at: () => props.at(),
    say: (message, error) => props.note(message, error)
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
      name={props.words?.title ?? nameOf(shown())}
      stops={hexesOf(picture())}
      style={picture().style}
      angle={picture().angle}
      href={href()}
      rel={relTo(href())}
      age={props.age}
      title={words().title}
      called={words().called}
      description={words().description}
      credit={creditName(creditOf(seed()))}
      naming={props.naming}
      likes={likeCount(seed(), props.likes)}
      liked={liked(seed())}
      onLike={like}
      likeDisabled={signInUnavailable()}
      selected={selected(shown())}
      onSelect={() => {
        if (toggle(shown()) === "made room") props.note(roomNote(1));
      }}
      onIntent={() => {
        askFacts(seed());
        askCredit(seed());
      }}
      onOpen={() => {
        rememberOpening(seed(), props.collection);
        useOpened(props.place(), shown(), props.at());
      }}
      collect={<CollectPress collect={collect} />}
      tools={() => (
        <FormatStrip
          size="sm"
          copy={["url", "css", "svg", "png"]}
          download={["md", "css", "svg", "png"]}
          link={["md", "css", "svg", "png"]}
          swatches={SWATCH_CHIPS}
          onCopy={take.copy}
          onDownload={take.download}
          onLink={take.link}
        />
      )}
      fit={props.fit}
      lead={props.lead}
      removed={props.removed}
    />
  );
}
