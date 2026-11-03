import { describe, expect, test } from "vitest";
import { golden } from "../test/support.ts";
import { hexToSrgb, srgbToLch, srgbToOklab } from "./color.ts";
import { colorCodes } from "./named-colors.ts";
import { colorsIn, readColor } from "./written-color.ts";

const spans = (text: string) => colorsIn(text).map(c => [text.slice(c.start, c.end), c.hex]);

describe("a color written in any form CSS takes", () => {
  test("is the color Firefox paints, in every form and space", () => {
    const { colors } = golden<{ colors: [string, string][] }>("written-colors");
    expect(colors.length).toBeGreaterThan(600);
    for (const [text, hex] of colors) expect([text, readColor(text)]).toEqual([text, hex]);
  });

  test("as CSS's own examples write it", () => {
    for (const [text, hex] of [
      ["#f00", "#ff0000"],
      ["#F008", "#ff0000"],
      ["#264653ff", "#264653"],
      ["rgb(255 0 0 / 50%)", "#ff0000"],
      ["rgba(255, 0, 0, 0.5)", "#ff0000"],
      ["rgb(100% 50% 0%)", "#ff8000"],
      ["rgb(300 -20 none)", "#ff0000"],
      ["hsl(120deg 100% 25%)", "#008000"],
      ["hsl(0.5turn 50% 50%)", "#40bfbf"],
      ["hwb(200 60% 60%)", "#808080"],
      ["lab(100% 0 0)", "#ffffff"],
      ["oklab(0.628 0.225 0.126)", "#ff0000"],
      ["oklch(62.8% 0.258 29.23)", "#ff0000"],
      ["oklch(100% 0 none)", "#ffffff"],
      ["color(srgb 1 0.5 0)", "#ff8000"],
      ["color(xyz-d65 0.9505 1 1.089)", "#ffffff"],
      ["LAB(50 −20 30)", "#618041"]
    ])
      expect([text, readColor(text)]).toEqual([text, hex]);
  });

  test("outside sRGB, keeps its lightness and hue while its chroma comes down to fit", () => {
    for (const [text, l, h] of [
      ["color(display-p3 1 0 0)", 0.6487, 28.96],
      ["oklch(70% 0.4 30)", 0.7, 30],
      ["lab(50 120 0)", null, null]
    ] as const) {
      const hex = readColor(text);
      expect(hex, text).toMatch(/^#[0-9a-f]{6}$/);
      if (l === null) continue;
      const [L, , H] = srgbToLch(hexToSrgb(hex!)!);
      expect(Math.abs(L - l), text).toBeLessThan(0.004);
      expect(Math.abs(H - h), text).toBeLessThan(1);
    }
  });

  test("is the color a page's codes for it show: its rgb exactly, its rounded hsl and oklch unnoticeably near", () => {
    for (const hex of [
      "#800020",
      "#ffd700",
      "#000000",
      "#87ceeb",
      "#0052ff",
      "#f7f7f2",
      "#00f6d4"
    ]) {
      const codes = colorCodes(hex)!;
      expect(readColor(codes.hex)).toBe(hex);
      expect(readColor(codes.rgb)).toBe(hex);
      for (const code of [codes.hsl, codes.oklch]) {
        const [a, b] = [readColor(code)!, hex].map(h => srgbToOklab(...hexToSrgb(h)!));
        expect(Math.hypot(...a.map((v, i) => v - b[i])), code).toBeLessThan(0.01);
      }
    }
  });
});

describe("the forms people and design apps write besides", () => {
  test("a function without its parentheses, or with a colon, or not yet closed", () => {
    expect(readColor("rgb 128 0 32")).toBe("#800020");
    expect(readColor("RGB: 128, 0, 32")).toBe("#800020");
    expect(readColor("rgb:128,0,32")).toBe("#800020");
    expect(readColor("rgb(128 0 32")).toBe("#800020");
    expect(readColor("hsl 0 0 100")).toBe("#ffffff");
  });

  test("HSB and HSV, as design apps write them", () => {
    expect(readColor("hsb(200, 50%, 80%)")).toBe("#66aacc");
    expect(readColor("hsv 0 100 100")).toBe("#ff0000");
    expect(readColor("hsba(120deg 100% 50% / 1)")).toBe("#008000");
  });

  test("0x hex, alpha first when it has eight digits, and six digits alone", () => {
    expect(readColor("0xff6600")).toBe("#ff6600");
    expect(readColor("0x80FF6600")).toBe("#ff6600");
    expect(spans("ff6600 and c0ffee")).toEqual([
      ["ff6600", "#ff6600"],
      ["c0ffee", "#c0ffee"]
    ]);
    expect(spans("ffffff")).toEqual([["ffffff", "#ffffff"]]);
  });
});

describe("where colors are in a text", () => {
  test("each in its place, the words around them left as they are", () => {
    expect(spans("sunset rgb(255 100 0) warm")).toEqual([["rgb(255 100 0)", "#ff6400"]]);
    expect(spans("#264653, hsl(43 74% 66%) and oklch(70% 0.1 200)")).toEqual([
      ["#264653", "#264653"],
      ["hsl(43 74% 66%)", "#e8c468"],
      ["oklch(70% 0.1 200)", "#40b1b7"]
    ]);
    expect(spans("a#fff")).toEqual([["#fff", "#ffffff"]]);
    expect(spans('["rgb(0,0,0)","#fff"]')).toEqual([
      ["rgb(0,0,0)", "#000000"],
      ["#fff", "#ffffff"]
    ]);
  });

  test("a function without parentheses takes three numbers, and an alpha only after a slash or a comma", () => {
    expect(spans("rgb 255 0 0 5 colors")).toEqual([["rgb 255 0 0", "#ff0000"]]);
    expect(spans("rgb 255 0 0 / 50% glow")).toEqual([["rgb 255 0 0 / 50%", "#ff0000"]]);
  });

  test("and what is no color", () => {
    for (const text of [
      "facade",
      "decade palette",
      "rgb gaming setup",
      "lab 5 colors",
      "rgb(10deg 0 0)",
      "hsl(10% 50% 50%)",
      "rgb(1 2 3 4 5)",
      "rgb(255 0)",
      "rgb(/ 1 2 3)",
      "color(cmyk 0 1 1 0)",
      "rgb(255px 0 0)",
      "#12345",
      "#gggggg",
      "ff66001",
      "kS9gc88os_GmSPs",
      "2024 10 26"
    ])
      expect([text, colorsIn(text)]).toEqual([text, []]);
  });

  test("a color alone is one color and nothing else; hex digits alone may spell a word there", () => {
    expect(readColor("  #ABC  ")).toBe("#aabbcc");
    expect(readColor("fff")).toBe("#ffffff");
    expect(readColor("facade")).toBe("#facade");
    for (const text of ["rgb(255 0 0) glow", "red", "", "#fff #000"])
      expect([text, readColor(text)]).toEqual([text, null]);
  });
});
