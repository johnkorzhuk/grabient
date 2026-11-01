import { expect, test } from "vitest";
import { decodePng } from "../../../test/png.ts";
import { encodePng } from "./png.ts";

const noise = (length: number) => {
  let seed = 7;
  return Uint8Array.from({ length }, () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed >>> 24;
  });
};

test("a picture of many bands of rows reads back whole, in its chunks, with every CRC", async () => {
  // 1,000 rows of 300 RGBA pixels: about five bands of rows deflated apart
  for (const [width, height, channels] of [
    [300, 1000, 4],
    [301, 977, 3],
    [1, 1, 3],
    [5000, 3, 4]
  ]) {
    const pixels = noise(width * height * channels);
    const read = await decodePng(await encodePng(width, height, pixels));
    expect([read.width, read.height, read.channels, read.chunks]).toEqual([
      width,
      height,
      channels,
      ["IHDR", "sRGB", "IDAT", "IEND"]
    ]);
    expect(read.pixels).toEqual(pixels);
  }
});

test("pixels that are no picture of the size are refused", async () => {
  await expect(encodePng(2, 2, new Uint8Array(10))).rejects.toThrow("no 2 by 2 picture");
  await expect(encodePng(0, 1, new Uint8Array(0))).rejects.toThrow();
});
