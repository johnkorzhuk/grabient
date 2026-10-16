import { localHref } from "@grabient/i18n";
import { isServer } from "@solidjs/web";
import type { QueryClient } from "@tanstack/solid-query";
import { redirect } from "@tanstack/solid-router";
import { createIsomorphicFn } from "@tanstack/solid-start";
import { getRequest } from "@tanstack/solid-start/server";
import type { FramedData } from "../../app/shell.ts";
import { parseSort } from "../../lib/orders.ts";
import { type CollectionFacts, type Page, pageHead } from "../../lib/page-meta.ts";
import type { Drawn } from "../../lib/palette.ts";
import { type Failed, failed } from "../../lib/query.ts";
import { searchOf } from "../../lib/route.ts";
import { listWords } from "../../lib/words.ts";
import { ownOf } from "../gallery/drawing.ts";
import { framesQuery } from "../gallery/queries.ts";
import { drawnIn, type ListView } from "../list/appearance.ts";
import { collectionHref, type PaletteOrder, slugWords, sortCollectionItems } from "./address.ts";
import { inputOf } from "./client.ts";
import {
  COLLECTION_LIMIT,
  frameOf,
  intIn,
  type ListPlace,
  listKey,
  listSearch,
  pageSearch,
  viewOf
} from "./params.ts";
import { collectionQuery, collectionsQuery, type Found, tagsQuery } from "./queries.ts";
import type { CollectionDocument, CollectionPage } from "./types.ts";

/* What the collections' routes share: an address read into the place its page draws, the reads a loader puts in the
   query cache before the page renders (so the server renders from them and hydration asks for nothing), and the status
   and robots the answer takes. A redirect names its address in the reader's language, which the router leaves to it.
   A page that renders says its status as it renders, on the server: a list past its end, a collection that is private
   or missing, each 404 with its words on screen. */

/** What a loader tells its route beyond the cache it filled: the frame takes `paint`, the page's first palettes. */
export interface Loaded extends FramedData {
  /** the status the rendered page answers with, when it is no 200 */
  status?: number;
  /** what search engines are told, when the page is no index's */
  robots?: string;
  /** a search whose words were read in part for now (a crawler's, or past an allowance): no cache keeps the page */
  unkept?: boolean;
  /** the collections a public list's page lists, which its head names: a head is drawn in the browser before its
      cache holds the page, and it must say what the server's said */
  collections?: readonly { slug: string; title: string }[];
}

/** The bar and the water read at most this many palettes. */
const PAINTED = 8;

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
    query: listWords(params.get("q")),
    page: intIn(params.get("page"), 1, 10_000) ?? 1,
    limit: intIn(params.get("limit"), 12, COLLECTION_LIMIT) ?? COLLECTION_LIMIT,
    view: viewOf(params)
  };
}

/** What a list hands the frame: the first two palettes of each of its first collections, as its cards draw them. */
export const listPaint = (items: CollectionPage["items"], view: ListView) =>
  items
    .flatMap(collection => collection.preview.slice(0, 2))
    .slice(0, PAINTED)
    .map(palette => drawnIn(inputOf(palette), view));

/** A public list's loader: its page, its tags and the frames Rising offers in the cache. A frame turned off leads to
    the week's, with the selection still open where the address opened it, and a page past the end renders its line and
    answers 404. */
export async function loadList(
  client: QueryClient,
  place: ListPlace,
  selection?: boolean
): Promise<Loaded> {
  const offered = await client.ensureQueryData(framesQuery());
  if (place.order === "rising" && !offered.includes(place.frame)) {
    const search = listSearch(
      { query: place.query, view: place.view, page: place.page, limit: place.limit },
      selection
    );
    throw redirect({ href: localHref(`/collections/rising${search}`), statusCode: 302 });
  }
  const [page] = await Promise.all([
    client.ensureQueryData(collectionsQuery(listKey(place))),
    client.ensureQueryData(tagsQuery(place.query))
  ]);
  if (failed(page)) return {};
  const listed = {
    paint: listPaint(page.items, place.view),
    collections: page.items.map(c => ({ slug: c.slug, title: c.title }))
  };
  if (place.page > Math.max(1, page.totalPages))
    return { status: 404, robots: "noindex,follow", ...listed };
  return page.unkept ? { ...listed, unkept: true } : listed;
}

/* Whether a request comes with no session's cookie, so its reader is signed out for certain: read on the account's
   own page alone, which no cache keeps. The session itself is the browser's to ask for. */
const noSession = createIsomorphicFn()
  .server(
    (): boolean | undefined =>
      !/(?:^|;\s*)[\w.-]*session_token=/.test(getRequest().headers.get("Cookie") ?? "")
  )
  .client((): boolean | undefined => undefined);

/** Saved's loader: the tags and Rising's frames in the cache, and whether the reader is plainly signed out, so the
    server draws the way in where the collections would stand. The account's own are read in the browser. */
export async function loadSaved(client: QueryClient): Promise<{ signedOut?: boolean }> {
  await Promise.all([client.ensureQueryData(framesQuery()), client.ensureQueryData(tagsQuery(""))]);
  return { signedOut: noSession() };
}

/** What a collection's page says of it in its head, from its own words and counts, and the languages it reads in. */
const factsOf = (doc: CollectionDocument, languages?: readonly string[]): CollectionFacts => ({
  title: doc.title,
  description: doc.description,
  tags: doc.tags,
  count: doc.itemCount,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
  ...(doc.visibility === "private" ? { unlisted: true } : {}),
  ...(languages?.length ? { languages } : {})
});

export interface CollectionLoaded extends Loaded {
  facts?: CollectionFacts;
  /** the palettes the collection lists in the address's order, each in the view it saved it in, which its head names */
  palettes?: readonly Drawn[];
  /** nothing public lives here and the request came with no session: nobody here can be a private one's owner */
  signedOut?: boolean;
}

/** A collection page's loader: the public collection in the cache. A private one renders its page, which names it so
    and which its owner's browser fills in, and answers 404, as does an account's address that holds nothing. A
    one-segment address that holds nothing leads, for now, to the palette search for its words, in its order and view
    (an old link's newer `?sort=` is Rising's): a collection may take the address tomorrow. Only the server can tell
    nothing from a private collection, so a browser's navigation that finds nothing loads the address whole. */
export async function loadCollection(
  client: QueryClient,
  at: { slug: string; order: PaletteOrder; searchStr: string; publicHref: string }
): Promise<CollectionLoaded> {
  const query = collectionQuery(at.slug);
  if (!isServer && !client.getQueryData(query.queryKey)) {
    const shown = summaryOf(client, at.slug);
    if (shown) client.setQueryData(query.queryKey, shown);
  }
  const found = await client.ensureQueryData(query);
  if (failed(found)) return {};
  const params = new URLSearchParams(at.searchStr);
  const here = found.doc || found.private || found.own || at.slug.startsWith("@");
  /* a collection lives here: an old link's order is none of its page's */
  if (here && params.has("sort"))
    throw redirect({
      href: localHref(
        collectionHref(at.slug, at.order) + pageSearch(viewOf(params), params.has("selection"))
      ),
      statusCode: 301
    });
  if (found.doc) {
    const ordered = sortCollectionItems(found.doc.items, at.order);
    return {
      facts: factsOf(found.doc, found.languages),
      languages: found.languages ?? [],
      palettes: ordered.map(ownOf),
      paint: ordered.slice(0, PAINTED).map(item => drawnIn(inputOf(item), viewOf(params)))
    };
  }
  if (here) return { status: 404, robots: "noindex,follow", signedOut: noSession() };
  if (!isServer) throw redirect({ href: at.publicHref, reloadDocument: true });
  const search = listSearch(
    { query: listWords(slugWords(at.slug)), view: viewOf(params) },
    params.has("selection")
  );
  const rising = at.order === "rising" || parseSort(params.get("sort")) !== "popular";
  throw redirect({
    href: localHref(`${rising ? "/palettes/rising" : "/palettes"}${search}`),
    statusCode: 302
  });
}

/* A list this tab read holds the collection's summary: its page shows it at once, provisional and never fresh, while
   the whole collection is read. A list's first palettes are its page's first, so the cards stay where they stand. */
function summaryOf(client: QueryClient, slug: string): Found | null {
  const pages = [
    ...client.getQueriesData<CollectionPage | Failed>({ queryKey: ["collections"] }),
    ...client.getQueriesData<CollectionPage | Failed>({ queryKey: ["own-collections"] })
  ];
  for (const [, page] of pages) {
    if (!page || failed(page)) continue;
    const summary = page.items.find(item => item.slug === slug);
    if (!summary) continue;
    const { preview, ...words } = summary;
    return {
      doc: {
        ...words,
        items: preview.map((item, i) => ({
          kseed: item.seed,
          style: item.style,
          steps: item.steps,
          angle: item.angle,
          likes: item.likes ?? 0,
          createdAt: item.createdAt ?? summary.updatedAt,
          position: item.position ?? i,
          ...(item.rising ? { rising: item.rising } : {})
        }))
      },
      provisional: true,
      fetchedAt: page.fetchedAt
    };
  }
  return null;
}

/** A collection page's head: its title, words and card from its own words and counts, the palettes it lists in the
    address's order, and out of the index where its page is a 404. All of it from what the loader said, the same on
    both sides. */
export function collectionHead(
  at: { slug: string; order: PaletteOrder; search: Record<string, unknown> },
  loaded: CollectionLoaded | undefined
) {
  return pageHead({
    kind: "collection",
    slug: at.slug,
    order: at.order,
    view: viewOf(new URLSearchParams(searchOf(at.search))),
    ...(loaded?.facts ? { collection: loaded.facts } : {}),
    ...(loaded?.robots ? { robots: loaded.robots } : {}),
    ...(loaded?.palettes ? { palettes: loaded.palettes } : {})
  });
}

/** A list as its metadata reads it: what its head and its heading are worded from. */
export const listMeta = (place: ListPlace): Page =>
  place.order === "saved"
    ? { kind: "own-collections", query: place.query, page: place.page, limit: place.limit }
    : {
        kind: "collections",
        order: place.order,
        frame: place.frame,
        query: place.query,
        page: place.page,
        limit: place.limit,
        view: place.view
      };

/** A list's head: its title for its order, frame, words and page, the collections a public one lists, and out of the
    index past its end. */
export function listHead(place: ListPlace, loaded: Loaded | undefined) {
  if (place.order === "saved") return pageHead(listMeta(place));
  return pageHead({
    ...listMeta(place),
    ...(loaded?.robots ? { robots: loaded.robots } : {}),
    ...(loaded?.collections ? { collections: loaded.collections } : {})
  });
}
