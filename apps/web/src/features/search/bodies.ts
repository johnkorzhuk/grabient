/* What the page sends the search's routes and what its tags and votes answer, checked on both sides. A search's own
   answer is the gallery's SearchAnswer (gallery/schema.ts), which every page reads it by. */
import * as v from "valibot";

/** where a reader's search is counted: the palette lists, the collections lists, the home */
export const SEARCH_PAGES = ["palettes", "collections", "home"] as const;
export type SearchPage = (typeof SEARCH_PAGES)[number];

/** `POST /api/searched`: a search made with Enter. */
export const SearchedBody = v.object({
  words: v.pipe(v.string(), v.minLength(1)),
  page: v.picklist(SEARCH_PAGES)
});

export const FitVote = v.picklist(["up", "down"]);
export type FitVote = v.InferOutput<typeof FitVote>;

/** `POST /api/me/search-votes`: a palette's fit for a search, or `null` to take a vote back. */
export const SearchVoteBody = v.object({
  q: v.string(),
  seed: v.string(),
  vote: v.nullable(FitVote)
});

/** `GET /api/me/search-votes?q=`: the account's votes for a search, by seed. */
export const SearchVotes = v.object({ votes: v.record(v.string(), FitVote) });

/** A tag under the search field: a search's tag carries its words, and its phrase's English where it says a
    translation. */
export const SearchTag = v.object({
  label: v.string(),
  href: v.string(),
  colors: v.array(v.string()),
  query: v.optional(v.string()),
  english: v.optional(v.string())
});
export const SearchSuggestions = v.object({ suggestions: v.array(SearchTag) });
