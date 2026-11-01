import { decodePalette } from "@grabient/engine";
import type { Palette } from "@grabient/engine/palette.ts";
import { describe, expect, test } from "vitest";
import {
  CSS_LOOKS,
  inLook,
  LOOKS,
  type Look,
  lookOf,
  pickFitting,
  pickLook,
  plainOf,
  seeded,
  shuffled,
  type Taken
} from "./looks.ts";

const SEED = "kWPgBjqiK5UIirpZorp5IA6Y";
const PALETTE = decodePalette(SEED) as Palette;
const SEEDS = [
  SEED,
  "kUzkiw66E-e4YQltnUXg",
  "kWede9SdS_WExOrXTdG1szDY",
  "kEURB2VmMuMcBluB99F7A",
  "kCeiDOgAAH_fDA4A",
  "kEVpjrmgSF4XhjABAHhjA"
];

describe("seeded", () => {
  test("gives the same number for a seed and a name each time, from 0 up to 1", () => {
    expect(seeded(SEED, "poster")).toBe(seeded(SEED, "poster"));
    for (const name of ["poster", "album", "hero", "a", "b"]) {
      const n = seeded(SEED, name);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
  test("lands names a letter apart far apart", () => {
    const values = Array.from({ length: 200 }, (_, i) => seeded(SEED, `part${i}`));
    const low = values.filter(v => v < 0.5).length;
    expect(low).toBeGreaterThan(70);
    expect(low).toBeLessThan(130);
  });
  test("shuffles every item in, the same each time", () => {
    const order = shuffled(LOOKS, SEED, "poster");
    expect([...order].sort()).toEqual([...LOOKS].sort());
    expect(shuffled(LOOKS, SEED, "poster")).toEqual(order);
  });
});

describe("inLook", () => {
  test("lays the glass and the blob at one angle a page, whatever part shows them", () => {
    const angles = (look: Look) =>
      new Set(
        ["poster", "album", "icon", "hero"].map(
          part => inLook(SEED, PALETTE, look, part).view.angle
        )
      );
    expect(angles("glass").size).toBe(1);
    expect(angles("blob").size).toBe(1);
    expect(inLook(SEED, PALETTE, "blob", "poster").effect?.look.shape).toBe(
      inLook(SEED, PALETTE, "blob", "icon").effect?.look.shape
    );
  });
  test("gives bands four to eight steps, never fewer than the palette's keyframes, and rings no angle of their own", () => {
    for (const part of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      const bands = inLook(SEED, PALETTE, "bands", part);
      expect(bands.view.steps).toBeGreaterThanOrEqual(Math.max(4, PALETTE.anchors.length));
      expect(bands.view.steps).toBeLessThanOrEqual(Math.max(8, PALETTE.anchors.length));
      expect(inLook(SEED, PALETTE, "rings", part).view.angle).toBe(90);
    }
  });
  test("is read back as the look it is", () => {
    for (const look of LOOKS) expect(lookOf(inLook(SEED, PALETTE, look, "part"))).toBe(look);
  });
});

describe("pickLook", () => {
  test("takes the looks the parts before took least, so eleven parts show every look", () => {
    for (const seed of SEEDS) {
      const palette = decodePalette(seed) as Palette;
      const taken: Taken = new Map();
      const looks = Array.from({ length: 11 }, (_, i) =>
        lookOf(pickLook(seed, palette, `part${i}`, LOOKS, () => true, taken))
      );
      expect(new Set(looks).size).toBe(LOOKS.length);
      expect(Math.max(...taken.values()) - Math.min(...taken.values())).toBeLessThanOrEqual(1);
    }
  });
  test("takes a look the part is a good fit for, and the first where it fits none", () => {
    const taken: Taken = new Map();
    const glass = pickLook(SEED, PALETTE, "part", LOOKS, s => lookOf(s) === "glass", taken);
    expect(lookOf(glass)).toBe("glass");
    const none = pickLook(SEED, PALETTE, "other", CSS_LOOKS, () => false, new Map());
    expect(CSS_LOOKS).toContain(lookOf(none));
    expect(taken.get("glass")).toBe(1);
  });
  test("is the same each time for a palette, and differs between palettes", () => {
    const pageOf = (seed: string) => {
      const palette = decodePalette(seed) as Palette;
      const taken: Taken = new Map();
      return ["hero", "poster", "album", "post"].map(part => {
        const s = pickLook(seed, palette, part, LOOKS, () => true, taken);
        return `${lookOf(s)}@${s.view.angle}`;
      });
    };
    expect(pageOf(SEED)).toEqual(pageOf(SEED));
    expect(new Set(SEEDS.map(seed => pageOf(seed).join())).size).toBeGreaterThan(1);
  });
  test("finds no look where a part fits none, and counts none", () => {
    const taken: Taken = new Map();
    expect(pickFitting(SEED, PALETTE, "letters", LOOKS, () => false, taken)).toBeNull();
    expect(taken.size).toBe(0);
  });
});

test("the page's palette before any part takes a look is its own gradient across", () => {
  expect(plainOf(SEED, PALETTE)).toMatchObject({
    seed: SEED,
    effect: null,
    view: { style: "linearGradient", angle: 90 }
  });
});
