/* The levels' contours of a field over a box, which a field effect's SVG (svg.ts) is drawn from. The field is any
   function of the box's pixels (an effect's kernel over its scene and frame, as svg.ts closes it), so the tracer knows
   no effect, and papercut-svg.ts's cuts and strings-svg.ts's threads are its two ancestors:
   - one grid of the field's values over the box and a margin past it, every level traced from it;
   - marching squares at every level in one pass (a cell's corners straddle only the levels between its least and its
     greatest, the first found by halving), each segment run with the field above its level on its right, y down, and
     a saddle cell joined by the field at its middle, read there, where the papercut took its corners' mean;
   - each level's segments linked into loops, closed along the margin's edge (the grid's outer ring lies below every
     level), every point moved onto the exact level by Newton steps on the field (its slope by differences a
     thousandth of a pixel long), its tangent across the slope there;
   - each loop fitted with cubic Beziers whose tangents are the level's own (svg-fit.ts), its stretches along the ring
     written as lines, which the papercut fitted as curves.
   A level whose loops all keep past the box by more than the reach (the farthest a copy of it is moved: a shadow's,
   a rim's) either covers the box whole or misses it, and is said so, in place of its loops. The work is a generator a
   step at a time (the grid's rows and cells 18 rows a step, then a level a step), as a list draws thirty stills.
   A field is finite everywhere by its contract, but a kernel's 1/r or log r at its pole or a square root past its
   edge is not, and a grid's node may fall on one where no pixel's middle does (the box's middle, in an even box on a
   whole-pixel grid). Where it is not, the tracer reads the field as below every level (not a number, minus infinity)
   or above every level (plus infinity), so every level's loops close round there as they close along the ring, on no
   level, and the levels a caller is given run over the finite values alone. */
import { type FitHow, fitCubics, svgNumber } from "../svg-fit.ts";
import type { Size } from "../view.ts";

/** A field over a box's pixels: x to the right and y down from the box's top left corner, a pixel's middle at a
    half. */
export type KitPlaneField = (x: number, y: number) => number;

/** How a drawing traces its levels: the grid's step and the farthest a copy of a level is moved, px. */
export interface KitTraceHow {
  step: number;
  reach: number;
}

/** A level's loop: its points (px) and their unit tangents, the field above the level on its right as it runs (y
    down); `on` is 0 at the points that close it on no level: along the grid's outer ring, in the margin, and round
    where the field is not finite. */
export interface KitContour {
  x: number[];
  y: number[];
  tx: number[];
  ty: number[];
  on: number[];
}

/** A level over the box: its loops, where one comes within the reach of the box, else whether the box lies wholly
    above the level ("all") or below it ("none"). */
export type KitLevel = KitContour[] | "all" | "none";

/** Rows of the grid a step takes, its field's or its cells', and the points a step polishes (four reads of the field
    each) or fits, each about a millisecond of a costly kernel's: a still's 18 rows of 247 cells take the sandstone's
    0.6 to 1.1 ms, the zen garden's 0.4 to 0.9 (8 Nov 2026). */
const ROWS = 18;
const POLISHED = 256;
const FITTED = 2048;
/** The grid's outer ring, below every level a field takes, so every level's loops close inside it; and the field
    where it is not a number or is minus infinity. Where it is plus infinity, above every level. */
const RING = -1e30;
const CEIL = 1e30;
/** The slope's difference, px: a thousandth of a pixel or so, far under any detail a cell holds and far over the
    field's rounding (a field changing a thousandth a pixel changes a millionth across it, ten decimals clear). */
const DIFF = 1 / 1024;

/** The margin past the box the grid runs over, px: the reach, three cells and two pixels, so a loop's stretches along
    the ring (a cell inside the grid's edge) lie past the box by the reach, two cells and two pixels. */
const kitMargin = (how: KitTraceHow): number => Math.ceil(how.reach + 3 * how.step + 2);

/** Every level's loops over a box, a step at a time: the grid of the field, then `levelsIn` of the least and the
    greatest finite values it holds (ascending, each once; Infinity and -Infinity where it holds none), every cell's
    segments at those levels, then each level's loops; with the least and the greatest, so a caller can name its levels
    again from them. */
export function* kitTraceSteps(
  field: KitPlaneField,
  { width: W, height: H }: Size,
  how: KitTraceHow,
  levelsIn: (lo: number, hi: number) => readonly number[]
): Generator<void, { lo: number; hi: number; levels: readonly number[]; traced: KitLevel[] }> {
  const h = how.step;
  const margin = kitMargin(how);
  const nx = Math.ceil((W + 2 * margin) / h) + 1;
  const ny = Math.ceil((H + 2 * margin) / h) + 1;
  const X = (i: number) => -margin + i * h;
  const Y = (j: number) => -margin + j * h;
  const grid = new Float64Array(nx * ny).fill(RING);
  let lo = Infinity;
  let hi = -Infinity;
  for (let j = 1; j < ny - 1; j++) {
    if (j % ROWS === 0) yield;
    const y = Y(j);
    for (let i = 1; i < nx - 1; i++) {
      const v = field(X(i), y);
      /* past every level where the field is not finite: the ring's value, filled, where it is not a number or minus
         infinity */
      if (Number.isFinite(v)) {
        grid[j * nx + i] = v;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      } else if (v === Infinity) grid[j * nx + i] = CEIL;
    }
  }
  yield;
  const levels = levelsIn(lo, hi);
  const nexts = yield* segments(grid, nx, ny, levels, (i, j) => field(X(i) + h / 2, Y(j) + h / 2));
  /* the box and the reach about it, and a cell's slack for the points' spacing */
  const near = how.reach + h;
  /* which side of a level the box lies on, read as the grid reads it where the field is not finite (not a number
     below every level) */
  const middle = field(W / 2, H / 2);
  const traced: KitLevel[] = [];
  for (let k = 0; k < levels.length; k++) {
    yield;
    const loops = yield* loopsOf(nexts[k], grid, nx, ny, levels[k], X, Y, h, field);
    const reaches = loops.some(c =>
      c.x.some((x, p) => x > -near && x < W + near && c.y[p] > -near && c.y[p] < H + near)
    );
    traced.push(reaches ? loops : middle >= levels[k] ? "all" : "none");
  }
  return { lo, hi, levels, traced };
}

/** The first of the ascending levels above v. */
function firstAbove(levels: readonly number[], v: number): number {
  let a = 0;
  let b = levels.length;
  while (a < b) {
    const m = (a + b) >> 1;
    if (levels[m] > v) b = m;
    else a = m + 1;
  }
  return a;
}

/** Marching squares at every level in one pass over the grid, a step a run of rows: each level's segments between
    cell-edge crossings, from edge to edge (a horizontal edge (i, j)-(i+1, j) is 2 (j nx + i), a vertical one (i, j)-
    (i, j+1) that and 1), which loopsOf links into loops. */
function* segments(
  grid: Float64Array,
  nx: number,
  ny: number,
  levels: readonly number[],
  middle: (i: number, j: number) => number
): Generator<void, Map<number, number>[]> {
  const nexts = levels.map(() => new Map<number, number>());
  for (let j = 0; j < ny - 1; j++) {
    if (j % ROWS === ROWS - 1) yield;
    for (let i = 0; i < nx - 1; i++) {
      const o = j * nx + i;
      const ga = grid[o];
      const gb = grid[o + 1];
      const gc = grid[o + nx + 1];
      const gd = grid[o + nx];
      const hi = Math.max(ga, gb, gc, gd);
      let mid = Number.NaN;
      for (let k = firstAbove(levels, Math.min(ga, gb, gc, gd)); k < levels.length; k++) {
        const level = levels[k];
        if (level > hi) break;
        const code =
          (ga >= level ? 1 : 0) |
          (gb >= level ? 2 : 0) |
          (gc >= level ? 4 : 0) |
          (gd >= level ? 8 : 0);
        const next = nexts[k];
        const top = 2 * o;
        const right = 2 * (o + 1) + 1;
        const bottom = 2 * (o + nx);
        const left = 2 * o + 1;
        /* each segment runs with the field above the level on its right, y down */
        switch (code) {
          case 1:
            next.set(top, left);
            break;
          case 2:
            next.set(right, top);
            break;
          case 3:
            next.set(right, left);
            break;
          case 4:
            next.set(bottom, right);
            break;
          case 6:
            next.set(bottom, top);
            break;
          case 7:
            next.set(bottom, left);
            break;
          case 8:
            next.set(left, bottom);
            break;
          case 9:
            next.set(top, bottom);
            break;
          case 11:
            next.set(right, bottom);
            break;
          case 12:
            next.set(left, right);
            break;
          case 13:
            next.set(top, right);
            break;
          case 14:
            next.set(left, top);
            break;
          default: {
            /* a saddle cell (5 or 10), never on the ring: the field at its middle joins the corners above it */
            if (Number.isNaN(mid)) mid = middle(i, j);
            const above = mid >= level;
            if (code === 5) {
              if (above) {
                next.set(top, right);
                next.set(bottom, left);
              } else {
                next.set(top, left);
                next.set(bottom, right);
              }
            } else if (above) {
              next.set(right, bottom);
              next.set(left, top);
            } else {
              next.set(right, top);
              next.set(left, bottom);
            }
          }
        }
      }
    }
  }
  return nexts;
}

/** One level's segments linked into loops, each point inside the ring's cells and between finite values moved onto
    the level, a step every POLISHED points: two Newton steps from the crossing on the cell's edge, which lies within a hair of the level (the
    field is smooth over a cell), along the slope there (the second step keeps it), which gives the tangent too, a
    hundredth of a pixel or less from the point. */
function* loopsOf(
  next: Map<number, number>,
  grid: Float64Array,
  nx: number,
  ny: number,
  level: number,
  X: (i: number) => number,
  Y: (j: number) => number,
  h: number,
  field: KitPlaneField
): Generator<void, KitContour[]> {
  const x0 = X(0) + 1.5 * h;
  const y0 = Y(0) + 1.5 * h;
  const x1 = X(nx - 1) - 1.5 * h;
  const y1 = Y(ny - 1) - 1.5 * h;
  const loops: KitContour[] = [];
  const seen = new Set<number>();
  let polished = 0;
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const c: KitContour = { x: [], y: [], tx: [], ty: [], on: [] };
    let e: number | undefined = start;
    while (e !== undefined && !seen.has(e)) {
      seen.add(e);
      const o = e >> 1;
      const i = o % nx;
      const j = (o - i) / nx;
      const across = (e & 1) === 0 ? o + 1 : o + nx;
      const a = grid[o] - level;
      const s = a / (a - (grid[across] - level));
      let x = (e & 1) === 0 ? X(i) + s * h : X(i);
      let y = (e & 1) === 0 ? Y(j) : Y(j) + s * h;
      let tx = 0;
      let ty = 0;
      /* on the level inside the ring's cells, between two values the field took: a crossing at the ring, or next to
         where the field is not finite, lies at its last finite value, on no level */
      const on =
        x > x0 &&
        x < x1 &&
        y > y0 &&
        y < y1 &&
        Math.abs(grid[o]) < CEIL &&
        Math.abs(grid[across]) < CEIL;
      if (on) {
        if (++polished % POLISHED === 0) yield;
        const f = field(x, y);
        const gx = (field(x + DIFF, y) - f) / DIFF;
        const gy = (field(x, y + DIFF) - f) / DIFF;
        const g2 = gx * gx + gy * gy;
        if (g2 > 0) {
          const g = Math.sqrt(g2);
          let d = (f - level) / g2;
          if (Math.abs(d) * g <= h) {
            x -= d * gx;
            y -= d * gy;
            d = (field(x, y) - level) / g2;
            if (Math.abs(d) * g <= h) {
              x -= d * gx;
              y -= d * gy;
            }
          }
          /* the higher field on the right of the way the loop runs, y down: the slope turned a quarter
             counterclockwise */
          tx = gy / g;
          ty = -gx / g;
        }
      }
      c.x.push(x);
      c.y.push(y);
      c.tx.push(tx);
      c.ty.push(ty);
      c.on.push(on ? 1 : 0);
      e = next.get(e);
    }
    if (c.x.length >= 3) loops.push(c);
  }
  return loops;
}

/** A loop as path data: its first point, and the rest relative from it, so a copy of it moved is the same body from a
    moved first point. */
export interface KitLoop {
  x0: number;
  y0: number;
  body: string;
}

/** Stretches of a loop's points on its level fitted at once: about 24 points a stretch, eight at most, split further
    at the worst point while any strays past the tolerance (svg-fit.ts). */
const pieces = (points: number, least: number) =>
  Math.max(least, Math.min(8, Math.round(points / 24)));

/** A loop fitted and written (KitLoop), forward or run the other way: the field's tangents turned the way its points
    run, its stretches on the level as cubics with those tangents, and its stretches along the ring, which lie in the
    margin, as lines through their corners. Every point is written relative to the one before as it is rounded to
    `places` (or to the fit's `unit`), so the rounding never adds up along the loop. */
export function kitFit(c: KitContour, fit: FitHow, reverse = false): KitLoop {
  const n = c.x.length;
  /* from a point on the ring where it has one, so no stretch on the level runs round past the start */
  let first = 0;
  while (first < n && c.on[first]) first++;
  if (first === n) first = 0;
  const at = (i: number) => (reverse ? (first - i + n) % n : (first + i) % n);
  const xs: number[] = [];
  const ys: number[] = [];
  const tx: number[] = [];
  const ty: number[] = [];
  const on: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = at(i);
    xs.push(c.x[p]);
    ys.push(c.y[p]);
    tx.push(c.tx[p]);
    ty.push(c.ty[p]);
    on.push(c.on[p]);
  }
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n;
    const b = (i + 1) % n;
    if ((xs[b] - xs[a]) * tx[i] + (ys[b] - ys[a]) * ty[i] < 0) {
      tx[i] = -tx[i];
      ty[i] = -ty[i];
    }
  }
  const p = fit.places;
  const k = fit.unit ? 1 / fit.unit : 10 ** p;
  /* rounded as every point after it is, never to a negative zero */
  const pen = { x: Math.round(xs[0] * k) / k || 0, y: Math.round(ys[0] * k) / k || 0 };
  const start = { ...pen };
  const parts: string[] = [];
  const line = (i: number) => {
    const dx = Math.round((xs[i] - pen.x) * k) / k;
    const dy = Math.round((ys[i] - pen.y) * k) / k;
    parts.push(`l${svgNumber(dx, p)} ${svgNumber(dy, p)}`);
    pen.x += dx;
    pen.y += dy;
  };
  const stretch = (i0: number, i1: number, least: number) => {
    const count = pieces(i1 - i0, least);
    for (let s = 0; s < count; s++) {
      const a = i0 + Math.round((s * (i1 - i0)) / count);
      const b = i0 + Math.round(((s + 1) * (i1 - i0)) / count);
      if (b > a) fitCubics(xs, ys, tx, ty, a, b, fit, pen, parts);
    }
  };
  if (on.every(Boolean)) {
    /* on its level all round: closed on its first point, in two stretches at least */
    xs.push(xs[0]);
    ys.push(ys[0]);
    tx.push(tx[0]);
    ty.push(ty[0]);
    stretch(0, n, 2);
  } else {
    /* the first point is on the ring: lines on to the next point the line turns at, or that lies on the level, then
       each stretch on the level fitted, until the loop closes back on the first */
    let i = 0;
    while (i < n - 1) {
      if (on[i] && on[i + 1]) {
        let e = i + 1;
        while (e < n - 1 && on[e + 1]) e++;
        stretch(i, e, 1);
        i = e;
        continue;
      }
      let e = i + 1;
      while (e < n - 1 && !on[e] && !on[e + 1] && between(xs, ys, i, e, e + 1)) e++;
      line(e);
      i = e;
    }
  }
  parts.push("z");
  return { x0: start.x, y0: start.y, body: parts.join("").replace(/ -/g, "-") };
}

/** A level's loops fitted (kitFit), a step every FITTED points. */
export function* kitFitSteps(
  loops: readonly KitContour[],
  fit: FitHow,
  reverse = false
): Generator<void, KitLoop[]> {
  const out: KitLoop[] = [];
  let points = 0;
  for (const c of loops) {
    out.push(kitFit(c, fit, reverse));
    points += c.x.length;
    if (points >= FITTED) {
      points = 0;
      yield;
    }
  }
  return out;
}

/** Whether point b lies on the line from a to c, within a hundredth of a pixel, between them. */
function between(xs: number[], ys: number[], a: number, b: number, c: number): boolean {
  const ux = xs[c] - xs[a];
  const uy = ys[c] - ys[a];
  const vx = xs[b] - xs[a];
  const vy = ys[b] - ys[a];
  const u2 = ux * ux + uy * uy;
  const along = ux * vx + uy * vy;
  return u2 > 0 && along >= 0 && along <= u2 && Math.abs(ux * vy - uy * vx) < 0.01 * Math.sqrt(u2);
}

/** A level's loops as one path's data, moved by (dx, dy) px. */
export const kitPath = (loops: readonly KitLoop[], places: number, dx = 0, dy = 0): string =>
  loops
    .map(
      l =>
        `M${svgNumber(l.x0 + dx, places)} ${svgNumber(l.y0 + dy, places)}`.replace(/ -/g, "-") +
        l.body
    )
    .join("");

/** A loop round the whole grid a box's levels are traced over, run as a level's loops run (the inside on its right):
    what a level the box lies wholly above draws as. */
export function kitBoxLoop({ width: W, height: H }: Size, how: KitTraceHow): KitLoop {
  const m = kitMargin(how);
  return { x0: -m, y0: -m, body: `h${W + 2 * m}v${H + 2 * m}h${-(W + 2 * m)}z` };
}
