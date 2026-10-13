/* What the page sends the search's routes and what they answer, checked on both sides. */
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
