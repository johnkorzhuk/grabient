import { describe, expect, test } from "vitest";
import { golden } from "../test/support.ts";
import { decodePalette } from "./codec.ts";
import { oklabToLinear, toEncoded } from "./color.ts";
import {
  type ColorKind,
  cardBackground,
  colorKind,
  colorsText,
  cssBlock,
  cssLine,
  cssWide,
  gradientCss,
  oklchOf,
  paletteCss,
  spell
} from "./css.ts";
import { type Stop, sampleStops } from "./curve.ts";
import { DEG } from "./math.ts";
import type { Palette } from "./palette.ts";
import { specJson } from "./spec.ts";
import { STYLES, type Style, type View, viewSearch } from "./view.ts";

interface Entry {
  id: string;
  seed: string;
  view: View;
  wide: boolean;
  address: string;
  block: Partial<Record<Style, Record<ColorKind, string>>>;
  file: Partial<Record<Style, string>>;
  fileNotations?: Record<ColorKind, string>;
  colors: Record<ColorKind, string>;
  specJson: string;
}
const { entries } = golden<{ entries: Entry[] }>("css");
const KINDS: ColorKind[] = ["oklch", "hex", "rgb", "hsl"];
const stopsOf = (seed: string, steps: number) => sampleStops(decodePalette(seed) as Palette, steps);

test("the CSS in every style and spelling, the CSS file, the colors and the spec are as before", () => {
  for (const e of entries) {
    const stops = stopsOf(e.seed, e.view.steps);
    expect(cssWide(stops), e.id).toBe(e.wide);
    for (const [style, byKind] of Object.entries(e.block) as [Style, Record<ColorKind, string>][]) {
      for (const kind of KINDS)
        expect(cssBlock(stops, style, e.view.angle, kind), `${e.id} ${style} ${kind}`).toBe(
          byKind[kind]
        );
    }
    for (const [style, text] of Object.entries(e.file) as [Style, string][]) {
      const address = `https://grabient.com/${e.seed}${viewSearch({ ...e.view, style })}`;
      expect(paletteCss(stops, { style, angle: e.view.angle }, address)).toBe(text);
    }
    if (e.fileNotations)
      for (const kind of KINDS)
        expect(paletteCss(stops, e.view, e.address, kind)).toBe(e.fileNotations[kind]);
    for (const kind of KINDS) expect(colorsText(kind, stops)).toBe(e.colors[kind]);
    expect(specJson(decodePalette(e.seed) as Palette, e.view)).toBe(e.specJson);
  }
});

test("a card's background is the hex line's gradient", () => {
  for (const e of entries.slice(0, 60)) {
    for (const style of STYLES) {
      const line = cssLine(stopsOf(e.seed, e.view.steps), style, e.view.angle, "hex");
      expect(`background: ${cardBackground(e.seed, style, e.view.steps, e.view.angle)};`).toBe(
        line
      );
    }
  }
  expect(cardBackground("not a seed", "linearGradient", 7, 90)).toBeNull();
  expect(gradientCss([])).toBe("transparent");
});

describe("the spellings paint the hex's pixels", () => {
  /* every eighth level of each channel, ends included */
  const levels = [...Array.from({ length: 32 }, (_, i) => i * 8), 255];
  const stop = (r: number, g: number, b: number): Stop => {
    const rgb: Stop["rgb"] = [r / 255, g / 255, b / 255];
    const hex = `#${[r, g, b].map(v => v.toString(16).padStart(2, "0")).join("")}`;
    return { t: 0, hex, rgb, lch: [0, 0, 0] };
  };
  const hsl = (text: string) => {
    const [h, s, l] = (text.match(/[\d.]+/g) as string[]).map(Number);
    const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      return Math.round((l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
    };
    return [f(0), f(8), f(4)];
  };
  const oklch = (text: string) => {
    const [L, C, H] = (text.match(/[\d.]+/g) as string[]).map(Number);
    return oklabToLinear(L / 100, C * Math.cos(H * DEG), C * Math.sin(H * DEG)).map(v =>
      Math.round(toEncoded(Math.min(1, Math.max(0, v))) * 255)
    );
  };
  test("rgb() and hsl() exactly, oklch() within one 8-bit step", () => {
    const off: string[] = [];
    for (const r of levels) {
      for (const g of levels) {
        for (const b of levels) {
          const s = stop(r, g, b);
          const bytes = [r, g, b];
          if (spell("rgb", s) !== `rgb(${r} ${g} ${b})`) off.push(`rgb ${s.hex}`);
          if (hsl(spell("hsl", s)).some((v, i) => v !== bytes[i])) off.push(`hsl ${s.hex}`);
          if (oklch(oklchOf(s)).some((v, i) => Math.abs(v - bytes[i]) > 1))
            off.push(`oklch ${s.hex}`);
        }
      }
    }
    expect(off).toEqual([]);
  });
});

test("only a gradient in OKLCH names an interpolation space, and the P3 block follows the line", () => {
  for (const e of entries.slice(0, 80)) {
    const stops = stopsOf(e.seed, e.view.steps);
    for (const style of STYLES) {
      for (const kind of KINDS) {
        const block = cssBlock(stops, style, e.view.angle, kind);
        const line = cssLine(stops, style, e.view.angle, kind);
        expect(block.includes(" in oklch")).toBe(kind === "oklch" && style.endsWith("Gradient"));
        expect(block.startsWith(line)).toBe(true);
        expect(block.includes("@media (color-gamut: p3)")).toBe(e.wide);
      }
    }
  }
  expect(colorKind("hsl")).toBe("hsl");
  expect(colorKind("cmyk")).toBe("oklch");
});
