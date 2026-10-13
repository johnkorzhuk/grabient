import { decodePalette } from "@grabient/engine/codec.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { expect, test } from "vitest";
import { barGradient, type LCH, lchSamples, MOVES, mixStops, toHexes } from "../src/bartween.ts";
import { BRAND_SUPPLY } from "../src/supply.ts";
import { golden, r4 } from "./support.ts";

const tween = golden<{
  MOVES: string[];
  a: LCH[];
  b: LCH[];
  moves: Record<string, string[][]>;
  empty: LCH[];
  one: LCH[];
  barGradient: string;
}>("bartween");
const hexes = (seed: string) => sampleStops(decodePalette(seed) as Palette, 32).map(s => s.hex);

test("the bar's four moves draw the same frames", () => {
  expect([...MOVES]).toEqual(tween.MOVES);
  const a = lchSamples(hexes(BRAND_SUPPLY[0]), 8);
  const b = lchSamples(hexes(BRAND_SUPPLY[3]), 8);
  expect(r4(a)).toEqual(tween.a);
  expect(r4(b)).toEqual(tween.b);
  for (const m of MOVES) {
    const frames = [0, 0.25, 0.5, 0.75, 1].map(u => toHexes(mixStops(a, b, u, m, 1)));
    frames.push(toHexes(mixStops(a, b, 0.5, m, -1)));
    expect(frames).toEqual(tween.moves[m]);
  }
  expect(lchSamples([], 3)).toEqual(tween.empty);
  expect(r4(lchSamples(["#336699"], 3))).toEqual(tween.one);
  expect(barGradient(["#336699", "#ff0000", "#00ff00"], 0.5)).toBe(tween.barGradient);
});
