import { STYLES } from "@grabient/engine/view.ts";
import * as v from "valibot";

/* What the gallery's reads answer, the same on both sides: the Worker writes these shapes and the browser checks the
   answers it is sent against them. */

/** A palette as a list shows it: its own view, its likes and when the site first held it. */
export const PaletteItem = v.object({
  kseed: v.string(),
  style: v.picklist(STYLES),
  steps: v.number(),
  angle: v.number(),
  likes: v.number(),
  createdAt: v.number()
});
export type PaletteItem = v.InferOutput<typeof PaletteItem>;

/** A page of a palette list, with when the database was read for it: its freshness counts from then. */
export const PalettePage = v.object({
  items: v.array(PaletteItem),
  total: v.number(),
  page: v.number(),
  limit: v.number(),
  totalPages: v.number(),
  fetchedAt: v.number()
});
export type PalettePage = v.InferOutput<typeof PalettePage>;

/** A search's candidate: how fast it rises in each frame (a search sorts its pool in the browser) and how well it
    answers the words. */
export const SearchItem = v.object({
  ...PaletteItem.entries,
  rising: v.optional(v.number()),
  rising3m: v.optional(v.number()),
  rising1y: v.optional(v.number()),
  score: v.optional(v.number())
});
export type SearchItem = v.InferOutput<typeof SearchItem>;

/** A search's answer as every page reads it, the public one's and an account's: who answered (words the vocabulary
    reads, colors, a palette's likeness, or the account's search alone) and what a page shows of why. */
export const SearchAnswer = v.object({
  query: v.string(),
  items: v.array(SearchItem),
  tier: v.string(),
  /** only some of the words were read: an account's search reads them all */
  partial: v.optional(v.boolean()),
  /** an allowance ran out: shown, and never kept for anyone */
  limited: v.optional(v.boolean()),
  /** why the model was refused, a message to translate */
  message: v.optional(v.string()),
  /** read without the model a person would have been given (a crawler's): never kept for others */
  unkept: v.optional(v.boolean()),
  /** the words are a page an index may keep: they read as what they mean */
  indexable: v.optional(v.boolean()),
  /** the public collections that hold a palette searched by, each with the colors the pointer shows */
  heldBy: v.optional(
    v.array(v.object({ slug: v.string(), title: v.string(), colors: v.array(v.string()) }))
  ),
  fetchedAt: v.number()
});
export type SearchAnswer = v.InferOutput<typeof SearchAnswer>;

/** How many palettes the home's head holds: the hottest, or searched, the best answers. */
export const HOT_PALETTES = 24;
export const SEARCH_PALETTES = 60;

/** The head of the home: the hottest palettes, or the best answers to its words. */
export const HomeHead = v.object({
  palettes: v.array(SearchItem),
  query: v.optional(v.string()),
  tier: v.optional(v.string()),
  partial: v.optional(v.boolean()),
  limited: v.optional(v.boolean()),
  unkept: v.optional(v.boolean()),
  fetchedAt: v.number()
});
export type HomeHead = v.InferOutput<typeof HomeHead>;

/** A page of an account's saved palettes: each drawn as it was saved, dated by its like. */
export const SavedPage = v.object({
  items: v.array(PaletteItem),
  total: v.number(),
  page: v.number(),
  totalPages: v.number(),
  query: v.optional(v.string()),
  tier: v.optional(v.string()),
  fetchedAt: v.number(),
  /** when its like counts were read, where that is before the page was: the account's copy keeps each as it came */
  countsAt: v.optional(v.number())
});
export type SavedPage = v.InferOutput<typeof SavedPage>;
