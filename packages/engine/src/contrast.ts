/* WCAG 2 contrast, for what a page says of two colors as text and ground, and the contrast picture: a palette's colors
   as grounds side by side and a row to each ink, white, black, then each of the palette's own that reads on another of
   its colors, then each of the reader's own text colors whether it reads or not. An ink is set on a ground at the size
   its contrast is enough for: text from 4.5 to 1, large text from 3, nothing under that. */
import { contrastOf, hexToSrgb, luminance as luminanceOf, srgbToLab } from "./color.ts";

/** The relative luminance of a hex color; 0 for a string that is no color. */
export const luminance = (hex: string) => {
  const rgb = hexToSrgb(hex);
  return rgb ? luminanceOf(rgb) : 0;
};
/** The contrast of two hex colors, 1 for the same to 21 for black on white. */
export const contrast = (a: string, b: string) => contrastOf(luminance(a), luminance(b));
export const withBlack = (hex: string) => (luminance(hex) + 0.05) / 0.05;
export const withWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05);
/** A contrast as a page writes it, two places and never rounded up: 4.496 is 4.49, which does not pass at 4.5. */
export const contrastText = (ratio: number) => (Math.floor(ratio * 100) / 100).toFixed(2);

export const CONTRAST_TEXT = 4.5;
export const CONTRAST_LARGE = 3;
/** WCAG's enhanced level for text, which the page names. */
export const CONTRAST_AAA = 7;
/** The reader's own text colors a picture takes at most. */
export const CONTRAST_MINE = 12;
const GROUNDS = 8;
const INKS = ["#ffffff", "#000000"];
/** CIELAB distance a reader cannot see: its straight run near black keeps #000001 beside black. */
const SAME = 2.3;

/** At most eight of the colors, the first and the last among them, evenly taken. */
export function contrastGrounds<T>(colors: readonly T[]): T[] {
  if (colors.length <= GROUNDS) return [...colors];
  return Array.from(
    { length: GROUNDS },
    (_, i) => colors[Math.round((i * (colors.length - 1)) / (GROUNDS - 1))]
  );
}
export interface ContrastInk {
  hex: string;
  /** the ground that is this ink's own color, never set on; -1 for white, black and the reader's */
  at: number;
  /** its contrast on each ground, 0 on its own */
  ratios: number[];
  /** one of the reader's own text colors: its place among them */
  mine?: number;
}
/* what a row draws on a ground: text, large text only, or nothing */
const drawn = (ratio: number) => (ratio >= CONTRAST_TEXT ? 2 : ratio >= CONTRAST_LARGE ? 1 : 0);
const labOf = (hex: string) => srgbToLab(hexToSrgb(hex) ?? [0, 0, 0]);
const apart = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** The inks that have a row. A color is never two rows: a ground a row above already is, or that a reader could not
    tell from a row above that draws the same samples, has none; a reader's color that is white, black, a ground or one
    of theirs before it has none. */
export function contrastInks(
  grounds: readonly string[],
  mine: readonly string[] = []
): ContrastInk[] {
  const ratiosOf = (hex: string, at: number) =>
    grounds.map((ground, j) => (j === at ? 0 : contrast(hex, ground)));
  const rows: ContrastInk[] = INKS.map(hex => ({ hex, at: -1, ratios: ratiosOf(hex, -1) }));
  grounds.forEach((ground, at) => {
    const ink = { hex: ground.toLowerCase(), at, ratios: ratiosOf(ground, at) };
    if (!ink.ratios.some(ratio => ratio >= CONTRAST_LARGE)) return;
    const own = labOf(ink.hex);
    const seen = rows.some(
      row =>
        row.hex === ink.hex ||
        (apart(labOf(row.hex), own) < SAME &&
          row.ratios.every((ratio, j) => drawn(ratio) === drawn(ink.ratios[j])))
    );
    if (!seen) rows.push(ink);
  });
  const shown = new Set([...INKS, ...grounds.map(hex => hex.toLowerCase())]);
  const theirs = mine.slice(0, CONTRAST_MINE).map(hex => hex.toLowerCase());
  return [
    ...rows,
    ...theirs.flatMap((hex, i) =>
      shown.has(hex) || theirs.indexOf(hex) < i
        ? []
        : [{ hex, at: -1, mine: i, ratios: ratiosOf(hex, -1) }]
    )
  ];
}
/** Whether a color would repeat a row: white, black, a ground, or one of the reader's own but the one at `except`. */
export function contrastTaken(
  hex: string,
  grounds: readonly string[],
  mine: readonly string[],
  except = -1
): boolean {
  const h = hex.toLowerCase();
  return (
    INKS.includes(h) ||
    grounds.some(ground => ground.toLowerCase() === h) ||
    mine.some((ink, j) => j !== except && ink.toLowerCase() === h)
  );
}

/** The picture's measures, the page's own design tokens: the ink column, a ground's width, a row's height, the
    grounds' corner radius, a coin's size, the two sample sizes, and the face. */
export interface ContrastMeasures {
  ink: number;
  band: number;
  row: number;
  radius: number;
  coin: number;
  text: number;
  large: number;
  weight: string;
  family: string;
}
export interface ContrastPicture {
  width: number;
  height: number;
  grounds: { hex: string; x: number }[];
  coins: { hex: string; y: number }[];
  samples: { hex: string; x: number; y: number; size: number }[];
}
/* a sample's baseline under its row's middle: half of what a capital stands over the line */
const DROP = 0.35;
/* a coin's rim, so white shows on a white page and black on a black one */
const RIM = "#808080";
/** The picture's parts and where each stands, in pixels, for an SVG (`contrastSvg`) or a canvas to draw. */
export function contrastPicture(
  colors: readonly string[],
  mine: readonly string[],
  m: ContrastMeasures
): ContrastPicture {
  const grounds = contrastGrounds(colors);
  const inks = contrastInks(grounds, mine);
  return {
    width: m.ink + grounds.length * m.band,
    height: inks.length * m.row,
    grounds: grounds.map((hex, j) => ({ hex, x: m.ink + j * m.band })),
    coins: inks.map((ink, i) => ({ hex: ink.hex, y: i * m.row + m.row / 2 })),
    samples: inks.flatMap((ink, i) =>
      ink.ratios.flatMap((ratio, j) => {
        if (ratio < CONTRAST_LARGE) return [];
        const size = ratio >= CONTRAST_TEXT ? m.text : m.large;
        return [
          {
            hex: ink.hex,
            x: m.ink + (j + 0.5) * m.band,
            y: i * m.row + m.row / 2 + size * DROP,
            size
          }
        ];
      })
    )
  };
}
/** The picture as an SVG file, its address in a comment so a file found later says where it came from. */
export function contrastSvg(
  colors: readonly string[],
  address: string | undefined,
  mine: readonly string[],
  m: ContrastMeasures
): string {
  const p = contrastPicture(colors, mine, m);
  return `${[
    `<svg xmlns="http://www.w3.org/2000/svg" width="${p.width}" height="${p.height}" viewBox="0 0 ${p.width} ${p.height}">`,
    ...(address ? [`<!-- ${address.replace(/--/g, "-%2D")} -->`] : []),
    `<clipPath id="grounds"><rect x="${m.ink}" width="${p.width - m.ink}" height="${p.height}" rx="${m.radius}"/></clipPath>`,
    `<g clip-path="url(#grounds)">`,
    ...p.grounds.map(
      g => `  <rect x="${g.x}" width="${m.band}" height="${p.height}" fill="${g.hex}"/>`
    ),
    "</g>",
    `<g stroke="${RIM}" stroke-opacity="0.5">`,
    ...p.coins.map(
      c => `  <circle cx="${m.coin / 2}" cy="${c.y}" r="${m.coin / 2 - 0.5}" fill="${c.hex}"/>`
    ),
    "</g>",
    `<g font-family="${m.family.replace(/"/g, "'")}" font-weight="${m.weight}" text-anchor="middle">`,
    ...p.samples.map(
      t =>
        `  <text x="${t.x}" y="${+t.y.toFixed(2)}" font-size="${t.size}" fill="${t.hex}">Aa</text>`
    ),
    "</g>",
    "</svg>"
  ].join("\n")}\n`;
}
