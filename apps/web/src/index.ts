import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import * as v from "valibot";
import { initDatabase } from "@repo/data-ops/database/setup";
import {
  getPalettesCount,
  getPalettesPageByDate,
  getPopularPalettesPage,
  getPopularPaletteIds,
  getPaletteLikeInfo,
  getLikesCountsByKeys,
  getUserLikedSeeds,
  getUserLikesWithCounts,
  toggleLikePaletteByKey,
} from "@repo/data-ops/queries/palettes";
import { isUsernameAvailable, updateUserImage, updateUsername } from "@repo/data-ops/queries/account";
import { updateUsernameSchema } from "@repo/data-ops/valibot-schema/auth";
import {
  DEFAULT_PAGE_LIMIT,
  DEFAULT_STYLE,
  angleValidator,
  paletteStyleValidator,
  seedValidator,
  stepsValidator,
} from "@repo/data-ops/valibot-schema/grabient";
import { initAuth, getSession } from "./auth";
import {
  normalizeSearch,
  parseListSearch,
  parseSize,
  searchString,
  type ListSearch,
} from "./search";
import { canonicalSeed, paletteCoeffKey, resolvePaletteView } from "./palette";
import { paletteMcpHandler } from "./mcp";
import {
  SEARCH_JSON_HEADERS,
  paletteJson,
  paletteJsonResponse,
} from "./palette-json";
import { likeCoeffKeys, mergeLikeAliases } from "./likes";
import { isGdprRegion } from "./geo";
import { avatarKey, avatarKeyFromUrl, isWebpBuffer } from "./avatar";
import {
  OG_RENDER_VERSION,
  paletteOgResponse,
  palettePngResponse,
  queryOgResponse,
  queryPngResponse,
  robotsTxt,
  sitemapIndexXml,
  staticSitemapXml,
  searchSitemapXml,
  paletteSitemapXml,
} from "./seo";
import {
  contactContent,
  legalPage,
  listPage,
  loginPage,
  notFoundPage,
  searchSubheaderLeft,
  seedPage,
  settingsPage,
  type CardItem,
  type SearchSort,
  type Sort,
} from "./pages";
import { PRIVACY_HTML, TERMS_HTML } from "./legal";
import {
  queryFromParam,
  queryHeading,
  queryHeadingParts,
  queryResultContext,
  querySlug,
  searchPalettesForQuery,
  normalizeSemanticQuery,
  SEMANTIC_SEARCH_LIMIT,
  type QueryResultContext,
  type SemanticSearchResult,
} from "./semantic-search";
import { parseSearchInput, searchRouteSegment } from "./search-input";
import { checkRateLimit } from "./rate-limit";
import { esc } from "./esc";
import {
  getPopularSearchSuggestions,
  isPublishableQuery,
  PUBLISHABLE_SCORE,
} from "./popular-searches";

export { RateLimiter } from "./rate-limit";

// HTML caching strategy:
//
// - List HTML and /api/palettes JSON are identical for every visitor (all
//   session UI is applied client-side), so the edge may cache them. The SSR'd
//   like totals can then be up to CDN max-age stale; the client's
//   /api/like-counts reconciliation pass — which already runs on every load
//   and swap, guarded against racing a toggle — repaints current totals.
//   Every edge HIT here skips the worker entirely: no D1 reads, no KV reads,
//   no CPU. Under bot traffic (which never noticed live totals anyway) that
//   is the difference between one D1-backed render per URL per 5 minutes and
//   one per request.
//
// - Browser TTLs stay short with no SWR on HTML: the browser cache is NOT
//   invalidated by a deploy. With the old max-age=600 + swr=1800 on seeds,
//   hover-preloads and prior visits let the browser serve pre-deploy HTML for
//   up to 40 minutes after a deploy — the "old UI until manual refresh" bug.
//   60s bounds that window to a minute; browser misses land on the
//   (version-keyed, worker-skipping) edge cache. Note the client nav layer
//   also reads this max-age to decide when to revalidate its in-tab cache.
//
// - Lists get a shorter CDN TTL than seeds: their content actually changes
//   (new palettes, popularity reordering), whereas a seed page is static
//   apart from the count it already defers to /api/like-info.
export const LIST_HEADERS = {
  "Cache-Control": "public, max-age=60",
  "CDN-Cache-Control": "max-age=300, stale-while-revalidate=900",
};
const SEED_HEADERS = {
  "Cache-Control": "public, max-age=60",
  "CDN-Cache-Control": "max-age=3600, stale-while-revalidate=7200",
};

const app = new Hono<{ Bindings: Env }>();

// Uncaught throws used to fall through to Hono's default handler: a bare
// "Internal Server Error" with no Cache-Control header and no log line, so
// production 500s (2026-08-20 like-endpoint incident) left nothing in Workers
// Logs to diagnose. Log the route, and keep error responses out of every
// cache (NO_STORE is initialized below, long before any request runs).
app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error(`unhandled error: ${c.req.method} ${c.req.path}`, err);
  return c.req.path.startsWith("/api/")
    ? c.json({ error: "Internal Server Error" }, 500, NO_STORE)
    : c.text("Internal Server Error", 500, NO_STORE);
});

function publicOrigin(c: Context<{ Bindings: Env }>): string {
  return (c.env.PUBLIC_ORIGIN || "https://grabient.com").replace(/\/+$/, "");
}

function requestProtocol(c: Context<{ Bindings: Env }>): string | null {
  const forwarded = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwarded) return forwarded.toLowerCase();
  try {
    const visitor = JSON.parse(c.req.header("cf-visitor") ?? "{}") as { scheme?: string };
    if (visitor.scheme) return visitor.scheme.toLowerCase();
  } catch {}
  // Local Hono tests and wrangler dev commonly use an http request URL even
  // though there is no public insecure request to redirect. Only trust the
  // proxy headers Cloudflare supplies at the edge.
  return null;
}

app.use("*", async (c, next) => {
  if (requestProtocol(c) === "http") {
    const target = new URL(c.req.url);
    target.protocol = "https:";
    // Workers Cache otherwise applies its heuristic TTL to this headerless
    // 301. HTTP and HTTPS can resolve to the same Worker cache key, turning
    // the canonical HTTPS URL into a cached self-redirect.
    c.header("Cache-Control", NO_STORE["Cache-Control"]);
    c.header("CDN-Cache-Control", NO_STORE["CDN-Cache-Control"]);
    return c.redirect(target.toString(), 301);
  }
  await next();
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  // Allow iframe embedding only from trusted referrers (cssgradient.io sends
  // significant traffic via an embed); frame-ancestors replaces X-Frame-Options
  // so per-origin whitelisting is possible.
  c.header(
    "Content-Security-Policy",
    "frame-ancestors 'self' https://cssgradient.io https://*.cssgradient.io",
  );
  // workers.dev hosts serve the whole site (staging by design, production
  // incidentally — both env blocks set workers_dev:true). Staging must stay
  // reachable for the mandated pre-production smoke test, so keep the hosts and
  // deny indexing at the header instead: two full-corpus duplicates otherwise.
  if (new URL(c.req.url).hostname.endsWith(".workers.dev"))
    c.header("X-Robots-Tag", "noindex, nofollow");
  // Public read-only renders and palette data, open to any origin. Without this
  // header a browser-sandboxed caller — a Figma plugin (null origin), an app
  // preview iframe, an assistant's code sandbox — can display /{seed}.png in an
  // <img> but cannot fetch() it or read the JSON at all. Nothing here is
  // user-specific or authenticated, so there is no cookie to protect: the
  // credentialed forms (/api/like-info, /api/palettes) are deliberately absent
  // from the match below.
  if (isPublicApiPath(new URL(c.req.url).pathname))
    c.header("Access-Control-Allow-Origin", "*");
});

/** The unauthenticated render/data surface: PNG, OG card, and palette JSON. */
function isPublicApiPath(pathname: string): boolean {
  return (
    pathname.endsWith(".png") ||
    pathname.endsWith(".json") ||
    pathname.startsWith("/api/png") ||
    pathname.startsWith("/api/og")
  );
}

// Preflight for the same surface. A fetch() carrying no custom headers is a
// "simple request" and never preflights, but callers that set Accept or
// Content-Type do, and a 404 here fails them before the GET is ever attempted.
app.options("/*", (c) => {
  if (!isPublicApiPath(new URL(c.req.url).pathname)) return c.body(null, 404);
  return c.body(null, 204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Content-Type",
    "Access-Control-Max-Age": "86400",
    // Same-URL responses differ by Origin only in the header, never the body,
    // so this stays cacheable.
    "Cache-Control": "public, max-age=86400",
  });
});

/**
 * What the results on this page actually are, for the title.
 *
 * "auto" is the canonical form — no style in the URL, so every result renders
 * in its own stored style and the page is a mix of both. Pinning a style makes
 * the page one thing or the other, and the title should say which.
 */
function styleNoun(style: string): string {
  if (style === "auto") return "CSS Gradients & Swatches";
  return style.endsWith("Swatches") ? "Color Swatches" : "CSS Gradients";
}

// Explicit cache headers on redirects: Workers Cache heuristically caches
// header-less responses (2h for cacheable statuses), so always be explicit.
function cachedRedirect(
  c: Context<{ Bindings: Env }>,
  url: string,
  status: 301 | 302,
  maxAge: number,
) {
  c.header("Cache-Control", `public, max-age=${maxAge}`);
  c.header("CDN-Cache-Control", `max-age=${maxAge}`);
  return c.redirect(url, status);
}

// GitHub star count for the footer — Cache API entry per colo, tolerant of
// failure (0 hides the star chip). Entries live 24h but count as fresh for 4h:
// a stale hit returns immediately and refreshes via waitUntil, so the GitHub
// round-trip leaves the render path everywhere except a truly cold colo.
const STARS_CACHE_URL = "https://grabient-lite.internal/__github-stars";
const STARS_FRESH_MS = 4 * 60 * 60 * 1000;

async function fetchAndCacheStars(): Promise<number> {
  const res = await fetch("https://api.github.com/repos/johnkorzhuk/grabient", {
    headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "Grabient-App" },
  });
  if (!res.ok) return 0;
  const data = (await res.json()) as { stargazers_count: number };
  const stars = data.stargazers_count;
  await caches.default.put(
    new Request(STARS_CACHE_URL),
    new Response(JSON.stringify({ stars, at: Date.now() }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" },
    }),
  );
  return stars;
}

async function githubStars(c: Context<{ Bindings: Env }>): Promise<number> {
  try {
    const hit = await caches.default.match(new Request(STARS_CACHE_URL));
    if (hit) {
      const data = (await hit.json()) as { stars: number; at?: number };
      if (!data.at || Date.now() - data.at > STARS_FRESH_MS) {
        // executionCtx throws outside workerd (vitest); stale-but-served is fine.
        try {
          c.executionCtx.waitUntil(fetchAndCacheStars().catch(() => {}));
        } catch {}
      }
      return data.stars;
    }
    return await fetchAndCacheStars();
  } catch {
    return 0;
  }
}

async function renderNotFound(c: Context<{ Bindings: Env }>) {
  // Missing hashed assets can briefly fall through to the Worker while a new
  // version is propagating. Never turn that transient miss into a cached 404:
  // the editor and export islands share chunks, so one poisoned response can
  // disable several otherwise unrelated controls until the cache expires.
  if (new URL(c.req.url).pathname.startsWith("/assets/")) {
    return c.text("Asset not found", 404, NO_STORE);
  }
  const stars = await githubStars(c);
  return c.html(
    notFoundPage({
      origin: publicOrigin(c),
      path: new URL(c.req.url).pathname,
      stars,
    }),
    404,
    {
      "Cache-Control": "public, max-age=300",
      "CDN-Cache-Control": "max-age=3600",
    },
  );
}

interface ListData {
  params: ListSearch;
  items: CardItem[];
  total: number;
  totalPages: number;
}

// COUNT(*) bills one D1 row-read per row scanned, so running it per render is
// the dominant cost under bot traffic. Memoize per isolate; totalPages
// tolerates 60s of staleness.
let totalMemo: { value: number; at: number } | undefined;
async function getTotalCached(): Promise<number> {
  if (totalMemo && Date.now() - totalMemo.at < 60_000) return totalMemo.value;
  const value = await getPalettesCount();
  totalMemo = { value, at: Date.now() };
  return value;
}

async function listData(
  c: Context<{ Bindings: Env }>,
  sort: Exclude<Sort, "saved">,
): Promise<ListData> {
  initDatabase(c.env.DB);
  const params = parseListSearch(new URL(c.req.url).searchParams);

  const [palettes, total] = await Promise.all([
    sort === "popular"
      ? getPopularPalettesPage(params.page, params.limit)
      : getPalettesPageByDate(params.page, params.limit, sort),
    getTotalCached(),
  ]);

  const items: CardItem[] = [];
  for (const p of palettes) {
    const view = resolvePaletteView(p, params);
    if (view) {
      // Canonical href skips the legacy→v3 301 every legacy-id card used to
      // pay on click. Hearts key on the coefficient key (aliases share it).
      const canonical = canonicalSeed(p.id) ?? p.id;
      items.push({
        seed: p.id,
        key: paletteCoeffKey(p.id) ?? p.id,
        // Effective values (user-set or the palette's own) go into the seed
        // URL explicitly so the detail page renders exactly like the card —
        // mirrors the current site's card links.
        href: `/${canonical}${searchString(params, {
          page: 1,
          style: view.style,
          steps: view.steps,
          angle: view.angle,
        })}`,
        background: view.background,
        likesCount: p.likesCount,
        createdAtMs: p.createdAt.getTime(),
        style: p.style,
        steps: p.steps,
        angle: p.angle,
      });
    }
  }

  return { params, items, total, totalPages: Math.max(1, Math.ceil(total / params.limit)) };
}

const SORT_OF: Record<string, Exclude<Sort, "saved">> = { newest: "newest", oldest: "oldest" };
const SEARCH_SORTS = new Set<SearchSort>(["popular", "newest", "oldest"]);

function searchSort(params: URLSearchParams): SearchSort {
  const value = params.get("sort") as SearchSort | null;
  return value && SEARCH_SORTS.has(value) ? value : "popular";
}

function normalizeQuerySearch(params: URLSearchParams): string | null {
  const normalizedSort = searchSort(params);
  const withoutSort = new URLSearchParams(params);
  withoutSort.delete("sort");
  const normalizedList = normalizeSearch(withoutSort);
  const output = new URLSearchParams(
    (normalizedList ?? (withoutSort.size ? `?${withoutSort}` : "")).slice(1),
  );
  if (normalizedSort !== "popular") output.set("sort", normalizedSort);
  const next = output.size ? `?${output}` : "";
  const current = params.size ? `?${params}` : "";
  return next === current ? null : next;
}

async function handleList(
  c: Context<{ Bindings: Env }>,
  sort: Exclude<Sort, "saved">,
  path: string,
) {
  const url = new URL(c.req.url);
  // stripSearchParams behavior: invalid/default params 301 to the canonical URL.
  const normalized = normalizeSearch(url.searchParams);
  if (normalized !== null) return cachedRedirect(c, `${path}${normalized}`, 301, 86_400);

  const nowMs = Date.now();
  const [data, stars, popularSearches] = await Promise.all([
    listData(c, sort),
    githubStars(c),
    getPopularSearchSuggestions(c.env.SEARCH_CACHE, nowMs),
  ]);
  if (data.params.page > data.totalPages) return renderNotFound(c);
  return c.html(
    listPage({
      sort,
      path,
      origin: publicOrigin(c),
      nowMs,
      stars,
      popularSearches,
      exportOpen: url.searchParams.get("export") === "true",
      ...data,
    }),
    200,
    LIST_HEADERS,
  );
}

/**
 * May this query page enter the index?
 *
 * `/palettes/{query}` echoes the path into <title>, <h1> and og:title, so an
 * ungated route is a keyword-injection surface: anyone who can link to
 * /palettes/buy-cheap-viagra can mint an indexable grabient.com page saying
 * that. The earlier guard keyed off result count, but Vectorize returns
 * nearest neighbours for literally any input, so it never fired.
 *
 * Three ways in, cheapest check first:
 *   - a query we curate and already publish in the sitemap
 *   - a color name, hex or seed, where the query IS the subject matter
 *   - a novel query whose top match clears PUBLISHABLE_SCORE
 *
 * Everything else is `noindex,follow` rather than a 404: the page is still
 * useful to a human who lands on it, and `follow` keeps the crawl path to the
 * seed pages open, which matters while those pages have no other inbound links.
 */
function indexableQuery(
  query: string,
  ranked: ReadonlyArray<{ score: number }>,
  context: QueryResultContext | null,
): boolean {
  if (isPublishableQuery(query)) return true;
  if (context) return true;
  return (ranked[0]?.score ?? 0) >= PUBLISHABLE_SCORE;
}

async function handleSemanticSearch(
  c: Context<{ Bindings: Env }>,
  routeParam: string,
) {
  const url = new URL(c.req.url);
  const query = queryFromParam(routeParam);
  if (!query) return renderNotFound(c);

  const path = `/palettes/${querySlug(query)}`;
  const normalizedSearch = normalizeQuerySearch(url.searchParams);
  if (url.pathname !== path || normalizedSearch !== null)
    return cachedRedirect(c, `${path}${normalizedSearch ?? url.search}`, 301, 86_400);

  const params = parseListSearch(url.searchParams);
  const sort = searchSort(url.searchParams);
  let results: SemanticSearchResult[];
  try {
    results = await searchPalettesForQuery(c.env, query, SEMANTIC_SEARCH_LIMIT);
  } catch (error) {
    console.error("semantic search failed:", error);
    results = [];
  }

  initDatabase(c.env.DB);
  let counts: Record<string, number> = {};
  if (results.length) {
    try {
      counts = await getLikesCountsByKeys(results.map((result) => result.seed));
    } catch (error) {
      // Search results remain useful if a transient D1 read fails; Vectorize's
      // metadata count is the fallback, matching the current app.
      console.warn("semantic search like-count refresh failed:", error);
    }
  }
  const ranked = results
    .map((result) => ({
      ...result,
      likesCount:
        counts[paletteCoeffKey(result.seed) ?? result.seed] ?? result.likesCount,
    }))
    .sort((a, b) => {
      if (sort === "newest") return b.createdAt - a.createdAt;
      if (sort === "oldest") return a.createdAt - b.createdAt;
      return b.likesCount - a.likesCount || b.score - a.score;
    });

  const total = ranked.length;
  const totalPages = Math.max(1, Math.ceil(total / params.limit));
  if (params.page > totalPages) return renderNotFound(c);
  const start = (params.page - 1) * params.limit;
  const items: CardItem[] = [];
  for (const result of ranked.slice(start, start + params.limit)) {
    const view = resolvePaletteView(
      {
        id: result.seed,
        style: result.style,
        steps: result.steps,
        angle: result.angle,
      },
      params,
    );
    if (!view) continue;
    const canonical = canonicalSeed(result.seed) ?? result.seed;
    items.push({
      seed: result.seed,
      key: paletteCoeffKey(result.seed) ?? result.seed,
      href: `/${canonical}${searchString(params, {
        page: 1,
        style: view.style,
        steps: view.steps,
        angle: view.angle,
      })}`,
      background: view.background,
      likesCount: result.likesCount,
      createdAtMs: result.createdAt,
      style: result.style,
      steps: result.steps,
      angle: result.angle,
    });
  }

  const origin = publicOrigin(c);
  // The heading noun follows what the URL pins, through the same rule the seed
  // page's title suffix uses (owner rule, 2026-08-18). `params.style` is
  // "auto" exactly when the param is absent, which is the presence test.
  const headingView = {
    style: params.style === "auto" ? DEFAULT_STYLE : params.style,
    styleInUrl: params.style !== "auto",
    steps: params.steps,
  };
  const heading = queryHeading(query, headingView);
  const context = queryResultContext(query);
  const canonical = `${origin}${path}${params.page > 1 ? `?page=${params.page}` : ""}`;
  const og = new URL("/api/og/query", origin);
  og.searchParams.set("query", query);
  og.searchParams.set("v", String(OG_RENDER_VERSION));
  if (params.style !== "auto") og.searchParams.set("style", params.style);
  if (params.steps !== "auto") og.searchParams.set("steps", String(params.steps));
  if (params.angle !== "auto") og.searchParams.set("angle", String(params.angle));

  const backPath = sort === "popular" ? "/" : `/${sort}`;
  const backHref = `${backPath}${searchString(params, { page: 1 })}`;
  const hiddenFields =
    sort === "popular"
      ? ""
      : `<input type="hidden" name="sort" value="${sort}">`;
  const nowMs = Date.now();
  const [stars, popularSearches] = await Promise.all([
    githubStars(c),
    getPopularSearchSuggestions(c.env.SEARCH_CACHE, nowMs),
  ]);
  return c.html(
    listPage({
      sort: "popular",
      path,
      params,
      items,
      total,
      totalPages,
      origin,
      nowMs,
      stars,
      popularSearches,
      island: false,
      feedbackQuery: query,
      emptyText: `No palettes found for “${query}”. Try a different color, mood, or theme.`,
      exportOpen: url.searchParams.get("export") === "true",
      heading,
      headingParts: queryHeadingParts(query, headingView),
      // Head term first, brand last: the title's leading words carry the most
      // weight, and every measured page-1 competitor leads with the keyword.
      pageTitle: `${heading} — ${styleNoun(params.style)} | Grabient`,
      pageDescription: `Explore ${heading.toLowerCase()} matched by color and mood. Customize each CSS gradient, then copy CSS or export SVG and PNG.`,
      pageCanonical: canonical,
      // Match queryRenderGate in seo.ts. That gate can only afford the cheap
      // check — deciding by relevance score would require running the search it
      // is trying to avoid — so it keys off the curated list alone. Pointing
      // og:image at a URL that would redirect anyway just spends a scraper
      // round trip, so non-curated queries advertise the static card directly.
      pageImage: isPublishableQuery(query) ? og.toString() : `${origin}/grabient.png`,
      pageImageAlt: `${heading} from Grabient`,
      // Vectorize returns nearest neighbours for any input, so `total` is
      // almost never zero and the old check never fired. See indexableQuery.
      // `results` is in Vectorize's score order; `ranked` has been re-sorted by
      // likes, so only the former's head is the top match.
      pageRobots: indexableQuery(query, results, context) ? undefined : "noindex,follow",
      pageStructuredData: {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: heading,
        // numberOfItems must describe what itemListElement actually contains —
        // `total` counts the whole result set, not this page's slice. URLs are
        // the seed pages' bare canonicals, not the parameterized card hrefs.
        numberOfItems: items.length,
        itemListElement: items.map((item, index) => ({
          "@type": "ListItem",
          position: start + index + 1,
          url: `${origin}/${encodeURIComponent(canonicalSeed(item.seed) ?? item.seed)}`,
        })),
      },
      queryContext: context,
      subheaderLeft: searchSubheaderLeft(sort, backHref, url.searchParams.get("export") === "true"),
      hiddenFields,
      paginationSearch: sort === "popular" ? {} : { sort },
    }),
    200,
    LIST_HEADERS,
  );
}

// Static footer pages. Content is baked into the bundle; only the star count
// is fetched (cached), so these are effectively free.
const STATIC_HEADERS = {
  "Cache-Control": "public, max-age=600",
  "CDN-Cache-Control": "max-age=86400",
};

async function staticPage(
  c: Context<{ Bindings: Env }>,
  path: string,
  title: string,
  description: string,
  content: string,
) {
  const stars = await githubStars(c);
  return c.html(
    legalPage({
      title,
      description,
      path,
      origin: publicOrigin(c),
      content,
      stars,
    }),
    200,
    STATIC_HEADERS,
  );
}

// ---------------------------------------------------------------------------
// Auth + likes. Everything here is per-user: no-store on both browser and
// edge so the shared page caches never see personalized bytes.
const NO_STORE = {
  "Cache-Control": "private, no-store",
  "CDN-Cache-Control": "no-store",
};

const contactBody = v.object({
  email: v.optional(
    v.pipe(v.string(), v.maxLength(254), v.email("Invalid email address")),
  ),
  subject: v.optional(v.pipe(v.string(), v.maxLength(120))),
  message: v.pipe(
    v.string(),
    v.minLength(10, "Message must be at least 10 characters long"),
    v.maxLength(10_000, "Message is too long"),
  ),
  turnstileToken: v.pipe(v.string(), v.minLength(1), v.maxLength(2048)),
});

function clientIdentifier(c: Context<{ Bindings: Env }>): string {
  return (
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-real-ip") ||
    "unknown"
  );
}

app.post("/api/contact", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = v.safeParse(contactBody, body);
  if (!parsed.success) {
    return c.json(
      { error: parsed.issues[0]?.message ?? "Invalid contact form" },
      400,
      NO_STORE,
    );
  }

  const rateLimit = await checkRateLimit(
    c.env.RATE_LIMITER,
    `ip:${clientIdentifier(c)}`,
    "contactForm",
  );
  if (rateLimit && !rateLimit.success) {
    c.header(
      "Retry-After",
      String(Math.max(0, rateLimit.reset - Math.floor(Date.now() / 1000))),
    );
    return c.json(
      { error: "Too many messages. Please try again later." },
      429,
      NO_STORE,
    );
  }

  const turnstile = new FormData();
  turnstile.set("secret", c.env.TURNSTILE_SECRET_KEY);
  turnstile.set("response", parsed.output.turnstileToken);
  const remoteIp = clientIdentifier(c);
  if (remoteIp !== "unknown") turnstile.set("remoteip", remoteIp);

  const verification = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body: turnstile },
  ).then((response) =>
    response.json<{ success?: boolean }>().catch(() => ({ success: false })),
  );
  if (!verification.success) {
    return c.json(
      { error: "Verification failed. Please try again." },
      400,
      NO_STORE,
    );
  }

  const { email, subject, message } = parsed.output;
  const safeMessage = esc(message);
  const safeEmail = email ? esc(email) : "Anonymous";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: c.env.EMAIL_FROM || "Contact Form <noreply@grabient.com>",
      to: ["john@grabient.com"],
      subject: subject
        ? `Grabient Contact: ${subject.slice(0, 120)}`
        : "Grabient Contact Form Message",
      html:
        '<div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto">' +
        '<h2 style="color:#333;margin-bottom:24px">New Contact Form Submission</h2>' +
        `<p><strong>From:</strong> ${safeEmail}</p>` +
        '<p style="margin-top:16px"><strong>Message:</strong></p>' +
        `<div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;white-space:pre-wrap">${safeMessage}</div>` +
        '<hr style="margin:24px 0;border:0;border-top:1px solid #e0e0e0">' +
        '<p style="color:#666;font-size:14px;margin:0">This email was sent from the Grabient contact form.</p></div>',
      ...(email ? { reply_to: email } : {}),
    }),
  });
  if (!response.ok) {
    console.error("contact: Resend rejected submission", response.status);
    return c.json(
      { error: "Failed to send message. Please try again later." },
      502,
      NO_STORE,
    );
  }
  return c.json({ success: true }, 200, NO_STORE);
});

const POSTHOG_API_HOST = "us.i.posthog.com";
const POSTHOG_ASSET_HOST = "us-assets.i.posthog.com";

async function proxyPostHog(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/e/, "") || "/";
  const asset = path.startsWith("/static/") || path.startsWith("/array/");
  const target = new URL(
    path + url.search,
    `https://${asset ? POSTHOG_ASSET_HOST : POSTHOG_API_HOST}`,
  );
  const headers = new Headers(request.headers);
  headers.delete("cookie");
  headers.delete("host");
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip");
  if (ip) headers.set("x-forwarded-for", ip);
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : request.body,
  });
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.set("Access-Control-Allow-Origin", "*");
  if (asset && upstream.ok) {
    responseHeaders.set("Cache-Control", "public, max-age=86400");
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

app.on(["GET", "POST"], ["/e", "/e/*"], (c) =>
  proxyPostHog(c.req.raw),
);
app.on("OPTIONS", ["/e", "/e/*"], (c) =>
  c.body(null, 204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  }),
);

app.on(["GET", "POST"], "/api/auth/*", async (c) => {
  const res = await initAuth(c.env).handler(c.req.raw);
  // better-auth's responses carry no cache headers, and Workers Cache
  // heuristically caches header-less 200s (~2h). That broke sign-in state
  // globally: an anonymous get-session "null" was edge-cached and served to
  // everyone — and a signed-in payload cached the same way would leak one
  // user's session data to strangers. Force no-store on every auth response.
  const out = new Response(res.body, res);
  out.headers.set("Cache-Control", NO_STORE["Cache-Control"]);
  out.headers.set("CDN-Cache-Control", NO_STORE["CDN-Cache-Control"]);
  return out;
});

// Bulk liked-seed list for marking hearts on cached list pages (client-side).
// Mirrors the current site's getUserLikedSeeds: [] when signed out. Seeds are
// returned as COEFFICIENT KEYS — the same palette can be liked under many
// seed aliases, and hearts (keyed by coefficient) must match all of them.
app.get("/api/likes", async (c) => {
  const session = await getSession(c.env, c.req.raw.headers);
  if (!session) return c.json({ seeds: [] }, 200, NO_STORE);
  initDatabase(c.env.DB);
  const seeds = await getUserLikedSeeds(session.user.id);
  return c.json({ seeds: likeCoeffKeys(seeds) }, 200, NO_STORE);
});

// Globals-free palette count + liked flag for the editor (its HTML is
// edge-cached, so the count can't be SSR'd). Custom-global and tared URLs for
// the same rendered palette intentionally share one save state.
app.get("/api/like-info", async (c) => {
  const seed = canonicalSeed(c.req.query("seed") ?? "");
  if (!seed) return c.json({ error: "Invalid seed" }, 400, NO_STORE);
  initDatabase(c.env.DB);
  const session = await getSession(c.env, c.req.raw.headers);
  const info = await getPaletteLikeInfo(seed, session?.user.id);
  return c.json(info, 200, NO_STORE);
});

// Public, write-fresh totals for list-page cards. List HTML is also no-store so
// its first paint is authoritative; this request remains a safety net for a
// like mutation racing a list query. Keys are coefficient identities emitted
// by the buttons, capped to one page to keep the response bounded.
app.get("/api/like-counts", async (c) => {
  const keys = [...new Set((c.req.query("keys") ?? "").split(",").filter(Boolean))].slice(0, 50);
  if (!keys.length) return c.json({ counts: {} }, 200, NO_STORE);
  initDatabase(c.env.DB);
  const counts = await getLikesCountsByKeys(keys);
  return c.json({ counts }, 200, NO_STORE);
});

const likeBody = v.object({
  seed: seedValidator,
  steps: stepsValidator,
  style: paletteStyleValidator,
  angle: angleValidator,
  exact: v.optional(v.boolean(), false),
});

app.post("/api/likes/toggle", async (c) => {
  const session = await getSession(c.env, c.req.raw.headers);
  if (!session) return c.json({ error: "Unauthorized" }, 401, NO_STORE);
  const rateLimit = await checkRateLimit(
    c.env.RATE_LIMITER,
    `user:${session.user.id}`,
    "toggleLike",
  );
  if (rateLimit) {
    c.header("X-RateLimit-Limit", String(rateLimit.limit));
    c.header("X-RateLimit-Remaining", String(rateLimit.remaining));
    c.header("X-RateLimit-Reset", String(rateLimit.reset));
    if (!rateLimit.success) {
      c.header(
        "Retry-After",
        String(Math.max(0, rateLimit.reset - Math.floor(Date.now() / 1000))),
      );
      return c.json(
        {
          error: "Rate limit exceeded",
          retryAfter: rateLimit.reset,
          limit: rateLimit.limit,
          remaining: rateLimit.remaining,
          reset: rateLimit.reset,
        },
        429,
        NO_STORE,
      );
    }
  }
  const body = await c.req.json().catch(() => null);
  const parsed = v.safeParse(likeBody, body);
  if (!parsed.success) return c.json({ error: "Invalid body" }, 400, NO_STORE);
  const { seed, steps, style, angle, exact } = parsed.output;
  initDatabase(c.env.DB);
  // Seed-page clients set `exact`; keep accepting that wire field during
  // rollout, but canonicalize storage to the globals-free rendered palette.
  const storageSeed = exact ? (paletteCoeffKey(seed) ?? seed) : seed;
  // Alias-aware toggle: matches the user's existing like by coefficient key
  // (one palette has many stored seed aliases), so an unlike always deletes.
  // key + likesCount are authoritative — the client sets both from this.
  const result = await toggleLikePaletteByKey(
    session.user.id,
    storageSeed,
    steps,
    style,
    angle,
  );
  return c.json(
    { liked: result.liked, key: result.key, likesCount: result.likesCount },
    200,
    NO_STORE,
  );
});

// Open-redirect guard for ?redirect=: same-origin paths only.
function safeRedirect(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

app.get("/login", async (c) => {
  const url = new URL(c.req.url);
  const redirect = safeRedirect(url.searchParams.get("redirect"));
  const session = await getSession(c.env, c.req.raw.headers);
  if (session) {
    c.header("Cache-Control", "private, no-store");
    return c.redirect(redirect ?? "/", 302);
  }
  const stars = await githubStars(c);
  return c.html(loginPage({ redirect, origin: publicOrigin(c), stars }), 200, NO_STORE);
});

app.get("/saved", async (c) => {
  const url = new URL(c.req.url);
  const session = await getSession(c.env, c.req.raw.headers);
  if (!session) {
    c.header("Cache-Control", "private, no-store");
    return c.redirect("/login?redirect=%2Fsaved", 302);
  }
  const params = parseListSearch(url.searchParams);
  initDatabase(c.env.DB);
  // Same shape as the current site's getUserLikedPalettes: fetch up to 1000
  // likes (with per-palette counts) and paginate in memory. Aliases of one
  // palette (liked under different seed encodings) merge to the most recent.
  const nowMs = Date.now();
  const [allLikes, stars, popularSearches] = await Promise.all([
    getUserLikesWithCounts(session.user.id, 1000).then(mergeLikeAliases),
    githubStars(c),
    getPopularSearchSuggestions(c.env.SEARCH_CACHE, nowMs),
  ]);
  const total = allLikes.length;
  const totalPages = Math.max(1, Math.ceil(total / params.limit));
  if (params.page > totalPages)
    return c.html(
      notFoundPage({
        origin: publicOrigin(c),
        path: url.pathname,
        stars,
      }),
      404,
      NO_STORE,
    );
  const start = (params.page - 1) * params.limit;
  const items: CardItem[] = [];
  for (const like of allLikes.slice(start, start + params.limit)) {
    const view = resolvePaletteView(
      { id: like.paletteId, style: like.style, steps: like.steps, angle: like.angle },
      params,
    );
    if (view)
      items.push({
        seed: like.paletteId,
        key: paletteCoeffKey(like.paletteId) ?? like.paletteId,
        href: `/${canonicalSeed(like.paletteId) ?? like.paletteId}${searchString(params, {
          page: 1,
          style: view.style,
          steps: view.steps,
          angle: view.angle,
        })}`,
        background: view.background,
        likesCount: like.likesCount,
        createdAtMs: like.createdAt.getTime(),
        style: like.style,
        steps: like.steps,
        angle: like.angle,
      });
  }
  return c.html(
    listPage({
      sort: "saved",
      path: "/saved",
      params,
      items,
      total,
      totalPages,
      origin: publicOrigin(c),
      nowMs,
      stars,
      popularSearches,
      island: false,
      emptyText: "You haven't saved any palettes yet.",
      user: session.user,
      exportOpen: url.searchParams.get("export") === "true",
    }),
    200,
    NO_STORE,
  );
});

// ---------------------------------------------------------------------------
// Settings + account management (ported from the current site's
// server-functions/auth.ts: same case-insensitive username uniqueness, same
// token-verified delete flow). All per-user: NO_STORE.

// Username availability probe for the settings form's debounced check.
// Unauthenticated like the original (usernames are public on palettes).
app.post("/api/settings/username/check", async (c) => {
  const body = await c.req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username : null;
  if (!username) return c.json({ error: "Invalid body" }, 400, NO_STORE);
  initDatabase(c.env.DB);
  return c.json({ available: await isUsernameAvailable(username) }, 200, NO_STORE);
});

app.post("/api/settings/username", async (c) => {
  const session = await getSession(c.env, c.req.raw.headers);
  if (!session) return c.json({ error: "Unauthorized" }, 401, NO_STORE);
  const body = await c.req.json().catch(() => null);
  const parsed = v.safeParse(updateUsernameSchema, body);
  if (!parsed.success)
    return c.json({ error: parsed.issues[0]?.message ?? "Invalid username" }, 400, NO_STORE);
  const { username } = parsed.output;
  initDatabase(c.env.DB);
  if (!(await isUsernameAvailable(username, session.user.id)))
    return c.json({ error: "Username already taken" }, 409, NO_STORE);
  await updateUsername(session.user.id, username);
  return c.json({ success: true }, 200, NO_STORE);
});

// Geo probe for the consent store's first-visit defaults (GDPR → opt-in
// required; elsewhere → legitimate interest). Per-request: NO_STORE.
app.get("/api/geo", (c) =>
  c.json({ isGdprRegion: isGdprRegion(c.req.raw.cf) }, 200, NO_STORE),
);

// Avatar upload. The original presigns an S3 URL and has the client PUT to R2
// directly; a Worker binding makes that two hops pointless — the client POSTs
// the (canvas-processed, 256x256) webp here and we put it straight into the
// same bucket the live site uses, under the same key scheme.
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

app.post("/api/settings/avatar", async (c) => {
  const session = await getSession(c.env, c.req.raw.headers);
  if (!session) return c.json({ error: "Unauthorized" }, 401, NO_STORE);
  if (!(c.req.header("content-type") ?? "").startsWith("image/webp"))
    return c.json({ error: "Avatar must be a WebP image" }, 400, NO_STORE);
  const body = await c.req.arrayBuffer().catch(() => null);
  if (!body || body.byteLength === 0) return c.json({ error: "Empty upload" }, 400, NO_STORE);
  if (body.byteLength > MAX_AVATAR_BYTES)
    return c.json({ error: "File size exceeds 5MB limit" }, 400, NO_STORE);
  // Same magic-byte sniffing as the original's validateImageFile: RIFF....WEBP.
  if (!isWebpBuffer(body)) return c.json({ error: "Invalid image file" }, 400, NO_STORE);

  const key = avatarKey(session.user.id, Date.now());
  await c.env.UPLOADS.put(key, body, { httpMetadata: { contentType: "image/webp" } });
  const imageUrl = `${c.env.R2_PUBLIC_URL}/${key}`;
  initDatabase(c.env.DB);
  await updateUserImage(session.user.id, imageUrl);

  // Best-effort cleanup of the previous avatar (third-party URLs, e.g.
  // Google's, don't start with our public base and are skipped).
  const oldKey = session.user.image
    ? avatarKeyFromUrl(session.user.image, c.env.R2_PUBLIC_URL)
    : null;
  if (oldKey) {
    try {
      await c.env.UPLOADS.delete(oldKey);
    } catch (error) {
      console.error("Failed to delete old avatar:", error);
    }
  }
  return c.json({ imageUrl }, 200, NO_STORE);
});

// Second half of the delete flow: the email's /settings?token=… link brings
// the user back here to confirm; better-auth validates the token (value,
// expiry, purpose, ownership) and deletes the user.
app.post("/api/settings/delete-account", async (c) => {
  const session = await getSession(c.env, c.req.raw.headers);
  if (!session) return c.json({ error: "Unauthorized" }, 401, NO_STORE);
  const body = await c.req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : null;
  if (!token) return c.json({ error: "Invalid body" }, 400, NO_STORE);
  try {
    const result = await initAuth(c.env).api.deleteUser({
      headers: c.req.raw.headers,
      body: { token },
    });
    if (!result.success) return c.json({ error: "Failed to delete account" }, 400, NO_STORE);
    return c.json({ success: true }, 200, NO_STORE);
  } catch {
    return c.json({ error: "Failed to delete account" }, 400, NO_STORE);
  }
});

// Not a redirect when signed out — the original renders the Profile card
// under a sign-up overlay (Account/Danger Zone only appear for a session).
app.get("/settings", async (c) => {
  const url = new URL(c.req.url);
  const token = url.searchParams.get("token");
  const [session, stars] = await Promise.all([
    getSession(c.env, c.req.raw.headers),
    githubStars(c),
  ]);
  return c.html(
    settingsPage({
      user: session?.user ?? null,
      token: session && token ? token : null,
      origin: publicOrigin(c),
      stars,
      gdpr: isGdprRegion(c.req.raw.cf),
    }),
    200,
    NO_STORE,
  );
});

app.get("/api/palettes", async (c) => {
  const sort = SORT_OF[c.req.query("sort") ?? ""] ?? "popular";
  const { items, total, totalPages } = await listData(c, sort);
  return c.json({ palettes: items, total, totalPages }, 200, LIST_HEADERS);
});

// Machine-readable palettes. /{seed}.json mirrors /{seed}.png: an agent that
// knows a page URL can get its data by changing the suffix, without a second
// spec to learn. /api/palette.json is the query-param spelling, symmetric with
// /api/png. Both are pure functions of the seed — no D1, no Vectorize.
app.get("/api/palette.json", (c) => paletteJsonResponse(c.req.url, publicOrigin(c)));

// The MCP server. Mounted on the same Worker as everything else — the protocol
// went stateless in the 2026-07-28 revision, so there is no session to keep and
// no Durable Object to bind. `viewer` stays null while every tool is public;
// see mcp.ts for how the account-gated path attaches later.
app.all("/mcp", (c) =>
  paletteMcpHandler(c.env, publicOrigin(c), new URL(c.req.url).hostname).fetch(c.req.raw),
);

app.get("/api/search.json", async (c) => {
  const query = normalizeSemanticQuery((c.req.query("query") ?? c.req.query("q") ?? "").trim());
  if (!query)
    return c.json({ error: "Missing query parameter" }, 400, {
      "Cache-Control": "no-store",
      "CDN-Cache-Control": "no-store",
    });

  const requested = Number.parseInt(c.req.query("limit") ?? "", 10);
  const limit = Number.isFinite(requested)
    ? Math.min(SEMANTIC_SEARCH_LIMIT, Math.max(1, requested))
    : DEFAULT_PAGE_LIMIT;

  const origin = publicOrigin(c);
  let results: Awaited<ReturnType<typeof searchPalettesForQuery>> = [];
  try {
    results = await searchPalettesForQuery(c.env, query, limit);
  } catch (error) {
    console.error("search.json failed", error);
    return c.json({ error: "Search temporarily unavailable" }, 503, {
      "Cache-Control": "no-store",
      "CDN-Cache-Control": "no-store",
    });
  }

  return c.json(
    {
      query,
      count: results.length,
      results: results.slice(0, limit).map((result) => ({
        ...paletteJson(result.seed, result.style, result.steps, result.angle, origin),
        likesCount: result.likesCount,
        score: result.score,
      })),
    },
    200,
    SEARCH_JSON_HEADERS,
  );
});

app.get("/robots.txt", (c) =>
  c.text(robotsTxt(publicOrigin(c)), 200, {
    "Cache-Control": "public, max-age=86400",
    "Content-Type": "text/plain; charset=utf-8",
  }),
);

const SITEMAP_HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, max-age=3600",
  "CDN-Cache-Control": "max-age=86400, stale-while-revalidate=86400",
};

// One index over three per-family children, so Search Console reports indexing
// separately for the shell routes, the search landing pages and the palette
// permalinks. A crawler cannot be told what kind of URL a seed is; this is the
// nearest available substitute.
app.get("/sitemap.xml", (c) => c.body(sitemapIndexXml(publicOrigin(c)), 200, SITEMAP_HEADERS));

app.get("/sitemap-pages.xml", (c) =>
  c.body(staticSitemapXml(publicOrigin(c)), 200, SITEMAP_HEADERS),
);

app.get("/sitemap-searches.xml", (c) =>
  c.body(searchSitemapXml(publicOrigin(c)), 200, SITEMAP_HEADERS),
);

// The 1,000 most popular palettes. Ids and timestamps only — the sitemap shows
// no like counts, so it skips the key-count work list rendering pays for; the
// edge cache makes generation infrequent on top of that.
app.get("/sitemap-palettes.xml", async (c) => {
  initDatabase(c.env.DB);
  try {
    const palettes = await getPopularPaletteIds(1000);
    // An empty result is a D1 failure, not an empty site. Serving it as a
    // cacheable 200 would publish a sitemap missing 96% of the corpus and hold
    // it at the edge for a day.
    if (!palettes.length) throw new Error("no palettes returned");
    return c.body(paletteSitemapXml(palettes, publicOrigin(c)), 200, SITEMAP_HEADERS);
  } catch (error) {
    console.error("sitemap: failed to load palettes", error);
    return c.text("Sitemap temporarily unavailable", 503, {
      "Cache-Control": NO_STORE["Cache-Control"],
      "CDN-Cache-Control": NO_STORE["CDN-Cache-Control"],
    });
  }
});

app.get("/api/og", (c) => paletteOgResponse(c.req.url, c.env));
app.get("/api/og/query", (c) => queryOgResponse(c.req.url, c.env));

// Raw renders: the image itself, no Grabient mark. /api/png is the long-standing
// form the data-collection harness and vision-captioning pipeline call; the
// .png suffix routes below are the guessable equivalents, so an agent that knows
// a page URL can get its image by appending .png. Both accept style/steps/angle
// and w/h.
app.get("/api/png", (c) => palettePngResponse(c.req.url, c.env));
app.get("/api/png/query", (c) => queryPngResponse(c.req.url, c.env));

// No-JS fallback for the semantic-search form. The query itself lives in the
// path so every result set has a shareable, indexable landing page.
app.get("/palettes", (c) => {
  const parsed = parseSearchInput(c.req.query("q") ?? "", new URL(c.req.url).origin);
  if (!parsed) return cachedRedirect(c, "/", 302, 300);
  const search = new URLSearchParams(parsed.searchParams);
  const suffix = search.size ? `?${search}` : "";
  return cachedRedirect(
    c,
    `/palettes/${searchRouteSegment(parsed.query)}${suffix}`,
    302,
    300,
  );
});
// Must precede /palettes/:query — that pattern would otherwise swallow the
// ".png" as part of the query text.
app.get("/palettes/:query{.+\\.png}", (c) => {
  const url = new URL(c.req.url);
  url.searchParams.set("query", c.req.param("query").slice(0, -".png".length));
  return queryPngResponse(url.toString(), c.env);
});
app.get("/palettes/:query", (c) =>
  handleSemanticSearch(c, c.req.param("query")),
);

app.get("/", (c) => handleList(c, "popular", "/"));
app.get("/newest", (c) => handleList(c, "newest", "/newest"));
app.get("/oldest", (c) => handleList(c, "oldest", "/oldest"));

app.get("/privacy", (c) =>
  staticPage(
    c,
    "/privacy",
    "Privacy Policy — Grabient",
    "How Grabient collects, uses, and protects your personal information.",
    PRIVACY_HTML,
  ),
);
app.get("/terms", (c) =>
  staticPage(
    c,
    "/terms",
    "Terms of Service — Grabient",
    "The terms and conditions for using Grabient.",
    TERMS_HTML,
  ),
);
app.get("/contact", (c) =>
  staticPage(
    c,
    "/contact",
    "Contact — Grabient",
    "Get in touch with the Grabient team.",
    contactContent(c.env.TURNSTILE_SITE_KEY),
  ),
);

// Must precede the /:seed catch-all, which would otherwise treat "abc.png" as a
// seed named "abc.png" and 404.
app.get("/:seed{.+\\.png}", (c) => {
  const url = new URL(c.req.url);
  url.searchParams.set("seed", c.req.param("seed").slice(0, -".png".length));
  return palettePngResponse(url.toString(), c.env);
});

// Same reason as the .png route above: must precede the /:seed catch-all.
app.get("/:seed{.+\\.json}", (c) => {
  const url = new URL(c.req.url);
  url.searchParams.set("seed", c.req.param("seed").slice(0, -".json".length));
  return paletteJsonResponse(url.toString(), publicOrigin(c));
});

// Legacy /:seed/edit URLs redirect to the seed page (the editor lives there now).
app.get("/:seed/edit", async (c) => {
  const seed = c.req.param("seed");
  const canonical = canonicalSeed(seed);
  if (!canonical) return renderNotFound(c);
  return cachedRedirect(c, `/${canonical}${new URL(c.req.url).search}`, 301, 86_400);
});

app.get("/:seed", async (c) => {
  const seed = c.req.param("seed");
  const url = new URL(c.req.url);
  const canonical = canonicalSeed(seed);
  if (!canonical) return renderNotFound(c);
  const normalized = normalizeSearch(url.searchParams);
  if (canonical !== seed || normalized !== null)
    return cachedRedirect(c, `/${canonical}${normalized ?? url.search}`, 301, 86_400);

  const stars = await githubStars(c);
  return c.html(
    seedPage({
      seed,
      params: parseListSearch(url.searchParams),
      size: parseSize(url.searchParams.get("size")),
      graph: url.searchParams.get("graph") === "1",
      origin: publicOrigin(c),
      stars,
    }),
    200,
    SEED_HEADERS,
  );
});

app.notFound((c) => renderNotFound(c));

export default app;
