import { getRequestEvent, isServer } from "@solidjs/web";
import type { QueryClient } from "@tanstack/solid-query";
import type { GalleryPlace, ListParams } from "./address.ts";
import {
  collectionsPageQuery,
  type Failed,
  failed,
  framesQuery,
  homeHeadQuery
} from "./queries.ts";
import { keptPage, pageQuery } from "./sources.ts";

/* What a gallery page's loader does: it fills the query cache with what the page shows, so the server renders from
   the reads and the browser hydrates without asking, and it says how long the page may be kept at the edge, no longer
   than its data stays fresh. A page past a list's end still renders, with its line saying so, and answers 404. */

/** A route's search as the router read it, back in the words of its address. */
export function searchOf(raw: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(raw)) {
    const one = Array.isArray(value) ? value[0] : value;
    if (one !== undefined) params.set(name, typeof one === "string" ? one : JSON.stringify(one));
  }
  const query = params.toString().replace(/=(?=&|$)/g, "");
  return query ? `?${query}` : "";
}

export interface Loaded {
  /** seconds the edge may keep the page */
  edge: number;
  /** what search engines are told, when the page is no index's */
  robots?: string;
  /** the status a page that renders answers with, when it is no 200 */
  status?: number;
}

/** The status the page answers with, said as it renders on the server: a list past its end is 404, a search an
    allowance cut short 429. A page that renders keeps its words on screen either way. */
export function answerWith(status: number | undefined): void {
  if (!isServer || !status) return;
  const event = getRequestEvent();
  if (event) event.locals.status = status;
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
  /* a Rising page in another frame than the week's, and a search, have one indexed page elsewhere */
  const robots = place.params.words || place.frame !== "1w" ? "noindex,follow" : undefined;
  if (place.params.page > Math.max(1, page.totalPages)) {
    return { edge: 0, robots: "noindex,follow", status: 404 };
  }
  if (page.limited) return { edge: 0, robots: "noindex,follow", status: 429 };
  if (page.tier === "unavailable") return { edge: 0, robots: "noindex,follow", status: 503 };
  const ttl = place.order === "rising" ? RISING_EDGE : PUBLIC_EDGE;
  return {
    edge: place.params.words ? ttl : left(page.fetchedAt, ttl),
    ...(robots ? { robots } : {})
  };
}

export async function loadHome(client: QueryClient, params: ListParams): Promise<Loaded> {
  const order = params.words ? "popular" : "hot";
  const [head, collections] = (await Promise.all([
    client.ensureQueryData(homeHeadQuery(params.words)),
    client.ensureQueryData(collectionsPageQuery(order, params.words, params.page))
  ])) as [{ limited?: boolean; tier?: string } | Failed, { totalPages: number } | Failed];
  const robots = params.words ? "noindex,follow" : undefined;
  if (failed(head) || failed(collections)) return { edge: 0, ...(robots ? { robots } : {}) };
  if (head.limited || head.tier === "unavailable") {
    return { edge: 0, robots: "noindex,follow", status: head.limited ? 429 : 503 };
  }
  if (params.page > Math.max(1, collections.totalPages)) {
    return { edge: 0, robots: "noindex,follow", status: 404 };
  }
  return { edge: PUBLIC_EDGE, ...(robots ? { robots } : {}) };
}
