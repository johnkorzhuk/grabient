import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";
import { encodeWebp } from "./webp.ts";

/* the module the Worker imports with the still's answer, read from its file as a test reads the video's */
const wasm = new WebAssembly.Module(
  readFileSync(createRequire(import.meta.url).resolve("@jsquash/webp/codec/enc/webp_enc_simd.wasm"))
);

/** The width and height a lossy WebP's VP8 frame header gives (RIFF, WEBP, then "VP8 " and its key frame's start). */
function vp8Size(file: Uint8Array): { width: number; height: number } {
  const text = (from: number, to: number) => String.fromCharCode(...file.subarray(from, to));
  expect([text(0, 4), text(8, 12), text(12, 16)]).toEqual(["RIFF", "WEBP", "VP8 "]);
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  // the frame tag (3 bytes), the start code 9d 01 2a, then 14 bits of width and of height
  expect([file[23], file[24], file[25]]).toEqual([0x9d, 0x01, 0x2a]);
  return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
}

describe("a WebP from a picture's pixels", () => {
  test("is a lossy file of the picture's size, and smaller at a lower quality", async () => {
    const width = 96;
    const height = 64;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const o = 4 * (y * width + x);
        rgba.set([(255 * x) / width, (255 * y) / height, 128, 255], o);
      }
    const fine = await encodeWebp(wasm, rgba, width, height, 90);
    expect(vp8Size(fine)).toEqual({ width, height });
    const coarse = await encodeWebp(wasm, rgba, width, height, 20);
    expect(coarse.length).toBeLessThan(fine.length);
    // the size it says in its RIFF header is the file's
    expect(new DataView(fine.buffer).getUint32(4, true) + 8).toBe(fine.length);
  });

  test("refuses pixels that are not its size", async () => {
    await expect(encodeWebp(wasm, new Uint8Array(10), 2, 2, 80)).rejects.toThrow(/disagree/);
  });
});
