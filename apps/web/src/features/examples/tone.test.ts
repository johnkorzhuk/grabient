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
      toggle: "light",
      toggleNarrow: "light",
      account: "light",
      accountNarrow: "light"
    });
    expect(headerTone(shown(GRAYS, "linearGradient", 90), true)).toEqual({
      start: "light",
      toggle: "dark",
      toggleNarrow: "dark",
      account: "dark",
      accountNarrow: "dark"
    });
  });
  test("black to white upward: the header stands on white", () => {
    expect(headerTone(shown(GRAYS, "linearGradient", 0), false)).toEqual({
      start: "light",
      toggle: "light",
      toggleNarrow: "light",
      account: "light",
      accountNarrow: "light"
    });
  });
  test("each press takes the ink that reads where it stands, a phone's apart", () => {
    /* orange, black, pink across: a wide screen's presses stand on the pink end; on a phone the theme press reaches
       back to the black, and the account press stays on the pink */
    const sinking: Palette = {
      anchors: [
        { l: 0.7, c: 0.15, h: 53 },
        { l: 0, c: 0, h: 0 },
        { l: 0.86, c: 0.07, h: 339 }
      ]
    };
    const tone = headerTone(shown(sinking, "linearGradient", 90), false);
    expect([tone.toggle, tone.account]).toEqual(["light", "light"]);
    expect([tone.toggleNarrow, tone.accountNarrow]).toEqual(["dark", "light"]);
  });
  test("a blob with no ground on the page's own, which the server cannot know: still the better ink, no surface", () => {
    const blob: Effect = {
      kind: "blob",
      speed: 1,
      fps: 60,
      look: { shape: 3, frost: 1, bg: null }
    };
    const tone = headerTone(shown(PALE, "linearGradient", 90, blob), false);
    expect(["light", "dark"]).toContain(tone.start);
    expect(["light", "dark"]).toContain(tone.account);
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
