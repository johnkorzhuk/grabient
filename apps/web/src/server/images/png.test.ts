import { blobStill } from "@grabient/engine/blob.ts";
import { decodePalette } from "@grabient/engine/codec.ts";
import { expect, test } from "vitest";
import { at, decodePng } from "../../../test/png.ts";
import { encodePng } from "./png.ts";

test("a picture with alpha is written as RGBA and reads back byte for byte", async () => {
  const rgba = Uint8Array.of(255, 0, 0, 255, 0, 128, 255, 0, 10, 20, 30, 128);
  const png = await decodePng(await encodePng(3, 1, rgba, true));
  expect([png.width, png.height, png.alpha]).toEqual([3, 1, true]);
  expect([...png.pixels]).toEqual([...rgba]);
  await expect(encodePng(3, 1, rgba)).rejects.toThrow("12 bytes are no 3 by 1 picture");
});

test("the blob's first frame as a PNG: clear around the blob, opaque in its middle", async () => {
  const palette = decodePalette("kS4mdDYzY8lhFPW")!;
  const view = { focus: true, fill: false };
  const png = await decodePng(
    await encodePng(120, 90, blobStill(palette, view, { width: 120, height: 90 }), true)
  );
  expect(png.alpha).toBe(true);
  expect(at(png, 0, 0)[3]).toBe(0);
  expect(at(png, 60, 45)[3]).toBe(255);
});
