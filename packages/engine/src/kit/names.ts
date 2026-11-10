/* What each field effect is called (kit/kinds.ts): its name on the Appearance menu's tile, and the words that stand in
   a gradient's style's place in a palette's title ("Pastel pink and blue sandstone"), lower case as the menu's label.
   English as written, each a message a page says in its reader's language. Read by effect.ts (EFFECT_WORDS), which
   every page's start loads, and by the editor's names (features/editor/effect-page.ts), so it holds the words alone. */
import { msg } from "../message.ts";
import type { KitKind } from "./kinds.ts";

export const KIT_LABELS: Readonly<Record<KitKind, string>> = {
  strata: msg("Sandstone")
};

export const KIT_WORDS: Readonly<Record<KitKind, string>> = {
  strata: msg("sandstone")
};
