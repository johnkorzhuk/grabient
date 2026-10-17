/* The search's public HTTP answers, for the route files to mount:
     GET/HEAD /api/search.json, /api/palettes/search, /search/{q}.json, /palettes/{q}.json   edge-cached
     GET      /api/search/status                what this isolate answers from (never kept)
   The tags' answer is tags.ts's, at /api/search-suggestions and at its first address, /api/popular-searches. None
   reads the session, and the pipeline adds the CORS of those any site may read. An account's own search is
   account.ts. */
import { replica } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { sortSearch } from "../../features/gallery/sort.ts";
import { NO_STORE, PAGE } from "../../lib/cache.ts";
import type { KeyRule } from "../cache-keys.ts";
import { collectionsHolding } from "../collections/read.ts";
import { canonicalPaletteSeed } from "../files/resolve.ts";
import { askedLocale, localizeHeld } from "../mcp/admin/translations.ts";
import { searchJsonPath } from "../paths.ts";
import { type SearchResult, searchPalettes, searchRequestInput } from "./search.ts";
import { type Background, snapshotStatus } from "./snapshot.ts";
import { tagsKey } from "./tags.ts";

const TAGS = "/api/search-suggestions";

/** The edge cache's keys for these answers: what the handlers read of the query, normalized, so junk parameters and
    spellings of one search share an entry, whichever of its addresses asked. Only a search by a palette names
    collections, in the reader's language. */
export const searchKeyRules: readonly KeyRule[] = [
  {
    match: searchJsonPath,
    path: "/api/search.json",
    query: (params, path) => {
      const { query, limit, sort } = searchRequestInput(
        new Request(`https://search.invalid${path}?${params}`)
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
    match: path => path === TAGS || path === "/api/popular-searches",
    path: TAGS,
    query: tagsKey
  }
];

/** A search's answer status: limited 429 with the wait, unavailable 503, else 200. */
export const statusOf = (result: SearchResult) =>
  result.limited ? 429 : result.tier === "unavailable" ? 503 : 200;
export const waitOf = (result: SearchResult): Record<string, string> =>
  result.retryAfter ? { "Retry-After": String(result.retryAfter) } : {};

/** The public search as JSON, sorted as asked, with the public collections that hold a palette searched by and when it
    was read. It runs only when the edge holds no copy, a miss the pipeline has counted against the address. */
export async function searchJsonResponse(
  request: Request,
  env: Env,
  ctx?: Background
): Promise<Response> {
  const { query, limit, sort } = searchRequestInput(request);
  if (!query)
    return Response.json({ error: "Invalid search query." }, { status: 400, headers: NO_STORE });
  const result = await searchPalettes(env, query, { request, ctx, limit });
  // a search by a palette names the public collections that hold it, each title in the language asked
  const like = result.tier === "similar" ? canonicalPaletteSeed(result.query) : null;
  const db = { DB: replica(env) };
  const heldBy = like
    ? await collectionsHolding(db, like)
        .then(held => localizeHeld(db, askedLocale(new URL(request.url)), held))
        .catch(() => [])
    : [];
  const body = {
    ...result,
    items: sortSearch(result.items, sort),
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
