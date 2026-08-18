// The naming system: modifiers, budgets, and the rules that keep a name
// readable. Seeds are real palettes from the live sitemap, one per structure.
import { describe, expect, it } from "vitest";
import { renderPalette } from "../src/palette.ts";
import { getUniqueColorNames } from "@repo/data-ops/color-utils";
import {
  describePaletteName,
  HEADLINE,
  META_HEADLINE,
  TITLE_HEADLINE,
  TITLE_SUFFIX,
  titleSuffix,
} from "../src/palette-name.ts";
import {
  classifyStructure,
  DESCRIPTORS,
  descriptorScore,
  paletteFeatures,
  selectModifiers,
  stopHasHue,
  stopSaturation,
  THRESHOLDS,
} from "@repo/data-ops/gradient-gen/palette-modifiers";
import { hexToOkLch, maxChromaFor } from "@repo/data-ops/color-utils";
import { PROSE_SEEDS } from "./prose-corpus.js";

const SEEDS = {
  complementary: "_gB5gIZgFtgBRgGKgG2gG9gAxgGShcdgIzg4D",
  rainbow: "_gEngEngEngFigFRgFMgJjgJMgJUhNtgckg6x",
  duotone: "_gJ0gHlgDgf7Cf7YgHyf5kf7zgCwgVgf3ifxH",
  monochrome: "_gDXgDJgEFgKggKsgJSgEYgFbgDsgguhBdgAAlBoEwFfn",
  analogous: "_gJDgH1gIagIjgL4gJtgDZgFrgDFgAAgguhBd",
  grayscale: "_gMIgLhgK1gCZgCcgChgGSgGcgGMgeUgerge1",
  multicolor: "_gQxgJrgI8f-cgENf8Gf3_f5vf1hgBDf-wgBu",
};

const describeAt = (seed, steps = 13, options = HEADLINE) => {
  const view = renderPalette(seed, "linearGradient", steps, 90);
  return describePaletteName(view.appliedCoeffs, view.hexColors, options);
};

describe("structure classification", () => {
  for (const [expected, seed] of Object.entries(SEEDS)) {
    it(`reads ${expected} the same at every step count`, () => {
      // The whole reason structure is measured on a dense sample rather than on
      // the rendered stops: sampled sparsely, the same seed classified as
      // duotone on 42% of the corpus at 3 steps and 19.5% at 24.
      const at = (steps) => classifyStructure(describeAt(seed, steps).features);
      expect(at(13)).toBe(expected);
      for (const steps of [3, 5, 7, 24]) expect(at(steps)).toBe(expected);
    });
  }
});

describe("name composition", () => {
  it("joins two isolated hues with 'and', a journey with 'to'", () => {
    expect(describeAt(SEEDS.duotone).name).toContain(" and ");
    expect(describeAt(SEEDS.monochrome).name).toContain(" to ");
  });

  it("names complementary as itself, not as duotone", () => {
    const d = describeAt(SEEDS.complementary);
    expect(d.modifierPhrase).toContain("complementary");
    expect(d.tags).toContain("complementary");
    expect(d.tags).not.toContain("duotone");
  });

  it("will not call a palette that sweeps the wheel a duotone", () => {
    // Cluster COUNT does not identify two hues; cluster WIDTH does. This seed
    // falls into two groups while spanning most of the wheel, and used to come
    // out "Duotone mocha and midnight" — two names for a palette with sea blue
    // and marine blue in the middle of it.
    const d = describeAt(SEEDS.rainbow);
    expect(classifyStructure(d.features)).toBe("rainbow");
    expect(d.features.hueSpan).toBeGreaterThan(180);
    expect(d.modifierPhrase).not.toContain("duotone");
    expect(d.colorNames.length).toBeGreaterThan(2);
  });

  it("caps a duotone at two color names", () => {
    // Five names for two hues describes the ramp, not the palette.
    expect(describeAt(SEEDS.duotone).colorNames).toHaveLength(2);
  });

  it("never stacks more than two modifiers", () => {
    for (const seed of Object.values(SEEDS)) {
      const words = describeAt(seed).modifierPhrase.split(" ").filter(Boolean);
      expect(words.length).toBeLessThanOrEqual(2);
    }
  });

  it("does not repeat a word the color names already spent", () => {
    for (const seed of Object.values(SEEDS)) {
      const { modifierPhrase, colorNames } = describeAt(seed);
      const colors = colorNames.join(" ").toLowerCase();
      for (const word of modifierPhrase.split(" ").filter(Boolean)) {
        expect(colors.includes(word), `${word} repeated in ${colors}`).toBe(false);
      }
    }
  });
});

describe("budgets", () => {
  it("keeps every surface inside its character limit", () => {
    for (const seed of Object.values(SEEDS)) {
      for (const budget of [HEADLINE, TITLE_HEADLINE, META_HEADLINE]) {
        expect(
          describeAt(seed, 13, budget).name.length,
          `${seed} @ ${budget.maxChars}`,
        ).toBeLessThanOrEqual(budget.maxChars);
      }
    }
  });

  it("leaves the finished <title> inside Google's truncation window", () => {
    // The budget only pays off if the suffix is counted against it: at the
    // previous 44 with a 28-character suffix, average titles ran 62.7
    // characters and 67.9% of the corpus truncated. TITLE_SUFFIX is the
    // WORST-CASE suffix since D14 (titleSuffix's style-pinned variants are
    // strictly shorter), so this bound covers every suffix outcome.
    expect(TITLE_HEADLINE.maxChars + TITLE_SUFFIX.length).toBeLessThanOrEqual(60);
    for (const style of ["linearGradient", "linearSwatches", "radialGradient"]) {
      for (const inUrl of [true, false]) {
        expect(titleSuffix(style, inUrl).length).toBeLessThanOrEqual(TITLE_SUFFIX.length);
      }
    }
    for (const seed of Object.values(SEEDS)) {
      const title = `${describeAt(seed, 13, TITLE_HEADLINE).name}${TITLE_SUFFIX}`;
      expect(title.length, title).toBeLessThanOrEqual(60);
    }
  });

  it("keys the title suffix to style-param presence, then to what the view renders", () => {
    // D14, all three outcomes. A clean canonical URL competes for the full
    // "{color} gradient color palette" grammar; a URL that pins a style names
    // only what that view is — swatch styles render a palette, gradient
    // styles render a gradient.
    expect(titleSuffix("radialGradient", false)).toBe(" Gradient Palette");
    expect(titleSuffix("linearSwatches", false)).toBe(" Gradient Palette");
    expect(titleSuffix("linearSwatches", true)).toBe(" Palette");
    expect(titleSuffix("angularSwatches", true)).toBe(" Palette");
    expect(titleSuffix("radialGradient", true)).toBe(" Gradient");
    expect(titleSuffix("linearGradient", true)).toBe(" Gradient");
  });

  it("never trades the second color name for an adjective", () => {
    // A tight budget shortens the color list to keep the modifier, but stops at
    // two. Going to one name to keep an adjective took title collisions from
    // 2.3% to 6.9% of the corpus — five pages sharing "Earthy charcoal gray" —
    // and it is how the original bug read: "Complementary light steel blue and
    // blanched almond" overran the title and became "Light steel blue", a
    // two-color palette described by half of itself.
    //
    // Swept across every budget, not just the two shipped ones.
    for (const seed of Object.values(SEEDS)) {
      const view = renderPalette(seed, "linearGradient", 13, 90);
      for (let maxChars = 64; maxChars >= 14; maxChars--) {
        const d = describePaletteName(view.appliedCoeffs, view.hexColors, {
          maxChars,
          maxNames: HEADLINE.maxNames,
        });
        if (d.colorNames.length > 1 || !d.modifierPhrase) continue;
        // One name AND a modifier is only allowed when there was no second
        // name to keep — two perceptually distant stops can still round to one.
        const two = getUniqueColorNames(view.hexColors, { max: 2 });
        expect(two.length, `${seed} @ ${maxChars}: "${d.name}"`).toBe(1);
      }
    }
  });
});

describe("the registry", () => {
  it("keeps every descriptor inside the information band", () => {
    // A descriptor firing on more than 60% or under 2% of the corpus says
    // nothing. Prevalences are measured, so a threshold change must re-measure.
    //
    // The 2% floor governs what may be SPOKEN; sub-2% facts are allowed to
    // exist unspoken as tag/prose vocabulary — `solid` fires on 0.1% of the
    // corpus but must exist because prose vetoes every journey word on it.
    for (const d of DESCRIPTORS) {
      if (d.spoken) expect(d.prevalence, d.word).toBeGreaterThanOrEqual(0.02);
      expect(d.prevalence, d.word).toBeLessThanOrEqual(0.6);
    }
  });

  it("never speaks a descriptor worth less than two bits", () => {
    for (const d of DESCRIPTORS) {
      if (d.spoken) expect(descriptorScore(d), d.word).toBeGreaterThanOrEqual(2);
    }
  });

  it("sums the structure axis to the whole corpus", () => {
    // Structure is one exclusive classification, so its prevalences partition.
    const total = DESCRIPTORS.filter((d) => d.axis === "structure").reduce(
      (s, d) => s + d.prevalence,
      0,
    );
    expect(total).toBeGreaterThan(0.97);
    expect(total).toBeLessThan(1.03);
  });

  it("re-measures every prevalence it ships", () => {
    // The registry contract: prevalences are MEASURED, never estimated, and
    // measured over this fixture at 13 steps. This is the assertion that makes
    // that contract enforceable — a threshold change that moves a fire rate
    // fails here until the value beside it is updated.
    const views = PROSE_SEEDS.map((seed) => renderPalette(seed, "linearGradient", 13, 90));
    const features = views.map((v) => paletteFeatures(v.appliedCoeffs, v.hexColors));
    for (const d of DESCRIPTORS) {
      const rate = features.filter((f) => d.test(f)).length / features.length;
      expect(Number(rate.toFixed(3)), `${d.word} measures ${rate.toFixed(4)}`).toBe(
        d.prevalence,
      );
    }
  });

  it("lets each axis speak at most once", () => {
    for (const seed of Object.values(SEEDS)) {
      const view = renderPalette(seed, "linearGradient", 13, 90);
      const chosen = selectModifiers(paletteFeatures(view.appliedCoeffs, view.hexColors));
      const axes = chosen.map((d) => d.axis);
      expect(new Set(axes).size).toBe(axes.length);
    }
  });
});

describe("saturation, not chroma (D19)", () => {
  // The bug: absolute chroma read as "is there colour here". The sRGB solid is
  // lopsided, so a light tint can be the most colourful thing the display can
  // render at its lightness and still measure a chroma the classifier called
  // gray. This palette is the owner's evidence: plainly blue, pink, cream and
  // cyan on screen, classified `grayscale` before the fix.
  const EVIDENCE = [
    "#ceeaff",
    "#fcd3d4",
    "#ffffed",
    "#ffffff",
    "#deffff",
    "#d5e3f6",
  ];

  it("reads the evidence stops as coloured, not gray", () => {
    // Measured per stop: chroma under the absolute floor, saturation at or near
    // the ceiling. #ffffff is the exception on purpose — pure white has no hue
    // at any reading, and the ceiling guard in color-utils keeps its ratio at 0
    // rather than letting floating-point residue make white a colour.
    for (const hex of EVIDENCE) {
      const { L, C, h } = hexToOkLch(hex);
      const ceiling = maxChromaFor(L, h);
      if (hex === "#ffffff") {
        expect(stopSaturation(hex)).toBe(0);
        expect(stopHasHue(hex)).toBe(false);
        continue;
      }
      expect(stopSaturation(hex), hex).toBeGreaterThanOrEqual(0.65);
      expect(C / ceiling, hex).toBeCloseTo(stopSaturation(hex), 5);
      expect(stopHasHue(hex), hex).toBe(true);
    }
    // And the reading that produced the bug: averaged, this palette carries
    // less chroma than a single stop needs to keep its hue (0.029 against a
    // 0.03 floor), while sitting at three quarters of everything sRGB has at
    // those lightnesses. One number says gray, the other says blue and pink.
    const stops = EVIDENCE.map(hexToOkLch);
    const meanChroma = stops.reduce((s, c) => s + c.C, 0) / stops.length;
    const meanSaturation =
      EVIDENCE.reduce((s, hex) => s + stopSaturation(hex), 0) / EVIDENCE.length;
    expect(meanChroma).toBeLessThan(THRESHOLDS.CHROMA_FLOOR);
    expect(meanSaturation).toBeGreaterThan(THRESHOLDS.GRAYSCALE_SAT);
  });

  it("never calls a stop near its gamut ceiling achromatic", () => {
    // The property the fix guarantees, swept over every rendered stop in the
    // fixture: 70% of achievable chroma is colour by any definition.
    for (const seed of PROSE_SEEDS) {
      for (const hex of renderPalette(seed, "linearGradient", 13, 90).hexColors) {
        if (stopSaturation(hex) >= 0.7) expect(stopHasHue(hex), `${seed} ${hex}`).toBe(true);
      }
    }
  });

  it("classifies the pale end of the corpus by what it looks like", () => {
    // A live seed of the same class as the evidence: mean chroma 0.025, but its
    // stops sit at half their ceiling and it renders pale blue to pale sage.
    // It read `grayscale` before the fix and reads `monochrome` after, which is
    // what "Monochrome lavender to light gray" should say.
    const view = renderPalette(
      "_gLEgGFgaXgELgLAgRugEogBggBkgAWgBkgFbdgwsl1ff",
      "linearGradient",
      13,
      90,
    );
    const f = paletteFeatures(view.appliedCoeffs, view.hexColors);
    expect(f.denseMeanChroma).toBeLessThan(THRESHOLDS.GRAYSCALE_CHROMA);
    expect(f.denseMeanSaturation).toBeGreaterThan(THRESHOLDS.GRAYSCALE_SAT);
    expect(classifyStructure(f)).toBe("monochrome");
  });

  it("still calls an actual neutral ramp grayscale", () => {
    // The other side of the conjunction: low on BOTH readings. A warm greige
    // ramp measures 0.24 mean saturation against a 0.25 floor, so this is also
    // the assertion that catches GRAYSCALE_SAT drifting down.
    const view = renderPalette(SEEDS.grayscale, "linearGradient", 13, 90);
    const f = paletteFeatures(view.appliedCoeffs, view.hexColors);
    expect(f.denseMeanSaturation).toBeLessThan(THRESHOLDS.GRAYSCALE_SAT);
    expect(classifyStructure(f)).toBe("grayscale");
  });
});
