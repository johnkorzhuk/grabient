/* The search's public HTTP answers, for the route files to mount:
     GET/HEAD /api/search.json, /api/palettes/search, /search/{q}.json, /palettes/{q}.json   edge-cached
     GET      /api/search/status                what this isolate answers from (never kept)
     GET      /api/search-colors                a search's colors (an hour)
   None reads the session; the pipeline adds their CORS. An account's own search is account.ts. */
import { msg } from "@grabient/i18n";
import { NO_STORE, PAGE } from "../../lib/cache.ts";
import type { KeyRule } from "../cache-keys.ts";
import type { Env } from "../env.ts";
import { clientAddress } from "../limits/address.ts";
import { checkLimits } from "../limits/check.ts";
import { searchColors } from "./colors.ts";
import {
  canonicalPaletteSeed,
  collectionsHolding,
  normalizeListQuery,
  sortSearchItems
} from "./seams.ts";
import { type SearchResult, searchPalettes, searchRequestInput } from "./search.ts";
import { type Background, snapshotStatus } from "./snapshot.ts";

const SEARCH_PATH = /^\/(?:api\/search\.json|api\/palettes\/search|(?:search|palettes)\/.+\.json)$/;

/** The edge cache's keys for these answers: what the handlers read of the query, normalized, so junk parameters and
    spellings of one search share an entry. Only a search by a palette names collections, in the reader's language. */
export const searchKeyRules: readonly KeyRule[] = [
  {
    match: path => SEARCH_PATH.test(path),
    query: params => {
      const { query, limit, sort } = searchRequestInput(
        new Request(`https://search.invalid/?${params}`)
      );
      const lang = params.get("lang");
      return new URLSearchParams({
        query: query ?? "",
        limit: String(limit),
        sort,
        ...(query && lang && canonicalPaletteSeed(query) ? { lang } : {})
      });
    }
  },
  {
    match: path => path === "/api/search-colors",
    query: params => new URLSearchParams({ q: normalizeListQuery(params.get("q")) })
  }
];

/** A search's answer status: limited 429 with the wait, unavailable 503, else 200. */
export const statusOf = (result: SearchResult) =>
  result.limited ? 429 : result.tier === "unavailable" ? 503 : 200;
export const waitOf = (result: SearchResult): Record<string, string> =>
  result.retryAfter ? { "Retry-After": String(result.retryAfter) } : {};

/** The public search as JSON, sorted as asked, with the public collections that hold a palette searched by and when it
    was read. It runs only when the edge holds no copy, so it counts against the address's misses first. */
export async function searchJsonResponse(
  request: Request,
  env: Env,
  ctx?: Background
): Promise<Response> {
  const address = clientAddress(request) ?? "local";
  const missed = await checkLimits(env, [[`list-miss:${address}`, "listMiss"]]);
  if (!missed?.success) {
    return Response.json(
      { error: msg("Too many requests. Try again later.") },
      { status: 429, headers: { ...NO_STORE, "Retry-After": "60" } }
    );
  }
  const { query, limit, sort } = searchRequestInput(request);
  if (!query)
    return Response.json(
      { error: "Invalid search query." },
      { status: 400, headers: NO_STORE }
    );
  const result = await searchPalettes(env, query, { request, ctx, limit });
  const like = result.tier === "similar" ? canonicalPaletteSeed(result.query) : null;
  const lang = new URL(request.url).searchParams.get("lang") ?? "en";
  const heldBy = like ? await collectionsHolding(env, like, lang).catch(() => []) : [];
  const body = {
    ...result,
    items: sortSearchItems(result.items, sort),
    ...(heldBy.length ? { heldBy } : {}),
    fetchedAt: Date.now()
  };
  const kept = statusOf(result) === 200 && !result.unkept;
  return Response.json(body, {
    status: statusOf(result),
    headers: { ...(kept ? PAGE : NO_STORE), ...waitOf(result) }
  });
}

/** `GET /api/search/status`. */
export async function searchStatusResponse(env: Env, ctx?: Background): Promise<Response> {
  return Response.json(await snapshotStatus(env, ctx), { headers: NO_STORE });
}

/** `GET /api/search-colors?q=`: `{ colors }`, the same for everyone, kept an hour. */
export async function searchColorsResponse(request: Request, env: Env): Promise<Response> {
  const colors = await searchColors(env, new URL(request.url).searchParams.get("q") ?? "");
  return Response.json({ colors }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
