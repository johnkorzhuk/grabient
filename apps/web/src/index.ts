import { Hono, type Context } from "hono";
import * as v from "valibot";
import { initDatabase } from "@repo/data-ops/database/setup";
import {
  getPalettesCount,
  getPalettesPageByDate,
  getPopularPalettesPage,
  getPaletteLikeInfo,
  getLikesCountsByKeys,
  getUserLikedSeeds,
  getUserLikesWithCounts,
  toggleLikePaletteByKey,
} from "@repo/data-ops/queries/palettes";
import { isUsernameAvailable, updateUserImage, updateUsername } from "@repo/data-ops/queries/account";
import { updateUsernameSchema } from "@repo/data-ops/valibot-schema/auth";
import {
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
import { likeCoeffKeys, mergeLikeAliases } from "./likes";
import { isGdprRegion } from "./geo";
import { avatarKey, avatarKeyFromUrl, isWebpBuffer } from "./avatar";
import {
  OG_RENDER_VERSION,
  paletteOgResponse,
  queryOgResponse,
  robotsTxt,
  sitemapXml,
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
  searchSemanticPalettes,
  SEMANTIC_SEARCH_LIMIT,
  type SemanticSearchResult,
} from "./semantic-search";
import { parseSearchInput, searchRouteSegment } from "./search-input";
import { checkRateLimit } from "./rate-limit";
import { esc } from "./esc";
import { getPopularSearchSuggestions } from "./popular-searches";

export { RateLimiter } from "./rate-limit";

// HTML caching strategy:
//
// - Palette-list HTML and JSON contain live like totals, so neither the browser
//   nor the edge may cache them. Otherwise a hard refresh paints an old total
//   before the no-store reconciliation request visibly corrects it.
//
// - Seed HTML can stay edge-cached because it omits the live total and fills it
//   from /api/like-info. Its browser TTL stays short with no SWR:
//   the browser cache is NOT invalidated by a deploy. With the old
//   max-age=600 + swr=1800 on seeds, hover-preloads and prior visits let the
//   browser serve pre-deploy HTML for up to 40 minutes after a deploy — the
//   "old UI until manual refresh" bug. 60s bounds that window to a minute;
//   browser misses land on the (version-keyed, worker-skipping) edge cache, so
//   this costs zero worker CPU / D1 reads. Note the client nav layer also
//   reads this max-age to decide when to revalidate its in-tab cache.
export const LIST_HEADERS = {
  "Cache-Control": "no-store",
  "CDN-Cache-Control": "no-store",
};
const SEED_HEADERS = {
  "Cache-Control": "public, max-age=60",
  "CDN-Cache-Control": "max-age=3600, stale-while-revalidate=7200",
};

const app = new Hono<{ Bindings: Env }>();

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
    return c.redirect(target.toString(), 301);
  }
  await next();
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Frame-Options", "DENY");
});

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

// GitHub star count for the footer — same approach as the current site's
// github-stars server function: Cache API with a 4h TTL, tolerant of failure
// (0 hides the star chip). Cached per-colo; the page HTML edge cache in front
// makes actual GitHub hits rare.
const STARS_CACHE_URL = "https://grabient-lite.internal/__github-stars";

async function githubStars(): Promise<number> {
  try {
    const cache = caches.default;
    const key = new Request(STARS_CACHE_URL);
    const hit = await cache.match(key);
    if (hit) {
      const data = (await hit.json()) as { stars: number };
      return data.stars;
    }
    const res = await fetch("https://api.github.com/repos/johnkorzhuk/grabient", {
      headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "Grabient-App" },
    });
    if (!res.ok) return 0;
    const data = (await res.json()) as { stargazers_count: number };
    const stars = data.stargazers_count;
    await cache.put(
      key,
      new Response(JSON.stringify({ stars }), {
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=14400" },
      }),
    );
    return stars;
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
  const [stars] = await Promise.all([githubStars()]);
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
    githubStars(),
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
    results = await searchSemanticPalettes(c.env, query, SEMANTIC_SEARCH_LIMIT);
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
  const heading = queryHeading(query);
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
    githubStars(),
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
      headingParts: queryHeadingParts(query),
      pageTitle: `Grabient — ${heading}`,
      pageDescription: `Explore ${heading.toLowerCase()} matched by color and mood. Customize each CSS gradient, then copy CSS or export SVG and PNG.`,
      pageCanonical: canonical,
      pageImage: og.toString(),
      pageImageAlt: `${heading} from Grabient`,
      pageRobots: total ? undefined : "noindex,follow",
      pageStructuredData: {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: heading,
        numberOfItems: total,
        itemListElement: items.map((item, index) => ({
          "@type": "ListItem",
          position: start + index + 1,
          url: `${origin}${item.href}`,
        })),
      },
      queryContext: queryResultContext(query),
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
  const stars = await githubStars();
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
  const stars = await githubStars();
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
    githubStars(),
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
    githubStars(),
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

app.get("/robots.txt", (c) =>
  c.text(robotsTxt(publicOrigin(c)), 200, {
    "Cache-Control": "public, max-age=86400",
    "Content-Type": "text/plain; charset=utf-8",
  }),
);

// Dynamic sitemap from the current app: the crawlable shell routes plus the
// 1,000 most popular palettes. Ten bounded queries avoid a single oversized
// D1 result while the edge cache makes generation infrequent.
app.get("/sitemap.xml", async (c) => {
  initDatabase(c.env.DB);
  const seeds: string[] = [];
  try {
    for (let page = 1; page <= 10; page++) {
      const palettes = await getPopularPalettesPage(page, 100);
      if (!palettes.length) break;
      seeds.push(...palettes.map((palette) => palette.id));
      if (palettes.length < 100) break;
    }
  } catch (error) {
    console.error("sitemap: failed to load palettes", error);
  }
  return c.body(sitemapXml(seeds, publicOrigin(c)), 200, {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
    "CDN-Cache-Control": "max-age=86400, stale-while-revalidate=86400",
  });
});

app.get("/api/og", (c) => paletteOgResponse(c.req.url));
app.get("/api/og/query", (c) => queryOgResponse(c.req.url, c.env));

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

  const stars = await githubStars();
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
