import { DEFAULT_LOCALE, type Locale } from "@grabient/i18n";
import { queryOptions } from "@tanstack/solid-query";
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
