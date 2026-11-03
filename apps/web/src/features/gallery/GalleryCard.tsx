import { effectSoftShare } from "@grabient/engine/view.ts";
import { msg } from "@grabient/i18n";
import { CollectPress } from "@grabient/ui/CollectPress.tsx";
import { FormatStrip, SWATCH_CHIPS } from "@grabient/ui/FormatStrip.tsx";
import { PaletteCard } from "@grabient/ui/PaletteCard.tsx";
import { useNavigate } from "@tanstack/solid-router";
import { createMemo, type Element, onSettled, untrack, useContext } from "solid-js";
import { signInUnavailable, unreachable } from "../../app/connection.ts";
import { inPlace } from "../../app/navigation.ts";
import { relTo } from "../../lib/page-meta.ts";
import { cardPicture } from "../../lib/picture.ts";
import { shownError } from "../../lib/query.ts";
import { likeCount, liked, toggleLike } from "../account/likes.ts";
import { rememberOpening } from "../collections/navigation.ts";
import { openedFrom } from "../editor/address.ts";
import { savedLook } from "../editor/look.ts";
import { askFacts } from "../editor/page.ts";
import {
  AppearanceContext,
  cardPlays,
  drawnIn,
  lookEffect,
  lookFinish,
  shownEffect
} from "../list/appearance.ts";
import { createCardEffect } from "../list/card-effect.tsx";
import { createSight } from "../list/sight.ts";
import { type UseAt, useOpened } from "../palette-use/use.ts";
import { roomNote, selected, toggle } from "../selection/selection.ts";
import { askCredit, creditName, creditOf } from "./credit.ts";
import { nameOf, ownOf, paletteHref, picturedAs, relativeAge } from "./drawing.ts";
import { GalleryContext } from "./page.tsx";
import type { PaletteItem } from "./schema.ts";
import { similarHref } from "./similar.ts";
import { cardTakings } from "./take.ts";
import { cardWords, type Words } from "./words.ts";

/** A palette of a gallery list as its card: drawn in the list's view, or playing its effect, called by its title where
    it has one, liked, selected, collected and taken as the account's, and opened in the editor in place. Its picture
    follows the header's control as it is set; its link, name, selection and files follow once the address has the
    view. */
export function GalleryCard(props: {
  item: PaletteItem;
  /** the words the collection it stands under gives it */
  words?: Words;
  /** the clock its age is told against; none for a palette no gallery holds yet */
  now?: number;
  /** when its like count was read with its list: asked for again once that is old */
  readAt?: number;
  /** where the card stands, read at a press: its place in its row, and the public collection it stands under */
  at?: () => UseAt;
  /** the reader's say on how the palette fits, before the heart */
  fit?: Element;
  /** an admin's presses beside Edit */
  lead?: Element;
}) {
  const page = useContext(GalleryContext)!;
  const navigate = useNavigate();
  const look = useContext(AppearanceContext)!;
  const seed = () => props.item.kseed;
  /* the soft and the grain the palette's save kept, which the card draws while the list draws every palette as saved */
  const finish = createMemo(() => lookFinish(props.item.look));
  const shown = createMemo(() => drawnIn(ownOf(props.item), page.params(), null, finish()));
  /* out of sight, the card keeps the address's view while one is set and takes it with the address */
  const sight = createSight();
  const picture = createMemo(() =>
    sight.inSight()
      ? picturedAs(ownOf(props.item), page.params(), look.draft(), look.peek(), finish())
      : picturedAs(ownOf(props.item), page.params(), null, null, finish())
  );
  /* the whole look the palette's save kept, which the card plays while the list draws every palette as saved */
  const kept = createMemo(() =>
    props.item.look ? lookEffect(props.item.kseed, props.item.look) : null
  );
  const plays = () =>
    cardPlays(page.params(), sight.inSight() ? look.draft() : null, seed(), kept());
  const path = () => paletteHref(shown(), page.params().size, plays(), true);
  /* the palette as a save keeps it: in the view the card shows, with the look it plays where that says more */
  const saved = () => {
    const look = savedLook(seed(), shown(), plays());
    return look ? { ...shown(), look } : shown();
  };
  const similar = () => similarHref(seed());
  const where = () => props.at?.() ?? {};
  const words = () => cardWords(shown(), props.words);
  const name = () => props.words?.title ?? nameOf(shown());
  const effect = createCardEffect({
    seed,
    angle: () => picture().angle,
    effect: () => shownEffect(page.params(), sight.inSight() ? look.draft() : null, null),
    own: () => (page.params().effect ? null : plays()),
    peek: () => sight.inSight() && look.peek() !== null,
    name
  });
  onSettled(() => {
    const at = untrack(() => props.readAt);
    if (at !== undefined)
      page.counted(
        untrack(() => props.item),
        at
      );
  });

  const like = () =>
    void toggleLike(seed(), !liked(seed()), {
      view: { style: shown().style, steps: shown().steps, angle: shown().angle },
      look: savedLook(seed(), shown(), plays()),
      query: page.words() || undefined
    }).catch((reason: unknown) => page.say(shownError(reason, msg("Couldn't save."))));
  const take = cardTakings({
    palette: shown,
    played: () => {
      const effect = plays();
      return effect && { effect, size: page.params().size };
    },
    name,
    place: page.place,
    at: where,
    say: page.say
  });

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
      href={path()}
      rel={relTo(path())}
      age={props.now ? relativeAge(props.item.createdAt, props.now) : ""}
      title={words().title}
      called={words().called}
      description={words().description}
      credit={creditName(creditOf(seed()))}
      likes={likeCount(seed(), props.item.likes)}
      liked={liked(seed())}
      onLike={like}
      likeDisabled={signInUnavailable()}
      selected={selected(shown())}
      onSelect={() => {
        if (toggle(shown()) === "made room") page.say(roomNote(1));
      }}
      collect={<CollectPress collect={page.checklists.card(saved)} />}
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
      similar={{ href: similar(), rel: relTo(similar()), disabled: unreachable(similar()) }}
      onIntent={() => {
        askFacts(seed());
        askCredit(seed());
      }}
      onOpen={e => {
        const under = where().collection;
        if (under) rememberOpening(seed(), under);
        useOpened(page.place(), shown(), where());
        /* the palette's page is told its own view and which parts the list set over it */
        const handed = openedFrom(ownOf(props.item), page.params());
        inPlace(e, () => void navigate({ href: path(), ...(handed ? { state: handed } : {}) }));
      }}
      fit={props.fit}
      lead={props.lead}
    />
  );
}
