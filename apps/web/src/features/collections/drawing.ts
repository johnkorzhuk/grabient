import { type SizeChoice, type Style, viewSearch } from "@grabient/engine/view.ts";
import { localHref, t } from "@grabient/i18n";
import type { Drawn } from "../../lib/palette.ts";
import { drawnIn, type ListView, type ViewDraft } from "../list/appearance.ts";
import type { CollectionSummary } from "./types.ts";

/* What a collection's pages say of a palette beside what every list says of one (features/gallery/drawing.ts): its
   picture while the header's control is being set, the way into its editor, and who made the collection it is in. */

/** A palette's picture while the header's control sets the page's view: the steps and angle on their way to the
    address at once, and the style a tile previews. Its link, name and selection keep the address's view. */
export function picturedAs(
  own: Drawn,
  view: ListView,
  draft: ViewDraft | null,
  peek: Style | null
): Drawn {
  const drawn = drawnIn(own, view, draft);
  return peek ? { ...drawn, style: peek } : drawn;
}

/** The palette's page in the view it is drawn in, at the size the reader set, in the reader's language. */
export const paletteHref = (p: Drawn, size: SizeChoice | null): string =>
  localHref(`/${p.seed}${viewSearch({ ...p, size })}`);

/** Who made a collection, as a page names them: Grabient for an agent's (its name for an admin), an account by its
    display name, else @username. Never an account's id. */
export const ownerLabel = (owner: CollectionSummary["owner"], admin = false): string =>
  owner.kind === "agent"
    ? admin
      ? t("{name} (agent)", { name: owner.name ?? t("agent") })
      : "Grabient"
    : owner.display || (owner.name ? `@${owner.name}` : t("Grabient user"));
