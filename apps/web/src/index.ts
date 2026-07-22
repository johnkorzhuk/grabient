import { Hono, type Context } from "hono";
import * as v from "valibot";
import { initDatabase } from "@repo/data-ops/database/setup";
import {
  getPalettesCount,
  getPalettesPageByDate,
  getPopularPalettesPage,
  getPaletteLikeInfo,
  getUserLikedSeeds,
  getUserLikesWithCounts,
  toggleLikePalette,
} from "@repo/data-ops/queries/palettes";
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
import { canonicalSeed, resolvePaletteView } from "./palette";
import {
  contactContent,
  legalPage,
  listPage,
  loginPage,
  seedPage,
  type CardItem,
  type Sort,
} from "./pages";
import { PRIVACY_HTML, TERMS_HTML } from "./legal";

// HTML caching strategy (split browser vs edge):
//
// - CDN-Cache-Control (Workers Cache) stays LONG: the edge absorbs bot + repeat
//   traffic so D1 isn't hit per render, and it is deploy-safe — the Worker
//   version is part of the cache key by default (cross_version_cache: false),
//   so every deploy starts from an empty cache and old-version HTML is never
//   served again. No purge-on-deploy step is needed.
//
// - Cache-Control (browser) must stay SHORT with NO stale-while-revalidate:
//   the browser cache is NOT invalidated by a deploy. With the old
//   max-age=600 + swr=1800 on seeds, hover-preloads and prior visits let the
//   browser serve pre-deploy HTML for up to 40 minutes after a deploy — the
//   "old UI until manual refresh" bug. 60s bounds that window to a minute;
//   browser misses land on the (version-keyed, worker-skipping) edge cache, so
//   this costs zero worker CPU / D1 reads. Note the client nav layer also
//   reads this max-age to decide when to revalidate its in-tab cache.
const LIST_HEADERS = {
  "Cache-Control": "public, max-age=60",
  "CDN-Cache-Control": "max-age=1800, stale-while-revalidate=3600",
};
const SEED_HEADERS = {
  "Cache-Control": "public, max-age=60",
  "CDN-Cache-Control": "max-age=3600, stale-while-revalidate=7200",
};

const app = new Hono<{ Bindings: Env }>();

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
    if (view)
      items.push({
        seed: p.id,
        // Effective values (user-set or the palette's own) go into the seed
        // URL explicitly so the detail page renders exactly like the card —
        // mirrors the current site's card links.
        href: `/${p.id}${searchString(params, {
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

  return { params, items, total, totalPages: Math.max(1, Math.ceil(total / params.limit)) };
}

const SORT_OF: Record<string, Exclude<Sort, "saved">> = { newest: "newest", oldest: "oldest" };

async function handleList(
  c: Context<{ Bindings: Env }>,
  sort: Exclude<Sort, "saved">,
  path: string,
) {
  const url = new URL(c.req.url);
  // stripSearchParams behavior: invalid/default params 301 to the canonical URL.
  const normalized = normalizeSearch(url.searchParams);
  if (normalized !== null) return cachedRedirect(c, `${path}${normalized}`, 301, 86_400);

  const [data, stars] = await Promise.all([listData(c, sort), githubStars()]);
  return c.html(
    listPage({ sort, path, origin: url.origin, nowMs: Date.now(), stars, ...data }),
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
      origin: new URL(c.req.url).origin,
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

app.on(["GET", "POST"], "/api/auth/*", (c) => initAuth(c.env).handler(c.req.raw));

// Bulk liked-seed list for marking hearts on cached list pages (client-side).
// Mirrors the current site's getUserLikedSeeds: [] when signed out.
app.get("/api/likes", async (c) => {
  const session = await getSession(c.env, c.req.raw.headers);
  if (!session) return c.json({ seeds: [] }, 200, NO_STORE);
  const seeds = await getUserLikedSeeds(session.user.id);
  return c.json({ seeds }, 200, NO_STORE);
});

// Per-seed count + liked flag for the seed page (its HTML is edge-cached, so
// the count can't be SSR'd). Mirrors getPaletteLikeInfo on the current site.
app.get("/api/like-info", async (c) => {
  const seed = canonicalSeed(c.req.query("seed") ?? "");
  if (!seed) return c.json({ error: "Invalid seed" }, 400, NO_STORE);
  const session = await getSession(c.env, c.req.raw.headers);
  const info = await getPaletteLikeInfo(seed, session?.user.id);
  return c.json(info, 200, NO_STORE);
});

const likeBody = v.object({
  seed: seedValidator,
  steps: stepsValidator,
  style: paletteStyleValidator,
  angle: angleValidator,
});

app.post("/api/likes/toggle", async (c) => {
  const session = await getSession(c.env, c.req.raw.headers);
  if (!session) return c.json({ error: "Unauthorized" }, 401, NO_STORE);
  const body = await c.req.json().catch(() => null);
  const parsed = v.safeParse(likeBody, body);
  if (!parsed.success) return c.json({ error: "Invalid body" }, 400, NO_STORE);
  const { seed, steps, style, angle } = parsed.output;
  const result = await toggleLikePalette(session.user.id, seed, steps, style, angle);
  return c.json(result, 200, NO_STORE);
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
  return c.html(loginPage({ redirect, origin: url.origin, stars }), 200, NO_STORE);
});

app.get("/saved", async (c) => {
  const url = new URL(c.req.url);
  const session = await getSession(c.env, c.req.raw.headers);
  if (!session) {
    c.header("Cache-Control", "private, no-store");
    return c.redirect("/login?redirect=%2Fsaved", 302);
  }
  const params = parseListSearch(url.searchParams);
  // Same shape as the current site's getUserLikedPalettes: fetch up to 1000
  // likes (with per-palette counts) and paginate in memory.
  const [allLikes, stars] = await Promise.all([
    getUserLikesWithCounts(session.user.id, 1000),
    githubStars(),
  ]);
  const total = allLikes.length;
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
        href: `/${like.paletteId}${searchString(params, {
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
      totalPages: Math.max(1, Math.ceil(total / params.limit)),
      origin: url.origin,
      nowMs: Date.now(),
      stars,
      island: false,
      emptyText: "You haven't saved any palettes yet.",
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
  c.text("User-agent: *\nAllow: /\n", 200, { "Cache-Control": "public, max-age=86400" }),
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
    contactContent(),
  ),
);

// Legacy /:seed/edit URLs redirect to the seed page (the editor lives there now).
app.get("/:seed/edit", (c) => {
  const seed = c.req.param("seed");
  const canonical = canonicalSeed(seed);
  if (!canonical) return cachedRedirect(c, "/", 302, 300);
  return cachedRedirect(c, `/${canonical}${new URL(c.req.url).search}`, 301, 86_400);
});

app.get("/:seed", async (c) => {
  const seed = c.req.param("seed");
  const url = new URL(c.req.url);
  const canonical = canonicalSeed(seed);
  if (!canonical) return cachedRedirect(c, "/", 302, 300);
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
      origin: url.origin,
      stars,
    }),
    200,
    SEED_HEADERS,
  );
});

export default app;
