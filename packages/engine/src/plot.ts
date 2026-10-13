/* The plots' data: the curve sampled along t, what the screen delivers against what the curve asks, the gamut's
   ceiling, and the scales of the lightness, chroma and hue strips. */
import { fitChroma, lchToSrgb, oklabToLinear, srgbToLch, type Triple, toHex } from "./color.ts";
import { sampleLCH, unwrapStrip } from "./curve.ts";
import { clamp, clamp01, DEG } from "./math.ts";
import type { Palette } from "./palette.ts";

/** Under this delivered chroma the hue is noise, and the hue strip draws nothing. */
export const HUE_MIN_C = 0.02;
/** The ask shows apart from the delivery once the gamut took at least this much chroma. */
const ASK_EPS = 0.004;

/** The most chroma the target gamut shows at this lightness and hue. */
export function maxChromaAt(L: number, H: number, wide = false): number {
  if (L <= 0 || L >= 1) return 0;
  if (wide) return fitChroma(L, 0.6, H, true);
  const ca = Math.cos(H * DEG);
  const sa = Math.sin(H * DEG);
  const fits = (C: number) =>
    oklabToLinear(L, C * ca, C * sa).every(v => v >= -1e-4 && v <= 1 + 1e-4);
  let lo = 0;
  let hi = 0.5;
  if (fits(hi)) return hi;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (fits(m)) lo = m;
    else hi = m;
  }
  return lo;
}

export interface CurveSample {
  t: number;
  ask: Triple;
  out: Triple;
  hex: string;
  ceil: number;
}
export interface CurveAnchor {
  t: number;
  l: number;
  c: number;
  h: number;
  chromatic: boolean;
}
export interface CurveData {
  samples: CurveSample[];
  anchors: CurveAnchor[];
  /** the chroma strip's top: the ceiling or the ask, rounded out to 0.05 */
  cTop: number;
  askVisible: boolean;
  hLo: number;
  hHi: number;
  /** index ranges where the hue curve is drawn */
  hueSegments: [number, number][];
}

/* the three plots ask for the same samples at every move of a drag: worked out once per palette, which is never
   changed in place */
const kept = new WeakMap<Palette, Map<string, CurveData>>();
export function curveData(P: Palette, n = 96, wide = false): CurveData {
  const key = `${n} ${wide}`;
  const byKey = kept.get(P) ?? new Map<string, CurveData>();
  const known = byKey.get(key);
  if (known) return known;
  const data = curveDataOf(P, n, wide);
  kept.set(P, byKey.set(key, data));
  return data;
}
function curveDataOf(P: Palette, n: number, wide: boolean): CurveData {
  const K = P.anchors.length;
  const samples: CurveSample[] = [];
  const delivered: Triple[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const ask = sampleLCH(P, t);
    const rgb = lchToSrgb(ask[0], ask[1], ask[2]);
    delivered.push(
      wide
        ? [clamp01(ask[0]), fitChroma(clamp01(ask[0]), ask[1], ask[2], true), ask[2]]
        : srgbToLch(rgb)
    );
    samples.push({ t, ask, out: [0, 0, 0], hex: toHex(rgb), ceil: 0 });
  }
  const unwrapped = unwrapStrip(delivered);
  /* the delivered hue in the curve's own turn */
  const shift = 360 * Math.round((samples[0] ? sampleLCH(P, 0)[2] - unwrapped[0][2] : 0) / 360);
  let askVisible = false;
  let cMax = 0;
  samples.forEach((s, i) => {
    s.out = [unwrapped[i][0], unwrapped[i][1], unwrapped[i][2] + shift];
    s.ceil = maxChromaAt(s.out[0], s.out[2], wide);
    if (s.ask[1] - s.out[1] > ASK_EPS) askVisible = true;
    cMax = Math.max(cMax, s.ask[1], s.ceil);
  });
  const cTop = clamp(Math.ceil((cMax + 0.005) / 0.05) * 0.05, 0.1, 0.5);
  const anchors = P.anchors.map((a, i) => ({
    t: K === 1 ? 0.5 : i / (K - 1),
    l: a.l,
    c: a.c,
    h: a.h,
    chromatic: a.c >= HUE_MIN_C
  }));
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of samples) {
    if (s.out[1] >= HUE_MIN_C) {
      lo = Math.min(lo, s.out[2]);
      hi = Math.max(hi, s.out[2]);
    }
  }
  for (const a of anchors) {
    if (a.chromatic) {
      lo = Math.min(lo, a.h);
      hi = Math.max(hi, a.h);
    }
  }
  if (!Number.isFinite(lo)) {
    lo = 0;
    hi = 360;
  }
  const hLo = Math.floor(lo / 30) * 30;
  const hHi = Math.max(Math.ceil(hi / 30) * 30, hLo + 30);
  const hueSegments: [number, number][] = [];
  let start = -1;
  for (let i = 0; i <= n; i++) {
    const on = i < n && samples[i].out[1] >= HUE_MIN_C;
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      if (i - start >= 2) hueSegments.push([start, i]);
      start = -1;
    }
  }
  return { samples, anchors, cTop, askVisible, hLo, hHi, hueSegments };
}

/** A readable stroke for a hue on the hue strip, at a fixed mid lightness and chroma. */
export const hueInk = (h: number) => toHex(lchToSrgb(0.65, 0.12, h));
/** A value's height on its strip, `h` pixels tall, from the top. */
export const yL = (l: number, h: number) => (1 - clamp01(l)) * h;
export const yC = (c: number, cTop: number, h: number) => (1 - clamp01(c / cTop)) * h;
export const yH = (deg: number, hLo: number, hHi: number, h: number) =>
  (1 - (deg - hLo) / (hHi - hLo)) * h;
