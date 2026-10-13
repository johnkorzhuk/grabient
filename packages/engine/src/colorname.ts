/* A color's name as most people say it: the XKCD color survey's answers, one name per cell of a CIELAB grid
   (colornames.data.ts). Every name is an English message, so "dark blue" is translated as one phrase. The color named
   is the one drawn: an OKLCH reading is fitted into sRGB first. */
import { BASE64URL } from "./codec.ts";
import { lchToSrgb, srgbToLab } from "./color.ts";
import { CELLS, COLOR_FAMILIES, COLOR_NAMES, COLUMNS, GRID } from "./colornames.data.ts";

const code = (ch: string) => BASE64URL.indexOf(ch);
/* each (L, a) column's first b, its length and where its cells start, read once */
let columns: Int16Array | null = null;
function columnTable(): Int16Array {
  if (columns) return columns;
  const n = GRID.NL * GRID.NA;
  const out = new Int16Array(n * 3);
  for (let i = 0, start = 0; i < n; i++) {
    const length = code(COLUMNS[2 * i + 1]);
    out[3 * i] = code(COLUMNS[2 * i]);
    out[3 * i + 1] = length;
    out[3 * i + 2] = start;
    start += length;
  }
  columns = out;
  return out;
}

/** The English name of an sRGB color (0 to 1), the key of its translation. Every color has one: a color at the gamut's
    edge that rounds onto an empty column takes the nearest column with cells along a. */
export function srgbName(rgb: readonly number[]): string {
  const [L, a, b] = srgbToLab(rgb);
  const table = columnTable();
  const { L0, A0, B0, NL, NA, STEP } = GRID;
  const li = Math.min(NL - 1, Math.max(0, Math.round((L - L0) / STEP)));
  const want = Math.min(NA - 1, Math.max(0, Math.round((a - A0) / STEP)));
  for (let d = 0; d < NA; d++) {
    for (const ai of d ? [want - d, want + d] : [want]) {
      if (ai < 0 || ai >= NA) continue;
      const col = li * NA + ai;
      const length = table[3 * col + 1];
      if (!length) continue;
      const bi = Math.min(length - 1, Math.max(0, Math.round((b - B0) / STEP) - table[3 * col]));
      return COLOR_NAMES[code(CELLS[table[3 * col + 2] + bi])];
    }
  }
  return COLOR_NAMES[0];
}
/** The English name of the color an OKLCH reading draws. */
export const colorName = (l: number, c: number, h: number): string => srgbName(lchToSrgb(l, c, h));
/** A name's family: the hue it names (red, pink, orange, brown, yellow, green, teal, blue, purple), or neutral. */
export const colorFamily = (name: string): string => COLOR_FAMILIES[name] ?? "neutral";
