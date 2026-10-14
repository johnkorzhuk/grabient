import { env } from "cloudflare:workers";
import { locale, msg } from "@grabient/i18n";
import { replica } from "@grabient/server/db/d1.ts";
import { isServer } from "@solidjs/web";
import { queryOptions } from "@tanstack/solid-query";
import { createIsomorphicFn } from "@tanstack/solid-start";
import { getRequest } from "@tanstack/solid-start/server";
import { untrack } from "solid-js";
import * as v from "valibot";
import { offline } from "../../app/connection.ts";
import { attempt, type Failed, failed, freshFor, getJson } from "../../lib/query.ts";
import { collectionBySlug, collectionVisibility } from "../../server/collections/read.ts";
import { publicCollections, suggestCollections } from "../../server/collections/search.ts";
import {
  localizeCollections,
  localizeDocument,
  translatedLocale
} from "../../server/mcp/admin/translations.ts";
import {
  ownCollectionMoved,
  ownCollectionsPage,
  ownsCollection,
  ownsCollectionSoon
} from "../account/collections.ts";
import { engineNow, keptUserId } from "../account/session.ts";
import { onAccountChange, viewNow } from "../account/state.ts";
import { langQuery, readOwn, readState, statusOf } from "./client.ts";
import { COLLECTION_LIMIT, type CollectionListParams, OWN_COLLECTION_LIMIT } from "./params.ts";
import {
  type CollectionDocument,
  CollectionDocumentSchema,
  type CollectionHit,
  type CollectionPage,
  CollectionPageSchema,
  SuggestSchema
} from "./types.ts";

/* Every read the collections' pages make, one queryOptions each, shared by the routes' loaders and the pages. The server
   renders from the direct read and its answers ride to the browser in the query cache, so hydration asks for nothing;
   a later navigation asks the API route the edge keeps. A failed read resolves to `{ failed }` (lib/query.ts) beside
   what the cache held for it, so a page goes on showing that with the reason and Retry. */

const PUBLIC_TTL = 300_000;
const FRESH_TTL = 60_000;
const PRIVATE_TTL = 60_000;

/** A read's answer, or its failure beside the answer the cache held for the same read. */
const keeping = <T>(answer: T | Failed, held: unknown): T | Failed =>
  failed(answer) && typeof held === "object" && held !== null
    ? { ...(held as T), ...answer }
    : answer;
const asked = () => translatedLocale(locale());
const lang = (first: boolean) => {
  const q = langQuery();
  return q ? `${first ? "?" : "&"}${q}` : "";
};

/** One public collection, and whether a collection lives at its address that the reader cannot see (a private one). */
export interface Found {
  doc: CollectionDocument | null;
  /** a private collection lives here: the page names it so, and its owner's browser fills it in */
  private?: boolean;
  /** the account's copy holds the collection that lives here, which its page draws from the copy */
  own?: boolean;
  /** a list's summary of the collection, shown while the collection is read */
  provisional?: boolean;
  /** the languages besides English one of Grabient's reads in, which the server's read says: its page is indexed in
      each */
  languages?: readonly string[];
  fetchedAt: number;
}

const readCollection = createIsomorphicFn()
  .server(async (slug: string, _signal?: AbortSignal): Promise<Found | Failed> => {
    const db = { DB: replica(env) };
    const doc = await collectionBySlug(db, slug);
    if (!doc)
      return {
        doc: null,
        private: (await collectionVisibility(db, slug)) === "private",
        fetchedAt: Date.now()
      };
    const { doc: shown, languages } = await localizeDocument(env, asked(), doc);
    return { doc: shown, ...(languages.length ? { languages } : {}), fetchedAt: Date.now() };
  })
  .client(async (slug: string, signal?: AbortSignal): Promise<Found | Failed> => {
    /* The account's own is read as its own, from the browser's copy: at once when the copy is open, and asked beside
       the public read otherwise, since a connection that is not there fails that read. So is an address one of them
       moved from, which leads on to it. */
    const own = { doc: null, own: true, fetchedAt: Date.now() };
    if (untrack(() => ownsCollection(slug) || ownCollectionMoved(slug))) return own;
    const [mine, response] = await Promise.all([
      keptUserId() ? ownsCollectionSoon(slug).catch(() => false) : false,
      fetch(`/api/collections/${encodeURIComponent(slug)}${lang(true)}`, { signal }).catch(
        () => null
      )
    ]);
    if (mine) return own;
    if (response?.status === 404) return { doc: null, fetchedAt: Date.now() };
    return attempt(
      async () => {
        // a read that never reached the server, or that it could not answer, says the page's own words
        if (!response?.ok) throw new Error();
        return {
          doc: v.parse(CollectionDocumentSchema, await response.json()),
          fetchedAt: Date.now()
        };
      },
      signal,
      msg("Couldn't load this collection.")
    );
  });

/** One public collection by its address. */
export const collectionQuery = (slug: string) =>
  queryOptions({
    queryKey: ["collection", slug] as const,
    queryFn: ({ signal, client, queryKey }) =>
      readCollection(slug, signal).then(found => keeping(found, client.getQueryData(queryKey))),
    staleTime: freshFor(PUBLIC_TTL)
  });

export interface ListKey extends CollectionListParams {
  /** a search a reader made, which may read words through the model */
  model?: boolean;
}

const readList = createIsomorphicFn()
  .server(async (key: ListKey, _signal?: AbortSignal): Promise<CollectionPage | Failed> => {
    const page = await publicCollections(env, key, {
      model: !!key.query,
      request: getRequest()
    });
    return { ...page, items: await localizeCollections(env, asked(), page.items) };
  })
  .client((key: ListKey, signal?: AbortSignal) => {
    const params = new URLSearchParams({
      sort: key.sort,
      page: String(key.page),
      limit: String(key.limit)
    });
    if (key.query) params.set("q", key.query);
    if (key.sort === "rising" && key.frame && key.frame !== "1w") params.set("frame", key.frame);
    if (key.query) params.set("model", "1");
    return attempt(
      () =>
        getJson(`/api/collections?${params}${lang(false)}`, CollectionPageSchema, signal).then(
          page => ({
            ...page,
            fetchedAt: Math.min(page.fetchedAt, Date.now())
          })
        ),
      signal,
      msg("Couldn't load collections.")
    );
  });

/** A page of the public collections, or of a search of them. */
export const collectionsQuery = (key: ListKey) =>
  queryOptions({
    queryKey: ["collections", key.sort, key.frame ?? "1w", key.query, key.limit, key.page] as const,
    queryFn: ({ signal, client, queryKey }) =>
      readList(key, signal).then(page => keeping(page, client.getQueryData(queryKey))),
    staleTime: freshFor(key.sort === "rising" ? FRESH_TTL : PUBLIC_TTL)
  });

const readTags = createIsomorphicFn()
  .server(async (query: string, _signal?: AbortSignal): Promise<CollectionHit[]> => {
    const hits = await suggestCollections(env, query, query ? 12 : 24);
    return localizeCollections(env, asked(), hits);
  })
  .client((query: string, signal?: AbortSignal): Promise<CollectionHit[] | null> => {
    const params = new URLSearchParams({ q: query, limit: String(query ? 12 : 24) });
    return getJson(`/api/collections/suggest?${params}${lang(false)}`, SuggestSchema, signal).then(
      answer => answer.items,
      () => null
    );
  });

/** The tags under the collections search: the popular collections at rest, the ones whose titles answer the words.
    None where they could not be read, which is never fresh: the next page that shows the row asks again, as does the
    connection's return. */
export const tagsQuery = (query: string) =>
  queryOptions({
    queryKey: ["collection-tags", query] as const,
    queryFn: ({ signal }) => readTags(query, signal),
    staleTime: query => (query.state.data === null ? 0 : PUBLIC_TTL),
    refetchOnReconnect: true
  });

/* The account's own pages are kept a minute, for a list returned to; any change to its collections (a pick, an edit,
   one made or deleted, here, on another page or in another tab) starts them anew. */
let ownChanges = 0;

/** A page of the account's own collections: from its copy where the copy can say, else the server's. A search a reader
    made (`model`) goes to the server online, which also reads what the words mean; one typed is read by its letters. */
export const ownQuery = (owner: string, key: CollectionListParams, model = true) =>
  queryOptions({
    queryKey: [
      "own-collections",
      owner,
      ownChanges,
      key.query,
      key.limit,
      key.page,
      model
    ] as const,
    queryFn: async ({ signal }) => {
      const asked = { page: key.page, limit: key.limit, query: key.query };
      /* the copy reads its words by their letters: as the reader types, with no connection, and when the server could
         not be reached */
      const copied = async (letters: boolean) => {
        const copy = await ownCollectionsPage(asked, letters);
        return copy && { ...copy, sort: "newest" as const, fetchedAt: Date.now() };
      };
      const copy = await copied(!model || offline());
      if (copy) return copy;
      const params = new URLSearchParams({
        page: String(key.page),
        limit: String(Math.min(key.limit, OWN_COLLECTION_LIMIT))
      });
      if (key.query) params.set("q", key.query);
      if (key.query && model) params.set("model", "1");
      return attempt(
        () =>
          readOwn(`?${params}`, signal).catch(async (error: unknown) => {
            const local = statusOf(error) || signal.aborted ? null : await copied(true);
            if (local) return local;
            throw error;
          }),
        signal,
        msg("Couldn't load your collections.")
      );
    },
    staleTime: freshFor(PRIVATE_TTL)
  });

/* What a reader may do on a collection is kept a minute, for a page returned to. It moves with what the account does:
   how its saved copy stands moves with the account's collections (one made, deleted or moved since, on this page, on
   another or in another tab, and what was kept may name a copy that is gone, or none where one was made), and its
   votes, notes and an admin's curation with each write a page makes. Each such change starts the kept answers anew.
   What the copy holds before it has heard from the server, and what it first says once it has, is its opening and no
   change. */
let states = 0;
/** The account changed what a collection's page reads of it (a copy made or taken back, a vote, a note, a palette
    curated): what was kept of every collection's state is old. */
export const forgetStates = () => void states++;
let ownAddresses: string | null = null;
if (!isServer)
  onAccountChange(change => {
    if (change.reset || change.collections.size || change.removed.size || change.moved.size)
      ownChanges++;
    const user = keptUserId();
    if (!user || !engineNow()?.copyReady(user)) return;
    const now = [...viewNow().collections.keys()].sort().join(" ");
    if (ownAddresses !== null && now !== ownAddresses) forgetStates();
    ownAddresses = now;
  });

/** What a signed-in reader may do on one collection's page: theirs or theirs to curate, their copy, votes and notes. */
export const stateQuery = (owner: string, slug: string) =>
  queryOptions({
    queryKey: ["collection-state", owner, slug, states] as const,
    queryFn: ({ signal }) =>
      readState(slug, signal).catch(error => (signal.aborted ? Promise.reject(error) : null)),
    staleTime: PRIVATE_TTL
  });

export { COLLECTION_LIMIT };
