/* The search's reads, one queryOptions each, shared by loaders and components. A search answers the whole pool of up to
   96 palettes once per words; a list sorts and pages it in the browser, so another order or page asks nothing again. */
import { env } from "cloudflare:workers";
import { DEFAULT_LOCALE, locale, msg, t } from "@grabient/i18n";
import { queryOptions } from "@tanstack/solid-query";
import { createIsomorphicFn } from "@tanstack/solid-start";
import * as v from "valibot";
import { getJson, READ_TIMEOUT } from "../../lib/query.ts";
import { suggestionsFor } from "../../server/search/tags.ts";
import { SearchAnswer, SearchSuggestions, SearchVotes } from "./bodies.ts";

/** How many palettes a search answers: its orders and pages are cut from these. */
export const SEARCH_POOL = 96;

/* A search's answer, whatever its status: a refused or unavailable search is an answer the page shows (tier account,
   limited, unavailable), never a failure. Anything else fails with the server's message. */
async function readSearch(path: string, signal: AbortSignal): Promise<SearchAnswer> {
  const response = await fetch(path, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(READ_TIMEOUT)])
  });
  const body: unknown = await response.json().catch(() => null);
  const answer = v.safeParse(SearchAnswer, body);
  if (answer.success && [200, 429, 503].includes(response.status)) return answer.output;
  const error = (body as { error?: unknown } | null)?.error;
  throw new Error(t(typeof error === "string" ? error : msg("Something went wrong. Try again.")));
}

const poolPath = (base: string, query: string) =>
  `${base}?${new URLSearchParams({ query, limit: String(SEARCH_POOL) })}`;

/** The public search's pool for these words, the same for everyone and kept at the edge. */
export const searchQuery = (query: string) =>
  queryOptions({
    queryKey: ["search", query],
    queryFn: ({ signal }) => readSearch(poolPath("/api/search.json", query), signal),
    staleTime: 5 * 60_000
  });

/** A signed-in account's search of words the public answer could not read for it (tier account, or partial). */
export const accountSearchQuery = (account: string, query: string) =>
  queryOptions({
    queryKey: ["search", query, "account", account],
    queryFn: ({ signal }) => readSearch(poolPath("/api/me/search", query), signal),
    staleTime: 5 * 60_000
  });

type TagOptions = { both?: boolean; limit?: number };
/* the tags' address, in the page's language: Grabient's own tags and collections are translated */
function tagParams(typed: string, options: TagOptions): URLSearchParams {
  const params = new URLSearchParams({ q: typed, limit: String(options.limit ?? 12) });
  if (options.both) params.set("both", "1");
  if (locale() !== DEFAULT_LOCALE) params.set("lang", locale());
  return params;
}
/* the server renders the tags from the snapshot it holds, so a page shows them from its first paint */
const readSuggestions = createIsomorphicFn()
  .server((typed: string, options: TagOptions, _signal: AbortSignal) =>
    suggestionsFor(env, tagParams(typed, options))
  )
  .client((typed: string, options: TagOptions, signal: AbortSignal) =>
    getJson(`/api/search-suggestions?${tagParams(typed, options)}`, SearchSuggestions, signal).then(
      answer => answer.suggestions
    )
  );

/** The tags under the field for what it holds: the row at rest, typed words' phrases, or a palette's searches. `both`
    is the home's row of searches and collections. */
export const suggestionsQuery = (typed: string, options: TagOptions = {}) =>
  queryOptions({
    queryKey: ["search-suggestions", typed, options.both ?? false, options.limit ?? 12],
    queryFn: ({ signal }) => readSuggestions(typed, options, signal),
    staleTime: typed ? 60 * 60_000 : 5 * 60_000
  });

/** An account's fit votes for a search's words, by seed. */
export const searchVotesQuery = (account: string, query: string) =>
  queryOptions({
    queryKey: ["search-votes", account, query],
    queryFn: ({ signal }) =>
      getJson(
        `/api/me/search-votes?${new URLSearchParams({ q: query })}`,
        SearchVotes,
        signal
      ).then(answer => answer.votes),
    staleTime: 60_000
  });
