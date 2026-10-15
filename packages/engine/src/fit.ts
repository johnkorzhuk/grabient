/* Fitting keyframes to a dense strip of colors: an old cosine palette, or colors given as stops. For K = 2 up to kMax
   it starts from evenly picked samples, runs Nelder-Mead on the RMS ΔE over every sample, and keeps the K with the
   least error plus 0.0015 per keyframe. Heavy: its work is the number of times it measures that error, each a pass over
   the whole strip, so a fit run where its time is bounded is given a budget of them. */
import { canonical } from "./codec.ts";
import { deltaE, srgbToLch, type Triple } from "./color.ts";
import { sampleLCH, unwrapStrip } from "./curve.ts";
import { clamp, clamp01 } from "./math.ts";
import { type Anchor, C_MAX, K_MAX, K_MIN, type Palette } from "./palette.ts";

function nelderMead(f: (x: number[]) => number, x0: number[], scale: number[], iters: number) {
  const n = x0.length;
  let simplex = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const p = x0.slice();
    p[i] += scale[i] || 1e-3;
    simplex.push(p);
  }
  let values = simplex.map(f);
  for (let it = 0; it < iters; it++) {
    const order = values.map((_, i) => i).sort((p, q) => values[p] - values[q]);
    simplex = order.map(i => simplex[i]);
    values = order.map(i => values[i]);
    const center: number[] = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) center[j] += simplex[i][j] / n;
    const worst = simplex[n];
    const reflected = center.map((c, j) => 2 * c - worst[j]);
    const fr = f(reflected);
    if (fr < values[0]) {
      const expanded = center.map((c, j) => 3 * c - 2 * worst[j]);
      const fe = f(expanded);
      if (fe < fr) {
        simplex[n] = expanded;
        values[n] = fe;
      } else {
        simplex[n] = reflected;
        values[n] = fr;
      }
    } else if (fr < values[n - 1]) {
      simplex[n] = reflected;
      values[n] = fr;
    } else {
      const contracted = center.map((c, j) => c + 0.5 * (worst[j] - c));
      const fc = f(contracted);
      if (fc < values[n]) {
        simplex[n] = contracted;
        values[n] = fc;
      } else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j]));
          values[i] = f(simplex[i]);
        }
      }
    }
  }
  let best = 0;
  for (let i = 1; i <= n; i++) if (values[i] < values[best]) best = i;
  return simplex[best];
}

export interface FitResult {
  palette: Palette;
  maxDE: number;
  meanDE: number;
  K: number;
}
export interface FitOptions {
  kMax?: number;
  iters?: number;
  /** the most times the fit may measure its error, past which it answers null */
  budget?: number;
}
/** The canonical palette nearest an [L, C, H] strip, with its largest and mean ΔE over the strip; null when it would
    spend more than its budget. */
export function fitStrip(given: readonly Triple[], options: FitOptions = {}): FitResult | null {
  const strip = unwrapStrip(given);
  const n = strip.length;
  const kMax = clamp(options.kMax ?? K_MAX, K_MIN, K_MAX);
  const iters = options.iters ?? 220;
  let left = options.budget ?? Number.POSITIVE_INFINITY;
  const cost = (A: Anchor[]) => {
    // past the budget a measure answers at once, and the fit answers null
    if (--left < 0) return Number.POSITIVE_INFINITY;
    let e = 0;
    for (let i = 0; i < n; i++) {
      const d = deltaE(sampleLCH({ anchors: A }, i / (n - 1)), strip[i]);
      e += d * d;
    }
    return Math.sqrt(e / n);
  };
  let best: { A: Anchor[]; penalized: number; K: number } | null = null;
  for (let K = K_MIN; K <= kMax && left >= 0; K++) {
    const unpack = (x: number[]): Anchor[] =>
      Array.from({ length: K }, (_, i) => ({
        l: clamp01(x[3 * i]),
        c: clamp(x[3 * i + 1], 0, C_MAX),
        h: x[3 * i + 2]
      }));
    const x0 = Array.from(
      { length: K },
      (_, i) => strip[Math.round((i / (K - 1)) * (n - 1))]
    ).flat();
    const scale = x0.map((_, j) => (j % 3 === 2 ? 6 : 0.02));
    const A = unpack(nelderMead(x => cost(unpack(x)), x0, scale, iters));
    const penalized = cost(A) + K * 0.0015;
    if (!best || penalized < best.penalized) best = { A, penalized, K };
  }
  if (left < 0 || !best) return null;
  const { A, K } = best;
  const palette = canonical({ anchors: A });
  let maxDE = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const d = deltaE(sampleLCH(palette, i / (n - 1)), strip[i]);
    if (d > maxDE) maxDE = d;
    sum += d;
  }
  return { palette, maxDE, meanDE: sum / n, K };
}
/** The fit of sRGB samples: an older generator's output, or a strip drawn through stops. */
export const fitSrgbStrip = (rgb: readonly Triple[], options?: FitOptions) =>
  fitStrip(rgb.map(srgbToLch), options);
