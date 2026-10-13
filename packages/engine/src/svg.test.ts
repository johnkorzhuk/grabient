import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { golden } from "../test/support.ts";
import { decodePalette } from "./codec.ts";
import { sampleStops } from "./curve.ts";
import type { Palette } from "./palette.ts";
import { artworkSvg, type Credit, type PaletteSvgOptions, paletteSvg } from "./svg.ts";
import type { SizeChoice, Style, View } from "./view.ts";

type Expected = string | { sha256: string; length: number; head: string };
interface Extra {
  seed?: string;
  style: Style;
  angle: number;
  steps?: number;
  size?: SizeChoice;
  hexes?: string[];
  options?: PaletteSvgOptions;
  credit?: Credit;
  svg: string;
}
const { entries, extra } = golden<{
  entries: { id: string; seed: string; view: View; svg: Record<Style, Expected> }[];
  extra: Extra[];
}>("svg");
const ORIGIN = "https://grabient.com";
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const matches = (text: string, want: Expected) =>
  typeof want === "string"
    ? text === want
    : sha256(text) === want.sha256 && text.length === want.length && text.startsWith(want.head);

test("the SVG file in every style is as before", () => {
  for (const e of entries) {
    const stops = sampleStops(decodePalette(e.seed) as Palette, e.view.steps);
    for (const [style, want] of Object.entries(e.svg) as [Style, Expected][]) {
      const text = artworkSvg(stops, { ...e.view, style }, e.seed, ORIGIN);
      if (typeof want === "string") expect(text, `${e.id} ${style}`).toBe(want);
      else expect(matches(text, want), `${e.id} ${style}`).toBe(true);
    }
  }
});

test("sizes, corners, shared ids, and lists of no color or one", () => {
  for (const x of extra) {
    let text: string;
    if (x.size && x.seed && x.steps) {
      const stops = sampleStops(decodePalette(x.seed) as Palette, x.steps);
      text = artworkSvg(
        stops,
        { style: x.style, steps: x.steps, angle: x.angle, size: x.size },
        x.seed,
        ORIGIN
      );
    } else if (x.options && x.seed) {
      text = paletteSvg(
        x.hexes ?? [],
        x.style,
        x.angle,
        { seed: x.seed, search: "?steps=8&angle=13", baseUrl: ORIGIN },
        x.options
      );
    } else {
      text = paletteSvg(
        x.hexes ?? [],
        x.style,
        x.angle,
        x.credit ?? { seed: "kAB--CD", search: "" }
      );
    }
    expect(text).toBe(x.svg);
  }
});

test("no XML comment holds `--`", () => {
  for (const e of entries.slice(0, 50)) {
    const stops = sampleStops(decodePalette(e.seed) as Palette, e.view.steps);
    const text = artworkSvg(stops, e.view, `${e.seed}--`, ORIGIN);
    for (const comment of text.match(/<!--([\s\S]*?)-->/g) ?? [])
      expect(comment.slice(4, -3)).not.toContain("--");
  }
});
