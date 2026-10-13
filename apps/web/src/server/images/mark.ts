/* The mark: the wordmark's bar alone, for wherever the site is one square (a tab, a bookmark, a home screen). The bar is
   as wide as the square and stands on its bottom edge. Its colors run left to right as the wordmark's bar does: a
   palette's on its page, a search's or a collection's on theirs, the week's everywhere else, new each week.

   A tab's icon sits on the browser's tab strip, which follows the browser's theme, so the icon is drawn per scheme. A
   color too near the strip's lightness moves to the nearest lightness clear of it, darker on a light strip and lighter
   on a dark one, keeping its hue and chroma, so a pale palette never draws a blank tab. Colorful colors, and so most
   palettes, are drawn as they are. Pure: the page's head and the browser draw a palette's icon with it, the Worker the
   week's files. */
import { hexToSrgb, lchToSrgb, srgbToLch, toHex } from "@grabient/engine/color.ts";
import { sampleStops } from "@grabient/engine/curve.ts";

export type MarkScheme = "light" | "dark";
/** One gradient for both schemes, or one for each. */
export type MarkFill =
  | readonly string[]
  | { readonly light: readonly string[]; readonly dark: readonly string[] };

/** The brand's gradient, gold to coral to violet: the fixed icons', and the mark's given no colors. */
export const MARK_FIXED: readonly string[] = ["#ffd25f", "#ff5f6d", "#a17fff"];

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
/* The square is 32 units so the bar's top edge falls on a whole pixel at 16 and at 32. The bar is 8 tall, 4 pixels in a
   tab, where the wordmark's own proportions would give 3 and be hard to see. */
const VIEWBOX = "0 0 32 32";
const BAR: Box = { x: 0, y: 24, w: 32, h: 8 };

/* The tab strips an icon stands on, by OKLab lightness, from the browsers' own color tables: for a light browser the
   darkest, Chrome's at 0.91; for a dark one the lightest, Chrome's selected tab at 0.36. A color within CLEAR of the strip
   (chroma counted) moves away from it. */
const STRIP = { light: { edge: 0.91, away: -1 }, dark: { edge: 0.36, away: 1 } } as const;
const CLEAR = 0.15;

/** The colors as a browser in this scheme is drawn them. A color that gives up chroma on the way back into sRGB needs
    more lightness, so the move is measured again from what it became; a hair past the limit keeps the 8-bit rounding
    on the clear side, so moving again moves nothing. */
export function legibleStops(colors: readonly string[], scheme: MarkScheme): string[] {
  const { edge, away } = STRIP[scheme];
  const limit = (C: number) =>
    edge + away * (Math.sqrt(Math.max(0, CLEAR * CLEAR - C * C)) + 0.004);
  const clear = (L: number, C: number) => (away < 0 ? L <= limit(C) : L >= limit(C));
  return colors.map(hex => {
    const rgb = hexToSrgb(hex);
    if (!rgb) return hex;
    const [L0, C0, H] = srgbToLch(rgb);
    let out = hex.toLowerCase();
    if (clear(L0, C0)) return out;
    let C = C0;
    for (let i = 0; i < 4; i++) {
      out = toHex(lchToSrgb(limit(C), C0, H));
      const [L, c] = srgbToLch(hexToSrgb(out) ?? rgb);
      if (clear(L, c)) break;
      C = Math.min(C, c);
    }
    return out;
  });
}

/** The ISO week a time falls in, in UTC, as the icon names it: `2026-w40`. */
export function markWeek(time: number): string {
  const day = new Date(time);
  const at = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  const thursday = new Date(at + (4 - (new Date(at).getUTCDay() || 7)) * 86_400_000);
  const year = thursday.getUTCFullYear();
  const week = Math.ceil(((thursday.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-w${String(week).padStart(2, "0")}`;
}
/** A week as markWeek names it. */
export const MARK_WEEK = /^\d{4}-w(0[1-9]|[1-4]\d|5[0-3])$/;

/* A number from the week's name, then a stream of numbers from it (FNV-1a, then mulberry32): one week draws the same
   colors wherever it is drawn. */
function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function streamOf(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** How far a hue sits from yellow's middle, lifting it in the light band: an orange or a yellow at 0.58 reads brown. */
function yellowLift(h: number): number {
  const d = Math.abs(((((h - 95) % 360) + 540) % 360) - 180);
  return d < 55 ? 0.13 * Math.cos(((d / 55) * Math.PI) / 2) ** 2 : 0;
}

/** The week's colors for pages without their own: one route of hue, 80 to 160 degrees long and colorful, read at 16
    stops in a band of lightness for a light strip (around 0.58, yellows lifted) and one for a dark strip (around 0.8).
    Both take the same hues, so the week reads as one color in either browser. */
export function weekMark(week: string): { light: string[]; dark: string[] } {
  const next = streamOf(hashOf(week));
  const h0 = next() * 360;
  const way = next() < 0.5 ? -1 : 1;
  const travel = way * (80 + next() * 80);
  const slope = (next() - 0.5) * 0.1;
  const c = 0.15 + next() * 0.05;
  const band = (base: number, lift: boolean) => {
    const anchors = [0, 0.5, 1].map(t => {
      const h = h0 + travel * t;
      return { l: base + slope * (t - 0.5) + (lift ? yellowLift(h) : 0), c, h };
    });
    return sampleStops({ anchors }, 16).map(stop => stop.hex);
  };
  return { light: band(0.58, true), dark: band(0.8, false) };
}

const n3 = (v: number) => String(+v.toFixed(3)).replace(/^(-?)0\./, "$1.");
const svg = (body: string, viewBox = VIEWBOX) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`;
const gradient = (id: string, colors: readonly string[]) =>
  `<linearGradient id="${id}">${colors.map((c, i) => `<stop offset="${n3(i / (colors.length - 1))}" stop-color="${c}"/>`).join("")}</linearGradient>`;
const rect = (box: Box, paint?: string) =>
  `<rect${box.x ? ` x="${n3(box.x)}"` : ""} y="${n3(box.y)}" width="${n3(box.w)}" height="${n3(box.h)}"${paint ? ` fill="${paint}"` : ""}/>`;
const bar = (colors: readonly string[], box = BAR) =>
  colors.length > 1 ? `${gradient("b", colors)}${rect(box, "url(#b)")}` : rect(box, colors[0]);

function paired(fill: MarkFill | null | undefined) {
  if (!fill) return null;
  if ("light" in fill) return fill.light.length && fill.dark.length ? fill : null;
  return fill.length ? { light: fill, dark: fill } : null;
}

/** The mark as an SVG document in these colors, each scheme's made legible on its strip, or in the brand's gradient
    where there are none. With a scheme it is that scheme's alone. Without one the light scheme's is unconditional and
    the dark one's applies under prefers-color-scheme: dark, so a browser that never says dark gets the light one. */
export function markSvg(fill?: MarkFill | null, scheme?: MarkScheme): string {
  const both = paired(fill) ?? { light: MARK_FIXED, dark: MARK_FIXED };
  if (scheme) return svg(bar(legibleStops(both[scheme], scheme)));
  const light = legibleStops(both.light, "light");
  const dark = legibleStops(both.dark, "dark");
  if (light.join() === dark.join()) return svg(bar(light));
  const paint = (colors: readonly string[], id: string) =>
    colors.length > 1 ? `url(#${id})` : colors[0];
  return svg(
    `<style>rect{fill:${paint(light, "l")}}@media (prefers-color-scheme:dark){rect{fill:${paint(dark, "d")}}}</style>` +
      `${light.length > 1 ? gradient("l", light) : ""}${dark.length > 1 ? gradient("d", dark) : ""}${rect(BAR)}`
  );
}

/* Where the icon is its own ground the bar is as tall for its width as a tab's. On a tile's 16 units it is 2 in from
   the sides and the bottom, every edge on a whole pixel at 16, 32 and 48; on a square's 100 it is 22 in, its corners
   inside a maskable icon's safe circle. */
const TILE_BAR: Box = { x: 2, y: 11, w: 12, h: 3 };
const SQUARE_BAR: Box = { x: 22, y: 64, w: 56, h: 14 };

/** The mark on a ground of its own, for the icons that cannot follow the browser's scheme: a `tile` is the .ico and its
    PNGs, the bar on a rounded tile; a `square` is a home screen's, whose device cuts its own shape. */
export function markTileSvg(
  ground: string,
  colors: readonly string[],
  form: "tile" | "square"
): string {
  return form === "tile"
    ? svg(
        `<rect width="16" height="16" rx="3.5" fill="${ground}"/>${bar(colors, TILE_BAR)}`,
        "0 0 16 16"
      )
    : svg(
        `<rect width="100" height="100" fill="${ground}"/>${bar(colors, SQUARE_BAR)}`,
        "0 0 100 100"
      );
}

/** An SVG as a data: address, escaped only where it must be: quotes made single, and %, #, < and > encoded. */
export const svgDataUrl = (source: string) =>
  `data:image/svg+xml,${source.replace(/"/g, "'").replace(/[%#<>]/g, c => encodeURIComponent(c))}`;
