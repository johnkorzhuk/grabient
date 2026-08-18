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
import { describePaletteName } from "../src/palette-name.ts";
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
  colorFamily,
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
        // the whole fixture 2026-08-18: 0 such events in 2,601 re-renders (56
        // appearances, 30 of them vanishings, 11 series swaps).
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
const isBrilliant = (f) => f.meanChroma >= T.VIVID_CHROMA && f.meanLightness >= 0.7;
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
  if (band === "orange" && stop.L < 0.55 && stop.C >= 0.04 && stop.C <= 0.13) return "brown";
  if (band === "magenta" && stop.L < 0.55 && stop.C >= 0.12) return "purple";
  if (band === "red" && stop.L > 0.75 && stop.C >= 0.04 && stop.C < 0.15) return "pink";
  return stop.C >= T.FAMILY_CHROMA || relativeSaturation(stop) >= T.FAMILY_SATURATION
    ? band
    : null;
};
const grayLean = (f) =>
  f.denseMeanSaturation < T.GRAYSCALE_SAT && f.denseMeanChroma >= 0.008
    ? f.meanHue >= 330 || f.meanHue < 120
      ? "warm"
      : f.meanHue >= 150 && f.meanHue < 300
        ? "cool"
        : null
    : null;
const band = (h) => (h === null ? null : familyWord(h));

const GATES = {
  gray: (c) => c.structure === "grayscale" && grayLean(c.f) === null,
  "tinted-gray": (c) => c.structure === "grayscale" && grayLean(c.f) !== null,
  "pale-soft": (c) =>
    c.has("pastel") &&
    c.has("high-key") &&
    c.f.meanChroma < T.PASTEL_CHROMA &&
    c.f.maxChroma < T.NEON_CHROMA,
  pale: (c) => c.has("pastel") && !c.has("high-key"),
  "bright-strong": (c) => isBrilliant(c.f) && c.f.lightnessRange < EVEN_SPREAD,
  neon: (c) => c.has("neon"),
  rich: (c) =>
    isJewel(c.f) && c.f.lightnessRange < EVEN_SPREAD && Math.max(...c.stopL) <= 0.7,
  "dark-strong": (c) => isDeep(c.f) && c.f.lightnessRange < EVEN_SPREAD,
  "dark-even": (c) => c.has("low-key") && !isDeep(c.f),
  dark: (c) => c.has("dark") && !isDeep(c.f) && !c.has("low-key"),
  earthy: (c) => c.has("earthy"),
  muted: (c) => c.has("muted") && !c.has("earthy"),
  strong: (c) =>
    c.has("vivid") && !c.has("neon") && !isBrilliant(c.f) && !isJewel(c.f),
  light: (c) =>
    c.has("light") &&
    c.has("high-key") &&
    !c.has("pastel") &&
    !c.has("neon") &&
    !isBrilliant(c.f),
  "color-beside-gray": (c) => saturationContrast(c.f),
  "warm-and-cool": (c) => warmCoolContrast(c.f),
  warm: (c) =>
    c.has("warm") && !c.journey && hueBandShare(c.f, 330, 120) >= T.FAMILY_BAND,
  cool: (c) =>
    c.has("cool") && !c.journey && hueBandShare(c.f, 150, 300) >= T.FAMILY_BAND,
  "tints-and-shades": (c) => c.structure === "monochrome" && c.base !== null,
  tints: (c) => c.structure === "monochrome" && c.base !== null,
  shades: (c) => c.structure === "monochrome" && c.base !== null,
  tones: (c) => c.structure === "monochrome" && c.base !== null,
  "one-color": (c) => c.structure === "monochrome" && c.base !== null,
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
  "back-and-forth": (c) => c.has("hue-wandering"),
  neighbors: (c) =>
    c.structure === "analogous" &&
    band(c.f.firstHue) !== band(c.f.lastHue) &&
    gatedFamily(c.f.firstChromatic) !== null &&
    gatedFamily(c.f.lastChromatic) !== null,
  "one-family": (c) =>
    c.structure === "analogous" &&
    c.base !== null &&
    (c.f.firstHue === null ||
      c.f.lastHue === null ||
      band(c.f.firstHue) === band(c.f.lastHue)),
  groups: (c) =>
    c.structure === "multicolor" && c.f.hueClusters >= 2 && c.f.chromaticFraction >= 1,
  "several-colors": (c) =>
    c.structure === "multicolor" &&
    !(c.f.hueClusters >= 2 && c.f.chromaticFraction >= 1),
  "black-block": (c) => c.has("pure-black-plateau"),
  "white-block": (c) => c.has("pure-white-plateau"),
  "full-range": (c) =>
    c.f.lightnessRange > T.HIGH_CONTRAST_RANGE &&
    Math.min(...c.stopL) < 0.18 &&
    Math.max(...c.stopL) > 0.87,
  "bright-middle": (c) => c.has("bright-middle"),
  "dark-middle": (c) => c.has("dark-middle"),
  wavy: (c) => c.f.turns >= 2,
  "flat-brightness": (c) => c.has("iso-luminant"),
  steady: (c) => c.has("low-contrast") && !c.has("iso-luminant"),
  brightens: (c) =>
    c.has("brightening") && c.f.denseLightnessRange >= VISIBLE_MOVEMENT,
  darkens: (c) => c.has("darkening") && c.f.denseLightnessRange >= VISIBLE_MOVEMENT,
  warming: (c) => c.journey === "warming",
  cooling: (c) => c.journey === "cooling",
  "light-background": (c) =>
    c.has("high-key") &&
    c.f.meanChroma < T.PASTEL_CHROMA &&
    c.f.maxChroma < T.NEON_CHROMA &&
    Math.max(...c.lum) >= 4.5 * 0.05 - 0.05,
  "dark-background": (c) =>
    (c.has("dark") || c.has("low-key")) &&
    c.f.lightnessRange < 0.3 &&
    Math.min(...c.lum) <= 1.05 / 4.5 - 0.05,
  "text-both-ends": (c) =>
    Math.max(...c.lum) >= 4.5 * 0.05 - 0.05 &&
    Math.min(...c.lum) <= 1.05 / 4.5 - 0.05 &&
    c.f.lightnessRange > 0.3,
  loops: (c) => c.has("seamless") && !c.has("solid"),
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
    lum: view.hexColors.map(relativeLuminance),
    // The journey value the page uses comes from the stored palette-tags
    // vocabulary; the embed Tags line carries it, which is where this reads it.
    journey: /(?:^| )Tags:[^.]*\bwarming\b/.test(prose.embedText)
      ? "warming"
      : /(?:^| )Tags:[^.]*\bcooling\b/.test(prose.embedText)
        ? "cooling"
        : null,
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
  "every", "everything", "export", "fades", "forth", "forward", "from",
  "full", "gradient", "gray", "grays", "grayscale", "green", "groups", "held",
  "here",
  "hex", "holds", "how", "in", "inside", "instead", "intense", "into", "is",
  "it", "its", "jumps", "light", "lightened", "lighter", "like", "linear",
  "little", "look", "loops", "magenta", "many", "match", "middle",
  "meet", "monochrome", "more", "mostly", "move", "moves", "muted", "nearly",
  "neon",
  "next", "no", "ocean", "of", "on", "once", "one", "only", "opposite", "or",
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
      const { prose, named } = caseFor(seed);
      for (const text of readerText(prose)) {
        let t = text.toLowerCase().replace(/#[0-9a-f]{6}/g, " ");
        // Whole-word removal: substring removal turned "earthy" into "y" when
        // the palette was also named "earth".
        for (const name of [...named.colorNames].sort((a, b) => b.length - a.length))
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
    // Re-measured after the visual-QA round (2026-08-18): paragraph p0 212,
    // p5 260, p50 291, p95 329, max 363; body (identity + impressions) p0 107,
    // p50 186, max 258; meta max 157; embed max 463. D20 asks for 2 to 4
    // sentences and roughly 150 to 400 characters, and the ladder in
    // paletteProse never fires at these lengths.
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
    // Measured: 22 of 867, up from 6 now that a palette too washed out to name
    // a family says nothing about its family. If this ever reaches zero,
    // something is padding.
    const single = PROSE_SEEDS.filter(
      (seed) => caseFor(seed).parts.impressions.length < 2,
    );
    expect(single.length).toBeGreaterThan(0);
    expect(single.length).toBeLessThan(60);
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
    // color names, the family words — and count what remains. Measured: 581
    // distinct skeletons over the 867 seeds, down from 836 with three times
    // the text; 50 is the acceptance floor at which the corpus stops reading
    // as one fill-in-the-blanks template. Shorter text buys variety through
    // sharper selection (48 impressions over 4 slots), never through padding.
    const familyWords = [...new Set(Array.from({ length: 360 }, (_, h) => familyWord(h)))];
    const skeletons = new Set();
    for (const seed of PROSE_SEEDS) {
      const { prose, named } = caseFor(seed);
      let s = stripHex(prose.paragraph).replace(/\d+(\.\d+)?/g, "#");
      for (const name of [...named.colorNames].sort((a, b) => b.length - a.length))
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
    // Measured over this sampling: mean 0.299, max 0.545. The bound is the one
    // the long paragraphs met (mean 0.35 / max 0.80), and the short ones still
    // meet it: the shared view sentence is a larger share of a shorter text,
    // and sharper selection paid for it.
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
  it("returns deterministic, bounded, deduped labels from the bounded vocabularies", () => {
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

  it("ranks color names by the chroma of the stop they name (D18)", () => {
    for (const seed of PROSE_SEEDS) {
      const { features, named } = caseFor(seed);
      const labels = relatedSearches(features, named, modifierTags(features));
      const chromaOf = (name) => {
        const hex = named.stops.find((h) => nameOf(h) === name);
        return hex ? hexToOkLch(hex).C : 0;
      };
      // The dominant-plateau label leads the row by share, not by chroma, so
      // it is excluded from the chroma ordering it deliberately breaks.
      const dominant =
        features.allBlackShare >= 0.4 ? "black" : features.allWhiteShare >= 0.4 ? "white" : null;
      const names = labels.filter(
        (l) => named.colorNames.includes(l) && l !== dominant,
      );
      for (let i = 1; i < names.length; i++)
        expect(
          chromaOf(names[i - 1]) >= chromaOf(names[i]) - 1e-9,
          `${seed}: ${names.join(" > ")} out of chroma order`,
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
        features.allBlackShare >= 0.4 || features.allWhiteShare >= 0.4;
      if (isDominant) {
        dominant++;
        expect(labels[0], seed).toBe(features.allBlackShare >= 0.4 ? "black" : "white");
      } else {
        lastResort++;
        expect(labels.length, `${seed}: ${labels.join(", ")}`).toBeLessThanOrEqual(2);
      }
    }
    // Measured: 8 dominant rows (five at 63-69% pure black, three at 44-100%
    // pure white) and no last-resort ones — the solid-white palette that used
    // to be the only fallback row is now the dominant case instead, which is
    // the same chip for a better reason. The fallback branch stays because the
    // editor reaches states the sitemap never sampled; the grayscale row test
    // below is what proves no palette renders an empty nav. The owner's
    // counter-example, a pastel ramp that is 27.1% white, is under the floor
    // and chips its colours instead, which is the test after that.
    expect(lastResort).toBe(0);
    expect(dominant).toBe(8);
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
    // Measured over the fixture: 34 distinct compound labels on 217 of the 867
    // rows. The frontier is bounded by construction (spoken words squared,
    // filtered to co-firing non-contradictory pairs), which is what keeps the
    // crawl surface finite.
    expect(distinct.size).toBe(33);
    expect(rowsWithCompound).toBe(172);
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

const nameOf = (hex) => {
  // The corpus answer for a single stop, the same rule the chip ranking uses to
  // find which stop a name names — nearest in OkLab, with the family tie-break
  // inside half a JND: a name carries a category, and at the bottom of the
  // lightness scale two candidates a quarter of a JND apart can be a brown and
  // a black. Recomputed here rather than imported, like every other gate.
  const { L, C, h } = hexToOkLch(hex);
  const rad = (h * Math.PI) / 180;
  const lab = [L, C * Math.cos(rad), C * Math.sin(rad)];
  const coloured =
    C >= T.CHROMA_FLOOR || relativeSaturation({ L, C, h }) >= T.SATURATION_FLOOR;
  const family = coloured ? colorFamily(h) : "neutral";
  let best = NAMED_COLORS[0];
  let min = Infinity;
  let sameFamily = null;
  let sameMin = Infinity;
  for (const color of NAMED_COLORS) {
    const d = Math.hypot(
      lab[0] - color.lab[0],
      lab[1] - color.lab[1],
      lab[2] - color.lab[2],
    );
    const cC = Math.hypot(color.lab[1], color.lab[2]);
    const cFamily =
      cC >= T.CHROMA_FLOOR
        ? colorFamily((Math.atan2(color.lab[2], color.lab[1]) * 180) / Math.PI)
        : "neutral";
    if (d < min) {
      min = d;
      best = color;
    }
    if (cFamily === family && d < sameMin) {
      sameMin = d;
      sameFamily = color;
    }
  }
  return sameFamily && sameMin <= min + 0.01 ? sameFamily.name : best.name;
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
