// PACKAGE D-D: the GRADIENT (research-colorTheory §7) and APPEARANCE (§8) rows
// of the characteristic registry.
//
// The shared suite (palette-characteristics.test.js) re-measures every rate in
// the table and asserts the margin band sits inside its term. This file adds
// the half that a generic walk cannot do: for each term of this slice it
// recomputes the inventory's OWN test from the palette — dense samples, stop
// distances, coefficients — and asserts the registry fires on exactly the
// palettes that satisfy it. A predicate that quietly stopped reading the
// feature it claims to read would still pass a rate check; it cannot pass this.
import { describe, expect, it } from "vitest";
import { renderPalette } from "../src/palette.ts";
import { cosineGradient, rgbToHex } from "@repo/data-ops/gradient-gen/cosine";
import {
  hexToOkLch,
  hexToRgb,
  oklabDistance,
  relativeSaturation,
  rgbToOklab,
} from "@repo/data-ops/color-utils";
import {
  classifyStructure,
  paletteFeatures,
  stopHasHue,
} from "@repo/data-ops/gradient-gen/palette-modifiers";
import { analyzeCoefficients } from "@repo/data-ops/gradient-gen/palette-tags";
import {
  CHARACTERISTICS,
  characteristicCtx,
  maxAdjacentStep,
} from "@repo/data-ops/gradient-gen/palette-characteristics";
import { PROSE_SEEDS } from "./prose-corpus.js";

const DEFAULT_STEPS = 7;
const cases = new Map();
const caseFor = (seed, steps = DEFAULT_STEPS) => {
  const key = `${seed}@${steps}`;
  let c = cases.get(key);
  if (!c) {
    const view = renderPalette(seed, "linearGradient", steps, 90);
    const f = paletteFeatures(view.appliedCoeffs, view.hexColors);
    const journey = analyzeCoefficients(view.appliedCoeffs).journey;
    const ctx = characteristicCtx(f, view.hexColors, {
      journey: journey === "warming" || journey === "cooling" ? journey : null,
    });
    c = { view, f, ctx, colors: view.hexColors };
    cases.set(key, c);
  }
  return c;
};

const term = (name) => {
  const c = CHARACTERISTICS.find((x) => x.term === name);
  expect(c, `${name} is missing from the registry`).toBeTruthy();
  return c;
};

/** The 48-sample dense read, recomputed here rather than taken from features. */
const dense = (view) =>
  cosineGradient(48, view.appliedCoeffs).map(([r, g, b]) => {
    const hex = rgbToHex(r, g, b);
    return { hex, ...hexToOkLch(hex) };
  });

/**
 * Walk the fixture and assert the registry's answer equals an independently
 * computed one, for every seed. Returns the fire count so the caller can pin
 * the rate as well.
 */
const agreesWith = (name, truth, steps = DEFAULT_STEPS) => {
  const c = term(name);
  let fired = 0;
  let strong = 0;
  for (const seed of PROSE_SEEDS) {
    const k = caseFor(seed, steps);
    const expected = truth(k);
    expect(c.test(k.f, k.ctx), `${name} on ${seed}`).toBe(expected);
    if (!expected) continue;
    fired++;
    if (!c.strong || c.strong(k.f, k.ctx)) strong++;
  }
  return { c, fired, strong, n: PROSE_SEEDS.length };
};

const rate = (k) => Number((k.fired / k.n).toFixed(4));
const strongRate = (k) => Number((k.strong / k.n).toFixed(4));

describe("gradient vocabulary (research-colorTheory §7)", () => {
  it("`wash` is the longest pale, weak RUN — not a palette-wide mean", () => {
    // The inventory's test, with the one deviation QA round 4 measured: a
    // contiguous dense run with L > 0.8 and C < 0.06 spanning at least a
    // quarter of t, AND NOT AT THE WHITE CORNER. Both of the inventory's
    // thresholds are satisfied by a clipped #ffffff, so a ramp pinned white for
    // 44% of its length read as a wash beside its own `pure-white-plateau`;
    // a wash is a passage of colour watered down, and there is no colour in the
    // clamp. See paletteFeatures' pale-run walk.
    // ...and the second deviation, QA round 5: a PASSAGE needs something to be
    // a passage THROUGH. A uniformly pale blue-gray (every stop C 0.029-0.039
    // at L 0.760-0.891) measured a 0.688 pale run and chipped `wash` beside
    // `pastel monochrome` and `high-key` — three chips for "pale and weak" —
    // because the run length says nothing about the rest of the palette. So the
    // remainder has to be outside the wash window by a visible margin, in the
    // registry's own units: 0.05 in L or a JND of chroma.
    const k = agreesWith("wash", ({ view, f }) => {
      let best = 0;
      let cur = 0;
      for (const s of dense(view)) {
        const white = s.hex === "#ffffff";
        if (!white && s.L > 0.8 && s.C < 0.06) {
          cur++;
          if (cur > best) best = cur;
        } else cur = 0;
      }
      return best / 48 >= 0.25 && (f.denseMinLightness <= 0.75 || f.maxChroma >= 0.08);
    });
    expect(rate(k)).toBe(k.c.prevalence);
    expect(strongRate(k)).toBe(k.c.strongPrevalence);
    expect(k.fired).toBe(77);

    // ...and it is a run, so it finds passages no mean can see: 40 of the 98
    // are not high-key and 41 are not even light. If `wash` ever became a
    // palette-wide reading these two counts would collapse toward zero.
    let notHighKey = 0;
    let notLight = 0;
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      if (!k.c.test(f, ctx)) continue;
      if (!ctx.tags.includes("high-key")) notHighKey++;
      if (!ctx.tags.includes("light")) notLight++;
    }
    expect(notHighKey).toBe(40);
    expect(notLight).toBe(41);
  });

  it("the three fades read the END of the run, and each names what it ends in", () => {
    // ...and `fade to white` ends WHITE, not merely light (QA round 4): the
    // sibling below has always asked whether the end stop still has a colour
    // and this one did not, so 22 of its 27 strong fires ended on a cream, a
    // mint, a pale cyan or (at the limit) #fffe35. Absolute chroma, because
    // this is the end of the solid where the ceiling collapses and every
    // off-white measures as fully saturated — see whitePole.
    const white = agreesWith(
      "fade to white",
      ({ f, colors }) =>
        f.chromaTrend < -0.04 &&
        f.denseLastLightness > 0.87 &&
        hexToOkLch(colors[colors.length - 1]).C < 0.03,
    );
    expect(rate(white)).toBe(white.c.prevalence);
    expect(strongRate(white)).toBe(white.c.strongPrevalence);

    const gray = agreesWith("fade to gray", ({ f, colors }) => {
      const last = colors[colors.length - 1];
      return (
        f.chromaTrend < -0.04 &&
        !stopHasHue(last) &&
        f.denseLastLightness >= 0.18 &&
        f.denseLastLightness <= 0.87
      );
    });
    expect(rate(gray)).toBe(gray.c.prevalence);
    expect(strongRate(gray)).toBe(gray.c.strongPrevalence);

    const black = agreesWith(
      "fade to black",
      ({ f }) => f.lightnessDelta <= -0.34 && f.denseLastLightness < 0.18,
    );
    expect(rate(black)).toBe(black.c.prevalence);
    expect(strongRate(black)).toBe(black.c.strongPrevalence);

    // The three destinations are mutually exclusive by construction — white,
    // gray and black cannot all be where one run ends.
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      const hits = [white.c, gray.c, black.c].filter((c) => c.test(f, ctx));
      expect(hits.length, `${seed}: ${hits.map((c) => c.term).join(" + ")}`).toBeLessThan(2);
    }
  });

  it("`fade to gray` asks the IDENTITY question, so it reads saturation (D19)", () => {
    // The inventory's literal test is the last stop's absolute chroma under
    // 0.04. That fires on 39 palettes; the saturation reading fires on 15 (10
    // after the white/black bands are excluded). The 24 in between are pale
    // tints at 90%+ of the ceiling their lightness allows — plainly coloured,
    // and calling them gray is the exact D19 bug.
    const c = term("fade to gray");
    let absolute = 0;
    let relative = 0;
    const wrongIfAbsolute = [];
    for (const seed of PROSE_SEEDS) {
      const { f, colors, ctx } = caseFor(seed);
      const last = colors[colors.length - 1];
      const lch = hexToOkLch(last);
      if (f.chromaTrend < -0.04 && lch.C < 0.04) {
        absolute++;
        if (stopHasHue(last))
          wrongIfAbsolute.push({ seed, last, C: lch.C, S: relativeSaturation(lch) });
      }
      if (f.chromaTrend < -0.04 && !stopHasHue(last)) relative++;
      if (c.test(f, ctx)) expect(stopHasHue(last), `${seed} ends chromatic`).toBe(false);
    }
    expect(absolute).toBe(39);
    expect(relative).toBe(15);
    expect(wrongIfAbsolute.length).toBe(24);
    // Each of the 24 is kept out of "gray" by one of the two branches of the
    // repo's own hasUsableHue, and the split says which: 10 simply sit above
    // CHROMA_FLOOR (0.03 — the inventory's 0.04 is looser than the floor this
    // repo already uses), 9 are the D19 rescue proper (under the floor but at
    // 35%+ of the ceiling their lightness allows), and 5 clear both.
    const split = { floor: 0, rescued: 0, both: 0 };
    for (const w of wrongIfAbsolute) {
      const overFloor = w.C >= 0.03;
      const saturated = w.S >= 0.35;
      expect(overFloor || saturated, `${w.seed} ${w.last}`).toBe(true);
      if (overFloor && saturated) split.both++;
      else if (overFloor) split.floor++;
      else split.rescued++;
    }
    expect(split).toEqual({ floor: 10, rescued: 9, both: 5 });
  });

  it("`gradient map` demands the tonal coverage a value-indexed ramp needs", () => {
    const k = agreesWith(
      "gradient map",
      ({ f }) =>
        f.turns === 0 &&
        f.denseMinLightness <= 0.3 &&
        f.denseMaxLightness >= 0.7 &&
        f.allBlackShare < 0.1 &&
        f.allWhiteShare < 0.1,
    );
    expect(rate(k)).toBe(k.c.prevalence);
    expect(strongRate(k)).toBe(k.c.strongPrevalence);
    // Strictly stronger than the `ramp` it implies: every one is a ramp, and
    // only a seventh of the ramps qualify.
    let ramps = 0;
    let maps = 0;
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      if (ctx.tags.includes("ramp")) ramps++;
      if (!k.c.test(f, ctx)) continue;
      maps++;
      expect(ctx.tags, `${seed} is a gradient map but not a ramp`).toContain("ramp");
    }
    expect(ramps).toBe(508);
    expect(maps).toBe(77);
  });

  it("`duotone gradient` is the structure AND the shape, never one of them", () => {
    const k = agreesWith(
      "duotone gradient",
      ({ f, ctx }) => ctx.structure === "duotone" && f.turns === 0,
    );
    expect(rate(k)).toBe(k.c.prevalence);
    expect(strongRate(k)).toBe(k.c.strongPrevalence);
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      if (!k.c.test(f, ctx)) continue;
      expect(classifyStructure(f), seed).toBe("duotone");
      expect(f.turns, seed).toBe(0);
    }
  });

  it("`repeating` claims an exact repeat only where the frequencies agree", () => {
    const k = agreesWith(
      "repeating",
      ({ f }) => f.equalC && Math.min(...f.channelCycles) >= 1.5,
    );
    expect(rate(k)).toBe(k.c.prevalence);
    expect(strongRate(k)).toBe(k.c.strongPrevalence);
    // One seed in the fixture, and its coefficients are the licence: the cosine
    // sweeps |c| full periods over t, so equal |c| = 2 means the whole sequence
    // renders twice. Unequal frequencies are a Lissajous path with no exact
    // repeat and research-coeffMath G3 forbids the claim there.
    const firing = PROSE_SEEDS.filter((s) => {
      const { f, ctx } = caseFor(s);
      return k.c.test(f, ctx);
    });
    expect(firing).toEqual(["_gFGgFGgFGgEygEygEygPogPogPygAAgFagKhi2vo_QgA"]);
    const { f, colors } = caseFor(firing[0]);
    expect(f.equalC).toBe(true);
    for (const c of f.channelCycles) expect(c).toBeGreaterThanOrEqual(2);
    // ...and you can read the repeat straight off the stops.
    expect(colors[1].slice(0, 5)).toBe(colors[4].slice(0, 5));
  });

  it("`banding` and `smooth` are claims about the STEP COUNT, so neither can be a chip", () => {
    // The registry keeps them as tags by making `strong` unreachable. This is
    // the measurement that justifies it: one predicate, one fixture, five views.
    const banding = term("banding");
    const smooth = term("smooth");
    expect(banding.strongPrevalence).toBe(0);
    expect(smooth.strongPrevalence).toBe(0);
    const bySteps = {};
    for (const steps of [3, 5, 7, 13, 24]) {
      let b = 0;
      let s = 0;
      for (const seed of PROSE_SEEDS) {
        const k = caseFor(seed, steps);
        if (banding.test(k.f, k.ctx)) b++;
        if (smooth.test(k.f, k.ctx)) s++;
      }
      bySteps[steps] = [b, s];
    }
    expect(bySteps).toEqual({
      3: [736, 2],
      5: [480, 1],
      7: [240, 4],
      13: [55, 22],
      24: [15, 160],
    });
    // ...and the predicate really is the adjacent-stop distance, at whatever
    // step count the caller rendered.
    for (const seed of PROSE_SEEDS) {
      const k = caseFor(seed);
      const worst = maxAdjacentStep(k.colors);
      expect(k.ctx.adjacentStep).toBeCloseTo(worst, 12);
      expect(banding.test(k.f, k.ctx)).toBe(worst > 0.15);
      expect(smooth.test(k.f, k.ctx)).toBe(worst < 0.02);
      // maxAdjacentStep is the widest neighbour gap and nothing else.
      let manual = 0;
      for (let i = 1; i < k.colors.length; i++) {
        const a = hexToRgb(k.colors[i - 1]);
        const b = hexToRgb(k.colors[i]);
        manual = Math.max(
          manual,
          oklabDistance(rgbToOklab(a.r, a.g, a.b), rgbToOklab(b.r, b.g, b.b)),
        );
      }
      expect(worst).toBeCloseTo(manual, 12);
    }
  });

  it("the endpoint every fade reads is the dense t=1 sample at any step count", () => {
    // cosineGradient samples i/(steps-1), so both ends of the rendered view are
    // the ends of the dense run. This is why a "fades to white" claim does not
    // move when the visitor changes the step count.
    for (const seed of PROSE_SEEDS) {
      const { view, colors } = caseFor(seed);
      const d = cosineGradient(48, view.appliedCoeffs).map(([r, g, b]) => rgbToHex(r, g, b));
      expect(colors[0], seed).toBe(d[0]);
      expect(colors[colors.length - 1], seed).toBe(d[47]);
    }
  });
});

describe("appearance vocabulary (research-colorTheory §8)", () => {
  it("`luminous` is the H-K gate, and it is vivid that has not gone light", () => {
    const k = agreesWith(
      "luminous",
      ({ f }) => f.meanChroma >= 0.15 && f.meanLightness >= 0.45 && f.meanLightness <= 0.8,
    );
    expect(rate(k)).toBe(k.c.prevalence);
    expect(strongRate(k)).toBe(k.c.strongPrevalence);
    expect(k.fired).toBe(159);
    // Inside the 2-60% speaking band the inventory demands before the word may
    // be used at all, and every firing palette is `vivid` — which is what its
    // `implies` promises the display layer.
    expect(k.c.prevalence).toBeGreaterThan(0.02);
    expect(k.c.prevalence).toBeLessThan(0.6);
    const brilliant = term("brilliant");
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      if (!k.c.test(f, ctx)) continue;
      expect(ctx.tags, seed).toContain("vivid");
      // Shares its upper edge with `brilliant` (vivid AND light) and no fixture
      // palette sits exactly on it.
      expect(brilliant.test(f, ctx), `${seed} is both luminous and brilliant`).toBe(false);
    }
  });

  it("the two opponent axes tile the wheel, so they can never both fire", () => {
    const by = term("blue-yellow axis");
    const gr = term("green-red axis");
    let b = 0;
    let g = 0;
    for (const seed of PROSE_SEEDS) {
      const { f, ctx } = caseFor(seed);
      const hitB = by.test(f, ctx);
      const hitG = gr.test(f, ctx);
      expect(hitB && hitG, seed).toBe(false);
      if (hitB) b++;
      if (hitG) g++;
    }
    expect(b).toBe(231);
    expect(g).toBe(132);
  });
});

describe("what §7 and §8 deliberately do not ship (D25.3)", () => {
  it("keeps the vacuous, the view-only and the dropped rows out of the table", () => {
    const terms = CHARACTERISTICS.map((c) => c.term);
    // `gradient` and `blend` are true of all 867 by construction (the cosine is
    // C-infinity); `color stop`, `spacing` and `interpolation direction` are
    // facts about the view or the render angle; `easing` is the model itself;
    // `flat spots` and `hue turn` were measured and rejected — flat spots
    // because `clipped` already IS that predicate at that threshold, hue turn
    // because it carries under a bit. Each reason is recorded beside the
    // gradient block in palette-characteristics.ts.
    for (const banned of [
      "gradient",
      "blend",
      "color stop",
      "even spacing",
      "uneven spacing",
      "interpolation direction",
      "easing",
      "flat spots",
      "hue turn",
    ])
      expect(terms, banned).not.toContain(banned);
    // `clipped` is where "flat spots" lives, at the inventory's own threshold.
    expect(terms).toContain("clipped");
  });

  it("`smooth` never claims the FUNCTION is smooth — only the rendered view", () => {
    // Every palette here is a cosine and therefore infinitely smooth as a
    // function. The term fires on 4 of 867 at the default view, which is the
    // proof it is measuring the swatches and not the curve.
    const c = term("smooth");
    expect(c.prevalence).toBe(0.0046);
    expect(c.note).toMatch(/cosine always is/);
  });
});
