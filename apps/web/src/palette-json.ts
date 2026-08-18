// Machine-readable palettes, for agents.
//
// A palette page is ~117KB of HTML containing 27 hex codes, only eight of which
// are the palette — the rest is UI chrome. An agent asked to "use a Grabient
// palette" has to parse all of it and then guess which colors matter. The same
// data is ~300 bytes as JSON, unambiguous, and already computed on every render.
//
// Everything here is derived from the seed alone: no D1, no Vectorize, no KV.
// A seed IS the palette (see serialization.ts), so these routes work for any
// valid seed, stored or freshly constructed by the caller.

import {
  analyzeCoefficients,
  tagsToArray,
} from "@repo/data-ops/gradient-gen/palette-tags";
import {
  DESCRIPTORS,
  spokenWord,
} from "@repo/data-ops/gradient-gen/palette-modifiers";
import {
  describePaletteName,
  styleLabel,
  META_HEADLINE,
  TITLE_HEADLINE,
  type HeadlineOptions,
} from "./palette-name";
import {
  paletteProse,
  relatedSearches,
  type PaletteProse,
} from "./palette-prose";
import {
  DEFAULT_ANGLE,
  DEFAULT_STEPS,
  DEFAULT_STYLE,
  angleValidator,
  paletteStyleValidator,
  stepsValidator,
  type PaletteStyle,
} from "@repo/data-ops/valibot-schema/grabient";
import * as v from "valibot";
import { canonicalSeed, cssSnippet, renderPalette, type RenderedPalette } from "./palette";
import { normalizeEntityMangledParams } from "./seo";

/**
 * Deterministic per seed and view params, so it caches exactly like the PNGs.
 * `noindex` because this is API surface, not a search result: the HTML page at
 * the same seed is the indexable representation.
 */
export const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  // s-maxage omitted deliberately: CDN-Cache-Control already outranks it at the
  // edge, and including it disables stale-while-revalidate and stale-if-error.
  "Cache-Control": "public, max-age=86400",
  "CDN-Cache-Control": "max-age=604800",
  "X-Robots-Tag": "noindex",
};

/** Search depends on Vectorize and on the corpus, so it expires like list HTML. */
export const SEARCH_JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=60",
  "CDN-Cache-Control": "max-age=300, stale-while-revalidate=900",
  "X-Robots-Tag": "noindex",
};

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

/**
 * Every descriptor for a palette.
 *
 * Two sources, deliberately kept apart. `tagsToArray` is the original
 * coefficient analysis (colors, texture, warmth, journey, contrast) and its
 * values are mirrored into Vectorize metadata by an indexing pipeline outside
 * this repo, so they must not change. The modifier tags are the additive layer
 * — structure, tone, contrast, shape, trajectory — computed at serve time and
 * not yet part of any embedding. Wiring these into the indexed text is a
 * reindex, not a deploy; see seo-research/palette-modifiers.md.
 */
export function paletteTagList(view: RenderedPalette): string[] {
  return seedPaletteText(view).tags;
}

export interface SeedPaletteText {
  /** Full-budget name, for the h1 and the sr-only h2. */
  headline: string;
  /** Tightest budget: `<title>`, which Google truncates around 60 characters. */
  titleHeadline: string;
  /** Middle budget, for the meta description opener. */
  metaHeadline: string;
  tags: string[];
  /** The long-form description at every budget: page paragraph, meta, embed. */
  prose: PaletteProse;
  /** Curated related-search labels — the chip row under the description. */
  related: string[];
  /** JSON-LD keyword additions: fired spoken descriptor words + the structure word. */
  keywords: string[];
}

/**
 * Every piece of prose a palette page needs, from one analysis.
 *
 * A seed page wants the name at two budgets, the tag list, and the same name
 * again inside the description — six calls, each of which was re-rendering 48
 * dense samples and re-deriving every feature of a palette that had not changed
 * between them. The features are the expensive part and they are shared, so
 * they are computed once here and handed to both budgets.
 */
export function seedPaletteText(view: RenderedPalette): SeedPaletteText {
  const described = describePaletteName(view.appliedCoeffs, view.hexColors);
  const base = tagsToArray(analyzeCoefficients(view.appliedCoeffs));
  const at = (budget: typeof TITLE_HEADLINE) =>
    describePaletteName(view.appliedCoeffs, view.hexColors, {
      ...budget,
      features: described.features,
    }).name;
  // D15: the same ONE analysis feeds the prose and the related labels.
  // describePalette() is the public triple; the page needs the intermediate
  // budgets too (metaDescription, identity), so this composes the same shared
  // pieces with the same reuse. `base` rides in as baseTags because the
  // temperature-journey wording must come from the stored-vocabulary formula
  // the Vectorize index carries, never a serve-time recompute.
  const prose = paletteProse(view.appliedCoeffs, view.hexColors, view, {
    named: described,
    features: described.features,
    baseTags: base,
  });
  // D6: JSON-LD keywords gain the fired spoken words plus the structure word,
  // filtered against the registry's OWN tags rather than the merged list
  // below — base tags reuse words under different definitions (`texture:
  // 'monochrome'` is a saturation claim, the registry's is hue structure),
  // and a keyword has to mean what the registry measured.
  const fired = new Set(described.tags);
  const keywords = [
    ...new Set(
      DESCRIPTORS.filter(
        (d) => (d.spoken || d.axis === "structure") && fired.has(d.word),
      ).map(spokenWord),
    ),
  ];
  return {
    headline: described.name,
    titleHeadline: at(TITLE_HEADLINE),
    metaHeadline: at(META_HEADLINE),
    // `texture: 'monochrome'` (saturation) and the structural `monochrome`
    // (hue) can both be present and mean different things — dedupe so the
    // sentence does not say it twice.
    tags: [...new Set([...base, ...described.tags])],
    prose,
    related: relatedSearches(described.features, described, described.tags),
    keywords,
  };
}

/**
 * "Pastel duotone blush and sky blue" — the palette's own name, for headings,
 * titles and alt text. The naming rules live in palette-name.ts, which the
 * editor island shares so the client and the crawler cannot disagree.
 */
export function paletteHeadline(
  view: RenderedPalette,
  options: HeadlineOptions = {},
): string {
  return describePaletteName(view.appliedCoeffs, view.hexColors, options).name;
}

export { styleLabel, META_HEADLINE, TITLE_HEADLINE, type HeadlineOptions };

export interface PaletteJson {
  seed: string;
  /** "Baby blue to powder pink" — a human label for the palette. */
  name: string;
  /** The full description paragraph — the same text the palette page renders. */
  description: string;
  /** Self-referential: an agent that quotes these colors can cite where they came from. */
  url: string;
  png: string;
  hexColors: string[];
  /** Cosine coefficients as applied (globals folded in), Inigo Quilez convention. */
  coeffs: { a: number[]; b: number[]; c: number[]; d: number[] };
  globals: { exposure: number; contrast: number; frequency: number; phase: number };
  style: PaletteStyle;
  steps: number;
  angle: number;
  css: string;
  tags: string[];
}

export function paletteJson(
  seed: string,
  style: PaletteStyle,
  steps: number,
  angle: number,
  origin: string,
): PaletteJson | null {
  const canonical = canonicalSeed(seed);
  if (!canonical) return null;
  const view = renderPalette(canonical, style, steps, angle);
  if (!view) return null;

  const [a, b, c, d] = view.appliedCoeffs;
  const encoded = encodeURIComponent(canonical);
  // Tags are a pure function of the coefficients, so they are available here
  // without the Vectorize metadata the search path uses. Same list the page
  // renders, so an agent reading the JSON and a crawler reading the HTML get
  // the same description of the same palette.
  const text = seedPaletteText(view);

  return {
    seed: canonical,
    name: text.headline,
    // View-parameterized like the page (it ends on the R6 view sentence), so
    // an agent quoting the palette gets the same prose a crawler saw.
    description: text.prose.paragraph,
    url: `${origin}/${encoded}`,
    png: `${origin}/${encoded}.png`,
    hexColors: view.hexColors,
    coeffs: {
      a: [...(a ?? [])].slice(0, 3),
      b: [...(b ?? [])].slice(0, 3),
      c: [...(c ?? [])].slice(0, 3),
      d: [...(d ?? [])].slice(0, 3),
    },
    // Stored as a positional tuple (apply-globals.ts maps index → coefficient
    // row); named here so a caller never has to know the order.
    globals: {
      exposure: view.globals[0],
      contrast: view.globals[1],
      frequency: view.globals[2],
      phase: view.globals[3],
    },
    style: view.style,
    steps: view.steps,
    angle: view.angle,
    css: cssSnippet(view, ""),
    // Deliberately the EXHAUSTIVE true-fact list, not the curated related-
    // search labels the page's chip row shows (D15): this field predates the
    // curation and agents/the indexing pipeline read it, so its contract is
    // stability — the curated labels stay a page concern.
    tags: text.tags,
  };
}

/** Shared by /{seed}.json and /api/palette.json — same contract, two spellings. */
export function paletteJsonResponse(requestUrl: string, origin: string): Response {
  const params = normalizeEntityMangledParams(new URL(requestUrl));
  const styleResult = v.safeParse(paletteStyleValidator, params.get("style"));
  const style: PaletteStyle = styleResult.success ? styleResult.output : DEFAULT_STYLE;
  const steps = parsedInteger(params, "steps", stepsValidator, DEFAULT_STEPS);
  const angle = parsedInteger(params, "angle", angleValidator, DEFAULT_ANGLE);

  const payload = paletteJson(params.get("seed") ?? "", style, steps, angle, origin);
  if (!payload)
    return new Response(JSON.stringify({ error: "Invalid seed format" }), {
      status: 400,
      headers: { ...JSON_HEADERS, "Cache-Control": "no-store", "CDN-Cache-Control": "no-store" },
    });

  return new Response(JSON.stringify(payload), { headers: JSON_HEADERS });
}
