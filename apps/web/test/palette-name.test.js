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
} from "../src/palette-name.ts";
import {
  classifyStructure,
  DESCRIPTORS,
  descriptorScore,
  paletteFeatures,
  selectModifiers,
} from "@repo/data-ops/gradient-gen/palette-modifiers";

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
    // characters and 67.9% of the corpus truncated.
    expect(TITLE_HEADLINE.maxChars + TITLE_SUFFIX.length).toBeLessThanOrEqual(60);
    for (const seed of Object.values(SEEDS)) {
      const title = `${describeAt(seed, 13, TITLE_HEADLINE).name}${TITLE_SUFFIX}`;
      expect(title.length, title).toBeLessThanOrEqual(60);
    }
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

  it("lets each axis speak at most once", () => {
    for (const seed of Object.values(SEEDS)) {
      const view = renderPalette(seed, "linearGradient", 13, 90);
      const chosen = selectModifiers(paletteFeatures(view.appliedCoeffs, view.hexColors));
      const axes = chosen.map((d) => d.axis);
      expect(new Set(axes).size).toBe(axes.length);
    }
  });
});
