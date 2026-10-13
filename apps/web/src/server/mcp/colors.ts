import { canonical } from "@grabient/engine/codec.ts";
import { fitChroma, hexToSrgb, lchToSrgb, srgbToOklab, toHex } from "@grabient/engine/color.ts";
import { srgbName } from "@grabient/engine/colorname.ts";
import { sampleLCH } from "@grabient/engine/curve.ts";
import { type Anchor, K_MAX, K_MIN, type Palette } from "@grabient/engine/palette.ts";
import { anchorsFromHexes } from "@grabient/engine/spec.ts";

/* Hex colors as an app sends them, made a palette, and what an answer says of one: a blend that shows a hue nobody
   chose, each color's name and contrast. Pure. */

/** Chroma under which a color is a gray, whose hue is its neighbor's. */
const GRAY = 0.01;
/** Chroma under which a keyframe has no hue the eye reads: a just-noticeable step in OKLab. */
const JND = 0.02;
/* A blend passes through another hue when the curve's middle is this far, in OKLab, from the middle of the straight
   line between its ends, is itself this colorful, and sits this many degrees from the hue of each end that has one. */
const OFF_LINE = 0.06;
const OFF_CHROMA = 0.04;
const OFF_HUE = 30;
/* Only beside a keyframe this near gray, whose hue nobody chose: between two colors a blend always crosses the hues
   between them, and the answer's own colors show them. */
const NEAR_GRAY = 0.04;

/** A keyframe's own color: a near gray's is at its own tint's hue, whatever hue it carries along the curve. */
export const hexOf = (a: Anchor) => toHex(lchToSrgb(a.l, a.c, a.own ?? a.h));

/** #rgb or #rrggbb, with or without the #, as #rrggbb in lower case; null for anything else. */
export function hexColor(text: unknown): string | null {
  const hex =
    typeof text === "string" ? /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim())?.[1] : undefined;
  if (!hex) return null;
  const lower = hex.toLowerCase();
  return `#${lower.length === 3 ? lower.replace(/./g, "$&$&") : lower}`;
}

/** What was sent, quoted and cut by code point, so never through half a character. */
export const quoted = (value: unknown) => JSON.stringify([...String(value)].slice(0, 40).join(""));

/** 2 to 8 hex colors in order as a palette: each color held as its hex, hues unwrapped the short way, and grays and
    near grays carrying their neighbor's hue. */
export function colorsToPalette(
  hexes: readonly unknown[]
): { palette: Palette; notes: string[] } | { error: string } {
  if (hexes.length < K_MIN || hexes.length > K_MAX) {
    return {
      error: `A palette takes ${K_MIN} to ${K_MAX} hex colors, and this list has ${hexes.length}.`
    };
  }
  const asked = hexes.map(hexColor);
  const bad = asked.indexOf(null);
  if (bad >= 0) {
    return {
      error: `Color ${bad + 1} is ${quoted(hexes[bad])}, and a color is taken as hex: #rrggbb or #rgb.`
    };
  }
  const palette = canonical(anchorsFromHexes(asked as string[]) as Palette);
  return { palette, notes: paletteNotes(palette) };
}

/** What to know of a palette before showing it: each blend beside a near gray that passes through a hue neither of
    its two colors has. A keyframe drawn under a just-noticeable chroma has no hue to compare. */
export function paletteNotes(palette: Palette): string[] {
  const P = canonical(palette);
  const A = P.anchors;
  const notes: string[] = [];
  const fitted = A.map(a => fitChroma(a.l, a.c, a.h));
  const drawn = A.map(a => srgbToOklab(...lchToSrgb(a.l, a.c, a.own ?? a.h)));
  let gray = false;
  for (let i = 0; i + 1 < A.length; i++) {
    if (fitted[i]! >= NEAR_GRAY && fitted[i + 1]! >= NEAR_GRAY) continue;
    const at = sampleLCH(P, (i + 0.5) / (A.length - 1));
    const middle = lchToSrgb(...at);
    const lab = srgbToOklab(...middle);
    const line = lab.map((v, j) => v - (drawn[i]![j]! + drawn[i + 1]![j]!) / 2);
    const offLine = Math.hypot(...line) > OFF_LINE && Math.hypot(lab[1], lab[2]) > OFF_CHROMA;
    const otherHue = [i, i + 1].every(
      k => fitted[k]! < JND || Math.abs(((((at[2] - A[k]!.h) % 360) + 540) % 360) - 180) > OFF_HUE
    );
    if (!offLine || !otherHue) continue;
    notes.push(
      `The blend from ${hexOf(A[i]!)} to ${hexOf(A[i + 1]!)} passes through ${toHex(middle)}, a hue neither color has.`
    );
    gray ||= [i, i + 1].some(k => Math.hypot(drawn[k]![1], drawn[k]![2]) < GRAY);
  }
  return gray ? [...notes, "A gray listed twice in a row keeps each side its own hue."] : notes;
}

/** WCAG 2 contrast to two places, never rounded up across the 3 or the 4.5 it asks of text. */
function ratio(exact: number): number {
  const parts = Math.round(exact * 100);
  const crossed = [300, 450].some(bar => exact * 100 < bar && parts >= bar);
  return (crossed ? parts - 1 : parts) / 100;
}
const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** Each color's name, the one most people give it, and its contrast with white and with black. */
export function details(hexes: readonly string[]) {
  return hexes.map(hex => {
    const rgb = hexToSrgb(hex)!;
    const [r, g, b] = rgb.map(linear) as [number, number, number];
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return {
      hex,
      name: srgbName(rgb),
      onWhite: ratio(1.05 / (y + 0.05)),
      onBlack: ratio((y + 0.05) / 0.05)
    };
  });
}
