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
// changed into a DIFFERENT form sentence 6 times in 2,601 re-renders, every one
// of them inside the tint/shade/tone/one-color family, where the detector reads
// the rendered stops on purpose. Otherwise it only appeared or vanished as the
// budget filled (35 events). The tone and motion rows read rendered means,
// exactly as the NAME does, so the full two-sentence selection is identical at
// all four step counts for 77.5% of the fixture. Color names legitimately track steps (documented behavior of the name
// system); the view sentence is the only one allowed to mention steps, style or
// angle, and it never enters embedText.

import {
  colorFamilies,
  colorFamily,
  DEFAULT_MIN_SEPARATION,
  getUniqueColorNames,
  hexToColorName,
  hexToOkLch,
  hexToRgb,
  isLabelName,
  NAMED_COLORS,
  oklabDistance,
  relativeLuminance,
  relativeSaturation,
  rgbToOklab,
  type NameVeto,
  type Oklab,
  type OkLch,
} from "@repo/data-ops/color-utils";
import {
  classifyStructure,
  DESCRIPTORS,
  descriptorScore,
  hueBandShare,
  MIN_BITS_TO_SPEAK,
  modifierTags,
  spokenWord,
  stopHasHue,
  THRESHOLDS,
  type Descriptor,
  type PaletteFeatures,
} from "@repo/data-ops/gradient-gen/palette-modifiers";
import {
  characteristicCtx,
  characteristicScore,
  characteristicsOf,
  chipCharacteristics,
  COMPOUND_SHADOWS,
  COMPOUND_SUPPORT,
  COMPOUND_SUPPORT_FLOOR,
  FAMILY_TERMS,
  gatedFamily,
  GATED_HUE_NAMES,
  hueNameFits,
  grayLean,
  isBrilliant,
  isDeep,
  isJewel,
  isOmbre,
  isSepia,
  NEAR_BLACK_L,
  NEAR_WHITE_L,
  OMBRE_RANGE,
  opponentAxis,
  saturationContrast,
  seriesReading,
  warmCoolContrast,
  type Characteristic,
  type CharacteristicCtx,
  type SeriesKind,
} from "@repo/data-ops/gradient-gen/palette-characteristics";
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
  LOUDNESS_WORDS,
  styleLabel,
  toneNameVeto,
  type NamedPalette,
} from "./palette-name";

const T = THRESHOLDS;

// The tint/shade/tone tolerances, the ombré distance and the near-black /
// near-white band edges now live beside the characteristic registry that reads
// them (palette-characteristics.ts, D25.1); they are imported above.

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
 * How light the lightest stop may be before "deep" stops being true of the
 * palette rather than of its mean. isJewel's band ceiling (mean L 0.6) plus the
 * room a rendered ramp needs to peak once past it. See the `rich` row.
 */
const JEWEL_STOP_CEILING = 0.7;

/**
 * How dark the darkest stop may be before "light" stops being true of the
 * palette rather than of its mean. The mirror of JEWEL_STOP_CEILING, and it
 * costs nothing on today's corpus (0 of the 19 palettes isBrilliant licenses
 * fall below it) — it is here so a claim about every colour cannot again rest on
 * a mean, which is how "The colors are light and strong at the same time"
 * reached a palette opening on three L 0.64 fire reds. See `bright-strong`.
 */
const BRILLIANT_STOP_FLOOR = 0.65;

/**
 * How far a palette's colourfulness may travel and still count as held.
 *
 * The `one-color` sentence claims a monochrome ramp changes ONLY in lightness,
 * so anything else it changes has to be small. Measured over the 88 fixture
 * palettes that licensed the sentence, the dense saturation range runs p10
 * 0.13, p25 0.28, p50 0.46, p75 0.63: the corpus is full of monochromes that
 * desaturate as they go, and the exclusive claim was false on all of them.
 * 0.35 is a third of the scale, the point where a stop and its neighbour are
 * plainly different in how colourful they are (#fc7b82 at 0.96 into #dc949e at
 * 0.54 measures 0.42 over that pair alone).
 */
const SATURATION_HELD = 0.35;

/**
 * Seam distance a "no visible break" claim may promise. See the `loops` row:
 * the registry's SEAM_TOLERANCE is the conic-render tag, this is what the eye
 * will accept, and 0.02 is about one JND in OkLab.
 */
const LOOP_SEAM = 0.02;

/**
 * Whether a ramp's DIRECTION is the thing a viewer sees, bump included.
 *
 * The shape axis counts turns, not sizes: a ramp that rises 0.08 and then falls
 * 0.58 has one turn and is an `arch`, exactly like a symmetric hill, so the
 * direction tags (which need turns === 0) never fire on it and the description
 * could say nothing about the biggest move in the image. The fix is a ratio,
 * not a new shape: net travel over total travel, at least four fifths. Measured
 * over the 171 fixture palettes with one turn and visible movement, that ratio
 * runs p25 0.21, p50 0.67, p75 0.90, and the 69 palettes above 0.8 are ramps
 * with a wobble in them by eye.
 */
const ARCH_DOMINANT = 0.8;

const rampDominates = (f: PaletteFeatures) =>
  f.denseLightnessRange >= VISIBLE_MOVEMENT &&
  Math.abs(f.lightnessDelta) >= ARCH_DOMINANT * f.denseLightnessRange;

/**
 * Relative saturation at which a palette is holding the gamut ceiling for its
 * whole length. Measured over the fixture, dense mean saturation runs p50 0.72,
 * p75 0.89, p90 0.99: cosine palettes ride the ceiling often, so this is a high
 * bar by necessity. See the `strong` row.
 */
const FULL_SATURATION = 0.95;

/**
 * The warm and cool arcs, as the registry's temperature tests read them. Used
 * by the journey rows to ask whether the run ARRIVES where it claims to be
 * going; `null` (no sample with a usable hue) answers no to both.
 */
const inWarmArc = (h: number | null) => h !== null && (h >= 330 || h < 120);
const inCoolArc = (h: number | null) => h !== null && h >= 150 && h < 300;

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
 * Deliberately NOT the wider name list (gold, teal, sky, chartreuse…): those
 * are anchor + TONE-gate names — sky is a tint region (L > 0.75), gold needs
 * L 0.8–0.92, teal L < 0.60 — and THIS function is chosen by hue alone, so
 * using them here named dark palettes after tints (measured on the live
 * fixture: navy ramps "into sky" at L 0.50, a near-black olive ramp "into
 * gold" at L 0.29). Three of them are back as gates rather than as bands, in
 * `gatedFamily` below: brown, purple and pink are the same hue at a different
 * tone, so they can be tested rather than guessed. The eight words here stay
 * the gate-free vocabulary, and they double as relatedSearches backfill
 * labels, so the list is part of the bounded link vocabulary.
 */
export function familyWord(hue: number): string {
  // colorFamily IS that partition, and it lives in color-utils because the
  // naming corpus needs it too (a name and the colour it names have to agree on
  // which family they are in). One definition, two consumers.
  return colorFamily(hue);
}

/**
 * ...and the tone-gated version of the same question, re-exported.
 *
 * `gatedFamily` moved to the characteristic registry on 2026-08-18 (D25.1)
 * with no change of meaning, for the reason the detectors above it moved: the
 * registry's `brown` / `purple` / `pink` terms and the retrieval filter and
 * this paragraph all have to be asking ONE function which family a stop is in,
 * or a chip and its destination can disagree about a chocolate ramp. It is
 * re-exported here because `tag-search.ts` and two test files import it from
 * this module and its home is an implementation detail of the registry, not of
 * theirs.
 */
export { gatedFamily };

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
 * kept eight of nine in the 2%–60% band and overturned two predictions:
 * BRILLIANT survived at 8.3% (the corpus has more light-and-vivid palettes
 * than the low-chroma p50 suggested; the round-4 QA pass then took it to 2.19%
 * by making its light half mean the registry's LIGHT_LIGHTNESS, which is a
 * seat at the very bottom of the band and is recorded as such) and SEPIA died
 * at 0.9% — brown
 * monochromes narrow enough for the gate are rarer live than on paper — so
 * sepia is the only embedding-tail word left. WARM-GRAY was there too, at
 * 1.96%, until the 2026-08-18 QA round found the reason: the detector carried
 * an absolute chroma ceiling beside its saturation test, which is the same
 * conflation D19 exists to fix. Without it the rate is 3.58% and the word
 * speaks (see grayLean and the `tinted-gray` impression). The round-3 pass then
 * took 3.58% back to 2.88% by adding the concentration guard grayLean was
 * missing, which is still comfortably inside the band.
 */
const MEASURE_FIRST: Record<string, { use: MeasureFirstUse; rate: number }> = {
  deep: { use: "prose", rate: 0.0542 },
  // 0.1223 until QA round 4, when the window became a claim about the STOPS: a
  // ramp dying into pastel lavender and a pair of electric purples were both
  // being carried over the bar by a palette-wide mean (see isJewel). 0.0704
  // until QA round 6 added the floor on the DULLEST stop.
  jewel: { use: "prose", rate: 0.0484 },
  // 0.0104 until QA round 6 pulled the hue window off olive and the lightness
  // ceiling off a pale peach — see isSepia.
  sepia: { use: "embed", rate: 0.0058 },
  ombre: { use: "prose", rate: 0.1811 },
  "warm-gray": { use: "prose", rate: 0.0288 },
  "opponent-axis": { use: "prose", rate: 0.4187 },
  "warm-cool-contrast": { use: "prose", rate: 0.2284 },
  // 0.1061 until 2026-08-18, when the detector stopped reading the dense
  // chroma floor through a rendered-max proxy (see saturationContrast).
  "saturation-contrast": { use: "prose", rate: 0.0461 },
  brilliant: { use: "prose", rate: 0.0219 },
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

/**
 * ...and whether that fact may be SPOKEN as a claim about every colour.
 *
 * Three rows share this: `dark-strong` says it, and `dark-even` and `dark` both
 * yield to it, so the three have to agree on one predicate or a palette can
 * fall between them and say nothing about being dark at all. The per-stop floor
 * is documented on `dark-strong`.
 */
const deepSpeaks = (c: Ctx) =>
  useOf("deep") === "prose" &&
  isDeep(c.f) &&
  c.evenSpread &&
  Math.min(...c.stopL) > NEAR_BLACK_L;

// isBrilliant, grayLean, opponentAxis, warmCoolContrast, saturationContrast
// and seriesReading moved to @repo/data-ops .../palette-characteristics on
// 2026-08-18 (D25.1) and are imported above. They are the SAME closures the
// characteristic registry evaluates, which is the whole point: a chip, this
// paragraph and the tag filter cannot disagree about what a word means if
// there is only one function that decides it.

/**
 * How far apart the two hue anchors must sit before "it moves from X into Y" is
 * a journey rather than a boundary crossing. One family width: the eight anchors
 * partition the wheel, so 360/8 is the distance at which two hues stop being
 * neighbours on one side of a line. See the `neighbors` row for the measurement.
 */
const NEIGHBOR_TRAVEL = 360 / 8;

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
  /**
   * The color names that sentence spent, in ramp order. Usually the name
   * system's list; it also carries the end stop's own name when the two ends
   * were close enough for one name to cover both (see the identity builder).
   */
  colorNames: string[];
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
 * "a", "a and b", "a, b, and c" — a list a translator can carry. Three or more
 * items take commas and one final conjunction; two take the bare conjunction,
 * which is what English does and what every target language has a form for.
 */
const serialList = (items: readonly string[]): string =>
  items.length <= 1
    ? (items[0] ?? "")
    : items.length === 2
      ? `${items[0]} and ${items[1]}`
      : `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;

/**
 * The identity sentence's verb. Two words, both of which survive translation.
 *
 * It used to be four, keyed to the ramp's shape: "easing", "arcing", "weaving",
 * "winding", "circling". Every one of them is an English motion idiom whose
 * dictionary translation means something else — "easing from marine to soft
 * blue" comes back as "relieving" (ES aliviar, FR soulager, DE erleichtern) —
 * and D20.4 makes translatability binding, so a vivid verb loses to a plain one
 * whenever both are true. The shape they encoded is not lost: the motion
 * impressions ("the brightness changes direction more than once") say it in
 * words a translator can carry. What remains distinguishes a ramp that travels
 * the value scale from one that does not, which is the fact a reader can see.
 */
const journeyVerb = (f: PaletteFeatures) =>
  f.lightnessRange >= OMBRE_RANGE ? "sweeping" : "running";

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

/**
 * The four questions a colourist answers about a palette, one sentence each.
 *
 * `use` was the fifth until 2026-08-18 and is retired (D21.1): the owner read
 * the live page and cut every sentence that told a reader what to build with
 * the palette ("Dark text works on its light end…" was the single most common
 * sentence on the site at 42.8%). A palette page describes; it does not advise.
 * The knowledge behind those rows is not lost, it changed jobs (D21.2): the end
 * luminances now choose the depth words in the motion rows ("It opens bright
 * and ends in deep shadow" instead of "It becomes darker from start to end"),
 * and the saturation facts they read became the `intensity` slot, which asks
 * how strong the colour is and where it lives — the one axis the old four
 * sentences could barely reach.
 */
type ImpressionSlot = "tone" | "form" | "wheel" | "motion" | "intensity";

/** Everything an impression may read. One analysis, computed once per call. */
interface Ctx {
  f: PaletteFeatures;
  structure: string;
  has: (word: string) => boolean;
  /** Rendered stops, ramp order. */
  colors: readonly string[];
  /** Their OkLCh lightnesses — the end-band claims read these. */
  stopL: number[];
  /** ...and their chromas, for the rows that claim every colour is loud. */
  stopC: number[];
  solid: boolean;
  /** Low enough chroma that soft/pale language is honest (see below). */
  softChroma: boolean;
  /** Spread small enough that a mean-based tone claim speaks for every stop. */
  evenSpread: boolean;
  /**
   * The stored palette-tags journey value, and the same value once the arrival
   * test has passed. The two are separate because the tone rows defer to the
   * journey ("the colors are cool, and it grows cooler" is one fact said
   * twice), and a journey that cannot be SPOKEN is not a reason for silence:
   * with only `journey` to read, a magenta-to-mauve ramp whose stored tag says
   * warming but whose run ends in violet said nothing at all about itself.
   */
  journey: "warming" | "cooling" | null;
  journeyClaim: "warming" | "cooling" | null;
  series: SeriesKind | null;
  /**
   * What to call the palette's colour: the tone-gated family word of its most
   * chromatic dense sample, or null when nothing in it earns a colour word.
   * Dense, so it is the same at every step count.
   */
  base: string | null;
  /** The same word for the two ends of the hue chain (the journey anchors). */
  firstFamily: string | null;
  lastFamily: string | null;
  /**
   * The ends' plain hue BANDS. Whether the palette changes family is a question
   * about hue, so it is asked here; what to CALL each end is a question about
   * tone, so it is answered by firstFamily/lastFamily. Keeping them apart
   * matters: an ombré runs from a dark end to a light one, and the two ends of
   * one hue routinely take different tone-gated words ("brown" and "orange"),
   * which is not a change of family and must not read as one.
   */
  firstBand: string | null;
  lastBand: string | null;
  /**
   * Whether each end's hue sits confidently inside one band rather than on the
   * line between two (`colorFamilies` returns both neighbours within the edge
   * margin). A "from X into Y" sentence is a categorical claim and may not rest
   * on a hue that is 1.5° past a boundary.
   */
  firstBandFirm: boolean;
  lastBandFirm: boolean;
  /**
   * Circular distance between the two hue anchors, degrees. How far the run
   * actually travelled, as opposed to whether it crossed a band edge.
   */
  endHueSeparation: number;
  /**
   * The color names the identity sentence will show, in the order it will show
   * them, for the echo and restatement vetoes. Built here rather than in the
   * assembly step so a row can ask what the reader is about to read: the
   * complementary form row has to know whether the identity sentence already
   * used its two-opposite-colors template, and the template's condition is the
   * length of this list.
   */
  names: readonly string[];
  /** The name's modifier phrase, for the echo veto. */
  phrase: string;
  /**
   * Whether the two END stops are far enough apart in WCAG relative luminance
   * that one carries dark ink and the other light ink.
   *
   * This pair used to gate the site's most common sentence, the text-pairing
   * advice D21.1 deleted. It survives as a WORD choice (D21.2): "It opens near
   * white and ends in deep shadow" is the strongest thing the motion rows can
   * say about depth, and OkLCh lightness alone is a perceptual scale that says
   * nothing about how much light actually leaves the screen. Requiring both
   * readings to agree is what keeps that wording off a palette whose ends
   * merely sit in the end bands. Fixture: 371 palettes clear the ink test, 26
   * clear the L bands, and 24 clear both.
   */
  endDarkInkReads: boolean;
  endLightInkReads: boolean;
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
  /**
   * The echo veto aimed at the IDENTITY sentence rather than at the name: true
   * when the sentence above has already told the reader this, in which case the
   * row is dropped from the candidate list entirely.
   *
   * Deliberately NOT part of `when`. It is a redundancy rule and not a fact
   * about the palette, so the row's measured prevalence stays the rate at which
   * the sentence is TRUE, which is what its information score has to be built
   * from. Putting it in the gate made `several-colors` a 5.75-bit rarity that
   * outranked every other form row on the palettes where it survived, and since
   * the color-name count legitimately tracks the step count, that changed which
   * form sentence a palette got between 3 and 13 steps (8 flips over the
   * fixture). As a veto on a common row it can only ever remove a sentence.
   */
  restates?: (c: Ctx) => boolean;
  /** Ids this one may not be spoken beside (redundant or contradictory). */
  conflicts?: readonly string[];
  /**
   * The same veto when the redundancy depends on WHICH sentence the row will
   * produce rather than on the row itself.
   *
   * `two-colors` is the case that needed it (2026-08-18, visual QA seed 05).
   * Its gray branch says nothing about value and sits happily beside a shape
   * row; its black and white branches ARE the shape row: "Its two colors fade
   * through black between them. It is darkest in the middle and lighter at
   * both ends." is one fact, printed twice, out of a two-sentence budget. A
   * static conflicts list cannot express that, and widening it to the gray
   * branch would silence a shape the reader can genuinely see.
   */
  conflictsIn?: (c: Ctx) => readonly string[];
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
 * When a neutral stops being a gray and becomes black or white to a reader.
 *
 * Asked of the corpus rather than guessed, because the corpus is the repo's own
 * record of what people call these colors: walking #000000 to #ffffff one step
 * at a time, `hexToColorName` says black up to L 0.085, then almost black,
 * charcoal, gray, silver, light gray, gainsboro at L 0.882, white smoke at
 * L 0.934, then snow and white. So the light end of the gray scale runs a long
 * way past NEAR_WHITE_L (0.87), which is an END-BAND threshold and answers a
 * different question. Using it here called a #dbdcd1 crossing "white" when the
 * corpus, and the image, both say light gray (2026-08-18, visual QA). The white
 * bar therefore sits where the corpus's own gray names run out, and the black
 * bar keeps NEAR_BLACK_L, which is already deep inside the corpus's black and
 * almost-black band (they reach L 0.248).
 */
const CROSSING_WHITE_L = 0.93;

/**
 * Where a duotone's two colors meet and what the meeting point looks like.
 *
 * One reading, two consumers: the `two-colors` row's sentence and its
 * conditional conflict veto. They have to agree about which branch fired or the
 * veto silences the wrong neighbour, so the branch is decided once here rather
 * than written out twice.
 */
function duotoneCrossing(c: Ctx): {
  neutral: "black" | "white" | "gray";
  shape: "jump" | "mid-valley" | "mid-peak" | "split" | "none";
} {
  const neutral =
    c.f.chromaValleyL < NEAR_BLACK_L
      ? "black"
      : c.f.chromaValleyL > CROSSING_WHITE_L
        ? "white"
        : "gray";
  const mid = (t: number) => t > 1 / 3 && t < 2 / 3;
  const shape =
    c.f.chromaticFraction >= 1
      ? "jump"
      : mid(c.f.chromaValleyT)
        ? "mid-valley"
        : mid(c.f.chromaPeakT)
          ? "mid-peak"
          : Math.abs(c.f.chromaPeakT - c.f.chromaValleyT) > 1 / 3
            ? "split"
            : "none";
  return { neutral, shape };
}

/**
 * What to call an END stop's place on the value scale, or null for a midtone.
 *
 * The ladder is the file's existing end-band constants plus the registry's own
 * LIGHT_LIGHTNESS and DARK_LIGHTNESS, so a word here means what the same word
 * means everywhere else in the system. Midtones get no word at all: "It opens
 * mid and ends mid" is a sentence about nothing.
 */
const depthBand = (L: number): string | null =>
  L > NEAR_WHITE_L
    ? "near white"
    : L >= T.LIGHT_LIGHTNESS
      ? "bright"
      : L < NEAR_BLACK_L
        ? "in deep shadow"
        : L < T.DARK_LIGHTNESS
          ? "dark"
          : null;

/**
 * The direction rows' depth wording: where the run opens and where it arrives.
 *
 * This IS the transformation D21.2 ordered. The deleted usage rows read the two
 * end luminances to decide which end takes dark text and which takes light;
 * the same two ends, read the same way, now choose the words the motion
 * sentence uses, and the sentence describes instead of advising. Null when
 * either end is a midtone or both ends land in one band, in which case the row
 * falls back to its plain direction sentence.
 *
 * The extreme pair also has to clear the ink reading. OkLCh lightness is a
 * perceptual scale and says nothing about how much light leaves the screen, so
 * "near white" and "in deep shadow" wait for the WCAG luminances to agree;
 * below that bar the words demote to "bright" and "dark", which the L bands
 * alone can carry. Measured over the fixture: 38 palettes reach an extreme
 * band pair and 38 of them also clear the ink test, so the guard costs nothing
 * today and exists because the two scales genuinely come apart in the editor,
 * where a slider can put a stop at L 0.88 with a luminance of 0.55.
 */
function depthSentence(c: Ctx, direction: "lighter" | "darker"): string | null {
  const soften = (band: string) =>
    band === "near white" ? "bright" : band === "in deep shadow" ? "dark" : band;
  const inkAgrees = c.endDarkInkReads && c.endLightInkReads;
  const banded = (L: number) => {
    const b = depthBand(L);
    return b === null ? null : inkAgrees ? b : soften(b);
  };
  const open = banded(c.stopL[0]!);
  const close = banded(c.stopL[c.stopL.length - 1]!);
  // Two rungs. Both ends named is the strongest thing the row can say; the
  // ARRIVAL alone is the next best, and it earns its own rung because the end
  // of a run is the part a reader looks at last and remembers. A named START
  // with an unnamed arrival gets nothing: "It opens dark" and then silence
  // about where it went is a sentence that stops halfway.
  if (open !== null && close !== null && open !== close)
    return `It opens ${open} and ends ${close}.`;
  if (close !== null)
    return `It becomes ${direction} from start to end, closing ${close}.`;
  return null;
}

/** The middle third of the run, where a peak or a valley is worth naming. */
const middleThird = (t: number) => t > 1 / 3 && t < 2 / 3;

/**
 * Chroma movement a viewer can actually see, for the intensity rows.
 *
 * The registry's TRAJECTORY_DELTA (0.04) bounds the difference between the two
 * HALVES' mean chroma, which a ramp can clear while every sample sits inside a
 * narrow band. This is the peak-to-valley bound on the same dense sample: 0.05
 * for a direction (it costs 0 of the 208 saturating and 0 of the 157
 * desaturating fixture palettes today, so it is a guard against a threshold
 * move rather than a filter) and 0.08 for naming WHERE the strongest or
 * weakest colour sits, which is a claim about one point and needs the
 * difference to be obvious: at 0.05 the peak row fires on 152 palettes, at 0.08
 * on 104, and the 48 it drops are ramps whose "strongest" sample is a tenth of
 * a JND above its neighbours.
 */
const VISIBLE_CHROMA_MOVE = 0.05;
const NAMEABLE_CHROMA_MOVE = 0.08;

/**
 * The table. Each row is {phrase, the conjunction that licenses it, measured
 * information}, and the five slots (what it is like, what shape it has, where
 * it sits on the wheel, how strong its colour is, how it moves) are the
 * diversity constraint: at most one row per slot is spoken, so the description
 * can never spend both its sentences on lightness.
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
    prevalence: 0.0104,
    when: (c) => c.structure === "grayscale" && grayLean(c.f) === null,
    say: () => "There is almost no color in it, just a run of grays.",
    echoes: ["grayscale"],
  },
  {
    // A near-neutral with a lean. The two facts fuse: "there is no real color
    // here" and "what little there is leans warm" are one impression, and the
    // lean is the half a reader can see. It carries no echo list on purpose —
    // the name may already say `grayscale`, and this sentence says the thing
    // the name does not.
    // ...and only where the palette IS a gray. The detector clears the 2% band
    // on 31 palettes, but 18 of those are merely washed out: a pale green to
    // slate to dusty rose sweep measures 21% of its achievable chroma and still
    // shows two ends a viewer would name as colours, and "the colors are cool
    // grays" reads as a claim about all of them. The structure test is the
    // system's own answer to "is this a gray", so the sentence waits for it.
    id: "tinted-gray",
    slot: "tone",
    prevalence: 0.0115,
    when: (c) =>
      useOf("warm-gray") === "prose" &&
      c.structure === "grayscale" &&
      grayLean(c.f) !== null,
    say: (c) => `The colors are grays with a ${grayLean(c.f)} cast.`,
  },
  {
    // pastel (light + low absolute chroma) AND high-key (the spread is small
    // too): four predicates fuse into one impression, which is the point of
    // the table — "pale and soft the whole way" is one human idea.
    id: "pale-soft",
    slot: "tone",
    prevalence: 0.0415,
    when: (c) => c.has("pastel") && c.has("high-key") && c.softChroma,
    say: () => "It stays pale and soft, with no strong color anywhere in it.",
    echoes: ["pastel"],
  },
  {
    // Its sibling above carries `softChroma` and this row carried nothing, so
    // the two disagreed about what "pale" means. `pastel` is a MEAN test, and
    // the mean is exactly what a near-white middle drags down: a saturated
    // coral (#fda373, 97% of its achievable chroma) into a cream into a solid
    // steel blue measures mean chroma 0.085, one thousandth under the pastel
    // bound, and was described as "The colors are pale". The same guard, for the
    // same reason: the sentence speaks for every stop, so every stop has to
    // clear the bound. Measured: 5 licensed palettes → 1.
    id: "pale",
    slot: "tone",
    prevalence: 0.0012,
    when: (c) => c.has("pastel") && !c.has("high-key") && c.softChroma,
    say: () => "The colors are pale, and none of them is strong.",
    echoes: ["pastel"],
  },
  {
    // ...and the per-stop floor is the other half of the same discipline. The
    // detector bounds the MEAN lightness, and "the colors are light" is a claim
    // about all of them; `rich` below took a per-stop ceiling in the second QA
    // round and `dark-strong` a floor in the third, for the identical error at
    // the other end of the scale. Costs 0 of the 19 palettes isBrilliant now
    // licenses (the tightened detector already removed them), and bounds the
    // claim so a threshold move cannot silently reintroduce it.
    id: "bright-strong",
    slot: "tone",
    prevalence: 0.0219,
    when: (c) =>
      useOf("brilliant") === "prose" &&
      isBrilliant(c.f) &&
      c.evenSpread &&
      Math.min(...c.stopL) >= BRILLIANT_STOP_FLOOR,
    say: () => "The colors are light and strong at the same time.",
  },
  {
    id: "neon",
    slot: "tone",
    prevalence: 0.0796,
    when: (c) => c.has("neon"),
    say: () => "Its strongest colors are bright enough to look neon.",
    echoes: ["neon"],
  },
  {
    // "The colors are deep and intense" is a claim about every stop, and it was
    // printed over a ramp whose lightest three are periwinkle, light orchid and
    // dusty rose. isJewel bounds the MEAN lightness at 0.6, which a ramp
    // reaching 0.72 clears comfortably, so the universal claim needs the STOPS
    // inside the band too. 0.7 is that ceiling plus the room a rendered ramp
    // needs to peak once. Measured: 106 licensed palettes → 43, and the 63 it
    // drops end in lavender-white, bright cyan or neon magenta.
    // ...and the same argument on the OTHER axis (2026-08-18). The row bounded
    // the stops' lightness and left their chroma to a mean: isJewel asks for
    // meanC ≥ 0.12 and maxC ≥ 0.15, which four saturated reds can carry on their
    // own while three muted stops ride along. "The colors are deep and intense"
    // was printed over a grayed denim teal (C 0.072) into pure red into a dull
    // cocoa (C 0.052, under MUTED_CHROMA), and the two ends of that image are
    // the two stops the sentence is least true of. MUTED_CHROMA is the
    // registry's own line for "not intense", so no stop may sit below it.
    // Measured: 42 licensed palettes → 32, and the 10 it drops all contain a
    // stop the registry would call muted.
    //
    // ...and 32 → 24 in QA round 4, without a word of this row changing: the
    // sentence is licensed by `isJewel`, and the registry tightened that (no
    // LIGHT stop, and a neon is not a jewel). The eight it loses are palettes
    // whose deep half carried a pastel or a fluorescent end.
    id: "rich",
    slot: "tone",
    prevalence: 0.0254,
    when: (c) =>
      useOf("jewel") === "prose" &&
      isJewel(c.f) &&
      c.evenSpread &&
      Math.max(...c.stopL) <= JEWEL_STOP_CEILING &&
      Math.min(...c.stopC) >= T.MUTED_CHROMA,
    say: () => "The colors are deep and intense, with real weight in every stop.",
  },
  {
    // "The colors are dark AND strong" is two universal claims, and the second
    // one fails wherever the run passes through black: a midnight-to-ultramarine
    // ramp opens on #00000d and #000028, which render as flat black, and the
    // left third of that image has no colour in it at all. isDeep bounds the
    // MEAN chroma, and the `rich` row above took a per-stop CEILING in the
    // second QA round for exactly this shape of error at the light end; this is
    // the matching floor at the dark one. NEAR_BLACK_L rather than a chroma
    // floor, because at L 0.07 a stop measures 100% of its (vanishing) achievable
    // chroma and still shows nothing (the D19 reading again, in the direction
    // that keeps a near-black from being a colour). Measured: 27 spoken → 20,
    // and the 7 it drops all open or close on a black stop.
    id: "dark-strong",
    slot: "tone",
    prevalence: 0.0288,
    when: (c) => deepSpeaks(c),
    say: () => "The colors are dark and strong, and none of them falls to black.",
    echoes: ["dark"],
  },
  {
    // `low-key` is a claim about the VALUE range (dark, and all of it close
    // together), and the sentence used to say "the colors ... change little",
    // which a reader hears as a claim about the colours themselves. On a dark
    // palette that walks the entire hue circle it was flatly contradicted by
    // the next sentence of its own paragraph ("It travels the whole color
    // wheel", measured 440.7° of travel). The fact is worth saying and only the
    // brightness half of it is true, so that is the half it says.
    //
    // ...and the brightness half said too much (2026-08-18). `low-key` allows
    // 0.3 of lightness range and the sentence promised the brightness "barely
    // changes", which is `steady`'s claim and `steady` correctly waits for
    // LOW_CONTRAST_RANGE (0.12). Fixture: the row fired on 24 palettes and 21 of
    // them ranged 0.12 to 0.291, one of which shows a medium slate-purple end,
    // three near-black navy stops and a lighter slate blue end. Only 5 of the 48
    // low-key palettes are also low-contrast, so gating on that would retire the
    // row; what low-key actually establishes is that every colour is dark, and
    // that is now what it says. "stay ... from end to end" is the range half,
    // "dark" the level half, which is the tag exactly.
    id: "dark-even",
    slot: "tone",
    prevalence: 0.0381,
    when: (c) => c.has("low-key") && !deepSpeaks(c),
    say: () => "The colors stay dark from end to end.",
    echoes: ["dark"],
    // It still claims the whole run, so the motion rows that read the run's
    // lightness would either argue with it ("the full range from dark to
    // light") or say the same adverbial twice.
    conflicts: ["full-range", "steady", "flat-brightness"],
  },
  {
    id: "dark",
    slot: "tone",
    prevalence: 0.06,
    when: (c) => c.has("dark") && !deepSpeaks(c) && !c.has("low-key"),
    say: () => "The colors are mostly dark.",
    echoes: ["dark"],
  },
  {
    id: "earthy",
    slot: "tone",
    prevalence: 0.1015,
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
    // "How loud is it" takes absolute chroma (D19), and the registry's `vivid`
    // is that reading and stays it. But a palette can be as loud as sRGB
    // PERMITS at every one of its lightnesses and never reach VIVID_CHROMA: a
    // blue to cyan to green ramp with red pinned at 0 measures every stop at
    // 100% of its ceiling, mean chroma 0.144, and renders as a glowing
    // near-fluorescent sweep that the description had nothing at all to say
    // about (its whole budget went to two low-information sentences). So the
    // sentence gets a second door: at the ceiling the whole way AND past the
    // pastel bound, so a pale wash at 100% of a ceiling of 0.04 cannot come
    // through it, and above near-black, because a run that passes through black
    // is riding a ceiling of nothing there (the same reading that keeps a
    // near-black from being a teal). Measured: 31 licensed palettes become 69.
    id: "strong",
    slot: "tone",
    // 0.1153 -> 0.1292 in QA round 4, and the gain is the mirror of `rich`'s
    // loss: this row is licensed by NOT being a jewel, and the twelve palettes
    // the registry stopped calling jewel tones (a light stop, or a neon) are
    // palettes whose colour is simply strong.
    prevalence: 0.1349,
    when: (c) =>
      (c.has("vivid") ||
        (c.f.denseMeanSaturation >= FULL_SATURATION &&
          c.f.meanChroma >= T.PASTEL_CHROMA &&
          c.f.denseMinLightness > NEAR_BLACK_L)) &&
      !c.has("neon") &&
      !isBrilliant(c.f) &&
      !isJewel(c.f),
    // Two doors, two sentences (D21.5): the registry's `vivid` door is an
    // absolute reading ("loud"), and the second door is the relative one
    // ("as full as this screen can render at these lightnesses"), which is a
    // different thing to see and deserves its own words rather than one
    // sentence stretched over both.
    say: (c) =>
      c.f.denseMeanSaturation >= FULL_SATURATION
        ? "The colors run at full strength from end to end."
        : "The colors are strong and clear.",
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
    prevalence: 0.0484,
    when: (c) =>
      c.has("light") &&
      c.has("high-key") &&
      !c.has("pastel") &&
      !c.has("neon") &&
      !isBrilliant(c.f),
    say: () => "The colors stay light, and hold an even brightness.",
  },
  {
    // Itten's cold-warm contrast: both poles present at once, not a drift.
    id: "warm-and-cool",
    slot: "tone",
    prevalence: 0.2284,
    when: (c) => useOf("warm-cool-contrast") === "prose" && warmCoolContrast(c.f),
    // The gate is a quarter of the chromatic mass in EACH arc, so neither pole
    // can be a garnish: the second clause is the other half of that same
    // measurement, not an addition to it.
    say: () => "It holds warm and cool colors at once, with neither side taking over.",
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
    // They also need the palette's colour to actually BE there: the registry
    // tags read the mean hue, and a mean five degrees inside the warm arc put
    // "The colors are warm" over a lavender-to-plum purple ramp (measured
    // meanHue 335.4, warm arc from 330). The tags are the indexed `warmth`
    // formula and cannot move, so the SENTENCE takes the stricter test — most
    // of the chromatic mass inside the arc, the same hueBandShare machinery the
    // families use. It costs the pair 399 → 205 and 312 → 194 candidates.
    id: "warm",
    slot: "tone",
    prevalence: 0.1211,
    when: (c) =>
      c.has("warm") &&
      c.journeyClaim === null &&
      hueBandShare(c.f, 330, 120) >= T.FAMILY_BAND,
    say: () => "The colors all carry a warm cast.",
    echoes: ["sunset", "autumn"],
  },
  {
    id: "cool",
    slot: "tone",
    prevalence: 0.1107,
    when: (c) =>
      c.has("cool") &&
      c.journeyClaim === null &&
      hueBandShare(c.f, 150, 300) >= T.FAMILY_BAND,
    say: () => "The colors all carry a cool cast.",
    echoes: ["ocean"],
  },

  // --- form: what shape the color takes -----------------------------------
  //
  // Dense-sample facts only (structure, the hue chain, the coefficients), so
  // every row here is byte-identical at any step count. The series rows state a
  // SET fact ("one blue lightened with white") rather than a direction, so they
  // never argue with a motion sentence about which way the ramp runs.
  //
  // Every row that NAMES a family reads `c.base`, the tone-gated word for the
  // palette's most coloured sample, and stays silent when that is null. A
  // sentence about "one orange" over a chocolate-to-cream ramp is worse than no
  // sentence at all, and the budget spends itself elsewhere.
  //
  // The four series rows and one-color also declare the lightness-direction
  // rows as conflicts: "changes only how light it is" followed by "it becomes
  // lighter from start to end" spends two thirds of the description on one
  // axis, which is the checklist rhythm this rewrite exists to remove. The fade
  // row has always carried that list; its siblings did not.
  {
    id: "tints-and-shades",
    slot: "form",
    prevalence: 0,
    when: (c) => c.series === "tints and shades" && c.base !== null,
    say: (c) => `It is a single ${c.base}, both lightened and darkened.`,
    conflicts: ["brightens", "darkens", "full-range"],
  },
  {
    id: "tints",
    slot: "form",
    prevalence: 0.0127,
    when: (c) => c.series === "tints" && c.base !== null,
    say: (c) => `It is a single ${c.base}, lightened with white toward one end.`,
    conflicts: ["brightens", "darkens", "full-range"],
  },
  {
    id: "shades",
    slot: "form",
    prevalence: 0.0012,
    when: (c) => c.series === "shades" && c.base !== null,
    say: (c) => `It is a single ${c.base}, darkened with black toward one end.`,
    conflicts: ["brightens", "darkens", "full-range"],
  },
  {
    id: "tones",
    slot: "form",
    // 0.0161 -> 0.0046 in QA round 4: `tones` stopped being allowed to fire on
    // a ramp whose value climbs (see seriesReading), which is the tint/tone
    // conflation the inventory names.
    prevalence: 0.0046,
    when: (c) => c.series === "tones" && c.base !== null,
    say: (c) => `It is a single ${c.base}, softened with gray toward one end.`,
    conflicts: ["brightens", "darkens", "full-range"],
  },
  {
    // "ONLY how light" is exclusive, so the palette has to hold everything else
    // still, and a monochrome ramp does not always hold its COLOURFULNESS
    // still: #fc7b82 sits at 96% of the chroma its lightness allows and the
    // stop beside it, at the same lightness, at 54%, which reads as a visibly
    // dustier pink. Absolute chroma cannot see it (the gamut ceiling moves with
    // lightness along the ramp), so the gate takes the relative reading, which
    // is the D19 rule of thumb applied to a claim about identity.
    id: "one-color",
    slot: "form",
    // 0.06 -> 0.0657 in QA round 4: the row fires where a monochrome has NO
    // series reading, and `tones` stopped claiming eleven monochrome ramps
    // whose lightness travels (see seriesReading). Those are palettes that vary
    // only in how light they are, which is what this sentence says.
    prevalence: 0.0657,
    when: (c) =>
      c.structure === "monochrome" &&
      !c.series &&
      c.base !== null &&
      c.f.denseSaturationRange < SATURATION_HELD,
    say: (c) => `It holds one ${c.base} and changes only how light it is.`,
    // "ONLY how light" is an exclusive claim, so it also rules out the
    // temperature journey: "it holds one blue and changes only how light it is"
    // followed by "it becomes cooler as it moves" is a palette arguing with
    // itself two sentences apart. The series rows make no such exclusive claim
    // (a white-mix drifts hue by up to 22°, which is the Abney effect and not a
    // contradiction), so they keep the pair.
    conflicts: ["brightens", "darkens", "full-range", "warming", "cooling"],
  },
  {
    // Ombré over an analogous span: the series rows own the monochrome case,
    // and their SET wording cannot carry a fade, so this one keeps the journey.
    //
    // "The red fades from light to dark" was printed over a cream-to-crimson
    // sweep, because the family came from the MEAN hue while the ends sat in
    // two different bands (an analogous span may be 95° wide, and a band is
    // ~45°). So the ends have to agree, exactly as the one-family row already
    // required; when they do not, the neighbors row says the true thing.
    id: "fade",
    slot: "form",
    prevalence: 0.015,
    when: (c) =>
      useOf("ombre") === "prose" &&
      isOmbre(c.f, c.structure) &&
      c.structure === "analogous" &&
      c.base !== null &&
      c.firstBand === c.lastBand,
    say: (c) =>
      c.f.lightnessDelta > 0
        ? `The ${c.base} fades from dark to light across the whole run.`
        : `The ${c.base} fades from light to dark across the whole run.`,
    conflicts: ["brightens", "darkens", "full-range"],
  },
  {
    // "Skips everything between them" is a claim about the space BETWEEN the
    // two hues, and a clamp plateau fills that space with the largest block in
    // the image: one palette spent 46% of its run at pure #ffffff between a
    // pale cyan and a rose and was described as skipping what was between them.
    // Hue clustering cannot see it — achromatic samples carry no hue — so the
    // plateau tags are read here as a veto, and the white-block/black-block
    // rows say what is actually there.
    id: "two-colors",
    slot: "form",
    prevalence: 0.0334,
    when: (c) =>
      c.structure === "duotone" &&
      !c.has("pure-white-plateau") &&
      !c.has("pure-black-plateau"),
    // Three shapes, one gate. "Skips everything between them" asserts a JUMP,
    // and a cosine ramp usually gets from one hue pole to the other by fading
    // through neutral instead: a slate-blue to mauve duotone spends 56% of its
    // run with no usable hue at all, and the image is a smooth fade, not a
    // break. So the jump wording waits for a run that keeps its hue the whole
    // way, and the crossing gets said out loud otherwise.
    //
    // WHERE the crossing sits is its own fact. chromaticFraction is a share of
    // the whole run and says nothing about position, and "meet through a gray
    // middle" was printed over a palette whose two ENDS are the grays and whose
    // middle is the only coloured part of it. chromaValleyT and chromaPeakT are
    // the positions of the least and most colourful samples, which is exactly
    // the question, so the sentence reads them instead of assuming. Measured
    // over the 29 duotone palettes that speak this row: 16 cross through gray,
    // 4 hold their colour in the middle, 9 run gray at one end into colour at
    // the other, and none of them keeps a usable hue the whole way (the
    // "skips everything between them" branch is unreachable on this corpus and
    // stays for the editor, which can reach it directly).
    //
    // WHAT the crossing looks like is a third fact, and the word was assumed
    // rather than measured: a gunmetal → cinnamon duotone whose middle stops
    // are #000007 and #000020 was told to "fade through gray" (2026-08-18,
    // visual QA seed 05). Black and white are the ends of the gray scale and no
    // reader calls either of them gray, so the neutral is named from
    // chromaValleyL, at the bands CROSSING_WHITE_L records. Measured over the
    // 29 fixture rows that speak it: 26 cross a gray, 2 a black, 1 a white.
    say: (c) => {
      const { neutral, shape } = duotoneCrossing(c);
      if (shape === "jump") return "It uses two colors and skips everything between them.";
      if (shape === "mid-valley")
        return `Its two colors fade through ${neutral} between them.`;
      if (shape === "mid-peak")
        return `Its color is strongest in the middle and fades to ${neutral} at both ends.`;
      if (shape === "split")
        return `Its color is strongest at one end and fades to ${neutral} at the other.`;
      return "Part of it has almost no color.";
    },
    // Naming the neutral turned this row into a shape claim on the black and
    // white branches, and the shape row then said it again: "Its two colors
    // fade through black between them. It is darkest in the middle and lighter
    // at both ends." (seed 05, before the fix) is one fact spending the whole
    // two-sentence budget. Only the middle branches carry the redundancy, and
    // only when the neutral has a value: a gray crossing says nothing about
    // light or dark and leaves the shape row free. Measured over the fixture:
    // 1 palette reaches the veto, and it trades the restated shape for a fact
    // the reader could not otherwise have ("It holds warm and cool colors at
    // the same time"). Rare by construction, and the row it protects is the
    // one the whole two-sentence budget was going to.
    // ...and since D21 the mid branches also say where the COLOUR is loudest,
    // which is the intensity slot's peak and valley rows exactly: "Its color is
    // strongest in the middle and fades to gray at both ends. Its strongest
    // color sits in the middle of the run." is one fact printed twice. That
    // half of the veto does not depend on the neutral having a value, so it
    // sits outside the gray check.
    conflictsIn: (c) => {
      const { neutral, shape } = duotoneCrossing(c);
      const intensity =
        shape === "mid-valley"
          ? ["palest-middle"]
          : shape === "mid-peak"
            ? ["strongest-middle"]
            : [];
      if (neutral === "gray") return intensity;
      if (shape === "mid-valley")
        return [...intensity, neutral === "black" ? "dark-middle" : "bright-middle"];
      if (shape === "mid-peak")
        return [...intensity, neutral === "black" ? "bright-middle" : "dark-middle"];
      return intensity;
    },
  },
  {
    id: "opposite-colors",
    slot: "form",
    // 0.0334 until the sweep route to `complementary` shipped (D24.2): the
    // sentence is true of every complementary palette, so its rate is that
    // class's, 29 of 867 -> 52 of 867.
    prevalence: 0.0577,
    when: (c) => c.structure === "complementary",
    // The identity sentence has its own complementary template ("built on two
    // opposite colors: dark indigo against sand yellow"), and this row fired
    // beside it with no idea it had: 28 of the 867 fixture paragraphs said
    // opposite twice, which on a two-sentence budget spends a third of the
    // description on a repeat. The template's condition is exactly two surviving
    // names, so that is what the veto reads.
    restates: (c) => c.names.length === 2,
    say: () => "Its two colors sit on opposite sides of the color wheel.",
  },
  // --- wheel: where the colors sit on the circle, and how they travel it ----
  //
  // Split out of `form` on 2026-08-18. Two questions were sharing one slot and
  // the structural half kept winning it: `several-colors` at 1.40 bits is the
  // form floor and a multicolor palette therefore had nothing to say about its
  // colours at all, while a duotone spent its one form sentence on the pairing
  // and never mentioned that the two hues sit a quarter of the wheel apart.
  // Measured before the split, 564 of the 867 fixture palettes (65%) had no
  // form row clearing the name's 2-bit bar. Construction facts (how the palette
  // is built) stay in `form`; everything about the hue circle lives here, so
  // the two can never restate each other across slots.
  {
    id: "whole-wheel",
    slot: "wheel",
    prevalence: 0.0242,
    when: (c) => c.has("full-wheel"),
    say: () => "It travels the whole color wheel, passing every family on the way.",
  },
  {
    id: "rainbow",
    slot: "wheel",
    prevalence: 0.0634,
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
    say: () => "The same run of colors repeats more than once from end to end.",
  },
  {
    // "instead of forward" came off on 2026-08-18: FORWARD meant spectral hue
    // order, a referent the sentence never supplies, and a machine translator
    // renders it literally ("en lugar de hacia adelante"), which is the D20.4
    // failure exactly. What the tag establishes is that the run returns to hues
    // it has already been through, and that is what it now says.
    //
    // Rewritten again the same day: "It returns to colors it has already passed
    // through" broke three D20.4 constraints at once — present perfect where
    // simple present will do, a phrasal verb where a single verb exists, and a
    // zero-relativizer clause ending in a stranded preposition, which is the
    // hardest English relative shape to translate into a language that fronts or
    // case-marks its relatives. Same fact, plain SVO.
    //
    // ...and on 2026-08-18 the GATE moved to match the sentence. It spoke the
    // `hue-wandering` tag, which establishes only that the hue ANGLE turns back,
    // and the sentence claims the COLORS return: a denim blue through
    // periwinkle and orchid pink into an electric violet ends at h 283 where an
    // earlier stop sat at h 284, and calls the two the same because one is
    // C 0.082 and the other C 0.247. Nothing in that image repeats. Over the 48
    // fixture palettes that spoke this row, 32 (66.7%) had no two far-apart
    // samples within 0.05 in OkLab. `colorReturn` measures the claim directly
    // (the smallest distance between samples a third of the ramp apart), so the
    // gate is now the truth condition, and the hue tag is not consulted at all:
    // it answers a different question and has no honest plain phrasing anyway.
    // LOOP_SEAM is the same one-JND line the seam sentence promises, which is
    // what "the same color" has to mean if the two sentences are to agree.
    // Measured: 48 licensed palettes → 86, of which the symmetric arches are the
    // bulk (a ramp that runs out and back does repeat its colors, and had no
    // sentence for it).
    id: "back-and-forth",
    slot: "form",
    prevalence: 0.045,
    when: (c) => c.f.colorReturn < LOOP_SEAM,
    say: () => "It repeats colors from earlier in the gradient.",
  },
  {
    // "and stays there" came off on 2026-08-18: the row is gated on structure
    // and on the two ends belonging to different families, neither of which
    // says anything about a plateau, and the fixture's hue chains mostly
    // advance at a near-constant rate to the last sample. At 24.0% it was the
    // most common sentence in the table, so the clause was also the most often
    // false. What remains is what the gate actually establishes.
    id: "neighbors",
    slot: "wheel",
    // 0.0577 until QA round 3 gave gatedFamily a near-black floor: two of the
    // palettes that spoke this row had an END whose band came from a stop a
    // viewer sees as black, so the "moves from X into Y" was a claim about a
    // hue angle nobody can see.
    prevalence: 0.0565,
    when: (c) =>
      c.structure === "analogous" &&
      c.firstBand !== c.lastBand &&
      // ...and the two ends have to be a JOURNEY apart. The row asked only
      // whether the band words differ, and two hues 30° apart can sit in
      // different bands simply by straddling the line between them: a single
      // purple ramp running h 319.5 to h 289.0, whose own stops the corpus
      // names plum, wisteria, amethyst, deep lavender, rebecca purple and
      // indigo, was narrated as "It moves from pink into violet". A family is
      // 45° wide (the eight anchors partition the wheel), so the ends must be at
      // least one family apart before the move is worth a sentence. Measured
      // over the 59 palettes that spoke this row: separation p05 30.7, p10 32.7,
      // p25 43.2, p50 54.1, and the bar removes 16, all of them one-neighbourhood
      // ramps.
      c.endHueSeparation >= NEIGHBOR_TRAVEL &&
      // ...and the two bands have to be facts rather than roundings. The eight
      // families partition the wheel, so every hue gets an answer, including
      // the ones sitting on a line: an all-blue ramp whose last stop measures
      // h 228.0, which is 1.5° inside cyan, was told "It moves from blue into
      // cyan" one sentence after its own identity sentence had named that stop
      // light blue. `colorFamilies` returns both neighbours within the edge
      // margin, so a single answer IS the test for a confident band.
      c.firstBandFirm &&
      c.lastBandFirm &&
      c.firstFamily !== null &&
      c.lastFamily !== null,
    // ...and it may not argue with the sentence above it. The identity sentence
    // has already named both ends out of the corpus, and those names usually
    // carry a family word of their own: "running from vivid purple (#861fff)
    // through clear blue to neon blue (#00dcff). It moves from violet into
    // cyan." calls one stop blue and then cyan, and the other purple and then
    // violet, in two consecutive sentences about one image. The firmness gate
    // above answers a different question (how far the hue sits from a band
    // edge), and h 215 is firmly cyan while the corpus still says blue. Where
    // the printed name commits to a family, the family word defers to it.
    restates: (c) => nameFamilyConflict(c),
    say: (c) =>
      `It moves from ${c.firstFamily} into ${c.lastFamily} without leaving that part of the wheel.`,
  },
  {
    // "The colors stay inside one range of magenta" was both wrong (the palette
    // is a purple, which is the same hue at a lower lightness) and a noun stack
    // a translator has to guess at. The plain sentence carries the same fact.
    id: "one-family",
    slot: "wheel",
    prevalence: 0.0173,
    when: (c) =>
      c.structure === "analogous" &&
      c.base !== null &&
      (c.firstBand === null || c.lastBand === null || c.firstBand === c.lastBand) &&
      // ...and the identity sentence must not have said it already. "All the
      // colors are blue" after "running from light royal blue through deep sky
      // blue to bright blue" spends a whole slot on what the reader just read.
      // The `echoes` machinery vetoes against the NAME's modifier phrase; this
      // is the same test against the colour names, which is where a family word
      // actually gets repeated.
      !c.names.some((n) => n.toLowerCase().includes(c.base!)),
    say: (c) => `All the colors are ${c.base}.`,
  },
  {
    // Direction on the circle, which is a fact about the sequence and not about
    // its width: a palette can cover one neighbourhood and still walk it in
    // order. The registry's own tags, gated at 90° of travel with 0.8
    // consistency, so the run genuinely keeps going one way.
    //
    // "Rainbow order" rather than "forward": D20.4 retired an earlier sentence
    // for saying "instead of forward" with no referent in it, and a rainbow is
    // the referent every reader already has for the order of the wheel. The
    // word is on the everyday list D20.3 keeps (`rainbow` is a search term
    // here), and it translates as a noun everywhere.
    id: "wheel-forward",
    slot: "wheel",
    prevalence: 0.1776,
    when: (c) => c.has("hue-advancing"),
    say: () => "Its colors run forward through the rainbow order, without turning back.",
    echoes: ["rainbow"],
  },
  {
    id: "wheel-back",
    slot: "wheel",
    prevalence: 0.173,
    when: (c) => c.has("hue-reversing"),
    say: () => "Its colors run backward through the rainbow order, without turning back.",
    echoes: ["rainbow"],
  },
  {
    // How WIDE the palette is on the circle, for the palettes whose structure
    // class says nothing about it. Both rows need a colour to be talking about:
    // hueSpan is computed over the chromatic samples only, so an achromatic
    // run reports a span of 0 and would otherwise be told its colours sit close
    // together on the wheel, which is the D19 error one level up.
    id: "broad-arc",
    slot: "wheel",
    prevalence: 0.1845,
    when: (c) => c.f.hueSpan >= 180 && !c.has("full-wheel") && c.base !== null,
    say: () => "Its colors cover more than half the color wheel.",
  },
  {
    id: "narrow-arc",
    slot: "wheel",
    // 0.1984 until QA round 3's near-black floor on gatedFamily: three of these
    // palettes had no visible colour to be close together.
    prevalence: 0.1949,
    when: (c) => c.f.hueSpan < 45 && c.base !== null && !c.solid,
    say: () => "All of its colors sit close together on the wheel, within one family.",
    echoes: ["monochrome", "grayscale"],
  },
  // The `groups` row lived here until 2026-08-18: "It jumps between separate
  // groups of color", fired on multicolor palettes with two or more isolated
  // hue clusters and no achromatic crossing. RETIRED, because a cosine ramp is
  // continuous and a gap in the hue histogram is not a break a viewer can see.
  // It fired on 6 of the 867 fixture seeds and every one of them is a smooth
  // fade: the guard added in round 1 (chromaticFraction ≥ 1) assumed the
  // invisible passage was a GRAY, and the six are invisible for other reasons.
  // Two cross near BLACK (dense samples at L 0.08 with C 0.05, which clears the
  // absolute chroma floor and reads 100% saturation, so they count as coloured
  // and even form their own cluster); one crosses near WHITE at L 0.998; and
  // one merely moves fast (consecutive dense samples at h 138 and h 217, which
  // empties the histogram bins between them). Rendered, all six are continuous
  // sweeps: qa/r3/groups-*.png. Requiring the whole run to stay visible
  // (denseMinLightness > 0.18, denseMaxLightness < 0.87) leaves 0 of 6, which
  // is the honest answer: the hue histogram cannot tell a break from a fast or
  // invisible transit, and nothing here measures visibility of a hue EDGE. The
  // multicolor palettes now take the row below, which claims only what the
  // classification establishes.
  {
    // The floor of the form slot, and it now knows it: at 37.8% it carries 1.4
    // bits and loses to every other form row, which is right for a sentence
    // that says only what the classification says.
    //
    // It also yields when the identity sentence has already said it. "It passes
    // through several colors between its ends" after "running from rebecca
    // purple through clay to grassy green" spends a third of the budget
    // repeating the line above it, which is the coverage habit D20.1 rules out;
    // measured, 85 of the 94 palettes that spoke this sentence had already
    // listed three or more names. `restates` rather than `when`: see the field,
    // the distinction is what keeps the prevalence honest and the form sentence
    // step-stable.
    id: "several-colors",
    slot: "form",
    // 0.3783 until D24.2 moved 23 multicolor palettes into `complementary`;
    // this row is the residual class's, so it moves with it.
    prevalence: 0.3541,
    when: (c) => c.structure === "multicolor",
    restates: (c) => c.names.length >= 3,
    say: () => "It passes through several colors between its ends.",
  },
  {
    // The coefficient-level guarantee, which nothing spoke before: a ± |b|
    // inside [0,1] on every channel means the clamp can never fire, at any
    // frequency or phase, so the run holds no pinned stretch. That is a fact
    // about the blend a designer can see and use, and it is the honest opposite
    // of the plateau rows: `black-block` names the flat stretch when there is
    // one, this names its guaranteed absence. Not a claim about smoothness in
    // general (a cosine turning point is a soft extremum, not a flat stretch),
    // which is why the sentence says flat spots rather than banding.
    id: "smooth",
    slot: "form",
    prevalence: 0.1788,
    when: (c) => c.f.inGamutAlways && !c.solid,
    say: () => "It blends cleanly the whole way, with no flat spots in the run.",
    conflicts: ["black-block", "white-block"],
  },

  {
    // A property of the shape, not advice, which is why D21.1 kept it when the
    // usage rows went: the ramp's two ends are the same colour, so the band can
    // be wrapped into a circle and no edge shows at the join.
    //
    // Not for a solid palette: its ends match because there is only one color,
    // and saying so reads as a joke rather than as a fact about a conic render.
    //
    // The registry's SEAM_TOLERANCE (0.05) answers a different question: how
    // close the ends have to be for a conic render not to show a hard edge,
    // which is a tag. "No VISIBLE break" is a promise to the eye, and 0.05 is
    // about 2.5 JND: an olive-gold start (C 0.0456) and a neutral warm gray end
    // (C 0.0142) measured 0.0398 apart and read as khaki beside taupe in the
    // discrete strip. One JND is what the sentence can promise. Measured over
    // the fixture the seams of the 39 seamless palettes cluster at 0 (16 of
    // them are exact, from whole-number frequencies) and then spread: 19 under
    // 0.02, 21 under 0.025, 30 under 0.04.
    id: "loops",
    slot: "form",
    prevalence: 0.0219,
    when: (c) => c.has("seamless") && c.f.seam < LOOP_SEAM && !c.solid,
    // The first clause came off on 2026-08-18: the identity sentence now ends
    // "and back to medium slate blue" whenever the two ends are one colour (see
    // endsMatch), so "Its two ends match" was the line above said again, and on
    // a small budget that is a whole sentence spent on a repeat. What this row
    // knows and the identity does not is the CONSEQUENCE.
    say: () => "It loops with no visible break.",
  },

  // --- motion: how it moves ------------------------------------------------
  {
    // The clamp pins all three channels at once for a tenth of the run or more:
    // a visible flat black block, not a technical artifact.
    //
    // ...and one sentence could not tell a tenth from two thirds. "Part of it is
    // solid black" is the wording at the PLATEAU_SHARE floor, and it was also
    // the wording for a palette that renders 68.8% pure black with nothing in it
    // but a short dark-green tail: 33 of its 48 dense samples and 5 of its 7
    // swatches are #000000, and the paragraph never conveyed that the image is a
    // black field. The module already draws that line for the chip row, at
    // PLATEAU_DOMINANT, and the same line serves here: measured over the
    // fixture, the 21 black plateaus run 0.125 to 1.000 with 4 above two fifths,
    // and the 6 white ones 0.271 to 1.000 with 3 above.
    id: "black-block",
    slot: "motion",
    prevalence: 0.0242,
    when: (c) => c.has("pure-black-plateau"),
    say: (c) =>
      c.f.allBlackShare >= PLATEAU_DOMINANT
        ? "Most of it is solid black."
        : "Part of it is solid black.",
  },
  {
    // Its twin at the other end of the clamp. Rarer (0.7% against 2.4%), and
    // the rarity is why it was missing: the 2% floor decides what may be
    // SPOKEN of a palette in general, and this is a fact about the largest
    // block in six particular images.
    id: "white-block",
    slot: "motion",
    prevalence: 0.0069,
    when: (c) => c.has("pure-white-plateau"),
    say: (c) =>
      c.f.allWhiteShare >= PLATEAU_DOMINANT
        ? "Most of it is solid white."
        : "Part of it is solid white.",
  },
  {
    // Both ends inside their value bands, not merely a wide range: keyed to the
    // range alone this called a stop at L 0.74 "near white".
    id: "full-range",
    slot: "motion",
    prevalence: 0.0023,
    when: (c) =>
      c.f.lightnessRange > T.HIGH_CONTRAST_RANGE &&
      Math.min(...c.stopL) < NEAR_BLACK_L &&
      Math.max(...c.stopL) > NEAR_WHITE_L &&
      // ...and it is the FLOOR of the motion slot, the way `several-colors` is
      // the floor of the form slot. "It uses the full range from dark to light"
      // is true of every high-contrast ramp and says nothing about the shape a
      // viewer sees; where the palette HAS a shape, the shape sentence contains
      // this one. A symmetric arch with a pale gold core between two near-black
      // navy ends — the palette's whole identity — was told the generic thing
      // because ranking is by rarity (5.06 bits against bright-middle's 3.12)
      // and rarity cannot express containment. This is the registry's own
      // `implies` rule: a specific word shadows a general one. Measured: 26
      // licensed palettes → 13.
      !c.has("bright-middle") &&
      !c.has("dark-middle") &&
      // ...and it yields to the two direction rows for the same reason, since
      // D21.2 gave them the end bands: "It opens in deep shadow and ends near
      // white" is this sentence WITH the direction in it, so where the ramp has
      // a direction the direction sentence contains this one. Measured: 26
      // licensed palettes → 15, and the 11 it drops are all clean ramps whose
      // motion row now names both ends itself. With the shape guard above it
      // as well, 2 palettes reach the sentence: it is the motion floor and the
      // floor is where a palette lands when it has nothing sharper to say.
      !rampDominates(c.f),
    say: () => "It runs the full way from near white to deep shadow.",
  },
  {
    id: "bright-middle",
    slot: "motion",
    prevalence: 0.1153,
    when: (c) => c.has("bright-middle"),
    say: () => "It is brightest in the middle and darker at both ends.",
  },
  {
    id: "dark-middle",
    slot: "motion",
    prevalence: 0.0704,
    when: (c) => c.has("dark-middle"),
    say: () => "It is darkest in the middle and lighter at both ends.",
  },
  {
    // A turn COUNT is the analysis showing through (D20.3), and the wording is
    // as close to an impression as a count gets: what a viewer sees is the
    // brightness going up and then down again, so that is what it says.
    //
    // It also yields to the two shape rows, on the same `implies` argument
    // `full-range` takes above. A symmetric arch has two turns and a shape, and
    // "brightest in the middle and darker at both ends" is that shape said
    // exactly, while "it gets lighter and darker more than once" is the same
    // fact with the picture removed; rarity put this row first (3.40 bits
    // against 3.12) and the palette lost its own outline. Measured: 82 licensed
    // palettes → 47, and the 35 it drops all have a peak or a valley to name.
    id: "wavy",
    slot: "motion",
    prevalence: 0.0611,
    when: (c) => c.f.turns >= 2 && !c.has("bright-middle") && !c.has("dark-middle"),
    say: () => "It gets lighter and darker more than once.",
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
    //
    // ...and they no longer need a perfectly monotone ramp. The tags require
    // turns === 0, and `turns` counts every direction change above 0.004 of
    // lightness, so a ramp that lifts 0.08 and then falls 0.58 is an `arch` and
    // could say nothing about its direction at all: the widest fall in the
    // fixture went undescribed while its palette spent a sentence on "It passes
    // through several colors between its ends". `rampDominates` is the missing
    // distinction, and it reads the same two numbers the tag does.
    // ...and since 2026-08-18 each of them is TWO rows, because it says two
    // different things (D21.2). Where the run has a name on the value ladder
    // the sentence names it ("It opens bright and ends in deep shadow"), and
    // that is a far more informative claim than the bare direction. Ranking is
    // by measured rarity and the score has to be the rarity of the SENTENCE,
    // not of the gate that produced it, or the anchored sentences inherit the
    // plain row's 1.58 bits and lose every slot they compete for.
    //
    // Re-measured after depthSentence grew its ARRIVAL rung (a named close with
    // an unnamed open used to fall through to the plain row): brightening now
    // splits 129 plain / 162 anchored and darkening 77 / 64, which is 2.75
    // against 2.42 bits and 3.49 against 3.76. The anchored brightening
    // sentence is no longer the rarer of its pair, and that is fine — the point
    // of the split was never that anchored is rare, it is that the two rows
    // print different sentences and each has to be scored as what it prints.
    // The two end luminances that used to license the deleted text-pairing
    // advice are exactly what names the two ends here. See depthSentence.
    id: "brightens-into",
    slot: "motion",
    prevalence: 0.1869,
    when: (c) =>
      (c.has("brightening") || (c.f.turns === 1 && c.f.lightnessDelta > 0)) &&
      rampDominates(c.f) &&
      depthSentence(c, "lighter") !== null,
    say: (c) => depthSentence(c, "lighter")!,
  },
  {
    id: "brightens",
    slot: "motion",
    prevalence: 0.1488,
    when: (c) =>
      (c.has("brightening") || (c.f.turns === 1 && c.f.lightnessDelta > 0)) &&
      rampDominates(c.f) &&
      depthSentence(c, "lighter") === null,
    say: () => "It becomes lighter from start to end.",
  },
  {
    id: "darkens-into",
    slot: "motion",
    prevalence: 0.0738,
    when: (c) =>
      (c.has("darkening") || (c.f.turns === 1 && c.f.lightnessDelta < 0)) &&
      rampDominates(c.f) &&
      depthSentence(c, "darker") !== null,
    say: (c) => depthSentence(c, "darker")!,
  },
  {
    id: "darkens",
    slot: "motion",
    prevalence: 0.0888,
    when: (c) =>
      (c.has("darkening") || (c.f.turns === 1 && c.f.lightnessDelta < 0)) &&
      rampDominates(c.f) &&
      depthSentence(c, "darker") === null,
    say: () => "It becomes darker from start to end.",
  },
  {
    // Temperature JOURNEY comes from the stored palette-tags formula, never a
    // serve-time recompute: the Vectorize index carries that value.
    //
    // ...but it has to ARRIVE somewhere warm. The stored formula reads
    // temperature as red minus blue on the raw channels, and a channel
    // difference is not a direction on the hue circle: a ramp running mid blue,
    // teal, sea green, seaweed has red pinned at exactly 0 for its whole length
    // and still measures a temperature delta of +0.294, entirely from blue
    // falling away, so it was told "It becomes warmer as it moves" over an
    // image with nothing warm anywhere in it and a `cool` tag of its own.
    // Fixture-wide, 20 of the 43 spoken "warmer" paragraphs sat on palettes
    // tagged cool. The claim a reader hears is that the run ends warmer than it
    // started, so the end has to be in the warm arc: same window `warm` reads,
    // asked of the last sample that has a hue. Measured, warming keeps 223 of
    // 302 licensed palettes and cooling 236 of 315.
    id: "warming",
    slot: "motion",
    prevalence: 0.2572,
    when: (c) => c.journeyClaim === "warming",
    say: () => "It becomes warmer as it moves.",
  },
  {
    id: "cooling",
    slot: "motion",
    prevalence: 0.2722,
    when: (c) => c.journeyClaim === "cooling",
    say: () => "It becomes cooler as it moves.",
  },

  // --- intensity: how strong the color is, and where it lives ---------------
  //
  // The axis the old table could barely reach. `color-beside-gray` was its only
  // row and it sat in the tone slot, competing for words with the palette's
  // character; everything else about colour STRENGTH went unsaid, which is why
  // a ramp that starts neutral and arrives at full colour was described only by
  // its brightness. D21.2 asked for the retired usage rows' saturation
  // knowledge to come back as description, and this is where it went.
  //
  // Every row here reads chroma (D19: "how loud is it" takes the absolute
  // reading), and none of them reads lightness, so an intensity sentence can
  // never restate a motion one. What they CAN restate is a form row that
  // already claims the colour is held or spent, so the series rows, `one-color`
  // and the two duotone crossing branches declare them as conflicts.
  {
    // Itten's contrast of saturation: pure color beside near-gray, in the two
    // words a designer would use for it.
    id: "color-beside-gray",
    slot: "intensity",
    prevalence: 0.0461,
    when: (c) => useOf("saturation-contrast") === "prose" && saturationContrast(c.f),
    say: () => "Strong color sits next to almost colorless areas.",
  },
  {
    // The registry's own trajectory tags, which nothing spoke before: chroma in
    // the second half of the run minus chroma in the first. The branch names
    // the ARRIVAL when one end is near neutral, because that is the half of it
    // a reader sees first.
    id: "intensity-rises",
    slot: "intensity",
    prevalence: 0.2399,
    when: (c) => c.has("saturating") && c.f.denseChromaRange >= VISIBLE_CHROMA_MOVE,
    say: (c) =>
      c.stopC[0]! < T.MUTED_CHROMA
        ? "It starts close to neutral and gains color as it runs."
        : "The color grows stronger as it runs.",
    // A pale or gray palette moves its chroma inside a band no one would call
    // strong, and "the color grows stronger" beside "no strong color anywhere
    // in it" is the paragraph arguing with itself. Same argument for the mix
    // rows: "lightened with white" is already a statement about where the
    // colour goes.
    conflicts: [
      "gray",
      "tinted-gray",
      "pale-soft",
      "pale",
      "one-color",
      "tints",
      "shades",
      "tones",
      "tints-and-shades",
    ],
  },
  {
    id: "intensity-falls",
    slot: "intensity",
    prevalence: 0.1811,
    when: (c) => c.has("desaturating") && c.f.denseChromaRange >= VISIBLE_CHROMA_MOVE,
    say: (c) =>
      c.stopC[c.stopC.length - 1]! < T.MUTED_CHROMA
        ? "It starts in full color and fades toward neutral."
        : "The color loses strength as it runs.",
    conflicts: [
      "gray",
      "tinted-gray",
      "pale-soft",
      "pale",
      "one-color",
      "tints",
      "shades",
      "tones",
      "tints-and-shades",
    ],
  },
  {
    // WHERE the colour is loudest, which is a different question from where the
    // brightness peaks and routinely has a different answer: a ramp can be
    // brightest at its pale end and most colourful in its middle.
    id: "strongest-middle",
    slot: "intensity",
    prevalence: 0.12,
    when: (c) =>
      middleThird(c.f.chromaPeakT) && c.f.denseChromaRange >= NAMEABLE_CHROMA_MOVE,
    say: () => "Its strongest color sits in the middle of the run.",
    conflicts: ["one-color"],
  },
  {
    id: "palest-middle",
    slot: "intensity",
    prevalence: 0.1211,
    when: (c) =>
      middleThird(c.f.chromaValleyT) && c.f.denseChromaRange >= NAMEABLE_CHROMA_MOVE,
    say: () => "Its color thins through the middle and returns at both ends.",
    conflicts: ["one-color"],
  },
  {
    // The opposite fact, and the rarer one: real colour that never changes
    // strength. MUTED_CHROMA is the registry's line for "there is colour here
    // at all", so a grayscale run cannot come through this door and claim to
    // hold a strength it does not have.
    id: "even-intensity",
    slot: "intensity",
    prevalence: 0.0381,
    when: (c) => c.f.denseChromaRange < 0.03 && c.f.meanChroma >= T.MUTED_CHROMA,
    say: () => "The color holds one strength from end to end.",
    conflicts: ["one-color"],
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
  wheel: 2,
  intensity: 3,
  motion: 4,
};

/**
 * How many impressions a description may spend. Two, and it is a CEILING.
 *
 * It was four for a day. D21.4 raised it because the owner read the paragraph
 * ON THE PAGE and wanted "a decently long descriptor as if it were a color
 * theory expert describing the palette"; D22.A then took the paragraph OFF the
 * page, so the reader that motivated the length no longer exists. What reads
 * the prose now is a crawler snippet (~160 chars, the meta ladder), the JSON-LD
 * and the embedding. None of them are better served by sentences three and
 * four, and D22.A says so directly: the expert-voice/earned-length work is
 * deferred, not cancelled, and the budget goes back to two.
 *
 * What D21 built is NOT reverted — the enlarged IMPRESSIONS table stays, and it
 * is worth more at two slots than it was at four: the extra rows now compete to
 * be one of the two things said instead of padding out slots three and four.
 * The budget is never a quota either way. A palette spends a sentence only on a
 * fact that is true, that no other chosen sentence has said, and (past the
 * first) that carries at least EARNED_BITS of information.
 *
 * Measured over the 867-seed fixture at the default view, this setting against
 * four (test/palette-prose.test.js walks the same fixture):
 *
 *   BUDGET  paragraph p50/p95/max   body p50/max   embed p50/max   sentences
 *   4       318 / 401 / 444         267 / 393      410 / 608       2-6
 *   2       255 / 291 / 328         204 / 277      346 / 502       2-4
 *
 * The meta description is unmoved (p0 97, p50 121, max 159 at both) because the
 * ladder trims it to 160 either way — which is the whole argument for two. The
 * sentence count at two: 1 palette says nothing beyond its identity, 37 say one
 * thing, 829 say two.
 */
const BUDGET = 2;

/**
 * How many sentences a description may spend before a row has to earn its
 * place, and the bar it then has to clear.
 *
 * The bar is the registry's own MIN_BITS_TO_SPEAK, imported rather than copied
 * (D12): 2 bits is a prevalence of 25%, the line past which the registry
 * retires a word from the visible NAME because it "applies to a quarter of
 * everything and stops being a description". D21.7 asks for exactly that bar on
 * sentences, and the split direction rows above exist so a row is scored by the
 * rarity of the sentence it will actually print.
 *
 * It starts at the THIRD sentence because the first two are the description the
 * owner reviewed and kept ("the first half is fine"): the identity sentence
 * plus two impressions is what D20 shipped, and D21 raised the ceiling rather
 * than rewriting what was already approved. The sentences the higher ceiling
 * buys are the ones that have to be worth reading, so those are the ones held
 * to the name's bar. Measured over the fixture, the bar removes 291 candidate
 * third and fourth sentences, every one of them from the four floor rows
 * (`several-colors` 1.40 bits, `brightens` 2.15 only when it lost its anchor,
 * `warming` 1.96, `cooling` 1.88).
 */
const FREE_SENTENCES = 2;

/**
 * See chooseImpressions: the three temperature rows are a floor, not a
 * character. `warm` and `cool` are already documented as the floor of the tone
 * slot, and `warm-and-cool` belongs with them by measurement: at 22.8% it is
 * the LEAST informative row in the table (2.13 bits, under `warm`'s 3.05 and
 * `cool`'s 3.18), and reserving a slot for it cost a rainbow "It travels the
 * whole color wheel" and a one-hue analogous ramp "It moves from blue into
 * cyan". Temperature is a fact about a palette; it is rarely the thing to say
 * about one.
 */
const TEMPERATURE_FLOOR = new Set(["warm", "cool", "warm-and-cool"]);

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
  // sentence states the degenerate case in full ("that renders as one solid
  // color: X at every stop"), and every slot would be describing a gradient
  // that is not there ("nearly gray, with very little color in it" on a pure
  // white field). It used to keep the USE slot, on the argument that a flat
  // color is the most background-like palette there is; D21.1 retired that slot
  // and the argument with it, so a solid palette is now the shortest
  // description the system emits, which is the honest length for it.
  const eligible = (i: Impression) => i.when(c) && !i.restates?.(c) && !c.solid;
  const fired = IMPRESSIONS.filter(eligible).sort((a, b) => {
    // Echoes are DEMOTED, not removed: a palette whose only other true fact is
    // "the colors are cool" is better served by repeating the name's word than
    // by saying nothing. Measured over the fixture: 300 echoed candidates fired,
    // 3 were spoken anyway (98.9% silenced), and those three had nothing else
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
  // One slot is RESERVED for what the colors are like (D20.5: "one or two
  // character sentences: what it feels like and how it moves"). Rarity alone
  // ranks a shape or a seam ahead of the palette's character, because rarity
  // measures how often a fact is TRUE and not how much of the image it
  // describes: a flat, fully saturated periwinkle was told only that its
  // brightness barely changes and that its ends match, while `strong`, `cool`
  // and `one-color` all fired and lost; a fluorescent green got "All the colors
  // are green. The brightness barely changes"; a royal blue to violet to
  // magenta to coral to gold sweep spent both sentences on ramp geometry.
  // Measured before the reserve, 141 of the 867 fixture palettes (16.3%) had a
  // true tone impression that never got said. The tone row still has to WIN its
  // own slot on score, and an echoed one does not qualify (repeating the
  // heading is what the echo demotion exists to prevent), so this reorders
  // rather than overrides: the tone sentence would have been spoken anyway
  // wherever it already outranked the field.
  //
  // TEMPERATURE_FLOOR is excluded because this file already calls those two the
  // floor of the tone slot: `warm` and `cool` are true of 46% and 36% of the
  // corpus and speak only when nothing sharper is true, so reserving a slot for
  // them would replace a real fact with the weakest one available (a flat tan to
  // mauve-gray ramp traded "It is a single brown softened with gray" for "The
  // colors are warm"). A reserve is for character, and those two carry a fifth
  // of a bit more than silence.
  const bestTone = fired.find(
    (i) => i.slot === "tone" && !isEcho(i) && !TEMPERATURE_FLOOR.has(i.id),
  );
  if (bestTone) {
    chosen.push(bestTone);
    slots.add("tone");
  }
  const vetoes = (i: Impression) => [...(i.conflicts ?? []), ...(i.conflictsIn?.(c) ?? [])];
  for (const imp of fired) {
    if (chosen.length >= BUDGET) break;
    if (slots.has(imp.slot)) continue;
    // Past the first sentence, a row has to be worth reading (D21.7). Without
    // this the budget behaves as a quota and every palette runs to four
    // sentences, three of which say what is true of a third of the site
    // ("It passes through several colors between its ends" at 1.40 bits,
    // "It becomes lighter from start to end" at 1.57). The reserved tone
    // sentence is exempt for the same reason it is reserved: it is the
    // palette's character, and the reserve exists because rarity alone ranks a
    // seam ahead of it.
    if (chosen.length >= FREE_SENTENCES && impressionScore(imp) < MIN_BITS_TO_SPEAK)
      continue;
    if (
      chosen.some(
        (other) => vetoes(other).includes(imp.id) || vetoes(imp).includes(other.id),
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

/**
 * The corpus name of the last stop, under the palette's own tone veto.
 *
 * The last listed name is not always the last stop: getUniqueColorNames keeps
 * ramp order but dedupes, so an A→B→A ramp lists [A, B] while the ramp ends back
 * on A. The end hex may only be pinned to a name that actually names the end
 * stop, so the end stop is named again on its own.
 */
const endStopName = (colors: readonly string[], tags: readonly string[]): string =>
  getUniqueColorNames([colors[colors.length - 1]!], {
    max: 1,
    veto: toneNameVeto(tags),
  })[0] ?? "";

/**
 * Whether the two ends are the SAME COLOR, which is a question about colour and
 * not about vocabulary.
 *
 * The identity sentence used to ask whether the two ends carried the same NAME,
 * and a name is a lookup into a 920-entry corpus with its own boundaries: a
 * symmetric arch closing on #000044 and #00003f, 0.0104 apart in OkLab and
 * indistinguishable in the render, landed on the separate entries "night blue"
 * and "dark navy" and shipped "sweeping from night blue (#000044) ... to dark
 * navy (#00003f)" one sentence before "Its two ends match, so it loops with no
 * visible break". Two names and two hex codes for one colour, contradicted by
 * the next line of the same paragraph. Another palette printed "from orangey
 * yellow (#ffc25a) ... to butterscotch (#ffbf58)", a difference of 0.005 in
 * lightness and one degree of hue.
 *
 * LOOP_SEAM is the line the `loops` sentence already promises the eye (one JND),
 * so the two readings of "its ends match" are one constant. Measured over the
 * fixture, 20 palettes have ends within it and 5 of them were being given two
 * names.
 */
const endsMatch = (colors: readonly string[]): boolean =>
  oklabDistance(oklabOf(colors[0]!), oklabOf(colors[colors.length - 1]!)) < LOOP_SEAM;

const oklabOf = (hex: string) => {
  const { r, g, b } = hexToRgb(hex);
  return rgbToOklab(r, g, b);
};

/**
 * The names the identity sentence will print, in order.
 *
 * When the end stop's name is in the name list neither first nor last, the
 * sentence's "to X" was pointing at an INTERIOR colour. It happens when the two
 * ends are close enough that the endpoint rule keeps one name for both (0.05 in
 * OkLab) while the corpus still gives them different words: a mud to dark beige
 * to dim gray ramp read "running from mud to dark beige", naming the middle as
 * the destination and shipping one hex instead of two. The end stop's own name
 * closes the sentence; it is a name the list did not have, so it is added rather
 * than substituted.
 */
function identityNames(colors: readonly string[], named: NamedPalette): string[] {
  const endName = endStopName(colors, named.tags);
  return named.colorNames.length >= 2 &&
    endName &&
    !named.colorNames.includes(endName) &&
    // ...and only when the end is a colour the opening name does not already
    // cover. See endsMatch: appending a second name for the same colour is what
    // produced "from night blue (#000044) ... to dark navy (#00003f)".
    !endsMatch(colors)
    ? [...named.colorNames, endName]
    : [...named.colorNames];
}

/**
 * Whether either end's printed NAME already commits to a family word, and to a
 * different one than the hue bands would say. See the `neighbors` row.
 *
 * The eight family anchors plus the three tone-gated words are the vocabulary
 * `gatedFamily` can produce, so those are the words a name can contradict; a
 * name with no family word in it ("plum", "manila") commits to nothing and
 * leaves the row free to speak.
 *
 * Exported for the same reason gatedFamily is: the tag route recognizes these
 * eleven words as a dimension to filter on (D22.B5), and a second list of them
 * would be a second answer to "which words are family words".
 */
/**
 * The words a family claim may use: the eight anchors plus `gatedFamily`'s
 * three tone rungs.
 *
 * Derived from the partition rather than copied out of it (D12) — and since
 * 2026-08-18 derived ONCE, in data-ops beside the function that returns them
 * (D25.1). The registry offers exactly these eleven as family chips and the
 * retrieval route recognises exactly these as family terms; a second list here
 * is how a chip gets offered for a word its own page does not know.
 */
export const FAMILY_VOCABULARY: readonly string[] = FAMILY_TERMS;

const nameFamilyConflict = (c: Ctx): boolean => {
  const first = c.names[0];
  const last = c.names[c.names.length - 1];
  const claims = (name: string | undefined, word: string | null) => {
    if (!name || !word) return false;
    const said = ` ${name.toLowerCase()} `;
    return FAMILY_VOCABULARY.some(
      (w) => w !== word && said.includes(` ${w} `),
    );
  };
  return claims(first, c.firstFamily) || claims(last, c.lastFamily);
};

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
  const stops = colors.map(hexToOkLch);
  const journey = baseTags?.includes("warming")
    ? ("warming" as const)
    : baseTags?.includes("cooling")
      ? ("cooling" as const)
      : null;
  return {
    f,
    structure,
    has,
    colors,
    stopL: stops.map((s) => s.L),
    stopC: stops.map((s) => s.C),
    solid,
    // "soft" is a chroma claim (a pale passage is a LOW-chroma one) that the
    // high-key test never makes — it measures level and spread only — so soft
    // language carries its own gate: the palette under the pastel bound on
    // average, and no single stop past it either.
    //
    // The ceiling used to sit at NEON_CHROMA, which is 2.7x the pastel bound,
    // and a ceiling that far out lets everything short of literal neon through:
    // "It stays pale and soft from end to end" was printed over a near-white
    // that intensifies into a hot candy pink (last stop C 0.202, 100% of its
    // achievable chroma, and the palette carries a `saturating` tag of its own).
    // A claim about every colour takes the bound every colour has to clear, so
    // the max takes the same PASTEL_CHROMA the mean does. Measured over the
    // fixture the pale-soft row falls 66 → 36 and the pale row 5 → 1; the
    // palettes it drops all end on a stop the eye reads as a real colour.
    softChroma: f.meanChroma < T.PASTEL_CHROMA && f.maxChroma < T.PASTEL_CHROMA,
    evenSpread: f.lightnessRange < EVEN_SPREAD,
    base: gatedFamily(f.chromaPeak),
    firstFamily: gatedFamily(f.firstChromatic),
    lastFamily: gatedFamily(f.lastChromatic),
    firstBand: f.firstHue === null ? null : familyWord(f.firstHue),
    lastBand: f.lastHue === null ? null : familyWord(f.lastHue),
    firstBandFirm: f.firstHue !== null && colorFamilies(f.firstHue).length === 1,
    lastBandFirm: f.lastHue !== null && colorFamilies(f.lastHue).length === 1,
    endHueSeparation:
      f.firstHue === null || f.lastHue === null
        ? 0
        : Math.min(
            Math.abs(f.firstHue - f.lastHue) % 360,
            360 - (Math.abs(f.firstHue - f.lastHue) % 360),
          ),
    names: identityNames(colors, named),
    journey,
    journeyClaim:
      (journey === "warming" && inWarmArc(f.lastHue)) ||
      (journey === "cooling" && inCoolArc(f.lastHue))
        ? journey
        : null,
    series: !solid && structure === "monochrome" ? seriesReading(f, colors) : null,
    // The description's own phrase, so an echo test sees the word the reader
    // will see (the identity sentence renders plainPhrase, not the heading).
    phrase: plainPhrase(named.modifierPhrase),
    endDarkInkReads:
      Math.max(luminances[0]!, luminances[luminances.length - 1]!) >= DARK_INK_LUMINANCE,
    endLightInkReads:
      Math.min(luminances[0]!, luminances[luminances.length - 1]!) <= LIGHT_INK_LUMINANCE,
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
  // Both derived in buildCtx: the impression rows have to be able to ask what
  // this sentence is about to say (see the `opposite-colors` restatement veto),
  // so there is one list and the assembly reads it rather than rebuilding it.
  const endName = endStopName(colors, named.tags);
  const names = ctx.names;

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
    if (names.length >= 2 && (endName === names[0] || endsMatch(colors))) {
      // The ramp leaves its opening color and returns to it.
      //
      // A comma list rather than a chain of "and"s, and an explicit
      // destination. This branch joined EVERY remaining name with " and " and
      // then appended "and back", so a four-name rainbow shipped "through rust
      // and eggplant purple and sapphire and back": three coordinating
      // conjunctions in one clause, which a translator renders literally and
      // which reads as a run-on in most target languages, plus an elliptical
      // "back" with nothing to attach to. 12 of the 21 fixture palettes that
      // take this branch have three or more middles. (The ordinary branch below
      // never has more than two, so it needs no list.)
      return `${opener} running from ${first} through ${serialList(names.slice(1))}, and back to ${names[0]}.`;
    }
    if (names.length === 2 && (structure === "complementary" || structure === "duotone")) {
      const second = `${names[1]}${endHex}`;
      return structure === "complementary"
        ? `${opener} built on two opposite colors: ${first} against ${second}.`
        : `${opener} pairing ${first} with ${second}.`;
    }
    if (names.length === 2)
      return `${opener} ${journeyVerb(f)} from ${first} to ${names[1]}${endHex}.`;
    const middles = names.slice(1, -1).join(" and ");
    return `${opener} ${journeyVerb(f)} from ${first} through ${middles} to ${names[lastIdx]}${endHex}.`;
  };

  const chosen = chooseImpressions(ctx);

  // The view sentence: the ONE place steps, style and angle may appear. Page
  // surfaces only.
  //
  // It used to end ", with the hex codes, CSS, and SVG ready to copy below",
  // which is where the export demand tokens lived. D21.3 cut that clause: the
  // export panel is directly under the paragraph, so telling a reader it is
  // there is telling them what they can already see. The tokens still ship to
  // crawlers, in the meta description's action clause (META_ACTION) and in the
  // JSON-LD, which is the right home for a line written for machines; the test
  // suite asserts they appear THERE and nowhere in the prose.
  const viewSentence = view
    ? `Shown here as a ${styleLabel(view.style)} in ${view.steps} ${
        view.steps === 1 ? "step" : "steps"
      } at ${deg(view.angle)}°.`
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
    colorNames: [...names],
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
 * Measured over the fixture: p50 294, p95 333, max 367 before the ladder,
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
  // ...and the REGISTRY's true terms, all 133 of them where they fire (D25.6).
  // The chip row is selective and the index is not: a term held back from the
  // row — a coefficient fact, the arc language, a characteristic that is true
  // without the margin a chip needs — is still what a query might be looking
  // for, and this line is the retrieval vocabulary D20.7 keeps out of the
  // sentences. Measured over the fixture, it takes the Tags line from a mean of
  // 8.36 words to 18.31 and the whole embed text from 331 to 441 characters;
  // the BODY — the human sentences, which is what D20.7 is about — is unchanged
  // at 182.
  const ctx = characteristicCtx(f, colors, {
    journey: journey === "warming" || journey === "cooling" ? journey : null,
  });
  const tagWords: string[] = [];
  const seen = new Set<string>();
  for (const w of [
    ...modifierTags(f),
    ...(journey ? [journey] : []),
    ...characteristicsOf(f, ctx).map((c) => c.term),
    ...parts.embedTailTags,
  ]) {
    const key = w.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      tagWords.push(w);
    }
  }
  // Same tone veto the title and the chips use: this line is what the index
  // will be built from, so a name the page is not allowed to print must not be
  // the word a query matches on either.
  const names = getUniqueColorNames([...colors], {
    max: 6,
    veto: toneNameVeto(tagWords),
  });
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
 * How much of the run has to render pure black (or pure white) before that
 * universal stops being the ramp's edge and becomes its subject.
 *
 * A majority, and the word is what fixes it there: this constant decides both
 * whether the chip row leads with the universal and whether the sentence says
 * "Most of it is solid white" or "Part of it". "Most" asserts a majority, so the
 * line is a majority. At two fifths, where it sat until 2026-08-18, a palette
 * measuring 45.8% pure white — a minority, 3 of its 7 swatches — was told "Most
 * of it is solid white" and led its chip row with "white" while the same page
 * described it as pairing duck egg blue with rose. The palette this rule exists
 * for is 68.8% pure black with nothing in it but two thin brown edges, and it
 * still clears the line comfortably.
 *
 * Measured over the fixture: 21 black plateaus (shares 0.125 to 1.000) and 6
 * white ones (0.271 to 1.000); 5 clear a half on black and 1 on white, against
 * 5 and 3 at two fifths.
 */
const PLATEAU_DOMINANT = 0.5;

/**
 * How close a stop has to be, in OkLab, to count as the colour a colour-name
 * chip names.
 *
 * Measured, not guessed: over the 867 fixture seeds at 7 steps, the distance
 * from a stop to the corpus hex of the name that stop itself produced is p50
 * 0.026, p90 0.052, p95 0.061, p99 0.080, max 0.110. So 0.08 is "as close to
 * the named colour as a stop the corpus actually calls that name" — the widest
 * radius that still means the word. It is four just-noticeable differences
 * (oklabDistance's own docstring: ~0.02 is one JND), which sounds generous
 * until you remember the corpus has 920 entries over the whole solid and the
 * chip's own stop is already up to 0.08 away from its anchor.
 *
 * Loosening it does not help: at 0.15 a "dark indigo" chip admits a third of
 * the fixture and the word stops meaning anything.
 */
export const COLOR_MATCH_MAX = 0.08;

/**
 * How far apart two colour chips have to sit before they are two suggestions
 * rather than two words for one colour — and WHICH TWO DISTANCES that is asked
 * of.
 *
 * THE DEFECT THIS SHAPE EXISTS FOR (QA round 2, 2026-08-18). The rule used to
 * be one distance (OkLab with lightness weighted to 0.25) between the two
 * STOPS, with a family clause that dropped the bar to one JND whenever the two
 * candidates sat in different hue bands. Both halves failed, in opposite
 * directions, and the QA found both:
 *
 *  - The family clause admitted near-identical colours. `light peach` beside
 *    `wheat` (stops 0.057 apart in plain OkLab, corpus anchors 0.019),
 *    `dark gray blue` beside `charcoal gray` (anchors 0.046), five near-whites
 *    on one pale palette whose ten pairs all sit under 0.055 — every one of
 *    them admitted at the 0.02 floor because the hue that assigns the family is
 *    noise at that chroma. Measured on the destinations (see below), those
 *    pairs are one query wearing two labels.
 *  - The lightness weight refused colours a viewer can plainly tell apart.
 *    A pale apricot and a mid brown measure 0.069 weighted and 0.266 plain; a
 *    light teal and a deep viridian 0.071 and 0.268. 547 of the 867 fixture
 *    rows (63.1%) carried at least one such blocked pair, which is where the
 *    "two chips for a seven-stop ramp" rows came from.
 *
 * So the metric is plain OkLab again — lightness IS how a viewer tells a dark
 * brown from an apricot — and the rule asks the same threshold of two different
 * quantities, because "one suggestion" has two failure modes:
 *
 *   1. the two chips point at the same colour IN THE IMAGE  → distance between
 *      the two STOPS;
 *   2. the two chips lead to the same PAGE                  → distance between
 *      the two LABELS' corpus anchors, which is what the destination ranks and
 *      filters by (tag-search.ts: a colour term admits a palette holding a stop
 *      within COLOR_MATCH_MAX of the anchor, and ranks by that distance).
 *
 * Failing either one makes a pair one suggestion. Test 2 is not a refinement of
 * test 1: `parchment` and `ivory` sit 0.103 apart at the stops and 0.080 at the
 * anchors, and page 1 of the two queries shared 7 of 12 results. Nor is test 1 a
 * refinement of test 2: `dark brown` and `charcoal gray` name two stops 0.068
 * apart — one dark neutral band in the image — from anchors 0.132 apart.
 *
 * WHERE THE ANCHOR NUMBER COMES FROM. Measured over the 867 fixture rows: for
 * every pair of colour chips that co-occurred on a row, the Jaccard of their two
 * destinations (the palettes each query admits, computed with tag-search's own
 * predicate over the same 867), bucketed by the anchor distance:
 *
 *   anchor distance   0-.02  .02-.04  .04-.06  .06-.08  .08-.10  .10-.12  .12-.14  .14+
 *   mean Jaccard      0.42    0.28     0.21     0.18     0.16     0.13     0.12    0.05
 *
 * There is no cliff — destinations blur continuously — so the line is drawn
 * where the overlap approaches the corpus's own background rate for two
 * unrelated colour words (0.05 at 0.18+, 0.13 at 0.11). Under 0.11 sit every
 * pair the QA named as one destination: ivory/parchment 0.080, lavender/light
 * periwinkle 0.102, dark gray blue/charcoal gray 0.046, light peach/wheat 0.019,
 * and the ten pairs of the five-near-whites row (0.021-0.049).
 *
 * WHERE THE STOP NUMBER COMES FROM, and why it is not the same one. The
 * aggregate is flat across it — swept over the fixture at anchor 0.11:
 *
 *   stop sep   colour chips/row   cover err   p90     ends-within   dest Jaccard
 *   0.100      3.44               0.0358      0.0930  93.8%         0.081
 *   0.105      3.38               0.0368      0.0946  93.9%         0.080
 *   0.110      3.34               0.0378      0.0965  93.4%         0.079
 *   0.120      3.20               0.0404      0.1008  91.2%         0.076
 *
 * — the anchor test is doing the destination work, so this one is purely
 * perceptual and the aggregate cannot choose it. The QA's own verdicts can: the
 * pairs it called one region top out at 0.1031 (dark gray blue/charcoal gray;
 * then fuchsia/bright pink 0.1005, parchment/ivory 0.1025) and the pairs it
 * called two visible regions bottom out at 0.1083 (green teal/seaweed; then
 * red wine/dull red 0.1097, rose red/deep orange 0.1236). 0.105 is the middle
 * of that gap, and it is also about twice the corpus's own p90 naming error
 * (0.0536, measured over the 2,893 emitted chips): below two naming errors
 * apart, which of two names each stop gets is noise.
 *
 * THE FAMILY CLAUSE KEEPS ITS LOWER BAR, at a floor that means something. Two
 * stops in different hue bands are two colours at a shorter distance than two
 * stops in one band — a tan beside a sage measures 0.082 and reads as two
 * regions, while two magentas 0.100 apart read as one hot-pink field — because
 * OkLab distance near the neutral axis is small for any hue difference, and the
 * eye is not. The old floor was one JND (0.02), which is noise: it is what put
 * five near-whites, `light peach` beside `wheat` and three dark neutrals on one
 * row each. The measured floor is 0.07, and the whole QA batch fits between the
 * two numbers:
 *
 *   BLOCKED, called one region        cross-family  same-family
 *     five near-whites (ten pairs)     0.021-0.055
 *     light peach / wheat              0.057
 *     dark brown / charcoal gray       0.068
 *     taupe / cement                   0.042
 *     fuchsia / bright pink                          0.100
 *     mint / light cyan                              0.097
 *   ADMITTED, called two visible regions
 *     burlywood / silver               0.082
 *     tan / sage (reported palette)    0.080
 *     rose red / deep orange           0.124
 *     red wine / dull red                            0.110
 *     green teal / seaweed                           0.108
 *
 * NEUTRAL COUNTS AS A FAMILY here, and does not in the namer: a greige band
 * beside a brown is two searches (`cement` and `pinkish brown` return different
 * corpora) where for a NAME it is one colour lightly varied.
 */
export const CHIP_SEPARATION = 0.11;
export const CHIP_STOP_SEPARATION = 0.105;
export const CHIP_CROSS_FAMILY_SEPARATION = 0.07;

/**
 * ...and the palette these three numbers are the bar FOR.
 *
 * THE DEFECT (QA round 3, 2026-08-18). All three bars were absolute, and a
 * palette's spread is not. The whole OkLab diameter of a pastel sand-to-thistle
 * ramp is 0.1425 — smaller than the bar it was being judged by — so its seven
 * visibly different stations could never yield more than two colour chips, and
 * a dusty rose / slate blue / pale sage palette (diameter 0.2037, six colours a
 * viewer can name on sight) emitted `rosy brown | silver`. Measured over the
 * fixture: the 98 palettes with a diameter in [0.10, 0.20) averaged 2.03 colour
 * chips and 4.81 labels against 2.99 distinct corpus names available, and
 * 36.2% of all rows sat at five labels or fewer. At the other end the same
 * absolute bar was too small: a plum-to-lime ramp of diameter 0.5574 spent
 * three of its seven chips on one brown stretch (`coffee`, `cocoa`,
 * `reddish brown`, pairwise 0.095-0.113), and a near-white-to-teal ramp of
 * diameter 0.63 said `light blue` beside `pale blue`.
 *
 * So the question the bar asks becomes the question this system asks everywhere
 * else (D19): "far apart" is a statement ABOUT THIS PALETTE. The three bars are
 * the values at a reference spread and the live bar scales with the palette's
 * own OkLab diameter.
 *
 * The reference is the fixture's median diameter, so half the corpus keeps the
 * numbers measured in the block above and the calibration there still stands
 * where it was taken. Measured over the 867: min 0.000, p10 0.176, p25 0.266,
 * p50 0.386, p75 0.526, p90 0.655, max 0.990.
 *
 * THE CLAMP is not decoration. Below it a flat palette (19 of the 867 measure
 * under 0.10, several exactly 0) would drive the bar to zero and chip every
 * near-identical stop; above it a black-to-white ramp of diameter 0.99 would
 * drive the same-family bar past 0.26 and refuse to name both ends of its own
 * value scale. 0.35 puts the floor at 0.037/0.025 — still above the candidate
 * pass's one-JND floor — and 1.6 puts the ceiling at 0.168/0.112, which is
 * where the QA's own two-visible-regions pairs start (0.108 at the reference,
 * 0.173 scaled).
 */
export const CHIP_SPREAD_REFERENCE = 0.386;
export const CHIP_SPREAD_MIN = 0.35;
export const CHIP_SPREAD_MAX = 1.35;

/**
 * How much of the reference spread this palette has: the multiplier on all
 * three separation bars. The diameter (widest pair) rather than a mean or a
 * span, because the bars are about the widest thing the row has to fit inside.
 */
function chipSeparationScale(labs: readonly Oklab[]): number {
  let diameter = 0;
  for (let i = 0; i < labs.length; i++)
    for (let j = i + 1; j < labs.length; j++)
      diameter = Math.max(diameter, oklabDistance(labs[i]!, labs[j]!));
  return Math.min(
    CHIP_SPREAD_MAX,
    Math.max(CHIP_SPREAD_MIN, diameter / CHIP_SPREAD_REFERENCE),
  );
}

/**
 * The floor the CANDIDATE pass keeps, one level below the selection: two stops
 * closer than one JND are the same colour by any reading, and naming both wastes
 * a corpus scan. Everything above it is offered to spanningColors, which is the
 * row's real rule.
 */
const CHIP_CANDIDATE_FLOOR = 0.02;

/**
 * At most this many colour chips may speak for ONE hue family.
 *
 * THE DEFECT (QA round 3, the D22 reported palette recurring). A tan → sage →
 * pale teal → blue → navy ramp chipped `sea blue | grayblue | dark gray blue |
 * pale brown | navy blue`: four of five colour chips from the blue band, all of
 * them clearing every bar (min pairwise stop distance 0.137) because plain
 * OkLab's longest axis is LIGHTNESS, so one hue can honestly supply four chips
 * by spanning L while the palette's green middle gets nothing. spanningColors
 * ranked a novel family (+2) but never capped a repeated one, and a rank only
 * decides which candidate goes next — it cannot stop the fifth blue when the
 * greens have already collided out.
 *
 * Two, because a family that is genuinely two stations of the image (a mid
 * teal and a navy) is common and worth two links, and a third is the same
 * suggestion a third time: over the fixture the third-and-later chip of a
 * family sat a median 0.148 from its nearest same-family sibling, which is
 * inside the scaled bar on any palette wide enough to have produced it.
 * NEUTRAL is a family here for the same reason it is one in the bar above.
 */
const FAMILY_CHIPS = 2;

/**
 * The bucket a chip belongs to for the family clause: one of the corpus's eight
 * hue bands, or `neutral` when the stop has no usable hue (the same dual
 * chroma/saturation reading everything else in this system uses, via
 * stopHasHue) — or when it is too dark to show one, which is gatedFamily's
 * near-black floor asked of a single stop.
 *
 * The floor is why the family CLAUSE is not a hue lottery at the bottom of the
 * solid. Two black stops of a dark duotone (#000020 at L 0.110 and #170000 at
 * L 0.128) were being read as blue and red, taking the 0.07 cross-family bar,
 * and spending two of a row's five colour slots on one black band.
 */
const chipFamilyOf = (hex: string): string => {
  const lch = hexToOkLch(hex);
  if (lch.L < NEAR_BLACK_L && lch.C < T.FAMILY_CHROMA) return "neutral";
  return stopHasHue(hex) ? colorFamily(lch.h) : "neutral";
};

/**
 * How far the link-label preference below may reach for a plainer word: two
 * JND, which is what color-utils' NAME_TIE already reaches to correct a
 * CATEGORY error on the same corpus ("about two JND", measured there over
 * 5,895 stops). The two are the same kind of correction — a name that is
 * metrically nearest but wrong for the job — so they get the same reach.
 *
 * Measured over the fixture's 110 unsearchable-named stops: at one JND 93 of
 * them find a replacement and 17 keep the survey word; at two JND 108 move and
 * 2 keep it (their nearest alternative sits at 0.042). That 15 is the whole
 * difference and it is the class the owner would notice — "dirty purple" and "mud brown" are exactly the
 * labels the complaint is about, and their alternatives (dark mauve, chestnut)
 * sit just past one JND.
 */
const CHIP_LABEL_REACH = 0.04;

/**
 * ...and how far it may reach to correct a CATEGORY error: three JND.
 *
 * Further than the reach above, because the two failures cost different things.
 * A survey word is an ugly label on the right colour; a cross-family name is
 * the WRONG COLOUR, and the destination makes that concrete — a colour chip's
 * page ranks by OkLab proximity to the named anchor (tag-search.ts), so
 * `dark forest green` on a dark teal stop opens on a page of pure greens with
 * no teal anywhere in it. The corpus already tries this correction inside
 * nearestNamed and gives up at NAME_TIE; the chip carries on a little further
 * because it is a promise about where a click leads.
 *
 * Measured over the fixture's 6,069 named stops: 84 (1.4%) carry a name from
 * another family, and 79 of them find a same-family replacement within this
 * reach — dark forest green -> dark teal (55 degrees of hue error, the reported
 * case), dark blue gray -> dark indigo, midnight -> dark indigo, purplish gray
 * -> twilight. At the 0.04 reach 52 move and the reported case is not one of
 * them (its nearest cyan word sits at +0.0434); at 0.08 all 84 move, for five
 * more stops and a reach wide enough to cross a lightness band.
 */
const CHIP_CATEGORY_REACH = 0.06;

/**
 * Can this stop answer to a name of that class? The chip's category guard AND
 * the destination's — one function, because a chip that its own page rejects is
 * the defect this whole file is about.
 *
 * A RADIUS ALONE IS NOT THE WORD, which is where this test comes from. OkLab
 * distance is small everywhere the gamut is small, and the gamut is smallest
 * exactly where the neutrals live: at L 0.81 the sRGB ceiling is about 0.05 to
 * 0.10 depending on hue, so a ball of COLOR_MATCH_MAX around #c0c0c0 encloses
 * the whole low-chroma neighbourhood at that lightness. Measured on the
 * reported case, a `silver` chip: 24 of 24 results passed the radius and 4 of
 * them had a stop a person would call neutral. The other 20 matched on warm
 * taupe (#ccbeb2), sage (#bdc7ba) and lilac (#bfc0e0) — hues 5 to 284, all
 * "silver". Over the 867-seed stand-in the guard takes `silver` from 207
 * palettes to 81.
 *
 * `stopHasHue` is the dual absolute/relative reading (D19) every other surface
 * uses, so a pale sky tint counts as blue and a near-black at the top of its
 * tiny gamut does not count as teal. A NEUTRAL name matches only stops with no
 * usable hue, and a coloured name only stops that can claim its family.
 *
 * THE NEUTRAL HALF IS SYMMETRIC SINCE QA ROUND 2. It used to exempt neutral
 * names on the argument that "a name with no colour of its own makes no hue
 * claim to be wrong about" — but the retrieval filter never agreed: the `silver`
 * defect made it refuse neutral names on tinted stops (20 of 24 results matched
 * on taupe, sage and lilac), so a `charcoal gray` chip on a dark teal stop led
 * to a page its own palette is not on. Measured over the fixture, 97 of 2,895
 * emitted colour chips (3.35%) failed their own destination's filter this way
 * before the two rules were made one.
 *
 * `colorFamilies` rather than `colorFamily` on the chromatic side: a hue within
 * eight degrees of a band edge can honestly claim both neighbours, which is the
 * corpus's answer (FAMILY_EDGE_MARGIN) and stops the guard from firing on a
 * rounding of the partition.
 */
export function stopInClass(hex: string, family: string | undefined): boolean {
  return !family || stopClasses(hex).has(family);
}

/**
 * The classes a stop can answer to: its hue band (both, on a band edge) or
 * `neutral`. Separate from the predicate above so a caller asking the question
 * of the whole corpus reads the stop once.
 *
 * The near-black floor is gatedFamily's, for gatedFamily's reason, and it has
 * to be the same floor because these two functions are what the chip and its
 * destination each ask about a dark stop. Without it a #000800 stop answered to
 * `green` and not to `neutral`, so an `almost black` chip — the plainest true
 * word for that swatch — was refused by its own page. 3 such chips over the
 * fixture, plus `dark blue gray` and `purplish gray` failing the mirror image
 * of it.
 */
function stopClasses(hex: string): Set<string> {
  const lch = hexToOkLch(hex);
  if (lch.L < NEAR_BLACK_L && lch.C < T.FAMILY_CHROMA) return NEUTRAL_ONLY;
  return stopHasHue(hex) ? new Set(colorFamilies(lch.h)) : NEUTRAL_ONLY;
}

const NEUTRAL_ONLY = new Set(["neutral"]);

/** The class each corpus entry speaks for, for the category guard. */
const CORPUS_FAMILY = new Map(NAMED_COLORS.map((c) => [c.name, c.family] as const));


/**
 * The row's ceiling, and the colour-name ceiling inside it (D22.B2: "raise the
 * cap from 6 to about 10-12, but keep the earned-not-padded rule").
 *
 * Neither is what actually decides the length. The colour names stop when the
 * palette runs out of perceptually separate ones (mean 3.38 of a possible 8),
 * the compounds stop when the co-firing pairs run out, and the single words
 * stop when the palette's true facts do. Re-measured over the 867 fixture rows
 * after QA round 2, the row lands at a mean of 5.96 labels
 * (2/3/4/5/6/7/8/9/10/11 = 4/43/107/186/214/175/94/31/11/2) against 5.24 before
 * that round and 3.66 under the old cap of 6, and the 12 binds on nothing — the
 * longest true row is 11. That is the point: the ceiling is a guard rail, not a
 * target, and a padded row of twelve would be the "white isn't a good suggested
 * tag" complaint at four times the volume.
 */
export const CHIP_MAX = 14;
/**
 * ...and the colour-name ceiling inside it, raised from 6 on 2026-08-18.
 *
 * The colour axis is the only one whose honest supply scales with the palette:
 * a palette has exactly one structure, at most two tone words, one temperature
 * and rarely two families, so a row can only reach D22.B2's "about 10-12" if a
 * rich palette may name every colour it actually contains. 8 is above the
 * default view's 7 stops on purpose — it binds on nothing at 7 steps and stops
 * a 24-step ramp from spending the whole row on colours.
 */
const NAME_CHIPS = 8;

/**
 * At most this many compounds, raised from D17's 2 (D22.B3: "the owner
 * explicitly wants combo tags; raise their allowance above the current max 2 if
 * the pairs are genuinely co-firing and non-contradictory"). It is a ceiling,
 * not a quota, and the measurement says the widened GRAMMAR did the work rather
 * than the raised cap: 330 of the 867 rows carry a compound where 169 did, and
 * none reaches three. Two is the practical maximum because a compound's head
 * must be a family or a structure word, a palette has exactly one structure and
 * rarely two families, and two compounds may share no word at all. The 3 stays
 * as the stated allowance so a later registry change (a second family firing,
 * `forest` shipping) is not silently capped.
 */
const COMPOUND_CHIPS = 3;

/**
 * WHICH WORDS MAY BE A CHIP is the registry's question now (D25.5), and it is
 * `Characteristic.tagOnly`.
 *
 * This used to be a four-word allow-list (`warm`, `cool`, `light`, `vivid`)
 * bolted onto the NAME's `spoken` flag, because the row drew its facts from the
 * 22 chip-eligible DESCRIPTORS and `spoken` answers a different question — how
 * much a name's two slots can afford. The registry answers the chip's question
 * directly for all 133 terms: a term reaches a row when it is true with margin,
 * discriminating, and not held back as a measurement rather than a fact. The
 * four words are all in it and all still chippable; what is gone is the
 * hand-maintained list.
 */

/**
 * The word a CHIP says for a descriptor: the spoken word, then the plain one.
 *
 * One word moves, and it is the one D20 already moves for the description:
 * `complementary` is scheme jargon, PLAIN_WORD maps it to `duotone`, and the
 * page was printing "duotone" in the prose D20 governs and "complementary" in
 * the link a visitor is supposed to click. D22.B4 asks for the plainer
 * searchable term and the house already has one.
 *
 * "RETRIEVAL FOLLOWS FOR FREE" WAS FALSE, and QA round 3 measured it: this
 * docstring used to argue that tag-search's term table, being built from
 * the registry's word AND its spoken word, would pick the rewrite up — but
 * `duotone` is the OTHER structure descriptor's word, so `duotone` resolved
 * only to `duotone` and a complementary palette's own chip led to a page it is
 * excluded from. 57 emissions over the fixture (29 bare, 28 compounds), the
 * largest single cause of the 117 self-failing chips on 86 rows.
 *
 * So it is exported, and tag-search builds its term table from THIS function.
 * The chip and its destination now read one dictionary by construction, which
 * is the only arrangement that cannot drift.
 */
export const chipWord = (d: Descriptor) => plainPhrase(spokenWord(d));

/**
 * The words a COLOUR chip may not wear, because the destination reads them as
 * another dimension.
 *
 * Built from the two vocabularies that outrank the corpus in `resolveTerm`
 * (tag-search): every registry spelling — the tag word, the spoken word and the
 * chip word — and the eight family anchors plus their partition. Built here
 * rather than restated there for the same reason CHARACTERISTIC_TERMS imports
 * `chipWord`: a word must not be able to become chippable-but-unfilterable by
 * being added to one list and not the other.
 *
 * Measured against the corpus, it removes 11 distinct colour-chip labels that
 * are also dimension words (`violet`, `ocean`, `blue`, `sand`, `neon`, `light`,
 * `warm`, `cool`, `vivid`, `pink`, `green`) from the colour axis. Every one of
 * them still reaches the row through the axis that actually decides it.
 */
const RESERVED_LABEL = new Set<string>([
  ...DESCRIPTORS.flatMap((d) => [d.word, spokenWord(d), chipWord(d)]),
  ...FAMILY_VOCABULARY,
]);

// ...and DELIBERATELY NOT the registry's 26 extended hue names, though they are
// dimension words too (D25.5). 24 of them are corpus entries — `navy`, `teal`,
// `gold`, `salmon`, `mint` — and they are among the best colour labels the
// corpus has; reserving them would push a stop with one navy swatch onto a
// worse word, while the hue-axis term only fires when a QUARTER of the ramp
// answers to the name. What makes that safe is the destination: `resolveTerm`
// gives such a label BOTH readings and a palette satisfies it under either, so
// neither emitter can link to a page its own palette fails.


/**
 * The warm and cool arcs, in OkLCh degrees: the `warm` and `cool` descriptors'
 * own meanHue bounds (palette-modifiers.ts), restated as BANDS.
 *
 * palette-prose.test.js sweeps meanHue over both descriptor tests and asserts
 * the recovered edges are exactly these four numbers, so the two cannot drift
 * apart silently — D12's "import registry constants, never copy their values"
 * with a test standing in for the import, because what the registry exports is
 * a closure over a mean and what this needs is the band inside it.
 */
const WARM_BAND: readonly [number, number] = [330, 120];
const COOL_BAND: readonly [number, number] = [150, 300];

/**
 * How much of the palette a temperature chip has to describe: half.
 *
 * The registry decides warm/cool from `meanHue`, a CHROMA-WEIGHTED circular
 * mean, and that is the right answer to "which way does this palette lean" and
 * the wrong one to "would a person looking at it call it warm". A circular mean
 * is not robust on a bimodal hue distribution, and the QA round found the case:
 * a neon rainbow of two magentas (chroma 0.290 and 0.216) against four mint,
 * aqua and cyan stops (0.05 to 0.10) measures meanHue 3.8 and chipped `warm`
 * over an image whose right 60% is cool. The registry's own `cooling` tag fires
 * on the same palette.
 *
 * This is not a threshold change: the tag, the name and the prose all still say
 * what the registry says (D2). It is the chip declining to make a promise the
 * image does not keep, the same deference palette-name.ts's `structureIsSayable`
 * already applies to structure words — measured on a dense sample, spoken only
 * when the visible palette agrees.
 *
 * Measured over the 867 fixture rows, of which 711 carry a temperature tag at
 * all: it removes `warm` from 46 (5.3% of all rows) and `cool` from 21 (2.4%),
 * 67 rows in total (7.7%). All 67 end with no temperature chip, because the two
 * registry tests partition the wheel and cannot both fire — that is the cost,
 * and it is the right one: those rows had a temperature word that half their
 * own image contradicts. (On five of the 67 a colour NAME still opens with the
 * word, "cool gray" or "warm gray"; that is the corpus describing one stop, not
 * the row claiming a temperature.)
 */
const TEMPERATURE_CHIP_SHARE = 0.5;

/**
 * How much of the palette a FAMILY chip has to cover: a third.
 *
 * Lower than the temperature bar on purpose. Warm and cool partition the wheel
 * between them, so half is the only honest majority there; the families are
 * eight bands, and a third of a palette in one band is already a wide
 * plurality. Swept over the fixture (rows whose plurality family clears the
 * bar, before the redundancy guard): 0.25 -> 749, 1/3 -> 520, 0.5 -> 293,
 * 0.6 -> 159. A quarter is two stops of seven, which is not a family; a half
 * refuses the word to any palette that spends a third of itself elsewhere,
 * which is most of the corpus.
 */
const FAMILY_CHIP_SHARE = 1 / 3;

/**
 * ...and how much of the OPPOSITE pole ends the claim, whatever the majority
 * says (QA round 3).
 *
 * A majority is not the whole test, because temperature is the one axis whose
 * two words are each other's negation. The reported palette measures cool 0.523
 * and warm 0.432 — a majority, so the bar above passed it — over an image that
 * runs yellow, mint, cyan, navy, black, maroon, RED, whose two most chromatic
 * stops are the warm ones (#ff0000 at C 0.258 and #ffe329 at 0.182). Chipping
 * `cool` there tells a visitor the palette is cool when nearly half of it is
 * the opposite, and nothing else on the row spoke for the warm half.
 *
 * The number is the registry's own two-pole line: `hasSpectrumPoles` calls a
 * palette a rainbow when both Itten arcs hold a tenth of its chromatic mass,
 * and warmCoolContrast — this file's own detector, which fires on the reported
 * palette — draws the same line at a quarter. A quarter of the image being the
 * other temperature is not a temperature.
 *
 * Measured over the 867: 198 rows hold both poles at 0.25 or more, 90 of them
 * were chipping exactly one temperature word, and those 90 lose it. What they
 * gain in exchange is the directional colour chip (D23.1), which says the
 * warm-to-cool journey in the vocabulary a visitor actually searches.
 */
const TEMPERATURE_OPPOSITE_MAX = 0.25;

/**
 * SUBSUMED BY THE PROMINENCE RULE SINCE D25.5, and kept for the day it is not.
 *
 * The row's temperature candidates now come from the registry's STRONG band —
 * 85% of the chromatic mass inside the arc — and the two arcs do not overlap,
 * so the opposite pole can hold at most 15% and can never reach the quarter
 * that ends the claim. Measured over the fixture: this gate now removes zero
 * rows, where it removed 154 when the row took every fired descriptor.
 * palette-prose.test.js asserts that zero, so a loosened strong band shows up
 * here as a count rather than as a wrong chip.
 */
const temperatureHonest = (word: string, f: PaletteFeatures): boolean => {
  const band = word === "warm" ? WARM_BAND : word === "cool" ? COOL_BAND : null;
  const opposite = word === "warm" ? COOL_BAND : WARM_BAND;
  return (
    !band ||
    (hueBandShare(f, band[0], band[1]) >= TEMPERATURE_CHIP_SHARE &&
      hueBandShare(f, opposite[0], opposite[1]) < TEMPERATURE_OPPOSITE_MAX)
  );
};

/**
 * Survey words a LINK may not carry.
 *
 * This is a LINK-LABEL preference and explicitly NOT corpus censorship. The
 * owner restored these names deliberately (D8: "undo those changes … i don't
 * care"), they stay in the corpus, they still name stops, and they may still
 * appear in the palette's description and in its title. What changes is only
 * what a CHIP says, because a chip is a query and a link: nobody types "ugly
 * blue" into a palette search, and a row of links captioning the visitor's own
 * palette with an insult is a row nobody clicks. D22.B4: "among candidate names
 * within about one JND prefer the plainer, more searchable term (marine blue
 * over ugly blue)".
 *
 * The words are the survey's disgust vocabulary, matched whole. Descriptive
 * survey words that merely sound unglamorous are NOT in it — `dull`, `drab`,
 * `murky`, `faded`, `swamp`, `slime`, `dead` all stay, because "olive drab" and
 * "dull teal" are ordinary design vocabulary and a person does search them.
 *
 * `pig`, `bruise` and `icky` joined the list in QA round 2, which found
 * `pig pink` captioning a pastel rose band (#f698a7). They are the same class
 * one word wider than the first pass wrote it: the colour named after something
 * repellent rather than described. The corpus's alternatives sit a rounding
 * away — for that hex `rose pink` is 0.0005 farther and `faded pink` 0.0025 —
 * so the cost of the preference here is nothing at all. 8 of the 867 fixture
 * palettes hold a stop the corpus calls `pig pink`; none of them says it on a
 * link now.
 */
// `bland` and `drab` joined in QA round 5, from a row reading
// `drab | bland | light blue gray | charcoal`: they are the same class as the
// bare nouns — a word that does not read as a colour — with a fourth cause,
// which is that they read as a VERDICT ON THE PALETTE ("this palette is bland")
// rather than as a name for one of its stops. The corpus barely prefers either:
// on the reported palette `bland` sits 0.0312 from its stop against
// `greenish gray` 0.0322 and `putty` 0.0328, both inside CHIP_LABEL_REACH, so
// the repair has somewhere to go. Bare only — `drab green` and
// `olive drab green` are ordinary colour names and keep working.
const UNSEARCHABLE_LABEL =
  /(^|[ -])(ugly|dirty|muddy|mud|sick|sickly|vomit|puke|poop|poo|barf|snot|booger|piss|diarrhea|gross|nasty|shit|bile|dung|pig|bruise|icky)([ -]|$)/;

/**
 * GLUED spellings a LINK may not carry.
 *
 * The corpus holds ten entries that are one word only because someone wrote
 * them that way. Four are CSS keywords with a modifier glued on — darkblue,
 * darkgreen, lightblue, lightgreen — and six glue two COLOUR words together:
 * bluegray, bluegreen, grayblue, greenblue, orangered, yellowgreen. Nobody
 * types "grayblue" into a palette search, and the corpus already holds the
 * spaced vocabulary for the same colours, so this is the same link-label
 * preference as the list above with an orthographic cause instead of a lexical
 * one. D22.B4's rule word for word: "among candidate names within about one JND
 * prefer the plainer, more searchable term".
 *
 * The colour+colour half joined in QA round 3, which found the class the first
 * pass missed: 35 of the 867 fixture rows emitted one, and one row carried
 * `blue gray` and `grayblue` SIDE BY SIDE — the same two words spaced and
 * glued, reading as one phrase and leading to two different pages. The plain
 * alternative is inside CHIP_LABEL_REACH in every case measured (`gray blue`
 * sits 0.050 from the reported stop against grayblue's 0.033).
 *
 * Written as a shape rather than a list so a later corpus paste cannot
 * reintroduce the class silently; measured against the corpus it matches
 * exactly those ten entries and nothing else.
 */
const UNSPACED_LABEL =
  /^(dark|light|medium|deep|pale|hot|bright|cool|warm|mid|blue|green|gray|grey|orange|yellow|red|purple|violet|pink|brown|cyan|teal)(blue|green|red|gray|grey|pink|purple|yellow|orange|cyan|violet|brown|salmon|slate|olive|khaki|turquoise|magenta|coral|orchid|goldenrod)$/;

/**
 * ...and the bare NOUNS the corpus inherited that do not read as a colour.
 *
 * Same link-label preference, third cause: a chip has to tell a visitor it is a
 * colour, and `peru` and `gainsboro` are a country and an English town. Every
 * other proper noun in the corpus carries a colour word beside it — "carolina
 * blue", "barbie pink", "tiffany blue", "prussian blue" — and reads as a colour
 * on sight, so the class is exactly the bare ones. `blood` joined them in QA
 * round 3, from the same shape and the same evidence: the corpus's own blood
 * entries that a person would search are `blood red`, `blood orange` and
 * `dried blood`, all of which carry the colour word, and the bare one was
 * captioning #720500 where `maroon` sits 0.031 away and `dark red` 0.056. The
 * corpus keeps all three names and the description may still use them (D8);
 * this is only what a LINK says.
 *
 * Measured over the fixture: 31 palettes hold a stop the corpus calls
 * `gainsboro` and 14 one it calls `peru`, and both words have a plain
 * alternative well inside CHIP_LABEL_REACH — `light gray` sits 0.028 from
 * gainsboro's own hex and `dull orange` 0.019 from peru's. Neither word
 * appears on a chip row now, and `light gray` labels 25 of them.
 */
const OBSCURE_LABEL = /^(peru|gainsboro|blood|bland|drab)$/;

/**
 * ...and the survey's COINAGES, which are not words at all.
 *
 * Fourth cause, and the last of the link-label classes (QA round 3). Two
 * shapes, both from the xkcd colour survey and both matched against the corpus
 * so the rule is exactly its measured extent:
 *
 *  - a portmanteau nobody spells: `urple` (corpus: `light urple`, the only
 *    entry, captioning #a875e8 where `medium purple` sits +0.0106 away and
 *    `light purple` +0.0129 — both inside CHIP_LABEL_REACH);
 *  - a NEGATION, `off X` (corpus: off blue, off green, off white, off yellow).
 *    "off yellow" was labelling #ffeb00 — L 0.927, C 0.195, the most saturated
 *    stop in its palette and the brightest thing in the render — because the
 *    survey's word for a dirty yellow happens to sit 0.025 from pure yellow.
 *    A negation is not a query: nobody searching a colour types what it is not.
 *
 * This is a LINK-LABEL preference, not corpus censorship, on exactly the terms
 * the three classes above are: the words stay in the corpus, they still name
 * stops, and the description and the title may still say them.
 */
const COINED_LABEL = /(^|[ -])urple([ -]|$)|^off[ -]/;

/**
 * Corpus adjectives a LINK may not carry ON THIS PALETTE, because the row
 * itself says the opposite two chips away.
 *
 * CONTRADICTED_BY is the table the NAME already uses for this, and
 * `toneNameVeto` reads only its loudness half on purpose: for a heading, a
 * slightly-off adjective inside a colour name is cosmetic, and vetoing every
 * `faded`/`dusty`/`grayish` name on a vivid palette would rewrite a lot of
 * honest words for a cosmetic gain.
 *
 * A CHIP is not a heading. It is a query whose page ranks by proximity to the
 * named anchor, so `faded red` on a palette measuring 0.94 mean saturation is
 * both a contradiction a reader can see (the same row says `vivid` and `vivid
 * sunset`) and a measurably worse destination: the anchor it ranks by is duller
 * than anything the palette owns. So the chip reads the WHOLE row, and it can
 * afford to, because unlike the name it has a bounded repair — the nearest
 * alternative inside CHIP_LABEL_REACH, or the original word if there is none.
 *
 * Temperature is added here and is not in CONTRADICTED_BY, because the name has
 * no temperature words to contradict: the corpus does ("warm blue", "cool
 * gray"), and `warm blue` sitting beside a `cool` chip is the same defect in
 * the same row.
 */
const CHIP_CONTRADICTION: Record<string, readonly string[]> = {
  warm: ["cool"],
  cool: ["warm"],
};

/**
 * The full contradiction veto for a chip label, from the palette's own tags.
 * Cached like `toneNameVeto`, for the same reason: the editor rebuilds this row
 * on every slider tick and there are only a handful of distinct answers.
 */
const chipVetoCache = new Map<string, ((name: string) => boolean) | undefined>();
function chipToneVeto(tags: readonly string[]): ((name: string) => boolean) | undefined {
  const key = tags.join("+");
  const cached = chipVetoCache.get(key);
  if (cached !== undefined || chipVetoCache.has(key)) return cached;
  const banned = new Set<string>();
  for (const tag of tags) {
    for (const w of CONTRADICTED_BY[tag] ?? []) banned.add(w);
    for (const w of CHIP_CONTRADICTION[tag] ?? []) banned.add(w);
  }
  const words = [...banned].sort();
  const veto = words.length
    ? (() => {
        const re = new RegExp(`(^|[ -])(${words.join("|")})([ -]|$)`, "i");
        return (name: string) => re.test(name);
      })()
    : undefined;
  chipVetoCache.set(key, veto);
  return veto;
}

/** Where each corpus entry sits, for measuring how far a relabel moved. */
const CORPUS_LAB = new Map(NAMED_COLORS.map((c) => [c.name, c.lab] as const));

/** ...and the registry's gate for the 26 words that have one. See chipName. */
const HUE_NAME_GATE = new Map(GATED_HUE_NAMES.map((g) => [g.term, g] as const));

/**
 * Do two chip LABELS lead to the same page? The destination is a ball of
 * COLOR_MATCH_MAX around the label's corpus anchor (tag-search.ts), so two
 * anchors closer than CHIP_SEPARATION are two spellings of one query — measured
 * over the fixture as destination Jaccard, see CHIP_SEPARATION.
 *
 * A name with no anchor cannot be looked up and cannot collide; every label the
 * row emits is a corpus entry, so that branch is a guard rather than a case.
 *
 * `scale` is the palette's own spread against the reference one — see
 * CHIP_SPREAD_REFERENCE. It defaults to 1 for the callers that ask the question
 * of two labels rather than of a palette.
 */
function anchorsCollide(a: string, b: string, scale = 1): boolean {
  const la = CORPUS_LAB.get(a);
  const lb = CORPUS_LAB.get(b);
  return !!la && !!lb && oklabDistance(la, lb) < CHIP_SEPARATION * scale;
}

/**
 * The corpus name for a stop, as a chip may say it. `raw` is the name the
 * corpus already gave that stop — the row has it in hand, and re-deriving it
 * costs a second 920-entry scan per candidate: +181us on a row that takes about
 * a millisecond, on the path the editor re-runs every slider tick. Threaded
 * through instead. The row costs 2.40ms (median of 20 passes over 200 fixture
 * palettes), against 1.45ms after QA round 2 and 1.01ms before it. Round 3's
 * 0.95ms buys the destination test below (asked of all 920 corpus entries on a
 * repair), the widened redundancy test, and the journey labels; 0.6ms of it was
 * bought back by testing DISTANCE before rejection in nearestChipName. The
 * island rebuilds this once per slider tick and a tick has 16ms.
 *
 * Implemented through the corpus's own veto mechanism rather than a rename
 * table, so the replacement carries the same category guard as the original —
 * the alternative is simply the nearest name that is not one of the words
 * above.
 *
 * NEAREST IN PLAIN OKLAB, not by the corpus's naming rule (QA round 2). The
 * corpus ranks candidates with a hue-error term, which is right when choosing a
 * NAME (hue fidelity is what makes a name feel correct) and wrong when choosing
 * a DESTINATION: a colour chip's page is filtered and ranked by OkLab proximity
 * to the anchor (tag-search.ts), so the replacement should be the closest
 * anchor the visitor could be sent to. The reported case is a #a29c5c stop
 * whose corpus name `baby shit brown` (0.0554) was vetoed and replaced by the
 * hue-rule's answer `brown yellow` (0.0557) — another survey compound, 0.0003
 * away — while `dark beige` (0.0316), `dark sand` (0.0352) and `dark gold`
 * (0.0547) sat closer and unvetoed. Nearest-in-OkLab picks `dark beige`, which
 * is also the plainer word D22.B4 asks for: on the replacement path the two
 * preferences point the same way, because the survey's vocabulary is what the
 * hue rule was reaching past the plain words to reach.
 *
 * It only ever fires on those words, and only when the alternative is within
 * one JND, so it cannot quietly flatten the corpus's specific vocabulary.
 * Measured over the fixture's 3,437 named stops: 110 (3.2%) carry an
 * unsearchable word and 108 of them move within CHIP_LABEL_REACH ("ugly blue" →
 * "peacock blue"/"denim", "dirty blue" → "teal blue", "vomit" → "pea soup
 * green", "piss yellow" → "maize", "dirty purple" → "dark mauve"). The other 2
 * keep the survey word because nothing better sits within reach, and nothing
 * outside the word list moves at all: a true odd name beats a plain wrong one.
 *
 * The wider preference was measured and rejected. Ranking every name within one
 * JND by how "plain" its vocabulary is (head word in BASIC_COLORS, or every
 * word in an ordinary colour vocabulary) moved 1,360 and 1,722 of the 3,437
 * instead of 93, and the moves were losses: tangerine → dark orange, fuchsia →
 * magenta, midnight → dark navy blue, apricot → pale salmon. Specific is what
 * makes a colour name a good query; only the insults are the problem.
 *
 * NULL IS AN OUTCOME (QA round 3). Two of the reasons a label is rejected are
 * COSMETIC — a survey word, a glued spelling, an adjective the row contradicts,
 * a name from the wrong family — and for those an unrepairable stop keeps its
 * best available word, because a slightly odd row beats a missing band. Three
 * of them are STRUCTURAL: the label duplicates one the row already carries, its
 * destination is one the row already offers, or it sits farther from its own
 * stop than COLOR_MATCH_MAX, which is the emitting palette failing its own
 * chip's filter. There the missing-band argument does not hold — either the
 * band is already named, or the chip is a link to a page this palette is not
 * on, which is the exact failure this file exists to prevent (see the
 * COLOR_MATCH_MAX docstring). So when the repair cannot clear a structural
 * reason, the caller gets null and the stop simply does not chip.
 *
 * Measured over the fixture before this: 51 emitted chips sat beyond
 * COLOR_MATCH_MAX from the stop they named (`grape purple` on a near-neutral
 * plum-grey at 0.0886, `dark indigo` on #282333 at 0.097, `almost black` 7,
 * `dark teal` 5, `dark slate blue` 5) and 117 of 5,294 chips (2.21%) failed
 * their own destination's filter one way or another.
 */
function chipName(
  hex: string,
  raw: string,
  veto: NameVeto | undefined,
  /** The palette's own contradiction veto; see chipToneVeto. */
  tone?: (name: string) => boolean,
  /** Labels already on the row, for the containment repair. */
  taken: readonly string[] = [],
  /** The palette's spread against the reference one; see anchorsCollide. */
  scale = 1,
  /**
   * Every stop of the palette, for the destination test. Defaults to the one
   * stop being named, which is what a caller holding a single swatch can say.
   */
  stops: readonly string[] = [hex],
): string | null {
  const lab = oklabOf(hex);
  // ...and a word whose own page would not hold this palette.
  //
  // TWO RADII, because the repair and the veto ask different questions. The
  // REPAIR prefers a name close to the very stop it names — that is what makes
  // the word feel like a description of that swatch. The VETO asks the
  // destination's own question, verbatim: `/palettes/{name}` admits a palette
  // holding ANY stop of the label's class within COLOR_MATCH_MAX of its anchor
  // (tag-search's termMatch), so a chip is a broken link only when NO stop
  // qualifies. Asking the stricter question of both was measured and rejected
  // in QA round 3: it silenced a near-black purple ramp entirely — every corpus
  // name sits 0.09-0.11 from the stop it named, while `almost black` is 0.050
  // from the stop two along and its page holds the palette comfortably.
  const farFromItsOwnStop = (name: string) => {
    const anchor = CORPUS_LAB.get(name);
    return !!anchor && oklabDistance(lab, anchor) > COLOR_MATCH_MAX;
  };
  // Read ONCE, not once per corpus entry: the repair below asks this of all 920
  // names, twice, and re-deriving each stop's hue and class set inside that
  // loop measured +1.6ms on a row that has 16ms of slider tick to live in.
  const stopFacts = stops.map((h) => ({ lab: oklabOf(h), classes: stopClasses(h) }));
  const failsItsOwnPage = (name: string) => {
    const anchor = CORPUS_LAB.get(name);
    if (!anchor) return false;
    const family = CORPUS_FAMILY.get(name);
    return !stopFacts.some(
      (f) =>
        (!family || f.classes.has(family)) && oklabDistance(f.lab, anchor) <= COLOR_MATCH_MAX,
    );
  };
  // The classes this stop can answer to, resolved ONCE. `stopInClass` re-reads
  // the stop's hue, and the repair below asks the question of all 920 corpus
  // entries — twice, if the first pass finds nothing.
  const classes = stopClasses(hex);
  const gated = hexToOkLch(hex);
  const failsItsGate = (name: string) => {
    const gate = HUE_NAME_GATE.get(name);
    return !!gate && !hueNameFits(gate, gated);
  };
  const miscategorized = (name: string) => {
    const family = CORPUS_FAMILY.get(name);
    return !!family && !classes.has(family);
  };
  // See the structural list below. `lch` is this stop; the word is the claim.
  const temperatureMisread = (name: string) => {
    const claim = /(^|[ -])(warm|cool)([ -]|$)/.exec(name.toLowerCase())?.[2];
    if (!claim) return false;
    const h = hexToOkLch(hex).h;
    const isWarm = h >= 330 || h < 120;
    const isCool = h >= 150 && h < 300;
    return claim === "warm" ? isCool : isWarm;
  };
  // The STRUCTURAL reasons, split out because they are the ones an unrepairable
  // stop may not fall back onto. See the docstring.
  const structural = (name: string, strict = true) =>
    redundantWith(name, taken) ||
    // ...and a name the REGISTRY gates and this stop does not answer to.
    //
    // The extended hue names are deliberately not RESERVED_LABEL (see there):
    // they are among the best colour words the corpus has, and `resolveTerm`
    // gives such a label both readings so the destination holds the palette
    // either way. What it does not do is make the WORD true: `mint` is anchor
    // 165 at chroma 0.08-0.15, and the corpus put it on a #dae9d6 near-white
    // sage at chroma 0.030 that the registry's own gate refuses — so the chip
    // named a near-neutral and its page, ranked by the gate, opens on saturated
    // jade and turquoise. One definition of mint, on both sides of the link
    // (D25.1).
    failsItsGate(name) ||
    // A word the DESTINATION does not read as a colour at all. `resolveTerm`
    // (tag-search) resolves a query modifier-first, then family, then corpus,
    // and the vocabularies overlap: `ocean`, `violet`, `blue`, `sand` and
    // `neon` are corpus entries AND registry or family words. A colour chip
    // wearing one is answered as the other dimension — measured, an `ocean`
    // chip on a warm multicolor ramp and a `violet` chip on a palette with no
    // violet-family stop in it, both refused by their own page. The family
    // words have a proper emitter (the family backfill below, which fires on
    // SHARE and is what the destination measures); the registry words have the
    // fact chips. This is the colour axis declining to borrow their words.
    RESERVED_LABEL.has(name) ||
    // ...and a word whose DESTINATION is one the row already offers. Selection
    // proved the two stops are different colours (spanningColors); a repair
    // that lands on an anchor inside CHIP_SEPARATION of a label already said
    // undoes that, and the row carries two links to one page. Measured over the
    // fixture before this clause: 2 rows of 867 (`dark indigo` beside
    // `dark navy`, anchors 0.093; `dark olive green` beside `green brown`,
    // 0.086).
    // ...at the bar that NEVER RELAXES. `spanningColors` passes its own
    // `tightOnly` (max(1, scale)) here for the reason recorded there — the ball
    // a label's page ranks by is a fixed size, so two anchors 0.09 apart open
    // the same page whatever the palette that emitted them looks like — and
    // this call was passing the raw scale, which on a flat palette is under 1
    // and quietly loosened the destination test. Found by the round-5 QA's own
    // separation assertion when a repair landed on `slate` beside `lichen`,
    // anchors 0.1070 against a reference bar of 0.11.
    taken.some((t) => anchorsCollide(name, t, Math.max(1, scale))) ||
    // ...and a name from the WRONG FAMILY, which QA round 3 moved here from the
    // cosmetic list. The two-stage repair below still prefers the category over
    // the radius, so nothing changes while a replacement exists; what changes is
    // the palette in the sparse corner where none does. `dark forest green` on a
    // dark teal stop and `dark brown` on a near-neutral olive are not odd words
    // for the right colour, they are the wrong colour — the destination filters
    // by exactly this test (stopInClass, one function for both ends), so the
    // emitter keeping them means printing a link to a page the palette is not
    // on. 14 chips over the fixture.
    miscategorized(name) ||
    // ...and a TEMPERATURE claim the stop's own hue contradicts (QA round 6).
    //
    // The corpus holds `warm gray` at h 46.5 and `cool gray` at h 246.8, and on
    // a near-neutral stop the OkLab lookup is decided almost entirely by
    // LIGHTNESS: #8b918e measures C 0.008 at h 164.8 — a green-cyan lean, i.e. a
    // cool gray — and `warm gray` won it at d 0.0244 against `bluish gray`
    // 0.0407 and `grayish teal` 0.0480, on a palette that had a genuinely warm
    // neutral one stop away (#676059, h 67.5) and did not use it. The word then
    // links to /palettes/warm-gray, which the registry answers as the
    // TEMPERATURE characteristic, so the chip and its destination disagreed
    // about the palette that emitted them — the thing D25.1 exists to prevent.
    //
    // Structural rather than cosmetic for that reason: it is the wrong colour,
    // not an odd word for the right one. The arcs are the registry's own
    // (`warm` and `cool` read hueBandShare(330,120) and (150,300)), so a stop in
    // the two gapped zones contradicts neither word and keeps both.
    temperatureMisread(name) ||
    (strict && farFromItsOwnStop(name)) ||
    failsItsOwnPage(name);
  // ...and the COSMETIC ones, which an unrepairable stop may keep.
  const bad = (name: string, strict = true) =>
    // A word the row has already said the HEAD of. See headStem: the geometric
    // bars cannot see that `rose` and `rosa`, or three labels ending in `blue`,
    // are one suggestion.
    //
    // COSMETIC, not structural, and the fixture decided that: the neutrals are
    // a corner of the corpus where almost every name ends in `gray`, so a
    // structural reading left a sage-gray ramp with ONE chip and a lilac-gray
    // ramp with one, having refused the only other words either palette had.
    // The repair still avoids a repeated head wherever the corpus offers an
    // alternative (which is the case the rule was written for: `ultramarine
    // blue | dark blue | dark navy blue` becomes `ultramarine blue | navy |
    // midnight`), and where it offers none the stop keeps its word — a slightly
    // repetitive row beats a missing band, which is this function's standing
    // rule for the cosmetic class.
    headAlreadySaid(name, taken) ||
    UNSEARCHABLE_LABEL.test(name) ||
    UNSPACED_LABEL.test(name) ||
    OBSCURE_LABEL.test(name) ||
    COINED_LABEL.test(name) ||
    !!tone?.(name) ||
    structural(name, strict);
  if (!bad(raw)) return raw;
  // Two stages, because the two tests fail differently. A name outside the
  // destination's radius is a weak link; a name from the wrong FAMILY is the
  // wrong colour. So when nothing clears both, the radius is dropped and the
  // category is kept: a #2e270a stop in the corpus's sparsest corner keeps
  // `dark olive` (yellow, 0.082 from the stop, two thousandths outside the
  // ball) rather than moving to `dark brown` (orange, 0.034 away and the wrong
  // band).
  // A REPAIR MAY NOT INTRODUCE A MEASUREMENT THE RAW NAME DID NOT MAKE (QA
  // round 6). The repair exists to make a label SEARCHABLE — it swaps a word
  // nobody types for one they do — and swapping in a different CLAIM is outside
  // that remit. The filed case: a #dde235 stop (L 0.881, C 0.180, past
  // VIVID_CHROMA) lost `sickly yellow` to the unsearchable-word rule and landed
  // on `dull yellow`, twice as far away, so the page's own h1 called the stop
  // sickly yellow while the chip under it called it dull. `toneNameVeto` cannot
  // catch it because it is a PALETTE-level contradiction test and this palette
  // fires neither `vivid` nor `neon` (mean chroma 0.149). The subset test does:
  // `sickly` is a valence word and carries no loudness claim, so no candidate
  // carrying one is an acceptable substitute for it.
  const loudness = (name: string) =>
    new Set([...name.toLowerCase().matchAll(/[a-z]+/g)].map((m) => m[0]).filter((w) => LOUDNESS_WORDS.has(w)));
  const rawLoudness = loudness(raw);
  const addsLoudness = (name: string) =>
    [...loudness(name)].some((w) => !rawLoudness.has(w));
  const plain =
    nearestChipName(lab, (name) => !!veto?.(name) || addsLoudness(name) || bad(name)) ??
    nearestChipName(lab, (name) => !!veto?.(name) || addsLoudness(name) || bad(name, false)) ??
    nearestChipName(lab, (name) => !!veto?.(name) || bad(name, false));
  const from = CORPUS_LAB.get(raw);
  const to = plain ? CORPUS_LAB.get(plain) : undefined;
  // A REPEATED HEAD REACHES AS FAR AS A CATEGORY ERROR, and for the same
  // reason: both are the row saying something it should not, not merely saying
  // it oddly. Measured over the fixture: at the plain reach 64 rows keep a
  // repeated head, at this one 41 — and the 41 are the corners where the corpus
  // has no other word, the neutrals (everything nearby ends in `gray`) and the
  // blues (`mid blue` beside `cornflower blue`, one hue at two lightnesses).
  // The alternative was to make the rule structural and drop the second chip,
  // which the fixture priced at two rows left with no colour chip at all.
  const reach =
    miscategorized(raw) || headAlreadySaid(raw, taken)
      ? CHIP_CATEGORY_REACH
      : CHIP_LABEL_REACH;
  const label =
    from && to && plain && oklabDistance(lab, to) - oklabDistance(lab, from) <= reach
      ? plain
      : raw;
  // The repair may have failed, or landed outside its reach and handed the raw
  // name back. A cosmetic reason survives that; a structural one does not — at
  // the DESTINATION's radius (strict: false), because the strict one is a
  // preference between two true names and this is the test for whether the link
  // works at all.
  return structural(label, false) ? null : label;
}

/**
 * The corpus entry nearest a colour in plain OkLab, skipping the rejected ones.
 *
 * One linear pass over the 920 entries, the same scan `nearestNamed` makes,
 * without its hue-error weighting — see chipName for why the chip wants the
 * metric its destination ranks by rather than the one a name is chosen by.
 */
function nearestChipName(lab: Oklab, reject: (name: string) => boolean): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const entry of NAMED_COLORS) {
    // DISTANCE FIRST, rejection second. Only an entry that would win needs to
    // be tested, and the test is the expensive half: `reject` runs four regexes
    // plus the row's redundancy and destination checks. Measured over 200
    // fixture rows, moving the comparison ahead of it takes the row from 2.9ms
    // to 1.6ms with an identical result — the loop wants the nearest UNREJECTED
    // name either way.
    const d = oklabDistance(lab, entry.lab);
    if (d >= bestD) continue;
    // The corpus's own label-side exclusions come first: NAMED_COLORS is the
    // LOOKUP list, and three of its entries (the purple/brown trio) plus
    // `azure` are deliberately unsayable. Skipping this check put
    // `purple brown` back on a red-brown stop, which is the defect
    // color-utils' MISNAMED_LABEL exists for.
    if (!isLabelName(entry.name) || reject(entry.name)) continue;
    bestD = d;
    best = entry.name;
  }
  return best;
}

/** A colour the row could name, and where it sits. */
interface ChipColor {
  name: string;
  /** Ramp index of the stop this name names — the chroma tie-break. */
  i: number;
  lab: Oklab;
  C: number;
  L: number;
  /** Hue band, or `neutral`. The family clause in spanningColors. */
  family: string;
}

/**
 * Which of a palette's colours the row names: a set that SPANS it, not the top
 * of one ramp.
 *
 * THE DEFECT THIS EXISTS FOR (D22.B, 2026-08-18). Ranking the candidates by the
 * chroma of the stop they name (D18) and taking the top N is a ranking without
 * a diversity term, and on a palette whose chromatic region is all one hue it
 * returns that region three times. The reported case is a warm tan -> sage ->
 * teal -> blue -> navy ramp: its three highest-chroma stops are three adjacent
 * blues (0.0847, 0.0775, 0.0768), so the row read "ugly blue | dirty blue |
 * marine blue" — three near-synonyms whose result sets would be nearly
 * identical — while puce (0.0599) and dark navy (0.0581) lost and the palette's
 * whole warm end vanished from its own chip row.
 *
 * So the selection is farthest-point (max-min), the same rule
 * getUniqueColorNames uses one level down and the same idea as the palette
 * search's MMR pass: the most chromatic candidate seeds the set (D18 stands —
 * identity lives in the chromatic stops), and each further name is the one
 * sitting farthest from every name already chosen.
 *
 * TWO ROUNDS, added 2026-08-18 after the second QA pass. Round one admits only
 * candidates carrying a FAMILY the set does not have yet; round two fills the
 * remaining budget by distance. Max-min alone is a diversity term over the
 * whole solid, and the solid's longest axis is lightness, so on a budget it
 * spent its picks on the dark end and the light end of one hue and dropped the
 * second hue: a pale palette of pink, peach, cream and yellow-green chipped
 * pink and cream. Families first is D22.B1's own sentence ("prefer a set that
 * SPANS the palette, its ends and its distinctive middle") read as an order
 * rather than as a tie-break.
 *
 * The family clause is a RANK and not a lower threshold (QA round 2). Letting a
 * novel family in at one JND is what put five near-whites, and `light peach`
 * beside `wheat`, on one row: at that distance the hue angle that assigns the
 * family is noise. See CHIP_SEPARATION.
 *
 * A candidate that fails its floor is SKIPPED, not a reason to stop. The old
 * loop broke out the moment the farthest remaining candidate fell under the
 * threshold, so one near-neutral admitted early could end the row while a
 * genuinely different colour sat behind it: on the reported palette silver came
 * in at 0.171 and burlywood, 0.082 behind it, ended the loop. The QA round
 * measured that break costing 127 rows (14.6%) a candidate more chromatic than
 * the chip that blocked it.
 *
 * THE ENDS ARE SEEDED, NOT RANKED (QA round 3). The end bonus above is a
 * tie-break INSIDE the surviving set, and the collision test is a hard skip
 * evaluated before it, so an end that lands within the bar of an
 * already-chosen interior pick was dropped outright and its bonus never ran.
 * Measured on the reported palette: #593324, hue 42, the only warm station of a
 * dark rainbow and plainly the left sixth of the image, was skipped because
 * `chestnut` sits 0.0667 from the interior `dark olive` that had already been
 * taken; another lost the dark-olive band closing its image to the same rule at
 * 0.0664. D22.1 asks the set to span "its ends and its distinctive middle", so
 * the ends go in FIRST and the middle competes for what is left — which is the
 * same sentence read as an order, exactly as the family clause above was.
 *
 * The row is then ORDERED by chroma by the caller, because D18's argument about
 * which chip a visitor should read first is untouched by any of this. Selection
 * asks what the palette contains; ranking asks what to lead with — and with the
 * ends seeded, what leads is still the loudest colour on the row.
 */
function spanningColors(
  candidates: readonly ChipColor[],
  budget: number,
  /** The ramp's last stop index, so the two ENDS can be preferred. */
  last: number,
  /** The palette's spread against the reference one; see CHIP_SPREAD_REFERENCE. */
  scale: number,
  /** Already-chosen chips, for the second pass over the demoted tier. */
  seeded: readonly ChipColor[] = [],
): ChipColor[] {
  const chosen = [...seeded];
  if (!candidates.length) return chosen;
  // THE SAME-FAMILY BAR SCALES UP AND NEVER DOWN (QA round 4).
  //
  // Round 3 made all three bars scale with the palette's own diameter, and the
  // two directions of that rule are not the same rule. Scaling UP earned its
  // keep: a plum-to-lime ramp of diameter 0.5574 was spending three chips on
  // one brown stretch (`coffee`, `cocoa`, `reddish brown`, pairwise
  // 0.095-0.113) and the widened bar refuses all three. Scaling DOWN was
  // written for a different palette — a pastel sand-to-thistle ramp whose
  // visibly different stations are in DIFFERENT FAMILIES — and on a flat
  // MONOCHROME it does the damage it was meant to prevent: a single spring
  // green spanning 5.6 degrees of hue and 0.0475 of chroma emitted
  // `greenish cyan | aqua green | greenish teal`, three synonyms for one
  // colour and three links to one page, because its diameter of 0.175 dropped
  // the same-family bar to 0.0476. A family boundary is what makes two names
  // two searches; inside one family the reference bar is the floor, whatever
  // this palette's spread.
  const tightOnly = Math.max(1, scale);
  const stopBar = CHIP_STOP_SEPARATION * tightOnly;
  const crossBar = CHIP_CROSS_FAMILY_SEPARATION * scale;
  // A NOTE ON WHAT QA ROUND 6 TRIED HERE AND TOOK BACK, so nobody re-adds it.
  // The round filed `azul | marine | green blue` as three blue words on one
  // palette, and the obvious fix is to make the Nth name for a family clear N
  // times the bar. Measured, that is wrong twice over: `green blue` names
  // #00b59c, which is the CYAN band by this repo's own partition and a visible
  // teal beside the navy, so the row holds two blues and not three; and the
  // escalation re-files QA round 2's verdict on the palette that rule was
  // written for — #03003b -> #c4d7f4, where it dropped `cornflower blue` and
  // left the middle of a seven-stop ramp unnamed — at a cost of 0.0017 of mean
  // colour cover over the fixture. Two chips per family is the cap and
  // `familyFull` is the rule that lifts it; the bar itself does not escalate.
  const collidesWith = (c: ChipColor, k: ChipColor) =>
    oklabDistance(c.lab, k.lab) < (k.family === c.family ? stopBar : crossBar) ||
    // ...and the DESTINATION test never relaxes at all. The ball a label's page
    // ranks by is COLOR_MATCH_MAX around its corpus anchor, which is a fixed
    // size: two anchors 0.09 apart open the same page whatever the palette that
    // emitted them looks like, so this bar is a fact about the corpus and not
    // about this ramp. It is the test the three reported synonym rows were
    // clearing — `key lime`/`yellowish green` at 0.0900 against a relaxed
    // 0.081, `greenish cyan`/`greenish teal` at 0.1034 against 0.0476,
    // `medium slate blue`/`lavender blue` at 0.0791 against 0.075.
    anchorsCollide(c.name, k.name, tightOnly);
  // ...and the cap only binds WHILE ANOTHER FAMILY IS STILL WAITING.
  //
  // Both halves are QA verdicts and they contradict each other unless the rule
  // is conditional. Round 2 looked at a monochrome blue ramp running #03003b to
  // #c4d7f4 — near-black navy, indigo, royal blue, cornflower, periwinkle, two
  // pale blues — and called two chips for it a defect: "the mid stops are
  // visibly their own colours". Round 3 looked at a tan → sage → teal → blue →
  // navy ramp and called four blue chips a defect. The difference is not the
  // count, it is what the fourth blue COSTS: on the second palette it costs the
  // sage and the teal, and on the first there is nothing else to spend the slot
  // on. So a family may keep taking chips once every other family the palette
  // holds has been named.
  const familyFull = (c: ChipColor) =>
    chosen.filter((k) => k.family === c.family).length >= FAMILY_CHIPS &&
    candidates.some((o) => !chosen.includes(o) && !chosen.some((k) => k.family === o.family));
  // The END preference, and the half of it QA round 2 had to take back: an end
  // whose chroma is less than half the palette's loudest gets no bonus. The
  // bonus is there so a ramp's extremes are named, and on a palette whose
  // extreme is a near-white it was spending the slot on the value scale's edge
  // instead of the palette's own colour — a #ffffd1 cream END beat the
  // saturated #ffff7d yellow beside it (0.09 apart, so only one could be
  // said) and a #e2ffff near-white end beat the mint at #aeebd5. Relative, not
  // absolute, for the same reason stopHasHue is (D19): "washed out" is a
  // statement about this palette, and CHROMA_FLOOR is far below where this
  // starts to matter.
  const loudest = Math.max(...candidates.map((c) => c.C), ...chosen.map((c) => c.C));
  const isEnd = (c: ChipColor) => (c.i === 0 || c.i === last) && c.C >= loudest / 2;
  if (!chosen.length) {
    // The two ends, loudest first so a collision between them keeps the colour
    // rather than the value-scale edge...
    for (const end of candidates.filter(isEnd).sort((a, b) => b.C - a.C || a.i - b.i))
      if (!chosen.some((k) => collidesWith(end, k))) chosen.push(end);
    // ...and the most chromatic candidate seeds a palette whose ends are too
    // washed out to qualify (D18: identity lives in the chromatic stops).
    if (!chosen.length)
      chosen.push(
        candidates.reduce((best, c) =>
          c.C > best.C || (c.C === best.C && c.i < best.i) ? c : best,
        ),
      );
  }
  while (chosen.length < budget) {
    let best: ChipColor | null = null;
    let bestDistance = -1;
    let bestRank = -1;
    for (const c of candidates) {
      if (chosen.includes(c)) continue;
      // ...and never a third chip for one hue band. See FAMILY_CHIPS.
      if (familyFull(c)) continue;
      let nearest = Infinity;
      let novel = true;
      let collides = false;
      for (const k of chosen) {
        // Two quantities: the stops (one colour in the image, at the bar its
        // hue bands earn) and the labels' corpus anchors (one destination
        // page). Failing either makes the pair one suggestion. See
        // CHIP_SEPARATION.
        nearest = Math.min(nearest, oklabDistance(c.lab, k.lab));
        collides ||= collidesWith(c, k);
        if (k.family === c.family) novel = false;
      }
      if (collides) continue;
      // Rank: a family the row does not hold yet, then an END of the ramp, then
      // max-min, ties to the more chromatic stop.
      const rank = (novel ? 2 : 0) + (isEnd(c) ? 1 : 0);
      if (
        rank > bestRank ||
        (rank === bestRank &&
          (nearest > bestDistance ||
            (nearest === bestDistance && c.C > (best?.C ?? -1))))
      ) {
        bestDistance = nearest;
        bestRank = rank;
        best = c;
      }
    }
    if (!best) break;
    chosen.push(best);
  }
  return chosen;
}

/**
 * Chip ordering by SLOT, so a compound reads as English (D17): temperature
 * before tone before family before structure, the same order palette-name.ts
 * sorts a name's adjectives into. "pastel rainbow", never "rainbow pastel".
 */
const COMPOUND_SLOT: Record<string, number> = {
  temperature: 0,
  chroma: 1,
  value: 1,
  family: 2,
  harmony: 3,
};

/**
 * Ranked query labels derived from the description system's TRUE facts, for
 * the chip row on the seed page. Pure and deterministic so the server render
 * and the island can never disagree.
 *
 * D22.B made this row the page's navigation surface: the description is no
 * longer rendered, so these chips are what a visitor uses to leave this palette
 * for one like it, and what a crawler follows. The owner's brief: "i want to
 * see a bit more tags that when clicked actually have a good chance of looking
 * like either the palette or that 'dimension' of the palette that the tag is
 * describing. combo tags are useful here."
 *
 * The row, in order:
 *  1. The dominant universal, when a flat black or white block IS the palette.
 *  2. The palette's colours — spanning it, per spanningColors, ordered by the
 *     chroma of the stop each names (D18).
 *  3. The journey built out of those colours, in ramp order (D23.1).
 *  4. Compounds (D17), which outrank their parts: two words are strictly more
 *     specific than either.
 *  5. The palette's most PROMINENT characteristics, from the registry
 *     (D25.5): true, true with margin, discriminating, ranked by information
 *     content, deduped three ways and capped per axis.
 *  6. The broad halves of the compounds, while colour still outnumbers fact.
 *
 * Steps 1-3 are the colour axis and they have first claim on the budget
 * (D23.2); steps 4-6 fill what is left.
 *
 * DIMENSIONS, not one axis (D22.B3). The kinds are the registry's own axes plus
 * the three it does not own, and the row takes every kind the palette can
 * honestly claim rather than filling up on whichever ranks highest. Measured
 * over the fixture after D25.5: every row carries at least two kinds, 97.1%
 * three and 84.5% four. By kind, the share of the 867 carrying at least one —
 * colour 867, journey 818, hue 513, value 460, gradient 290, chroma 275,
 * compound 260, temperature 199, harmony 187, contrast 139, family 130,
 * appearance 61. Five of those axes had no chip vocabulary at all before this
 * round.
 *
 * CRAWL SAFETY: every label comes from a bounded vocabulary — the color-name
 * corpus, the registry's chip-eligible words, the eight family anchors, a pair
 * of those words under the slot grammar, or (D23.1) two or three corpus names
 * in ramp order — never free text, so the crawl frontier stays finite. The
 * journey chips widen the theoretical space to corpus³, and the REACHABLE space
 * is what matters and is bounded by the palettes: two per row, 1,217 distinct
 * labels over the 867-seed fixture, each of them a page the tag route
 * recognizes and filters (recognizeTagQuery accepts at most three terms).
 * Color-name queries are indexable by design
 * (indexableQuery way #2); modifier and compound pages are score-gated to
 * noindex,follow until their corpus is good enough, which still renders and
 * edge-caches. After the pending reindex the embed text literally contains both
 * words of a compound, so exactly the compound pages with genuinely matching
 * corpora clear PUBLISHABLE_SCORE and become indexable, self-selecting on
 * quality.
 */
/**
 * Modifier words that mean the same thing in front of a colour.
 *
 * Not a thesaurus and not an opinion: each group is a set of corpus modifiers
 * the corpus itself uses interchangeably, and the groups are what the numeric
 * bars cannot see. `light blue` and `pale blue` name stops 0.123 apart with
 * anchors 0.1106 apart — clear of both bars by a thousandth — and are one
 * English phrase said twice, which is what a visitor reads. Kept small and
 * one-directional (lightness, depth, loudness, dullness) so it can never merge
 * two words that differ in the direction a viewer cares about: `dark blue` and
 * `light blue` are in DIFFERENT groups and stay two chips.
 */
const MODIFIER_SYNONYMS: readonly (readonly string[])[] = [
  ["light", "pale", "soft", "washed", "baby", "powder"],
  ["dark", "deep"],
  ["bright", "vivid", "vibrant", "intense", "neon", "electric"],
  ["dull", "muted", "faded", "dusty", "dusky", "grayish", "greyish", "murky"],
];
const SYNONYM_GROUP = new Map<string, number>(
  MODIFIER_SYNONYMS.flatMap((group, i) => group.map((w) => [w, i] as const)),
);

/**
 * Whether a candidate label and a chosen one are the same suggestion, one of
 * them merely qualified: "yellow" beside "sun yellow", "peach" beside "pale
 * peach". A visitor reads that row as two ideas and it is one.
 *
 * THREE SHAPES, all word-level, because they are the ones no OkLab distance
 * catches:
 *
 *  1. Whole-word containment. "aqua blue" beside "deep sky blue" shares a head
 *     and is two genuinely different colours, so containment and not a shared
 *     head is the test.
 *  2. The same words in a different ORDER: `blue gray` beside `gray blue`.
 *  3. The same head under SYNONYMOUS modifiers: `light blue` beside `pale
 *     blue`, `deep purple` beside `dark purple`. QA round 3 found both of the
 *     new shapes on live rows, and both cleared every numeric bar — 2 and 3
 *     exist because a bar measures colours and a row is read as English.
 */
/**
 * The HEAD of a label — its last word — reduced to the stem two spellings of
 * one word share.
 *
 * THE DEFECT (QA round 5, filed three times). Every separation bar in this file
 * is GEOMETRIC, and two labels can be far apart in OkLab and still be one word
 * to a reader: `rose` (#ff0082) beside `rosa` (#ff8ba3) at 0.1724, three blues
 * on a palette whose hue span is 0.6 degrees (`ultramarine blue | dark blue |
 * dark navy blue`), `mid blue` beside `cornflower blue` at 0.1529 on hues one
 * degree apart. Read down a row those are not two suggestions, and the
 * multi-colour chip built out of the first pair — "rose rosa antique white" —
 * names one colour twice in one label.
 *
 * The stem is the smallest rule that merges the pairs the corpus actually
 * holds, and it is MEASURED rather than chosen: over the 920 corpus names there
 * are 248 distinct head words, and this normalization merges exactly two groups
 * of them — {rose, rosa} and {sand, sandy}. Both are one word spelled twice.
 * Anything more aggressive would start merging words that are not.
 */
const headStem = (label: string): string => {
  let w = label.toLowerCase().split(" ").pop() ?? "";
  if (w.length > 3 && w.endsWith("s")) w = w.slice(0, -1);
  if (w.length > 3 && /[aeoy]$/.test(w)) w = w.slice(0, -1);
  return w;
};

/** Has the row already printed a label with this one's head word? */
const headAlreadySaid = (label: string, labels: readonly string[]): boolean => {
  const head = headStem(label);
  return !!head && labels.some((l) => headStem(l) === head);
};

const redundantWith = (label: string, labels: readonly string[]): boolean => {
  const a = ` ${label.toLowerCase()} `;
  const aw = label.toLowerCase().split(" ");
  return labels.some((l) => {
    const b = ` ${l.toLowerCase()} `;
    if (a === b) return false;
    if (a.includes(b) || b.includes(a)) return true;
    const bw = l.toLowerCase().split(" ");
    if (aw.length !== bw.length) return false;
    if ([...aw].sort().join(" ") === [...bw].sort().join(" ")) return true;
    // Same head, and every modifier in front of it swapped for one that means
    // the same thing.
    if (aw[aw.length - 1] !== bw[bw.length - 1] || aw.length < 2) return false;
    for (let i = 0; i < aw.length - 1; i++) {
      const ga = SYNONYM_GROUP.get(aw[i]!);
      if (ga === undefined || ga !== SYNONYM_GROUP.get(bw[i]!)) return false;
    }
    return true;
  });
};

/**
 * ...and the version of that question a FAMILY word has to ask instead: does
 * the row already say this family, as a family?
 *
 * Containment is the wrong test here because it ignores which word is the HEAD.
 * `green brown` is a BROWN — the corpus's grammar is modifier-then-head, the
 * same grammar `red orange`, `violet blue` and `dark blue gray` follow — so a
 * row carrying it has said nothing about green, and suppressing the palette's
 * `green` family chip left one QA row with four colour names and no dimension
 * word at all. Measured on the finished rows: 8 of the 867 keep a family chip
 * that containment would have dropped — `green` beside `green brown`, `violet`
 * beside `violet blue`, `red` beside `red violet`, `blue` beside `dark blue
 * gray`, `yellow` beside `yellow ochre` — and none keeps a genuine duplicate,
 * because `yellow` beside `sun yellow` is still suppressed: there yellow IS the
 * head.
 */
const saysFamily = (word: string, labels: readonly string[]): boolean => {
  const w = word.toLowerCase();
  return labels.some((l) => {
    const parts = l.toLowerCase().split(" ");
    return parts[parts.length - 1] === w;
  });
};

/**
 * One colour chip: the word a visitor reads and the stop it speaks for.
 *
 * Exported because the stop is not recoverable from the word — the link-label
 * repairs below can move a label off the name its stop produced — and both the
 * tests and any future surface that wants to highlight the swatch a chip names
 * would otherwise have to reimplement three repairs and a tiering rule to
 * guess. One answer, one place.
 */
export interface ChipColorPick {
  label: string;
  /** Index into `named.stops`. */
  stop: number;
  /** ...and that stop in OkLab, so the journey label can ask how far it went. */
  lab: Oklab;
  /**
   * A demoted name (a bare universal, or a stop below L 0.1) offered only so a
   * palette whose whole vocabulary is "white and black" still gets a row. The
   * caller emits these last, and only while the row is nearly empty.
   */
  lastResort?: boolean;
}

/**
 * The colours the chip row names, in the order it says them.
 *
 * `taken` is whatever the row has already said (the dominant plateau word),
 * because the containment repair has to see it.
 */
export function chipColors(
  named: NamedPalette,
  tags: readonly string[],
  taken: readonly string[] = [],
): ChipColorPick[] {
  // The candidate colours: the palette's DISTINCT names, not its raw stops.
  //
  // At 7 or 13 steps the stops are a run of near-synonyms, and the candidate
  // list has to be the question "what different colours are in this palette",
  // which getUniqueColorNames already answers by farthest-point selection over
  // the ramp with the ends seeded. NOT named.colorNames, which is the two to
  // four names the TITLE could fit: a palette whose left half is mint, cyan and
  // cobalt offered "red | sun yellow | yellow" with no blue label at all
  // (measured: 623 of the 867 fixture palettes had at least one distinct stop
  // name that could never reach the row).
  //
  // The veto is the palette's own (see toneNameVeto): a name the title is not
  // allowed to use is not a search suggestion either, and the top chip on a
  // vivid sunset linked to /palettes/pastel-red.
  //
  // Which stop each name names is recovered by naming the stops again with the
  // same corpus function — hexToColorName and getUniqueColorNames both go
  // through nearestNamed, so the first stop answering to a label is exactly the
  // stop that produced it, and ramp order is the tie-break the ranking wants.
  // One naming pass over the stops rather than one per label: the row is
  // rebuilt on every slider tick in the editor, and the corpus is 920 entries.
  const veto = toneNameVeto(tags);
  const stopNames = named.stops.map((hex) => hexToColorName(hex, veto));

  // The lightness half of D18's demotion carries no chroma condition at the
  // dark end since 2026-08-18. D18 wrote it as "achromatic AND extreme", and a
  // visually pure black measures C 0.053 at 100% saturation (OkLab's cube root
  // again), so #00000f chipped as "midnight" and ranked SECOND on a palette
  // whose image is dominated by an orange and a deep red. Below L 0.1 a stop is
  // black to a viewer whatever its hue says, and a black name tells a visitor
  // nothing about this palette.
  const demoted = (s: ChipColor) => UNIVERSAL_NAMES.has(s.name.toLowerCase()) || s.L < 0.1;

  // ...and a THIRD tier between demoted and chosen, added 2026-08-18. D18's
  // near-white clause (achromatic and L > 0.9) is right about "white" and wrong
  // about the palettes where the near-white IS the subject: a high-key pastel
  // whose light two thirds run cream to oyster had its only light-end names
  // dropped and chipped one colour, and a pink-to-cream ramp lost `linen` and
  // `ivory` — all three perfectly ordinary searches — with eight free slots on
  // the row. So the clause stops being a demotion to last resort and becomes an
  // ORDER: the near-whites are chosen after the coloured stops and only while
  // the budget is still open. The dark half stays hard, and so does the
  // universals list, which is what D18's own test pins.
  const paleTier = (s: ChipColor) => s.C < T.CHROMA_FLOOR && s.L > 0.9;

  const candidates: ChipColor[] = [];
  const pale: ChipColor[] = [];
  const lastResort: ChipColor[] = [];
  const tone = chipToneVeto(tags);
  for (const name of getUniqueColorNames([...named.stops], {
    max: named.stops.length,
    veto,
    // A CANDIDATE pass, not a selection: spanningColors below is the row's real
    // rule, and anything dropped here the row can never consider. So the bar is
    // the noise floor, not CHIP_SEPARATION — the namer's job (keep a run of
    // near-synonyms from each claiming a slot) is done one level up by the
    // selection, and doing it twice is what hid a saturated yellow block behind
    // the cream beside it. Plain OkLab, which is the selection's metric too, so
    // the two passes agree about what "apart" means.
    minSeparation: CHIP_CANDIDATE_FLOOR,
  })) {
    const i = stopNames.indexOf(name);
    const hex = i >= 0 ? named.stops[i]! : null;
    if (!hex) continue;
    const lch = hexToOkLch(hex);
    // The label the CHIP would carry, which is not always the name the corpus
    // gave the stop (see chipName). Applied before selection so the row's
    // dedupe and its redundancy check both see the words a visitor will read —
    // and null when no word in the corpus can name this stop at a distance its
    // own destination would accept, which is not a chip at all.
    const label = chipName(hex, name, veto, tone, [], 1, named.stops);
    if (!label) continue;
    const candidate = {
      name: label,
      i,
      lab: oklabOf(hex),
      C: lch.C,
      L: lch.L,
      family: chipFamilyOf(hex),
    };
    // Demotion is tested on BOTH names, the corpus's and the chip's. They
    // differ only where the link-label preference moved the word, and a repair
    // that landed on a bare universal would otherwise walk past the D18 rule
    // that keeps "white" and "black" out of the row.
    if (demoted(candidate) || demoted({ ...candidate, name })) lastResort.push(candidate);
    else if (paleTier(candidate)) pale.push(candidate);
    else candidates.push(candidate);
  }

  const last = named.stops.length - 1;
  // How wide this palette is, against the palette the bars were measured on.
  // Over the STOPS rather than over the candidates: the candidates are already
  // a separated subset, so measuring their diameter would let the previous
  // pass's decisions move this one's bar.
  const scale = chipSeparationScale(named.stops.map(oklabOf));
  const strong = spanningColors(candidates, NAME_CHIPS, last, scale);
  const chosen = (
    strong.length < NAME_CHIPS && pale.length
      ? spanningColors([...candidates, ...pale], NAME_CHIPS, last, scale, strong)
      : strong
  ).sort((a, b) => b.C - a.C || a.i - b.i);

  // Two spanning colours can still collide as WORDS: `blood` and `blood orange`
  // sit 0.335 apart and share a head, and dropping one for the other cost a
  // palette its whole dark maroon band. Selection already proved they are two
  // colours, so the repair is the label, not the chip — the nearest name inside
  // CHIP_LABEL_REACH that does not collide, and the original word when there is
  // none, because a slightly odd row beats a missing band.
  const out: (ChipColorPick & { rank: number })[] = [];
  const said = [...taken];
  // THE ENDS RESOLVE THEIR LABEL FIRST (QA round 5).
  //
  // The row is ORDERED by chroma (D18) and until now it was also RESOLVED in
  // that order, which does not matter until two picks compete for a word — and
  // with the head-word rule they do. A #44caff sky-blue END and a duller
  // interior blue both wanted a label ending in `blue`, the interior one is
  // more chromatic, and it took the word: the row lost its first stop and the
  // journey chip then had nothing to start from. Selection already treats the
  // ends as the picks that must be there (see spanningColors); resolution now
  // agrees, and the display order is restored afterwards so D18's argument
  // about what a visitor reads first is untouched.
  const chosenOrder = new Map(chosen.map((c, i) => [c, i] as const));
  const resolveOrder = [...chosen].sort(
    (a, b) =>
      (a.i === 0 || a.i === last ? 0 : 1) - (b.i === 0 || b.i === last ? 0 : 1) ||
      chosenOrder.get(a)! - chosenOrder.get(b)!,
  );
  // ...and the demoted names last, flagged: a palette whose whole vocabulary is
  // "white and black" still needs a row rather than an empty nav. Never fires
  // over the fixture — the rows that show a universal show it because the
  // plateau IS the palette — but the editor reaches states the sitemap never
  // sampled, and an empty nav is the one outcome this row may not have.
  for (const c of [...resolveOrder, ...lastResort]) {
    const label = chipName(named.stops[c.i]!, c.name, veto, tone, said, scale, named.stops);
    if (!label || said.some((l) => l.toLowerCase() === label.toLowerCase())) continue;
    said.push(label);
    out.push({
      label,
      stop: c.i,
      lab: c.lab,
      rank: chosenOrder.get(c) ?? chosen.length,
      ...(chosenOrder.has(c) ? {} : { lastResort: true }),
    });
  }
  return out
    .sort((a, b) => a.rank - b.rank)
    .map(({ rank: _rank, ...pick }) => pick);
}

/**
 * At most this many directional / multi-colour chips (D23.1's own cap).
 *
 * Two is also all the grammar can make: one pair for the journey's two ends and
 * one list for the stations in between, and a third would have to repeat a
 * colour that is already in one of them.
 */
const DIRECTIONAL_CHIPS = 2;

/**
 * How many colours the LIST form may carry. Three is the shape that measured
 * best live: /palettes/salmon-teal-turquoise is the top palette page by
 * impressions in the peer session's GSC pull, and the multi-colour query path
 * already routes.
 */
const MULTI_COLORS = 3;

/**
 * The journey chips: "{colorA} to {colorB}", and the multi-colour list beside
 * it (D23.1).
 *
 * THE EVIDENCE. This is the one query shape the GSC data actually contains that
 * the site was not emitting: "grey to white gradient", "white to green
 * gradient", "white to green gradient minecraft", "salmon and teal" at position
 * 9.5. Every colour query in that pull carries a head noun, and the chip
 * destinations already append one ("Salmon teal gradient palettes — …"), so the
 * only missing half was the chip itself.
 *
 * RAMP ORDER, NEVER REORDERED: the label is a claim about which way the
 * gradient travels, so the colours are taken by stop index and not by chroma,
 * and the two ends of the CHIP SET are the two ends of the journey it can
 * honestly name. The names come from the spanning selection, so they arrive
 * already separated (a "blue to blue" is impossible by construction — the
 * selection proved the two stops are different colours) and already carrying
 * the link-label repair.
 *
 * The list form needs three DIFFERENT colours and is skipped below that, where
 * it would only be the pair again with the word "to" removed — the recognizer
 * steps over the join, so "salmon to teal" and "salmon teal" are one
 * destination and would be two links to it.
 *
 * It also needs to READ as a list, which is a constraint on the labels and not
 * on the colours: with nothing separating the items, "dark olive marine blue
 * vibrant blue" is a sentence with the punctuation missing and repeats `blue`
 * twice. So each item is at most two words and no two items may share one. The
 * pair form has no such limit because "to" does the separating.
 */
function directionalLabels(
  colors: readonly ChipColorPick[],
  /** ...including the DEMOTED picks, which is the ENDS rule below. */
  picks: readonly ChipColorPick[],
  features: PaletteFeatures,
): string[] {
  const ramp = [...colors].sort((a, b) => a.stop - b.stop);
  if (ramp.length < 2) return [];
  // A "{A} to {B}" IS A CLAIM ABOUT WHERE THE GRADIENT ENDS (QA round 5).
  //
  // The caller hands this the chip set with the DEMOTED picks removed, so the
  // label takes the ends of the surviving chips and not the ends of the
  // palette: an apricot -> red -> pure #000000 fade, a quarter of whose
  // rendered band is the black plateau and the most striking thing in the
  // image, was labelled "apricot to mahogany" — mahogany being stop 4 of 7,
  // with the two black stops unnamed because `black` is a demoted word (D18).
  // A journey that stops short of the picture's own end is a different journey.
  //
  // The test is the row's own knowledge, not a distance: `chipColors` already
  // produced a name for that black — it demoted it (D18 keeps bare universals
  // and sub-L-0.1 stops off the row) rather than failing to see it. So a
  // demoted pick lying BEYOND either end of the journey is the row saying, in
  // its own vocabulary, that the gradient goes somewhere this label does not
  // mention. A distance bar was tried first and rejected: at CHIP_SEPARATION it
  // took the journey chip off 125 rows including "light brown to almost black",
  // which is a correct description of a ramp whose last stop is 0.115 darker
  // than the one it names.
  const beyond = (stop: number) =>
    picks.some((p) => p.lastResort && (p.stop < ramp[0]!.stop || p.stop > stop));
  if (beyond(ramp[ramp.length - 1]!.stop)) return [];
  // A CYCLIC PALETTE HAS NO "A TO B" (QA round 4). `seamless` says the two ends
  // meet inside a JND — the same row prints it — so a journey label would have
  // the page claiming both that the gradient loops and that it runs from one
  // colour to another. Worse, the two ends of the CHIP SET are interior stops
  // on such a palette: a violet -> gold -> pale lime -> green -> violet loop
  // (endsDistance 0.0000) was labelled "blue violet to sapphire", two blue
  // stops out of seven, with the gold and the lime that are the whole visible
  // middle left out of it. The threshold is the `seamless` descriptor's own, so
  // the guard and the chip it defers to cannot disagree.
  if (features.seam < THRESHOLDS.SEAM_TOLERANCE) return [];
  // The pair is a QUERY naming two colours, so the two have to be two queries
  // at the REFERENCE bar and not merely at this palette's scaled one. The
  // scaled bar is what lets a flat palette name its own stations — right for a
  // single colour chip, wrong here, because "medium gray to dim gray" is a
  // journey nobody took and a search nobody runs. Unscaled, and the pair is
  // simply dropped when it fails: a palette that goes nowhere has no journey
  // chip.
  if (anchorsCollide(ramp[0]!.label, ramp[ramp.length - 1]!.label)) return [];
  // ...and NEARLY cyclic is cyclic enough (QA round 6). The `seamless` bar
  // above is 0.02 - the ends meet inside a JND - and the palettes that go out
  // and come back land just outside it: the filed one runs #2c0059 (a near-black
  // violet) out through magenta, orange, pale khaki and green to #000061 (a
  // near-black navy), ends 0.0889 apart, and printed "warm purple to dark royal
  // blue" over an image whose story is the ARCH the same row separately names
  // with `bright-middle rainbow`. Neither end is where the label says the
  // gradient went.
  //
  // CHIP_SEPARATION is the right bar because it is the row's own answer to "are
  // these two colours or one": two labels closer than it are two spellings of
  // one query (measured as destination Jaccard, see CHIP_SEPARATION), and a
  // journey whose two ends are one colour is not a journey. Measured over the
  // fixture, it takes the pair off 40 further rows, every one of them a palette
  // that returns to within a chip's width of where it started.
  if (features.seam < CHIP_SEPARATION) return [];
  // ...and the two ends may not share a WORD. The comment above claims a
  // "blue to blue" is impossible by construction because the selection proved
  // the two stops differ; the fixture disproved it. `candy pink` (#ff63e9,
  // h 331) and `faded pink` (#de9dac, h 4) are 0.1754 apart, two colours by
  // every bar the selection applies — and the label reads "candy pink to faded
  // pink", which is pink to pink. The list form has carried this rule since
  // D23.1; the pair needs it for the same reason, and "to" does not do enough
  // separating to save it.
  if (!distinctWords([ramp[0]!.label, ramp[ramp.length - 1]!.label])) return [];
  const out = [`${ramp[0]!.label} to ${ramp[ramp.length - 1]!.label}`];
  // ...AND THE LIST FORM IS NOT THE PAIR WITH A WORD PUT IN THE MIDDLE (QA
  // round 6, the D22 near-duplicate rule).
  //
  // Both labels are built from the same `ramp`, so whenever both are emitted
  // the list starts with the pair's A and ends with its B — measured over the
  // fixture, 454 of the 867 rows printed both and on every single one of them
  // the list restated the pair's two ends. Read down a row that is
  // `dark navy to mid blue | dark navy sapphire mid blue`: the same journey,
  // twice, for two of the row's slots. Their pages are near-duplicates too
  // (page-1 Jaccard 0.500 through the real recognizer + filter path), which is
  // exactly the pair D22 refuses.
  //
  // WHICH ONE GOES, and it is measured rather than judged. Both were run
  // through the whole path over the fixture's own labels (40 of them, 20 pairs
  // and their 20 lists) and scored by whether page 1 holds a stop inside
  // COLOR_MATCH_MAX of EVERY colour the label names: the pair scores
  // precision@24 0.072 and the list 0.058. That ordering is structural, not a
  // sample — a three-term AND is satisfied by strictly fewer palettes than the
  // two-term AND it contains, so the list's page degrades into partial credit
  // sooner. The pair also carries the DIRECTION, which is a fact about the
  // gradient the list cannot express, and "to" does the separating that D23.1's
  // own two-word rule exists to compensate for.
  //
  // The list form is NOT deleted: D23.1 keeps it because
  // /palettes/salmon-teal-turquoise is the best-performing palette page by
  // impressions, and it still emits on the rows where the pair cannot be made
  // (the ends collide as queries, or share a word). It simply never rides
  // beside the journey it is a restatement of.
  if (ramp.length >= MULTI_COLORS && out.length === 0) {
    // The stations, sampled by STOP POSITION rather than by chip index (QA
    // round 5). "Evenly sampled across the ramp" was the intent and the index
    // was not it: on a four-pick row the middle element is the third chip in
    // ramp order, which on a navy -> black -> red -> orange -> cream -> cyan
    // sweep was a one-stop pale cream while the red-and-orange stretch filling
    // a third of the band appeared in neither journey chip. The middle station
    // is now the pick nearest the MIDDLE STOP of the journey it describes.
    const middle = (ramp[0]!.stop + ramp[ramp.length - 1]!.stop) / 2;
    const mid = ramp.reduce((best, c) =>
      Math.abs(c.stop - middle) < Math.abs(best.stop - middle) ? c : best,
    );
    const picked = [ramp[0]!, mid, ramp[ramp.length - 1]!].map((c) => c.label);
    if (
      new Set(picked).size === MULTI_COLORS &&
      picked.every((l) => l.split(" ").length <= 2) &&
      distinctWords(picked)
    )
      out.push(picked.join(" "));
  }
  return out.slice(0, DIRECTIONAL_CHIPS);
}

/**
 * The STORED temperature-journey word, if the caller handed the row its base
 * tags (D25.2: read the indexed tag, never recompute it).
 *
 * Threading it through `tags` rather than adding a parameter is what keeps the
 * server render and the editor island honest: both call this with the tag list
 * they already hold, and a caller that has no coefficient analysis (the island
 * mid-drag) simply gets no journey chip rather than a second, serve-time
 * answer that could disagree with the index.
 */
/** No two of these labels may lean on the same word — see directionalLabels. */
const distinctWords = (labels: readonly string[]): boolean => {
  const words = labels.flatMap((l) => l.split(" "));
  return new Set(words).size === words.length;
};

const journeyTag = (tags: readonly string[]): "warming" | "cooling" | null =>
  tags.includes("warming") ? "warming" : tags.includes("cooling") ? "cooling" : null;

/**
 * May this registry term take a chip slot on THIS row?
 *
 * Everything about the term itself — is it true, is it true with margin, is it
 * discriminating, does another term already imply it, has its axis had its two
 * — is the registry's answer (`chipCharacteristics`). What is left is the
 * question only the finished row can answer: would this word repeat something
 * the row has already printed, in a vocabulary the registry cannot see?
 *
 * Three rules, each of them older than the registry and each kept for the
 * defect it was written for:
 *
 *  1. TEMPERATURE HONESTY. `warm` and `cool` are mean-hue claims and a chip is
 *     a picture claim; see temperatureHonest.
 *  2. THE FAMILY AND HUE-NAME RULES. A hue-axis term is a COLOUR query, so it
 *     competes with the colour chips: it may not repeat a label's head word
 *     (`saysFamily`), may not lead to the same page as one (`anchorsCollide`
 *     at the reference bar — a destination is a destination whatever this
 *     palette's spread is), and a FAMILY word may not stand for a band whose
 *     every stop a colour chip has already named. What is deliberately not
 *     suppressed is the broad word beside a specific one: `blue` beside
 *     `cerulean` on a palette with three blue stops is a different page (the
 *     family branch ranks by SHARE over the whole palette, the colour branch by
 *     proximity to one anchor) and, per D23's GSC pull, the higher-demand of
 *     the two.
 *  3. NOTHING THE ROW ALREADY SAYS. The check runs against the FACT labels
 *     only, never against the colour names — the corpus is full of names that
 *     contain a modifier word ("warm purple", "light blue", "pale rose") and
 *     comparing across the two vocabularies made a colour chip swallow the
 *     palette's temperature.
 */
function factFits(
  c: Characteristic,
  features: PaletteFeatures,
  ctx: CharacteristicCtx,
  named: NamedPalette,
  labels: readonly string[],
  chipped: ReadonlySet<number>,
): boolean {
  if (!temperatureHonest(c.term, features)) return false;
  // THE DOMINANT UNIVERSAL ALREADY SAID IT (QA round 6). The row leads with a
  // bare `white` or `black` when a plateau IS the palette (see PLATEAU_DOMINANT
  // above), and on those rows `near-white` and `near-black` are the same
  // observation one notch weaker: the solid-white palette printed
  // `white | ... | near-white | low-contrast` for an image that is #ffffff seven
  // times. Narrow on purpose - it fires only against the bare universal the row
  // itself added, never against a corpus name that happens to contain the word,
  // which is the confusion rule 3 below was written to avoid.
  if (c.term === "near-white" && labels.includes("white")) return false;
  if (c.term === "near-black" && labels.includes("black")) return false;
  if (c.axis === "hue") {
    if (saysFamily(c.term, labels)) return false;
    if (labels.some((l) => anchorsCollide(c.term, l))) return false;
    if (regionAlreadyNamed(c, ctx, chipped)) return false;
  }
  return true;
}

/**
 * Has a COLOUR CHIP already named the part of the palette this hue word is
 * about? (QA round 4.)
 *
 * This is the largest single redundancy the round measured: 355 of the 867 rows
 * — 40.9% — carried a registry hue or family chip repeating the family of a
 * colour chip already on the row, 424 chips in all. Read down a row it is
 * `cerulean blue | indigo | bright sky blue | ultramarine | azure` (five blue
 * words on a palette whose blue share is 0.71) or `sky | light lavender |
 * violet | blue`, and every one of those words leads to a page of blue
 * palettes.
 *
 * The rule this replaces asked whether EVERY stop of the family had been
 * chipped, which almost never happens on a seven-stop ramp: one unchipped blue
 * stop out of four kept `blue` on the row. The question a reader is actually
 * asking is whether the row has already said this colour, so the test is now
 * "does any chip name a stop in the same family as the stops this word speaks
 * for". It is deliberately family-level rather than label-level: `azure` and
 * `cerulean blue` are different words for the same region of the same palette.
 *
 * WHAT THIS GIVES UP, stated because it was a deliberate decision the other way
 * until now: `blue` beside `cerulean` is a different destination (the family
 * branch ranks by share over the whole palette, the colour branch by proximity
 * to one anchor) and, per D23's GSC pull, the higher-demand of the two. It
 * survives exactly where the colour chips did NOT reach that family — a palette
 * whose blue is real but whose chips spent themselves elsewhere still says
 * `blue`, which is the case the broad word was for.
 */
/** The eight bands in wheel order, for the adjacency test in regionAlreadyNamed. */
const FAMILY_RING: readonly string[] = [
  "red",
  "orange",
  "yellow",
  "green",
  "cyan",
  "blue",
  "violet",
  "magenta",
];

/**
 * ...and where `gatedFamily`'s three extra rungs sit on it.
 *
 * brown, purple and pink are TONE GATES on a band rather than bands of their
 * own - research-colorTheory measured them through this repo's conversion as
 * brown IS orange (h 54.7), sRGB purple IS magenta (h 328.4), pink is a tint
 * region of red - so on the wheel they occupy their parent's slot. Without this
 * the adjacency test below reads them as off-ring and gives up, which is how a
 * `purple` word survived between a magenta chip and a violet one.
 */
const FAMILY_RING_OF = (family: string): string =>
  family === "brown" ? "orange" : family === "purple" ? "magenta" : family === "pink" ? "red" : family;

function regionAlreadyNamed(
  c: Characteristic,
  ctx: CharacteristicCtx,
  chipped: ReadonlySet<number>,
): boolean {
  const gate = GATED_HUE_NAMES.find((g) => g.term === c.term);
  // The stops this word speaks for: its own family band, or the stops its gate
  // fits. A word with no region on this palette is not repeating anything.
  const region = ctx.families
    .map((f, i) => (gate ? hueNameFits(gate, ctx.stops[i]!) : f === c.term))
    .flatMap((hit, i) => (hit ? [i] : []));
  const said = new Set([...chipped].map((i) => ctx.families[i]).filter(Boolean));
  if (region.some((i) => ctx.families[i] && said.has(ctx.families[i]!))) return true;
  // ...AND A WORD SANDWICHED BETWEEN TWO CHIPS OF ITS OWN SUPERFAMILY (QA
  // round 6).
  //
  // The test above is family-level, and the eight-band partition splits a
  // continuous purple run across THREE of its bands: #984568 is magenta,
  // #660086 is violet, and the stops between them answer to `purple`. So a row
  // could print `dark mauve` (a magenta stop), `indigo` (a violet stop) and
  // then `purple` for the stops BETWEEN them — three purple-family words for
  // one visible mass, none of which the rule above can see because no chipped
  // stop shares `purple`'s own band.
  //
  // A word whose whole region lies BETWEEN two already-named stops is
  // describing a passage the row has bracketed. That is a claim about position
  // on the ramp, not about the partition, so it holds wherever the bands fall:
  // if the chips either side of a run are named and the run is continuous, the
  // reader has been told where it goes.
  if (!region.length) return false;
  const lo = Math.min(...region);
  const hi = Math.max(...region);
  const before = [...chipped].filter((i) => i < lo).sort((a, b) => b - a)[0];
  const after = [...chipped].filter((i) => i > hi).sort((a, b) => a - b)[0];
  if (before === undefined || after === undefined) return false;
  // ...and only when the brackets are the SAME MASS: their families adjacent to
  // (or equal to) a family the region itself holds. A teal run between a red
  // chip and a yellow chip is a colour nobody named and keeps its word; a
  // purple run between a magenta chip and a violet chip has been named twice
  // already.
  const neighbouring = (family: string | null | undefined) =>
    !!family &&
    region.some((i) => {
      const own = ctx.families[i];
      if (!own) return false;
      const a = FAMILY_RING.indexOf(FAMILY_RING_OF(own));
      const b = FAMILY_RING.indexOf(FAMILY_RING_OF(family));
      if (a < 0 || b < 0) return false;
      const d = Math.abs(a - b);
      return Math.min(d, FAMILY_RING.length - d) <= 1;
    });
  return neighbouring(ctx.families[before]) && neighbouring(ctx.families[after]);
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
    if (label && !seen.has(key) && labels.length < CHIP_MAX) {
      seen.add(key);
      labels.push(label);
    }
  };

  // ...unless the universal IS the palette. D18's demotion was written for
  // "white on a pastel palette", where the white stop describes the ramp's edge,
  // and it inverts on a palette that renders pure black for two thirds of its
  // length: there the chips spent both top slots on near-synonyms for the two
  // thin brown edges ("deep brown", "dark brown") and never offered the colour
  // a visitor is actually looking at. 8 of the 867 fixture seeds are at least a
  // quarter pure black, 6 at least a tenth pure white, so this is a class and
  // not a one-off. The dominant word leads the row, ahead of the chroma ranking.
  const dominant =
    features.allBlackShare >= PLATEAU_DOMINANT
      ? "black"
      : features.allWhiteShare >= PLATEAU_DOMINANT
        ? "white"
        : null;
  if (dominant) add(dominant);

  const picks = chipColors(named, tags, labels);
  const colors = picks.filter((c) => !c.lastResort);
  for (const c of colors) add(c.label);
  // ...and the JOURNEY, in ramp order (D23.1). Colour chips first, then the
  // directional form built out of them, then everything else: D23.2 gives
  // colour first claim on the budget.
  const directional = directionalLabels(colors, picks, features);
  for (const label of directional) add(label);

  // THE PALETTE'S TRUE FACTS, from the registry (D25.5).
  //
  // Until 2026-08-18 this half of the row was its own selection: the fired
  // DESCRIPTORS, ranked by descriptorScore, with a hand-written pass for the
  // implied words, one for the axes, one for the family backfill and one for
  // the halves of compounds. The registry now holds every one of those rules
  // (rank by information content, dedupe by `implies`, the measured synonym
  // groups, the axis quota) and holds them for 133 terms instead of 22, so what
  // is left here is what only the ROW knows: which labels it has already
  // printed, and which of them a fact would be saying twice.
  const ctx = characteristicCtx(features, named.stops, { journey: journeyTag(tags) });
  const chipped = new Set(colors.map((c) => c.stop));
  const factLabels: string[] = [];
  const facts = chipCharacteristics(features, ctx, {
    reject: (c) => !factFits(c, features, ctx, named, labels, chipped),
  });
  const addFact = (label: string) => {
    factLabels.push(label);
    add(label);
  };
  // Compounds first, out of the SAME ranked facts, because two words are
  // strictly more specific than either (D17) — and because a compound built on
  // a fact the row would not have shown is a claim about a boundary case.
  for (const label of compoundLabels(facts)) addFact(label);
  // ...and a word the row has already spent inside a COMPOUND waits its turn.
  //
  // D17 emitted the compound and then both of its halves. QA round 1 dropped
  // the halves, measuring that page 1 of `dark complementary` and of
  // `complementary` shared 24 of 24 results — but that measurement was taken
  // through an AND-only filter, where a compound's page IS its part's page
  // plus an unranked tail. With the partial-credit ranking (tag-search.ts,
  // QA round 2) the pages separate: re-measured over the same stand-in, a
  // compound's page 1 now shares 6 to 22 of 24 with its parts' (pastel rainbow
  // 18 and 12, dark duotone 21 and 6, earthy monochrome 8 and 18). They are
  // different destinations, and the parts are the queries a visitor types —
  // the QA row that spent its only tone and structure slots on `pastel
  // rainbow`, a dimension 8 of 867 palettes have, offered no link to `pastel`
  // or to `rainbow` at all.
  //
  // So the parts come back, LAST: the compound is strictly more specific and
  // keeps its place at the front, every other fact is served before a word the
  // row has already said once, and what the parts spend is the tail of a row
  // whose measured length is well inside its cap.
  for (const c of facts) {
    // A WORD THE ROW HAS ALREADY PRINTED INSIDE A COMPOUND DOES NOT COME BACK
    // (QA round 4, D25.5 by name).
    //
    // QA round 3 let the halves return at the tail of a long row, on the
    // measurement that a compound's page and its parts' pages differ (6 to 22
    // of 24 shared). They do differ — and the row is not a search index, it is
    // a list a person reads, and read as a list "saturating analogous |
    // saturating | analogous" is one fact wearing three chips. The round-4 QA
    // filed it three times on three different palettes (`pastel analogous |
    // pastel | analogous`, `dark complementary | complementary | dark`,
    // `brightening sunset | sunset | brightening`) and measured it on 115 of
    // the 867 rows, 13.3%. The compound is strictly the more specific claim and
    // keeps its slot; the slot the half would have taken goes to the next fact
    // the palette actually has, because `chipCharacteristics` was asked for its
    // ranked pool and this loop simply walks past the ones already said.
    if (redundantWith(c.term, factLabels)) continue;
    // ...and a term two words the row has already printed TOGETHER already
    // state. See COMPOUND_SHADOWS: `brightening monochrome` is `ombre` spelled
    // out, and the row was printing both.
    if (compoundShadowed(c.term, factLabels)) continue;
    addFact(c.term);
  }
  // ...and a row that says nothing about the palette says the nearest true
  // thing (QA round 6). See ChipSelection.plain: exactly one of the 867 fixture
  // rows reached this with no fact at all, and its five nearest facts were all
  // within a hair of their strong band. The pool is re-ranked over the terms
  // that are merely TRUE, everything else about the walk is identical, and only
  // the first survivor is taken - the fallback is one fact, never a second row.
  if (!factLabels.length)
    for (const c of chipCharacteristics(features, ctx, {
      limit: 1,
      plain: true,
      reject: (x) => !factFits(x, features, ctx, named, labels, chipped),
    }))
      addFact(c.term);
  for (const c of picks) {
    if (labels.length >= 2) break;
    if (c.lastResort) add(c.label);
  }
  return labels;
}

/**
 * The compound labels, from PROMINENT facts that CO-FIRE (D17, widened by
 * D22.B3, moved onto the registry by D25.5).
 *
 * The grammar is bounded by construction: one word from temperature or tone,
 * one from family or structure, joined in SLOT order, never three words, never
 * a color name, never free text. So the compound space is a subset of (registry
 * terms)² and the crawl frontier stays finite.
 *
 * THE PAIRS COME FROM THE ROW'S OWN FACTS, not from everything true. Before the
 * registry this walked every fired descriptor, so a compound could be built out
 * of a fact that was only just true and that the row itself would not print —
 * which is the boundary case D24.1 exists to keep off the chips. Now both
 * halves are terms that passed the prominence rule, and the ranking key is
 * their information content rather than the descriptor score.
 *
 * Three filters, each removing a pair that is true but not worth a link:
 *  - CONTRADICTED_BY (palette-name.ts) excludes the pairs that would read as a
 *    contradiction, the same table that stops the NAME saying them next to each
 *    other.
 *  - `implies` excludes the pairs where one word already claims the other:
 *    "warm sunset" and "cool ocean" are the registry's own implications read
 *    back as a compound, and they say one thing twice.
 *  - No two compounds may share a WORD, head or modifier. D17 capped the count
 *    and not the shape, so "dark monochrome | muted monochrome" got through:
 *    two chips, one noun, three ideas dressed as four. QA round 2 found the
 *    same defect on the other half of the grammar — `neon ocean` beside
 *    `neon monochrome`, whose pages share 14 of 24 results and open on the same
 *    palette, because the word they share is the one doing most of the
 *    filtering. Both halves are now a set.
 */
/** Does a compound already on the row state this term? See COMPOUND_SHADOWS. */
const compoundShadowed = (term: string, labels: readonly string[]): boolean =>
  COMPOUND_SHADOWS.some(
    (r) =>
      r.shadows.includes(term) &&
      labels.some((l) => {
        const w = l.split(" ");
        return w.includes(r.pair[0]) && w.includes(r.pair[1]);
      }),
  );

function compoundLabels(facts: readonly Characteristic[]): string[] {
  const out: { label: string; score: number }[] = [];
  for (const a of facts) {
    for (const b of facts) {
      if (a === b) continue;
      const sa = COMPOUND_SLOT[a.axis];
      const sb = COMPOUND_SLOT[b.axis];
      if (sa === undefined || sb === undefined || sa >= sb) continue;
      // temperature or tone, then family or structure.
      if (sa > COMPOUND_SLOT.value! || sb < COMPOUND_SLOT.family!) continue;
      // ONE WORD EACH. The registry carries multi-word terms now (`jewel
      // tones`, `spring green`, `warm cool contrast`); a compound built from
      // one reads as a sentence with the punctuation missing and its
      // destination parses as three terms rather than two.
      if (a.term.includes(" ") || b.term.includes(" ")) continue;
      if (
        CONTRADICTED_BY[a.term]?.includes(b.term) ||
        CONTRADICTED_BY[b.term]?.includes(a.term) ||
        a.implies?.includes(b.term) ||
        b.implies?.includes(a.term)
      )
        continue;
      const score = characteristicScore(a) + characteristicScore(b);
      // A COMPOUND HAS TO HAVE A PAGE (QA round 5, D25.6 by name; the test
      // rewritten in round 6).
      //
      // The rule was an INDEPENDENCE estimate — `FIXTURE_BITS - score` as the
      // expected population, refused below one palette — and round 6 measured
      // that the estimate is wrong in both directions on real pairs, because
      // the two halves come from different axes by construction and that says
      // nothing about whether a wide cosine produces both. `bright-middle
      // complementary` estimates 1.65 palettes and has 4 (its page came back 3
      // of 24 genuine, 21 slots one-part matches); `bright-middle rainbow`
      // estimates 1.4 and has 13. So the joint is looked up rather than
      // derived, and the floor is half a page: see COMPOUND_SUPPORT.
      //
      // `score` is still the RANK key below — of the pairs that have a page,
      // the rarer one is the more specific claim.
      if ((COMPOUND_SUPPORT[`${a.term} ${b.term}`] ?? 0) < COMPOUND_SUPPORT_FLOOR) continue;
      out.push({
        label: `${a.term} ${b.term}`,
        score,
      });
    }
  }
  const spent = new Set<string>();
  const picked: string[] = [];
  for (const x of out.sort((a, b) => b.score - a.score || (a.label < b.label ? -1 : 1))) {
    if (picked.length >= COMPOUND_CHIPS) break;
    const words = x.label.split(" ");
    if (words.some((w) => spent.has(w))) continue;
    for (const w of words) spent.add(w);
    picked.push(x.label);
  }
  return picked;
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
