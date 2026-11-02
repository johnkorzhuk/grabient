/* Silk lite: the silk sketch (sketches/mesh-silk) rebuilt from rigid layers, so it is cheap in a list, cheap to move
   and plays on Figma's timeline.

   Three colored layers that never move, and two masks whose shapes do:
   - the dye: the palette as a linear gradient along the view's angle (32 stops), drawn three times, as dyed (base),
     lifted by the light (lift) and deepened in shade (shade): the same OKLCH tints the full sketch bakes, a warm turn
     for yellows in the shade;
   - the folds: a handful of long curved bands, each a ring of a large circle (an annulus in Figma, a stroked circle in
     SVG) passing near a gather beyond the box, so they fan out across it as the full sketch's do;
   - each ring carries two soft profiles across its width: the valley's (how far the shade layer shows) and the crest's
     (how far the lift layer shows, with a sharp sheen line). The valley mask holds every ring with the valley profile,
     the crest mask every ring with the crest profile;
   - so a pixel's color is lerp(lerp(base, shade, V), lift, C): the full sketch's own color model, its tone split into
     the two masks.
   The view's angle turns the whole cloth about the box's middle, its folds with its dye, so a turn of the angle turns
   the silk as it turns a gradient; 90, the default, lies as designed.

   Motion: each fold swings about the gather, a rotation keyed on the timeline (a few degrees, eased to and fro), every
   fold on its own count of swings in the loop, so folds bunch and part. Rotation is all that moves; the colors stay
   put. Every format reads the same keyframes: the CPU here, the player's uniforms, SMIL in the moving SVG, Figma's
   tracks. */
import { lchToSrgb, toHex } from "./color.ts";
import { sampleLCH, sampleSrgb } from "./curve.ts";
import type { Palette } from "./palette.ts";
import type { Size } from "./view.ts";

/** seconds a loop at speed 1 */
export const SILK_LOOP = 240;
/** the palette's stops: the dye gradient's, and the lookup table's entries */
export const LUT_N = 32;
/** the profile's grid across a band, x = -1 + 2k / (PROF_N - 1): every stop sits on it */
export const PROF_N = 65;
/** at most this many folds (the player's loop) */
export const MAX_FOLDS = 8;

const DEG = Math.PI / 180;

export interface SilkView {
  angle: number;
  shape: number | null;
}

export interface FoldSpec {
  /** where the fold crosses the cloth's middle line (x = 0), across it, in cloth units */
  y: number;
  /** curvature, 1 / radius in cloth units; positive bends toward +y */
  c: number;
  /** the band's half-width, cloth units */
  w: number;
  /** the swing: amplitude (degrees about the gather), swings (half cycles) per loop, phase 0..1, seed for the
      amplitudes */
  amp: number;
  swings: number;
  phase: number;
}

/** A profile across a band: control points (x in -1..1, alpha 0..1) of a smooth curve, sampled on the grid. */
export interface SilkDesign {
  /** the gather, in cloth units (x along the drape, y across, the box's half-diagonal 1) */
  gx: number;
  gy: number;
  folds: FoldSpec[];
  /** the valley: peak alpha, centre (x), width (sd) and the rise's and fall's shapes */
  vA: number;
  vX: number;
  vS: number;
  vSkew: number;
  /** the lit face: a broad low lift */
  fA: number;
  fX: number;
  fS: number;
  /** the sheen line: a narrow high lift */
  sA: number;
  sX: number;
  sS: number;
  /** tints: lightness toward 1 and chroma scale in the light; lightness and chroma scale in shade; the shade's warm
      turn for yellows (deg) */
  liftL: number;
  liftC: number;
  shadeL: number;
  shadeC: number;
  warm: number;
  /** the drape's turn from the box's long side (deg) */
  clothTurn: number;
  /** the folds' turn from the fan's rays at the middle line (deg) */
  bias: number;
  /** the dye's gradient line turned from the angle's (deg, clockwise on the screen as CSS's angles are) */
  tilt: number;
  /** the swings' easing (a cubic-bezier), the same in every format */
  ease: [number, number, number, number];
}

export const SILK_DESIGN: SilkDesign = {
  gx: -3.2,
  gy: 1.6,
  folds: [
    { y: 0.86, c: 0.26, w: 0.14, amp: 1.3, swings: 18, phase: 0.13 },
    { y: 0.68, c: 0.3, w: 0.15, amp: 1.25, swings: 14, phase: 0.5 },
    { y: 0.48, c: 0.27, w: 0.17, amp: 1.2, swings: 16, phase: 0.87 },
    { y: 0.24, c: 0.24, w: 0.21, amp: 1.1, swings: 12, phase: 0.24 },
    { y: -0.04, c: 0.22, w: 0.24, amp: 1.0, swings: 10, phase: 0.61 },
    { y: -0.38, c: 0.2, w: 0.32, amp: 0.9, swings: 8, phase: 0.98 },
    { y: -0.82, c: 0.18, w: 0.42, amp: 0.8, swings: 6, phase: 0.35 }
  ],
  vA: 0.8,
  vX: 0.42,
  vS: 0.26,
  vSkew: 0.5,
  fA: 0.4,
  fX: -0.3,
  fS: 0.26,
  sA: 0.62,
  sX: 0.06,
  sS: 0.065,
  liftL: 0.4,
  liftC: 1.0,
  shadeL: 0.5,
  shadeC: 1.15,
  warm: 26,
  clothTurn: 0,
  bias: 2,
  tilt: -24,
  ease: [0.37, 0, 0.63, 1]
};

/** mulberry32 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------------------------------------------------------- the palette */

const hexRgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const byteHex = (b: readonly number[]) =>
  `#${b.map(v => v.toString(16).padStart(2, "0")).join("")}`;

/** how near a hue (deg) is to yellow's: 1 at it, 0 beyond about 55 degrees */
const yellowness = (H: number) => {
  const d = ((((H - 100) % 360) + 540) % 360) - 180;
  const x = Math.max(0, 1 - Math.abs(d) / 55);
  return x * x * (3 - 2 * x);
};

export interface Dye {
  /** LUT_N colors each, as hex: base (the engine's own), lift, shade */
  base: string[];
  lift: string[];
  shade: string[];
  /** the same as bytes, 3 per entry */
  baseB: Uint8Array;
  liftB: Uint8Array;
  shadeB: Uint8Array;
}

export function bakeDye(P: Palette, d: SilkDesign): Dye {
  const base: string[] = [];
  const lift: string[] = [];
  const shade: string[] = [];
  const baseB = new Uint8Array(3 * LUT_N);
  const liftB = new Uint8Array(3 * LUT_N);
  const shadeB = new Uint8Array(3 * LUT_N);
  const bytes = (rgb: readonly number[]) =>
    rgb.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255));
  for (let i = 0; i < LUT_N; i++) {
    const s = i / (LUT_N - 1);
    const [L, C, H] = sampleLCH(P, s);
    const b = hexRgb(toHex(sampleSrgb(P, s)));
    const l = bytes(lchToSrgb(L + (1 - L) * d.liftL, C * d.liftC, H));
    const k = bytes(lchToSrgb(L * (1 - d.shadeL), C * d.shadeC, H - d.warm * yellowness(H)));
    baseB.set(b, 3 * i);
    liftB.set(l, 3 * i);
    shadeB.set(k, 3 * i);
    base.push(byteHex(b));
    lift.push(byteHex(l));
    shade.push(byteHex(k));
  }
  return { base, lift, shade, baseB, liftB, shadeB };
}

/* ---------------------------------------------------------------- the profiles */

export interface Profile {
  /** stops on the grid: grid index k (x = -1 + 2k/(PROF_N-1)) and alpha in 255ths */
  k: number[];
  a: number[];
  /** the piecewise-linear profile through the stops at every grid point, 0..1 */
  table: Float64Array;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** the band's window: 1 inside, falling to 0 at both edges */
const windowAt = (x: number) => smooth(1, 0.62, Math.abs(x));

/** the valley's alpha across a band (before stops) */
export function valleyCurve(d: SilkDesign, x: number): number {
  const u = (x - d.vX) / d.vS;
  /* a skewed bell: steeper on the crest's side, longer toward the band's far edge */
  const s = u < 0 ? u * (1 + d.vSkew) : u / (1 + 0.6 * d.vSkew);
  return d.vA * Math.exp(-0.5 * s * s) * windowAt(x);
}

/** the crest's alpha: the lit face's broad lift and the sheen's narrow line, joined as layers are */
export function crestCurve(d: SilkDesign, x: number): number {
  const f = d.fA * Math.exp(-0.5 * ((x - d.fX) / d.fS) ** 2);
  const s = d.sA * Math.exp(-0.5 * ((x - d.sX) / d.sS) ** 2);
  return (1 - (1 - f) * (1 - s)) * windowAt(x);
}

/** A curve as stops on the grid: every grid point first, then the ones whose removal changes the line least dropped
    while the line stays within tol (in 255ths) of the curve everywhere on the grid. */
export function profileOf(curve: (x: number) => number, tol = 2): Profile {
  const xs = Array.from({ length: PROF_N }, (_, k) => -1 + (2 * k) / (PROF_N - 1));
  const target = xs.map(x => 255 * curve(x));
  const a = target.map(v => Math.round(v));
  a[0] = 0;
  a[PROF_N - 1] = 0;
  let keep = xs.map((_, k) => k);
  const errorWithout = (list: number[], j: number) => {
    const k0 = list[j - 1];
    const k1 = list[j + 1];
    let worst = 0;
    for (let k = k0 + 1; k < k1; k++) {
      const v = a[k0] + ((a[k1] - a[k0]) * (k - k0)) / (k1 - k0);
      worst = Math.max(worst, Math.abs(v - target[k]));
    }
    return worst;
  };
  for (;;) {
    let best = -1;
    let bestErr = Infinity;
    for (let j = 1; j < keep.length - 1; j++) {
      const e = errorWithout(keep, j);
      if (e < bestErr) {
        bestErr = e;
        best = j;
      }
    }
    if (best < 0 || bestErr > tol) break;
    keep = keep.filter((_, j) => j !== best);
  }
  const table = new Float64Array(PROF_N);
  for (let j = 0; j < keep.length - 1; j++) {
    const k0 = keep[j];
    const k1 = keep[j + 1];
    for (let k = k0; k <= k1; k++)
      table[k] = (a[k0] + ((a[k1] - a[k0]) * (k - k0)) / (k1 - k0)) / 255;
  }
  return { k: keep, a: keep.map(k => a[k]), table };
}

/* ---------------------------------------------------------------- motion: keyframe tracks */

export type Curve = readonly [number, number, number, number];
export interface Key {
  /** seconds in the loop */
  t: number;
  /** the value: a rotation in degrees, clockwise on the screen as SVG's */
  v: number;
  /** the easing of the stretch arriving at this key (null: none, the first key) */
  e: Curve | null;
}
export type Track = Key[];

/** a cubic-bezier timing curve's progress at time x (0..1): the curve's parameter found by bisection, then its y */
export function bezierAt(c: Curve, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const [x1, y1, x2, y2] = c;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const u = (lo + hi) / 2;
    const xu = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
    if (xu < x) lo = u;
    else hi = u;
  }
  const u = (lo + hi) / 2;
  return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
}

type Point = readonly [number, number];
const toward = (p: Point, q: Point, t: number): Point => [
  p[0] + (q[0] - p[0]) * t,
  p[1] + (q[1] - p[1]) * t
];
const splitAt = ([a, b, c, d]: readonly Point[], t: number): [Point[], Point[]] => {
  const ab = toward(a, b, t);
  const bc = toward(b, c, t);
  const cd = toward(c, d, t);
  const abc = toward(ab, bc, t);
  const bcd = toward(bc, cd, t);
  const m = toward(abc, bcd, t);
  return [
    [a, ab, abc, m],
    [m, bcd, cd, d]
  ];
};
/** the part of a timing curve between two of its times (0..1), a timing curve of its own (figma-paste.ts's
    figmaCurveBetween, to a millionth) */
export function curveBetween(curve: Curve, from: number, to: number): Curve {
  const [x1, y1, x2, y2] = curve;
  const x = (u: number) => 3 * (1 - u) ** 2 * u * x1 + 3 * (1 - u) * u ** 2 * x2 + u ** 3;
  const at = (time: number) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 64; i++) {
      const mid = (lo + hi) / 2;
      if (x(mid) < time) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const u0 = from <= 0 ? 0 : at(from);
  const u1 = to >= 1 ? 1 : at(to);
  const [before] = splitAt(
    [
      [0, 0],
      [x1, y1],
      [x2, y2],
      [1, 1]
    ],
    u1
  );
  const [, [p0, p1, p2, p3]] = splitAt(before, u1 > 0 ? u0 / u1 : 0);
  const r = (v: number) => Math.round(v * 1e6) / 1e6;
  const nx = (v: number) => r((v - p0[0]) / (p3[0] - p0[0]));
  const ny = (v: number) => r((v - p0[1]) / (p3[1] - p0[1]));
  return [nx(p1[0]), ny(p1[1]), nx(p2[0]), ny(p2[1])];
}

/** A fold's swing as keys over the loop: `swings` stretches (an even count), each eased from one turning point to the
    next, the turning points alternating sides with amplitudes drawn from the seed; the loop starts `phase` of a stretch
    in, so the first and last stretches are parts of one, eased by the matching parts of the curve. */
export function swingTrack(f: FoldSpec, seed: number, ease: Curve, loop = SILK_LOOP): Track {
  const n = Math.max(2, 2 * Math.round(f.swings / 2));
  const r = mulberry32(seed);
  const turn = Array.from(
    { length: n },
    (_, j) => (j % 2 === 0 ? 1 : -1) * f.amp * (0.55 + 0.45 * r())
  );
  const seg = loop / n;
  /* t = 0 lies `into` of the way along the stretch from the last turning point to the first (kept off the stretch's
     ends, so no key falls on another) */
  const into = Math.min(0.95, Math.max(0.05, ((f.phase % 1) + 1) % 1));
  const v0 = round(turn[n - 1] + (turn[0] - turn[n - 1]) * bezierAt(ease, into), 4);
  const keys: Key[] = [{ t: 0, v: v0, e: null }];
  for (let j = 0; j < n; j++)
    keys.push({
      t: round((j + 1 - into) * seg, 4),
      v: round(turn[j], 4),
      e: j === 0 ? curveBetween(ease, into, 1) : ease
    });
  /* the loop closes on the first key's value */
  keys.push({ t: loop, v: v0, e: curveBetween(ease, 0, into) });
  return keys;
}

/** a track's value at t (any t: the loop repeats) */
export function trackAt(track: Track, t: number, loop = SILK_LOOP): number {
  const tt = t - loop * Math.floor(t / loop);
  for (let j = 1; j < track.length; j++) {
    const k1 = track[j];
    if (tt <= k1.t || j === track.length - 1) {
      const k0 = track[j - 1];
      const span = k1.t - k0.t;
      const p = span > 0 ? Math.min(1, Math.max(0, (tt - k0.t) / span)) : 1;
      return k0.v + (k1.v - k0.v) * (k1.e ? bezierAt(k1.e, p) : p);
    }
  }
  return track[0].v;
}

/* ---------------------------------------------------------------- the scene for a box */

export interface Fold {
  /** the ring's centre at rest, its radius and its band's half-width, px (y down); the radius is (n + 1/2) periods
      of its band (a period is 2 w), so one radial gradient that repeats every period serves every ring drawn in its
      own period's units */
  cx: number;
  cy: number;
  R: number;
  w: number;
  n: number;
  track: Track;
}

export interface SilkScene {
  design: SilkDesign;
  angle: number;
  W: number;
  H: number;
  /** the dye's gradient line, px: from (x1, y1) at the palette's start to (x2, y2) at its end */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** the gather (the folds' pivot), px */
  gx: number;
  gy: number;
  folds: Fold[];
  dye: Dye;
  valley: Profile;
  crest: Profile;
}

/** v to `places` decimals, as the SVG and Figma write it */
export const round = (v: number, places: number) => {
  const k = 10 ** places;
  return Math.round(v * k) / k;
};

/** The cloth's scale, D over the box's longer side: a 16:9 box's half-diagonal, so a wide picture shows the drape as
    designed, and every box shows the one cloth its longer side frames, centered. A box's still is so the one design
    covering it (CSS's cover), which the server can paint before it knows the box, and the player lays out alike. */
export const SILK_SPAN = Math.hypot(16, 9) / 32;

/** The cloth's frame: unit vectors along the drape (ex) and across it (ey), y down, turned `turn` degrees from the
    box's x. The angle sets it alone, as it turns the glass's ribs; the box's shape never does. */
export function clothFrame(turn: number) {
  const a = turn * DEG;
  return { ex: [Math.cos(a), Math.sin(a)], ey: [Math.sin(a), -Math.cos(a)] };
}

export function buildSilkScene(
  P: Palette,
  view: SilkView,
  W: number,
  H: number,
  design: SilkDesign = SILK_DESIGN
): SilkScene {
  const d = design;
  /* the covering square's side: the design is the same for every box, framed about its middle */
  const side = Math.max(W, H);
  const D = SILK_SPAN * side;
  /* the cloth turns with the angle, as the dye below does, so the folds and the colors turn together */
  const { ex, ey } = clothFrame(d.clothTurn + view.angle - 90);
  const at = (x: number, y: number): [number, number] => [
    W / 2 + D * (x * ex[0] + y * ey[0]),
    H / 2 + D * (x * ex[1] + y * ey[1])
  ];
  const [gx, gy] = at(d.gx, d.gy).map(v => round(v, 2));
  /* the dye: a linear gradient along the angle, as Grabient's linear gradients run (CSS's line: 0 bottom to top, 90
     left to right, through the middle, long enough to reach the covering square's corners) */
  const a = (view.angle + d.tilt) * DEG;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const half = (side * (Math.abs(dx) + Math.abs(dy))) / 2;
  const dye = bakeDye(P, d);
  const folds: Fold[] = d.folds.map((f, i) => {
    /* the fold crosses the cloth's middle line at X = (0, y), heading as the fan does there (away from the gather,
       turned by the design's bias) and bending toward +y (c > 0) with radius 1/c: its ring's centre lies on the left
       normal of its heading */
    const psi = Math.atan2(f.y - d.gy, -d.gx) + d.bias * DEG;
    const nxc = -Math.sin(psi);
    const nyc = Math.cos(psi);
    const s = f.c >= 0 ? 1 : -1;
    const X = at(0, f.y);
    const nx = s * (nxc * ex[0] + nyc * ey[0]);
    const ny = s * (nxc * ex[1] + nyc * ey[1]);
    /* the radius rounded to the band gradient's repeat, (n + 1/2) periods; the arc keeps its place and tangent at X */
    /* the period (2 w) to a ten-thousandth of a pixel and the centre to a hundredth, as the SVG writes them */
    const P = round(2 * f.w * D, 4);
    const w = P / 2;
    const r0 = D / Math.max(Math.abs(f.c), 1e-3);
    const n = Math.max(1, Math.round(r0 / P - 0.5));
    const R = (n + 0.5) * P;
    return {
      cx: round(X[0] + nx * R, 2),
      cy: round(X[1] + ny * R, 2),
      R,
      w,
      n,
      track: swingTrack(f, 0x5111c + 977 * i, d.ease)
    };
  });
  return {
    design: d,
    angle: view.angle,
    W,
    H,
    x1: round(W / 2 - dx * half, 2),
    y1: round(H / 2 - dy * half, 2),
    x2: round(W / 2 + dx * half, 2),
    y2: round(H / 2 + dy * half, 2),
    gx,
    gy,
    folds,
    dye,
    valley: profileOf(x => valleyCurve(d, x)),
    crest: profileOf(x => crestCurve(d, x))
  };
}

/** The rings' centres at t: each turned about the gather by its track (clockwise on the screen for a positive angle,
    as SVG's rotate), into out[2i], out[2i+1]. */
export function centresAt(scene: SilkScene, t: number, out: Float64Array | Float32Array) {
  for (let i = 0; i < scene.folds.length; i++) {
    const f = scene.folds[i];
    const th = trackAt(f.track, t) * DEG;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const px = f.cx - scene.gx;
    const py = f.cy - scene.gy;
    out[2 * i] = scene.gx + c * px - s * py;
    out[2 * i + 1] = scene.gy + s * px + c * py;
  }
}

/* ---------------------------------------------------------------- the reference pixel */

/** the profile's value at x (-1..1), the line through the grid's values */
export function profileAt(table: Float64Array, x: number): number {
  if (x <= -1 || x >= 1) return 0;
  const g = (x + 1) * 0.5 * (PROF_N - 1);
  const i = Math.min(PROF_N - 2, Math.floor(g));
  const f = g - i;
  return table[i] + (table[i + 1] - table[i]) * f;
}

/* The view's shape: 0 or none is the silk as designed; any other number draws a variation from a seeded mulberry32,
   within what still drapes well: where the gather sits (above or below the drape's line, so the folds fan down or
   up), how many folds there are (6 to 8), how wide each is (narrow by the gather, broad far from it) and how they
   bunch, how much each bends, the drape's small turn, the dye's tilt, and every fold's swing. The palette keeps its
   direction: only the angle sets that. */
export function silkDesign(shape: number | null): SilkDesign {
  if (!shape) return SILK_DESIGN;
  const r = mulberry32(0x9e3779b9 ^ Math.imul(shape | 0, 0x85ebca6b));
  const range = (lo: number, hi: number) => lo + (hi - lo) * r();
  const d: SilkDesign = JSON.parse(JSON.stringify(SILK_DESIGN));
  /* the gather: above the drape's line (folds fan down from it) or below (they fan up) */
  const flip = r() < 0.5 ? -1 : 1;
  d.gx = range(-3.6, -3.0);
  d.gy = flip * range(1.3, 1.9);
  /* folds from the gather's side outward: narrow and bunched near it, broad far from it, fitted into the design's
     span across the middle line (0.88 to -0.84), so none crosses the box as a steep ray */
  const n = 6 + Math.floor(r() * 3);
  const w0 = range(0.12, 0.16);
  const grow = range(1.14, 1.32);
  const widths = Array.from({ length: n }, (_, i) => w0 * grow ** i * range(0.88, 1.12));
  const gaps = widths.slice(1).map((w, i) => (widths[i] + w) * range(0.8, 1.08));
  const fit = 1.72 / gaps.reduce((a, b) => a + b, 0);
  const swings = [6, 8, 10, 12, 14, 16, 18, 20];
  for (let i = swings.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [swings[i], swings[j]] = [swings[j], swings[i]];
  }
  /* curvature: near the design's, wandering a little from fold to fold so neighbours never cross in the box */
  let c = range(0.2, 0.26);
  let y = flip * 0.88;
  d.folds = widths.map((w, i) => {
    const f = {
      y,
      c: flip * c,
      w: Math.min(0.46, w * fit),
      amp: range(0.8, 1.35),
      swings: swings[i],
      phase: r()
    };
    c = Math.min(0.3, Math.max(0.17, c + range(-0.035, 0.035)));
    if (i < gaps.length) y -= flip * gaps[i] * fit;
    return f;
  });
  d.bias = range(-4, 5);
  d.clothTurn = range(-16, 16);
  d.tilt = range(-32, -16);
  return d;
}

/** The scene a palette and a view draw in a box: the silk's design for the view's shape. */
export const silkScene = (P: Palette, view: SilkView, size: Size): SilkScene =>
  buildSilkScene(P, view, size.width, size.height, silkDesign(view.shape));
