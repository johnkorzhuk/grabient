import {
  colorNameToHex,
  getColorsWithHex,
  getColorsWithHue,
  type ColorWithHue,
} from "@repo/data-ops/color-utils";

const HOUR_MS = 60 * 60 * 1000;
const CACHE_TTL_SECONDS = 2 * 60 * 60;
const CACHE_VERSION = 1;
export const POPULAR_SEARCH_COUNT = 24;

/**
 * Stable crawl seeds and the synchronous rendering fallback. The live UI is
 * supplied by getPopularSearchSuggestions(), which rotates every UTC hour.
 */
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
  "blue",
  "purple",
  "cyan",
  "rose",
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

export interface PopularSearchSuggestion {
  query: string;
  /** Optional explicit swatches. A future generator need not use known color names. */
  swatches?: string[];
  /** Free-form provenance for observability, such as "curated" or "llm". */
  source?: string;
}

export interface PopularSearchContext {
  /** UTC hour since Unix epoch. It is also the deterministic generation seed. */
  hour: number;
  count: number;
}

/**
 * Providers only create candidates. Hour bucketing, validation, deduplication,
 * curated backfill, and KV caching remain shared when an LLM provider is added.
 */
export interface PopularSearchProvider {
  id: string;
  /**
   * KV-cache the generated batch. Defaults to true — the layer an LLM
   * provider needs. The curated provider sets false: its output is a pure
   * deterministic function of the hour, so a KV read per render (which the
   * shared code computes locally as the fallback anyway) is pure cost.
   */
  cacheable?: boolean;
  generate(
    context: PopularSearchContext,
  ): PopularSearchSuggestion[] | Promise<PopularSearchSuggestion[]>;
}

const FEATURED_QUERIES = [
  "blue",
  "purple",
  "cyan",
  "rose",
  "charcoal & chocolate",
  "teal, azure, navy",
] as const;

// A deliberately broad, hand-reviewed vocabulary derived from the previous
// Grabient suggestion catalog. These remain useful fallback/backfill terms
// after a more adventurous provider starts supplying some of the hourly set.
const CURATED_THEMES = [
  "sunset",
  "sunrise",
  "golden hour",
  "blue hour",
  "midnight",
  "twilight",
  "dawn",
  "dusk",
  "summer",
  "autumn",
  "winter",
  "spring",
  "ocean",
  "lagoon",
  "coral reef",
  "deep sea",
  "coastal",
  "nautical",
  "tropical",
  "underwater",
  "forest",
  "rainforest",
  "meadow",
  "prairie",
  "alpine",
  "desert",
  "canyon",
  "volcanic",
  "arctic",
  "glacier",
  "aurora borealis",
  "northern lights",
  "storm",
  "fog",
  "mist",
  "rain",
  "thunder",
  "cloudy",
  "floral",
  "wildflower",
  "rose garden",
  "lavender field",
  "terrarium",
  "chlorophyll",
  "bioluminescent",
  "celestial",
  "cosmic",
  "nebula",
  "galaxy",
  "eclipse",
  "moonlight",
  "starlight",
  "pastel",
  "muted",
  "warm",
  "cool",
  "vibrant",
  "monochrome",
  "duotone",
  "iridescent",
  "pearlescent",
  "holographic",
  "neon",
  "glossy",
  "matte",
  "metallic",
  "chrome",
  "copper",
  "brass",
  "gold leaf",
  "silver",
  "rust",
  "patina",
  "charcoal",
  "sandstone",
  "marble",
  "granite",
  "terrazzo",
  "porcelain",
  "stained glass",
  "velvet",
  "silk",
  "linen",
  "denim",
  "leather",
  "paper",
  "ink",
  "watercolor",
  "oil paint",
  "gouache",
  "airbrush",
  "screen print",
  "risograph",
  "film grain",
  "polaroid",
  "cinematic",
  "technicolor",
  "noir",
  "retro",
  "vintage",
  "mid-century modern",
  "art deco",
  "art nouveau",
  "bauhaus",
  "brutalist",
  "minimalist",
  "maximalist",
  "modernist",
  "impressionist",
  "surreal",
  "abstract",
  "geometric",
  "organic",
  "synthwave",
  "vaporwave",
  "cyberpunk",
  "solarpunk",
  "steampunk",
  "cassette futurism",
  "Y2K",
  "pixel art",
  "arcade",
  "glitch",
  "digital",
  "analog",
  "dark academia",
  "light academia",
  "cottagecore",
  "goblincore",
  "fairycore",
  "dreamcore",
  "weirdcore",
  "kidcore",
  "kawaii",
  "gothic",
  "punk",
  "grunge",
  "bohemian",
  "artisan",
  "refined",
  "luxury",
  "elegant",
  "playful",
  "whimsical",
  "romantic",
  "nostalgic",
  "melancholy",
  "serene",
  "tranquil",
  "energetic",
  "dramatic",
  "mysterious",
  "ethereal",
  "dreamy",
  "moody",
  "cozy",
  "festive",
  "party",
  "carnival",
  "confetti",
  "candy",
  "sorbet",
  "gelato",
  "tea",
  "coffee",
  "matcha",
  "spices",
  "saffron",
  "apothecary",
  "alchemy",
] as const;

const EMOJI_QUERIES = [
  "🌅",
  "🌊",
  "🌲",
  "🌸",
  "🌈",
  "✨",
  "🌙",
  "☀️",
  "🌧️",
  "⛈️",
  "❄️",
  "🔥",
  "🍂",
  "🌿",
  "🍄",
  "🪻",
  "🌵",
  "🪸",
  "🦚",
  "🦋",
  "🍑",
  "🍋",
  "🍇",
  "🫐",
  "🍵",
  "🧁",
  "🎨",
  "🎞️",
  "💿",
  "🪩",
  "🕹️",
  "🧿",
  "💎",
  "🫧",
  "🪐",
  "🚀",
  "🏜️",
  "🏔️",
  "🏝️",
  "🌌",
] as const;

const COLORS = getColorsWithHex().filter(
  ({ name }) => name !== "black" && name !== "white",
);
const COLORS_BY_HUE = getColorsWithHue({
  excludeAchromatic: true,
  minSaturation: 0.15,
});

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}

function nearestHue(
  target: number,
  excluded: ReadonlySet<string>,
): ColorWithHue | null {
  let nearest: ColorWithHue | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const color of COLORS_BY_HUE) {
    if (excluded.has(color.name)) continue;
    const difference = Math.abs(color.hue - target);
    const circularDistance = Math.min(difference, 360 - difference);
    if (circularDistance < distance) {
      nearest = color;
      distance = circularDistance;
    }
  }
  return nearest;
}

function colorsSuggestion(
  colors: ReadonlyArray<{ name: string; hex: string }>,
): PopularSearchSuggestion {
  return {
    query: colors.map(({ name }) => name).join(", "),
    swatches: colors.map(({ hex }) => hex.toLowerCase()),
    source: "curated",
  };
}

function featuredSuggestion(query: string): PopularSearchSuggestion {
  const swatches = [...query.matchAll(/[a-z]+/gi)]
    .map(([word]) => colorNameToHex(word))
    .filter((hex): hex is string => Boolean(hex));
  return {
    query,
    ...(swatches.length ? { swatches } : {}),
    source: "curated",
  };
}

function curatedSuggestions(hour: number, count: number): PopularSearchSuggestion[] {
  const random = seededRandom(hour ^ 0x47524142);
  const featured = FEATURED_QUERIES.map(featuredSuggestion);
  const themes = shuffle(CURATED_THEMES, random)
    .slice(0, 13)
    .map((query) => ({ query, source: "curated" }));
  const emojis = shuffle(EMOJI_QUERIES, random)
    .slice(0, 2)
    .map((query) => ({ query, source: "curated" }));

  const single = shuffle(COLORS, random)[0];
  const baseColors = shuffle(COLORS_BY_HUE, random);
  const pairBase = baseColors[0];
  const pairMatch = pairBase
    ? nearestHue((pairBase.hue + 180) % 360, new Set([pairBase.name]))
    : null;
  const triadBase = baseColors.find(
    ({ name }) => name !== pairBase?.name && name !== pairMatch?.name,
  );
  const triadSecond = triadBase
    ? nearestHue((triadBase.hue + 120) % 360, new Set([triadBase.name]))
    : null;
  const triadThird =
    triadBase && triadSecond
      ? nearestHue(
          (triadBase.hue + 240) % 360,
          new Set([triadBase.name, triadSecond.name]),
        )
      : null;

  const rotating: PopularSearchSuggestion[] = [...themes, ...emojis];
  if (single) rotating.push(colorsSuggestion([single]));
  if (pairBase && pairMatch) rotating.push(colorsSuggestion([pairBase, pairMatch]));
  if (triadBase && triadSecond && triadThird)
    rotating.push(colorsSuggestion([triadBase, triadSecond, triadThird]));

  // Fill unusual requested counts from the larger theme pool before slicing.
  rotating.push(
    ...shuffle(CURATED_THEMES, random).map((query) => ({
      query,
      source: "curated",
    })),
  );
  const fixed = featured.slice(0, count);
  return shuffle(
    [...fixed, ...rotating.slice(0, Math.max(0, count - fixed.length))],
    random,
  );
}

export const curatedPopularSearchProvider: PopularSearchProvider = {
  id: "curated-v1",
  cacheable: false,
  generate: ({ hour, count }) => curatedSuggestions(hour, count),
};

function normalizeSuggestion(value: unknown): PopularSearchSuggestion | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.query !== "string") return null;
  const query = input.query.replace(/\s+/g, " ").trim();
  if (!query || query.length > 100) return null;

  const swatches = Array.isArray(input.swatches)
    ? input.swatches
        .filter(
          (swatch): swatch is string =>
            typeof swatch === "string" && /^#[0-9a-f]{6}$/i.test(swatch),
        )
        .slice(0, 4)
        .map((swatch) => swatch.toLowerCase())
    : [];
  const source =
    typeof input.source === "string" && input.source.trim()
      ? input.source.trim().slice(0, 32)
      : undefined;
  return {
    query,
    ...(swatches.length ? { swatches } : {}),
    ...(source ? { source } : {}),
  };
}

function normalizeSuggestions(
  values: unknown,
  fallback: PopularSearchSuggestion[],
  count: number,
): PopularSearchSuggestion[] {
  const result: PopularSearchSuggestion[] = [];
  const seen = new Set<string>();
  const candidates = [
    ...(Array.isArray(values) ? values : []),
    ...fallback,
  ];
  for (const value of candidates) {
    const suggestion = normalizeSuggestion(value);
    if (!suggestion) continue;
    const key = suggestion.query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(suggestion);
    if (result.length === count) break;
  }
  return result;
}

interface PopularSearchCacheRecord {
  version: number;
  hour: number;
  provider: string;
  suggestions: PopularSearchSuggestion[];
}

function providerCacheKey(provider: PopularSearchProvider, hour: number): string {
  const id = provider.id.replace(/[^a-z0-9._-]/gi, "_").slice(0, 64) || "anonymous";
  return `popular-searches:v${CACHE_VERSION}:${id}:${hour}`;
}

export async function getPopularSearchSuggestions(
  cache: Pick<KVNamespace, "get" | "put"> | undefined,
  nowMs = Date.now(),
  provider: PopularSearchProvider = curatedPopularSearchProvider,
  count = POPULAR_SEARCH_COUNT,
): Promise<PopularSearchSuggestion[]> {
  const safeCount = Math.max(1, Math.min(48, Math.trunc(count)));
  const hour = Math.floor(nowMs / HOUR_MS);
  const fallback = curatedSuggestions(hour, safeCount);
  const key = providerCacheKey(provider, hour);
  if (provider.cacheable === false) cache = undefined;

  if (cache) {
    try {
      const cached = await cache.get<unknown>(key, "json");
      if (
        cached &&
        typeof cached === "object" &&
        (cached as Partial<PopularSearchCacheRecord>).version === CACHE_VERSION &&
        (cached as Partial<PopularSearchCacheRecord>).hour === hour &&
        (cached as Partial<PopularSearchCacheRecord>).provider === provider.id
      ) {
        return normalizeSuggestions(
          (cached as Partial<PopularSearchCacheRecord>).suggestions,
          fallback,
          safeCount,
        );
      }
    } catch (error) {
      console.warn("Popular search cache read error:", error);
    }
  }

  let generated: unknown = [];
  try {
    generated = await provider.generate({ hour, count: safeCount });
  } catch (error) {
    console.warn(`Popular search provider "${provider.id}" failed:`, error);
  }
  const suggestions = normalizeSuggestions(generated, fallback, safeCount);

  if (cache) {
    const record: PopularSearchCacheRecord = {
      version: CACHE_VERSION,
      hour,
      provider: provider.id,
      suggestions,
    };
    try {
      await cache.put(key, JSON.stringify(record), {
        expirationTtl: CACHE_TTL_SECONDS,
      });
    } catch (error) {
      console.warn("Popular search cache write error:", error);
    }
  }

  return suggestions;
}
