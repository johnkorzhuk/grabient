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
 * change an answer, so a floor on CHROMA is not the guard this branch needs.
 * A floor on LIGHTNESS is — see SATURATION_BRANCH_LIGHTNESS.
 */
const SATURATION_FLOOR = 0.35;

/**
 * The saturation branch is for TINTS, and only for tints (2026-08-18, visual QA).
 *
 * The branch exists because the sRGB solid narrows: where the ceiling is small,
 * a stop can be as colourful as the screen allows and still measure almost no
 * chroma. The solid narrows at BOTH ends, and the two ends are not the same
 * situation. At the top a small ceiling means the colour is pale, and a pale
 * blue is still blue: that is the D19 palette this whole reading exists for. At
 * the bottom a small ceiling means the colour is nearly black, and OkLab's cube
 * root has infinite slope there, so it reports a chroma the eye cannot see:
 * #00000f (rgb 0,0,15) measures C 0.053 at 100% of its ceiling, and #091a19
 * measures 66% of its own. Rendered beside a neutral of the same lightness both
 * read as black (qa/r3/dark-visibility.png).
 *
 * That mattered live. The near-black #091a19 was admitted as a cyan and became
 * one half of "built on two opposite colors: almost black against faded orange"
 * over an image that is one continuous warm ramp: its cluster sat at 190.5°,
 * 151.3° from the palette's real hue, 0.9% past COMPLEMENTARY_SEPARATION.
 *
 * 0.5 is where the branch stops being reachable from below rather than a tuned
 * number: measured over the gamut, the ceiling is under CHROMA_FLOOR /
 * SATURATION_FLOOR (0.086) for 20 of 36 hues at L 0.30, 5 at L 0.46, 1 at L
 * 0.50 and none at L 0.54. So the floor removes the dark half of the branch and
 * leaves the light half, which is the half the fix was for. Stops with real
 * chroma are untouched at any lightness: the absolute branch is what names a
 * dark navy.
 */
const SATURATION_BRANCH_LIGHTNESS = 0.5;

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

/**
 * How far the run must travel AWAY from a colour before coming back to it
 * counts as a return (see `colorReturn`).
 *
 * A plateau is not a repeat. A duotone that renders pure white for 46% of its
 * length holds two white samples a third of the ramp apart at a distance of
 * exactly 0, and a palette with a wide red middle reads 0.005 across it; both
 * were told "It repeats colors from earlier in the gradient" over images in
 * which nothing recurs. 0.1 in OkLab is five JND, comfortably past the 0.05 the
 * seam sentence treats as "still the same colour" and just under the 0.12
 * separation `getUniqueColorNames` requires before it will spend a second name:
 * the run has to have gone somewhere the corpus would call a different colour.
 * Swept over the 867-seed fixture the returning share runs 0.05 → 6.2%,
 * 0.10 → 4.5%, 0.15 → 4.0%, 0.20 → 3.1%, and 0.10 is where the plateaus stop
 * qualifying: a flat periwinkle whose whole excursion is 0.037 and the two
 * palettes above all fall out between 0.05 and 0.10, while the symmetric arches
 * (excursions 0.19 to 0.77) are untouched at any bar in the sweep.
 */
const RETURN_EXCURSION = 0.1;

const MONOCHROME_SPAN = 30;
const ANALOGOUS_SPAN = 95;
const COMPLEMENTARY_SEPARATION = 150;
const RAINBOW_SPAN = 200;

/**
 * The second route to `complementary` (2026-08-18, D24.2): two dominant hue
 * MASSES that far apart, whether or not the palette got from one to the other
 * by an empty jump.
 *
 * The owner's screenshot palette is the case. #88d5f2 through #ffc1a1, a sky
 * blue conic sweeping to salmon: its ends sit at hue 224 and 48, which is
 * 175.5 apart and textbook complementary, but a cosine ramp SWEEPS, so the
 * crossing between the poles fills every hue between them and the palette
 * forms ONE cluster 184.5 wide. The isolated-clusters route below needs two
 * clusters each narrower than CLUSTER_GAP, so the palette classified
 * `multicolor` and the page offered no structure chip at all.
 *
 * Four numbers, each measured over the 867-seed fixture at 13 steps:
 *
 * HUE_MASS_WINDOW (half-width) is CLUSTER_GAP/2, so a mass is one cluster's
 * worth of arc — the same rule DUOTONE_CLUSTER_WIDTH records, that a group may
 * not be wider than the gap that defines a group. Sweeping the half-width over
 * the multicolor palettes that would move (weak pole 0.20, union 0.80): 15 ->
 * 16, 20 -> 30, 25 -> 43, 30 -> 57. The wider windows start swallowing the
 * crossing itself, which is how a continuous three-colour ramp would come to
 * read as two poles.
 *
 * The two SHARE thresholds are what "dominant" means: the weaker pole holds at
 * least MASS_POLE_SHARE of the chromatic samples and the pair together holds
 * MASS_BOTH_SHARE, so a palette with a third mass anywhere else cannot pass —
 * that is the guard against calling a triad or a rainbow complementary, and it
 * is why no explicit span test is needed here (a run that reaches both ends of
 * the spectrum spreads its samples over the wheel and cannot fit 80% of them
 * into two 40-degree windows). Sweep of gained palettes: at union 0.75/0.80/
 * 0.85 the counts are 32/23/14 for a weak pole of 0.20, and 35/25/16 at 0.15,
 * 28/21/13 at 0.25. The knee is the union, not the pole share.
 *
 * MASS_POLE_CHROMA is D24.2's "at real chroma", read off the loudest tenth of
 * the run (denseChromaP90, the same tenth PLATEAU_SHARE and the neon ceiling
 * are read on) rather than off the mean: a palette that crosses from pole to
 * pole through gray has a LOW mean chroma by construction, so a mean-chroma
 * floor would reject exactly the shape this route exists for (the owner's
 * palette means 0.079, under FAMILY_CHROMA). Visual QA over all 30 palettes
 * the share thresholds alone admitted: the four that plainly are not
 * complementary — a near-white ramp with two faint tint pulses, a desaturated
 * tan-to-maroon, an olive-to-black-to-brown whose "blue" pole is invisible
 * inside the black, and a flat pale one — measure p90 0.087, 0.042, 0.090 and
 * 0.058, while the twelve that plainly are run 0.113 to 0.259. 0.10 cuts
 * between them and clears the owner's palette (p90 0.109) with room.
 */
const HUE_MASS_WINDOW = CLUSTER_GAP / 2;
const MASS_POLE_SHARE = 0.2;
const MASS_BOTH_SHARE = 0.8;
const MASS_POLE_CHROMA = 0.1;
/**
 * How wide a single hue cluster may be and still count as one hue.
 *
 * Was 60° (two segments of the 12-segment wheel). Re-measured 2026-08-18 after
 * visual QA: a cluster may not be WIDER THAN THE GAP that defines a cluster, or
 * "group" stops meaning anything. At 60 a pale sweep running sand, yellow-
 * green, green, sage, gray-blue, lilac, pink came back `duotone` with a 53.9°
 * "single colour" cluster that crossed the yellow/green band edge, and the
 * description told a reader it "uses two colors and skips everything between
 * them" over an image that skips nothing.
 *
 * Sweep over the 867-seed fixture (duotone + complementary counts): 60 → 46+47,
 * 50 → 42+38, 45 → 38+33, 40 → 30+29, 35 → 25+23. The 33 palettes released at
 * 40 are continuous sweeps by eye (navy → sky → cream, orange → tan → gray →
 * light blue, violet → lavender → white); the ones that stay are two poles with
 * a crossing. CLUSTER_GAP rather than a new number, because that is the rule.
 */
const DUOTONE_CLUSTER_WIDTH = CLUSTER_GAP;
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
/**
 * The absolute floor beneath the relative disjunct above (2026-08-18, visual QA).
 *
 * D19's relative reading has one blind spot, and it is at the very top of the
 * solid: as L → 1 the ceiling collapses toward zero, so ANY residual chroma
 * reads as 100% saturation. #ffffff's neighbour at L 0.9992 measures C 0.0039
 * against a ceiling of the same order, and the prose called it a family: a
 * white → cream → peach → blush ramp was narrated "It moves from yellow into
 * pink" with no yellow anywhere in the image, one clause after its own identity
 * sentence had named that stop white.
 *
 * So the saturation branch of a FAMILY word (an identity claim about a single
 * stop) needs a visibility floor under it. Swept over the 867-seed fixture's
 * 319 saturation-branch family admissions, the floor removes 5 at 0.005, 8 at
 * 0.008, 8 at 0.01, 14 at 0.015 and 23 at 0.02; 0.008-0.01 is the flat region
 * and every stop it removes sits at L ≥ 0.98, which is the class exactly. One
 * 8-bit step near white moves chroma by roughly 0.001, so 0.01 is about ten
 * quantization steps: the smallest tint the panel can actually show.
 *
 * Deliberately NOT applied to `hasUsableHue`: a floor there was measured and
 * rejected (see SATURATION_FLOOR), because clustering needs the angle and the
 * angle is stable well below visibility. Naming a family is the claim that
 * needs to see the colour.
 */
const FAMILY_MIN_CHROMA = 0.01;
/** How much of the palette must sit inside the family's hue window. */
const FAMILY_BAND = 0.85;

/**
 * How much of a sunset's chromatic mass has to sit in the orange/gold half of
 * its arc (2026-08-18, visual QA).
 *
 * The band test alone asks whether the palette stays inside 300°-100°, and a
 * purely magenta-pink palette scores 1.000 on it without owning a single warm
 * stop: cream → pale pink → orchid → hot pink → magenta shipped as "A neon
 * sunset gradient color palette", with 48.9% of its mass in magenta/violet and
 * 6.4% in the 20°-100° band. A sunset has sun in it. Measured over the fixture,
 * this conjunct costs 17 of 134 sunsets (15.5% → 13.5%); the sweep is flat
 * around it (0.05 → 120, 0.10 → 117, 0.15 → 111, 0.20 → 105).
 */
const SUNSET_WARM_SHARE = 0.1;

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
/**
 * How far the weaker END has to sit from the extreme before "brightest (or
 * darkest) in the middle" is a shape and not a rounding. A quarter of the
 * palette's own dense lightness range — see the `bright-middle` row, where the
 * measurement is recorded.
 */
const MIDDLE_END_DROP = 0.25;
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
 * What counts as a sample inside a WASH: pale and weak at once
 * (research-colorTheory §7, "a pale low-chroma passage"). Both numbers are the
 * inventory's own; `paleRunShare` records how long the longest such stretch is
 * and the `wash` characteristic decides how long is long enough.
 */
export const WASH_LIGHTNESS = 0.8;
export const WASH_CHROMA = 0.06;

/**
 * One just-noticeable difference in OkLab, the unit `flatRunShare` counts a
 * plateau in. oklabDistance's own docstring puts a JND at about 0.02, and the
 * question a flat spot asks is exactly "would a viewer see these two samples as
 * the same colour".
 */
const FLAT_SPOT_JND = 0.02;

/**
 * A descriptor must carry this much information to be worth a word in a name.
 *
 * Exported since 2026-08-18: palette-prose.ts holds its sentences to the same
 * bar (D21.7 — "a row must clear the same information bar the name's selector
 * uses"), and D12 says a consumer imports a registry constant rather than
 * copying its value.
 *
 * 2 bits is a prevalence of 25%: past that the word applies to a quarter of
 * everything and stops being a description. It is the cutoff that silently
 * retires `warm` (46.0%), `cool` (36.0%), `analogous` (28.0%) and `ramp`
 * (58.6%) from the visible name without removing them as tags, and it is why
 * the name gets quieter rather than longer as the registry grows.
 */
export const MIN_BITS_TO_SPEAK = 2;

/**
 * The measured thresholds, exported read-only for the prose generator
 * (apps/web/src/palette-prose.ts). Its sentence bands must be THE registry
 * bands — imported, never copied — so a threshold re-measure here moves the
 * prose with it instead of leaving a silently diverged copy behind. Nothing in
 * this module reads the object; it exists so consumers cannot drift.
 */
export const THRESHOLDS = {
  // The hue-geometry constants. Exported since 2026-08-18 (D25 harmony): the
  // three- and four-hue schemes in palette-characteristics.ts are defined
  // against exactly these numbers - a triad's groups must be as narrow as any
  // other group, a tetradic pair must be as opposed as a complementary pair -
  // and a copied 40 or 150 there would silently diverge from the ladder here.
  CLUSTER_GAP,
  MONOCHROME_SPAN,
  ANALOGOUS_SPAN,
  COMPLEMENTARY_SEPARATION,
  CHROMA_FLOOR,
  SATURATION_FLOOR,
  SATURATION_BRANCH_LIGHTNESS,
  GRAYSCALE_SAT,
  FAMILY_CHROMA,
  FAMILY_SATURATION,
  FAMILY_MIN_CHROMA,
  FAMILY_BAND,
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
  MIDDLE_END_DROP,
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
   * How much the palette AGREES with that mean: the mean resultant length of
   * the same chroma-weighted vector sum, 0-1 (circular statistics' R).
   *
   * `meanHue` is an angle and an angle always has a value, including where the
   * vectors it averages point every which way and nearly cancel. A greige ramp
   * whose seven stops measure h 302, 329, 24, 75, 96, 123, 177 at C 0.009-0.015
   * returns a mean of 50.8°, squarely warm, and was described as "the colors are
   * warm grays" over an image whose two ends are a cool lavender-white and a
   * cool sage (2026-08-18 QA). R is what says that answer is an accident: 0.397
   * there against 0.92-0.99 for the leans that hold up.
   *
   * R relates to spread the usual way: circular SD = sqrt(-2 ln R), so R 0.6 is
   * about 58° of SD. Fixture distribution p05 0.206, p10 0.362, p25 0.636,
   * p50 0.867, p75 0.971.
   */
  hueConcentration: number;
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
  /**
   * Chroma of the loudest tenth of the dense sample (the 90th percentile).
   *
   * Between the mean, which a single loud stop cannot move, and the max, which
   * a single loud stop IS. Loudness claims about the palette as a whole read
   * this one: `neon` fired on a palette whose only electric sample was its last
   * (measured 4.2% of the run above NEON_CHROMA) and put the word in its name.
   */
  denseChromaP90: number;
  /**
   * The most chromatic dense sample, whole.
   *
   * Where the palette's colour identity lives, and therefore what it should be
   * NAMED after: the same argument D18 makes for the chip row (a ramp's
   * achromatic end describes its edge, not the palette). Dense, so the answer
   * does not move with the step count. Null only for a palette with no samples.
   */
  chromaPeak: OkLch | null;

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
  /**
   * ...and the same histogram over the samples whose hue is NAMEABLE — chroma
   * at or above FAMILY_CHROMA rather than merely above CHROMA_FLOOR.
   *
   * Normalized by the SAME chromatic count as `hueHistogram`, so the two are
   * directly comparable bin for bin and this one is everywhere the smaller: the
   * difference between them is the mass a viewer can see is coloured but could
   * not put a colour name to.
   *
   * WHY IT EXISTS (QA round 6). `hueBandShare` answers "how much of the run is
   * in this arc", and for a spectrum claim that is not enough: a palette whose
   * warm quadrant is traversed as tan and olive (C 0.067-0.089) has warm mass
   * by the CHROMA_FLOOR reading and NO RED OR ORANGE in the picture. `rainbow`
   * needs the second reading and nothing else in the file did, which is why it
   * is a histogram rather than one more boolean: the next term that wants
   * "nameable mass in this arc" is a lookup.
   */
  vividHueHistogram: number[];
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
   * Each cluster's share of the coloured run, and each cluster's mean chroma —
   * same order as `clusterHues`, so the three read as one table.
   *
   * A hue geometry says WHICH hues are present and how far apart they sit;
   * neither answers how much of the palette each one gets, and that is the
   * whole content of Itten's seventh contrast (extension): the same two hues
   * read as a balanced pair at 50/50 and as a field with an accent at 90/10.
   * The chroma column is what makes the accent reading falsifiable — a short
   * DULL passage inside a loud field is not an accent, it is a gap.
   */
  clusterShares: number[];
  clusterChromas: number[];
  /**
   * ...and each cluster's mean LIGHTNESS, for the same falsifiability at the
   * other end of the solid: a passage can carry chroma on paper and still be
   * black on screen. See the comment at the computation.
   */
  clusterLightnesses: number[];
  /** Each cluster's own arc in degrees; `maxClusterWidth` is its maximum. */
  clusterWidths: number[];
  /**
   * Hue of the first dense sample with a usable hue (`hasUsableHue`, so either
   * reading), or null when no sample has one: the "from {family}" anchor.
   */
  firstHue: number | null;
  /** Hue of the last chromatic dense sample — the "into {family}" anchor. */
  lastHue: number | null;
  /**
   * The whole stops those two hues came from, L and C included.
   *
   * `firstHue`/`lastHue` answer WHERE on the wheel; the tone-gated names prose
   * uses ("brown" is a dark low-chroma orange, "pink" a light low-chroma red)
   * need HOW LIGHT and HOW MUCH as well, and reading them off the rendered end
   * stops instead would mix two samples in one sentence.
   */
  firstChromatic: OkLch | null;
  lastChromatic: OkLch | null;
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
   * The UNWRAPPED hue path's extremes — the same chain as `hueNet`, kept as an
   * interval instead of collapsed to a sum, so a caller can ask WHICH arc of
   * the wheel the run travelled rather than only how far.
   *
   * The one question that needs it is whether a monotone walk crossed the LINE
   * OF PURPLES (`spectralOrder`): magenta is a red-blue mixture that no single
   * wavelength produces, so a ramp is only in spectral order if it stayed off
   * that segment, and no scalar here can tell "went the spectrum way" from
   * "went the purple way" — both are the same net rotation. Unwrapped, so a
   * walk that winds past a full turn keeps a genuinely widening interval;
   * `hueArcMin` is the smallest angle the chain reached and `hueArcMax` the
   * largest. The frame is the WHEEL, re-anchored wherever the chain restarts
   * across an achromatic gap — the same place `hueNet` stops accumulating, and
   * the same limitation: what happened across the gray is not measured, here
   * or there. Both 0 when the run has no usable hue at all.
   */
  hueArcMin: number;
  hueArcMax: number;
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
   * Position of the LEAST chromatic dense sample, 0..1 — where the run comes
   * closest to gray.
   *
   * The duotone sentence needs it (2026-08-18, visual QA). "It holds two colors
   * that meet through a gray middle" was gated on `chromaticFraction`, a share
   * of the whole run that says nothing about WHERE the gray sits, and it
   * inverted the image on a palette whose ENDS are warm grays and whose middle
   * is the only coloured part of it.
   */
  chromaValleyT: number;
  /**
   * Lightness of that least-chromatic sample — what the neutral it passes
   * through actually LOOKS like.
   *
   * chromaValleyT answers "where", and the duotone sentence also needs "what":
   * it called the crossing "gray" on a gunmetal → cinnamon pair whose middle
   * stops are #000007 and #000020, i.e. black (2026-08-18, visual QA seed 05).
   * Black and white are the ends of the gray scale and a reader does not call
   * either of them gray, so the sentence reads this and names the band.
   */
  chromaValleyL: number;
  /**
   * How closely the run LEAVES a color and comes BACK to it: the smallest OkLab
   * distance between two dense samples a third of the ramp apart with a visible
   * excursion (RETURN_EXCURSION) between them. `Infinity` when no such pair
   * exists, which is the honest answer to "how close does it come back".
   *
   * The question a reader asks of an image ("do I see the same color twice?") is
   * a distance question, and nothing here measured it. `hue-wandering` measures
   * the hue ANGLE turning back, which is a different fact: a denim → periwinkle
   * → orchid → electric violet sweep returns to h 283 at C 0.247 where it had
   * been at C 0.082, so the angle came home and the colour never did (this
   * feature reads 0.117 on it, six JND).
   */
  colorReturn: number;
  /**
   * Dense max − min lightness. The guard for peak/valley/direction claims —
   * the rendered `lightnessRange` tracks the viewer's steps, this one cannot.
   */
  denseLightnessRange: number;
  /**
   * The two ends of that range, absolutely.
   *
   * A claim about what a viewer can SEE along the run needs the levels, not the
   * spread: a passage at L 0.08 renders black whatever the range around it is,
   * and a hue break inside it is invisible. Dense, so no step count moves them.
   */
  denseMinLightness: number;
  denseMaxLightness: number;
  /**
   * The lightness at each END of the dense run, t = 0 and t = 1.
   *
   * "Brightest in the middle and darker at both ends" is two claims, and until
   * 2026-08-18 the `bright-middle` tag only tested the first: peak position
   * inside the middle third. A ramp that climbs out of a medium blue into bright
   * cyan and stays bright through to spring green peaks at t 0.596 and ends
   * 0.038 below that peak against 0.189 at its start, a 5:1 asymmetry, and the
   * sentence told the reader both of its ends were darker. The ENDS are what the
   * second claim is about, so they are measured. Dense rather than rendered, or
   * the tag would move with the viewer's step count.
   */
  denseFirstLightness: number;
  denseLastLightness: number;
  /** Dense max − min chroma, the guard for chroma-position claims. */
  denseChromaRange: number;
  /**
   * The least chromatic dense sample's chroma — how close to gray the run
   * actually comes.
   *
   * Itten's contrast of saturation is "pure colour beside NEAR-GRAY", which is
   * a claim about the floor, and the range alone cannot express it: 0.15 of
   * travel from 0.20 down to 0.05 is a loud palette that dulls, not a pure
   * colour beside a gray. Added 2026-08-18 to replace the proxy
   * `maxChroma - denseChromaRange`, which read the RENDERED max against a dense
   * range and therefore sat at or below the true floor (it over-fired by
   * construction; measured cost of the exact reading below).
   */
  denseMinChroma: number;
  /**
   * Dense max − min relative saturation: how far the palette's colourfulness
   * travels, read against the ceiling at each sample rather than absolutely.
   *
   * The monochrome sentence needs it. "It holds one red and changes only how
   * light it is" is an EXCLUSIVE claim, and a monochrome ramp can hold its hue
   * and its lightness while its colourfulness halves (#fc7b82 at 96% of its
   * ceiling into #dc949e at 54%, no lightness change, visibly dustier).
   */
  denseSaturationRange: number;
  /**
   * Longest CONTIGUOUS dense run that is pale and weak at once
   * (L > WASH_LIGHTNESS ∧ C < WASH_CHROMA), as a share of the ramp — the
   * `wash` term of research-colorTheory §7.
   *
   * A run, not a share of the whole: a wash is a PASSAGE. 43 of the 103
   * fixture palettes that clear the quarter-of-the-ramp bar are not `high-key`
   * and 41 are not even `light`, because the pale stretch sits between two
   * darker ends and no palette-wide mean can see it.
   *
   * Absolute chroma, deliberately, and this is the one place the D19 rule
   * points that way: "is this passage washed out" is a LOUDNESS question (how
   * much colour is in it), not an identity question (is there colour at all).
   * The saturation reading answers the wrong one — at L > 0.8 the sRGB ceiling
   * has collapsed to ~0.1, so a dilute tint sits near 100% of what is
   * available and reads "fully coloured" while looking like water. Measured:
   * the saturation-gated variant fires on 44 palettes against 103, and the 64
   * it drops include #ffdeea → #b5fffb, seven near-white tints which are
   * exactly what a wash looks like.
   */
  paleRunShare: number;
  /**
   * The longest run of dense samples that are all one COLOUR, as a share of the
   * ramp: a FLAT SPOT (research-colorTheory §7).
   *
   * Not `clipped`, which is the share of samples with some channel pinned at
   * the clamp — a coefficient fact that is true of 40% of the corpus and says
   * nothing about what the picture does. This is the visible half of the same
   * row: a stretch where the gradient stops moving. Measured as the longest
   * window whose every member sits inside one JND (oklabDistance 0.02) of the
   * window's first sample, so a slow ramp accumulates two or three samples and
   * a plateau accumulates the plateau.
   */
  flatRunShare: number;
  /**
   * ...and how far the REST of the ramp gets from that plateau, in OkLab.
   *
   * A flat SPOT is a spot on something, exactly as a `wash` is a passage
   * through something: on a palette that is one colour end to end the longest
   * still stretch is a sixth of nothing happening, and the words for that are
   * `low-contrast` and `monochrome`. This is the distance from the winning
   * run's anchor to the farthest dense sample, so the term can ask that the
   * gradient go somewhere.
   */
  flatRunContrast: number;
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
  return bandShare(f.hueHistogram, lo, hi);
}

/**
 * The same window over the NAMEABLE mass only — see `vividHueHistogram`.
 *
 * Answers "is there a real {family} in this palette", which is a different
 * question from "does the run pass through that arc", and the one a spectrum or
 * a family claim is actually making.
 */
export function vividHueBandShare(f: PaletteFeatures, lo: number, hi: number): number {
  return bandShare(f.vividHueHistogram, lo, hi);
}

const bandShare = (histogram: readonly number[], lo: number, hi: number): number => {
  const bin = (edge: number) =>
    ((Math.round(edge / BIN_WIDTH) % HUE_BINS) + HUE_BINS) % HUE_BINS;
  const from = bin(lo);
  const to = bin(hi);
  let total = 0;
  for (let i = from; i !== to; i = (i + 1) % HUE_BINS) total += histogram[i] ?? 0;
  return total;
};

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
 * chroma catches the ordinary case, saturation catches the TINTS that are as
 * colourful as sRGB gets at their lightness but never clear an absolute bar.
 * Everything downstream — clusters, span, the hue chain, the histogram,
 * chromaticFraction — walks this one predicate, so the two readings cannot
 * disagree about which stops have a hue.
 *
 * The lightness floor on the second branch is the shadow half of the same
 * argument; SATURATION_BRANCH_LIGHTNESS records the measurement.
 */
const hasUsableHue = (s: Stop) =>
  s.C >= CHROMA_FLOOR ||
  (s.S >= SATURATION_FLOOR && s.L >= SATURATION_BRANCH_LIGHTNESS);

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
      shares: [] as number[],
      chromas: [] as number[],
      lightnesses: [] as number[],
      clusterWidths: [] as number[],
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

  // How much of the coloured run each group holds, and how loud it is
  // (2026-08-18, D25 harmony/contrast). Itten's contrast of extension is a
  // claim about the AREA one hue is given against another, and on a gradient
  // that area is extent along t: the dense sample is uniform in t, so a group's
  // share of the chromatic samples IS its share of the coloured length. The
  // chroma is the group's own mean, which is what separates an ACCENT (a short
  // passage LOUDER than the field it interrupts) from a mere short passage.
  const shares = groups.map((group) => group.length / chromatic.length);
  // ...and each group's own arc, so `maxClusterWidth` is a reading of this row
  // rather than a separate measurement: an accented-analogous field has to be
  // an ARC (the dominant group ≥ MONOCHROME_SPAN wide), and the max alone
  // cannot say WHICH group is the wide one.
  const clusterWidths = widths;
  const chromas = groups.map(
    (group) => group.reduce((sum, c) => sum + c.C, 0) / group.length,
  );
  // ...and how LIGHT it is (QA round 4). A group's chroma alone cannot say
  // whether a viewer can see its colour, because OkLab's cube root has infinite
  // slope at the black point: #000108 measures C 0.033 and reads as black, and
  // on that reading a seven-stop near-black-to-olive neutral ramp was chipped
  // `extension contrast` — Itten's SMALL AREA OF STRONGER COLOUR — with the
  // "accent" being the black end of its own ramp. It is the same argument
  // SATURATION_BRANCH_LIGHTNESS records for the saturation branch, one level
  // up: a cluster sitting under the near-black edge is not a colour anything
  // can be set against.
  const lightnesses = groups.map(
    (group) => group.reduce((sum, c) => sum + c.L, 0) / group.length,
  );

  return {
    clusters,
    shares,
    chromas,
    lightnesses,
    clusterWidths,
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
  let chromaSum = 0;
  for (const c of denseLch) {
    const rad = (c.h * Math.PI) / 180;
    x += c.C * Math.cos(rad);
    y += c.C * Math.sin(rad);
    chromaSum += c.C;
  }
  const meanHueRaw = (Math.atan2(y, x) * 180) / Math.PI;
  // |Σ C·e^{ih}| / Σ C — how much the samples agree with the angle above.
  const hueConcentration = chromaSum > 0 ? Math.hypot(x, y) / chromaSum : 0;

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
  // ...and the same chain kept as an INTERVAL: see hueArcMin.
  let hueArc = 0;
  let hueArcMin = Infinity;
  let hueArcMax = -Infinity;
  let prevHue: number | null = null;
  let firstHue: number | null = null;
  let lastHue: number | null = null;
  // The stops those two hues were read from, kept whole. A family word is an
  // L/C claim as much as a hue one ("brown" is a dark low-chroma orange), so
  // prose that names the two ends needs the ends, not just their angles.
  let firstChromatic: OkLch | null = null;
  let lastChromatic: OkLch | null = null;
  for (const c of denseLch) {
    if (!hasUsableHue(c)) {
      prevHue = null;
      continue;
    }
    if (prevHue !== null) {
      const arc = ((c.h - prevHue + 540) % 360) - 180; // signed shortest arc
      hueNet += arc;
      hueTravel += Math.abs(arc);
      hueArc += arc;
    } else {
      // A restart: the run came out of a gray somewhere else on the wheel, so
      // the unwrapped frame re-anchors on the sample that resumed it.
      hueArc = c.h;
    }
    if (hueArc < hueArcMin) hueArcMin = hueArc;
    if (hueArc > hueArcMax) hueArcMax = hueArc;
    prevHue = c.h;
    if (firstHue === null) {
      firstHue = c.h;
      firstChromatic = { L: c.L, C: c.C, h: c.h };
    }
    lastHue = c.h;
    lastChromatic = { L: c.L, C: c.C, h: c.h };
  }

  // Does the run LEAVE a colour and come BACK to it? Smallest OkLab distance
  // over sample pairs that are a third of the ramp apart AND separated by a
  // visible excursion. Both conditions are load-bearing: without the gap the
  // trivial closeness of neighbours answers yes for every palette, and without
  // the excursion a flat plateau does — a duotone that renders pure white for
  // 46% of its length reads a distance of exactly 0 between two of its white
  // samples, and a wide red plateau reads 0.005, neither of which is a return.
  // One inner loop carrying the running maximum, on SQUARED distances so the
  // 1,128 pairs cost 1,128 multiply-adds instead of 1,128 Math.hypot calls.
  // hypot carries overflow-safe scaling these three small components do not
  // need, and it dominates: measured over 300 fixture seeds the same loop runs
  // 4.5 us per palette squared against 49.3 us through oklabDistance, beside a
  // paletteFeatures pass of 104.3 us. Both comparisons are monotone in the
  // square, so only the answer takes a square root.
  const denseLab = dense.map(labOf);
  const RETURN_GAP = Math.floor(denseLab.length / 3);
  let colorReturnSq = Infinity;
  const excursionSq = RETURN_EXCURSION * RETURN_EXCURSION;
  for (let i = 0; i + RETURN_GAP < denseLab.length; i++) {
    const a = denseLab[i]!;
    let awaySq = 0;
    for (let j = i + 1; j < denseLab.length; j++) {
      const b = denseLab[j]!;
      const dl = a[0] - b[0];
      const da = a[1] - b[1];
      const db = a[2] - b[2];
      const d = dl * dl + da * da + db * db;
      if (d > awaySq) awaySq = d;
      if (j - i >= RETURN_GAP && awaySq >= excursionSq && d < colorReturnSq) colorReturnSq = d;
    }
  }
  const colorReturn = Number.isFinite(colorReturnSq) ? Math.sqrt(colorReturnSq) : Infinity;

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

  // The longest PALE AND WEAK stretch, for `wash`. A separate walk because it
  // is the only run-length fact here: the extremum loop above answers "where
  // is the palest sample", and a wash is a question about how long the palette
  // stays there.
  //
  // A CLIPPED WHITE IS NOT A WASH (QA round 4). Both of the inventory's
  // thresholds are satisfied at the white corner — L 1.0 is pale and C 0.0 is
  // weak — so a ramp that spends 44% of its length pinned at #ffffff measured
  // paleRunShare 0.54 and was chipped `wash` beside `saturation contrast` and
  // `pure-white-plateau`, which is one run of samples described three ways and
  // only the last of them right. A wash is a passage OF COLOUR that has been
  // watered down; where the gamut ran out there is no colour to water down, and
  // the plateau terms are the ones that say so. Measured over the fixture: the
  // run test drops from 103 to 98 palettes (strong 37 to 33), and the five it
  // loses are exactly the ones whose pale run is mostly the clamp.
  // The longest stretch where the colour does not CHANGE — see flatRunShare.
  // Reuses `denseLab` from the colour-return block above: one OkLab pass.
  let flatRun = 1;
  let flatCurrent = 1;
  let flatAnchor = denseLab[0]!;
  let flatBest = denseLab[0]!;
  for (let i = 1; i < denseLab.length; i++) {
    const lab = denseLab[i]!;
    if (oklabDistance(lab, flatAnchor) <= FLAT_SPOT_JND) {
      flatCurrent++;
      if (flatCurrent > flatRun) {
        flatRun = flatCurrent;
        flatBest = flatAnchor;
      }
    } else {
      flatAnchor = lab;
      flatCurrent = 1;
    }
  }
  const flatRunContrast = denseLab.reduce(
    (m, lab) => Math.max(m, oklabDistance(lab, flatBest)),
    0,
  );

  let paleRun = 0;
  let paleCurrent = 0;
  for (let i = 0; i < denseLch.length; i++) {
    const s = denseLch[i]!;
    const [r, g, b] = denseRgb[i]!;
    const white = r >= 0.9999 && g >= 0.9999 && b >= 0.9999;
    if (!white && s.L > WASH_LIGHTNESS && s.C < WASH_CHROMA) {
      paleCurrent++;
      if (paleCurrent > paleRun) paleRun = paleCurrent;
    } else paleCurrent = 0;
  }

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

  // The loudest tenth of the run. A mean hides a peak and a max IS one: a
  // palette whose single last stop touches neon chroma is not a neon palette,
  // and the sentence "its strongest colors look neon" should hold for a
  // visible part of the ramp rather than for one sample. Same tenth-of-the-run
  // reading PLATEAU_SHARE uses for the clamp plateaus.
  const sortedC = denseLch.map((c) => c.C).sort((a, b) => b - a);
  const denseChromaP90 = sortedC[Math.floor(sortedC.length * 0.1)]!;

  const hueHistogram = new Array<number>(HUE_BINS).fill(0);
  const vividHueHistogram = new Array<number>(HUE_BINS).fill(0);
  const chromatic = denseLch.filter(hasUsableHue);
  for (const c of chromatic) {
    const bin = Math.min(HUE_BINS - 1, Math.floor(c.h / BIN_WIDTH));
    hueHistogram[bin] = (hueHistogram[bin] ?? 0) + 1 / chromatic.length;
    if (c.C >= FAMILY_CHROMA)
      vividHueHistogram[bin] = (vividHueHistogram[bin] ?? 0) + 1 / chromatic.length;
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
    hueConcentration,
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
    vividHueHistogram,
    contrastRatio:
      (Math.max(...luminances) + 0.05) / (Math.min(...luminances) + 0.05),
    denseChromaP90,
    chromaPeak: denseLch[chromaPeakI]
      ? {
          L: denseLch[chromaPeakI]!.L,
          C: denseLch[chromaPeakI]!.C,
          h: denseLch[chromaPeakI]!.h,
        }
      : null,
    clusterHues: geometry.clusters,
    clusterShares: geometry.shares,
    clusterChromas: geometry.chromas,
    clusterLightnesses: geometry.lightnesses,
    clusterWidths: geometry.clusterWidths,
    firstHue,
    lastHue,
    firstChromatic,
    lastChromatic,
    hueNet,
    hueTravel,
    hueArcMin: Number.isFinite(hueArcMin) ? hueArcMin : 0,
    hueArcMax: Number.isFinite(hueArcMax) ? hueArcMax : 0,
    hueConsistency: hueTravel > 0 ? Math.abs(hueNet) / hueTravel : 1,
    lightnessPeakT: peakI / lastI,
    lightnessValleyT: valleyI / lastI,
    chromaPeakT: chromaPeakI / lastI,
    chromaValleyT: chromaValleyI / lastI,
    chromaValleyL: denseLch[chromaValleyI]!.L,
    colorReturn,
    denseMinLightness: denseLch[valleyI]!.L,
    denseMaxLightness: denseLch[peakI]!.L,
    denseFirstLightness: denseLch[0]!.L,
    denseLastLightness: denseLch[lastI]!.L,
    denseSaturationRange:
      Math.max(...denseLch.map((c) => c.S)) - Math.min(...denseLch.map((c) => c.S)),
    paleRunShare: paleRun / denseLch.length,
    flatRunShare: flatRun / dense.length,
    flatRunContrast,
    denseLightnessRange: denseLch[peakI]!.L - denseLch[valleyI]!.L,
    denseChromaRange: denseLch[chromaPeakI]!.C - denseLch[chromaValleyI]!.C,
    denseMinChroma: denseLch[chromaValleyI]!.C,
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
 * "Is there colour here at all": the De Morgan negation of the grayscale
 * conjunction above, and the shared floor for every descriptor whose lower
 * chroma bound exists only to keep grays out (pastel, muted, earthy). D19's
 * rule of thumb: identity questions ("is this coloured", "which colour is it")
 * take saturation; loudness questions ("how strong is it") stay on absolute
 * chroma.
 *
 * On the DENSE sample since 2026-08-18, so it cannot disagree with the function
 * it negates. It used to read the rendered stops, which put the same constant on
 * two different samples of one palette: a lavender-white to sage-gray ramp
 * measures dense mean saturation 0.231 (grayscale, 0.019 under the line) and
 * rendered mean saturation 0.262 (has colour, 0.012 over it), so it fired
 * `pastel` AND classified `grayscale`, and the chip row offered the compound
 * "pastel grayscale": one label telling the visitor the palette is both a pale
 * tint and free of tint. One sample, one answer. Measured cost over the fixture:
 * pastel 72 → 71, muted 91 → 90, earthy unchanged.
 */
const hasColour = (f: PaletteFeatures) =>
  f.denseMeanChroma >= GRAYSCALE_CHROMA || f.denseMeanSaturation >= GRAYSCALE_SAT;

/**
 * The family floor, both readings. A family word is an identity claim, so a
 * pale sky-and-cyan palette sitting at 90% of its ceiling qualifies even
 * though it never reaches FAMILY_CHROMA; a washed-out palette that merely
 * lands in the hue window still does not.
 */
const familyColour = (f: PaletteFeatures, floor: number = FAMILY_CHROMA) =>
  f.meanChroma >= floor || f.meanSaturation >= FAMILY_SATURATION;

/**
 * A rainbow reaches both ends of the spectrum (2026-08-18, visual QA).
 *
 * RAINBOW_SPAN was tuned for how far the hue travels and says nothing about
 * WHERE it travelled. A palette can cover 201° without leaving the warm half of
 * the wheel by going the short way through magenta: violet, magenta, dull rose,
 * clay, olive, green shipped as "A rainbow gradient color palette running from
 * rebecca purple through clay to grassy green" with no blue and no cyan
 * anywhere in it, and the word drove the title, the meta description and a
 * `rainbow` chip, so the palette was offered to rainbow searches.
 *
 * So the span has to hold colour on BOTH sides: the warm arc through 0° and the
 * cool arc through 225°, the same two windows `warm` and `cool` are read on.
 * 0.10 by sweep over the 867 fixture (rainbow count at each floor): 0.05 → 77,
 * 0.10 → 76, 0.15 → 71, 0.20 → 63, 0.25 → 56, 0.30 → 47. The flat end is where
 * the test only removes palettes with NO landmark on one side, which is what it
 * is for; the two it drops measure 0.00 and 0.06 of their mass in the cool arc.
 */
const RAINBOW_POLE_SHARE = 0.1;

const hasSpectrumPoles = (f: PaletteFeatures) =>
  hueBandShare(f, 330, 120) >= RAINBOW_POLE_SHARE &&
  hueBandShare(f, 150, 300) >= RAINBOW_POLE_SHARE;

/**
 * Two dominant, opposed hue masses — the sweep route to `complementary`.
 *
 * Reads the hue histogram, so it is pure over PaletteFeatures and sees the
 * same dense sample the clusters do. The search is for the EXISTENCE of a pair
 * of windows that satisfies every threshold, not for the heaviest pair: taking
 * the heaviest two masses and then measuring the angle between them made the
 * answer depend on where a washed-out crossing dragged a centroid (the owner's
 * palette reads 130 degrees apart under that reading at a 30-degree half-width,
 * because a window centred at 250 catches more of the blue tail than one
 * centred at 230). The separation belongs in the search as a constraint; the
 * share thresholds are what decide whether the pair is the palette.
 *
 * Cost: 36 window sums (4 bins each) plus at most 36*35/2 pairs of lookups,
 * measured at 4.9 us per call over the fixture beside a paletteFeatures pass of
 * ~104 us.
 */
export function opposedHueMasses(
  f: PaletteFeatures,
  // The shares are parameters so the characteristic registry can ask the SAME
  // question with a margin (its `strong` band for `complementary`) instead of
  // writing a second, subtly different two-mass search.
  { pole = MASS_POLE_SHARE, both = MASS_BOTH_SHARE } = {},
): boolean {
  if (f.denseChromaP90 < MASS_POLE_CHROMA) return false;
  // THE PAIR HAS TO EXIST IN THE PALETTE, not merely in the search (QA round
  // 6). The windows are HUE_MASS_WINDOW wide on each side, so a pair of BIN
  // CENTRES exactly COMPLEMENTARY_SEPARATION apart can be carried by two masses
  // sitting up to 2*HUE_MASS_WINDOW = 40 degrees closer together than that. The
  // filed palette is the whole error at once: olive stops at h 124/127/146 and
  // blue stops at h 259-263, an ENTIRE chromatic arc of 138.9 degrees, so no two
  // hues anywhere in it are 150 apart - and the accepted pair was the windows
  // centred at 120 and 270 whose chroma-weighted centroids measure 131.0 and
  // 262.4, i.e. 131.4 apart. Split-complementary territory printing the textbook
  // word.
  //
  // The arc is the honest precondition and it is one number the features
  // already carry: the walk's own extent. Measured over the fixture it refuses
  // 2 of the 52 palettes the term was true of and exactly 1 of the 32 the margin
  // admitted - the filed seed. The owner's screenshot palette (D24.2, the case
  // this route exists for) spans 184.5 degrees and is untouched.
  if (f.hueArcMax - f.hueArcMin < COMPLEMENTARY_SEPARATION) return false;
  const mass: number[] = [];
  for (let i = 0; i < HUE_BINS; i++) {
    const centre = i * BIN_WIDTH;
    mass.push(hueBandShare(f, centre - HUE_MASS_WINDOW, centre + HUE_MASS_WINDOW));
  }
  for (let i = 0; i < HUE_BINS; i++) {
    if (mass[i]! < pole) continue;
    for (let j = i + 1; j < HUE_BINS; j++) {
      if (mass[j]! < pole) continue;
      if (mass[i]! + mass[j]! < both) continue;
      if (hueSeparation(i * BIN_WIDTH, j * BIN_WIDTH) >= COMPLEMENTARY_SEPARATION)
        return true;
    }
  }
  return false;
}

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
    if (f.hueSpan >= RAINBOW_SPAN && hasSpectrumPoles(f)) return 'rainbow';
    // A one-cluster sweep between two opposed masses is where the owner's
    // palette lives: continuous in hue, and still two colours facing each
    // other. `rainbow` is tested first and keeps its claim, so a full-wheel run
    // cannot take this branch (and could not pass it anyway: 80% of its samples
    // do not fit in two 40-degree windows).
    return opposedHueMasses(f) ? 'complementary' : 'multicolor';
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
  // Everything else is multicolour, INCLUDING wide spans. `rainbow` is a
  // one-cluster classification now (2026-08-18, visual QA): reaching the span
  // test from here meant the palette had a hole wider than CLUSTER_GAP inside
  // its own span, so the span measured a distance rather than a journey. The
  // palette that exposed it runs dusty teal to a flat block of red to brown:
  // two clusters at 226° and 27° with a 161° EMPTY gap between them, hueSpan
  // 200.4 clearing RAINBOW_SPAN by 0.2%, named "Sunset rainbow dirty blue to
  // tomato red to cocoa" with no yellow, green, blue or purple anywhere in it.
  // 43 of the fixture's 121 rainbows were that shape (brown to sage to navy,
  // white to blue-gray to teal); rainbow drops to 78 and multicolor absorbs
  // them, which is what they look like.
  //
  // ...but two masses facing each other are complementary however many clusters
  // the crossing splits into, so the same second route runs here (D24.2). It
  // reaches palettes with three or more clusters and palettes with two WIDE
  // ones; the narrow-two case above is already decided, and 7 of the fixture's
  // duotones would also satisfy this test — they keep `duotone`, because the
  // ladder is ordered and their clusters are the more specific reading.
  return opposedHueMasses(f) ? 'complementary' : 'multicolor';
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
  // Re-measured 2026-08-18 after the ladder fix (rainbow needs one cluster, a
  // cluster may not be wider than the gap between clusters): duotone 46 → 30,
  // complementary 47 → 29, rainbow 121 → 78, and multicolor absorbs all 76.
  // Re-measured again the same day after the second visual-QA round, which
  // moved two things underneath these counts: the saturation branch of hue
  // validity now needs light (SATURATION_BRANCH_LIGHTNESS), so a near-black
  // stop no longer contributes a hue cluster, and `rainbow` now needs colour at
  // both ends of the spectrum (hasSpectrumPoles). Net over the 867 seeds:
  // monochrome 132 → 137, duotone 30 → 32, complementary 29 → 29 (a different
  // 29: the near-black-pole palettes left, and the shadows they were paired
  // against no longer split a cluster), rainbow 78 → 75, analogous 243 → 247,
  // multicolor 336 → 328, grayscale 19 → 19.
  // Re-measured a third time 2026-08-18 (D24.2, the sweep route to
  // `complementary`): the only two classes that move are the two the new route
  // sits between, complementary 29 -> 52 and multicolor 328 -> 305. Nothing
  // else can change — the route is only reached after grayscale, monochrome,
  // analogous, rainbow and the narrow-two-cluster pair have all declined.
  structural('grayscale', 0.022, 1, true),
  structural('monochrome', 0.158, 1.2, true),
  structural('duotone', 0.037, 1, true),
  structural('complementary', 0.058, 1, true),
  structural('rainbow', 0.087, 1.3, true),
  structural('analogous', 0.285, 0.6, false),
  structural('multicolor', 0.354, 0.8, false),

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
    prevalence: 0.134,
    spoken: true,
    demand: 1.4,
    implies: ['warm'],
    test: (f) =>
      hueBandShare(f, 300, 100) >= 0.8 &&
      hueBandShare(f, 20, 100) >= SUNSET_WARM_SHARE &&
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
    //
    // But loudness is also a claim about the PALETTE, and maxChroma is one
    // sample: a steel-blue-to-dusty-rose ramp whose final stop alone reaches
    // 0.2471 (4.2% of the run above the bar, per-stop saturations 0.46 0.54
    // 0.46 0.40 0.49 0.75 1.00) shipped as "A neon gradient color palette"
    // beside six muted stops. The loudest TENTH has to clear the bar too, so
    // the word describes something a viewer can see a stretch of. Measured:
    // 85 → 71 of 867 (9.8% → 8.2%), and the palettes it drops are exactly the
    // one-stop cases (the true neons sit at 20-40% of the run above NEON).
    word: 'neon',
    axis: 'tone',
    prevalence: 0.082,
    spoken: true,
    demand: 1.4,
    implies: ['vivid'],
    test: (f) =>
      f.maxChroma >= NEON_CHROMA &&
      f.denseChromaP90 >= NEON_CHROMA &&
      f.meanLightness > NEON_LIGHTNESS,
  },
  {
    // Same split as autumn: EARTHY_CHROMA is the loudness ceiling (pigment,
    // not paint), the floor is identity. Earth colours live under L 0.75 where
    // the gamut is roomy, so in practice the two readings agree here; the
    // disjunct matters for the dark end, where a ceiling of ~0.07 at L 0.2
    // makes a brown that reads brown fail an absolute 0.03.
    //
    // The ceiling is on the MEAN, and a mean is exactly what a neutral middle
    // fools (2026-08-18 QA). A deep indigo against a lemon yellow, with a gray
    // and two khakis between them, measures mean chroma 0.083 because its third
    // stop measures 0.010, and shipped as "An earthy duotone gradient color
    // palette" leading both the title and the description, on a palette that
    // also fires `high-contrast` and whose yellow end sits at 93.5% of the
    // chroma its lightness allows. `earthy` implies `muted`, and a palette
    // holding a stop as loud as the vivid line is not muted by any reading, so
    // that stop vetoes the word. VIVID_CHROMA rather than a new constant: it is
    // already the site's definition of loud. Measured: 97 → 86 of 867, and the
    // 11 it drops all hold a rendered stop at 0.15-0.20 chroma. (`muted` itself
    // needs no such veto: 0 of its 91 palettes hold a stop that loud, its own
    // ceiling being 0.055.)
    word: 'earthy',
    axis: 'tone',
    prevalence: 0.099,
    spoken: true,
    demand: 1,
    implies: ['muted'],
    test: (f) =>
      f.meanChroma < EARTHY_CHROMA &&
      f.maxChroma < VIVID_CHROMA &&
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
    // 0.110 → 0.108 on 2026-08-18: `hasColour` moved to the dense sample so it
    // could not disagree with `isGrayscale` (see there). Nothing about muted's
    // own reading changed.
    word: 'muted',
    axis: 'tone',
    prevalence: 0.108,
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
    prevalence: 0.22,
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
    prevalence: 0.178,
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
    prevalence: 0.173,
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
    prevalence: 0.055,
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
    //
    // ...and by BOTH ends, since 2026-08-18. The tag's whole content is that the
    // bright part is the MIDDLE, which is a claim about the ends as much as
    // about the peak, and position alone never asked them: a ramp climbing from
    // medium blue into bright cyan and holding it through to spring green peaks
    // at t 0.596 with its right end 0.038 below the peak and its left end 0.189
    // below, and both the tag and the sentence it drives said "darker at both
    // ends". So the WEAKER end has to fall a real share of the palette's own
    // lightness range. A quarter, by measurement: over the 111 fixture palettes
    // the position test alone accepted, that share runs p05 0.144, p10 0.275,
    // p25 0.474, p50 0.703, and the run of palettes it removes (11 here, 4 on
    // the twin) are the ones whose weaker end is within a couple of JND of the
    // extreme. A ratio rather than an absolute, for the same reason
    // ARCH_DOMINANT is one: the claim is about shape, not about amount.
    word: 'bright-middle',
    axis: 'motion',
    prevalence: 0.115,
    spoken: false,
    demand: 1,
    test: (f) =>
      f.denseLightnessRange >= LOW_CONTRAST_RANGE &&
      f.lightnessPeakT >= 1 / 3 &&
      f.lightnessPeakT <= 2 / 3 &&
      f.denseMaxLightness - Math.max(f.denseFirstLightness, f.denseLastLightness) >=
        MIDDLE_END_DROP * f.denseLightnessRange,
  },
  {
    word: 'dark-middle',
    axis: 'motion',
    prevalence: 0.07,
    spoken: false,
    demand: 1,
    test: (f) =>
      f.denseLightnessRange >= LOW_CONTRAST_RANGE &&
      f.lightnessValleyT >= 1 / 3 &&
      f.lightnessValleyT <= 2 / 3 &&
      Math.min(f.denseFirstLightness, f.denseLastLightness) - f.denseMinLightness >=
        MIDDLE_END_DROP * f.denseLightnessRange,
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
    // tenth of its length or more.
    word: 'pure-black-plateau',
    axis: 'channel',
    prevalence: 0.024,
    spoken: false,
    demand: 1,
    test: (f) => f.allBlackShare >= PLATEAU_SHARE,
  },
  {
    // The white twin, added 2026-08-18 after visual QA. It was left out at 0.7%
    // on the 2% prevalence floor, which is the rule for what may be SPOKEN and
    // was the wrong rule for a fact prose has to be able to SEE: a palette
    // whose middle 46% renders pure white was described as "two colors" that
    // "skip everything between them", and what sits between them is the largest
    // block in the image. Nothing speaks this word (spoken: false, like its
    // twin); the duotone sentence reads it as a veto and the white-block
    // impression states it. 6 of 867 fixture seeds clear the floor, all 6 at
    // 25% or more of the run.
    word: 'pure-white-plateau',
    axis: 'channel',
    prevalence: 0.007,
    spoken: false,
    demand: 1,
    test: (f) => f.allWhiteShare >= PLATEAU_SHARE,
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
