import {
  colorNameToHex,
  hexToColorName,
  getUniqueColorNames,
  replaceHexWithColorNames,
} from "@repo/data-ops/color-utils";
import {
  DEFAULT_ANGLE,
  DEFAULT_STYLE,
  angleValidator,
  paletteStyleValidator,
  seedValidator,
  stepsValidator,
  type PaletteStyle,
} from "@repo/data-ops/valibot-schema/grabient";
import * as v from "valibot";
import { canonicalSeed, renderPalette } from "./palette";

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 3;
const SEED_SEARCH_STEPS = 11;
export const SEMANTIC_SEARCH_LIMIT = 48;
export const SEARCH_QUERY_MAX_LENGTH = 100;

export const POPULAR_SEARCHES = [
  "sunset",
  "ocean",
  "forest",
  "pastel",
  "neon",
  "warm",
  "cool",
  "monochrome",
  "tea",
  "purple",
  "alpine",
  "indigo",
  "charcoal & chocolate",
  "synthwave",
  "teal, azure, navy",
  "glossy",
  "party",
  "lagoon",
  "artisan",
  "refined",
  "dark academia",
  "punk",
  "winter",
  "prairie",
  "saffron",
  "sandstone",
] as const;

const HEX_CODE_REGEX = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;

export interface SemanticSearchResult {
  seed: string;
  tags: string[];
  style: PaletteStyle;
  steps: number;
  angle: number;
  likesCount: number;
  createdAt: number;
  score: number;
}

export type QueryResultContext =
  | { kind: "seed"; seed: string }
  | { kind: "colors"; colors: Array<{ name: string; hex: string }> };

export type QueryHeadingPart =
  | { kind: "text"; value: string }
  | { kind: "color"; value: string; hex: string };

export const semanticSearchResultSchema = v.object({
  seed: seedValidator,
  tags: v.array(v.string()),
  style: paletteStyleValidator,
  steps: stepsValidator,
  angle: angleValidator,
  likesCount: v.number(),
  createdAt: v.number(),
  score: v.number(),
});

/** Decode the route segment and apply the current app's hyphen-as-space URL convention. */
export function queryFromParam(param: string): string | null {
  const seed = canonicalSeed(param);
  if (seed) return seed;
  let decoded = param;
  try {
    decoded = decodeURIComponent(param);
  } catch {}
  const query = decoded.replace(/-/g, " ").replace(/\s+/g, " ").trim();
  return query && query.length <= SEARCH_QUERY_MAX_LENGTH ? query : null;
}

/** One canonical, lowercase landing URL for each text query; seeds remain case-sensitive. */
export function querySlug(query: string): string {
  const seed = canonicalSeed(query);
  if (seed) return encodeURIComponent(seed);
  return encodeURIComponent(query.trim().toLowerCase().replace(/\s+/g, "-"));
}

/** Text sent to the embedding model. Seeds and hex codes become human color names. */
export function normalizeSemanticQuery(query: string): string {
  const seed = canonicalSeed(query);
  if (seed) {
    const view = renderPalette(seed, DEFAULT_STYLE, SEED_SEARCH_STEPS, DEFAULT_ANGLE);
    if (view) return getUniqueColorNames(view.hexColors).join(" ");
  }
  return replaceHexWithColorNames(query)
    .replace(/[\[\]"{}]/g, "")
    .replace(/,\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function queryHeading(query: string): string {
  const seed = canonicalSeed(query);
  if (seed) {
    const view = renderPalette(seed, DEFAULT_STYLE, SEED_SEARCH_STEPS, DEFAULT_ANGLE);
    const names = view ? getUniqueColorNames(view.hexColors) : [];
    if (names.length) return `${names.join(", ")} palettes`;
  }

  const colorNames = [
    ...new Set((query.match(HEX_CODE_REGEX) ?? []).map((hex) => hexToColorName(hex))),
  ];
  if (colorNames.length) return `${colorNames.join(", ")} palettes`;
  return `${query.charAt(0).toUpperCase()}${query.slice(1)} palettes`;
}

/**
 * Split the human heading into text and recognized color names. This is the
 * old PalettePageHeader behavior, backed by data-ops' shared BASIC_COLORS map
 * so search headings and semantic normalization use the same vocabulary.
 */
export function queryHeadingParts(query: string): QueryHeadingPart[] {
  const heading = queryHeading(query);
  const parts: QueryHeadingPart[] = [];
  let cursor = 0;
  for (const match of heading.matchAll(/[a-z]+/gi)) {
    const index = match.index ?? 0;
    const word = match[0];
    const hex = colorNameToHex(word);
    if (!hex) continue;
    if (index > cursor)
      parts.push({ kind: "text", value: heading.slice(cursor, index) });
    parts.push({ kind: "color", value: word, hex });
    cursor = index + word.length;
  }
  if (cursor < heading.length)
    parts.push({ kind: "text", value: heading.slice(cursor) });
  return parts.length ? parts : [{ kind: "text", value: heading }];
}

/** Context shown only when the submitted value was converted before search. */
export function queryResultContext(query: string): QueryResultContext | null {
  const seed = canonicalSeed(query);
  if (seed) return { kind: "seed", seed };

  const colors: Array<{ name: string; hex: string }> = [];
  const seen = new Set<string>();
  for (const hex of query.match(HEX_CODE_REGEX) ?? []) {
    const name = hexToColorName(hex);
    if (seen.has(name)) continue;
    seen.add(name);
    colors.push({ name, hex });
  }
  return colors.length ? { kind: "colors", colors } : null;
}

function cacheKey(query: string, limit: number): string {
  return `search:${query.toLowerCase().trim()}:${limit}`;
}

export async function searchSemanticPalettes(
  env: Env,
  query: string,
  limit = SEMANTIC_SEARCH_LIMIT,
): Promise<SemanticSearchResult[]> {
  if (!env.AI || !env.VECTORIZE) {
    console.warn("Search unavailable: AI/Vectorize bindings not available");
    return [];
  }

  const normalized = normalizeSemanticQuery(query);
  if (!normalized) return [];
  const key = cacheKey(normalized, limit);

  if (env.SEARCH_CACHE) {
    try {
      const cached = await env.SEARCH_CACHE.get<unknown>(key, "json");
      const parsed = v.safeParse(v.array(semanticSearchResultSchema), cached);
      if (parsed.success) return parsed.output;
    } catch (error) {
      console.warn("Search cache read error:", error);
    }
  }

  const embedding = (await env.AI.run("@cf/google/embeddinggemma-300m", {
    text: [normalized],
  })) as { data?: number[][] };
  const vector = embedding.data?.[0];
  if (!vector) return [];

  const matches = await env.VECTORIZE.query(vector, {
    topK: limit,
    returnMetadata: "all",
  });
  const results = matches.matches
    .map((match) =>
      v.safeParse(semanticSearchResultSchema, {
        ...(match.metadata ?? {}),
        score: match.score,
      }),
    )
    .filter((result) => result.success)
    .map((result) => result.output);

  if (env.SEARCH_CACHE && results.length) {
    try {
      await env.SEARCH_CACHE.put(key, JSON.stringify(results), {
        expirationTtl: CACHE_TTL_SECONDS,
      });
    } catch (error) {
      console.warn("Search cache write error:", error);
    }
  }

  return results;
}
