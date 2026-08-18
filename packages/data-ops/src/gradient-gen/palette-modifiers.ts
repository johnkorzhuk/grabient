/**
 * Palette modifiers — the deterministic characteristics that distinguish one
 * palette from another, and the rule for choosing which of them to say.
 *
 * This is deliberately a NEW file rather than more axes on palette-tags.ts. That
 * module's output is written into Vectorize metadata by a pipeline outside this
 * repo, so changing any value it already emits desyncs the index against what is
 * stored. Everything here is additive and computed at serve time.
 *
 * THE PROBLEM THIS SOLVES. Almost any color-theory property can be computed
 * exactly from a cosine palette, so the limit is not what can be detected but
 * what is worth saying. Forty-one candidates were measured against the 866 live
 * palettes across two passes; nine died on the rules, and the survivors would
 * still produce an unreadable heap if all of them were spoken at once. So the
 * registry below carries what each descriptor COSTS to say and what it EARNS,
 * and `selectModifiers` spends a fixed budget on the best few.
 *
 * THE HARMONY CORPUS IS EXHAUSTED, not sampled. Every classical scheme was
 * implemented and measured: monochromatic, analogous and complementary are all
 * well populated, and triadic (0.2%), split-complementary (0%), tetradic (0%)
 * and square (0%) are effectively absent. That is a property of the generator,
 * not an oversight — a cosine ramp sweeps hue continuously, so it lands on
 * three or four evenly-spaced ISOLATED clusters only by accident.
 *
 * WHAT EARNS A WORD. Rarity, measured. A descriptor's information content is
 * -log2(prevalence): "grayscale" fires on 2.2% of the corpus and carries 5.5
 * bits, "warm" fires on 46.0% and carries 1.1. Saying the second tells a reader
 * almost nothing they could not have guessed. Ties break on search demand, so a
 * crude descriptor someone actually types beats an elegant one nobody does.
 *
 * PREVALENCES ARE MEASURED, NEVER ESTIMATED, and every one below was re-measured
 * on 2026-08-17 after the D19 saturation fix: 867 live seeds
 * (apps/web/test/prose-corpus.js) at 13 rendered steps, dense sample 48. The
 * earlier values came from an 866-seed pull of the same sitemap, which is why a
 * few untouched descriptors moved by 0.001.
 *
 * Two more things are worth knowing before changing anything:
 *
 * 1. STRUCTURE IS MEASURED ON A DENSE SAMPLE, TONE ON THE RENDERED STOPS.
 *    Hue structure read off the displayed `steps` is a sampling artifact: the
 *    same seed classified as duotone on 42% of the corpus at 3 steps and 19.5%
 *    at 24, because sparse sampling opens hue gaps that a denser sample fills.
 *    Sampled densely it is 7.7% and identical across every step count tested.
 *    Structure is a property of the palette; `steps` is a view of it. Tone is
 *    what you actually see, and is 98.6%+ step-stable anyway.
 *
 * 2. MONOCHROME HERE MEANS ONE HUE, NOT ONE SATURATION.
 *    palette-tags.ts already emits `texture: 'monochrome'` for average
 *    saturation under 0.05, which is grayscale, a different claim. Measured, the
 *    two overlap on 2 of the 867 palettes: the existing tag fires on 18 and
 *    misses 130 of the 132 palettes that are monochrome in the sense a designer
 *    means it (a navy-through-powder-blue ramp is one hue, many shades). Both
 *    words exist here with their standard meanings; the old tag keeps its value
 *    until a reindex can correct it.
 *
 * 3. CHROMA IS NOT SATURATION, AND THE DIFFERENCE IS A BUG WE SHIPPED.
 *    Chroma is absolute distance from the neutral axis; saturation is that
 *    distance over what sRGB can hold at that stop's own lightness. The gamut
 *    is lopsided (C ≈ 0.04 at L 0.92, ≈ 0.14 at L 0.5), so one absolute
 *    threshold cannot serve both ends, and reading chroma as "is there colour
 *    here" called a plainly blue-pink-cream palette grayscale. Every gate below
 *    now answers one of two questions, and the question decides the reading:
 *    IDENTITY ("is there colour, which colour is it") takes saturation;
 *    LOUDNESS ("how strong is that colour") takes chroma. Each descriptor's
 *    comment records which it chose.
 */

import { cosineGradient, rgbToHex, type CosineCoeffs } from './cosine';
import {
  hexToOkLch,
  hexToRgb,
  rgbToOklab,
  oklabDistance,
  relativeLuminance,
  relativeSaturation,
  type OkLch,
} from '../color-utils';

// =============================================================================
// Tuning constants (measured percentiles — see the doc for the tables)
// =============================================================================

/**
 * Below this chroma a stop has no usable hue: the angle is numerical noise
 * around a gray.
 *
 * Re-measured 2026-08-17 over the 867-seed fixture (41,616 dense stops):
 * per-stop chroma runs p25 0.057, p50 0.098, and 10.4% of stops fall under this
 * floor. (The older comment here claimed a p25 of 0.019 "roughly the bottom
 * quarter"; that does not reproduce on this corpus and the value is left alone
 * regardless — what it discards is a tenth of stops, from the hue geometry
 * only.)
 *
 * ABSOLUTE chroma alone is not the whole test — see SATURATION_FLOOR. A stop
 * can be under this floor and still be the most colourful thing sRGB can
 * render at its lightness; 14.7% of the stops under this floor are exactly
 * that, and the saturation branch hands their hue back.
 */
const CHROMA_FLOOR = 0.03;

/**
 * The other half of hue validity: chroma as a fraction of the gamut ceiling at
 * the stop's own lightness and hue (`relativeSaturation` in color-utils).
 *
 * WHY BOTH. The sRGB solid is lopsided — at L 0.92 it holds C ≈ 0.04, at L 0.5
 * about 0.14 — so one absolute floor cannot serve both ends. Held to
 * CHROMA_FLOOR alone the classifier called #ceeaff,#fcd3d4,#ffffed,#ffffff,
 * #deffff,#d5e3f6 grayscale: mean chroma 0.029, yet its stops measure 69-100%
 * of the chroma achievable at their lightness, and the render is plainly blue,
 * pink, cream and cyan.
 *
 * 0.35 by sweep over the 867-seed fixture (13 steps, dense 48; 41,616 dense
 * stops). "Promoted" is the share of stops this floor rescues that absolute
 * chroma alone would have discarded:
 *
 *   floor   promoted   gray   mono   analog   multi   rainbow   duo   comp
 *   0.25    2.60%      19     127    245      267     127       40    42
 *   0.30    1.90%      19     129    244      262     124       44    45
 *   0.35    1.53%      19     132    243      259     121       46    47
 *   0.40    1.32%      19     133    244      256     121       47    47
 *
 * Grayscale — the classification this fix exists for — is dead flat at 19 over
 * the whole range, because the palettes it rescues sit at 69-100% of their
 * ceiling rather than near the threshold. What the floor actually trades is the
 * duotone/multicolor boundary: a promoted stop contributes a hue angle, which
 * can widen a span or split a cluster. That drift is monotone and gentle (≤ 1%
 * of the corpus per step), so 0.35 is taken from the flat end rather than the
 * edge of the swept range.
 *
 * An absolute visibility floor on the saturation branch (a hue you cannot see
 * is not a hue) was measured and REJECTED: requiring C ≥ 0.005/0.01/0.015/0.02
 * as well changes 0/2/8/14 of the 867 classifications. The sub-0.005
 * promotions are 1.1% of promotions and 0.02% of all stops, and they never
 * change an answer, so the predicate stays one line.
 */
const SATURATION_FLOOR = 0.35;

/**
 * Mean saturation under which a palette reads as neutral regardless of what
 * its ceiling allows. The companion to GRAYSCALE_CHROMA in `isGrayscale`,
 * which now needs BOTH to be low: absolute says "there is little chroma here",
 * relative says "and there was little to be had". Lower than SATURATION_FLOOR
 * because it is applied to a mean rather than a single stop, and a palette
 * that dips through neutral drags its mean down without being gray.
 *
 * Measured over the fixture, this one conjunct is what rescues the palettes:
 * grayscale falls 24 → 19 of 867 with it, and stays at 24 without it no matter
 * where SATURATION_FLOOR sits. Swept, grayscale counts run
 *
 *   0.15 → 13   0.20 → 18   0.25 → 19   0.30 → 22   0.35 → 23   0.40 → 23
 *
 * so 0.25 sits in the flat middle: the boundary moves by one palette per 0.05
 * step around it, and by 0.40 the rescue is undone. Below 0.20 it starts
 * taking real grays (a warm greige ramp measures 0.24).
 */
const GRAYSCALE_SAT = 0.25;

/**
 * Hue degrees that separate two clusters. 40° sits in the flat middle of the
 * threshold sweep (30/40/50/60 give 505/572/615/672 one-cluster palettes), so
 * the classification is not balanced on a cliff, and it matches the ±30°
 * adjacency the color-wheel literature calls analogous.
 */
const CLUSTER_GAP = 40;

/** Enough samples that hue gaps are real, cheap enough to run per keystroke. */
const DENSE_SAMPLES = 48;

const MONOCHROME_SPAN = 30;
const ANALOGOUS_SPAN = 95;
const COMPLEMENTARY_SEPARATION = 150;
const RAINBOW_SPAN = 200;
/**
 * How wide a single hue cluster may be and still count as one hue. 60° is two
 * segments of the 12-segment wheel every colour-theory tool divides the circle
 * into — adjacent enough to read as one colour family.
 */
const DUOTONE_CLUSTER_WIDTH = 60;
const CHROMATIC_FRACTION = 0.15;

const GRAYSCALE_CHROMA = 0.025;
const DARK_LIGHTNESS = 0.42;
const LIGHT_LIGHTNESS = 0.8;
const PASTEL_LIGHTNESS = 0.78;
const PASTEL_CHROMA = 0.09;
const NEON_CHROMA = 0.24;
const NEON_LIGHTNESS = 0.45;
const MUTED_CHROMA = 0.055;
const VIVID_CHROMA = 0.15;
const HIGH_CONTRAST_RANGE = 0.6;
const LOW_CONTRAST_RANGE = 0.12;
/**
 * A family is an evocative claim, so it has to have colour to back it up.
 *
 * Gating a family on its hue window alone let any washed-out palette that
 * happened to land in the band steal the word: "Duotone forest silver and
 * gunmetal", "Ocean sky to light lavender". Hue says where a palette is; chroma
 * says whether it is there enough to be named after it.
 */
const FAMILY_CHROMA = 0.08;
/**
 * The relative half of the same test. A pale sky-and-cyan palette can sit at
 * 90% of its achievable chroma and never reach FAMILY_CHROMA, and refusing to
 * call that ocean is the same conflation D19 fixes elsewhere. Set high on
 * purpose: at 0.6 the palettes it admits are near their ceiling, so the
 * incident this gate exists for stays fixed — "Duotone forest silver and
 * gunmetal" measures 0.15 mean saturation, nowhere near it.
 *
 * Measured over the fixture, the disjunct admits 7 sunsets (127 → 134), 4
 * oceans (85 → 89) and 3 autumns (22 → 25): pale versions of families the
 * absolute gate could not see.
 */
const FAMILY_SATURATION = 0.6;
/** How much of the palette must sit inside the family's hue window. */
const FAMILY_BAND = 0.85;

/** Earth pigments are low-chroma warm hues held below full lightness. */
const EARTHY_HUE = [20, 110] as const;
const EARTHY_CHROMA = 0.1;
const EARTHY_LIGHTNESS = 0.75;
/** Ends this close in OkLab have no visible seam where a conic gradient wraps. */
const SEAM_TOLERANCE = 0.05;
/** A quarter of the ramp pinned at a channel extreme by the model's clamp01. */
const CLIPPED_FRACTION = 0.25;
const TRAJECTORY_DELTA = 0.04;
/** Lightness moves smaller than this are noise, not a turn in the ramp. */
const TURN_EPSILON = 0.004;

// --- motion/channel thresholds. Prevalences for these were measured over the
// 867 seeds in the live sitemap (2026-08-17, dense 48-sample) with the same
// harness discipline as the registry: re-measure before moving any of them.

/**
 * Hue direction guards. Direction is only worth claiming when the palette
 * actually travels — corpus p50 travel is 89°, so 90° starts right at the
 * median palette — and travels mostly one way: consistency is |net|/travel,
 * and at 0.8 the ramp barely doubles back. p50 consistency is 0.91, so most
 * palettes rotate one way or hardly rotate; guarded like this the corpus
 * splits 17.5% advancing against 17.4% reversing. (Re-measured after D19: the
 * chain now walks saturation-valid stops too, which lengthens travel through
 * pale passages and cost the direction pair some of its consistency.)
 */
const HUE_DIRECTION_TRAVEL = 90;
const HUE_DIRECTION_CONSISTENCY = 0.8;
/**
 * Net rotation that counts as sweeping the whole wheel. 330° rather than 360°
 * because the hue chain is chroma-gated: a wheel-sweeping palette loses a few
 * degrees wherever it dips through gray. Corpus |net| p99 is 360°.
 */
const FULL_WHEEL_NET = 330;
/** Real hue travel (≥120°) that mostly cancels out (consistency < 0.5). */
const HUE_WANDER_TRAVEL = 120;
const HUE_WANDER_CONSISTENCY = 0.5;
/** A tenth of the ramp rendered at an exact gamut corner reads as a plateau. */
const PLATEAU_SHARE = 0.1;
/**
 * A channel whose dense range is under ~5/255 renders as one value. The range
 * test catches all three coefficient causes at once: |b| ≈ 0 (no amplitude),
 * |c| ≈ 0 (frozen wave — constant at a + b·cos(2πd), not at a), and full-time
 * clamping.
 */
const FLAT_CHANNEL_RANGE = 0.02;
/** All three ranges inside one 8-bit quantum: every rendered stop is one hex. */
const SOLID_CHANNEL_RANGE = 1 / 255;
/**
 * equalC tolerance: 1% relative, floored at 0.01 absolute below c = 1 —
 * coefficients are stored at 3 decimals, so a pure ratio test would reject
 * small frequencies that are equal as written.
 */
const EQUAL_C_TOLERANCE = 0.01;

/**
 * A descriptor must carry this much information to be worth a word in a name.
 *
 * 2 bits is a prevalence of 25%: past that the word applies to a quarter of
 * everything and stops being a description. It is the cutoff that silently
 * retires `warm` (46.0%), `cool` (36.0%), `analogous` (28.0%) and `ramp`
 * (58.6%) from the visible name without removing them as tags, and it is why
 * the name gets quieter rather than longer as the registry grows.
 */
const MIN_BITS_TO_SPEAK = 2;

/**
 * The measured thresholds, exported read-only for the prose generator
 * (apps/web/src/palette-prose.ts). Its sentence bands must be THE registry
 * bands — imported, never copied — so a threshold re-measure here moves the
 * prose with it instead of leaving a silently diverged copy behind. Nothing in
 * this module reads the object; it exists so consumers cannot drift.
 */
export const THRESHOLDS = {
  CHROMA_FLOOR,
  SATURATION_FLOOR,
  GRAYSCALE_SAT,
  FAMILY_SATURATION,
  GRAYSCALE_CHROMA,
  DARK_LIGHTNESS,
  LIGHT_LIGHTNESS,
  PASTEL_LIGHTNESS,
  PASTEL_CHROMA,
  NEON_CHROMA,
  NEON_LIGHTNESS,
  MUTED_CHROMA,
  VIVID_CHROMA,
  HIGH_CONTRAST_RANGE,
  LOW_CONTRAST_RANGE,
  SEAM_TOLERANCE,
  CLIPPED_FRACTION,
  TRAJECTORY_DELTA,
  HUE_DIRECTION_TRAVEL,
  HUE_DIRECTION_CONSISTENCY,
  FULL_WHEEL_NET,
  HUE_WANDER_TRAVEL,
  HUE_WANDER_CONSISTENCY,
  PLATEAU_SHARE,
  FLAT_CHANNEL_RANGE,
  SOLID_CHANNEL_RANGE,
  EQUAL_C_TOLERANCE,
} as const;

/** English tolerates two stacked adjectives before a name reads as a list. */
const MAX_SPOKEN = 2;

// =============================================================================
// Types
// =============================================================================

export type ModifierAxis =
  | 'structure'
  | 'family'
  | 'temperature'
  | 'tone'
  | 'contrast'
  | 'key'
  | 'shape'
  | 'trajectory'
  | 'surface'
  | 'motion'
  | 'channel';

export interface PaletteFeatures {
  /** Smallest arc containing every chromatic stop, degrees. */
  hueSpan: number;
  /** Isolated hue groups on the dense sample. */
  hueClusters: number;
  /** Angle between the two largest clusters, or 0. */
  clusterSeparation: number;
  /**
   * The widest arc any single hue cluster covers, degrees.
   *
   * Cluster COUNT alone does not identify a duotone. A palette can sweep 248°
   * of the wheel and still fall into two groups, because a "cluster" is just
   * everything between two gaps — and each group can itself be a broad arc.
   * Two hues means two NARROW clusters.
   */
  maxClusterWidth: number;
  /** Chroma-weighted circular mean hue, degrees. */
  meanHue: number;
  /**
   * Share of stops with a usable hue — now `C ≥ CHROMA_FLOOR` OR
   * `saturation ≥ SATURATION_FLOOR`, so a light tint at the top of the gamut
   * counts as coloured (D19).
   */
  chromaticFraction: number;
  meanLightness: number;
  lightnessRange: number;
  meanChroma: number;
  maxChroma: number;
  denseMeanChroma: number;

  // --- The relative reading of the same three (2026-08-17, D19). Saturation is
  // chroma over the sRGB ceiling at that stop's own lightness and hue, so it
  // answers "is there colour here" where chroma answers "how loud is it".

  /** Mean per-stop saturation over the RENDERED stops, 0-1. */
  meanSaturation: number;
  /** The most saturated rendered stop, 0-1. */
  maxSaturation: number;
  /** Mean per-stop saturation over the dense sample — step-independent. */
  denseMeanSaturation: number;
  /** Direction changes in the lightness ramp: 0 ramp, 1 arch, 2+ wavy. */
  turns: number;
  /** OkLab distance from the first stop to the last. */
  seam: number;
  /** Share of stops pinned at a channel extreme by clamp01. */
  clipped: number;
  /** Chroma in the second half minus the first. */
  chromaTrend: number;
  /**
   * Where the chromatic stops sit on the hue circle: 36 bins of 10°, each the
   * share of chromatic stops it holds (so they sum to 1, or to 0 for a
   * grayscale palette).
   *
   * A histogram rather than a list of named windows, so a new family is a
   * lookup rather than another field on this object.
   */
  hueHistogram: number[];
  /** WCAG 2.1 contrast ratio between the lightest and darkest rendered stop. */
  contrastRatio: number;

  // --- Everything below is additive (2026-08-17): motion and channel facts for
  // the prose generator, computed on the same dense pass or read exactly off
  // the coefficients. Nothing above changed meaning.

  /**
   * Chroma-weighted mean hue of each cluster, degrees, in the walk order of
   * hueGeometry (increasing hue starting just past the widest gap). The same
   * values `clusterSeparation` is derived from — exported so prose can name
   * the families instead of only the angle between them.
   */
  clusterHues: number[];
  /**
   * Hue of the first dense sample with a usable hue (`hasUsableHue`, so either
   * reading), or null when no sample has one: the "from {family}" anchor.
   */
  firstHue: number | null;
  /** Hue of the last chromatic dense sample — the "into {family}" anchor. */
  lastHue: number | null;
  /**
   * Signed hue rotation summed over consecutive chromatic dense samples,
   * degrees. The chain resets across achromatic gaps — hue is undefined
   * through a gray, and accumulating across one fabricates rotation. Positive
   * is spectral order (OkLCh hue increases red → yellow → green → blue).
   */
  hueNet: number;
  /** Absolute degrees walked by the same chain, gap-reset the same way. */
  hueTravel: number;
  /**
   * |hueNet| / hueTravel: 1 when every step rotates the same way (or the hue
   * never moves at all), near 0 when the ramp doubles back as much as it
   * advances.
   */
  hueConsistency: number;
  /** Position of the brightest dense sample, 0..1 along the ramp. */
  lightnessPeakT: number;
  /** Position of the darkest dense sample, 0..1. */
  lightnessValleyT: number;
  /** Position of the most chromatic dense sample, 0..1. */
  chromaPeakT: number;
  /**
   * Dense max − min lightness. The guard for peak/valley/direction claims —
   * the rendered `lightnessRange` tracks the viewer's steps, this one cannot.
   */
  denseLightnessRange: number;
  /** Dense max − min chroma, the guard for chroma-position claims. */
  denseChromaRange: number;
  /** Dense-end lightness difference L(t=1) − L(t=0): which way a ramp runs. */
  lightnessDelta: number;
  /**
   * Per-channel max − min of the clamped dense values, RGB order. Catches all
   * three ways a channel goes flat: |b| ≈ 0, |c| ≈ 0, full-time clamping.
   */
  channelRange: [number, number, number];
  /** Per-channel share of dense samples pinned at the top of gamut (≥0.9999). */
  channelHiClip: [number, number, number];
  /** Per-channel share pinned at the bottom (≤0.0001). */
  channelLoClip: [number, number, number];
  /** Share of dense samples with all three channels pinned high: pure white. */
  allWhiteShare: number;
  /** Share with all three pinned low: pure black. */
  allBlackShare: number;
  /**
   * How many of the three channels never change direction on the dense sample
   * (0–3). Clamp plateaus carry no direction, so rise → pin → rise is still
   * monotone.
   */
  monotoneChannels: number;
  /**
   * |c_k| per channel, RGB order — the exact cycle count, straight off the
   * applied coefficients. The cosine argument sweeps |c| full periods over
   * t ∈ [0,1] by definition; no sampling involved.
   */
  channelCycles: [number, number, number];
  /**
   * All three |c_k| within EQUAL_C_TOLERANCE of their mean. Equal frequencies
   * mean the whole palette repeats with period 1/c exactly — the license for
   * repeat-count language.
   */
  equalC: boolean;
  /**
   * a_k ± |b_k| inside [0,1] for every channel. Stronger than "didn't clip on
   * this sample": those are the channel extremes regardless of c and d, so the
   * palette cannot clip at any frequency or phase setting. (Not invariant to
   * exposure/contrast, which move a and b.)
   */
  inGamutAlways: boolean;
}

const HUE_BINS = 36;
const BIN_WIDTH = 360 / HUE_BINS;

/**
 * Share of the palette's chromatic stops with a hue in [lo, hi), degrees.
 * Wraps: `hueBandShare(f, 300, 100)` is the warm arc through 0°.
 *
 * Both edges fold onto the bin ring BEFORE the walk: an edge in (355, 360]
 * used to round to bin 36, which the wrapped cursor can never equal — an
 * infinite loop in an exported API (demonstrated with hi = 360; no in-repo
 * call site passes one, but the hazard was live for external callers). A
 * degenerate full-circle band (lo ≡ hi mod 360) reads as empty, matching the
 * half-open [lo, hi) contract.
 */
export function hueBandShare(f: PaletteFeatures, lo: number, hi: number): number {
  const bin = (edge: number) =>
    ((Math.round(edge / BIN_WIDTH) % HUE_BINS) + HUE_BINS) % HUE_BINS;
  const from = bin(lo);
  const to = bin(hi);
  let total = 0;
  for (let i = from; i !== to; i = (i + 1) % HUE_BINS)
    total += f.hueHistogram[i] ?? 0;
  return total;
}

export interface Descriptor {
  word: string;
  axis: ModifierAxis;
  /**
   * Measured share of the 866 live palettes. This is the whole basis for
   * ranking, so it must be re-measured — not estimated — whenever a threshold
   * moves. The harness is in seo-research/palette-modifiers.md.
   */
  prevalence: number;
  /**
   * Whether this is name-language. False keeps a descriptor as a tag: `wavy`
   * and `desaturating` are informative and true, and no one describes a palette
   * that way out loud.
   */
  spoken: boolean;
  /**
   * The word to use in prose, when the tag value is not it.
   *
   * `complementary` is indexed under its own name — the angle between the two
   * hues is worth filtering on — and spoken as "duotone", because both are two
   * isolated hues and the difference between them is not worth explaining in a
   * heading.
   */
  spokenAs?: string;
  /**
   * Search-demand multiplier, from the `{color} gradient {modifier}` grammar
   * measured in seo-research/demand-longtail.md. 1.0 is neutral; above 1 is a
   * term with observed autocomplete demand; below 1 is design vocabulary that
   * is accurate but nobody searches.
   */
  demand: number;
  /** More general words this one shadows — saying both spends a word twice. */
  implies?: readonly string[];
  test: (f: PaletteFeatures) => boolean;
}

// =============================================================================
// Feature extraction
// =============================================================================

/** Angular distance on the hue circle, 0-180. */
function hueSeparation(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function labOf(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToOklab(r, g, b);
}

/** A stop in OkLCh plus `S`, the same chroma read against its gamut ceiling. */
interface Stop extends OkLch {
  S: number;
}

const stopOf = (hex: string): Stop => {
  const lch = hexToOkLch(hex);
  return { L: lch.L, C: lch.C, h: lch.h, S: relativeSaturation(lch) };
};

/**
 * Whether a stop's hue angle means anything.
 *
 * Either reading suffices, and that disjunction is the whole D19 fix: absolute
 * chroma catches the ordinary case, saturation catches the tints and shades
 * that are as colourful as sRGB gets at their lightness but never clear an
 * absolute bar. Everything downstream — clusters, span, the hue chain, the
 * histogram, chromaticFraction — walks this one predicate, so the two readings
 * cannot disagree about which stops have a hue.
 */
const hasUsableHue = (s: Stop) => s.C >= CHROMA_FLOOR || s.S >= SATURATION_FLOOR;

/**
 * The same predicate for a single hex, for consumers that hold stops rather
 * than a palette: the prose generator's family/series gates and the tests that
 * assert no near-ceiling stop is ever treated as gray. Exported so there is one
 * answer to "does this stop have a colour" in the codebase, not three.
 */
export function stopHasHue(hex: string): boolean {
  return hasUsableHue(stopOf(hex));
}

/** Chroma over the sRGB ceiling at a stop's own lightness and hue, 0-1. */
export function stopSaturation(hex: string): number {
  return stopOf(hex).S;
}

/**
 * Single-linkage clustering on the hue circle.
 *
 * Sorting by hue and cutting at every gap wider than CLUSTER_GAP is exactly
 * single-linkage, and on a circle the widest gap is also the complement of the
 * enclosing arc — so one pass yields both the clusters and the span. Walking
 * from just after the widest gap keeps a cluster that straddles 0° in one piece.
 */
function hueGeometry(stops: readonly Stop[]) {
  const chromatic = stops.filter(hasUsableHue).sort((a, b) => a.h - b.h);

  if (chromatic.length === 0)
    return {
      clusters: [] as number[],
      span: 0,
      maxClusterWidth: 0,
      chromaticFraction: 0,
    };

  const hues = chromatic.map((c) => c.h);
  const gaps = hues.map((h, i) =>
    i === hues.length - 1 ? hues[0]! + 360 - h : hues[i + 1]! - h,
  );
  const widest = Math.max(...gaps);
  const start = (gaps.indexOf(widest) + 1) % hues.length;

  const groups: (typeof chromatic)[] = [];
  let current: typeof chromatic = [];
  for (let k = 0; k < hues.length; k++) {
    const i = (start + k) % hues.length;
    current.push(chromatic[i]!);
    if (gaps[i]! > CLUSTER_GAP || k === hues.length - 1) {
      groups.push(current);
      current = [];
    }
  }

  // Circular mean, chroma-weighted: a washed-out stop should not drag a
  // cluster's hue as far as a saturated one.
  const clusters = groups.map((group) => {
    let x = 0;
    let y = 0;
    for (const c of group) {
      const rad = (c.h * Math.PI) / 180;
      x += c.C * Math.cos(rad);
      y += c.C * Math.sin(rad);
    }
    const deg = (Math.atan2(y, x) * 180) / Math.PI;
    return deg < 0 ? deg + 360 : deg;
  });

  // Groups are walked in increasing hue order, so a group's own arc is just the
  // circular distance from its first member to its last.
  const widths = groups.map((group) => {
    const first = group[0]!.h;
    const last = group[group.length - 1]!.h;
    return (((last - first) % 360) + 360) % 360;
  });
  const maxClusterWidth = widths.length ? Math.max(...widths) : 0;

  return {
    clusters,
    span: 360 - widest,
    maxClusterWidth,
    chromaticFraction: chromatic.length / stops.length,
  };
}

/** Canonical per-channel view of the coefficients: b ≥ 0, c ≥ 0, d ∈ [0, 1). */
export interface ChannelCanon {
  a: number;
  b: number;
  c: number;
  d: number;
}

/**
 * Fold each channel's coefficients into canonical form.
 *
 * The same palette has many coefficient spellings: cosine is even, so c < 0 is
 * identically (|c|, −d), and cos(x + π) = −cos x, so a negative amplitude is
 * exactly a half-cycle phase shift — that is the whole truth about "the sign of
 * b flips the channel". Folding both (and taking d mod 1) makes phases
 * comparable across channels, which is what repeat and seam-mechanism language
 * reads: integer canonical c ⇒ seamless at every phase, per-channel seam
 * contribution bounded by 2·b·|sin(πc)|. Identities verified to 1e−12 against
 * cosineGradient.
 */
export function canonicalChannels(
  coeffs: CosineCoeffs,
): [ChannelCanon, ChannelCanon, ChannelCanon] {
  return [0, 1, 2].map((k) => {
    const a = coeffs[0][k]!;
    const b = coeffs[1][k]!;
    const c = coeffs[2][k]!;
    let d = c < 0 ? -coeffs[3][k]! : coeffs[3][k]!;
    if (b < 0) d += 0.5;
    d -= Math.floor(d);
    return { a, b: Math.abs(b), c: Math.abs(c), d };
  }) as [ChannelCanon, ChannelCanon, ChannelCanon];
}

/**
 * Everything measurable about a palette, in one pass.
 *
 * `hexColors` are the stops as rendered, at whatever `steps` the viewer chose;
 * `coeffs` are the applied coefficients, used for the dense sample that
 * structure and shape are measured on.
 */
export function paletteFeatures(
  coeffs: CosineCoeffs,
  hexColors: readonly string[],
): PaletteFeatures {
  const denseRgb = cosineGradient(DENSE_SAMPLES, coeffs);
  const dense = denseRgb.map(([r, g, b]) => rgbToHex(r, g, b));
  // Every stop carries S beside L/C/h, so nothing downstream has to decide
  // again whether a colour counts. One gamut bisection per stop: 48 dense + the
  // rendered steps, 0.048 ms per palette measured (see maxChromaFor).
  const denseLch = dense.map(stopOf);
  const geometry = hueGeometry(denseLch);

  const rendered = (hexColors.length ? hexColors : dense).map(stopOf);
  const n = rendered.length;

  let x = 0;
  let y = 0;
  for (const c of denseLch) {
    const rad = (c.h * Math.PI) / 180;
    x += c.C * Math.cos(rad);
    y += c.C * Math.sin(rad);
  }
  const meanHueRaw = (Math.atan2(y, x) * 180) / Math.PI;

  let turns = 0;
  let direction = 0;
  for (let i = 1; i < denseLch.length; i++) {
    const delta = denseLch[i]!.L - denseLch[i - 1]!.L;
    if (Math.abs(delta) < TURN_EPSILON) continue;
    const sign = Math.sign(delta);
    if (direction !== 0 && sign !== direction) turns++;
    direction = sign;
  }

  // Signed hue chain over consecutive chromatic dense samples. The chain
  // resets across achromatic gaps — hue is undefined through a gray, and
  // accumulating across one fabricates rotation. firstHue/lastHue ride the
  // same walk: they are the "from {family} into {family}" anchors.
  let hueNet = 0;
  let hueTravel = 0;
  let prevHue: number | null = null;
  let firstHue: number | null = null;
  let lastHue: number | null = null;
  for (const c of denseLch) {
    if (!hasUsableHue(c)) {
      prevHue = null;
      continue;
    }
    if (prevHue !== null) {
      const arc = ((c.h - prevHue + 540) % 360) - 180; // signed shortest arc
      hueNet += arc;
      hueTravel += Math.abs(arc);
    }
    prevHue = c.h;
    if (firstHue === null) firstHue = c.h;
    lastHue = c.h;
  }

  // Extremum positions on the dense grid. Strict comparisons, so the first
  // index wins a tie — the convention the prevalences were measured with.
  let peakI = 0;
  let valleyI = 0;
  let chromaPeakI = 0;
  let chromaValleyI = 0;
  for (let i = 1; i < denseLch.length; i++) {
    const s = denseLch[i]!;
    if (s.L > denseLch[peakI]!.L) peakI = i;
    if (s.L < denseLch[valleyI]!.L) valleyI = i;
    if (s.C > denseLch[chromaPeakI]!.C) chromaPeakI = i;
    if (s.C < denseLch[chromaValleyI]!.C) chromaValleyI = i;
  }
  const lastI = denseLch.length - 1;

  // Per-channel facts on the raw clamped dense values rather than the
  // hex-rounded stops: range, clip shares at each end, monotonicity.
  const channelRange: [number, number, number] = [0, 0, 0];
  const channelHiClip: [number, number, number] = [0, 0, 0];
  const channelLoClip: [number, number, number] = [0, 0, 0];
  let monotoneChannels = 0;
  for (let k = 0; k < 3; k++) {
    let mx = -Infinity;
    let mn = Infinity;
    let hi = 0;
    let lo = 0;
    let mono = true;
    let dir = 0;
    for (let i = 0; i < denseRgb.length; i++) {
      const v = denseRgb[i]![k]!;
      if (v > mx) mx = v;
      if (v < mn) mn = v;
      if (v >= 0.9999) hi++;
      if (v <= 0.0001) lo++;
      if (i > 0) {
        // Zero deltas (clamp plateaus) carry no direction: a channel that
        // rises, pins at 1 and rises again is still monotone.
        const s = Math.sign(v - denseRgb[i - 1]![k]!);
        if (s !== 0) {
          if (dir !== 0 && s !== dir) mono = false;
          dir = s;
        }
      }
    }
    channelRange[k] = mx - mn;
    channelHiClip[k] = hi / denseRgb.length;
    channelLoClip[k] = lo / denseRgb.length;
    if (mono) monotoneChannels++;
  }
  let allWhite = 0;
  let allBlack = 0;
  for (const [r, g, b] of denseRgb) {
    if (r >= 0.9999 && g >= 0.9999 && b >= 0.9999) allWhite++;
    if (r <= 0.0001 && g <= 0.0001 && b <= 0.0001) allBlack++;
  }

  // Coefficient-level facts — exact, no sampling: |c_k| IS the channel's cycle
  // count, and a ± |b| are its extremes at every frequency and phase.
  const channelCycles: [number, number, number] = [
    Math.abs(coeffs[2][0]),
    Math.abs(coeffs[2][1]),
    Math.abs(coeffs[2][2]),
  ];
  const cMean = (channelCycles[0] + channelCycles[1] + channelCycles[2]) / 3;
  const equalC =
    cMean > 0 &&
    channelCycles.every(
      (c) => Math.abs(c - cMean) <= EQUAL_C_TOLERANCE * Math.max(1, cMean),
    );
  const inGamutAlways = [0, 1, 2].every((k) => {
    const amp = Math.abs(coeffs[1][k]!);
    return coeffs[0][k]! - amp >= 0 && coeffs[0][k]! + amp <= 1;
  });

  const half = Math.floor(denseLch.length / 2);
  const meanOf = (list: typeof denseLch) =>
    list.reduce((s, c) => s + c.C, 0) / list.length;

  const hueHistogram = new Array<number>(HUE_BINS).fill(0);
  const chromatic = denseLch.filter(hasUsableHue);
  for (const c of chromatic) {
    const bin = Math.min(HUE_BINS - 1, Math.floor(c.h / BIN_WIDTH));
    hueHistogram[bin] = (hueHistogram[bin] ?? 0) + 1 / chromatic.length;
  }

  const luminances = (hexColors.length ? hexColors : dense).map(relativeLuminance);

  return {
    hueSpan: geometry.span,
    hueClusters: geometry.clusters.length,
    clusterSeparation:
      geometry.clusters.length >= 2
        ? hueSeparation(geometry.clusters[0]!, geometry.clusters[1]!)
        : 0,
    maxClusterWidth: geometry.maxClusterWidth,
    meanHue: meanHueRaw < 0 ? meanHueRaw + 360 : meanHueRaw,
    chromaticFraction: geometry.chromaticFraction,
    meanLightness: rendered.reduce((s, c) => s + c.L, 0) / n,
    lightnessRange:
      Math.max(...rendered.map((c) => c.L)) -
      Math.min(...rendered.map((c) => c.L)),
    meanChroma: rendered.reduce((s, c) => s + c.C, 0) / n,
    maxChroma: Math.max(...rendered.map((c) => c.C)),
    denseMeanChroma: meanOf(denseLch),
    meanSaturation: rendered.reduce((s, c) => s + c.S, 0) / n,
    maxSaturation: Math.max(...rendered.map((c) => c.S)),
    denseMeanSaturation:
      denseLch.reduce((s, c) => s + c.S, 0) / denseLch.length,
    turns,
    seam: oklabDistance(labOf(dense[0]!), labOf(dense[dense.length - 1]!)),
    clipped:
      denseRgb.filter(([r, g, b]) =>
        [r, g, b].some((v) => v <= 0.0001 || v >= 0.9999),
      ).length / denseRgb.length,
    chromaTrend: meanOf(denseLch.slice(denseLch.length - half)) - meanOf(denseLch.slice(0, half)),
    hueHistogram,
    contrastRatio:
      (Math.max(...luminances) + 0.05) / (Math.min(...luminances) + 0.05),
    clusterHues: geometry.clusters,
    firstHue,
    lastHue,
    hueNet,
    hueTravel,
    hueConsistency: hueTravel > 0 ? Math.abs(hueNet) / hueTravel : 1,
    lightnessPeakT: peakI / lastI,
    lightnessValleyT: valleyI / lastI,
    chromaPeakT: chromaPeakI / lastI,
    denseLightnessRange: denseLch[peakI]!.L - denseLch[valleyI]!.L,
    denseChromaRange: denseLch[chromaPeakI]!.C - denseLch[chromaValleyI]!.C,
    lightnessDelta: denseLch[lastI]!.L - denseLch[0]!.L,
    channelRange,
    channelHiClip,
    channelLoClip,
    allWhiteShare: allWhite / denseRgb.length,
    allBlackShare: allBlack / denseRgb.length,
    monotoneChannels,
    channelCycles,
    equalC,
    inGamutAlways,
  };
}

// =============================================================================
// The registry
// =============================================================================

/**
 * Achromatic enough that hue geometry is meaningless.
 *
 * BOTH readings must agree before a palette loses its colour (D19). Absolute
 * chroma says "there is little colour here"; saturation says "and there was
 * little to be had at these lightnesses". The palette that exposed the bug —
 * #ceeaff,#fcd3d4,#ffffed,#ffffff,#deffff,#d5e3f6, mean chroma 0.029 — answers
 * yes to the first and no to the second (0.75 mean saturation, stops at
 * 90-101% of their ceiling), and it is plainly blue, pink, cream and cyan on
 * screen.
 *
 * The chromaticFraction disjunct stays: a run that spends most of its length
 * neutral has no hue geometry to describe whatever its coloured stops do. It
 * is now itself saturation-aware, since `hasUsableHue` decides what counts.
 */
const isGrayscale = (f: PaletteFeatures) =>
  (f.denseMeanChroma < GRAYSCALE_CHROMA &&
    f.denseMeanSaturation < GRAYSCALE_SAT) ||
  f.chromaticFraction < CHROMATIC_FRACTION;

/**
 * "Is there colour here at all", read on the rendered stops: the De Morgan
 * negation of the grayscale conjunction above, and the shared floor for every
 * descriptor whose lower chroma bound exists only to keep grays out (pastel,
 * muted, earthy). D19's rule of thumb: identity questions ("is this coloured",
 * "which colour is it") take saturation; loudness questions ("how strong is
 * it") stay on absolute chroma.
 */
const hasColour = (f: PaletteFeatures) =>
  f.meanChroma >= GRAYSCALE_CHROMA || f.meanSaturation >= GRAYSCALE_SAT;

/**
 * The family floor, both readings. A family word is an identity claim, so a
 * pale sky-and-cyan palette sitting at 90% of its ceiling qualifies even
 * though it never reaches FAMILY_CHROMA; a washed-out palette that merely
 * lands in the hue window still does not.
 */
const familyColour = (f: PaletteFeatures, floor: number = FAMILY_CHROMA) =>
  f.meanChroma >= floor || f.meanSaturation >= FAMILY_SATURATION;

/**
 * Structure is one exclusive classification, not seven independent tests: a
 * palette has one hue geometry. The ladder is ordered narrowest-first so the
 * seven prevalences below sum to 100%.
 */
export function classifyStructure(f: PaletteFeatures): string {
  if (isGrayscale(f)) return 'grayscale';
  if (f.hueClusters === 1) {
    if (f.hueSpan < MONOCHROME_SPAN) return 'monochrome';
    if (f.hueSpan < ANALOGOUS_SPAN) return 'analogous';
    return f.hueSpan >= RAINBOW_SPAN ? 'rainbow' : 'multicolor';
  }
  // Two groups only make a duotone when each is actually one hue. Cranking the
  // frequency slider produces palettes that visit red, green, cyan and magenta
  // yet still land in two groups, and calling those "duotone" then capped the
  // name at two colours: "Duotone eggshell and coral pink" for a palette with
  // eight distinct ones in it.
  if (f.hueClusters === 2 && f.maxClusterWidth < DUOTONE_CLUSTER_WIDTH)
    return f.clusterSeparation >= COMPLEMENTARY_SEPARATION
      ? 'complementary'
      : 'duotone';
  return f.hueSpan >= RAINBOW_SPAN ? 'rainbow' : 'multicolor';
}

const structural = (
  word: string,
  prevalence: number,
  demand: number,
  spoken: boolean,
  spokenAs?: string,
): Descriptor => ({
  word,
  axis: 'structure',
  prevalence,
  spoken,
  demand,
  spokenAs,
  test: (f) => classifyStructure(f) === word,
});

/** What a descriptor is called in a name, which is not always its tag. */
export function spokenWord(d: Descriptor): string {
  return d.spokenAs ?? d.word;
}

/**
 * Every descriptor, with what it costs and what it earns.
 *
 * Prevalences are measured at 13 steps over the 866 palettes in the live
 * sitemap. Demand weights come from the measured autocomplete grammar: pastel,
 * neon, dark, light and rainbow appear in it and get a lift; duotone, earthy and
 * monochrome are real design vocabulary at neutral weight (grabient already
 * serves /palettes/monochrome); complementary and analogous are jargon that the
 * grammar never contains, so they are demoted and left unspoken.
 *
 * Three measured candidates are absent on purpose: split-complementary occurs
 * 0 times, triadic twice and multi-cycle six times across the corpus. A cosine
 * ramp sweeps hue continuously, so it lands on evenly-spaced isolated clusters
 * only by accident.
 */
export const DESCRIPTORS: readonly Descriptor[] = [
  // --- structure: exactly one is always true
  structural('grayscale', 0.022, 1, true),
  structural('monochrome', 0.152, 1.2, true),
  structural('duotone', 0.053, 1, true),
  structural('complementary', 0.054, 1, true),
  structural('rainbow', 0.14, 1.3, true),
  structural('analogous', 0.28, 0.6, false),
  structural('multicolor', 0.299, 0.8, false),

  // --- named families: a hue window plus a tone constraint.
  //
  // The one real gap the second coverage pass found. These are not derivable
  // from the axes above — "sunset" is a specific arc of the hue circle held at
  // real chroma, not "warm" — and they are the highest-demand modifiers
  // measured: grabient already serves /palettes/sunset, /palettes/ocean and
  // /palettes/forest, and `{color} gradient color palette` lists sunset and
  // ocean as Tier-1 targets. Windows are in OkLCh degrees (red 29, orange 53,
  // yellow 110, green 142, cyan 195, blue 264, violet 294, magenta 328).
  {
    // The warm arc through 0°, wide enough to have actually travelled it.
    // Its own chroma floor (0.07) rather than FAMILY_CHROMA: sunsets run
    // through pale peach, and the band test is already narrow.
    word: 'sunset',
    axis: 'family',
    prevalence: 0.155,
    spoken: true,
    demand: 1.4,
    implies: ['warm'],
    test: (f) =>
      hueBandShare(f, 300, 100) >= 0.8 &&
      f.hueSpan >= 40 &&
      familyColour(f, 0.07),
  },
  {
    word: 'ocean',
    axis: 'family',
    prevalence: 0.103,
    spoken: true,
    demand: 1.4,
    implies: ['cool'],
    test: (f) => hueBandShare(f, 180, 280) >= FAMILY_BAND && familyColour(f),
  },
  {
    // Two chroma bounds with different jobs: the floor is identity (is it
    // really this family), so it takes both readings; the 0.16 ceiling is
    // loudness (autumn is a muted season, a fluorescent orange is not autumn)
    // and stays absolute.
    word: 'autumn',
    axis: 'family',
    prevalence: 0.029,
    spoken: true,
    demand: 1.2,
    implies: ['earthy', 'muted', 'warm'],
    test: (f) =>
      hueBandShare(f, 20, 100) >= FAMILY_BAND &&
      familyColour(f) &&
      f.meanChroma < 0.16 &&
      f.meanLightness < 0.75,
  },
  // `forest` is absent, and it is the closest miss in the registry. Gated to the
  // same standard as its siblings it fires on 1.7% of the corpus — green-
  // dominant palettes are simply rare here — and loosening the gate to clear 2%
  // is what produced "Duotone forest silver and gunmetal". It goes the way of
  // triadic and split-complementary: measured, documented, not shipped.

  // --- temperature: informative only when nothing else is, and at 45.7% and
  // 35.8% these sit below MIN_BITS_TO_SPEAK, so they stay tags.
  {
    word: 'warm',
    axis: 'temperature',
    prevalence: 0.460,
    spoken: false,
    demand: 1,
    test: (f) => !isGrayscale(f) && (f.meanHue < 120 || f.meanHue >= 330),
  },
  {
    word: 'cool',
    axis: 'temperature',
    prevalence: 0.360,
    spoken: false,
    demand: 1,
    test: (f) => !isGrayscale(f) && f.meanHue >= 150 && f.meanHue < 300,
  },

  // --- tone
  {
    // Pastel is DEFINED on absolute chroma — a pastel is a pale colour, and a
    // pale colour cannot hold much chroma whatever its ceiling allows — so the
    // upper bound stays absolute. Only the floor, which is there to keep light
    // grays out, becomes the identity question.
    word: 'pastel',
    axis: 'tone',
    prevalence: 0.083,
    spoken: true,
    demand: 1.4,
    implies: ['light'],
    test: (f) =>
      f.meanLightness > PASTEL_LIGHTNESS &&
      f.meanChroma < PASTEL_CHROMA &&
      hasColour(f),
  },
  {
    // Loudness, entirely: neon means a colour brighter than the page around
    // it, which is an absolute amount of chroma. A tint at 100% of a ceiling
    // of 0.04 is not neon, and relative saturation would call it that.
    word: 'neon',
    axis: 'tone',
    prevalence: 0.098,
    spoken: true,
    demand: 1.4,
    implies: ['vivid'],
    test: (f) => f.maxChroma >= NEON_CHROMA && f.meanLightness > NEON_LIGHTNESS,
  },
  {
    // Same split as autumn: EARTHY_CHROMA is the loudness ceiling (pigment,
    // not paint), the floor is identity. Earth colours live under L 0.75 where
    // the gamut is roomy, so in practice the two readings agree here; the
    // disjunct matters for the dark end, where a ceiling of ~0.07 at L 0.2
    // makes a brown that reads brown fail an absolute 0.03.
    word: 'earthy',
    axis: 'tone',
    prevalence: 0.111,
    spoken: true,
    demand: 1,
    implies: ['muted'],
    test: (f) =>
      f.meanChroma < EARTHY_CHROMA &&
      hasColour(f) &&
      f.meanHue >= EARTHY_HUE[0] &&
      f.meanHue < EARTHY_HUE[1] &&
      f.meanLightness < EARTHY_LIGHTNESS,
  },
  {
    // LOUDNESS, so absolute — and this one was measured the other way first.
    //
    // A relative conjunct (mean saturation < 0.5, on the theory that a tint at
    // the top of the gamut is not "held back") was implemented and REJECTED on
    // the visual pass. It removed 8 of 95 palettes, and rendering all eight
    // showed the split: it correctly excluded two deep-dark ramps that sit near
    // their (tiny) ceiling, and wrongly excluded dusty ones that are muted by
    // any reading — white → steel blue → dark teal at mean chroma 0.046 is the
    // dictionary picture of the word. It also disarmed the low-chroma guard on
    // `rainbow` in palette-name.ts (which vetoes the word when `muted` fires),
    // producing "Rainbow white to light gray to light gray blue to dark aqua",
    // the exact name that guard exists to prevent.
    //
    // The deep-dark case it got right is a real observation, but it is about
    // the MEAN over a ramp that spends half its length near black, not about
    // chroma vs saturation; `deep` in the prose layer is where it belongs.
    word: 'muted',
    axis: 'tone',
    prevalence: 0.11,
    spoken: true,
    demand: 1,
    test: (f) =>
      f.meanChroma < MUTED_CHROMA &&
      hasColour(f) &&
      f.meanLightness <= PASTEL_LIGHTNESS,
  },
  {
    word: 'dark',
    axis: 'tone',
    prevalence: 0.107,
    spoken: true,
    demand: 1.3,
    test: (f) => f.meanLightness < DARK_LIGHTNESS,
  },
  {
    word: 'light',
    axis: 'tone',
    prevalence: 0.164,
    spoken: false,
    demand: 1.3,
    test: (f) => f.meanLightness > LIGHT_LIGHTNESS,
  },
  {
    // The loudness axis itself, so absolute by definition: `vivid` is the
    // opposite pole of `muted` on the same reading. Deliberately NOT
    // saturation — a pale wash at the top of its gamut is at 100% saturation
    // and is the least vivid thing on the site.
    word: 'vivid',
    axis: 'tone',
    prevalence: 0.220,
    spoken: false,
    demand: 1,
    test: (f) => f.meanChroma >= VIVID_CHROMA,
  },

  // --- contrast
  {
    word: 'high-contrast',
    axis: 'contrast',
    prevalence: 0.123,
    spoken: false,
    demand: 1,
    test: (f) => f.lightnessRange > HIGH_CONTRAST_RANGE,
  },
  {
    word: 'low-contrast',
    axis: 'contrast',
    prevalence: 0.101,
    spoken: false,
    demand: 1,
    test: (f) => f.lightnessRange < LOW_CONTRAST_RANGE,
  },

  // --- key: the painter's term for where the whole value range sits. Not the
  // same claim as dark/light, which say nothing about the spread, nor as the
  // contrast pair, which says nothing about the level. Tag-only: "high-key" is
  // studio vocabulary, and nobody searches a gradient for it.
  {
    word: 'high-key',
    axis: 'key',
    prevalence: 0.195,
    spoken: false,
    demand: 1,
    test: (f) => f.meanLightness > 0.75 && f.lightnessRange < 0.3,
  },
  {
    word: 'low-key',
    axis: 'key',
    prevalence: 0.054,
    spoken: false,
    demand: 1,
    test: (f) => f.meanLightness < 0.45 && f.lightnessRange < 0.3,
  },

  {
    // Colour that changes hue without changing value. The classical
    // "vibrating" pair: with no lightness edge to separate them, adjacent hues
    // fight, which is why it is worth flagging rather than leaving to the
    // contrast axis — `low-contrast` says the values are close but nothing
    // about whether the hue is moving.
    word: 'iso-luminant',
    axis: 'key',
    prevalence: 0.057,
    spoken: false,
    demand: 1,
    test: (f) => f.lightnessRange < 0.1 && f.hueSpan > 60,
  },

  // --- shape of the lightness ramp
  {
    word: 'ramp',
    axis: 'shape',
    prevalence: 0.586,
    spoken: false,
    demand: 1,
    test: (f) => f.turns === 0,
  },
  {
    word: 'arch',
    axis: 'shape',
    prevalence: 0.319,
    spoken: false,
    demand: 1,
    test: (f) => f.turns === 1,
  },
  {
    word: 'wavy',
    axis: 'shape',
    prevalence: 0.095,
    spoken: false,
    demand: 1,
    test: (f) => f.turns >= 2,
  },

  // --- how chroma moves across the ramp
  {
    word: 'saturating',
    axis: 'trajectory',
    prevalence: 0.24,
    spoken: false,
    demand: 1,
    test: (f) => f.chromaTrend > TRAJECTORY_DELTA,
  },
  {
    word: 'desaturating',
    axis: 'trajectory',
    prevalence: 0.181,
    spoken: false,
    demand: 1,
    test: (f) => f.chromaTrend < -TRAJECTORY_DELTA,
  },

  // --- surface facts
  {
    // Ends that meet. Only visible on a conic gradient, where a mismatch shows
    // as a hard seam at 0° — which is why it is tagged but not spoken.
    word: 'seamless',
    axis: 'surface',
    prevalence: 0.046,
    spoken: false,
    demand: 1,
    test: (f) => f.seam < SEAM_TOLERANCE,
  },
  {
    // The model clamps each channel to [0,1]; a ramp that spends a quarter of
    // its length pinned there has flat spots rather than a smooth blend.
    word: 'clipped',
    axis: 'surface',
    prevalence: 0.404,
    spoken: false,
    demand: 1,
    test: (f) => f.clipped >= CLIPPED_FRACTION,
  },
  {
    // Whether the two ends can carry text against each other. A different
    // formula from `high-contrast` — WCAG weights the channels for luminance,
    // OkLab lightness does not — and the one a designer actually has to answer.
    word: 'wcag-aa',
    axis: 'surface',
    prevalence: 0.413,
    spoken: false,
    demand: 1,
    test: (f) => f.contrastRatio >= 4.5,
  },

  // --- motion: which way the ramp travels (2026-08-17, additive)
  //
  // The shape axis says ramp/arch/wavy but never which way it bends or where,
  // and nothing in the registry said hue direction at all. Prevalences below
  // are measured over the 867 seeds in the live sitemap (dense 48-sample).
  // Every one is deliberately unspoken regardless of its bits: name and title
  // stability is load-bearing (collision rates were measured on the current
  // vocabulary), so these exist for tags, embedding text and the prose
  // generator's sentence tables only.
  {
    // sign(hueNet) under the direction guards. OkLCh hue increases in spectral
    // order (red 29° → yellow 110° → green 142° → blue 264°, measured with
    // this repo's own hexToOkLch), so net > 0 reads "red toward yellow and
    // green". Never "clockwise" — that is a wheel-drawing convention, not a
    // color fact.
    word: 'hue-advancing',
    axis: 'motion',
    prevalence: 0.175,
    spoken: false,
    demand: 1,
    test: (f) =>
      !isGrayscale(f) &&
      f.hueTravel >= HUE_DIRECTION_TRAVEL &&
      f.hueConsistency >= HUE_DIRECTION_CONSISTENCY &&
      f.hueNet > 0,
  },
  {
    word: 'hue-reversing',
    axis: 'motion',
    prevalence: 0.174,
    spoken: false,
    demand: 1,
    test: (f) =>
      !isGrayscale(f) &&
      f.hueTravel >= HUE_DIRECTION_TRAVEL &&
      f.hueConsistency >= HUE_DIRECTION_CONSISTENCY &&
      f.hueNet < 0,
  },
  {
    // A net sweep of (essentially) the whole wheel — 5.4 bits, the rarest
    // motion fact that still clears the 2% floor. Palettes this wide classify
    // rainbow, hence the implies.
    word: 'full-wheel',
    axis: 'motion',
    prevalence: 0.024,
    spoken: false,
    demand: 1,
    implies: ['rainbow'],
    test: (f) => Math.abs(f.hueNet) >= FULL_WHEEL_NET,
  },
  {
    // Real travel that mostly cancels: the ramp doubles back through its hues
    // rather than progressing — the complement of the direction pair, which
    // requires consistency ≥ 0.8.
    word: 'hue-wandering',
    axis: 'motion',
    prevalence: 0.059,
    spoken: false,
    demand: 1,
    test: (f) =>
      f.hueTravel >= HUE_WANDER_TRAVEL &&
      f.hueConsistency < HUE_WANDER_CONSISTENCY,
  },
  {
    // Peak/valley position adds the direction `turns` lacks: `arch` says the
    // lightness bends once, these say which way and where. Guarded by the
    // dense lightness range — below LOW_CONTRAST_RANGE the argmax is noise.
    word: 'bright-middle',
    axis: 'motion',
    prevalence: 0.128,
    spoken: false,
    demand: 1,
    test: (f) =>
      f.denseLightnessRange >= LOW_CONTRAST_RANGE &&
      f.lightnessPeakT >= 1 / 3 &&
      f.lightnessPeakT <= 2 / 3,
  },
  {
    word: 'dark-middle',
    axis: 'motion',
    prevalence: 0.075,
    spoken: false,
    demand: 1,
    test: (f) =>
      f.denseLightnessRange >= LOW_CONTRAST_RANGE &&
      f.lightnessValleyT >= 1 / 3 &&
      f.lightnessValleyT <= 2 / 3,
  },
  {
    // For a monotone ramp (turns = 0) the dense ends order the whole run, so
    // the sign of lightnessDelta is the ramp's direction. Same noise guard as
    // the peak pair.
    word: 'darkening',
    axis: 'motion',
    prevalence: 0.180,
    spoken: false,
    demand: 1,
    test: (f) =>
      f.turns === 0 &&
      f.denseLightnessRange >= LOW_CONTRAST_RANGE &&
      f.lightnessDelta < 0,
  },
  {
    // 34.4% — the most common fact in the registry after `ramp` itself, kept
    // anyway because "brightens" vs "darkens" is the kind of language people
    // actually type at a search box.
    word: 'brightening',
    axis: 'motion',
    prevalence: 0.344,
    spoken: false,
    demand: 1,
    test: (f) =>
      f.turns === 0 &&
      f.denseLightnessRange >= LOW_CONTRAST_RANGE &&
      f.lightnessDelta > 0,
  },

  // --- channel: what the clamp and the wave do per channel (2026-08-17)
  //
  // Engineering language, so nothing here is spoken either; the value is the
  // split of the aggregate `clipped` into which END pins — "highlights clip"
  // and "shadows crush" are different sentences — plus the degenerate cases
  // prose must guard against.
  {
    word: 'clipped-highlights',
    axis: 'channel',
    prevalence: 0.247,
    spoken: false,
    demand: 1,
    test: (f) => f.channelHiClip.some((s) => s >= CLIPPED_FRACTION),
  },
  {
    word: 'crushed-shadows',
    axis: 'channel',
    prevalence: 0.186,
    spoken: false,
    demand: 1,
    test: (f) => f.channelLoClip.some((s) => s >= CLIPPED_FRACTION),
  },
  {
    // All three channels pinned low at once: the ramp renders pure black for a
    // tenth of its length or more. The white twin measured 0.7% — below the 2%
    // floor — so only the black plateau gets a word; allWhiteShare stays a
    // feature for the editor, where high exposure walks straight into it.
    word: 'pure-black-plateau',
    axis: 'channel',
    prevalence: 0.024,
    spoken: false,
    demand: 1,
    test: (f) => f.allBlackShare >= PLATEAU_SHARE,
  },
  {
    // The coefficient-level guarantee, stronger than "didn't clip on this
    // sample": a ± |b| bound every channel regardless of frequency and phase,
    // so this palette cannot clip at any setting of either slider.
    word: 'unclipped',
    axis: 'channel',
    prevalence: 0.179,
    spoken: false,
    demand: 1,
    test: (f) => f.inGamutAlways,
  },
  {
    // One channel pinned means the palette lives in an axis-aligned plane of
    // the RGB cube — a whole family of hues is unreachable, which prose can
    // state as an exclusion ("with red pinned dark, it never warms").
    word: 'flat-channel',
    axis: 'channel',
    prevalence: 0.11,
    spoken: false,
    demand: 1,
    test: (f) => f.channelRange.some((r) => r < FLAT_CHANNEL_RANGE),
  },
  {
    // Every rendered stop the same hex. 0.1% — one actual live seed — but the
    // editor reaches it directly (contrast or frequency at 0), and prose MUST
    // veto every journey/motion word when it fires, so the degenerate case
    // needs a name even though it will never earn one out loud.
    word: 'solid',
    axis: 'channel',
    prevalence: 0.001,
    spoken: false,
    demand: 1,
    test: (f) => f.channelRange.every((r) => r < SOLID_CHANNEL_RANGE),
  },
];

/** Self-information in bits, weighted by search demand. Higher wins. */
export function descriptorScore(d: Descriptor): number {
  return -Math.log2(d.prevalence) * d.demand;
}

// =============================================================================
// Selection
// =============================================================================

export interface SelectionOptions {
  /**
   * Reject a candidate the surrounding prose has already said, or contradicts.
   * Called with the SPOKEN word, since that is what a reader would see.
   */
  vetoes?: (word: string) => boolean;
  max?: number;
}

/**
 * Choose the few descriptors worth saying, best first.
 *
 * Greedy selection on score under a diversity constraint — the same shape as
 * the MMR pass the palette search already uses. Relevance is the measured
 * information content; diversity is enforced by letting each axis speak once
 * and by barring any word a chosen one already implies. The result is that
 * adding descriptors to the registry makes the name MORE selective, not longer:
 * a new descriptor only appears when it outranks everything already there.
 */
export function selectModifiers(
  f: PaletteFeatures,
  options: SelectionOptions = {},
): Descriptor[] {
  const max = options.max ?? MAX_SPOKEN;
  const veto = options.vetoes;

  const candidates = DESCRIPTORS.filter(
    (d) => d.spoken && descriptorScore(d) >= MIN_BITS_TO_SPEAK && d.test(f),
  ).sort((a, b) => descriptorScore(b) - descriptorScore(a));

  const chosen: Descriptor[] = [];
  const usedAxes = new Set<ModifierAxis>();
  const shadowed = new Set<string>();

  for (const d of candidates) {
    if (chosen.length >= max) break;
    if (usedAxes.has(d.axis) || shadowed.has(d.word)) continue;
    if (veto?.(spokenWord(d))) continue;
    chosen.push(d);
    usedAxes.add(d.axis);
    for (const w of d.implies ?? []) shadowed.add(w);
  }
  return chosen;
}

/**
 * Every descriptor that is true of this palette, as a flat tag list.
 *
 * Unlike the name, this holds nothing back: `spoken` and the bit threshold
 * govern prose, not indexing, and a filter or an embedding wants the low-
 * information facts too. Additive to `tagsToArray` in palette-tags.ts — adding
 * these to embedded text requires a reindex.
 */
export function modifierTags(f: PaletteFeatures): string[] {
  return DESCRIPTORS.filter((d) => d.test(f)).map((d) => d.word);
}
