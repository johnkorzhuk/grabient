import {
  colorNameToHex,
  hexToColorName,
  getUniqueColorNames,
  matchColorName,
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
export { POPULAR_SEARCHES } from "./popular-searches";

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 3;
const SEED_SEARCH_STEPS = 11;
export const SEMANTIC_SEARCH_LIMIT = 48;
export const SEARCH_QUERY_MAX_LENGTH = 100;

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
    // Wider than a heading: the embedding is not read by anyone, so a fifth
    // distinct region is signal rather than clutter. It still stops well short
    // of one name per stop, which used to hand the model a run of synonyms.
    //
    // REINDEX-GATED (D7): this branch must stay names-only until the Vectorize
    // index is rebuilt from paletteEmbedText (palette-prose.ts) — the live
    // index was embedded from palette-tags text and has never seen the prose
    // vocabulary, so enriching only the query side degrades matching
    // (index/query asymmetry). At the reindex cutover — the same one that
    // corrects the legacy texture:'monochrome' tag — change this to
    // names + spoken modifiers + structure word, mirroring the head of the
    // indexed text while staying terse.
    if (view) return getUniqueColorNames(view.hexColors, { max: 5 }).join(" ");
  }
  return replaceHexWithColorNames(query)
    .replace(/[\[\]"{}]/g, "")
    .replace(/,\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// "gradient palettes", not "palettes": every competitor ranking for {color}
// queries carries "gradient" in the title, and every term Search Console
// records demand for is gradient-worded ("gradient maker", "gradient
// generator"). Both nouns stay because both are the product — the swatch
// styles render a palette, the gradient styles render a gradient. The heading
// feeds h1, <title>, meta description and og:image alt at once.
export function queryHeading(query: string): string {
  const seed = canonicalSeed(query);
  if (seed) {
    const view = renderPalette(seed, DEFAULT_STYLE, SEED_SEARCH_STEPS, DEFAULT_ANGLE);
    // Three, not the default four: this one is the h1, the <title> and the
    // og:image alt, and " gradient palettes" already costs 18 characters.
    const names = view ? getUniqueColorNames(view.hexColors, { max: 3 }) : [];
    if (names.length) return `${names.join(", ")} gradient palettes`;
  }

  const colorNames = [
    ...new Set((query.match(HEX_CODE_REGEX) ?? []).map((hex) => hexToColorName(hex))),
  ];
  if (colorNames.length) return `${colorNames.join(", ")} gradient palettes`;
  return `${query.charAt(0).toUpperCase()}${query.slice(1)} gradient palettes`;
}

/**
 * Split text into plain text and recognized color names.
 *
 * `maxWords` is 1 by default and that default is load-bearing. Most corpus
 * names are several words, but so are most user queries, and the two want
 * opposite treatment: "deep sky blue" is one swatch, while someone who typed
 * "blue purple cyan" asked for three — and "blue purple" is itself a corpus
 * name, so a greedy match would silently merge two of them. Only a caller that
 * generated the text from the corpus itself knows the words belong together.
 */
export function colorTextParts(
  text: string,
  options?: { maxWords?: number },
): QueryHeadingPart[] {
  const maxWords = options?.maxWords ?? 1;
  const words = [...text.matchAll(/[a-z']+/gi)].map((m) => ({
    value: m[0],
    index: m.index ?? 0,
  }));
  const parts: QueryHeadingPart[] = [];
  let cursor = 0;

  for (let i = 0; i < words.length; i++) {
    const start = words[i]!;
    if (start.index < cursor) continue;

    // Only join words that are separated by exactly one space, so a comma or a
    // line break always ends a candidate name.
    let span = 1;
    while (span < maxWords && i + span < words.length) {
      const previous = words[i + span - 1]!;
      const next = words[i + span]!;
      if (next.index !== previous.index + previous.value.length + 1) break;
      if (text[previous.index + previous.value.length] !== " ") break;
      span++;
    }

    const match = matchColorName(
      words.slice(i, i + span).map((w) => w.value),
      0,
      span,
    );
    if (!match) continue;

    const consumed = words[i + match.length - 1]!;
    const end = consumed.index + consumed.value.length;
    const value = text.slice(start.index, end);
    const hex = colorNameToHex(match.name);
    if (!hex) continue;

    if (start.index > cursor)
      parts.push({ kind: "text", value: text.slice(cursor, start.index) });
    parts.push({ kind: "color", value, hex });
    cursor = end;
    i += match.length - 1;
  }

  if (cursor < text.length)
    parts.push({ kind: "text", value: text.slice(cursor) });
  return parts.length ? parts : [{ kind: "text", value: text }];
}

/**
 * Split the human heading into text and recognized color names. This is the
 * old PalettePageHeader behavior, backed by data-ops' shared color corpus so
 * search headings and semantic normalization use the same vocabulary.
 *
 * A seed heading is names we just generated, so multi-word names there are
 * matched whole; a text query is the user's words and stays word-by-word.
 */
export function queryHeadingParts(query: string): QueryHeadingPart[] {
  const isSeed = canonicalSeed(query) !== null;
  return colorTextParts(queryHeading(query), { maxWords: isSeed ? 3 : 1 });
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
