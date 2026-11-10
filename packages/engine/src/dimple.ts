/* The dimple: a sheet of round scales, a hexagonal packing of discs, pressed in at one point (John, 9 Nov 2026, of a
   picture of three such cards: "work on a style like this. like dimpled sheet metal"). Every disc is filled with a
   short run of the palette along the line toward the hollow, its outer side the earlier (the darker: the palette is
   laid with its darker end in the hollow), so each disc's dark edge lies against the light edge of the disc outside it
   and the sheet reads as steps down into the hollow. The palette runs from the hollow out to the sheet's far corners;
   the discs crowd toward the hollow and overlap; the wall facing the light is lit and the wall under it shaded.

   It has no loop: nothing moves by itself (10 Nov 2026: "there should be no stationary animations for this one"), so
   its picture has no time, only where the hollow is. The hollow goes to the pointer where a page can know it ("what
   if we did a simple animation the follows the users cursor") and stays where the pointer left it ("just have it hold
   its last posisiion instead of resetting to the center"); until a pointer comes it is at its rest, which is what
   every still, file and card draws.

   The discs lie in one stack, the nearer the hollow's rest the higher, and keep it wherever the hollow goes: ordered
   by the hollow itself, the discs about the pointer changed places as it moved ("the z index of the area around the
   hovered cells changing doesnt look good"). The rest is on a disc's middle, so one disc is the heart, over all six
   about it ("whats with the one dot having a higher z index than the center one? all others follow the same rule
   except this one": between two discs, the two tied and one lay over the other).

   Nothing steps as the hollow moves: a disc's place along the palette is any number, and its colors are the palette
   itself read along its line (at so many places along the palette, a whole disc changed color at once).

   Lengths are shares of D, the box's longer side, so every box shows the one design its longer side frames,
   centered, and a still drawn in a square covers any box (fx-still.ts). The arithmetic is plain, a line for each of
   the shader's (dimple-gl.ts, dimple-wgsl.ts) and the pages' (dimple-page.ts). */
import { srgbToLch } from "./color.ts";
import { sampleSrgb } from "./curve.ts";
import { DEG } from "./math.ts";
import type { Palette } from "./palette.ts";
import type { Size } from "./view.ts";

/** What a dimple's picture depends on besides its palette and where its hollow is: its turn and its shape. */
export interface DimpleView {
  /** 90 as designed: the columns of discs upright and the light from above; the sheet and its light turn with it */
  angle: number;
  /** 0 or none: as designed */
  shape: number | null;
}

/** Where the hollow is, in the box's pixels; null at its rest. */
export type DimpleAt = readonly [number, number] | null;

/** The palette's colors a disc reads between, by straight lines, as a gradient of them does. */
export const DIMPLE_STOPS = 33;
/** The steps of the ground's gradient about the hollow, out to the farthest corner: one more colors. */
export const DIMPLE_GROUND_STEPS = 16;
/** Seconds the hollow takes to come most of the way to the pointer at speed 1 (1 - 1/e of what is left). */
export const DIMPLE_EASE_S = 0.14;

/** The tuned numbers: lengths in pitches unless said. */
export const DIMPLE_LOOK = {
  /** a disc's radius: a hair under half a pitch, so discs at rest far from the hollow just clear each other */
  radius: 0.492,
  /** how far along the palette a disc runs each way from its own place */
  run: 0.155,
  /** the palette's place at the hollow's heart */
  floor: 0.05,
  /** where a disc's inner end comes to the palette's far end, in D: 0.66 of a 16:9 box's half-diagonal */
  reach: 0.3786,
  /** the discs drawn toward the hollow: the most (a share of their distance) and over how far */
  pinch: 0.2,
  pinchOver: 2.6,
  /** the wall facing the light lit, the wall under it shaded: how much of the palette, and where the wall is steepest;
      it dies away over the last `litOut` of the palette's reach, so past the reach the sheet is flat, every disc the
      palette's far end, and an SVG draws them all as one circle used again (dimple-svg.ts) */
  lit: 0.17,
  litAt: 1.5,
  litOut: 0.35,
  /** a disc at the hollow's heart loses its run within this of the heart, down to `least` of it (never all: its
      shape in the SVG is scaled by one over what is left) */
  heart: 0.5,
  least: 1 / 256,
  /** a disc on the lit wall counts as nearer the hollow's rest by this share of its distance, in the stack: discs
      as far from the rest that overlap then have an order every form reads alike, the lower over the upper */
  over: 0.02,
  /** the ground under the discs: so far back along the palette from the discs' own places */
  under: 0.03
} as const;

/** A shape's design. */
export interface DimpleDesign {
  /** the hollow's rest from the box's middle, in D: within what a box five times as wide as it is tall shows */
  x: number;
  y: number;
  /** pitches across D: never more than the designed look's, whose still is as heavy as a list's card may be
      (dimple-svg.ts) */
  across: number;
  /** the reach's and the pinch's scale */
  reach: number;
  pinch: number;
}

/** The designed look, shape 0: the hollow in the box's middle, 10.8 discs up a 16:9 box as John's cards have them. */
export const DIMPLE_DESIGNED: DimpleDesign = { x: 0, y: 0, across: 19.2, reach: 1, pinch: 1 };

const round = (v: number, step: number) => Math.round(v / step) * step;

/** mulberry32: a design's random numbers, the same everywhere. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A shape's design: where the hollow rests, how many discs cross the box, how far the palette reaches and how
    hard the sheet is pressed. */
export function dimpleDesign(shape: number | null): DimpleDesign {
  if (!shape) return DIMPLE_DESIGNED;
  const r = rng(Math.imul(shape, 2654435761));
  return {
    x: round((r() - 0.5) * 0.24, 1e-4),
    y: round((r() - 0.5) * 0.2, 1e-4),
    across: round(12.8 + 6.4 * r(), 1e-3),
    reach: round(0.8 + 0.5 * r(), 1e-3),
    pinch: round(0.6 + 0.8 * r(), 1e-3)
  };
}

/** All a picture is drawn from, plain numbers. */
export interface DimpleScene {
  width: number;
  height: number;
  /** the box's longer side */
  D: number;
  /** the pitch and a disc's radius, pixels */
  p: number;
  r: number;
  /** the lattice: disc (i, j) lies at (ox, oy) + i a1 + j a2 before it is drawn in; fixed in the box, so the discs
      stay put as the hollow moves. Disc (0, 0) lies on the hollow's rest, (ox, oy) */
  a1x: number;
  a1y: number;
  a2x: number;
  a2y: number;
  ox: number;
  oy: number;
  /** from a point to lattice steps */
  m00: number;
  m01: number;
  m10: number;
  m11: number;
  /** the palette's reach, the pinch's strength and width, the lit wall's place, the heart: pixels but the strength */
  reach: number;
  pinch: number;
  pinchOver: number;
  litAt: number;
  heart: number;
  /** toward the light, on the page */
  lx: number;
  ly: number;
  /** the palette's colors, its darker end first: DIMPLE_STOPS of them, each channel a byte's, 0 to 1 */
  stops: number[];
  /** the discs that can show in the box wherever the hollow is, as lattice steps (i, j), in the stack's order: the
      bottom disc first */
  places: Int32Array;
}

/** A disc of a picture. */
export interface DimpleDisc {
  /** its middle */
  x: number;
  y: number;
  /** toward the hollow, a unit */
  ux: number;
  uy: number;
  /** its middle's place along the palette, 0 to 1, and how much of its run it has (1 but at the heart): its colors
      are the palette from t - run k at its outer end to t + run k at its inner end */
  t: number;
  k: number;
}
export const dimpleDiscBlank = (): DimpleDisc => ({ x: 0, y: 0, ux: 0, uy: 0, t: 0, k: 1 });

const byte = (v: number) => Math.floor(Math.min(1, Math.max(0, v)) * 255 + 0.5) / 255;

/** The palette's colors as a dimple reads them: DIMPLE_STOPS along its curve, each channel a byte's, the darker end
    first (the hollow's). */
export function dimpleStops(P: Palette): number[] {
  const n = DIMPLE_STOPS;
  const colors: number[][] = [];
  for (let i = 0; i < n; i++) colors.push(sampleSrgb(P, i / (n - 1)).map(byte));
  const flip = srgbToLch(colors[0])[0] > srgbToLch(colors[n - 1])[0];
  return (flip ? colors.reverse() : colors).flat();
}

/** How much of its distance from the hollow a point at that distance keeps once the sheet is drawn in. */
export const dimpleDrawn = (m: DimpleScene, d: number): number =>
  1 - m.pinch * Math.exp((-d * d) / (2 * m.pinchOver * m.pinchOver));

/** The palette's place at a distance from the hollow's heart. */
export const dimpleLevel = (m: DimpleScene, d: number): number =>
  DIMPLE_LOOK.floor + (1 - DIMPLE_LOOK.run - DIMPLE_LOOK.floor) * Math.min(1, d / m.reach);

/** A disc's place in the stack, the greatest painted first: how far it lies from the hollow's rest once drawn in, a
    disc on the lit wall a little nearer than one as far on the shaded wall. It is read at the rest whatever the
    hollow does: the stack is the still's, and no disc changes places with its neighbour as the hollow moves. */
export function dimpleRank(m: DimpleScene, i: number, j: number): number {
  const px = i * m.a1x + j * m.a2x;
  const py = i * m.a1y + j * m.a2y;
  const rho = Math.sqrt(px * px + py * py);
  const facing = rho > 1e-6 ? -(px * m.lx + py * m.ly) / rho : 0;
  return rho * dimpleDrawn(m, rho) * (1 - DIMPLE_LOOK.over * facing);
}

/** The disc at lattice place (i, j) with the hollow at (cx, cy). */
export function dimpleDisc(
  m: DimpleScene,
  i: number,
  j: number,
  cx: number,
  cy: number,
  out: DimpleDisc
): DimpleDisc {
  const px = m.ox + i * m.a1x + j * m.a2x - cx;
  const py = m.oy + i * m.a1y + j * m.a2y - cy;
  const rho = Math.sqrt(px * px + py * py);
  const g = dimpleDrawn(m, rho);
  const d = rho * g;
  out.x = cx + px * g;
  out.y = cy + py * g;
  const inv = rho > 1e-6 ? 1 / rho : 0;
  const ux = -px * inv;
  const uy = -py * inv;
  out.ux = ux;
  out.uy = uy;
  /* its place along the palette: by its distance, and the wall it lies on lit or shaded (a wall faces the hollow:
     the one across the hollow from the light faces the light) */
  const w = d / m.litAt;
  const wall =
    w * Math.exp(1 - w) * Math.min(1, Math.max(0, (m.reach - d) / (DIMPLE_LOOK.litOut * m.reach)));
  const facing = ux * m.lx + uy * m.ly;
  out.t = Math.min(1, Math.max(0, dimpleLevel(m, d) + DIMPLE_LOOK.lit * wall * facing));
  out.k = Math.max(DIMPLE_LOOK.least, Math.min(1, d / m.heart));
  return out;
}

/** The palette at t (clamped), straight lines between its stops, as a gradient of them reads: channels 0 to 1. */
export function dimpleRamp(m: DimpleScene, t: number, out: number[] | Float64Array, o = 0): void {
  const x = Math.min(1, Math.max(0, t)) * (DIMPLE_STOPS - 1);
  const i = Math.min(DIMPLE_STOPS - 2, Math.floor(x));
  const f = x - i;
  for (let q = 0; q < 3; q++) {
    const a = m.stops[i * 3 + q];
    out[o + q] = a + (m.stops[i * 3 + 3 + q] - a) * f;
  }
}

/** A disc's color at a point (ex, ey) from its middle: the palette along its line toward the hollow. */
export function dimpleTint(
  m: DimpleScene,
  disc: DimpleDisc,
  ex: number,
  ey: number,
  out: number[] | Float64Array
): void {
  const s = Math.max(-1, Math.min(1, (ex * disc.ux + ey * disc.uy) / m.r));
  dimpleRamp(m, disc.t + DIMPLE_LOOK.run * disc.k * s, out, 0);
}

/** The ground under the discs for a hollow at (cx, cy), written into `out`: a gradient about it of
    DIMPLE_GROUND_STEPS + 1 colors, each channel a byte's, from the heart out to the farthest corner of the design's
    square (the box's longer side each way, centered), so every box's ground is the square's. Gives back how far that
    corner is. */
export function dimpleGroundStops(
  m: DimpleScene,
  cx: number,
  cy: number,
  out: number[] | Float32Array | Float64Array
): number {
  const x0 = m.width / 2 - m.D / 2;
  const y0 = m.height / 2 - m.D / 2;
  const x1 = x0 + m.D;
  const y1 = y0 + m.D;
  const far = Math.sqrt(
    Math.max(
      (cx - x0) * (cx - x0) + (cy - y0) * (cy - y0),
      (x1 - cx) * (x1 - cx) + (cy - y0) * (cy - y0),
      (cx - x0) * (cx - x0) + (y1 - cy) * (y1 - cy),
      (x1 - cx) * (x1 - cx) + (y1 - cy) * (y1 - cy)
    )
  );
  const c = [0, 0, 0];
  for (let k = 0; k <= DIMPLE_GROUND_STEPS; k++) {
    dimpleRamp(m, dimpleLevel(m, (far * k) / DIMPLE_GROUND_STEPS) - DIMPLE_LOOK.under, c, 0);
    /* a stop's color is a byte a channel */
    out[k * 3] = byte(c[0]);
    out[k * 3 + 1] = byte(c[1]);
    out[k * 3 + 2] = byte(c[2]);
  }
  return far;
}

/** The ground for a hollow at (cx, cy): its colors and how far they reach. */
export function dimpleGround(m: DimpleScene, cx: number, cy: number): { far: number; c: number[] } {
  const c: number[] = [];
  const far = dimpleGroundStops(m, cx, cy, c);
  return { far, c };
}

/** The ground's color at a distance from the hollow, into out. */
export function dimpleGroundAt(
  ground: { far: number; c: number[] },
  dist: number,
  out: number[] | Float64Array
): void {
  const gd = Math.min(1, dist / ground.far) * DIMPLE_GROUND_STEPS;
  const gi = Math.min(DIMPLE_GROUND_STEPS - 1, Math.floor(gd));
  const gf = gd - gi;
  const c = ground.c;
  out[0] = c[gi * 3] + (c[gi * 3 + 3] - c[gi * 3]) * gf;
  out[1] = c[gi * 3 + 1] + (c[gi * 3 + 4] - c[gi * 3 + 1]) * gf;
  out[2] = c[gi * 3 + 2] + (c[gi * 3 + 5] - c[gi * 3 + 2]) * gf;
}

/** A point's lattice cell once the drawing-in is undone, the hollow at (cx, cy): the four discs at its corners are
    all that can cover it, which is how the shader finds a pixel's discs. */
export function dimpleCell(
  m: DimpleScene,
  x: number,
  y: number,
  cx: number,
  cy: number
): [number, number] {
  const qx = x - cx;
  const qy = y - cy;
  const dd = Math.sqrt(qx * qx + qy * qy);
  let rho = dd;
  for (let n = 0; n < 4; n++) rho = dd / dimpleDrawn(m, rho);
  const k = dd > 1e-6 ? rho / dd : 1;
  const sx = cx + qx * k - m.ox;
  const sy = cy + qy * k - m.oy;
  return [Math.floor(m.m00 * sx + m.m01 * sy), Math.floor(m.m10 * sx + m.m11 * sy)];
}

/** Where the hollow is: where a pointer last put it, else its rest. */
export const dimpleHollow = (m: DimpleScene, at: DimpleAt = null): readonly [number, number] =>
  at ?? [m.ox, m.oy];

/** A pixel's color as the shader finds it, the hollow at (cx, cy) on its ground: the ground under the four discs at
    its cell's corners, in the stack's order, each a circle a pixel's edge soft. What the shader's lines follow; the
    CPU's drawing paints disc by disc instead (dimple-render.ts), to the same picture. */
export function dimpleShade(
  m: DimpleScene,
  cx: number,
  cy: number,
  ground: { far: number; c: number[] },
  x: number,
  y: number,
  out: number[] | Float64Array
): void {
  dimpleGroundAt(ground, Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)), out);
  const [i0, j0] = dimpleCell(m, x, y, cx, cy);
  const discs: DimpleDisc[] = [];
  const ranks: number[] = [];
  for (let n = 0; n < 4; n++) {
    const i = i0 + (n & 1);
    const j = j0 + (n >> 1);
    const rank = dimpleRank(m, i, j);
    let at = discs.length;
    while (at > 0 && ranks[at - 1] < rank) at--;
    discs.splice(at, 0, dimpleDisc(m, i, j, cx, cy, dimpleDiscBlank()));
    ranks.splice(at, 0, rank);
  }
  const c = [0, 0, 0];
  for (const disc of discs) {
    const ex = x - disc.x;
    const ey = y - disc.y;
    const cover = Math.min(1, Math.max(0, m.r - Math.sqrt(ex * ex + ey * ey) + 0.5));
    if (cover <= 0) continue;
    dimpleTint(m, disc, ex, ey, c);
    out[0] += (c[0] - out[0]) * cover;
    out[1] += (c[1] - out[1]) * cover;
    out[2] += (c[2] - out[2]) * cover;
  }
}

/** The dimple in a box: the design a shape draws, turned by the angle, the palette's colors and the stack. */
export function dimpleScene(P: Palette, view: DimpleView, size: Size): DimpleScene {
  const L = DIMPLE_LOOK;
  const { width, height } = size;
  const D = Math.max(width, height);
  const d = dimpleDesign(view.shape);
  const p = D / d.across;
  /* the view's angle turns the lattice and the light: 90 as designed */
  const turn = (view.angle - 90) * DEG;
  const cs = Math.cos(turn);
  const sn = Math.sin(turn);
  const a1x = ((p * Math.sqrt(3)) / 2) * cs - (p / 2) * sn;
  const a1y = ((p * Math.sqrt(3)) / 2) * sn + (p / 2) * cs;
  const a2x = -p * sn;
  const a2y = p * cs;
  const det = a1x * a2y - a2x * a1y;
  const m: DimpleScene = {
    width,
    height,
    D,
    p,
    r: L.radius * p,
    a1x,
    a1y,
    a2x,
    a2y,
    ox: width / 2 + d.x * D,
    oy: height / 2 + d.y * D,
    m00: a2y / det,
    m01: -a2x / det,
    m10: -a1y / det,
    m11: a1x / det,
    reach: L.reach * d.reach * D,
    pinch: L.pinch * d.pinch,
    pinchOver: L.pinchOver * p,
    litAt: L.litAt * p,
    heart: L.heart * p,
    lx: sn,
    ly: -cs,
    stops: dimpleStops(P),
    places: new Int32Array(0)
  };
  m.places = dimplePlaces(m);
  return m;
}

/** The lattice places whose discs can reach the box wherever the hollow is, in the stack's order: the box's corners'
    steps and a margin, less those whose rest lies a pitch or more outside it (a disc is drawn in by less than half a
    pitch). */
function dimplePlaces(m: DimpleScene): Int32Array {
  let i0 = Infinity;
  let i1 = -Infinity;
  let j0 = Infinity;
  let j1 = -Infinity;
  for (let n = 0; n < 4; n++) {
    const x = (n & 1) * m.width - m.ox;
    const y = (n >> 1) * m.height - m.oy;
    const fi = m.m00 * x + m.m01 * y;
    const fj = m.m10 * x + m.m11 * y;
    i0 = Math.min(i0, fi);
    i1 = Math.max(i1, fi);
    j0 = Math.min(j0, fj);
    j1 = Math.max(j1, fj);
  }
  i0 = Math.floor(i0) - 2;
  i1 = Math.ceil(i1) + 2;
  j0 = Math.floor(j0) - 2;
  j1 = Math.ceil(j1) + 2;
  const found: [number, number, number][] = [];
  for (let i = i0; i <= i1; i++)
    for (let j = j0; j <= j1; j++) {
      const x = m.ox + i * m.a1x + j * m.a2x;
      const y = m.oy + i * m.a1y + j * m.a2y;
      if (x < -m.p || x > m.width + m.p || y < -m.p || y > m.height + m.p) continue;
      found.push([i, j, dimpleRank(m, i, j)]);
    }
  /* the stack, laid once: the bottom disc first */
  found.sort((a, b) => b[2] - a[2] || a[0] - b[0] || a[1] - b[1]);
  const places = new Int32Array(found.length * 2);
  found.forEach((at, n) => {
    places[n * 2] = at[0];
    places[n * 2 + 1] = at[1];
  });
  return places;
}
