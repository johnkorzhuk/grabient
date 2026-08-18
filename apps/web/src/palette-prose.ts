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
  getUniqueColorNames,
  hexToColorName,
  hexToOkLch,
  hexToRgb,
  oklabDistance,
  relativeLuminance,
  relativeSaturation,
  rgbToOklab,
  type OkLch,
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
  NAMES_FOR_STRUCTURE,
  styleLabel,
  toneNameVeto,
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
 * The three names that are the SAME hue at a different lightness or chroma.
 *
 * research-colorTheory §1.2 measured them through this repo's own conversion:
 * brown IS orange (h 54.7), sRGB purple IS magenta (h 328.4), pink is a tint
 * region of red. The conflation law in §9 is "name by gate, never by hue
 * alone", and until now the prose said the band word whatever the tone, which
 * produced "It holds one orange and changes only how light it is" over a
 * chocolate-to-cream ramp, "The colors stay inside one range of magenta" over a
 * lavender-to-plum purple, and "It moves from red into yellow" starting on a
 * stop the corpus had just called pinkish gray.
 *
 * Gates verbatim from the research table: brown L < 0.55 with C 0.04-0.13,
 * purple L < 0.55 with C >= 0.12, pink L > 0.75 with C 0.04-0.15.
 *
 * The pink rung covers the MAGENTA band as well as the red one since
 * 2026-08-18: a tint is a tint on either side of the red/magenta line, and the
 * chip row was offering "magenta" for #ffc3ff (L 0.889, C 0.103), a near-white
 * pink on a palette whose every stop sits above L 0.85. The research table
 * wrote the rung for red because that is where "pink" is the standard word; the
 * measurement says the band edge is not where the tone stops being one.
 */
const BROWN_MAX_L = 0.55;
const BROWN_CHROMA: readonly [number, number] = [0.04, 0.13];
/**
 * ...and the second brown rung, for the tans (2026-08-18, visual QA).
 *
 * The research table wrote brown as a DARK orange, and the absolute chroma
 * window beside it is the D19 conflation one level down: at L 0.35 a chroma of
 * 0.13 is the whole gamut, at L 0.63 it is four fifths of it, so one window
 * cannot mean the same thing at two lightnesses. A tan is the other half of
 * brown — a MID orange with most of its colour missing — and the gate could not
 * see it: #ac7b61 (L 0.626, C 0.072, 43% of what sRGB allows at that lightness)
 * fell through to the raw band word and the paragraph read "It is a single
 * orange softened with gray" over an image of tan fading to mauve gray, whose
 * own identity sentence had just called that stop pinkish brown.
 *
 * So the rung asks the relative question, which is the identity question (D19),
 * with the registry's own `light` line as the ceiling: above it a dull orange is
 * a cream, not a brown. Checked against the corpus, which is the survey's record
 * of what people actually call these colours: of the fixture's 586 orange-band
 * stops, this rung calls 174 brown and the corpus independently uses a brown or
 * tan word for 139 of them (80%), against 78% for the dark rung alone, and it
 * recovers 54 of the 131 corpus-brown stops the dark rung was missing. Every
 * distinct stop it adds is named mocha, tan brown, light brown, adobe, mushroom,
 * dull brown, camel, puce, pale brown, dust, taupe, brownish pink, brownish
 * gray, peru, reddish gray, pinkish brown or pinkish tan by the corpus: not one
 * of them is called orange.
 */
const BROWN_MAX_SATURATION = 0.6;
const PURPLE_MAX_L = 0.55;
const PURPLE_MIN_CHROMA = 0.12;
const PINK_MIN_L = 0.75;
const PINK_CHROMA: readonly [number, number] = [0.04, 0.15];

/**
 * What to CALL a region of the palette, or null when it has no colour to name.
 *
 * The null is the point. A family word is an identity claim, so it takes the
 * registry's own family floor in both readings (FAMILY_CHROMA or, for the tints
 * that sit at the sRGB ceiling, FAMILY_SATURATION), and a cream-to-taupe ramp
 * at C 0.034 clears neither: it used to be announced as "a single orange", and
 * now the form sentence stays silent and the description spends its budget on
 * something true. Silence is a correct outcome (D20.1), a wrong word is not.
 */
function gatedFamily(stop: OkLch | null): string | null {
  if (!stop) return null;
  const band = familyWord(stop.h);
  if (
    band === "orange" &&
    stop.C >= BROWN_CHROMA[0] &&
    ((stop.L < BROWN_MAX_L && stop.C <= BROWN_CHROMA[1]) ||
      (stop.L < T.LIGHT_LIGHTNESS && relativeSaturation(stop) < BROWN_MAX_SATURATION))
  )
    return "brown";
  if (band === "magenta" && stop.L < PURPLE_MAX_L && stop.C >= PURPLE_MIN_CHROMA)
    return "purple";
  if (
    (band === "red" || band === "magenta") &&
    stop.L > PINK_MIN_L &&
    stop.C >= PINK_CHROMA[0] &&
    stop.C < PINK_CHROMA[1]
  )
    return "pink";
  // ...and the relative disjunct needs a visibility floor under it (D19 has one
  // blind spot, at the very top of the solid: as L → 1 the ceiling collapses, so
  // any residue reads as 100% saturation). FAMILY_MIN_CHROMA records the sweep.
  // Without it a stop at L 0.9992 and C 0.0039 — white, in the image and in its
  // own printed name — was announced as a family, and the paragraph read "It
  // moves from yellow into pink" one clause after naming that stop white.
  return stop.C >= T.FAMILY_CHROMA ||
    (relativeSaturation(stop) >= T.FAMILY_SATURATION && stop.C >= T.FAMILY_MIN_CHROMA)
    ? band
    : null;
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
  jewel: { use: "prose", rate: 0.1223 },
  sepia: { use: "embed", rate: 0.0104 },
  ombre: { use: "prose", rate: 0.1811 },
  "warm-gray": { use: "prose", rate: 0.0288 },
  "opponent-axis": { use: "prose", rate: 0.4187 },
  "warm-cool-contrast": { use: "prose", rate: 0.2284 },
  "saturation-contrast": { use: "prose", rate: 0.1061 },
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

/** Dark AND chromatic — `dark` allows gray, deep must not fire on charcoal. */
const isDeep = (f: PaletteFeatures) => f.meanLightness < 0.45 && f.meanChroma >= 0.08;

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

/**
 * Vivid AND light — not a synonym of vivid; the light half is definitional.
 *
 * The light half takes the registry's own LIGHT_LIGHTNESS since 2026-08-18. It
 * used to carry a private bar of 0.7, and a private bar is how a palette came to
 * be told "The colors are light and strong at the same time" while the system's
 * own `light` descriptor had NOT fired on it: three fire reds at L 0.64 into a
 * mint at L 0.89, mean 0.738, which reads as hot bold red for half its length.
 * A word in the description has to mean what the registry means by it or the
 * page argues with its own tags. Measured over the fixture the detector falls
 * from 8.3% to 2.2%, which is inside the speaking band but near its floor: if a
 * re-measure takes it under 2% the word becomes embedding-tail vocabulary and
 * the `bright-strong` row retires with it, which is the band contract working.
 */
const isBrilliant = (f: PaletteFeatures) =>
  f.meanChroma >= T.VIVID_CHROMA && f.meanLightness >= T.LIGHT_LIGHTNESS;

/**
 * Near-neutral with a consistent lean. Below the per-stop hue floor only the
 * aggregate is stable, and meanHue IS that aggregate: OkLab a = C·cos(h),
 * b = C·sin(h), so the chroma-weighted circular mean over the dense sample is
 * exactly atan2(b̄, ā) — the mean-vector test research-colorTheory §1.3 asks
 * for, already computed.
 */
function grayLean(f: PaletteFeatures): "warm" | "cool" | null {
  // D19: "is this a gray at all" is an IDENTITY question, so it takes the
  // relative reading — the same GRAYSCALE_SAT conjunct `isGrayscale` uses. The
  // palette that exposed the original bug (#ceeaff, #fcd3d4, #deffff: plainly
  // blue, pink and cyan, mean chroma 0.029) sits at 0.75 mean saturation and is
  // excluded by it; calling that a warm gray is the same mistake as calling it
  // grayscale.
  //
  // The absolute CEILING that used to sit beside it (C < CHROMA_FLOOR, from the
  // research table) came off on 2026-08-18. It was the chroma-not-saturation
  // conflation again, one layer down: a greige ramp at C 0.034 has no more
  // colour in it than one at C 0.029, and the detector was blind to it. Rate
  // over the fixture 2.0% → 3.6%, which lifts the word over the 2% floor and
  // into prose, which is where the QA round wanted it: a warm beige-to-taupe
  // ramp was being described as "grayscale ... the colors stay light", and its
  // warmth is the most characterising thing about it. The floor at 0.008 stays:
  // below it the mean vector is numerical residue and has no lean at all.
  if (f.denseMeanSaturation >= T.GRAYSCALE_SAT) return null;
  if (f.denseMeanChroma < 0.008) return null;
  // ...and the mean has to be a CONSENSUS. An angle exists whether or not the
  // vectors that made it agree, and where they cancel it is an artifact: a
  // lavender-white to sage-gray ramp (stop hues 303, 329, 24, 75, 97, 124, 177,
  // all under C 0.015) returns a mean of 50.8°, so the sentence read "The colors
  // are warm grays" while the same paragraph named its ends lavender and cool
  // gray and the chip row printed "cool gray". Concentration is the standard
  // circular-dispersion measure and it separates the two cases cleanly here:
  // 0.397 and 0.186 for the two leans the QA round rejected, 0.80 to 0.999 for
  // ten of the remaining eleven. 0.6 is a circular SD of about 58°, so the bulk
  // of the chromatic mass fits inside the 150° arc the lean names.
  if (f.hueConcentration < LEAN_CONCENTRATION) return null;
  if (f.meanHue >= 330 || f.meanHue < 120) return "warm";
  if (f.meanHue >= 150 && f.meanHue < 300) return "cool";
  return null;
}

/** See grayLean: R = 0.6, a circular standard deviation of about 58°. */
const LEAN_CONCENTRATION = 0.6;

/**
 * How far apart the two hue anchors must sit before "it moves from X into Y" is
 * a journey rather than a boundary crossing. One family width: the eight anchors
 * partition the wheel, so 360/8 is the distance at which two hues stop being
 * neighbours on one side of a line. See the `neighbors` row for the measurement.
 */
const NEIGHBOR_TRAVEL = 360 / 8;

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

/**
 * Which transformation relates a monochrome palette's stops. The BASE it is a
 * series of is `Ctx.base`, the tone-gated word for the most chromatic sample:
 * a monochrome palette has one hue, so the paragraph must use one word for it,
 * and reading the base here as well let the two disagree across a band edge
 * (measured: a 21° red-orange mono read "orange" in one sentence and "red" in
 * the next before this was pinned to a single source).
 */
type SeriesKind = "tints and shades" | "tints" | "shades" | "tones";

/**
 * The tint/shade/tone series detector (research-colorTheory §2), meaningful
 * only for monochrome structure: which transformation relates the stops. Runs
 * on the rendered stops sorted by lightness; the base is the palette's family
 * word — a transformation noun always takes "of + base", and the base must have
 * usable chroma to be named at all.
 */
function seriesReading(f: PaletteFeatures, hexColors: readonly string[]): SeriesKind | null {
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

  if (tint && shade) return "tints and shades";
  if (tint) return "tints";
  if (shade) return "shades";
  if (tone) return "tones";
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
type ImpressionSlot = "tone" | "form" | "motion" | "intensity";

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
    id: "rich",
    slot: "tone",
    prevalence: 0.0369,
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
    prevalence: 0.1153,
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
  {
    // Itten's cold-warm contrast: both poles present at once, not a drift.
    id: "warm-and-cool",
    slot: "tone",
    prevalence: 0.2284,
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
    prevalence: 0.0161,
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
    prevalence: 0.06,
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
    conflictsIn: (c) => {
      const { neutral, shape } = duotoneCrossing(c);
      if (neutral === "gray") return [];
      if (shape === "mid-valley") return neutral === "black" ? ["dark-middle"] : ["bright-middle"];
      if (shape === "mid-peak") return neutral === "black" ? ["bright-middle"] : ["dark-middle"];
      return [];
    },
  },
  {
    id: "opposite-colors",
    slot: "form",
    prevalence: 0.0334,
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
  {
    id: "whole-wheel",
    slot: "form",
    prevalence: 0.0242,
    when: (c) => c.has("full-wheel"),
    say: () => "It travels the whole color wheel, passing every family on the way.",
  },
  {
    id: "rainbow",
    slot: "form",
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
    slot: "form",
    prevalence: 0.0577,
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
    slot: "form",
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
    prevalence: 0.3783,
    when: (c) => c.structure === "multicolor",
    restates: (c) => c.names.length >= 3,
    say: () => "It passes through several colors between its ends.",
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
    prevalence: 0.015,
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
      // licensed palettes → 16, and the 10 it drops are all clean ramps whose
      // motion row now names both ends itself.
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
    // ...and since 2026-08-18 they say WHERE the run starts and where it
    // arrives whenever both ends have a name (D21.2). "It becomes darker from
    // start to end" is the direction with the picture removed, and the two end
    // luminances that used to license the deleted text-pairing sentence are
    // exactly what names the two ends. See depthBand for the ladder and for
    // which band pairs may be spoken.
    id: "brightens",
    slot: "motion",
    prevalence: 0.3356,
    when: (c) =>
      (c.has("brightening") || (c.f.turns === 1 && c.f.lightnessDelta > 0)) &&
      rampDominates(c.f),
    say: (c) => depthSentence(c) ?? "It becomes lighter from start to end.",
  },
  {
    id: "darkens",
    slot: "motion",
    prevalence: 0.1626,
    when: (c) =>
      (c.has("darkening") || (c.f.turns === 1 && c.f.lightnessDelta < 0)) &&
      rampDominates(c.f),
    say: (c) => depthSentence(c) ?? "It becomes darker from start to end.",
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
 * runs p0 95, p50 189, max 262, and the page paragraph, which adds the view
 * sentence, runs p0 200, p50 294, p95 333, max 367. 809 of 867 palettes spend
 * both sentences; 55 have one true thing worth saying and 3 have none, which is
 * the correct outcome and not a failure. The count rose from 22 over the second
 * and third visual-QA rounds, where several sentences that were firing on
 * palettes they were not true of lost their gates.
 */
const BUDGET = 2;

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
  // sentence states the degenerate case in full, and every other slot would be
  // describing a gradient that is not there ("nearly gray, with very little
  // color in it" on a pure white field). Only the USE slot survives, because a
  // single flat color is the most background-like palette there is. The rule
  // has to bind here rather than on the chosen pair, or the budget fills with
  // sentences that are then thrown away and the palette says nothing at all.
  const eligible = (i: Impression) =>
    i.when(c) && !i.restates?.(c) && (!c.solid || i.slot === "use");
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
 */
const FAMILY_VOCABULARY: readonly string[] = [
  // Derived from the partition rather than copied out of it (D12): the eight
  // anchors ARE the distinct answers colorFamily gives over the wheel.
  ...new Set(Array.from({ length: 360 }, (_, h) => familyWord(h))),
  "brown",
  "purple",
  "pink",
];

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
  const tagWords: string[] = [];
  const seen = new Set<string>();
  for (const w of [...modifierTags(f), ...(journey ? [journey] : []), ...parts.embedTailTags]) {
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
 * How many of the six chips may be color names: whatever the palette's own hue
 * structure can support, the same ceiling the NAME uses (2 for a monochrome or a
 * duotone, 3 for an analogous or multicolor run, 4 for a rainbow).
 *
 * A cap is needed at all because the candidate list is now the palette's whole
 * distinct name set: without one, six near-synonyms from one ramp fill the row
 * and crowd out the modifier and compound labels D17/D18 asked for, which are
 * the labels that say what KIND of palette this is. Keying it to the structure
 * rather than to a flat number is the argument palette-name.ts already makes
 * about the name: how many colours a palette can be described in is a fact about
 * the palette. It is also what lets a rainbow keep its fourth colour, which the
 * QA round asked for (a mint filling the left quarter of a seven-colour band was
 * ranked fourth by chroma and cut).
 */
const nameLabelBudget = (structure: string) => NAMES_FOR_STRUCTURE[structure] ?? 3;

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
/**
 * Whether a candidate label and a chosen one are the same suggestion, one of
 * them merely qualified: "yellow" beside "sun yellow", "peach" beside "pale
 * peach". A visitor reads that row as two ideas and it is one, which is the
 * arithmetic the compound-parts retirement already fixes a level up. Tested both
 * ways so the ranking decides which survives rather than the insertion order:
 * the color-name pass runs by chroma, so the more coloured stop keeps its word.
 *
 * Whole-word containment only. "aqua blue" beside "deep sky blue" shares a head
 * and is two genuinely different colours, and both are queries worth offering.
 */
const redundantWith = (label: string, labels: readonly string[]): boolean => {
  const a = ` ${label.toLowerCase()} `;
  return labels.some((l) => {
    const b = ` ${l.toLowerCase()} `;
    return a !== b && (a.includes(b) || b.includes(a));
  });
};

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

  // The palette's DISTINCT colour names, ranked by the chroma of the stop each
  // one names.
  //
  // The candidate list used to be `named.colorNames`, which is the two to four
  // names the TITLE could fit, and ranking inside it cannot reach a colour the
  // title left out: a palette whose left half is mint, cyan and cobalt offered
  // "red | sun yellow | yellow" with no blue label at all, though its own embed
  // line lists "sun yellow, bright sky blue, cobalt blue, black, maroon, red".
  // The chips are not the title and have no reason to inherit its budget, so
  // they run the same farthest-point selection with NO ceiling, letting its own
  // perceptual-separation rule decide how many distinct colours the palette has
  // (measured over the fixture: 2 to 7, p50 3, at the default 7 steps). Not the
  // raw stops: at 7 or 13 steps that is a run of near-synonyms, and ranking THAT
  // by chroma returns three neighbours from the middle of one ramp ("squash |
  // orangey yellow | dull orange" for a palette whose ends are papaya whip and
  // brick orange). And not a fixed six either, which dropped exactly the mint
  // the QA round asked for on a seven-colour rainbow. Measured: 623 of the 867
  // fixture palettes had at least one distinct stop name that could never reach
  // the row.
  //
  // The veto is the palette's own (see toneNameVeto): a name the title is not
  // allowed to use is not a search suggestion either, and the top chip on a
  // vivid sunset linked to /palettes/pastel-red.
  //
  // Which stop each name names is recovered by naming the stops again with the
  // same corpus function — hexToColorName and getUniqueColorNames both go
  // through nearestNamed, so the first stop answering to a label is exactly the
  // stop that produced it, and ramp order is the tie-break the ranking wants.
  const veto = toneNameVeto(tags);
  // One naming pass over the stops rather than one per label: the row is
  // rebuilt on every slider tick in the editor, and the corpus is 920 entries.
  const stopNames = named.stops.map((hex) => hexToColorName(hex, veto));
  const ranked = getUniqueColorNames([...named.stops], { max: named.stops.length, veto })
    .map((name, i) => {
      const at = stopNames.indexOf(name);
      const lch = at >= 0 ? hexToOkLch(named.stops[at]!) : null;
      return { name, i, C: lch?.C ?? 0, L: lch?.L ?? 0.5 };
    })
    .sort((a, b) => b.C - a.C || a.i - b.i);

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

  // The lightness half of the demotion carries no chroma condition at the dark
  // end since 2026-08-18. D18 wrote it as "achromatic AND extreme", and a
  // visually pure black measures C 0.053 at 100% saturation (OkLab's cube root
  // again), so #00000f chipped as "midnight" and ranked SECOND on a palette
  // whose image is dominated by an orange and a deep red. Below L 0.1 a stop is
  // black to a viewer whatever its hue says, and a black name tells a visitor
  // nothing about this palette. The light end keeps its chroma condition: a
  // near-white CAN carry a useful colour word (cream, blush), and the D18
  // report was about "white" specifically.
  const demoted = (s: { name: string; C: number; L: number }) =>
    UNIVERSAL_NAMES.has(s.name.toLowerCase()) ||
    s.L < 0.1 ||
    (s.C < T.CHROMA_FLOOR && s.L > 0.9);

  // ...and only as many as the palette's structure can carry. See
  // nameLabelBudget.
  const nameBudget = nameLabelBudget(classifyStructure(features));
  let namesSpent = 0;
  for (const s of ranked) {
    if (namesSpent >= nameBudget) break;
    if (demoted(s) || redundantWith(s.name, labels)) continue;
    const before = labels.length;
    add(s.name);
    if (labels.length > before) namesSpent++;
  }

  // Compounds outrank their parts: two words are strictly more specific than
  // either, and "pastel rainbow" is a query a person actually types.
  //
  // ...and a compound RETIRES its parts. A row reading "rainbow | dark rainbow
  // | muted rainbow | dark" spends four of its six slots on permutations of two
  // words, which is three suggestions pretending to be six. The compound is the
  // more specific label and it already contains the general one, so the general
  // one stops earning a slot of its own.
  const fired = DESCRIPTORS.filter((d) => d.spoken && tags.includes(d.word)).sort(
    (a, b) => descriptorScore(b) - descriptorScore(a),
  );
  const compounds = compoundLabels(fired);
  const spent = new Set(compounds.flatMap((label) => label.split(" ")));
  for (const label of compounds) add(label);
  for (const d of fired) if (!spent.has(spokenWord(d))) add(spokenWord(d));

  if (labels.length < 3) {
    const structure = classifyStructure(features);
    // Same D18 argument as the color names: the family a palette belongs to is
    // the family of its most COLORED stop, not of whichever end happened to
    // come first. On a white → cream → pink → lavender ramp the ramp-order
    // reading backfilled "yellow" (the cream), which describes the palette
    // least; by chroma it backfills "violet".
    //
    // And the word is the TONE-GATED one (2026-08-18). familyWord answers by
    // hue alone, which is the D18 complaint one level up: an olive is a dark,
    // dull yellow, and the bare anchor drops both qualifiers, so a teal → green
    // → olive palette offered "yellow" as a search while its own corpus names
    // for that stop were "brown green" and "muddy green". gatedFamily is the
    // same test the prose sentences use: it converts where a tone word exists
    // (brown, purple, pink) and returns null where the stop is too washed out
    // to name a family at all, which is a chip not worth offering.
    const strongest = ranked.length
      ? named.stops.filter(stopHasHue).sort((a, b) => hexToOkLch(b).C - hexToOkLch(a).C)[0]
      : undefined;
    const familyCandidates: (OkLch | null)[] =
      structure === "grayscale"
        ? []
        : structure === "monochrome"
          ? [features.chromaPeak]
          : [
              ...(strongest ? [hexToOkLch(strongest)] : []),
              features.chromaPeak,
              features.firstChromatic,
              features.lastChromatic,
            ];
    for (const stop of familyCandidates) {
      if (labels.length >= 3) break;
      const word = gatedFamily(stop);
      // ...and never a word the row already contains inside a longer label. A
      // bare family word backfilled beside the corpus name it generalizes is
      // not a second suggestion: "red | sun yellow | yellow" offers two ideas in
      // three chips, and "yellow" is strictly implied by "sun yellow". 10 of the
      // 867 fixture rows carried one.
      if (word && !redundantWith(word, labels)) add(word);
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
 * fixture seeds it produces 30 distinct labels over 169 of the 867 chip rows.
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
  // Two compounds, and never two built on the same HEAD. D17 capped the count
  // and not the shape, so "dark monochrome | muted monochrome" got through: two
  // chips, one noun, three ideas dressed as four — the same arithmetic the
  // parts-retirement above exists to fix, one level up. The head is the second
  // word by construction (SLOT order puts tone or temperature first), so
  // distinctness is a set on it.
  const heads = new Set<string>();
  const picked: string[] = [];
  for (const x of out.sort((a, b) => b.score - a.score || (a.label < b.label ? -1 : 1))) {
    if (picked.length >= 2) break;
    const head = x.label.slice(x.label.indexOf(" ") + 1);
    if (heads.has(head)) continue;
    heads.add(head);
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
