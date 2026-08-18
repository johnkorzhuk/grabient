// The palette's long-form description, shared by the server render and the
// editor island — the same reason palette-name.ts lives here: pure function of
// (coeffs, hexColors, view), no fetch, no request context.
//
// THE PROBLEM THIS SOLVES. Two seed pages used to differ by ~45 tokens out of
// ~1,100 — the templated-page verdict — and the fix is not more words but more
// *distinct* words: measured numbers, per-structure sentence shapes, clauses
// that exist only when their predicate is true. Every claim below is backed by
// a computable test on PaletteFeatures; there is no free-text path. A clause
// exists only as a (predicate, template) pair in one table, because this text
// becomes embedding text and a false clause corrupts retrieval.
//
// DETERMINISM. Banned in this module: Math.random, Date, seed hashing, locale
// formatting. Variety derives only from feature values. Fixed formatting:
// lightness/chroma 2 dp, WCAG ratio 1 dp, cycles 1 dp, degrees and
// percentages nearest integer — the test harness regexes every printed number
// back out and recomputes it.
//
// STEP BEHAVIOR. R2 and the structure word are dense-sample facts and must be
// byte-identical at every step count; tone sentences (R3–R5) may use rendered
// stops (98.6%+ step-stable, measured); color names legitimately track steps
// (documented behavior of the name system); R6 is the only sentence allowed to
// mention steps/style/angle, and R6 never enters embedText.

import { getUniqueColorNames, hexToOkLch } from "@repo/data-ops/color-utils";
import {
  classifyStructure,
  DESCRIPTORS,
  descriptorScore,
  hueBandShare,
  modifierTags,
  spokenWord,
  THRESHOLDS,
  type PaletteFeatures,
} from "@repo/data-ops/gradient-gen/palette-modifiers";
import {
  analyzeCoefficients,
  tagsToArray,
} from "@repo/data-ops/gradient-gen/palette-tags";
import {
  cosineGradient,
  rgbToHex,
  type CosineCoeffs,
} from "@repo/data-ops/gradient-gen/cosine";
import type { PaletteStyle } from "@repo/data-ops/valibot-schema/grabient";
import {
  describePaletteName,
  styleLabel,
  type NamedPalette,
} from "./palette-name";

const T = THRESHOLDS;

/** WCAG 2.1 AA contrast for normal text — a standard, not a measured band. */
const WCAG_AA = 4.5;

/**
 * The ombré gate's lightness distance: corpus lightnessRange p50. An ombré is
 * a one-hue *value journey*, so it has to travel at least a median palette's
 * worth of lightness to earn the word (research-colorTheory §7).
 */
const OMBRE_RANGE = 0.34;

/**
 * Tint/shade series tolerances, calibrated against the repo's own color space:
 * sRGB white-mixes drift OkLCh hue by up to ~22° (navy → periwinkle — the
 * Abney drift), black-mixes hold hue to <0.1° and C/L constant. So a tint
 * series tolerates 25° of drift and a shade series only 5°, and the shade
 * test may demand a near-constant C/L ratio (±20%).
 */
const TINT_DRIFT = 25;
const SHADE_DRIFT = 5;
const SERIES_POLE_CHROMA = 0.5; // pole stop must have lost half the palette's max chroma
const TINT_POLE_L = 0.85;
const SHADE_POLE_L = 0.3;
const SHADE_RATIO_TOLERANCE = 0.2;
/** Value-band edges from research-colorTheory §2: near-black / near-white. */
const NEAR_BLACK_L = 0.18;
const NEAR_WHITE_L = 0.87;

/**
 * Family words for prose: deterministic nearest-anchor lookup on OkLCh hue
 * over the registry's measured eight anchors — the sRGB primaries/secondaries
 * plus #ff8000/#8000ff, verified with this repo's own hexToOkLch (the family
 * comment in palette-modifiers.ts records the same values). Nearest-anchor
 * over the eight IS the eight-family band partition (band edges fall at
 * anchor midpoints).
 *
 * Deliberately NOT the wider name list (gold, teal, sky, pink, purple…):
 * those are anchor + TONE-gate names — pink and sky are tint regions
 * (L > 0.75), gold needs L 0.8–0.92, teal L < 0.60 — and a family word is
 * chosen by hue alone, so using them here named dark palettes after tints
 * (measured on the live fixture: wine-dark ramps read "around pink" at
 * region L 0.45, navy ramps "into sky" at L 0.50, a near-black olive ramp
 * "into gold" at L 0.29). The conflation rule is "name by gate, never by hue
 * alone"; the eight family-band words are the gate-free vocabulary — a
 * family names WHERE on the wheel, never how light — and the gated names
 * stay the color-name corpus's job. These double as relatedSearches backfill
 * labels, so the list is part of the bounded link vocabulary.
 */
const FAMILY_ANCHORS: readonly (readonly [string, number])[] = [
  ["red", 29],
  ["orange", 53],
  ["yellow", 110],
  ["green", 142],
  ["cyan", 195],
  ["blue", 264],
  ["violet", 294],
  ["magenta", 328],
];

export function familyWord(hue: number): string {
  const h = ((hue % 360) + 360) % 360;
  let best = FAMILY_ANCHORS[0]![0];
  let bestDist = Infinity;
  for (const [word, anchor] of FAMILY_ANCHORS) {
    const d = Math.abs(h - anchor) % 360;
    const dist = d > 180 ? 360 - d : d;
    if (dist < bestDist) {
      bestDist = dist;
      best = word;
    }
  }
  return best;
}

// =============================================================================
// Measure-first detectors
// =============================================================================
//
// Each detector below implements the exact computable gate from
// research-colorTheory.md, then had its firing rate measured over the 867
// fixture seeds at the default view (linearGradient, 7 steps, 90°) — the view
// an uncustomized seed page renders. The house prevalence band decides where
// the word may appear: 2%–60% earns a place in the prose tables, under 2% is
// embedding-tail vocabulary only, over 60% stays silent. The verdicts are
// pinned by palette-prose.test.js the same way palette-name.test.js pins the
// registry, so a drift here fails the build rather than shipping unnoticed.

type MeasureFirstUse = "prose" | "embed" | "silent";

/**
 * Measured rates (867 fixture seeds at the default view, 2026-08-17). The
 * research predicted ombre, sepia, jewel and deep as survivors; the fixture
 * kept eight of nine in the 2%–60% prose band and overturned two predictions:
 * BRILLIANT survived at 8.3% (the corpus has more light-and-vivid palettes
 * than the low-chroma p50 suggested) and SEPIA died at 1.0% — brown
 * monochromes narrow enough for the gate are rarer live than on paper — so
 * sepia is embedding-tail vocabulary only. opponent-axis fires on 42.7%
 * overall, but its prose realization is further gated to duotone/
 * complementary structures (where "sits on the blue–yellow axis" names the
 * pair's geometry rather than restating a mono palette's only hue).
 */
const MEASURE_FIRST: Record<string, { use: MeasureFirstUse; rate: number }> = {
  deep: { use: "prose", rate: 0.0542 },
  jewel: { use: "prose", rate: 0.1223 },
  sepia: { use: "embed", rate: 0.0104 },
  ombre: { use: "prose", rate: 0.1926 },
  "warm-gray": { use: "prose", rate: 0.0323 },
  "opponent-axis": { use: "prose", rate: 0.4268 },
  "warm-cool-contrast": { use: "prose", rate: 0.2307 },
  "saturation-contrast": { use: "prose", rate: 0.1061 },
  brilliant: { use: "prose", rate: 0.083 },
};

const useOf = (word: string): MeasureFirstUse => MEASURE_FIRST[word]?.use ?? "silent";

/**
 * Raw detector readings, one boolean per measure-first word — the harness
 * surface. palette-prose.test.js re-measures every rate over the fixture
 * corpus and fails the build when one leaves its recorded band, exactly the
 * drift contract palette-name.test.js holds the registry to.
 */
export function measureFirstFires(
  f: PaletteFeatures,
  hexColors: readonly string[],
): Record<keyof typeof MEASURE_FIRST, boolean> {
  const structure = classifyStructure(f);
  void hexColors; // series language is an enrichment, not a banded word
  return {
    deep: isDeep(f),
    jewel: isJewel(f),
    sepia: isSepia(f, structure),
    ombre: isOmbre(f, structure),
    "warm-gray": grayLean(f) !== null,
    "opponent-axis": opponentAxis(f) !== null,
    "warm-cool-contrast": warmCoolContrast(f),
    "saturation-contrast": saturationContrast(f),
    brilliant: isBrilliant(f),
  };
}

export { MEASURE_FIRST };

/** Dark AND chromatic — `dark` allows gray, deep must not fire on charcoal. */
const isDeep = (f: PaletteFeatures) => f.meanLightness < 0.45 && f.meanChroma >= 0.08;

/** The emerald/sapphire/ruby window: the L band matters, a neon isn't jewel. */
const isJewel = (f: PaletteFeatures) =>
  f.meanLightness >= 0.3 &&
  f.meanLightness <= 0.6 &&
  f.meanChroma >= 0.12 &&
  f.maxChroma >= 0.15;

/** Brown monochrome, the aged-photo look — must not fire on vivid oranges. */
const isSepia = (f: PaletteFeatures, structure: string) =>
  structure === "monochrome" &&
  f.meanHue >= 50 &&
  f.meanHue < 90 &&
  f.meanChroma >= T.CHROMA_FLOOR &&
  f.meanChroma <= 0.1 &&
  f.meanLightness < 0.8;

/** One hue (or near), one direction, real lightness travel. */
const isOmbre = (f: PaletteFeatures, structure: string) =>
  (structure === "monochrome" || structure === "analogous") &&
  f.turns === 0 &&
  f.lightnessRange >= OMBRE_RANGE;

/** Vivid AND light — not a synonym of vivid; the light half is definitional. */
const isBrilliant = (f: PaletteFeatures) =>
  f.meanChroma >= T.VIVID_CHROMA && f.meanLightness >= 0.7;

/**
 * Near-neutral with a consistent lean. Below the per-stop hue floor only the
 * aggregate is stable, and meanHue IS that aggregate: OkLab a = C·cos(h),
 * b = C·sin(h), so the chroma-weighted circular mean over the dense sample is
 * exactly atan2(b̄, ā) — the mean-vector test research-colorTheory §1.3 asks
 * for, already computed.
 */
function grayLean(f: PaletteFeatures): "warm" | "cool" | null {
  if (f.denseMeanChroma < 0.008 || f.denseMeanChroma >= T.CHROMA_FLOOR) return null;
  if (f.meanHue >= 330 || f.meanHue < 120) return "warm";
  if (f.meanHue >= 150 && f.meanHue < 300) return "cool";
  return null;
}

/** ≥85% of chromatic mass on one OkLab opponent axis (±45° around its poles). */
function opponentAxis(f: PaletteFeatures): "blue–yellow" | "green–red" | null {
  if (hueBandShare(f, 45, 135) + hueBandShare(f, 225, 315) >= 0.85) return "blue–yellow";
  if (hueBandShare(f, 315, 45) + hueBandShare(f, 135, 225) >= 0.85) return "green–red";
  return null;
}

/** Itten's cold–warm contrast: both poles PRESENT at once — not a drift. */
const warmCoolContrast = (f: PaletteFeatures) =>
  hueBandShare(f, 330, 120) >= 0.25 && hueBandShare(f, 150, 300) >= 0.25;

/**
 * Itten's contrast of saturation: pure color beside near-gray. The exact test
 * wants dense min chroma < 0.04; features carry the dense range but not the
 * dense max, so the rendered maxChroma stands in for it (98.6%+ step-stable,
 * and dense max ≥ rendered max, so this over-fires slightly rather than
 * missing). The firing rate above was measured with this exact proxy.
 */
const saturationContrast = (f: PaletteFeatures) =>
  f.denseChromaRange >= 0.15 && f.maxChroma - f.denseChromaRange < 0.04;

interface SeriesReading {
  kind: "tints and shades" | "tints" | "shades" | "tones";
  base: string;
}

/**
 * The tint/shade/tone series detector (research-colorTheory §2), meaningful
 * only for monochrome structure: which transformation relates the stops. Runs
 * on the rendered stops sorted by lightness; the base is the most chromatic
 * stop's family word — a transformation noun always takes "of + base", and
 * the base must have usable chroma to be named at all.
 */
function seriesReading(f: PaletteFeatures, hexColors: readonly string[]): SeriesReading | null {
  const stops = hexColors.map(hexToOkLch);
  if (stops.length < 3) return null;
  const byL = [...stops].sort((a, b) => a.L - b.L);
  const maxC = Math.max(...stops.map((s) => s.C));
  const chromatic = stops.filter((s) => s.C >= T.CHROMA_FLOOR);
  if (!chromatic.length || maxC < T.CHROMA_FLOOR) return null;

  // Hue drift among chromatic stops, as max circular distance from the most
  // chromatic stop — monochrome already bounds the span, this bounds the walk.
  const baseStop = chromatic.reduce((a, b) => (b.C > a.C ? b : a));
  let drift = 0;
  for (const s of chromatic) {
    const d = Math.abs(s.h - baseStop.h) % 360;
    drift = Math.max(drift, d > 180 ? 360 - d : d);
  }

  const top = byL[byL.length - 1]!;
  const bottom = byL[0]!;

  // Tint: +white — L rises while C falls toward 0 (monotone within a small
  // tolerance; measured white-mixes are strictly decreasing, rendered stops
  // can wobble a JND).
  let cFalls = true;
  for (let i = 1; i < byL.length; i++)
    if (byL[i]!.C > byL[i - 1]!.C + 0.005) cFalls = false;
  const tint =
    top.L > TINT_POLE_L && top.C < SERIES_POLE_CHROMA * maxC && cFalls && drift <= TINT_DRIFT;

  // Shade: +black — hue exact, C/L ratio near-constant on the chromatic stops.
  let shade =
    bottom.L < SHADE_POLE_L && bottom.C < SERIES_POLE_CHROMA * maxC && drift <= SHADE_DRIFT;
  if (shade) {
    const ratios = chromatic.filter((s) => s.L > 0.05).map((s) => s.C / s.L);
    if (ratios.length >= 2) {
      const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      shade = ratios.every((r) => Math.abs(r - mean) <= SHADE_RATIO_TOLERANCE * mean);
    }
  }

  // Tone: +gray — C falls while L stays put and neither end approaches 0/1.
  const cRange = maxC - Math.min(...stops.map((s) => s.C));
  const tone =
    cRange >= 0.06 &&
    top.L - bottom.L < 0.25 &&
    bottom.L > NEAR_BLACK_L &&
    top.L < NEAR_WHITE_L;

  // The base WORD is the family of the mean hue — the same quantity R2's
  // "arc of {family}" reads — not the most chromatic stop's own hue. A
  // monochrome palette has one hue, so the paragraph must use one word for
  // it, and the two readings can disagree across an anchor boundary
  // (measured: a 21° red-orange mono read "arc of orange" in R2 and "tints
  // of red" here before this pinned them together). familyWord returns only
  // the eight gate-free band words, so the series base always passes its
  // family gate — the transformation-noun rule ("tints OF a base that earns
  // its name") holds by construction.
  const base = familyWord(f.meanHue);
  if (tint && shade) return { kind: "tints and shades", base };
  if (tint) return { kind: "tints", base };
  if (shade) return { kind: "shades", base };
  if (tone) return { kind: "tones", base };
  return null;
}

// =============================================================================
// Number formatting — fixed, locale-free, round-trippable
// =============================================================================

const f2 = (x: number) => x.toFixed(2);
const f1 = (x: number) => x.toFixed(1);
const deg = (x: number) => String(Math.round(x));
const pct = (x: number) => String(Math.round(x * 100));

/**
 * A printed upper bound has to round UP or the sentence lies at the edge:
 * MUTED_CHROMA is 0.055, and "chroma under 0.05" would be false for a palette
 * measuring 0.052. (toFixed alone is a trap here — (0.055).toFixed(2) is
 * "0.05" because the float sits just below the decimal midpoint.)
 */
const ceil2 = (x: number) => (Math.ceil(x * 100 - 1e-9) / 100).toFixed(2);

/**
 * The WCAG ratio prints as a FLOOR for the mirrored reason: round-half-up
 * printed a true 4.4668 as "4.5:1 — clears", a false AA-conformance claim
 * (WCAG 2.1 defines conformance on the actual ratio, and the wcag-aa tag in
 * the same embedText tests the raw value). floor(x·10)/10 ≥ 4.5 exactly when
 * x ≥ 4.5, so the printed figure and the clears/short verdict can never
 * disagree with each other or with the standard. The 1e-6 nudge only absorbs
 * float representation dust (7.3·10 = 72.999…), far below the ratio
 * granularity 8-bit luminances can produce.
 */
const floor1 = (x: number) => (Math.floor(x * 10 + 1e-6) / 10).toFixed(1);

// =============================================================================
// The sentence tables
// =============================================================================

export interface ProseView {
  style: PaletteStyle;
  steps: number;
  angle: number;
}

export interface ProseOptions {
  /** Reuse an analysis instead of redoing it — same contract as HeadlineOptions. */
  features?: PaletteFeatures;
  /** Reuse the name (and its features) the caller already computed. */
  named?: NamedPalette;
  /**
   * tagsToArray(analyzeCoefficients(coeffs)) from palette-tags — the STORED
   * vocabulary. Only the journey value (warming/cooling) is read, and only
   * from here: the stored Vectorize `journey` tag uses that formula, and a
   * serve-time recompute with a DIFFERENT formula could disagree with the
   * index. When absent it is computed here with the same palette-tags import
   * (never a reimplementation), so every entry point — describePalette
   * included — yields the paragraph the page renders; passing it is purely a
   * reuse optimization, exactly like `features`/`named`.
   */
  baseTags?: readonly string[];
}

/**
 * Default the stored-vocabulary tags when the caller brought none — the same
 * import seedPaletteText and the edit island use, so the journey wording can
 * never diverge from the stored index. Before this default, describePalette
 * (the canonical API) silently produced a different paragraph from the live
 * page on every warming/cooling palette — 71.2% of the fixture.
 */
const withBaseTags = (coeffs: CosineCoeffs, options: ProseOptions): ProseOptions =>
  options.baseTags
    ? options
    : { ...options, baseTags: tagsToArray(analyzeCoefficients(coeffs)) };

/**
 * Public-API guard: app surfaces always pass ≥2 rendered stops, but the
 * exported functions may be handed none. Render the two end stops from the
 * coefficients (ends are step-invariant) instead of fabricating a #000000
 * stop — the fabricated stop mixed made-up rendered-stop claims ("held
 * within black", "mean chroma 0.00") into real dense-sample claims in one
 * paragraph.
 */
const fallbackStops = (coeffs: CosineCoeffs): string[] =>
  cosineGradient(2, coeffs).map(([r, g, b]) => rgbToHex(r, g, b));

export interface PaletteProse {
  /** R1 alone, no parenthetical hexes — the meta-description opener. */
  identity: string;
  /** Full on-page paragraph: R1(with hexes) + R2..R5 + [R7] + R6. */
  paragraph: string;
  /** ≤160 chars: identity + action clause, ladder-trimmed. */
  metaDescription: string;
  /** R1(no hex) + R2..R5 + [R7] + "Tags: …" + "Colors: …". No R6, no hex. */
  embedText: string;
}

/** Meta-description action clause; dropped first when the ladder has to trim. */
const META_ACTION = "Copy the CSS, or export SVG and PNG.";
const META_MAX = 160;

interface Clause {
  text: string;
  /** 'hue' clauses ride R2, 'tone' clauses ride R3. */
  host: "hue" | "tone";
  /** Chroma direction for the even-as/while connective; 0 = none. */
  dir: -1 | 0 | 1;
}

/** All the strings, before assembly — exported for the step-invariance harness. */
export interface ProseParts {
  structure: string;
  r1: string;
  r1Identity: string;
  /** Dense/coefficient facts only — byte-identical at every step count. */
  r2: string;
  /** Rendered-stop extras that follow R2 (series/ombré), step-tracking. */
  r2Extras: string[];
  r3: string;
  /** R4, rarity-first — the page ladder trims from the end of this list. */
  clauses: Clause[];
  r5: string;
  r7: string | null;
  r6: string | null;
  /** True when the best tone fact outranks the structure fact (R3 before R2). */
  toneLeads: boolean;
  solid: boolean;
  /** Sub-band facts that may only ride the embedding tail, as tag words. */
  embedTailTags: string[];
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "A pastel…" / "An earthy…" — keyed to the finished phrase, not the palette. */
const article = (phrase: string) => (/^[aeiou]/i.test(phrase) ? "An" : "A");

function buildParts(
  coeffs: CosineCoeffs,
  hexColors: readonly string[],
  view: ProseView | null,
  rawOptions: ProseOptions = {},
): ProseParts {
  const options = withBaseTags(coeffs, rawOptions);
  const colors = hexColors.length >= 2 ? [...hexColors] : fallbackStops(coeffs);
  const named =
    options.named ?? describePaletteName(coeffs, colors, { features: options.features });
  const f = options.features ?? named.features;
  const structure = classifyStructure(f);
  const tags = modifierTags(f);
  const has = (w: string) => tags.includes(w);
  const solid = has("solid");
  // "soft" is a chroma claim (a wash is a pale LOW-chroma passage) that the
  // high-key test never makes — it measures value level and spread only — so
  // soft language carries its own gate: under the pastel bound with no neon
  // peak. Without it, 38 fixture palettes read "soft" and "vividly saturated"
  // in the same sentence.
  const softChroma = f.meanChroma < T.PASTEL_CHROMA && f.maxChroma < T.NEON_CHROMA;

  const names = named.colorNames;
  const endLch = { first: hexToOkLch(colors[0]!), last: hexToOkLch(colors[colors.length - 1]!) };
  const meanCycles =
    (f.channelCycles[0] + f.channelCycles[1] + f.channelCycles[2]) / 3;

  // ---------------------------------------------------------------------------
  // R1 — identity. The demand-bearing sentence: modifier phrase, the fixed
  // noun phrase "gradient color palette", the color names in ramp order, and
  // (paragraph variant only) the two end hexes. The end stops render
  // identically at every step count, so the hexes are step-invariant; interior
  // names legitimately track steps.
  // ---------------------------------------------------------------------------
  const phrase = named.modifierPhrase;
  const opener = `${article(phrase || "gradient")} ${phrase ? `${phrase} ` : ""}gradient color palette`;
  const hexOf = (hex: string, withHex: boolean) => (withHex ? ` (${hex})` : "");
  // The last listed name is not always the last stop: getUniqueColorNames
  // keeps ramp order but dedupes, so an A→B→A ramp lists [A, B] while the
  // ramp ends back on A. The end hex may only be pinned to a name that
  // actually names the end stop.
  const endName = getUniqueColorNames([colors[colors.length - 1]!], { max: 1 })[0] ?? "";

  const r1For = (withHex: boolean): string => {
    const first = `${names[0] ?? "black"}${hexOf(colors[0]!, withHex)}`;
    const lastIdx = names.length - 1;
    const endHex = endName === names[lastIdx] ? hexOf(colors[colors.length - 1]!, withHex) : "";
    if (solid)
      return `${opener} that renders as one solid color — ${first} at every stop.`;
    if (names.length <= 1) {
      const span =
        colors[0] === colors[colors.length - 1] || !withHex
          ? first
          : `${names[0]}${withHex ? ` (${colors[0]} to ${colors[colors.length - 1]})` : ""}`;
      return `${opener} held within ${span}.`;
    }
    if (names.length >= 2 && endName === names[0]) {
      // The ramp leaves its opening color and returns to it.
      const out = names.slice(1).join(" and ");
      return `${opener} circling from ${first} through ${out} and back.`;
    }
    if (names.length === 2 && (structure === "complementary" || structure === "duotone")) {
      const second = `${names[1]}${endHex}`;
      return structure === "complementary"
        ? `${opener} built on two near-opposite hues: ${first} against ${second}.`
        : `${opener} pairing ${first} with ${second}.`;
    }
    if (names.length === 2) {
      // Verb keyed to the ramp's own shape — no synonym rotation.
      const verb =
        f.turns >= 2
          ? "weaving"
          : f.turns === 1
            ? "arcing"
            : f.lightnessRange >= OMBRE_RANGE
              ? "sweeping"
              : "easing";
      return `${opener} ${verb} from ${first} to ${names[1]}${endHex}.`;
    }
    const verb = f.turns >= 2 ? "winding" : "running";
    const middles = names.slice(1, -1).join(" and ");
    return `${opener} ${verb} from ${first} through ${middles} to ${names[lastIdx]}${endHex}.`;
  };

  // ---------------------------------------------------------------------------
  // R2 — geometry, one sentence shape per structure class (the main
  // anti-template lever). Every quantity here is dense- or coefficient-
  // derived, so the sentence is byte-identical at 3 and 24 steps.
  // ---------------------------------------------------------------------------
  const fam = (h: number | null) => familyWord(h ?? f.meanHue);
  const axis = opponentAxis(f);
  const axisClause =
    useOf("opponent-axis") === "prose" &&
    axis &&
    (structure === "duotone" || structure === "complementary")
      ? ` The pair sits on the ${axis} axis of opponent color.`
      : "";
  let cyclesClauseFired = false;

  const r2For = (): string => {
    switch (structure) {
      case "monochrome":
        return `Every stop shares one hue — the whole ramp fits inside a ${deg(f.hueSpan)}° arc of ${fam(f.meanHue)} — so the movement is in lightness and saturation, not color.`;
      case "grayscale": {
        // The research template read "chroma never rises above {maxChroma}",
        // but maxChroma tracks the rendered steps; the step-invariance
        // contract moves that figure to R3 and keeps R2 on dense facts.
        const lean = useOf("warm-gray") === "prose" ? grayLean(f) : null;
        const leanTail = lean ? `, leaning faintly ${lean}` : "";
        // The classification's chromaticFraction < 0.15 disjunct admits a few
        // visibly chromatic samples (dense C up to 0.098 on live seeds whose
        // own names said brown), so the per-stop "below the threshold where
        // hue registers" wording is reserved for palettes where it is true of
        // EVERY dense sample; the rest state the measured fraction rather
        // than calling their chromatic stops gray.
        return f.chromaticFraction === 0
          ? `Chroma stays below the threshold where hue registers, so it reads as pure value — ${f2(f.denseLightnessRange)} of lightness between its darkest and lightest gray${leanTail}.`
          : `Color registers on only ${pct(f.chromaticFraction)}% of the run — the rest sits below the threshold where hue reads — so it comes across as value more than color, ${f2(f.denseLightnessRange)} of lightness between its darkest and lightest stop${leanTail}.`;
      }
      case "duotone":
        return `The two families sit ${deg(f.clusterSeparation)}° apart on the color wheel, each held inside a narrow band, with the hues between them left out entirely.${axisClause}`;
      case "complementary":
        return `The two hues sit ${deg(f.clusterSeparation)}° apart — nearly opposite sides of the color wheel — each held in a narrow band with nothing in between.${axisClause}`;
      case "analogous": {
        const a = fam(f.firstHue);
        const b = fam(f.lastHue);
        return a === b
          ? `Hue drifts ${deg(f.hueSpan)}° within one neighborhood of ${a}, never splitting into separate groups.`
          : `Hue drifts ${deg(f.hueSpan)}° through neighboring families, ${a} into ${b}, without ever splitting into separate groups.`;
      }
      case "multicolor": {
        // The fallthrough class is NOT always one connected cluster: wide
        // two-cluster palettes and 3+-cluster palettes land here too (17 live
        // seeds), so the connected wording is reserved for the single-cluster
        // case it is true of. "spans", not "travels": the number is the SPAN,
        // and actual travel exceeds it whenever the hue doubles back —
        // f.hueTravel carries that fact and the wander clause states it, so a
        // travel verb on the span read as the wrong measurement.
        if (f.hueClusters >= 2)
          return `Hue falls into ${f.hueClusters} separate clusters spread across ${deg(f.hueSpan)}°, with stretches of skipped hue between them.`;
        const a = fam(f.firstHue);
        const b = fam(f.lastHue);
        return a === b
          ? `Hue spans ${deg(f.hueSpan)}° in one connected arc around ${a}.`
          : `Hue spans ${deg(f.hueSpan)}° in one connected arc, wide enough to cross from ${a} to ${b}.`;
      }
      default: {
        // rainbow — |net| ≥ FULL_WHEEL_NET upgrades the opener. The cycles
        // clause needs the SAME license as R4's exact-repeat line: equal
        // frequencies. Without equalC the RGB path is a non-repeating
        // Lissajous — no channel completes the mean count and nothing
        // repeats (a live seed with cycles [1.96, 0.66, 5.80] printed
        // "completes 2.8 full cycles" before this gate).
        const cyc =
          f.equalC && meanCycles >= 1.5
            ? `, and the underlying color wave completes ${f1(meanCycles)} full cycles, so hues return in repeating bands`
            : "";
        cyclesClauseFired = cyc !== "";
        return Math.abs(f.hueNet) >= T.FULL_WHEEL_NET
          ? `It sweeps the entire color wheel — ${deg(f.hueSpan)}° of hue in one pass${cyc}.`
          : `It covers ${deg(f.hueSpan)}° of the hue circle${cyc}.`;
      }
    }
  };
  const r2 = r2For();

  // R2 extras — series/ombré/sepia language reads the rendered stops, so it
  // follows R2 rather than living inside it. At most two, rarity first.
  const r2Extras: string[] = [];
  if (!solid) {
    const series = structure === "monochrome" ? seriesReading(f, colors) : null;
    if (series) {
      const line =
        series.kind === "tints and shades"
          ? `Read as a series, it spans the tints and shades of ${series.base} — the hue held while white and black do the work.`
          : series.kind === "tints"
            ? `Read as a series, it runs the tints of ${series.base}, lightening and desaturating toward white.`
            : series.kind === "shades"
              ? `Read as a series, it runs the shades of ${series.base}, darkening with the hue held constant.`
              : `Read as a series, it tones ${series.base} down toward gray at a near-constant lightness.`;
      r2Extras.push(line);
    }
    if (useOf("sepia") === "prose" && isSepia(f, structure))
      r2Extras.push(`The range it holds is sepia — the browned monochrome of an aged photograph.`);
    if (useOf("ombre") === "prose" && isOmbre(f, structure) && r2Extras.length < 2)
      r2Extras.push(
        // The gate admits analogous structures (hue span up to 95°), where
        // "held steady" contradicted the R2 drift measurement one sentence
        // earlier on 80 live seeds — the steady wording belongs to the
        // monochrome branch alone.
        `The effect is ombré: ${
          structure === "monochrome"
            ? "the hue held steady"
            : "the hue confined to its own neighborhood"
        } while lightness travels ${f2(f.lightnessRange)} of its scale.`,
      );
  }

  // ---------------------------------------------------------------------------
  // R3 — tone: banded adjectives plus measured numbers, direction verbs keyed
  // to the value, temperature only through the registry tests (static) or the
  // caller's stored journey tag.
  // ---------------------------------------------------------------------------
  const journey = options.baseTags?.includes("warming")
    ? "warming"
    : options.baseTags?.includes("cooling")
      ? "cooling"
      : null;

  const r3For = (): string => {
    if (solid) {
      // No journey exists — state the one color's tone and stop. Even the
      // word "to" is withheld: every stop is the same color.
      return `It holds at lightness ${f2(endLch.first.L)} and chroma ${f2(endLch.first.C)} — a single point rather than a ramp.`;
    }

    // Lead adjective: key words outrank plain dark/light because they also
    // constrain the spread; measure-first survivors sharpen them further.
    // "throughout" is reserved for the key words, whose tests bound the
    // SPREAD (range < 0.3) as well as the mean; the bare dark branch is a
    // mean claim only, so it says "overall" — before that distinction, 14
    // live palettes read "dark throughout: lightness climbs from 0.09 to
    // 0.74", the universal refuted by the movement clause beside it.
    let lead = "";
    if (f.meanLightness < T.DARK_LIGHTNESS) {
      lead = has("low-key")
        ? "low-key throughout"
        : useOf("deep") === "prose" && isDeep(f)
          ? "deep, dark with real color held in it"
          : "dark overall";
    } else if (f.meanLightness > T.LIGHT_LIGHTNESS) {
      lead =
        has("high-key") && softChroma
          ? "high-key and soft"
          : useOf("brilliant") === "prose" && isBrilliant(f)
            ? "brilliant, vividly lit and saturated at once"
            : has("high-key")
              ? "high-key"
              : "light";
    } else if (useOf("deep") === "prose" && isDeep(f)) {
      // deep's gate (L̄ < 0.45) reaches slightly past the dark band's 0.42.
      lead = "deep, dark with real color held in it";
    }

    // Lightness movement, with the peak/valley realization when the arch
    // direction is real (dense range guard) and the direction verbs otherwise.
    const L0 = endLch.first.L;
    const L1 = endLch.last.L;
    const stopLs = colors.map((c) => hexToOkLch(c).L);
    let movement: string;
    if (f.turns === 0) {
      if (f.lightnessRange < T.LOW_CONTRAST_RANGE)
        movement = `lightness stays nearly flat, ${f2(L0)} to ${f2(L1)}`;
      else {
        const only = f.lightnessRange < 0.3 ? " only" : "";
        movement = `lightness ${L1 >= L0 ? "climbs" : "falls"}${only} from ${f2(L0)} to ${f2(L1)}`;
        // The range fact licenses a contrast claim; the shadow/near-white
        // gloss additionally needs both ENDPOINTS inside their value bands
        // (near-black < 0.18, near-white > 0.87) — keyed to the range alone
        // it called a stop at L 0.74 "near-white" and one at 0.39 "deep
        // shadow", the true endpoints printed immediately before.
        if (f.lightnessRange > T.HIGH_CONTRAST_RANGE)
          movement +=
            Math.min(...stopLs) < NEAR_BLACK_L && Math.max(...stopLs) > NEAR_WHITE_L
              ? ", spanning deep shadow to near-white"
              : ", crossing most of the value scale";
      }
    } else if (f.turns === 1) {
      if (has("bright-middle"))
        movement = "lightness rises and falls once, glowing brightest through the middle";
      else if (has("dark-middle"))
        movement = "lightness dips dark through the middle and recovers";
      else
        movement = `lightness bends once between ${f2(Math.min(...stopLs))} and ${f2(Math.max(...stopLs))}`;
    } else {
      movement = `lightness oscillates, changing direction ${f.turns} times`;
    }

    // Temperature: the stored journey outranks the static adjective — it is
    // rarer, and it is the value the index already carries. The static word
    // is a MEAN-hue claim (the registry test), so it reads "overall", never
    // "throughout": 124 live palettes carried ≥25% of their chromatic mass at
    // the opposite pole — 52 printing the warm–cool-contrast clause in the
    // same paragraph — where a universal reading contradicted the paragraph's
    // own facts. The adjective drops its "overall" when the lead already
    // spent the word ("dark overall … warm overall" reads as an echo).
    const overallUsed = lead.includes("overall");
    const temp = journey
      ? `${journey} as it runs`
      : has("warm")
        ? overallUsed
          ? "warm"
          : "warm overall"
        : has("cool")
          ? overallUsed
            ? "cool"
            : "cool overall"
          : "";

    // Chroma: one band speaks, sharpened by the measure-first survivors.
    // Participial ("rising", "held") because every piece hangs off "with".
    // The pastel/muted bounds are MEAN claims — the registry tests bound
    // meanChroma only, and rendered stops routinely peak past them (59 live
    // paragraphs said "under 0.06" with a stop above it) — so both say
    // "mean", exactly as the vivid branch always has.
    let chroma: string;
    if (structure === "grayscale")
      chroma = `chroma never rising above ${f2(f.maxChroma)}`;
    else if (has("pastel")) chroma = `mean chroma held below ${f2(T.PASTEL_CHROMA)}`;
    else if (has("muted")) chroma = `mean chroma under ${ceil2(T.MUTED_CHROMA)}`;
    else if (useOf("jewel") === "prose" && isJewel(f))
      chroma = `chroma held in the deep, saturated range of jewel tones (mean ${f2(f.meanChroma)})`;
    else if (has("vivid")) chroma = `vividly saturated (mean chroma ${f2(f.meanChroma)})`;
    else chroma = `mean chroma ${f2(f.meanChroma)}`;
    if (has("neon")) chroma += `, peaking at ${f2(f.maxChroma)}`;
    if (
      structure !== "grayscale" &&
      f.denseChromaRange >= T.TRAJECTORY_DELTA &&
      f.chromaPeakT >= 1 / 3 &&
      f.chromaPeakT <= 2 / 3
    )
      chroma += ", most vivid mid-ramp";

    const tail = [movement, temp, `with ${chroma}`].filter(Boolean).join(", ");
    return lead ? `It is ${lead}: ${tail}.` : `${capitalize(tail)}.`;
  };
  const r3 = r3For();

  // ---------------------------------------------------------------------------
  // R4 — conditional clauses. Candidates are tried in measured-bits order
  // (fixture rate → -log2 in the comments), capped at three, so when several
  // are true the palette spends its clause budget on its rarest facts. The
  // page's length ladder later drops from the END of this list — the least
  // informative survivor goes first.
  // ---------------------------------------------------------------------------
  const clauses: Clause[] = [];
  if (!solid) {
    const push = (c: Clause) => {
      if (clauses.length < 3) clauses.push(c);
    };
    // exact repeat (equalC ∧ c ≥ 1.5: 0.1%, ~10 bits — editor-reachable via
    // the frequency slider). The license is exact: equal frequencies mean the
    // whole palette repeats with period 1/c. Skipped when the rainbow R2
    // already carried the cycle count.
    if (f.equalC && meanCycles >= 1.5 && !cyclesClauseFired)
      push({
        text: `the full sequence repeats ${f1(meanCycles)}× along the ramp`,
        host: "hue",
        dir: 0,
      });
    // pure black plateau (2.4%, 5.4 bits) — consumes the generic clip split.
    const blackPlateau = has("pure-black-plateau");
    if (blackPlateau)
      push({
        text: `${pct(f.clipped)}% of the run is pinned at a channel extreme, bottoming out at pure black`,
        host: "tone",
        dir: 0,
      });
    // hue wander (4.7%, 4.4 bits)
    if (has("hue-wandering"))
      push({ text: "the hue wanders back and forth rather than progressing", host: "hue", dir: 0 });
    // iso-luminant vibration (5.7%, 4.1 bits)
    if (has("iso-luminant"))
      push({
        text: "hue moves while lightness barely does, the classic vibrating-color pairing",
        host: "tone",
        dir: 0,
      });
    // Itten's contrast of saturation (measured 10.6%, 3.2 bits)
    if (useOf("saturation-contrast") === "prose" && saturationContrast(f))
      push({
        text: "pure color sits beside near-gray, a strong contrast of saturation",
        host: "tone",
        dir: 0,
      });
    // flat channel (11.0%, 3.2 bits) — two flat means a one-axis ramp (0.5%).
    const flat = f.channelRange
      .map((r, k) => (r < T.FLAT_CHANNEL_RANGE ? k : -1))
      .filter((k) => k >= 0);
    const channelName = ["red", "green", "blue"];
    if (flat.length === 2) {
      const moving = [0, 1, 2].find((k) => !flat.includes(k))!;
      push({
        text: `only the ${channelName[moving]} channel moves, a straight run along one axis of RGB`,
        host: "tone",
        dir: 0,
      });
    } else if (flat.length === 1)
      push({
        text: `the ${channelName[flat[0]!]} channel stays fixed the whole way`,
        host: "tone",
        dir: 0,
      });
    // hue direction (17.4% / 16.6%, ~2.5 bits). Never "clockwise" — that is a
    // wheel-drawing convention, not a color fact; OkLCh hue increases in
    // spectral order, measured with this repo's own conversion.
    if (has("hue-advancing"))
      push({ text: "hues advance in rainbow order (red toward yellow and green)", host: "hue", dir: 0 });
    else if (has("hue-reversing"))
      push({ text: "hues run the wheel in reverse (red back through magenta into blue)", host: "hue", dir: 0 });
    // in-gamut guarantee (17.9%, 2.5 bits) — a ± |b| bound every channel, so
    // the claim holds at every frequency and phase, not just this sample.
    if (has("unclipped"))
      push({
        text: "every channel stays inside gamut end to end, a fully smooth, unclipped blend",
        host: "tone",
        dir: 0,
      });
    // chroma trend (desaturating 18.1% / saturating 24.0%, ~2.2 bits) — the
    // directional pair the connective rule reads.
    if (has("saturating")) push({ text: "color intensifies toward the end", host: "tone", dir: 1 });
    else if (has("desaturating"))
      push({ text: "the color washes out as it goes", host: "tone", dir: -1 });
    // Itten's cold–warm contrast (measured 23.1%, 2.1 bits)
    if (useOf("warm-cool-contrast") === "prose" && warmCoolContrast(f))
      push({
        text: "warm and cool poles are both present at once, a built-in warm–cool contrast",
        host: "tone",
        dir: 0,
      });
    // generic clip split (24.7% / 18.6%, ~2 bits), unless the plateau said it.
    if (!blackPlateau && has("clipped")) {
      const hi = has("clipped-highlights");
      const lo = has("crushed-shadows");
      const p = pct(f.clipped);
      push({
        text:
          hi && lo
            ? `${p}% of the run is pinned at a channel extreme, highlights clipping into flat spots and shadows crushing flat`
            : hi
              ? `${p}% of the run is pinned at the top of a channel, the highlights clipping into flat spots`
              : lo
                ? `${p}% of the run is pinned at the bottom of a channel, the shadows crushing flat`
                : `${p}% of the run is pinned at a channel extreme, flattening the loudest bands`,
        host: "tone",
        dir: 0,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // R5 — surface facts: the WCAG number always, the seam only when it closes.
  // ---------------------------------------------------------------------------
  // The ratio prints FLOORED (see floor1) and the verdict runs on the raw
  // value; the two agree by construction — floor(x·10)/10 ≥ 4.5 exactly when
  // x ≥ 4.5 — so "4.5:1, short of the 4.5:1 threshold" stays unwritable AND
  // the verdict matches WCAG 2.1 conformance on the actual ratio. The old
  // round-half-up print told palettes at 4.45–4.4999 they "clear" a
  // threshold they fail, while the same embedText omitted the wcag-aa tag.
  const printedCR = floor1(f.contrastRatio);
  const clears = f.contrastRatio >= WCAG_AA;
  let r5 = clears
    ? `The lightest and darkest stops measure ${printedCR}:1 — clears the ${f1(WCAG_AA)}:1 WCAG AA threshold for text.`
    : `The lightest and darkest stops measure ${printedCR}:1, short of the ${f1(WCAG_AA)}:1 WCAG AA threshold for text.`;
  if (!solid && has("seamless")) {
    // Integer frequencies are seamless at every phase — sin(πc) = 0 — so the
    // mechanism may be stated when every |c| sits within 0.02 of a whole number.
    const wholeC = f.channelCycles.every((c) => Math.abs(c - Math.round(c)) <= 0.02);
    r5 += ` Its first and last colors match almost exactly, so it wraps into a conic ring without a visible seam${wholeC ? " — an exact property of its whole-number frequencies" : ""}.`;
  }

  // ---------------------------------------------------------------------------
  // R7 — usage close: first true gate wins, one variant max, omitted when
  // nothing fires. Every phrase is a restated measurement, not an opinion.
  // ---------------------------------------------------------------------------
  const r7For = (): string | null => {
    if (solid) return null;
    // Gate 1 of the research table (contrastRatio ≥ 4.5 → "ends pair as text
    // and background") is skipped by construction: R5 always states clears/
    // short, so the row would restate the sentence directly above it.
    if (has("high-key"))
      // "soft wash" is chroma language (same gate as the R3 lead); a vivid
      // high-key palette gets the value-and-spread claim its test makes.
      return softChroma
        ? "A soft wash that works as a page background under dark text."
        : "A bright, even field that works as a page background under dark text.";
    if ((has("dark") || has("low-key")) && f.lightnessRange < 0.3)
      return "A low, even backdrop that stays out of the way of lighter foreground elements.";
    if (has("seamless")) return "Made for conic and ring renders, where its matched ends close the loop.";
    return null;
  };

  // R6 — the view sentence, page surfaces only: the ONE place steps, style and
  // angle may appear, and the carrier of the "hex codes / CSS" demand tokens.
  const r6 = view
    ? `Shown here as a ${styleLabel(view.style)} in ${view.steps} steps at ${deg(view.angle)}° — copy the hex codes, CSS, or SVG below.`
    : null;

  // R2 vs R3 order is earned, not fixed: the selectModifiers ranking principle
  // applied to sentences. A pastel monochrome leads with tone (pastel 5.0 >
  // monochrome 3.1); a complementary duotone leads with geometry. This ranks
  // FACTS, not words — vetoed and unspoken descriptors still count.
  const structureScore = (() => {
    const d = DESCRIPTORS.find((x) => x.axis === "structure" && x.word === structure);
    return d ? descriptorScore(d) : 0;
  })();
  const toneScore = DESCRIPTORS.filter(
    (d) => d.axis === "tone" && tags.includes(d.word),
  ).reduce((best, d) => Math.max(best, descriptorScore(d)), 0);

  // Embedding-tail vocabulary: true facts whose measured rate fell below the
  // 2% speaking floor. They ride the Tags line only — never the paragraph.
  const embedTailTags: string[] = [];
  if (!solid) {
    if (useOf("deep") !== "silent" && isDeep(f)) embedTailTags.push("deep");
    if (useOf("jewel") !== "silent" && isJewel(f)) embedTailTags.push("jewel");
    if (useOf("sepia") !== "silent" && isSepia(f, structure)) embedTailTags.push("sepia");
    if (useOf("ombre") !== "silent" && isOmbre(f, structure)) embedTailTags.push("ombre");
    if (useOf("brilliant") !== "silent" && isBrilliant(f)) embedTailTags.push("brilliant");
    const lean = useOf("warm-gray") !== "silent" ? grayLean(f) : null;
    if (lean) embedTailTags.push(`${lean}-gray`);
    if (useOf("opponent-axis") !== "silent" && axis)
      embedTailTags.push(axis === "blue–yellow" ? "blue-yellow-axis" : "green-red-axis");
    if (useOf("warm-cool-contrast") !== "silent" && warmCoolContrast(f))
      embedTailTags.push("warm-cool-contrast");
    if (useOf("saturation-contrast") !== "silent" && saturationContrast(f))
      embedTailTags.push("saturation-contrast");
  }

  return {
    structure,
    r1: r1For(true),
    r1Identity: r1For(false),
    r2,
    r2Extras,
    r3,
    clauses,
    r5,
    r7: r7For(),
    r6,
    toneLeads: toneScore > structureScore,
    solid,
    embedTailTags,
  };
}

/**
 * Attach a group of R4 clauses to its host sentence. A lone short clause
 * joins the host after a dash — rhythm variation that is itself feature-
 * driven — while two or more stand as their own sentence. The connective
 * ("even as" vs "while") is keyed to whether the clause's chroma direction
 * opposes the host's lightness direction: "climbs … even as the color washes
 * out" is a tension, "falls … while the color washes out" is not. Hue-hosted
 * clauses state a parallel fact rather than a tension, so they attach plain.
 */
function attachClauses(
  host: string,
  group: readonly Clause[],
  connectiveFor: (clause: Clause) => string,
): string[] {
  if (!group.length) return [host];
  if (group.length === 1 && group[0]!.text.length < 60) {
    const connective = connectiveFor(group[0]!);
    return [`${host.slice(0, -1)} — ${connective}${group[0]!.text}.`];
  }
  return [host, `${capitalize(group.map((c) => c.text).join("; "))}.`];
}

function assemble(
  parts: ProseParts,
  f: PaletteFeatures,
  clauses: readonly Clause[],
  extras: readonly string[],
): {
  identity: string;
  bodySentences: string[];
  pageSentences: string[];
} {
  // Solid palettes veto every journey construction: R1 states the degenerate
  // case, tone and the WCAG line remain, and the paragraph stops there.
  if (parts.solid) {
    const body = [parts.r3, parts.r5];
    return {
      identity: parts.r1Identity,
      bodySentences: body,
      pageSentences: [parts.r1, ...body, ...(parts.r6 ? [parts.r6] : [])],
    };
  }

  const hostDir = f.turns === 0 ? Math.sign(f.lightnessDelta) : 0;
  const toneConnective = (clause: Clause) =>
    hostDir !== 0 && clause.dir !== 0 && clause.dir !== hostDir ? "even as " : "while ";
  const hueConnective = () => "";

  const hue = clauses.filter((c) => c.host === "hue");
  const tone = clauses.filter((c) => c.host === "tone");
  const r2Block = [...attachClauses(parts.r2, hue, hueConnective), ...extras];
  const r3Block = attachClauses(parts.r3, tone, toneConnective);
  const middle = parts.toneLeads ? [...r3Block, ...r2Block] : [...r2Block, ...r3Block];

  const bodySentences = [...middle, parts.r5, ...(parts.r7 ? [parts.r7] : [])];
  return {
    identity: parts.r1Identity,
    bodySentences,
    pageSentences: [parts.r1, ...bodySentences, ...(parts.r6 ? [parts.r6] : [])],
  };
}

// =============================================================================
// Public surface
// =============================================================================

/**
 * The prose parts, individually addressable — exported for the test harness
 * (the step-invariance check asserts on `r2` alone, which is the sentence
 * contracted to be byte-identical at every step count) and for any surface
 * that wants a single role rather than the paragraph.
 */
export function paletteProseParts(
  coeffs: CosineCoeffs,
  hexColors: readonly string[],
  view: ProseView,
  options: ProseOptions = {},
): ProseParts {
  return buildParts(coeffs, hexColors, view, options);
}

/**
 * Target band for the visible paragraph. The ladder below trims toward the
 * top of it the same way the meta description does: drop the LAST R4 clause
 * (they were selected rarity-first, so the last is the least informative
 * survivor), then the last R2 extra, reassembling each rung. Measured over
 * the fixture corpus before the ladder existed: p50 655, p95 830, max 1098 —
 * so the ladder bites on roughly the top decile and nothing else changes.
 * The embedding text is NOT trimmed: retrieval wants every true clause, and
 * its own ceiling (1,600 chars) was never approached (measured max 1,142).
 */
const PARAGRAPH_MAX = 800;

export function paletteProse(
  coeffs: CosineCoeffs,
  hexColors: readonly string[],
  view: ProseView,
  options: ProseOptions = {},
): PaletteProse {
  const colors = hexColors.length >= 2 ? [...hexColors] : fallbackStops(coeffs);
  const named =
    options.named ?? describePaletteName(coeffs, colors, { features: options.features });
  const f = options.features ?? named.features;
  const opts = withBaseTags(coeffs, { ...options, named, features: f });

  const parts = buildParts(coeffs, colors, view, opts);
  const full = assemble(parts, f, parts.clauses, parts.r2Extras);

  let clauses = parts.clauses as readonly Clause[];
  let extras = parts.r2Extras as readonly string[];
  let page = full.pageSentences;
  while (page.join(" ").length > PARAGRAPH_MAX && (clauses.length || extras.length)) {
    if (clauses.length) clauses = clauses.slice(0, -1);
    else extras = extras.slice(0, -1);
    page = assemble(parts, f, clauses, extras).pageSentences;
  }
  const paragraph = page.join(" ");
  const { identity, bodySentences } = full;

  // Meta description: identity + action clause, ladder-trimmed exactly like
  // the title ladder — drop the action clause first, then trailing color
  // names (by re-deriving the identity at a smaller name budget, so the
  // shortened sentence is still a true, grammatical R1 rather than a cut).
  let metaDescription = `${identity} ${META_ACTION}`;
  if (metaDescription.length > META_MAX) metaDescription = identity;
  for (let max = named.colorNames.length - 1; metaDescription.length > META_MAX && max >= 1; max--) {
    const shorter = describePaletteName(coeffs, colors, { features: f, maxNames: max });
    const shorterParts = buildParts(coeffs, colors, view, {
      ...opts,
      named: shorter,
    });
    metaDescription = shorterParts.r1Identity;
  }

  const embedText = composeEmbedText(identity, bodySentences, parts, f, colors, opts.baseTags);
  return { identity, paragraph, metaDescription, embedText };
}

/**
 * The canonical embedding composition (research-prose §4): prose body first
 * because queries are natural language, then a Tags line for single-word
 * filters, then a Colors line for the color axis. No R6 — the index describes
 * the seed-invariant palette — and no hex: the query side already strips hex
 * to names, so hex here would be pure asymmetric noise. Mean-pooled
 * embeddings dilute with length; the 2,048-token window is a ceiling, not a
 * target, so nothing is padded.
 *
 * REINDEX-GATED: the live Vectorize index has never seen this vocabulary.
 * Point the indexing pipeline here at the same reindex that corrects the
 * legacy texture:'monochrome' tag; until then normalizeSemanticQuery's seed
 * branch must stay as it is (query/index asymmetry degrades matching).
 */
export function paletteEmbedText(
  coeffs: CosineCoeffs,
  hexColors: readonly string[],
  options: ProseOptions = {},
): string {
  const colors = hexColors.length >= 2 ? [...hexColors] : fallbackStops(coeffs);
  const named =
    options.named ?? describePaletteName(coeffs, colors, { features: options.features });
  const f = options.features ?? named.features;
  const opts = withBaseTags(coeffs, { ...options, named, features: f });
  const parts = buildParts(coeffs, colors, null, opts);
  const { identity, bodySentences } = assemble(parts, f, parts.clauses, parts.r2Extras);
  return composeEmbedText(identity, bodySentences, parts, f, colors, opts.baseTags);
}

function composeEmbedText(
  identity: string,
  bodySentences: readonly string[],
  parts: ProseParts,
  f: PaletteFeatures,
  colors: readonly string[],
  baseTags: readonly string[] | undefined,
): string {
  // From the stored vocabulary only the JOURNEY value rides along — the one
  // axis the registry lacks. Merging the whole base list echoed the legacy
  // texture:'monochrome' (an avgSat < 0.05 claim, i.e. grayscale) beside the
  // structural vocabulary where monochrome means one hue — the exact
  // collision the pending reindex exists to correct, reintroduced at the
  // moment of correction (conflation law: never echo the legacy tag into
  // text). Base colors are carried by the Colors line, warmth and contrast
  // by the registry words.
  const journey = baseTags?.find((w) => w === "warming" || w === "cooling");
  const tagWords: string[] = [];
  const seen = new Set<string>();
  for (const w of [...modifierTags(f), ...(journey ? [journey] : []), ...parts.embedTailTags]) {
    const key = w.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      tagWords.push(w);
    }
  }
  const names = getUniqueColorNames([...colors], { max: 6 });
  return [
    identity,
    ...bodySentences,
    `Tags: ${tagWords.join(", ")}.`,
    `Colors: ${names.join(", ")}.`,
  ].join(" ");
}

// =============================================================================
// Related searches — the labels under the description (D13)
// =============================================================================

/**
 * Ranked query labels derived from the description system's TRUE facts, for
 * the related-links row under the paragraph. Pure and deterministic so the
 * server render and the island can never disagree.
 *
 * Ranking: (1) the palette's color names in ramp order — most specific, and
 * color-name queries are indexable by design; (2) fired spoken-eligible
 * descriptors' spoken words by descriptorScore — true facts only, and the
 * prose vetoes do NOT apply here: a fact the name already says is still a
 * relevant link; (3) family words from the R2 machinery as backfill below
 * three labels. Case-insensitive dedupe, cap six.
 *
 * CRAWL SAFETY: every label comes from a bounded vocabulary — the color-name
 * corpus, the registry's spoken words, or the 12 family anchors — never a
 * free-text compound, so the crawl frontier stays finite. Color-name queries
 * are indexable by design (indexableQuery way #2); modifier words are either
 * curated-publishable or score-gated to noindex,follow, which still renders
 * and edge-caches. Hub duplication (sunset, pastel…) is allowed: an
 * in-content link carries relevance the boilerplate footer row does not.
 */
/**
 * querySlug for related-search labels, restated locally so the edit island
 * can link the chips. The island cannot import ./semantic-search — its search
 * client is typed against the Worker's `Env`, which the islands typecheck
 * (no workers-types) does not know — so the slug rule lives here for the
 * LABEL vocabulary only. querySlug's other branch (a decodable seed passes
 * through case-sensitively) can never apply: no corpus name, spoken word or
 * family anchor decodes as a seed, and palette-prose.test.js asserts parity
 * with querySlug over every label the bounded vocabularies can produce.
 */
export function relatedSearchSlug(label: string): string {
  return encodeURIComponent(label.trim().toLowerCase().replace(/\s+/g, "-"));
}

export function relatedSearches(
  features: PaletteFeatures,
  named: NamedPalette,
  tags: readonly string[],
): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  const add = (label: string) => {
    const key = label.toLowerCase();
    if (label && !seen.has(key) && labels.length < 6) {
      seen.add(key);
      labels.push(label);
    }
  };

  for (const name of named.colorNames) add(name);

  const fired = DESCRIPTORS.filter((d) => d.spoken && tags.includes(d.word)).sort(
    (a, b) => descriptorScore(b) - descriptorScore(a),
  );
  for (const d of fired) add(spokenWord(d));

  if (labels.length < 3) {
    const structure = classifyStructure(features);
    const familyCandidates =
      structure === "grayscale"
        ? []
        : structure === "monochrome"
          ? [features.meanHue]
          : structure === "duotone" || structure === "complementary"
            ? features.clusterHues
            : [features.firstHue, features.lastHue].filter((h): h is number => h !== null);
    for (const h of familyCandidates) {
      if (labels.length >= 3) break;
      add(familyWord(h));
    }
  }
  return labels;
}

// =============================================================================
// The canonical three-output API (D15)
// =============================================================================

export interface PaletteDescription {
  /**
   * The palette's name — "Pastel duotone blush and sky blue". Full headline
   * budget; surfaces compose <title> from the title-budget variant plus
   * titleSuffix themselves.
   */
  title: string;
  /**
   * The full deterministic description paragraph, view-parameterized (it ends
   * on R6); embedText remains the seed-invariant composition.
   */
  description: string;
  /**
   * The CURATED tags — the ranked, bounded relatedSearches labels the chip
   * row shows. The exhaustive true-fact list stays available as
   * modifierTags/tagsToArray for embeddings; paletteJson's `tags` field keeps
   * that exhaustive list for contract stability.
   */
  tags: string[];
}

/**
 * The system's public contract: one entry point, three outputs, ONE analysis
 * pass. describePaletteName runs the dense sample once; its features feed the
 * prose and the related labels, so calling this costs the same as naming the
 * palette. Future consumers (the saved-palette AI-naming flow embeds
 * title + description + tags) call this rather than the pieces.
 */
export function describePalette(
  coeffs: CosineCoeffs,
  hexColors: readonly string[],
  view: ProseView,
  options: ProseOptions = {},
): PaletteDescription {
  const colors = hexColors.length >= 2 ? [...hexColors] : fallbackStops(coeffs);
  const named =
    options.named ?? describePaletteName(coeffs, colors, { features: options.features });
  const features = options.features ?? named.features;
  // paletteProse defaults baseTags from the stored vocabulary when absent, so
  // this description is byte-equal to the page's (the journey wording
  // included) whether or not the caller supplied the tags.
  const prose = paletteProse(coeffs, colors, view, { ...options, named, features });
  return {
    title: named.name,
    description: prose.paragraph,
    tags: relatedSearches(features, named, modifierTags(features)),
  };
}
