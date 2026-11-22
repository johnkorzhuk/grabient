/* A color's kin: its shades, and the colors that go with it by where their hues stand around the wheel from its own.
   Each is a palette of hex colors, so a page that names one color can show them as it shows any palette's codes, and
   open each in the editor. Hues are OKLCH's, turned at the color's own lightness and chroma, and each color is drawn
   as the nearest sRGB shows it (color.ts lchToSrgb). */
import { encodePalette } from "./codec.ts";
import { hexToSrgb, lchToSrgb, srgbToLch, toHex } from "./color.ts";
import { anchorsFromHexes } from "./spec.ts";

export type KinKind = "shades" | "complementary" | "analogous" | "triadic" | "split";
/** One of a color's kin: its colors in order, and the seed of the palette they make. */
export interface ColorKin {
  readonly kind: KinKind;
  readonly hexes: readonly string[];
  readonly seed: string;
}

/** The lightnesses of a color's shades, lightest first, the color's own among them. */
const SHADES = [0.95, 0.87, 0.77, 0.66, 0.54, 0.42, 0.3];
/** How far around the wheel each kind's colors stand from the color's hue. */
const TURNS: readonly (readonly [KinKind, readonly number[]])[] = [
  ["complementary", [0, 180]],
  ["analogous", [-30, 0, 30]],
  ["triadic", [0, 120, 240]],
  ["split", [0, 150, 210]]
];
/** Below this chroma a color is a gray, and no hue stands across from it. */
const GRAY = 0.02;

const made = (kind: KinKind, hexes: string[]): ColorKin | null => {
  const palette = anchorsFromHexes(hexes);
  return palette ? { kind, hexes, seed: encodePalette(palette) } : null;
};

/** A color's shades, light to dark with the color itself in its place among them, then its complementary, analogous,
    triadic and split complementary colors; a gray has shades alone. Empty for anything that is no hex color. */
export function colorKin(hex: string): ColorKin[] {
  const rgb = hexToSrgb(hex);
  if (!rgb) return [];
  const own = toHex(rgb);
  const [l, c, h] = srgbToLch(rgb);
  /* a shade keeps the hue and as much of the chroma as its lightness shows: a tint and a deep shade hold less */
  const nearest = SHADES.reduce(
    (at, L, i) => (Math.abs(L - l) < Math.abs(SHADES[at] - l) ? i : at),
    0
  );
  const shades = SHADES.map((L, i) =>
    i === nearest ? own : toHex(lchToSrgb(L, c * (1 - Math.abs(L - l) * 0.6), h))
  );
  const kin = [made("shades", shades)];
  if (c >= GRAY)
    for (const [kind, turns] of TURNS)
      kin.push(
        made(
          kind,
          turns.map(turn => (turn ? toHex(lchToSrgb(l, c, h + turn)) : own))
        )
      );
  return kin.filter(k => k !== null);
}
