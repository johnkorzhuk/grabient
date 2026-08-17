import { calculateAverageBrightness } from "@repo/data-ops/gradient-gen/cosine";
import { generateSvgGradient } from "@repo/data-ops/gradient-gen/svg";
import {
  DEFAULT_PAGE_LIMIT,
  DEFAULT_ANGLE,
  DEFAULT_STEPS,
  DEFAULT_STYLE,
  angleValidator,
  paletteStyleValidator,
  stepsValidator,
  type PaletteStyle,
} from "@repo/data-ops/valibot-schema/grabient";
import * as v from "valibot";
import { LOGO } from "./icons";
import {
  DEFAULT_PALETTE,
  canonicalSeed,
  heroInk,
  renderPalette,
  type RenderedPalette,
} from "./palette";
import {
  normalizeSemanticQuery,
  POPULAR_SEARCHES,
  querySlug,
  searchSemanticPalettes,
  SEARCH_QUERY_MAX_LENGTH,
  type SemanticSearchResult,
} from "./semantic-search";
import { isPublishableQuery } from "./popular-searches";

export const SEO_BASE_URL = "https://grabient.com";

// The version is part of the public og:image URL and the query-image KV key, so
// crawlers cannot retain an earlier renderer after a visual refresh.
// 16: query card right rail became full-width bands instead of a 3x4 grid.
export const OG_RENDER_VERSION = 16;

export function robotsTxt(origin = SEO_BASE_URL): string {
  const base = origin.replace(/\/+$/, "");
  return `# Grabient - all crawlers welcome, including AI crawlers.
# Note: crawler access is also governed by Cloudflare AI Crawl Control;
# both must allow a bot for it to get through.

User-agent: *
# Per-visitor JSON the client fetches after render. Measured 2026-08-17,
# Googlebot spent most of a 1,152 req/day budget on these plus the analytics
# loader rather than on palettes, because rendering a page triggers them.
# None affect what the page says, so blocking them does not withhold a
# rendering resource. The agent-facing endpoints (.json, /api/png, /api/og)
# stay open on purpose.
Disallow: /api/like-info
Disallow: /api/like-counts
Disallow: /api/geo
Disallow: /api/auth/
Disallow: /api/palettes
# The zone auto-injects Zaraz; its loader was Googlebot's single most-fetched
# URL here (249/day). It is analytics, not a rendering resource, and keeping
# crawlers out of it also keeps them out of GA4.
Disallow: /cdn-cgi/

# Explicitly welcome AI search / assistant / training crawlers
User-agent: GPTBot
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: ClaudeBot
User-agent: Claude-User
User-agent: Claude-SearchBot
User-agent: PerplexityBot
User-agent: Perplexity-User
User-agent: Google-Extended
User-agent: Applebot-Extended
User-agent: meta-externalagent
User-agent: CCBot
Disallow:

Sitemap: ${base}/sitemap.xml

# Guide for LLMs and AI agents (site map + palette URL construction spec):
# ${base}/llms.txt
#
# PNG renders, no auth, image/png. Append .png to any page URL for the raw,
# unbranded image; add ?style=&angle=&steps= to change how it renders:
#   ${base}/{seed}.png              a single palette
#   ${base}/palettes/{query}.png    top results for a semantic search
# Explicit endpoints, same renders, also accept w= and h= (16-2400):
#   ${base}/api/png?seed={seed}
#   ${base}/api/png/query?query={query}
# /api/og and /api/og/query return the branded social card instead.
`;
}

export const ROBOTS_TXT = robotsTxt();

/** Telegram and a few other crawlers can send "&amp;style" literally. */
export function normalizeEntityMangledParams(url: URL): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of url.searchParams)
    params.set(key.startsWith("amp;") ? key.slice(4) : key, value);
  return params;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The sitemap is an index over three children rather than one flat file.
 *
 * Sitemaps carry no way to say what KIND of URL a <loc> is — a seed permalink
 * (a compact encoding of the cosine coefficients) is indistinguishable from a
 * search landing page to a crawler. Splitting by family is the closest
 * available signal, and it buys the thing that actually matters: Search
 * Console reports indexing per submitted file, so "are the query pages being
 * indexed?" and "are the 866 permalinks being indexed?" become separate,
 * answerable questions instead of one blended number.
 */
export interface PaletteSitemapEntry {
  id: string;
  createdAt?: Date | number | null;
}

export const SITEMAP_CHILDREN = [
  "/sitemap-pages.xml",
  "/sitemap-searches.xml",
  "/sitemap-palettes.xml",
] as const;

function urlset(
  entries: ReadonlyArray<{ loc: string; priority: string; lastmod?: string }>,
): string {
  const body = entries
    .map(
      ({ loc, priority, lastmod }) =>
        `  <url><loc>${xmlEscape(loc)}</loc>${
          lastmod ? `<lastmod>${lastmod}</lastmod>` : ""
        }<priority>${priority}</priority></url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

/** W3C date, the form Google reads; anything unparseable is simply omitted. */
function lastmodDate(value: Date | number | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  const iso = date.toISOString();
  return Number.isNaN(date.getTime()) ? undefined : iso.slice(0, 10);
}

export function sitemapIndexXml(origin = SEO_BASE_URL): string {
  const base = origin.replace(/\/+$/, "");
  const entries = SITEMAP_CHILDREN.map(
    (path) => `  <sitemap><loc>${xmlEscape(`${base}${path}`)}</loc></sitemap>`,
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>\n`;
}

export function staticSitemapXml(origin = SEO_BASE_URL): string {
  const base = origin.replace(/\/+$/, "");
  return urlset([
    { loc: `${base}/`, priority: "1.0" },
    { loc: `${base}/newest`, priority: "0.8" },
    { loc: `${base}/oldest`, priority: "0.5" },
    { loc: `${base}/contact`, priority: "0.3" },
  ]);
}

export function searchSitemapXml(origin = SEO_BASE_URL): string {
  const base = origin.replace(/\/+$/, "");
  return urlset(
    POPULAR_SEARCHES.map((query) => ({
      loc: `${base}/palettes/${querySlug(query)}`,
      priority: "0.7",
    })),
  );
}

export function paletteSitemapXml(
  palettes: readonly (string | PaletteSitemapEntry)[],
  origin = SEO_BASE_URL,
): string {
  const base = origin.replace(/\/+$/, "");
  return urlset(
    palettes
      .map((entry) => (typeof entry === "string" ? { id: entry } : entry))
      .map((entry) => ({ seed: canonicalSeed(entry.id), createdAt: entry.createdAt }))
      .filter(
        (entry): entry is { seed: string; createdAt: Date | number | null | undefined } =>
          !!entry.seed,
      )
      .map(({ seed, createdAt }) => ({
        loc: `${base}/${encodeURIComponent(seed)}`,
        priority: "0.6",
        lastmod: lastmodDate(createdAt),
      })),
  );
}

export function paletteOgImageUrl(
  origin: string,
  palette: Pick<RenderedPalette, "seed" | "style" | "steps" | "angle">,
): string {
  const url = new URL("/api/og", origin);
  url.searchParams.set("seed", palette.seed);
  url.searchParams.set("v", String(OG_RENDER_VERSION));
  if (palette.style !== DEFAULT_STYLE) url.searchParams.set("style", palette.style);
  if (palette.steps !== DEFAULT_STEPS) url.searchParams.set("steps", String(palette.steps));
  if (palette.angle !== DEFAULT_ANGLE) url.searchParams.set("angle", String(palette.angle));
  return url.toString();
}

function angularGradientLayer(
  hexColors: readonly string[],
  angle: number,
  width: number,
  height: number,
): string {
  if (hexColors.length < 2)
    return `<rect width="${width}" height="${height}" fill="${hexColors[0] ?? "#000000"}"/>`;

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.hypot(width, height) / 2 + 2;
  const segmentsPerPair = 36;
  const totalSegments = (hexColors.length - 1) * segmentsPerPair;
  const segmentAngle = 360 / totalSegments;
  let paths = "";

  for (let i = 0; i < totalSegments; i++) {
    const pair = Math.floor(i / segmentsPerPair);
    const progress = (i % segmentsPerPair) / segmentsPerPair;
    const from = hexColors[pair] ?? "#000000";
    const to = hexColors[Math.min(pair + 1, hexColors.length - 1)] ?? from;
    const channel = (offset: number) =>
      Math.round(
        parseInt(from.slice(offset, offset + 2), 16) +
          (parseInt(to.slice(offset, offset + 2), 16) -
            parseInt(from.slice(offset, offset + 2), 16)) *
            progress,
      );
    const color = `#${[channel(1), channel(3), channel(5)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")}`;
    const start = ((angle - 90 + i * segmentAngle) * Math.PI) / 180;
    const end = ((angle - 90 + (i + 1) * segmentAngle + 0.5) * Math.PI) / 180;
    paths += `<path d="M ${centerX},${centerY} L ${(centerX + radius * Math.cos(start)).toFixed(2)},${(centerY + radius * Math.sin(start)).toFixed(2)} A ${radius.toFixed(2)},${radius.toFixed(2)} 0 0 1 ${(centerX + radius * Math.cos(end)).toFixed(2)},${(centerY + radius * Math.sin(end)).toFixed(2)} Z" fill="${color}"/>`;
  }
  return paths;
}

function svgInner(svg: string): string {
  const open = svg.indexOf(">", svg.indexOf("<svg")) + 1;
  const close = svg.lastIndexOf("</svg>");
  return open > 0 && close > open ? svg.slice(open, close) : "";
}

function gradientLayer(
  view: RenderedPalette,
  width: number,
  height: number,
  gridItemIndex?: number,
): string {
  if (view.style === "angularGradient")
    return angularGradientLayer(view.hexColors, view.angle, width, height);
  return svgInner(
    generateSvgGradient(
      view.hexColors,
      view.style,
      view.angle,
      { seed: view.seed, searchString: "" },
      null,
      { width, height, gridItemIndex },
    ),
  );
}

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
// Raw PNG dimension bounds. The upper bound exists because resvg rasterizes on
// the request's CPU budget; the lower one keeps a stray w=0 from producing an
// empty image.
const PNG_MIN_DIMENSION = 16;
const PNG_MAX_DIMENSION = 2400;

/**
 * Total pixels one render may rasterize, per style.
 *
 * Clamping each axis to 2400 independently still permits 2400x2400 = 5.76M
 * pixels, and resvg's cost tracks pixel AREA rather than content. Measured
 * against staging at a constant 2000x1500 (~3.0M pixels), one style is not like
 * the others:
 *
 *     linearGradient    1.08s     angularGradient   0.95s
 *     linearSwatches    1.02s     angularSwatches   7.45s   <-- 6-12x
 *     radialGradient    0.62s     radialSwatches    1.19s
 *
 * angularSwatches is the only style that wraps the whole canvas in a
 * feGaussianBlur (the antiGap filter in packages/data-ops/src/gradient-gen/svg.ts,
 * which hides seams between the wedges). A blur is a neighbourhood operation
 * over every pixel, so it turns area into real work in a way the other styles
 * do not.
 *
 * A single flat cap would therefore either leave angularSwatches taking
 * multiple seconds or needlessly shrink five cheap styles. Budgeting per style
 * equalises the worst case instead: cheap styles get 4x the default card area,
 * the blurred one gets 1x, and both land near a second. Oversized requests
 * scale down proportionally rather than erroring, so callers keep their aspect
 * ratio.
 */
const PNG_MAX_PIXELS = OG_WIDTH * OG_HEIGHT * 4;
const PNG_MAX_PIXELS_BLURRED = OG_WIDTH * OG_HEIGHT;

function pngDimension(params: URLSearchParams, key: string, fallback: number): number {
  const raw = params.get(key);
  if (raw === null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(PNG_MAX_DIMENSION, Math.max(PNG_MIN_DIMENSION, parsed));
}

/**
 * Refuse to spend a full render on a query we would not index.
 *
 * `/api/og/query` and `/api/png/query` are the most expensive URLs on the site
 * and the only ones whose input space is unbounded *text*. Each novel query
 * costs a KV read, a Workers AI embedding, a Vectorize query, a resvg
 * rasterization and a KV write, and because the cache key contains the query
 * string, a caller supplying fresh strings never hits cache. Measured against
 * production: ~2.0 s per novel query versus 0.098 s for a cached PNG.
 *
 * That latency is itself why the edge rate limit does not help. The rule is
 * 300 requests / 10 s per IP, but at 2 s per request a single machine holding
 * 40 connections sustains only ~20/s — comfortably under the threshold while
 * running the most expensive path on the site. The limit clamps hardest on
 * cached PNGs that cost nothing and not at all on this. Cloudflare offers no
 * hard spend cap, and on a Free zone rate limiting rules cannot match on query
 * string at all, so the bound has to live here.
 *
 * Two gates, cheapest first. Anything longer than the search input allows is
 * rejected outright — the HTML route enforces that cap in queryFromParam, but
 * these routes never did, so `?query=<2000 chars>` reached the embedding model.
 * Then: a query we would not publish a landing page for gets the static brand
 * image instead of a bespoke montage. Sharing a niche search yields the
 * Grabient card rather than a custom one, which is a fair trade for removing an
 * unbounded, uncacheable spend surface.
 */
function queryRenderGate(query: string): Response | null {
  if (query.length > SEARCH_QUERY_MAX_LENGTH)
    return new Response("Query too long", { status: 400 });
  if (isPublishableQuery(query)) return null;
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/grabient.png",
      "Cache-Control": "public, max-age=86400",
      "CDN-Cache-Control": "max-age=604800",
    },
  });
}

/** Scale a requested size down to this style's budget, preserving aspect ratio. */
function fitPixelBudget(
  width: number,
  height: number,
  style: PaletteStyle | "auto",
): [number, number] {
  const budget = style === "angularSwatches" ? PNG_MAX_PIXELS_BLURRED : PNG_MAX_PIXELS;
  const pixels = width * height;
  if (pixels <= budget) return [width, height];
  const scale = Math.sqrt(budget / pixels);
  return [
    Math.max(PNG_MIN_DIMENSION, Math.round(width * scale)),
    Math.max(PNG_MIN_DIMENSION, Math.round(height * scale)),
  ];
}

/** Just the gradient — no logo, no padding. The raw render of a palette. */
export function paletteBareSvg(
  view: RenderedPalette,
  width: number,
  height: number,
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${gradientLayer(view, width, height)}
</svg>`;
}

export function paletteOgSvg(view: RenderedPalette): string {
  const background =
    calculateAverageBrightness(view.hexColors) > 0.5 ? "#ffffff" : "#0a0a0b";
  const foreground = background === "#ffffff" ? "#0a0a0b" : "#fafafa";
  const gradient = gradientLayer(view, 1200, 630);
  const logo = LOGO(view.hexColors, "")
    .replace(
      '<svg class=""',
      '<svg x="32" y="32" width="286" height="65"',
    )
    .replaceAll("currentColor", foreground)
    .replace(' role="img" aria-label="Grabient"', ' aria-hidden="true"');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="${background}"/>
${gradient}
${logo}
</svg>`;
}

export function queryOgSvg(
  results: readonly SemanticSearchResult[],
  style: PaletteStyle | "auto",
  steps: number | "auto",
  angle: number | "auto",
): string {
  return queryTilesSvg(results, style, steps, angle, OG_WIDTH, OG_HEIGHT, true);
}

/** The same montage without branding, for the raw /api/png family. */
export function queryBareSvg(
  results: readonly SemanticSearchResult[],
  style: PaletteStyle | "auto",
  steps: number | "auto",
  angle: number | "auto",
  width: number,
  height: number,
): string {
  return queryTilesSvg(results, style, steps, angle, width, height, false);
}

function queryTilesSvg(
  results: readonly SemanticSearchResult[],
  style: PaletteStyle | "auto",
  steps: number | "auto",
  angle: number | "auto",
  width: number,
  height: number,
  withLogo: boolean,
): string {
  const phi = (1 + Math.sqrt(5)) / 2;
  const majorWidth = Math.round(width / phi);
  const minorWidth = width - majorWidth;
  const majorHeight = Math.round(height / phi);
  const minorHeight = height - majorHeight;
  const partition = (offset: number, span: number, count: number) =>
    Array.from({ length: count }, (_, index) => {
      const start = offset + Math.round((span * index) / count);
      const end = offset + Math.round((span * (index + 1)) / count);
      return { start, size: end - start };
    });
  const leftBottomColumns = partition(0, majorWidth, 3);
  // The right rail reads as a stack of palette strips: full-bleed bands of
  // uniform height, so each result shows its whole gradient left to right
  // instead of being cropped into a square. Keeping 12 of them preserves the
  // number of results the card advertises.
  const RIGHT_BAND_COUNT = 12;
  const rightBands = partition(0, height, RIGHT_BAND_COUNT);
  // One dominant palette and three supporting palettes on the left; a stack of
  // full-width result bands on the right shows the breadth of the search query.
  const tiles = [
    { x: 0, y: 0, width: majorWidth, height: majorHeight },
    ...leftBottomColumns.map((column) => ({
      x: column.start,
      y: majorHeight,
      width: column.size,
      height: minorHeight,
    })),
    ...rightBands.map((band) => ({
      x: majorWidth,
      y: band.start,
      width: minorWidth,
      height: band.size,
    })),
  ];
  const views = results
    .slice(0, tiles.length)
    .map((result) =>
      renderPalette(
        result.seed,
        style === "auto" ? result.style : style,
        steps === "auto" ? result.steps : steps,
        angle === "auto" ? result.angle : angle,
      ),
    )
    .filter((view): view is RenderedPalette => view !== null);

  let cells = "";
  for (const [index, tile] of tiles.entries()) {
    const view = views.length ? views[index % views.length] : undefined;
    const content = view
      ? gradientLayer(view, tile.width, tile.height, index)
      : `<rect width="${tile.width}" height="${tile.height}" fill="#0a0a0b"/>`;
    cells += `<defs><clipPath id="og-cell-${index}"><rect x="${tile.x}" y="${tile.y}" width="${tile.width}" height="${tile.height}"/></clipPath></defs>
<g clip-path="url(#og-cell-${index})"><g transform="translate(${tile.x} ${tile.y})">${content}</g></g>`;
  }

  let logo = "";
  if (withLogo) {
    const logoColors = views[0]?.hexColors ?? ["#ffd25f", "#ff5f6d", "#a17fff"];
    const logoInk = views[0]
      ? heroInk(views[0], tiles[0].width, tiles[0].height, 112, 24, 340).ink
      : "light";
    const logoForeground = logoInk === "dark" ? "#0a0a0b" : "#fafafa";
    logo = LOGO(logoColors, "")
      .replace('<svg class=""', '<svg x="32" y="30" width="286" height="65"')
      .replaceAll("currentColor", logoForeground)
      .replace(' role="img" aria-label="Grabient"', ' aria-hidden="true"');
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${cells}
${logo}
</svg>`;
}

function parsedInteger(
  params: URLSearchParams,
  key: string,
  schema: typeof stepsValidator | typeof angleValidator,
  fallback: number,
): number {
  const raw = params.get(key);
  const parsed = raw === null ? NaN : Number.parseInt(raw, 10);
  const result = v.safeParse(schema, parsed);
  return result.success ? result.output : fallback;
}

function pngResponseHeaders(cacheState?: "HIT" | "MISS"): Record<string, string> {
  return {
    "Content-Type": "image/png",
    // No s-maxage here on purpose. CDN-Cache-Control already outranks it at the
    // edge, so it bought nothing — but its presence disables stale-while-
    // revalidate AND stale-if-error, including the default serve-stale-on-
    // worker-error. Rasterizing is the most CPU-expensive thing this worker
    // does, so serving a stale PNG through an error is exactly the behaviour
    // worth keeping.
    "Cache-Control": "public, max-age=86400",
    "CDN-Cache-Control": "max-age=604800",
    "X-Content-Type-Options": "nosniff",
    // No CORS header here: isPublicApiPath in index.ts already sets it for
    // every .png/.json/api render in one place.
    ...(cacheState ? { "X-Cache": cacheState } : {}),
  };
}

// KV cache for finished PNGs, shared by the OG cards and the raw /api/png
// family. The edge cache in front is version-keyed (cross_version_cache:
// false), so every deploy would otherwise re-rasterize the whole long tail —
// rasterizing is the most CPU-expensive thing this worker does, and a KV read
// costs an order of magnitude less than a resvg render. Keys carry
// OG_RENDER_VERSION (raw renders share it; a bump just re-renders them), and
// the 7-day TTL bounds storage for unpopular keys.
const PNG_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;

async function kvPngGet(
  cache: KVNamespace | undefined,
  key: string | null,
): Promise<Response | null> {
  if (!cache || !key) return null;
  try {
    const cached = await cache.get(key, "arrayBuffer");
    if (cached) return new Response(cached, { headers: pngResponseHeaders("HIT") });
  } catch (error) {
    console.warn("PNG cache read error:", error);
  }
  return null;
}

async function kvPngPut(
  cache: KVNamespace | undefined,
  key: string | null,
  response: Response,
): Promise<void> {
  if (!cache || !key || !response.ok) return;
  try {
    const bytes = await response.clone().arrayBuffer();
    await cache.put(key, bytes, { expirationTtl: PNG_CACHE_TTL_SECONDS });
  } catch (error) {
    console.warn("PNG cache write error:", error);
  }
}

async function renderPng(
  svg: string,
  cacheState?: "HIT" | "MISS",
  fitWidth = OG_WIDTH,
): Promise<Response> {
  const { Resvg } = await import("@cf-wasm/resvg/workerd");
  const resvg = await Resvg.async(svg, {
    fitTo: { mode: "width", value: fitWidth },
  });
  let png: Uint8Array;
  try {
    const rendered = resvg.render();
    try {
      png = rendered.asPng();
    } finally {
      rendered.free();
    }
  } finally {
    resvg.free();
  }
  return new Response(new Uint8Array(png), {
    headers: pngResponseHeaders(cacheState),
  });
}

/**
 * Raw palette PNG — the gradient and nothing else, no Grabient mark.
 *
 * This is what /api/png and /{seed}.png serve. Kept separate from the OG card
 * on purpose: OG images are branded social previews, while this is the image
 * itself, meant to be embedded, fed to a vision model, or composited.
 * Honors style/steps/angle plus w/h.
 */
export async function palettePngResponse(requestUrl: string, env?: Env): Promise<Response> {
  const params = normalizeEntityMangledParams(new URL(requestUrl));
  const requestedSeed = params.get("seed") ?? DEFAULT_PALETTE.seed;
  const seed = canonicalSeed(requestedSeed);
  if (!seed) return new Response("Invalid seed format", { status: 400 });

  const styleResult = v.safeParse(paletteStyleValidator, params.get("style"));
  const style: PaletteStyle = styleResult.success ? styleResult.output : DEFAULT_STYLE;
  const steps = parsedInteger(params, "steps", stepsValidator, DEFAULT_STEPS);
  const angle = parsedInteger(params, "angle", angleValidator, DEFAULT_ANGLE);
  const [width, height] = fitPixelBudget(
    pngDimension(params, "w", OG_WIDTH),
    pngDimension(params, "h", OG_HEIGHT),
    style,
  );
  const view = renderPalette(seed, style, steps, angle);
  if (!view) return new Response("Invalid seed format", { status: 400 });

  // Only the default 1200x630 render is KV-cached: w/h are caller-chosen, and
  // an unbounded key space means unbounded KV writes. Custom sizes still get
  // the edge cache.
  const cacheKey =
    width === OG_WIDTH && height === OG_HEIGHT
      ? `png-seed:v${OG_RENDER_VERSION}:${seed}:${style}:${steps}:${angle}`
      : null;
  const hit = await kvPngGet(env?.OG_IMAGE_CACHE, cacheKey);
  if (hit) return hit;

  try {
    const response = await renderPng(paletteBareSvg(view, width, height), undefined, width);
    await kvPngPut(env?.OG_IMAGE_CACHE, cacheKey, response);
    return response;
  } catch (error) {
    console.error("Error generating palette PNG:", error);
    return new Response("Error generating image", { status: 500 });
  }
}

/** Raw search-results PNG — same montage as the query card, without the mark. */
export async function queryPngResponse(requestUrl: string, env: Env): Promise<Response> {
  const params = normalizeEntityMangledParams(new URL(requestUrl));
  const query = (params.get("query") ?? params.get("q") ?? "").trim();
  if (!query) return new Response("Missing query parameter", { status: 400 });
  const gate = queryRenderGate(query);
  if (gate) return gate;

  const styleResult = v.safeParse(paletteStyleValidator, params.get("style"));
  const style: PaletteStyle | "auto" = styleResult.success ? styleResult.output : "auto";
  const parsedSteps = parsedInteger(params, "steps", stepsValidator, Number.NaN);
  const steps = Number.isNaN(parsedSteps) ? "auto" : parsedSteps;
  const parsedAngle = parsedInteger(params, "angle", angleValidator, Number.NaN);
  const angle = Number.isNaN(parsedAngle) ? "auto" : parsedAngle;
  const [width, height] = fitPixelBudget(
    pngDimension(params, "w", OG_WIDTH),
    pngDimension(params, "h", OG_HEIGHT),
    style,
  );

  const normalizedQuery = normalizeSemanticQuery(query);
  const cacheKey =
    width === OG_WIDTH && height === OG_HEIGHT
      ? `png-query:v${OG_RENDER_VERSION}:${normalizedQuery.toLowerCase()}:${style}:${steps}:${angle}`
      : null;
  const hit = await kvPngGet(env?.OG_IMAGE_CACHE, cacheKey);
  if (hit) return hit;

  let results: SemanticSearchResult[] = [];
  try {
    results = await searchSemanticPalettes(env, normalizedQuery, DEFAULT_PAGE_LIMIT);
  } catch (error) {
    console.warn("Query PNG search error:", error);
  }

  try {
    const response = await renderPng(
      queryBareSvg(results, style, steps, angle, width, height),
      undefined,
      width,
    );
    // An empty montage (search outage) must not persist for 7 days.
    if (results.length) await kvPngPut(env?.OG_IMAGE_CACHE, cacheKey, response);
    return response;
  } catch (error) {
    console.error("Error generating query PNG:", error);
    return new Response("Error generating image", { status: 500 });
  }
}

export async function paletteOgResponse(requestUrl: string, env?: Env): Promise<Response> {
  const params = normalizeEntityMangledParams(new URL(requestUrl));
  const requestedSeed = params.get("seed") ?? DEFAULT_PALETTE.seed;
  const seed = canonicalSeed(requestedSeed);
  if (!seed) return new Response("Invalid seed format", { status: 400 });

  const styleResult = v.safeParse(paletteStyleValidator, params.get("style"));
  const style: PaletteStyle = styleResult.success ? styleResult.output : DEFAULT_STYLE;
  const steps = parsedInteger(params, "steps", stepsValidator, DEFAULT_STEPS);
  const angle = parsedInteger(params, "angle", angleValidator, DEFAULT_ANGLE);
  const view = renderPalette(seed, style, steps, angle);
  if (!view) return new Response("Invalid seed format", { status: 400 });

  const cacheKey = `og-seed:v${OG_RENDER_VERSION}:${seed}:${style}:${steps}:${angle}`;
  const hit = await kvPngGet(env?.OG_IMAGE_CACHE, cacheKey);
  if (hit) return hit;

  try {
    const response = await renderPng(paletteOgSvg(view), "MISS");
    await kvPngPut(env?.OG_IMAGE_CACHE, cacheKey, response);
    return response;
  } catch (error) {
    console.error("Error generating OG image:", error);
    return new Response("Error generating image", { status: 500 });
  }
}

export async function queryOgResponse(requestUrl: string, env: Env): Promise<Response> {
  const params = normalizeEntityMangledParams(new URL(requestUrl));
  const query = (params.get("query") ?? params.get("q") ?? "").trim();
  if (!query) return new Response("Missing query parameter", { status: 400 });
  const gate = queryRenderGate(query);
  if (gate) return gate;

  const styleResult = v.safeParse(paletteStyleValidator, params.get("style"));
  const style: PaletteStyle | "auto" = styleResult.success ? styleResult.output : "auto";
  const parsedSteps = parsedInteger(params, "steps", stepsValidator, Number.NaN);
  const steps = Number.isNaN(parsedSteps) ? "auto" : parsedSteps;
  const parsedAngle = parsedInteger(params, "angle", angleValidator, Number.NaN);
  const angle = Number.isNaN(parsedAngle) ? "auto" : parsedAngle;
  const normalizedQuery = normalizeSemanticQuery(query);
  const cacheKey = `og-query:v${OG_RENDER_VERSION}:${normalizedQuery.toLowerCase()}:${style}:${steps}:${angle}`;
  const hit = await kvPngGet(env.OG_IMAGE_CACHE, cacheKey);
  if (hit) return hit;

  let results: SemanticSearchResult[] = [];
  try {
    results = await searchSemanticPalettes(env, normalizedQuery, DEFAULT_PAGE_LIMIT);
  } catch (error) {
    console.error("OG query search failed:", error);
    return new Response("Search failed", { status: 500 });
  }

  if (!results.length) return new Response("No results found", { status: 404 });
  try {
    const response = await renderPng(queryOgSvg(results, style, steps, angle), "MISS");
    await kvPngPut(env.OG_IMAGE_CACHE, cacheKey, response);
    return response;
  } catch (error) {
    console.error("Error generating query OG image:", error);
    return new Response("Error generating image", { status: 500 });
  }
}
