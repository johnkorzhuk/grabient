import { inflateSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
import { rasterize, resvgReady } from "../test/raster.ts";
import { base64, indexedPngSteps, pngPalette } from "./indexed-png.ts";

const atOnce = <T>(steps: Generator<void, T>): T => {
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
};
/* a smooth picture with fine streaks, as the aurora's light is: every one of `levels` places somewhere */
const picture = (width: number, height: number, levels: number) =>
  Uint8Array.from({ length: width * height }, (_, i) => {
    const x = (i % width) / Math.max(1, width - 1);
    const y = Math.floor(i / width) / Math.max(1, height - 1);
    const v = 0.5 + 0.35 * Math.sin(9 * x + 4 * y * y) + 0.15 * Math.sin(53 * x - 2 * y);
    return Math.floor(Math.min(1, Math.max(0, v)) * (levels - 1) + 0.5);
  });
/* a palette of `levels` colors, no two alike */
const colorsOf = (levels: number) =>
  Uint8Array.from({ length: levels * 3 }, (_, i) => {
    const level = Math.floor(i / 3);
    return i % 3 === 0 ? level * 2 : i % 3 === 1 ? 255 - level : (level * 37) & 255;
  });
const file = (pixels: Uint8Array, width: number, height: number, colors: Uint8Array) => {
  const png = atOnce(indexedPngSteps(pixels, width, height));
  return png.head + pngPalette(colors) + png.rows;
};

describe("an indexed PNG", () => {
  beforeAll(resvgReady);

  it("is a PNG whose every pixel a reader gets back as the palette's own color", () => {
    const colors = colorsOf(128);
    for (const [width, height] of [
      [64, 64],
      [61, 37],
      [3, 1],
      [1, 1]
    ]) {
      const pixels = picture(width, height, 128);
      const text = file(pixels, width, height, colors);
      const bytes = Buffer.from(text, "base64");
      /* the signature, then the header: its size, eight bits a pixel, indexed */
      expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(bytes.subarray(12, 16).toString("latin1")).toBe("IHDR");
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20), bytes[24], bytes[25]]).toEqual([
        width,
        height,
        8,
        3
      ]);
      /* the palette next, whole, then the rows and the end */
      expect(bytes.subarray(37, 41).toString("latin1")).toBe("PLTE");
      expect(Buffer.compare(bytes.subarray(41, 41 + colors.length), colors)).toBe(0);
      const data = 41 + colors.length + 4;
      expect(bytes.subarray(data + 4, data + 8).toString("latin1")).toBe("IDAT");
      expect(bytes.subarray(-8, -4).toString("latin1")).toBe("IEND");
      /* its rows: each the Up filter's, the pixels' difference from the row above */
      const rows = inflateSync(bytes.subarray(data + 8, data + 8 + bytes.readUInt32BE(data)));
      expect(rows.length).toBe(height * (width + 1));
      for (let y = 0; y < height; y++) expect(rows[y * (width + 1)]).toBe(2);
      const px = rasterize(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="data:image/png;base64,${text}"/></svg>`,
        width
      );
      for (let i = 0; i < pixels.length; i++)
        expect(
          [px[i * 4], px[i * 4 + 1], px[i * 4 + 2], px[i * 4 + 3]],
          `${width} by ${height}, pixel ${i}`
        ).toEqual([
          colors[pixels[i] * 3],
          colors[pixels[i] * 3 + 1],
          colors[pixels[i] * 3 + 2],
          255
        ]);
    }
  });

  it("lies around its palette in pieces that join as text: another palette is another picture of the same pixels", () => {
    const pixels = picture(96, 80, 128);
    const png = atOnce(indexedPngSteps(pixels, 96, 80));
    /* the signature and the header are 33 bytes, a palette's chunk 12 and three a color: whole threes, no padding */
    expect(png.head).toHaveLength(44);
    expect(png.head).not.toContain("=");
    for (const levels of [2, 128, 256]) {
      const palette = pngPalette(colorsOf(levels));
      expect(palette).toHaveLength(((12 + levels * 3) / 3) * 4);
      expect(palette).not.toContain("=");
    }
    const one = png.head + pngPalette(colorsOf(128)) + png.rows;
    expect(one).toBe(Buffer.from(one, "base64").toString("base64"));
    /* a streaked picture of 7,680 pixels in a third of their bytes */
    expect(Buffer.from(png.rows, "base64").length).toBeLessThan(7680 * 0.35);
  });

  it("writes bytes in base64, padded", () => {
    for (const bytes of [[], [255], [1, 2], [1, 2, 3], [0, 255, 128, 7, 250]])
      expect(base64(Uint8Array.from(bytes))).toBe(Buffer.from(bytes).toString("base64"));
  });
});
