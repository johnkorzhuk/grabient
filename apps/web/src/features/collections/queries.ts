import { env } from "cloudflare:workers";
import { locale, msg, t } from "@grabient/i18n";
import { replica } from "@grabient/server/db/d1.ts";
import { queryOptions } from "@tanstack/solid-query";
import { createIsomorphicFn } from "@tanstack/solid-start";
import { getRequest } from "@tanstack/solid-start/server";
import * as v from "valibot";
import { getJson } from "../../lib/query.ts";
import { collectionBySlug, collectionVisibility } from "../../server/collections/read.ts";
import { publicCollections, suggestCollections } from "../../server/collections/search.ts";
import { localizeCollections, translatedLocale } from "../../server/mcp/admin/translations.ts";
import { ownCollectionsPage } from "../account/collections.ts";
import { langQuery, readOwn, readState } from "./client.ts";
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
   a later navigation asks the API route the edge keeps. A failed read resolves to `{ failed }`, its reason in the
   reader's language, so a page keeps what it showed beside the reason and Retry. Freshness counts from the database
   read (`fetchedAt`), never from when an answer reached the browser. */

export type Failed = { failed: string };
export const failed = (data: unknown): data is Failed =>
  typeof data === "object" && data !== null && "failed" in data;

const PUBLIC_TTL = 300_000;
const FRESH_TTL = 60_000;
const PRIVATE_TTL = 60_000;

/** Fresh for `ttl` from the database read that made the answer; a failure never. */
const freshFor =
  (ttl: number) =>
  (query: { state: { data?: unknown; dataUpdatedAt: number } }): number => {
    const data = query.state.data as
      | { fetchedAt?: number; provisional?: boolean }
      | Failed
      | null
      | undefined;
    if (!data || failed(data) || data.provisional) return 0;
    const at = query.state.dataUpdatedAt;
    return Math.max(0, ttl - (at - Math.min(data.fetchedAt ?? at, at)));
  };

async function attempt<T>(
  read: () => Promise<T>,
  signal: AbortSignal | undefined,
  fallback: string
) {
  try {
    return await read();
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      failed: error instanceof Error && error.message ? error.message : t(fallback)
    } as Failed;
  }
}
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
  /** a list's summary of the collection, shown while the collection is read */
  provisional?: boolean;
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
    const [shown] = await localizeCollections(env, asked(), [doc]);
    return { doc: shown ?? doc, fetchedAt: Date.now() };
  })
  .client(async (slug: string, signal?: AbortSignal): Promise<Found | Failed> => {
    const response = await fetch(`/api/collections/${encodeURIComponent(slug)}${lang(true)}`, {
      signal
    }).catch(() => null);
    if (response?.status === 404) return { doc: null, fetchedAt: Date.now() };
    return attempt(
      async () => {
        if (!response?.ok) throw new Error(t("Couldn't load this collection."));
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
    queryFn: ({ signal }) => readCollection(slug, signal),
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
    queryFn: ({ signal }) => readList(key, signal),
    staleTime: freshFor(key.sort === "rising" ? FRESH_TTL : PUBLIC_TTL)
  });

const readTags = createIsomorphicFn()
  .server(async (query: string, _signal?: AbortSignal): Promise<CollectionHit[]> => {
    const hits = await suggestCollections(env, query, query ? 12 : 24);
    return localizeCollections(env, asked(), hits);
  })
  .client(async (query: string, signal?: AbortSignal): Promise<CollectionHit[]> => {
    const params = new URLSearchParams({ q: query, limit: String(query ? 12 : 24) });
    const answer = await getJson(
      `/api/collections/suggest?${params}${lang(false)}`,
      SuggestSchema,
      signal
    ).catch(() => ({ items: [] }));
    return answer.items;
  });

/** The tags under the collections search: the popular collections at rest, the ones whose titles answer the words. */
export const tagsQuery = (query: string) =>
  queryOptions({
    queryKey: ["collection-tags", query] as const,
    queryFn: ({ signal }) => readTags(query, signal),
    staleTime: PUBLIC_TTL
  });

/** A page of the account's own collections: from its copy where the copy can say, else the server's. A search a reader
    made (`model`) goes to the server online, which also reads what the words mean; one typed is read by its letters. */
export const ownQuery = (owner: string, key: CollectionListParams, model = true) =>
  queryOptions({
    queryKey: ["own-collections", owner, key.query, key.limit, key.page, model] as const,
    queryFn: async ({ signal }) => {
      const copy = await ownCollectionsPage(
        { page: key.page, limit: key.limit, query: key.query },
        !model
      );
      if (copy) return { ...copy, sort: "newest" as const, fetchedAt: Date.now() };
      const params = new URLSearchParams({
        page: String(key.page),
        limit: String(Math.min(key.limit, OWN_COLLECTION_LIMIT))
      });
      if (key.query) params.set("q", key.query);
      if (key.query && model) params.set("model", "1");
      return attempt(
        () => readOwn(`?${params}`, signal),
        signal,
        msg("Couldn't load your collections.")
      );
    },
    staleTime: freshFor(PRIVATE_TTL)
  });

/** What a signed-in reader may do on one collection's page: theirs or theirs to curate, their copy, votes and notes. */
export const stateQuery = (owner: string, slug: string) =>
  queryOptions({
    queryKey: ["collection-state", owner, slug] as const,
    queryFn: ({ signal }) =>
      readState(slug, signal).catch(error => (signal.aborted ? Promise.reject(error) : null)),
    staleTime: PRIVATE_TTL
  });

export { COLLECTION_LIMIT };
