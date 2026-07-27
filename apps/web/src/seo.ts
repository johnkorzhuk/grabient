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
  type SemanticSearchResult,
} from "./semantic-search";

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
Disallow:

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
# PNG renders, no auth, image/png at 1200x630. Both accept style/angle/steps:
#   ${base}/api/og?seed={seed}          single palette (compact or comma-separated seed)
#   ${base}/api/og/query?query={query}  top results for a semantic search
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

export function sitemapXml(
  paletteSeeds: readonly string[],
  origin = SEO_BASE_URL,
): string {
  const base = origin.replace(/\/+$/, "");
  const staticUrls = [
    { loc: `${base}/`, priority: "1.0" },
    { loc: `${base}/newest`, priority: "0.8" },
    { loc: `${base}/oldest`, priority: "0.5" },
    { loc: `${base}/contact`, priority: "0.3" },
  ];
  const paletteUrls = paletteSeeds
    .map(canonicalSeed)
    .filter((seed): seed is string => !!seed)
    .map((seed) => ({
      loc: `${base}/${encodeURIComponent(seed)}`,
      priority: "0.6",
    }));
  const searchUrls = POPULAR_SEARCHES.map((query) => ({
    loc: `${base}/palettes/${querySlug(query)}`,
    priority: "0.6",
  }));
  const entries = [...staticUrls, ...searchUrls, ...paletteUrls]
    .map(
      ({ loc, priority }) =>
        `  <url><loc>${xmlEscape(loc)}</loc><priority>${priority}</priority></url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
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
  const width = 1200;
  const height = 630;
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

  const logoColors = views[0]?.hexColors ?? ["#ffd25f", "#ff5f6d", "#a17fff"];
  const logoInk = views[0]
    ? heroInk(views[0], tiles[0].width, tiles[0].height, 112, 24, 340).ink
    : "light";
  const logoForeground = logoInk === "dark" ? "#0a0a0b" : "#fafafa";
  const logo = LOGO(logoColors, "")
    .replace('<svg class=""', '<svg x="32" y="30" width="286" height="65"')
    .replaceAll("currentColor", logoForeground)
    .replace(' role="img" aria-label="Grabient"', ' aria-hidden="true"');
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

async function renderPng(svg: string, cacheState?: "HIT" | "MISS"): Promise<Response> {
  const { Resvg } = await import("@cf-wasm/resvg/workerd");
  const resvg = await Resvg.async(svg, {
    fitTo: { mode: "width", value: 1200 },
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
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
      "CDN-Cache-Control": "max-age=604800",
      "X-Content-Type-Options": "nosniff",
      ...(cacheState ? { "X-Cache": cacheState } : {}),
    },
  });
}

export async function paletteOgResponse(requestUrl: string): Promise<Response> {
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

  try {
    return await renderPng(paletteOgSvg(view));
  } catch (error) {
    console.error("Error generating OG image:", error);
    return new Response("Error generating image", { status: 500 });
  }
}

export async function queryOgResponse(requestUrl: string, env: Env): Promise<Response> {
  const params = normalizeEntityMangledParams(new URL(requestUrl));
  const query = (params.get("query") ?? params.get("q") ?? "").trim();
  if (!query) return new Response("Missing query parameter", { status: 400 });

  const styleResult = v.safeParse(paletteStyleValidator, params.get("style"));
  const style: PaletteStyle | "auto" = styleResult.success ? styleResult.output : "auto";
  const parsedSteps = parsedInteger(params, "steps", stepsValidator, Number.NaN);
  const steps = Number.isNaN(parsedSteps) ? "auto" : parsedSteps;
  const parsedAngle = parsedInteger(params, "angle", angleValidator, Number.NaN);
  const angle = Number.isNaN(parsedAngle) ? "auto" : parsedAngle;
  const normalizedQuery = normalizeSemanticQuery(query);
  const cacheKey = `og-query:v${OG_RENDER_VERSION}:${normalizedQuery.toLowerCase()}:${style}:${steps}:${angle}`;

  if (env.OG_IMAGE_CACHE) {
    try {
      const cached = await env.OG_IMAGE_CACHE.get(cacheKey, "arrayBuffer");
      if (cached)
        return new Response(cached, {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=86400, s-maxage=604800",
            "CDN-Cache-Control": "max-age=604800",
            "X-Content-Type-Options": "nosniff",
            "X-Cache": "HIT",
          },
        });
    } catch (error) {
      console.warn("OG query cache read error:", error);
    }
  }

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
    if (env.OG_IMAGE_CACHE) {
      const bytes = await response.clone().arrayBuffer();
      await env.OG_IMAGE_CACHE.put(cacheKey, bytes, {
        expirationTtl: 60 * 60 * 24 * 7,
      });
    }
    return response;
  } catch (error) {
    console.error("Error generating query OG image:", error);
    return new Response("Error generating image", { status: 500 });
  }
}
