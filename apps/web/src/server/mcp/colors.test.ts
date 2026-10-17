import { decodePalette, encodePalette } from "@grabient/engine/codec.ts";
import { sampleLCH } from "@grabient/engine/curve.ts";
import { describe, expect, it } from "vitest";
import { adjustPalette, readChange } from "./adjust.ts";
import { colorsToPalette, details, hexColor, hexOf } from "./colors.ts";
import adjustGolden from "./fixtures/palette-adjust.json" with { type: "json" };
import colorsGolden from "./fixtures/palette-colors.json" with { type: "json" };

describe("palettes from hex colors", () => {
  it("hold each color as its hex and say what a blend shows that no color has", () => {
    type Made = { colors: string[]; seed?: string; notes?: string[]; error?: string };
    type Details = { details: { hex: string }[] };
    for (const golden of colorsGolden as (Made | Details)[]) {
      if ("details" in golden) {
        expect(details(golden.details.map(row => row.hex))).toEqual(golden.details);
        continue;
      }
      const made = colorsToPalette(golden.colors);
      if ("error" in golden) {
        expect(made).toEqual({ error: golden.error });
        continue;
      }
      if ("error" in made) throw new Error(made.error);
      expect(encodePalette(made.palette)).toBe(golden.seed);
      expect(made.notes).toEqual(golden.notes);
    }
  });

  it("read #rgb and #rrggbb in any case, and nothing else", () => {
    expect(["#ABC", " 0052ff ", "#0052FF", "rgb(0,0,0)", "#00000000", "red"].map(hexColor)).toEqual(
      ["#aabbcc", "#0052ff", "#0052ff", null, null, null]
    );
  });
});

describe("palettes changed by numbers", () => {
  it("change in a fixed order and say what a change could not reach", () => {
    const brand = colorsToPalette(["#050B2E", "#0052FF", "#4CC9F0"]);
    if ("error" in brand) throw new Error(brand.error);
    for (const golden of adjustGolden) {
      const change = readChange(golden.raw, brand.palette);
      if ("error" in golden) {
        expect(change).toEqual({ error: golden.error });
        continue;
      }
      if ("error" in change) throw new Error(change.error);
      const out = adjustPalette(brand.palette, change);
      expect(encodePalette(out.palette), JSON.stringify(golden.raw)).toBe(golden.seed);
      expect(out.notes).toEqual(golden.notes);
      expect(out.palette.anchors.map(hexOf)).toEqual(golden.colors);
    }
  });

  it("resample along the palette's own way round the hues", () => {
    // coral to teal turns through orange and green, so two of its colors blend that way, never through violet
    const coral = decodePalette("kCf9ra1OzcQRpTXA")!;
    const { palette } = adjustPalette(coral, { colorCount: 2 });
    expect(palette.anchors.map(hexOf)).toEqual(["#ff6b6b", "#1a535c"]);
    const hue = ((sampleLCH(palette, 0.5)[2] % 360) + 360) % 360;
    expect(hue).toBeGreaterThan(60);
    expect(hue).toBeLessThan(180);
  });
});
