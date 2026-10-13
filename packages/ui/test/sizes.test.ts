import { describe, expect, test } from "vitest";
import {
  parseSide,
  resolveSize,
  SIZE_MAKERS,
  SIZE_MAX,
  SIZE_MIN,
  SIZE_PRESETS,
  type SizeChoice,
  screenPixels,
  sizePresetOf,
  sizeRows
} from "../src/sizes.ts";
import { golden } from "./support.ts";

type Dims = { width: number; height: number };
const sizes = golden<{
  SIZE_MIN: number;
  SIZE_MAX: number;
  presets: {
    value: string;
    label: string;
    w: number;
    h: number;
    part: string | null;
    group: boolean;
  }[];
  makers: { value: string; label: string; items: string[] }[];
  rows: { value: string; label: string; detail: string | null; items: number; group: boolean }[];
  resolve: [SizeChoice | null, Dims, Dims][];
  parseSide: [string, number | null][];
  presetOf: [SizeChoice | null, Dims | null, string][];
}>("sizes");

describe("sizes", () => {
  test("the presets and makers are the same rows in the same order", () => {
    expect([SIZE_MIN, SIZE_MAX]).toEqual([sizes.SIZE_MIN, sizes.SIZE_MAX]);
    expect(
      SIZE_PRESETS.map(p => ({
        value: p.value,
        label: p.label,
        w: p.w,
        h: p.h,
        part: p.part ?? null,
        group: !!p.group
      }))
    ).toEqual(sizes.presets);
    expect(
      SIZE_MAKERS.map(m => ({ value: m.value, label: m.label, items: m.items.map(p => p.value) }))
    ).toEqual(sizes.makers);
    const rows = sizeRows({ width: 1280, height: 720 }, { width: 1920, height: 1080 });
    expect(
      rows.map(r => ({
        value: r.value,
        label: r.label,
        detail: r.detail ?? null,
        items: r.items?.length ?? 0,
        group: !!r.group
      }))
    ).toEqual(sizes.rows);
  });

  test("every value is unique and every preset's pixels are a size the address takes", () => {
    const values = [
      ...SIZE_PRESETS.map(p => p.value),
      ...SIZE_MAKERS.map(m => m.value),
      "auto",
      "screen",
      "custom"
    ];
    expect(new Set(values).size).toBe(values.length);
    for (const p of SIZE_PRESETS) {
      expect(p.detail).toBe(`${p.w}×${p.h}`);
      for (const side of [p.w, p.h]) expect(side >= SIZE_MIN && side <= SIZE_MAX).toBe(true);
    }
  });

  test("an auto side follows the other at Auto's shape; typed sides read thousands and Auto", () => {
    for (const [choice, auto, want] of sizes.resolve)
      expect(resolveSize(choice, auto)).toEqual(want);
    for (const [text, want] of sizes.parseSide) {
      if (want === null) expect(parseSide(text)).toBeNaN();
      else expect(parseSide(text)).toBe(want);
    }
    for (const [choice, screen, want] of sizes.presetOf)
      expect(sizePresetOf(choice, screen)).toBe(want);
  });

  test("a screen's own pixels: Chromium's zoom taken out, a phone standing up, capped at the ceiling", () => {
    const read = (r: Partial<Parameters<typeof screenPixels>[0]>) =>
      screenPixels({
        width: 1920,
        height: 1080,
        devicePixelRatio: 1,
        outerWidth: 1920,
        innerWidth: 1920,
        outerHeight: 1050,
        innerHeight: 950,
        chromium: true,
        ...r
      });
    expect(read({})).toEqual({ width: 1920, height: 1080 });
    /* a 1440p screen at 125% system scale, the page zoomed to 110% */
    expect(
      read({
        width: 2048,
        height: 1152,
        devicePixelRatio: 1.375,
        outerWidth: 2048,
        innerWidth: 1862
      })
    ).toEqual({ width: 2560, height: 1440 });
    /* a phone held sideways: 411.43 points at 2.625 are 1080 */
    expect(
      read({ width: 868.57, height: 411.43, devicePixelRatio: 2.625, chromium: false })
    ).toEqual({
      width: 1080,
      height: 2280
    });
    expect(read({ width: 3840, height: 2160, devicePixelRatio: 2, chromium: false })).toEqual({
      width: 6000,
      height: 3375
    });
    expect(read({ width: 0 })).toBeNull();
  });
});
