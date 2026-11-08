/* The strings' designed ground (strings.ts): the palette's darkest color, deeper and greyer, what their ground is where
   their look names none, and what a picture that cannot be clear lays a clear or translucent ground over (a clip, a
   share card). Apart from the strings' model, so the editor's Background field shows it in its swatch with none of
   their drawing. */
import { lchToSrgb, srgbToLch } from "./color.ts";
import { sampleSrgb } from "./curve.ts";
import type { Palette } from "./palette.ts";

/** How the designed ground is made of the palette's darkest color: its lightness times `depth` up to `dark`, its
    chroma times `chroma` (strings.ts STRINGS_LOOK). */
export const STRINGS_GROUND = { dark: 0.16, depth: 0.35, chroma: 0.5 } as const;

/** Channels rounded to bytes, 0 to 1. */
export const stringsBytes = (rgb: readonly number[]): number[] =>
  rgb.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255) / 255);

/** The designed ground of a palette, 0..1 channels of bytes: its darkest color of 17 read along it, deeper and greyer. */
export function stringsDesignedGround(
  P: Palette,
  how: { dark: number; depth: number; chroma: number } = STRINGS_GROUND
): number[] {
  let darkest = sampleSrgb(P, 0);
  let dl = 2;
  for (let i = 0; i <= 16; i++) {
    const c = sampleSrgb(P, i / 16);
    const l = srgbToLch(c)[0];
    if (l < dl) {
      dl = l;
      darkest = c;
    }
  }
  const [Ld, Cd, Hd] = srgbToLch(darkest);
  return stringsBytes(lchToSrgb(Math.min(how.dark, Ld * how.depth), Cd * how.chroma, Hd));
}
