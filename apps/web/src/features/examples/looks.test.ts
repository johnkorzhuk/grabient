import { decodePalette } from "@grabient/engine";
import { EFFECTS } from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { describe, expect, test } from "vitest";
import {
  CSS_LOOKS,
  finished,
  finishFor,
  inLook,
  LOOKS,
  type Look,
  lookOf,
  looksFor,
  pickFitting,
  pickLook,
  plainOf,
  seeded,
  shuffled,
  smoothSteps,
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
  test("lays the sandstone at its designed steps, and a look a reader turns to at steps of its own within its range", () => {
    expect(inLook(SEED, PALETTE, "strata", "hero").effect?.look.steps).toBeNull();
    const turned = Array.from(
      { length: 12 },
      (_, n) => inLook(SEED, PALETTE, "strata", "hero", 0, `strata~${n + 1}`).effect?.look.steps
    );
    for (const steps of turned) expect(steps == null || (steps >= 8 && steps <= 40)).toBe(true);
    expect(new Set(turned).size).toBeGreaterThan(3);
    /* every other effect, turned to, takes none */
    for (const kind of EFFECTS.filter(other => other !== "strata"))
      expect(
        inLook(SEED, PALETTE, kind, "hero", 0, `${kind}~1`).effect?.look.steps,
        kind
      ).toBeNull();
  });
});

describe("pickLook", () => {
  test("takes the looks the parts before took least, so as many parts as there are looks show every look", () => {
    for (const seed of SEEDS) {
      const palette = decodePalette(seed) as Palette;
      const taken: Taken = new Map();
      const looks = Array.from({ length: LOOKS.length }, (_, i) =>
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

describe("smoothSteps", () => {
  test("keeps a palette whose colors move slowly at the default steps", () => {
    const pastel: Palette = {
      anchors: [
        { l: 0.85, c: 0.06, h: 240 },
        { l: 0.82, c: 0.07, h: 290 }
      ]
    };
    expect(smoothSteps(pastel)).toBe(7);
  });
  test("gives a palette whose hue turns fast more steps, up to a most, so its gradient shows no stripes", () => {
    const twice: Palette = {
      anchors: [
        { l: 0.7, c: 0.15, h: 0 },
        { l: 0.7, c: 0.15, h: 720 }
      ]
    };
    const steps = smoothSteps(twice);
    expect(steps).toBeGreaterThan(14);
    expect(steps).toBeLessThanOrEqual(48);
    expect(inLook(SEED, twice, "gradient", "part").view.steps).toBe(steps);
  });
  test("never gives fewer steps than the palette's keyframes", () => {
    const eight: Palette = {
      anchors: Array.from({ length: 8 }, (_, i) => ({ l: 0.5 + i * 0.01, c: 0.02, h: 200 }))
    };
    expect(smoothSteps(eight)).toBeGreaterThanOrEqual(8);
  });
});

describe("looksFor", () => {
  const first = inLook(SEED, PALETTE, "gradient", "profile");
  test("starts at the page's own look, then gives others, each unlike every one before it", () => {
    const looks = looksFor(first, "profile", LOOKS, () => true);
    expect(looks[0]).toBe(first);
    expect(looks.length).toBeGreaterThan(6);
    expect(looks.length).toBeLessThanOrEqual(24);
    const keys = looks.map(s =>
      [lookOf(s), s.view.steps, s.view.angle, s.effect?.look.shape].join()
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(looks.map(lookOf)).size).toBe(LOOKS.length);
  });
  test("gives only looks the part is a good fit for, the same each time", () => {
    const bandsOnly = (s: Parameters<typeof lookOf>[0]) => lookOf(s) === "bands";
    const looks = looksFor(first, "chart", LOOKS, bandsOnly);
    expect(looks.slice(1).every(bandsOnly)).toBe(true);
    expect(looksFor(first, "chart", LOOKS, bandsOnly).map(s => s.view.angle)).toEqual(
      looks.map(s => s.view.angle)
    );
  });
  test("turns an effect to angles and shapes of its own, where the page's are one a page", () => {
    const hero = inLook(SEED, PALETTE, "blob", "hero");
    const blobs = looksFor(hero, "hero", ["glass", "blob"], () => true).filter(s => s.effect);
    expect(new Set(blobs.map(s => `${s.view.angle}|${s.effect?.look.shape}`)).size).toBeGreaterThan(
      4
    );
  });
});

describe("finishes", () => {
  /* parts of many pages, each finished as the seed picks for it */
  const parts = SEEDS.flatMap(seed =>
    Array.from({ length: 80 }, (_, i) => ({ seed, name: `part${i}` }))
  );
  const share = (
    kind: Parameters<typeof finishFor>[2],
    has: (f: ReturnType<typeof finishFor>) => boolean
  ) => parts.filter(({ seed, name }) => has(finishFor(seed, name, kind))).length / parts.length;

  test("the rosette mostly takes a little soft and a little grain, but not always", () => {
    const both = share("rosette", f => !!f.soft && !!f.grain);
    expect(both).toBeGreaterThan(0.7);
    expect(both).toBeLessThan(0.9);
    for (const { seed, name } of parts) {
      const f = finishFor(seed, name, "rosette");
      if (f.soft) expect([12, 20, 28]).toContain(f.soft);
      if (f.grain) expect([16, 24, 32]).toContain(f.grain);
    }
    expect(share("rosette", f => !f.soft && !f.grain)).toBeGreaterThan(0.05);
  });

  test("another effect and a gradient take none half the time, the gradient's soft stronger", () => {
    for (const kind of ["glass", "silk", "papercut", null] as const) {
      const none = share(kind, f => !f.soft && !f.grain);
      expect(none).toBeGreaterThan(0.4);
      expect(none).toBeLessThan(0.6);
    }
    for (const { seed, name } of parts) {
      const soft = finishFor(seed, name, null).soft;
      if (soft) expect(soft).toBeGreaterThanOrEqual(40);
    }
  });

  test("a blob takes the grain the seed picks for its part, never a soft", () => {
    for (const { seed, name } of parts) {
      const blob = finished(inLook(seed, decodePalette(seed) as Palette, "blob", name), name);
      expect(blob.view.soft).toBeUndefined();
      expect(blob.view.grain).toBe(finishFor(seed, name, "blob").grain);
    }
  });

  test("a look takes the finish the seed picks for its part and its kind", () => {
    const rosette = inLook(SEED, PALETTE, "rosette", "poster");
    expect(finished(rosette, "poster").view).toEqual({
      ...rosette.view,
      ...finishFor(SEED, "poster", "rosette")
    });
    const plain = inLook(SEED, PALETTE, "gradient", "poster");
    expect(finished(plain, "poster").view).toEqual({
      ...plain.view,
      ...finishFor(SEED, "poster", null)
    });
  });
});
