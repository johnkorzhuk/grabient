import type { QueryClient } from "@tanstack/solid-query";
import type { FramedData } from "../../app/shell.ts";
import type { GalleryPlace, ListParams } from "./address.ts";
import { homePaint, paintOf } from "./drawing.ts";
import {
  type Failed,
  failed,
  framesQuery,
  homeCollectionsQuery,
  homeHeadQuery
} from "./queries.ts";
import { keptPage, pageQuery } from "./sources.ts";

/* What a gallery page's loader does: it fills the query cache with what the page shows, so the server renders from
   the reads and the browser hydrates without asking; it says how long the page may be kept at the edge, no longer
   than its data stays fresh; and it hands the frame the palettes the page opens on, for the bar, the water and the
   appearance control. A page past a list's end still renders, with its line saying so, and answers 404. */

export interface Loaded extends FramedData {
  /** seconds the edge may keep the page */
  edge: number;
  /** what search engines are told, when the page is no index's */
  robots?: string;
  /** the status a page that renders answers with, when it is no 200 */
  status?: number;
  /** the palettes the page lists, by seed, for its structured data */
  palettes?: string[];
}

const PUBLIC_EDGE = 300;
const RISING_EDGE = 60;
const left = (fetchedAt: number, ttl: number) =>
  Math.max(0, Math.min(ttl, Math.floor((fetchedAt + ttl * 1000 - Date.now()) / 1000)));

export async function loadPalettes(
  client: QueryClient,
  place: Extract<GalleryPlace, { kind: "list" }>
): Promise<Loaded> {
  const source = {
    kind: "list",
    sort: place.order,
    frame: place.frame,
    params: place.params
  } as const;
  const { options } = pageQuery(source, place.params.page);
  const [data] = await Promise.all([
    client.ensureQueryData(options as Parameters<QueryClient["ensureQueryData"]>[0]),
    client.ensureQueryData(framesQuery())
  ]);
  const page = keptPage(client, source, place.params.page);
  if (failed(data as object) || !page) return { edge: 0, status: (data as Failed).status };
  const paint = paintOf(page.items, place.params);
  if (place.params.page > Math.max(1, page.totalPages)) {
    return { edge: 0, robots: "noindex,follow", status: 404 };
  }
  if (page.limited) return { edge: 0, robots: "noindex,follow", status: 429, paint };
  if (page.tier === "unavailable") return { edge: 0, robots: "noindex,follow", status: 503 };
  const ttl = place.order === "rising" ? RISING_EDGE : PUBLIC_EDGE;
  /* words the search cannot read as what they mean are no page of their own for an index */
  const unread = !!place.params.words && !page.indexable;
  return {
    edge: page.unkept ? 0 : place.params.words ? ttl : left(page.fetchedAt, ttl),
    palettes: page.items.map(item => item.kseed),
    paint,
    ...(unread ? { robots: "noindex,follow" } : {})
  };
}

export async function loadHome(client: QueryClient, params: ListParams): Promise<Loaded> {
  const reads = [
    () => client.ensureQueryData(homeHeadQuery(params.words)),
    () => client.ensureQueryData(homeCollectionsQuery(params.words, params.page))
  ] as const;
  /* searched, the palettes are read before the collections, so words only the model reads are read by it once */
  const head = params.words ? await reads[0]() : reads[0]();
  const [answered, collections] = await Promise.all([head, reads[1]()]);
  if (failed(answered) || failed(collections)) return { edge: 0 };
  const paint = homePaint(answered.palettes, collections.items, params);
  if (answered.limited || answered.tier === "unavailable") {
    return { edge: 0, robots: "noindex,follow", status: answered.limited ? 429 : 503, paint };
  }
  if (params.page > Math.max(1, collections.totalPages)) {
    return { edge: 0, robots: "noindex,follow", status: 404, paint };
  }
  return {
    edge: answered.unkept || collections.unkept ? 0 : PUBLIC_EDGE,
    palettes: answered.palettes.map(item => item.kseed),
    paint
  };
}
