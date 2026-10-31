import { env, waitUntil } from "cloudflare:workers";
import { msg, t } from "@grabient/i18n";
import { isServer } from "@solidjs/web";
import { queryOptions } from "@tanstack/solid-query";
import { createIsomorphicFn } from "@tanstack/solid-start";
import { getRequest } from "@tanstack/solid-start/server";
import { untrack } from "solid-js";
import * as v from "valibot";
import { offline } from "../../app/connection.ts";
import { DEFAULT_FRAME, type ListSort, RISING_FRAMES, type RisingFrame } from "../../lib/orders.ts";
import {
  attempt,
  type Failed,
  failed,
  freshFor,
  getJson,
  READ_TIMEOUT,
  readAnswer
} from "../../lib/query.ts";
import { framesOffered, homeHead } from "../../server/gallery/home.ts";
import { listPalettes } from "../../server/gallery/list.ts";
import { searchPool } from "../../server/gallery/search.ts";
import { engineNow } from "../account/session.ts";
import { onAccountChange, viewNow } from "../account/state.ts";
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

export { type Failed, failed };

const PUBLIC_TTL = 300_000;
const RISING_TTL = 60_000;
const PRIVATE_TTL = 60_000;

const COULD_NOT_LOAD = msg("Couldn't load palettes.");

export interface ListKey {
  sort: Exclude<ListSort, "newest" | "oldest">;
  frame: RisingFrame;
  limit: number;
  page: number;
}

const readList = createIsomorphicFn()
  .server(async (key: ListKey, _signal: AbortSignal): Promise<PalettePage | Failed> => {
    const request = getRequest();
    // the record loads with the first list read (routes/api/palettes.ts)
    const { listQuery, publicList } = await import("../../server/gallery/cache.ts");
    return publicList(env, request, listQuery(key), waitUntil, listPalettes);
  })
  .client((key: ListKey, signal: AbortSignal) => {
    const params = new URLSearchParams({
      sort: key.sort,
      page: String(key.page),
      limit: String(key.limit),
      ...(key.sort === "rising" && key.frame !== DEFAULT_FRAME ? { frame: key.frame } : {})
    });
    return attempt(
      () => readAnswer(`/api/palettes?${params}`, PalettePage, signal),
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
      () =>
        readAnswer(
          `/api/search.json?${new URLSearchParams({ query: words, limit: String(SEARCH_POOL) })}`,
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
        readAnswer(
          `/api/hot?${new URLSearchParams({ ...(words ? { q: words } : {}), head: "1" })}`,
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

/* Saved's pages are kept a minute, for a list returned to, while the account's likes stand as they were read: a like
   made or taken back anywhere since (on any page, in another tab, on another device) has them read again. */
let likesMovedAt = 0;
if (!isServer)
  onAccountChange(change => {
    if (change.reset || change.likes.size) likesMovedAt = Date.now();
  });

/* the copy's model, loaded with the list it draws (no other page of the gallery needs it) and kept, so a return to
   Saved draws from the copy at once */
let model: typeof import("../account/saved.ts") | undefined;

/** A page of Saved from the account's copy, at once: none until this tab has read Saved, while the copy is not open
    here or has not heard from the server, and for words the server ranks. */
export function savedNow(key: SavedKey): SavedPage | undefined {
  if (!model || !engineNow()?.copyReady(key.owner)) return undefined;
  /* the connection as the page is read: a page read once follows no later change of it */
  const copied = model.savedPageOf(
    viewNow(),
    { page: key.page, limit: key.limit, query: key.words },
    untrack(offline)
  );
  if (!copied) return undefined;
  /* a like's count is as old as the sync that brought it, so every count is asked for again */
  return { ...copied, items: [...copied.items], fetchedAt: Date.now(), countsAt: 0 };
}

/** A page of the account's saved palettes. Only the browser asks for it, as the account it is signed in as: the key
    names the owner, so another account's page never shows across a sign-in. The account's copy answers where it can,
    at once and with no connection, with the likes not yet sent; words are the server's to rank while there is one. */
export const savedQuery = (key: SavedKey) =>
  queryOptions({
    queryKey: ["saved", key.owner, key.words, key.limit, key.page] as const,
    queryFn: async ({ signal }): Promise<SavedPage | Failed> => {
      model ??= await import("../account/saved.ts");
      if (await model.savedReady()) {
        const copied = savedNow(key);
        if (copied) return copied;
      }
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
    staleTime: query =>
      query.state.dataUpdatedAt > likesMovedAt ? freshFor(PRIVATE_TTL)(query) : 0,
    reconcile: "kseed"
  });

const FramesAnswer = v.object({ frames: v.array(v.picklist(RISING_FRAMES)) });
/* what stands for the frames when they could not be read: the week alone */
const UNREAD: RisingFrame[] = [DEFAULT_FRAME];

const readFrames = createIsomorphicFn()
  .server(async (): Promise<RisingFrame[]> => framesOffered(env))
  .client(async (): Promise<RisingFrame[]> => {
    try {
      return (await getJson("/api/frames", FramesAnswer)).frames;
    } catch {
      return UNREAD;
    }
  });

/** The Rising frames an admin has left on, as the page's document was told them: a page kept at the edge for minutes
    keeps them as long, and a turned-off frame's address leads to the week's list meanwhile. Frames that could not be
    read are the week alone until the next page that reads them asks again, or the connection returns. */
export const framesQuery = () =>
  queryOptions({
    queryKey: ["frames"] as const,
    queryFn: () => readFrames(),
    staleTime: query => (query.state.data === UNREAD ? 0 : Infinity),
    // an answer of the week alone replaces the stand-in, which structural sharing would keep
    structuralSharing: false,
    refetchOnReconnect: true,
    select: (frames: RisingFrame[]) => [...frames]
  });
