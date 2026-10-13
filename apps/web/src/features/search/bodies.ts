/* What the page sends the search's routes and what they answer, checked on both sides. */
import { STYLES } from "@grabient/engine/view.ts";
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

const SearchItem = v.object({
  kseed: v.string(),
  style: v.picklist(STYLES),
  steps: v.number(),
  angle: v.number(),
  likes: v.number(),
  createdAt: v.number(),
  rising: v.optional(v.number()),
  rising3m: v.optional(v.number()),
  rising1y: v.optional(v.number()),
  score: v.number(),
  tags: v.array(v.string())
});

/** A search's answer: its palettes in the order asked, how its words were read, and why it answered as it did. */
export const SearchAnswer = v.object({
  query: v.string(),
  items: v.array(SearchItem),
  tier: v.picklist(["similar", "color", "vocabulary", "named", "model", "account", "unavailable"]),
  indexable: v.boolean(),
  read: v.object({
    phrases: v.array(v.string()),
    unread: v.array(v.string()),
    excluded: v.array(v.string())
  }),
  total: v.number(),
  far: v.optional(v.array(v.string())),
  unkept: v.optional(v.boolean()),
  partial: v.optional(v.boolean()),
  limited: v.optional(v.boolean()),
  retryAfter: v.optional(v.number()),
  /** why the model was refused, a message to translate */
  message: v.optional(v.string()),
  /** the public collections that hold a palette searched by */
  heldBy: v.optional(v.array(v.object({ slug: v.string(), title: v.string() }))),
  fetchedAt: v.optional(v.number())
});
export type SearchAnswer = v.InferOutput<typeof SearchAnswer>;

/** A tag under the search field. */
export const SearchTag = v.object({
  label: v.string(),
  href: v.string(),
  colors: v.array(v.string()),
  query: v.optional(v.string())
});
export const SearchSuggestions = v.object({ suggestions: v.array(SearchTag) });
