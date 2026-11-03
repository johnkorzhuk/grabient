import { effectSoftShare } from "@grabient/engine/view.ts";
import { msg } from "@grabient/i18n";
import { type CardCollect, CollectPress } from "@grabient/ui/CollectPress.tsx";
import { FormatStrip, SWATCH_CHIPS } from "@grabient/ui/FormatStrip.tsx";
import { PaletteCard } from "@grabient/ui/PaletteCard.tsx";
import { useNavigate } from "@tanstack/solid-router";
import { createMemo, type Element, onSettled, untrack, useContext } from "solid-js";
import { signInUnavailable, unreachable } from "../../app/connection.ts";
import { inPlace } from "../../app/navigation.ts";
import { relTo } from "../../lib/page-meta.ts";
import type { Drawn } from "../../lib/palette.ts";
import { cardPicture } from "../../lib/picture.ts";
import { shownError } from "../../lib/query.ts";
import { likeCount, liked, noteCounts, readLikeCounts, toggleLike } from "../account/likes.ts";
import { openedFrom } from "../editor/address.ts";
import { savedLook } from "../editor/look.ts";
import { askFacts } from "../editor/page.ts";
import { askCredit, creditName, creditOf } from "../gallery/credit.ts";
import { nameOf, paletteHref, picturedAs } from "../gallery/drawing.ts";
import { similarHref } from "../gallery/similar.ts";
import { cardTakings } from "../gallery/take.ts";
import { cardWords, type Words } from "../gallery/words.ts";
import {
  AppearanceContext,
  cardPlays,
  drawnIn,
  type ListView,
  lookEffect,
  shownEffect
} from "../list/appearance.ts";
import { createCardEffect } from "../list/card-effect.tsx";
import { createSight } from "../list/sight.ts";
import { type UseAt, type UsePlace, useOpened } from "../palette-use/use.ts";
import { roomNote, selected, toggle } from "../selection/selection.ts";
import { rememberOpening } from "./navigation.ts";

/** A palette of a collection as its card, on the collection's page and in a list's group: drawn in the page's view
    over the one the collection saved it in, or playing its effect, its picture following the header's control as it
    is set, and called by the title the collection gives it; liked, selected, collected, copied and opened as on every
    list, each counted with where the card stands. The page adds what is its own: the thumbs, the presses beside Edit,
    and its owner's naming. */
export function ItemCard(props: {
  /** the palette as the collection saved it */
  own: Drawn;
  /** the whole look the collection saved it in, where it kept more than its view: played while the page draws every
      palette as saved */
  look?: string | null;
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
  /** the account's collections as a checklist for the palette the card draws, as a save keeps it */
  collect: (palette: () => Drawn & { look?: string }) => CardCollect;
  /** the page's line: what a press could not do */
  note: (message: string, error?: boolean) => void;
  fit?: Element;
  lead?: Element;
  removed?: boolean;
}) {
  const look = useContext(AppearanceContext)!;
  const navigate = useNavigate();
  const shown = createMemo(() => drawnIn(props.own, props.view));
  /* out of sight, the card keeps the page's view while one is set and takes it with the address */
  const sight = createSight();
  const picture = createMemo(() =>
    sight.inSight()
      ? picturedAs(props.own, props.view, look.draft(), look.peek())
      : picturedAs(props.own, props.view, null, null)
  );
  const seed = () => props.own.seed;
  const words = () => cardWords(shown(), props.words);
  /* the look the collection saved, which the card plays while the page draws every palette as saved */
  const kept = createMemo(() => (props.look ? lookEffect(props.own.seed, props.look) : null));
  const plays = () => cardPlays(props.view, sight.inSight() ? look.draft() : null, seed(), kept());
  const href = () => paletteHref(shown(), props.view.size, plays(), true);
  const similar = () => similarHref(seed());
  /* the palette as a save keeps it: in the view the card shows, with the look it plays where that says more */
  const collect = props.collect(() => {
    const look = savedLook(seed(), shown(), plays());
    return look ? { ...shown(), look } : shown();
  });
  const name = () => props.words?.title ?? nameOf(shown());
  const effect = createCardEffect({
    seed,
    angle: () => picture().angle,
    effect: () => shownEffect(props.view, sight.inSight() ? look.draft() : null, null),
    own: () => (props.view.effect ? null : plays()),
    peek: () => sight.inSight() && look.peek() !== null,
    name
  });
  const take = cardTakings({
    palette: shown,
    played: () => {
      const effect = plays();
      return effect && { effect, size: props.view.size };
    },
    name,
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
      look: savedLook(seed(), shown(), plays()),
      collectionId: props.collection
    }).catch((reason: unknown) => props.note(shownError(reason, msg("Couldn't save.")), true));
  };
  return (
    <PaletteCard
      ref={sight.ref}
      seed={seed()}
      name={name()}
      stops={cardPicture(picture()).stops}
      style={cardPicture(picture()).style}
      at={cardPicture(picture()).at}
      grain={cardPicture(picture()).grain}
      angle={picture().angle}
      picture={effect.picture()}
      blur={effect.picture() && picture().soft ? effectSoftShare(picture().soft ?? 0) : undefined}
      pictureLabel={effect.label()}
      glow={effect.glow()}
      bare={effect.bare()}
      peek={effect.peek()}
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
      similar={{ href: similar(), rel: relTo(similar()), disabled: unreachable(similar()) }}
      onIntent={() => {
        askFacts(seed());
        askCredit(seed());
      }}
      onOpen={e => {
        rememberOpening(seed(), props.collection);
        useOpened(props.place(), shown(), props.at());
        /* the palette's page is told its own view and which parts the page set over it */
        const handed = openedFrom(props.own, props.view);
        if (handed) inPlace(e, () => void navigate({ href: href(), state: handed }));
      }}
      collect={<CollectPress collect={collect} />}
      tools={() => (
        <FormatStrip
          size="sm"
          copy={take.chips().copy}
          download={take.chips().download}
          link={take.chips().link}
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
