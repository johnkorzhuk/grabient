import { msg } from "@grabient/i18n";
import { CollectPress } from "@grabient/ui/CollectPress.tsx";
import { FormatStrip, SWATCH_CHIPS } from "@grabient/ui/FormatStrip.tsx";
import { PaletteCard } from "@grabient/ui/PaletteCard.tsx";
import { useNavigate } from "@tanstack/solid-router";
import { createMemo, type Element, onSettled, untrack, useContext } from "solid-js";
import { signInUnavailable } from "../../app/connection.ts";
import { hexesOf } from "../../lib/palette.ts";
import { shownError } from "../../lib/query.ts";
import { likeCount, liked, toggleLike } from "../account/likes.ts";
import { AppearanceContext, drawnIn } from "../list/appearance.ts";
import { type UseAt, useOpened } from "../palette-use/use.ts";
import { roomNote, selected, toggle } from "../selection/selection.ts";
import { nameOf, ownOf, paletteHref, picturedAs, relativeAge } from "./drawing.ts";
import { inPlace } from "./feed.ts";
import { GalleryContext } from "./page.tsx";
import type { PaletteItem } from "./schema.ts";
import { cardTakings } from "./take.ts";

/** A palette of a gallery list as its card: drawn in the list's view, liked, selected, collected and taken as the
    account's, and opened in the editor in place. Its picture follows the header's control as it is set; its link,
    name, selection and files follow once the address has the view. */
export function GalleryCard(props: {
  item: PaletteItem;
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
  const shown = createMemo(() => drawnIn(ownOf(props.item), page.params()));
  const picture = createMemo(() =>
    picturedAs(ownOf(props.item), page.params(), look.draft(), look.peek())
  );
  const path = () => paletteHref(shown(), page.params().size);
  const where = () => props.at?.() ?? {};
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
      query: page.words() || undefined
    }).catch((reason: unknown) => page.say(shownError(reason, msg("Couldn't save."))));
  const take = cardTakings({ palette: shown, place: page.place, at: where, say: page.say });

  return (
    <PaletteCard
      seed={seed()}
      name={nameOf(shown())}
      stops={hexesOf(picture())}
      style={picture().style}
      angle={picture().angle}
      href={path()}
      age={props.now ? relativeAge(props.item.createdAt, props.now) : ""}
      likes={likeCount(seed(), props.item.likes)}
      liked={liked(seed())}
      onLike={like}
      likeDisabled={signInUnavailable()}
      selected={selected(shown())}
      onSelect={() => {
        if (toggle(shown()) === "made room") page.say(roomNote(1));
      }}
      collect={<CollectPress collect={page.checklists.card(shown)} />}
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
      onOpen={e => {
        useOpened(page.place(), shown(), where());
        inPlace(e, () => void navigate({ href: path() }));
      }}
      fit={props.fit}
      lead={props.lead}
    />
  );
}
