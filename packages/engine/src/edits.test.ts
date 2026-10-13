import { describe, expect, test } from "vitest";
import { golden, lcg } from "../test/support.ts";
import { canonical, decodePalette, encodePalette } from "./codec.ts";
import { deltaE } from "./color.ts";
import { sampleLCH } from "./curve.ts";
import {
  addKeyframe,
  anchorHueWalls,
  HUE_WHEEL_MAX,
  hueTravel,
  hueTravelLimits,
  invert,
  invertAnchors,
  type Lock,
  lockedWhole,
  nudgeAnchors,
  randomizeLocked,
  removeKeyframes,
  resampleK,
  reverse,
  reverseAnchors,
  rotateHue,
  scaleChroma,
  setAnchorHueWheel,
  setHueTravel,
  setLightnessEnds,
  setSpanTravel,
  shiftLightness,
  spanTravel,
  spanTravelLimits,
  straightenL
} from "./edits.ts";
import { DEG } from "./math.ts";
import { DH_STEP, type Palette } from "./palette.ts";
import { randomPalette } from "./random.ts";

interface Op {
  seed: string;
  [key: string]: unknown;
}
const fixture = golden<{
  ops: Op[];
  randomDraws: {
    keepK: { lcgSeed: number; seeds: string[] };
    free: { lcgSeed: number; seeds: string[] };
  };
}>("ops");
const { palettes } = golden<{ palettes: { group: string; seed: string }[] }>("palettes");
const seed = (P: Palette) => encodePalette(P);
const hueNear = (a: number, b: number, eps: number) => {
  const d = a - b;
  return Math.abs(d - 360 * Math.round(d / 360)) <= eps;
};

test("every edit gives the seed it gave before", () => {
  for (const o of fixture.ops) {
    const P = decodePalette(o.seed) as Palette;
    const K = P.anchors.length;
    const all = P.anchors.map((_, i) => i);
    const T = (o.setHueTravel as { T: number }).T;
    const sel = all.filter(i => i % 2 === 0);
    expect({
      seed: o.seed,
      reverse: seed(reverse(P)),
      invert: seed(invert(P)),
      rotate137: seed(rotateHue(P, 137)),
      rotate360: seed(rotateHue(P, 360)),
      scaleChromaHalf: seed(scaleChroma(P, 0.5)),
      scaleChroma2: seed(scaleChroma(P, 2)),
      shiftLightness01: seed(shiftLightness(P, 0.1)),
      setLightnessEnds: seed(setLightnessEnds(P, 0.9, 0.2)),
      setLightnessEndsRaw: setLightnessEnds(P, 0.9, 0.2).anchors.map(a => a.l),
      hueTravelLimits: hueTravelLimits(P),
      setHueTravel: {
        T,
        seed: seed(setHueTravel(P, T)),
        hues: setHueTravel(P, T).anchors.map(a => a.h)
      },
      spanTravelLimits01: spanTravelLimits(P, 0, 1),
      setSpanTravel01: setSpanTravel(P, 0, 1, 123).anchors.map(a => a.h),
      straighten: seed(straightenL(P, 0, K - 1)),
      nudge: seed(nudgeAnchors(P, [0], { dl: 0.05, dc: 0.02, dh: 30 })),
      nudgeAll: seed(nudgeAnchors(P, all, { dh: 77 })),
      reverseSel: { sel, seed: seed(reverseAnchors(P, sel)) },
      invertSel: { sel, seed: seed(invertAnchors(P, sel)) },
      resampleUp: K < 8 ? seed(resampleK(P, K + 1)) : null,
      resampleDown: K > 2 ? seed(resampleK(P, K - 1)) : null,
      hueWheel200: seed(setAnchorHueWheel(P, 0, 200)),
      hueWheelMax: seed(setAnchorHueWheel(P, K - 1, HUE_WHEEL_MAX)),
      walls1: anchorHueWalls(P, 1),
      randomizeLockedLC: seed(randomizeLocked(P, [0], ["l", "c"], lcg(7 + K))),
      randomizeLockedNone: seed(randomizeLocked(P, [], [], lcg(11 + K))),
      /* a hold with everything locked rolls as Random has always rolled a hold */
      randomizeAnchors: seed(randomizeLocked(P, [0], ["l", "c", "h"], lcg(13 + K))),
      lockedWhole: [
        lockedWhole(["l", "c", "h"], false),
        lockedWhole(["l", "c", "h"], true),
        lockedWhole(["l", "c"], false)
      ]
    }).toEqual(o);
  }
});

describe("the generator", () => {
  test("draws the same palettes from the same rand, in the same order", () => {
    const keep = lcg(fixture.randomDraws.keepK.lcgSeed);
    expect(
      fixture.randomDraws.keepK.seeds.map((_, i) => seed(randomPalette(keep, 2 + (i % 7))))
    ).toEqual(fixture.randomDraws.keepK.seeds);
    const free = lcg(fixture.randomDraws.free.lcgSeed);
    expect(fixture.randomDraws.free.seeds.map(() => seed(randomPalette(free)))).toEqual(
      fixture.randomDraws.free.seeds
    );
    const generated = lcg(20260830);
    for (let k = 2; k <= 8; k++) {
      const want = palettes.filter(p => p.group === `generated-k${k}`).map(p => p.seed);
      expect(want.map(() => seed(randomPalette(generated, k)))).toEqual(want);
    }
  });
  test("draws structurally varied palettes, both ways in hue and in lightness", () => {
    /* the curve as OKLab at 16 even t: nearby gradients land nearby */
    const embed = (P: Palette) =>
      Array.from({ length: 16 }, (_, i) => {
        const [L, C, H] = sampleLCH(P, i / 15);
        return [L, C * Math.cos(H * DEG), C * Math.sin(H * DEG)];
      }).flat();
    const rand = lcg(20260830);
    const drawn = Array.from({ length: 120 }, (_, i) => randomPalette(rand, 2 + (i % 7)));
    expect(new Set(drawn.map(seed)).size).toBe(120);
    const points = drawn.map(embed);
    const nearest = points.map((p, i) =>
      Math.min(
        ...points.map((q, j) => (i === j ? Infinity : Math.hypot(...p.map((v, k) => v - q[k]))))
      )
    );
    expect(nearest.reduce((a, b) => a + b, 0) / nearest.length).toBeGreaterThanOrEqual(0.35);
    const travel = drawn.map(hueTravel);
    expect(travel.filter(t => t < -1).length / 120).toBeGreaterThanOrEqual(0.25);
    expect(travel.filter(t => t > 1).length / 120).toBeGreaterThanOrEqual(0.25);
    const down =
      drawn.filter(P => P.anchors[P.anchors.length - 1].l < P.anchors[0].l - 0.01).length / 120;
    expect(down).toBeGreaterThanOrEqual(0.2);
    expect(down).toBeLessThanOrEqual(0.85);
  });
});

describe("hue", () => {
  test("a wheel write never winds a lap, and the top of the wheel never ratchets a turn", () => {
    const rand = lcg(3);
    for (let t = 0; t < 200; t++) {
      let P = canonical(randomPalette(rand));
      const i = Math.floor(rand() * P.anchors.length);
      const steps = (Q: Palette) => Q.anchors.map((a, j) => (j ? a.h - Q.anchors[j - 1].h : 0));
      const before = steps(P);
      steps(setAnchorHueWheel(P, i, rand() * HUE_WHEEL_MAX)).forEach((d, j) => {
        expect(Math.abs(d - before[j])).toBeLessThan(360);
      });
      const turn = Math.floor(P.anchors[i].h / 360);
      for (let n = 0; n < 12; n++) P = canonical(setAnchorHueWheel(P, i, HUE_WHEEL_MAX));
      expect(Math.floor(P.anchors[i].h / 360)).toBe(turn);
    }
  });
  test("travel lands where asked with the first hue held; nudging every hue is a rotation", () => {
    const rand = lcg(4);
    for (let t = 0; t < 100; t++) {
      const P = randomPalette(rand);
      const limits = hueTravelLimits(P);
      const ask = limits.lo + rand() * (limits.hi - limits.lo);
      const Q = setHueTravel(P, ask);
      expect(hueTravel(Q)).toBeCloseTo(ask, 6);
      expect(Q.anchors[0].h).toBe(P.anchors[0].h);
      expect(
        seed(
          canonical(
            nudgeAnchors(
              P,
              P.anchors.map((_, i) => i),
              { dh: 77 }
            )
          )
        )
      ).toBe(seed(canonical(rotateHue(P, 77))));
    }
  });
  test("span travel moves nothing outside the span and the seam stays inside the wall", () => {
    const rand = lcg(5);
    for (let t = 0; t < 200; t++) {
      const P = randomPalette(rand);
      const K = P.anchors.length;
      const a = Math.floor(rand() * (K - 1));
      const b = a + 1 + Math.floor(rand() * (K - 1 - a));
      const limits = spanTravelLimits(P, a, b);
      const Q = setSpanTravel(P, a, b, limits.lo + rand() * (limits.hi - limits.lo));
      Q.anchors.forEach((x, j) => {
        if (j <= a || j > b) expect(x.h).toBe(P.anchors[j].h);
        if (j) expect(Math.abs(x.h - Q.anchors[j - 1].h)).toBeLessThanOrEqual(540 + 1e-6);
      });
      expect(spanTravel(setSpanTravel(P, a, b, limits.hi + 5000), a, b)).toBeCloseTo(limits.hi, 6);
    }
  });
});

test("Random keeps what is locked on the keyframes it speaks for, held hues within half a code", () => {
  const roll = lcg(20261012);
  const combos: Lock[][] = [
    [],
    ["l"],
    ["c"],
    ["h"],
    ["l", "c"],
    ["l", "h"],
    ["c", "h"],
    ["l", "c", "h"]
  ];
  for (let t = 0; t < 400; t++) {
    const P = canonical(randomPalette(roll));
    const K = P.anchors.length;
    const locks = combos[t % combos.length];
    const kind = Math.floor(roll() * 3);
    const held =
      kind === 0
        ? []
        : kind === 2
          ? P.anchors.map((_, i) => i)
          : P.anchors.map((_, i) => i).filter(() => roll() < 0.4);
    if (kind === 1 && (held.length === 0 || held.length === K)) continue;
    const partial = held.length > 0 && held.length < K;
    const B = canonical(randomizeLocked(P, held, locks, roll)).anchors;
    for (const i of partial ? held : P.anchors.map((_, j) => j)) {
      if (locks.includes("l")) expect(B[i].l).toBe(P.anchors[i].l);
      if (locks.includes("c")) expect(B[i].c).toBe(P.anchors[i].c);
      if (locks.includes("h"))
        expect(hueNear(B[i].h, P.anchors[i].h, partial ? DH_STEP / 2 + 1e-6 : 0)).toBe(true);
    }
    B.forEach((x, j) => {
      if (j) expect(Math.abs(x.h - B[j - 1].h)).toBeLessThanOrEqual(540 + 1e-6);
    });
    if (lockedWhole(locks, partial)) expect(seed(canonical({ anchors: B }))).toBe(seed(P));
  }
});

test("scoped reverse and invert move the selection and hold the rest; all selected is the plain edit", () => {
  const rand = lcg(6);
  for (let t = 0; t < 100; t++) {
    const P = canonical(randomPalette(rand));
    const K = P.anchors.length;
    const sel = P.anchors.map((_, i) => i).filter(() => rand() < 0.5);
    if (K < 3 || sel.length < 2 || sel.length >= K) continue;
    const Q = canonical(reverseAnchors(P, sel));
    sel.forEach((slot, i) => {
      const from = P.anchors[sel[sel.length - 1 - i]];
      expect([Q.anchors[slot].l, Q.anchors[slot].c]).toEqual([from.l, from.c]);
      expect(hueNear(Q.anchors[slot].h, from.h, 1.1)).toBe(true);
    });
    const V = canonical(invertAnchors(P, sel));
    for (const i of sel) expect(hueNear(V.anchors[i].h, P.anchors[i].h + 180, 1.1)).toBe(true);
    P.anchors.forEach((a, i) => {
      if (sel.includes(i)) return;
      expect([Q.anchors[i].l, Q.anchors[i].c, V.anchors[i].l, V.anchors[i].c]).toEqual([
        a.l,
        a.c,
        a.l,
        a.c
      ]);
    });
  }
  const P = canonical(randomPalette(rand));
  const all = P.anchors.map((_, i) => i);
  expect(seed(canonical(reverseAnchors(P, all)))).toBe(seed(canonical(reverse(P))));
  expect(seed(canonical(invertAnchors(P, all)))).toBe(seed(canonical(invert(P))));
});

test("straighten puts the interior on the line and holds everything else", () => {
  const P = { anchors: [0.2, 0.9, 0.1, 0.6].map((l, i) => ({ l, c: 0.1, h: i * 40 })) };
  const Q = straightenL(P, 0, 3);
  [0.2, 0.2 + 0.4 / 3, 0.2 + 0.8 / 3, 0.6].forEach((l, i) => {
    expect(Q.anchors[i].l).toBeCloseTo(l, 12);
  });
  expect(Q.anchors.map(a => [a.c, a.h])).toEqual(P.anchors.map(a => [a.c, a.h]));
  expect(straightenL(P, 1, 2)).toBe(P);
});

test("the lightness ends land and never fuse; a resample stays near the curve it re-expresses", () => {
  const F = {
    anchors: [
      { l: 0.6, c: 0.1, h: 20 },
      { l: 0.35, c: 0.15, h: 90 },
      { l: 0.6, c: 0.1, h: 160 }
    ]
  };
  setLightnessEnds(F, 0.6, 0.9).anchors.forEach((a, i) => {
    expect(a.l).toBeCloseTo([0.6, 0.5, 0.9][i], 12);
  });
  const rand = lcg(8);
  let worst = 0;
  for (let t = 0; t < 40; t++) {
    const P = randomPalette(rand);
    const Q = resampleK(P, Math.min(8, P.anchors.length + 1));
    for (let i = 0; i <= 32; i++)
      worst = Math.max(worst, deltaE(sampleLCH(P, i / 32), sampleLCH(Q, i / 32)));
  }
  expect(worst).toBeLessThan(0.15);
});

test("a keyframe is added by a resample and taken away without one, the hold following", () => {
  const P = decodePalette("kcgI_BPOBA0BgwZI1sK2LpDueoxrwLsS764_g") as Palette;
  const five = resampleK(P, 5);
  expect(addKeyframe(P, [])).toBeNull();
  expect(addKeyframe(five, [1, 2])).toEqual({ palette: resampleK(five, 6), held: [1, 2, 3] });
  expect(addKeyframe(five, [])?.held).toEqual([]);
  const dropped = removeKeyframes(five, [1, 3]);
  expect(dropped?.palette.anchors).toEqual([0, 2, 4].map(i => five.anchors[i]));
  expect(dropped?.held).toEqual([1]);
  expect(removeKeyframes(five, [])?.palette.anchors).toEqual(five.anchors.slice(0, 4));
  /* a hold can drop no more than the floor allows */
  expect(removeKeyframes(resampleK(P, 3), [0, 1])?.palette.anchors).toHaveLength(2);
  expect(removeKeyframes(resampleK(P, 2), [0])).toBeNull();
});
