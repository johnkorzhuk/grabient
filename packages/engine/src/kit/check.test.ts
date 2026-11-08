/* The gate a candidate passes before anyone looks at it (test/kit-check.ts) fails it where the suites would: its
   quicker checks pass the demo, and each fails the demo turned wrong its way: a kernel past the budget or outside the
   subset, a design number not kitRound's, a kernel that divides by the distance across an axis, a loop that jumps at
   its end, motion that draws one picture twice in a loop, and levels closer than a pixel. Its SVG checks, 6 and 7,
   measure as svg.test.ts and effect-conformance.test.ts do. */
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  crowdingCheck,
  designCheck,
  finiteCheck,
  kernelCheck,
  loopCheck,
  movesCheck
} from "../../test/kit-check.ts";
import { decodePalette } from "../codec.ts";
import demo from "./fields/demo.ts";
import type { FieldEffect } from "./types.ts";

const P = decodePalette("kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ")!;
const SOURCE = readFileSync(new URL("./fields/demo.ts", import.meta.url), "utf8");
const sheets = demo.sheets!;

it("passes the demo", () => {
  for (const found of [
    kernelCheck(demo, SOURCE),
    designCheck(demo),
    finiteCheck(demo, P),
    loopCheck(demo, P),
    movesCheck(demo, P),
    crowdingCheck(demo, P)
  ])
    expect(found.pass, found.says).toBe(true);
});

it("fails a kernel past the budget, and throws, naming the line, at one outside the subset", () => {
  const costly = kernelCheck(
    { ...demo, uniforms: { shear: 8, wave: 200 }, tracks: 52 },
    SOURCE.replace("const WAVES = 5;", "const WAVES = 50;")
  );
  expect(costly).toMatchObject({ pass: false, numbers: { cost: 2 * 18 + 1 + 50 * 15 } });
  expect(() =>
    kernelCheck(demo, SOURCE.replace("Math.sin(s)", "Math.round(s)"), "kit/fields/demo.ts")
  ).toThrow(/^kit\/fields\/demo\.ts:\d+:\d+: Math\.round is not in the kernel subset/);
});

it("fails a design whose numbers every format would not write alike", () => {
  const loose: FieldEffect = {
    ...demo,
    design: seed => {
      const d = demo.design(seed);
      return { ...d, U: { ...d.U, shear: d.U.shear.map((v, i) => (i ? v : v + 1e-7)) } };
    }
  };
  expect(designCheck(loose)).toMatchObject({
    pass: false,
    says: expect.stringMatching(/shear\[0\] .* not kitRound's/)
  });
});

it("fails a kernel that is not finite where a box shows it", () => {
  const pole: FieldEffect = { ...demo, field: (x, y, U, F) => demo.field(x, y, U, F) + 0.01 / x };
  expect(finiteCheck(pole, P).pass).toBe(false);
});

it("fails a loop that jumps at its end, where a track makes a cycle and a half", () => {
  const half: FieldEffect = {
    ...demo,
    design: seed => {
      const d = demo.design(seed);
      return { ...d, tracks: d.tracks.map((v, i) => (i ? v : { ...v, cycles: 1.5 })) };
    }
  };
  expect(loopCheck(half, P)).toMatchObject({
    pass: false,
    says: expect.stringMatching(/^it jumps at its end: angle 90, shape 0: a mean of /)
  });
  expect(designCheck(half)).toMatchObject({
    pass: false,
    says: expect.stringMatching(/tracks\[0\] makes 1\.5 cycles/)
  });
});

it("fails motion symmetric about the half loop, which draws one picture twice", () => {
  const even: FieldEffect = {
    ...demo,
    design: seed => {
      const d = demo.design(seed);
      return { ...d, tracks: d.tracks.map(v => ({ ...v, cycles: 2 })) };
    },
    sheets: { ...sheets, shadow: { ...sheets.shadow!, swing: 0 } }
  };
  expect(loopCheck(even, P).pass).toBe(true);
  expect(movesCheck(even, P)).toMatchObject({
    pass: false,
    says: expect.stringMatching(/^one picture twice: angle 90, shape 0, frames 0 and 6 of 12/)
  });
});

it("fails levels closer than a pixel", () => {
  const fine: FieldEffect = {
    ...demo,
    sheets: { ...sheets, step: 0.003, count: null },
    lines: null
  };
  expect(crowdingCheck(fine, P).pass).toBe(false);
});
