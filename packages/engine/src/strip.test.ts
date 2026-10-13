import { expect, test } from "vitest";
import { golden } from "../test/support.ts";
import { decodePalette } from "./codec.ts";
import { sampleStops } from "./curve.ts";
import type { Palette } from "./palette.ts";
import { curveData, yC, yH, yL } from "./plot.ts";
import { cellAt, layoutStops, placeMark, type StripLayout } from "./strip.ts";

const colors = golden<{
  strips: {
    seed: string;
    n: number;
    width: number;
    oneRow: boolean;
    layout: StripLayout;
    cellAt: unknown[];
    placeMark: unknown[];
  }[];
  curves: { seed: string; srgb: Record<string, unknown>; p3: Record<string, unknown> }[];
}>("colors");

test("the stop strip fuses, breaks into rows and sizes its labels as before", () => {
  for (const s of colors.strips) {
    const stops = sampleStops(decodePalette(s.seed) as Palette, s.n).map(x => ({ hex: x.hex }));
    const layout = layoutStops(stops, s.width, s.oneRow);
    expect(layout).toEqual(s.layout);
    expect([0, 0.37, 1].map(t => cellAt(layout, s.n, t))).toEqual(s.cellAt);
    expect([0, 0.5, 1].map(t => placeMark(layout, s.n, t))).toEqual(s.placeMark);
  }
});

test("the plots' data is as before, worked out once per palette", () => {
  for (const c of colors.curves) {
    const P = decodePalette(c.seed) as Palette;
    const d = curveData(P);
    const w = curveData(P, 96, true);
    expect({
      cTop: d.cTop,
      askVisible: d.askVisible,
      hLo: d.hLo,
      hHi: d.hHi,
      hueSegments: d.hueSegments,
      hexes: d.samples.map(s => s.hex),
      ceil: d.samples.map(s => s.ceil)
    }).toEqual(c.srgb);
    expect({ cTop: w.cTop, askVisible: w.askVisible, hLo: w.hLo, hHi: w.hHi }).toEqual(c.p3);
    expect(curveData(P)).toBe(d);
  }
  expect([yL(0.25, 100), yC(0.1, 0.2, 100), yH(180, 120, 240, 100)]).toEqual([75, 50, 50]);
});
