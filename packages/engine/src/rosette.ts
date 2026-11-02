/* Rosette lean: the rosette (styles-lab/sketches/flower-rosette) drawn with few, plain shapes, so a list of them is cheap,
   it moves cheaply and Figma's timeline plays it.

   The flower is a conformal golden lattice: petal n anchors at z_n = S e^((a + i phi) n), phi the golden angle, so every
   petal is the one before it turned 137.508 degrees and grown by e^a. The growth a is large (about 0.07 a petal against
   the full sketch's 0.027), so about 60 petals fill the box from the heart to its farthest corner: a coarse 5/8 lattice
   whose petals are big lenses.

   Each petal holds one clear color from the palette's curve, by its place out from the heart: the palette runs out
   and back (start, end, start) once every `period` petals, so the flower shows its palette in rings, inner petals at
   one end of the curve and the ring beyond at the other. A petal's color is its slot's, (n + phase) mod period. Or
   the palette runs around the flower (angular): a slot's petals lie on one nearly straight spoke, so a slot reads the
   palette by its spoke's angle, out and back around the turn. Rings is the design; a shape number picks the coloring,
   the petals' count (about 45, 60 or 90) and the period (wide rings of 34 petals or tight ones of 21), every one a
   loop that ends on its first frame.

   A petal is one shape: a lens (two circular arcs), filled with its ring's one gradient, which lies in the petal's own
   bounding box (a radial gradient: a deep base, the ring's color, a lit tip, its middle off to one side for a fold
   across), so the shading rides with the petal at no extra element. Petals are painted rim-in, so inner petals lie
   over outer ones and the deep bases under their tips read as depth. A fixed glow covers the heart, where new petals
   are born under it.

   Motion: the petals are one group, which zooms by e^(a flow) and turns by flow golden angles' residual over a loop,
   laying petal n where petal n + flow stood. The flow is the rings' period, so every petal lands on a petal of its own
   slot, and with colors fixed to petals the frame a loop on is the first frame exactly: the rings ripple out from the
   heart as the petals grow. */
import { lchToSrgb, srgbToLch, type Triple } from "./color.ts";
import { sampleSrgb } from "./curve.ts";
import type { Palette } from "./palette.ts";
import type { Size } from "./view.ts";

export type { Size };

export const TAU = 2 * Math.PI;
/** The golden angle, 2 pi / phi^2, radians: 137.508 degrees. */
export const GOLDEN = Math.PI * (3 - Math.sqrt(5));
/** The turn F petals make past whole laps, -pi to pi: small where F is a Fibonacci number. */
export const residual = (F: number) => {
  const a = F * GOLDEN;
  return a - TAU * Math.round(a / TAU);
};
const FIB = [1, 2, 3, 5, 8, 13, 21, 34, 55];

export interface RosetteView {
  angle: number;
  shape: number | null;
}
export type Stops = readonly (readonly [number, number])[];

/** The design: everything a shape number or a density varies. Lengths are in the lattice's cell sides unless said. */
export interface RosetteDesign {
  /** log-radius a petal grows by */
  growth: number;
  /** the spirals' hand: 1 or -1 */
  hand: number;
  /** petals each petal moves out by in a loop (a Fibonacci number: the loop turns the flower little); the rings'
      period, so the loop ends on its first frame */
  flow: number;
  /** the slot the petal at n = 0 takes: which ring of the palette the heart's petals hold */
  phase: number;
  /** how slots read the palette: rings, out and back from the heart; angular, around the flower */
  coloring: "rings" | "angular";
  /** seconds a loop at speed 1 */
  loop: number;
  /** the lens: from `base` behind its anchor to `tip` beyond it, `half` its half-width, in cell sides */
  base: number;
  tip: number;
  half: number;
  /** the palette read from its end */
  reverse: boolean;
  /** the petal's gradient in its bounding box (0..1 along from base to tip, 0..1 across from its -y edge): a radial
      gradient, middle (cu, cv), radii (ru, rv) */
  grad: { cu: number; cv: number; ru: number; rv: number };
  /** the gradient's stops: offset and tone, tone -1 the ring's shade, 0 its color, 1 its tint */
  stops: Stops;
  /** how deep the shade (lightness factor) and how far the tint goes toward white */
  shadeF: number;
  tintF: number;
  /** the heart's glow: opaque out to heartIn, gone by heartOut, shares of S (the half-diagonal) */
  heartIn: number;
  heartOut: number;
  /** the flower's turn at t = 0, radians */
  turn0: number;
}

/** The densities: about 45, 60 and 90 petals in a 16:9 box. The default is 60, the 5/8 lattice's own growth. */
export const ROSETTE_DENSITY = {
  45: { growth: 0.095 },
  60: { growth: 0.0713 },
  90: { growth: 0.0475 }
} as const;
export type RosetteDensity = keyof typeof ROSETTE_DENSITY;

export const ROSETTE_DESIGN: RosetteDesign = {
  growth: 0.0713,
  hand: 1,
  flow: 34,
  phase: 0,
  coloring: "rings",
  loop: 120,
  base: 1.05,
  tip: 1.0,
  half: 0.47,
  reverse: false,
  grad: { cu: 0, cv: 0.5, ru: 1, rv: 1.6 },
  stops: [
    [0, -0.75],
    [0.5, -0.3],
    [0.78, 0],
    [1, 0.45]
  ],
  shadeF: 0.42,
  tintF: 0.55,
  heartIn: 0.012,
  heartOut: 0.03,
  turn0: 0
};

/** mulberry32 */
function dice(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The design a shape number draws: shape 0 or none the design itself at a density (60 unless said); any other a
    seeded variation that picks the coloring, the density and the period too. The loop grows by `flow` petals at one
    pace whatever they are: about 0.02 of log radius a second. */
export function rosetteDesign(shape: number | null, density: RosetteDensity = 60): RosetteDesign {
  const paced = (d: RosetteDesign): RosetteDesign => ({
    ...d,
    loop: Math.round(
      (ROSETTE_DESIGN.loop * d.growth * d.flow) / (ROSETTE_DESIGN.growth * ROSETTE_DESIGN.flow)
    )
  });
  if (!shape) return fit(paced({ ...ROSETTE_DESIGN, growth: ROSETTE_DENSITY[density].growth }));
  const r = dice(0x9e3779b9 ^ Math.imul(shape, 0x85ebca6b));
  const lerp = (a: number, b: number) => a + (b - a) * r();
  const pick = r();
  const dens: RosetteDensity = pick < 0.25 ? 45 : pick < 0.75 ? 60 : 90;
  const flow = r() < 0.6 ? 34 : 21;
  const d: RosetteDesign = {
    ...ROSETTE_DESIGN,
    growth: ROSETTE_DENSITY[dens].growth,
    flow,
    coloring: r() < 0.7 ? "rings" : "angular",
    hand: r() < 0.5 ? 1 : -1,
    reverse: r() < 0.35,
    phase: Math.floor(r() * flow),
    base: lerp(0.95, 1.15),
    tip: lerp(0.9, 1.1),
    half: lerp(0.44, 0.5),
    grad: { ...ROSETTE_DESIGN.grad, cv: lerp(0.25, 0.75) },
    turn0: lerp(0, TAU)
  };
  return fit(paced(d));
}

/** No gaps: widen the petal until the lattice is covered with a margin. */
function fit(d: RosetteDesign): RosetteDesign {
  for (let i = 0; i < 16 && gapOf(d) > 0; i++) d.half += 0.01;
  return d;
}

export interface RosetteLattice {
  /** log-radius per petal */
  k: number;
  /** turn per petal, signed by the hand */
  alpha: number;
  /** a cell's side in log-polar units: the square root of its area, 2 pi k */
  side: number;
  /** the turn a loop makes, signed by the hand, and its zoom */
  beta: number;
  zoom: number;
  /** the two shortest lattice steps (Fibonacci numbers) and their vectors in log-polar (log r, theta) */
  pair: [number, number];
  va: [number, number];
  vb: [number, number];
}

export function latticeOf(d: RosetteDesign): RosetteLattice {
  const k = d.growth;
  const vec = (F: number): [number, number] => [k * F, d.hand * residual(F)];
  /* the pair of steps that spans a cell: the two shortest */
  const byLen = FIB.slice(2)
    .map(F => ({ F, l: Math.hypot(...vec(F)) }))
    .sort((x, y) => x.l - y.l);
  let [p, q] = [byLen[0].F, byLen[1].F];
  if (p > q) [p, q] = [q, p];
  return {
    k,
    alpha: d.hand * GOLDEN,
    side: Math.sqrt(TAU * k),
    beta: d.hand * residual(d.flow),
    zoom: Math.exp(k * d.flow),
    pair: [p, q],
    va: vec(p),
    vb: vec(q)
  };
}

/** The petal in its own frame: the heart at the origin, its anchor at (1, 0). Lengths are shares of the anchor's
    radius. */
export interface RosetteLens {
  x0: number;
  x1: number;
  /** half-width */
  w: number;
  /** the lens's middle and its circles' centers (xm, +-d), radius rho */
  xm: number;
  d: number;
  rho: number;
  /** the farthest the lens reaches from its anchor, and from the heart */
  reach: number;
  outer: number;
}

export function lensOf(d: RosetteDesign, L: RosetteLattice): RosetteLens {
  const s = L.side;
  const x0 = 1 - d.base * s;
  const x1 = 1 + d.tip * s;
  const c = (x1 - x0) / 2;
  const w = d.half * s;
  const rho = (c * c + w * w) / (2 * w);
  const xm = (x0 + x1) / 2;
  return {
    x0,
    x1,
    w,
    xm,
    d: rho - w,
    rho,
    reach: Math.max(1 - x0, x1 - 1, Math.hypot(Math.abs(xm - 1) + c, w)),
    outer: x1
  };
}

/** The lens's signed distance at a point of its frame, shares of the anchor's radius: negative inside. */
export function lensSd(l: RosetteLens, qx: number, qy: number): number {
  const lx = qx - l.xm;
  const ly = Math.abs(qy) + l.d;
  return Math.sqrt(lx * lx + ly * ly) - l.rho;
}

/** The share of a cell's points no petal covers by at least `margin` (shares of the anchor's radius), sampled n by n. */
export function gapOf(d: RosetteDesign, n = 20, margin = 0.012): number {
  const L = latticeOf(d);
  const lens = lensOf(d, L);
  let gaps = 0;
  for (let u = 0; u < n; u++)
    for (let v = 0; v < n; v++) {
      const rho = ((u + 0.5) / n) * L.va[0] + ((v + 0.5) / n) * L.vb[0];
      const th = ((u + 0.5) / n) * L.va[1] + ((v + 0.5) / n) * L.vb[1];
      let covered = false;
      for (let di = -3; di <= 3 && !covered; di++)
        for (let dj = -3; dj <= 3 && !covered; dj++) {
          const e = Math.exp(rho - di * L.va[0] - dj * L.vb[0]);
          const t = th - di * L.va[1] - dj * L.vb[1];
          if (lensSd(lens, e * Math.cos(t), e * Math.sin(t)) < -margin) covered = true;
        }
      if (!covered) gaps++;
    }
  return gaps / (n * n);
}

/** A gradient's place at a point of the lens's frame: 0 at its middle, 1 at its radii. */
export function gradG(d: RosetteDesign, l: RosetteLens, qx: number, qy: number): number {
  const u = (qx - l.x0) / (l.x1 - l.x0);
  const v = (qy + l.w) / (2 * l.w);
  const gx = (u - d.grad.cu) / d.grad.ru;
  const gy = (v - d.grad.cv) / d.grad.rv;
  return Math.sqrt(gx * gx + gy * gy);
}

/** Darker, keeping the color's hue rich: a yellow's shade turns toward amber, never toward olive. */
export function shade(c: Triple, f: number, chroma = 1.08): Triple {
  const [L, C, H] = srgbToLch(c);
  const h = ((H % 360) + 360) % 360;
  let turn = 0;
  if (C > 0.02 && h > 60 && h < 140) {
    const w =
      (h < 70 ? (h - 60) / 10 : h > 130 ? (140 - h) / 10 : 1) * Math.min(1, (C - 0.02) / 0.03);
    turn = -w * (h - 55) * Math.min(1, (1 - f) * 2.4);
  }
  return lchToSrgb(L * f, C * chroma, H + turn);
}
/** Lighter, toward white, keeping a dark color's chroma so it lifts rather than greys. */
export function tint(c: Triple, f: number): Triple {
  const [L, C, H] = srgbToLch(c);
  return lchToSrgb(L + (1 - L) * f, C * (1 - 0.35 * f + 0.4 * (1 - L) * (1 - L)), H);
}

const byte = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255) / 255;
export const bytes = (c: Triple): Triple => [byte(c[0]), byte(c[1]), byte(c[2])];
/** A petal's slot: (n + phase) mod flow. */
export const slotOf = (d: RosetteDesign, n: number) => (((n + d.phase) % d.flow) + d.flow) % d.flow;
/** A slot's place on the palette, 0 its start and 1 its end: rings run out and back over the period; angular reads
    the angle of the slot's spoke (its petal nearest the frame's middle ring, n about -20, at the loop's start), out and
    back around the turn. */
export function slotT(d: RosetteDesign, slot: number): number {
  if (d.coloring === "angular") {
    const m = slot - d.phase;
    const n = m - d.flow * Math.round((m + 20) / d.flow);
    const a = (d.hand * GOLDEN * n + d.turn0) / TAU;
    return 1 - Math.abs(2 * (a - Math.floor(a)) - 1);
  }
  return 1 - Math.abs((2 * slot) / d.flow - 1);
}

export interface RosetteColors {
  /** the distinct gradients' stops (8-bit), in order of the design's stops */
  grads: Triple[][];
  /** each slot's gradient: slots reading one place on the palette share one */
  keyOfSlot: number[];
  heart: Triple;
  ground: Triple;
}

export function rosetteColors(P: Palette, d: RosetteDesign): RosetteColors {
  const at = (t: number) => sampleSrgb(P, Math.min(1, Math.max(0, d.reverse ? 1 - t : t)));
  /* each key its color on the palette's curve, and each stop its own shade or tint of it (OKLCH), so a dark stop stays
     rich rather than a grey mix */
  const grads: Triple[][] = [];
  const byT = new Map<number, number>();
  const keyOfSlot: number[] = [];
  for (let slot = 0; slot < d.flow; slot++) {
    const t = Math.round(slotT(d, slot) * 1e6) / 1e6;
    let key = byT.get(t);
    if (key === undefined) {
      key = grads.length;
      byT.set(t, key);
      const c = at(t);
      grads.push(
        d.stops.map(([, tone]) =>
          bytes(
            tone < 0
              ? shade(c, 1 + tone * (1 - d.shadeF), 1 - 0.1 * tone)
              : tone > 0
                ? tint(c, tone * d.tintF)
                : c
          )
        )
      );
    }
    keyOfSlot.push(key);
  }
  /* the heart: the palette's start, glowing where it is light, a deep well where it is dark */
  const h0 = at(0);
  const Lh = srgbToLch(h0)[0];
  const heart = bytes(tint(h0, 0.35 * Lh * Lh));
  /* the ground (only seen at the heart under its glow, and along a hairline where two edges meet) */
  let deepest = at(0);
  let dl = 2;
  for (let i = 0; i <= 16; i++) {
    const c = at(i / 16);
    const l = srgbToLch(c)[0];
    if (l < dl) {
      dl = l;
      deepest = c;
    }
  }
  return { grads, keyOfSlot, heart, ground: bytes(shade(deepest, 0.5, 1)) };
}

/** The flower's scale, S over the box's longer side: a 16:9 box's half-diagonal, so a wide picture shows the flower as
    designed, and every box shows the one flower its longer side frames, centered. A box's still is so the one design
    covering it (CSS's cover), which the server can paint before it knows the box, and the player lays out alike. */
export const ROSETTE_SPAN = Math.hypot(16, 9) / 32;

/** Everything a drawing of one palette and view in one box needs. */
export interface RosetteScene {
  design: RosetteDesign;
  lattice: RosetteLattice;
  lens: RosetteLens;
  colors: RosetteColors;
  box: Size;
  /** the flower's scale, px: ROSETTE_SPAN of the box's longer side */
  S: number;
}

export function rosetteScene(
  P: Palette,
  view: RosetteView,
  box: Size,
  density: RosetteDensity = 60,
  over: Partial<RosetteDesign> = {}
): RosetteScene {
  const design = { ...rosetteDesign(view.shape, density), ...over };
  /* the view's angle turns the flower: 90 as designed */
  design.turn0 += ((view.angle - 90) * Math.PI) / 180;
  const lattice = latticeOf(design);
  return {
    design,
    lattice,
    lens: lensOf(design, lattice),
    colors: rosetteColors(P, design),
    box,
    S: ROSETTE_SPAN * Math.max(box.width, box.height)
  };
}

/** The loop's phase at t seconds: 0 to 1. */
export const rosettePhase = (sc: RosetteScene, t: number) => {
  const f = t / sc.design.loop;
  return f - Math.floor(f);
};

/** The petal group's transform at loop phase tau: a zoom about the heart and a turn, radians. */
export function rosetteGroupAt(sc: RosetteScene, tau: number): { zoom: number; turn: number } {
  return { zoom: Math.exp(sc.lattice.k * sc.design.flow * tau), turn: sc.lattice.beta * tau };
}

/** A petal as a drawing places it before the group moves: anchor radius (px) and turn (radians, y down). */
export interface RosettePetal {
  n: number;
  r: number;
  th: number;
  /** its gradient: its slot's */
  key: number;
}

/** Whether a petal with anchor (r, th) reaches into the box (its circle of reach about the anchor meets it). */
function inBox(sc: RosetteScene, r: number, th: number, pad = 2): boolean {
  const ax = r * Math.cos(th);
  const ay = r * Math.sin(th);
  const gx = Math.max(0, Math.abs(ax) - sc.box.width / 2);
  const gy = Math.max(0, Math.abs(ay) - sc.box.height / 2);
  return gx * gx + gy * gy <= (r * sc.lens.reach + pad) ** 2;
}

/** The petals a drawing holds, rim first (inner petals over outer ones), placed as at t = 0. The still holds those that
    reach out of the heart's opaque middle and into the box at t = 0; a moving drawing (`moving`) holds every petal that
    does so at any time of the loop: `flow` more toward the heart, and the few the turn brings in at the corners. */
export function rosettePetals(sc: RosetteScene, moving = false): RosettePetal[] {
  const { k, alpha } = sc.lattice;
  const d = sc.design;
  const L = sc.lens;
  const inner = d.heartIn * sc.S;
  /* the innermost: its tip reaches out of the heart's opaque middle (at the loop's end, for a moving drawing) */
  const lo = Math.ceil(Math.log(inner / (sc.S * L.outer)) / k) - (moving ? d.flow : 0);
  /* the outermost: its nearest point is inside the box's corner, which a box squarer than 16:9 has beyond S */
  const near = Math.max(0.02, 1 - L.reach);
  const corner = Math.hypot(sc.box.width, sc.box.height) / 2 / sc.S;
  const hi = Math.floor(Math.log(corner / near) / k) + 1;
  const out: RosettePetal[] = [];
  const steps = moving ? 24 : 0;
  for (let n = hi; n >= lo; n--) {
    const r = sc.S * Math.exp(k * n);
    const th = alpha * n + d.turn0;
    let keep = false;
    for (let s = 0; s <= steps && !keep; s++) {
      const g = rosetteGroupAt(sc, s / Math.max(1, steps));
      keep = inBox(sc, r * g.zoom, th + g.turn, moving ? 4 : 2);
    }
    if (keep) out.push({ n, r, th, key: sc.colors.keyOfSlot[slotOf(d, n)] });
  }
  return out;
}

/** Piecewise linear by stops, held flat past either end (as SVG pads a gradient). */
export function stopValue(stops: Stops, g: number): number {
  if (g <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (g <= stops[i][0]) {
      const a = stops[i - 1];
      const b = stops[i];
      return a[1] + ((b[1] - a[1]) * (g - a[0])) / (b[0] - a[0]);
    }
  }
  return stops[stops.length - 1][1];
}

/** The heart's glow, opacity by radius between heartIn (0) and heartOut (1). */
export const HEART_STOPS: Stops = [
  [0, 1],
  [0.35, 0.72],
  [0.7, 0.22],
  [1, 0]
];

/** A gradient's color at g, from its 8-bit stops at the design's offsets, as SVG paints it. */
export function gradColor(d: RosetteDesign, cs: readonly Triple[], g: number, out: Float64Array) {
  const st = d.stops;
  if (g <= st[0][0]) {
    out[0] = cs[0][0];
    out[1] = cs[0][1];
    out[2] = cs[0][2];
    return;
  }
  for (let i = 1; i < st.length; i++) {
    if (g <= st[i][0]) {
      const f = (g - st[i - 1][0]) / (st[i][0] - st[i - 1][0]);
      const a = cs[i - 1];
      const b = cs[i];
      out[0] = a[0] + (b[0] - a[0]) * f;
      out[1] = a[1] + (b[1] - a[1]) * f;
      out[2] = a[2] + (b[2] - a[2]) * f;
      return;
    }
  }
  const z = cs[cs.length - 1];
  out[0] = z[0];
  out[1] = z[1];
  out[2] = z[2];
}
