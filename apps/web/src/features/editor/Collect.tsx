import { dominantColors } from "@grabient/engine/dominant.ts";
import { CollectPress } from "@grabient/ui/CollectPress.tsx";
import { SaveToCollection } from "@grabient/ui/SaveToCollection.tsx";
import { merge, untrack } from "solid-js";
import { signInUnavailable } from "../../app/connection.ts";
import { toast } from "../../app/toast.ts";
import type { Drawn } from "../../lib/palette.ts";
import { ownCollectionsHolding, ownPaletteWords } from "../account/collections.ts";
import type { ItemView } from "../account/wire.ts";
import { createChecklists } from "../collections/collect.ts";
import { openedIn } from "../collections/navigation.ts";
import { selection } from "../selection/selection.ts";

/* The editor's ways into the account's collections: Add to collection under the check of the palette on screen and of
   each card, the Save side of the selection's export, and the reader's own collections on the sheet's line. They come
   with the first palette selected or the account's copy, so a reader who neither selects nor signs in loads none of it.
   One checklist serves every press of the page; each pick is said on the page's line and is a step of its undo. */
const checklists = createChecklists(toast);

/** Add to collection for a palette as it is drawn. With no connection and no account the press leads nowhere. */
export function AddToCollection(props: { palette: () => Drawn; size?: "sm" | "lg" }) {
  const collect = merge(checklists.card(untrack(() => props.palette)), {
    get disabled() {
      return signInUnavailable();
    }
  });
  return <CollectPress collect={collect} size={props.size} />;
}

/** The selection kept as one of the account's collections: the export column's Save side. */
export function SaveSelection() {
  return (
    <SaveToCollection
      {...checklists.selection(() =>
        selection().map(({ seed, style, steps, angle }) => ({ seed, style, steps, angle }))
      )}
      disabled={signInUnavailable()}
    />
  );
}

/** The account's own collections that hold a palette in any of its views, private ones too, the latest changed first,
    each with its colors: from the account's copy alone, which knows what each holds. None where the copy cannot say. */
export const ownHolding = (seed: string) =>
  (ownCollectionsHolding() ?? [])
    .filter(c => c.seeds.includes(seed))
    .map(c => ({ slug: c.slug, title: c.title, colors: dominantColors(c.seeds) }));

/** The words the account's own collections give a palette, which its page is called by for its owner: those of the
    collection it was opened from, else of the latest changed one that gives it any. */
export const ownWords = (seed: string, view: ItemView) =>
  ownPaletteWords(seed, view, openedIn(seed));
