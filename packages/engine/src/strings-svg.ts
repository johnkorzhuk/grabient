/* The strings as SVG: any frame's threads as stroked paths over the ground, the same threads the CPU draws.
   - The still (stringsStillSvg): the frame at t = 0 in the design square, what a list's card, a page's first paint and
     the stylesheet paint; written a step at a time (stringsStillSteps), as a list's cards are.
   - The file's SVG (stringsFileSvg), and any frame's (stringsFrameSvg): the frame at its time, traced finer.
   A thread is a whole level of the field (strings.ts): marching squares over the box and a margin a width past it, each
   level's segments linked into runs and loops, every point moved onto the exact level by Newton steps, then cut where
   the thread ends (where its crowding ends it, and past its end on the blob's edge, each found between two points by
   the measure that crossed), and fitted with cubic Beziers whose tangents are the level's own (across the field's
   slope), as the papercut's cuts are (svg-fit.ts). Each thread is one path in its color, stroked a width wide with
   butt ends, which no filter, mask or <use> draws, so a design app's importer takes it as it is. The ground is a
   rectangle in its color under them, at its alpha where it lets the page through (`fill-opacity`, which every
   renderer reads where an eight-digit hex is not), and none where it is clear. The threads depend on the view and the
   box alone, never on the palette or the ground, so the still's are kept by these. */
import type { Palette } from "./palette.ts";
import {
  STRINGS_FRAME_SIZE,
  type StringsScene,
  type StringsView,
  stringsBlob,
  stringsEnd,
  stringsField,
  stringsFrameAt,
  stringsHex,
  stringsIsThread,
  stringsLevelSlope,
  stringsNeed,
  stringsRank,
  stringsScene,
  stringsWarp
} from "./strings.ts";
import { type FitHow, fitCubics, svgNumber } from "./svg-fit.ts";
import type { Size } from "./view.ts";

/** How a drawing traces its threads: the grid's step (px), and how its curves are fitted and written. */
interface Trace extends FitHow {
  step: number;
}

/** The still's trace: a grid of 300 cells across the longer side, under a thread's least spacing (gap widths, less
    the jitter), so no cell holds two threads that show, and curves within 0.3 px at the design square's thousand, a
    decimal each. Traced at a file's grid it is its first frame exactly, at three times the time and 40% more bytes
    (150 ms and 48 KiB at the design square, 5 Nov 2026); traced so it lies within a frame's limits of it
    (effect-conformance.test.ts), a hairpin's tip or a thread's end a few tenths of a pixel aside. */
const STILL_TRACE = (m: StringsScene): Trace => ({
  step: Math.max(m.width, m.height) / 300,
  tolerance: (0.3 * Math.max(m.width, m.height)) / 1000,
  places: 1
});
/** A file's and a frame's trace: a grid of a width and a fifth, 3 px at most, curves within 0.12 px. */
const FILE_TRACE = (m: StringsScene): Trace => ({
  step: Math.min(3, 1.2 * m.lw),
  tolerance: 0.12,
  places: 1
});

/** Rows of the grid a step takes. */
const ROWS = 24;

/** A thread's visible run: its points (px) and their unit tangents, and whether it closes on itself. */
interface Run {
  x: number[];
  y: number[];
  tx: number[];
  ty: number[];
  closed: boolean;
}

/** Each level's runs, a step at a time: the grid of the field, each cell's segments, then each level's chains, polished
    and cut. Keyed by level. */
function* runSteps(m: StringsScene, how: Trace, t: number): Generator<void, Map<number, Run[]>> {
  const at = new Float64Array(STRINGS_FRAME_SIZE);
  stringsFrameAt(m, t, at);
  const { width: W, height: H, D } = m;
  const margin = Math.ceil(m.lw + 2);
  const h = how.step;
  const nx = Math.ceil((W + 2 * margin) / h) + 1;
  const ny = Math.ceil((H + 2 * margin) / h) + 1;
  const X = (i: number) => -margin + i * h;
  const Y = (j: number) => -margin + j * h;
  /* at each point of the grid the blob's field and slope (a px), and where a cell about the point may show a thread,
     the field and its slope: the cells where none can show are passed over, past the blob's farthest end even at a
     cell's corner most within it, or a level its crowding ends at every corner with a fifth to spare */
  const grid = new Float64Array(nx * ny);
  const slope = new Float64Array(nx * ny);
  const blobAt = new Float64Array(nx * ny);
  const blobSlope = new Float64Array(nx * ny);
  const warped = new Float64Array(nx * ny * 6);
  const farthest = -m.stagger / 2;
  const leastNeed = m.need * (1 - m.jitter / 2) * 0.8;
  {
    const o = new Float64Array(6);
    const g = new Float64Array(4);
    const b = new Float64Array(3);
    for (let j = 0; j < ny; j++) {
      if (j % ROWS === ROWS - 1) yield;
      const qy = (Y(j) - H / 2) / D;
      for (let i = 0; i < nx; i++) {
        const qx = (X(i) - W / 2) / D;
        const s = j * nx + i;
        stringsWarp(m, at, qx, qy, o);
        stringsBlob(m, at, qx, qy, o, b);
        warped.set(o, 6 * s);
        blobAt[s] = b[0];
        blobSlope[s] = Math.sqrt(b[1] * b[1] + b[2] * b[2]) / D;
      }
    }
    /* a cell may show a thread where its nearest corner to the blob, carried a cell on by the steepest slope, reaches
       the farthest end; its corners then take the field */
    const live = new Uint8Array(nx * ny);
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const s = j * nx + i;
        const reach =
          Math.max(blobAt[s], blobAt[s + 1], blobAt[s + nx], blobAt[s + nx + 1]) +
          h * Math.max(blobSlope[s], blobSlope[s + 1], blobSlope[s + nx], blobSlope[s + nx + 1]);
        if (reach < farthest) continue;
        live[s] = live[s + 1] = live[s + nx] = live[s + nx + 1] = 1;
      }
    for (let j = 0; j < ny; j++) {
      if (j % ROWS === ROWS - 1) yield;
      for (let i = 0; i < nx; i++) {
        const s = j * nx + i;
        if (!live[s]) {
          grid[s] = Number.NaN;
          continue;
        }
        stringsField(m, at, warped.subarray(6 * s, 6 * s + 6), g);
        grid[s] = g[0];
        slope[s] = Math.sqrt(g[1] * g[1] + g[2] * g[2]) / D;
      }
    }
  }
  /* edge ids: horizontal edge (i, j)-(i+1, j) is 2 (j nx + i), vertical edge (i, j)-(i, j+1) is that + 1 */
  const nexts = new Map<number, Map<number, number>>();
  const of = (k: number) => {
    let next = nexts.get(k);
    if (!next) {
      next = new Map();
      nexts.set(k, next);
    }
    return next;
  };
  for (let j = 0; j < ny - 1; j++) {
    if (j % ROWS === ROWS - 1) yield;
    for (let i = 0; i < nx - 1; i++) {
      const o = j * nx + i;
      const ga = grid[o];
      const gb = grid[o + 1];
      const gc = grid[o + nx + 1];
      const gd = grid[o + nx];
      const lo = Math.min(ga, gb, gc, gd);
      const hi = Math.max(ga, gb, gc, gd);
      /* a cell past the blob (a corner with no field) or between two levels */
      if (!(Math.floor(lo) + 1 <= hi)) continue;
      const reach =
        Math.max(blobAt[o], blobAt[o + 1], blobAt[o + nx], blobAt[o + nx + 1]) +
        h * Math.max(blobSlope[o], blobSlope[o + 1], blobSlope[o + nx], blobSlope[o + nx + 1]);
      if (reach < farthest) continue;
      const crowd = leastNeed * Math.min(slope[o], slope[o + 1], slope[o + nx], slope[o + nx + 1]);
      for (let k = Math.floor(lo) + 1; k <= hi; k++) {
        if (!stringsIsThread(m, k) || 2 ** stringsRank(k) < crowd) continue;
        const a = ga - k;
        const b = gb - k;
        const c = gc - k;
        const d = gd - k;
        const code = (a >= 0 ? 1 : 0) | (b >= 0 ? 2 : 0) | (c >= 0 ? 4 : 0) | (d >= 0 ? 8 : 0);
        if (code === 0 || code === 15) continue;
        const next = of(k);
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
            /* a saddle cell (5 or 10): its middle decides which corners join */
            const mid = (a + b + c + d) / 4 >= 0;
            if (code === 5) {
              if (mid) {
                next.set(top, right);
                next.set(bottom, left);
              } else {
                next.set(top, left);
                next.set(bottom, right);
              }
            } else if (mid) {
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
  const o6 = new Float64Array(6);
  const g3 = new Float64Array(4);
  const b3 = new Float64Array(3);
  const runs = new Map<number, Run[]>();
  for (const [k, next] of [...nexts].sort((x, y) => x[0] - y[0])) {
    yield;
    const crossing = (e: number): [number, number] => {
      const c = e >> 1;
      const i = c % nx;
      const j = (c - i) / nx;
      const a = grid[c] - k;
      if ((e & 1) === 0) return [X(i) + (a / (a - (grid[c + 1] - k))) * h, Y(j)];
      return [X(i), Y(j) + (a / (a - (grid[c + nx] - k))) * h];
    };
    /* the chains: those that start at the grid's edge, then the loops */
    const ends = new Set(next.values());
    const seen = new Set<number>();
    const chains: { edges: number[]; closed: boolean }[] = [];
    const follow = (start: number) => {
      const edges: number[] = [];
      let e: number | undefined = start;
      while (e !== undefined && !seen.has(e)) {
        seen.add(e);
        edges.push(e);
        e = next.get(e);
      }
      chains.push({ edges, closed: e === start });
    };
    for (const start of next.keys()) if (!ends.has(start)) follow(start);
    for (const start of next.keys()) if (!seen.has(start)) follow(start);
    const need = stringsNeed(m, k);
    const rank = 2 ** stringsRank(k);
    const end = stringsEnd(m, k);
    const out: Run[] = [];
    for (const chain of chains) {
      const n = chain.edges.length;
      if (n < 2) continue;
      const px = new Float64Array(n);
      const py = new Float64Array(n);
      const gx = new Float64Array(n);
      const gy = new Float64Array(n);
      /* each point's measures: how far its crowding is from ending it, and its blob from its end */
      const crowd = new Float64Array(n);
      const blob = new Float64Array(n);
      for (let p = 0; p < n; p++) {
        let [x, y] = crossing(chain.edges[p]);
        /* a Newton step from the crossing on the cell's edge, which lies within a hair of the level (the field is
           smooth over a cell), onto it; the slope and the blob are the crossing's, a hundredth of a pixel or less
           away */
        stringsWarp(m, at, (x - W / 2) / D, (y - H / 2) / D, o6);
        stringsField(m, at, o6, g3);
        stringsBlob(m, at, (x - W / 2) / D, (y - H / 2) / D, o6, b3);
        const sx = g3[1] / D;
        const sy = g3[2] / D;
        const s2 = sx * sx + sy * sy;
        if (s2 > 1e-12) {
          const step = (g3[0] - k) / s2;
          if (Math.abs(step) * Math.sqrt(s2) <= h) {
            x -= step * sx;
            y -= step * sy;
          }
        }
        px[p] = x;
        py[p] = y;
        gx[p] = g3[1];
        gy[p] = g3[2];
        /* the crowding by the level's own slope, as the CPU tests it (stringsLevelSlope) */
        const gpx = Math.sqrt(g3[1] * g3[1] + g3[2] * g3[2]) / D;
        crowd[p] = rank - need * stringsLevelSlope(m, k, gpx * g3[3]);
        blob[p] = b3[0] - end;
      }
      out.push(...cut(px, py, gx, gy, crowd, blob, chain.closed, m.lw));
    }
    if (out.length) runs.set(k, out);
  }
  return runs;
}

/** A chain's visible runs: its points where both measures are at least 0, each run ended between two points where one
    crossed 0, at the point and tangent the crossing measure puts it (linearly between the two). A closed chain shows
    whole, or is opened at a point it hides. Runs shorter than two widths are left out. */
function cut(
  px: Float64Array,
  py: Float64Array,
  gx: Float64Array,
  gy: Float64Array,
  crowd: Float64Array,
  blob: Float64Array,
  closed: boolean,
  lw: number
): Run[] {
  const n = px.length;
  const shows = (p: number) => crowd[p] >= 0 && blob[p] >= 0;
  /* the tangent across the slope, turned to run the way the points do */
  const tangent = (gxv: number, gyv: number, dx: number, dy: number): [number, number] => {
    const g = Math.hypot(gxv, gyv) || 1;
    let tx = -gyv / g;
    let ty = gxv / g;
    if (tx * dx + ty * dy < 0) {
      tx = -tx;
      ty = -ty;
    }
    return [tx, ty];
  };
  const runs: Run[] = [];
  let first = 0;
  if (closed) {
    first = -1;
    for (let p = 0; p < n; p++)
      if (!shows(p)) {
        first = p;
        break;
      }
    if (first < 0) {
      const run: Run = { x: [], y: [], tx: [], ty: [], closed: true };
      for (let p = 0; p <= n; p++) {
        const q = p % n;
        const a = (q + n - 1) % n;
        const b = (q + 1) % n;
        const [tx, ty] = tangent(gx[q], gy[q], px[b] - px[a], py[b] - py[a]);
        run.x.push(px[q]);
        run.y.push(py[q]);
        run.tx.push(tx);
        run.ty.push(ty);
      }
      return longEnough(run, lw) ? [run] : [];
    }
  }
  const count = closed ? n + 1 : n;
  const at = (i: number) => (closed ? (first + i) % n : i);
  let run: Run | null = null;
  const push = (x: number, y: number, gxv: number, gyv: number, dx: number, dy: number) => {
    const [tx, ty] = tangent(gxv, gyv, dx, dy);
    run?.x.push(x);
    run?.y.push(y);
    run?.tx.push(tx);
    run?.ty.push(ty);
  };
  for (let i = 0; i < count; i++) {
    const p = at(i);
    const prev = i > 0 ? at(i - 1) : -1;
    const dx = prev >= 0 ? px[p] - px[prev] : px[at(i + 1)] - px[p];
    const dy = prev >= 0 ? py[p] - py[prev] : py[at(i + 1)] - py[p];
    if (prev >= 0 && shows(p) !== shows(prev)) {
      /* the crossing between them, where the measure that crossed is 0 */
      const crossed = (v: Float64Array) => v[p] >= 0 !== v[prev] >= 0;
      const share = (v: Float64Array) => v[prev] / (v[prev] - v[p]);
      const s = Math.min(crossed(crowd) ? share(crowd) : 1, crossed(blob) ? share(blob) : 1);
      const cx = px[prev] + (px[p] - px[prev]) * s;
      const cy = py[prev] + (py[p] - py[prev]) * s;
      const cgx = gx[prev] + (gx[p] - gx[prev]) * s;
      const cgy = gy[prev] + (gy[p] - gy[prev]) * s;
      if (shows(p)) {
        run = { x: [], y: [], tx: [], ty: [], closed: false };
        push(cx, cy, cgx, cgy, dx, dy);
      } else if (run) {
        push(cx, cy, cgx, cgy, dx, dy);
        if (longEnough(run, lw)) runs.push(run);
        run = null;
      }
    } else if (prev < 0 && shows(p)) run = { x: [], y: [], tx: [], ty: [], closed: false };
    if (shows(p) && run) push(px[p], py[p], gx[p], gy[p], dx, dy);
  }
  if (run && longEnough(run, lw)) runs.push(run);
  return runs;
}

const longEnough = (run: Run, lw: number) => {
  let length = 0;
  for (let i = 1; i < run.x.length && length < 2 * lw; i++)
    length += Math.hypot(run.x[i] - run.x[i - 1], run.y[i] - run.y[i - 1]);
  return run.x.length >= 2 && length >= 2 * lw;
};

/** A thread's runs as one path's data: each from its first point, its cubics fitted in stretches of about 24 points. */
function pathOf(runs: readonly Run[], how: FitHow): string {
  return runs
    .map(r => {
      const p = how.places;
      const pen = { x: Number(svgNumber(r.x[0], p)), y: Number(svgNumber(r.y[0], p)) };
      const parts = [`M${svgNumber(pen.x, p)} ${svgNumber(pen.y, p)}`];
      const n = r.x.length - 1;
      const pieces = Math.max(1, Math.round(n / 24));
      const cuts = Array.from({ length: pieces + 1 }, (_, i) => Math.round((i * n) / pieces));
      for (let a = 0; a < pieces; a++)
        if (cuts[a + 1] > cuts[a])
          fitCubics(r.x, r.y, r.tx, r.ty, cuts[a], cuts[a + 1], how, pen, parts);
      if (r.closed) parts.push("z");
      return parts.join("").replace(/ -/g, "-");
    })
    .join("");
}

/** The threads traced for the still, as each level's path data, kept by the scene's view and box, the least lately used
    out first: they depend on these alone, never on the palette, so a list's cards at one angle and shape trace them
    once and each card colors them. */
export const STRINGS_TRACES_KEPT = 32;
const stillThreads = new Map<string, Map<number, string>>();

/** The ground as an SVG rectangle covering a box: at its alpha where it lets the page through, none where clear. */
export function stringsGroundRect(m: StringsScene): string {
  if (m.alpha <= 0) return "";
  const opacity = m.alpha < 1 ? ` fill-opacity="${svgNumber(m.alpha, 3)}"` : "";
  return `<rect width="${m.width}" height="${m.height}" fill="${m.groundHex}"${opacity}/>`;
}

/** The drawing of threads (each level's path data) over the ground, in a box. */
function drawing(m: StringsScene, threads: Map<number, string>): string {
  const { width: W, height: H } = m;
  const paths = [...threads].map(([k, d]) => `<path stroke="${stringsHex(m, k)}" d="${d}"/>`);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    stringsGroundRect(m) +
    `<g fill="none" stroke-width="${svgNumber(m.lw, 3)}" stroke-linejoin="round">${paths.join("")}</g></svg>`
  );
}

/** Each level's path data at t, a step at a time. */
function* threadSteps(
  m: StringsScene,
  how: Trace,
  t: number
): Generator<void, Map<number, string>> {
  const runs = yield* runSteps(m, how, t);
  const out = new Map<number, string>();
  for (const [k, r] of runs) out.set(k, pathOf(r, how));
  return out;
}

/** The still written a step at a time, each a few milliseconds at most (the grid's rows, then a level's threads),
    unless its view's threads are kept; it returns the still. */
export function* stringsStillSteps(m: StringsScene): Generator<void, string> {
  const key = m.view === null ? null : `${m.view}|${m.width}|${m.height}`;
  let threads = key === null ? undefined : stillThreads.get(key);
  if (key !== null && threads) stillThreads.delete(key);
  if (!threads) threads = yield* threadSteps(m, STILL_TRACE(m), 0);
  if (key !== null) {
    stillThreads.delete(key);
    if (stillThreads.size >= STRINGS_TRACES_KEPT)
      stillThreads.delete(stillThreads.keys().next().value as string);
    stillThreads.set(key, threads);
  }
  return drawing(m, threads);
}

/** Steps run through at once. */
function atOnce<T>(steps: Generator<void, T>): T {
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/** The still of a scene. */
export const stringsStillOf = (m: StringsScene): string => atOnce(stringsStillSteps(m));
/** The frame at t of a scene, traced as a file is. */
export const stringsFrameOf = (m: StringsScene, t: number): string =>
  drawing(m, atOnce(threadSteps(m, FILE_TRACE(m), t)));
/** Each thread of the frame at t as path data, keyed by level, traced as a file is: what Copy for Figma outlines. */
export const stringsThreads = (m: StringsScene, t = 0): Map<number, string> =>
  atOnce(threadSteps(m, FILE_TRACE(m), t));

/** The still of a palette and a view in a box. */
export const stringsStillSvg = (P: Palette, view: StringsView, size: Size): string =>
  stringsStillOf(stringsScene(P, view, size));
/** The file's SVG of a palette and a view in a box: its first frame, at any speed. */
export const stringsFileSvg = (P: Palette, view: StringsView, size: Size): string =>
  stringsFrameOf(stringsScene(P, view, size), 0);
/** The frame at t seconds of the loop at speed 1. */
export const stringsFrameSvg = (P: Palette, view: StringsView, size: Size, t: number): string =>
  stringsFrameOf(stringsScene(P, view, size), t);
