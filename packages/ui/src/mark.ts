/* The mark: the wordmark's bar alone, for wherever the site is one square (a tab, bookmarks, a home screen). The bar is
   as wide as the square and stands on its bottom edge, its colors left to right: a palette's on its page, a search's or
   a collection's on theirs, and the week's everywhere else (`weekMark`). A tab's icon sits on the browser's tab strip,
   which follows the browser's theme and not the site's, so the icon is drawn per browser scheme: a color too near the
   strip's lightness moves to the nearest lightness clear of it, keeping its hue and chroma (`legibleStops`). */
import { hexToSrgb, lchToSrgb, srgbToLch, toHex } from "@grabient/engine/color.ts";
import { sampleStops } from "@grabient/engine/curve.ts";

/** The mark's square, 32 units a side, so the bar's top edge falls on a whole pixel at 16 and at 32. */
export const MARK_VIEWBOX = "0 0 32 32";
/** The bar: 8 units tall, 4 pixels in a tab, where the wordmark's own proportions would give 3. */
export const MARK_BAR = { x: 0, y: 24, w: 32, h: 8 } as const;
export type MarkScheme = "light" | "dark";
/** The colors of the icons that never change, and of a mark given none: the brand's gradient. */
export const MARK_FIXED: readonly string[] = ["#ffd25f", "#ff5f6d", "#a17fff"];
/** One gradient for both schemes, or one for each. */
export type MarkFill =
  | readonly string[]
  | { readonly light: readonly string[]; readonly dark: readonly string[] };

/* The tab strips an icon stands on, by OKLab lightness, from the browsers' own tables: Chrome's light strip at 0.91 and
   its selected dark tab at 0.36. A color moves away from that edge. */
const STRIP = { light: { edge: 0.91, away: -1 }, dark: { edge: 0.36, away: 1 } } as const;
/* how far from the strip, in OKLab, a color is seen at sixteen pixels; one at least this colorful never moves */
const CLEAR = 0.15;

/** The colors as drawn in a browser of this scheme: each too near the strip moved in lightness alone to the nearest
    lightness clear of it, then fitted to sRGB by chroma as the engine fits any color. A color that gives up chroma on
    the way needs more lightness, so the move is measured again; a hair past the limit keeps the 8-bit rounding on the
    clear side, so moving again moves nothing. */
export function legibleStops(stops: readonly string[], scheme: MarkScheme): string[] {
  const { edge, away } = STRIP[scheme];
  const limit = (C: number) =>
    edge + away * (Math.sqrt(Math.max(0, CLEAR * CLEAR - C * C)) + 0.004);
  const clear = (L: number, C: number) => (away < 0 ? L <= limit(C) : L >= limit(C));
  return stops.map(hex => {
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
/** A week the icon can be drawn for, as markWeek writes it. */
export const MARK_WEEK = /^(\d{4})-w(0[1-9]|[1-4]\d|5[0-3])$/;

/* the week's name to a number (FNV-1a), and that to a stream of numbers (mulberry32): the same week draws the same
   colors wherever it is drawn */
function fnv1a(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* the light band lifts a hue near yellow's middle: an orange or a yellow at 0.58 reads brown or olive */
function yellowLift(h: number): number {
  const d = Math.abs(((((h - 95) % 360) + 540) % 360) - 180);
  return d < 55 ? 0.13 * Math.cos(((d / 55) * Math.PI) / 2) ** 2 : 0;
}
const WEEK_STOPS = 16;
/** The week's colors for pages without their own: a route of hue 80 to 160 degrees long, high in chroma, in a band of
    lightness that stands on a light strip (about 0.58, yellows lifted) and one that stands on a dark strip (about 0.8),
    the same hues in both, so the week reads as one color in either browser. */
export function weekMark(week: string): { light: string[]; dark: string[] } {
  const next = mulberry32(fnv1a(week));
  const h0 = next() * 360;
  const travel = (next() < 0.5 ? -1 : 1) * (80 + next() * 80);
  const slope = (next() - 0.5) * 0.1;
  const c = 0.15 + next() * 0.05;
  const band = (base: number, lift: boolean) =>
    sampleStops(
      {
        anchors: [0, 0.5, 1].map(t => {
          const h = h0 + travel * t;
          return { l: base + slope * (t - 0.5) + (lift ? yellowLift(h) : 0), c, h };
        })
      },
      WEEK_STOPS
    ).map(s => s.hex);
  return { light: band(0.58, true), dark: band(0.8, false) };
}

const n3 = (v: number) => String(+v.toFixed(3)).replace(/^(-?)0\./, "$1.");
const svg = (body: string, viewBox = MARK_VIEWBOX) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`;
interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
const gradient = (id: string, colors: readonly string[]) =>
  `<linearGradient id="${id}">${colors.map((c, i) => `<stop offset="${n3(i / (colors.length - 1))}" stop-color="${c}"/>`).join("")}</linearGradient>`;
const rect = (box: Box, paint?: string) =>
  `<rect${box.x ? ` x="${n3(box.x)}"` : ""} y="${n3(box.y)}" width="${n3(box.w)}" height="${n3(box.h)}"${paint ? ` fill="${paint}"` : ""}/>`;
const bar = (colors: readonly string[], box: Box = MARK_BAR, id = "b") =>
  colors.length > 1 ? `${gradient(id, colors)}${rect(box, `url(#${id})`)}` : rect(box, colors[0]);
function paired(
  fill?: MarkFill | null
): { light: readonly string[]; dark: readonly string[] } | null {
  if (!fill) return null;
  if ("light" in fill) return fill.light.length && fill.dark.length ? fill : null;
  return fill.length ? { light: fill, dark: fill } : null;
}

/** The mark as an SVG document: the bar in the colors, made legible for each scheme, or in the brand's gradient where
    there are none. With a scheme it is that scheme's alone; without one, the light scheme's stands and the dark one's
    applies under prefers-color-scheme: dark, so a browser that never says dark draws the light one. */
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
      `${light.length > 1 ? gradient("l", light) : ""}${dark.length > 1 ? gradient("d", dark) : ""}${rect(MARK_BAR)}`
  );
}

/** The name of a week's picture, which the addresses of its files carry: the same wherever the week is drawn, and
    another once the drawing changes, so no browser shows a picture it kept under the address of a new one. */
export function weekPicture(week: string): string {
  const colors = weekMark(week);
  return fnv1a(markSvg(colors, "light") + markSvg(colors)).toString(36);
}

/** An SVG as a data address, escaped only where it must be: quotes made single, and %, #, < and > encoded. */
export const svgDataUrl = (source: string): string =>
  `data:image/svg+xml,${source.replace(/"/g, "'").replace(/[%#<>]/g, c => encodeURIComponent(c))}`;

/* The bar where the icon is its own ground, as tall for its width as a tab's. On the tile's 16 units it is 2 in from
   the sides and the bottom, a whole unit tall, so its edges are whole pixels at 16, 32 and 48; on the square's 100 it
   is 22 in, its corners 39.6 from the middle, inside a maskable icon's safe circle of 40. */
const TILE_H = Math.round((12 * MARK_BAR.h) / MARK_BAR.w);
const TILE_BAR: Box = { x: 2, y: 14 - TILE_H, w: 12, h: TILE_H };
const SQUARE_H = (56 * MARK_BAR.h) / MARK_BAR.w;
const SQUARE_BAR: Box = { x: 22, y: 78 - SQUARE_H, w: 56, h: SQUARE_H };
/** The mark on a ground of its own, for the icons that never change: a rounded `tile` (favicon-tile.ico, which cannot
    tell a light browser from a dark one) or a full `square` a device cuts its own shape from. */
export function markTileSvg(
  ground: string,
  colors: readonly string[],
  form: "tile" | "square" = "square"
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
