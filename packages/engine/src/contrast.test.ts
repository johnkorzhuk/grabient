import { expect, test } from "vitest";
import { golden } from "../test/support.ts";
import { decodePalette } from "./codec.ts";
import {
  type ContrastInk,
  type ContrastMeasures,
  type ContrastPicture,
  contrast,
  contrastGrounds,
  contrastInks,
  contrastPicture,
  contrastSvg,
  contrastTaken,
  contrastText,
  withBlack,
  withWhite
} from "./contrast.ts";
import { sampleStops } from "./curve.ts";
import type { Palette } from "./palette.ts";

const colors = golden<{
  contrastCases: { grounds: string[]; mine: string[]; inks: ContrastInk[] }[];
  contrastFiles: {
    seed: string;
    colors: string[];
    mine: string[];
    picture: ContrastPicture;
    svg: string;
  }[];
  contrastNumbers: { a: string; b: string; ratio: number; text: string }[];
}>("colors");
/* the design tokens the page draws the picture with */
const MEASURES: ContrastMeasures = {
  ink: 24,
  band: 64,
  row: 32,
  radius: 6,
  coin: 12,
  text: 13,
  large: 24,
  weight: "500",
  family: '"Poppins", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
};

test("WCAG numbers, written without rounding up across a threshold", () => {
  for (const c of colors.contrastNumbers) {
    expect(contrast(c.a, c.b)).toBe(c.ratio);
    expect(contrastText(contrast(c.a, c.b))).toBe(c.text);
  }
  expect(contrastText(4.496)).toBe("4.49");
  expect(withBlack("#ffffff")).toBe(21);
  expect(withWhite("#000000")).toBe(21);
});

test("the grid's rows and the picture are as before", () => {
  for (const c of colors.contrastCases) expect(contrastInks(c.grounds, c.mine)).toEqual(c.inks);
  for (const f of colors.contrastFiles) {
    const hexes = sampleStops(decodePalette(f.seed) as Palette, 12).map(s => s.hex);
    expect(hexes).toEqual(f.colors);
    expect(contrastPicture(hexes, f.mine, MEASURES)).toEqual(f.picture);
    expect(contrastSvg(hexes, `https://grabient.com/${f.seed}--x`, f.mine, MEASURES)).toBe(f.svg);
  }
});

test("at most eight grounds, the ends among them; a color is never two rows", () => {
  const twelve = Array.from({ length: 12 }, (_, i) => i);
  expect(contrastGrounds(twelve)).toEqual([0, 2, 3, 5, 6, 8, 9, 11]);
  expect(contrastTaken("#FFFFFF", [], [])).toBe(true);
  expect(contrastTaken("#336699", ["#336699"], [])).toBe(true);
  expect(contrastTaken("#123456", [], ["#123456"], 0)).toBe(false);
});
