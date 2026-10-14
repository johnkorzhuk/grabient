import { DEFAULT_LOCALE, type Locale } from "@grabient/i18n";
import { isServer } from "@solidjs/web";
import { queryOptions } from "@tanstack/solid-query";
import { createSignal } from "solid-js";
import { DEFAULT_FRAME, isFrame, type RisingFrame } from "../../lib/orders.ts";
import { getJson } from "../../lib/query.ts";
import { SearchAnswer } from "../search/bodies.ts";
import { SEARCH_POOL } from "../search/queries.ts";

/* The palettes like the one on screen: the search by its seed, which also names the public collections that hold it,
   in the reader's language. One answer of the whole pool, kept five minutes, which the sheet sorts as the reader orders
   it without asking again. A search an allowance cut short, or one without its files, fails, and the sheet shows
   nothing for it. */

export type Similar = SearchAnswer;

export const similarQuery = (seed: string, locale: Locale) =>
  queryOptions({
    queryKey: ["similar", seed, locale],
    queryFn: ({ signal }) =>
      getJson(
        `/api/search.json?${new URLSearchParams({
          query: seed,
          limit: String(SEARCH_POOL),
          ...(locale === DEFAULT_LOCALE ? {} : { lang: locale })
        })}`,
        SearchAnswer,
        signal
      ),
    staleTime: 5 * 60_000
  });

/** The order the reader reads them in: the most liked first, or the rising in one of Rising's frames. */
export interface SimilarOrder {
  sort: "popular" | "rising";
  frame: RisingFrame;
}

/* The reader's order is the tab's: the palette opened next shows its own in it, and a reload keeps it. */
const KEY = "grabient-order";
function kept(): SimilarOrder {
  let said: Partial<SimilarOrder> | null = null;
  try {
    said = isServer ? null : JSON.parse(sessionStorage.getItem(KEY) ?? "null");
  } catch {
    /* nothing kept, or storage refused: Popular */
  }
  return {
    sort: said?.sort === "rising" ? "rising" : "popular",
    frame: isFrame(said?.frame) ? said.frame : DEFAULT_FRAME
  };
}
const [order, setOrder] = createSignal(kept());

export const similarOrder = order;
export function rememberOrder(next: SimilarOrder): void {
  setOrder(next);
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* the page still remembers it */
  }
}
