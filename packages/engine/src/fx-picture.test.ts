import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { decodePalette } from "./codec.ts";
import { EFFECTS, fxStillKey, hasPicture } from "./effect.ts";
import {
  FX_PICTURE_SIDE,
  FX_PICTURE_VERSION,
  fxPictureAddress,
  fxPictureBackground
} from "./fx-picture.ts";
import { fxPicturePixels } from "./fx-picture-draw.ts";
import { readFxStillKey } from "./fx-still.ts";

const P = decodePalette("kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ")!;
const look = { angle: 90, shape: 417, steps: null, zoom: null, path: null, bg: null };

/* The drawing each version of the pictures was made with: a small picture's pixels, hashed. A change to an effect's
   drawing that moves them fails here until FX_PICTURE_VERSION is counted up and its drawing pinned beside the last, so
   no browser or edge keeps a picture of the old drawing under the new one's address (they keep one 30 and 7 days). */
const DRAWINGS: Readonly<Record<number, string>> = {
  1: "df3e87b258b0f46e0422c19db2f4681066c5f8a0ae2dbf3ec5e6572c322972cb"
};

describe("a vector effect's still as a picture", () => {
  test("is the aurora's alone among the effects", () => {
    expect(EFFECTS.filter(hasPicture)).toEqual(["aurora"]);
  });

  test("is its first frame in the design square, by its CPU drawing, pinned to the pictures' version", () => {
    const side = 64;
    const pixels = fxPicturePixels("aurora", P, look, side);
    expect(pixels.length).toBe(side * side * 4);
    const hash = createHash("sha256").update(pixels).digest("hex");
    expect(hash, "the drawing changed: count FX_PICTURE_VERSION up and pin it").toBe(
      DRAWINGS[FX_PICTURE_VERSION]
    );
  });

  test("has an address that names the still a holder names, and covers any box as a vector still does", () => {
    const key = fxStillKey("aurora", "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ", {
      ...look,
      path: "line,25,25,curve,45,60,45,25",
      bg: "#0b0b1080"
    });
    const address = new URL(fxPictureAddress(key), "https://grabient.test");
    expect(address.pathname).toBe("/api/fx-still");
    expect(readFxStillKey(address.searchParams.get("k") ?? "")?.look).toMatchObject({
      shape: 417,
      path: "line,25,25,curve,45,60,45,25",
      bg: "#0b0b1080"
    });
    expect(address.searchParams.get("v")).toBe(String(FX_PICTURE_VERSION));
    expect(fxPictureBackground(key)).toBe(
      `url("${fxPictureAddress(key)}") 50% 50% / cover no-repeat`
    );
    expect(FX_PICTURE_SIDE).toBe(1024);
  });
});
