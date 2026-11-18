import { beforeAll, describe, expect, it } from "vitest";
import { rasterize, resvgReady } from "../test/raster.ts";
import { base64, jpegOfGreys, jpegOfGreysSteps } from "./jpeg-greys.ts";

/* a smooth picture with fine streaks, as the aurora's light is: every grey from 0 to 255 somewhere */
const picture = (width: number, height: number) =>
  Uint8Array.from({ length: width * height }, (_, i) => {
    const x = (i % width) / Math.max(1, width - 1);
    const y = Math.floor(i / width) / Math.max(1, height - 1);
    const v = 0.5 + 0.35 * Math.sin(9 * x + 4 * y * y) + 0.15 * Math.sin(53 * x - 2 * y);
    return Math.floor(Math.min(1, Math.max(0, v)) * 255 + 0.5);
  });
/* a JPEG as resvg reads it back, the picture's own size */
const read = (jpeg: Uint8Array, width: number, height: number) => {
  const px = rasterize(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="data:image/jpeg;base64,${base64(jpeg)}"/></svg>`,
    width
  );
  return Uint8Array.from({ length: width * height }, (_, i) => px[i * 4]);
};
const fnv = (bytes: Uint8Array) => {
  let h = 0x811c9dc5;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193);
  return (h >>> 0).toString(16);
};

describe("a JPEG of greys", () => {
  beforeAll(resvgReady);

  it("is a baseline JPEG of one component, the standard's tables in it, which a reader of JPEG gets back within a few levels", () => {
    for (const [width, height] of [
      [64, 64],
      [61, 37],
      [8, 8],
      [3, 1]
    ]) {
      const greys = picture(width, height);
      const jpeg = jpegOfGreys(greys, width, height, 90);
      /* it starts and ends as a JPEG does, and says its size and its one component */
      expect([...jpeg.subarray(0, 4)]).toEqual([0xff, 0xd8, 0xff, 0xe0]);
      expect([...jpeg.subarray(-2)]).toEqual([0xff, 0xd9]);
      const frame = jpeg.findIndex((byte, i) => byte === 0xff && jpeg[i + 1] === 0xc0);
      expect([
        (jpeg[frame + 5] << 8) | jpeg[frame + 6],
        (jpeg[frame + 7] << 8) | jpeg[frame + 8],
        jpeg[frame + 9]
      ]).toEqual([height, width, 1]);
      const back = read(jpeg, width, height);
      let worst = 0;
      let squares = 0;
      for (let i = 0; i < greys.length; i++) {
        worst = Math.max(worst, Math.abs(back[i] - greys[i]));
        squares += (back[i] - greys[i]) ** 2;
      }
      expect(worst, `${width} by ${height}`).toBeLessThan(12);
      expect(Math.sqrt(squares / greys.length), `${width} by ${height}`).toBeLessThan(4);
    }
  });

  it("weighs less and reads back farther off at a lower quality", () => {
    const greys = picture(128, 128);
    const far = (jpeg: Uint8Array) => {
      const back = read(jpeg, 128, 128);
      let squares = 0;
      for (let i = 0; i < greys.length; i++) squares += (back[i] - greys[i]) ** 2;
      return Math.sqrt(squares / greys.length);
    };
    const fine = jpegOfGreys(greys, 128, 128, 95);
    const own = jpegOfGreys(greys, 128, 128, 90);
    const rough = jpegOfGreys(greys, 128, 128, 40);
    expect(fine.length).toBeGreaterThan(own.length);
    expect(rough.length).toBeLessThan(own.length * 0.6);
    expect(far(fine)).toBeLessThan(far(own));
    expect(far(own)).toBeLessThan(far(rough));
    /* a bit a sample or so: this picture of 16,384 samples in under 3,000 bytes */
    expect(own.length).toBeLessThan(3000);
  });

  it("is the same bytes written a step at a time, and the same on every engine", () => {
    const greys = picture(96, 80);
    const steps = jpegOfGreysSteps(greys, 96, 80, 90);
    let count = 0;
    let step = steps.next();
    while (!step.done) {
      count++;
      step = steps.next();
    }
    expect(count).toBeGreaterThan(1);
    const at = jpegOfGreys(greys, 96, 80, 90);
    expect(fnv(step.value)).toBe(fnv(at));
    /* whole numbers and doubles alone, its cosines written out: these bytes under Node 24 and 25, in a Worker and
       in a page */
    expect([at.length, fnv(at)]).toEqual([1781, "410d69d5"]);
  });

  it("writes bytes in base64, padded", () => {
    for (const bytes of [[], [255], [1, 2], [1, 2, 3], [0, 255, 128, 7, 250]])
      expect(base64(Uint8Array.from(bytes))).toBe(Buffer.from(bytes).toString("base64"));
  });
});
