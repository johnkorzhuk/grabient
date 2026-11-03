/* Papercut's stills as SVG: the sheets' cuts at t = 0 as vector paths, over the first sheet as the ground, each sheet
   drawn as the CPU paints it: its drop shadow, its contact shadow, its lit cut, then its face.

   - The still (papercutStillSvg): what a list's card, a page's first paint and the stylesheet paint, so it has no
     filter (John's pick, 2 Nov 2026: "go with Stepped shadows"). Each sheet's cut is one path, which every layer uses:
     the drop shadow as a few dilations of the cut (its path stroked round and filled), moved away from the light, each
     at its share of the shadow's opacity, so the stack's cover steps down as the CPU's shadow fades from its cut; the
     contact shadow as a thin stroke under the cut; the lit cut as the cut filled in a lighter paper; the face as the
     cut moved a hair away from the light.
   - The file's SVG (papercutFileSvg): the same paths with the shadows blurred by feGaussianBlur, as the sketch drew
     them, which Figma's importer reads as layer blurs (a blur of twice the deviation) and every browser paints.

   The cuts are the field's level sets: marching squares over the box and a margin wide enough that no shadow of the
   margin's closing edge reaches the box, every point moved onto the exact contour by Newton steps, then fitted with
   cubic Beziers whose tangents are the contour's own (across the field's slope there), split until no point strays
   further than the tolerance. */

import type { Palette } from "./palette.ts";
import {
  type PapercutScene,
  type PapercutView,
  papercutField,
  papercutFieldValue,
  papercutFrameAt,
  papercutFrameSize,
  papercutScene
} from "./papercut.ts";
import type { Size } from "./view.ts";

const fmt = (v: number, places: number) => {
  const k = 10 ** places;
  const r = Math.round(v * k) / k;
  return (Object.is(r, -0) ? 0 : r).toString().replace(/^(-?)0\./, "$1.");
};

interface Contour {
  /** points, px, closed (the last joins the first) */
  x: Float64Array;
  y: Float64Array;
  /** the unit tangent at each point */
  tx: Float64Array;
  ty: Float64Array;
}

/** How a still traces its cuts: the grid's step (px), how far a fitted curve may stray from the contour (px), the
    decimals each coordinate is written with, and how far past the box the cuts run, in the shadows' sigmas past
    their offsets (as far as a shadow reaches, so no edge closing a cut past the box shows in it). */
interface Trace {
  step: number;
  tolerance: number;
  places: number;
  reach: number;
}

/** The margin past the box the cuts are traced over, px. */
const marginOf = (m: PapercutScene, reach: number) =>
  Math.ceil(Math.max(...m.offset) + reach * Math.max(...m.sigma) + 4);

/** The contours of every sheet's level at t = 0, in px, with their tangents. */
function contours(m: PapercutScene, how: Trace): Contour[][] {
  const at = new Float64Array(papercutFrameSize(m));
  papercutFrameAt(m, 0, at);
  const out = new Float64Array(4);
  const { width: W, height: H, D } = m;
  const margin = marginOf(m, how.reach);
  const h = how.step;
  const nx = Math.ceil((W + 2 * margin) / h) + 1;
  const ny = Math.ceil((H + 2 * margin) / h) + 1;
  const X = (i: number) => -margin + i * h;
  const Y = (j: number) => -margin + j * h;
  const grid = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const edge = i === 0 || j === 0 || i === nx - 1 || j === ny - 1;
      grid[j * nx + i] = edge
        ? -1e9
        : papercutFieldValue(m, at, (X(i) - W / 2) / D, (Y(j) - H / 2) / D);
    }
  const evalAt = (px: number, py: number) => {
    papercutField(m, at, (px - W / 2) / D, (py - H / 2) / D, out);
    return out;
  };
  return trace(grid, nx, ny, m.levels, X, Y, h, evalAt, D, margin, W, H);
}

/** Marching squares at every level in one pass over the grid (a cell's corners straddle only the levels between its
    least and its greatest): segments between cell-edge crossings, linked into closed loops, each point polished onto
    the exact contour. */
function trace(
  grid: Float64Array,
  nx: number,
  ny: number,
  levels: readonly number[],
  X: (i: number) => number,
  Y: (j: number) => number,
  h: number,
  evalAt: (x: number, y: number) => Float64Array,
  D: number,
  margin: number,
  W: number,
  H: number
): Contour[][] {
  /* edge ids: horizontal edge (i, j)-(i+1, j) is 2 (j nx + i), vertical edge (i, j)-(i, j+1) is that + 1 */
  const hEdge = (i: number, j: number) => 2 * (j * nx + i);
  const vEdge = (i: number, j: number) => 2 * (j * nx + i) + 1;
  const nexts = levels.map(() => new Map<number, number>());
  for (let j = 0; j < ny - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const o = j * nx + i;
      const ga = grid[o];
      const gb = grid[o + 1];
      const gc = grid[o + nx + 1];
      const gd = grid[o + nx];
      const lo = Math.min(ga, gb, gc, gd);
      const hi = Math.max(ga, gb, gc, gd);
      for (let k = 0; k < levels.length; k++) {
        const level = levels[k];
        if (level <= lo) continue;
        if (level > hi) break;
        const a = ga - level;
        const b = gb - level;
        const c = gc - level;
        const d = gd - level;
        const code = (a >= 0 ? 1 : 0) | (b >= 0 ? 2 : 0) | (c >= 0 ? 4 : 0) | (d >= 0 ? 8 : 0);
        const next = nexts[k];
        const top = hEdge(i, j);
        const right = vEdge(i + 1, j);
        const bottom = hEdge(i, j + 1);
        const left = vEdge(i, j);
        /* each segment runs with the inside (the field above the level) on its right, y down */
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
  return levels.map((level, k) =>
    loopsOf(nexts[k], grid, nx, level, X, Y, h, evalAt, D, margin, W, H)
  );
}

/** One level's segments linked into closed loops, each point polished onto the exact contour. */
function loopsOf(
  next: Map<number, number>,
  grid: Float64Array,
  nx: number,
  level: number,
  X: (i: number) => number,
  Y: (j: number) => number,
  h: number,
  evalAt: (x: number, y: number) => Float64Array,
  D: number,
  margin: number,
  W: number,
  H: number
): Contour[] {
  const v = (i: number, j: number) => grid[j * nx + i] - level;
  const point = (e: number): [number, number] => {
    const k = e >> 1;
    const i = k % nx;
    const j = (k - i) / nx;
    if ((e & 1) === 0) {
      const a = v(i, j);
      const s = a / (a - v(i + 1, j));
      return [X(i) + s * h, Y(j)];
    }
    const a = v(i, j);
    const s = a / (a - v(i, j + 1));
    return [X(i), Y(j) + s * h];
  };
  const loops: Contour[] = [];
  const seen = new Set<number>();
  const inBox = (x: number, y: number) =>
    x > -margin + 1.5 * h &&
    y > -margin + 1.5 * h &&
    x < W + margin - 1.5 * h &&
    y < H + margin - 1.5 * h;
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const xs: number[] = [];
    const ys: number[] = [];
    let e = start;
    while (!seen.has(e)) {
      seen.add(e);
      const [px, py] = point(e);
      xs.push(px);
      ys.push(py);
      const n = next.get(e);
      if (n === undefined) break;
      e = n;
    }
    if (xs.length < 3) continue;
    const L = xs.length;
    const c: Contour = {
      x: new Float64Array(L),
      y: new Float64Array(L),
      tx: new Float64Array(L),
      ty: new Float64Array(L)
    };
    const polished = new Uint8Array(L);
    for (let p = 0; p < L; p++) {
      let x = xs[p];
      let y = ys[p];
      let gx = 0;
      let gy = 0;
      if (inBox(x, y)) {
        polished[p] = 1;
        /* two Newton steps from the crossing on the cell's edge, which lies within a hair of the contour, onto it; the
           tangent is the slope's at the last step, a thousandth of a pixel or less from the point */
        for (let it = 0; it < 2; it++) {
          const f = evalAt(x, y);
          /* the slope per px */
          gx = f[1] / D;
          gy = f[2] / D;
          const g2 = gx * gx + gy * gy;
          if (g2 < 1e-12) break;
          const step = (f[0] - level) / g2;
          if (Math.abs(step * Math.sqrt(g2)) > h) break;
          x -= step * gx;
          y -= step * gy;
        }
      }
      c.x[p] = x;
      c.y[p] = y;
      const g = Math.hypot(gx, gy) || 1;
      /* the higher field on the right of the way the loop runs, y down: the slope turned a quarter counterclockwise */
      c.tx[p] = gy / g;
      c.ty[p] = -gx / g;
    }
    /* points on the margin's closing ring lie on no contour: their tangents are the polyline's own */
    for (let p = 0; p < L; p++) {
      if (polished[p]) continue;
      const a = (p + L - 1) % L;
      const b = (p + 1) % L;
      const dx = c.x[b] - c.x[a];
      const dy = c.y[b] - c.y[a];
      const g = Math.hypot(dx, dy) || 1;
      c.tx[p] = dx / g;
      c.ty[p] = dy / g;
    }
    loops.push(c);
  }
  return loops;
}

/** A loop as cubic Beziers, relative after its first point: Schneider's fit with the contour's own tangents, split at
    the worst point until every point lies within the tolerance. */
function bezier(c: Contour, how: Trace): string {
  const n = c.x.length;
  const xs = Array.from(c.x);
  const ys = Array.from(c.y);
  xs.push(xs[0]);
  ys.push(ys[0]);
  const tx = Array.from(c.tx);
  const ty = Array.from(c.ty);
  tx.push(tx[0]);
  ty.push(ty[0]);
  /* the field's tangent turned the way the points themselves run */
  for (let i = 0; i < n; i++) {
    const ax = xs[i + 1] - xs[i === 0 ? n - 1 : i - 1];
    const ay = ys[i + 1] - ys[i === 0 ? n - 1 : i - 1];
    if (ax * tx[i] + ay * ty[i] < 0) {
      tx[i] = -tx[i];
      ty[i] = -ty[i];
    }
  }
  tx[n] = tx[0];
  ty[n] = ty[0];
  const p = how.places;
  /* every point written relative to the one before as it is rounded, so the rounding never adds up along the loop */
  const pen = { x: Number(fmt(xs[0], p)), y: Number(fmt(ys[0], p)) };
  const parts: string[] = [`M${fmt(pen.x, p)} ${fmt(pen.y, p)}`];
  const anchors = Math.max(2, Math.min(8, Math.round(n / 24)));
  const cuts = Array.from({ length: anchors + 1 }, (_, i) => Math.round((i * n) / anchors));
  for (let a = 0; a < anchors; a++) fit(xs, ys, tx, ty, cuts[a], cuts[a + 1], how, pen, parts);
  parts.push("z");
  return parts.join("").replace(/ -/g, "-");
}

function fit(
  xs: number[],
  ys: number[],
  tx: number[],
  ty: number[],
  i0: number,
  i1: number,
  how: Trace,
  pen: { x: number; y: number },
  out: string[]
) {
  const p = how.places;
  const k = 10 ** p;
  const rel = (x: number, y: number) => {
    const dx = Math.round((x - pen.x) * k) / k;
    const dy = Math.round((y - pen.y) * k) / k;
    return [dx, dy] as const;
  };
  const x0 = xs[i0];
  const y0 = ys[i0];
  const x3 = xs[i1];
  const y3 = ys[i1];
  if (i1 - i0 < 2) {
    const [dx, dy] = rel(x3, y3);
    out.push(`l${fmt(dx, p)} ${fmt(dy, p)}`);
    pen.x += dx;
    pen.y += dy;
    return;
  }
  /* chord-length parameters */
  const u = [0];
  for (let i = i0 + 1; i <= i1; i++)
    u.push(u[u.length - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]));
  const total = u[u.length - 1] || 1;
  for (let i = 0; i < u.length; i++) u[i] /= total;
  const t0x = tx[i0];
  const t0y = ty[i0];
  const t1x = -tx[i1];
  const t1y = -ty[i1];
  let c11 = 0;
  let c12 = 0;
  let c22 = 0;
  let r1 = 0;
  let r2 = 0;
  for (let j = 0; j < u.length; j++) {
    const t = u[j];
    const s = 1 - t;
    const b0 = s * s * s;
    const b1 = 3 * t * s * s;
    const b2 = 3 * t * t * s;
    const b3 = t * t * t;
    const a1x = t0x * b1;
    const a1y = t0y * b1;
    const a2x = t1x * b2;
    const a2y = t1y * b2;
    c11 += a1x * a1x + a1y * a1y;
    c12 += a1x * a2x + a1y * a2y;
    c22 += a2x * a2x + a2y * a2y;
    const px = xs[i0 + j] - (x0 * (b0 + b1) + x3 * (b2 + b3));
    const py = ys[i0 + j] - (y0 * (b0 + b1) + y3 * (b2 + b3));
    r1 += a1x * px + a1y * py;
    r2 += a2x * px + a2y * py;
  }
  const det = c11 * c22 - c12 * c12;
  const chord = Math.hypot(x3 - x0, y3 - y0);
  let l1 = chord / 3;
  let l2 = chord / 3;
  if (Math.abs(det) > 1e-12) {
    l1 = (r1 * c22 - r2 * c12) / det;
    l2 = (c11 * r2 - c12 * r1) / det;
  }
  if (!(l1 > 1e-3 * chord) || !(l2 > 1e-3 * chord) || l1 > 2 * chord || l2 > 2 * chord) {
    l1 = chord / 3;
    l2 = chord / 3;
  }
  const x1 = x0 + t0x * l1;
  const y1 = y0 + t0y * l1;
  const x2 = x3 + t1x * l2;
  const y2 = y3 + t1y * l2;
  /* the worst point, against the curve at its parameter refined by Newton steps on the distance */
  let worst = 0;
  let at = -1;
  for (let j = 1; j < u.length - 1; j++) {
    let t = u[j];
    const px = xs[i0 + j];
    const py = ys[i0 + j];
    for (let it = 0; it < 2; it++) {
      const s = 1 - t;
      const bx = s * s * s * x0 + 3 * s * s * t * x1 + 3 * s * t * t * x2 + t * t * t * x3;
      const by = s * s * s * y0 + 3 * s * s * t * y1 + 3 * s * t * t * y2 + t * t * t * y3;
      const dx1 = 3 * (s * s * (x1 - x0) + 2 * s * t * (x2 - x1) + t * t * (x3 - x2));
      const dy1 = 3 * (s * s * (y1 - y0) + 2 * s * t * (y2 - y1) + t * t * (y3 - y2));
      const dd = dx1 * dx1 + dy1 * dy1;
      if (dd < 1e-12) break;
      t = Math.min(1, Math.max(0, t - ((bx - px) * dx1 + (by - py) * dy1) / dd));
    }
    const s = 1 - t;
    const bx = s * s * s * x0 + 3 * s * s * t * x1 + 3 * s * t * t * x2 + t * t * t * x3;
    const by = s * s * s * y0 + 3 * s * s * t * y1 + 3 * s * t * t * y2 + t * t * t * y3;
    const e = Math.hypot(bx - px, by - py);
    if (e > worst) {
      worst = e;
      at = i0 + j;
    }
  }
  if (worst > how.tolerance && at > i0 && at < i1) {
    fit(xs, ys, tx, ty, i0, at, how, pen, out);
    fit(xs, ys, tx, ty, at, i1, how, pen, out);
    return;
  }
  const [ax, ay] = rel(x1, y1);
  const [bx, by] = rel(x2, y2);
  const [cx, cy] = rel(x3, y3);
  out.push(`c${[ax, ay, bx, by, cx, cy].map(v => fmt(v, p)).join(" ")}`);
  pen.x += cx;
  pen.y += cy;
}

/** Each sheet's cut as one path's data, sheet k at k - 1 (empty where its level cuts nothing in the box). */
function cutPaths(m: PapercutScene, how: Trace): string[] {
  return contours(m, how).map(loops => loops.map(c => bezier(c, how)).join(""));
}

/** The light at t = 0, on screen: toward it. */
function lightOf(m: PapercutScene): [number, number] {
  const at = new Float64Array(papercutFrameSize(m));
  papercutFrameAt(m, 0, at);
  return [at[at.length - 2], at[at.length - 1]];
}

/** The still's drop shadow, as SVG lays its layers one over another in one color: the moved cut filled at `fill` of the
    shadow's opacity, then stroked round at each step's half width (in the shadow's sigmas) at its share, so the cover
    falls off either side of the moved cut much as the CPU's shadow does (the shadow's opacity times the Gaussian's
    cumulative share at the distance over its sigma). Fitted where a shadow shows past its sheet, every way a cut can
    face the light (styles-lab/sg/papercut/steps-fit2.ts): 3% of the shadow's opacity off, root mean square, where the
    prototype's four dilations at equal shares, filled and stroked each, were 31% off. */
export const PAPERCUT_STEPS = {
  fill: 0.277,
  strokes: [
    [0.621, 0.162],
    [1.017, 0.128],
    [1.575, 0.101]
  ]
} as const;
/** The contact shadow's stroke under the cut: its half width in contact sigmas and its share of the contact's
    opacity, fitted as the steps are (contact-fit.ts). */
const CONTACT = { reach: 1, share: 0.37 };

/** How the still traces its cuts: a grid of a hundred and twenty cells across the longer side, curves within four
    tenths of a pixel at the design square's thousand, every coordinate a whole pixel there, past the box as far as
    the outermost step reaches. */
const STILL_TRACE = (m: PapercutScene): Trace => ({
  step: Math.max(m.width, m.height) / 120,
  tolerance: (0.4 * Math.max(m.width, m.height)) / 1000,
  places: 0,
  reach: PAPERCUT_STEPS.strokes[PAPERCUT_STEPS.strokes.length - 1][0]
});
/** How the file's SVG traces them: a grid of under 4 px, curves within a tenth of a pixel, past the box as far as a
    blur reaches. */
const FILE_TRACE = (m: PapercutScene): Trace => ({
  step: Math.max(1.5, Math.min(4, m.D / 380)),
  tolerance: 0.1,
  places: 1,
  reach: 4.5
});

const svgOpen = (m: PapercutScene) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${m.width}" height="${m.height}" viewBox="0 0 ${m.width} ${m.height}">`;

/** The still: stepped shadows, no filter. */
export function papercutStillOf(m: PapercutScene): string {
  const { width: W, height: H } = m;
  const cuts = cutPaths(m, STILL_TRACE(m));
  const [lx, ly] = lightOf(m);
  const defs: string[] = [];
  const body: string[] = [];
  for (let k = 1; k < m.n; k++) {
    const d = cuts[k - 1];
    if (!d) continue;
    defs.push(`<path id="c${k}" d="${d}"/>`);
    const shadow = m.shadowHex[k];
    const off = m.offset[k];
    const moved = `translate(${fmt(-off * lx, 2)} ${fmt(-off * ly, 2)})`;
    const a = m.alpha[k];
    PAPERCUT_STEPS.strokes.forEach(([r, share], i) => {
      const stroke = `stroke="${shadow}" stroke-opacity="${fmt(share * a, 3)}" stroke-width="${fmt(2 * r * m.sigma[k], 2)}"`;
      body.push(
        i === 0
          ? `<use href="#c${k}" transform="${moved}" fill="${shadow}" fill-opacity="${fmt(PAPERCUT_STEPS.fill * a, 3)}" ${stroke}/>`
          : `<use href="#c${k}" transform="${moved}" fill="none" ${stroke}/>`
      );
    });
    /* the contact shadow's stroke under the lit cut, which paints over its inner half */
    body.push(
      `<use href="#c${k}" fill="${m.wallHex[k]}" stroke="${shadow}" stroke-opacity="${fmt(CONTACT.share * m.calpha, 3)}" stroke-width="${fmt(2 * CONTACT.reach * m.csigma, 2)}" paint-order="stroke"/>`,
      `<use href="#c${k}" transform="translate(${fmt(-m.wall * lx, 2)} ${fmt(-m.wall * ly, 2)})" fill="${m.hex[k]}"/>`
    );
  }
  /* the box's own edge clips it: a card's picture and a page's background are the box */
  return (
    `${svgOpen(m)}<defs>${defs.join("")}</defs>` +
    `<g fill-rule="evenodd" stroke-linejoin="round"><rect width="${W}" height="${H}" fill="${m.hex[0]}"/>${body.join("")}</g></svg>`
  );
}

/** The file's SVG: the shadows blurred, as the sketch drew them, for a browser and Figma's importer alike. */
export function papercutFileOf(m: PapercutScene): string {
  const { width: W, height: H } = m;
  const cuts = cutPaths(m, FILE_TRACE(m));
  const [lx, ly] = lightOf(m);
  const margin = marginOf(m, FILE_TRACE(m).reach);
  const region = `x="${-margin}" y="${-margin}" width="${W + 2 * margin}" height="${H + 2 * margin}" filterUnits="userSpaceOnUse"`;
  const blurs = new Map<number, string>();
  const filter = (sigma: number) => {
    let id = blurs.get(sigma);
    if (!id) {
      id = `pc${blurs.size}`;
      blurs.set(sigma, id);
    }
    return id;
  };
  const defs: string[] = [];
  const body: string[] = [];
  for (let k = 1; k < m.n; k++) {
    const d = cuts[k - 1];
    if (!d) continue;
    defs.push(`<path id="c${k}" d="${d}"/>`);
    const off = m.offset[k];
    body.push(
      `<use href="#c${k}" transform="translate(${fmt(-off * lx, 2)} ${fmt(-off * ly, 2)})" fill="${m.shadowHex[k]}" opacity="${m.alpha[k]}" filter="url(#${filter(m.sigma[k])})"/>`,
      `<use href="#c${k}" fill="${m.shadowHex[k]}" opacity="${m.calpha}" filter="url(#${filter(m.csigma)})"/>`,
      `<use href="#c${k}" fill="${m.wallHex[k]}"/>`,
      `<use href="#c${k}" transform="translate(${fmt(-m.wall * lx, 2)} ${fmt(-m.wall * ly, 2)})" fill="${m.hex[k]}"/>`
    );
  }
  const filters = [...blurs].map(
    ([s, id]) => `<filter id="${id}" ${region}><feGaussianBlur stdDeviation="${s}"/></filter>`
  );
  return (
    `${svgOpen(m)}<defs>${filters.join("")}<clipPath id="pcbox"><rect width="${W}" height="${H}"/></clipPath>${defs.join("")}</defs>` +
    `<g clip-path="url(#pcbox)" fill-rule="evenodd"><rect width="${W}" height="${H}" fill="${m.hex[0]}"/>${body.join("")}</g></svg>`
  );
}

/** The still of a palette and a view in a box. */
export const papercutStillSvg = (P: Palette, view: PapercutView, size: Size): string =>
  papercutStillOf(papercutScene(P, view, size));
/** The file's SVG of a palette and a view in a box. */
export const papercutFileSvg = (P: Palette, view: PapercutView, size: Size): string =>
  papercutFileOf(papercutScene(P, view, size));
