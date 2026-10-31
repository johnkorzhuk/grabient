import { describe, expect, test } from "vitest";
import { golden, lcg } from "../test/support.ts";
import {
  fitChroma,
  hexToSrgb,
  lchToP3,
  lchToSrgb,
  lchToSrgbBytes,
  oklabToLinearP3,
  p3ToLch,
  srgbToLab,
  srgbToLch,
  srgbToOklab,
  type Triple,
  toCssP3,
  toHex
} from "./color.ts";
import { okhsvPaint, okhsvToSrgb, srgbToOkhsv } from "./okhsv.ts";

interface Conversion {
  rgb: Triple;
  ask: Triple;
  [key: string]: unknown;
}
const { conversions } = golden<{ conversions: Conversion[] }>("colors");

test("conversions give the same doubles as before", () => {
  for (const c of conversions) {
    const [L, C, H] = c.ask;
    expect({
      rgb: c.rgb,
      oklab: srgbToOklab(...c.rgb),
      lch: srgbToLch(c.rgb),
      okhsv: srgbToOkhsv(c.rgb),
      ask: c.ask,
      srgb: lchToSrgb(L, C, H),
      p3: lchToP3(L, C, H),
      fit: fitChroma(L, C, H, false),
      fitWide: fitChroma(L, C, H, true),
      fit12: fitChroma(L, C, H, false, 12),
      hex: toHex(lchToSrgb(L, C, H)),
      cssP3: toCssP3(lchToP3(L, C, H)),
      okhsvBack: okhsvToSrgb(...srgbToOkhsv(c.rgb)),
      p3ToLch: p3ToLch(lchToP3(L, C, H)),
      lab: srgbToLab(c.rgb)
    }).toEqual(Object.fromEntries(Object.entries(c).filter(([key]) => key !== "name")));
  }
});

test("OKLab matches Ottosson's reference and sRGB round-trips", () => {
  const [L, a, b] = srgbToOklab(1, 0, 0);
  expect(L).toBeCloseTo(0.627955, 4);
  expect(a).toBeCloseTo(0.224863, 4);
  expect(b).toBeCloseTo(0.125846, 4);
  const rand = lcg(1);
  for (let i = 0; i < 200; i++) {
    const rgb = [rand(), rand(), rand()];
    lchToSrgb(...srgbToLch(rgb)).forEach((v, j) => {
      expect(v).toBeCloseTo(rgb[j], 3);
    });
  }
  expect(hexToSrgb(" 0052FF ")).toEqual([0, 82 / 255, 1]);
  expect(hexToSrgb("#0052f")).toBeNull();
});

test("Display-P3 is a wider cube that holds sRGB and never shows less chroma", () => {
  expect(oklabToLinearP3(1, 0, 0).every(v => Math.abs(v - 1) < 2e-3)).toBe(true);
  let wider = 0;
  for (let li = 1; li < 10; li++) {
    for (let h = 0; h < 360; h += 15) {
      const narrow = fitChroma(li / 10, 0.45, h, false);
      const wide = fitChroma(li / 10, 0.45, h, true);
      expect(wide).toBeGreaterThanOrEqual(narrow - 1e-9);
      if (wide > narrow + 0.005) wider++;
    }
  }
  expect(wider).toBeGreaterThan(60);
  expect(toCssP3([0.5, 0.25, 0.125])).toBe("color(display-p3 0.5000 0.2500 0.1250)");
});

test("a picture's bytes are lchToSrgb's, after its fit of as many steps", () => {
  const rand = lcg(7);
  const out = new Uint8ClampedArray(4);
  for (let i = 0; i < 40_000; i++) {
    const L = rand() * 1.2 - 0.1;
    const C = rand() * 0.45 - 0.02;
    const H = rand() * 720 - 360;
    for (const steps of [12, 24]) {
      lchToSrgbBytes(L, C, H, steps, out, 0);
      const want = lchToSrgb(L, fitChroma(L, C, H, false, steps), H).map(v => Math.round(v * 255));
      expect([...out.subarray(0, 3)]).toEqual(want);
    }
  }
});

describe("Okhsv", () => {
  test("white at the top start, black along the foot, the hue's most colorful color at the top end", () => {
    for (const h of [0, 29.2, 90, 142.5, 200, 264, 330]) {
      expect(toHex(okhsvToSrgb(h, 0, 1))).toBe("#ffffff");
      expect(toHex(okhsvToSrgb(h, 0.7, 0))).toBe("#000000");
    }
    for (const corner of ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#00ffff", "#ff00ff"]) {
      const [h, s, v] = srgbToOkhsv(hexToSrgb(corner) as Triple);
      expect(Math.abs(s - 1)).toBeLessThan(2e-3);
      expect(Math.abs(v - 1)).toBeLessThan(2e-3);
      expect(toHex(okhsvToSrgb(h, 1, 1))).toBe(corner);
    }
    expect(srgbToOkhsv([0.5, 0.5, 0.5]).slice(0, 2)).toEqual([0, 0]);
  });
  test("the painted field is the same colors within rounding", () => {
    const cols = 24;
    const rows = 10;
    const out = new Uint8ClampedArray(cols * rows * 4);
    for (const h of [0, 75, 210, 333]) {
      okhsvPaint(h, cols, rows, out);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const want = okhsvToSrgb(h, x / (cols - 1), 1 - y / (rows - 1)).map(c => c * 255);
          const at = (y * cols + x) * 4;
          want.forEach((c, j) => {
            expect(Math.abs(c - out[at + j])).toBeLessThanOrEqual(0.51);
          });
          expect(out[at + 3]).toBe(255);
        }
      }
    }
  });
});
