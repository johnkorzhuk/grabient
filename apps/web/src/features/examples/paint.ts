/* What a palette shows on its examples page, and what reads on it. Each example draws the palette as the page's address
   names it, or says how it draws it otherwise. Where words stand on a picture, the colors under them say which ink
   reads there, by WCAG 2's contrast: a gradient's are read off its geometry (the line, the cone or the circle the CSS
   draws, for a box of a given shape), the fluted glass's as the line of its six colors its ribs run across, a blob's as
   all its colors over its ground, which the page's own is where it has none. */
import { hexToSrgb, toHex } from "@grabient/engine/color.ts";
import { CONTRAST_LARGE, CONTRAST_TEXT, contrast } from "@grabient/engine/contrast.ts";
import { sampleHex, sampleStops } from "@grabient/engine/curve.ts";
import type { Effect } from "@grabient/engine/effect.ts";
import { glassColors } from "@grabient/engine/glass-colors.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { isSwatchStyle, type Style, type View } from "@grabient/engine/view.ts";

/** The palette as the page shows it: its seed, its colors, the view its address names, and the effect it plays where
    it names one. */
export interface Shown {
  seed: string;
  palette: Palette;
  view: Pick<View, "style" | "steps" | "angle">;
  effect: Effect | null;
}

export type Theme = "light" | "dark";

/** Each theme's ink as tokens.css has it: a light theme's on a light picture, a dark theme's on a dark one. */
export const THEME_INK: Readonly<Record<Theme, string>> = { light: "#17171b", dark: "#ececea" };
/** Each theme's page ground, which a blob with no ground of its own stands on. */
export const THEME_GROUND: Readonly<Record<Theme, string>> = { light: "#f3f2ee", dark: "#0c0c0e" };

/** Where a blob's colors are read along its palette, as the engine reads a blob's lights (blobBackdrop). */
const BLOB_PLACES = 9;

/** The colors a picture of the palette is drawn with, in order: a gradient's stops or its bands at the view's steps,
    the glass's six, the blob's palette at nine places. */
export function drawnColors(s: Shown): string[] {
  if (s.effect?.kind === "glass") return glassColors(s.palette);
  if (s.effect?.kind === "blob")
    return Array.from({ length: BLOB_PLACES }, (_, i) =>
      sampleHex(s.palette, i / (BLOB_PLACES - 1))
    );
  return sampleStops(s.palette, s.view.steps).map(stop => stop.hex);
}

/** A part of a box, as fractions of its width and height from its top left corner. */
export interface Part {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
/** The part as a right-to-left page lays it: the same distance from the other side. */
export const mirrored = (p: Part): Part => ({ x0: 1 - p.x1, y0: p.y0, x1: 1 - p.x0, y1: p.y1 });

/** The color at `t`, 0 to 1, of colors laid along a gradient's line as CSS lays them: blended in sRGB between stops
    spread from end to end (as D3's piecewise interpolateRgb blends a scale), or a band of each, all as wide (D3's
    quantize). */
export function colorAt(colors: readonly string[], t: number, bands: boolean): string {
  const n = colors.length;
  const u = Math.min(1, Math.max(0, t));
  if (bands || n < 2) return colors[Math.min(n - 1, Math.floor(u * n))];
  const x = u * (n - 1);
  const i = Math.min(n - 2, Math.floor(x));
  const A = hexToSrgb(colors[i]) ?? [0, 0, 0];
  const B = hexToSrgb(colors[i + 1]) ?? [0, 0, 0];
  return toHex(A.map((v, k) => v + (B[k] - v) * (x - i)));
}

/** Where along a gradient's line a point of a box `aspect` times as wide as tall stands, 0 to 1, as CSS draws the
    style: a linear gradient's line at the angle, a conic gradient's turn from the angle round the center, a circle's
    distance from the center to the farthest corner. */
function placeOf(style: Style, angle: number, aspect: number, x: number, y: number): number {
  const dx = (x - 0.5) * aspect;
  const dy = y - 0.5;
  if (style.startsWith("radial")) return Math.hypot(dx, dy) / Math.hypot(aspect / 2, 0.5);
  const turn = (angle * Math.PI) / 180;
  if (style.startsWith("angular")) {
    const around = (Math.atan2(dx, -dy) * 180) / Math.PI;
    return ((((around - angle) % 360) + 360) % 360) / 360;
  }
  const length = Math.abs(aspect * Math.sin(turn)) + Math.abs(Math.cos(turn));
  return 0.5 + (dx * Math.sin(turn) - dy * Math.cos(turn)) / length;
}

/* a part is read at this many points a side, its corners among them: enough for the narrowest band a contrast turns on */
const GRID = 9;
/* the glass bends its colors across its ribs: a point may show the line's colors this far either way */
const GLASS_BEND = 0.15;

/** The colors under a part of a box `aspect` times as wide as tall where the palette is its picture, as the page shows
    it. A blob's are all of its colors and its ground: the page's own in both themes where it has none, since a server
    draws the page before it knows the reader's theme. */
export function colorsUnder(s: Shown, part: Part, aspect: number): string[] {
  const colors = drawnColors(s);
  if (s.effect?.kind === "blob") {
    const ground = s.effect.look.bg?.slice(0, 7);
    return [...colors, ...(ground ? [ground] : [THEME_GROUND.dark, THEME_GROUND.light])];
  }
  const glass = s.effect?.kind === "glass";
  const style: Style = glass ? "linearGradient" : s.view.style;
  const bands = !glass && isSwatchStyle(style);
  const found = new Set<string>();
  for (let i = 0; i < GRID; i++)
    for (let j = 0; j < GRID; j++) {
      const x = part.x0 + ((part.x1 - part.x0) * i) / (GRID - 1);
      const y = part.y0 + ((part.y1 - part.y0) * j) / (GRID - 1);
      const t = placeOf(style, s.view.angle, aspect, x, y);
      for (const at of glass ? [t - GLASS_BEND, t, t + GLASS_BEND] : [t])
        found.add(colorAt(colors, at, bands));
    }
  return [...found];
}

/** The least contrast an ink has on any of the colors. */
export const worstContrast = (ink: string, colors: readonly string[]): number =>
  colors.reduce((least, color) => Math.min(least, contrast(ink, color)), 21);

/** White or black, whichever reads better on every one of the colors, with the least contrast it has there. */
export function inkOn(colors: readonly string[]): { ink: string; ratio: number } {
  const white = worstContrast("#ffffff", colors);
  const black = worstContrast("#000000", colors);
  return white >= black ? { ink: "#ffffff", ratio: white } : { ink: "#000000", ratio: black };
}

/** The theme whose ink reads on every one of the colors at `need` at least, the better of the two where both do; null
    where neither does. */
export function themeOn(colors: readonly string[], need: number = CONTRAST_TEXT): Theme | null {
  const dark = worstContrast(THEME_INK.dark, colors);
  const light = worstContrast(THEME_INK.light, colors);
  const best = dark >= light ? "dark" : "light";
  return Math.max(dark, light) >= need ? best : null;
}

/** The WCAG level text reaches at a contrast: AAA from 7, AA from 4.5, AA for large text from 3, none under that. */
export const contrastLevel = (ratio: number): "AAA" | "AA" | "AA Large" | null =>
  ratio >= 7 ? "AAA" : ratio >= CONTRAST_TEXT ? "AA" : ratio >= CONTRAST_LARGE ? "AA Large" : null;

/** A contrast as the page writes it: two places, never rounded up, so 4.496 is 4.49 and does not pass at 4.5. */
export const twoPlaces = (ratio: number): number => Math.floor(ratio * 100) / 100;

/** The palette's own color that stands out most from a page's ground: what a blob with no ground of its own is given
    where its clear parts must show, such as inside a headline's letters, so every letter reads on the page. */
export function groundOn(page: string, colors: readonly string[]): string {
  return colors.reduce(
    (best, color) => (contrast(color, page) > contrast(best, page) ? color : best),
    colors[0] ?? "#808080"
  );
}
