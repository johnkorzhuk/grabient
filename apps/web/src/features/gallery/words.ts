import { decodePalette } from "@grabient/engine/codec.ts";
import { type EffectKind, effectView } from "@grabient/engine/effect.ts";
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
    name for its save, else the title written for it, in whatever view or effect (`effect`) the card draws it and in
    every language as it was written, once a card's pointer or focus asked for it. A title comes with what the
    palette's colors call it in the reader's language, with its style or the effect the card plays. A
    description is a person's own words alone: the one written for a palette reads for a search (lib/page-meta.ts),
    never a person. Reactive. */
export function cardWords(drawn: Drawn, own: Words = {}, effect?: EffectKind | null): Words {
  const written = factsOf(drawn.seed)?.written;
  const saved = accountView().likes.get(drawn.seed)?.title;
  const title = own.title ?? saved ?? written?.title;
  return {
    ...(title ? { title, called: calledOf(drawn, effect) } : {}),
    ...(own.description ? { description: own.description } : {})
  };
}

/** What a card's colors call its palette under a title, as the page it opens names it: with its style, or with the
    effect it plays, its colors read as the effect's page reads them. */
function calledOf(drawn: Drawn, effect?: EffectKind | null): string {
  const P = effect ? decodePalette(drawn.seed) : null;
  return styledName(nameOf(P ? { ...drawn, ...effectView(P) } : drawn), drawn.style, effect);
}
