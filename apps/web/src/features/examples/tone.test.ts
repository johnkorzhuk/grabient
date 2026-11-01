import type { Effect } from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import type { Style } from "@grabient/engine/view.ts";
import { describe, expect, test } from "vitest";
import type { Shown } from "./paint.ts";
import { wordsTone } from "./tone.ts";

const GRAYS: Palette = {
  anchors: [
    { l: 0, c: 0, h: 0 },
    { l: 1, c: 0, h: 0 }
  ]
};
const PALE: Palette = {
  anchors: [
    { l: 0.9, c: 0.05, h: 250 },
    { l: 0.86, c: 0.07, h: 300 }
  ]
};
const shown = (P: Palette, style: Style, angle: number, effect: Effect | null = null): Shown => ({
  seed: "kTest",
  palette: P,
  view: { style, steps: 7, angle },
  effect
});

describe("wordsTone", () => {
  test("a pale palette's words in the light theme, on no sheet", () => {
    expect(wordsTone(shown(PALE, "linearGradient", 90), false)).toBe("light");
  });
  test("black to white across: no theme reads on every color under the words, which take a sheet", () => {
    expect(wordsTone(shown(GRAYS, "linearGradient", 90), false)).toBeNull();
  });
});
