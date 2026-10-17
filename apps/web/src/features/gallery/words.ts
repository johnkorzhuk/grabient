import { decodePalette } from "@grabient/engine/codec.ts";
import { asSaved } from "@grabient/engine/view.ts";
import { DEFAULT_LOCALE, locale } from "@grabient/i18n";
import { clipWords } from "../../lib/page-meta.ts";
import type { Drawn } from "../../lib/palette.ts";
import { accountView } from "../account/state.ts";
import { factsOf } from "../editor/page.ts";

/** A palette's title and what is said of it, where it has either. */
export interface Words {
  title?: string;
  description?: string;
}

/** How much of a palette's written description its title's tooltip shows. */
const TIP_WORDS = 200;

/** What a card calls a palette and says of it: the words its collection gives it (`own`), else the account's own
    name for its save, else the words written for it while it is drawn as it was saved, in English once a card's
    pointer or focus asked for them. The written description stands beside the written title alone. Reactive. */
export function cardWords(drawn: Drawn, own: Words = {}): Words {
  const facts = locale() === DEFAULT_LOCALE ? factsOf(drawn.seed)?.written : undefined;
  const palette = facts ? decodePalette(drawn.seed) : null;
  const written = facts && palette && asSaved(palette, drawn, facts.view) ? facts : undefined;
  const saved = accountView().likes.get(drawn.seed)?.title;
  const title = own.title ?? saved ?? written?.title;
  const description =
    own.description ??
    (!own.title && !saved && written?.description
      ? clipWords(written.description, TIP_WORDS)
      : undefined);
  return { ...(title ? { title } : {}), ...(description ? { description } : {}) };
}
