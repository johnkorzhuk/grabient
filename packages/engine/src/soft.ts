/* Soft: a view's colors blurred along its style's line, so a swatch style's bands melt into one another and a
   gradient's turns at its stops round off, the picture still one gradient that every format draws alike (CSS, SVG, the
   painter's PNG). The line is the style's t, 0 to 1: along the angle, out from the middle, or round it. The blur is a
   Gaussian along t, worked exactly rather than on a grid: a band's edge becomes the normal curve's integral, a turn at
   a gradient's stop the integral of that, with radial's line mirrored through the middle it starts from and angular's
   wrapped round. The curve is read closely where it bends and thinned to the fewest stops whose straight blends stay
   within an eighth of a just-noticeable difference of it. It is blended in OKLab from the palette's own colors, which
   each format then fits to its screen as it fits the plain stops, so Display-P3 keeps their vividness.
   Its strength, 1 to 100, is eased so the low end has room, and sized for each family of styles so a 16:9 picture
   blurs alike in all three: at 100 a sigma of 0.08 of the picture's D (the square root of its area), the lab's that
   John chose it in (2 Nov 2026). As a share of the line it needs no size, so a stylesheet draws it in any box. */
import { lchToSrgb, type Triple, toHex } from "./color.ts";
import type { Stop } from "./curve.ts";
import { DEG } from "./math.ts";
import { isSwatchStyle, SOFT_MAX, type Style } from "./view.ts";

type Family = "linear" | "radial" | "angular";
const familyOf = (style: Style): Family =>
  style.startsWith("radial") ? "radial" : style.startsWith("angular") ? "angular" : "linear";

/* the sigma at 100 as a share of t: 0.08 D over the line's length in D for a 16:9 picture, the line along its width
   for linear, to the corner for radial, and round the circle a third of the way out for angular */
const SIGMA_FULL: Readonly<Record<Family, number>> = {
  linear: 0.08 / (16 / 12),
  radial: 0.08 / (Math.hypot(16, 9) / 2 / 12),
  angular: 0.08 / (2 * Math.PI * 0.32)
};

/** A soft's sigma as a share of its style's line. */
export const softSigma = (style: Style, soft: number): number =>
  SIGMA_FULL[familyOf(style)] * (Math.min(SOFT_MAX, Math.max(0, soft)) / SOFT_MAX) ** 1.6;

/** The style a view is drawn in: a soft one blends, its family's gradient. */
export const softStyle = (style: Style, soft: number | null | undefined): Style =>
  soft ? (`${familyOf(style)}Gradient` as Style) : style;

/** How far a blend between two of the stops may stray from the blurred curve, in OKLab: an eighth of the JND CSS Color
    4 maps gamuts by (0.02). */
export const SOFT_TOLERANCE = 0.0025;

/* the normal curve and its integral (Abramowitz and Stegun 7.1.26 through erf, within 1.5e-7) */
const ROOT_TAU = Math.sqrt(2 * Math.PI);
const pdf = (x: number) => Math.exp(-0.5 * x * x) / ROOT_TAU;
function cdf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const k = 1 / (1 + 0.3275911 * z);
  const e =
    1 -
    ((((1.061405429 * k - 1.453152027) * k + 1.421413741) * k - 0.284496736) * k + 0.254829592) *
      k *
      Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + e) : 0.5 * (1 - e);
}

/** The unblurred curve as a sum: a base color, then terms each a color times a shape about its place `at`: a step
    (a band's edge: the color jumps by d there), a ramp (a gradient's turn: its slope along t changes by d there), or
    a ramp leftward (radial's mirror: a slope of -d toward the middle, nothing past `at`). */
type Shape = "step" | "ramp" | "left";
interface Term {
  at: number;
  shape: Shape;
  d: Triple;
}
const sub = (a: Triple, b: Triple): Triple => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scaled = (a: Triple, k: number): Triple => [a[0] * k, a[1] * k, a[2] * k];

/** The curve's terms for colors drawn in a style: bands, or blends between evenly spaced stops, level past either
    end; radial's line mirrored through the middle, and angular's laid out over three turns, which a blur of a few
    hundredths of a turn reads as the whole circle. */
function termsOf(c: readonly Triple[], style: Style): { base: Triple; terms: Term[] } {
  const n = c.length;
  const family = familyOf(style);
  const terms: Term[] = [];
  const add = (at: number, shape: Shape, d: Triple) => terms.push({ at, shape, d });
  if (isSwatchStyle(style)) {
    if (family === "angular") {
      /* from the last band, every edge of three turns, the seam's (the first band after the last) among them */
      for (let k = -1; k <= 1; k++)
        for (let i = 0; i < n; i++) add(i / n + k, "step", sub(c[i], c[(i + n - 1) % n]));
      return { base: [...c[n - 1]], terms };
    }
    for (let i = 1; i < n; i++) add(i / n, "step", sub(c[i], c[i - 1]));
    if (family === "linear") return { base: [...c[0]], terms };
    /* radial: from the outermost band, its edges mirrored left of the middle first */
    for (let i = 1; i < n; i++) add(-i / n, "step", sub(c[i - 1], c[i]));
    return { base: [...c[n - 1]], terms };
  }
  if (n < 2) return { base: [...c[0]], terms };
  const slope = (j: number): Triple =>
    j < 0 || j > n - 2 ? [0, 0, 0] : scaled(sub(c[j + 1], c[j]), n - 1);
  const turns = Array.from({ length: n }, (_, j) => ({
    at: j / (n - 1),
    d: sub(slope(j), slope(j - 1))
  }));
  if (family === "angular") {
    /* a turn is a piece that starts at the first stop at 0, follows the stops and ends at the last at 1, laid end to
       end: where one meets the next, the seam */
    for (let k = -1; k <= 1; k++) {
      add(k, "step", [...c[0]]);
      for (const { at, d } of turns) add(at + k, "ramp", d);
      add(k + 1, "step", scaled(c[n - 1], -1));
    }
    return { base: [0, 0, 0], terms };
  }
  for (const { at, d } of turns) {
    add(at, "ramp", d);
    /* radial: f(-t) = f(t), each turn's mirror a leftward ramp */
    if (family === "radial") add(-at, "left", d);
  }
  return { base: [...c[0]], terms };
}

/** A term's weight at x = t - at, blurred by sigma: the normal curve's integral for a step, that integral's own for
    a ramp, mirrored for a leftward one; plain far out. */
function weight(shape: Shape, x: number, sigma: number): number {
  const far = 8 * sigma;
  if (shape === "step") return x >= far ? 1 : x <= -far ? 0 : cdf(x / sigma);
  const y = shape === "ramp" ? x : -x;
  return y >= far ? y : y <= -far ? 0 : y * cdf(y / sigma) + sigma * pdf(y / sigma);
}

/** The blurred curve, read at any t: the terms sorted by place, those within reach of t weighed exactly and the rest
    taken whole from running sums (a step or a ramp left of the reach is all there, a leftward ramp right of it). */
function blurred(base: Triple, list: readonly Term[], sigma: number) {
  const terms = [...list].sort((a, b) => a.at - b.at);
  const m = terms.length;
  const reach = 8 * sigma;
  /* sums before each index of steps' d, ramps' d and d·at; after each, of leftward ramps' d and d·at */
  const steps = new Float64Array((m + 1) * 3);
  const ramps = new Float64Array((m + 1) * 3);
  const rampsAt = new Float64Array((m + 1) * 3);
  const lefts = new Float64Array((m + 1) * 3);
  const leftsAt = new Float64Array((m + 1) * 3);
  for (let i = 0; i < m; i++) {
    const { shape, d, at } = terms[i];
    for (let c = 0; c < 3; c++) {
      steps[(i + 1) * 3 + c] = steps[i * 3 + c] + (shape === "step" ? d[c] : 0);
      ramps[(i + 1) * 3 + c] = ramps[i * 3 + c] + (shape === "ramp" ? d[c] : 0);
      rampsAt[(i + 1) * 3 + c] = rampsAt[i * 3 + c] + (shape === "ramp" ? d[c] * at : 0);
    }
  }
  for (let i = m - 1; i >= 0; i--) {
    const { shape, d, at } = terms[i];
    for (let c = 0; c < 3; c++) {
      lefts[i * 3 + c] = lefts[(i + 1) * 3 + c] + (shape === "left" ? d[c] : 0);
      leftsAt[i * 3 + c] = leftsAt[(i + 1) * 3 + c] + (shape === "left" ? d[c] * at : 0);
    }
  }
  /* the first index whose place is past x */
  const after = (x: number) => {
    let lo = 0;
    let hi = m;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (terms[mid].at <= x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return {
    terms,
    at(t: number): Triple {
      const lo = after(t - reach);
      const hi = after(t + reach);
      const out: Triple = [0, 0, 0];
      for (let c = 0; c < 3; c++)
        out[c] =
          base[c] +
          steps[lo * 3 + c] +
          t * ramps[lo * 3 + c] -
          rampsAt[lo * 3 + c] +
          leftsAt[hi * 3 + c] -
          t * lefts[hi * 3 + c];
      for (let i = lo; i < hi; i++) {
        const term = terms[i];
        const w = weight(term.shape, t - term.at, sigma);
        out[0] += term.d[0] * w;
        out[1] += term.d[1] * w;
        out[2] += term.d[2] * w;
      }
      return out;
    }
  };
}

/** Douglas-Peucker on a curve of colors along t: the fewest points whose straight blends stay within `tol` (OKLab
    distance) of every point read. */
function thin(ts: readonly number[], cs: readonly Triple[], tol: number): number[] {
  const keep = new Uint8Array(ts.length);
  keep[0] = 1;
  keep[ts.length - 1] = 1;
  const stack: [number, number][] = [[0, ts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1;
    let at = -1;
    for (let k = a + 1; k < b; k++) {
      const f = (ts[k] - ts[a]) / (ts[b] - ts[a] || 1);
      let e = 0;
      for (let ch = 0; ch < 3; ch++) {
        const d = cs[a][ch] + (cs[b][ch] - cs[a][ch]) * f - cs[k][ch];
        e += d * d;
      }
      if (e > worst) {
        worst = e;
        at = k;
      }
    }
    if (worst > tol * tol) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  const out: number[] = [];
  for (let k = 0; k < ts.length; k++) if (keep[k]) out.push(k);
  return out;
}

const lab = (lch: Triple): Triple => [
  lch[0],
  lch[1] * Math.cos(lch[2] * DEG),
  lch[1] * Math.sin(lch[2] * DEG)
];
const lchOf = (c: Triple): Triple => {
  const h = Math.atan2(c[2], c[1]) / DEG;
  return [c[0], Math.hypot(c[1], c[2]), h < 0 ? h + 360 : h];
};

/** A view's stops blurred by a soft (1 to SOFT_MAX), drawn in softStyle's gradient at each stop's t: the style's
    bands or blends read from the stops' own colors, blurred along its line and thinned. No soft gives the stops back. */
export function softStops(
  stops: readonly Stop[],
  style: Style,
  soft: number | null | undefined
): Stop[] {
  if (!soft || stops.length === 0) return [...stops];
  const sigma = softSigma(style, soft);
  const { base, terms } = termsOf(
    stops.map(s => lab(s.lch)),
    style
  );
  const curve = blurred(base, terms, sigma);
  /* read where the curve bends, on a grid a quarter sigma apart within five sigmas of each term, and at the terms
     themselves; between the reads it is straight or level */
  const grid = sigma / 4;
  const marks = new Set<number>();
  const at = new Set<number>([0, 1]);
  for (const term of curve.terms) {
    if (term.at < -5 * sigma || term.at > 1 + 5 * sigma) continue;
    if (term.at >= 0 && term.at <= 1) at.add(term.at);
    const mid = Math.round(term.at / grid);
    for (let u = mid - 20; u <= mid + 20; u++) marks.add(u);
  }
  for (const u of marks) {
    const t = u * grid;
    if (t > 0 && t < 1) at.add(t);
  }
  const ts = [...at].sort((a, b) => a - b);
  const cs = ts.map(t => curve.at(t));
  return thin(ts, cs, SOFT_TOLERANCE).map(k => {
    const lch = lchOf(cs[k]);
    const rgb = lchToSrgb(lch[0], lch[1], lch[2]);
    return { t: ts[k], hex: toHex(rgb), rgb, lch };
  });
}

/** A view's stops and style as its picture draws them: a soft one's blurred stops in its family's gradient, each at
    its place along the line (`at`, which the writers take), and a plain one's as they are. */
export function drawnStops(
  stops: readonly Stop[],
  view: { style: Style; soft?: number | null }
): { stops: Stop[]; style: Style; at?: number[] } {
  if (!view.soft) return { stops: [...stops], style: view.style };
  const soft = softStops(stops, view.style, view.soft);
  return { stops: soft, style: softStyle(view.style, view.soft), at: soft.map(s => s.t) };
}
