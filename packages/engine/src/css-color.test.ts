import { expect, test } from "vitest";
import { cssColorHex, cssColorText, parseCssColor } from "./css-color.ts";

/* Pinned against Chromium's own canvas for 181 colors, every named one and each syntax, within a level (31 Oct 2026,
   W/effects-audit/color-check.ts): these are a few of them. */
test("a color written any way CSS writes one reads as the hex an address keeps", () => {
  const hex = (text: string) => cssColorText(text);
  expect(hex("red")).toBe("#ff0000");
  expect(hex("RebeccaPurple")).toBe("#663399");
  expect(hex("#abc")).toBe("#aabbcc");
  expect(hex("abcd")).toBe("#aabbccdd");
  expect(hex("#a1b2c380")).toBe("#a1b2c380");
  expect(hex("rgb(10, 20, 30)")).toBe("#0a141e");
  expect(hex("rgba(10,20,30,0.5)")).toBe("#0a141e80");
  expect(hex("rgb(10 20 30 / 50%)")).toBe("#0a141e80");
  expect(hex("hsl(120 100% 25%)")).toBe("#008000");
  expect(hex("hsla(0.5turn, 50%, 50%, 0.8)")).toBe("#40bfbfcc");
  expect(hex("hwb(200 60% 60%)")).toBe("#808080");
  expect(hex("lab(54.29 80.8 69.89)")).toBe("#ff0000");
  expect(hex("oklch(62.8% 0.2577 29.23)")).toBe("#ff0000");
  expect(hex("oklab(0.628 0.225 0.126)")).toBe("#ff0000");
  expect(hex("color(srgb 1 0.5 0)")).toBe("#ff8000");
  // a color past sRGB comes into it
  expect(hex("color(display-p3 1 0 0)")).toBe("#ff0000");
  // full-width characters read as the ones they spell
  expect(hex("ｒｅｄ")).toBe("#ff0000");
});

test("none, a clear color and text that is no color", () => {
  expect(cssColorText("")).toBeNull();
  expect(cssColorText("  ")).toBeNull();
  expect(cssColorText("transparent")).toBeNull();
  expect(cssColorText("rgb(0 0 0 / 0)")).toBeNull();
  expect(cssColorText("nope")).toBeUndefined();
  expect(cssColorText("rgb(1, 2)")).toBeUndefined();
  expect(cssColorText("color(cmyk 1 0 0)")).toBeUndefined();
  expect(parseCssColor("rgb(300 -20 100)")).toEqual({ rgb: [1, 0, 100 / 255], alpha: 1 });
  expect(cssColorHex({ rgb: [1, 1, 1], alpha: 1 })).toBe("#ffffff");
});
