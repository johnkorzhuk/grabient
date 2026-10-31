/* The palette's colors the fluted glass shows (glass.ts), in a module of its own: the editor names them for the server's
   still without loading the glass's drawing. */
import { toHex } from "./color.ts";
import { sampleSrgb } from "./curve.ts";
import type { Palette } from "./palette.ts";

/** How many of the palette's colors the glass takes, evenly along its curve. */
const COLORS = 6;

/** The palette's colors the glass shows, as #rrggbb. */
export const glassColors = (P: Palette): string[] =>
  Array.from({ length: COLORS }, (_, i) => toHex(sampleSrgb(P, i / (COLORS - 1))));

/** The name the glass's still goes by in a page, for the angle its ribs run at and the colors: "90|#aabbcc,…". The
    server writes the still under it (server/glass-still.ts), and every holder that shows the same still names it. */
export const glassStillKey = (colors: readonly string[], angle: number): string =>
  `${angle}|${colors.join(",")}`;

/** A still's name read back, or null for one no page wrote. */
export function readStillKey(key: string): { angle: number; colors: string[] } | null {
  const [a, list] = key.split("|");
  const angle = Number(a);
  const colors = (list ?? "").split(",");
  return Number.isInteger(angle) &&
    angle >= 0 &&
    angle <= 360 &&
    colors.length >= 2 &&
    colors.every(c => /^#[0-9a-f]{6}$/.test(c))
    ? { angle, colors }
    : null;
}
