import { env } from "cloudflare:workers";
import { msg, t } from "@grabient/i18n";
import { queryOptions } from "@tanstack/solid-query";
import { createIsomorphicFn } from "@tanstack/solid-start";
import { getRequest } from "@tanstack/solid-start/server";
import * as v from "valibot";
import { DEFAULT_FRAME, type ListSort, RISING_FRAMES, type RisingFrame } from "../../lib/orders.ts";
import { getJson, READ_TIMEOUT } from "../../lib/query.ts";
import { listQuery, publicList } from "../../server/gallery/cache.ts";
import { framesOffered, homeHead } from "../../server/gallery/home.ts";
import { searchPool } from "../../server/gallery/search.ts";
import { COLLECTION_LIMIT } from "../collections/params.ts";
import { collectionsQuery } from "../collections/queries.ts";
import type { CollectionPage } from "../collections/types.ts";
import { SEARCH_POOL } from "../search/queries.ts";
import { HomeHead, PalettePage, SavedPage, SearchAnswer } from "./schema.ts";

/* Every read the gallery's pages make, one queryOptions each, shared by the routes' loaders and the pages. The server
   renders from the direct read and its answers ride to the browser in the query cache, so hydration asks for nothing;
   a later navigation, or a preload on intent, asks the API route the edge keeps. A key names the data and never the
   view: a change of style, steps, angle or size redraws the same cards with no request.

   A read that fails resolves to `{ failed }`, the reason in the reader's language, so the page keeps what it showed
   beside the reason and its Retry. A failure is never fresh. Freshness counts from the database read (`fetchedAt`),
   never from the moment an answer reached the browser. */

/* How a page reads the cache without the cache holding the page:
   - Query hands a page's reads to Solid's store, which adopts the objects it is given; adopted, a cached answer
     would hold the page's reactive graph and its DOM for as long as the cache keeps it. A reader takes its own copy
     (`own`), which goes with the page.
   - A query keeps the options its last reader gave it, functions included, so every function a page passes is made
     out here, where it captures no page. */

/** A reader's own copy of what the cache holds. */
export const own = <T>(data: T): T => structuredClone(data);

/** A read that failed: why, in the reader's language, and on the server the status the page answers with. */
export type Failed = { failed: string; status?: number };
/** Whether a read failed, told by its reason alone: the collections' reads the home makes say no status. */
export const failed = (data: object): data is { failed: string } => "failed" in data;

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

const readSearch = createIsomorphicFn()
  .server(
    async (words: string, _signal: AbortSignal): Promise<SearchAnswer | Failed> =>
      searchPool(env, getRequest(), words)
  )
  .client((words: string, signal: AbortSignal) =>
    attempt(
      async () => {
        const response = await fetch(
          `/api/search.json?${new URLSearchParams({ query: words, limit: String(SEARCH_POOL) })}`,
          { signal: AbortSignal.any([signal, AbortSignal.timeout(READ_TIMEOUT)]) }
        );
        const body: unknown = await response.json().catch(() => null);
        /* a search an allowance cut short, or one without its files, is still an answer the page shows */
        const answer = v.safeParse(SearchAnswer, body);
        if (answer.success && [200, 429, 503].includes(response.status)) return answer.output;
        const error = (body as { error?: unknown } | null)?.error;
        throw new Error(t(typeof error === "string" ? error : COULD_NOT_LOAD));
      },
      signal,
      COULD_NOT_LOAD
    )
  );

/** A search's candidates, read once for the words: every order and page of the search is a slice of them. */
export const searchQuery = (words: string) =>
  queryOptions({
    queryKey: ["palettes", "search", words] as const,
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
    reconcile: "kseed",
    select: (data: HomeHead | Failed) => own(data)
  });

const ownPage = (data: CollectionPage | Failed) => own(data);

/** A page of the collections list as the home's feed reads it: the hot order, or searched, the popular one. It is the
    collections list's own read, in the reader's language and with what the model reads of the words, so the home
    searched and the collections list searched show the same collections, from one page the tab holds. */
export const homeCollectionsQuery = (words: string, page: number) => ({
  ...collectionsQuery({
    sort: words ? "popular" : "hot",
    query: words,
    page,
    limit: COLLECTION_LIMIT
  }),
  reconcile: "slug",
  select: ownPage
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
            signal: AbortSignal.any([signal, AbortSignal.timeout(READ_TIMEOUT)])
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
  queryOptions({
    queryKey: ["frames"] as const,
    queryFn: () => readFrames(),
    staleTime: Infinity,
    select: (frames: RisingFrame[]) => [...frames]
  });
