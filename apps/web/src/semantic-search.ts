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
import { viewNounPlural } from "./palette-name";
import {
  applyTagFilter,
  recognizeTagQuery,
  TAG_FILTER_VERSION,
  type TagQuery,
} from "./tag-search";
export { POPULAR_SEARCHES } from "./popular-searches";

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 3;
const SEED_SEARCH_STEPS = 11;
export const SEMANTIC_SEARCH_LIMIT = 48;
export const SEARCH_QUERY_MAX_LENGTH = 100;

/**
 * How wide the tag route over-fetches — and why it is only 50.
 *
 * D22.B5 asked for "topK well above the page size". Vectorize does not sell
 * that with the metadata attached: topK tops out at 100, and at 50 for any
 * query with `returnValues: true` or `returnMetadata: "all"`
 * (developers.cloudflare.com/vectorize/reference/client-api, raised from 20 in
 * the 2026-03-16 changelog). Every field the results grid renders — style,
 * steps, angle, createdAt — is un-indexed metadata, so this route is in the
 * 50 bucket and the existing 48 was already all but touching the ceiling.
 *
 * The pool therefore widens with more QUERY VECTORS rather than a bigger topK:
 * one Workers AI call embeds the whole batch (`text: [...]` returns one vector
 * per string), the Vectorize queries run in parallel, and a compound like
 * "muted duotone" searches its own text plus each part, for up to 150
 * candidates from one round trip. See TagQuery.expansions.
 */
export const TAG_OVERFETCH_TOPK = 50;

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
    // Names-only, at the corpus default budget (4): this string is embedded
    // against the LIVE index, so its shape stays exactly what that index has
    // been serving — a briefly-shipped fifth name was rolled back unmeasured.
    //
    // REINDEX-GATED (D7): this branch must stay names-only until the Vectorize
    // index is rebuilt from paletteEmbedText (palette-prose.ts) — the live
    // index was embedded from palette-tags text and has never seen the prose
    // vocabulary, so enriching only the query side degrades matching
    // (index/query asymmetry). At the reindex cutover — the same one that
    // corrects the legacy texture:'monochrome' tag — change this to
    // names + spoken modifiers + structure word, mirroring the head of the
    // indexed text while staying terse.
    if (view) return getUniqueColorNames(view.hexColors).join(" ");
  }
  return replaceHexWithColorNames(query)
    .replace(/[\[\]"{}]/g, "")
    .replace(/,\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface QueryHeadingView {
  style: PaletteStyle;
  /** Param PRESENCE, not value — the same rule the seed title uses. */
  styleInUrl: boolean;
  steps: number | "auto";
}

/**
 * The visible h1, and the string the `<title>` and og:image alt are built from.
 *
 * The noun follows what the URL actually pins (owner rule, 2026-08-18), through
 * the same `viewNounPlural` the seed page's title suffix uses, so a pinned
 * swatch list says "swatches" and a pinned gradient list says "gradients"
 * instead of both pages claiming the generic phrase.
 *
 * The unpinned case still says "gradient palettes", and deliberately: BOTH page
 * types canonicalise `style`/`steps` away (verified live 2026-08-18), so the
 * param-free variant is the only one Google indexes, and it is the one that has
 * to carry the "{color} gradient color palette" demand grammar. The pinned
 * wording is for the person reading the page and for anyone sharing that exact
 * URL.
 *
 * Why both nouns rather than "palettes" there: every competitor ranking for
 * {color} queries carries "gradient" in the title, and every term Search
 * Console records demand for is gradient-worded ("gradient maker", "gradient
 * generator"). Both nouns are also both products — the swatch styles render a
 * palette, the gradient styles render a gradient. This heading feeds h1,
 * <title>, meta description and og:image alt at once.
 */
export function queryHeading(query: string, view?: QueryHeadingView): string {
  const noun = view
    ? viewNounPlural(view.style, view.styleInUrl, view.steps)
    : "gradient palettes";
  const seed = canonicalSeed(query);
  if (seed) {
    const rendered = renderPalette(seed, DEFAULT_STYLE, SEED_SEARCH_STEPS, DEFAULT_ANGLE);
    // Three, not the default four: this one is the h1, the <title> and the
    // og:image alt, and the noun already costs up to 18 characters.
    const names = rendered ? getUniqueColorNames(rendered.hexColors, { max: 3 }) : [];
    if (names.length) return `${names.join(", ")} ${noun}`;
  }

  const colorNames = [
    ...new Set((query.match(HEX_CODE_REGEX) ?? []).map((hex) => hexToColorName(hex))),
  ];
  if (colorNames.length) return `${colorNames.join(", ")} ${noun}`;
  return `${query.charAt(0).toUpperCase()}${query.slice(1)} ${noun}`;
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
export function queryHeadingParts(
  query: string,
  view?: QueryHeadingView,
): QueryHeadingPart[] {
  const isSeed = canonicalSeed(query) !== null;
  return colorTextParts(queryHeading(query, view), { maxWords: isSeed ? 3 : 1 });
}

/** Context shown only when the submitted value was converted before search. */
/**
 * Words that join colour names in a query without naming a colour themselves.
 *
 * The chip row emits the palette's own journey ("cream to fire brick") and its
 * combination ("cream light salmon fire brick"), because the measured
 * autocomplete grammar contains that shape — "grey to white gradient" and
 * "white to green gradient" are real queries. Both forms have to survive
 * `namedColorContext` or the pages those chips point at fall through to the
 * score gate.
 */
const COLOR_QUERY_CONNECTORS = new Set(["to", "and"]);

/**
 * The query is nothing but colour names (and the words that join them).
 *
 * `indexableQuery` has always documented "a color name, hex or seed, where the
 * query IS the subject matter" as a way in, but the implementation only ever
 * matched hex codes, so which colour-name pages got indexed was decided by an
 * embedding score against an index that has never seen this vocabulary. Measured
 * on staging 2026-08-18: `/palettes/white`, `/palettes/blue` and
 * `/palettes/coral-pink` were indexable while `/palettes/fire-brick` — a CSS
 * keyword — was `noindex`, and the journey page `/palettes/cream-to-fire-brick`
 * was too while `/palettes/puce-to-dark-navy` was not. That is a coin flip, not
 * a policy.
 *
 * This closes it by rule rather than by score, and it cannot reopen the
 * keyword-injection hole the gate exists to plug: EVERY token must resolve
 * against the 920-name corpus, so the reachable set is bounded by the corpus
 * itself. `/palettes/buy-cheap-viagra` still fails on the first word.
 */
function namedColorContext(query: string): QueryResultContext | null {
  const words = [...query.matchAll(/[a-z']+/gi)].map((m) => m[0]!.toLowerCase());
  if (!words.length) return null;

  // Longest-match first: "fire brick" and "dark navy" are single corpus names,
  // and consuming them one word at a time would fail on "fire".
  const colors: Array<{ name: string; hex: string }> = [];
  const seen = new Set<string>();
  for (let i = 0; i < words.length; ) {
    if (COLOR_QUERY_CONNECTORS.has(words[i]!)) {
      i++;
      continue;
    }
    const match = matchColorName(words, i, Math.min(4, words.length - i));
    if (!match) return null;
    const hex = colorNameToHex(match.name);
    if (!hex) return null;
    if (!seen.has(match.name)) {
      seen.add(match.name);
      colors.push({ name: match.name, hex });
    }
    i += match.length;
  }
  return colors.length ? { kind: "colors", colors } : null;
}

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
  if (colors.length) return { kind: "colors", colors };
  return namedColorContext(query);
}

function cacheKey(query: string, limit: number): string {
  return `search:${query.toLowerCase().trim()}:${limit}`;
}

/**
 * The tag-filtered path caches its OWN answer, under its own key, because what
 * it returns is no longer "what Vectorize said": it is the filtered, reranked
 * page. The key carries the filter version so a threshold change cannot be
 * served out of a three-day-old entry, and the over-fetch width so a pool
 * change cannot either.
 */
function tagCacheKey(query: string, limit: number): string {
  return `tagsearch:v${TAG_FILTER_VERSION}:${TAG_OVERFETCH_TOPK}:${query.toLowerCase().trim()}:${limit}`;
}

async function readCache(
  env: Env,
  key: string,
): Promise<SemanticSearchResult[] | null> {
  if (!env.SEARCH_CACHE) return null;
  try {
    const cached = await env.SEARCH_CACHE.get<unknown>(key, "json");
    const parsed = v.safeParse(v.array(semanticSearchResultSchema), cached);
    if (parsed.success) return parsed.output;
  } catch (error) {
    console.warn("Search cache read error:", error);
  }
  return null;
}

async function writeCache(
  env: Env,
  key: string,
  results: SemanticSearchResult[],
): Promise<void> {
  if (!env.SEARCH_CACHE || !results.length) return;
  try {
    await env.SEARCH_CACHE.put(key, JSON.stringify(results), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
  } catch (error) {
    console.warn("Search cache write error:", error);
  }
}

const parseMatches = (matches: { matches: VectorizeMatch[] }): SemanticSearchResult[] =>
  matches.matches
    .map((match) =>
      v.safeParse(semanticSearchResultSchema, {
        ...(match.metadata ?? {}),
        score: match.score,
      }),
    )
    .filter((result) => result.success)
    .map((result) => result.output);

/**
 * Embed every text in ONE Workers AI call and run the Vectorize queries in
 * parallel, so N query vectors cost one embedding round trip and one search
 * round trip rather than N of each.
 */
async function queryVectors(
  env: Env,
  texts: string[],
  topK: number,
): Promise<SemanticSearchResult[][]> {
  const embedding = (await env.AI!.run("@cf/google/embeddinggemma-300m", {
    text: texts,
  })) as { data?: number[][] };
  const vectors = embedding.data ?? [];
  if (!vectors.length) return [];
  return Promise.all(
    vectors.map(async (vector) =>
      parseMatches(await env.VECTORIZE!.query(vector, { topK, returnMetadata: "all" })),
    ),
  );
}

/**
 * Merge the expansion lists into one candidate pool.
 *
 * The primary list stays intact at the head, in its own order, so the pool's
 * prefix is byte-identical to what this query returns today: the filter
 * reorders, but what it degrades BACK to is the page as it was. Expansion
 * results are appended round-robin by rank, which keeps each expansion's best
 * matches inside the classify budget instead of letting the first expansion
 * spend it.
 */
function fusePools(pools: SemanticSearchResult[][]): SemanticSearchResult[] {
  const merged: SemanticSearchResult[] = [];
  const seen = new Set<string>();
  const push = (result: SemanticSearchResult) => {
    if (seen.has(result.seed)) return;
    seen.add(result.seed);
    merged.push(result);
  };
  for (const result of pools[0] ?? []) push(result);
  const rest = pools.slice(1);
  const deepest = Math.max(0, ...rest.map((pool) => pool.length));
  for (let rank = 0; rank < deepest; rank++)
    for (const pool of rest) {
      const result = pool[rank];
      if (result) push(result);
    }
  return merged;
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

  const cached = await readCache(env, key);
  if (cached) return cached;

  const [results = []] = await queryVectors(env, [normalized], limit);
  await writeCache(env, key, results);
  return results;
}

/**
 * The route's entry point: semantic search, plus the tag filter when the query
 * IS one of our vocabulary tags (D22.B5).
 *
 * A chip is a promise about where it goes, and until now `/palettes/muted-duotone`
 * could only keep that promise by luck — the live index was embedded from the
 * old palette-tags vocabulary and has never seen either word. So for a
 * recognized tag we over-fetch, decode each result's seed, and rank the
 * palettes that genuinely satisfy the clicked dimension first. Everything else
 * — every free-text query, every hex, every seed — takes exactly the path it
 * took before, through `searchSemanticPalettes`, at the same cache key.
 *
 * The filter never shrinks the result set (see applyTagFilter), so totals,
 * page counts and the sort options behave as they did.
 */
export async function searchPalettesForQuery(
  env: Env,
  query: string,
  limit = SEMANTIC_SEARCH_LIMIT,
): Promise<SemanticSearchResult[]> {
  const tagQuery: TagQuery | null = recognizeTagQuery(query);
  if (!tagQuery) return searchSemanticPalettes(env, query, limit);

  if (!env.AI || !env.VECTORIZE) {
    console.warn("Search unavailable: AI/Vectorize bindings not available");
    return [];
  }
  const normalized = normalizeSemanticQuery(query);
  if (!normalized) return [];

  const key = tagCacheKey(normalized, limit);
  const cached = await readCache(env, key);
  if (cached) return cached;

  const pools = await queryVectors(
    env,
    [normalized, ...tagQuery.expansions.filter((text) => text !== normalized)],
    TAG_OVERFETCH_TOPK,
  );
  const pool = fusePools(pools);
  if (!pool.length) return [];

  const filtered = applyTagFilter(tagQuery, pool, limit);
  await writeCache(env, key, filtered);
  return filtered;
}
