import { isStyle, parseSize, STEPS_MAX, STEPS_MIN, type Style } from "@grabient/engine/view.ts";
import type { Order } from "@grabient/ui/ListNav.tsx";
import type { CollectionSort, RisingFrame } from "./types.ts";

/* The collections lists' and a collection page's addresses: their query read the one way the server and the browser
   both read it, and written back in one order, defaults left out, so one page has one address and one cache key. */

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

/** How a list draws its palettes: each in the view it was saved in (`auto`), or the reader's. */
export interface ListView {
  style: Style | "auto";
  steps: number | "auto";
  angle: number | "auto";
  size: string | "auto";
}
export const AUTO_VIEW: ListView = { style: "auto", steps: "auto", angle: "auto", size: "auto" };

export const intIn = (raw: string | null, min: number, max: number): number | null => {
  if (raw == null || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
};
export const frameOf = (raw: string | null | undefined): RisingFrame =>
  raw === "3m" || raw === "1y" ? raw : "1w";

/** The view an address names: steps under three mean as few as a palette allows, and read as three. */
export function listView(params: URLSearchParams): ListView {
  const style = params.get("style");
  const steps = intIn(params.get("steps"), 1, STEPS_MAX);
  const size = parseSize(params.get("size"));
  return {
    style: isStyle(style) ? style : "auto",
    steps: steps === null ? "auto" : Math.max(steps, STEPS_MIN),
    angle: intIn(params.get("angle"), 0, 360) ?? "auto",
    size: size ? `${size.width}x${size.height}` : "auto"
  };
}

/** A query in its one order: each part given, empty ones left out, and the selection last as a bare word. */
function query(parts: readonly (string | false | undefined)[], selection?: boolean): string {
  const kept = [...parts, selection && "selection"].filter(Boolean);
  return kept.length ? `?${kept.join("&")}` : "";
}
const viewParts = (view: ListView) => [
  view.style !== "auto" && `style=${view.style}`,
  view.steps !== "auto" && `steps=${view.steps}`,
  view.angle !== "auto" && `angle=${view.angle}`,
  view.size !== "auto" && `size=${view.size}`
];

/** A collections list's query: the words, the view, the page and the limit, then the selection. The order is the
    path's, never a parameter. */
export const listSearch = (
  p: { query?: string; view?: ListView; page?: number; limit?: number },
  selection?: boolean
): string =>
  query(
    [
      !!p.query && new URLSearchParams({ q: p.query }).toString(),
      ...viewParts(p.view ?? AUTO_VIEW),
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
export const listPath = (order: Order, frame: RisingFrame): string =>
  order === "saved"
    ? "/collections/saved"
    : order === "rising"
      ? frame === "1w"
        ? "/collections/rising"
        : `/collections/rising/${frame}`
      : "/collections";

/** The public read a list's page draws. */
export const listKey = (place: ListPlace): CollectionListParams => ({
  sort: place.order === "rising" ? "rising" : "popular",
  frame: place.frame,
  query: place.query,
  page: place.page,
  limit: place.limit
});
