/* The curve: a uniform Catmull-Rom spline through the anchors on each axis, at even t. The ends repeat the end anchor,
   so two anchors make a cubic ease and the curve passes through every anchor. Where it overshoots, lightness is
   clamped to 0..1 and chroma to 0 or more; the render then fits the gamut (color.ts). */
import { lchToSrgb, type Triple, toHex } from "./color.ts";
import { clamp01, DEG } from "./math.ts";
import type { Anchor, Palette } from "./palette.ts";

function catmull(A: readonly Anchor[], value: (a: Anchor) => number, t: number): number {
  const n = A.length;
  if (n === 1) return value(A[0]);
  const x = clamp01(t) * (n - 1);
  const i = Math.min(n - 2, Math.floor(x));
  const u = x - i;
  const p0 = value(A[Math.max(0, i - 1)]);
  const p1 = value(A[i]);
  const p2 = value(A[i + 1]);
  const p3 = value(A[Math.min(n - 1, i + 2)]);
  return (
    p1 + 0.5 * u * (p2 - p0 + u * (2 * p0 - 5 * p1 + 4 * p2 - p3 + u * (3 * (p1 - p2) + p3 - p0)))
  );
}

const lightness = (a: Anchor) => a.l;
const chroma = (a: Anchor) => a.c;
const hue = (a: Anchor) => a.h;

/** The curve at t, hue unwrapped. A near gray carries the hue beside it, so its faint tint never turns a blend through
    another hue; what lies between its tint and the carried hue rides along as a curve of its own in OKLab, where a
    tint that small has no angle to turn through. */
export function sampleLCH(P: Palette, t: number): Triple {
  const A = P.anchors;
  const L = clamp01(catmull(A, lightness, t));
  const C = Math.max(0, catmull(A, chroma, t));
  const H = catmull(A, hue, t);
  if (!A.some(a => a.own !== undefined)) return [L, C, H];
  const ride = (f: (rad: number) => number) =>
    catmull(A, a => (a.own === undefined ? 0 : a.c * (f(a.own * DEG) - f(a.h * DEG))), t);
  const x = C * Math.cos(H * DEG) + ride(Math.cos);
  const y = C * Math.sin(H * DEG) + ride(Math.sin);
  const turn = Math.atan2(y, x) / DEG - H;
  return [L, Math.hypot(x, y), H + turn - 360 * Math.round(turn / 360)];
}
export const sampleSrgb = (P: Palette, t: number) => lchToSrgb(...sampleLCH(P, t));
export const sampleHex = (P: Palette, t: number) => toHex(sampleSrgb(P, t));

/** A stop of the gradient reading: where it is, its sRGB color, and the curve's OKLCH color it was fitted from. */
export interface Stop {
  t: number;
  hex: string;
  rgb: Triple;
  lch: Triple;
}
/** `n` stops at even t, never fewer than two. */
export function sampleStops(P: Palette, n: number): Stop[] {
  const m = Math.max(2, Math.round(n));
  return Array.from({ length: m }, (_, i) => {
    const t = i / (m - 1);
    const lch = sampleLCH(P, t);
    const rgb = lchToSrgb(lch[0], lch[1], lch[2]);
    return { t, hex: toHex(rgb), rgb, lch };
  });
}

/** A sampled [L, C, H] strip with its hue made continuous. A sample under 0.008 chroma carries the running hue, so a
    black stop never reads as a lap, and grays that lead borrow the first colored hue. */
export function unwrapStrip(strip: readonly Triple[]): Triple[] {
  const out = strip.map(s => [...s] as Triple);
  let last: number | null = null;
  for (const s of out) {
    if (s[1] < 0.008) {
      if (last != null) s[2] = last;
      continue;
    }
    if (last != null) {
      let d = s[2] - last;
      d -= 360 * Math.round(d / 360);
      s[2] = last + d;
    }
    last = s[2];
  }
  for (let i = out.length - 2; i >= 0; i--) if (strip[i][1] < 0.008) out[i][2] = out[i + 1][2];
  return out;
}
