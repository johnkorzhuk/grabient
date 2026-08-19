// The characteristic registry (D25.1): the contract that keeps it honest.
//
// Every rate in the table is a MEASUREMENT over the 867 live-sitemap seeds at
// the default view (linearGradient, 7 steps, 90°), so this suite re-measures
// all of them and fails the build on drift — the same contract palette-name
// holds the DESCRIPTORS registry to and palette-prose holds the impression
// table to. A threshold change is therefore always accompanied by a re-measure.
import { describe, expect, it } from "vitest";
import { renderPalette } from "../src/palette.ts";
import {
  hueBandShare,
  paletteFeatures,
  THRESHOLDS,
  vividHueBandShare,
} from "@repo/data-ops/gradient-gen/palette-modifiers";
import { analyzeCoefficients } from "@repo/data-ops/gradient-gen/palette-tags";
import {
  CHARACTERISTICS,
  characteristicCtx,
  chipCharacteristics,
  IMPRESSION_CHIPS,
  IMPRESSION_GROUPS,
  characteristicScore,
  characteristicsOf,
  FAMILY_TERMS,
  gatedFamily,
  GATED_HUE_NAMES,
  HUE_NAME_HALF,
  HUE_NAME_SHARE,
  NEAR_BLACK_L,
  NEAR_WHITE_L,
  prominentCharacteristics,
  PROMINENCE_CEILING,
  purpleLineShare,
  PURPLE_LINE_MAX_SHARE,
  CHIP_SUPPORT_FLOOR,
  TAG_PAGE_SIZE,
  FIXTURE_SEEDS,
} from "@repo/data-ops/gradient-gen/palette-characteristics";
import { colorFamily, hexToOkLch } from "@repo/data-ops/color-utils";
import { PROSE_SEEDS } from "./prose-corpus.js";

const analysed = new Map();
const caseFor = (seed) => {
  let c = analysed.get(seed);
  if (!c) {
    const view = renderPalette(seed, "linearGradient", 7, 90);
    const f = paletteFeatures(view.appliedCoeffs, view.hexColors);
    const journey = analyzeCoefficients(view.appliedCoeffs).journey;
    const ctx = characteristicCtx(f, view.hexColors, {
      journey: journey === "warming" || journey === "cooling" ? journey : null,
    });
    c = { view, f, ctx };
    analysed.set(seed, c);
  }
  return c;
};

describe("the characteristic registry", () => {
  it("names each term once and gives every one an axis", () => {
    const terms = CHARACTERISTICS.map((c) => c.term);
    expect(new Set(terms).size).toBe(terms.length);
    for (const c of CHARACTERISTICS) {
      expect(c.axis, c.term).toBeTruthy();
      expect(typeof c.test, c.term).toBe("function");
    }
  });

  it("never ships a term the inventory says is not computable (D25.3)", () => {
    // These are documented at the top of palette-characteristics.ts with the
    // reason each one cannot be decided from diffuse colour. The assertion is
    // here so a later package cannot quietly add one back.
    const FORBIDDEN = [
      "metallic",
      "iridescent",
      "holographic",
      "simultaneous contrast",
      "assimilation",
      "bezold",
      "kelvin",
      "luma",
      "luminosity",
    ];
    for (const term of CHARACTERISTICS.map((c) => c.term.toLowerCase()))
      for (const banned of FORBIDDEN) expect(term, banned).not.toContain(banned);
  });

  it("re-measures every rate it ships", { timeout: 120000 }, () => {
    const plain = new Map(CHARACTERISTICS.map((c) => [c.term, 0]));
    const strong = new Map(CHARACTERISTICS.map((c) => [c.term, 0]));
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      for (const c of CHARACTERISTICS) {
        if (!c.test(f, ctx)) continue;
        plain.set(c.term, plain.get(c.term) + 1);
        if (!c.strong || c.strong(f, ctx)) strong.set(c.term, strong.get(c.term) + 1);
      }
    }
    const n = PROSE_SEEDS.length;
    for (const c of CHARACTERISTICS) {
      expect(
        Number((plain.get(c.term) / n).toFixed(4)),
        `${c.term} prevalence measures ${(plain.get(c.term) / n).toFixed(4)}`,
      ).toBe(c.prevalence);
      expect(
        Number((strong.get(c.term) / n).toFixed(4)),
        `${c.term} strongPrevalence measures ${(strong.get(c.term) / n).toFixed(4)}`,
      ).toBe(c.strongPrevalence);
    }
  });

  it("keeps the margin band inside the term (D24.1b)", { timeout: 120000 }, () => {
    // `strong` is the SAME claim with a stricter threshold, so it can never
    // fire where `test` does not: that is what makes it a margin rather than a
    // second, competing definition of the word.
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      for (const c of CHARACTERISTICS) {
        if (!c.strong) continue;
        if (c.strong(f, ctx)) expect(c.test(f, ctx), `${seed}: ${c.term}`).toBe(true);
      }
    }
    // ...and a margin has to cost something. Every term whose strong band is a
    // real threshold move must land under its own plain rate; the ones that
    // carry no `strong` are exact facts (a coefficient guarantee, a stored tag)
    // and say so in their notes.
    for (const c of CHARACTERISTICS) {
      if (!c.strong) expect(c.strongPrevalence, c.term).toBe(c.prevalence);
      else expect(c.strongPrevalence, c.term).toBeLessThanOrEqual(c.prevalence);
    }
  });

  it("keeps the residual class and the text-pairing fact off the chip row", () => {
    // `multicolor` is what is left when no geometry fits, so by construction it
    // never pops out (D24.3); `wcag-aa` is a fact about text on the palette,
    // not about the palette (D25.2). Both stay in the registry as true tags and
    // both are unreachable as chips.
    for (const term of ["multicolor", "wcag-aa"]) {
      const c = CHARACTERISTICS.find((x) => x.term === term);
      expect(c.strongPrevalence, term).toBe(0);
    }
  });

  it("ranks the prominent set by rarity and dedupes implications", { timeout: 120000 }, () => {
    const sizes = {};
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      const all = characteristicsOf(f, ctx);
      const top = prominentCharacteristics(f, ctx);
      sizes[top.length] = (sizes[top.length] ?? 0) + 1;
      // prominent ⊆ true
      for (const c of top) expect(all).toContain(c);
      // ...only discriminating terms...
      for (const c of top) expect(c.strongPrevalence).toBeLessThanOrEqual(PROMINENCE_CEILING);
      // ...ranked by information content...
      for (let i = 1; i < top.length; i++)
        expect(characteristicScore(top[i - 1])).toBeGreaterThanOrEqual(
          characteristicScore(top[i]),
        );
      // ...and never a term another survivor already implies.
      const shown = new Set(top.map((c) => c.term));
      for (const c of top)
        for (const w of c.implies ?? []) expect(shown.has(w), `${c.term} implies ${w}`).toBe(false);
      expect(prominentCharacteristics(f, ctx, 3).length).toBeLessThanOrEqual(3);
    }
    // Measured 2026-08-18 over the fixture, re-measured at the F5
    // consolidation when `complementary`'s sweep-route margin dropped its
    // redundant pair-sum conjunct (31 -> 34 strong): two palettes moved from 5
    // prominent terms to 6, because the word arriving silences one of the two
    // it implies and not both. The number of terms that are TRUE
    // WITH MARGIN, before any display cap. This is the pool D25.5's chip row
    // selects from, and it is deliberately not flat — a plain palette really
    // does have less to say about itself than a striking one.
    expect(sizes).toEqual({
      1: 12,
      2: 35,
      3: 92,
      4: 150,
      5: 170,
      6: 159,
      7: 109,
      8: 77,
      9: 35,
      10: 17,
      11: 9,
      12: 2,
    });
    // Median 6, floor 1, ceiling 14 - and this is a WHOLE-REGISTRY number, so
    // every domain package that lands moves it and the last one to land owns
    // it. That is the assertion working, not drift: the pool is what D25.5's
    // chip row selects from, and it has to be re-measured whenever the table
    // it is drawn from grows. (It moved twice on 2026-08-18: the chroma and
    // temperature pass pushed it DOWN, because the journey pair - true of a
    // third of the corpus each - now needs both temperature zones present
    // before it counts as prominent, and the hue, value and gradient passes
    // pushed it back up with their own terms. D25.5 pulled the tail in — 16 to
    // 14 — by declaring the definitional implications the fixture had already
    // proved: high-key implies light, low-key implies dark, ombre and both
    // motion words imply ramp, and each channel clip implies `clipped`.)
    //
    // QA ROUND 4 moved it again, and DOWN at both ends: mean 5.65 against 6.13,
    // with the 1-3 bucket growing from 103 rows to 132 and the 11-14 tail
    // falling from 46 to 21. Every step of that is a term that stopped being
    // true or stopped being prominent on a palette the round measured it wrong
    // on - `near-white` on a pale lime, `arch` on a valley, `jewel tones` on a
    // ramp dying into white, `wash` on a white plateau - plus five new
    // implications (near-black/dark, neon/luminous, brilliant/high-key,
    // sepia's three, rainbow/spectral order). A shorter pool of TRUE things is
    // the point of the round.
  });

  it("agrees with the structure ladder about the sweep complementary (D24.2)", () => {
    // The owner's screenshot palette is a hex list, not a seed, so the fixture
    // seed with its shape stands in: ONE hue cluster spanning 174 degrees, hue
    // 259 (blue) to hue 84 (gold), with the desaturated crossing in between.
    // Before D24.2 this classified `multicolor` and the page showed no
    // structure chip at all.
    const seed = "_gAVgEagGpgLAf5df4-f5Of5Of2pf1pf8EgaC";
    const { f, ctx } = caseFor(seed);
    expect(f.hueClusters).toBe(1);
    expect(f.hueSpan).toBeGreaterThan(150);
    expect(ctx.structure).toBe("complementary");
    expect(characteristicsOf(f, ctx).map((c) => c.term)).toContain("complementary");
  });
});

// ---------------------------------------------------------------------------
// CHROMA and TEMPERATURE — inventory sections 3 and 4 (D25.2).
//
// One assertion per term that it fires ONLY where its OkLCh test holds, so a
// later edit to a shared detector cannot quietly widen a word; the rates
// themselves are re-measured by "re-measures every rate it ships" above. The
// conflation law (research-colorTheory §9) is asserted where the inventory
// warns about it: chroma is not saturation, a neon is not a jewel, a muted
// palette is not a grayscale one, pastel is not merely light, sepia is not a
// vivid orange, and the model CLAMPS - nothing here is "out of gamut".
// ---------------------------------------------------------------------------
describe("chroma and temperature", () => {
  const T = THRESHOLDS;
  const term = (t) => {
    const c = CHARACTERISTICS.find((x) => x.term === t);
    expect(c, `${t} is missing from the registry`).toBeTruthy();
    return c;
  };
  /** Every fixture seed the term fires on, as {seed, f, ctx}. */
  const firing = (t) => {
    const c = term(t);
    return PROSE_SEEDS.map((seed) => ({ seed, ...caseFor(seed) })).filter((x) =>
      c.test(x.f, x.ctx),
    );
  };
  const count = (pred) =>
    PROSE_SEEDS.filter((seed) => {
      const { f, ctx } = caseFor(seed);
      return pred(f, ctx);
    }).length;
  const fires = (t) => (f, ctx) => term(t).test(f, ctx);

  it("carries every term sections 3 and 4 ship", () => {
    for (const t of [
      "vivid",
      "neon",
      "muted",
      "pastel",
      "jewel tones",
      "earthy",
      "sepia",
      "brilliant",
      "clipped",
      "warm",
      "cool",
      "warm cool contrast",
      "warming",
      "cooling",
      "neutral-anchored",
      "temperature-neutral",
    ])
      expect(term(t).axis, t).toBeTruthy();
  });

  it("keeps the synonyms and the duplicates OUT of the table (D25.3)", () => {
    // Each of these is computable and each is recorded beside the entries with
    // its measurement: `vibrant` fires on vivid's own 185 palettes, `dusty` on
    // muted's 93, `achromatic` on grayscale's set plus D19's 5 rescues, `rich`
    // on 107 of which 105 are `jewel tones`, and `washed-out` is `pastel` OR
    // section 7's fade endpoint. A synonym belongs in the tag filter's
    // recognizer, never in a second entry that could disagree with the first.
    for (const t of [
      "vibrant",
      // `dusty` LEFT this list in QA round 6: the inventory calls it a prose
      // synonym of `muted` and the measurement says otherwise - read against
      // the sRGB ceiling rather than absolutely there are 85 palettes it is
      // true of and `muted` is true of none of them. See the entry's own note.
      "achromatic",
      "rich",
      "washed-out",
      "washed out",
      "faded",
      "saturation",
      "colorfulness",
    ])
      expect(
        CHARACTERISTICS.some((c) => c.term === t),
        t,
      ).toBe(false);
  });

  it("says clipped, never out of gamut", () => {
    // The cosine model CLAMPS to [0,1]; nothing here ever left a gamut.
    for (const c of CHARACTERISTICS)
      expect(`${c.term} ${c.note ?? ""}`.toLowerCase(), c.term).not.toContain("out of gamut");
  });

  it("fires the loudness terms only at real chroma, never at saturation", { timeout: 120000 }, () => {
    for (const { seed, f } of firing("vivid"))
      expect(f.meanChroma, seed).toBeGreaterThanOrEqual(T.VIVID_CHROMA);
    for (const { seed, f } of firing("neon")) {
      expect(f.maxChroma, seed).toBeGreaterThanOrEqual(T.NEON_CHROMA);
      // ...and the loudest TENTH, so the word describes a stretch a viewer can
      // see rather than one electric stop.
      expect(f.denseChromaP90, seed).toBeGreaterThanOrEqual(T.NEON_CHROMA);
      expect(f.meanLightness, seed).toBeGreaterThan(T.NEON_LIGHTNESS);
    }
    // The p90 guard has to bite, or it is decoration: 12 fixture palettes hold a
    // stop at NEON_CHROMA, sit above NEON_LIGHTNESS and are still refused.
    expect(
      count(
        (f) =>
          f.maxChroma >= T.NEON_CHROMA &&
          f.meanLightness > T.NEON_LIGHTNESS &&
          f.denseChromaP90 < T.NEON_CHROMA,
      ),
    ).toBe(12);
    for (const { seed, f } of firing("brilliant")) {
      expect(f.meanChroma, seed).toBeGreaterThanOrEqual(T.VIVID_CHROMA);
      // The light half is definitional, and it is the registry's own `light`:
      // 166 vivid palettes in the fixture are not brilliant.
      expect(f.meanLightness, seed).toBeGreaterThanOrEqual(T.LIGHT_LIGHTNESS);
    }
    expect(count((f, ctx) => fires("vivid")(f, ctx) && !fires("brilliant")(f, ctx))).toBe(166);
  });

  it("keeps the restrained terms restrained, and coloured", { timeout: 120000 }, () => {
    for (const { seed, f, ctx } of firing("muted")) {
      expect(f.meanChroma, seed).toBeLessThan(T.MUTED_CHROMA);
      expect(f.meanLightness, seed).toBeLessThanOrEqual(T.PASTEL_LIGHTNESS);
      // muted is not grayscale: colour is present, it is held back.
      expect(fires("grayscale")(f, ctx), seed).toBe(false);
    }
    for (const { seed, f, ctx } of firing("pastel")) {
      expect(f.meanLightness, seed).toBeGreaterThan(T.PASTEL_LIGHTNESS);
      // ...and the low-chroma half, which is what pastel MEANS: 69 light
      // palettes in the fixture are refused the word on it alone.
      expect(f.meanChroma, seed).toBeLessThan(T.PASTEL_CHROMA);
      expect(fires("grayscale")(f, ctx), seed).toBe(false);
    }
    expect(
      count(
        (f, ctx) =>
          fires("light")(f, ctx) && !fires("pastel")(f, ctx) && f.meanChroma >= T.PASTEL_CHROMA,
      ),
    ).toBe(69);
    for (const { seed, f, ctx } of firing("earthy")) {
      // Earth pigments: low chroma, warm hue, held below full lightness. Drop
      // any one gate and a fluorescent orange is an earth tone.
      expect(f.meanChroma, seed).toBeLessThan(0.1);
      expect(f.maxChroma, seed).toBeLessThan(T.VIVID_CHROMA);
      expect(f.meanHue, seed).toBeGreaterThanOrEqual(20);
      expect(f.meanHue, seed).toBeLessThan(110);
      expect(f.meanLightness, seed).toBeLessThan(0.75);
      expect(fires("grayscale")(f, ctx), seed).toBe(false);
    }
  });

  it("holds jewel tones inside their L window and sepia inside its hue window", { timeout: 120000 }, () => {
    for (const { seed, f } of firing("jewel tones")) {
      expect(f.meanLightness, seed).toBeGreaterThanOrEqual(0.3);
      expect(f.meanLightness, seed).toBeLessThanOrEqual(0.6);
      expect(f.meanChroma, seed).toBeGreaterThanOrEqual(0.12);
      expect(f.maxChroma, seed).toBeGreaterThanOrEqual(0.15);
    }
    // "not dark vivid loosely", and since QA round 4 the row says so rather
    // than hoping the L window will: EVERY neon is now outside jewel tones (69
    // of 69, against 56 of 69 when the mean lightness window was the only
    // guard), because two electric purples at C 0.294 sat inside [0.3, 0.6] on
    // the mean and chipped both words on one row. The second new guard is the
    // light end - no stop above LIGHT_LIGHTNESS - which is what keeps a violet
    // ombre dying into pastel lavender from being carried over the bar by its
    // dark half.
    expect(count((f, ctx) => fires("neon")(f, ctx) && !fires("jewel tones")(f, ctx))).toBe(69);
    for (const { seed, f } of firing("jewel tones"))
      expect(f.denseMaxLightness, seed).toBeLessThanOrEqual(T.LIGHT_LIGHTNESS);
    for (const { seed, f, ctx } of firing("sepia")) {
      expect(ctx.structure, seed).toBe("monochrome");
      expect(f.meanHue, seed).toBeGreaterThanOrEqual(50);
      expect(f.meanHue, seed).toBeLessThan(90);
      expect(f.meanChroma, seed).toBeGreaterThanOrEqual(T.CHROMA_FLOOR);
      expect(f.meanChroma, seed).toBeLessThanOrEqual(0.1);
      expect(f.meanLightness, seed).toBeLessThan(0.8);
    }
    // ...which is what keeps the aged-photo word off a vivid orange.
    expect(count((f, ctx) => fires("sepia")(f, ctx) && fires("vivid")(f, ctx))).toBe(0);
  });

  it("reads clipping as a share of the run, not as a gamut claim", { timeout: 120000 }, () => {
    for (const { seed, f } of firing("clipped"))
      expect(f.clipped, seed).toBeGreaterThanOrEqual(T.CLIPPED_FRACTION);
  });

  it("says neutral-anchored only of a palette that CONTAINS neutrals", { timeout: 120000 }, () => {
    for (const { seed, f, ctx } of firing("neutral-anchored")) {
      expect(f.chromaticFraction, seed).toBeGreaterThanOrEqual(0.15);
      expect(f.chromaticFraction, seed).toBeLessThanOrEqual(0.85);
      // ...never of one that IS neutral.
      expect(ctx.structure, seed).not.toBe("grayscale");
      expect(fires("grayscale")(f, ctx), seed).toBe(false);
    }
    // The exclusion costs something: 5 fixture palettes sit inside the band and
    // are grayscale by the chroma-and-saturation clause.
    expect(
      count(
        (f, ctx) =>
          f.chromaticFraction >= 0.15 &&
          f.chromaticFraction <= 0.85 &&
          ctx.structure === "grayscale",
      ),
    ).toBe(5);
  });

  it("partitions the corpus into warm, cool and temperature-neutral", { timeout: 120000 }, () => {
    let warm = 0;
    let cool = 0;
    let neutral = 0;
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      const hits = ["warm", "cool", "temperature-neutral"].filter((t) => fires(t)(f, ctx));
      // Exactly one, always: the third class is the negation of the other two,
      // so a palette can never fall outside all three or into two.
      expect(hits.length, `${seed}: ${hits.join(", ")}`).toBe(1);
      if (hits[0] === "warm") warm++;
      else if (hits[0] === "cool") cool++;
      else neutral++;
    }
    expect({ warm, cool, neutral }).toEqual({ warm: 399, cool: 312, neutral: 156 });
    // ...and the ambiguous class never spends a chip (its `use` column reads
    // "neither", and the word collides with the indexed `warmth: neutral`).
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      expect(
        prominentCharacteristics(f, ctx).some((c) => c.term === "temperature-neutral"),
        seed,
      ).toBe(false);
    }
  });

  it("cites the stored journey tag and earns its margin from coexistence", { timeout: 120000 }, () => {
    for (const t of ["warming", "cooling"]) {
      const c = term(t);
      for (const seed of PROSE_SEEDS) {
        const { f, ctx } = caseFor(seed);
        // The DIRECTION is palette-tags', never recomputed here (D25.2).
        expect(c.test(f, ctx), seed).toBe(ctx.journey === t);
        if (!c.strong(f, ctx)) continue;
        // The MARGIN is that both temperature zones are actually occupied, so
        // the drift is visible - warm-cool contrast's own 0.25 shares.
        expect(hueBandShare(f, 330, 120), seed).toBeGreaterThanOrEqual(0.25);
        expect(hueBandShare(f, 150, 300), seed).toBeGreaterThanOrEqual(0.25);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// HUE and VALUE — inventory sections 1 and 2 (D25.2, package D-A).
//
// One assertion per term that it fires only under its own gate. The rates are
// re-measured by "re-measures every rate it ships" above; what is asserted
// here is the SHAPE of each word — that a hue name never lands on a stop
// outside its arc or outside its L/C window, that the value bands are per-stop
// where the inventory says per-stop and per-palette where it says per-palette,
// and that the conflations research-colorTheory §9 warns about cannot happen:
// teal is not a bright cyan, navy is not a mid blue, olive is not a vivid
// yellow, brown is not an orange, purple is not a violet, and the arc words
// measure the SPAN and not `full-wheel`'s net rotation.
// ---------------------------------------------------------------------------
describe("hue names and value bands", () => {
  const term = (t) => {
    const c = CHARACTERISTICS.find((x) => x.term === t);
    expect(c, `${t} is missing from the registry`).toBeTruthy();
    return c;
  };
  const firing = (t, strong = false) => {
    const c = term(t);
    const out = [];
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      if (!c.test(f, ctx)) continue;
      if (strong && c.strong && !c.strong(f, ctx)) continue;
      out.push({ seed, f, ctx });
    }
    return out;
  };
  const arc = (a, b) => {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  };

  it("ships every family word and every extended name from the inventory", () => {
    // The eleven `gatedFamily` can return, and the twenty-six §1.2 rows that
    // survive as computable. `indigo` is deliberately absent: the web value
    // (#4b0082) measures h 301.7, a dark purple, and the spectral position is
    // near 279, so either anchor names something the other calls wrong.
    for (const w of FAMILY_TERMS) expect(term(w).axis).toBe("hue");
    for (const g of GATED_HUE_NAMES) expect(term(g.term).axis).toBe("hue");
    expect(FAMILY_TERMS.length).toBe(11);
    expect(GATED_HUE_NAMES.length).toBe(26);
    expect(CHARACTERISTICS.some((c) => c.term === "indigo")).toBe(false);
  });

  it("fires a family term only where gatedFamily names a stop that word", { timeout: 120000 }, () => {
    // The registry and the retrieval filter ask ONE function, so the assertion
    // is that the chip's own count is the count `tag-search` ranks by.
    for (const w of FAMILY_TERMS) {
      const c = term(w);
      for (const seed of PROSE_SEEDS) {
        const { f, ctx } = caseFor(seed);
        const stops = ctx.colors.map(hexToOkLch);
        const hits = stops.filter((s) => gatedFamily(s) === w).length;
        expect(c.test(f, ctx), `${seed} ${w}`).toBe(hits > 0);
        expect(c.strong(f, ctx), `${seed} ${w} strong`).toBe(
          hits / stops.length >= HUE_NAME_SHARE,
        );
      }
    }
  });

  it("fires an extended name only on stops inside its arc AND its L/C window", { timeout: 120000 }, () => {
    for (const g of GATED_HUE_NAMES) {
      const c = term(g.term);
      let sawOne = false;
      for (const seed of PROSE_SEEDS) {
        const { f, ctx } = caseFor(seed);
        if (!c.test(f, ctx)) continue;
        sawOne = true;
        const hits = ctx.colors
          .map(hexToOkLch)
          .filter(
            (s) =>
              arc(s.h, g.anchor) <= HUE_NAME_HALF &&
              s.L >= g.lightness[0] &&
              s.L <= g.lightness[1] &&
              s.C >= g.chroma[0] &&
              s.C <= g.chroma[1],
          );
        expect(hits.length, `${seed} ${g.term}`).toBeGreaterThan(0);
        if (c.strong(f, ctx))
          expect(hits.length / ctx.colors.length, `${seed} ${g.term} strong`)
            .toBeGreaterThanOrEqual(HUE_NAME_SHARE);
      }
      // Every one of the twenty-six is reachable on the live corpus. A name
      // that could never fire would be a bug in its gate, not a rare palette.
      expect(sawOne, `${g.term} never fires`).toBe(true);
    }
  });

  it("obeys the conflation law: the gate IS the word", { timeout: 120000 }, () => {
    // research-colorTheory §1.2's traps, each asserted on the stop that made
    // the term fire — the same-hue pairs where only L and C separate the words.
    const gate = (t) => GATED_HUE_NAMES.find((g) => g.term === t);
    const stopsFor = (t) =>
      firing(t).flatMap(({ ctx }) =>
        ctx.colors.map(hexToOkLch).filter((s) => {
          const g = gate(t);
          return (
            arc(s.h, g.anchor) <= HUE_NAME_HALF &&
            s.L >= g.lightness[0] &&
            s.L <= g.lightness[1] &&
            s.C >= g.chroma[0] &&
            s.C <= g.chroma[1]
          );
        }),
      );
    // teal is cyan held DOWN in both L and C; a bright cyan is not a teal.
    for (const s of stopsFor("teal")) {
      expect(s.L).toBeLessThan(0.6);
      expect(s.C).toBeLessThanOrEqual(0.12);
    }
    // navy is blue held down in L only.
    for (const s of stopsFor("navy")) expect(s.L).toBeLessThan(0.35);
    // olive is DARK yellow, never a vivid one.
    for (const s of stopsFor("olive")) {
      expect(s.L).toBeLessThan(0.65);
      expect(s.C).toBeLessThanOrEqual(0.14);
    }
    // chartreuse sits at 136 — beside green, NOT midway yellow-green.
    for (const s of stopsFor("chartreuse")) expect(arc(s.h, 136)).toBeLessThanOrEqual(HUE_NAME_HALF);
    // brown and purple are gatedFamily rungs, so they are asserted through it:
    // a brown stop is in the orange band and a purple stop is a DARK magenta,
    // which is what makes purple distinct from violet (a band of its own).
    for (const { ctx } of firing("brown"))
      for (const s of ctx.colors.map(hexToOkLch))
        if (gatedFamily(s) === "brown") expect(colorFamily(s.h)).toBe("orange");
    for (const { ctx } of firing("purple"))
      for (const s of ctx.colors.map(hexToOkLch))
        if (gatedFamily(s) === "purple") {
          expect(colorFamily(s.h)).toBe("magenta");
          expect(s.L).toBeLessThan(0.55);
        }
  });

  it("keeps the three arc bands exclusive and off the net-rotation word", { timeout: 120000 }, () => {
    const bands = ["quarter-wheel", "half-wheel", "near-full-circle"];
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      const on = bands.filter((b) => term(b).test(f, ctx));
      expect(on.length, `${seed} ${on.join("+")}`).toBeLessThanOrEqual(1);
      // ...and each band is the span it names.
      if (term("quarter-wheel").test(f, ctx)) {
        expect(f.hueSpan).toBeGreaterThanOrEqual(90);
        expect(f.hueSpan).toBeLessThan(180);
      }
      if (term("half-wheel").test(f, ctx)) {
        expect(f.hueSpan).toBeGreaterThanOrEqual(180);
        expect(f.hueSpan).toBeLessThan(300);
      }
      if (term("near-full-circle").test(f, ctx)) expect(f.hueSpan).toBeGreaterThanOrEqual(300);
    }
    // The distinction the two words exist to keep: SPAN is the arc the colours
    // occupy, `full-wheel` is |hueNet| >= 330, and the fixture holds palettes
    // that satisfy one and not the other in both directions.
    const spanOnly = firing("near-full-circle").filter(({ ctx }) => !ctx.tags.includes("full-wheel"));
    const netOnly = PROSE_SEEDS.map(caseFor).filter(
      ({ f, ctx }) => ctx.tags.includes("full-wheel") && !term("near-full-circle").test(f, ctx),
    );
    expect(firing("near-full-circle").length).toBe(30);
    expect(spanOnly.length).toBe(10);
    expect(netOnly.length).toBe(1);
  });

  it("reads spectral order as a walk with no reversal, either way round", { timeout: 120000 }, () => {
    for (const { f, ctx } of firing("spectral order")) {
      expect(f.hueConsistency).toBeGreaterThanOrEqual(0.98);
      expect(f.hueTravel).toBeGreaterThanOrEqual(THRESHOLDS.HUE_DIRECTION_TRAVEL);
      // It is the strict form of the direction tags — every palette in
      // spectral order carries exactly one of them — and it deliberately does
      // NOT declare them in `implies`; see the note on the entry.
      const dir = ["hue-advancing", "hue-reversing"].filter((w) => ctx.tags.includes(w));
      expect(dir.length).toBe(1);
    }
    expect(term("spectral order").implies).toBeUndefined();
    {
    }
    // `hue cycling` is the other end of the same walk: more than a full turn
    // INCLUDING backtracking, which is not the same fact as netting one.
    for (const { f } of firing("hue cycling")) expect(f.hueTravel).toBeGreaterThanOrEqual(400);
  });

  it("puts the value endpoints on the endpoints and the bands on containment", { timeout: 120000 }, () => {
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      const Ls = ctx.colors.map((h) => hexToOkLch(h).L);
      const lo = Math.min(...Ls);
      const hi = Math.max(...Ls);
      // Endpoint claims: does the run REACH the band. `near-white` asks one
      // more question than its twin, and QA round 4 is why: the word is the
      // only value band that is also a colour identity, and read as pure value
      // it called a pale LIME (#e1ffa0, L 0.957, C 0.124) a near-white. At the
      // top of the solid the ceiling has collapsed, so the identity reading has
      // to be absolute chroma — see whitePole. There is no matching gate at the
      // bottom: below L 0.18 nothing reads as a colour anyway.
      const top = ctx.stops.reduce((a, b) => (b.L > a.L ? b : a));
      const white = top.C < THRESHOLDS.CHROMA_FLOOR;
      expect(term("near-black").test(f, ctx), seed).toBe(lo < NEAR_BLACK_L);
      expect(term("near-white").test(f, ctx), seed).toBe(white && hi > NEAR_WHITE_L);
      // ...and their margins are the inventory's own reserve for the words
      // black and white, not a number invented for the purpose.
      expect(term("near-black").strong(f, ctx), seed).toBe(lo < 0.08);
      expect(term("near-white").strong(f, ctx), seed).toBe(white && hi > 0.95);
      // Containment claims: does the WHOLE run live in the band.
      const band = (t, a, b) =>
        expect(term(t).test(f, ctx), `${seed} ${t}`).toBe(Ls.every((x) => x >= a && x < b));
      band("shadow band", NEAR_BLACK_L, 0.42);
      band("midtones", 0.42, 0.7);
      band("highlight band", 0.7, NEAR_WHITE_L);
      // The three are exclusive by construction, and none of them can be true
      // of a run that reaches either endpoint band.
      const inside = ["shadow band", "midtones", "highlight band"].filter((t) =>
        term(t).test(f, ctx),
      );
      expect(inside.length, seed).toBeLessThanOrEqual(1);
      if (inside.length) {
        expect(term("near-black").test(f, ctx), seed).toBe(false);
        expect(term("near-white").test(f, ctx), seed).toBe(false);
      }
      // ...and the identity gate only ever REMOVES a near-white, so the band
      // terms stay exclusive with it in both directions.
      if (term("near-white").test(f, ctx)) expect(hi).toBeGreaterThan(NEAR_WHITE_L);
    }
  });

  it("keeps chiaroscuro dark-dominant, and distinct from dark", { timeout: 120000 }, () => {
    const hits = firing("chiaroscuro");
    for (const { f, ctx } of hits) {
      expect(f.meanLightness).toBeLessThan(0.5);
      expect(f.lightnessRange).toBeGreaterThan(THRESHOLDS.HIGH_CONTRAST_RANGE);
      // Its range test IS the high-contrast bar, which is why it declares and
      // silences that word rather than printing the same fact twice.
      expect(ctx.tags).toContain("high-contrast");
    }
    // It does NOT imply `dark`: half the set sits between DARK_LIGHTNESS and
    // 0.5, which is the difference between "this palette is dark" and "this
    // palette is mostly dark with light cut into it".
    expect(hits.filter(({ ctx }) => ctx.tags.includes("dark")).length).toBe(14);
    expect(hits.length).toBe(28);
    expect(term("chiaroscuro").implies).toEqual(["high-contrast"]);
  });

  it("records the step drift in the hue-name share rather than hiding it", () => {
    // A share over the RENDERED stops moves with the step count, and the site
    // classifies a palette at its own stored steps on both sides of a chip, so
    // the two always agree — but the fixture number is a 7-step number and the
    // drift is a fact about the reading, not a defect. Re-measured here so a
    // change in the sampling shows up as a failure and not as a surprise.
    const count = (steps, word) => {
      let n = 0;
      for (const seed of PROSE_SEEDS) {
        const colors = renderPalette(seed, "linearGradient", steps, 90).hexColors;
        const hits = colors.filter((h) => gatedFamily(hexToOkLch(h)) === word).length;
        if (hits / colors.length >= HUE_NAME_SHARE) n++;
      }
      return n;
    };
    expect([count(7, "blue"), count(13, "blue"), count(48, "blue")]).toEqual([210, 165, 184]);
    expect([count(7, "red"), count(13, "red"), count(48, "red")]).toEqual([145, 102, 117]);
  }, 120000);
});

// -----------------------------------------------------------------------------
// D25 §5-§6: the harmony schemes above two hues, and Itten's contrasts.
//
// The rates themselves are re-measured by "re-measures every rate it ships"
// above; what this block pins is the SHAPE of each predicate — that a term
// fires only where its own definition holds, that its margin costs something,
// and that the four schemes which measure zero here are absent rather than
// broken (each is exercised on a witness found in random coefficient space).
// -----------------------------------------------------------------------------
describe("harmony schemes and Itten's contrasts", () => {
  const term = (name) => {
    const c = CHARACTERISTICS.find((x) => x.term === name);
    expect(c, name).toBeTruthy();
    return c;
  };
  const fires = (name, seed) => {
    const { f, ctx } = caseFor(seed);
    return term(name).test(f, ctx);
  };
  const firesStrong = (name, seed) => {
    const { f, ctx } = caseFor(seed);
    const c = term(name);
    return c.test(f, ctx) && (!c.strong || c.strong(f, ctx));
  };
  const arc = (a, b) => {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  };
  const counts = (name) => {
    const c = term(name);
    let plain = 0;
    let strong = 0;
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      if (!c.test(f, ctx)) continue;
      plain++;
      if (!c.strong || c.strong(f, ctx)) strong++;
    }
    return [plain, strong];
  };

  // Witnesses from a 400,000-palette sweep of random coefficient space
  // (a ∈ [0,1], b ∈ [0,0.8], c ∈ [0,4], d ∈ [0,1)); none of the four schemes
  // occurs in the 867-seed fixture. Pinned here so the predicates are exercised
  // rather than merely shipped, and so a later threshold move has to face them.
  const WITNESS = {
    triadic: "_gCcgG4gF_gH1gJSgLlghUgVtgGigEXgAegG0",
    "split complementary": "_gFngO5gE4gBVgLSgBqg7AgZdgu4gGJgALgAZ",
    tetradic: "_gOggOGgLhgLegL9gJJgnEgJXgT8gHAgIHgFT",
    square: "_gOggOGgLhgLegL9gJJgnEgJXgT8gHAgIHgFT",
    discord: "_gDEgJDgL3gEogLfgL1g3FgQFgLbgPDgGKgBF",
  };

  it("recognises each rare scheme on a witness of it", () => {
    for (const [name, seed] of Object.entries(WITNESS)) expect(fires(name, seed), name).toBe(true);
    // ...and the witnesses really do have the geometry the words claim.
    const triad = caseFor(WITNESS.triadic).f;
    expect(triad.hueClusters).toBe(3);
    expect(triad.clusterHues.map((h) => Math.round(h)).sort((a, b) => a - b)).toEqual([31, 142, 268]);
    const square = caseFor(WITNESS.square).f;
    expect(square.hueClusters).toBe(4);
    // A square is a tetradic with even spacing, so both fire on the same seed —
    // and `square` declares the implication so the chip row prints one of them.
    expect(fires("tetradic", WITNESS.square)).toBe(true);
    expect(term("square").implies).toContain("tetradic");
    // The margin costs something: this one's gaps run 99/70/96/95, so it is a
    // square at ±20 and not at ±10.
    expect(firesStrong("square", WITNESS.square)).toBe(false);
    expect(firesStrong("triadic", WITNESS.triadic)).toBe(true);
  });

  it("refuses a scheme whose groups are arcs rather than hues", () => {
    // The fixture's widest three-cluster palette: means at 195°/306°/48°, whose
    // three pairwise distances (111/102/147) all sit inside the triad window —
    // and one of its groups is a 118° arc holding 65% of the run. Without the
    // narrow-group gate this reads as a triad; with it, it is what it looks
    // like, a sweep.
    const seed = "_gGZgE0gDMgJQgHHgFVgMigNCgLzgOHgQGgwelS4buhgA";
    const { f } = caseFor(seed);
    expect(f.hueClusters).toBe(3);
    expect(f.maxClusterWidth).toBeGreaterThan(THRESHOLDS.CLUSTER_GAP);
    for (let i = 0; i < 3; i++)
      for (let j = i + 1; j < 3; j++) {
        const d = arc(f.clusterHues[i], f.clusterHues[j]);
        expect(d).toBeGreaterThanOrEqual(90);
        expect(d).toBeLessThanOrEqual(150);
      }
    expect(fires("triadic", seed)).toBe(false);
  });

  it("records the rare schemes as absent from this corpus, not as broken", () => {
    // D25.4: a term that never fires is either a bug or a genuinely absent
    // phenomenon. These are absent — a cosine dwells at its two turning points
    // per cycle, so three and four ISOLATED masses need a corner of coefficient
    // space the live sitemap never sampled. Reachability, measured over 400,000
    // random coefficient sets: triadic 44, tetradic 8, square 3, split
    // complementary 2. Discord: 0 here, 1.371% of 200,000 random sets.
    for (const name of ["split complementary", "square", "discord"]) {
      expect(counts(name), name).toEqual([0, 0]);
      expect(term(name).prevalence, name).toBe(0);
    }
    // ...and two of them stopped being absent when QA round 4 gave the schemes
    // a second route (the RENDERED stops, for the sweeps whose dense sample
    // fills every gap — see stopHueGroups). One triad: #d0555d #5b60cf #5bcf55
    // twice over, gaps 99.5/135.0/125.5. One tetrad: navy, red, peach, cyan.
    // Both are the shape the word describes and both were invisible to the
    // cluster route, which read the first as ONE cluster 340.7 degrees wide.
    //
    // ...and the TETRAD went away again in QA round 5, which is a fix rather
    // than a regression: the stop route was reading a continuous navy -> black
    // -> red -> orange -> cream -> cyan SWEEP as four isolated hue masses, two
    // of which were a single swatch each, and the row printed `tetradic` beside
    // `spectral order`. A group is now at least SCHEME_GROUP_STOPS swatches
    // (the triad's are 3 / 2 / 2, the sweep's were 3 / 1 / 2 / 1), which is
    // HUE_NAME_SHARE's argument applied to a scheme: one stop of seven is a
    // colour the ramp passes through, two is a mass you can point at.
    expect(counts("triadic")).toEqual([1, 1]);
    expect(counts("tetradic")).toEqual([0, 0]);
  }, 120000);

  it("gates Itten's contrast of hue on chroma, and its margin on distinct hues", () => {
    const c = term("hue contrast");
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      // The angle between two grays is arithmetic on noise, so the floor is
      // definitional — and it is the registry's own family floor, not a private
      // one.
      expect(c.test(f, ctx)).toBe(f.hueSpan >= 90 && f.meanChroma >= THRESHOLDS.FAMILY_CHROMA);
      if (c.strong(f, ctx)) expect(f.hueClusters).toBeGreaterThanOrEqual(2);
      // ...and the MARGIN asks the same question of each pole rather than of
      // the palette's average (QA round 4): one colour against a near-gray is
      // Itten SIX, and a cream-to-cornflower wash with clusters at chroma 0.030
      // and 0.109 cleared a mean-chroma bar of 0.10 by 0.0043.
      if (c.strong(f, ctx))
        for (const chroma of f.clusterChromas)
          expect(chroma).toBeGreaterThanOrEqual(THRESHOLDS.FAMILY_CHROMA);
    }
    expect(counts("hue contrast")).toEqual([301, 14]);
  }, 120000);

  it("will not call a flat gray an iso-luminant vibration", () => {
    // The tag stays true of any palette whose values are level while its hue
    // moves; the CHIP claims a vibration, and two grays at one lightness do not
    // vibrate. Measured: of the nine palettes that passed the old band, five
    // sit at mean chroma 0.027-0.048 and four at 0.135-0.196, with nothing in
    // between.
    const c = term("iso-luminant");
    let plainGray = 0;
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      if (c.strong(f, ctx)) expect(f.meanChroma).toBeGreaterThanOrEqual(0.12);
      if (c.test(f, ctx) && f.meanChroma < 0.12) plainGray++;
    }
    expect(plainGray).toBe(39);
    expect(counts("iso-luminant")).toEqual([50, 4]);
  }, 120000);

  it("reads the contrast of saturation off the dense floor, not a rendered proxy", () => {
    const c = term("saturation contrast");
    let proxyOnly = 0;
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      // ...and the chroma valley band-limited to the gray scale (QA round 5):
      // a black and a white have no chroma either and neither is a DULLED
      // colour, which is what Itten 6 is about. Same band `fade to gray` takes.
      expect(c.test(f, ctx)).toBe(
        f.denseChromaRange >= 0.15 &&
          f.denseMinChroma < 0.04 &&
          f.chromaValleyL >= NEAR_BLACK_L &&
          f.chromaValleyL <= NEAR_WHITE_L,
      );
      // The old proxy mixed a rendered max with a dense range and therefore sat
      // at or below the true floor. These are the palettes it used to admit
      // whose run never comes near gray.
      // Isolated from the round-5 gray band, so this counts the PROXY's own
      // admissions and not the ones the band removed.
      const proxy =
        f.denseChromaRange >= 0.15 &&
        f.maxChroma - f.denseChromaRange < 0.04 &&
        f.chromaValleyL >= NEAR_BLACK_L &&
        f.chromaValleyL <= NEAR_WHITE_L;
      if (proxy && !c.test(f, ctx)) proxyOnly++;
    }
    expect(proxyOnly).toBe(5);
    // 85 / 28 before the gray band; the 45 it removes are the palettes whose
    // chroma valley is a black (12 of the 28 strong) or a white (8 more).
    expect(counts("saturation contrast")).toEqual([40, 8]);
  }, 120000);

  it("gives extension contrast a small mass at least as loud as its field", () => {
    const c = term("extension contrast");
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      if (!c.test(f, ctx)) continue;
      expect(f.hueClusters).toBeGreaterThanOrEqual(2);
      const minor = f.clusterShares.indexOf(Math.min(...f.clusterShares));
      const major = f.clusterShares.indexOf(Math.max(...f.clusterShares));
      // Area is extent along t, and t is what the dense sample is uniform in.
      expect(f.clusterShares[minor]).toBeLessThanOrEqual(0.2);
      expect(f.clusterChromas[minor]).toBeGreaterThanOrEqual(f.clusterChromas[major]);
      // ...and the accent is a COLOUR, not the black end of the ramp read as
      // one (QA round 4): the row's only fixture witness was a near-black-to-
      // olive neutral ramp whose "accent" was stop 0 at L 0.075.
      expect(f.clusterLightnesses[minor]).toBeGreaterThanOrEqual(NEAR_BLACK_L);
      if (c.strong(f, ctx)) {
        expect(f.clusterShares[minor]).toBeLessThanOrEqual(0.1);
        expect(f.clusterChromas[minor]).toBeGreaterThanOrEqual(f.clusterChromas[major] + 0.02);
      }
    }
    // 3 palettes are true of it and NONE is prominent — D24.1's boundary case,
    // stated as a measurement: this corpus has no dramatic accent in it (the
    // loudest is a dark-teal field with a coral end, 0.088 against 0.076).
    expect(counts("extension contrast")).toEqual([3, 0]);
  }, 120000);

  it("wants an arc and a coloured accent before it says accented analogous", () => {
    const c = term("accented analogous");
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      if (!c.test(f, ctx)) continue;
      expect(f.hueClusters).toBe(2);
      const minor = f.clusterShares.indexOf(Math.min(...f.clusterShares));
      const field = f.clusterWidths[f.clusterShares.indexOf(Math.max(...f.clusterShares))];
      // The FIELD is an analogous arc — the repo's own boundary between one hue
      // and an arc — and the accent is a colour, not a hue angle on a gray.
      expect(field).toBeGreaterThanOrEqual(THRESHOLDS.MONOCHROME_SPAN);
      expect(field).toBeLessThan(THRESHOLDS.ANALOGOUS_SPAN);
      expect(f.clusterShares[minor]).toBeLessThanOrEqual(0.2);
      expect(f.clusterChromas[minor]).toBeGreaterThanOrEqual(THRESHOLDS.CHROMA_FLOOR);
      // ...and VISIBLE, which chroma alone cannot say at the black point: three
      // palettes were chipped on an accent whose cluster sits at L 0.063-0.152,
      // i.e. on the dark end of their own ramp (QA round 4).
      expect(f.clusterLightnesses[minor]).toBeGreaterThanOrEqual(NEAR_BLACK_L);
      if (c.strong(f, ctx)) expect(f.clusterShares[minor]).toBeLessThanOrEqual(0.1);
    }
    expect(counts("accented analogous")).toEqual([27, 13]);
  }, 120000);

  it("keeps the umbrella, the ratio and the verdict off the chip row", () => {
    // Three terms that are true, filterable and deliberately unreachable as
    // chips: the residual synonym (D24.3), a fact about text on the palette
    // (D25.2), and an aesthetic verdict about somebody's saved palette.
    for (const name of ["polychromatic", "wcag-aaa", "discord"])
      expect(term(name).strongPrevalence, name).toBe(0);
    const poly = term("polychromatic");
    const aaa = term("wcag-aaa");
    let aaaCount = 0;
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      expect(poly.test(f, ctx)).toBe(ctx.structure === "multicolor" || ctx.structure === "rainbow");
      expect(aaa.test(f, ctx)).toBe(f.contrastRatio >= 7);
      // AAA is a strictly stronger ratio than AA, so it can never be the only
      // one of the two that fires.
      if (aaa.test(f, ctx)) {
        expect(f.contrastRatio).toBeGreaterThanOrEqual(4.5);
        aaaCount++;
      }
    }
    expect(aaaCount).toBe(199);
  }, 120000);

  it("ships no second name for a row the table already carries (D25.3)", () => {
    // Computable synonyms, deliberately absent: Itten 2 is `high-contrast` /
    // `low-contrast` (the painter's "value contrast" is the same measurement),
    // Itten 4 IS `complementary`, the inventory's `achromatic` and
    // `monochromatic` are this repo's `grayscale` and `monochrome`, and WCAG's
    // large-text ratio (CR ≥ 3) is true of 59.9% of the fixture, which is no
    // information at all.
    const terms = new Set(CHARACTERISTICS.map((c) => c.term));
    for (const absent of [
      "value contrast",
      "complementary contrast",
      "achromatic",
      "monochromatic",
      "wcag-aa-large",
      "harmony",
    ])
      expect(terms.has(absent), absent).toBe(false);
    for (const present of ["high-contrast", "low-contrast", "complementary", "grayscale", "monochrome"])
      expect(terms.has(present), present).toBe(true);
  });
});

// =============================================================================
// QA ROUND 5 (2026-08-19): the rules the round added, each asserted against the
// palette it was filed on and against the fixture.
// =============================================================================
describe("QA round 5", () => {
  const term = (name) => {
    const c = CHARACTERISTICS.find((x) => x.term === name);
    expect(c, name).toBeTruthy();
    return c;
  };
  const counts = (name) => {
    const c = term(name);
    let plain = 0;
    let strong = 0;
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      if (!c.test(f, ctx)) continue;
      plain++;
      if (!c.strong || c.strong(f, ctx)) strong++;
    }
    return [plain, strong];
  };

  it("keeps `spectral order` off the walks that spend themselves on the line of purples", () => {
    // The sRGB gamut boundary is R->G through yellow, G->B through cyan and
    // B->R through MAGENTA; only the third is non-spectral, and no scalar in
    // `hueConsistency` can tell which way a monotone walk went. The filed
    // palette walks 264 273 287 ... 358 6 14 ... 109 — navy into gold, round the
    // back — and printed `spectral order` beside six colour chips.
    //
    // QA round 6 replaced CONTAINMENT of the whole edge with the SHARE of the
    // walk that lies on it, because containment only catches the extreme case:
    // a walk can spend half of itself on the non-spectral edge without
    // containing all of it, and one did (arc [-61.1, 118.9], 90.3 of 180.0
    // degrees, last four stops mauve/magenta/purple/violet). The bar is the
    // edge's own share of the wheel, so a walk is refused exactly when it is
    // OVER-REPRESENTED there.
    const c = term("spectral order");
    let crossed = 0;
    let contained = 0;
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      const share = purpleLineShare(f);
      if (share >= PURPLE_LINE_MAX_SHARE) {
        crossed++;
        expect(c.test(f, ctx), seed).toBe(false);
      }
      // ...and containment now implies refusal only for a walk shorter than a
      // full turn. Five fixture palettes contain the whole edge and keep the
      // word, and all five walk 361 to 440 degrees: a run that goes right round
      // the wheel visits the purples in proportion like everything else, which
      // is the case the share rule exists to tell apart from the filed one.
      const width = (29.2 - 264.1 + 360) % 360;
      let contains = false;
      for (let a = 264.1 + 360 * Math.floor((f.hueArcMin - 264.1) / 360); a <= f.hueArcMax; a += 360)
        if (a >= f.hueArcMin && a + width <= f.hueArcMax) contains = true;
      if (contains) {
        contained++;
        if (c.test(f, ctx)) expect(f.hueArcMax - f.hueArcMin, seed).toBeGreaterThan(360);
      }
    }
    expect(contained).toBe(55);
    // 347 fixture palettes spend more of the walk on the purple line than the
    // line is wide; 114 of them were inside the term's other conjuncts, which
    // is the 229 -> 115 move.
    // 346 since 2026-08-19, not 347. This counter recomputes the purple-line
    // rule WITHOUT the module's tie-break (PURPLE_LINE_TIE), and two fixture
    // palettes sit within a float bit of the bar — the shipped rate flipped
    // between identical runs until the module pinned ties to the bar. The
    // predicate did not change; this diagnostic simply counts the boundary
    // palette on the other side from the term, which is the honest reading of
    // a recomputation that does not share the tie-break.
    expect(crossed).toBe(346);
    expect(counts("spectral order")).toEqual([115, 36]);
  }, 120000);

  it("asks a scheme's hue groups for more than one swatch each", () => {
    // The corpus's genuine triad reads 3 / 2 / 2 swatches; the sweep that was
    // firing `tetradic` read 3 / 1 / 2 / 1, because single-linkage on seven
    // samples of a 300-degree ramp finds a "gap" between most neighbours.
    const sweep = [
      "#00007f", "#0d0000", "#c80000", "#ff3e00", "#ffda92", "#5effff", "#00d1f0",
    ];
    const triad = [
      "#d0555d", "#5b60cf", "#5bcf55", "#d05562", "#5b60cf", "#5bcf51", "#d05566",
    ];
    const factsOf = (hexes) => {
      const f = { ...caseFor(PROSE_SEEDS[0]).f, hueClusters: 1, maxClusterWidth: 999 };
      return [f, characteristicCtx(f, hexes)];
    };
    expect(term("tetradic").test(...factsOf(sweep))).toBe(false);
    expect(term("triadic").test(...factsOf(triad))).toBe(true);
  });

  it("says `flat spot` of a plateau, never of a palette that is flat all through", () => {
    const c = term("flat spot");
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      // The run has to hold still for a sixth of the ramp AND the rest of the
      // ramp has to get a corpus radius away from it.
      expect(c.test(f, ctx), seed).toBe(f.flatRunShare >= 1 / 6 && f.flatRunContrast >= 0.08);
      if (c.test(f, ctx)) expect(f.flatRunContrast, seed).toBeGreaterThanOrEqual(0.08);
    }
    // 183 palettes clear the run alone; 9 of them are one colour end to end.
    expect(counts("flat spot")).toEqual([174, 26]);
  }, 120000);

  it("spends at most two chips on one IMPRESSION, across the axes", () => {
    // The axis quota is per inventory DOMAIN, and a reader does not read by
    // domain: `near-white sunset | fade to white | wash | light` passes it and
    // is four ways of saying pale. See IMPRESSION_GROUPS.
    const of = new Map(
      IMPRESSION_GROUPS.flatMap((g) => g.terms.map((t) => [t, g.impression])),
    );
    // Every grouped term is a real entry. Tag-only members are allowed and are
    // skipped by the cap below: since 2026-08-19 the per-stop value bands
    // (near-black, near-white, the three containment bands) are tag-only, so
    // they cannot take a chip slot from the impression they belong to — but
    // they stay listed here because the GROUPING is still true of them, and
    // dropping them would lose the record of what says the same thing.
    for (const [t] of of) {
      const c = CHARACTERISTICS.find((x) => x.term === t);
      expect(c, t).toBeTruthy();
    }
    let bound = 0;
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      const spent = new Map();
      for (const c of chipCharacteristics(f, ctx)) {
        const i = of.get(c.term);
        if (!i) continue;
        spent.set(i, (spent.get(i) ?? 0) + 1);
      }
      for (const [i, n] of spent) {
        expect(n, `${seed}/${i}`).toBeLessThanOrEqual(IMPRESSION_CHIPS);
        if (n === IMPRESSION_CHIPS) bound++;
      }
    }
    // It binds on 82 rows of the fixture, so it is a rule and not decoration.
    // (100 before QA round 6, which took the rare terms off the chip pool and
    // let the next impression member up into the slots they had held; 112 after
    // it, then 82 once the per-stop value bands went tag-only on 2026-08-19 —
    // near-black and near-white were the pale/dark impressions' second member
    // on 30 rows, and with them gone those rows no longer reach the cap.)
    expect(bound).toBe(82);
  }, 120000);
});

describe("QA round 6", () => {
  const term = (t) => {
    const c = CHARACTERISTICS.find((x) => x.term === t);
    expect(c, `${t} is missing from the registry`).toBeTruthy();
    return c;
  };

  it("keeps a term off the chips when its page cannot be filled (D25.6)", () => {
    // THE CRITICAL FINDING. `/palettes/{term}` shows 24 results drawn from a
    // pool the retrieval layer hands us, and `applyTagFilter` ranks the
    // matching palettes to the top of that pool — so page 1 can hold no more
    // matching palettes than the CORPUS contains. Measured through the real
    // path against a production-size pool: `shades` (1 of 867) returned 1 match
    // in 24, `sepia` (9) returned 3, `warm gray` (9) returned 1, `tints` (21)
    // returned 1. Neither the filter nor the predicate is at fault; there is
    // nothing else to put on the page.
    const held = CHARACTERISTICS.filter((c) => !c.tagOnly && c.prevalence < CHIP_SUPPORT_FLOOR);
    expect(held.map((c) => c.term).sort()).toEqual([
      "brilliant",
      "cool gray",
      "discord",
      "duotone gradient",
      "extension contrast",
      "fade to black",
      "fade to gray",
      "fade to white",
      "grayscale",
      "mustard",
      "repeating",
      "sepia",
      "shades",
      "solid",
      "split complementary",
      "square",
      "tetradic",
      "tints",
      "tones",
      "triadic",
      "warm gray",
    ]);
    // (Three fewer since 2026-08-19: pure-black-plateau, pure-white-plateau and
    // shadow band became tag-only, so the support floor no longer has to hold
    // their links back — they have no link to hold.)
    // ...and every one of them is still a FACT: measured, published in the
    // tags, and reachable by URL. The floor takes the link, not the term.
    for (const c of held) expect(c.prevalence * 867, c.term).toBeLessThan(24);
    // The bar is one page, and it is the `test` rate that decides it because
    // `test` is what the destination filters on.
    expect(CHIP_SUPPORT_FLOOR).toBe(TAG_PAGE_SIZE / FIXTURE_SEEDS);
    // No chip-eligible term is under it, on any palette in the fixture.
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      for (const c of chipCharacteristics(f, ctx))
        expect(c.prevalence, `${seed}: ${c.term}`).toBeGreaterThanOrEqual(CHIP_SUPPORT_FLOOR);
    }
  }, 120000);

  it("gives the relative-saturation band its own term, disjoint from `muted`", () => {
    // `muted` is an ABSOLUTE claim and D19 is right that loudness questions take
    // absolute chroma — but at mid lightness a palette can sit well above
    // MUTED_CHROMA and still be using under half the chroma its own lightness
    // allows, and that palette looks greyed. 85 fixture palettes are in that
    // band and 75 of them carried no chroma-axis chip at all.
    const dusty = term("dusty");
    const muted = term("muted");
    let both = 0;
    let n = 0;
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      const isDusty = dusty.test(f, ctx);
      // The predicate, restated: colour present above the absolute bar, and
      // under half the chroma the run's own lightness allows.
      expect(isDusty, seed).toBe(f.meanChroma >= 0.055 && f.denseMeanSaturation < 0.5);
      if (isDusty) n++;
      if (isDusty && muted.test(f, ctx)) both++;
      // The margin is the next tenth, and it implies the term.
      if (dusty.strong(f, ctx)) expect(isDusty, seed).toBe(true);
    }
    // Disjoint by construction — the floor IS MUTED_CHROMA — and by measurement.
    expect(both).toBe(0);
    expect(n).toBe(85);
  }, 120000);

  it("asks a rainbow for a red or an orange it can see", () => {
    // The two pole windows read `hueHistogram`, whose samples qualify at
    // CHROMA_FLOOR, so an arc can be "warm" while every warm sample in it is a
    // tan or an olive. The filed palette renders blue, violet, mauve, tan,
    // olive, yellow-green — warm mass 0.35 by the chroma floor and ZERO at
    // FAMILY_CHROMA across the whole red-orange band.
    const rainbow = term("rainbow");
    let refused = 0;
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      if (!rainbow.test(f, ctx)) continue;
      const nameable = vividHueBandShare(f, 358.5, 81.5) > 0;
      if (!nameable) {
        refused++;
        expect(rainbow.strong(f, ctx), seed).toBe(false);
      }
      // The nameable histogram is a subset of the chromatic one, everywhere.
      for (let lo = 0; lo < 360; lo += 30)
        expect(vividHueBandShare(f, lo, lo + 30), `${seed}@${lo}`).toBeLessThanOrEqual(
          hueBandShare(f, lo, lo + 30) + 1e-12,
        );
    }
    // 18 of the 75 structure-rainbows hold no nameable red or orange AND clear
    // the other three conjuncts far enough to be tested here; 3 of them were
    // inside the margin, and they are the three the visual QA called crossfades
    // rather than spectra.
    expect(refused).toBe(18);
  }, 120000);
});
