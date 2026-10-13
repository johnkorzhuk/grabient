import type { QueryClient } from "@tanstack/solid-query";
import type { ListSort, RisingFrame } from "../../lib/orders.ts";
import type { ListParams } from "./address.ts";
import { type Failed, failed, listPageQuery, savedQuery, searchQuery } from "./queries.ts";
import type { PaletteItem, SearchAnswer } from "./schema.ts";
import { sortSearch } from "./sort.ts";

/* Where a palette list's pages come from: a public list's own pages, a search's candidates cut into pages in the
   list's order, or the account's Saved pages. Each page is one entry of the query cache, so a press after a hover, a
   page's own address and a feed's later pages are the same reads. */

export interface Page {
  items: readonly PaletteItem[];
  page: number;
  totalPages: number;
  fetchedAt: number;
  tier?: string;
  partial?: boolean;
  /** an allowance ran out before the search could answer in full */
  limited?: boolean;
  /** a crawler's answer, read without the model: never kept for others */
  unkept?: boolean;
}

export type ListSource =
  | {
      kind: "list";
      sort: Exclude<ListSort, "newest" | "oldest">;
      frame: RisingFrame;
      params: ListParams;
    }
  | { kind: "saved"; owner: string; params: ListParams };

/** A page of a search: its slice of the candidates, in the list's order. */
export function sliceOf(
  answer: SearchAnswer,
  sort: ListSort,
  frame: RisingFrame,
  limit: number,
  n: number
): Page {
  const sorted = sortSearch(answer.items, sort, frame);
  return {
    items: sorted.slice((n - 1) * limit, n * limit),
    page: n,
    totalPages: Math.max(1, Math.ceil(sorted.length / limit)),
    fetchedAt: answer.fetchedAt,
    tier: answer.tier,
    ...(answer.partial ? { partial: true } : {}),
    ...(answer.limited ? { limited: true } : {}),
    ...(answer.unkept ? { unkept: true } : {})
  };
}

/** The query of page `n`, and the page it makes of what the query answers. */
export function pageQuery(source: ListSource, n: number) {
  const { words, limit } = source.params;
  if (source.kind === "saved") {
    return {
      options: savedQuery({ owner: source.owner, words, limit, page: n }),
      shape: (data: unknown) => data as Page | Failed
    };
  }
  if (words) {
    return {
      options: searchQuery(words),
      shape: (data: unknown) => {
        const answer = data as SearchAnswer | Failed;
        return failed(answer) ? answer : sliceOf(answer, source.sort, source.frame, limit, n);
      }
    };
  }
  return {
    options: listPageQuery({ sort: source.sort, frame: source.frame, limit, page: n }),
    shape: (data: unknown) => data as Page | Failed
  };
}

/** Page `n` as the cache holds it now; none when it holds nothing of it, or only a failure. */
export function keptPage(client: QueryClient, source: ListSource, n: number): Page | undefined {
  const { options, shape } = pageQuery(source, n);
  const data = client.getQueryData(options.queryKey as readonly unknown[]);
  if (!data) return undefined;
  const page = shape(data);
  return failed(page) ? undefined : page;
}

/** Page `n`, from the cache while it is fresh, else read. */
export async function readPage(
  client: QueryClient,
  source: ListSource,
  n: number
): Promise<Page | Failed> {
  const { options, shape } = pageQuery(source, n);
  return shape(await client.fetchQuery(options as Parameters<QueryClient["fetchQuery"]>[0]));
}
