import { decodePalette } from "@grabient/engine/codec.ts";
import { asSaved } from "@grabient/engine/view.ts";
import { styledName } from "../../lib/page-meta.ts";
import type { Drawn } from "../../lib/palette.ts";
import { accountView } from "../account/state.ts";
import { factsOf } from "../editor/page.ts";
import { nameOf } from "./drawing.ts";

/** A palette's title and what is said of it, where it has either. */
export interface Words {
  title?: string;
  description?: string;
  /** under a title of other words, what the palette's colors call it in the reader's language */
  called?: string;
}

/** What a card calls a palette and says of it: the words its collection gives it (`own`), else the account's own
    name for its save, else the title written for it while it is drawn as it was saved, in every language as it was
    written, once a card's pointer or focus asked for it. A title comes with what the palette's colors call it in the
    reader's language, as its page says under it. A description is a person's own words alone: the one written for a
    palette reads for a search (lib/page-meta.ts), never a person. Reactive. */
export function cardWords(drawn: Drawn, own: Words = {}): Words {
  const facts = factsOf(drawn.seed)?.written;
  const palette = facts ? decodePalette(drawn.seed) : null;
  const written = facts && palette && asSaved(palette, drawn, facts.view) ? facts : undefined;
  const saved = accountView().likes.get(drawn.seed)?.title;
  const title = own.title ?? saved ?? written?.title;
  return {
    ...(title ? { title, called: styledName(nameOf(drawn), drawn.style) } : {}),
    ...(own.description ? { description: own.description } : {})
  };
}
