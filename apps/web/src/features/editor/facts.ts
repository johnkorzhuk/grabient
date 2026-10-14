import * as v from "valibot";

/** What only the database knows of a palette, for its page (server/editor/facts.ts reads it): the words written for
    it that its colors bear out, and the public collections that hold it, the most saved first, each titled in the
    page's language where it is translated. The browser checks an answer it is sent against this. */
export const PaletteFacts = v.object({
  /** in English: a palette's written words are its author's */
  written: v.optional(v.object({ title: v.string(), description: v.optional(v.string()) })),
  heldBy: v.array(
    v.object({
      slug: v.string(),
      title: v.string(),
      english: v.optional(v.string()),
      colors: v.array(v.string())
    })
  )
});
export type PaletteFacts = v.InferOutput<typeof PaletteFacts>;
