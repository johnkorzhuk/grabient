/* How the wordmark's bar moves from one palette to the next, in OKLCH so a tween never sags through gray. Four moves:
   a sweep from one end, the channels one after another, a lap of the hue wheel, and a wipe. The water moves the paint
   leaving the bar with the same math, so the bar and the water agree. */
import { hexToSrgb, lchToSrgb, srgbToLch, type Triple, toHex } from "@grabient/engine/color.ts";
import { clamp01, shortTurn } from "@grabient/engine/math.ts";

export type LCH = Triple;
export const MOVES = ["sweep", "channels", "lap", "wipe"] as const;
export type Move = (typeof MOVES)[number];

const smooth = (x: number) => {
  const v = clamp01(x);
  return v * v * (3 - 2 * v);
};

/** n samples across hex stops, interpolated in OKLCH the short way round the hue. */
export function lchSamples(hexes: readonly string[], n: number): LCH[] {
  const src = hexes.map(h => srgbToLch(hexToSrgb(h) ?? [0.5, 0.5, 0.5]));
  if (src.length < 2)
    return Array.from({ length: n }, () => (src[0] ? [...src[0]] : [0.5, 0, 0]) as LCH);
  return Array.from({ length: n }, (_, i) => {
    const x = (i / (n - 1)) * (src.length - 1);
    const k = Math.min(src.length - 2, Math.floor(x));
    const f = x - k;
    const [p, q] = [src[k], src[k + 1]];
    return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + shortTurn(q[2] - p[2]) * f];
  });
}

/* the laps between two bars, read at their middle, so every stop turns the same way */
function lapOf(a: readonly LCH[], b: readonly LCH[]) {
  const m = a.length >> 1;
  const raw = b[m][2] - a[m][2];
  return 360 * Math.round((raw - shortTurn(raw)) / 360);
}

/** One frame of a move: `a` becomes `b` as u runs 0 to 1; `dir` picks which end leads. */
export function mixStops(
  a: readonly LCH[],
  b: readonly LCH[],
  u: number,
  move: Move,
  dir: 1 | -1 = 1
): LCH[] {
  const n = a.length;
  const lap = lapOf(a, b);
  const v = clamp01(u);
  return a.map((c, i) => {
    const to = b[i] ?? b[b.length - 1];
    const x = n > 1 ? i / (n - 1) : 0;
    const lead = dir > 0 ? x : 1 - x;
    let fl: number;
    let fc: number;
    let fh: number;
    let extra = 0;
    if (move === "sweep") fl = fc = fh = smooth((v - 0.35 * lead) / 0.65);
    else if (move === "channels") {
      fl = smooth(v / 0.55);
      fc = smooth((v - 0.22) / 0.55);
      fh = smooth((v - 0.45) / 0.55);
    } else if (move === "lap") {
      fl = fc = fh = smooth(v);
      extra = 360 * dir;
    } else {
      const w = 0.3;
      fl = fc = fh = smooth((-w + v * (1 + 2 * w) - lead) / w);
    }
    const dh = to[2] - c[2] - lap + extra;
    return [c[0] + (to[0] - c[0]) * fl, Math.max(0, c[1] + (to[1] - c[1]) * fc), c[2] + dh * fh];
  });
}

/** The bar's stops as a left-to-right gradient at an alpha, for rims painted from it. */
export const barGradient = (stops: readonly string[], alpha: number): string =>
  `linear-gradient(90deg, ${stops
    .map((hex, i) => {
      const [r, g, b] = (hexToSrgb(hex) ?? [0.5, 0.5, 0.5]).map(v => Math.round(v * 255));
      return `rgba(${r},${g},${b},${alpha}) ${((i / Math.max(1, stops.length - 1)) * 100).toFixed(1)}%`;
    })
    .join(", ")})`;

export const toSrgb = (samples: readonly LCH[]): Triple[] =>
  samples.map(([l, c, h]) => lchToSrgb(l, c, h));
export const toHexes = (samples: readonly LCH[]): string[] => toSrgb(samples).map(toHex);
