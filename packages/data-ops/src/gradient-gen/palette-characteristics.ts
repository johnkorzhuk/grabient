/**
 * THE CHARACTERISTIC REGISTRY — one table, read by the chip row, the
 * description and the tag-search filter (D25.1).
 *
 * WHAT THIS IS. `research-colorTheory.md` is a 196-row inventory of colour
 * theory terms, each with a definition, a computable OkLCh test, a threshold
 * and a misuse note. This file is where those rows land: one entry per TERM,
 * carrying the predicate that decides it, the stricter predicate that decides
 * whether it is PROMINENT, and both rates measured over the 867-seed fixture.
 * Nothing here is a special case somewhere else — the chip row, the paragraph
 * and `/palettes/{term}` all evaluate the same closure, so a chip and its
 * destination cannot disagree about what the word means.
 *
 * WHY IT LIVES IN data-ops. The tag filter, the prose generator and the name
 * all need it, and two of those cannot import the third. Everything a
 * predicate reads is either `PaletteFeatures` (one dense pass over the applied
 * coefficients) or the rendered stops, both of which data-ops already owns.
 *
 * THE PROMINENCE RULE (D24.1). A characteristic earns a CHIP when it is
 *   (a) TRUE            — `test` fires;
 *   (b) TRUE WITH MARGIN — `strong` fires, an explicit second threshold sitting
 *       a measured distance past the first, never a fudge factor applied to a
 *       score. A palette on the boundary keeps the fact (it is still a tag and
 *       still feeds the embedding) and does not spend a chip on it;
 *   (c) DISCRIMINATING  — `strongPrevalence` under PROMINENCE_CEILING. A term
 *       true of most of the corpus tells a reader nothing they could not have
 *       guessed, which is the same argument `descriptorScore` is built on.
 * `prominentCharacteristics` applies all three and ranks what survives by
 * information content, so a palette with many striking characteristics carries
 * many chips and a plain one carries few.
 *
 * BOTH RATES ARE MEASURED, NEVER ESTIMATED. `prevalence` and
 * `strongPrevalence` are shares of the 867-seed fixture (prose-corpus.js) at
 * the default view, and palette-characteristics.test.js re-measures every one
 * of them and fails the build on drift — the contract the DESCRIPTORS registry
 * and the impression table already hold.
 *
 * HOW TO EXTEND IT. Append entries. There is no central switch: the helpers
 * walk the array, the axis is a free string (use the inventory's own domain
 * names — hue, value, chroma, temperature, harmony, contrast, gradient,
 * appearance), and a new term needs nothing but its two predicates and its two
 * measured rates. Reuse what exists rather than restating it: the detectors
 * above the table are the same functions the prose imports, and the
 * DESCRIPTORS registry is wrapped, not copied.
 *
 * WHAT WE DELIBERATELY DO NOT IMPLEMENT (D25.3). The inventory marks these as
 * not computable from diffuse colour alone. They must never ship as claims,
 * whatever a future package is tempted to do with them:
 *   - metallic       — a gonio-apparent effect: the same surface reads a
 *                      different lightness per viewing angle. A gradient has
 *                      one colour per position and no angular information.
 *   - iridescent     — thin-film interference; needs a spectral model and an
 *                      angle, not three sRGB channels.
 *   - holographic    — the same, plus a diffraction structure.
 *   - simultaneous contrast — a perceived shift caused by the SURROUND. The
 *                      surround is the visitor's page, which we do not know.
 *   - assimilation / Bezold effect — the opposite induction, and it depends on
 *                      the spatial frequency of the pattern the colours are
 *                      shown in, not on the colours.
 *   - Kelvin colour temperature — defined for illuminants on the Planckian
 *                      locus. Surface colours are not illuminants; "warm" and
 *                      "cool" here are hue-arc claims and say so.
 *   - luma / luminosity — display-encoded shorthands (Y' of a gamma-encoded
 *                      signal, and an HSL axis that is not luminance at all).
 *                      Where we mean light we compute WCAG relative luminance
 *                      or OkLCh L, and we name the one we used.
 */
import {
  colorFamily,
  hexToOkLch,
  hexToRgb,
  oklabDistance,
  relativeSaturation,
  rgbToOklab,
  type OkLch,
} from '../color-utils';
import {
  classifyStructure,
  DESCRIPTORS,
  hueBandShare,
  opposedHueMasses,
  vividHueBandShare,
  stopHasHue,
  stopSaturation,
  THRESHOLDS,
  WASH_CHROMA,
  WASH_LIGHTNESS,
  type Descriptor,
  type PaletteFeatures,
} from './palette-modifiers';

const T = THRESHOLDS;

// =============================================================================
// Detectors
//
// These moved here from apps/web/src/palette-prose.ts on 2026-08-18 (D25.1)
// WITHOUT a change of meaning: the registry has to evaluate the same closure
// the paragraph does, and two copies of "is this sepia" is exactly the drift
// this file exists to prevent. The prose imports them back.
// =============================================================================

/**
 * The ombré gate's lightness distance: corpus lightnessRange p50. An ombré is
 * a one-hue *value journey*, so it has to travel at least a median palette's
 * worth of lightness to earn the word (research-colorTheory §7).
 */
export const OMBRE_RANGE = 0.34;

/**
 * Tint/shade series tolerances, calibrated against the repo's own color space:
 * sRGB white-mixes drift OkLCh hue by up to ~22° (navy → periwinkle — the
 * Abney drift), black-mixes hold hue to <0.1° and C/L constant. So a tint
 * series tolerates 25° of drift and a shade series only 5°, and the shade
 * test may demand a near-constant C/L ratio (±20%).
 */
const TINT_DRIFT = 25;
const SHADE_DRIFT = 5;
/** Two stops are a pair; a series needs a third to be a progression. */
const MIN_SERIES_BASE = 3;
export const SERIES_POLE_CHROMA = 0.5; // pole stop must have lost half the palette's max chroma
const TINT_POLE_L = 0.85;
const SHADE_POLE_L = 0.3;
const SHADE_RATIO_TOLERANCE = 0.2;
/** Value-band edges from research-colorTheory §2: near-black / near-white. */
export const NEAR_BLACK_L = 0.18;
export const NEAR_WHITE_L = 0.87;

/**
 * The three names that are the SAME hue at a different lightness or chroma.
 *
 * research-colorTheory §1.2 measured them through this repo's own conversion:
 * brown IS orange (h 54.7), sRGB purple IS magenta (h 328.4), pink is a tint
 * region of red. The conflation law in §9 is "name by gate, never by hue
 * alone", and until this gate existed the prose said the band word whatever the
 * tone, which produced "It holds one orange and changes only how light it is"
 * over a chocolate-to-cream ramp, "The colors stay inside one range of magenta"
 * over a lavender-to-plum purple, and "It moves from red into yellow" starting
 * on a stop the corpus had just called pinkish gray.
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
 *
 * THREE CALLERS, ONE FUNCTION (D25.1). The paragraph asks it what to call the
 * ends of the ramp, the retrieval filter asks it what a SEARCH RESULT is (a
 * `blue` chip must land on palettes this function calls blue, or the chip lied
 * about where it goes), and the eleven hue-family entries in the table below
 * ask it what share of the stops answer to their word. It moved here from
 * apps/web/src/palette-prose.ts on 2026-08-18 with no change of meaning, for
 * the reason the detectors around it moved: two copies of "is this brown" is
 * the drift this file exists to prevent.
 *
 * THE NEAR-BLACK FLOOR (QA round 3, 2026-08-18). The relative reading has the
 * same blind spot at the BOTTOM of the solid that SATURATION_BRANCH_LIGHTNESS
 * records for `hasUsableHue`: as L → 0 the sRGB ceiling collapses, so any
 * residue reads as full saturation and the gate handed a family to stops a
 * viewer sees as black. Measured on the reported retrieval defect: a `magenta`
 * page ranked by family SHARE opened on a near-black aubergine-to-yellow ramp,
 * because gatedFamily called #18001e (L 0.152, C 0.073) magenta and #000020
 * (L 0.110, C 0.076) blue while the chip row refuses to NAME either. The two
 * halves of one word disagreed about what a black stop is; now they do not.
 * The floor is the repo's own near-black band edge and it only ever bites the
 * relative branch — a stop clearing FAMILY_CHROMA outright keeps its family at
 * any lightness, which is the deep-jewel case.
 */
export function gatedFamily(stop: OkLch | null): string | null {
  if (!stop) return null;
  if (stop.L < NEAR_BLACK_L && stop.C < T.FAMILY_CHROMA) return null;
  // colorFamily IS the eight-band partition (nearest of the eight anchors, whose
  // midpoints are the band edges), and it lives in color-utils because the
  // naming corpus needs it too — a name and the colour it names have to agree
  // on which family they are in. One definition, three consumers.
  const band = colorFamily(stop.h);
  if (
    band === 'orange' &&
    stop.C >= BROWN_CHROMA[0] &&
    ((stop.L < BROWN_MAX_L && stop.C <= BROWN_CHROMA[1]) ||
      (stop.L < T.LIGHT_LIGHTNESS && relativeSaturation(stop) < BROWN_MAX_SATURATION))
  )
    return 'brown';
  if (band === 'magenta' && stop.L < PURPLE_MAX_L && stop.C >= PURPLE_MIN_CHROMA)
    return 'purple';
  if (
    (band === 'red' || band === 'magenta') &&
    stop.L > PINK_MIN_L &&
    stop.C >= PINK_CHROMA[0] &&
    stop.C < PINK_CHROMA[1]
  )
    return 'pink';
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

/** Dark AND chromatic — `dark` allows gray, deep must not fire on charcoal. */
export const isDeep = (f: PaletteFeatures) =>
  f.meanLightness < 0.45 && f.meanChroma >= 0.08;

/**
 * The emerald/sapphire/ruby window: the L band matters, a neon isn't jewel.
 *
 * THE WINDOW IS A CLAIM ABOUT THE STOPS, NOT ABOUT THEIR AVERAGE (QA round 4).
 * The row's own misuse note said "the L window is what keeps a neon out" while
 * every conjunct read a palette-wide mean, and a mean has two blind spots that
 * the fixture and the render agree on:
 *  - A RAMP THAT DIES INTO WHITE. #400087 -> #e0daff is a violet ombre whose
 *    right 40% is pastel lavender (C 0.117 falling to 0.051 at L 0.905) and
 *    which is separately `fade to white`; its dark end carried the mean over
 *    both bars. So no sample may be LIGHT — the registry's own word, at its own
 *    threshold. A jewel is a saturated mid-dark colour; a light stop is a tint.
 *  - A NEON. #8d00ff and #5f00ff at C 0.294 sit inside [0.3, 0.6] on mean
 *    lightness, so the L window did not keep them out at all and `neon` and
 *    `jewel tones` chipped the same electric purples on one row. The exclusion
 *    is now stated rather than assumed, and it is the DESCRIPTOR's own test so
 *    the two words cannot drift apart.
 * Measured over the fixture: 106 -> 61 test, 47 -> 27 strong.
 */
export const isJewel = (f: PaletteFeatures) =>
  f.meanLightness >= 0.3 &&
  f.meanLightness <= 0.6 &&
  f.meanChroma >= 0.12 &&
  f.maxChroma >= 0.15 &&
  f.denseMaxLightness <= T.LIGHT_LIGHTNESS &&
  // ...AND NO DULL MEMBER (QA round 6), the symmetric half of the light-stop
  // rule above. A jewel set is emerald, sapphire, ruby: every one of them
  // saturated. The mean and the max are both carried by the loud members, so a
  // palette that is half neutral licensed the word — the filed case runs a dusty
  // teal (C 0.072) and a muddy cocoa (C 0.052) either side of a fire-engine red
  // at C 0.240, and reads as one vivid red between two greyed browns. MUTED is
  // the registry's own word for a stop like that, so the floor is
  // MUTED_CHROMA: a jewel palette may not contain a muted sample.
  f.denseMinChroma >= T.MUTED_CHROMA &&
  !NEON.test(f);

/**
 * Brown monochrome, the aged-photo look — must not fire on vivid oranges, and
 * (QA round 6) must not fire on olive or on a pale peach either.
 *
 * THE WINDOW IS THE PIGMENT, NOT THE WARM QUADRANT. The inventory's row reads
 * 50 <= h < 90 with L < 0.8, and both edges were measured to be admitting
 * something a reader would not call sepia:
 *  - h up to 90 reaches OLIVE. #a29c5c -> #a49a8c (stop hues 104/85/80/92/103/
 *    77/77, meanHue 88.2) is a khaki-to-greige ramp and it carried the word,
 *    while this repo's own corpus entry `sepia` sits at h 59.2 — 29 degrees
 *    warmer — with C 0.100 and L 0.537. Two of the eight the margin admitted
 *    were at h >= 85. The ceiling is now 80, which is the orange/yellow family
 *    boundary (FAMILY_ANCHOR_HUES: orange 53, yellow 110, midpoint 81.5), so the
 *    window is the BROWN-ORANGE band and stops where yellow begins.
 *  - L up to 0.8 reaches a pale peach: #dcaf88... measures mean L 0.784, and an
 *    aged photograph is a mid-dark print. 0.75 is the corpus anchor's own band
 *    (L 0.537) plus a comfortable margin and is the same number `earthy` uses.
 * Measured over the fixture: 9 -> 5 test, 8 -> 5 strong, and the five that
 * survive sit at meanHue 52-66, inside 14 degrees of the corpus anchor.
 */
const SEPIA_HUE: readonly [number, number] = [50, 80];
const SEPIA_MAX_L = 0.75;
export const isSepia = (f: PaletteFeatures, structure: string) =>
  structure === 'monochrome' &&
  f.meanHue >= SEPIA_HUE[0] &&
  f.meanHue < SEPIA_HUE[1] &&
  f.meanChroma >= T.CHROMA_FLOOR &&
  f.meanChroma <= 0.1 &&
  f.meanLightness < SEPIA_MAX_L;

/** One hue (or near), one direction, real lightness travel. */
export const isOmbre = (f: PaletteFeatures, structure: string) =>
  (structure === 'monochrome' || structure === 'analogous') &&
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
export const isBrilliant = (f: PaletteFeatures) =>
  f.meanChroma >= T.VIVID_CHROMA && f.meanLightness >= T.LIGHT_LIGHTNESS;

/** See grayLean: R = 0.6, a circular standard deviation of about 58°. */
const LEAN_CONCENTRATION = 0.6;

/**
 * Near-neutral with a consistent lean. Below the per-stop hue floor only the
 * aggregate is stable, and meanHue IS that aggregate: OkLab a = C·cos(h),
 * b = C·sin(h), so the chroma-weighted circular mean over the dense sample is
 * exactly atan2(b̄, ā) — the mean-vector test research-colorTheory §1.3 asks
 * for, already computed.
 *
 * D19: "is this a gray at all" is an IDENTITY question, so it takes the
 * relative reading — the same GRAYSCALE_SAT conjunct `isGrayscale` uses. The
 * palette that exposed the original bug (#ceeaff, #fcd3d4, #deffff: plainly
 * blue, pink and cyan, mean chroma 0.029) sits at 0.75 mean saturation and is
 * excluded by it; calling that a warm gray is the same mistake as calling it
 * grayscale.
 *
 * The absolute CEILING that used to sit beside it (C < CHROMA_FLOOR, from the
 * research table) came off on 2026-08-18. It was the chroma-not-saturation
 * conflation again, one layer down: a greige ramp at C 0.034 has no more
 * colour in it than one at C 0.029, and the detector was blind to it. Rate
 * over the fixture 2.0% → 3.6%. The floor at 0.008 stays: below it the mean
 * vector is numerical residue and has no lean at all.
 *
 * ...and the mean has to be a CONSENSUS. An angle exists whether or not the
 * vectors that made it agree, and where they cancel it is an artifact: a
 * lavender-white to sage-gray ramp (stop hues 303, 329, 24, 75, 97, 124, 177,
 * all under C 0.015) returns a mean of 50.8°, so the sentence read "The colors
 * are warm grays" while the same paragraph named its ends lavender and cool
 * gray and the chip row printed "cool gray". Concentration is the standard
 * circular-dispersion measure and it separates the two cases cleanly here:
 * 0.397 and 0.186 for the two leans the QA round rejected, 0.80 to 0.999 for
 * ten of the remaining eleven.
 */
export function grayLean(f: PaletteFeatures): 'warm' | 'cool' | null {
  if (f.denseMeanSaturation >= T.GRAYSCALE_SAT) return null;
  if (f.denseMeanChroma < 0.008) return null;
  if (f.hueConcentration < LEAN_CONCENTRATION) return null;
  if (f.meanHue >= 330 || f.meanHue < 120) return 'warm';
  if (f.meanHue >= 150 && f.meanHue < 300) return 'cool';
  return null;
}

/**
 * ≥85% of chromatic mass on one OkLab opponent axis (±45° around its poles).
 * ASCII hyphens on purpose: these strings reach embedText's Tags line, and the
 * en dash that reads better in a comment is banned in generated text.
 */
export function opponentAxis(f: PaletteFeatures): 'blue-yellow' | 'green-red' | null {
  if (hueBandShare(f, 45, 135) + hueBandShare(f, 225, 315) >= 0.85) return 'blue-yellow';
  if (hueBandShare(f, 315, 45) + hueBandShare(f, 135, 225) >= 0.85) return 'green-red';
  return null;
}

/**
 * Is a temperature JOURNEY something a viewer would narrate?
 *
 * Both zones occupied (Itten's cold-warm contrast, so there is a journey to
 * make) AND a hue walk that goes one way. The second half is QA round 4: a
 * palette whose hue walks 282 -> 13 -> 253 -> 135 -> 133 -> 230 -> 19, which is
 * `wavy`, carries the stored journey tag `warming` because the net of that
 * wander happens to point warm — and nobody looking at it would say it warms.
 * HUE_DIRECTION_CONSISTENCY is the repo's own bar for "this walk has a
 * direction" (|net| / travel, and it admits a fifth of the walk going
 * backwards), so the chip and the direction tags agree about what a direction
 * is. Measured: warming 89 -> 62 strong, cooling 75 -> 49.
 */
const visibleJourney = (f: PaletteFeatures) =>
  warmCoolContrast(f) && f.hueConsistency >= T.HUE_DIRECTION_CONSISTENCY;

/** Itten's cold–warm contrast: both poles PRESENT at once — not a drift. */
export const warmCoolContrast = (f: PaletteFeatures) =>
  hueBandShare(f, 330, 120) >= 0.25 && hueBandShare(f, 150, 300) >= 0.25;

/**
 * Itten's contrast of saturation: pure color beside near-gray. Two claims, and
 * the second one is about the FLOOR — 0.15 of chroma travel from 0.20 down to
 * 0.05 is a loud palette that dulls, not a pure colour set against a gray.
 *
 * It read the floor as `maxChroma - denseChromaRange` until 2026-08-18, mixing
 * a RENDERED max with a DENSE range. Since the rendered max is at or below the
 * dense max, that proxy sits at or below the true floor and admits palettes
 * whose run never comes near gray: measured over the 867-seed fixture it is
 * strictly under the real floor on 488 of them (by up to 0.054), and 7 of its
 * 92 admissions have dense floors of 0.042-0.047, i.e. visibly coloured
 * throughout. `denseMinChroma` is the same sample the range is taken from, so
 * the test is now one reading rather than two. Rate 0.1061 -> 0.098; the strong
 * band is unchanged at 28 palettes, because a run with 0.22 of chroma travel
 * had already reached gray under either reading.
 *
 * ...AND THE LOW POLE HAS TO BE A GRAY (QA round 5). Itten's sixth contrast is
 * pure colour beside DULLED colour, and a chroma reading alone cannot tell a
 * gray from a BLACK or a WHITE: both have no chroma either, and neither is a
 * dulled colour — they are the ends of the value scale, which is Itten's SECOND
 * contrast and which this registry already ships as `high-contrast`,
 * `chiaroscuro` and `fade to black`. Measured over the fixture, 20 of the 28
 * palettes in the strong band had their chroma valley at a pole: 12 below
 * L 0.18 and 8 above L 0.87. The QA rendered two of them — an apricot -> red ->
 * pure #000000 fade whose last quarter is the black plateau, and a navy ->
 * black -> red -> cream -> cyan sweep whose valley is a #0d0000 near-black —
 * and there is no dulled colour anywhere in either image; both rows were
 * separately already saying the value fact (`chiaroscuro` + `fade to black`,
 * `high-contrast`).
 *
 * The band is `fade to gray`'s own, for `fade to gray`'s own reason (its note:
 * "white and black are the ends of the gray scale and a reader calls neither of
 * them gray"), read off `chromaValleyL` — the LIGHTNESS of the very sample
 * `denseMinChroma` is the chroma of, so the two halves of the conjunct cannot
 * end up describing different samples. Measured: 85 -> 40 test, 28 -> 8 strong.
 */
export const saturationContrast = (f: PaletteFeatures) =>
  f.denseChromaRange >= 0.15 &&
  f.denseMinChroma < 0.04 &&
  f.chromaValleyL >= NEAR_BLACK_L &&
  f.chromaValleyL <= NEAR_WHITE_L;

/**
 * Which transformation relates a monochrome palette's stops. The BASE it is a
 * series of is the tone-gated word for the most chromatic sample: a monochrome
 * palette has one hue, so the paragraph must use one word for it.
 */
export type SeriesKind = 'tints and shades' | 'tints' | 'shades' | 'tones';

/**
 * The tint/shade/tone series detector (research-colorTheory §2), meaningful
 * only for monochrome structure: which transformation relates the stops. Runs
 * on the rendered stops sorted by lightness; the base is the palette's family
 * word — a transformation noun always takes "of + base", and the base must have
 * usable chroma to be named at all.
 */
export function seriesReading(
  f: PaletteFeatures,
  hexColors: readonly string[],
): SeriesKind | null {
  void f;
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

  // ...but the DRIFT walk takes the absolute reading (QA round 4), and the two
  // are answering different questions. "Is this stop part of the series" is the
  // identity question above. "Did the hue hold" is a measurement OF AN ANGLE,
  // and an angle read off a stop with no chroma left is residue: a textbook
  // crimson->white tint series (#ad1c3f -> #fffff5, C falling 0.178 -> 0.013
  // monotonically) measured 92 degrees of drift because its two whitest stops
  // report h 46.8 and h 106.6 at C 0.019 and C 0.013 - one 8-bit step near
  // white moves chroma by ~0.001, so those angles are quantization noise. They
  // are still tint stops; they are simply not evidence about the hue. Below
  // CHROMA_FLOOR the walk ignores them, which is the same argument
  // FAMILY_MIN_CHROMA records for naming a family off the saturation branch.
  const oriented = chromatic.filter((s) => s.C >= T.CHROMA_FLOOR);
  const walk = oriented.length ? oriented : chromatic;
  // ...and a series is a PROGRESSION, so it needs somewhere to progress from:
  // three stops carrying the base, not two. Ungating this function from
  // `structure === 'monochrome'` let a palette that is five pure blacks
  // between two dark browns read `shades` (the base is one stop, the rest is a
  // plateau, and `pure-black-plateau` is the fact that palette actually has).
  // Measured: the floor removes 4 of 29 readings, every one of them a palette
  // whose entire colour is one or two stops.
  if (walk.length < MIN_SERIES_BASE) return null;

  // Hue drift among chromatic stops, as max circular distance from the most
  // chromatic stop — monochrome already bounds the span, this bounds the walk.
  const baseStop = walk.reduce((a, b) => (b.C > a.C ? b : a));
  let drift = 0;
  for (const s of walk) {
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
  //
  // THE VALUE HAS TO HOLD, and 0.25 does not say that (QA round 4). The
  // inventory writes the row as "C range >= 0.06 while dL < 0.25" and that
  // window is wide enough to contain the TINT signature the same inventory
  // warns this term must not be confused with: a deep ultramarine climbing
  // L 0.416 -> 0.651 while its chroma halves cleared the old bar by 0.015 and
  // was chipped `tones` beside a registry that also called it `brightening`.
  // The bar is now the repo's own statement of "the value does not travel",
  // LOW_CONTRAST_RANGE, imported rather than invented. Measured over the
  // fixture: 15 series palettes read `tones` at 0.25 and 4 at 0.12, and the 11
  // it drops run dL 0.145-0.246 - every one of them a visible lightening or
  // darkening. The four that survive run dL 0.029-0.077.
  const cRange = maxC - Math.min(...stops.map((s) => s.C));
  const tone =
    cRange >= 0.06 &&
    top.L - bottom.L < T.LOW_CONTRAST_RANGE &&
    bottom.L > NEAR_BLACK_L &&
    top.L < NEAR_WHITE_L &&
    // ONE HUE, stated by this function rather than assumed from the caller's
    // structure classification - see the call site.
    drift <= TINT_DRIFT;

  if (tint && shade) return 'tints and shades';
  if (tint) return 'tints';
  if (shade) return 'shades';
  if (tone) return 'tones';
  return null;
}

// =============================================================================
// The registry
// =============================================================================

/**
 * Everything a predicate may read besides `PaletteFeatures`.
 *
 * Built once by `characteristicCtx` and passed to every entry, so the chip
 * row, the paragraph and the tag filter evaluate identical inputs. The two
 * derived readings (structure, tags) are computed HERE rather than accepted
 * from the caller: a caller that passed a stale structure would make the chip
 * and its destination disagree, which is the failure this registry exists to
 * make impossible.
 */
// =============================================================================
// GRADIENT and APPEARANCE detectors (research-colorTheory §7 and §8)
//
// Everything in this block answers a question about the SHAPE of the run or
// about how a viewer reads it, rather than about which colours are in it.
// =============================================================================

/** How long a pale, weak stretch has to be before it is a passage: a quarter. */
const WASH_RUN = 0.25;

/**
 * ...and how long a stretch of ONE colour has to be before it is a flat spot.
 *
 * A sixth of the ramp, which is one swatch of the default six-plus-one view: a
 * gradient that holds still for a whole swatch's worth of its length has
 * visibly stopped, and anything shorter is the ordinary slowness of a cosine
 * near its turning point.
 */
const FLAT_SPOT_RUN = 1 / 6;

/**
 * ...and how far the rest of the ramp has to travel from the plateau before the
 * plateau is a SPOT rather than the palette.
 *
 * Same argument as `hasWashRemainder`, and the same round found both: a flat
 * brown that greys over 0.03 of lightness has a "flat spot" covering a third of
 * it, and so does every other third of it — the honest words there are
 * `low-contrast` and `monochrome`. COLOR_MATCH_MAX is the corpus's own radius
 * for "as close as a stop the corpus actually calls this name" (four JND), so
 * beyond it the run has reached a colour a viewer would give a different name.
 */
const FLAT_SPOT_CONTRAST = 0.08;

/**
 * ...and a PASSAGE needs something to be a passage THROUGH (QA round 5).
 *
 * THE DEFECT. `paleRunShare` is a run length and says nothing about the rest of
 * the palette, so a uniformly pale blue-gray — every stop C 0.029-0.039 at
 * L 0.760-0.891 — measured 0.688 and was chipped `wash` beside
 * `pastel monochrome` and `high-key`: three chips for one fact, "pale and
 * weak". The word is information only where the run sits against something
 * that is NOT pale, which is the entry's own defence of itself ("the wash sits
 * between two darker ends where no palette-wide mean can find it"), and that
 * defence was never a conjunct. Measured over the fixture: 32 of the 33 rows
 * chipping `wash` also chipped pastel, high-key or light, and 10 had a pale run
 * covering 95% or more of the ramp — the "passage" being the whole thing.
 *
 * The remainder has to be outside the wash window BY A VISIBLE MARGIN, in the
 * registry's own units: 0.05 in L (the step at which two neighbouring stops
 * read as different values) or a JND of chroma at mid lightness (0.02). The
 * filed palette misses both — its darkest sample is 0.04 under WASH_LIGHTNESS
 * and its loudest is 0.02 under WASH_CHROMA.
 */
const hasWashRemainder = (f: PaletteFeatures) =>
  f.denseMinLightness <= WASH_LIGHTNESS - 0.05 || f.maxChroma >= WASH_CHROMA + 0.02;

/**
 * A hard break between two neighbouring swatches, in OkLab distance.
 *
 * research-colorTheory §7: adjacent-stop distance under 0.02 (about one JND)
 * makes neighbours indistinguishable, over 0.15 makes the step visible as a
 * band. BOTH numbers describe the RENDERED view and nothing else — see the
 * `banding` row for the measurement that keeps them off the chip row.
 */
const BANDING_STEP = 0.15;
const INDISTINCT_STEP = 0.02;

/**
 * Does the lightness BEND UPWARD — a peak with both ends below it?
 *
 * MIDDLE_END_DROP is imported rather than restated: it is the share of the
 * palette's own range the weaker end has to fall before "brighter in the
 * middle" is a shape rather than a rounding, and `bright-middle` measured it.
 */
const arches = (f: PaletteFeatures) =>
  f.denseMaxLightness - Math.max(f.denseFirstLightness, f.denseLastLightness) >=
  T.MIDDLE_END_DROP * f.denseLightnessRange;

/** The widest OkLab jump between two neighbouring rendered stops. */
export function maxAdjacentStep(colors: readonly string[]): number {
  const lab = colors.map((hex) => {
    const { r, g, b } = hexToRgb(hex);
    return rgbToOklab(r, g, b);
  });
  let worst = 0;
  for (let i = 1; i < lab.length; i++) {
    const d = oklabDistance(lab[i - 1]!, lab[i]!);
    if (d > worst) worst = d;
  }
  return worst;
}

/**
 * Where a gradient-map ramp has to reach. A gradient map recolours an image BY
 * VALUE, so the ramp has to have a value to be indexed by: it must run
 * monotonically (`turns === 0`) and cover the tonal range at both ends, or the
 * image's shadows and highlights land on the same colour as its midtones.
 * 0.3/0.7 is the bar; PLATEAU_SHARE keeps out ramps that answer the coverage
 * question by clamping, where a tenth of the input range maps to one flat
 * corner of the gamut and the detail in it is gone.
 */
const MAP_SHADOW_L = 0.3;
const MAP_HIGHLIGHT_L = 0.7;

const mapsTonalRange = (f: PaletteFeatures, shadow: number, highlight: number) =>
  f.turns === 0 &&
  f.denseMinLightness <= shadow &&
  f.denseMaxLightness >= highlight &&
  f.allBlackShare < T.PLATEAU_SHARE &&
  f.allWhiteShare < T.PLATEAU_SHARE;

/**
 * The last stop of the run — where every "fades to X" claim is decided.
 *
 * The fallback is unreachable (a rendered palette has at least three stops) and
 * is black rather than white on purpose: black is outside the value band
 * `fade to gray` requires, so an empty run cannot talk its way into the term.
 */
const endStop = (ctx: CharacteristicCtx) => ctx.colors[ctx.colors.length - 1] ?? '#000000';

/** The rendered ends' chroma — what a reader compares when a chip says a
 * palette saturates or fades. */
const startChroma = (ctx: CharacteristicCtx) => ctx.stops[0]?.C ?? 0;
const endChroma = (ctx: CharacteristicCtx) => ctx.stops[ctx.stops.length - 1]?.C ?? 0;

/**
 * ...and the same two ends read as SATURATION, which is a different question
 * (QA round 5, D19's rule applied to a trajectory for the first time).
 *
 * THE DEFECT. A pure blue-channel ramp, #00000d -> #0037d3, gains 0.093 of
 * chroma and was chipped `saturating` — but it gains that chroma only because
 * it gains 0.190 of LIGHTNESS, which is what enlarges the gamut it is climbing
 * inside. Every one of its stops sits at essentially the same fraction of the
 * chroma its own lightness allows (relative-saturation trend -0.008), so what
 * a viewer sees is a ramp brightening, and `brightening` is separately true of
 * it. Chroma and saturation are two readings of the same axis and the repo's
 * rule (D19) is that identity questions take the relative one: "is this colour
 * getting stronger" is exactly that question, because the near-black end has no
 * room to be strong in absolute terms whatever its purity.
 *
 * So the trajectory keeps its absolute trend (it is the shape of the run, and
 * it is what the indexed DESCRIPTOR means) and the ENDS now have to agree on
 * BOTH readings. Measured over the fixture: `saturating` 199 -> 159 test and
 * 76 -> 66 strong, `desaturating` 152 -> 113 and 47 -> 32. Of the removals, 31
 * and 35 respectively are palettes whose relative saturation moves the OTHER
 * WAY from their chroma — the ones where the lightness ramp is doing the work.
 */
const startSaturation = (ctx: CharacteristicCtx) =>
  ctx.stops[0] ? relativeSaturation(ctx.stops[0]) : 0;
const endSaturation = (ctx: CharacteristicCtx) =>
  ctx.stops[ctx.stops.length - 1] ? relativeSaturation(ctx.stops[ctx.stops.length - 1]!) : 0;

/** Has the run's last stop run out of colour as well as run out of darkness? */
const endsWhite = (ctx: CharacteristicCtx) =>
  (ctx.stops[ctx.stops.length - 1]?.C ?? 1) < T.CHROMA_FLOOR;

/**
 * The end-ward chroma death every fade shares (research-colorTheory §7:
 * "chroma or value dying toward an end"). TRAJECTORY_DELTA is the registry's
 * own bar for a nameable chroma move and the inventory's fade threshold is the
 * same 0.04, so `fade to …` is `desaturating` plus a destination.
 *
 * DIRECTION IS BUILT IN, not asserted: chromaTrend is the second half minus the
 * first, so it is negative only when the colour dies TOWARD the end. The
 * mirrored palette (pale start, colour arriving) is `saturating`, and the
 * inventory's own note says that one is spoken as "emerges from", never as a
 * fade.
 */
const fading = (f: PaletteFeatures) => f.chromaTrend < -T.TRAJECTORY_DELTA;

export interface CharacteristicCtx {
  /** The rendered stops in ramp order — the tone the visitor actually sees. */
  colors: readonly string[];
  /**
   * ...the same stops in OkLCh, parsed once.
   *
   * Thirty-seven hue-name entries and five value-band entries walk them, and
   * doing the conversion inside each predicate turned one `characteristicsOf`
   * call into several hundred `hexToOkLch` calls over the same seven strings.
   */
  stops: readonly OkLch[];
  /**
   * What `gatedFamily` calls each of those stops, or null where it refuses to
   * name one. Computed here for the same reason `stops` is, and because it is
   * exactly the array `tag-search`'s family route builds for a search result:
   * one function, one reading, on both sides of a family chip.
   */
  families: readonly (string | null)[];
  /** `classifyStructure(f)`: the one exclusive hue geometry. */
  structure: string;
  /** `modifierTags(f)`: every DESCRIPTOR that fired, by tag word. */
  tags: readonly string[];
  /** The monochrome series reading, or null. */
  series: SeriesKind | null;
  /**
   * The STORED temperature-journey tag (palette-tags' `journey`), never
   * recomputed — D25.2 is explicit that this one is read, not re-derived,
   * because the stored value is what the Vectorize index was built from.
   */
  journey: 'warming' | 'cooling' | null;
  /**
   * The widest OkLab jump between two neighbouring RENDERED stops.
   *
   * Computed once here rather than inside the two predicates that read it,
   * because it is the only fact in this object that depends on the step count
   * the visitor chose — keeping it beside `colors` is the reminder. Measured
   * cost at 7 stops: 3.7 us of the 20.8 us this constructor takes, against a
   * 113.8 us `paletteFeatures` pass, which matters because the tag route runs
   * this per over-fetched candidate (D22.5).
   */
  adjacentStep: number;
}

/** Optional facts the caller already holds; everything else is derived. */
export interface CharacteristicCtxInput {
  journey?: 'warming' | 'cooling' | null;
}

export function characteristicCtx(
  f: PaletteFeatures,
  colors: readonly string[],
  input: CharacteristicCtxInput = {},
): CharacteristicCtx {
  const structure = classifyStructure(f);
  const stops = colors.map(hexToOkLch);
  return {
    colors,
    stops,
    families: stops.map(gatedFamily),
    structure,
    tags: DESCRIPTORS.filter((d) => d.test(f)).map((d) => d.word),
    // THE SERIES SPEAKS FOR ITSELF (QA round 4). This used to be gated on
    // `structure === 'monochrome'`, i.e. on a second and looser opinion about
    // whether the palette has one hue, and the two could disagree: a crimson
    // ramp whose stops run one hue from L 0.49 to pure white classified
    // `multicolor` because hueSpan 109.4 counts the residual angles of its two
    // whitest stops, so the single most nameable fact about it - that it is a
    // TINT SERIES - was unreachable. Each of the three readings now carries its
    // own hue gate (tint and tone at TINT_DRIFT, shade at SHADE_DRIFT), which
    // is the same claim measured on the stops that carry chroma instead of on
    // the dense hue span. Measured over the fixture: 15 -> 25 palettes get a
    // series reading, and every one of the 10 added is a one-hue value or
    // chroma journey the structure ladder had called analogous or multicolor.
    series: seriesReading(f, colors),
    journey: input.journey ?? null,
    adjacentStep: maxAdjacentStep(colors),
  };
}

// =============================================================================
// HUE NAMES (research-colorTheory §1.1, §1.2) — PACKAGE D-A
// =============================================================================

/**
 * How wide a name's arc is, either side of its anchor.
 *
 * The inventory's central finding about the extended names is that they are
 * "anchor + tone gate, not new bands": brown IS orange at h 54.7, olive IS
 * yellow at 109.8, navy IS blue at 264.1. So a name window has to be NARROWER
 * than the eight-band family it sits inside — otherwise the name is just the
 * family word again — while still being wide enough that a stop a couple of
 * JND off the anchor is still called by its name. The eight bands run 42.5° to
 * 61° wide (mean 45), so ±15 is a third of a family: an intermediate name is a
 * refinement of its family, never a rename of it.
 *
 * Swept over the fixture (strong count at half-width 10 / 12 / 15 / 18 / 22):
 * rose 40/51/66/89/109, navy 33/36/36/37/39, turquoise 13/16/20/27/39,
 * lavender 5/11/15/17/23. No cliff anywhere — the curve is smooth in every
 * name, which is what says the choice is a resolution decision and not a
 * threshold fitted to the corpus.
 */
export const HUE_NAME_HALF = 15;

/**
 * How much of the ramp has to answer to a hue name before the name is PROMINENT.
 *
 * Two bars, because the two questions are different (D24.1). The palette
 * CONTAINS the colour — the plain bar — is exactly what `tag-search`'s family
 * route already admits (`hits > 0`, then ranked by share), so a hue-name chip's
 * page can never fail to contain the palette that emitted it. The palette is
 * MADE of the colour is the chip bar, and 0.25 is two stops of the default
 * seven: one stop of seven is a colour the ramp passes through, two is a band
 * you can point at.
 *
 * STEP DEPENDENCE, RECORDED. A share over the RENDERED stops moves with the
 * viewer's step count, and the site's contract is to classify at the palette's
 * own stored steps (tag-search's `paletteFacts` comment), so a chip and its
 * destination always agree even though the fixture number is a 7-step number.
 * Measured drift in the strong count, 7 → 13 → 48 samples: red 145/102/117,
 * blue 210/165/184, navy 36/17/23, azure 73/63/68. The 13-step figure is lower
 * throughout because the quantum moves against the bar (4/13 = 0.308 against
 * 2/7 = 0.286), not because the phenomenon changed; the 48-sample figure is the
 * limit and it sits between the two.
 */
export const HUE_NAME_SHARE = 0.25;

/** Circular distance between two hue angles, degrees. */
const arcDistance = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/**
 * One extended hue name: an anchor plus the L and C window that separates it
 * from every other name at the same anchor.
 *
 * `implies` records the eight-band family the name refines, and ONLY where the
 * fixture says the family word is true of every palette the name is strong on
 * (measured share 1.00). Terracotta, rust, sand, olive, chartreuse and mint
 * measure 0.92-0.95 and are deliberately left without one: a 95% implication is
 * not an implication, it is an overlap, and the display layer already treats
 * undeclared overlap as its own problem. Nothing implies another INTERMEDIATE
 * even where the fixture allows it — `maroon` measures 1.00 inside `rust` over
 * nine palettes, and maroon's chroma window is open above 0.17 where rust's is
 * closed, so the fixture agreement is a coincidence of this corpus rather than
 * an entailment.
 */
export interface HueNameGate {
  term: string;
  /** The anchor angle, measured through this repo's own `hexToOkLch`. */
  anchor: number;
  /** Lightness window, inclusive. */
  lightness: readonly [number, number];
  /** Chroma window, inclusive. Absolute, because these are LOUDNESS gates: */
  chroma: readonly [number, number];
  implies?: readonly string[];
  note?: string;
}

/**
 * The extended-name table, verbatim from research-colorTheory §1.2.
 *
 * ABSOLUTE CHROMA, NOT SATURATION, on purpose (D19). The relative reading is
 * the right one for "is there any colour here" — which is why `gatedFamily`
 * and `stopHasHue` take it — but every window below is a claim about HOW MUCH
 * colour: a teal is a cyan with its chroma held down (0.06-0.12) and a
 * turquoise is the same hue with it let up, and relative saturation cannot tell
 * those apart because it divides both by the same ceiling. The three names that
 * ARE identity questions rather than loudness ones — brown, purple, pink — are
 * not in this table at all: they are `gatedFamily`'s own rungs and the registry
 * reads them from there, so there is exactly one definition of brown.
 *
 * INDIGO IS ABSENT and that is the inventory's finding, not an omission: web
 * `#4b0082` measures h 301.7, past violet, i.e. a dark purple, which
 * contradicts its spectral blue-violet position near 279. Anchoring the word at
 * either value names something the other value calls wrong, so the word is
 * accepted as an inbound search synonym and never emitted.
 */
export const GATED_HUE_NAMES: readonly HueNameGate[] = [
  { term: 'rose', anchor: 2.5, lightness: [0, 1], chroma: [0.1, 1] },
  { term: 'crimson', anchor: 20, lightness: [0, 0.65], chroma: [0.15, 1], implies: ['red'] },
  { term: 'maroon', anchor: 29, lightness: [0, 0.42], chroma: [0.1, 1], implies: ['red'] },
  { term: 'salmon', anchor: 28, lightness: [0.68, 1], chroma: [0.1, 0.18] },
  { term: 'coral', anchor: 40, lightness: [0.68, 1], chroma: [0.13, 1] },
  { term: 'terracotta', anchor: 33, lightness: [0.45, 0.7], chroma: [0.1, 0.17] },
  { term: 'rust', anchor: 40, lightness: [0, 0.55], chroma: [0.1, 0.17] },
  { term: 'ochre', anchor: 60, lightness: [0.55, 0.7], chroma: [0.1, 0.16], implies: ['orange', 'yellow'] },
  { term: 'peach', anchor: 58, lightness: [0.82, 1], chroma: [0.05, 0.1], implies: ['orange'] },
  { term: 'amber', anchor: 81, lightness: [0.75, 0.88], chroma: [0.14, 1], implies: ['orange', 'yellow'] },
  {
    term: 'gold',
    anchor: 95,
    lightness: [0.8, 0.92],
    chroma: [0.14, 1],
    implies: ['yellow'],
    note: 'Names the HUE only. The metallic claim is forbidden (D25.3): a metal is gonio-apparent and a gradient has no viewing angle.',
  },
  { term: 'sand', anchor: 98, lightness: [0.8, 1], chroma: [0.05, 0.12] },
  { term: 'mustard', anchor: 98, lightness: [0.7, 0.8], chroma: [0.12, 0.18], implies: ['orange', 'yellow'] },
  {
    term: 'olive',
    anchor: 110,
    lightness: [0, 0.65],
    chroma: [0.06, 0.14],
    note: 'Dark yellow — the same hue as yellow, held down in both L and C. Never a name for a vivid yellow-green.',
  },
  {
    term: 'chartreuse',
    anchor: 136,
    lightness: [0.8, 1],
    chroma: [0.18, 1],
    note: 'The inventory\'s trap: OkLCh puts chartreuse at 136, beside green, NOT midway between yellow and green where the RYB wheel imagines it.',
  },
  { term: 'spring green', anchor: 151, lightness: [0.8, 1], chroma: [0.15, 1], implies: ['green'] },
  { term: 'mint', anchor: 165, lightness: [0.65, 1], chroma: [0.08, 0.15] },
  { term: 'turquoise', anchor: 185, lightness: [0.7, 1], chroma: [0.1, 1], implies: ['cyan'] },
  {
    term: 'teal',
    anchor: 195,
    lightness: [0, 0.6],
    chroma: [0.06, 0.12],
    implies: ['cyan'],
    note: 'The same hue as cyan, darker and duller — the L and C gates are the whole word. A bright cyan is not a teal.',
  },
  { term: 'sky', anchor: 226, lightness: [0.75, 1], chroma: [0.05, 0.1] },
  { term: 'cerulean', anchor: 232, lightness: [0.45, 0.65], chroma: [0.09, 1] },
  { term: 'azure', anchor: 256, lightness: [0, 1], chroma: [0.12, 1], implies: ['blue'] },
  {
    term: 'navy',
    anchor: 264,
    lightness: [0, 0.35],
    chroma: [0.08, 1],
    implies: ['blue'],
    note: 'Dark blue — the same hue as blue. The gate is the word.',
  },
  { term: 'ultramarine', anchor: 274, lightness: [0, 0.55], chroma: [0.2, 1], implies: ['blue'] },
  { term: 'periwinkle', anchor: 285, lightness: [0.8, 1], chroma: [0.04, 0.1], implies: ['violet'] },
  { term: 'lavender', anchor: 308, lightness: [0.65, 1], chroma: [0.08, 0.16] },
];

/** Does this stop answer to the name? */
export const hueNameFits = (g: HueNameGate, stop: OkLch): boolean =>
  arcDistance(stop.h, g.anchor) <= HUE_NAME_HALF &&
  stop.L >= g.lightness[0] &&
  stop.L <= g.lightness[1] &&
  stop.C >= g.chroma[0] &&
  stop.C <= g.chroma[1];

/** ...and what share of the ramp does. */
export const hueNameShare = (stops: readonly OkLch[], g: HueNameGate): number =>
  stops.length ? stops.filter((s) => hueNameFits(g, s)).length / stops.length : 0;

/**
 * Share of the ramp that `gatedFamily` calls this word — the same count
 * `tag-search`'s family route ranks its results by, so the eleven family terms
 * and the eleven family PAGES read one number.
 */
export const familyShare = (
  families: readonly (string | null)[],
  word: string,
): number => (families.length ? families.filter((f) => f === word).length / families.length : 0);

// =============================================================================
// VALUE BANDS (research-colorTheory §2)
// =============================================================================

/**
 * The five value-scale bands, edges measured against this repo's conversion:
 * `#101010` → L 0.173, `#404040` → 0.371, `#808080` → 0.600, `#c0c0c0` → 0.808,
 * `#e0e0e0` → 0.907. The interior edges align with the registry's own means
 * (DARK_LIGHTNESS 0.42, LIGHT_LIGHTNESS 0.8).
 *
 * The bands are PER-STOP, which is what makes them different from `dark` and
 * `light` — those are palette means, and a palette whose mean is a midtone can
 * still have both a near-black and a near-white in it. The inventory splits the
 * five in two: near-black and near-white are ENDPOINT claims (does the run
 * reach the band), the three interior ones are CONTAINMENT claims (does the
 * whole run live in it).
 */
export const VALUE_BANDS = {
  nearBlack: NEAR_BLACK_L,
  shadow: 0.42,
  midtone: 0.7,
  highlight: NEAR_WHITE_L,
} as const;

/**
 * ...and the reserve for the words BLACK and WHITE themselves, which the
 * inventory keeps well clear of the near- bands: L < 0.08 and L > 0.95. They
 * are the margin bands of `near-black` and `near-white` for exactly that
 * reason — "comfortably past the threshold" here has a name in the theory
 * already, so the margin is not a number invented for the purpose.
 */
const BLACK_L = 0.08;
const WHITE_L = 0.95;

/**
 * How far inside a value band the whole run must sit before the containment
 * claim is more than an accident of where the edges fall. 0.03 in OkLCh L is
 * under the ~0.05 step at which two neighbouring stops read as different
 * values, so a run clearing it is inside the band by a visible margin without
 * the margin swallowing the band (the highlight band is only 0.17 wide).
 * Measured: shadow 6 → 2, midtone 43 → 15, highlight 25 → 7.
 */
const BAND_CLEARANCE = 0.03;

const minL = (ctx: CharacteristicCtx) => Math.min(...ctx.stops.map((s) => s.L));
const maxL = (ctx: CharacteristicCtx) => Math.max(...ctx.stops.map((s) => s.L));

/**
 * How high the run reaches AT THE WHITE END — the lightness of its lightest
 * stop, or 0 when that stop is a colour rather than a white (QA round 4).
 *
 * `near-white` is the only value band whose word is also a colour identity, and
 * read as pure value it lied: the lightest stop of a violet-to-lime rainbow is
 * #e1ffa0 at L 0.957 and C 0.124, a pale LIME, and the row printed `near-white`
 * about it. D19 settles which reading a term takes — "is there colour here" is
 * an identity question — and the fixture says the same about the destination:
 * 14 of the 24 palettes on page 1 of /palettes/near-white had their lightest
 * stop above C 0.04, so the chip and its page were wrong together.
 *
 * ABSOLUTE chroma, and this is the end of the solid where that is the honest
 * reading rather than the lazy one: as L -> 1 the sRGB ceiling collapses toward
 * zero, so ANY residue measures near 100% saturation and the relative reading
 * calls every off-white a colour. It is the argument FAMILY_MIN_CHROMA already
 * records for naming a family off a near-white stop, one threshold up.
 * CHROMA_FLOOR is the repo's own "there is chroma here" line, and at the top of
 * the solid it separates cleanly: kept, #fffcff #fffaf8 #fffff5 #fff8ec
 * #eefaff #dcf2ff (C 0.005-0.029); refused, #ffe6aa #adffff #ffffd1 #ffff8a
 * #fffe35 (C 0.059-0.199), which are a cream, an aqua, a cream, a butter and a
 * fluorescent yellow. Measured over the fixture: 339 -> 70 test, 112 -> 42
 * strong.
 */
const whitePole = (ctx: CharacteristicCtx) => {
  const top = ctx.stops.reduce((a, b) => (b.L > a.L ? b : a));
  return top.C < T.CHROMA_FLOOR ? top.L : 0;
};
const inBand = (ctx: CharacteristicCtx, lo: number, hi: number, clear = 0) =>
  ctx.stops.length > 0 && ctx.stops.every((s) => s.L >= lo + clear && s.L < hi - clear);

/**
 * Chiaroscuro: dark-dominant modelling with a strong light-dark contrast — the
 * Caravaggio arrangement, not merely "dark" and not merely "high contrast".
 *
 * The inventory files it as art-historical and recommends against it in PROSE
 * (D20.3's jargon ban), and it ships HERE because a chip is a label carrying
 * theory vocabulary rather than a sentence (D24.4). Its range test is exactly
 * HIGH_CONTRAST_RANGE and the fixture confirms the entailment — all 28 palettes
 * that satisfy it also carry the `high-contrast` tag — so it declares it and
 * silences it rather than printing the same fact twice. It does NOT imply
 * `dark`: half of them (14 of 28) sit between DARK_LIGHTNESS and 0.5, which is
 * the difference between "this palette is dark" and "this palette is mostly
 * dark with light cut into it".
 */
export const isChiaroscuro = (f: PaletteFeatures) =>
  f.meanLightness < 0.5 && f.lightnessRange > T.HIGH_CONTRAST_RANGE;

export interface Characteristic {
  /** The word a chip prints and `/palettes/{slug}` filters on. */
  term: string;
  /**
   * The inventory domain it comes from — hue, value, chroma, temperature,
   * harmony, contrast, gradient, appearance — or, for the terms wrapped off
   * the older DESCRIPTORS registry, that registry's own axis. A free string on
   * purpose: a new domain must not require an edit to a union type here.
   */
  axis: string;
  /** TRUE of this palette. */
  test: (f: PaletteFeatures, ctx: CharacteristicCtx) => boolean;
  /**
   * TRUE WITH MARGIN — comfortably past the threshold rather than sitting on
   * it (D24.1b). It MUST imply `test`, and the suite asserts that over the
   * whole fixture; the wrapped entries get it for free (see `wrap`) and the
   * hand-written ones restate their own gate. Omitted only where "true" and
   * "prominent" genuinely coincide — an exact coefficient guarantee, a stored
   * tag — which is itself a claim the two recorded rates have to back up.
   */
  strong?: (f: PaletteFeatures, ctx: CharacteristicCtx) => boolean;
  /** Measured share of the 867-seed fixture where `test` fires. */
  prevalence: number;
  /** ...and where `strong` fires. Never estimated. */
  strongPrevalence: number;
  /** Terms this one shadows: saying both spends a chip twice. */
  implies?: readonly string[];
  /**
   * TRUE = registry, tags, embedding and `/palettes/{term}` — but never a chip.
   *
   * Three kinds of term end up here, and none of them is held back for being
   * RARE or for being jargon (D24.4 puts the theory's own vocabulary on the
   * chips deliberately):
   *
   *  - NOT A FACT ABOUT THE IMAGE. `unclipped` and `flat-channel` are
   *    coefficient guarantees, `wcag-aa`/`wcag-aaa` are ratios for a text
   *    pairing, `banding`/`smooth` are claims about the step count the visitor
   *    happens to be viewing (the inventory's own note: "always qualify (at N
   *    steps)"). A visitor clicking one of these gets palettes that share
   *    something they cannot see, which fails the owner's bar for a chip.
   *  - THE RESIDUAL CLASS. `multicolor` and `polychromatic` are what is left
   *    when nothing fits, so by construction they never pop out (D24.3).
   *  - THE MEASUREMENT'S SPELLING RATHER THAN THE DESIGNER'S WORD. The arc
   *    language (`quarter-wheel`, `half-wheel`, `near-full-circle`,
   *    `full-wheel`), the signed hue-direction tags and the opponent axes are
   *    how this codebase MEASURES hue geometry; `analogous`, `rainbow`,
   *    `complementary` and the hue names are how the inventory and a visitor
   *    NAME the same geometry, and they are chips. research-colorTheory's own
   *    destination column agrees: those rows are marked feature/emb/prose and
   *    never as a label.
   *
   * Held back this way the term still rides the embedding, still answers
   * `/palettes/{term}` with a deterministically filtered page, and is still
   * measured by the suite. It just never takes a slot from a fact a reader can
   * point at.
   */
  tagOnly?: boolean;
  /** Why the thresholds are where they are, or what the term must not claim. */
  note?: string;
}

/**
 * How discriminating a term must be to spend a chip (D24.1c).
 *
 * The same 60% the DESCRIPTORS registry has always used for its information
 * band: a fact true of two palettes in three is not a characteristic of this
 * one. It is applied to the STRONG rate, because that is the population a chip
 * is actually drawn from.
 */
export const PROMINENCE_CEILING = 0.6;

/** Size of the fixture every rate in this file was measured over. */
export const FIXTURE_SEEDS = 867;

/** Results one page of `/palettes/{term}` shows. */
export const TAG_PAGE_SIZE = 24;

/**
 * ...and how much of the corpus a term must be TRUE of before it may spend a
 * CHIP (D25.6, QA round 6's critical finding).
 *
 * A chip is a LINK. Its page is 24 slots filled from a pool the retrieval layer
 * hands us, and `applyTagFilter` ranks the palettes that satisfy the term to the
 * top of that pool — so however good the filter is, page 1 can hold no more
 * matching palettes than the corpus contains. A term true of 9 palettes in 867
 * has a ceiling of 9/24 = 38% and the rest of the page is, by construction,
 * palettes the word is false of. Measured through the real path (recognizer,
 * expansion, over-fetch, filter) against a production-size pool: `shades`
 * (1 of 867) returned 1 match in 24, `sepia` (9) returned 3, `warm gray` (9)
 * returned 1, `tints` (21) returned 1. The filter is not at fault and neither is
 * the predicate — page 1 of a rare term is mostly fallback because there is
 * nothing else to put there.
 *
 * So the floor is ONE PAGE: a term is chip-eligible when the fixture holds at
 * least `TAG_PAGE_SIZE` palettes it is true of. Below it the term keeps
 * everything else it had — it is still measured, still published in
 * `/{seed}.json`, still ridden by the embedding, still answers its own URL with
 * a deterministically filtered page — and simply never becomes a link a visitor
 * is invited to follow. This is exactly the disposition D25.6 prescribes ("hold
 * it back as a tag/embed value instead") and it is what D25.4 means by keeping
 * the rare harmonies "in with their measured near-zero rates recorded".
 *
 * It is deliberately a bar on PREVALENCE (the `test` rate) and not on
 * `strongPrevalence`: the page filters on `test`, so `test` is what decides how
 * many palettes the destination can find. The margin decides whether the CHIP
 * is honest; this decides whether the LINK is.
 *
 * Terms it holds back, measured over the fixture (support in palettes):
 *   shades 1 · solid 1 · repeating 1 · triadic 1 · split complementary 0 ·
 *   square 0 · tetradic 0 · discord 0 · extension contrast 3 · tones 5 ·
 *   shadow band 6 · pure-white-plateau 6 · sepia 9 · warm gray 9 ·
 *   fade to white 10 · fade to gray 10 · fade to black 12 · cool gray 16 ·
 *   grayscale 19 · brilliant 19 · mustard 19 · tints 21 ·
 *   pure-black-plateau 21 · duotone gradient 21
 */
export const CHIP_SUPPORT_FLOOR = TAG_PAGE_SIZE / FIXTURE_SEEDS;

/**
 * Self-information in bits. A rate of zero means "rarer than one seed in the
 * fixture", not "impossible" — the editor reaches states the live sitemap
 * never sampled — so one seed's worth of probability is the floor, the same
 * convention the impression table uses.
 */
export function characteristicScore(c: Characteristic, plain = false): number {
  return -Math.log2(
    Math.max(plain ? c.prevalence : c.strongPrevalence, 1 / FIXTURE_SEEDS),
  );
}

const fires = (c: Characteristic, f: PaletteFeatures, ctx: CharacteristicCtx) =>
  c.test(f, ctx);

const firesStrong = (c: Characteristic, f: PaletteFeatures, ctx: CharacteristicCtx) =>
  c.test(f, ctx) && (c.strong ? c.strong(f, ctx) : true);

/** Every term that is TRUE of this palette, in registry order. */
export function characteristicsOf(
  f: PaletteFeatures,
  ctx: CharacteristicCtx,
): Characteristic[] {
  return CHARACTERISTICS.filter((c) => fires(c, f, ctx));
}

/**
 * The chip row's candidates: TRUE, with MARGIN, and DISCRIMINATING, ranked by
 * information content and deduped against the terms they imply.
 *
 * The dedupe is the first cut of D25.5 — a term drops out when another
 * surviving term names it in `implies`, so `neon` silences `vivid` and
 * `autumn` silences `earthy`/`muted`/`warm` rather than printing the same fact
 * at two levels of generality. Overlap between terms that do NOT declare an
 * implication is the display layer's problem, not the registry's.
 */
export function prominentCharacteristics(
  f: PaletteFeatures,
  ctx: CharacteristicCtx,
  limit = CHARACTERISTICS.length,
): Characteristic[] {
  const strong = CHARACTERISTICS.filter(
    (c) => c.strongPrevalence <= PROMINENCE_CEILING && firesStrong(c, f, ctx),
  ).sort((a, b) => characteristicScore(b) - characteristicScore(a));
  // Shadowed by EVERY firing term, not only by the ones that outrank it.
  //
  // This used to walk in rank order and let the survivor do the shadowing, on
  // the argument that the rarer term is always the more specific one. That
  // argument is false and the fixture says where: `high-key` (78 palettes) is
  // strictly `light` (73) plus a compressed range, so the entailment runs from
  // the COMMONER term to the rarer one, and rank-order shadowing printed both.
  // An implication is a statement that A's truth makes B's redundant, which
  // does not depend on how the corpus happens to be shaped, so it is applied
  // before the walk. The limit still applies after the dedupe: a caller asking
  // for three gets three distinct facts rather than three slots two of which
  // restate each other.
  const shadowed = impliedBy(strong);
  return strong.filter((c) => !shadowed.has(c.term)).slice(0, limit);
}

/** Every term the firing set already says by implication. */
const impliedBy = (firing: readonly Characteristic[]): Set<string> =>
  new Set(firing.flatMap((c) => c.implies ?? []));

/**
 * MEASURED NEAR-SYNONYMS: two terms from different domains whose STRONG
 * populations are more shared than not (D25.5's third dedupe).
 *
 * `implies` cannot express these — neither term is a special case of the other,
 * they are two vocabularies pointing at one phenomenon — so the overlap is
 * measured instead of declared. Method: Jaccard of the two strong sets over the
 * 867-seed fixture, every chip-eligible pair with at least 5 strong palettes
 * each. Only four pairs reach 0.6, and 0.6 is the bar because at that overlap
 * each set is about three quarters inside the other, which is a visitor reading
 * one fact twice rather than two facts about one palette:
 *
 *   0.857  rainbow ~ near-full-circle      0.712  ramp ~ brightening
 *   0.667  full-wheel ~ near-full-circle   0.633  rainbow ~ full-wheel
 *
 * Three of the four are the arc language against the harmony word, and they are
 * settled a level up: `near-full-circle` and `full-wheel` are `tagOnly`, so
 * only `rainbow` was ever going to reach a row. One group is left, and its
 * representative is EDITORIAL - the one place in this file where the rarer term
 * does not automatically win. `ramp` is the shape (58.6% of the corpus has no
 * turning point, 1.7 bits, which says nothing); `brightening` is what a reader
 * sees the shape DOING.
 *
 * The next pairs down are 0.557 (light ~ high-key) and 0.543 (pastel ~ wash),
 * and both survive as two chips on purpose: high-key adds a compressed range to
 * `light`, and `wash` is a run of the palette rather than its average.
 */
export const SYNONYM_GROUPS: readonly {
  keep: string;
  drop: readonly string[];
  jaccard: number;
}[] = [{ keep: 'brightening', drop: ['ramp'], jaccard: 0.712 }];

/**
 * ...and the pairs whose CONJUNCTION states a third term (QA round 5).
 *
 * `implies` is a statement about one term; this is a statement about two said
 * together, which the row can make because it prints COMPOUNDS. The case that
 * filed it: `ombre` is `(monochrome | analogous) AND turns === 0 AND
 * lightnessRange >= OMBRE_RANGE`, and `brightening` is that lightness travel
 * (it implies `ramp`, which IS turns === 0) — so a row printing
 * "brightening monochrome" and then "ombre" has asserted the three conjuncts
 * and then named their conjunction, two chips for one fact. Measured over the
 * fixture: 9 rows print a {journey} {structure} compound and 3 of those also
 * print `ombre`.
 *
 * Deliberately small and deliberately declarative. It is not a general
 * inference engine over the predicates — nothing here can read a closure — it
 * is the list of pairs somebody has checked by hand and written down, exactly
 * as `implies` is.
 */
/**
 * HOW MANY PALETTES EACH COMPOUND IS ACTUALLY TRUE OF — measured, not estimated.
 *
 * A compound chip is a link like any other, so CHIP_SUPPORT_FLOOR's argument
 * applies to it: `/palettes/bright-middle-complementary` has 24 slots, and if
 * only four palettes in the whole corpus satisfy both halves then twenty of
 * those slots cannot be what the label says. QA round 6 measured that page
 * through the real path — ranks 4-12 complementary but not bright-middle, ranks
 * 13-24 bright-middle but not complementary, 21 of 24 slots one-part matches.
 *
 * WHY A TABLE AND NOT THE ESTIMATE. `compoundLabels` used to price a pair as
 * -log2(pa) + -log2(pb), i.e. under INDEPENDENCE, and refuse the pairs whose
 * expected population fell under one palette. Independence is the wrong model
 * here and the fixture says by how much in both directions: `bright-middle
 * complementary` estimates 1.65 palettes and has 4, while `bright-middle
 * rainbow` estimates 1.4 and has 13. The two halves come from different axes by
 * construction, which makes them independent in the SCHEMA and says nothing
 * about the corpus — an arch and a spectrum co-occur because the same wide
 * cosine produces both. So the joint is measured directly.
 *
 * THE FLOOR IS HALF A PAGE, not a whole one, and the difference from
 * CHIP_SUPPORT_FLOOR is a real property of the destination rather than a
 * softening. A rare SINGLE term degrades into noise: `applyTagFilter` has
 * nothing to rank the non-matching tail by, so page 1 is the raw semantic
 * order. A compound degrades into ITS OWN PARTS — the filter's partial credit
 * ranks both-parts above either-part above neither — so its page is always
 * about the label even where it cannot be exactly the label. Half the page
 * genuinely true is the point at which the label describes the page rather than
 * one palette on it.
 *
 * Measured over the 867-seed fixture, both halves STRONG (the population a chip
 * is drawn from), for every pair `compoundLabels` can form. 120 pairs co-fire
 * at all; 13 reach the floor. A pair absent from this table has a measured
 * joint of zero and is refused for that reason, which also makes the compound
 * vocabulary finite and enumerable — D17's own requirement for the crawl
 * frontier.
 */
export const COMPOUND_SUPPORT: Readonly<Record<string, number>> = {
  'cool analogous': 40,
  'brightening analogous': 39,
  'warm analogous': 36,
  'cool monochrome': 31,
  'brightening ocean': 26,
  'darkening sunset': 20,
  'vivid analogous': 20,
  'brightening monochrome': 19,
  'brightening sunset': 15,
  'vivid sunset': 15,
  'bright-middle rainbow': 13,
  'muted duotone': 13,
  'darkening analogous': 12,
  'vivid ocean': 11,
  'cooling rainbow': 9,
  'brightening complementary': 8,
  'vivid monochrome': 8,
  'brightening autumn': 7,
  'dark-middle rainbow': 7,
  'darkening ocean': 7,
  'desaturating sunset': 7,
  'high-key analogous': 7,
  'saturating analogous': 7,
  'saturating ocean': 7,
  'warming complementary': 7,
  'darkening autumn': 6,
  'high-key sunset': 6,
  'light analogous': 6,
  'muted monochrome': 6,
  'warming rainbow': 6,
  'brightening duotone': 5,
  'dark ocean': 5,
  'darkening duotone': 5,
  'deep ocean': 5,
  'neutral-anchored analogous': 5,
  'saturating sunset': 5,
  'warm monochrome': 5,
  'bright-middle complementary': 4,
  'dark monochrome': 4,
  'darkening monochrome': 4,
  'deep monochrome': 4,
  'desaturating analogous': 4,
  'dusty analogous': 4,
  'dusty monochrome': 4,
  'muted analogous': 4,
  'neon ocean': 4,
  'cool duotone': 3,
  'cooling complementary': 3,
  'dark analogous': 3,
  'dark complementary': 3,
  'light complementary': 3,
  'midtones ocean': 3,
  'near-black analogous': 3,
  'near-black autumn': 3,
  'near-white analogous': 3,
  'neon analogous': 3,
  'neutral-anchored complementary': 3,
  'neutral-anchored duotone': 3,
  'neutral-anchored monochrome': 3,
  'saturating complementary': 3,
  'vivid rainbow': 3,
  'bright-middle analogous': 2,
  'bright-middle sunset': 2,
  'chiaroscuro analogous': 2,
  'chiaroscuro autumn': 2,
  'cooling duotone': 2,
  'dark duotone': 2,
  'darkening complementary': 2,
  'deep complementary': 2,
  'desaturating duotone': 2,
  'desaturating monochrome': 2,
  'desaturating ocean': 2,
  'dusty complementary': 2,
  'dusty duotone': 2,
  'earthy analogous': 2,
  'earthy duotone': 2,
  'high-key complementary': 2,
  'high-key monochrome': 2,
  'light sunset': 2,
  'midtones analogous': 2,
  'muted complementary': 2,
  'near-black complementary': 2,
  'near-black duotone': 2,
  'near-black monochrome': 2,
  'near-black ocean': 2,
  'near-white duotone': 2,
  'near-white ocean': 2,
  'near-white sunset': 2,
  'pastel analogous': 2,
  'bright-middle autumn': 1,
  'bright-middle ocean': 1,
  'chiaroscuro complementary': 1,
  'chiaroscuro sunset': 1,
  'cool complementary': 1,
  'dark autumn': 1,
  'dark sunset': 1,
  'dark-middle autumn': 1,
  'dark-middle sunset': 1,
  'deep sunset': 1,
  'desaturating complementary': 1,
  'earthy complementary': 1,
  'earthy monochrome': 1,
  'high-key duotone': 1,
  'high-key ocean': 1,
  'high-key rainbow': 1,
  'light duotone': 1,
  'light rainbow': 1,
  'low-key analogous': 1,
  'low-key ocean': 1,
  'midtones sunset': 1,
  'near-black sunset': 1,
  'neon monochrome': 1,
  'pastel complementary': 1,
  'pastel duotone': 1,
  'pastel monochrome': 1,
  'saturating autumn': 1,
  'saturating monochrome': 1,
  'saturating rainbow': 1,
  'warm complementary': 1,
  'warm duotone': 1,
};

/** Half a page: see COMPOUND_SUPPORT. */
export const COMPOUND_SUPPORT_FLOOR = TAG_PAGE_SIZE / 2;

export const COMPOUND_SHADOWS: readonly {
  pair: readonly [string, string];
  shadows: readonly string[];
}[] = [
  { pair: ['brightening', 'monochrome'], shadows: ['ombre'] },
  { pair: ['darkening', 'monochrome'], shadows: ['ombre'] },
  { pair: ['brightening', 'analogous'], shadows: ['ombre'] },
  { pair: ['darkening', 'analogous'], shadows: ['ombre'] },
];

/** term -> the group representative that silences it, for the walk below. */
const SYNONYM_OF = new Map<string, string>(
  SYNONYM_GROUPS.flatMap((g) => g.drop.map((term) => [term, g.keep] as const)),
);

/**
 * How many terms from ONE axis may reach a chip row.
 *
 * The row is a set of DIMENSIONS (D22.B3), and without a quota the ranking
 * fills it from whichever axis happens to be richest on this palette: measured
 * over the fixture before this existed, the top five by rank alone were three
 * hue names on 96 palettes and two value bands on 71. Two is what the
 * measurement supports — one axis may say a specific thing and its general
 * one (`navy` beside `blue`), never three.
 */
export const AXIS_CHIPS = 2;

/**
 * THE SECOND PARTITION: how many terms from one IMPRESSION may reach a row.
 *
 * WHY THE AXIS QUOTA IS NOT ENOUGH (QA round 5, which filed this shape five
 * times). The axes are the inventory's DOMAINS — where a term was measured —
 * and a reader does not read a row by domain, they read it for what it says
 * about the picture. So four chips can pass the axis quota and still be one
 * observation: `near-white sunset | fade to white | wash | light` is two value
 * terms and two gradient terms and four ways of saying PALE; `fade to black |
 * near-black | chiaroscuro | almost black` is four ways of saying DARK;
 * `tones | fade to gray | midtone band | low-contrast` is four ways of saying
 * a flat colour is greying out. The QA's own diagnosis names the mechanism:
 * "the axis quota cannot see it because the four are split across the value
 * and gradient axes".
 *
 * So terms are also grouped by the IMPRESSION they leave, across domains, and
 * a row takes at most two from any one of them — the same number as the axis
 * quota, for the same reason: one impression may say a specific thing and its
 * general one, never three. Which two survive is the ranking's answer
 * (information content), so the palette-wide mean yields to the band and the
 * band to the passage, which is the order the QA asked for in so many words.
 *
 * This is a DISPLAY rule and lives here rather than in the row because the
 * groups are statements about what the terms MEAN, which is this file's
 * subject; `SYNONYM_GROUPS` above is the same kind of table one step further
 * (there the overlap is total enough that one term speaks and the other is
 * silent, here they compete). A term in no group is unconstrained.
 *
 * Measured over the 867-seed fixture BEFORE the quota: 35 rows carried three or
 * more `pale` words, 41 three or more `dark`, 26 three or more `graying`.
 */
export const IMPRESSION_GROUPS: readonly {
  impression: string;
  terms: readonly string[];
}[] = [
  {
    impression: 'pale',
    terms: ['light', 'high-key', 'pastel', 'near-white', 'wash', 'fade to white', 'tints'],
  },
  {
    impression: 'dark',
    terms: [
      'dark',
      'low-key',
      'deep',
      'near-black',
      'shadow band',
      'fade to black',
      'chiaroscuro',
      'shades',
    ],
  },
  {
    impression: 'flat',
    terms: ['low-contrast', 'iso-luminant', 'flat spot', 'midtones', 'solid'],
  },
  {
    impression: 'graying',
    terms: [
      'muted',
      'earthy',
      'dusty',
      'desaturating',
      'fade to gray',
      'tones',
      'sepia',
      'grayscale',
      'neutral-anchored',
    ],
  },
  {
    impression: 'loud',
    terms: ['vivid', 'neon', 'brilliant', 'jewel tones', 'saturating'],
  },
];

export const IMPRESSION_CHIPS = 2;

/** term -> the impression it leaves, for the walk in `chipCharacteristics`. */
const IMPRESSION_OF = new Map<string, string>(
  IMPRESSION_GROUPS.flatMap((g) => g.terms.map((term) => [term, g.impression] as const)),
);

/**
 * How many registry terms a chip row may carry, before the colour axis and the
 * journey chips are added to it (see relatedSearches for the whole budget).
 *
 * MEASURED, not chosen — and re-measured after QA round 4, which is the more
 * interesting number: the ranked pool after the three dedupes now has a median
 * of 4 (p10 2, p75 5, p90 7, max 13, mean 4.28), against a median of 6 before
 * the round. The cap has stopped binding almost anywhere: sweeping it to 6, 7
 * and 8 moves the mean chips per row by 0.01 and the longest row by one. What
 * shortened the rows is the round's own dedupes (a hue word whose region a
 * colour chip already named, a compound's halves, the measured implications) —
 * i.e. the row is now limited by how many DISTINCT prominent facts a palette
 * has, which is what D25.5 asks for, and not by this number. Left at 5 because
 * it is still the point past which a row would be taking terms under 3 bits.
 */
export const CHARACTERISTIC_CHIPS = 5;

export interface ChipSelection {
  /** How many terms may reach the row. */
  limit?: number;
  /**
   * Rank the terms that are merely TRUE instead of the ones that are true with
   * margin — the row's last resort when nothing at all reached the margin.
   *
   * D24.1 keeps a boundary case as a tag "and does not spend a chip on it",
   * which assumes the row has other facts to spend its slots on. QA round 6
   * found the row where it has none: a luminous light cool sweep whose five
   * nearest facts all miss their strong band (`brilliant` at C 0.153 against
   * 0.17, `light` at L 0.824 against 0.85, `high-key` at range 0.253 against
   * 0.2, `cool` at share 0.792 against 0.85, `vivid` at 0.153 against 0.17)
   * printed three colour names and a journey and said NOTHING about the
   * palette. One row in 867 - but the owner's bar is that every palette
   * surfaces its most prominent characteristic, and "none" is not an answer a
   * page can give. The prominence rule still decides ORDER; this only decides
   * that the ranking is run again over the terms that are merely true when the
   * first pass came back empty.
   */
  plain?: boolean;
  /** ...and how many of those may come from one axis. */
  perAxis?: number;
  /**
   * A term the caller has already spent a slot on, by any other route — the
   * colour axis names a colour the hue axis would name again, and only the
   * caller knows which labels it has printed.
   */
  reject?: (c: Characteristic) => boolean;
}

/**
 * THE CHIP ROW'S REGISTRY HALF (D25.5): top-N by prominence, deduped three
 * ways, with an axis quota so the N are N dimensions.
 *
 * RANKING. Prominence is the margin past the threshold WEIGHTED BY information
 * content. D24.1 fixes what the margin is — an explicit second threshold, never
 * a fudge factor on a score — so it enters the rank as the gate it is (a term
 * that is only just true keeps its tag and does not compete for a chip) and the
 * bits do the ordering inside the gated set. `characteristicScore` is that
 * weight: -log2 of the STRONG rate, the population a chip is actually drawn
 * from.
 *
 * DEDUPE, three rules, in the order they fire:
 *  1. IMPLICATION — a firing term silences everything it names in `implies`:
 *     `neon` silences `vivid`, `pastel` and `high-key` silence `light`,
 *     `brightening` and `ombre` silence `ramp`. Applied before the walk, so it
 *     does not depend on which of the two the corpus happens to make rarer —
 *     see `prominentCharacteristics` for the case that proved it has to be.
 *  2. NEAR-SYNONYM — the measured groups above, where the representative
 *     speaks whenever it fires.
 *  3. AXIS QUOTA — at most `perAxis` terms from one domain, and at most
 *     IMPRESSION_CHIPS from one IMPRESSION, which is the partition that cuts
 *     across the domains (see IMPRESSION_GROUPS).
 * The caller's own `reject` runs first of all, because a label the row has
 * already printed is not a candidate at all.
 */
export function chipCharacteristics(
  f: PaletteFeatures,
  ctx: CharacteristicCtx,
  options: ChipSelection = {},
): Characteristic[] {
  const limit = options.limit ?? CHARACTERISTIC_CHIPS;
  const perAxis = options.perAxis ?? AXIS_CHIPS;
  const pool = CHARACTERISTICS.filter(
    (c) =>
      !c.tagOnly &&
      // ...and the term's page has to be able to answer it. See
      // CHIP_SUPPORT_FLOOR: a link to a page that cannot be filled is the
      // defect, not a rare-but-true fact.
      c.prevalence >= CHIP_SUPPORT_FLOOR &&
      c.strongPrevalence <= PROMINENCE_CEILING &&
      (options.plain ? fires(c, f, ctx) : firesStrong(c, f, ctx)),
  );
  const firing = new Set(pool.map((c) => c.term));
  const ranked = pool
    .filter((c) => {
      const keeper = SYNONYM_OF.get(c.term);
      // A group member yields only to a representative that is ITSELF true of
      // this palette: a near-full-circle that is not a rainbow still has a word.
      return !(keeper && firing.has(keeper));
    })
    // ...and the fallback pass ranks on the PLAIN rate, because that is the
    // population it is drawing from. `hue contrast` is rare with margin (1.6%)
    // and common without it (34.7%), so ranking the merely-true terms by the
    // strong rate put the least informative fact the palette had at the top of
    // the one row that needed the fallback at all.
    .sort(
      (a, b) =>
        characteristicScore(b, options.plain) - characteristicScore(a, options.plain) ||
        (a.term < b.term ? -1 : 1),
    );

  const kept: Characteristic[] = [];
  const shadowed = impliedBy(ranked);
  const perAxisCount = new Map<string, number>();
  const perImpressionCount = new Map<string, number>();
  for (const c of ranked) {
    if (shadowed.has(c.term)) continue;
    if (options.reject?.(c)) continue;
    const used = perAxisCount.get(c.axis) ?? 0;
    if (used >= perAxis) continue;
    // ...and the impression quota, which cuts ACROSS the axes. See
    // IMPRESSION_GROUPS.
    const impression = IMPRESSION_OF.get(c.term);
    const spent = impression ? (perImpressionCount.get(impression) ?? 0) : 0;
    if (impression && spent >= IMPRESSION_CHIPS) continue;
    kept.push(c);
    perAxisCount.set(c.axis, used + 1);
    if (impression) perImpressionCount.set(impression, spent + 1);
    if (kept.length === limit) break;
  }
  return kept;
}

// -----------------------------------------------------------------------------
// Seed entries
//
// Everything below was already implemented and already measured somewhere in
// the codebase; this is where it becomes ONE table. The four domain packages
// that follow append to it — they do not edit it.
//
// THE MARGIN. Every `strong` band is the same predicate with its governing
// number moved by a stated distance, and both rates are measured. Where the
// distance is arbitrary it is tied to a scale the repo already uses: 0.05 in
// OkLCh L is the step at which two neighbouring stops read as different
// values, 0.02 in chroma is about a JND at mid lightness, 15° is half a
// family width, and a share threshold moves to the next tenth.
// -----------------------------------------------------------------------------

/** Look up a DESCRIPTOR's closure so a wrapped entry cannot restate it. */
const descriptor = (word: string): Descriptor => {
  const d = DESCRIPTORS.find((x) => x.word === word);
  if (!d) throw new Error(`unknown descriptor: ${word}`);
  return d;
};

/**
 * Wrap a DESCRIPTOR: the same closure, plus the margin band the older registry
 * never carried, plus both rates.
 *
 * `also` is a CONJUNCT APPLIED TO BOTH BARS, for the three terms where the
 * DESCRIPTOR is the right idea with a measured blind spot (QA round 4): a
 * trajectory tag read off dense half-means that a clipped plateau can invert,
 * and a shape tag that counts turns without asking which way the bend goes.
 * Both bars, never only `strong`, because the tag route filters on `test` and a
 * page that answers with palettes the word is false of is the defect this
 * registry exists to prevent (D25.6). The DESCRIPTOR itself is deliberately
 * left alone: its word rides the Vectorize index, and moving an indexed tag's
 * meaning without a reindex breaks the query/index symmetry the D7 gate
 * protects. The registry is the authority for what a CHIP and a /palettes/
 * page mean; the stored tag stays the coarser embed value it has always been.
 *
 * The plain rate is re-typed here rather than copied off the descriptor
 * because the two registries measure at different views: DESCRIPTORS records
 * its prevalences at 13 steps (the view the NAME is built at) and this table
 * records at 7 (the default view a seed page renders). Where the two numbers
 * differ - `dark` 0.107 against 0.1119, `neon` 0.082 against 0.0796 - it is the
 * step count and nothing else, and both are re-measured by their own suites.
 */
const wrap = (
  word: string,
  strong: Characteristic['strong'],
  prevalence: number,
  strongPrevalence: number,
  extra: Partial<Characteristic> & { also?: Characteristic['test'] } = {},
): Characteristic => {
  const d = descriptor(word);
  const { also, ...rest } = extra;
  return {
    term: word,
    axis: d.axis,
    test: also ? (f, ctx) => d.test(f) && also(f, ctx) : (f) => d.test(f),
    // Composed with the descriptor's own test, so a wrapped margin band is
    // self-contained: `strong` can never fire where the term is not true, even
    // if a caller evaluates it on its own.
    strong:
      strong &&
      ((f, ctx) => d.test(f) && (!also || also(f, ctx)) && strong(f, ctx)),
    prevalence,
    strongPrevalence,
    ...rest,
    // MERGED, never overwritten: an entry that adds an implication of its own
    // must not silently drop the descriptor's. `high-key implies light` is one
    // of those, and losing `pastel implies light` to it would have put both
    // words on the same row.
    implies:
      d.implies || rest.implies
        ? [...new Set([...(d.implies ?? []), ...(rest.implies ?? [])])]
        : undefined,
  };
};

// -----------------------------------------------------------------------------
// CHROMA and TEMPERATURE detectors (inventory sections 3 and 4)
//
// The two rows in those sections that were not already terms. Everything else
// they cover was verified against the inventory's own test instead of being
// rewritten; the block above the entries records what each one measured.
// -----------------------------------------------------------------------------

/**
 * The two temperature descriptors, resolved once.
 *
 * The third class below has to be the negation of THESE closures rather than
 * its own hue window, or the three tags stop being a partition: the inventory
 * writes temperature-neutral as "the zones warm and cool leave over"
 * (h in [120,150) or [300,330), plus every achromatic palette), and a private
 * copy of those edges would let a palette come back neither warm, nor cool,
 * nor temperature-neutral the first time one of the boundaries moves.
 */
const WARM_DESCRIPTOR = descriptor('warm');
const COOL_DESCRIPTOR = descriptor('cool');

/**
 * ...and the one `isJewel` excludes itself against. Resolved here beside the
 * others rather than at the detector, because `descriptor` is defined in this
 * block; nothing calls a detector during module evaluation, so the reference
 * from further up the file is a closure over a binding, not a use before it.
 */
const NEON = descriptor('neon');

/** ...and the degenerate palette `low-contrast` excludes itself against. */
const SOLID = descriptor('solid');

/**
 * Half the chroma the palette's own lightness allows - `dusty`'s bar.
 *
 * Half is the natural place for "using less colour than it could": above it a
 * palette is spending most of its available chroma, below it a viewer reads the
 * run as greyed. Swept over the fixture (palettes in the band, with the
 * MUTED_CHROMA floor applied): 0.35 -> 15, 0.40 -> 32, 0.45 -> 57, 0.50 -> 85,
 * 0.55 -> 118. No knee, which is what a smooth quantity looks like, so the
 * number is the definition rather than a fit.
 */
const DUSTY_SATURATION = 0.5;

/**
 * The ambiguous zones: green (120-150) and violet (300-330), plus grayscale.
 *
 * Deliberately gapped boundaries, which is classical theory rather than a
 * rounding — a single hard split (say 90/270) calls one green warm and its
 * neighbour cool. Measured over the fixture the three classes partition it
 * exactly: warm 399, cool 312, temperature-neutral 156, sum 867, and no
 * palette is both warm and cool.
 */
export const isTemperatureNeutral = (f: PaletteFeatures) =>
  !WARM_DESCRIPTOR.test(f) && !COOL_DESCRIPTOR.test(f);

/**
 * The chromatic-fraction band the inventory gives `neutral-anchored`: colour
 * GROUNDED BY neutrals, which is a claim about what the palette CONTAINS and
 * not about what it is.
 *
 * chromaticFraction is D19's saturation-aware share ("is there colour here" is
 * an identity question, so a pale tint at the top of the gamut counts as
 * coloured), which is the right reading for both edges of this band: the low
 * edge asks how much of the run has no hue AT ALL, and the high edge asks
 * whether any of it is neutral. Absolute chroma would answer neither — it
 * measures loudness, and a neutral is not a quiet colour, it is no colour.
 *
 * The band edges are the inventory's. The low one is also `isGrayscale`'s own
 * cf clause, so the two readings cannot disagree: measured over the fixture,
 * every palette under cf 0.15 classifies grayscale (14 of 14), which is why
 * the test below only has to exclude the five palettes that reach the band and
 * are grayscale by the other clause (little chroma AND little saturation).
 */
const NEUTRAL_ANCHOR_BAND: readonly [number, number] = [0.15, 0.85];

export const isNeutralAnchored = (f: PaletteFeatures, ctx: CharacteristicCtx) =>
  ctx.structure !== 'grayscale' &&
  f.chromaticFraction >= NEUTRAL_ANCHOR_BAND[0] &&
  f.chromaticFraction <= NEUTRAL_ANCHOR_BAND[1];

/**
 * The eleven words `gatedFamily` can return: the eight-band partition, derived
 * from the partition rather than copied out of it, plus its three tone rungs.
 *
 * One list, because the retrieval route recognises exactly these as family
 * terms and the registry offers exactly these as family chips; two lists is how
 * a chip gets offered for a word its own page does not know.
 */
export const FAMILY_TERMS: readonly string[] = [
  ...new Set(Array.from({ length: 360 }, (_, h) => colorFamily(h))),
  'brown',
  'purple',
  'pink',
];

/**
 * Measured rates for the eleven family terms: {plain, strong} over the 867-seed
 * fixture at the default view. Plain is "the ramp contains a stop of this
 * family", strong is "at least HUE_NAME_SHARE of it is".
 *
 * Kept beside the builder rather than inline in the table because the predicate
 * is identical for all eleven and only the numbers differ — the same shape
 * `wrap` uses for the DESCRIPTORS it lifts. Every number here is re-measured by
 * palette-characteristics.test.js and drift fails the build.
 */
const FAMILY_RATES: Record<string, readonly [number, number]> = {
  red: [0.2561, 0.1672],
  orange: [0.2445, 0.1107],
  yellow: [0.2964, 0.1719],
  green: [0.1938, 0.1107],
  cyan: [0.2561, 0.1476],
  blue: [0.3552, 0.2422],
  violet: [0.2261, 0.1211],
  magenta: [0.1949, 0.098],
  brown: [0.1603, 0.06],
  purple: [0.075, 0.03],
  pink: [0.1696, 0.0888],
};

/**
 * A family term carries NO `implies`. `gatedFamily` is a partition — a stop is
 * called brown or orange, never both — so a brown palette can hold no orange
 * stop at all and "brown implies orange" would be false on the image.
 */
const FAMILY_ENTRIES: readonly Characteristic[] = FAMILY_TERMS.map((term) => ({
  term,
  axis: 'hue',
  test: (_f: PaletteFeatures, ctx: CharacteristicCtx) => familyShare(ctx.families, term) > 0,
  strong: (_f: PaletteFeatures, ctx: CharacteristicCtx) =>
    familyShare(ctx.families, term) >= HUE_NAME_SHARE,
  prevalence: FAMILY_RATES[term]![0],
  strongPrevalence: FAMILY_RATES[term]![1],
}));

/** The same, for the extended names. */
const HUE_NAME_RATES: Record<string, readonly [number, number]> = {
  rose: [0.1546, 0.0761],
  crimson: [0.098, 0.0496],
  maroon: [0.0392, 0.0104],
  salmon: [0.075, 0.0196],
  coral: [0.0819, 0.0185],
  terracotta: [0.0738, 0.0242],
  rust: [0.0704, 0.0254],
  ochre: [0.0461, 0.0035],
  peach: [0.0484, 0.0046],
  amber: [0.06, 0.0138],
  gold: [0.0542, 0.0161],
  sand: [0.1119, 0.0288],
  mustard: [0.0219, 0.0035],
  olive: [0.0519, 0.0208],
  chartreuse: [0.0404, 0.0161],
  'spring green': [0.0415, 0.0185],
  mint: [0.0704, 0.0173],
  turquoise: [0.0692, 0.0231],
  teal: [0.0381, 0.0104],
  sky: [0.0381, 0.0058],
  cerulean: [0.0473, 0.015],
  azure: [0.1776, 0.0842],
  navy: [0.0957, 0.0415],
  ultramarine: [0.0623, 0.0311],
  periwinkle: [0.0369, 0.0104],
  lavender: [0.0519, 0.0173],
};

const HUE_NAME_ENTRIES: readonly Characteristic[] = GATED_HUE_NAMES.map((g) => ({
  term: g.term,
  axis: 'hue',
  test: (_f: PaletteFeatures, ctx: CharacteristicCtx) => hueNameShare(ctx.stops, g) > 0,
  strong: (_f: PaletteFeatures, ctx: CharacteristicCtx) =>
    hueNameShare(ctx.stops, g) >= HUE_NAME_SHARE,
  prevalence: HUE_NAME_RATES[g.term]![0],
  strongPrevalence: HUE_NAME_RATES[g.term]![1],
  implies: g.implies,
  note: g.note,
}));

/**
 * How consistent the hue walk must be to be in SPECTRAL ORDER.
 *
 * The inventory's test is "no reversal > 5 degrees" on the dense chromatic
 * samples. `hueConsistency` is |net| / travel, so a run that backtracks by d
 * degrees out of a t-degree walk reads 1 - 2d/t: at the 90-degree travel floor
 * a 5-degree reversal is 0.889 and at 180 it is 0.944, which means a single
 * fixed ratio cannot express "5 degrees" at every length. 0.98 is the ratio at
 * which the reversal is 1% of the walk — stricter than the inventory at short
 * lengths and about as strict at long ones — and it is what separates this from
 * the direction tags, which sit at HUE_DIRECTION_CONSISTENCY (0.8) and admit a
 * fifth of the walk going backwards.
 */
const SPECTRAL_CONSISTENCY = 0.98;

/**
 * THE LINE OF PURPLES: the arc of the wheel no wavelength produces.
 *
 * Both angles are measured through this repo's own conversion, and they are the
 * sRGB gamut's own answer rather than a choice: the boundary of the gamut runs
 * R -> G through yellow (h 29.2 -> 142.5), G -> B through cyan (142.5 ->
 * 264.1), and B -> R through magenta (264.1 -> 29.2). The first two edges are
 * the spectral locus; the third is the LINE OF PURPLES — every colour on it is
 * a red-and-blue MIXTURE, and no single wavelength makes one. #ff00ff sits in
 * the middle of it at h 328.4.
 *
 * WHY `spectral order` NEEDS IT (QA round 5). `hueConsistency` measures that
 * the walk never reverses; it cannot tell WHICH WAY ROUND the wheel the walk
 * went, and both ways are equally monotone. The filed palette walks
 * 264 273 287 302 318 332 346 358 6 14 ... 109 — navy into dark maroon, red,
 * orange, yellow — which is monotone in ANGLE, crosses the purple line in the
 * middle of it, and skips the whole green-cyan half. Nothing about the render
 * is the order of a spectrum: in a spectrum yellow lies between green and
 * orange, and red is the far end. Measured over the fixture: 43 of the 229
 * palettes the term was true of traverse the whole non-spectral edge (229 -> 186
 * test), and 32 of the 93 the margin admitted (93 -> 61 strong).
 *
 * The test is CONTAINMENT of the whole edge, not contact with it, and the
 * difference is the point: a run that ENDS in magenta stopped at the purple
 * line and a run that contains all of B -> R went round the back. A "no
 * magenta anywhere" rule would have refused 190 of the 229, i.e. every palette
 * that so much as holds a pink stop.
 */
const PURPLE_LINE_START = 264.1; // #0000ff
const PURPLE_LINE_END = 29.2; // #ff0000

/** Width of the non-spectral edge, degrees. */
const PURPLE_LINE_WIDTH = (PURPLE_LINE_END - PURPLE_LINE_START + 360) % 360;

/**
 * HOW MUCH OF THE WALK LIES ON THE LINE OF PURPLES (QA round 6).
 *
 * `crossesPurpleLine` tested CONTAINMENT of the whole 125.1-degree edge, on the
 * argument written above that "a run that ENDS in magenta stopped at the purple
 * line and a run that contains all of B -> R went round the back". True, and it
 * is a guard against only the extreme case: a walk can spend HALF of itself on
 * the non-spectral edge without containing all of it and pass. The filed
 * palette does exactly that - arc [-61.1, 118.9], 90.3 of its 180.0 degrees on
 * the edge, its last four stops #984568 #810c7c #660086 #480085 (mauve, magenta,
 * purple, violet), which is the very region this file's own comment says no
 * wavelength produces - and it chipped `spectral order`.
 *
 * So the question is a SHARE, and the bar is the line's own share of the wheel:
 * 125.1 / 360 = 0.3475. A walk that spends more of itself on the purple line
 * than an unbiased walk of the same length would is over-represented there, and
 * that is the claim "in spectral order" cannot survive. Nothing arbitrary is
 * chosen - the threshold IS the geometry - and the old containment rule is
 * strictly inside it (a walk containing the whole edge is at least 125.1 of its
 * own degrees, which needs a 360-degree walk to stay under the bar; a full-wheel
 * walk is `hue cycling` and reverses somewhere). Measured over the fixture:
 * 186 -> 111 test and 61 -> 40 strong, the filed palette at 0.502 among them.
 */
export const PURPLE_LINE_MAX_SHARE = PURPLE_LINE_WIDTH / 360;

/**
 * Why the bar is compared with a tolerance.
 *
 * `PURPLE_LINE_WIDTH` is `(29.2 - 264.1 + 360) % 360`, which evaluates to
 * 125.10000000000002, so the bar lands on 0.3474999999999999 rather than the
 * 0.3475 the geometry means. One fixture palette walks a share of exactly that
 * value, and the two are separated by a single bit — measured 2026-08-19, the
 * term's shipped rate FLIPPED between identical runs (0.1326 / 0.1338, one
 * palette either way) because the comparison resolved differently depending on
 * how the share was accumulated.
 *
 * Ties go to the bar, which is the reading QA round 5 filed for that palette:
 * it spends as much of itself on the non-spectral edge as an unbiased walk
 * would, and the claim "in spectral order" is not survivable there. The
 * epsilon is far below any share difference that could be meaningful (a single
 * dense sample is 1/48 of a walk) and exists only to make the tie deterministic.
 */
const PURPLE_LINE_TIE = 1e-9;



export function purpleLineShare(f: PaletteFeatures): number {
  const length = f.hueArcMax - f.hueArcMin;
  if (length <= 0) return 0;
  // The walk's frame is unwrapped, so the edge has to be laid down at every turn
  // the walk could have touched it on and the overlaps summed.
  let covered = 0;
  for (
    let a = PURPLE_LINE_START + 360 * (Math.floor((f.hueArcMin - PURPLE_LINE_START) / 360) - 1);
    a <= f.hueArcMax;
    a += 360
  )
    covered += Math.max(
      0,
      Math.min(f.hueArcMax, a + PURPLE_LINE_WIDTH) - Math.max(f.hueArcMin, a),
    );
  return Math.min(1, covered / length);
}

/** Did the unwrapped hue walk traverse the whole line of purples? */
export function crossesPurpleLine(f: PaletteFeatures): boolean {
  const width = PURPLE_LINE_WIDTH;
  if (f.hueArcMax - f.hueArcMin < width) return false;
  // The walk's frame is unwrapped, so the window has to be tried at every turn
  // the walk could have contained it on.
  for (
    let a = PURPLE_LINE_START + 360 * Math.floor((f.hueArcMin - PURPLE_LINE_START) / 360);
    a <= f.hueArcMax;
    a += 360
  )
    if (a >= f.hueArcMin && a + width <= f.hueArcMax) return true;
  return false;
}

/**
 * Hue travel at which the walk has gone more than once around: the inventory's
 * "cyclic" row, at its stated 400 degrees (a full turn plus a family band of
 * slack, so a 361-degree rounding is not a cycle).
 */
const HUE_CYCLE_TRAVEL = 400;

/**
 * How much of a rainbow has to sit on EACH side of the wheel before the word is
 * obvious rather than merely defensible — the margin on `hasSpectrumPoles`'s
 * own two windows (the warm arc through 0 and the cool arc through 225, which
 * are `warm` and `cool`'s windows). The measurement is in the entry's note.
 */
const RAINBOW_POLE_MASS = 0.25;

/**
 * The red and orange families of this repo's own hue partition, as a window.
 *
 * FAMILY_ANCHOR_HUES puts magenta at 328, red at 29, orange at 53 and yellow at
 * 110, so the band a viewer would call "a red or an orange" runs from the
 * magenta/red midpoint to the orange/yellow one. Used by `rainbow`, which
 * promises the spectrum and therefore promises this end of it.
 */
const RED_ORANGE_BAND: readonly [number, number] = [358.5, 81.5];

// =============================================================================
// Harmony geometry above two hues, and Itten's remaining contrasts (D25, §5-§6)
//
// WHY THESE READ `clusterHues` AND NOT THE HUE HISTOGRAM. A triad is a claim
// about ISOLATED hues — three masses with real gaps between them — and a
// histogram cannot see a gap. `hueGeometry` has already cut the dense sample at
// every gap wider than CLUSTER_GAP, so the cluster list IS the scheme and the
// only thing left to decide is the angles between its members. (The sweep route
// to `complementary` is the deliberate exception: two poles joined by a
// continuous crossing are still two poles, which is why D24.2 reads the
// histogram there and why nothing here does.)
//
// EVERY SCHEME ALSO DEMANDS NARROW GROUPS, for the reason
// DUOTONE_CLUSTER_WIDTH records: a group may not be wider than the gap that
// defines a group, or "three hues" comes to mean "three arcs that between them
// cover the wheel". The fixture's widest three-cluster palette holds 65% of its
// run in one 118° group and would otherwise read as a triad.
//
// THEY FIRE ~NEVER ON THE LIVE CORPUS, AND THAT IS CORRECT (D25.4). A cosine
// dwells at its two turning points per cycle, so three or four evenly spaced
// ISOLATED masses are a corner of coefficient space rather than a shape the
// model likes. Measured over the 867-seed fixture: zero of each. Measured over
// 400,000 uniformly random coefficient sets (a ∈ [0,1], b ∈ [0,0.8], c ∈ [0,4],
// d ∈ [0,1), 7 steps) they are reachable and rare — triadic 44 (0.011%),
// tetradic 8 (0.0020%), square 3 (0.0008%), split complementary 2 (0.0005%) —
// and one witness of each is pinned in the suite, so these predicates are
// exercised rather than merely shipped.
// =============================================================================

/** Every pairwise circular distance between a list of hue angles, degrees. */
const huePairs = (hues: readonly number[]): number[] => {
  const out: number[] = [];
  for (let i = 0; i < hues.length; i++)
    for (let j = i + 1; j < hues.length; j++) out.push(arcDistance(hues[i]!, hues[j]!));
  return out;
};

/**
 * THE SECOND ROUTE TO A SCHEME: the hues of the RENDERED STOPS (QA round 4).
 *
 * The dense route above cannot see a triad on a SWEEP, and the corpus's one
 * clear triad is a sweep: #d0555d #5b60cf #5bcf55 repeated twice reads red /
 * blue / green in even bands, and its dense sample walks every hue between
 * them, so `hueClusters` is 1 of width 340.7 and every scheme test fails. This
 * is the same defect D24.2 diagnosed for `complementary` — one wide cluster
 * where the eye sees separated hues — but NOT the same fix. The hue-MASS route
 * does not work here and the fixture says why: on that palette the mass in a
 * 40-degree window peaks at 0.229 and never falls below 0.063, because a
 * two-cycle cosine dwells everywhere on its path. What the eye is reading is
 * the SWATCHES, so that is what this reads.
 *
 * It is view-dependent, and the registry has a rule about that (`banding` is
 * TAG ONLY because it measures the visitor's step count). The difference is
 * which way the dependence runs: `banding` claims the gradient is rough, and
 * that claim evaporates at another step count; this claims three colours are
 * present in the palette as rendered, which is what a swatch grid shows and
 * what the palette's stored `steps` mean. Both the chip row and the tag filter
 * classify at the palette's OWN step count, so the two sides cannot disagree.
 *
 * Same shape as `hueGeometry`: single-linkage on the circle at CLUSTER_GAP,
 * over the stops with real chroma, walked from just after the widest gap so a
 * group straddling 0 stays whole.
 */
interface StopHueGroup {
  hue: number;
  /** How many of the palette's own swatches are in it — see SCHEME_GROUP_STOPS. */
  stops: number;
  width: number;
  chroma: number;
}

/**
 * How many rendered swatches a hue GROUP needs before it is a group (QA round 5).
 *
 * THE DEFECT. Single-linkage on seven stops finds a "gap" wherever two
 * neighbouring samples of a CONTINUOUS SWEEP are more than CLUSTER_GAP apart,
 * which on a 300-degree ramp is most neighbouring pairs — so a navy -> black ->
 * red -> orange -> cream -> cyan sweep produced four "isolated hue masses" at
 * 30 / 83 / 204 / 264 and chipped `tetradic` beside `spectral order`: a
 * discrete four-hue scheme and a continuous hue progression, printed side by
 * side on one row, about one image. Two of those four groups were ONE SWATCH
 * (the cream at h 83.4 and the navy at h 264.1); the corpus's genuine triad,
 * which is what this route exists for, holds 3 / 2 / 2.
 *
 * The bar is the registry's own, argued in HUE_NAME_SHARE for exactly this and
 * quoted from it: "one stop of seven is a colour the ramp passes through, two
 * is a band you can point at". A scheme is a set of hue MASSES, and a single
 * sample of a path is not a mass.
 */
const SCHEME_GROUP_STOPS = 2;

function stopHueGroups(ctx: CharacteristicCtx): StopHueGroup[] {
  const pts = ctx.stops
    .filter((s) => s.C >= T.CHROMA_FLOOR)
    .sort((a, b) => a.h - b.h);
  if (pts.length < 2) return [];
  const gaps = pts.map((s, i) =>
    i === pts.length - 1 ? pts[0]!.h + 360 - s.h : pts[i + 1]!.h - s.h,
  );
  const start = (gaps.indexOf(Math.max(...gaps)) + 1) % pts.length;
  const groups: OkLch[][] = [];
  let current: OkLch[] = [];
  for (let k = 0; k < pts.length; k++) {
    const i = (start + k) % pts.length;
    current.push(pts[i]!);
    if (gaps[i]! > T.CLUSTER_GAP || k === pts.length - 1) {
      groups.push(current);
      current = [];
    }
  }
  return groups.map((g) => {
    let x = 0;
    let y = 0;
    for (const s of g) {
      x += s.C * Math.cos((s.h * Math.PI) / 180);
      y += s.C * Math.sin((s.h * Math.PI) / 180);
    }
    const deg = (Math.atan2(y, x) * 180) / Math.PI;
    const hue = deg < 0 ? deg + 360 : deg;
    return {
      hue,
      stops: g.length,
      width: Math.max(...g.map((s) => arcDistance(s.h, hue) * 2)),
      chroma: Math.max(...g.map((s) => s.C)),
    };
  });
}

/**
 * `count` hue groups the palette actually SHOWS, each one narrow enough to be
 * one hue and loud enough to be named after (FAMILY_CHROMA, the registry's own
 * bar for that). Returns their angles, or null.
 */
function schemeHues(ctx: CharacteristicCtx, count: number): number[] | null {
  const groups = stopHueGroups(ctx);
  if (groups.length !== count) return null;
  if (
    !groups.every(
      (g) =>
        g.width < T.CLUSTER_GAP &&
        g.chroma >= T.FAMILY_CHROMA &&
        g.stops >= SCHEME_GROUP_STOPS,
    )
  )
    return null;
  return groups.map((g) => g.hue);
}

/** Exactly `count` groups, each one actually a single hue — either route. */
const isolatedHues = (f: PaletteFeatures, count: number) =>
  f.hueClusters === count && f.maxClusterWidth < T.CLUSTER_GAP;

/** The hue angles a scheme test compares, from whichever route sees them. */
const schemeAngles = (
  f: PaletteFeatures,
  ctx: CharacteristicCtx,
  count: number,
): number[] | null =>
  isolatedHues(f, count) ? [...f.clusterHues] : schemeHues(ctx, count);

/** Index of the cluster holding the least / the most of the coloured run. */
const minorCluster = (f: PaletteFeatures) =>
  f.clusterShares.indexOf(Math.min(...f.clusterShares));
const majorCluster = (f: PaletteFeatures) =>
  f.clusterShares.indexOf(Math.max(...f.clusterShares));

/**
 * The scheme tolerances. Each detector takes its tolerance as an argument so
 * the strong band is the SAME predicate with its governing number moved (D24.1)
 * rather than a second, subtly different geometry test. 15° is the registry's
 * standing margin unit — half a hue-family width.
 */
const TRIAD_TOLERANCE = 30;
const SPLIT_FLANK_TOLERANCE = 30;
const SQUARE_TOLERANCE = 20;
const SCHEME_MARGIN = 15;

/** Three isolated hues, a third of the wheel apart: 120° ± tolerance. */
export const isTriadic = (
  f: PaletteFeatures,
  ctx: CharacteristicCtx,
  tolerance = TRIAD_TOLERANCE,
) => {
  const hues = schemeAngles(f, ctx, 3);
  return !!hues && huePairs(hues).every((d) => Math.abs(d - 120) <= tolerance);
};

/**
 * A hue plus the two NEIGHBOURS of its complement: one cluster opposite both
 * others, and those two a sixth of the wheel apart from each other.
 */
export function isSplitComplementary(
  f: PaletteFeatures,
  ctx: CharacteristicCtx,
  tolerance = SPLIT_FLANK_TOLERANCE,
): boolean {
  const h = schemeAngles(f, ctx, 3);
  if (!h) return false;
  for (let base = 0; base < 3; base++) {
    const flanks = [0, 1, 2].filter((i) => i !== base);
    const [x, y] = [flanks[0]!, flanks[1]!];
    if (
      arcDistance(h[base]!, h[x]!) >= T.COMPLEMENTARY_SEPARATION &&
      arcDistance(h[base]!, h[y]!) >= T.COMPLEMENTARY_SEPARATION &&
      Math.abs(arcDistance(h[x]!, h[y]!) - 60) <= tolerance
    )
      return true;
  }
  return false;
}

/** The three ways four hues pair off; a tetradic is two complementary pairs. */
const TETRAD_PAIRINGS = [
  [
    [0, 1],
    [2, 3],
  ],
  [
    [0, 2],
    [1, 3],
  ],
  [
    [0, 3],
    [1, 2],
  ],
] as const;

/** Four isolated hues forming two opposed pairs (the rectangle). */
export function isTetradic(
  f: PaletteFeatures,
  ctx: CharacteristicCtx,
  // Annotated because THRESHOLDS is `as const`: without it the parameter takes
  // the literal type 150 and the strong band cannot pass 165.
  opposite: number = T.COMPLEMENTARY_SEPARATION,
): boolean {
  const h = schemeAngles(f, ctx, 4);
  if (!h) return false;
  return TETRAD_PAIRINGS.some((pairing) =>
    pairing.every(([a, b]) => arcDistance(h[a]!, h[b]!) >= opposite),
  );
}

/**
 * A tetradic with EQUAL spacing.
 *
 * The inventory's shorthand for this row is "pairwise sep ≈ 90±20", which is
 * unsatisfiable read literally: a square's two diagonals are 180° apart, not
 * 90°. The claim is about the four CONSECUTIVE gaps around the wheel, and that
 * is what this measures.
 */
export function isSquare(
  f: PaletteFeatures,
  ctx: CharacteristicCtx,
  tolerance = SQUARE_TOLERANCE,
): boolean {
  if (!isTetradic(f, ctx)) return false;
  const sorted = [...(schemeAngles(f, ctx, 4) ?? [])].sort((a, b) => a - b);
  const gaps = sorted.map((h, i) =>
    i === sorted.length - 1 ? sorted[0]! + 360 - h : sorted[i + 1]! - h,
  );
  return gaps.every((g) => Math.abs(g - 90) <= tolerance);
}

/**
 * An analogous FIELD with one small distant accent.
 *
 * The inventory dropped this row as "a strict subset of duotone that adds no
 * token beyond duotone", and under the duotone-shaped reading (two narrow
 * clusters, one of them short) that is exactly right — it measures 11 of the
 * fixture's 32 duotones and says nothing they do not. So the name is taken at
 * its word instead: the field has to be an ARC rather than one hue, which is
 * the repo's own boundary between `monochrome` and `analogous` (30° to 95° of
 * cluster width), and the accent has to be a colour rather than a gray blip.
 * Read that way it fires on 30 palettes of which only 4 are duotones (23 are
 * `multicolor` and 3 `complementary`), i.e. it is mostly reachable where the
 * structure ladder has no harmony word to offer at all.
 *
 * The accent floor is absolute (CHROMA_FLOOR) where D19 would suggest the
 * relative reading, and the fixture says the choice cannot matter here: it
 * removes exactly two palettes of 32, an accent at chroma 0.008 (a white blip
 * at the top of a white-to-pink ramp) and one at 0.024 (the pale blue END of a
 * green-to-ice ramp) — neither is an accent under any reading, and a saturation
 * test would need a fourth per-cluster array to reach the same two.
 *
 * IT ALSO HAS TO BE VISIBLE (QA round 4), which chroma alone cannot say. A
 * black-to-cyan ramp was chipped `accented analogous` on an "accent" of chroma
 * 0.0368 that is stop 0, #000800, at L 0.116 — pure black on screen, and there
 * is no green anywhere in the image. Neither floor catches it: absolute chroma
 * passes because OkLab's cube root exaggerates chroma at the black point, and
 * the relative reading passes harder, because at L 0.116 the sRGB ceiling has
 * collapsed and the stop sits near the top of it. What disqualifies it is
 * LIGHTNESS, so the accent's own cluster has to clear the near-black edge —
 * the same measurement SATURATION_BRANCH_LIGHTNESS records one level down.
 * Measured over the fixture: 30 -> 27 palettes (strong 16 -> 13), and all
 * three removed have an accent cluster whose mean L is 0.063, 0.108 and 0.152 —
 * the dark END of the ramp read as its accent.
 */
export function isAccentedAnalogous(f: PaletteFeatures, accentShare = 0.2): boolean {
  if (f.hueClusters !== 2) return false;
  const minor = minorCluster(f);
  const field = f.clusterWidths[majorCluster(f)]!;
  return (
    f.clusterShares[minor]! <= accentShare &&
    field >= T.MONOCHROME_SPAN &&
    field < T.ANALOGOUS_SPAN &&
    visibleCluster(f, minor)
  );
}

/**
 * Is this cluster a colour a viewer can point at?
 *
 * Chroma above the floor AND out of the near-black band. Shared by the two
 * detectors that make a claim about a SMALL part of the palette, where a
 * mis-read blip changes the whole reading — see isAccentedAnalogous for the
 * measurement.
 */
const visibleCluster = (f: PaletteFeatures, i: number) =>
  f.clusterChromas[i]! >= T.CHROMA_FLOOR && f.clusterLightnesses[i]! >= NEAR_BLACK_L;

/**
 * Itten's SEVENTH contrast, of extension: unequal area given to opposing
 * colours, with the smaller area carrying the stronger colour.
 *
 * AREA HERE IS EXTENT ALONG t, and the term says so. The dense sample is
 * uniform in t, so a cluster's share of the coloured samples is its share of
 * the coloured length; how much of a rendered SHAPE it covers depends on the
 * style and the angle, which are the viewer's, not the palette's.
 *
 * Measured over the fixture, the loudness ratio (minor cluster's chroma over
 * the dominant's) among the 68 palettes with a minor cluster this small runs
 * p50 0.49, p90 0.93, max 1.17: real accents are rare here and none of them is
 * dramatic. That is the corpus, not the threshold — the inventory's test is
 * "its C ≥ dominant's" and it is left where the inventory put it.
 *
 * WHAT DID MOVE (QA round 4) is what may BE the accent. The row's only fixture
 * witness was a near-black-to-olive neutral ramp: minor chroma 0.0328 against
 * the field's 0.0319, a 3% edge between two grays, and the accent it named was
 * stop 0 (#000108, L 0.075) — the black end. So the accent has to be a colour
 * (`visibleCluster`), and the STRONG band asks for a real edge rather than any
 * edge: FAMILY_CHROMA + a JND at mid lightness (0.02) over the field, the same
 * unit `hue contrast` takes. Measured: the fixture holds 4 palettes with a
 * minor cluster this small and at least as loud, 3 survive the visibility gate
 * (the loudest is a dark-teal field with a coral end, 16% of the run at chroma
 * 0.088 against 0.076) and 0 clear the strong band, against 1 before — that one
 * being the false witness. A term true of three palettes and prominent on none
 * is exactly D24.1's boundary case: it keeps its tag and its page, and it does
 * not spend a chip.
 */
export function extensionContrast(f: PaletteFeatures, accentShare = 0.2, margin = 0): boolean {
  if (f.hueClusters < 2) return false;
  const minor = minorCluster(f);
  return (
    f.clusterShares[minor]! <= accentShare &&
    visibleCluster(f, minor) &&
    f.clusterChromas[minor]! >= f.clusterChromas[majorCluster(f)]! + margin
  );
}

/**
 * Two loud hues at an awkward interval — the clash.
 *
 * COMPUTABLE, AND NEVER SPOKEN. It is an aesthetic verdict about somebody's
 * saved palette, and the same fact is available without the judgement as
 * `duotone` plus the separation. The entry exists so the vocabulary knows the
 * concept and the tag filter can answer it, with `strong` unreachable exactly
 * like `multicolor` and `wcag-aa`.
 */
/** A JND of chroma at mid lightness: the edge an accent needs to BE one. */
const ACCENT_MARGIN = 0.02;

const DISCORD_MIN_SEPARATION = 80;
const DISCORD_CHROMA = 0.15;

export function isDiscord(f: PaletteFeatures): boolean {
  if (f.hueClusters !== 2) return false;
  const d = arcDistance(f.clusterHues[0]!, f.clusterHues[1]!);
  return (
    d >= DISCORD_MIN_SEPARATION &&
    d < T.COMPLEMENTARY_SEPARATION &&
    f.clusterChromas.every((c) => c >= DISCORD_CHROMA)
  );
}

/**
 * The chroma a pair of iso-luminant hues needs before the edge between them
 * VIBRATES (research-colorTheory §6, "prose 'vibrating' only with C̄ ≥ 0.12").
 *
 * Measured, the fixture agrees with the inventory and the cut is clean: the
 * nine palettes that passed the old lightness-and-span strong band measure mean
 * chroma 0.027, 0.028, 0.037, 0.039, 0.048 — five flat grays whose "hue span"
 * is the noise the row's misuse note warns about — and 0.135, 0.166, 0.182,
 * 0.196. Nothing lands between 0.048 and 0.135.
 */
const VIBRATION_CHROMA = 0.12;

/**
 * Itten's FIRST contrast, of hue: distinct hues set against each other.
 *
 * The chroma conjunct is definitional rather than decorative — the angle
 * between two grays is arithmetic on noise — and it is FAMILY_CHROMA, the same
 * floor the registry already requires before it will name a hue family at all.
 *
 * ABSOLUTE CHROMA, NOT SATURATION, AND ON PURPOSE (D19). The rule of thumb is
 * that identity questions ("is there colour here") take the relative reading
 * and loudness questions ("how strong is it") stay absolute — and this row is a
 * loudness question, because Itten's first contrast is at full strength between
 * the pure hues and weakens as they are diluted. A pale peach against a pale
 * blue has hue VARIETY; the contrast is what the dilution took out of it.
 * Measured over the fixture, of the 477 palettes spanning 90° or more the
 * absolute floor admits 301 and a relative one (FAMILY_SATURATION) would admit
 * 310; the 46 it would add and this one refuses are pale tints (C̄ 0.044-0.053
 * at L̄ 0.89-0.95) and dark dilutions (C̄ 0.061-0.065 at L̄ 0.48-0.53), which is
 * the class the argument is about.
 */
export const hueContrast = (f: PaletteFeatures) =>
  f.hueSpan >= 90 && f.meanChroma >= T.FAMILY_CHROMA;

// -----------------------------------------------------------------------------
// ROWS OF §5-§6 THAT DELIBERATELY GET NO TERM OF THEIR OWN (D25.3)
//
// Computable, but a second name for something the table already carries. A
// synonym is not free: it doubles the chip row's vocabulary, splits the tag
// filter's traffic across two destinations that must never disagree, and gives
// the reader two words for one fact.
//
//   Itten 2, light-dark contrast   → `high-contrast` / `low-contrast`, which are
//                                    ΔL bands already. "Value contrast" is the
//                                    painter's name for the same measurement.
//   Itten 4, complementary contrast → `complementary` IS this row; the entry
//                                    records it in its note.
//   Itten 5, simultaneous contrast  → not a property of the palette at all; see
//                                    the file header. The TRIGGER is computable
//                                    (a chromatic sample beside a neutral one)
//                                    and still says nothing about the palette,
//                                    only about what a viewer's surround might
//                                    do to it.
//   achromatic / monochromatic      → `grayscale` / `monochrome`. The repo's
//                                    words, the indexed ones, and the ones the
//                                    inventory's own misuse row insists must
//                                    stay distinct from each other.
//   WCAG AA-large (CR ≥ 3)          → measured 0.5986 of the fixture. A tag two
//                                    palettes in three satisfy carries no
//                                    information, and the advice sentences that
//                                    might have used it were deleted by D21.1.
//                                    `wcag-aa` (4.5) and `wcag-aaa` (7) ship.
//   harmony (the umbrella)          → the classification itself, not a
//                                    characteristic of it. `classifyStructure`
//                                    is the answer to "which harmony".
// -----------------------------------------------------------------------------

export const CHARACTERISTICS: readonly Characteristic[] = [
  // --- HARMONY: the exclusive structure ladder --------------------------------
  wrap(
    'grayscale',
    // BOTH readings halved, not only the absolute one (QA round 6). `test` is
    // `isGrayscale`, which is a conjunction - little chroma AND little to be had
    // - or a low chromatic fraction; halving one conjunct left the margin
    // answering a question the identity gate does not. A lavender-white to
    // sage-gray ramp (stop hues 302.6, 329.1, 24.3, 75.4, 96.5, 123.5, 177.2)
    // came through at denseMeanChroma 0.0123 against a bar of 0.0125 - 1.6% past
    // it, the boundary case D24.1 says must stay a tag - while measuring
    // denseMeanSaturation 0.231, the HIGHEST of the eight the margin admitted
    // and all but touching GRAYSCALE_SAT itself. Halved on both axes the margin
    // means what the word means: 8 -> 6 strong.
    (f) =>
      f.denseMeanChroma < T.GRAYSCALE_CHROMA / 2 &&
      f.denseMeanSaturation < T.GRAYSCALE_SAT / 2,
    0.0219,
    0.0069,
    {
    axis: 'harmony',
    implies: ['warm gray', 'cool gray'],
    note: 'Strong = half the grayscale chroma ceiling AND half its saturation ceiling: no colour at all, not merely too little to name. It shadows the two LEAN words (QA round 5): a palette the registry says has no colour cannot also usefully be told which way its colour leans - at mean chroma 0.011 the lean is at the edge of visibility - and a row was printing `grayscale` and `cool gray` as two facts. Measured, 8 of the 19 grayscale palettes carry a lean; where they do not there is nothing to shadow. Under CHIP_SUPPORT_FLOOR (19 palettes against a 24-slot page) the word is a tag and a filter and never a chip, so the pairing it was written for can no longer reach a row at all.',
    },
  ),
  wrap('monochrome', (f) => f.hueSpan < 15, 0.158, 0.0623, {
    axis: 'harmony',
    note: 'Strong = half MONOCHROME_SPAN. One hue, not one hue plus a lean.',
  }),
  wrap('duotone', (f) => f.clusterSeparation >= 60 && f.maxClusterWidth < 30, 0.0369, 0.0231, {
    axis: 'harmony',
    implies: ['hue contrast'],
    note: 'Strong = the two hues are a sixth of the wheel apart and each is tight. A duotone whose clusters nearly touch is an analogous pair with a gap. It shadows `hue contrast` (Itten 1): naming the geometry already says the hues are set against each other.',
  }),
  wrap(
    'complementary',
    (f) =>
      f.clusterSeparation >= 165 ||
      // THE MARGIN ON THE SWEEP ROUTE IS THE POLE SHARE, and only that (F5).
      // `both` is left at MASS_BOTH_SHARE deliberately — see the note.
      opposedHueMasses(f, { pole: 0.3 }),
    0.0577,
    0.0392,
    {
      axis: 'harmony',
      // ...and Itten's THIRD as well as his first, where the opposed pair is the
      // warm-cool pair (QA round 6). On a complementary palette it usually is:
      // the blue-yellow and green-red opponent axes ARE the temperature axis, so
      // `complementary | warm cool contrast` is one observation named twice, and
      // 4 of the 10 complementary rows printed both. The specific word keeps the
      // slot; `warm cool contrast` still speaks on the many palettes that set
      // warm against cool without being complementary (198 test against 52).
      implies: ['hue contrast', 'warm cool contrast'],
      note: 'Strong = within 15 degrees of the true opposite by the cluster route, or two DOMINANT masses by the sweep route (D24.2): each pole a THIRD of the chromatic run against the plain band\'s fifth. One number moved, and it is the one that carries the meaning - a mass that is a third of the run is a colour the palette is MADE of, a fifth is a colour it passes through. The pair-sum conjunct stays at MASS_BOTH_SHARE (0.8), i.e. the plain bar, because at pole 0.3 it no longer binds: measured over the fixture\'s 28 non-cluster complementaries, the pole conjunct alone refuses 14 of them and the LOWEST sum among the 14 it admits is 0.804, already past 0.8. A second bar at 0.85 therefore did not measure a margin, it clipped three palettes off the bottom of a distribution the pole had already cut in half - and one of the three was the owner\'s screenshot itself (masses 0.438 at h30 and 0.375 at h240, sum 0.813, separation 150), the exact palette D24.2 added this route for, which was carrying the word in its <h1> and its description while its chip row silently dropped it. The 0.875 figure the previous note quoted for that palette does not reproduce against this code and was the reason the error survived a round. Over the fixture: 50 true, 34 strong - 22 by clusters, 20 by masses, 8 by both, so 12 rows reach the word only through the sweep route this margin was widened for (31 before, and the 3 it gains are the 3 the redundant bar had clipped). Itten\'s FOURTH contrast is this term, not a separate one, and it shadows his first.',
    },
  ),
  wrap(
    'rainbow',
    (f) =>
      hueBandShare(f, 330, 120) >= RAINBOW_POLE_MASS &&
      hueBandShare(f, 150, 300) >= RAINBOW_POLE_MASS &&
      f.denseMinChroma > T.MUTED_CHROMA &&
      // ...AND THERE IS A RED OR AN ORANGE IN IT (QA round 6). The two pole
      // windows read `hueHistogram`, whose samples qualify at CHROMA_FLOOR, so
      // an arc can be "warm" while every warm sample in it is a tan or an olive
      // nobody would name a colour. The filed palette walks 270 -> 124 in one
      // cluster and renders blue, violet, mauve, tan, olive, yellow-green: no
      // red and no orange anywhere, warm mass 0.35 by the chroma floor and ZERO
      // at FAMILY_CHROMA across the whole red-orange band. `vividHueBandShare`
      // asks the second question; the band is the red and orange families of
      // this repo's own partition (FAMILY_ANCHOR_HUES, red 29 and orange 53,
      // bounded by magenta at 358.5 and yellow at 81.5). Measured: 3 of the 29
      // the margin admitted hold no nameable red or orange, and they are the
      // three the visual QA called crossfades rather than spectra.
      vividHueBandShare(f, RED_ORANGE_BAND[0], RED_ORANGE_BAND[1]) > 0,
    0.0865,
    0.0311,
    {
      axis: 'harmony',
      implies: ['hue contrast', 'spectral order'],
      note: 'THE MARGIN IS THE POLES AND THE COLOUR IN BETWEEN, NOT THE SPAN (QA round 4). It was five sixths of the wheel, which refused a palette whose own <h1> says the word - indigo, red, blue, green, lime, cyan, coral spans 265.4 degrees, so the page printed "Rainbow dark indigo to..." and offered no rainbow link - while admitting 300-degree pastel washes. Two conjuncts, both measured over the 75 structure-rainbows: (1) a QUARTER of the chromatic mass on each side of the wheel, the same two windows the classifier and `warm`/`cool` read (shares run 0.13-0.77; 0.25 keeps 57 and refuses the lopsided ones, a wash at 0.65 warm against 0.13 cool, a teal ramp at 0.14/0.70); (2) the run never goes MUTED. The second is what separates a spectrum from a CROSSFADE, and the visual QA is the reason it exists: a magenta-to-aqua ramp and a prussian-blue-to-tan ramp both clear span and poles and both cross the wheel through a desaturated middle, so all a viewer sees is the two ends blending (measured denseMinChroma 0.047 and 0.052), against 0.091 and 0.082 for the two the QA called obvious rainbows. Together: 29 of 75, against 28 for the old span rule and a better 29 - the 265-degree rainbow is in and the pastel washes are out. It shadows `spectral order` where both fire: 64 of the 75 rainbows walk the hues in order, and the visitor knows the first word.',
    },
  ),
  wrap('analogous', (f) => f.hueSpan <= 60, 0.2849, 0.1257, {
    axis: 'harmony',
    note: 'D24.3: only when TIGHT. ANALOGOUS_SPAN reaches 95 degrees, which is a quarter of the wheel and reads as a journey; 60 is the classical +-30 adjacency.',
  }),
  wrap('multicolor', () => false, 0.3541, 0.0, {
    axis: 'harmony',
    tagOnly: true,
    note: 'NEVER prominent (D24.3). It is the residual class - what is left when no geometry fits - so by construction it cannot pop out. Kept in the registry because it is a true tag and an embed value.',
  }),

  // --- FAMILY: a hue window plus a tone constraint ----------------------------
  wrap(
    'sunset',
    (f) => hueBandShare(f, 20, 100) >= 0.25 && f.meanChroma >= T.FAMILY_CHROMA,
    0.1338,
    0.098,
    {
      axis: 'family',
      note: 'Strong = a quarter of the mass in the orange-to-yellow arc, not the 10% the word needs to be true - AND real colour (QA round 5). The hue-mass reading alone is the exact misuse the inventory warns of: a dark dull olive-ochre-to-rust ramp at mean L 0.430 and mean C 0.073 fired STRONG on hue mass and chipped `sunset` beside `autumn`, which is the accurate word for a warm palette that is neither bright nor saturated. FAMILY_CHROMA is the registry\'s own bar before it will name a hue family at all, and this term is on the family axis; the plain descriptor keeps its looser sunset-specific 0.07 dual reading, so nothing leaves the tag or the page.',
    },
  ),
  wrap('ocean', (f) => hueBandShare(f, 180, 280) >= 0.95 && f.meanChroma >= 0.08, 0.1003, 0.0761, {
    axis: 'family',
    note: 'Strong = almost every chromatic sample in the cyan-to-blue window AND real chroma, so a washed sky does not outrank a sea.',
  }),
  wrap('autumn', (f) => hueBandShare(f, 20, 70) >= 0.5, 0.0288, 0.0254, { axis: 'family' }),

  // --- TEMPERATURE ------------------------------------------------------------
  wrap(
    'warm',
    (f) => hueBandShare(f, 330, 120) >= 0.85 && f.hueConcentration >= LEAN_CONCENTRATION,
    0.4602, 0.2168,
    {
      axis: 'temperature',
      note: 'Strong = 85% of the chromatic mass inside the warm arc and a hue mean its samples agree on. `warm` alone is a mean-hue claim and 46% of the corpus satisfies it.',
    },
  ),
  wrap(
    'cool',
    (f) => hueBandShare(f, 150, 300) >= 0.85 && f.hueConcentration >= LEAN_CONCENTRATION,
    0.3599, 0.1995,
    { axis: 'temperature' },
  ),

  // --- TONE -------------------------------------------------------------------
  wrap(
    'pastel',
    // TWO ROUTES TO THE MARGIN, one per axis (QA round 6). `pastel` is
    // "light AND low-chroma together", so a margin on the chroma half alone
    // demands a HALF-pastel and refuses the palettes that are pastel by being
    // very pale: the filed case (pale cyan, mint, cream, wheat, peach, salmon -
    // the most obviously pastel image in its batch) measures L 0.900 with
    // C 0.0875, inside the inventory's own row (L > 0.78, 0.025 <= C < 0.09) and
    // outside a chroma bar of PASTEL_CHROMA * 0.75 = 0.0675, so its row spent
    // its one fact on `high-key` - the photographic term for the VALUE half.
    // The second route is the same margin taken on the other conjunct: past
    // NEAR_WHITE_L the palette is a tint of white by lightness alone. Measured:
    // 34 -> 58 strong of the 71 the term is true of, 18 of the 24 added sitting
    // above mean L 0.85.
    (f) =>
      f.meanLightness > 0.82 &&
      (f.meanChroma < T.PASTEL_CHROMA * 0.75 || f.meanLightness >= NEAR_WHITE_L),
    0.0819,
    0.0542,
    { axis: 'chroma' },
  ),
  wrap(
    'neon',
    // ...AND THE RUN IS NOT LOSING ITS COLOUR (QA round 6). `denseChromaP90` is
    // the LOUDEST TENTH, deliberately - one neon stop does not make a neon
    // palette, and a tenth of the run does. But a tenth is also all a
    // DESATURATING ramp needs: the filed palette is electric for its leftmost
    // fifth (53 of 256 samples at NEON_CHROMA) and then collapses 0.280 ->
    // 0.086, so the row printed `neon` and `desaturating` - two tone chips
    // making opposite claims about one image - and 12 of the 38 rows chipping
    // `neon` printed both. A loudest-tenth claim yields to the whole run's own
    // trend, at `desaturating`'s own threshold so the two cannot disagree about
    // which way the chroma is going.
    (f) => f.denseChromaP90 >= T.NEON_CHROMA + 0.02 && f.chromaTrend >= -0.08,
    0.0796,
    0.0346,
    {
    axis: 'chroma',
    implies: ['luminous'],
    // `luminous` is the H-K gated word for chroma that has not gone light, and
    // a neon is that with the volume up: 34 of the 46 strong neons are also
    // luminous, and on those rows the two chips sat side by side saying one
    // thing (QA round 4). Not a containment - the 12 that are not luminous are
    // neons that HAVE gone light - so where the broader word does not fire
    // there is nothing to shadow.
  }),
  wrap('earthy', (f) => f.meanChroma <= T.MUTED_CHROMA, 0.1015, 0.0415, { axis: 'chroma' }),
  wrap('muted', (f) => f.meanChroma <= T.MUTED_CHROMA - 0.01, 0.1073, 0.0738, { axis: 'chroma' }),
  {
    // THE BAND `muted` CANNOT REACH (QA round 6).
    //
    // `muted` is an ABSOLUTE claim - mean chroma under MUTED_CHROMA - and D19
    // is right that loudness questions take absolute chroma. But the sRGB
    // ceiling is not flat: at mid lightness a palette can sit well above 0.055
    // and still be using less than half the chroma its own lightness allows,
    // and that palette looks greyed to anybody who sees it. The filed case is
    // the softest image in its QA batch - a hazy blue-violet fade, every stop
    // at C <= 0.091, dense relative saturation 0.385 - and the registry had
    // NOTHING to say about its chroma: `muted` misses on 0.065 > 0.055 and
    // `pastel` misses because the dark end pulls mean L to 0.581. Measured
    // over the fixture, 85 palettes sit in that band and 75 of them carried no
    // chroma-axis chip at all.
    //
    // So `dusty` is the RELATIVE reading of the same idea, and the two are
    // disjoint by construction rather than by luck: the entry is floored at
    // MUTED_CHROMA precisely so it starts where `muted` stops, and the measured
    // overlap over the fixture is 0 of 85. This is also the answer to the
    // inventory's "dusty = muted; prose synonym" (see the section-3 notes
    // below, which said the same until this was measured): the WORD is a
    // synonym, the BAND is not, and what ships here is the band.
    //
    // Relative saturation is read DENSE, the same reading `isGrayscale` uses
    // for the identity question, because the eye reads the run and not the
    // seven stops. Margin: the next tenth, this file's convention for a share
    // threshold - 85 -> 32 (9.80% -> 3.69%).
    term: 'dusty',
    axis: 'chroma',
    test: (f) =>
      f.meanChroma >= T.MUTED_CHROMA && f.denseMeanSaturation < DUSTY_SATURATION,
    strong: (f) =>
      f.meanChroma >= T.MUTED_CHROMA && f.denseMeanSaturation < DUSTY_SATURATION - 0.1,
    prevalence: 0.098,
    strongPrevalence: 0.0369,
    note: 'Colour that is present but greyed RELATIVE to what its lightness allows - the band between `muted` (absolute, under 0.055) and a palette using its gamut. Never a synonym of `muted`: the two sets do not intersect.',
  },
  wrap('dark', (f) => f.meanLightness < T.DARK_LIGHTNESS - 0.05, 0.1119, 0.0542, { axis: 'value' }),
  wrap('light', (f) => f.meanLightness > T.LIGHT_LIGHTNESS + 0.05, 0.1603, 0.0842, { axis: 'value' }),
  wrap('vivid', (f) => f.meanChroma >= T.VIVID_CHROMA + 0.02, 0.2134, 0.1176, { axis: 'chroma' }),

  // --- CONTRAST and KEY -------------------------------------------------------
  wrap('high-contrast', (f) => f.lightnessRange > 0.75, 0.1223, 0.0346, { axis: 'contrast' }),
  wrap(
    'low-contrast',
    // ...AND THERE IS A GRADIENT TO HAVE CONTRAST IN (QA round 6). The word
    // promises a range that is small but PRESENT; the one solid palette in the
    // corpus has a range of exactly zero, and the row it produced read
    // `white | solid | pure-white-plateau | grayscale | near-white |
    // low-contrast` — six chips for #ffffff seven times. `solid` is the
    // descriptor's own test (all three channel ranges under
    // SOLID_CHANNEL_RANGE), referenced rather than restated so the two words
    // cannot drift apart, exactly as `isJewel` references `neon`. Measured:
    // 51 -> 50 strong, and the palette it removes is the whole `solid` class.
    (f) => f.lightnessRange < 0.08 && !SOLID.test(f),
    0.1084,
    0.0577,
    { axis: 'contrast' },
  ),
  wrap('high-key', (f) => f.meanLightness > 0.82 && f.lightnessRange < 0.2, 0.1949, 0.09, {
    axis: 'value',
    implies: ['light'],
    // DEFINITIONAL, and confirmed: the strong band is mean L > 0.82 and `light`
    // is mean L > LIGHT_LIGHTNESS (0.8), so every high-key palette is a light
    // one — 78 of 78 over the fixture. High key adds the COMPRESSED RANGE,
    // which is why it survives beside `light` rather than the other way round.
  }),
  wrap('low-key', (f) => f.meanLightness < 0.35 && f.lightnessRange < 0.2, 0.0554, 0.0127, {
    axis: 'value',
    implies: ['dark'],
    // The same entailment on the other end: 0.35 is under DARK_LIGHTNESS
    // (0.42), 11 of 11 over the fixture.
  }),
  wrap(
    'iso-luminant',
    (f) => f.lightnessRange < 0.05 && f.hueSpan > 90 && f.meanChroma >= VIBRATION_CHROMA,
    0.0577,
    0.0046,
    {
      axis: 'contrast',
      // ...and the VALUE BANDS, for the same reason one step out (QA round 6).
      // A palette whose whole run sits inside 0.05 of lightness sits inside ONE
      // band by construction, so `highlight band` adds only WHICH band the
      // single lightness is in — not a second thing to see — and 2 of the 4
      // iso-luminant rows printed both. Measured over the fixture: 42 of the 50
      // iso-luminant palettes fire a band term, and every one of them fires
      // exactly one.
      implies: ['low-contrast', 'shadow band', 'midtones', 'highlight band'],
      // DEFINITIONAL, and it was undeclared until QA round 5 found a row
      // spending two chips on it: iso-luminant opens with lightnessRange < 0.05
      // and `low-contrast`'s whole test is lightnessRange < LOW_CONTRAST_RANGE
      // (0.12), so the first entails the second — 50 of 50 over the fixture,
      // and 3 of the 4 rows that chipped iso-luminant printed both. The
      // narrower word adds the hue span and the chroma, which is why it is the
      // one that speaks.
      note: 'Itten has no name for this one; the vibration it produces is the point. Strong = half the licensing range, a hue span a quarter of the wheel wide, and CHROMA - two grays at one lightness do not vibrate, they are one gray.',
    },
  ),

  // --- GRADIENT: shape, trajectory, surface -----------------------------------
  wrap('ramp', (f) => f.turns === 0 && f.lightnessRange >= OMBRE_RANGE, 0.5859, 0.3126, {
    axis: 'gradient',
    note: 'Strong = a ramp that actually travels. 58.6% of the corpus has no turning point, which says nothing; a monotone run across a median lightness range is the thing a reader sees.',
  }),
  wrap('arch', (f) => f.lightnessRange >= OMBRE_RANGE, 0.1246, 0.0473, {
    axis: 'gradient',
    also: arches,
    note: 'AN ARCH IS A PEAK (QA round 4). The descriptor counts turns and is direction-blind, so 41 of the 125 palettes it called an arch are VALLEYS - one measured L 0.74, 0.64, 0.74, 0.89, 0.97, 0.98, 0.99, a 0.10 dip followed by a 0.35 climb, and the word promises the opposite shape. The conjunct is `bright-middle`\'s own end-drop test without its position window (the peak may sit anywhere, it simply has to BE the peak), so the two readings of "brighter in the middle" cannot disagree. Measured 277 -> 188 test, 125 -> 82 strong; the removed palettes keep `dark-middle`, which is the registry\'s word for the shape they actually have.',
  }),
  wrap('wavy', (f) => f.turns >= 3, 0.0946, 0.0265, { axis: 'gradient' }),
  wrap('saturating', (f) => f.chromaTrend > 0.08, 0.1834, 0.0761, {
    axis: 'chroma',
    also: (_f, ctx) =>
      endChroma(ctx) > startChroma(ctx) && endSaturation(ctx) > startSaturation(ctx),
    note: 'Strong = NAMEABLE_CHROMA_MOVE, the distance at which the prose is willing to name the move. The ends have to agree with the trend - see `desaturating` - on BOTH readings of the axis, chroma and relative saturation (QA round 5, see startSaturation).',
  }),
  wrap('desaturating', (f) => f.chromaTrend < -0.08, 0.1269, 0.0346, {
    axis: 'chroma',
    also: (_f, ctx) =>
      endChroma(ctx) < startChroma(ctx) &&
      endSaturation(ctx) < startSaturation(ctx) &&
      // ...AND THE COLOUR WENT SOMEWHERE OTHER THAN OUT WITH THE LIGHT (QA
      // round 6). A ramp whose last sample is under BLACK_L has no chroma left
      // to lose: the trend is negative by construction (one filed row measures
      // 0.118 -> 0.242 -> 0.000 on a #ff0000 -> #000000 fade), and the row it
      // produced said the same thing four times - `almost black`, `fade to
      // black`, `desaturating`, `neutral-anchored`. What that palette does is
      // DARKEN, and the registry has the words for it. Measured: 113 -> 110
      // test and 32 -> 30 strong.
      (ctx.stops[ctx.stops.length - 1]?.L ?? 0) >= BLACK_L,
    note: 'THE ENDS DECIDE THE DIRECTION (QA round 4), on both readings of the axis since round 5 (see startSaturation). chromaTrend is mean(dense last half) - mean(dense first half), and a plateau anywhere in the second half can invert it: a cream -> gold -> blood orange -> maroon -> PURE BLACK -> dark teal -> vivid jade ramp measured -0.0922 because 12.5% of its run is at chroma 0.000, while end to end its chroma RISES 0.059 -> 0.141 and the last swatch is the second most saturated thing in the image. The trend keeps the claim (it is the shape of the run) and the rendered ends veto it (they are what a reader compares). Measured 157 -> 152 test, 51 -> 47 strong, and the 4 strong fires it removes are the two twin black-plateau seeds and their near-duplicates.',
  }),
  wrap('seamless', (f) => f.seam < 0.02, 0.0461, 0.0231, {
    axis: 'gradient',
    note: 'Strong = LOOP_SEAM: the ends match inside a JND, so the palette tiles without a visible join.',
  }),
  wrap('clipped', (f) => f.clipped >= 0.5, 0.4037, 0.2364, {
    axis: 'gradient',
    tagOnly: true,
    note: 'TAG ONLY, and D24.3 is the reason: the clipping facts may chip only "where they are visually obvious (a real black or white plateau, not a marginal one)". This is the marginal one - a quarter of the dense samples with SOME channel at an extreme, true of 40% of the corpus, and what a visitor would see on its page is nothing in common. The obvious ones (`clipped-highlights`, `crushed-shadows`, the two plateaus) chip and each says WHICH end went flat.',
  }),
  wrap('unclipped', undefined, 0.1788, 0.1788, {
    axis: 'gradient',
    tagOnly: true,
    note: 'A coefficient-level guarantee (a +- |b| inside [0,1] on every channel), so there is no margin to have: it is exact and it is either true or it is not.',
  }),
  wrap('flat-channel', undefined, 0.1096, 0.1096, {
    axis: 'gradient',
    tagOnly: true,
    note: 'One RGB channel is constant across the run. Exact like `unclipped`, and invisible in the same way: the fact is about the coefficients, and two palettes sharing it need not look remotely alike.',
  }),
  wrap('solid', undefined, 0.0012, 0.0012, {
    axis: 'gradient',
    note: 'The degenerate palette. Exact, like `unclipped`.',
  }),
  wrap('wcag-aa', () => false, 0.4095, 0.0, {
    axis: 'contrast',
    tagOnly: true,
    note: 'TAG ONLY (D25.2). A contrast ratio is a fact about a TEXT PAIRING, not about how the palette looks, and D21.1 deleted the advice sentences that used to spend it - so the term stays filterable and never becomes a chip. Same device as `multicolor`: strong is deliberately unreachable.',
  }),
  // ...and BOTH per-channel clips are TAG ONLY, which the visual QA decided
  // against the first reading of D24.3. The clause admits the clipping facts
  // "where they are visually obvious (a real black or white plateau, not a
  // marginal one)", and a channel is not a plateau: rendered, the fixture's
  // clipped-highlight palettes are #fada61 -> #ff5acd (gold to hot pink, red
  // pinned) and #8ec5fc -> #e0c3ff (pale blue to lavender, blue pinned), where
  // nothing looks blown out, and its crushed-shadow palettes include
  // #00ffc4 -> #00c08f, a BRIGHT mint whose red channel is simply zero. The
  // photographic reading of the words promises something the picture does not
  // show, so they stay in the tags and the embedding (where "which channel ran
  // out" is a real retrieval axis) and the two plateaus carry the visible half.
  wrap('clipped-highlights', (f) => f.channelHiClip.some((s) => s >= 0.5), 0.2468, 0.1107, {
    axis: 'gradient',
    tagOnly: true,
    implies: ['clipped'],
    // DEFINITIONAL: `clipped` is the share of dense samples with ANY channel at
    // an extreme (>= CLIPPED_FRACTION, 0.25), and a channel pinned high through
    // half the run puts half the samples in that set. 96 of 96 over the
    // fixture; `crushed-shadows` is the same argument at the other end, 52 of
    // 52. Both stay in the registry because they say WHICH end clipped, which
    // is the visible fact.
  }),
  wrap('crushed-shadows', (f) => f.channelLoClip.some((s) => s >= 0.5), 0.1857, 0.06, {
    axis: 'gradient',
    tagOnly: true,
    implies: ['clipped'],
  }),
  {
    // THE VISIBLE HALF OF THE INVENTORY'S "flat spots" ROW (QA round 5).
    //
    // This entry contradicts a note this file used to carry — that flat spots
    // were "already shipped, under the name `clipped`" — and the round showed
    // the two are different measurements of different things. `clipped` is the
    // share of dense samples with SOME channel at the clamp: a coefficient
    // fact, true of 40% of the corpus, and TAG ONLY for exactly that reason.
    // A flat spot is a stretch where the COLOUR STOPS CHANGING, which is what
    // a viewer sees.
    //
    // The palette that filed it is the proof they come apart: a butter-yellow
    // plateau for five of seven stops (L 0.984 0.982 0.980 0.980 0.981, chroma
    // spread 0.024) that then jumps to peach and pink. Its `clipped` share is
    // 1.000 — every sample has a channel pinned — and `clipped`,
    // `clipped-highlights` and `flat-channel` all fired STRONG, all three
    // tagOnly, so the plateau-and-jump that IS the palette's structure reached
    // a four-chip row as nothing at all. `clipped` cannot describe it either
    // way: the last two stops are pinned too and they are where the picture
    // moves.
    //
    // D24.3 admits the clipping facts "where they are visually obvious (a real
    // black or white plateau, not a marginal one)", and the two pure plateaus
    // below are the sub-case where the flat colour happens to be a clamp
    // corner. This is the general one, and it does not need a clamp at all: a
    // cosine with a small enough amplitude flattens without touching either
    // end.
    term: 'flat spot',
    axis: 'gradient',
    tagOnly: true,
    test: (f) => f.flatRunShare >= FLAT_SPOT_RUN && f.flatRunContrast >= FLAT_SPOT_CONTRAST,
    strong: (f) =>
      f.flatRunShare >= 2 * FLAT_SPOT_RUN && f.flatRunContrast >= FLAT_SPOT_CONTRAST,
    prevalence: 0.2007,
    strongPrevalence: 0.03,
    note: 'A run of the ramp where the colour does not change - every sample inside one JND of the run\'s first, and the rest of the ramp getting COLOR_MATCH_MAX away from it. Strong = a third of the ramp, twice the sixth the plain word needs, which is the same doubling `pure-black-plateau` takes over PLATEAU_SHARE. Measured 174 test, 26 strong; without the contrast conjunct it fires on 183 and 29, and the 9 it refuses are palettes that are one colour end to end, where the honest words are `low-contrast` and `monochrome`.',
  },
  wrap('pure-black-plateau', (f) => f.allBlackShare >= 0.2, 0.0242, 0.0115, { tagOnly: true,
    axis: 'gradient',
    note: 'D24.3 admits the clipping facts only where they are VISUALLY OBVIOUS: strong is twice PLATEAU_SHARE, a fifth of the run pinned at pure black.',
  }),
  wrap('pure-white-plateau', (f) => f.allWhiteShare >= 0.2, 0.0069, 0.0069, { tagOnly: true, axis: 'gradient' }),

  // --- HUE: travel and direction ----------------------------------------------
  // The signed direction tags and the arc language: TAG ONLY, all four. They
  // are how this codebase MEASURES hue geometry, and `spectral order`,
  // `rainbow`, `analogous` and the hue names are how the inventory NAMES the
  // same geometry - see the `tagOnly` docstring. `spectral order`'s own note
  // records the overlap this resolves: all 229 spectral-order palettes carry
  // one of the two direction tags, and splitting the walk by direction made
  // each half look RARER than the refinement that covers both, so ranking
  // alone would have printed the measurement's word and shadowed the
  // designer's.
  wrap('hue-advancing', (f) => f.hueTravel >= 180, 0.1776, 0.0634, {
    axis: 'hue',
    tagOnly: true,
    note: 'Strong = half the wheel travelled in one direction, twice the 90 degrees the direction word needs to be true.',
  }),
  wrap('hue-reversing', (f) => f.hueTravel >= 180, 0.173, 0.0611, {
    axis: 'hue',
    tagOnly: true,
  }),
  wrap('full-wheel', undefined, 0.0242, 0.0242, {
    axis: 'hue',
    tagOnly: true,
    note: 'Already a 330-degree net rotation; a margin past a full turn would mean nothing.',
  }),
  wrap('hue-wandering', (f) => Math.abs(f.hueTravel) >= 240, 0.0554, 0.0196, {
    axis: 'hue',
    tagOnly: true,
  }),

  // --- VALUE: where the light sits --------------------------------------------
  wrap('bright-middle', (f) => f.denseLightnessRange >= OMBRE_RANGE, 0.1153, 0.0531, { tagOnly: true,
    axis: 'value',
    implies: ['arch'],
    note: 'Strong = the arch travels a median palette\'s worth of lightness, so the bright middle is a passage rather than a bump. It shadows `arch` since QA round 4, when `arch` stopped being direction-blind: the two now make the same claim and this one adds WHERE the peak sits (the middle third), so 36 of the 41 strong arches are also bright-middle and 19 rows were printing both.',
  }),
  wrap('dark-middle', (f) => f.denseLightnessRange >= OMBRE_RANGE, 0.0704, 0.0311, { tagOnly: true, axis: 'value' }),
  // Both DEFINITIONALLY ramps: the two descriptors' own tests open with
  // `turns === 0`, which is the whole of `ramp`'s. 78 of 78 and 193 of 193 over
  // the fixture. The direction is the visible half, so the direction speaks.
  wrap('darkening', (f) => f.lightnessDelta <= -OMBRE_RANGE, 0.1799, 0.09, {
    axis: 'value',
    implies: ['ramp'],
  }),
  wrap('brightening', (f) => f.lightnessDelta >= OMBRE_RANGE, 0.3437, 0.2226, {
    axis: 'value',
    implies: ['ramp'],
  }),

  // --- The measure-first detectors (research-colorTheory, measured 2026-08-17) -
  {
    term: 'deep',
    axis: 'value',
    test: (f) => isDeep(f),
    strong: (f) => isDeep(f) && f.meanLightness < 0.38 && f.meanChroma >= 0.09,
    prevalence: 0.0542,
    strongPrevalence: 0.0196,
    implies: ['dark'],
  },
  {
    // `jewel tones`, not `jewel`: D24.4 asks for the vocabulary a designer would
    // recognise, the inventory's row is titled "jewel tones", and the phrase is
    // also the searched one ("jewel tone palette"). The predicate did not move.
    term: 'jewel tones',
    axis: 'chroma',
    test: (f) => isJewel(f),
    strong: (f) =>
      isJewel(f) &&
      f.meanChroma >= 0.15 &&
      f.maxChroma >= 0.2 &&
      f.meanLightness <= 0.55 &&
      f.denseMaxLightness <= VALUE_BANDS.midtone,
    prevalence: 0.0484,
    strongPrevalence: 0.0115,
    note: 'The emerald/sapphire/ruby window: mid lightness carrying real chroma. NOT "dark vivid" loosely - the L window is what keeps a neon out. THE MARGIN IS ON THAT WINDOW since QA round 5, because all three of the old strong conjuncts were being cleared by a hair at once - mean L 0.58425 against a 0.6 ceiling, mean C 0.15739 against 0.15, max C 0.21547 against 0.20 - on a palette whose right half is a LIGHT coral at L 0.762, i.e. a tint and not a gem. Both new conjuncts move the L claim by the registry\'s own units: the mean by the 0.05 step at which two stops read as different values, and the run by the band edge above which a sample is a highlight rather than a mid tone.',
  },
  {
    term: 'sepia',
    axis: 'chroma',
    test: (f, ctx) => isSepia(f, ctx.structure),
    strong: (f, ctx) => isSepia(f, ctx.structure) && f.meanChroma <= 0.07,
    prevalence: 0.0058,
    strongPrevalence: 0.0046,
    implies: ['monochrome', 'warm', 'earthy', 'muted'],
    note: 'Rare and correct (D25.4): brown monochromes narrow enough for the gate are unusual live. Recorded, not tuned up. The implications are the predicate read back (QA round 4): sepia IS a warm hue window at low chroma, so a row saying `sepia` and then `earthy` and `warm` says one thing three times - measured, 9 of 9 sepias are `warm`, 7 of 9 `earthy`, 4 of 9 `muted`, and where the broader word does not fire there is nothing to shadow.',
  },
  {
    term: 'ombre',
    axis: 'gradient',
    test: (f, ctx) => isOmbre(f, ctx.structure),
    strong: (f, ctx) =>
      isOmbre(f, ctx.structure) && f.lightnessRange >= 0.55 && f.hueSpan < T.MONOCHROME_SPAN,
    prevalence: 0.1811,
    strongPrevalence: 0.0092,
    implies: ['ramp'],
    note: 'Strong = a lightness journey half again the corpus median AND one hue; measured 43 -> 8. The second conjunct is QA round 5: `isOmbre` accepts the ANALOGOUS structure too, which reaches 95 degrees, and the palette that filed it - a warm near-black at h 39 opening onto an indigo-to-magenta body, hueSpan 41.8 - cleared the lightness bar by 0.0005 and read as a hue journey out of black rather than one colour graduating. An ombré is a one-hue value journey; the plain term keeps the analogous route (and its tag and its page), and the MARGIN is the word taken literally, at MONOCHROME_SPAN. Implies `ramp` definitionally - isOmbre opens with turns === 0 - confirmed 43 of 43 over the fixture.',
  },
  {
    term: 'warm gray',
    axis: 'temperature',
    test: (f) => grayLean(f) === 'warm',
    strong: (f) => grayLean(f) === 'warm' && f.hueConcentration >= 0.85,
    prevalence: 0.0104,
    strongPrevalence: 0.0069,
    implies: ['warm'],
    note: 'A neutral with a consistent lean; the strong band wants the samples to agree on it, not merely to average to it. It shadows the bare temperature word where both fire (QA round 4): "warm gray" already says warm, and the row that printed both was saying one fact at two levels of generality.',
  },
  {
    term: 'cool gray',
    axis: 'temperature',
    test: (f) => grayLean(f) === 'cool',
    strong: (f) => grayLean(f) === 'cool' && f.hueConcentration >= 0.85,
    prevalence: 0.0185,
    strongPrevalence: 0.0115,
    implies: ['cool'],
  },
  {
    term: 'blue-yellow axis',
    axis: 'appearance',
    tagOnly: true,
    test: (f) => opponentAxis(f) === 'blue-yellow',
    strong: (f) =>
      opponentAxis(f) === 'blue-yellow' &&
      hueBandShare(f, 45, 135) + hueBandShare(f, 225, 315) >= 0.95,
    prevalence: 0.2664,
    strongPrevalence: 0.1926,
    note: 'One of the two OkLab opponent axes. A TAG, not prose: "sits on the blue-yellow axis of opponent color" is exactly the analysis vocabulary D20.3 bans from a description.',
  },
  {
    term: 'green-red axis',
    axis: 'appearance',
    tagOnly: true,
    test: (f) => opponentAxis(f) === 'green-red',
    strong: (f) =>
      opponentAxis(f) === 'green-red' &&
      hueBandShare(f, 315, 45) + hueBandShare(f, 135, 225) >= 0.95,
    prevalence: 0.1522,
    strongPrevalence: 0.1096,
  },
  {
    term: 'warm cool contrast',
    axis: 'contrast',
    test: (f) => warmCoolContrast(f),
    strong: (f) =>
      hueBandShare(f, 330, 120) >= 0.4 && hueBandShare(f, 150, 300) >= 0.4,
    prevalence: 0.2284,
    strongPrevalence: 0.0542,
    note: "Itten's cold-warm contrast: both poles PRESENT at once, not a drift from one to the other.",
  },
  {
    term: 'saturation contrast',
    axis: 'contrast',
    test: (f) => saturationContrast(f),
    strong: (f) => saturationContrast(f) && f.denseChromaRange >= 0.22,
    prevalence: 0.0461,
    strongPrevalence: 0.0092,
    note: "Itten's contrast of saturation: pure colour beside near-gray. Plain rate re-measured 2026-08-18 when the detector stopped reading the dense floor through a rendered-max proxy (0.1061 -> 0.098, 7 palettes whose run never comes near gray); the strong band is untouched at 28.",
  },
  {
    term: 'brilliant',
    axis: 'chroma',
    test: (f) => isBrilliant(f),
    strong: (f) => isBrilliant(f) && f.meanChroma >= T.VIVID_CHROMA + 0.02,
    prevalence: 0.0219,
    strongPrevalence: 0.0092,
    implies: ['vivid', 'light', 'high-key'],
    // ...and `high-key` (QA round 4). `brilliant` is vivid AND light, `high-key`
    // is light with a compressed range, and 18 of the 19 palettes that are
    // brilliant are also high-key - the row printed `brilliant monochrome`,
    // `high-key`, `cool` and `brilliant` for a palette whose facts are: one
    // hue, light, vivid. The implication dedupe only walks declared entries, so
    // the more specific word has to name the broader one.
  },

  // --- The monochrome series (research-colorTheory §2) -------------------------
  {
    term: 'tints',
    axis: 'value',
    test: (_f, ctx) => ctx.series === 'tints' || ctx.series === 'tints and shades',
    strong: (_f, ctx) =>
      (ctx.series === 'tints' || ctx.series === 'tints and shades') &&
      Math.max(...ctx.colors.map((h) => hexToOkLch(h).L)) >= 0.9,
    prevalence: 0.0242,
    strongPrevalence: 0.0161,
    implies: ['monochrome', 'near-white'],
    note: 'Base + white. Reads the RENDERED stops, which is where a tint series is visible. It shadows `near-white` (QA round 4): a tint series ENDS pale by definition, so the band word is the transformation word said again with less in it - 6 of the 14 strong tint series also reach the white band, and on those rows the pair was two chips for one observation.',
  },
  {
    term: 'shades',
    axis: 'value',
    test: (_f, ctx) => ctx.series === 'shades' || ctx.series === 'tints and shades',
    strong: (_f, ctx) =>
      (ctx.series === 'shades' || ctx.series === 'tints and shades') &&
      Math.min(...ctx.colors.map((h) => hexToOkLch(h).L)) <= 0.15,
    prevalence: 0.0012,
    strongPrevalence: 0.0012,
    implies: ['monochrome'],
  },
  {
    term: 'tones',
    axis: 'chroma',
    test: (_f, ctx) => ctx.series === 'tones',
    // THE MARGIN IS THE GRAYING, not the dense chroma spread (QA round 4). The
    // old band asked denseChromaRange >= 0.1, which no palette that holds its
    // value can reach once `tones` stops being allowed to fire on a lightening
    // ramp - 0 of 5. The claim is that the colour is being taken OUT, so the
    // margin is SERIES_POLE_CHROMA, the same "lost half its chroma" pole the
    // tint and shade readings take. Measured over the 5: the two that pass run
    // Cmin/Cmax 0.13 (an olive greying to warm gray, a tan greying to mauve)
    // and the three that fail run 0.61-0.73, i.e. one flat colour with a
    // chroma wobble.
    strong: (_f, ctx) =>
      ctx.series === 'tones' &&
      Math.min(...ctx.stops.map((s) => s.C)) <=
        SERIES_POLE_CHROMA * Math.max(...ctx.stops.map((s) => s.C)),
    prevalence: 0.0058,
    strongPrevalence: 0.0023,
    implies: ['monochrome'],
    note: 'Base + gray: chroma falls while the value HOLDS - see seriesReading for the tint/tone conflation this threshold exists to prevent.',
  },

  // --- TEMPERATURE JOURNEY: the stored tag, read not recomputed (D25.2) -------
  //
  // THE DIRECTION is palette-tags', always: the inventory's misuse note for this
  // row is that a serve-time recompute can disagree with the indexed `journey`
  // value, so either cite the stored tag or ship the same formula, never both
  // with different formulas. `test` cites it and nothing here re-derives it.
  //
  // THE MARGIN is not a second opinion about the direction; it asks whether the
  // drift is VISIBLE. The inventory's own warm-cool contrast row is the
  // coexistence fact ("both poles present at once", as against this row's
  // drift), and a palette that warms from one cool hue to another satisfies the
  // stored tag while showing a reader no temperature story at all. Measured
  // over the fixture: the tag alone is true of 302 of 867 (warming) and 315
  // (cooling) - 1.52 and 1.46 bits, the least discriminating pair in the table
  // - and with both zones actually occupied, 89 and 75 (3.28 and 3.53 bits).
  // The 0.25/0.25 shares are warmCoolContrast's own, imported rather than
  // restated, so the pair moves with it.
  {
    term: 'warming',
    axis: 'temperature',
    test: (_f, ctx) => ctx.journey === 'warming',
    strong: (f, ctx) => ctx.journey === 'warming' && visibleJourney(f),
    prevalence: 0.3483,
    strongPrevalence: 0.0715,
    note: 'Direction read off palette-tags (never recomputed); the margin is that both temperature zones are occupied AND that the hue walk has one direction, so the drift is something a reader can follow rather than a hue nudge inside one zone or a cycle averaged into a heading.',
  },
  {
    term: 'cooling',
    axis: 'temperature',
    test: (_f, ctx) => ctx.journey === 'cooling',
    strong: (f, ctx) => ctx.journey === 'cooling' && visibleJourney(f),
    prevalence: 0.3633,
    strongPrevalence: 0.0565,
  },
  // --- CHROMA and TEMPERATURE: inventory sections 3 and 4 (D25.2) ------------
  //
  // Those two sections are 23 rows. Most were already terms in the table above,
  // and this package VERIFIED each against the inventory's own test rather than
  // rewriting it (fixture, 7 steps, 2026-08-18; a mismatch would have been a
  // fix, and two of them were checked hardest because they are the conflations
  // the inventory warns about):
  //   vivid           C >= 0.15                       exact          185
  //   neon            Cmax >= 0.24 & L > 0.45         + the loudest tenth, 69
  //   muted           C < 0.055 & L <= 0.78           exact           93
  //   pastel          L > 0.78 & C < 0.09             exact           71
  //   jewel tones     0.30 <= L <= 0.60, C >= 0.12    exact          106
  //   earthy          0.03 <= C < 0.10, 20 <= h < 110, L < 0.75      88
  //                   (11 of the inventory's 97 are vetoed by a rendered stop
  //                   at VIVID_CHROMA - "earthy implies muted" - and 2 more are
  //                   admitted by D19's identity floor; both are recorded
  //                   deviations in palette-modifiers, not drift)
  //   sepia           monochrome & 50 <= h < 90 & C <= 0.10 & L < 0.8  9
  //   brilliant       C >= 0.15 & light               LIGHT_LIGHTNESS (0.8)
  //                   rather than the inventory's 0.7: 19 palettes against 72.
  //                   The registry's own word for light is the one the page
  //                   prints, and the incident is recorded at isBrilliant.
  //   clipped         clipped >= 0.25                 exact          350
  //   warm / cool     !grayscale & the gapped arcs    exact     399 / 312
  //   warm cool contrast  share(330,120) & share(150,300) >= 0.25    198
  //
  // WHAT SECTIONS 3 AND 4 DELIBERATELY DO NOT SHIP AS TERMS (D25.3). Every one
  // of these is computable; "we could not measure it" is never the reason, and
  // each number below is a fixture measurement:
  //   vibrant     the inventory's test IS vivid's, and it fires on the same 185
  //               palettes. A second term with one predicate is one fact
  //               spending two chips and two pages that return one result set.
  //               It stays a PROSE synonym (palette-prose rotates it), which is
  //               the row's own "use" column.
  //   dusty       SHIPPED as an entry after QA round 6 - see the `dusty` entry
  //               above for the measurement that overturned this note. The
  //               inventory's "= muted; prose synonym" is true of the WORD and
  //               false of the BAND: read absolutely the two predicates are the
  //               same idea, read RELATIVELY (chroma against the sRGB ceiling at
  //               the stop's own lightness, D19's second axis) there are 85
  //               palettes that look greyed and that `muted` cannot reach, 75 of
  //               which carried no chroma-axis chip at all. The entry is floored
  //               at MUTED_CHROMA so the two sets are disjoint (0 of 85 overlap),
  //               which is what keeps it from being the second label on one
  //               predicate that this list exists to refuse.
  //   achromatic  the theory word for `grayscale`, which ships. The inventory's
  //               literal test (Cd < 0.025 or cf < 0.15) fires on 24 palettes
  //               against grayscale's 19, and the 5 it adds are exactly D19's
  //               rescues - near-white tints at 69-100% of the chroma their
  //               lightness allows, which are pale colours and not grays. The
  //               shipped reading is the stricter and better one; the theory
  //               word belongs in the tag-filter's synonym list, not in a
  //               second entry (see the note on that list below).
  //   neutral     the chroma sense of the word. Palette-level it is the
  //   (chroma)    grayscale test again, and the word collides with the INDEXED
  //               `warmth: neutral` value in palette-tags: a chip printing
  //               "neutral" would route into an index built on the temperature
  //               meaning. `temperature-neutral` below carries that sense under
  //               a name that cannot be misread, and `grayscale` carries this
  //               one.
  //   rich        C >= 0.12 with 0.35 <= L <= 0.6 - the inventory says of it
  //               "overlaps jewel; pick one, never both", and the overlap is
  //               measured: 107 palettes, 105 of them also `jewel tones`, 2
  //               that are not, against 1 jewel that is not rich. They are one
  //               class; the jewel window is the one with the Cmax gate and the
  //               searched name.
  //   washed-out  the inventory writes it as "pastel test, OR chroma trend
  //   / faded     < -0.04 ending under C 0.04". The first half IS `pastel`
  //               (71 palettes, identical predicate). The second half is the
  //               FADE row of section 7 (gradient), whose registry column is
  //               "tag (desaturating) + new endpoint check" - 39 palettes here,
  //               37 of them outside pastel - and shipping it under a second
  //               label would put one predicate behind two words, which is the
  //               drift this file exists to prevent. The row's own misuse note
  //               settles the rest: negative valence, "prefer for trajectory
  //               (fades to mist), not as a standing label", and a chip is a
  //               standing label on somebody's palette.
  //   saturation, both are QUANTITIES rather than claims. The repo computes both
  //   colorfulness readings already (meanChroma and meanSaturation, the latter
  //               against the sRGB ceiling at each stop rather than the
  //               inventory's C/L proxy) and D19 decides which one a term uses:
  //               identity questions take saturation, loudness questions take
  //               chroma.
  //   Kelvin      already in the file header: physics inverts the metaphor.
  //
  // A NOTE FOR THE TAG FILTER. `achromatic` and `vibrant` are the theory's
  // words for two terms that DO ship, so /palettes/achromatic should resolve to
  // `grayscale` and /palettes/vibrant to `vivid`. That is a synonym list on the
  // recognizer (tag-search.ts), not two more entries here: a synonym must never
  // be able to disagree with the term it is a synonym of. `dusty` was on this
  // list until QA round 6 measured it and it is now an entry of its own,
  // because it turned out not to be a synonym.
  {
    term: 'neutral-anchored',
    axis: 'chroma',
    test: (f, ctx) => isNeutralAnchored(f, ctx),
    // A margin on BOTH halves, because the term is a claim about both: a
    // quarter of the run with no usable hue (the neutrals are a passage, not a
    // seam) and a rendered stop at FAMILY_CHROMA (the colour is loud enough to
    // be named after, the site's own bar for that). Measured: 157 -> 38.
    strong: (f, ctx) =>
      isNeutralAnchored(f, ctx) &&
      f.chromaticFraction >= 0.25 &&
      f.chromaticFraction <= 0.75 &&
      f.maxChroma >= T.FAMILY_CHROMA &&
      // ...AND THE NEUTRAL IS A GROUND, NOT A CLIP (QA round 6). The term's
      // own note says it means the palette CONTAINS neutrals; a run that
      // clamps at #000000 or #ffffff for a tenth of its length contains the
      // gamut's edge, which is a different fact and one the registry already
      // has two words for (`pure-black-plateau`, `crushed-shadows`). Left in,
      // it made `neutral-anchored` the commonest of the black-end words - 27
      // chip fires, more than `fade to black` and `near-black` - so it was the
      // one filling the fourth slot on rows that had already said "it ends in
      // black" three times. PLATEAU_SHARE is the descriptors' own bar for a
      // plateau. Measured: 38 -> 29 strong.
      f.allBlackShare < T.PLATEAU_SHARE &&
      f.allWhiteShare < T.PLATEAU_SHARE,
    prevalence: 0.1811,
    strongPrevalence: 0.0334,
    note: 'Says the palette CONTAINS neutrals, never that it IS one - the grayscale palettes are excluded rather than counted, and cf is D19\'s saturation-aware share.',
  },
  {
    term: 'temperature-neutral',
    axis: 'temperature',
    tagOnly: true,
    test: (f) => isTemperatureNeutral(f),
    // TAG ONLY, the same device as `multicolor` and `wcag-aa`, and for the
    // inventory's own two reasons: its `use` column reads "neither", because
    // the zone name (chartreuse-green, violet-magenta) tells a reader more than
    // the temperature negation does, and because the word collides with the
    // INDEXED `warmth: neutral` tag. It stays in the table because the three
    // temperature classes have to partition the corpus for the filter to be
    // able to answer "not warm and not cool" at all: 399 + 312 + 156 = 867.
    strong: () => false,
    prevalence: 0.1799,
    strongPrevalence: 0.0,
    note: 'The gapped zones classical theory leaves ambiguous - green 120-150 (58 palettes) and violet 300-330 (79) - plus the 19 achromatic ones. Filterable, never a chip.',
  },
  // --- GRADIENT: research-colorTheory §7, the shape of the run ---------------
  //
  // The rows this package did NOT implement, with the reason, so nobody
  // re-opens them (D25.3):
  //   - `gradient`, `blend` — vacuous. Every palette here IS a gradient, and
  //     the cosine is C-infinity, so "smoothly blended" is true of the
  //     FUNCTION for all 867 seeds and discriminates nothing. What a viewer
  //     actually sees blend or band is the step count, which `banding` below
  //     measures honestly.
  //   - `color stop` — the view, not the palette. `steps` is a URL parameter.
  //   - `interpolation direction` — a display fact (`angle`), which changes per
  //     render; palette text uses t-language ("begins", "ends") for exactly
  //     this reason.
  //   - `easing` — the cosine IS the easing and every palette has the same
  //     one; frequency scales it globally. Nothing to distinguish.
  //   - `flat spots` — already shipped, under the name `clipped`: the
  //     inventory's test is `clipped >= 0.25` and CLIPPED_FRACTION is 0.25, so
  //     a second entry would be one predicate wearing two labels.
  //   - `even / uneven spacing` — the inventory dropped it and a re-measure
  //     over the fixture agrees. CV of the consecutive stop distances at 7
  //     steps: "even" is 51.4% below CV 0.3, 76.6% below 0.4 and 95.7% below
  //     0.6, so no cut makes it discriminating; "uneven" is 4.3% above 0.6 and
  //     1.3% above 0.8. And it is the same view-dependent measurement
  //     `banding` carries, which is the shippable form of it.
  //   - `hue turn` — dropped by the inventory at 54.4%; re-measured here at
  //     73.1% of the fixture with no deadband and 43.1% with a 1° one, i.e.
  //     under a bit either way. `hueConsistency` carries the honest version and
  //     `hue-wandering` is the term that survived it.
  {
    term: 'wash',
    axis: 'gradient',
    test: (f) => f.paleRunShare >= WASH_RUN && hasWashRemainder(f),
    strong: (f) => f.paleRunShare >= 0.5 && hasWashRemainder(f),
    prevalence: 0.0888,
    strongPrevalence: 0.0173,
    note: 'Measured 103 -> 98 -> 77 test and 37 -> 33 -> 15 strong across QA rounds 4 and 5. A pale, weak PASSAGE — a contiguous run, which is why it is not `high-key` or `pastel` under another name: 43 of the 103 palettes that clear the bar are not high-key and 41 are not even light, because the wash sits between two darker ends where no palette-wide mean can find it. Strong = half the ramp.',
  },
  {
    term: 'fade to white',
    axis: 'gradient',
    test: (f, ctx) =>
      fading(f) && f.denseLastLightness > NEAR_WHITE_L && endsWhite(ctx),
    strong: (f, ctx) => fading(f) && f.denseLastLightness > 0.93 && endsWhite(ctx),
    prevalence: 0.0115,
    strongPrevalence: 0.0092,
    implies: ['desaturating', 'near-white'],
    note: 'It shadows `near-white` for the reason `tints` does (QA round 5): a run that fades to white ENDS in the top band by definition, 10 of 10 over the fixture, and the row that filed it carried `near-white sunset`, `fade to white`, `wash` and `light` - four of eight chips saying pale. Strong = halfway from the near-white edge to white itself. The endpoint is the DENSE t=1 sample: cosineGradient samples i/(steps-1), so the last rendered stop is that sample at every step count (verified: 0 hex mismatches over the fixture at 7 against 48). WHITE, not merely light (QA round 4): `fade to gray` has always gated on the end stop having no hue and this one did not, so 22 of its 27 strong fires ended on a stop that still has a family - a pale cyan, a cream, a mint, and at the limit #fffe35. Same CHROMA_FLOOR reading as `near-white`, and the same reason it is absolute; measured 65 -> 10 test, 27 -> 8 strong.',
  },
  {
    term: 'fade to gray',
    axis: 'gradient',
    test: (f, ctx) =>
      fading(f) &&
      !stopHasHue(endStop(ctx)) &&
      f.denseLastLightness >= NEAR_BLACK_L &&
      f.denseLastLightness <= NEAR_WHITE_L,
    strong: (f, ctx) =>
      fading(f) &&
      !stopHasHue(endStop(ctx)) &&
      f.denseLastLightness >= NEAR_BLACK_L &&
      f.denseLastLightness <= NEAR_WHITE_L &&
      stopSaturation(endStop(ctx)) < T.SATURATION_FLOOR / 2,
    prevalence: 0.0115,
    strongPrevalence: 0.0081,
    implies: ['desaturating'],
    note: 'RELATIVE SATURATION decides this one, not chroma (D19). "Has the colour gone" is an identity question, and the absolute reading (last-stop C < 0.04, the inventory\'s literal test) fires on 39 palettes against 15 — the 24 it adds are pale tints sitting at 90%+ of the ceiling their lightness allows, which are plainly coloured. Band-limited at both ends because white and black are the ends of the gray scale and a reader calls neither of them gray (the same argument chromaValleyL records); those two cases are `fade to white` and `fade to black`. Strong = under half the saturation floor.',
  },
  {
    term: 'fade to black',
    axis: 'gradient',
    test: (f) => f.lightnessDelta <= -OMBRE_RANGE && f.denseLastLightness < NEAR_BLACK_L,
    strong: (f) => f.lightnessDelta <= -OMBRE_RANGE && f.denseLastLightness < 0.1,
    prevalence: 0.0138,
    strongPrevalence: 0.0081,
    implies: ['darkening', 'near-black'],
    note: 'It shadows `near-black` as well as `darkening` since QA round 5: its own gate is denseLastLightness < 0.18 and fade-to-black\'s is < 0.1 on the SAME t=1 sample, so the band word is this word with less in it - 12 of 12 over the fixture, and the row that filed it was printing `fade to black`, `near-black`, `chiaroscuro` and the colour chip `almost black`, four of nine chips claiming darkness on one ramp. The VALUE branch of the same inventory row ("chroma or value dying toward an end"): the chroma fades read chromaTrend, this one reads the lightness, because a run that dies into black has no chroma left to lose. Not `crushed-shadows`, which is a claim about channels pinned at the clamp — a ramp can reach L 0.12 without any channel touching 0. `implies` is a DISPLAY shadow, not a containment (as it already is for deep/dark and earthy/muted): 5 of the 12 reach black through an arch and are therefore not `darkening`, which is a monotone-ramp claim, but wherever both fire this is the specific one and the general word would be a second chip saying less.',
  },
  {
    term: 'gradient map',
    axis: 'gradient',
    tagOnly: true,
    test: (f) => mapsTonalRange(f, MAP_SHADOW_L, MAP_HIGHLIGHT_L),
    strong: (f) => mapsTonalRange(f, 0.25, 0.75),
    prevalence: 0.0888,
    strongPrevalence: 0.045,
    implies: ['ramp'],
    note: 'A USE, not a look — and TAG ONLY since QA round 5, because the inventory says exactly that in the row this term came from (research-colorTheory: "it is a use, not a property", destination column `prose`) and the round took it at its word. A visitor cannot SEE gradient-map suitability; what they can see is the dark-to-light ramp, which the row is already saying in words they know. Measured over the fixture: 39 of 39 chip fires are also `ramp` true and 15 of the 39 printed `ombre` on the same row. The use has a real test and it is stricter than the `ramp` it implies (all 77 are ramps, while only a seventh of the 508 ramps reach far enough into both the shadows and the highlights to index an image by value), so it keeps its tag, its embed value and its page. Strong = the coverage bar moved 0.05 at each end, the step at which two neighbouring stops read as different values.',
  },
  {
    term: 'duotone gradient',
    axis: 'gradient',
    test: (f, ctx) => ctx.structure === 'duotone' && f.turns === 0,
    strong: (f, ctx) =>
      ctx.structure === 'duotone' && f.turns === 0 && f.lightnessRange >= OMBRE_RANGE,
    prevalence: 0.0242,
    strongPrevalence: 0.0185,
    implies: ['duotone', 'ramp'],
    note: 'The TOOL sense: two colours mapped across the value range, the thing a designer means by "duotone" in Photoshop. It is a compound of the structure class and the shape, never a synonym for either — and never the PRINT sense (two inks), which nothing here can claim. Strong = a median palette\'s worth of lightness travel, because a duotone with no value journey is two hues side by side and maps nothing.',
  },
  {
    term: 'repeating',
    axis: 'gradient',
    test: (f) => f.equalC && Math.min(...f.channelCycles) >= 1.5,
    strong: (f) => f.equalC && Math.min(...f.channelCycles) >= 2,
    prevalence: 0.0012,
    strongPrevalence: 0.0012,
    implies: ['seamless', 'hue cycling'],
    note: 'A palette that literally repeats also loops and also winds the hue past a full turn - measured, its one fixture witness carries both - so it shadows both words rather than printing one observation three times. research-coeffMath G3/D1: the cosine argument sweeps |c_k| full periods over t, so when all three |c_k| agree (equalC) the WHOLE palette repeats with period 1/c — exactly, no sampling. Unequal frequencies beat against each other into a Lissajous path with no exact repeat, and the research is explicit that the claim must not be made there. Rare and correct (D25.4): one fixture seed, c = 2.000/2.000/2.020, and its seven stops read #d0555d #5b60cf #5bcf55 #d05562 #5b60cf #5bcf51 #d05566 — the sequence twice over. The editor reaches this state with one pull of the frequency slider.',
  },
  {
    term: 'banding',
    axis: 'gradient',
    tagOnly: true,
    test: (_f, ctx) => ctx.adjacentStep > BANDING_STEP,
    strong: () => false,
    prevalence: 0.2768,
    strongPrevalence: 0,
    note: 'TAG ONLY, and the measurement is the reason. This is not a property of the palette but of the STEP COUNT the visitor picked, and the same predicate over the same 867 seeds fires on 84.9% at 3 steps, 55.4% at 5, 27.7% at 7, 6.3% at 13 and 1.7% at 24. A chip is a label with no room for "at 7 steps", and its destination would be a page of palettes that stop banding the moment someone moves the slider. Same device as `wcag-aa`: strong is deliberately unreachable, and the fact still reaches the embedding.',
  },
  {
    term: 'smooth',
    axis: 'gradient',
    tagOnly: true,
    test: (_f, ctx) => ctx.adjacentStep < INDISTINCT_STEP,
    strong: () => false,
    prevalence: 0.0046,
    strongPrevalence: 0,
    note: 'The other end of the same inventory row: no two neighbouring swatches are a JND apart, so the stepped view reads as continuous. TAG ONLY for the same reason as `banding`, and the swing is the mirror image — 0.2% at 3 steps against 18.5% at 24. Note it is NOT the claim that the gradient is smooth: the cosine always is.',
  },

  // --- APPEARANCE: research-colorTheory §8 -----------------------------------
  //
  // The opponent axes are the other half of this section and are already above
  // (`blue-yellow axis`, `green-red axis`); re-measured here at 0.2664 and
  // 0.1522, with the two never firing together — the four ±45° windows tile the
  // circle, so their shares sum to 1 and both cannot reach 0.85.
  {
    term: 'luminous',
    axis: 'appearance',
    test: (f) =>
      f.meanChroma >= T.VIVID_CHROMA &&
      f.meanLightness >= 0.45 &&
      f.meanLightness <= T.LIGHT_LIGHTNESS,
    strong: (f) =>
      f.meanChroma >= 0.18 &&
      f.meanLightness >= 0.45 &&
      f.meanLightness <= T.LIGHT_LIGHTNESS,
    prevalence: 0.1834,
    strongPrevalence: 0.0704,
    tagOnly: true,
    implies: ['vivid'],
    note: 'TAG ONLY since QA round 5. The row that filed it - a red -> orange -> yellow -> green sweep at mean C 0.184 - had `luminous` as its ONLY fact chip, i.e. its whole non-colour vocabulary was an appearance claim about an effect OkLab does not model and a viewer cannot check, while the plain word for what the image shows (`vivid`, true and strong here) was silenced by this entry\'s own implication. A chip is a label a visitor clicks expecting to see the thing named; H-K brightness is not a thing they can see one palette have and another lack. The fact keeps its tag, its embed value and its page, and `neon` still shadows it there. The Helmholtz-Kohlrausch effect: at real chroma a colour looks brighter than its luminance predicts. OkLab does not model H-K and the published corrections are L*C*h-based, so the inventory\'s ruling is to skip the CORRECTION and keep one gated word — and the gate it specifies turns out to be the registry\'s own constants, C >= VIVID_CHROMA and L <= LIGHT_LIGHTNESS: luminous is vivid that has NOT gone light, the band where the effect bites. Measured 18.3% of the fixture, inside the 2-60% speaking band, so it ships; every one of the 159 is `vivid`, which is why it implies it. Shares its upper edge with `brilliant` (vivid AND light) and no fixture palette sits exactly on it.',
  },
  // ===========================================================================
  // HUE — research-colorTheory §1 (PACKAGE D-A)
  // ===========================================================================
  //
  // ALREADY IN THE TABLE, VERIFIED AGAINST THE INVENTORY RATHER THAN REDONE:
  // `monochrome` is §1.3's "narrow band" (span < 30 IS MONOCHROME_SPAN),
  // `hue-advancing` / `hue-reversing` / `hue-wandering` / `full-wheel` are the
  // travel rows, and `warm gray` / `cool gray` are §1.3's mean-OkLab-vector
  // test with the concentration guard the QA round added. None of them needed a
  // second definition; a term below that restated one would be the drift this
  // file exists to prevent.
  //
  // WHAT §1 DELIBERATELY DOES NOT SHIP (D25.3), and why:
  //   - narrow band       — the inventory's own test is span < 30, which is
  //                         `monochrome`'s. One measurement, one word.
  //   - hue / hue family  — an axis and a lookup, not characteristics. Every
  //                         palette has a hue; there is nothing to be prominent
  //                         about.
  //   - tertiary color    — RYB-wheel names (red-orange, blue-green). The
  //                         inventory files it `neither`: the extended names
  //                         above cover those regions with words people use.
  //   - primary/secondary — ambiguous across RYB, RGB and CMY. Never emit.
  //   - indigo            — web #4b0082 measures h 301.7 through this repo's
  //                         own conversion, past violet, i.e. a dark purple,
  //                         while the spectral position is near 279. Anchoring
  //                         at either value names something the other calls
  //                         wrong, so it is an inbound search synonym only.
  //   - scarlet, vermilion — the inventory's own note: "same hue as red —
  //                         variants, not anchors". Both windows sit inside
  //                         `crimson`/`red`, so they would be a third word for
  //                         a stop that already has two.
  //   - khaki, tan, beige, lilac, fuchsia, aqua — the same inventory ROWS as
  //                         `sand`, `lavender`, `magenta` and `cyan`. One row,
  //                         one term; the rest are synonyms for the search
  //                         vocabulary, not separate characteristics.
  //
  // The eight wheel anchors and the eleven tone-gated family words come first,
  // built from `gatedFamily` rather than from a hue window, so a `brown` chip
  // and the paragraph that calls a stop brown and the `/palettes/brown` page
  // are one function deep. Then the extended names, then the shape-of-the-arc
  // rows.
  //
  // WHY A SHARE AND NOT A MEAN. A hue name is a claim about a REGION of the
  // ramp, not about its average: a navy-to-cream ramp averages to a dull tan
  // that is neither of its colours, and every one of the eight anchors would
  // stay silent on the palette a viewer would unhesitatingly call blue. The
  // share is also the reading the retrieval side already ranks by, so the two
  // halves of the word cannot come apart (D25.6).
  ...FAMILY_ENTRIES,
  ...HUE_NAME_ENTRIES,

  // --- ARC LANGUAGE: how much of the wheel the colours occupy ----------------
  //
  // Three EXCLUSIVE bands rather than three "at least" thresholds. The
  // inventory writes the cutoffs cumulatively (span >= 90 / 180 / 300) and
  // measured that way `quarter-wheel` is true of 55.0% of the fixture and
  // prominent on 44.2% of it, which is a chip that says nothing: nobody calls
  // a 300° sweep a quarter-wheel. Bands make each word mean its own size, and
  // they make the three mutually exclusive so no implication chain is needed.
  //
  // These measure the SPAN — the arc the colours occupy — and are not
  // `full-wheel`, which is a NET ROTATION claim off `hueNet` and can be true
  // of a palette that winds a full turn through a narrow arc.
  {
    term: 'quarter-wheel',
    axis: 'hue',
    tagOnly: true,
    test: (f) => f.hueSpan >= 90 && f.hueSpan < 180,
    strong: (f) => f.hueSpan >= 105 && f.hueSpan < 180,
    prevalence: 0.331,
    strongPrevalence: 0.2826,
    note: 'Strong = 15 degrees clear of the lower edge, a third of a family band, so a palette that is arguably still analogous does not spend a chip on the arc.',
  },
  {
    term: 'half-wheel',
    axis: 'hue',
    tagOnly: true,
    test: (f) => f.hueSpan >= 180 && f.hueSpan < 300,
    strong: (f) => f.hueSpan >= 195 && f.hueSpan < 300,
    prevalence: 0.1845,
    strongPrevalence: 0.128,
  },
  {
    term: 'near-full-circle',
    axis: 'hue',
    tagOnly: true,
    test: (f) => f.hueSpan >= 300,
    strong: (f) => f.hueSpan >= 315,
    prevalence: 0.0346,
    strongPrevalence: 0.0277,
    note: 'Deliberately does NOT imply `rainbow`: 28 of the 30 carry it, and the two that do not are the case the rainbow gate exists for - 300 degrees of span that never reaches one side of the wheel.',
  },

  // --- SPECTRAL ORDER and the walk ------------------------------------------
  {
    term: 'spectral order',
    axis: 'hue',
    test: (f) =>
      f.hueConsistency >= SPECTRAL_CONSISTENCY &&
      f.hueTravel >= T.HUE_DIRECTION_TRAVEL &&
      purpleLineShare(f) < PURPLE_LINE_MAX_SHARE - PURPLE_LINE_TIE,
    strong: (f) =>
      f.hueConsistency >= SPECTRAL_CONSISTENCY &&
      f.hueTravel >= 2 * T.HUE_DIRECTION_TRAVEL &&
      purpleLineShare(f) < PURPLE_LINE_MAX_SHARE - PURPLE_LINE_TIE &&
      // ...AND THERE IS ENOUGH COLOUR TO SEE THE WALK (QA round 6). The two
      // conjuncts above are about the ORDER of the hues and say nothing about
      // whether the hues are visible: the filed palette walks monotonically
      // through a mean chroma of 0.077 with a literal #000000 stop and 12.5% of
      // its run pure black, and renders black, black, dark blood red, tan, sage,
      // petrol, black - a claim about the spectrum that cannot be checked by
      // eye. FAMILY_CHROMA is this repo's bar for naming a hue at all, and a
      // walk whose average sample is under it is a walk between colours nobody
      // can name. Measured: 61 -> 49 strong, the 12 removed all under 0.08.
      f.meanChroma >= T.FAMILY_CHROMA,
    prevalence: 0.1326,
    strongPrevalence: 0.0415,
    note: 'Hues advance one way around the wheel with no reversal worth 2% of the walk, AND the walk stays on the spectral locus - see crossesPurpleLine, added QA round 5, when a navy-into-gold ramp that had gone round the back of the wheel was chipping the word. Either direction counts: a spectrum read backwards is still in spectral order, and all 229 carry exactly one of `hue-advancing` / `hue-reversing`, which are the same walk at a fifth of the strictness. It does NOT declare them in `implies`, and the reason is a measured limit of the dedupe rather than a doubt about the entailment: `prominentCharacteristics` ranks by rarity and lets the SURVIVOR shadow, on the assumption that the rarer term is the more specific one, and here that assumption fails - splitting the walk by direction makes each half rarer (scores 3.98 and 4.03) than the refinement that covers both (3.22), so the direction tag is kept first and a declared implication would be asserted after the fact it was meant to prevent. Left as undeclared overlap, which is the display layer\'s problem by D25.5.',
  },
  {
    term: 'hue cycling',
    axis: 'hue',
    tagOnly: true,
    test: (f) => f.hueTravel >= HUE_CYCLE_TRAVEL,
    strong: (f) => f.hueTravel >= 500,
    prevalence: 0.0069,
    strongPrevalence: 0.0046,
    note: 'The hue walks more than a full turn, backtracking included. The inventory calls this "cyclic" and predicted 0.7% dormant; measured 0.69%. TAG ONLY since QA round 4, and D25.6 is the reason rather than rarity: the round ran /palettes/hue-cycling through the real retrieval path over the fixture and page 1 held ONE palette the predicate is true of, because 6 palettes cannot fill 24 slots. The rare HARMONIES stay chips (a triadic page is thin too) because a visitor clicking `triadic` is asking a question the corpus can answer badly but honestly; `hue cycling` is additionally redundant where it does fire - its only strong witnesses also carry `repeating` and `seamless`, which say the same loop in words a reader knows. NOT spelled "cyclic" because `seamless` owns the loop meaning here. Only 2 of the 6 are `full-wheel`, so no implication: winding 400 degrees and NETTING 330 are different facts.',
  },

  // ===========================================================================
  // VALUE — research-colorTheory §2 (PACKAGE D-A)
  // ===========================================================================
  //
  // ALREADY IN THE TABLE, VERIFIED AGAINST THE INVENTORY RATHER THAN REDONE:
  // `dark` (L̄ < 0.42), `light` (L̄ > 0.8), `high-key` (L̄ > 0.75 ∧ ΔL < 0.3),
  // `low-key` (L̄ < 0.45 ∧ ΔL < 0.3), `deep` (L̄ < 0.45 ∧ C̄ ≥ 0.08) and the
  // `tints` / `shades` / `tones` series all match §2's computable tests exactly
  // as they stand, thresholds included.
  //
  // WHAT §2 DELIBERATELY DOES NOT SHIP (D25.3), and why:
  //   - lightness / value / brightness — the axis and its two synonyms, not
  //                         characteristics. Munsell's "value" is the painter's
  //                         word for the same L, and HSB's "B" is neither.
  //   - luminance         — physical Y, kept for WCAG only, which already ships
  //                         as the `wcag-aa` tag and nothing else.
  //   - luma / luminosity — in the global ban list at the top of this file.
  //   - tonal range / dynamic range — the inventory's test is ΔL, which
  //                         `high-contrast` and `low-contrast` already ship at
  //                         both ends of. A third word for one measurement.
  //   - pale              — the inventory says "palette-level ≈ pastel test",
  //                         and the fixture agrees: at its own gate
  //                         (L̄ > 0.8 ∧ C̄ < 0.06) it fires on 39 palettes, 36 of
  //                         which are already `pastel`, and the 3 that are not
  //                         are the ones `pastel` excludes for having no colour
  //                         at all — which `grayscale` claims. It would be a
  //                         synonym that disagrees with its own family in three
  //                         cases out of thirty-nine.
  //   - chiaroscuro's prose use — the inventory files it `neither` because it
  //                         is art-historical, and D20.3 bans that register
  //                         from the DESCRIPTION. It ships as a CHIP, where
  //                         theory vocabulary is what D24.4 asks for.
  //
  // The bands are per-STOP, which is what separates them from `dark`/`light`
  // (palette means) and from `high-key`/`low-key` (mean plus spread). A
  // palette whose mean is a midtone can still reach both ends of the scale, and
  // that is a fact about the image that no mean can carry.
  {
    term: 'near-black',
    axis: 'value',
    tagOnly: true, // PER-STOP, NOT PALETTE IDENTITY (owner, 2026-08-19). Reported on a tan-to-teal-to-navy ramp that chipped `near-black` because its last stop is #000116: the claim is true of an END, but a chip reads as a claim about the WHOLE palette, and as a link it would return every run that merely finishes dark. Tag-only since. The palette-level words on this axis (dark, light, high-key, low-key, chiaroscuro) keep their chips, and a dark end is still named by its COLOUR chip, which is the honest way to say it.
    
    test: (_f, ctx) => minL(ctx) < VALUE_BANDS.nearBlack,
    strong: (_f, ctx) => minL(ctx) < BLACK_L,
    prevalence: 0.1188,
    strongPrevalence: 0.0461,
    implies: ['dark'],
    note: 'The run reaches the bottom band, and where the palette is ALSO dark on average that is the same observation at two levels of generality (QA round 4: `almost black` the colour chip, `near-black` the band and `dark` the mean were three of nine chips on one dark neutral ramp). A DISPLAY shadow, not a containment - 56 of the 103 are dark, and a white-to-black ramp reaches this band without being a dark palette. The margin is the inventory\'s own reserve for the word BLACK (L < 0.08), not a number invented for the purpose - "comfortably past near-black" already has a name in the theory.',
  },
  {
    term: 'near-white',
    axis: 'value',
    tagOnly: true,
    test: (_f, ctx) => whitePole(ctx) > VALUE_BANDS.highlight,
    strong: (_f, ctx) => whitePole(ctx) > WHITE_L,
    prevalence: 0.0807,
    strongPrevalence: 0.0484,
    implies: ['light'],
    note: 'The same, at the top: the margin is the reserve for WHITE (L > 0.95), and since QA round 5 the same DISPLAY shadow over the palette-wide word - 30 of the 70 are also `light`, exactly the shape `near-black` shadows `dark` with (56 of 103), and a white-to-black ramp reaches this band without being a light palette. Unlike `near-black` it asks about the COLOUR of the pole as well as its height - see whitePole.',
  },
  {
    term: 'shadow band',
    axis: 'value',
    tagOnly: true,
    test: (_f, ctx) => inBand(ctx, VALUE_BANDS.nearBlack, VALUE_BANDS.shadow),
    strong: (_f, ctx) =>
      inBand(ctx, VALUE_BANDS.nearBlack, VALUE_BANDS.shadow, BAND_CLEARANCE),
    prevalence: 0.0069,
    strongPrevalence: 0.0023,
    implies: ['low-key'],
    // DEFINITIONAL: a run entirely inside [0.18, 0.42] has a mean inside it and
    // a range of at most 0.24, which is `low-key`'s whole test (mean < 0.45,
    // range < 0.3). 6 of 6 over the fixture, and both of the rows that chipped
    // the band printed the key word beside it (QA round 5).
    note: 'The WHOLE run inside 0.18-0.42. Rare and correct (D25.4): a cosine ramp that never leaves the shadow band has to have tiny amplitude on all three channels AND sit low, and six fixture palettes do.',
  },
  {
    // `midtones`, not `midtone band` (QA round 6, D24.4). The three value
    // bands are the same measurement and the other two are spelled as the
    // photographic terms a designer uses; this one carried the measurement's own
    // spelling, which is the Characteristic interface's own stated reason for
    // holding a word to `tagOnly`. It shadows nothing and nothing shadows it,
    // and unlike its two neighbours that is correct rather than an omission:
    // `shadow band` entails `low-key` and `highlight band` entails `high-key`
    // because both are bounded on the side the key word reads, while the middle
    // band has no key word to entail - the registry has no `mid-key` and
    // classical practice has no such term.
    term: 'midtones',
    axis: 'value',
    tagOnly: true,
    test: (_f, ctx) => inBand(ctx, VALUE_BANDS.shadow, VALUE_BANDS.midtone),
    strong: (_f, ctx) => inBand(ctx, VALUE_BANDS.shadow, VALUE_BANDS.midtone, BAND_CLEARANCE),
    prevalence: 0.0496,
    strongPrevalence: 0.0173,
  },
  {
    term: 'highlight band',
    axis: 'value',
    tagOnly: true,
    test: (_f, ctx) => inBand(ctx, VALUE_BANDS.midtone, VALUE_BANDS.highlight),
    strong: (_f, ctx) => inBand(ctx, VALUE_BANDS.midtone, VALUE_BANDS.highlight, BAND_CLEARANCE),
    prevalence: 0.0288,
    strongPrevalence: 0.0081,
    implies: ['high-key'],
    // The mirror of `shadow band` -> `low-key`, and a DISPLAY shadow rather
    // than a containment: 24 of the 25 are high-key (the one that is not sits
    // at mean L 0.72, under high-key's 0.75), and where both fire the band is
    // the specific claim.
  },
  {
    term: 'chiaroscuro',
    axis: 'value',
    test: (f) => isChiaroscuro(f),
    strong: (f) =>
      isChiaroscuro(f) && f.lightnessRange > 0.7 && f.denseMaxLightness > T.LIGHT_LIGHTNESS,
    prevalence: 0.0323,
    strongPrevalence: 0.0115,
    implies: ['high-contrast'],
    note: 'Chiaroscuro is dramatic LIGHT modelled against dark, so the strong band asks for the light (QA round 5). Two boundary fires filed it: a muted tan-sage-slate ramp dying into black, mean L 0.456 against < 0.5 and range 0.7271 against > 0.7, whose bright pole is a mid tan at L 0.64 - there is no highlight anywhere in the image, and because this entry shadows `high-contrast` the accurate plainer word was silenced by the theatrical one. The third conjunct is LIGHT_LIGHTNESS, the registry\'s own palette-level word for light rather than a private bar invented here - the mistake isBrilliant records making. Measured over the 15 fires with range > 0.7, the bright poles run 0.707 0.734 0.747 0.759 0.772 | 0.813 0.834 0.852 0.859 0.865 0.877 0.880 0.908 0.939 0.947, and the gap in that list is where the threshold sits: 10 survive.',
  },
  // --- HARMONY: the schemes above two hues, and the residual synonym ---------
  //
  // Rates measured 2026-08-18 over the 867-seed fixture at the default view.
  // The four rare schemes measure ZERO there and are shipped anyway (D25.4):
  // the reachability numbers and the pinned witnesses are in the detector
  // comment above, and `characteristicScore` already treats a zero rate as "one
  // seed in the fixture", so if one ever fires it outranks everything.
  {
    term: 'triadic',
    axis: 'harmony',
    test: (f, ctx) => isTriadic(f, ctx),
    prevalence: 0.0012,
    strongPrevalence: 0.0012,
    implies: ['hue contrast'],
    note: 'Three isolated hues 120 degrees apart, by the dense clusters or by the rendered stops (see stopHueGroups). Tolerance 30, the inventory\'s own [90,150], AND NO SEPARATE MARGIN: the margin is the isolation, not the angle. Measured over the fixture, 110 palettes show three tight stop-hue groups and exactly ONE has them within 30 degrees of even spacing (gaps 99.5/135.0/125.5) - so the discriminating fact is being three separated hues at all, and a second angle threshold at 15 would have refused the corpus\'s only triad by 3.5 degrees, which is a threshold fitted to a witness rather than a margin (D24.1).',
  },
  {
    term: 'split complementary',
    axis: 'harmony',
    test: (f, ctx) => isSplitComplementary(f, ctx),
    strong: (f, ctx) => isSplitComplementary(f, ctx, SCHEME_MARGIN),
    prevalence: 0,
    strongPrevalence: 0,
    implies: ['hue contrast'],
    note: 'A hue against the two NEIGHBOURS of its complement. Plain tolerance 30 on the flank angle (the inventory\'s 30-90 degrees); strong 15, i.e. flanks 45-75 apart.',
  },
  {
    term: 'square',
    axis: 'harmony',
    test: (f, ctx) => isSquare(f, ctx),
    strong: (f, ctx) => isSquare(f, ctx, 10),
    prevalence: 0,
    strongPrevalence: 0,
    implies: ['tetradic', 'hue contrast'],
    // BEFORE `tetradic` on purpose. Both rates are zero, so both score the
    // fixture floor, and `prominentCharacteristics` sorts by score alone -
    // at a tie the registry's own order decides who shadows whom, and the
    // SPECIFIC term has to be walked first or it would print beside the
    // general one it implies.
    note: 'A tetradic whose four hues are EVENLY spaced: consecutive gaps 90 +- 20, strong +- 10. It implies tetradic by construction, not by measurement.',
  },
  {
    term: 'tetradic',
    axis: 'harmony',
    test: (f, ctx) => isTetradic(f, ctx),
    strong: (f, ctx) => isTetradic(f, ctx, 165),
    prevalence: 0,
    strongPrevalence: 0,
    implies: ['hue contrast'],
    note: 'Two complementary pairs (the rectangle scheme; "double complementary" is the same thing). Strong = both pairs within 15 degrees of the true opposite, the same margin `complementary` takes. ZERO fixture witnesses since QA round 5, and that is the fix rather than a regression: the two it had came through the stop route on a continuous navy -> black -> red -> orange -> cream -> cyan SWEEP whose "four isolated hues" included two single swatches, and the row was printing `tetradic` beside `spectral order` (see SCHEME_GROUP_STOPS). Rare and correct (D25.4), with the same reachability argument as its three siblings.',
  },
  {
    term: 'accented analogous',
    axis: 'harmony',
    test: (f) => isAccentedAnalogous(f),
    strong: (f) => isAccentedAnalogous(f, 0.1),
    prevalence: 0.0311,
    strongPrevalence: 0.015,
    implies: ['duotone', 'hue contrast'],
    note: 'An analogous arc plus one small distant accent. Strong = the accent takes a TENTH of the coloured run rather than a fifth; the margin belongs on the extent, because the extent is what the word is about.',
  },
  {
    term: 'polychromatic',
    axis: 'harmony',
    tagOnly: true,
    test: (_f, ctx) => ctx.structure === 'multicolor' || ctx.structure === 'rainbow',
    strong: () => false,
    prevalence: 0.4406,
    strongPrevalence: 0.0,
    note: 'TAG ONLY. The umbrella over `multicolor` and `rainbow`, and therefore never a chip: half of it is the residual class D24.3 keeps off the chip row, and the other half already has a better word. It exists so the embedding and the filter can answer "many hues" with one predicate instead of two.',
  },
  {
    term: 'discord',
    axis: 'harmony',
    test: (f) => isDiscord(f),
    strong: () => false,
    prevalence: 0,
    strongPrevalence: 0,
    note: 'TAG ONLY, and deliberately unreachable as a chip - see the detector. Zero on the fixture because the corpus is quiet (the loudest 2-cluster palette at an awkward interval has a weaker cluster at chroma 0.126, under the 0.15 the row asks of BOTH); 1.371% of 200,000 random coefficient sets, so the phenomenon is real and the live corpus simply does not contain it.',
  },

  // --- CONTRAST: Itten's remaining computable rows ----------------------------
  {
    term: 'hue contrast',
    axis: 'contrast',
    test: (f) => hueContrast(f),
    strong: (f) =>
      hueContrast(f) &&
      f.hueSpan >= 120 &&
      f.hueClusters >= 2 &&
      f.clusterChromas.every((c) => c >= T.FAMILY_CHROMA),
    prevalence: 0.3472,
    strongPrevalence: 0.0161,
    note: 'Itten 1. Strong is the inventory\'s own "strongest with >= 2 clusters", a third of the wheel rather than a quarter, and - since QA round 4 - CHROMA ON EVERY POLE rather than on the palette mean. The mean reading passed a soft cream -> pale aqua -> cornflower wash at 0.1043 against a 0.10 bar, under half a JND of margin, whose two clusters measure 0.030 and 0.109: one colour set against a near-gray is Itten SIX (saturation), which this registry ships separately, and reading the requirement per pole is what keeps the two rows apart. Sweep over the fixture: clusters alone 55, + span 120 54, + mean chroma 0.10 30, + every cluster at FAMILY_CHROMA 14.',
  },
  {
    term: 'extension contrast',
    axis: 'contrast',
    test: (f) => extensionContrast(f),
    strong: (f) => extensionContrast(f, 0.1, ACCENT_MARGIN),
    prevalence: 0.0035,
    strongPrevalence: 0,
    note: 'Itten 7, of extension: a small mass at least as loud as the field it interrupts, and VISIBLE (QA round 4 - the detector records the near-black accent that was this row\'s only witness). Strong = a tenth of the coloured run rather than a fifth, and a JND of real edge in loudness. The prose form is "accented with", never "extension contrast".',
  },
  {
    term: 'wcag-aaa',
    axis: 'contrast',
    tagOnly: true,
    test: (f) => f.contrastRatio >= 7,
    strong: () => false,
    prevalence: 0.2295,
    strongPrevalence: 0,
    note: 'TAG ONLY, exactly like `wcag-aa` (D25.2): a contrast ratio is a fact about a TEXT PAIRING at the palette\'s two extremes, not about how the palette looks, and it is never spoken and never turned into advice. The ratio is WCAG relative luminance, not OkLCh L - a different formula from `high-contrast` on purpose.',
  },
];

/**
 * Every entry by its term, for the surfaces that resolve a WORD to a predicate:
 * `/palettes/{term}` has only the slug, and it must filter by the same closure
 * the chip was decided with (D25.6). Built after the table for the obvious
 * reason and exported instead of a lookup helper so a caller can hold it.
 */
export const CHARACTERISTIC_BY_TERM: ReadonlyMap<string, Characteristic> = new Map(
  CHARACTERISTICS.map((c) => [c.term, c] as const),
);
