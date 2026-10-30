import { decodePalette } from "@grabient/engine/codec.ts";
import { drawnView, type View } from "@grabient/engine/view.ts";
import { describe, expect, test } from "vitest";
import golden from "./fixtures/pictures.json" with { type: "json" };
import { HEX_SIZES } from "./hex-glyphs.data.ts";
import { chipLetters, chipsAcross, keyframeColors, lookOf, sheetBoxes } from "./paint.ts";
import { sheetSvg } from "./sheet-svg.ts";

const palette = (seed: string) => {
  const P = decodePalette(seed);
  if (!P) throw new Error(`${seed} is no palette`);
  return P;
};
const row = (seed: string, view: Partial<View>) => ({
  look: lookOf(palette(seed), drawnView(palette(seed), view)),
  chips: keyframeColors(palette(seed))
});

describe("a sheet as SVG", () => {
  const rows = [
    row(golden.defaultSeed, { style: "linearGradient", steps: 32 }),
    row(golden.graySeed, { style: "radialSwatches", steps: 4 }),
    row(golden.eightSeed, {})
  ];
  const svg = sheetSvg(rows, 1200, 1200, 'Ocean & "waves"');

  test("is a titled square on the paper, a clipped row to each palette where the PNG lays them", () => {
    expect(
      svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200"')
    ).toBe(true);
    expect(svg).toContain("<title>Ocean &amp; &quot;waves&quot;</title>");
    expect(svg).toContain('<rect width="1200" height="1200" fill="#faf9f7"/>');
    const boxes = sheetBoxes(rows.length, 1200, 1200);
    boxes.forEach((box, i) => {
      expect(svg).toContain(
        `<clipPath id="c${i}"><rect x="${box.row.x}" y="${box.row.y}" width="${box.row.width}" height="${box.row.height}" rx="14"/></clipPath>`
      );
    });
  });

  test("holds a band's color from its edge to the next for a swatch style, and blends a gradient's", () => {
    const bands = svg.slice(
      svg.indexOf('<linearGradient id="g1">'),
      svg.indexOf('<clipPath id="c1">')
    );
    expect(bands.match(/<stop /g)?.length).toBe(8);
    expect(bands).toContain('offset="25%"');
    const blend = svg.slice(
      svg.indexOf('<linearGradient id="g0">'),
      svg.indexOf('<clipPath id="c0">')
    );
    expect(blend.match(/<stop /g)?.length).toBe(32);
  });

  test("sets each chip's hex at the size the PNG sets it, in the ink that reads on it", () => {
    const boxes = sheetBoxes(rows.length, 1200, 1200);
    const chips = chipsAcross(rows[2].chips, boxes[2].chips.width);
    const size = HEX_SIZES[chipLetters(chips, boxes[2].chips.height)].size;
    for (const chip of chips) {
      expect(svg).toMatch(new RegExp(`font-size="${size}" fill="#(000|fff)">${chip.hex}</text>`));
    }
  });
});
