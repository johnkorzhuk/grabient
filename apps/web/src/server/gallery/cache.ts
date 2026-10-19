import { env, waitUntil } from "cloudflare:workers";
import type { PalettePage as AnsweredPage } from "../../features/gallery/schema.ts";
import { BUILD } from "../../lib/build.ts";
import { isFrame, type ListSort, parseSort, type RisingFrame } from "../../lib/orders.ts";
import {
  bounded,
  DEFAULT_LIMIT,
  LIMIT_MAX,
  listPalettes,
  PAGE_MAX,
  type PalettePage
} from "./list.ts";

/* A public list page is read once for its HTML in every view and for its JSON: this data center's Cache API keeps it
   by order, frame, page, size and build for as long as its data stays fresh from the database read, and both answers
   are kept at the edge no longer than that. A cache that cannot be read or written is passed by, and a failed read is
   never kept. A page is kept a day past its time, and a read that fails answers with it in place of an error. Each
   request that reaches a read here was counted against the reader's address (pipeline.ts), so paging deep through
   every list costs a scraper its minute instead of the database its rows. */

export interface ListQuery {
  sort: ListSort;
  page: number;
  limit: number;
  /** Rising's frame when it is not the week's */
  frame?: Exclude<RisingFrame, "1w">;
}

/** A list's options as given, each brought into bounds; the week's frame is Rising's own list. */
export function listQuery(input: {
  sort?: unknown;
  frame?: unknown;
  page?: unknown;
  limit?: unknown;
}): ListQuery {
  const sort = parseSort(input.sort);
  const frame =
    sort === "rising" && isFrame(input.frame) && input.frame !== "1w" ? input.frame : null;
  return {
    sort,
    page: bounded(input.page, 1, 1, PAGE_MAX),
    limit: bounded(input.limit, DEFAULT_LIMIT, 1, LIMIT_MAX),
    ...(frame ? { frame } : {})
  };
}

/** The API's query: a page past a million or a size outside 12 to 96 reads as the default. */
export function listQueryOf(params: URLSearchParams): ListQuery {
  const int = (name: string, min: number, max: number) => {
    const raw = params.get(name);
    const n = raw && /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
    return n >= min && n <= max ? n : undefined;
  };
  return listQuery({
    sort: params.get("sort"),
    frame: params.get("frame"),
    page: int("page", 1, 1_000_000),
    limit: int("limit", 12, LIMIT_MAX)
  });
}

/** Rising is read for what changed lately, so a like shows within the minute. */
export const listTtl = (sort: ListSort): number => (sort === "rising" ? 60 : 300);

/** Headers that keep an answer made from a page no longer than its data stays fresh. */
export function freshFor(fetchedAt: number, ttl: number, now = Date.now()): Record<string, string> {
  const left = Math.max(0, Math.min(ttl, Math.floor((fetchedAt + ttl * 1000 - now) / 1000)));
  return {
    "Cache-Control": "public, max-age=0, must-revalidate",
    "CDN-Cache-Control": `max-age=${left}`
  };
}

const cacheOf = () => (globalThis as { caches?: { default?: Cache } }).caches?.default;

/** How long past its time a page is kept for a read that fails, in seconds. */
const KEPT_PAST = 86_400;

/* a kept page of this query, of any age */
function pageOf(value: unknown, query: ListQuery, now: number): value is AnsweredPage {
  const page = value as AnsweredPage | null;
  return (
    !!page &&
    Array.isArray(page.items) &&
    page.items.length <= query.limit &&
    page.page === query.page &&
    page.limit === query.limit &&
    Number.isSafeInteger(page.total) &&
    page.total >= 0 &&
    Number.isFinite(page.fetchedAt) &&
    page.fetchedAt <= now
  );
}

/** A public list page from the record cache, or from the database. */
export async function publicList(request: Request, query: ListQuery): Promise<AnsweredPage> {
  const cache = cacheOf();
  const key = new Request(
    `${new URL(request.url).origin}/.grabient-cache/list?${new URLSearchParams({
      build: BUILD,
      sort: query.sort,
      page: String(query.page),
      limit: String(query.limit),
      ...(query.frame ? { frame: query.frame } : {})
    })}`
  );
  const ttl = listTtl(query.sort);
  let past: AnsweredPage | null = null;
  try {
    const kept = await cache?.match(key);
    const page: unknown = kept?.ok ? await kept.json() : null;
    const now = Date.now();
    if (pageOf(page, query, now)) {
      if (now - page.fetchedAt < ttl * 1000) return page;
      past = page;
    }
  } catch {
    // a cache that cannot be read is passed by
  }
  let read: PalettePage;
  try {
    read = await listPalettes(env, query);
  } catch (error) {
    if (past) return past;
    throw error;
  }
  const page = { ...read, fetchedAt: Date.now() };
  if (cache) {
    const kept = Response.json(page, {
      headers: { "Cache-Control": `public, max-age=${ttl + KEPT_PAST}` }
    });
    waitUntil(cache.put(key, kept).catch(() => {}));
  }
  return page;
}
