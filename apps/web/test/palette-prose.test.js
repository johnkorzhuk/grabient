// The description generator: what it is allowed to SAY, and when.
//
// The old suite pinned numbers, because the old paragraph printed them. D20
// removed every number from the prose, so the contract moved: what has to hold
// now is that each impression phrase appears ONLY when its full predicate
// conjunction holds, that the analysis vocabulary never reaches a reader, and
// that the words are ones a machine translator can carry. Those are the three
// suites below; determinism, step behavior, lengths, the anti-template corpus
// bar, the measure-first bands and the canonical triple are unchanged in intent.
//
// Fixture = the 867 live-sitemap seeds in prose-corpus.js, rendered at the
// default view (linearGradient, 7 steps, 90°) — the view an uncustomized seed
// page serves. Every asserted band below was MEASURED over that fixture on
// 2026-08-18; re-measure before moving one.
import { describe, expect, it, vi } from "vitest";
import { renderPalette } from "../src/palette.ts";
import { cosineGradient, rgbToHex } from "@repo/data-ops/gradient-gen/cosine";
import {
  classifyStructure,
  hueBandShare,
  modifierTags,
  paletteFeatures,
  DESCRIPTORS,
  spokenWord,
  THRESHOLDS,
} from "@repo/data-ops/gradient-gen/palette-modifiers";
import { describePaletteName, NAMES_FOR_STRUCTURE } from "../src/palette-name.ts";
import {
  describePalette,
  familyWord,
  impressionFires,
  IMPRESSIONS,
  measureFirstFires,
  MEASURE_FIRST,
  paletteEmbedText,
  paletteProse,
  paletteProseParts,
  relatedSearches,
  relatedSearchSlug,
} from "../src/palette-prose.ts";
import { querySlug } from "../src/semantic-search.ts";
import { PROSE_SEEDS } from "./prose-corpus.js";
import {
  colorFamilies,
  colorFamily,
  getUniqueColorNames,
  hexToOkLch,
  isColorName,
  NAMED_COLORS,
  relativeLuminance,
  relativeSaturation,
} from "@repo/data-ops/color-utils";

const T = THRESHOLDS;

// Counts real analysis passes so the one-pass contract of describePalette is
// verifiable. The wrapper delegates to the actual implementation, so every
// other assertion in this file exercises the true code path.
const analysisCalls = vi.hoisted(() => ({ n: 0 }));
vi.mock("@repo/data-ops/gradient-gen/palette-modifiers", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    paletteFeatures: (...args) => {
      analysisCalls.n += 1;
      return actual.paletteFeatures(...args);
    },
  };
});

const VIEW = { style: "linearGradient", steps: 7, angle: 90 };

const render = (seed, steps = VIEW.steps, style = VIEW.style, angle = VIEW.angle) => {
  const view = renderPalette(seed, style, steps, angle);
  if (!view) throw new Error(`unrenderable seed ${seed}`);
  return view;
};

/**
 * One shared analysis per seed — the fixture is walked many times below.
 * baseTags is deliberately NOT passed: paletteProse defaults it internally
 * from the same palette-tags import seedPaletteText uses, so this fixture
 * exercises the LIVE page composition (journey wording included) rather than
 * a journey-less variant.
 */
const caseCache = new Map();
const caseFor = (seed) => {
  let c = caseCache.get(seed);
  if (!c) {
    const view = render(seed);
    const features = paletteFeatures(view.appliedCoeffs, view.hexColors);
    const named = describePaletteName(view.appliedCoeffs, view.hexColors, { features });
    const prose = paletteProse(view.appliedCoeffs, view.hexColors, VIEW, { features, named });
    const parts = paletteProseParts(view.appliedCoeffs, view.hexColors, VIEW, { features, named });
    c = { view, features, named, prose, parts };
    caseCache.set(seed, c);
  }
  return c;
};

// Deterministic LCG (numerical recipes constants) for pair sampling — the
// MODULE may not hash or randomize, but the harness needs reproducible pairs.
const lcg = (seed) => {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(1664525, x) + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
};

const stripHex = (s) => s.replace(/#[0-9a-fA-F]{6}/g, "");
/** The prose body of the embedding text: everything before the Tags line. */
const embedBody = (s) => s.split(" Tags:")[0];
/** Every surface a reader sees, for the vocabulary scans. */
const readerText = (prose) => [
  prose.paragraph,
  prose.metaDescription,
  embedBody(prose.embedText),
];

describe("determinism and purity", () => {
  it("is byte-identical across repeated calls", () => {
    for (const seed of PROSE_SEEDS.filter((_, i) => i % 61 === 0)) {
      const { view, features, named } = caseFor(seed);
      const a = paletteProse(view.appliedCoeffs, view.hexColors, VIEW, { features, named });
      const b = paletteProse(view.appliedCoeffs, view.hexColors, VIEW, { features, named });
      expect(a).toEqual(b);
      // And without the reuse options — same analysis, same bytes.
      const c = paletteProse(view.appliedCoeffs, view.hexColors, VIEW);
      expect(c.paragraph).toBe(a.paragraph);
      expect(c.embedText).toBe(a.embedText);
    }
  });

  it("keeps steps, style and angle out of everything except the view sentence", () => {
    for (const seed of PROSE_SEEDS.filter((_, i) => i % 97 === 0)) {
      const { view, prose } = caseFor(seed);
      expect(prose.paragraph).toContain(
        "Shown here as a linear gradient in 7 steps at 90°",
      );
      // embedText: no hex, no view tokens — the index describes the palette,
      // not this render of it.
      expect(prose.embedText).not.toMatch(/#[0-9a-fA-F]{6}/);
      expect(prose.embedText).not.toContain("Shown here");
      expect(prose.embedText).not.toContain(" steps");
      expect(prose.embedText).not.toContain("linear gradient");
      expect(prose.metaDescription).not.toMatch(/#[0-9a-fA-F]{6}/);
      expect(prose.identity).not.toMatch(/#[0-9a-fA-F]{6}/);
      // The paragraph opens on the same identity sentence (hexes aside).
      expect(prose.paragraph.slice(0, 30)).toBe(prose.identity.slice(0, 30));
      // embedText is view-independent for style/angle (steps legitimately
      // move the rendered names), and paletteEmbedText is that composition.
      const alt = paletteProse(view.appliedCoeffs, view.hexColors, {
        style: "angularSwatches",
        steps: 7,
        angle: 45,
      });
      expect(alt.embedText).toBe(prose.embedText);
      expect(paletteEmbedText(view.appliedCoeffs, view.hexColors)).toBe(prose.embedText);
    }
  });
});

describe("step behavior", () => {
  it("holds the structure and the form sentence across 3/7/13/24 steps", () => {
    // 22 seeds at a fixed stride — wide enough to cover every structure class
    // (the fixture holds 19 grayscale seeds as its rarest class).
    const sample = PROSE_SEEDS.filter((_, i) => i % 40 === 0);
    expect(sample.length).toBeGreaterThanOrEqual(20);
    const SERIES = new Set(["tints", "shades", "tones", "tints-and-shades"]);
    const formOf = (parts) =>
      parts.impressions.find((id) => slotOf(id) === "form") ?? "";
    for (const seed of sample) {
      const at = (steps) => {
        const v = render(seed, steps);
        return paletteProseParts(v.appliedCoeffs, v.hexColors, { ...VIEW, steps });
      };
      const base = at(7);
      for (const steps of [3, 13, 24]) {
        const p = at(steps);
        // Structure is a dense-sample fact: it cannot move at all.
        expect(p.structure, `${seed} @ ${steps}`).toBe(base.structure);
        // The form sentence may appear or vanish (the budget is filled by
        // rank, and the tone/motion rows read rendered means), and the series
        // detector legitimately reads rendered stops — but a palette may never
        // change from one form sentence to a DIFFERENT one. Re-measured over
        // the whole fixture after the second visual-QA round: 6 such events in
        // 2,601 re-renders, all six inside the series family (one-color into
        // tints or shades, tones into one-color), plus 49 appear/vanish events.
        const a = formOf(base);
        const b = formOf(p);
        if (a && b && a !== b)
          expect(
            SERIES.has(a) || SERIES.has(b),
            `${seed} @ ${steps}: ${a} -> ${b}`,
          ).toBe(true);
      }
    }
  });
});

const slotOf = (id) => IMPRESSIONS.find((i) => i.id === id)?.slot;

// =============================================================================
// (a) Impression gating — the heart of the contract
// =============================================================================
//
// Every phrase in the paragraph is an impression, and an impression may be
// spoken only when its FULL conjunction holds. The predicates below are
// recomputed here from features, tags and stops — deliberately NOT by calling
// the module's own `when`, which would assert nothing — so a loosened gate in
// palette-prose.ts fails here.
//
// The four series rows are the one partial check: reproducing the tint/shade/
// tone detector would be copying it, so they assert the part that is
// independently checkable (monochrome structure, and the base word is the
// palette's family word) plus mutual exclusivity.

const isDeep = (f) => f.meanLightness < 0.45 && f.meanChroma >= 0.08;
const isJewel = (f) =>
  f.meanLightness >= 0.3 &&
  f.meanLightness <= 0.6 &&
  f.meanChroma >= 0.12 &&
  f.maxChroma >= 0.15;
// Round-4 QA: the light half is the registry's own LIGHT_LIGHTNESS, not a
// private 0.7 the tags disagreed with.
const isBrilliant = (f) =>
  f.meanChroma >= T.VIVID_CHROMA && f.meanLightness >= T.LIGHT_LIGHTNESS;
const saturationContrast = (f) =>
  f.denseChromaRange >= 0.15 && f.maxChroma - f.denseChromaRange < 0.04;
const warmCoolContrast = (f) =>
  hueBandShare(f, 330, 120) >= 0.25 && hueBandShare(f, 150, 300) >= 0.25;
const isOmbre = (f, structure) =>
  (structure === "monochrome" || structure === "analogous") &&
  f.turns === 0 &&
  f.lightnessRange >= 0.34;
const EVEN_SPREAD = 0.5;
const VISIBLE_MOVEMENT = 0.25;
const rampDominates = (f) =>
  f.denseLightnessRange >= VISIBLE_MOVEMENT &&
  Math.abs(f.lightnessDelta) >= 0.8 * f.denseLightnessRange;

/** id → an independent recomputation of the licensing conjunction. */
/**
 * The tone-gated family word (research-colorTheory §1.2): brown IS a dark
 * low-chroma orange, purple IS a dark magenta, pink IS a light low-chroma red,
 * and a band word may only be used where there is colour to name. Recomputed
 * here rather than imported, like every other gate in this table.
 */
const gatedFamily = (stop) => {
  if (!stop) return null;
  const band = familyWord(stop.h);
  // Brown is a dark orange OR a mid orange with most of its colour missing
  // (round-4 QA): one absolute chroma window cannot mean the same thing at two
  // lightnesses, which is the D19 conflation one level down.
  if (
    band === "orange" &&
    stop.C >= 0.04 &&
    ((stop.L < 0.55 && stop.C <= 0.13) ||
      (stop.L < T.LIGHT_LIGHTNESS && relativeSaturation(stop) < 0.6))
  )
    return "brown";
  if (band === "magenta" && stop.L < 0.55 && stop.C >= 0.12) return "purple";
  if (
    (band === "red" || band === "magenta") &&
    stop.L > 0.75 &&
    stop.C >= 0.04 &&
    stop.C < 0.15
  )
    return "pink";
  // ...and the relative disjunct has a visibility floor under it: at L → 1 the
  // gamut ceiling collapses, so any residue reads as 100% saturation and a
  // stop that IS white was being given a hue word.
  return stop.C >= T.FAMILY_CHROMA ||
    (relativeSaturation(stop) >= T.FAMILY_SATURATION && stop.C >= T.FAMILY_MIN_CHROMA)
    ? band
    : null;
};
// The lean also needs the mean hue to be a CONSENSUS: an angle exists even
// where the vectors that made it cancel, and 0.6 is a circular standard
// deviation of about 58°, so the chromatic mass fits inside the arc it names.
const grayLean = (f) =>
  f.denseMeanSaturation < T.GRAYSCALE_SAT &&
  f.denseMeanChroma >= 0.008 &&
  f.hueConcentration >= 0.6
    ? f.meanHue >= 330 || f.meanHue < 120
      ? "warm"
      : f.meanHue >= 150 && f.meanHue < 300
        ? "cool"
        : null
    : null;
const band = (h) => (h === null ? null : familyWord(h));
/**
 * Whether a hue sits confidently inside one band rather than on the line
 * between two. Recomputed from the eight anchors rather than imported, like
 * every other gate here: the margin is 8°, and `colorFamilies` returns both
 * neighbours inside it.
 */
const firm = (h) => h !== null && colorFamilies(h).length === 1;
/** Circular distance between the two hue anchors, degrees. */
const separation = (a, b) => {
  if (a === null || b === null) return 0;
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

const deepSpeaks = (c) =>
  isDeep(c.f) && c.f.lightnessRange < EVEN_SPREAD && Math.min(...c.stopL) > 0.18;

const GATES = {
  gray: (c) => c.structure === "grayscale" && grayLean(c.f) === null,
  "tinted-gray": (c) => c.structure === "grayscale" && grayLean(c.f) !== null,
  // "pale and soft" claims every stop, so the per-stop ceiling is the bound the
  // mean has to clear (round-4 QA: it sat at NEON_CHROMA, 2.7x the pastel line).
  "pale-soft": (c) =>
    c.has("pastel") &&
    c.has("high-key") &&
    c.f.meanChroma < T.PASTEL_CHROMA &&
    c.f.maxChroma < T.PASTEL_CHROMA,
  pale: (c) =>
    c.has("pastel") &&
    !c.has("high-key") &&
    c.f.meanChroma < T.PASTEL_CHROMA &&
    c.f.maxChroma < T.PASTEL_CHROMA,
  "bright-strong": (c) =>
    isBrilliant(c.f) && c.f.lightnessRange < EVEN_SPREAD && Math.min(...c.stopL) >= 0.65,
  neon: (c) => c.has("neon"),
  // ...and no stop may be muted, which is the same claim on the other axis.
  rich: (c) =>
    isJewel(c.f) &&
    c.f.lightnessRange < EVEN_SPREAD &&
    Math.max(...c.stopL) <= 0.7 &&
    Math.min(...c.stopC) >= T.MUTED_CHROMA,
  // The three dark rows share one predicate so a palette cannot fall between
  // them: "dark and strong" is a claim about every stop, and a run that passes
  // through black has stops with no colour in them at all.
  "dark-strong": (c) => deepSpeaks(c),
  "dark-even": (c) => c.has("low-key") && !deepSpeaks(c),
  dark: (c) => c.has("dark") && !deepSpeaks(c) && !c.has("low-key"),
  earthy: (c) => c.has("earthy"),
  muted: (c) => c.has("muted") && !c.has("earthy"),
  strong: (c) =>
    (c.has("vivid") ||
      (c.f.denseMeanSaturation >= 0.95 &&
        c.f.meanChroma >= T.PASTEL_CHROMA &&
        c.f.denseMinLightness > 0.18)) &&
    !c.has("neon") &&
    !isBrilliant(c.f) &&
    !isJewel(c.f),
  light: (c) =>
    c.has("light") &&
    c.has("high-key") &&
    !c.has("pastel") &&
    !c.has("neon") &&
    !isBrilliant(c.f),
  "color-beside-gray": (c) => saturationContrast(c.f),
  "warm-and-cool": (c) => warmCoolContrast(c.f),
  warm: (c) =>
    c.has("warm") && !c.journeyClaim && hueBandShare(c.f, 330, 120) >= T.FAMILY_BAND,
  cool: (c) =>
    c.has("cool") && !c.journeyClaim && hueBandShare(c.f, 150, 300) >= T.FAMILY_BAND,
  "tints-and-shades": (c) => c.structure === "monochrome" && c.base !== null,
  tints: (c) => c.structure === "monochrome" && c.base !== null,
  shades: (c) => c.structure === "monochrome" && c.base !== null,
  tones: (c) => c.structure === "monochrome" && c.base !== null,
  "one-color": (c) =>
    c.structure === "monochrome" && c.base !== null && c.f.denseSaturationRange < 0.35,
  fade: (c) =>
    c.structure === "analogous" &&
    isOmbre(c.f, c.structure) &&
    c.base !== null &&
    band(c.f.firstHue) === band(c.f.lastHue),
  "two-colors": (c) =>
    c.structure === "duotone" &&
    !c.has("pure-white-plateau") &&
    !c.has("pure-black-plateau"),
  "opposite-colors": (c) => c.structure === "complementary",
  "whole-wheel": (c) => c.has("full-wheel"),
  rainbow: (c) => c.structure === "rainbow" && !c.has("full-wheel"),
  repeats: (c) =>
    c.f.equalC &&
    (c.f.channelCycles[0] + c.f.channelCycles[1] + c.f.channelCycles[2]) / 3 >= 1.5,
  // The sentence claims the COLORS return, so the gate measures that and not
  // the hue angle: `colorReturn` is the smallest distance between samples a
  // third of the ramp apart with a visible excursion between them.
  "back-and-forth": (c) => c.f.colorReturn < 0.02,
  neighbors: (c) =>
    c.structure === "analogous" &&
    band(c.f.firstHue) !== band(c.f.lastHue) &&
    // ...and the two anchors have to be one family apart (360/8): different
    // BANDS can be 30° apart when they merely straddle the line between two,
    // which is not a journey between colours.
    separation(c.f.firstHue, c.f.lastHue) >= 45 &&
    firm(c.f.firstHue) &&
    firm(c.f.lastHue) &&
    gatedFamily(c.f.firstChromatic) !== null &&
    gatedFamily(c.f.lastChromatic) !== null,
  "one-family": (c) =>
    c.structure === "analogous" &&
    c.base !== null &&
    (c.f.firstHue === null ||
      c.f.lastHue === null ||
      band(c.f.firstHue) === band(c.f.lastHue)) &&
    !c.names.some((n) => n.toLowerCase().includes(c.base)),
  // The row fires for every multicolor palette; whether it is SPOKEN is a
  // ranking question (it carries 1.4 bits) plus the restatement demotion.
  "several-colors": (c) => c.structure === "multicolor",
  "black-block": (c) => c.has("pure-black-plateau"),
  "white-block": (c) => c.has("pure-white-plateau"),
  "full-range": (c) =>
    c.f.lightnessRange > T.HIGH_CONTRAST_RANGE &&
    Math.min(...c.stopL) < 0.18 &&
    Math.max(...c.stopL) > 0.87 &&
    !c.has("bright-middle") &&
    !c.has("dark-middle"),
  "bright-middle": (c) => c.has("bright-middle"),
  "dark-middle": (c) => c.has("dark-middle"),
  // Both of these are the FLOOR of the motion slot: where the palette has a
  // named shape, the shape sentence contains them.
  wavy: (c) => c.f.turns >= 2 && !c.has("bright-middle") && !c.has("dark-middle"),
  "flat-brightness": (c) => c.has("iso-luminant"),
  steady: (c) => c.has("low-contrast") && !c.has("iso-luminant"),
  // Direction is a ratio, not a shape: an arch whose net travel is at least
  // four fifths of everything it travels is a ramp with a wobble in it.
  brightens: (c) =>
    (c.has("brightening") || (c.f.turns === 1 && c.f.lightnessDelta > 0)) &&
    rampDominates(c.f),
  darkens: (c) =>
    (c.has("darkening") || (c.f.turns === 1 && c.f.lightnessDelta < 0)) &&
    rampDominates(c.f),
  warming: (c) => c.journeyClaim === "warming",
  cooling: (c) => c.journeyClaim === "cooling",
  "light-background": (c) =>
    c.has("high-key") &&
    c.f.meanChroma < T.PASTEL_CHROMA &&
    c.f.maxChroma < T.PASTEL_CHROMA &&
    Math.max(...c.lum) >= 4.5 * 0.05 - 0.05,
  "dark-background": (c) =>
    (c.has("dark") || c.has("low-key")) &&
    c.f.lightnessRange < 0.3 &&
    Math.min(...c.lum) <= 1.05 / 4.5 - 0.05,
  // ...of the two END stops, which is what the sentence talks about.
  "text-both-ends": (c) =>
    Math.max(c.lum[0], c.lum[c.lum.length - 1]) >= 4.5 * 0.05 - 0.05 &&
    Math.min(c.lum[0], c.lum[c.lum.length - 1]) <= 1.05 / 4.5 - 0.05 &&
    c.f.lightnessRange > 0.3,
  loops: (c) => c.has("seamless") && c.f.seam < 0.02 && !c.has("solid"),
};

const gateCtx = (seed) => {
  const { view, features: f, prose } = caseFor(seed);
  const tags = modifierTags(f);
  return {
    f,
    structure: classifyStructure(f),
    has: (w) => tags.includes(w),
    base: gatedFamily(f.chromaPeak),
    stopL: view.hexColors.map((h) => hexToOkLch(h).L),
    stopC: view.hexColors.map((h) => hexToOkLch(h).C),
    lum: view.hexColors.map(relativeLuminance),
    // The journey value the page uses comes from the stored palette-tags
    // vocabulary; the embed Tags line carries it, which is where this reads it.
    // The color names the identity sentence actually spent (usually the name
    // system's list, plus the end stop's own name when one name covered both
    // ends) — the echo gates read them.
    names: caseFor(seed).parts.colorNames,
    // The journey value the page uses comes from the stored palette-tags
    // vocabulary; the embed Tags line carries it, which is where this reads it.
    // `journeyClaim` is that value once the arrival test has passed: the stored
    // formula reads red minus blue on the channels, which is not a direction on
    // the hue circle, so a "warmer" claim has to end in the warm arc.
    journeyClaim: (() => {
      const journey = /(?:^| )Tags:[^.]*\bwarming\b/.test(prose.embedText)
        ? "warming"
        : /(?:^| )Tags:[^.]*\bcooling\b/.test(prose.embedText)
          ? "cooling"
          : null;
      const h = f.lastHue;
      if (journey === "warming") return h !== null && (h >= 330 || h < 120) ? journey : null;
      if (journey === "cooling") return h !== null && h >= 150 && h < 300 ? journey : null;
      return null;
    })(),
  };
};

describe("impression gating", () => {
  it("covers every impression with an independent gate", () => {
    expect(Object.keys(GATES).sort()).toEqual(IMPRESSIONS.map((i) => i.id).sort());
  });

  it("speaks an impression only when its full conjunction holds", () => {
    const spoken = Object.fromEntries(IMPRESSIONS.map((i) => [i.id, 0]));
    for (const seed of PROSE_SEEDS) {
      const { parts } = caseFor(seed);
      const c = gateCtx(seed);
      for (const id of parts.impressions) {
        spoken[id] += 1;
        expect(GATES[id](c), `${seed}: spoke "${id}" without its predicate`).toBe(true);
      }
      // Solid palettes veto every slot except `use`: no journey, no shape.
      if (c.has("solid"))
        for (const id of parts.impressions) expect(slotOf(id), seed).toBe("use");
      // One sentence per slot, at most two sentences, and reading order.
      const slots = parts.impressions.map(slotOf);
      expect(new Set(slots).size, seed).toBe(slots.length);
      expect(parts.impressions.length, seed).toBeLessThanOrEqual(2);
      const order = { tone: 0, form: 1, motion: 2, use: 3 };
      expect([...slots].sort((a, b) => order[a] - order[b]), seed).toEqual(slots);
      // Every chosen impression's sentence is actually rendered, on the page
      // and in the embedding body, and nothing else sits between the identity
      // sentence and the view sentence.
      const { prose } = caseFor(seed);
      const body = prose.paragraph
        .replace(parts.identityWithHex, "")
        .replace(parts.view, "")
        .trim();
      expect(body, seed).toBe(parts.sentences.join(" "));
      for (const sentence of parts.sentences) {
        expect(prose.paragraph, seed).toContain(sentence);
        expect(embedBody(prose.embedText), seed).toContain(sentence);
      }
    }
    // Spot-check coverage: an impression the fixture never speaks is a phrase
    // no one has ever read, so the count is recorded rather than assumed.
    const silent = Object.entries(spoken)
      .filter(([, n]) => n === 0)
      .map(([id]) => id);
    // tints-and-shades needs a tint AND a shade series at once (0 of 867 live
    // seeds; the editor reaches it) and two-colors is the duotone row, spoken
    // 46 times. Anything else joining this list means a gate went dead.
    expect(silent).toEqual(["tints-and-shades"]);
  });

  it("re-measures every prevalence it ships", () => {
    const counts = Object.fromEntries(IMPRESSIONS.map((i) => [i.id, 0]));
    for (const seed of PROSE_SEEDS) {
      const { view, features, named } = caseFor(seed);
      const fires = impressionFires(view.appliedCoeffs, view.hexColors, {
        features,
        named,
      });
      for (const [id, v] of Object.entries(fires)) if (v) counts[id] += 1;
    }
    for (const imp of IMPRESSIONS) {
      const measured = counts[imp.id] / PROSE_SEEDS.length;
      // The fixture is fixed, so a recorded prevalence is exact, not a band:
      // it IS the ranking, and a stale number silently reorders the site.
      expect(
        Math.abs(measured - imp.prevalence),
        `${imp.id}: measured ${measured.toFixed(4)}, table ${imp.prevalence}`,
      ).toBeLessThan(0.0006);
    }
  });

  it("keeps the fired set identical to the gates over the whole fixture", () => {
    for (const seed of PROSE_SEEDS) {
      const { view, features, named } = caseFor(seed);
      const fires = impressionFires(view.appliedCoeffs, view.hexColors, {
        features,
        named,
      });
      const c = gateCtx(seed);
      for (const imp of IMPRESSIONS) {
        // The series rows have partial gates (see GATES), so they are asserted
        // one way only: firing implies monochrome, not the converse.
        if (["tints", "shades", "tones", "tints-and-shades", "one-color"].includes(imp.id)) {
          if (fires[imp.id]) expect(GATES[imp.id](c), `${seed}/${imp.id}`).toBe(true);
          continue;
        }
        expect(fires[imp.id], `${seed}/${imp.id}`).toBe(GATES[imp.id](c));
      }
      // A monochrome palette gets AT MOST one of the five monochrome rows: they
      // partition the transformations, and all five now also require a
      // nameable base, so a monochrome too washed out to have a colour word
      // (measured: 11 of the fixture's 132) gets none of them and spends its
      // budget on something it can say truthfully.
      const mono = ["tints", "shades", "tones", "tints-and-shades", "one-color"].filter(
        (id) => fires[id],
      );
      expect(mono.length, seed).toBeLessThanOrEqual(c.structure === "monochrome" ? 1 : 0);
    }
  });
});

// =============================================================================
// (b) The banned-token scan
// =============================================================================

/**
 * D20.3's list, plus the words a reader would recognise as the instrument
 * showing through. The scan runs on the paragraph, the meta description and
 * the embed BODY — never the embed's "Tags:" and "Colors:" lines, which carry
 * the technical vocabulary on purpose (D20.7).
 */
const BANNED_WORDS = [
  "hue", "hues", "chroma", "saturation", "saturated", "lightness", "value",
  "values", "wcag", "channel", "channels", "clip", "clipped", "clipping",
  "gamut", "cycle", "cycles", "frequency", "phase", "amplitude", "iso-luminant",
  "seam", "seamless", "ramp", "arch", "monotone", "monotonic", "span", "spans",
  "degree", "degrees", "cluster", "clusters", "opponent", "spectral",
  "analogous", "complementary", "tetradic", "triadic", "mean", "median",
  "luminance", "luma", "ratio", "contrast", "threshold", "percent",
];

describe("banned tokens", () => {
  it("never lets the analysis vocabulary reach a reader", () => {
    for (const seed of PROSE_SEEDS) {
      const { prose } = caseFor(seed);
      for (const text of readerText(prose)) {
        const words = new Set(text.toLowerCase().match(/[a-z][a-z'-]*/g) ?? []);
        for (const banned of BANNED_WORDS)
          expect(words.has(banned), `${seed}: "${banned}" in "${text}"`).toBe(false);
      }
    }
  });

  it("bans em dashes and en dashes everywhere, Tags line included", () => {
    for (const seed of PROSE_SEEDS) {
      const { prose } = caseFor(seed);
      for (const text of [
        prose.paragraph,
        prose.metaDescription,
        prose.embedText,
        prose.identity,
      ])
        expect(/[–—]/.test(text), `${seed}: ${text}`).toBe(false);
    }
  });

  it("prints no number except the end hexes and the steps/angle", () => {
    for (const seed of PROSE_SEEDS) {
      const { prose } = caseFor(seed);
      // The paragraph: hex codes in the identity sentence, and the view
      // sentence's step count and angle. Nothing else may carry a digit.
      const paragraph = stripHex(prose.paragraph).replace(
        / in \d+ steps? at \d+°/,
        "",
      );
      expect(paragraph, seed).not.toMatch(/\d/);
      // The meta description and the embed body carry neither.
      expect(prose.metaDescription, seed).not.toMatch(/\d/);
      expect(embedBody(prose.embedText), seed).not.toMatch(/\d/);
    }
  });
});

// =============================================================================
// (c) Translation friendliness
// =============================================================================

/**
 * Every word the description templates can produce, reviewed once.
 *
 * The audience is global and much of this text is read through machine
 * translation, so the vocabulary is short, common and concrete: no idiom, no
 * metaphor that does not travel, no phrasal verb where a single verb exists.
 * This list IS that review — it was generated from the fixture and read
 * through by hand — and asserting the corpus stays inside it means a new
 * phrasing has to be added here deliberately rather than slipping in.
 *
 * Color names are exempt (they come from the 920-name corpus, a separate
 * bounded vocabulary) and are stripped before the check.
 */
const ALLOWED_WORDS = new Set([
  "a", "against", "all", "almost", "an", "and", "are", "areas", "as",
  "at", "autumn", "back", "background", "barely", "becomes", "behind",
  "below", "between", "black", "blue", "both", "break", "bright",
  "brightest", "brightness", "brown", "built", "change", "changes",
  "clear", "codes", "color", "colorless", "colors", "cool", "cooler", "copy",
  "css", "cyan", "dark", "darkened", "darker", "darkest", "deep",
  "direction", "duotone", "earthy", "end", "ends", "enough",
  "every", "everything", "export", "fade", "fades", "forth", "forward", "from",
  "full", "gradient", "gray", "grays", "grayscale", "green", "groups", "held",
  "here",
  "hex", "holds", "how", "in", "inside", "instead", "intense", "into", "is",
  "it", "its", "jumps", "light", "lightened", "lighter", "like", "linear",
  "little", "look", "loops", "magenta", "many", "match", "middle",
  "meet", "monochrome", "more", "mostly", "move", "moves", "muted", "nearly",
  "neon",
  "already", "has", "next", "no", "ocean", "of", "on", "once", "one", "only",
  "opposite", "or", "other", "passed", "returns",
  // Round-3 QA: "It repeats colors from earlier in the gradient." replaced a
  // present-perfect clause with a stranded preposition, and "Most of it is
  // solid black." split the plateau row into its two share bands.
  "earlier", "most", "repeats",
  // Round-4 QA: "It gets lighter and darker more than once." replaced a turn
  // count stated as a direction change, and the loop sentence dropped its
  // restating first clause.
  "gets",
  "orange", "pairing", "pale", "palette", "part", "passes", "pastel", "pink",
  "png", "purple", "rainbow", "range", "readable", "ready", "red", "renders",
  "return", "running", "runs", "same", "separate", "several", "shown", "sides",
  "single", "sit", "sits", "skips", "so", "soft", "softened", "solid",
  "start", "stay", "stays", "steps", "stop", "strong", "strongest", "sunset",
  "svg", "sweeping", "text", "than", "that", "the", "them", "there",
  "through", "time", "to", "travels", "two", "under", "uses", "very",
  "violet", "visible", "warm", "warmer", "weaving", "wheel", "while",
  "white", "whole", "winding", "with", "within", "works", "yellow",
]);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("translation friendliness", () => {
  it("stays inside the reviewed word list", () => {
    const unexpected = new Map();
    for (const seed of PROSE_SEEDS) {
      const { prose, parts } = caseFor(seed);
      for (const text of readerText(prose)) {
        let t = text.toLowerCase().replace(/#[0-9a-f]{6}/g, " ");
        // Whole-word removal: substring removal turned "earthy" into "y" when
        // the palette was also named "earth". parts.colorNames rather than the
        // name system's list, because the identity sentence adds the end stop's
        // own name when one name covered both ends.
        for (const name of [...parts.colorNames].sort((a, b) => b.length - a.length))
          t = t.replace(new RegExp(`\\b${escapeRe(name.toLowerCase())}\\b`, "g"), " ");
        for (const w of t.match(/[a-z][a-z'-]*/g) ?? [])
          if (!ALLOWED_WORDS.has(w)) unexpected.set(w, seed);
      }
    }
    expect([...unexpected.entries()]).toEqual([]);
  });

  it("keeps sentences short enough to translate", () => {
    // One idea per clause, under ~15 words. The identity sentence is the
    // exception the owner approved: it lists the palette's color names, so it
    // grows with the palette and is measured separately (max 27 words over the
    // fixture, almost all of them color names and hex codes).
    for (const seed of PROSE_SEEDS) {
      const { parts } = caseFor(seed);
      for (const sentence of parts.sentences) {
        const words = sentence.split(/\s+/).filter(Boolean);
        expect(words.length, `${seed}: ${sentence}`).toBeLessThanOrEqual(15);
      }
    }
  });
});

// =============================================================================
// (d) Shape: sentence counts and lengths
// =============================================================================

describe("budget", () => {
  it("spends 2 to 4 sentences and stays inside the measured length band", () => {
    // Re-measured at the LIVE wiring after the final visual-QA round
    // (2026-08-18): paragraph p0 198, p50 292, p95 328, max 351; meta p0 97,
    // p50 121, max 159; embed p0 158, p50 328, max 469. The paragraph BODY,
    // without the shared view sentence, is p50 187 / max 246 — that is the
    // number D20's 150-to-400 band is really about, since the view sentence is
    // a page surface and never reaches embedText. D20 asks for 2 to 4
    // sentences and roughly 150 to
    // 400 characters, and the ladder in paletteProse never fires at these
    // lengths.
    const lengths = [];
    for (const seed of PROSE_SEEDS) {
      const { prose, parts } = caseFor(seed);
      lengths.push(prose.paragraph.length);
      // identity + 1..2 impressions + view sentence.
      const sentences = 2 + parts.impressions.length;
      expect(sentences, seed).toBeGreaterThanOrEqual(2);
      expect(sentences, seed).toBeLessThanOrEqual(4);
      expect(prose.paragraph.length, seed).toBeGreaterThanOrEqual(180);
      expect(prose.paragraph.length, seed).toBeLessThanOrEqual(420);
      expect(prose.metaDescription.length, seed).toBeLessThanOrEqual(160);
      expect(prose.embedText.length, seed).toBeLessThanOrEqual(1600);
      // The body a reader is asked to read, without the boilerplate close.
      const body = prose.paragraph.replace(parts.view, "").trim();
      expect(body.length, seed).toBeLessThanOrEqual(300);
    }
    lengths.sort((a, b) => a - b);
    const q = (p) => lengths[Math.min(lengths.length - 1, Math.floor(p * lengths.length))];
    expect(q(0.5)).toBeGreaterThanOrEqual(250);
    expect(q(0.5)).toBeLessThanOrEqual(340);
    expect(q(0.95)).toBeLessThanOrEqual(400);
  });

  it("gives a plain palette a short description rather than padding it", () => {
    // D20.1: a palette with nothing unusual gets one sentence of character.
    // Measured: 81 of 867 (76 with one impression, 5 with none), up from 22
    // over the second, third and fourth visual-QA rounds, each of which took
    // the gate off a sentence that was firing where it was not true. If this
    // ever reaches zero, something is padding.
    const single = PROSE_SEEDS.filter(
      (seed) => caseFor(seed).parts.impressions.length < 2,
    );
    expect(single.length).toBeGreaterThan(0);
    expect(single.length).toBeLessThan(100);
  });
});

describe("solid-color veto", () => {
  // b = 0 in every channel collapses the cosine to its offset — every stop
  // one hex. The editor reaches this directly (contrast slider at 0).
  const coeffs = [
    [0.42, 0.31, 0.25],
    [0, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ];
  const hexColors = cosineGradient(7, coeffs).map(([r, g, b]) => rgbToHex(r, g, b));

  it("states the degenerate case and drops every journey construction", () => {
    const prose = paletteProse(coeffs, hexColors, VIEW);
    const parts = paletteProseParts(coeffs, hexColors, VIEW);
    expect(new Set(hexColors).size).toBe(1);
    expect(prose.paragraph).toContain("one solid color");
    expect(prose.paragraph).toContain("at every stop");
    // The view sentence is boilerplate ("ready to copy below"), so the journey
    // scan runs on the described palette, not on the page furniture.
    const body = prose.paragraph.replace(parts.view, "").trim();
    for (const journey of [
      " to ",
      "running",
      "sweeping",
      "becomes",
      "fades",
      "travels",
      "changes",
    ])
      expect(body, journey).not.toContain(journey);
    // The page still gets its view sentence, and the index still gets its tags.
    expect(prose.paragraph).toContain("Shown here as");
    expect(prose.embedText).toContain("Tags:");
    expect(prose.embedText).toContain("solid");
  });
});

describe("measure-first prevalence contract", () => {
  it("re-measures every detector into its recorded rate and band", () => {
    const counts = Object.fromEntries(Object.keys(MEASURE_FIRST).map((w) => [w, 0]));
    for (const seed of PROSE_SEEDS) {
      const { view, features } = caseFor(seed);
      const fires = measureFirstFires(features, view.hexColors);
      for (const [w, v] of Object.entries(fires)) if (v) counts[w] += 1;
    }
    for (const [word, { use, rate }] of Object.entries(MEASURE_FIRST)) {
      const measured = counts[word] / PROSE_SEEDS.length;
      // The fixture is fixed, so the recorded rate is exact, not a band.
      expect(Math.abs(measured - rate), `${word}: ${measured}`).toBeLessThan(0.0005);
      // The band rule that placed each word: 2%–60% is eligible for prose,
      // under 2% is embedding-tail only, over 60% would say nothing.
      // Eligibility is necessary, not sufficient — `opponent-axis` clears the
      // band and still has no impression, because its only phrasing is jargon.
      const expectedUse =
        measured >= 0.02 && measured <= 0.6 ? "prose" : measured < 0.02 ? "embed" : "silent";
      expect(use, word).toBe(expectedUse);
    }
  });
});

describe("corpus acceptance (the templated-page test)", () => {
  it("never repeats a paragraph across distinct palettes", () => {
    // Three seed PAIRS in the live sitemap are the same palette twice: applied
    // coefficients differing by float residue below the 3-decimal quantum, so
    // the renders agree to at most one 8-bit step on one channel of one stop.
    // A deterministic generator must describe the same palette the same way,
    // so collisions are asserted to occur ONLY between renders that close, and
    // only those three pairs exist.
    const byParagraph = new Map();
    let collisions = 0;
    for (const seed of PROSE_SEEDS) {
      const { view, prose } = caseFor(seed);
      const prev = byParagraph.get(prose.paragraph);
      if (prev) {
        collisions++;
        expect(prev.hexColors.length, `${prev.seed} vs ${seed}`).toBe(
          view.hexColors.length,
        );
        for (let i = 0; i < view.hexColors.length; i++) {
          const a = hexToOkLch(prev.hexColors[i]);
          const b = hexToOkLch(view.hexColors[i]);
          const d = Math.hypot(a.L - b.L, a.C - b.C);
          expect(d, `${prev.seed} vs ${seed} @ stop ${i}`).toBeLessThan(0.01);
        }
      } else {
        byParagraph.set(prose.paragraph, { seed, hexColors: view.hexColors });
      }
    }
    expect(collisions).toBeLessThanOrEqual(3);
  });

  it("varies the skeleton, not just the fill", () => {
    // Strip everything palette-specific — digits, hexes, the palette's own
    // color names, the family words — and count what remains. Measured: 571
    // distinct skeletons over the 867 seeds, down from 836 with three times
    // the text; 50 is the acceptance floor at which the corpus stops reading
    // as one fill-in-the-blanks template. Shorter text buys variety through
    // sharper selection (48 impressions over 4 slots), never through padding.
    const familyWords = [...new Set(Array.from({ length: 360 }, (_, h) => familyWord(h)))];
    const skeletons = new Set();
    for (const seed of PROSE_SEEDS) {
      const { prose, parts } = caseFor(seed);
      let s = stripHex(prose.paragraph).replace(/\d+(\.\d+)?/g, "#");
      for (const name of [...parts.colorNames].sort((a, b) => b.length - a.length))
        s = s.split(name).join("~");
      for (const w of familyWords) s = s.replace(new RegExp(`\\b${w}\\b`, "g"), "~");
      skeletons.add(s);
    }
    expect(skeletons.size).toBeGreaterThanOrEqual(50);
  });

  it("keeps pairwise word-trigram overlap low", () => {
    const trigrams = (text) => {
      const words = text.toLowerCase().replace(/[^a-z0-9# ]/g, "").split(/\s+/).filter(Boolean);
      const set = new Set();
      for (let i = 0; i + 2 < words.length; i++)
        set.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
      return set;
    };
    const jaccard = (a, b) => {
      let inter = 0;
      for (const t of a) if (b.has(t)) inter++;
      return inter / (a.size + b.size - inter);
    };
    const rand = lcg(42);
    const sets = new Map();
    const setFor = (seed) => {
      let s = sets.get(seed);
      if (!s) {
        s = trigrams(caseFor(seed).prose.paragraph);
        sets.set(seed, s);
      }
      return s;
    };
    let sum = 0;
    let max = 0;
    const PAIRS = 200;
    for (let i = 0; i < PAIRS; i++) {
      const a = PROSE_SEEDS[Math.floor(rand() * PROSE_SEEDS.length)];
      let b = PROSE_SEEDS[Math.floor(rand() * PROSE_SEEDS.length)];
      if (a === b) b = PROSE_SEEDS[(PROSE_SEEDS.indexOf(a) + 1) % PROSE_SEEDS.length];
      const j = jaccard(setFor(a), setFor(b));
      sum += j;
      max = Math.max(max, j);
    }
    // Measured over this sampling: mean 0.309, max 0.656. The bound is the one
    // the long paragraphs met (mean 0.35 / max 0.80), and the short ones still
    // meet it: the shared view sentence is a larger share of a shorter text,
    // and sharper selection paid for it. The max rose from 0.545 in the second
    // visual-QA round, where two short paragraphs of the same shape (identity
    // plus one common tone sentence) landed in the sample.
    expect(sum / PAIRS).toBeLessThan(0.35);
    expect(max).toBeLessThan(0.8);
  });

  it("carries the demand phrase in every identity sentence", () => {
    for (const seed of PROSE_SEEDS) {
      const { prose } = caseFor(seed);
      expect(prose.identity).toContain("gradient color palette");
      expect(prose.paragraph).toContain("gradient color palette");
    }
  });
});

// =============================================================================
// Chips: D18 ranking and D17 compounds
// =============================================================================

const SPOKEN_WORDS = new Set(
  DESCRIPTORS.filter((d) => d.spoken).map((d) => spokenWord(d)),
);
const UNIVERSALS = ["white", "black", "gray", "grey"];
const isCompound = (label) => {
  const parts = label.split(" ");
  return parts.length === 2 && parts.every((w) => SPOKEN_WORDS.has(w));
};

describe("relatedSearches", () => {
  it("returns deterministic, bounded, deduped labels from the bounded vocabularies", { timeout: 20000 }, () => {
    const familyWords = new Set(Array.from({ length: 360 }, (_, h) => familyWord(h)));
    for (const seed of PROSE_SEEDS) {
      const { features, named } = caseFor(seed);
      const tags = modifierTags(features);
      const labels = relatedSearches(features, named, tags);
      expect(labels).toEqual(relatedSearches(features, named, tags));
      expect(labels.length).toBeGreaterThanOrEqual(1);
      expect(labels.length).toBeLessThanOrEqual(6);
      const lower = labels.map((l) => l.toLowerCase());
      expect(new Set(lower).size).toBe(labels.length);
      for (const label of labels) {
        const ok =
          named.colorNames.includes(label) ||
          // The dominant-plateau label ("black" on a palette that renders two
          // thirds pure black) is a corpus name that the ramp's own naming may
          // not have chosen — still bounded, still a colour-name query.
          isColorName(label) ||
          SPOKEN_WORDS.has(label) ||
          familyWords.has(label) ||
          isCompound(label);
        expect(ok, `${seed}: "${label}" outside the bounded vocabularies`).toBe(true);
      }
    }
  });

  it("ranks color names by the chroma of the stop they name (D18)", { timeout: 20000 }, () => {
    for (const seed of PROSE_SEEDS) {
      const { features, named } = caseFor(seed);
      const tags = modifierTags(features);
      const labels = relatedSearches(features, named, tags);
      // The candidate list is the palette's DISTINCT stop names under its own
      // tone veto (round-3 QA), not the two-to-four the title could fit, so the
      // recomputation has to name the stops the same way.
      const veto = toneVeto(tags);
      const stopNames = named.stops.map((h) => nameOf(h, veto));
      const chromaOf = (name) => {
        const at = stopNames.indexOf(name);
        return at >= 0 ? hexToOkLch(named.stops[at]).C : 0;
      };
      // The dominant-plateau label leads the row by share, not by chroma, so
      // it is excluded from the chroma ordering it deliberately breaks.
      const dominant =
        features.allBlackShare >= 0.5 ? "black" : features.allWhiteShare >= 0.5 ? "white" : null;
      // Recompute the colour-name segment the row is supposed to emit: the
      // palette's DISTINCT names (the same farthest-point selection, no
      // ceiling), ranked by the chroma of the stop each names, minus the D18
      // demotions, capped by what the structure can carry. Comparing the
      // finished row against a re-derivation rather than eyeballing its order is
      // what makes this an assertion about the RULE — a modifier word that is
      // also a corpus colour name ("ocean", "sunset") cannot be mistaken for a
      // colour label by an order check.
      const budget = NAMES_FOR_STRUCTURE[classifyStructure(features)] ?? 3;
      const demoted = (s) =>
        UNIVERSALS.includes(s.name.toLowerCase()) ||
        s.L < 0.1 ||
        (s.C < T.CHROMA_FLOOR && s.L > 0.9);
      // ...minus a name that is only a qualified form of one already chosen
      // ("peach" beside "pale peach"), which is one suggestion in two chips.
      const qualifies = (name, chosen) => {
        const a = ` ${name.toLowerCase()} `;
        return chosen.some((l) => {
          const b = ` ${l.toLowerCase()} `;
          return a !== b && (a.includes(b) || b.includes(a));
        });
      };
      const expected = [];
      for (const s of getUniqueColorNames([...named.stops], {
        max: named.stops.length,
        veto,
      })
        .map((name, i) => {
          const at = stopNames.indexOf(name);
          const lch = at >= 0 ? hexToOkLch(named.stops[at]) : null;
          return { name, i, C: lch?.C ?? 0, L: lch?.L ?? 0.5 };
        })
        .sort((a, b) => b.C - a.C || a.i - b.i)) {
        if (expected.length >= budget) break;
        if (demoted(s) || s.name === dominant) continue;
        if (qualifies(s.name, dominant ? [dominant, ...expected] : expected)) continue;
        expected.push(s.name);
      }
      const lead = labels.slice(dominant ? 1 : 0, (dominant ? 1 : 0) + expected.length);
      expect(lead, `${seed}: ${labels.join(" | ")}`).toEqual(expected);
      for (let i = 1; i < expected.length; i++)
        expect(
          chromaOf(expected[i - 1]) >= chromaOf(expected[i]) - 1e-9,
          `${seed}: ${expected.join(" > ")} out of chroma order`,
        ).toBe(true);
    }
  });

  it("chips a bare universal only as a last resort or as the palette itself", () => {
    let lastResort = 0;
    let dominant = 0;
    for (const seed of PROSE_SEEDS) {
      const { features, named } = caseFor(seed);
      const labels = relatedSearches(features, named, modifierTags(features));
      const universal = labels.filter((l) => UNIVERSALS.includes(l.toLowerCase()));
      if (!universal.length) continue;
      // Two ways in, and only two. Either the row had nothing better to say
      // (D18.2's fallback), or the flat block IS the palette: a ramp that
      // renders 68.8% pure black used to spend both top chips on near-synonyms
      // for its two thin brown edges and never offer the colour a visitor sees.
      const isDominant =
        features.allBlackShare >= 0.5 || features.allWhiteShare >= 0.5;
      if (isDominant) {
        dominant++;
        expect(labels[0], seed).toBe(features.allBlackShare >= 0.5 ? "black" : "white");
      } else {
        lastResort++;
        expect(labels.length, `${seed}: ${labels.join(", ")}`).toBeLessThanOrEqual(2);
      }
    }
    // Measured: 6 dominant rows (five at 63-69% pure black, one at 100% pure
    // white) and no last-resort ones — the solid-white palette that used to be
    // the only fallback row is now the dominant case instead, which is the same
    // chip for a better reason. It was 8 until the round-4 QA round moved
    // PLATEAU_DOMINANT to a majority: "Most of it is solid white" was being
    // said of a palette that is 45.8% white, and the same constant decides
    // whether the universal leads the chip row. The fallback branch stays because the
    // editor reaches states the sitemap never sampled; the grayscale row test
    // below is what proves no palette renders an empty nav. The owner's
    // counter-example, a pastel ramp that is 27.1% white, is under the floor
    // and chips its colours instead, which is the test after that.
    expect(lastResort).toBe(0);
    expect(dominant).toBe(6);
  });

  it("chips the screenshot palette without white", () => {
    // The owner's report: a pastel white → cream → pink → lavender palette
    // chipped "white" first because ramp order ranked it first. The white stop
    // is achromatic and extreme, so it is demoted; the chromatic stops name it.
    const seed = "_gBwgF1gI_gHyf7Yf7CgDBf7af4cf_tgGIgUVpq0ky8gh";
    const { view, features, named } = caseFor(seed);
    expect(view.hexColors).toContain("#ffffff");
    const labels = relatedSearches(features, named, modifierTags(features));
    expect(labels.length).toBeGreaterThanOrEqual(2);
    for (const l of labels) expect(UNIVERSALS).not.toContain(l.toLowerCase());
    expect(labels).toContain("pastel");
  });

  it("still chips a grayscale palette", () => {
    const grayscale = PROSE_SEEDS.filter(
      (seed) => classifyStructure(caseFor(seed).features) === "grayscale",
    );
    expect(grayscale.length).toBeGreaterThan(5);
    for (const seed of grayscale) {
      const { features, named } = caseFor(seed);
      const labels = relatedSearches(features, named, modifierTags(features));
      expect(labels.length, seed).toBeGreaterThanOrEqual(1);
    }
  });

  it("emits compounds only from co-fired, non-contradictory pairs (D17)", () => {
    const distinct = new Map();
    let rowsWithCompound = 0;
    const SLOT = { temperature: 0, tone: 1, family: 2, structure: 3 };
    for (const seed of PROSE_SEEDS) {
      const { features, named } = caseFor(seed);
      const tags = modifierTags(features);
      const labels = relatedSearches(features, named, tags);
      const compounds = labels.filter(isCompound);
      expect(compounds.length, seed).toBeLessThanOrEqual(2);
      if (compounds.length) rowsWithCompound++;
      for (const label of compounds) {
        distinct.set(label, (distinct.get(label) ?? 0) + 1);
        const [a, b] = label.split(" ");
        // Both halves are true of this palette.
        const da = DESCRIPTORS.find((d) => d.spoken && spokenWord(d) === a && tags.includes(d.word));
        const db = DESCRIPTORS.find((d) => d.spoken && spokenWord(d) === b && tags.includes(d.word));
        expect(da, `${seed}: "${a}" did not fire`).toBeTruthy();
        expect(db, `${seed}: "${b}" did not fire`).toBeTruthy();
        // Word order is SLOT order, and only the three permitted axis pairs.
        expect(SLOT[da.axis], label).toBeLessThan(SLOT[db.axis]);
        expect(
          [`tone-structure`, `tone-family`, `temperature-family`],
          label,
        ).toContain(`${da.axis}-${db.axis}`);
        // A compound outranks its parts: when one is emitted it comes before
        // either single word in the row.
        for (const part of [a, b]) {
          const iPart = labels.indexOf(part);
          if (iPart >= 0) expect(iPart, `${seed}: ${label} after ${part}`).toBeGreaterThan(labels.indexOf(label));
        }
      }
    }
    // Measured over the fixture (2026-08-18, after the third visual-QA round):
    // 30 distinct compound labels on 169 of the 867 rows, down from 34/178
    // because two compounds may no longer share a head word ("dark monochrome |
    // muted monochrome" was two chips, one noun) and because the tone rows moved
    // underneath (earthy loses the palettes holding a vivid stop, pastel and
    // muted the one that reads grayscale on the dense sample). The frontier is
    // bounded by construction (spoken words squared, filtered to co-firing
    // non-contradictory pairs), which is what keeps the crawl surface finite.
    expect(distinct.size).toBe(30);
    expect(rowsWithCompound).toBe(169);
    expect([...distinct.keys()]).toContain("pastel rainbow");
  });

  it("slugs every possible label exactly as querySlug does", () => {
    // The island links the chips with relatedSearchSlug (it cannot import
    // semantic-search — Env-typed search client vs the islands typecheck), so
    // the two rules must agree over the ENTIRE bounded label vocabulary:
    // corpus color names ∪ registry spoken words ∪ family anchors ∪ the
    // compound grammar. This also proves no label decodes as a seed
    // (querySlug's other branch).
    const spoken = [...SPOKEN_WORDS];
    const labels = new Set([
      ...NAMED_COLORS.map((c) => c.name),
      ...spoken,
      ...Array.from({ length: 360 }, (_, h) => familyWord(h)),
      ...spoken.flatMap((a) => spoken.map((b) => `${a} ${b}`)),
    ]);
    expect(labels.size).toBeGreaterThan(900);
    for (const label of labels) {
      expect(relatedSearchSlug(label), label).toBe(querySlug(label));
    }
  });
});

/**
 * The corpus, classified once: an entry speaks for a family when its own chroma
 * clears the floor, or when it is a light tint sitting near the sRGB ceiling
 * (the same dual reading a stop gets, D19). "lavender" is the case that made
 * this matter: C 0.0269 at 78% of what its lightness allows, filed neutral, and
 * it won on plain gray-blue stops.
 */
const CORPUS = NAMED_COLORS.map((color) => {
  const eC = Math.hypot(color.lab[1], color.lab[2]);
  const eH = ((Math.atan2(color.lab[2], color.lab[1]) * 180) / Math.PI + 360) % 360;
  const chromatic =
    eC >= T.CHROMA_FLOOR ||
    (eC >= 0.01 &&
      color.lab[0] >= 0.5 &&
      relativeSaturation({ L: color.lab[0], C: eC, h: eH }) >= T.SATURATION_FLOOR);
  return {
    name: color.name,
    lab: color.lab,
    hue: eH,
    class: chromatic ? colorFamily(eH) : "neutral",
  };
});

/**
 * Words the corpus answers a QUERY with but never LABELS a stop with — the
 * naming side's LOOKUP_ONLY set, restated here like every other gate.
 */
// LOOKUP_ONLY plus MISNAMED_LABEL in color-utils: names the corpus resolves for
// a query but may never put on a stop. The three brown/purple compounds are the
// round-4 QA closure (all three sit in the RED band, so neither word in the name
// describes them); palette-name.test.js re-derives that criterion.
const NEVER_LABELS = new Set([
  "azure",
  "purple brown",
  "purplish brown",
  "brownish purple",
]);

/**
 * The palette's own tone veto, restated: a name whose loudness word the
 * palette's measurement contradicts is not available to any surface. Mirrors
 * toneNameVeto in palette-name.ts.
 */
const toneVeto = (tags) => {
  const words = [];
  if (tags.includes("vivid") || tags.includes("neon"))
    words.push("pastel", "pale", "faded", "dusty", "muted", "washed");
  if (tags.includes("pastel") || tags.includes("muted"))
    words.push("neon", "bright", "electric", "vivid", "fluorescent");
  const loud = new Set(["pastel", "pale", "neon", "bright", "electric", "vivid", "fluorescent"]);
  const kept = [...new Set(words)].filter((w) => loud.has(w)).sort();
  if (!kept.length) return null;
  // Same separator class the namer's value-word gate uses: the corpus has no
  // hyphenated entry today, and a whole-word test should not depend on that.
  const re = new RegExp(`(^|[ -])(${kept.join("|")})([ -]|$)`, "i");
  const fn = (name) => re.test(name);
  fn.key = kept.join("+");
  return fn;
};

// Memoised: the fixture walks 867 palettes and this is a full corpus scan per
// stop. The key carries the veto's identity, since a vetoed lookup is a
// different question about the same hex.
const nameCache = new Map();
const nameOf = (hex, veto = null) => {
  const key = `${veto ? veto.key : ""}|${hex}`;
  const hit = nameCache.get(key);
  if (hit !== undefined) return hit;
  const answer = nameOfUncached(hex, veto);
  nameCache.set(key, answer);
  return answer;
};

const nameOfUncached = (hex, veto = null) => {
  // The corpus answer for a single stop, the same rule the chip ranking uses to
  // find which stop a name names. Recomputed here rather than imported, like
  // every other gate in this file: nearest in OkLab, then the CATEGORY guard —
  // a name that cannot speak for the stop (wrong family, or a value word the
  // stop's own lightness contradicts) yields to one that can, but only within
  // two JND and only when the swap agrees better with the stop's hue.
  const { L, C, h } = hexToOkLch(hex);
  const rad = (h * Math.PI) / 180;
  const lab = [L, C * Math.cos(rad), C * Math.sin(rad)];
  const coloured =
    C >= T.CHROMA_FLOOR ||
    (L >= 0.5 && relativeSaturation({ L, C, h }) >= T.SATURATION_FLOOR);
  const family = coloured ? colorFamily(h) : "neutral";
  const sep = (a, b) => {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  };
  const wordFits = (name) =>
    !(/(^|[ -])(dark|darkish)([ -]|$)/.test(name) && L > 0.6) &&
    !(/(^|[ -])(light|lightish|pale)([ -]|$)/.test(name) && L < 0.6);
  let best = null;
  let min = Infinity;
  let candidate = null;
  let candidateMin = Infinity;
  for (const color of CORPUS) {
    if (NEVER_LABELS.has(color.name) || veto?.(color.name)) continue;
    const d = Math.hypot(
      lab[0] - color.lab[0],
      lab[1] - color.lab[1],
      lab[2] - color.lab[2],
    );
    if (d === 0) return color.name;
    if (d < min) {
      min = d;
      best = color;
    }
    if (d < candidateMin && color.class === family && wordFits(color.name)) {
      candidateMin = d;
      candidate = color;
    }
  }
  if (best.class === family && wordFits(best.name)) return best.name;
  if (!candidate || candidateMin > min + 0.04) return best.name;
  const hueError = (c) => (c.class === "neutral" ? 360 : sep(h, c.hue));
  if (
    coloured &&
    best.class !== "neutral" &&
    hueError(candidate) >= hueError(best) &&
    wordFits(best.name)
  )
    return best.name;
  return candidate.name;
};

describe("describePalette (the canonical triple)", () => {
  it("returns a non-empty, consistent triple for every fixture seed", () => {
    for (const seed of PROSE_SEEDS.filter((_, i) => i % 9 === 0)) {
      const { view, features, named, prose } = caseFor(seed);
      const d = describePalette(view.appliedCoeffs, view.hexColors, VIEW, { features, named });
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.description.length).toBeGreaterThan(0);
      expect(d.tags.length).toBeGreaterThan(0);
      expect(d.title).toBe(named.name);
      expect(d.description).toBe(prose.paragraph);
      expect(d.tags).toEqual(relatedSearches(features, named, modifierTags(features)));
    }
  });

  it("names, describes and tags from exactly one analysis pass", () => {
    const { view, named } = caseFor(PROSE_SEEDS[0]);
    analysisCalls.n = 0;
    const d = describePalette(view.appliedCoeffs, view.hexColors, VIEW);
    // One dense sample fed the name, the prose AND the related labels.
    expect(analysisCalls.n).toBe(1);
    expect(d.title).toBe(named.name);
  });
});

// =============================================================================
// (h) The third visual-QA round
// =============================================================================
//
// One assertion per finding, keyed to the seed a grader looked at beside its
// rendered PNG. These are the regression floor: each one failed before the fix
// on the page surface named in the test, so a threshold that drifts back
// reproduces the exact sentence a reader objected to.

describe("visual QA round 3", () => {
  const proseFor = (seed) => caseFor(seed).prose;
  // The row is rebuilt on every call, and these assertions walk the fixture
  // several times over; one row per seed is enough (relatedSearches is pure,
  // and the determinism suite above is what proves it).
  const chipCache = new Map();
  const chipsFor = (seed) => {
    let row = chipCache.get(seed);
    if (!row) {
      const { features, named } = caseFor(seed);
      row = relatedSearches(features, named, modifierTags(features));
      chipCache.set(seed, row);
    }
    return row;
  };

  it("never claims both ends are darker when one of them is not", () => {
    // Peak at t 0.596, right end 0.038 below it against 0.189 at the left: a
    // 5:1 asymmetry the phrase "both ends" denied.
    const seed = "_gBggNWgK-f-cf9PgDsf4Uf2ef55f-Bf_agBD";
    expect(proseFor(seed).paragraph).not.toContain("darker at both ends");
    // ...and the twin, over the whole fixture: whenever either sentence speaks,
    // BOTH dense ends sit a quarter of the palette's own range from the extreme.
    for (const seed2 of PROSE_SEEDS) {
      const { features: f, prose } = caseFor(seed2);
      const weakerDrop =
        f.denseMaxLightness - Math.max(f.denseFirstLightness, f.denseLastLightness);
      const weakerRise =
        Math.min(f.denseFirstLightness, f.denseLastLightness) - f.denseMinLightness;
      if (prose.paragraph.includes("brightest in the middle"))
        expect(weakerDrop, seed2).toBeGreaterThanOrEqual(0.25 * f.denseLightnessRange);
      if (prose.paragraph.includes("darkest in the middle"))
        expect(weakerRise, seed2).toBeGreaterThanOrEqual(0.25 * f.denseLightnessRange);
    }
  });

  it("never lets a name's tone word contradict the palette's own tone", () => {
    // "pastel red" (#e96157, chroma 0.171 at 76% of its ceiling) named a stop on
    // a vivid sunset whose next sentence called it strong and clear, and drove
    // the title, the meta description and the top chip.
    const seed = "_exmgG6gEthedgFygB6gBmgFRgO2gPDgA0gCs";
    const { prose, named } = caseFor(seed);
    for (const text of [prose.paragraph, prose.metaDescription, named.name])
      expect(text).not.toMatch(/\bpastel\b/);
    for (const label of chipsFor(seed)) expect(label).not.toMatch(/\bpastel\b/);
    // Fixture-wide: no reader-facing surface pairs a pale word with a vivid or
    // neon palette, or a loud word with a pastel or muted one.
    for (const s of PROSE_SEEDS) {
      const { features, prose: p, named: n } = caseFor(s);
      const tags = modifierTags(features);
      const surfaces = [p.paragraph, p.metaDescription, n.name, ...chipsFor(s)];
      const said = ` ${surfaces.join(" ").toLowerCase()} `;
      if (tags.includes("vivid") || tags.includes("neon"))
        for (const w of ["pastel", "pale"]) expect(said, `${s}/${w}`).not.toContain(` ${w} `);
      if (tags.includes("pastel") || tags.includes("muted"))
        for (const w of ["neon", "electric", "fluorescent"])
          expect(said, `${s}/${w}`).not.toContain(` ${w} `);
    }
  });

  it("never labels a near-white with a word that promises a vivid color", () => {
    // "azure" is CSS #f0ffff here, so the word landed only on near-whites while
    // every reader and translator has the survey's #069af3 in mind.
    const seed = "_gL2gMigPXgDEgEQgAUfvofO6gnhgJ9gJVgHWk80T6_s3";
    const { named, prose } = caseFor(seed);
    expect(named.name).not.toContain("azure");
    expect(prose.paragraph).not.toContain("azure");
    expect(prose.paragraph).toContain("light cyan");
    // The word still ANSWERS as a query: the popular search "teal, azure, navy"
    // and palette-tags' own vocabulary both resolve it to #f0ffff.
    expect(isColorName("azure")).toBe(true);
    for (const s of PROSE_SEEDS) expect(caseFor(s).named.name).not.toContain("azure");
  });

  it("names a palette after its colors, not after the edge of its value scale", () => {
    // The middle of this ramp is a bright orange and a deep red, the two most
    // chromatic stops; the name spent its one interior slot on a black.
    const seed = "_gGZgE0gDMgJQgHHgFVgMigNCgLzgOHgQGgwelS4buhgA";
    const { named } = caseFor(seed);
    expect(named.colorNames).not.toContain("midnight");
    expect(named.colorNames).toContain("deep red");
    // The ends are still named whatever they are: the demotion is only a
    // preference among the interior candidates.
    expect(named.colorNames[0]).toBe("ivory");
  });

  it("promises a steady brightness only where the brightness is steady", () => {
    // low-key allows 0.3 of lightness range; this palette measures 0.195 and
    // shows three near-black stops between two lighter ends.
    const seed = "_gDcgDwgF8gB4gB4gC0gJYgJYgH0gBkgCWgDI";
    const p = proseFor(seed).paragraph;
    expect(p).toContain("The colors stay dark from end to end.");
    for (const s of PROSE_SEEDS) {
      const { features, prose } = caseFor(s);
      if (prose.paragraph.includes("brightness barely changes"))
        expect(features.lightnessRange, s).toBeLessThan(T.LOW_CONTRAST_RANGE);
    }
  });

  it("claims a gray leans warm only when its colors agree", () => {
    // Stop hues 303, 329, 24, 75, 97, 124, 177 average to 50.8° by cancellation:
    // the ends are a cool lavender-white and a cool sage.
    const seed = "_gLEgGFgaXgELgLAgRugEogBggBkgAWgBkgFb";
    expect(proseFor(seed).paragraph).not.toContain("warm grays");
    for (const s of PROSE_SEEDS) {
      const { features, prose } = caseFor(s);
      if (/The colors are (warm|cool) grays\./.test(prose.paragraph))
        expect(features.hueConcentration, s).toBeGreaterThanOrEqual(0.6);
    }
  });

  it("narrates a move between colors only across real hue travel", () => {
    // One purple ramp, 30.5° end to end, narrated as "from pink into violet".
    const seed = "_gDXgDJgEFgKggKsgJSgEYgFbgDsgguhBdgAAj9n0wFfn";
    expect(proseFor(seed).paragraph).not.toMatch(/It moves from \w+ into \w+\./);
    for (const s of PROSE_SEEDS) {
      const { features: f, prose } = caseFor(s);
      if (/It moves from \w+ into \w+\./.test(prose.paragraph))
        expect(separation(f.firstHue, f.lastHue), s).toBeGreaterThanOrEqual(45);
    }
  });

  it("says a palette is built on opposites once, not twice", () => {
    const seed = "_gIxgHXgGCgGzgGogBcgIKgHFgTsgH2gI2gFn";
    const p = proseFor(seed).paragraph;
    expect(p).toContain("built on two opposite colors");
    expect(p).not.toContain("sit on opposite sides");
    for (const s of PROSE_SEEDS) {
      const { paragraph } = caseFor(s).prose;
      expect(
        paragraph.includes("built on two opposite colors") &&
          paragraph.includes("sit on opposite sides"),
        s,
      ).toBe(false);
    }
  });

  it("never calls a palette earthy while it holds a vivid stop", () => {
    // A deep indigo against a lemon yellow at 93.5% of its achievable chroma,
    // with the mean dragged under the earthy ceiling by a neutral middle.
    const seed = "_gIxgHXgGCgGzgGogBcgIKgHFgTsgH2gI2gFn";
    const { named, prose } = caseFor(seed);
    expect(named.name).not.toContain("Earthy");
    expect(prose.paragraph).not.toContain("earthy");
    for (const s of PROSE_SEEDS) {
      const { features } = caseFor(s);
      if (modifierTags(features).includes("earthy"))
        expect(features.maxChroma, s).toBeLessThan(T.VIVID_CHROMA);
    }
  });

  it("offers the palette's own colors as chips, not only the title's", () => {
    // The left half of this palette is mint, cyan and cobalt; the row was
    // "red | sun yellow | yellow", the third chip generalizing the second.
    const seed = "_gJOgHUgHfgIRgIHgIYgLmgKlgMXf-BgKwgIVcr5WxzjG";
    const labels = chipsFor(seed);
    expect(labels.some((l) => /blue|cyan|sky/.test(l))).toBe(true);
    // No COLOR label that merely generalizes another in the same row. The
    // modifier words are exempt on purpose: "pastel" beside "pastel purple" is a
    // tone hub beside a colour query, two pages with their own demand, while
    // "yellow" beside "sun yellow" is one idea at two grains.
    for (const s of PROSE_SEEDS) {
      const row = chipsFor(s).filter((l) => !SPOKEN_WORDS.has(l) && !isCompound(l));
      for (let i = 0; i < row.length; i++) {
        if (row[i].includes(" ")) continue;
        for (let j = 0; j < row.length; j++)
          if (i !== j)
            expect(
              ` ${row[j].toLowerCase()} `.includes(` ${row[i].toLowerCase()} `),
              `${s}: "${row[i]}" generalizes "${row[j]}"`,
            ).toBe(false);
      }
    }
  });

  it("bands the plateau sentence by share, and never twins a compound head", () => {
    // 68.8% pure black read exactly like a palette that is 10% pure black.
    const seed = "_gCZgC4gCsgCfgEggDUgIngMJgKogEYgEYgEYdbn-tEgA";
    expect(proseFor(seed).paragraph).toContain("Most of it is solid black.");
    for (const s of PROSE_SEEDS) {
      const { features, prose } = caseFor(s);
      if (prose.paragraph.includes("Most of it is solid black."))
        expect(features.allBlackShare, s).toBeGreaterThanOrEqual(0.4);
      if (prose.paragraph.includes("Part of it is solid black."))
        expect(features.allBlackShare, s).toBeLessThan(0.4);
      // Two compounds may not share a head word: "dark monochrome | muted
      // monochrome" is two chips and one noun.
      const heads = chipsFor(s)
        .filter(isCompound)
        .map((l) => l.split(" ")[1]);
      expect(new Set(heads).size, s).toBe(heads.length);
    }
  });

  it("keeps a universal claim off a palette that passes through black", () => {
    // Two stops render flat black; "the colors are dark and strong" was a claim
    // about every one of them.
    const seed = "_gAAgCngTtgAAgIYgUfgBhgBngBogAAgLFgJtdxwzvof4";
    const p = proseFor(seed).paragraph;
    expect(p).not.toContain("dark and strong");
    expect(p).toContain("The colors are mostly dark.");
    for (const s of PROSE_SEEDS) {
      const { parts, view } = caseFor(s);
      if (!parts.sentences.includes("The colors are dark and strong.")) continue;
      const darkest = Math.min(...view.hexColors.map((h) => hexToOkLch(h).L));
      expect(darkest, s).toBeGreaterThan(0.18);
    }
  });

  it("writes both verbs, one list and no stranded preposition", () => {
    // D20.4 repairs: verb ellipsis across a comma, three coordinating "and"s in
    // one clause, and a zero-relativizer clause ending in a preposition.
    for (const s of PROSE_SEEDS) {
      const { prose } = caseFor(s);
      expect(prose.paragraph).not.toContain("light text on its dark end");
      expect(prose.paragraph).not.toContain("passed through");
      const identity = prose.identity;
      expect(
        identity.split(" and ").length - 1,
        `${s}: ${identity}`,
      ).toBeLessThanOrEqual(2);
    }
  });
});

// =============================================================================
// Visual QA round 4 — three graders reading rendered palettes beside the text
// =============================================================================
//
// Every case below is a seed whose paragraph or chip row a grader contradicted
// from the image. The assertions are the RULES the fixes installed, checked
// over the whole fixture wherever the rule is a general one, so a loosened gate
// fails here rather than on the next screenshot.

describe("visual QA round 4", () => {
  const proseFor = (seed) => caseFor(seed).prose;

  it("calls a palette pale only when every stop is", () => {
    // #fda373 (a saturated coral at 97% of its achievable chroma) into a cream
    // into a solid steel blue measured mean chroma 0.085 and was told "The
    // colors are pale": the pastel tag is a MEAN test and a near-white middle
    // drags the mean under it. The sibling row `pale-soft` had carried a
    // per-stop guard since it was written; this one had none, and its ceiling
    // sat at the neon line, 2.7x the pastel bound.
    const seed = "_gEngEngEngFigFRgFMgJjgJMgJUhNtgckg6xki1CtZut";
    expect(proseFor(seed).paragraph).not.toContain("The colors are pale");
    for (const s of PROSE_SEEDS) {
      const { parts, features } = caseFor(s);
      const soft = parts.sentences.some(
        (x) => x.includes("The colors are pale") || x.includes("pale and soft"),
      );
      if (!soft) continue;
      expect(features.maxChroma, s).toBeLessThan(T.PASTEL_CHROMA);
    }
  });

  it("calls a palette light only where the registry calls it light", () => {
    // Three fire reds at L 0.64 into a mint at L 0.89: mean 0.738, which
    // cleared isBrilliant's private 0.7 bar while the registry's own `light`
    // descriptor did not fire at all. A word in the description has to mean
    // what the registry means by it.
    const seed = "_gHvgH0gH5gHCgHFgG6gK9gMggJaguCgHRhUshsxDp0gA";
    expect(proseFor(seed).paragraph).not.toContain("light and strong");
    for (const s of PROSE_SEEDS) {
      const { parts, features, view } = caseFor(s);
      if (!parts.sentences.some((x) => x.includes("light and strong"))) continue;
      expect(features.meanLightness, s).toBeGreaterThanOrEqual(T.LIGHT_LIGHTNESS);
      expect(Math.min(...view.hexColors.map((h) => hexToOkLch(h).L)), s).toBeGreaterThanOrEqual(0.65);
    }
  });

  it("never promises soft from end to end over a stop that is not", () => {
    // The right third of this band is a hot candy pink: last stop C 0.202, at
    // 100% of what sRGB allows at its lightness, on a palette carrying a
    // `saturating` tag of its own.
    const seed = "_gKEfsKgM8gFogjCgBQgBkgBmgKngORgAMgOQ";
    expect(proseFor(seed).paragraph).not.toContain("pale and soft");
  });

  it("never gives a hue word to a stop that is white", () => {
    // firstChromatic measured C 0.0039 at L 0.9992 and cleared the family gate
    // through its saturation disjunct, because at L → 1 the gamut ceiling
    // collapses and any residue reads as 100%. The paragraph named the stop
    // white and then called it yellow, one clause apart.
    const seed = "_gMmgLvgL-gGNgGGgF6gBngCegClhCZhCPhCplRzSvvgK";
    const p = proseFor(seed).paragraph;
    expect(p).toContain("white (#ffffff)");
    expect(p).not.toContain("from yellow into");
    // The rule, over the whole fixture: no family word rests on an invisible
    // amount of colour.
    for (const s of PROSE_SEEDS) {
      const { features } = caseFor(s);
      for (const stop of [features.chromaPeak, features.firstChromatic, features.lastChromatic]) {
        if (!stop) continue;
        if (familyOf(stop) === null) continue;
        expect(stop.C, `${s} ${JSON.stringify(stop)}`).toBeGreaterThanOrEqual(
          Math.min(T.FAMILY_CHROMA, T.FAMILY_MIN_CHROMA),
        );
      }
    }
  });

  it("gives one name and one hex to two ends that are one color", () => {
    // #000044 and #00003f measure 0.0104 apart in OkLab and render
    // indistinguishable; the corpus still had separate entries for them, so the
    // sentence printed two names and two hex codes for one colour and the next
    // sentence said the two ends match.
    const seed = "_gAAgAAgFvfwsfySf-FgQjfZjhSOgC3gD0fuygAvopVgA";
    const p = proseFor(seed).paragraph;
    expect(p).toContain("and back to night blue");
    expect(p).not.toContain("#00003f");
    // #ffc25a to #ffbf58: 0.005 in lightness, one degree of hue.
    const seam = proseFor("_gPogJMgEagAAgCugD3gHegOTgPigAAgAZgMc").paragraph;
    expect(seam).toContain("and back to orangey yellow");
    expect(seam).not.toContain("butterscotch");
    // The rule: whenever the two rendered ends are within one JND, the identity
    // sentence spends ONE name and ONE hex on them.
    for (const s of PROSE_SEEDS) {
      const { view, prose } = caseFor(s);
      const ends = view.hexColors;
      const d = labDistance(ends[0], ends[ends.length - 1]);
      if (d >= 0.02 || ends[0] === ends[ends.length - 1]) continue;
      expect(prose.paragraph, `${s} (ends ${d.toFixed(4)} apart)`).not.toContain(
        ends[ends.length - 1],
      );
    }
  });

  it("calls a dull mid orange brown, not orange", () => {
    // #ac7b61 measures L 0.626, C 0.072, 43% of the chroma sRGB allows at that
    // lightness; the corpus calls it pinkish brown and the paragraph called it
    // orange, because the brown rung was written for DARK oranges only and an
    // absolute chroma window cannot mean the same thing at two lightnesses.
    const seed = "_gJzgHagHPgA3gBVgB9gK2gFcgLxgOVgL_gFr";
    const p = proseFor(seed).paragraph;
    expect(p).toContain("a single brown");
    expect(p).not.toContain("a single orange");
  });

  it("attributes the ink sentence to the ends it talks about", () => {
    // The palette's ends are a medium iris purple (black text 3.46:1, failing
    // AA) and a near-black; its only light stop is in the middle. The gate read
    // the extremes over ALL stops while the sentence names the ends.
    const seed = "_gEngEngEngFRgFMgFigJMgJUgJjgckg6xhNt";
    expect(proseFor(seed).paragraph).not.toContain("Dark text works on its light end");
    const DARK_INK = 4.5 * 0.05 - 0.05;
    const LIGHT_INK = 1.05 / 4.5 - 0.05;
    for (const s of PROSE_SEEDS) {
      const { parts, view } = caseFor(s);
      if (!parts.sentences.some((x) => x.includes("Dark text works"))) continue;
      const ends = [view.hexColors[0], view.hexColors[view.hexColors.length - 1]].map(
        relativeLuminance,
      );
      expect(Math.max(...ends), s).toBeGreaterThanOrEqual(DARK_INK);
      expect(Math.min(...ends), s).toBeLessThanOrEqual(LIGHT_INK);
    }
  });

  it("claims a repeat only where a color actually comes back", () => {
    // The hue ANGLE turning back is not the colours returning: this sweep ends
    // at h 283 with C 0.247 where an earlier stop sat at h 284 with C 0.082, an
    // electric violet where there had been a pale periwinkle.
    expect(
      proseFor("_gK_gECgOEgFGgIzgBygLpgFngSwgHQgM-gFzdKtzzsgA").paragraph,
    ).not.toContain("repeats colors");
    // ...and a plateau is not a repeat either: 46% pure white, and a wide red
    // middle, both of which hold two far-apart samples at almost zero distance.
    expect(
      proseFor("_gJDgH1gIagIjgL4gJtgDZgFrgDFgAAgguhBdkT_Q91bs").paragraph,
    ).not.toContain("repeats colors");
    expect(
      proseFor("_gH3gH0gHxgFcgFigFNgKugKxgKsgqPgyNgiNev2hr5gA").paragraph,
    ).not.toContain("repeats colors");
    // The symmetric arch, which does repeat, keeps it.
    expect(
      proseFor("_gAAgAAgFvfwsfySf-FgQjfZjhSOgC3gD0fuygAvopVgA").parts ??
        proseFor("_gAAgAAgFvfwsfySf-FgQjfZjhSOgC3gD0fuygAvopVgA").paragraph,
    ).toBeTruthy();
    for (const s of PROSE_SEEDS) {
      const { parts, features } = caseFor(s);
      if (!parts.sentences.some((x) => x.includes("repeats colors"))) continue;
      expect(features.colorReturn, s).toBeLessThan(0.02);
    }
  });

  it("never calls a stop below the muted line deep and intense", () => {
    // A grayed denim teal (C 0.072) and a dull cocoa (C 0.052, under
    // MUTED_CHROMA) rode a mean carried by four saturated reds.
    const seed = "_gH3gH0gHxgFcgFigFNgKugKxgKsgqPgyNgiNev2hr5gA";
    expect(proseFor(seed).paragraph).not.toContain("deep and intense");
    for (const s of PROSE_SEEDS) {
      const { parts, view } = caseFor(s);
      if (!parts.sentences.some((x) => x.includes("deep and intense"))) continue;
      expect(Math.min(...view.hexColors.map((h) => hexToOkLch(h).C)), s).toBeGreaterThanOrEqual(
        T.MUTED_CHROMA,
      );
    }
  });

  it("never puts a purple word on a red-brown", () => {
    // "purple brown" (#673a3f), "purplish brown" (#6b4247) and "brownish
    // purple" (#76424e) all measure inside the RED band, so neither word in the
    // name describes them, and the nearest of the three reached #6d3a33 — a
    // brick brown at the red anchor exactly — on the title, the meta
    // description, the paragraph and the top chip at once.
    const seed = "_gJ0gHlgDgf7Cf7YgHyf5kf7zgCwgUuf2wfwVfKtTzWgY";
    const { prose, named } = caseFor(seed);
    expect(prose.paragraph).toContain("reddish brown (#6d3a33)");
    for (const text of [prose.paragraph, prose.metaDescription, named.name])
      expect(text.toLowerCase(), seed).not.toContain("purple brown");
    for (const s of PROSE_SEEDS)
      for (const label of relatedSearches(caseFor(s).features, caseFor(s).named, modifierTags(caseFor(s).features)))
        expect(/purpl\w* brown|brownish purple/.test(label.toLowerCase()), `${s}: ${label}`).toBe(false);
  });

  it("says Most only of a majority, and leads the chips the same way", () => {
    // 45.8% pure white is a minority (3 of 7 swatches) and was called "Most of
    // it", and the same constant put "white" at the head of the chip row on a
    // palette the page describes as pairing duck egg blue with rose.
    const seed = "_gJDgH1gIagIjgL4gJtgDZgFrgDFgAAgguhBdkT_Q91bs";
    const { prose, features, named } = caseFor(seed);
    expect(prose.paragraph).toContain("Part of it is solid white");
    expect(relatedSearches(features, named, modifierTags(features))[0]).not.toBe("white");
    for (const s of PROSE_SEEDS) {
      const { parts, features: f } = caseFor(s);
      for (const [phrase, share] of [
        ["Most of it is solid white", f.allWhiteShare],
        ["Most of it is solid black", f.allBlackShare],
      ])
        if (parts.sentences.includes(`${phrase}.`)) expect(share, s).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("spends a sentence on what the colors are like when it can", () => {
    // Four graders in one round reported the same shape: both sentences spent
    // on ramp geometry while a true tone impression went unsaid, because rarity
    // measures how often a fact is TRUE and not how much of the image it
    // describes. The reserve is for character, so the two temperature floors
    // are excluded from it.
    const TONE = new Set(
      IMPRESSIONS.filter((i) => i.slot === "tone").map((i) => i.id),
    );
    // The three temperature rows are the floor of the tone slot, not a
    // character: `warm-and-cool` measures 2.13 bits, less than either of the
    // other two, and reserving a slot for it cost a rainbow "It travels the
    // whole color wheel".
    const FLOOR = new Set(["warm", "cool", "warm-and-cool"]);
    let missed = 0;
    for (const s of PROSE_SEEDS) {
      const { parts, view, features, named } = caseFor(s);
      if (parts.impressions.some((id) => TONE.has(id))) continue;
      // A solid color has no tone slot at all: the identity sentence states the
      // degenerate case and only the use slot survives (see chooseImpressions).
      if (parts.solid) continue;
      const fires = impressionFires(view.appliedCoeffs, view.hexColors, { features, named });
      const candidates = IMPRESSIONS.filter(
        (i) => i.slot === "tone" && !FLOOR.has(i.id) && fires[i.id],
      );
      // A non-floor tone row that fired and was not spoken can only be an echo
      // of the name (the echo demotion) or a row the identity restated.
      for (const i of candidates) {
        const echoed = (i.echoes ?? []).some((w) =>
          ` ${named.modifierPhrase.toLowerCase()} `.includes(` ${w} `),
        );
        if (!echoed) missed++;
      }
    }
    // Measured after the reserve: 0. Before it, 141 palettes had a true tone
    // impression that never reached the page.
    expect(missed).toBe(0);
  });
});

describe("visual QA round 5", () => {
  const proseFor = (seed) => caseFor(seed).prose;

  it("names the neutral a duotone crosses instead of assuming gray", () => {
    // A gunmetal → cinnamon duotone whose middle stops render #000007 and
    // #000020 was told its two colors "fade through gray between them". The
    // image is black through the middle, and no reader calls black a gray.
    const seed = "_gHlgHygGqgFtgFxgD5gMIgJJgGqhg5hhXhgkc5xtuNgA";
    expect(proseFor(seed).paragraph).toContain("fade through black between them");
    // The property, over the fixture: the word matches the measured lightness
    // of the least chromatic sample at the bands CROSSING_WHITE_L records.
    for (const seed2 of PROSE_SEEDS) {
      const { parts, features } = caseFor(seed2);
      const s = parts.sentences.find((x) => x.includes("fade through") || x.includes("fades to"));
      if (!s) continue;
      if (s.includes(" black")) expect(features.chromaValleyL, seed2).toBeLessThan(0.18);
      else if (s.includes(" white")) expect(features.chromaValleyL, seed2).toBeGreaterThan(0.93);
      else {
        expect(features.chromaValleyL, seed2).toBeGreaterThanOrEqual(0.18);
        expect(features.chromaValleyL, seed2).toBeLessThanOrEqual(0.93);
      }
    }
  });

  it("never spends both sentences saying the middle is dark", () => {
    // Naming the neutral turned the duotone row into a shape claim, and the
    // shape row then restated it: "Its two colors fade through black between
    // them. It is darkest in the middle and lighter at both ends."
    for (const seed of PROSE_SEEDS) {
      const { parts } = caseFor(seed);
      const crossesBlack = parts.sentences.some((s) =>
        s.includes("fade through black between them"),
      );
      const crossesWhite = parts.sentences.some((s) =>
        s.includes("fade through white between them"),
      );
      if (crossesBlack) expect(parts.impressions, seed).not.toContain("dark-middle");
      if (crossesWhite) expect(parts.impressions, seed).not.toContain("bright-middle");
    }
  });
});

/** OkLab distance between two hexes, for the end-identity assertions above. */
const labDistance = (a, b) => {
  const x = hexToOkLch(a);
  const y = hexToOkLch(b);
  const p = [x.L, x.C * Math.cos((x.h * Math.PI) / 180), x.C * Math.sin((x.h * Math.PI) / 180)];
  const q = [y.L, y.C * Math.cos((y.h * Math.PI) / 180), y.C * Math.sin((y.h * Math.PI) / 180)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

/** The tone-gated family word, as the round-3 GATES table recomputes it. */
const familyOf = (stop) => gatedFamily(stop);
