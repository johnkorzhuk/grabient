import { env } from "cloudflare:workers";
import { flagOff } from "@grabient/server/flags/flags.ts";
import { getRequestEvent, isServer } from "@solidjs/web";
import type { QueryClient } from "@tanstack/solid-query";
import { redirect } from "@tanstack/solid-router";
import { createIsomorphicFn } from "@tanstack/solid-start";
import { type CollectionFacts, pageHead } from "../../lib/page-meta.ts";
import { type PaletteOrder, slugWords, sortCollectionItems } from "./address.ts";
import type { ListPlace } from "./CollectionsPage.tsx";
import { COLLECTION_LIMIT, frameOf, intIn, listSearch, listView } from "./params.ts";
import { collectionQuery, collectionsQuery, failed, type ListKey, tagsQuery } from "./queries.ts";
import { listQuery } from "./query.ts";
import type { CollectionDocument, RisingFrame } from "./types.ts";

/* What the collections' routes share: an address read into the place its page draws, the reads a loader puts in the
   query cache before the page renders (so the server renders from them and hydration asks for nothing), and the status
   and robots the answer takes. A page that renders says its status as it renders, on the server: a list past its end,
   a collection that is private or missing, each 404 with its words on screen. */

/** What a loader tells its route beyond the cache it filled. */
export interface Loaded {
  /** the status the rendered page answers with, when it is no 200 */
  status?: number;
  /** what search engines are told, when the page is no index's */
  robots?: string;
}

/** The status the page answers with, said as it renders on the server (server.ts answers with it). */
export function answerWith(status: number | undefined): void {
  if (!isServer || !status) return;
  const event = getRequestEvent();
  if (event) event.locals.status = status;
}

/** Whether an admin turned a Rising frame off. The server reads the flags; a browser's navigation shows the frame. */
const frameOff = createIsomorphicFn()
  .server((frame: RisingFrame) =>
    frame === "1w"
      ? Promise.resolve(false)
      : flagOff(env, frame === "3m" ? "rising-3m" : "rising-1y")
  )
  .client((_frame: RisingFrame) => Promise.resolve(false));

/** A list's address as its page draws it. The Worker made the query canonical before the router read it. */
export function listPlace(
  order: ListPlace["order"],
  frame: string | undefined,
  searchStr: string
): ListPlace {
  const params = new URLSearchParams(searchStr);
  return {
    order,
    frame: frameOf(frame),
    query: listQuery(params.get("q")),
    page: intIn(params.get("page"), 1, 10_000) ?? 1,
    limit: intIn(params.get("limit"), 12, COLLECTION_LIMIT) ?? COLLECTION_LIMIT,
    view: listView(params)
  };
}

/** The public read a list's page draws. */
export const listKey = (place: ListPlace): ListKey => ({
  sort: place.order === "rising" ? "rising" : "popular",
  frame: place.frame,
  query: place.query,
  page: place.page,
  limit: place.limit
});

/** A public list's loader: its page and its tags in the cache. A frame turned off leads to the week's, and a page past
    the end renders its line and answers 404. */
export async function loadList(client: QueryClient, place: ListPlace): Promise<Loaded> {
  if (place.order === "rising" && (await frameOff(place.frame))) {
    const search = listSearch({
      query: place.query,
      view: place.view,
      page: place.page,
      limit: place.limit
    });
    throw redirect({ href: `/collections/rising${search}`, statusCode: 302 });
  }
  const [page] = await Promise.all([
    client.ensureQueryData(collectionsQuery(listKey(place))),
    client.ensureQueryData(tagsQuery(place.query))
  ]);
  if (failed(page)) return {};
  if (place.page > Math.max(1, page.totalPages)) return { status: 404, robots: "noindex,follow" };
  return {};
}

/** What a collection's page says of it in its head, from its own words and counts. */
const factsOf = (doc: CollectionDocument): CollectionFacts => ({
  title: doc.title,
  description: doc.description,
  tags: doc.tags,
  count: doc.itemCount,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
  ...(doc.visibility === "private" ? { unlisted: true } : {})
});

export interface CollectionLoaded extends Loaded {
  facts?: CollectionFacts;
}

/** A collection page's loader: the public collection in the cache. A private one renders its page, which names it so
    and which its owner's browser fills in, and answers 404, as does an account's address that holds nothing. A
    one-segment address that holds nothing is the palette search for its words, in its order and view: only the server
    can tell nothing from a private collection, so a browser's navigation that finds nothing loads the address whole. */
export async function loadCollection(
  client: QueryClient,
  at: { slug: string; order: PaletteOrder; searchStr: string; publicHref: string }
): Promise<CollectionLoaded> {
  const found = await client.ensureQueryData(collectionQuery(at.slug));
  if (failed(found)) return {};
  if (found.doc) return { facts: factsOf(found.doc) };
  if (found.private || at.slug.startsWith("@")) return { status: 404, robots: "noindex,follow" };
  if (!isServer) throw redirect({ href: at.publicHref, reloadDocument: true });
  const params = new URLSearchParams(at.searchStr);
  const search = listSearch(
    { query: listQuery(slugWords(at.slug)), view: listView(params) },
    params.has("selection")
  );
  throw redirect({
    href: `${at.order === "rising" ? "/palettes/rising" : "/palettes"}${search}`,
    statusCode: 301
  });
}

/** The router's search object as the address wrote it, so a page reads its query as the Worker made it canonical. */
export function searchOf(search: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(search)) {
    const one = Array.isArray(value) ? value[0] : value;
    if (one !== undefined) params.set(name, typeof one === "string" ? one : JSON.stringify(one));
  }
  const query = params.toString().replace(/=(?=&|$)/g, "");
  return query ? `?${query}` : "";
}

/** A collection page's head: its title, words and card from its own words and counts, the palettes it lists in the
    address's order, and out of the index where its page is a 404. */
export function collectionHead(
  client: QueryClient,
  at: { slug: string; order: PaletteOrder; search: Record<string, unknown> },
  loaded: CollectionLoaded | undefined
) {
  const found = client.getQueryData(collectionQuery(at.slug).queryKey);
  const doc = found && !failed(found) ? found.doc : null;
  return pageHead({
    kind: "collection",
    slug: at.slug,
    order: at.order,
    view: listView(new URLSearchParams(searchOf(at.search))),
    ...(loaded?.facts ? { collection: loaded.facts } : {}),
    ...(loaded?.robots ? { robots: loaded.robots } : {}),
    ...(doc ? { palettes: sortCollectionItems(doc.items, at.order).map(item => item.kseed) } : {})
  });
}

/** A public list's head: its title for its order, frame, words and page, the collections it lists, and out of the index
    past its end. */
export function listHead(client: QueryClient, place: ListPlace, loaded: Loaded | undefined) {
  const page = client.getQueryData(collectionsQuery(listKey(place)).queryKey);
  if (place.order === "saved")
    return pageHead({
      kind: "own-collections",
      query: place.query,
      page: place.page,
      limit: place.limit
    });
  return pageHead({
    kind: "collections",
    order: place.order,
    frame: place.frame,
    query: place.query,
    page: place.page,
    limit: place.limit,
    view: place.view,
    ...(loaded?.robots ? { robots: loaded.robots } : {}),
    ...(page && !failed(page)
      ? { collections: page.items.map(c => ({ slug: c.slug, title: c.title })) }
      : {})
  });
}
