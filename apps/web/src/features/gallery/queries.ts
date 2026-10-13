import { env } from "cloudflare:workers";
import { msg, t } from "@grabient/i18n";
import { queryOptions } from "@tanstack/solid-query";
import { createIsomorphicFn } from "@tanstack/solid-start";
import { getRequest } from "@tanstack/solid-start/server";
import * as v from "valibot";
import { DEFAULT_FRAME, type ListSort, RISING_FRAMES, type RisingFrame } from "../../lib/orders.ts";
import { getJson } from "../../lib/query.ts";
import { framesOffered, homeHead } from "../../server/gallery/home.ts";
import { listQuery, publicList } from "../../server/gallery/lists.ts";
import { publicCollections, searchPalettes } from "../../server/gallery/seams.ts";
import { COLLECTION_LIMIT, CollectionPage } from "./collections.ts";
import { HomeHead, PalettePage, SavedPage, SearchAnswer } from "./schema.ts";

/* Every read the gallery's pages make, one queryOptions each, shared by the routes' loaders and the pages. The server
   renders from the direct read and its answers ride to the browser in the query cache, so hydration asks for nothing;
   a later navigation, or a preload on intent, asks the API route the edge keeps. A key names the data and never the
   view: a change of style, steps, angle or size redraws the same cards with no request.

   A read that fails resolves to `{ failed }`, the reason in the reader's language, so the page keeps what it showed
   beside the reason and its Retry. A failure is never fresh. Freshness counts from the database read (`fetchedAt`),
   never from the moment an answer reached the browser. */

/** A read that failed: why, in the reader's language, and on the server the status the page answers with. */
export type Failed = { failed: string; status?: number };
export const failed = (data: object): data is Failed => "failed" in data;

const PUBLIC_TTL = 300_000;
const RISING_TTL = 60_000;
const PRIVATE_TTL = 60_000;

/** What freshness reads of a cached answer. */
interface Held {
  state: { data?: object; dataUpdatedAt: number };
}
/** Fresh for `ttl` from the database read that made the answer; an answer an allowance cut short, not at all. */
const freshFor =
  (ttl: number) =>
  (query: Held): number => {
    const data = query.state.data as { fetchedAt?: number; limited?: boolean } | Failed | undefined;
    if (!data || failed(data) || data.limited) return 0;
    const at = query.state.dataUpdatedAt;
    return Math.max(0, ttl - (at - Math.min(data.fetchedAt ?? at, at)));
  };

/** A read in the browser, its failure as a value; a read its last reader let go of is not one. */
async function attempt<T>(
  read: () => Promise<T>,
  signal: AbortSignal,
  fallback: string
): Promise<T | Failed> {
  try {
    return await read();
  } catch (error) {
    if (signal.aborted) throw error;
    return { failed: error instanceof Error && error.message ? error.message : t(fallback) };
  }
}

const COULD_NOT_LOAD = msg("Couldn't load palettes.");

export interface ListKey {
  sort: Exclude<ListSort, "newest" | "oldest">;
  frame: RisingFrame;
  limit: number;
  page: number;
}

const readList = createIsomorphicFn()
  .server(async (key: ListKey, _signal: AbortSignal): Promise<PalettePage | Failed> => {
    const answer = await publicList(getRequest(), listQuery(key));
    if ("refused" in answer) return { failed: t(answer.refused), status: 429 };
    return answer.page;
  })
  .client((key: ListKey, signal: AbortSignal) => {
    const params = new URLSearchParams({
      sort: key.sort,
      page: String(key.page),
      limit: String(key.limit),
      ...(key.sort === "rising" && key.frame !== DEFAULT_FRAME ? { frame: key.frame } : {})
    });
    return attempt(
      () => getJson(`/api/palettes?${params}`, PalettePage, signal),
      signal,
      COULD_NOT_LOAD
    );
  });

/** A page of a public palette list. */
export const listPageQuery = (key: ListKey) =>
  queryOptions({
    queryKey: ["palettes", key.sort, key.frame, key.limit, key.page] as const,
    queryFn: ({ signal }) => readList(key, signal),
    staleTime: freshFor(key.sort === "rising" ? RISING_TTL : PUBLIC_TTL),
    reconcile: "kseed"
  });

const SEARCH_POOL = 96;

const readSearch = createIsomorphicFn()
  .server(async (words: string, _signal: AbortSignal): Promise<SearchAnswer | Failed> => {
    const request = getRequest();
    const answer = await searchPalettes(env, words, { limit: SEARCH_POOL, request });
    return {
      query: words,
      items: answer.items,
      tier: answer.tier,
      ...(answer.partial ? { partial: true } : {}),
      ...(answer.limited ? { limited: true } : {}),
      fetchedAt: Date.now()
    };
  })
  .client((words: string, signal: AbortSignal) =>
    attempt(
      () =>
        getJson(
          `/api/palettes/search?${new URLSearchParams({ q: words, limit: String(SEARCH_POOL) })}`,
          SearchAnswer,
          signal
        ),
      signal,
      COULD_NOT_LOAD
    )
  );

/** A search's candidates, read once for the words: every order and page of the search is a slice of them. */
export const searchQuery = (words: string) =>
  queryOptions({
    queryKey: ["search", words] as const,
    queryFn: ({ signal }) => readSearch(words, signal),
    staleTime: freshFor(PUBLIC_TTL),
    reconcile: "kseed"
  });

const readHead = createIsomorphicFn()
  .server(async (words: string, _signal: AbortSignal): Promise<HomeHead | Failed> => {
    return (await homeHead(env, getRequest(), words)).head;
  })
  .client((words: string, signal: AbortSignal) =>
    attempt(
      () =>
        getJson(
          `/api/hot${words ? `?${new URLSearchParams({ q: words })}` : ""}`,
          HomeHead,
          signal
        ),
      signal,
      msg("Couldn't load the home page.")
    )
  );

/** The head of the home: the hottest palettes, or the best answers to its words. An answer the search could not give
    in full is shown and stale at once, so the next visit asks again. */
export const homeHeadQuery = (words: string) =>
  queryOptions({
    queryKey: ["home", words] as const,
    queryFn: ({ signal }) => readHead(words, signal),
    staleTime: freshFor(PUBLIC_TTL),
    reconcile: "kseed"
  });

export type CollectionOrder = "hot" | "popular";

const readCollections = createIsomorphicFn()
  .server(
    async (
      order: CollectionOrder,
      words: string,
      page: number,
      _signal: AbortSignal
    ): Promise<CollectionPage | Failed> =>
      publicCollections(env, { query: words, sort: order, page, limit: COLLECTION_LIMIT })
  )
  .client((order: CollectionOrder, words: string, page: number, signal: AbortSignal) => {
    const params = new URLSearchParams({
      sort: order,
      page: String(page),
      limit: String(COLLECTION_LIMIT)
    });
    if (words) params.set("q", words);
    return attempt(
      () => getJson(`/api/collections?${params}`, CollectionPage, signal),
      signal,
      msg("Couldn't load collections.")
    );
  });

/** A page of the collections list: the home's feed in the hot order, or searched, the popular one. Stands in for the
    collections area's own read until it lands (U04). */
export const collectionsPageQuery = (order: CollectionOrder, words: string, page: number) =>
  queryOptions({
    queryKey: ["collections", order, words, COLLECTION_LIMIT, page] as const,
    queryFn: ({ signal }) => readCollections(order, words, page, signal),
    staleTime: freshFor(PUBLIC_TTL),
    reconcile: "slug"
  });

export interface SavedKey {
  owner: string;
  words: string;
  limit: number;
  page: number;
}

/** A page of the account's saved palettes. Only the browser asks for it, as the account it is signed in as: the key
    names the owner, so another account's page never shows across a sign-in. */
export const savedQuery = (key: SavedKey) =>
  queryOptions({
    queryKey: ["saved", key.owner, key.words, key.limit, key.page] as const,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ page: String(key.page), limit: String(key.limit) });
      if (key.words) params.set("q", key.words);
      return attempt(
        async () => {
          const response = await fetch(`/api/saved?${params}`, {
            credentials: "same-origin",
            signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)])
          });
          if (!response.ok) {
            throw new Error(
              t(
                response.status === 401
                  ? msg("Sign in to see your saved palettes.")
                  : COULD_NOT_LOAD
              )
            );
          }
          return v.parse(SavedPage, await response.json());
        },
        signal,
        COULD_NOT_LOAD
      );
    },
    staleTime: freshFor(PRIVATE_TTL),
    reconcile: "kseed"
  });

const FramesAnswer = v.object({ frames: v.array(v.picklist(RISING_FRAMES)) });

const readFrames = createIsomorphicFn()
  .server(async (): Promise<RisingFrame[]> => framesOffered(env))
  .client(async (): Promise<RisingFrame[]> => {
    try {
      return (await getJson("/api/frames", FramesAnswer)).frames;
    } catch {
      return [DEFAULT_FRAME];
    }
  });

/** The Rising frames an admin has left on, as the page's document was told them: a page kept at the edge for minutes
    keeps them as long, and a turned-off frame's address leads to the week's list meanwhile. */
export const framesQuery = () =>
  queryOptions({ queryKey: ["frames"] as const, queryFn: () => readFrames(), staleTime: Infinity });
