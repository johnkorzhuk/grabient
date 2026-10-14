import {
  DEFAULT_FRAME,
  framePath,
  isFrame,
  type Order,
  type RisingFrame
} from "../../lib/orders.ts";
import { listWords } from "../../lib/words.ts";
import { AS_SAVED, type ListView, readListView, viewParams } from "../list/appearance.ts";
import type { CollectionSort } from "./types.ts";

/* The collections lists' and a collection page's addresses: their query read the one way the server and the browser
   both read it, and written back in one order, defaults left out, so one page has one address and one cache key. The
   view is the lists' own (features/list). */

/** A public list's page: 12 to 24 collections, which bounds what a page no cache held reads. */
export const COLLECTION_LIMIT = 24;
/** An account's own list reads up to this many at once. */
export const OWN_COLLECTION_LIMIT = 96;

export interface CollectionListParams {
  query: string;
  sort: CollectionSort;
  /** Rising's frame, when the order is Rising */
  frame?: RisingFrame;
  page: number;
  limit: number;
}

export const intIn = (raw: string | null, min: number, max: number): number | null => {
  if (raw == null || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
};
export const frameOf = (raw: string | null | undefined): RisingFrame =>
  isFrame(raw) ? raw : DEFAULT_FRAME;

/** The view a query names, each parameter as it stands first. */
export const viewOf = (params: URLSearchParams): ListView =>
  readListView({
    style: params.get("style"),
    steps: params.get("steps"),
    angle: params.get("angle"),
    size: params.get("size")
  });

/** A query in its one order: each part given, empty ones left out, and the selection last as a bare word. */
function query(parts: readonly (string | false | undefined)[], selection?: boolean): string {
  const kept = [...parts, selection && "selection"].filter(Boolean);
  return kept.length ? `?${kept.join("&")}` : "";
}
const viewParts = (view: ListView) =>
  Object.entries(viewParams(view)).map(
    ([name, value]) => value !== undefined && `${name}=${value}`
  );

/** A collections list's query: the words, the view, the page and the limit, then the selection. The order is the
    path's, never a parameter. */
export const listSearch = (
  p: { query?: string; view?: ListView; page?: number; limit?: number },
  selection?: boolean
): string =>
  query(
    [
      !!p.query && new URLSearchParams({ q: p.query }).toString(),
      ...viewParts(p.view ?? AS_SAVED),
      !!p.page && p.page !== 1 && `page=${p.page}`,
      !!p.limit && p.limit !== COLLECTION_LIMIT && `limit=${p.limit}`
    ],
    selection
  );

/** A collection page's query: the view, then the selection while the page shows it. A link to a collection never says
    the selection. */
export const pageSearch = (view: ListView, selection?: boolean): string =>
  query(viewParts(view), selection);

/** A collections list's address as its page draws it: the order and frame its path says, the words, the page and the
    size, and the view. */
export interface ListPlace {
  order: Order;
  frame: RisingFrame;
  query: string;
  page: number;
  limit: number;
  view: ListView;
}

/** A list's path in its order and frame. */
export const listPath = (order: Order, frame: RisingFrame = DEFAULT_FRAME): string =>
  order === "saved"
    ? "/collections/saved"
    : order === "rising"
      ? framePath("/collections/rising", frame)
      : "/collections";

/** The public read a list's page draws. */
export const listKey = (place: ListPlace): CollectionListParams => ({
  sort: place.order === "rising" ? "rising" : "popular",
  frame: place.frame,
  query: place.query,
  page: place.page,
  limit: place.limit
});

/** A collections list's query as its address or the API sends it. A public list's page is 12 to COLLECTION_LIMIT
    collections, anything else the default; an account's own list reads up to `maxLimit` at once. */
export function collectionParams(
  params: URLSearchParams,
  maxLimit = COLLECTION_LIMIT
): CollectionListParams {
  const sort = params.get("sort");
  return {
    query: listWords(params.get("q")),
    sort:
      sort === "oldest" || sort === "popular" || sort === "hot" || sort === "rising"
        ? sort
        : "newest",
    frame: sort === "rising" ? frameOf(params.get("frame")) : undefined,
    page: intIn(params.get("page"), 1, 10_000) ?? 1,
    limit: intIn(params.get("limit"), 12, maxLimit) ?? COLLECTION_LIMIT
  };
}
export const ownParams = (params: URLSearchParams) =>
  collectionParams(params, OWN_COLLECTION_LIMIT);
