import { describe, expect, test } from "vitest";
import { golden } from "../test/support.ts";
import { decodePalette } from "./codec.ts";
import { ENGLISH } from "./message.ts";
import type { Palette } from "./palette.ts";
import { numeral, typedHex } from "./typed.ts";
import {
  asSaved,
  clampSize,
  drawnView,
  effectiveView,
  parseSize,
  parseView,
  resolveSize,
  type Size,
  type SizeChoice,
  styleLabel,
  styleWords,
  type View,
  viewSearch
} from "./view.ts";

const read = (search: string) => parseView(new URLSearchParams(search));

describe("the view's address", () => {
  test("defaults are left out, the order is fixed, and junk takes the default", () => {
    expect(viewSearch(read(""))).toBe("");
    expect(viewSearch(read("angle=30&steps=12&style=radialSwatches&junk=1"))).toBe(
      "?style=radialSwatches&steps=12&angle=30"
    );
    expect(read("style=nope&steps=101&angle=361")).toEqual({
      style: "linearGradient",
      steps: 7,
      angle: 90
    });
    expect(read("steps=1").steps).toBe(3);
    expect(read("steps=7.5&angle=-4").steps).toBe(7);
    expect(viewSearch(read("size=autox1080"), ["lock=lightness,hue", "", "selection"])).toBe(
      "?size=autox1080&lock=lightness,hue&selection"
    );
  });
  test("an address read and written again is itself", () => {
    for (const search of [
      "?style=angularSwatches&steps=3&angle=0",
      "?steps=100&size=1200x630",
      "?angle=360"
    ]) {
      expect(viewSearch(read(search))).toBe(search);
    }
  });
  test("a palette's files are drawn at no fewer steps than its keyframes", () => {
    const P = decodePalette("kcgI_BPOBA0BgwZI1sK2LpDueoxrwLsS764_g") as Palette;
    expect(drawnView(P)).toEqual({ style: "linearGradient", steps: 8, angle: 90 });
    expect(drawnView(P, { style: "nope" as View["style"], steps: 2, angle: 999 })).toEqual({
      style: "linearGradient",
      steps: 8,
      angle: 90
    });
    expect(drawnView(P, { style: "radialGradient", steps: 12, angle: 30 })).toEqual({
      style: "radialGradient",
      steps: 12,
      angle: 30
    });
  });
  test("a palette is drawn as it was saved while its style and steps are, read as its drawing reads them, whatever its angle", () => {
    const P = decodePalette("kcgI_BPOBA0BgwZI1sK2LpDueoxrwLsS764_g") as Palette;
    const saved = { style: "linearSwatches" as const, steps: 9, angle: 90 };
    expect(asSaved(P, saved, saved)).toBe(true);
    expect(asSaved(P, { ...saved, style: "radialSwatches" }, saved)).toBe(false);
    expect(asSaved(P, { ...saved, steps: 10 }, saved)).toBe(false);
    expect(asSaved(P, { ...saved, angle: 45 }, saved)).toBe(true);
    // eight keyframes draw eight steps from any fewer, and an address's defaults are the view's
    expect(
      asSaved(
        P,
        { style: "linearGradient", steps: 3 },
        { style: "linearGradient", steps: 8, angle: 90 }
      )
    ).toBe(true);
  });
  test("a list's view over each palette's own", () => {
    const own = { style: "radialGradient" as const, steps: 9, angle: 30 };
    expect(effectiveView(own, { style: "auto", steps: "auto", angle: "auto" })).toEqual(own);
    expect(effectiveView(own, { style: "linearSwatches", steps: 400, angle: 0 })).toEqual({
      style: "linearSwatches",
      steps: 100,
      angle: 0
    });
  });
  test("style words and labels", () => {
    expect(styleWords("angularSwatches")).toBe("angular swatches");
    expect(styleLabel("auto", ENGLISH)).toBe("As saved");
    expect(styleLabel("radialSwatches", ENGLISH)).toBe("Radial bands");
  });
});

describe("sizes", () => {
  test("the bounded WxH form, either side auto", () => {
    expect(parseSize("1200x630")).toEqual({ width: 1200, height: 630 });
    expect(parseSize("autox1080")).toEqual({ width: "auto", height: 1080 });
    for (const bad of ["autoxauto", "39x100", "100x6001", "12000x100", "1200X630", null])
      expect(parseSize(bad)).toBeNull();
    expect(clampSize({ width: 7000.4, height: Number.NaN })).toEqual({ width: 6000, height: 400 });
  });
  test("an auto side follows the other at the auto size's shape", () => {
    const { sizes } = golden<{
      sizes: { choice: SizeChoice | null; auto: Size; resolved: Size }[];
    }>("colors");
    for (const s of sizes) expect(resolveSize(s.choice, s.auto)).toEqual(s.resolved);
  });
});

test("what a reader typed, from any keyboard", () => {
  expect(numeral("١٢٫٥")).toBe("12.5");
  expect(numeral("1 920")).toBe("1920");
  expect(numeral("−4")).toBe("-4");
  expect(typedHex("＃ＦＦ８８００")).toBe("#ff8800");
  expect(typedHex(" 0052FF ")).toBe("#0052ff");
  expect(typedHex("#0052f")).toBeNull();
});
