// Tare invariant (original handleTareModifier): folding a global into the
// coefficient row must NOT change the rendered colors — only redistribute.
import { describe, expect, it } from "vitest";
import {
  applyGlobals,
  cosineGradient,
  rgbToHex,
  tareModifier,
} from "@repo/data-ops/gradient-gen/cosine";

const COEFFS = [
  [0.5, 0.5, 0.5, 1],
  [0.4, 0.3, 0.5, 1],
  [1.1, 0.9, 1.0, 1],
  [0.0, 0.33, 0.67, 1],
];
const GLOBALS = [0.2, 1.3, 0.8, -0.15];
const DEFAULTS = [0, 1, 1, 0];

const render = (coeffs, globals) =>
  cosineGradient(7, applyGlobals(coeffs, globals)).map(([r, g, b]) => rgbToHex(r, g, b));

describe("tareModifier", () => {
  for (const [idx, name] of [
    [0, "exposure"],
    [1, "contrast"],
    [2, "frequency"],
    [3, "phase"],
  ]) {
    it(`taring ${name} keeps the output identical and zeroes the global`, () => {
      const before = render(COEFFS, GLOBALS);
      const { coeffs, globals } = tareModifier(COEFFS, GLOBALS, idx, DEFAULTS[idx]);
      expect(globals[idx]).toBe(DEFAULTS[idx]);
      expect(render(coeffs, globals)).toEqual(before);
    });
  }

  it("taring at the default is a no-op", () => {
    const { coeffs, globals } = tareModifier(COEFFS, [0, 1, 1, 0], 1, 1);
    expect(coeffs).toBe(COEFFS);
    expect(globals).toEqual([0, 1, 1, 0]);
  });
});
