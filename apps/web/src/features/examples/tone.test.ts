import type { Effect } from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import type { Style } from "@grabient/engine/view.ts";
import { describe, expect, test } from "vitest";
import type { Shown } from "./paint.ts";
import { headerTone, wordsTone } from "./tone.ts";

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

describe("headerTone", () => {
  test("black to white across: the wordmark's side dark, the corner's light, and the other way right to left", () => {
    expect(headerTone(shown(GRAYS, "linearGradient", 90), false)).toEqual({
      start: "dark",
      end: "light"
    });
    expect(headerTone(shown(GRAYS, "linearGradient", 90), true)).toEqual({
      start: "light",
      end: "dark"
    });
  });
  test("black to white upward: the header stands on white", () => {
    expect(headerTone(shown(GRAYS, "linearGradient", 0), false)).toEqual({
      start: "light",
      end: "light"
    });
  });
  test("a blob with no ground stands on the page's own, which the server cannot know: the header is frosted", () => {
    const blob: Effect = {
      kind: "blob",
      speed: 1,
      fps: 60,
      look: { shape: 3, frost: 1, bg: null }
    };
    expect(headerTone(shown(PALE, "linearGradient", 90, blob), false)).toBeNull();
  });
});

describe("wordsTone", () => {
  test("a pale palette's words in the light theme, on no sheet", () => {
    expect(wordsTone(shown(PALE, "linearGradient", 90), false)).toBe("light");
  });
  test("black to white across: no theme reads on every color under the words, which take a sheet", () => {
    expect(wordsTone(shown(GRAYS, "linearGradient", 90), false)).toBeNull();
  });
});
