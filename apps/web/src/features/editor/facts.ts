import { STYLES } from "@grabient/engine/view.ts";
import * as v from "valibot";

const SavedView = v.object({ style: v.picklist(STYLES), steps: v.number(), angle: v.number() });

/** What only the database knows of a palette, for its page (server/editor/facts.ts reads it): the view it was saved
    in, the words written for it that its colors bear out, the public collections that hold it, the most saved first,
    each titled in the page's language where it is translated, and how many like it. The browser checks an answer it is
    sent against this, which keeps only what it names: a fact left out here never reaches the page. */
export const PaletteFacts = v.object({
  /** the gallery's view, else the one the first of Grabient's collections to take it gave it: its canonical address
      draws it. None for a palette neither holds */
  saved: v.optional(SavedView),
  /** in English: a palette's written words are its author's. They describe it in the view it was saved in, and its
      page wears them there alone (lib/page-meta.ts). */
  written: v.optional(
    v.object({
      title: v.string(),
      description: v.optional(v.string()),
      view: SavedView
    })
  ),
  heldBy: v.array(
    v.object({
      slug: v.string(),
      title: v.string(),
      english: v.optional(v.string()),
      colors: v.array(v.string())
    })
  ),
  /** how many like it: 0 for a palette the gallery does not hold, none when the count could not be read */
  likes: v.optional(v.number()),
  /** when the database was read, which a count kept since is weighed against; none in an answer kept from before the
      count was read with the facts */
  readAt: v.optional(v.number())
});
export type PaletteFacts = v.InferOutput<typeof PaletteFacts>;
