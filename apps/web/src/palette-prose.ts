// The palette's description, shared by the server render and the editor island
// — the same reason palette-name.ts lives here: pure function of (coeffs,
// hexColors, view), no fetch, no request context.
//
// THE MODEL IS THE NAME (D20). `describePaletteName` works because it is
// radically SELECTIVE: dozens of facts are computed, at most two are spoken,
// the rest only decide which two. This file is that discipline with a slightly
// larger budget. It does NOT translate each measurement into its own clause —
// that was the first version, and the owner's verdict on it was "way too
// technical … a checklist"; one clause per fact is the analysis showing
// through. Instead every sentence is an IMPRESSION: a short human statement
// licensed by a CONJUNCTION of predicates, ranked by measured information, of
// which two at most are spent. Most true facts stay silent and only inform the
// choice. A palette with nothing unusual gets a short description, and that is
// correct rather than a failure.
//
// NO ANALYSIS VOCABULARY (D20.3). The description may not contain hue, chroma,
// saturation, lightness, value, contrast ratio, WCAG, channel, clipping,
// gamut, cycles, frequency, phase, seam, ramp, arch, span, degrees, cluster,
// opponent, the scheme jargon (analogous/complementary/tetradic), "mean", or
// any number except the end hex codes in the identity sentence and the
// steps/angle in the view sentence. Em dashes and en dashes are banned outright
// (owner: "man i hate em dashes"). palette-prose.test.js scans all 867 fixture
// paragraphs, metas and embed bodies for every one of those tokens, so the ban
// is enforced by the build rather than by care. The technical layer keeps its
// home in embedText's "Tags:" and "Colors:" lines, where retrieval wants it.
//
// TRANSLATION-FRIENDLY ENGLISH (D20.4). The audience is global and much of this
// text is read through machine translation, so every phrase below uses short,
// common, concrete words with direct equivalents in other languages: simple
// present tense, subject-verb-object order, one idea per clause, sentences
// under ~15 words, no phrasal verb where a single verb exists, and no idiom or
// metaphor that does not travel ("sunbaked", "moody", "jewel tones", "washes
// out", "crushes", "pops" are all out). When a vivid phrase and a plain phrase
// are both true, the plain one ships. The test pins this: every word a
// description can contain must appear in a reviewed ALLOWED_WORDS list, so a
// new phrasing is a deliberate act rather than a drive-by.
//
// DETERMINISM. Banned in this module: Math.random, Date, seed hashing, locale
// formatting. Variety derives only from feature values.
//
// STEP BEHAVIOR. Structure is a dense-sample fact and is byte-identical at every
// step count, and over the fixture at 3/7/13/24 steps the form-slot sentence
// never changed into a DIFFERENT form sentence (0 events in 2,601 re-renders):
// it only appeared or vanished as the budget filled (39) or as the rendered-stop
// series detector found a series a coarser sample had missed (12). The tone and
// motion rows read rendered means, exactly as the NAME does, so the full
// two-sentence selection is identical at all four step counts for 77.0% of the
// fixture. Color names legitimately track steps (documented behavior of the name
// system); the view sentence is the only one allowed to mention steps, style or
// angle, and it never enters embedText.

import {
  getUniqueColorNames,
  hexToColorName,
  hexToOkLch,
  relativeLuminance,
} from "@repo/data-ops/color-utils";
import {
  classifyStructure,
  DESCRIPTORS,
  descriptorScore,
  hueBandShare,
  modifierTags,
  spokenWord,
  stopHasHue,
  THRESHOLDS,
  type Descriptor,
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
  CONTRADICTED_BY,
  describePaletteName,
  styleLabel,
  type NamedPalette,
} from "./palette-name";

const T = THRESHOLDS;

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
 * How far the lightness may travel before a sentence about "the colors" stops
 * being true of all of them.
 *
 * The tone rows make MEAN claims, and English hears "the colors are light and
 * strong" as a universal. Over a ramp that crosses half the value scale the
 * mean has stopped representing the stops: a cream → coral → fire brick sweep
 * measures mean L 0.71 and reads "light and strong at the same time" beside
 * three plainly dark stops. 0.5 is the corpus p75 lightnessRange (measured p25
 * 0.21, p50 0.34, p75 0.49), so the universal tone rows speak for the three
 * quarters of palettes whose spread their mean can carry, and the wide ones
 * fall through to the hedged rows ("mostly dark") or to another slot.
 */
const EVEN_SPREAD = 0.5;

/**
 * Lightness travel a direction sentence needs before it is worth saying.
 * See the brightens/darkens rows: the registry's own guard is the noise floor,
 * this one is the visibility floor.
 */
const VISIBLE_MOVEMENT = 0.25;

/**
 * WCAG 2.1 AA for normal text, applied to INK on a stop rather than to the two
 * stops against each other. The old sentence printed the end-to-end ratio,
 * which answers a question nobody asks: you do not set text in one end of a
 * gradient on the other end of it. What a designer needs is whether black text
 * survives on the light end and white text on the dark end, and each of those
 * is a one-line inequality on relative luminance — (L + 0.05)/0.05 ≥ 4.5 and
 * 1.05/(L + 0.05) ≥ 4.5 — so the claim the sentence makes is the claim the
 * gate tests, exactly.
 */
const DARK_INK_LUMINANCE = 4.5 * 0.05 - 0.05; // ≥ this and black text clears AA
const LIGHT_INK_LUMINANCE = 1.05 / 4.5 - 0.05; // ≤ this and white text clears AA

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
// the word may appear: 2%–60% is eligible for an impression, under 2% is
// embedding-tail vocabulary only, over 60% stays silent. The verdicts are
// pinned by palette-prose.test.js the same way palette-name.test.js pins the
// registry, so a drift here fails the build rather than shipping unnoticed.
//
// Eligibility is necessary, not sufficient: `opponent-axis` clears the band at
// 41.1% and still says nothing, because its only honest phrasing ("sits on the
// blue-yellow axis of opponent color") is exactly the analysis vocabulary D20.3
// bans. It rides the Tags line instead. `warm-gray` and `sepia` fell below the
// 2% floor and are tags for the same reason the band exists.

type MeasureFirstUse = "prose" | "embed" | "silent";

/**
 * Measured rates (867 fixture seeds at the default view, 2026-08-17). The
 * research predicted ombre, sepia, jewel and deep as survivors; the fixture
 * kept seven of nine in the 2%–60% band and overturned two predictions:
 * BRILLIANT survived at 8.3% (the corpus has more light-and-vivid palettes
 * than the low-chroma p50 suggested) and SEPIA died at 0.9% — brown
 * monochromes narrow enough for the gate are rarer live than on paper — so
 * sepia is embedding-tail vocabulary only, joined by WARM-GRAY at 1.96%
 * after the D19 fix stopped it reading pastel rainbows as grays (it measured
 * 3.23% while a palette could be near its gamut ceiling and still count as
 * neutral).
 */
const MEASURE_FIRST: Record<string, { use: MeasureFirstUse; rate: number }> = {
  deep: { use: "prose", rate: 0.0542 },
  jewel: { use: "prose", rate: 0.1223 },
  sepia: { use: "embed", rate: 0.0092 },
  ombre: { use: "prose", rate: 0.1765 },
  "warm-gray": { use: "embed", rate: 0.0196 },
  "opponent-axis": { use: "prose", rate: 0.4106 },
  "warm-cool-contrast": { use: "prose", rate: 0.2353 },
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
  // D19: "is this a gray at all" is an IDENTITY question, so it needs both
  // readings, the same conjunction `isGrayscale` uses. On absolute chroma alone
  // this band — 0.008 to 0.03 — is exactly where near-ceiling pale tints live,
  // and the palette that exposed the bug (#ceeaff, #fcd3d4, #deffff: plainly
  // blue, pink and cyan, mean chroma 0.029) sat inside it. Calling that a warm
  // gray is the same mistake as calling it grayscale.
  if (f.denseMeanSaturation >= T.GRAYSCALE_SAT) return null;
  if (f.denseMeanChroma < 0.008 || f.denseMeanChroma >= T.CHROMA_FLOOR) return null;
  if (f.meanHue >= 330 || f.meanHue < 120) return "warm";
  if (f.meanHue >= 150 && f.meanHue < 300) return "cool";
  return null;
}

/**
 * ≥85% of chromatic mass on one OkLab opponent axis (±45° around its poles).
 * ASCII hyphens on purpose: these strings reach embedText's Tags line, and the
 * en dash that reads better in a comment is banned in generated text.
 */
function opponentAxis(f: PaletteFeatures): "blue-yellow" | "green-red" | null {
  if (hueBandShare(f, 45, 135) + hueBandShare(f, 225, 315) >= 0.85) return "blue-yellow";
  if (hueBandShare(f, 315, 45) + hueBandShare(f, 135, 225) >= 0.85) return "green-red";
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
 * on the rendered stops sorted by lightness; the base is the palette's family
 * word — a transformation noun always takes "of + base", and the base must have
 * usable chroma to be named at all.
 */
function seriesReading(f: PaletteFeatures, hexColors: readonly string[]): SeriesReading | null {
  const stops = hexColors.map(hexToOkLch);
  if (stops.length < 3) return null;
  const byL = [...stops].sort((a, b) => a.L - b.L);
  const maxC = Math.max(...stops.map((s) => s.C));
  // Which stops carry the base hue is an IDENTITY question, so it walks the
  // registry's saturation-aware predicate rather than absolute chroma (D19).
  // It matters most exactly here: a tint series ENDS pale by definition, and on
  // an absolute floor a series of pale blues never had a base to be tints of.
  const chromatic = hexColors.filter(stopHasHue).map(hexToOkLch);
  if (!chromatic.length) return null;

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

  // The base WORD is the family of the mean hue — the same quantity the form
  // impressions read — not the most chromatic stop's own hue. A monochrome
  // palette has one hue, so the paragraph must use one word for it, and the two
  // readings can disagree across an anchor boundary (measured: a 21° red-orange
  // mono read "orange" in one sentence and "red" in the next before this pinned
  // them together). familyWord returns only the eight gate-free band words, so
  // the series base always passes its family gate — the transformation-noun
  // rule ("tints OF a base that earns its name") holds by construction.
  const base = familyWord(f.meanHue);
  if (tint && shade) return { kind: "tints and shades", base };
  if (tint) return { kind: "tints", base };
  if (shade) return { kind: "shades", base };
  if (tone) return { kind: "tones", base };
  return null;
}

// =============================================================================
// Public types
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

export interface PaletteProse {
  /** The identity sentence alone, no parenthetical hexes — the meta opener. */
  identity: string;
  /** Full on-page paragraph: identity(with hexes) + impressions + view. */
  paragraph: string;
  /** ≤160 chars: identity + action clause, ladder-trimmed. */
  metaDescription: string;
  /** identity(no hex) + impressions + "Tags: …" + "Colors: …". No view, no hex. */
  embedText: string;
}

/** All the strings, before assembly — exported for the test harness. */
export interface ProseParts {
  structure: string;
  /** The identity sentence with the end hex codes (page/paragraph variant). */
  identityWithHex: string;
  /** The identity sentence without hexes (meta + embed variant). */
  identity: string;
  /** The chosen impressions' ids, in reading order — the selection under test. */
  impressions: string[];
  /** Those impressions realized as sentences, in the same order. */
  sentences: string[];
  /** The view sentence, page surfaces only. */
  view: string | null;
  solid: boolean;
  /** Sub-band facts that may only ride the embedding tail, as tag words. */
  embedTailTags: string[];
}

/** Meta-description action clause; dropped first when the ladder has to trim. */
const META_ACTION = "Copy the CSS, or export SVG and PNG.";
const META_MAX = 160;

/** "A pastel…" / "An earthy…" — keyed to the finished phrase, not the palette. */
const article = (phrase: string) => (/^[aeiou]/i.test(phrase) ? "An" : "A");

/**
 * The name's modifier phrase in description vocabulary.
 *
 * One word needs translating: the registry indexes `complementary` under its own
 * name (the angle between the two hues is worth filtering on) and the Descriptor
 * doc says it is spoken as "duotone", but the registry row never set spokenAs,
 * so the NAME says "Complementary dark brown and sapphire". D2 freezes the name
 * system (its collision rates were measured on that vocabulary) and D20.3 bans
 * the scheme jargon from the description, and both can be honored at once: the
 * heading keeps the word, the description says the everyday one. Setting
 * spokenAs: 'duotone' in the registry is the right long-term home and is a name
 * change, so it belongs to whoever re-measures the collision rates.
 */
const PLAIN_WORD: Record<string, string> = { complementary: "duotone" };

const plainPhrase = (phrase: string) =>
  phrase
    .split(" ")
    .map((w) => PLAIN_WORD[w] ?? w)
    .join(" ");

/** The angle, nearest integer — the only number outside the identity's hexes. */
const deg = (x: number) => String(Math.round(x));

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
 * stop — the fabricated stop mixed made-up rendered-stop claims into real
 * dense-sample claims in one paragraph.
 */
const fallbackStops = (coeffs: CosineCoeffs): string[] =>
  cosineGradient(2, coeffs).map(([r, g, b]) => rgbToHex(r, g, b));

// =============================================================================
// The impression table
// =============================================================================

type ImpressionSlot = "tone" | "form" | "motion" | "use";

/** Everything an impression may read. One analysis, computed once per call. */
interface Ctx {
  f: PaletteFeatures;
  structure: string;
  has: (word: string) => boolean;
  /** Rendered stops, ramp order. */
  colors: readonly string[];
  /** Their OkLCh lightnesses — the end-band claims read these. */
  stopL: number[];
  solid: boolean;
  /** Low enough chroma that soft/pale language is honest (see below). */
  softChroma: boolean;
  /** Spread small enough that a mean-based tone claim speaks for every stop. */
  evenSpread: boolean;
  journey: "warming" | "cooling" | null;
  series: SeriesReading | null;
  /** The name's modifier phrase, for the echo veto. */
  phrase: string;
  darkInkReads: boolean;
  lightInkReads: boolean;
  meanCycles: number;
}

interface Impression {
  id: string;
  slot: ImpressionSlot;
  /**
   * Measured share of the 867-seed fixture whose features license this
   * impression, at the default view. This IS the ranking (see impressionScore),
   * and palette-prose.test.js re-measures every row and fails the build on
   * drift — the same contract the registry's prevalences are held to. Never
   * estimate one: a wrong number here silently reorders what the site says.
   */
  prevalence: number;
  /** The full conjunction of predicates that licenses the phrase. */
  when: (c: Ctx) => boolean;
  /** The phrase itself. Feature-driven variation only, never rotation. */
  say: (c: Ctx) => string;
  /**
   * Words that, when the NAME already spent them, silence this impression: the
   * saysItAlready discipline from palette-name.ts applied to sentences. A
   * heading reading "Pastel rainbow …" followed by "It stays pale and soft"
   * spends the description's small budget saying the name again.
   *
   * The line is RESTATE versus EXPLAIN. "It stays pale and soft" restates
   * `pastel`, so it echoes; "It rests on two colors and skips everything
   * between them" explains what `duotone` means to someone who does not know
   * the word, so it does not. That distinction is why the series and structure
   * rows carry no echo list while the tone rows all do.
   */
  echoes?: readonly string[];
  /** Ids this one may not be spoken beside (redundant or contradictory). */
  conflicts?: readonly string[];
}

/**
 * Self-information in bits, through the registry's own scoring function.
 *
 * Ranking impressions by measured rarity is exactly how the NAME picks its two
 * words, and reusing descriptorScore rather than restating -log2 keeps one
 * definition of "informative" in the codebase. Demand weighting stays at 1: a
 * description is read, not searched, so the search-demand multiplier that lifts
 * `pastel` over `earthy` in a title has no business ordering sentences.
 */
const impressionScore = (i: Impression): number =>
  descriptorScore({
    word: i.id,
    axis: "tone",
    // A measured rate of zero means "rarer than one seed in the fixture", not
    // "impossible": the editor reaches states the live sitemap never sampled
    // (the registry's `solid` descriptor exists for exactly that reason), and
    // -log2(0) is Infinity, which would make an unmeasurably rare impression
    // outrank every other sentence the moment a slider produced it. One seed's
    // worth of probability is the honest floor.
    prevalence: Math.max(i.prevalence, 1 / FIXTURE_SEEDS),
    spoken: false,
    demand: 1,
    test: () => true,
  } satisfies Descriptor);

/** Size of the fixture every prevalence in this file was measured over. */
const FIXTURE_SEEDS = 867;

/**
 * The table. Each row is {phrase, the conjunction that licenses it, measured
 * information}, and the four slots (what it is like, what shape it has, how it
 * moves, what it is for) are the diversity constraint: at most one row per slot
 * is spoken, so the description can never spend both its sentences on lightness.
 *
 * Rows are ordered by slot for reading, NOT by rank — ranking is by score at
 * selection time. Every gate is a registry test, a THRESHOLDS constant or a
 * measure-first detector; nothing here invents a threshold.
 */
const IMPRESSIONS: readonly Impression[] = [
  // --- tone: what the colors are like -------------------------------------
  {
    // Both readings agree there is no color (D19), so the palette has nothing
    // to say about which color it is.
    id: "gray",
    slot: "tone",
    prevalence: 0.0219,
    when: (c) => c.structure === "grayscale",
    say: () => "It is nearly gray, with very little color in it.",
    echoes: ["grayscale"],
  },
  {
    // pastel (light + low absolute chroma) AND high-key (the spread is small
    // too): four predicates fuse into one impression, which is the point of
    // the table — "pale and soft the whole way" is one human idea.
    id: "pale-soft",
    slot: "tone",
    prevalence: 0.0773,
    when: (c) => c.has("pastel") && c.has("high-key") && c.softChroma,
    say: () => "It stays pale and soft from end to end.",
    echoes: ["pastel"],
  },
  {
    id: "pale",
    slot: "tone",
    prevalence: 0.0058,
    when: (c) => c.has("pastel") && !c.has("high-key"),
    say: () => "The colors are pale.",
    echoes: ["pastel"],
  },
  {
    id: "bright-strong",
    slot: "tone",
    prevalence: 0.0773,
    when: (c) =>
      useOf("brilliant") === "prose" && isBrilliant(c.f) && c.evenSpread,
    say: () => "The colors are light and strong at the same time.",
  },
  {
    id: "neon",
    slot: "tone",
    prevalence: 0.0934,
    when: (c) => c.has("neon"),
    say: () => "Its strongest colors are bright enough to look neon.",
    echoes: ["neon"],
  },
  {
    id: "rich",
    slot: "tone",
    prevalence: 0.1223,
    when: (c) => useOf("jewel") === "prose" && isJewel(c.f),
    say: () => "The colors are deep and intense.",
  },
  {
    id: "dark-strong",
    slot: "tone",
    prevalence: 0.0369,
    when: (c) => useOf("deep") === "prose" && isDeep(c.f) && c.evenSpread,
    say: () => "The colors are dark and strong.",
    echoes: ["dark"],
  },
  {
    id: "dark-even",
    slot: "tone",
    prevalence: 0.0358,
    when: (c) => c.has("low-key") && !isDeep(c.f),
    say: () => "The colors are dark and change little.",
    echoes: ["dark"],
    conflicts: ["full-range"],
  },
  {
    id: "dark",
    slot: "tone",
    prevalence: 0.0404,
    when: (c) => c.has("dark") && !isDeep(c.f) && !c.has("low-key"),
    say: () => "The colors are mostly dark.",
    echoes: ["dark"],
  },
  {
    id: "earthy",
    slot: "tone",
    prevalence: 0.1119,
    when: (c) => c.has("earthy"),
    say: () => "The colors are muted and earthy.",
    echoes: ["earthy", "autumn"],
  },
  {
    id: "muted",
    slot: "tone",
    prevalence: 0.0657,
    when: (c) => c.has("muted") && !c.has("earthy"),
    say: () => "The colors are soft and muted.",
    echoes: ["muted"],
  },
  {
    id: "strong",
    slot: "tone",
    prevalence: 0.0323,
    when: (c) =>
      c.has("vivid") && !c.has("neon") && !isBrilliant(c.f) && !isJewel(c.f),
    say: () => "The colors are strong and clear.",
  },
  {
    // "stay" is a claim about every stop, so this takes the KEY test (level AND
    // spread) rather than the mean alone. It also yields to `neon`, the way the
    // registry's `implies` lets a specific word shadow a general one: a hot
    // magenta to pale cyan sweep is light by the numbers (every stop above
    // L 0.67) and what anyone would actually say about it is that the magenta
    // is neon.
    id: "light",
    slot: "tone",
    prevalence: 0.0473,
    when: (c) =>
      c.has("light") &&
      c.has("high-key") &&
      !c.has("pastel") &&
      !c.has("neon") &&
      !isBrilliant(c.f),
    say: () => "The colors stay light.",
  },
  {
    // Itten's contrast of saturation: pure color beside near-gray, in the two
    // words a designer would use for it.
    id: "color-beside-gray",
    slot: "tone",
    prevalence: 0.1061,
    when: (c) => useOf("saturation-contrast") === "prose" && saturationContrast(c.f),
    say: () => "Strong color sits next to almost colorless areas.",
  },
  {
    // Itten's cold-warm contrast: both poles present at once, not a drift.
    id: "warm-and-cool",
    slot: "tone",
    prevalence: 0.2353,
    when: (c) => useOf("warm-cool-contrast") === "prose" && warmCoolContrast(c.f),
    say: () => "It holds warm and cool colors at the same time.",
    conflicts: ["warming", "cooling"],
  },
  {
    // The floor of the tone slot: warm and cool are true of 46% and 36% of the
    // corpus, which is exactly why they sit last and only speak when nothing
    // sharper is true (the registry retires both from the NAME at the same
    // 2-bit line). They also stay quiet whenever the palette has a temperature
    // JOURNEY: "the colors are cool, and it grows cooler" is one fact said
    // twice, and the journey is the better half of it. That gate is what drops
    // them from 46%/36% to the rates below.
    id: "warm",
    slot: "tone",
    prevalence: 0.1096,
    when: (c) => c.has("warm") && c.journey === null,
    say: () => "The colors are warm.",
    echoes: ["sunset", "autumn"],
  },
  {
    id: "cool",
    slot: "tone",
    prevalence: 0.105,
    when: (c) => c.has("cool") && c.journey === null,
    say: () => "The colors are cool.",
    echoes: ["ocean"],
  },

  // --- form: what shape the color takes -----------------------------------
  //
  // Dense-sample facts only (structure, the hue chain, the coefficients), so
  // every row here is byte-identical at any step count. The series rows state a
  // SET fact ("one blue lightened with white") rather than a direction, so they
  // never argue with a motion sentence about which way the ramp runs.
  {
    id: "tints-and-shades",
    slot: "form",
    prevalence: 0,
    when: (c) => c.series?.kind === "tints and shades",
    say: (c) => `It is a single ${c.series!.base}, both lightened and darkened.`,
  },
  {
    id: "tints",
    slot: "form",
    prevalence: 0.0173,
    when: (c) => c.series?.kind === "tints",
    say: (c) => `It is a single ${c.series!.base} lightened with white.`,
  },
  {
    id: "shades",
    slot: "form",
    prevalence: 0.0012,
    when: (c) => c.series?.kind === "shades",
    say: (c) => `It is a single ${c.series!.base} darkened with black.`,
  },
  {
    id: "tones",
    slot: "form",
    prevalence: 0.0173,
    when: (c) => c.series?.kind === "tones",
    say: (c) => `It is a single ${c.series!.base} softened with gray.`,
  },
  {
    id: "one-color",
    slot: "form",
    prevalence: 0.1165,
    when: (c) => c.structure === "monochrome" && !c.series,
    say: (c) =>
      `It holds one ${familyWord(c.f.meanHue)} and changes only how light it is.`,
  },
  {
    // Ombré over an analogous span: the series rows own the monochrome case,
    // and their SET wording cannot carry a fade, so this one keeps the journey.
    id: "fade",
    slot: "form",
    prevalence: 0.1165,
    when: (c) =>
      useOf("ombre") === "prose" &&
      isOmbre(c.f, c.structure) &&
      c.structure === "analogous",
    say: (c) =>
      c.f.lightnessDelta > 0
        ? `The ${familyWord(c.f.meanHue)} fades from dark to light.`
        : `The ${familyWord(c.f.meanHue)} fades from light to dark.`,
    conflicts: ["brightens", "darkens", "full-range"],
  },
  {
    id: "two-colors",
    slot: "form",
    prevalence: 0.0531,
    when: (c) => c.structure === "duotone",
    say: () => "It uses two colors and skips everything between them.",
  },
  {
    id: "opposite-colors",
    slot: "form",
    prevalence: 0.0542,
    when: (c) => c.structure === "complementary",
    say: () => "Its two colors sit on opposite sides of the color wheel.",
  },
  {
    id: "whole-wheel",
    slot: "form",
    prevalence: 0.0242,
    when: (c) => c.has("full-wheel"),
    say: () => "It travels the whole color wheel.",
  },
  {
    id: "rainbow",
    slot: "form",
    prevalence: 0.1153,
    when: (c) => c.structure === "rainbow" && !c.has("full-wheel"),
    say: () => "It runs through many colors, like a rainbow.",
    echoes: ["rainbow"],
  },
  {
    // equalC is the exact licence: equal frequencies mean the whole palette
    // repeats with period 1/c. Without it the RGB path is a non-repeating
    // Lissajous and nothing comes back.
    id: "repeats",
    slot: "form",
    prevalence: 0.0012,
    when: (c) => c.f.equalC && c.meanCycles >= 1.5,
    say: () => "The same colors return more than once.",
  },
  {
    id: "back-and-forth",
    slot: "form",
    prevalence: 0.0588,
    when: (c) => c.has("hue-wandering"),
    say: () => "The colors move back and forth instead of forward.",
  },
  {
    id: "neighbors",
    slot: "form",
    prevalence: 0.2399,
    when: (c) =>
      c.structure === "analogous" &&
      c.f.firstHue !== null &&
      c.f.lastHue !== null &&
      familyWord(c.f.firstHue) !== familyWord(c.f.lastHue),
    say: (c) =>
      `It moves from ${familyWord(c.f.firstHue!)} into ${familyWord(c.f.lastHue!)} and stays there.`,
  },
  {
    id: "one-family",
    slot: "form",
    prevalence: 0.0404,
    when: (c) =>
      c.structure === "analogous" &&
      (c.f.firstHue === null ||
        c.f.lastHue === null ||
        familyWord(c.f.firstHue) === familyWord(c.f.lastHue)),
    say: (c) => `The colors stay inside one range of ${familyWord(c.f.meanHue)}.`,
  },
  {
    id: "groups",
    slot: "form",
    prevalence: 0.0254,
    when: (c) => c.structure === "multicolor" && c.f.hueClusters >= 2,
    say: () => "It jumps between separate groups of color.",
  },
  {
    id: "several-colors",
    slot: "form",
    prevalence: 0.2734,
    when: (c) => c.structure === "multicolor" && c.f.hueClusters < 2,
    say: () => "It passes through several colors between its ends.",
  },

  // --- motion: how it moves ------------------------------------------------
  {
    // The clamp pins all three channels at once for a tenth of the run or more:
    // a visible flat black block, not a technical artifact.
    id: "black-block",
    slot: "motion",
    prevalence: 0.0242,
    when: (c) => c.has("pure-black-plateau"),
    say: () => "Part of it is solid black.",
  },
  {
    // Both ends inside their value bands, not merely a wide range: keyed to the
    // range alone this called a stop at L 0.74 "near white".
    id: "full-range",
    slot: "motion",
    prevalence: 0.03,
    when: (c) =>
      c.f.lightnessRange > T.HIGH_CONTRAST_RANGE &&
      Math.min(...c.stopL) < NEAR_BLACK_L &&
      Math.max(...c.stopL) > NEAR_WHITE_L,
    say: () => "It uses the full range from dark to light.",
  },
  {
    id: "bright-middle",
    slot: "motion",
    prevalence: 0.128,
    when: (c) => c.has("bright-middle"),
    say: () => "It is brightest in the middle and darker at both ends.",
  },
  {
    id: "dark-middle",
    slot: "motion",
    prevalence: 0.075,
    when: (c) => c.has("dark-middle"),
    say: () => "It is darkest in the middle and lighter at both ends.",
  },
  {
    id: "wavy",
    slot: "motion",
    prevalence: 0.0946,
    when: (c) => c.f.turns >= 2,
    say: () => "The brightness changes direction more than once.",
  },
  {
    // Hue moving with no lightness edge to separate it: the classic vibrating
    // pair, stated as what you see rather than as what it is called.
    id: "flat-brightness",
    slot: "motion",
    prevalence: 0.0577,
    when: (c) => c.has("iso-luminant"),
    say: () => "The colors change while the brightness stays the same.",
  },
  {
    id: "steady",
    slot: "motion",
    prevalence: 0.0507,
    when: (c) => c.has("low-contrast") && !c.has("iso-luminant"),
    say: () => "The brightness barely changes from end to end.",
  },
  {
    // The registry's brightening/darkening tags guard on LOW_CONTRAST_RANGE
    // (0.12), the noise floor: enough to say the ramp has a direction at all.
    // A sentence that tells a reader the palette grows lighter should need more
    // than a measurable change, so these two add VISIBLE_MOVEMENT on top. It
    // drops 50 of 298 brightening and 41 of 156 darkening fixture palettes,
    // where the movement is real and not what anyone would remark on.
    id: "brightens",
    slot: "motion",
    prevalence: 0.286,
    when: (c) => c.has("brightening") && c.f.denseLightnessRange >= VISIBLE_MOVEMENT,
    say: () => "It becomes lighter from start to end.",
  },
  {
    id: "darkens",
    slot: "motion",
    prevalence: 0.1326,
    when: (c) => c.has("darkening") && c.f.denseLightnessRange >= VISIBLE_MOVEMENT,
    say: () => "It becomes darker from start to end.",
  },
  {
    // Temperature JOURNEY comes from the stored palette-tags formula, never a
    // serve-time recompute: the Vectorize index carries that value.
    id: "warming",
    slot: "motion",
    prevalence: 0.3483,
    when: (c) => c.journey === "warming",
    say: () => "It becomes warmer as it moves.",
  },
  {
    id: "cooling",
    slot: "motion",
    prevalence: 0.3633,
    when: (c) => c.journey === "cooling",
    say: () => "It becomes cooler as it moves.",
  },

  // --- use: the one sentence that answers "what do I do with it" ------------
  {
    id: "light-background",
    slot: "use",
    prevalence: 0.0854,
    when: (c) => c.has("high-key") && c.softChroma && c.darkInkReads,
    say: () => "It works as a light background under dark text.",
  },
  {
    id: "dark-background",
    slot: "use",
    prevalence: 0.0554,
    when: (c) =>
      (c.has("dark") || c.has("low-key")) &&
      c.f.lightnessRange < 0.3 &&
      c.lightInkReads,
    say: () => "It works as a dark background behind light text.",
  },
  {
    id: "text-both-ends",
    slot: "use",
    prevalence: 0.5225,
    when: (c) => c.darkInkReads && c.lightInkReads && c.f.lightnessRange > 0.3,
    say: () => "Dark text is readable on its light end, light text on its dark end.",
  },
  {
    // Not for a solid palette: its ends match because there is only one color,
    // and saying so reads as a joke rather than as a fact about a conic render.
    id: "loops",
    slot: "use",
    prevalence: 0.0450,
    when: (c) => c.has("seamless") && !c.solid,
    say: () => "Its two ends match, so it loops with no visible break.",
  },
];

export { IMPRESSIONS };

/**
 * Reading order, once the ranking has chosen. Selection is by information;
 * SAYING wants grammar, the same split palette-name.ts makes between
 * selectModifiers (rank) and SLOT (word order): what it is like, then what
 * shape it takes, then how it moves, then what it is for.
 */
const READING_ORDER: Record<ImpressionSlot, number> = {
  tone: 0,
  form: 1,
  motion: 2,
  use: 3,
};

/**
 * How many impressions a description may spend. Two.
 *
 * The identity sentence is demand-bearing and always present, the view sentence
 * closes the page variant, and everything in between is the character of the
 * palette: at two sentences the paragraph reads as a description and at four it
 * reads as a report. D20's budget is 2 to 4 sentences and roughly 150 to 400
 * characters. Measured over the fixture: the body (identity plus impressions)
 * runs p0 132, p50 188, p95 222, max 253, and the page paragraph, which adds the
 * view sentence, runs p0 237, p50 293, p95 327, max 358. 861 of 867 palettes
 * spend both sentences; 6 are plain enough to have one true thing worth saying,
 * which is the correct outcome and not a failure.
 */
const BUDGET = 2;

/**
 * Choose the impressions worth saying, best first.
 *
 * Greedy on information under a slot constraint, which is selectModifiers'
 * shape exactly. Two extra rules the sentence layer needs and the name does
 * not: `echoes` drops an impression the NAME already said (the description's
 * budget is too small to repeat the heading), and `conflicts` drops one that
 * would argue with a sentence already chosen. If the echo veto silences
 * everything, it is lifted rather than shipping a bare identity sentence —
 * saying the name twice beats saying nothing.
 */
function chooseImpressions(c: Ctx): Impression[] {
  const isEcho = (i: Impression) => (i.echoes?.some((w) => echoed(c.phrase, w)) ? 1 : 0);
  // A solid palette has no journey, no shape and no second color: the identity
  // sentence states the degenerate case in full, and every other slot would be
  // describing a gradient that is not there ("nearly gray, with very little
  // color in it" on a pure white field). Only the USE slot survives, because a
  // single flat color is the most background-like palette there is. The rule
  // has to bind here rather than on the chosen pair, or the budget fills with
  // sentences that are then thrown away and the palette says nothing at all.
  const eligible = (i: Impression) => i.when(c) && (!c.solid || i.slot === "use");
  const fired = IMPRESSIONS.filter(eligible).sort((a, b) => {
    // Echoes are DEMOTED, not removed: a palette whose only other true fact is
    // "the colors are cool" is better served by repeating the name's word than
    // by saying nothing. Measured over the fixture: 300 echoed candidates fired,
    // 2 were spoken anyway (99.3% silenced), and those two had nothing else
    // competing for the slot.
    const e = isEcho(a) - isEcho(b);
    if (e !== 0) return e;
    const d = impressionScore(b) - impressionScore(a);
    // Ties break on id so the order is total and deterministic; no two rows
    // currently share a prevalence, but a re-measure could make them.
    return d !== 0 ? d : a.id < b.id ? -1 : 1;
  });

  const chosen: Impression[] = [];
  const slots = new Set<ImpressionSlot>();
  for (const imp of fired) {
    if (chosen.length >= BUDGET) break;
    if (slots.has(imp.slot)) continue;
    if (
      chosen.some(
        (other) =>
          other.conflicts?.includes(imp.id) || imp.conflicts?.includes(other.id),
      )
    )
      continue;
    chosen.push(imp);
    slots.add(imp.slot);
  }
  return chosen.sort((a, b) => READING_ORDER[a.slot] - READING_ORDER[b.slot]);
}

/** Whole-word test against the name's modifier phrase ("pastel duotone"). */
const echoed = (phrase: string, word: string) =>
  ` ${phrase.toLowerCase()} `.includes(` ${word} `);

// =============================================================================
// Assembly
// =============================================================================

/** Everything the impression predicates read, derived once per call. */
function buildCtx(
  colors: readonly string[],
  f: PaletteFeatures,
  named: NamedPalette,
  baseTags: readonly string[] | undefined,
): Ctx {
  const structure = classifyStructure(f);
  const tags = modifierTags(f);
  const has = (w: string) => tags.includes(w);
  const solid = has("solid");
  const luminances = colors.map(relativeLuminance);
  return {
    f,
    structure,
    has,
    colors,
    stopL: colors.map((hex) => hexToOkLch(hex).L),
    solid,
    // "soft" is a chroma claim (a pale passage is a LOW-chroma one) that the
    // high-key test never makes — it measures level and spread only — so soft
    // language carries its own gate: under the pastel bound with no neon peak.
    // One sentence calling a palette "pale and soft" while it holds a neon stop
    // is the failure this prevents; the slot rule prevents the two-sentence
    // version of it.
    softChroma: f.meanChroma < T.PASTEL_CHROMA && f.maxChroma < T.NEON_CHROMA,
    evenSpread: f.lightnessRange < EVEN_SPREAD,
    journey: baseTags?.includes("warming")
      ? "warming"
      : baseTags?.includes("cooling")
        ? "cooling"
        : null,
    series: !solid && structure === "monochrome" ? seriesReading(f, colors) : null,
    // The description's own phrase, so an echo test sees the word the reader
    // will see (the identity sentence renders plainPhrase, not the heading).
    phrase: plainPhrase(named.modifierPhrase),
    darkInkReads: Math.max(...luminances) >= DARK_INK_LUMINANCE,
    lightInkReads: Math.min(...luminances) <= LIGHT_INK_LUMINANCE,
    meanCycles: (f.channelCycles[0] + f.channelCycles[1] + f.channelCycles[2]) / 3,
  };
}

/**
 * One boolean per impression: whether the palette LICENSES it, before the
 * budget, the slots and the vetoes decide which two are actually spoken.
 *
 * The harness surface, and the reason the prevalences in the table can be a
 * contract rather than a claim: palette-prose.test.js walks the 867-seed
 * fixture through this and fails the build when a measured rate drifts from
 * the recorded one, exactly as palette-name.test.js pins the registry.
 */
export function impressionFires(
  coeffs: CosineCoeffs,
  hexColors: readonly string[],
  options: ProseOptions = {},
): Record<string, boolean> {
  const opts = withBaseTags(coeffs, options);
  const colors = hexColors.length >= 2 ? [...hexColors] : fallbackStops(coeffs);
  const named =
    opts.named ?? describePaletteName(coeffs, colors, { features: opts.features });
  const ctx = buildCtx(colors, opts.features ?? named.features, named, opts.baseTags);
  return Object.fromEntries(IMPRESSIONS.map((i) => [i.id, i.when(ctx)]));
}

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
  const ctx = buildCtx(colors, f, named, options.baseTags);
  const { structure, solid } = ctx;
  const names = named.colorNames;

  // ---------------------------------------------------------------------------
  // The identity sentence. The demand-bearing one, and the shape the owner
  // approved: modifier phrase, the fixed noun phrase "gradient color palette",
  // the color names in ramp order, and (paragraph variant) the two end hexes.
  // The end stops render identically at every step count, so the hexes are
  // step-invariant; interior names legitimately track steps.
  // ---------------------------------------------------------------------------
  const phrase = plainPhrase(named.modifierPhrase);
  const opener = `${article(phrase || "gradient")} ${phrase ? `${phrase} ` : ""}gradient color palette`;
  const hexOf = (hex: string, withHex: boolean) => (withHex ? ` (${hex})` : "");
  // The last listed name is not always the last stop: getUniqueColorNames
  // keeps ramp order but dedupes, so an A→B→A ramp lists [A, B] while the ramp
  // ends back on A. The end hex may only be pinned to a name that actually
  // names the end stop.
  const endName = getUniqueColorNames([colors[colors.length - 1]!], { max: 1 })[0] ?? "";

  const identityFor = (withHex: boolean): string => {
    const first = `${names[0] ?? "black"}${hexOf(colors[0]!, withHex)}`;
    const lastIdx = names.length - 1;
    const endHex = endName === names[lastIdx] ? hexOf(colors[colors.length - 1]!, withHex) : "";
    if (solid)
      return `${opener} that renders as one solid color: ${first} at every stop.`;
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
        ? `${opener} built on two opposite colors: ${first} against ${second}.`
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

  const chosen = chooseImpressions(ctx);

  // The view sentence: the ONE place steps, style and angle may appear, and the
  // carrier of the "hex codes / CSS" demand tokens. Page surfaces only.
  const viewSentence = view
    ? `Shown here as a ${styleLabel(view.style)} in ${view.steps} ${
        view.steps === 1 ? "step" : "steps"
      } at ${deg(view.angle)}°, with the hex codes, CSS, and SVG ready to copy below.`
    : null;

  // Embedding-tail vocabulary: true facts whose measured rate fell below the
  // 2% speaking floor, plus the ones whose only phrasing is banned jargon.
  // They ride the Tags line only — never a sentence.
  const embedTailTags: string[] = [];
  if (!solid) {
    if (useOf("deep") !== "silent" && isDeep(f)) embedTailTags.push("deep");
    if (useOf("jewel") !== "silent" && isJewel(f)) embedTailTags.push("jewel");
    if (useOf("sepia") !== "silent" && isSepia(f, structure)) embedTailTags.push("sepia");
    if (useOf("ombre") !== "silent" && isOmbre(f, structure)) embedTailTags.push("ombre");
    if (useOf("brilliant") !== "silent" && isBrilliant(f)) embedTailTags.push("brilliant");
    const lean = useOf("warm-gray") !== "silent" ? grayLean(f) : null;
    if (lean) embedTailTags.push(`${lean}-gray`);
    const axis = useOf("opponent-axis") !== "silent" ? opponentAxis(f) : null;
    if (axis) embedTailTags.push(`${axis}-axis`);
    if (useOf("warm-cool-contrast") !== "silent" && warmCoolContrast(f))
      embedTailTags.push("warm-cool-contrast");
    if (useOf("saturation-contrast") !== "silent" && saturationContrast(f))
      embedTailTags.push("saturation-contrast");
  }

  return {
    structure,
    identityWithHex: identityFor(true),
    identity: identityFor(false),
    impressions: chosen.map((i) => i.id),
    sentences: chosen.map((i) => i.say(ctx)),
    view: viewSentence,
    solid,
    embedTailTags,
  };
}

// =============================================================================
// Public surface
// =============================================================================

/**
 * The prose parts, individually addressable — exported for the test harness
 * (step-invariance asserts on `structure` and the form-slot impression, the
 * two contracted to be byte-identical at every step count) and for any surface
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
 * Ceiling for the visible paragraph. Nothing like the old 800: with a two
 * impression budget the paragraph is short by construction, and this only
 * bites where a long name plus two long impressions overrun. It trims the
 * LAST impression (they are ordered for reading, but the ranking put the more
 * informative one first within a slot pair, and dropping the tail keeps the
 * sentence that characterises the palette).
 * Measured over the fixture: p50 293, p95 327, max 358 before the ladder,
 * which is why it never fires today. It exists so a corpus change cannot
 * quietly reintroduce the wall of text this rewrite removed.
 */
const PARAGRAPH_MAX = 520;

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
  let sentences = parts.sentences;
  const page = () =>
    [parts.identityWithHex, ...sentences, ...(parts.view ? [parts.view] : [])].join(" ");
  while (page().length > PARAGRAPH_MAX && sentences.length > 1)
    sentences = sentences.slice(0, -1);
  const paragraph = page();

  // Meta description: identity + action clause, ladder-trimmed exactly like
  // the title ladder — drop the action clause first, then trailing color
  // names (by re-deriving the identity at a smaller name budget, so the
  // shortened sentence is still a true, grammatical identity rather than a cut).
  const identity = parts.identity;
  let metaDescription = `${identity} ${META_ACTION}`;
  if (metaDescription.length > META_MAX) metaDescription = identity;
  for (let max = named.colorNames.length - 1; metaDescription.length > META_MAX && max >= 1; max--) {
    const shorter = describePaletteName(coeffs, colors, { features: f, maxNames: max });
    metaDescription = buildParts(coeffs, colors, view, { ...opts, named: shorter }).identity;
  }

  return {
    identity,
    paragraph,
    metaDescription,
    embedText: composeEmbedText(parts, f, colors, opts.baseTags),
  };
}

/**
 * The canonical embedding composition (research-prose §4): prose body first
 * because queries are natural language, then a Tags line for single-word
 * filters, then a Colors line for the color axis. No view sentence — the index
 * describes the seed-invariant palette — and no hex: the query side already
 * strips hex to names, so hex here would be pure asymmetric noise.
 *
 * D20.7: the body is the SAME human text the page shows. The analysis
 * vocabulary the retrieval side needs lives on the Tags line, which is exactly
 * where it belongs; jargon is never pushed back into the sentences to help
 * search. Mean-pooled embeddings dilute with length, so the shorter body is an
 * improvement for retrieval as well as for readers.
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
  return composeEmbedText(buildParts(coeffs, colors, null, opts), f, colors, opts.baseTags);
}

function composeEmbedText(
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
    parts.identity,
    ...parts.sentences,
    `Tags: ${tagWords.join(", ")}.`,
    `Colors: ${names.join(", ")}.`,
  ].join(" ");
}

// =============================================================================
// Related searches — the chips under the description (D13, D17, D18)
// =============================================================================

/**
 * querySlug for related-search labels, restated locally so the edit island
 * can link the chips. The island cannot import ./semantic-search — its search
 * client is typed against the Worker's `Env`, which the islands typecheck
 * (no workers-types) does not know — so the slug rule lives here for the
 * LABEL vocabulary only. querySlug's other branch (a decodable seed passes
 * through case-sensitively) can never apply: no corpus name, spoken word,
 * family anchor or compound of two spoken words decodes as a seed, and
 * palette-prose.test.js asserts parity with querySlug over every label the
 * bounded vocabularies can produce.
 */
export function relatedSearchSlug(label: string): string {
  return encodeURIComponent(label.trim().toLowerCase().replace(/\s+/g, "-"));
}

/**
 * The universal color words, demoted as CHIP labels regardless of which stop
 * they name (D18.2). They are fine in the name and in the prose — a black
 * stop is black — but as a search suggestion "white" is the least informative
 * label the corpus can produce: huge shares of it pass through white and
 * black, so the chip tells a visitor nothing about THIS palette.
 */
const UNIVERSAL_NAMES = new Set(["white", "black", "gray", "grey"]);

/**
 * Chip ordering by SLOT, so a compound reads as English (D17): tone before
 * family before structure, the same order palette-name.ts sorts a name's
 * adjectives into. "pastel rainbow", never "rainbow pastel".
 */
const COMPOUND_SLOT: Record<string, number> = {
  temperature: 0,
  tone: 1,
  family: 2,
  structure: 3,
};

/**
 * Ranked query labels derived from the description system's TRUE facts, for
 * the chip row under the paragraph. Pure and deterministic so the server
 * render and the island can never disagree.
 *
 * RANKING (D18, after the owner's "white isnt a good suggested tag for this
 * palette. this system needs work"): color names come first because they are
 * the most specific labels a palette has, but ordered by the CHROMA of the
 * stop each one names, not by ramp position. Identity lives in the chromatic
 * stops: on the reported palette (white → warm gray → peach) ramp order put
 * "white" first, and an achromatic endpoint describes the edge of the run
 * rather than the palette. Two demotions follow from the same argument: a name
 * whose stop is achromatic AND extreme in lightness (C < CHROMA_FLOOR with
 * L > 0.9 or L < 0.1), and the four bare universals above, drop to last resort
 * and appear only if fewer than two better labels exist. A grayscale palette
 * therefore still chips — "grayscale" and "monochrome" are exactly right there
 * — and falls back to gray names rather than rendering an empty row.
 *
 * Then COMPOUNDS (D17), then single modifier words by descriptorScore, then
 * family words as backfill below three labels.
 *
 * CRAWL SAFETY: every label comes from a bounded vocabulary — the color-name
 * corpus, the registry's spoken words, the eight family anchors, or a pair of
 * spoken words under the slot grammar — never free text, so the crawl frontier
 * stays finite. Color-name queries are indexable by design (indexableQuery way
 * #2); modifier and compound pages are score-gated to noindex,follow until
 * their corpus is good enough, which still renders and edge-caches. After the
 * pending reindex the embed text literally contains both words of a compound,
 * so exactly the compound pages with genuinely matching corpora clear
 * PUBLISHABLE_SCORE and become indexable, self-selecting on quality.
 */
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

  // Which stop does each name name? getUniqueColorNames returns names without
  // their stops, so the link is recovered by naming the stops again with the
  // same corpus function — hexToColorName and getUniqueColorNames both go
  // through nearestNamed, so the first stop answering to a label is exactly the
  // stop that produced it, and ramp order is the tie-break the ranking wants.
  const ranked = named.colorNames
    .map((name, i) => {
      const hex = named.stops.find((h) => hexToColorName(h) === name);
      const lch = hex ? hexToOkLch(hex) : null;
      return { name, i, C: lch?.C ?? 0, L: lch?.L ?? 0.5 };
    })
    .sort((a, b) => b.C - a.C || a.i - b.i);

  const demoted = (s: { name: string; C: number; L: number }) =>
    UNIVERSAL_NAMES.has(s.name.toLowerCase()) ||
    (s.C < T.CHROMA_FLOOR && (s.L > 0.9 || s.L < 0.1));

  for (const s of ranked) if (!demoted(s)) add(s.name);

  // Compounds outrank their parts: two words are strictly more specific than
  // either, and "pastel rainbow" is a query a person actually types.
  const fired = DESCRIPTORS.filter((d) => d.spoken && tags.includes(d.word)).sort(
    (a, b) => descriptorScore(b) - descriptorScore(a),
  );
  for (const label of compoundLabels(fired)) add(label);
  for (const d of fired) add(spokenWord(d));

  if (labels.length < 3) {
    const structure = classifyStructure(features);
    // Same D18 argument as the color names: the family a palette belongs to is
    // the family of its most COLORED stop, not of whichever end happened to
    // come first. On a white → cream → pink → lavender ramp the ramp-order
    // reading backfilled "yellow" (the cream), which describes the palette
    // least; by chroma it backfills "violet".
    const strongest = ranked.length
      ? named.stops.filter(stopHasHue).sort((a, b) => hexToOkLch(b).C - hexToOkLch(a).C)[0]
      : undefined;
    const familyCandidates =
      structure === "grayscale"
        ? []
        : structure === "monochrome"
          ? [features.meanHue]
          : structure === "duotone" || structure === "complementary"
            ? features.clusterHues
            : [
                ...(strongest ? [hexToOkLch(strongest).h] : []),
                features.firstHue,
                features.lastHue,
              ].filter((h): h is number => h !== null);
    for (const h of familyCandidates) {
      if (labels.length >= 3) break;
      add(familyWord(h));
    }
  }

  // Last resort: the demoted names, so a palette whose only vocabulary is
  // "white and black" still gets a row rather than an empty nav.
  for (const s of ranked) {
    if (labels.length >= 2) break;
    add(s.name);
  }
  return labels;
}

/**
 * At most two compound labels, from spoken facts that CO-FIRE (D17).
 *
 * The grammar is bounded by construction: one word from tone (or temperature),
 * one from family or structure, joined in SLOT order, never three words, never
 * a color name, never free text. So the compound space is a subset of
 * (spoken words)² and the crawl frontier stays finite; measured over the 867
 * fixture seeds it produces 34 distinct labels over 217 of the 867 chip rows.
 *
 * CONTRADICTED_BY (palette-name.ts) excludes the pairs that would read as a
 * contradiction, the same table that stops the NAME saying them next to each
 * other. Temperature compounds ("warm sunset") are in the grammar and never
 * fire today: `warm` and `cool` are spoken:false in the registry, and D2 keeps
 * the short-name system's flags frozen, so the branch is inert until a
 * re-measure promotes them.
 */
function compoundLabels(fired: readonly Descriptor[]): string[] {
  const out: { label: string; score: number }[] = [];
  for (const a of fired) {
    for (const b of fired) {
      if (a === b) continue;
      const sa = COMPOUND_SLOT[a.axis];
      const sb = COMPOUND_SLOT[b.axis];
      if (sa === undefined || sb === undefined || sa >= sb) continue;
      // tone × structure, tone × family, temperature × family only.
      const pair = `${a.axis}-${b.axis}`;
      if (
        pair !== "tone-structure" &&
        pair !== "tone-family" &&
        pair !== "temperature-family"
      )
        continue;
      const wa = spokenWord(a);
      const wb = spokenWord(b);
      if (
        CONTRADICTED_BY[a.word]?.includes(b.word) ||
        CONTRADICTED_BY[b.word]?.includes(a.word) ||
        CONTRADICTED_BY[wa]?.includes(wb) ||
        CONTRADICTED_BY[wb]?.includes(wa)
      )
        continue;
      out.push({ label: `${wa} ${wb}`, score: descriptorScore(a) + descriptorScore(b) });
    }
  }
  return out
    .sort((x, y) => y.score - x.score || (x.label < y.label ? -1 : 1))
    .slice(0, 2)
    .map((x) => x.label);
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
   * on the view sentence); embedText remains the seed-invariant composition.
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
