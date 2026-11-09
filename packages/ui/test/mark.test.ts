import { decodePalette } from "@grabient/engine/codec.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { expect, test } from "vitest";
import {
  legibleStops,
  MARK_BAR,
  MARK_FIXED,
  MARK_HALF,
  MARK_VIEWBOX,
  MARK_WEEK,
  type MarkScheme,
  markSvg,
  markTileSvg,
  markWeek,
  svgDataUrl,
  weekMark
} from "../src/mark.ts";
import { BRAND_SUPPLY } from "../src/supply.ts";
import { golden } from "./support.ts";

const mark = golden<{
  MARK_BAR: typeof MARK_BAR;
  MARK_FIXED: string[];
  MARK_VIEWBOX: string;
  markWeek: [string, string][];
  MARK_WEEK_ok: [string, boolean][];
  weekMark: [string, { light: string[]; dark: string[] }][];
  legibleStops: [MarkScheme, string[]][];
  markSvg: Record<string, string>;
  svgDataUrl: string;
  tile: string;
  square: string;
}>("mark");

test("the tab's mark: the week, its colors, legible on either strip, and the icons as files", () => {
  expect([MARK_BAR, MARK_FIXED, MARK_VIEWBOX]).toEqual([
    mark.MARK_BAR,
    mark.MARK_FIXED,
    mark.MARK_VIEWBOX
  ]);
  for (const [date, week] of mark.markWeek) expect(markWeek(Date.parse(date))).toBe(week);
  for (const [week, ok] of mark.MARK_WEEK_ok) expect(MARK_WEEK.test(week)).toBe(ok);
  for (const [week, colors] of mark.weekMark) expect(weekMark(week)).toEqual(colors);
  const probe = [
    "#ffffff",
    "#f0f0f0",
    "#e8e4d0",
    "#000000",
    "#101010",
    "#2a2a40",
    "#ff0000",
    "#3366cc",
    "#ffd25f"
  ];
  for (const [scheme, want] of mark.legibleStops) {
    expect(legibleStops(probe, scheme)).toEqual(want);
    expect(legibleStops(want, scheme)).toEqual(want);
  }
  const P = decodePalette(BRAND_SUPPLY[1]) as Palette;
  const stops = sampleStops(P, 16).map(s => s.hex);
  expect({
    none: markSvg(),
    palette: markSvg(stops),
    light: markSvg(stops, "light"),
    one: markSvg(["#336699"]),
    pair: markSvg({ light: ["#ffffff", "#eeeeee"], dark: ["#000000", "#111111"] })
  }).toEqual(mark.markSvg);
  expect(svgDataUrl(markSvg(["#336699"]))).toBe(mark.svgDataUrl);
  expect(markTileSvg("#0c0c0e", MARK_FIXED, "tile")).toBe(mark.tile);
  expect(markTileSvg("#0c0c0e", MARK_FIXED, "square")).toBe(mark.square);
});

test("the mark Google Search reads: the bar half way up its square, as wide as the circle a result cuts from it", () => {
  const svg = (body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}</svg>`;
  const stops = (id: string, first: string) =>
    `<linearGradient id="${id}"><stop offset="0" stop-color="${first}"/><stop offset=".5" stop-color="#ff5f6d"/><stop offset="1" stop-color="#a17fff"/></linearGradient>`;
  // the square's lower half: its top edge on the circle's widest line, a whole pixel at 16, 32, 48 and 180
  expect(MARK_HALF).toEqual({ x: 0, y: 16, w: 32, h: 16 });
  for (const side of [16, 32, 48, 180]) expect((side * MARK_HALF.y) % MARK_BAR.w).toBe(0);
  // in a file, the light scheme's colors, as the tab's bar is drawn in one
  expect(markSvg(MARK_FIXED, "light", MARK_HALF)).toBe(
    svg(`${stops("b", "#f6c955")}<rect y="16" width="32" height="16" fill="url(#b)"/>`)
  );
  expect(markSvg(MARK_FIXED, "light")).toBe(
    svg(`${stops("b", "#f6c955")}<rect y="24" width="32" height="8" fill="url(#b)"/>`)
  );
  // and by scheme where a browser reads it
  expect(markSvg(MARK_FIXED, undefined, MARK_HALF)).toBe(
    svg(
      `<style>rect{fill:url(#l)}@media (prefers-color-scheme:dark){rect{fill:url(#d)}}</style>${stops("l", "#f6c955")}${stops("d", "#ffd25f")}<rect y="16" width="32" height="16"/>`
    )
  );
});
