import { DEFAULT_LOCALE, type Locale } from "@grabient/i18n";
import { queryOptions } from "@tanstack/solid-query";
import * as v from "valibot";
import { getJson } from "../../lib/query.ts";

/* The palettes like the one on screen: the search by its seed (the search feature's public answer), which also names
   the public collections that hold it. One answer of up to 96, kept five minutes, which the sheet sorts as the reader
   orders it without asking again. */

const Item = v.object({
  kseed: v.string(),
  style: v.string(),
  steps: v.number(),
  angle: v.number(),
  likes: v.number(),
  createdAt: v.number(),
  rising: v.optional(v.number(), 0),
  rising3m: v.optional(v.number(), 0),
  rising1y: v.optional(v.number(), 0),
  score: v.optional(v.number(), 0)
});
const Answer = v.object({
  items: v.array(Item),
  heldBy: v.optional(
    v.array(
      v.object({
        slug: v.string(),
        title: v.string(),
        colors: v.optional(v.array(v.string()))
      })
    ),
    []
  )
});
export type SimilarItem = v.InferOutput<typeof Item>;
export type Similar = v.InferOutput<typeof Answer>;

export const LIMIT = 96;

export const similarQuery = (seed: string, locale: Locale) =>
  queryOptions({
    queryKey: ["similar", seed, locale],
    queryFn: ({ signal }) =>
      getJson(
        `/api/palettes/search?q=${encodeURIComponent(seed)}&limit=${LIMIT}${locale === DEFAULT_LOCALE ? "" : `&lang=${locale}`}`,
        Answer,
        signal
      ),
    staleTime: 5 * 60_000
  });

/** The answer's palettes in the reader's order: the most liked, or the most risen lately, ties by seed. */
export function ordered(items: readonly SimilarItem[], order: "popular" | "rising"): SimilarItem[] {
  const by = order === "rising" ? (i: SimilarItem) => i.rising : (i: SimilarItem) => i.likes;
  const tie = order === "rising" ? (i: SimilarItem) => i.createdAt : (i: SimilarItem) => i.score;
  return [...items].sort(
    (a, b) =>
      by(b) - by(a) || tie(b) - tie(a) || (a.kseed < b.kseed ? -1 : a.kseed > b.kseed ? 1 : 0)
  );
}
