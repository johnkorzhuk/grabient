/* Aurora: the palette as an aura of light boiling up behind a still range.
   The light is turbulence: a field of numbers read through the palette as a ramp, its darker end the night and its
   lighter end the hottest light. Sheets of one smooth noise, stretched long along the rays of a fan and thin across
   them, slide along the rays in opposite ways and are multiplied, so that where they agree a shaft stands and nothing
   drifts; over them finer shafts, and hot spots where two slow sheets agree. The noise is one small picture (a tile,
   the same for every aurora), read between its pixels by straight lines, so the CPU and the shader read the same
   numbers. Every sheet slides a whole number of tiles a loop, so the loop's last frame is its first. The light is
   read through the whole palette, no color of it left out and none made up (TONE below). The look's shape picks the fan the light rises in and where its sheets start (auroraDesign).
   In front stands the range, still. Its outline is a path the address carries (aurora-path.ts). Its color is the
   look's ground, as the blob's is: none leaves the range clear, the page through it; a color fills it, wholly or in
   part.

   Units: the scene is a picture 16 wide and 9 tall, 1 its height, x from its middle and y up from its bottom, set in
   the square of the box's longer side and turned about its middle by the angle (90 as designed). A 16:9 box at 90
   shows the picture whole; any other box shows what its middle covers, the model going on past the picture's sides
   (the range level from its ends, the light as it stands), so a still is one square laid over any box as CSS's cover
   lays it.
   Every format draws these numbers: the CPU (aurora-render.ts) and the player's shader (aurora-gl.ts) shade each
   pixel alike, and the SVGs (aurora-svg.ts) read the same light along the fan's rays. */
import { auroraHash } from "./aurora-hash.ts";
import { AURORA_DESIGNED_PATH, type AuroraPathParts, auroraPathParts } from "./aurora-path.ts";
import { hexBytes, srgbToLch } from "./color.ts";
import { sampleSrgb } from "./curve.ts";
import { clamp01 } from "./math.ts";
import type { Palette } from "./palette.ts";
import type { Size } from "./view.ts";

export interface AuroraView {
  angle: number;
  /** the light's shape, a number from 0 to 999 (effect.ts EffectLook's `shape`): where the rays fan from and how the
      sheets of noise lie along them (auroraDesign); none or 0 as designed */
  shape: number | null;
  /** the range's path (aurora-path.ts); none as designed */
  path: string | null;
  /** the range's color (effect.ts EffectLook's `bg`): #rrggbb, or #rrggbbaa where it lets the page through; none
      leaves the range clear */
  bg: string | null;
}

/** Seconds a loop at speed 1: every sheet slides whole tiles in it. */
export const AURORA_LOOP = 48;
/** The picture's height over the box's longer side, and half its width in its own units: 16 by 9. */
export const AURORA_SPAN = 9 / 16;
export const AURORA_HALF = 8 / 9;
/** The point the rays fan from, under the picture (1 tall, 0 its bottom). */
export const AURORA_FAN = { x: 0, y: -0.7 } as const;
/** The noise tile's side, and the cells of its coarsest lattice (so about half as many swells across it). */
export const AURORA_TILE = 256;
const CELLS = 24;
/** The ramp the light is read through: this many colors from the least light to the hottest. */
export const AURORA_RAMP = 128;
/** The noise tile's number: the one the designed look was picked with, and every aurora's (a shape reads the tile
    from other places, and a path changes the range and nothing of the light behind it). */
const TILE_SEED = 100;
/* TONE: where the palette stands along the light. Measured over the loop, the same at 16:9, 1:1 and 9:16: no pixel's
   light is under 0.09 (the haze at the picture's top), 55% are under 0.30, 83% under 0.50, 97% under 0.75. Read
   straight, light 0 to 1 as the palette's start to its end, the palette's first color took 0.4% of the light and its
   last 2.7%. So the palette runs from the least light a frame holds (LOW) to TIP, bent (BEND) so its later colors
   take more: of five colors 15%, 38%, 25%, 15% and 5% of the light, and the 2.3% above TIP its last color held,
   never a color the palette does not have (it once rose past the last toward white, until John, 13 Nov 2026: "i
   dont like how aura is adding white that isnt actually in the palette. the colors should be as faithful to the
   decoded seed colors as possible"). */
const LOW = 0.1;
const TIP = 0.85;
const BEND = 1.4;

/** A sheet of noise: how many tiles it spans a radian across the fan and a unit along a ray, where it starts, and
    how many tiles it slides a loop each way (whole numbers, so the loop closes). */
export interface AuroraSheet {
  across: number;
  along: number;
  u0: number;
  v0: number;
  du: number;
  dv: number;
}
/** The sheets, and how the light is made of them. */
export const AURORA_LIGHT = {
  /* broad shafts: two sheets sliding along the rays in opposite ways */
  a: { across: 0.85, along: 0.2, u0: 0.13, v0: 0.31, du: 0, dv: 2 },
  b: { across: 1.3, along: 0.28, u0: 0.57, v0: 0.71, du: 1, dv: -3 },
  /* fine shafts */
  c: { across: 4.6, along: 0.32, u0: 0.29, v0: 0.11, du: -1, dv: 5 },
  /* hot spots: two slow sheets over the picture itself, sliding past each other */
  h1: { across: 0.22, along: 0.2, u0: 0.4, v0: 0.2, du: 1, dv: 1 },
  h2: { across: 0.3, along: 0.26, u0: 0.8, v0: 0.6, du: -2, dv: 1 },
  /* where the light gathers across the fan: one slow soft sheet, read by angle alone */
  g: { across: 0.42, along: 0, u0: 0.7, v0: 0.37, du: 1, dv: 1 },
  /* a shaft stands where both broad sheets are over the first number, fully by the second; its halo likewise, of
     the soft tile */
  shaft: [0.28, 0.8],
  halo: [0.18, 0.78],
  fine: [0.42, 0.9],
  hot: [0.45, 0.75],
  gather: [0.25, 0.75],
  /* the haze: its strength at the range and how fast it thins upward; and the same for the shafts */
  haze: 0.35,
  hazeFall: 0.5,
  rise: 0.07,
  fall: 0.28,
  /* the hot spots keep nearer the range than the shafts do */
  hotFall: 0.2,
  /* how much each part adds */
  halos: 0.56,
  shafts: 0.55,
  fines: 0.14,
  hots: 0.6
} as const satisfies Record<string, AuroraSheet | readonly number[] | number>;

/** What a shape draws the light by: the point the rays fan from and the six sheets. */
export interface AuroraDesign {
  fan: { x: number; y: number };
  a: AuroraSheet;
  b: AuroraSheet;
  c: AuroraSheet;
  h1: AuroraSheet;
  h2: AuroraSheet;
  g: AuroraSheet;
}
/** The light as designed: shape 0's, and none's. */
export const AURORA_DESIGNED: AuroraDesign = {
  fan: AURORA_FAN,
  a: AURORA_LIGHT.a,
  b: AURORA_LIGHT.b,
  c: AURORA_LIGHT.c,
  h1: AURORA_LIGHT.h1,
  h2: AURORA_LIGHT.h2,
  g: AURORA_LIGHT.g
};
/** What a shape may change, each from its least to its most: how far under the picture the rays fan from (as
    designed 0.7: nearer, they spread like a burst; farther, they stand nearly upright), how far to one side (they lean
    away from it), how wide the shafts are on the picture (1 as designed), and how many tiles of the slow sheet the
    light gathers by span a radian on the picture as designed (0.42: fewer, it gathers in one or two broad places;
    more, in several). Picked by eye on 13 Nov 2026 from montages of random shapes in Neon candy and Electric blue
    (W/aurora-shape): past these the broadest shafts turn to blobs and the nearest fan to a sunburst. The narrowest
    shafts and the deepest fan are kept where any frame's SVG keeps to its CPU frame (the conformance suite's limits,
    a 99th percentile of 8 and 0.6% far, at 320 by 180, its hardest size): with shafts to 0.75 and fans to 1.15 deep,
    one of all 999 shapes came to 8.3, the narrowest and deepest, as the 99th percentile climbs as the shafts narrow
    (the mean of each fifth of the shapes by width, 6.7 at 0.8 to 6.1 at 1.2) and as the fan deepens. Within these,
    all 999 at 90 degrees came within 7.80, and the thirty hardest at four angles and six times within 7.94 and
    0.58%, where the light as designed comes within 7.40 and 0.39% (13 Nov 2026). */
export const AURORA_SHAPES = {
  depth: [0.5, 1.05],
  lean: [-0.25, 0.25],
  wide: [0.85, 1.3],
  gather: [0.25, 0.75]
} as const;
/* the height in the picture (0 its bottom, 1 its top) at which the shafts stand as wide whatever the fan's depth:
   just over the designed range, which stands about 0.37 high, where the light is brightest */
const KEEP_AT = 0.4;
/* a design's number to four decimals: the same in every engine that works it out */
const kept4 = (v: number) => Math.floor(v * 10000 + 0.5) / 10000;
/** The light a shape draws: as designed for none and 0, and for any other number from 1 to 999 a fan of its own
    (AURORA_SHAPES) and every sheet starting at a place of its own in the tile, so that the same loop plays other
    flames. The sheets slide as designed, whole tiles a loop, so every shape's loop closes and keeps the designed
    pace; the shafts are spread over the fan by how far it reaches, so that they stand as wide on the picture at its
    middle height as `wide` says whatever its depth, and the fine shafts as wide as designed (the finest detail an SVG
    of a frame draws, which the narrowest shafts would otherwise make finer still). */
export function auroraDesign(shape: number | null): AuroraDesign {
  if (!shape) return AURORA_DESIGNED;
  let i = 0;
  const r = () => auroraHash(i++, shape * 104729 + 5);
  const between = ([least, most]: readonly number[]) => least + (most - least) * r();
  const S = AURORA_SHAPES;
  const depth = between(S.depth);
  const lean = between(S.lean);
  const wide = between(S.wide);
  const gather = between(S.gather);
  /* sheets a radian across: as many more as the rays reach farther to the picture's middle */
  const keep = (depth + KEEP_AT) / (-AURORA_FAN.y + KEEP_AT);
  const start = (s: AuroraSheet, across: number): AuroraSheet => ({
    ...s,
    across: kept4(across),
    u0: kept4(r()),
    v0: kept4(r())
  });
  const D = AURORA_DESIGNED;
  return {
    fan: { x: kept4(lean), y: kept4(-depth) },
    a: start(D.a, (D.a.across * keep) / wide),
    b: start(D.b, (D.b.across * keep) / wide),
    c: start(D.c, D.c.across * keep),
    h1: start(D.h1, D.h1.across),
    h2: start(D.h2, D.h2.across),
    g: start(D.g, gather * keep)
  };
}
/** How wide the range's edge blurs, half of it, in the picture's height: up and down across the path, and as far to
    each side of an upright wall. */
export const AURORA_SOFT = 0.014;
/** How far from an upright wall the light is eased toward it: the line the light rises from is the path, but within
    this much of the picture's height of a wall it is drawn down, smoothly, toward the wall's foot (the lower of the
    two heights the wall joins, itself drawn down by the feet of walls near it, so that two neighbours agree on it
    and the line never breaks). Without it the light stands in a hard-edged column over every block (the light just
    over a tall roof and the light high over the low ground beside it are far apart in strength); with it the light
    over a roof gathers at its middle and thins toward its corners. A path with no wall has no such line: its light
    rises from the path itself. */
const EASE = 0.14;
/** How many slots across the picture the pieces are looked up by. Places are a thousandth of its width apart at the
    nearest, a slot is narrower, so no slot holds more than one meeting of two pieces: the piece at a place is the
    slot's own or the one after it. */
export const AURORA_SLOTS = 1024;
/** How many of those slots each way the line the light rises from is averaged over. */
const RIDGE = 10;

const smooth = (a: number, b: number, v: number) => {
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};

export { auroraHash };

/** The two noise tiles every aurora reads, four bytes a pixel, repeating at their edges: the sharp one and the same
    made soft, which the halo round a shaft is read from. */
export interface AuroraTiles {
  noise: Uint8Array;
  soft: Uint8Array;
}

/* A channel of the noise tile: a smooth noise, three lattices of random numbers (the coarsest CELLS a side) read
   smoothly between and added, then stretched to fill 0 to 255. A lattice a step. */
function* noiseChannel(out: Uint8Array, c: number, seed: number): Generator<void, void> {
  const N = AURORA_TILE;
  const f = new Float32Array(N * N);
  /* a lattice's two cells and the weight between them at each pixel along a side, the same down as across */
  const i0 = new Int32Array(N);
  const i1 = new Int32Array(N);
  const w = new Float64Array(N);
  for (const [cells, amp] of [
    [CELLS, 1],
    [CELLS * 2, 0.42],
    [CELLS * 4, 0.16]
  ]) {
    const lat = new Float32Array(cells * cells);
    for (let i = 0; i < lat.length; i++) lat[i] = auroraHash(i, seed * 31 + c * 7 + cells);
    for (let x = 0; x < N; x++) {
      const g = (x / N) * cells;
      const i = Math.floor(g);
      const t = g - i;
      w[x] = t * t * t * (t * (t * 6 - 15) + 10);
      i0[x] = i % cells;
      i1[x] = (i + 1) % cells;
    }
    for (let y = 0; y < N; y++) {
      const wy = w[y];
      const y0 = i0[y] * cells;
      const y1 = i1[y] * cells;
      for (let x = 0; x < N; x++) {
        const top = lat[y0 + i0[x]] + (lat[y0 + i1[x]] - lat[y0 + i0[x]]) * w[x];
        const bot = lat[y1 + i0[x]] + (lat[y1 + i1[x]] - lat[y1 + i0[x]]) * w[x];
        f[y * N + x] += amp * (top + (bot - top) * wy);
      }
    }
    yield;
  }
  stretch(f, out, c);
}

/* a channel's numbers stretched to fill 0 to 255 */
function stretch(f: Float32Array, out: Uint8Array, c: number) {
  let lo = 1e9;
  let hi = -1e9;
  for (let i = 0; i < f.length; i++) {
    lo = Math.min(lo, f[i]);
    hi = Math.max(hi, f[i]);
  }
  for (let i = 0; i < f.length; i++)
    out[i * 4 + c] = Math.floor(((f[i] - lo) / (hi - lo)) * 255 + 0.5);
}

/* A channel made soft: averaged over its neighbours `radius` each way, across and then down, three times over (so
   nearly a bell), wrapping round, then stretched to fill 0 to 255 again. Each average is the one before it less the
   pixel it leaves and plus the one it takes: the sums are of whole bytes' averages, which doubles hold exactly, so
   they are the sums of all the neighbours to the bit. An averaging one way a step. */
function* softChannel(
  src: Uint8Array,
  out: Uint8Array,
  c: number,
  radius: number
): Generator<void, void> {
  const N = AURORA_TILE;
  const a = new Float32Array(N * N);
  const b = new Float32Array(N * N);
  const span = 2 * radius + 1;
  for (let i = 0; i < a.length; i++) a[i] = src[i * 4 + c];
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < N; y++) {
      const row = y * N;
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += a[row + ((k + N) % N)];
      for (let x = 0; x < N; x++) {
        b[row + x] = sum / span;
        sum += a[row + ((x + radius + 1) % N)] - a[row + ((x - radius + N) % N)];
      }
    }
    yield;
    for (let x = 0; x < N; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += b[((k + N) % N) * N + x];
      for (let y = 0; y < N; y++) {
        a[y * N + x] = sum / span;
        sum += b[((y + radius + 1) % N) * N + x] - b[((y - radius + N) % N) * N + x];
      }
    }
    yield;
  }
  stretch(a, out, c);
}

let tiles: AuroraTiles | null = null;
let making: Generator<void, AuroraTiles> | null = null;
function* makeTiles(): Generator<void, AuroraTiles> {
  const N = AURORA_TILE;
  const noise = new Uint8Array(N * N * 4);
  const soft = new Uint8Array(N * N * 4);
  for (let c = 0; c < 4; c++) yield* noiseChannel(noise, c, TILE_SEED);
  for (let c = 0; c < 4; c++) yield* softChannel(noise, soft, c, 5);
  return { noise, soft };
}
/** The tiles, made a step at a time with the first aurora drawn, each about a millisecond, and kept: whoever asks
    while they are being made carries the one making on. */
export function* auroraTilesSteps(): Generator<void, AuroraTiles> {
  while (!tiles) {
    making ??= makeTiles();
    const step = making.next();
    if (step.done) {
      tiles = step.value;
      making = null;
    } else yield;
  }
  return tiles;
}
/** The tiles, made at once where they are not yet. */
export function auroraTiles(): AuroraTiles {
  const steps = auroraTilesSteps();
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/** A path's pieces as the drawings read them, from the picture's left side to its right (a wall is no piece: it
    stands between two). */
export interface AuroraPieces {
  /** how many pieces */
  segs: number;
  /** of each piece, four numbers: its two places, 0 to 1 across the picture, and its two heights */
  segA: Float32Array;
  /** of each piece, four numbers: the two heights its curve bends by (a straight piece's are the two that keep it
      straight), the height the piece before it ends at and the height the piece after it starts at (its own, but
      where a wall stands between) */
  segB: Float32Array;
  /** of each piece, whether it is curved, for an SVG's path */
  bend: Uint8Array;
  /** for each of AURORA_SLOTS slots across the picture, the piece the slot's left side is in */
  slots: Float32Array;
  /** whether the path has an upright wall, and for one that has, the line the light rises from (EASE) at
      AURORA_SLOTS places evenly across the picture */
  walls: boolean;
  rise: Float32Array;
}

/* A curved piece is the cubic through its two heights whose slope at each is, inside a run of curved pieces, the one
   a parabola through the height and its two neighbours has there, and at a run's end half the piece's own slope: for
   evenly spaced heights the smooth curve through them. */
function piecesOf(P: AuroraPathParts): AuroraPieces {
  const x = [...P.places];
  const y = [...P.heights];
  const c = [...P.curved];
  /* level from the picture's side to the first place, and from the last to the other side */
  if (x[0] > 0) {
    x.unshift(0);
    y.unshift(y[0]);
    c.unshift(false);
  }
  if (x[x.length - 1] < 1) {
    x.push(1);
    y.push(y[y.length - 1]);
    c.push(false);
  }
  /* a piece starts at every height but the last and the foot of a wall */
  const at: number[] = [];
  for (let i = 0; i + 1 < x.length; i++) if (x[i + 1] > x[i]) at.push(i);
  const n = at.length;
  const wide = at.map(i => x[i + 1] - x[i]);
  const slope = at.map((i, j) => (y[i + 1] - y[i]) / wide[j]);
  /* two pieces are of one run where both are curved and meet at one height, no wall between */
  const run = (j: number) =>
    j >= 0 && j + 1 < n && c[at[j]] && c[at[j + 1]] && at[j] + 1 === at[j + 1];
  const segA = new Float32Array(n * 4);
  const segB = new Float32Array(n * 4);
  const bend = new Uint8Array(n);
  for (let j = 0; j < n; j++) {
    const i = at[j];
    const y0 = y[i];
    const y1 = y[i + 1];
    let p0 = 2 * y0 - y1;
    let p3 = 2 * y1 - y0;
    if (c[i]) {
      const m0 = run(j - 1)
        ? (slope[j - 1] * wide[j] + slope[j] * wide[j - 1]) / (wide[j - 1] + wide[j])
        : slope[j] / 2;
      const m1 = run(j)
        ? (slope[j] * wide[j + 1] + slope[j + 1] * wide[j]) / (wide[j] + wide[j + 1])
        : slope[j] / 2;
      p0 = y1 - 2 * m0 * wide[j];
      p3 = y0 + 2 * m1 * wide[j];
      bend[j] = 1;
    }
    segA.set([x[i], x[i + 1], y0, y1], j * 4);
    segB.set([p0, p3, j > 0 ? y[at[j - 1] + 1] : y0, j + 1 < n ? y[at[j + 1]] : y1], j * 4);
  }
  /* the walls, each with its foot; then each foot drawn down by the feet of the walls within EASE of it, until none
     moves; then the line the light rises from, place by place */
  const ease = EASE / (2 * AURORA_HALF);
  const walls: { x: number; foot: number; low: number }[] = [];
  for (let j = 1; j < n; j++)
    if (segB[j * 4 + 2] !== segA[j * 4 + 2]) {
      const foot = Math.min(segB[j * 4 + 2], segA[j * 4 + 2]);
      walls.push({ x: segA[j * 4], foot, low: foot });
    }
  for (let pass = 0, moved = true; moved && pass <= walls.length; pass++) {
    moved = false;
    for (const w of walls)
      for (const v of walls) {
        const d = Math.abs(w.x - v.x);
        if (v === w || d >= ease) continue;
        const to = v.low + (w.foot - v.low) * smooth(0, 1, d / ease);
        if (to < w.low - 1e-7) {
          w.low = to;
          moved = true;
        }
      }
  }
  const S = AURORA_SLOTS;
  const rise = new Float32Array(S);
  if (walls.length)
    for (let k = 0, j = 0; k < S; k++) {
      const s = k / (S - 1);
      while (j + 1 < n && s >= segA[j * 4 + 1]) j++;
      const e = auroraHeight(segA, segB, j, s);
      let l = e;
      for (const w of walls) {
        const d = Math.abs(s - w.x);
        if (d < ease) l = Math.min(l, w.low + (e - w.low) * smooth(0, 1, d / ease));
      }
      rise[k] = l;
    }
  /* where two walls' easings meet (the middle of a narrow block) the line has a ridge, which shows in the light as a
     thin upright line: averaged over a hundredth of the picture's width each way, twice, the ridge is round */
  for (let pass = 0; pass < 2 && walls.length; pass++) {
    const from = Float32Array.from(rise);
    for (let k = 0; k < S; k++) {
      let sum = 0;
      for (let d = -RIDGE; d <= RIDGE; d++) sum += from[Math.min(S - 1, Math.max(0, k + d))];
      rise[k] = sum / (2 * RIDGE + 1);
    }
  }
  const slots = new Float32Array(S);
  for (let slot = 0, j = 0; slot < S; slot++) {
    while (j + 1 < n && segA[(j + 1) * 4] <= slot / S) j++;
    slots[slot] = j;
  }
  return { segs: n, segA, segB, bend, slots, walls: walls.length > 0, rise };
}

/** Piece i's height at s across the picture: the cubic through its two heights, bent by its two others. */
export function auroraHeight(segA: Float32Array, segB: Float32Array, i: number, s: number): number {
  const x0 = segA[i * 4];
  const y0 = segA[i * 4 + 2];
  const y1 = segA[i * 4 + 3];
  const p0 = segB[i * 4];
  const p3 = segB[i * 4 + 1];
  const u = (s - x0) / (segA[i * 4 + 1] - x0);
  return (
    y0 + 0.5 * u * (y1 - p0 + u * (2 * p0 - 5 * y0 + 4 * y1 - p3 + u * (3 * (y0 - y1) + p3 - p0)))
  );
}

/** The lowest the range's edge comes across the picture (0 its bottom, 1 its top), read at eight places a piece:
    no light shows under it, which a clip's cost is weighed by (video.ts auroraVideoWeight). */
export function auroraLowest(path: string): number {
  const { segs, segA, segB } = auroraPieces(path);
  let lowest = 1;
  for (let i = 0; i < segs; i++) {
    const x0 = segA[i * 4];
    const wide = segA[i * 4 + 1] - x0;
    for (let k = 0; k <= 8; k++)
      lowest = Math.min(lowest, auroraHeight(segA, segB, i, x0 + (wide * k) / 8));
  }
  return lowest;
}

/* the last path's pieces: a list draws one path over and over */
let kept: { path: string; pieces: AuroraPieces } | null = null;
/** A path's pieces; the designed range's for anything that is no path. */
export function auroraPieces(path: string): AuroraPieces {
  if (kept?.path === path) return kept.pieces;
  const parts = auroraPathParts(path) ?? auroraPathParts(AURORA_DESIGNED_PATH);
  if (!parts) throw new Error("the designed path is no path");
  kept = { path, pieces: piecesOf(parts) };
  return kept.pieces;
}

const byte = (v: number) => Math.floor(clamp01(v) * 255 + 0.5) / 255;
/** The palette's colors the ramp is read from, bytes, with straight lines between. */
const STOPS = 33;
/** Those colors, STOPS of them along the palette's curve from its start to its end, each in whole bytes (0 to 1): what
    a shader page carries as the palette (aurora-page.ts). */
export const auroraStops = (P: Palette): number[][] =>
  Array.from({ length: STOPS }, (_, i) => sampleSrgb(P, i / (STOPS - 1)).map(byte));

/** The ramp the light is read through, AURORA_RAMP colors of three channels, 0 to 1: the whole palette from its
    darker end to its other, every color of it as it is and none it does not have (TONE), the hottest light its last
    color held. */
export function auroraRamp(P: Palette): Float32Array {
  const stops = new Float64Array(STOPS * 3);
  const colors = auroraStops(P);
  for (let i = 0; i < STOPS; i++) stops.set(colors[i], i * 3);
  /* the darker end first, whichever way the palette runs */
  const flip = srgbToLch(colors[0])[0] > srgbToLch(colors[STOPS - 1])[0];
  const at = (v: number): number[] => {
    const x = clamp01(flip ? 1 - v : v) * (STOPS - 1);
    const i = Math.min(STOPS - 2, Math.floor(x));
    const f = x - i;
    return [0, 1, 2].map(k => stops[i * 3 + k] + (stops[i * 3 + 3 + k] - stops[i * 3 + k]) * f);
  };
  const ramp = new Float32Array(AURORA_RAMP * 3);
  for (let i = 0; i < AURORA_RAMP; i++) {
    const l = i / (AURORA_RAMP - 1);
    ramp.set(at(1 - (1 - clamp01((l - LOW) / (TIP - LOW))) ** BEND), i * 3);
  }
  return ramp;
}

export interface AuroraScene extends AuroraPieces {
  width: number;
  height: number;
  /** the angle's cosine and sine, and the picture's height in pixels */
  cs: number;
  sn: number;
  ext: number;
  /** half the picture's width in its own units */
  half: number;
  /** the ramp the light is read through (auroraRamp) */
  ramp: Float32Array;
  /** the range's color, 0 to 1, and how much of it covers what is behind the picture: 0 where the look names no
      ground */
  range: number[];
  cover: number;
  /** the two noise tiles (auroraTiles) */
  noise: Uint8Array;
  soft: Uint8Array;
  /** the range's path */
  path: string;
  /** what the light is drawn by: the shape's (auroraDesign) */
  design: AuroraDesign;
}

/** The scene a palette and a view draw in a box. */
export function auroraScene(P: Palette, view: AuroraView, size: Size): AuroraScene {
  const th = ((view.angle - 90) * Math.PI) / 180;
  const path = view.path ?? AURORA_DESIGNED_PATH;
  return {
    width: size.width,
    height: size.height,
    cs: Math.cos(th),
    sn: Math.sin(th),
    ext: AURORA_SPAN * Math.max(size.width, size.height),
    half: AURORA_HALF,
    ramp: auroraRamp(P),
    range: view.bg ? hexBytes(view.bg).map(v => v / 255) : [0, 0, 0],
    cover: view.bg ? (view.bg.length === 9 ? parseInt(view.bg.slice(7), 16) / 255 : 1) : 0,
    ...auroraTiles(),
    path,
    ...auroraPieces(path),
    design: auroraDesign(view.shape)
  };
}

/** The scene as a picture that cannot be clear draws it (a share card): a range that lets the page through laid over
    `backdrop` (bytes) at its cover, in whole bytes. A whole range's scene is itself. */
export function auroraSolid(m: AuroraScene, backdrop: readonly number[]): AuroraScene {
  if (m.cover >= 1) return m;
  const range = m.range.map(
    (v, i) =>
      Math.floor(Math.floor(v * 255 + 0.5) * m.cover + backdrop[i] * (1 - m.cover) + 0.5) / 255
  );
  return { ...m, range, cover: 1 };
}

/** What a point's height over the line the light rises from (auroraRange) does to its light, into out: the shafts'
    share, up in a short rise and then thinning away; the haze; and how much of the hot spots is left. auroraLight's
    own three numbers by height, which change with no frame: a clip keeps them by height (video.ts auroraDraw), and
    its frames are held to renderAurora's, so the two stay one. */
export function auroraLift(h: number, out: Float64Array | number[]) {
  const up = Math.max(h, 0);
  out[0] = smooth(-0.02, L.rise, h) * Math.exp(-Math.max(h - L.rise, 0) / L.fall);
  out[1] = L.haze * Math.exp(-up / L.hazeFall);
  out[2] = Math.exp(-up / L.hotFall);
}

/** A time (seconds of the loop at speed 1) as the share of the loop the drawings take: 0 up to 1. */
export const auroraTime = (t: number): number => {
  const T = t / AURORA_LOOP;
  return T - Math.floor(T);
};

/** A point of the scene for a pixel's middle (x, y from the box's top left), into out: across, then up. */
export function auroraPoint(m: AuroraScene, x: number, y: number, out: Float64Array | number[]) {
  const dx = x - m.width / 2;
  const dy = y - m.height / 2;
  out[0] = (dx * m.cs + dy * m.sn) / m.ext;
  out[1] = 0.5 - (-dx * m.sn + dy * m.cs) / m.ext;
}

/** What the range does at a point (X across, Y up), into out: how much of the light shows there, all of it over the
    range's edge, none under it, soft across it, and as soft across an upright wall, within the soft edge's own width
    of it (or half its piece's, where that is less), toward what shows on the wall's other side; then the point's
    height over the line the light rises from: the path, or where it has an upright wall the path eased toward its
    walls' feet (EASE), read between AURORA_SLOTS places. */
export function auroraRange(m: AuroraScene, X: number, Y: number, out: Float64Array | number[]) {
  const SOFT = AURORA_SOFT;
  const S = AURORA_SLOTS;
  const { segA, segB } = m;
  const s = clamp01((X / m.half + 1) / 2);
  let i = m.slots[Math.min(S - 1, Math.floor(s * S))];
  if (s >= segA[i * 4 + 1] && i < m.segs - 1) i++;
  const x0 = segA[i * 4];
  const x1 = segA[i * 4 + 1];
  const y0 = segA[i * 4 + 2];
  const y1 = segA[i * 4 + 3];
  const yl = segB[i * 4 + 2];
  const yr = segB[i * 4 + 3];
  const wide = x1 - x0;
  const edge = auroraHeight(segA, segB, i, s);
  let show = smooth(-SOFT, SOFT, Y - edge);
  const softS = Math.min(SOFT / (2 * m.half), wide / 2);
  const dl = s - x0;
  const dr = x1 - s;
  if (yl !== y0 && dl < softS) {
    const f = smooth(-1, 1, dl / softS);
    show = smooth(-SOFT, SOFT, Y - yl) * (1 - f) + show * f;
  }
  if (yr !== y1 && dr < softS) {
    const f = smooth(-1, 1, -dr / softS);
    show = show * (1 - f) + smooth(-SOFT, SOFT, Y - yr) * f;
  }
  let base = edge;
  if (m.walls) {
    const q = s * (S - 1);
    const k = Math.min(S - 2, Math.floor(q));
    base = m.rise[k] + (m.rise[k + 1] - m.rise[k]) * (q - k);
  }
  out[0] = show;
  out[1] = Y - base;
}

const N = AURORA_TILE;
/* a pixel's place along a side wrapped round: the side is a power of two */
const WRAP = N - 1;
/* the tile's channel c at (u, v) in tiles, read between its pixels by straight lines, repeating */
function read(tile: Uint8Array, u: number, v: number, c: number): number {
  const x = (u - Math.floor(u)) * N - 0.5;
  const y = (v - Math.floor(v)) * N - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const xa = (x0 + N) & WRAP;
  const xb = (x0 + 1 + N) & WRAP;
  const ya = ((y0 + N) & WRAP) * N;
  const yb = ((y0 + 1 + N) & WRAP) * N;
  const p = tile[(ya + xa) * 4 + c] + (tile[(ya + xb) * 4 + c] - tile[(ya + xa) * 4 + c]) * fx;
  const q = tile[(yb + xa) * 4 + c] + (tile[(yb + xb) * 4 + c] - tile[(yb + xa) * 4 + c]) * fx;
  return (p + (q - p) * fy) / 255;
}

const L = AURORA_LIGHT;
/** The light's color at a point (X across, Y up) `h` over the line it rises from (auroraRange), at T of the loop
    (auroraTime), three channels 0 to 1 into out: the sheets read along the fan (the angle from straight up, and the
    way out along the ray), the light they make by height over the range, up in a short rise and then thinning away,
    and that light through the ramp. */
export function auroraLight(
  m: AuroraScene,
  T: number,
  X: number,
  Y: number,
  h: number,
  out: Float64Array | number[]
) {
  const { noise, soft } = m;
  const D = m.design;
  const ex = X - D.fan.x;
  const ey = Y - D.fan.y;
  const ang = Math.atan2(ex, ey);
  const r = Math.sqrt(ex * ex + ey * ey);
  const ua = ang * D.a.across + D.a.u0 + D.a.du * T;
  const va = r * D.a.along + D.a.v0 + D.a.dv * T;
  const ub = ang * D.b.across + D.b.u0 + D.b.du * T;
  const vb = r * D.b.along + D.b.v0 + D.b.dv * T;
  const shaft =
    smooth(L.shaft[0], L.shaft[1], read(noise, ua, va, 0)) *
    (0.4 + 0.6 * smooth(L.shaft[0], L.shaft[1], read(noise, ub, vb, 1)));
  const halo =
    smooth(L.halo[0], L.halo[1], read(soft, ua, va, 0)) *
    (0.4 + 0.6 * smooth(L.halo[0], L.halo[1], read(soft, ub, vb, 1)));
  const fine = smooth(
    L.fine[0],
    L.fine[1],
    read(noise, ang * D.c.across + D.c.u0 + D.c.du * T, r * D.c.along + D.c.v0 + D.c.dv * T, 2)
  );
  const hot =
    smooth(
      L.hot[0],
      L.hot[1],
      read(
        noise,
        X * D.h1.across + D.h1.u0 + D.h1.du * T,
        Y * D.h1.along + D.h1.v0 + D.h1.dv * T,
        3
      )
    ) *
    smooth(
      L.hot[0] - 0.15,
      L.hot[1],
      read(
        noise,
        X * D.h2.across + D.h2.u0 + D.h2.du * T,
        Y * D.h2.along + D.h2.v0 + D.h2.dv * T,
        0
      )
    );
  const up = Math.max(h, 0);
  const lift = smooth(-0.02, L.rise, h) * Math.exp(-Math.max(h - L.rise, 0) / L.fall);
  const gather =
    0.7 +
    0.3 *
      smooth(
        L.gather[0],
        L.gather[1],
        read(soft, ang * D.g.across + D.g.u0 + D.g.du * T, D.g.v0 + D.g.dv * T, 2)
      );
  const light =
    L.haze * Math.exp(-up / L.hazeFall) +
    lift *
      gather *
      (L.halos * halo +
        L.shafts * shaft * (0.7 + 0.3 * fine) +
        L.fines * fine * halo +
        L.hots * hot * (0.4 + 0.6 * halo) * Math.exp(-up / L.hotFall));
  const v = Math.min(light, 0.9999) * (AURORA_RAMP - 1);
  const j = Math.floor(v);
  const f = v - j;
  const R = m.ramp;
  out[0] = R[j * 3] + (R[j * 3 + 3] - R[j * 3]) * f;
  out[1] = R[j * 3 + 1] + (R[j * 3 + 4] - R[j * 3 + 1]) * f;
  out[2] = R[j * 3 + 2] + (R[j * 3 + 5] - R[j * 3 + 2]) * f;
}

/** The model's own numbers a shader page carries (aurora-page.ts writes them into the page's script, so the page and
    the site stay one): the noise's coarsest lattice and its tile's number, the tone, the walls' easing and the
    averaging of the line the light rises from, how many stops of the palette the ramp is read from, and the height
    the shafts are kept as wide at. */
export const AURORA_PAGE_NUMBERS = {
  cells: CELLS,
  tileSeed: TILE_SEED,
  low: LOW,
  tip: TIP,
  bend: BEND,
  wallEase: EASE,
  ridge: RIDGE,
  stops: STOPS,
  keepAt: KEEP_AT
} as const;
