/* The strings as Figma's own layers, for Copy for Figma: the ground, a rectangle in its color (at its alpha where it
   lets what is under it through, and none where it is clear), then a group of the
   threads, each a vector layer in its color, the paths its SVG file strokes (strings-svg.ts stringsThreads) traced as
   the file traces them at its first frame. A paste's layers are fills alone (figma-schema.ts holds no stroke's paint),
   so each thread is pasted as its outline, what its stroke covers: each subpath read off its cubics at points three
   pixels or fifteen degrees of turning apart, each point carried half a width either way across its tangent, the left
   side out and the right side back joined by the butt ends into one loop, a closed subpath's two sides a ring; where
   the path turns a corner (a line the fit drew between two points of a hairpin's tip), the side outside it goes round
   as the stroke's round join does. One vector network holds a thread's loops, filled by the odd rule (figma-paste.ts
   figmaVector), each loop fitted with cubic Beziers within 0.08 px of its points (svg-fit.ts).
   The odd rule leaves a hole wherever loops overlap, and a thread's outline overlaps itself wherever the stroke covers
   a place twice: inside a bend tighter than half a width, where the inner side doubles back on itself; between a
   hairpin's legs, where they run within a width of each other; across a tip the fit overshoots. So a thread's loops
   are pasted as the edge of what they cover together: cut at their every crossing, each piece kept where nothing lies
   to its left, as an edge's outside, and the pieces joined again at the crossings (union). A closed subpath too small
   to leave a hole inside its width is pasted whole, with no inner loop. figma-paste.test.ts holds every thread's odd
   fill to the fill of everything its loops go round, and to its length times its width.
   A paste is the still at any pace: the threads change shape as they move, loops closing and bundles shedding threads,
   which no layer's turn or move follows, so Figma's timeline has nothing to key. Its soft and grain wrap it as the
   site paints them (figmaFinish). */
import {
  FIGMA_PAGE,
  type FigmaCubic,
  type FigmaFinish,
  type FigmaNode,
  figmaFinish,
  figmaLayers,
  figmaPasteHtml,
  figmaPathLoops,
  figmaPathRuns,
  figmaScene,
  figmaSolid,
  figmaVector
} from "./figma-paste.ts";
import type { Underlay } from "./fx-finish.ts";
import type { Palette } from "./palette.ts";
import { stringsHex, stringsScene } from "./strings.ts";
import { stringsThreads } from "./strings-svg.ts";
import { type FitHow, fitCubics, svgNumber } from "./svg-fit.ts";

/** A strings to paste: its palette and look, the frame's size and name, and its soft and grain. */
export interface FigmaStringsView {
  palette: Palette;
  angle: number;
  shape: number | null;
  /** the ground (effect.ts EffectLook's `bg`): none as designed */
  bg: string | null;
  width: number;
  height: number;
  name: string;
  finish?: FigmaFinish | null;
  /** the gradient a soft strings' edges go to (fx-finish.ts effectUnderlay), none for none */
  underlay?: Underlay | null;
}

/** How an outline is read off a path: its points `step` px apart at most and a `turn` (radians) of the path between
    them, and a corner the path turns by less than `join` taken as smooth, its tangents' mean between (the stroke's
    round join and the inner side's notch there lie within 0.8% of a half width of it, 0.025 px at 3840 by 2160). Its
    loops are fitted within `tolerance` px of their points, three decimals each, so a closed loop's last point lands
    within a thousandth of its first. */
const OUTLINE = { step: 3, turn: Math.PI / 12, join: 0.25 } as const;
const OUTLINE_FIT: FitHow = { tolerance: 0.08, places: 3 };

/** A subpath's points: where each lies and the unit tangents the path arrives along and leaves along, which differ
    at a corner. */
interface Nodes {
  x: number[];
  y: number[];
  ax: number[];
  ay: number[];
  lx: number[];
  ly: number[];
}

type Point = readonly [number, number];
const unit = (x: number, y: number): [number, number] => {
  const l = Math.hypot(x, y);
  return l > 1e-12 ? [x / l, y / l] : [0, 0];
};
/* a cubic's point and its direction at t, the direction from its handles where its derivative vanishes (a line's
   cubic, whose handles stay on its ends) */
function at([p0, p1, p2, p3]: FigmaCubic, t: number): [number, number, number, number] {
  const s = 1 - t;
  const x = s * s * s * p0[0] + 3 * s * s * t * p1[0] + 3 * s * t * t * p2[0] + t * t * t * p3[0];
  const y = s * s * s * p0[1] + 3 * s * s * t * p1[1] + 3 * s * t * t * p2[1] + t * t * t * p3[1];
  let [dx, dy] = unit(
    s * s * (p1[0] - p0[0]) + 2 * s * t * (p2[0] - p1[0]) + t * t * (p3[0] - p2[0]),
    s * s * (p1[1] - p0[1]) + 2 * s * t * (p2[1] - p1[1]) + t * t * (p3[1] - p2[1])
  );
  const toward = (a: Point, b: Point) => unit(b[0] - a[0], b[1] - a[1]);
  if (!dx && !dy) [dx, dy] = t < 0.5 ? toward(p0, p2) : toward(p1, p3);
  if (!dx && !dy) [dx, dy] = toward(p0, p3);
  return [x, y, dx, dy];
}

/** A subpath's cubics as its points (Nodes): each cubic's from its start, `OUTLINE.step` and `OUTLINE.turn` apart at
    most, and an open subpath's end. Across a step its tangents run against (a cubic doubling back on itself), the path
    arrives and leaves along the step itself; a corner it turns by less than `OUTLINE.join` is smoothed. */
function nodesOf(cubics: readonly FigmaCubic[], closed: boolean): Nodes {
  const o: Nodes = { x: [], y: [], ax: [], ay: [], lx: [], ly: [] };
  let last: [number, number] | null = null;
  const add = (x: number, y: number, ax: number, ay: number, lx: number, ly: number) => {
    const n = o.x.length;
    if (n && Math.hypot(x - o.x[n - 1], y - o.y[n - 1]) < 1e-6) {
      /* a point on the last: the path leaves it along this one's tangent */
      o.lx[n - 1] = lx;
      o.ly[n - 1] = ly;
      return;
    }
    o.x.push(x);
    o.y.push(y);
    o.ax.push(ax);
    o.ay.push(ay);
    o.lx.push(lx);
    o.ly.push(ly);
  };
  for (const c of cubics) {
    let length = 0;
    let turn = 0;
    let prev: [number, number] | null = null;
    for (let k = 0; k < 3; k++) {
      const [ux, uy] = unit(c[k + 1][0] - c[k][0], c[k + 1][1] - c[k][1]);
      length += Math.hypot(c[k + 1][0] - c[k][0], c[k + 1][1] - c[k][1]);
      if (!ux && !uy) continue;
      if (prev)
        turn += Math.abs(Math.atan2(prev[0] * uy - prev[1] * ux, prev[0] * ux + prev[1] * uy));
      prev = [ux, uy];
    }
    if (length < 1e-6) continue;
    const k = Math.max(1, Math.ceil(length / OUTLINE.step), Math.ceil(turn / OUTLINE.turn));
    for (let j = 0; j < k; j++) {
      const [x, y, dx, dy] = at(c, j / k);
      const [ax, ay] = j === 0 && last ? last : [dx, dy];
      add(x, y, ax, ay, dx, dy);
    }
    const [, , ex, ey] = at(c, 1);
    last = [ex, ey];
    if (!closed && c === cubics[cubics.length - 1]) {
      const [x, y] = c[3];
      add(x, y, ex, ey, ex, ey);
    }
  }
  const n = o.x.length;
  if (closed && last && n) {
    /* the path arrives back at its first point along its last cubic's end */
    o.ax[0] = last[0];
    o.ay[0] = last[1];
  }
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const j = (i + 1) % n;
    const [dx, dy] = unit(o.x[j] - o.x[i], o.y[j] - o.y[i]);
    if (o.lx[i] * dx + o.ly[i] * dy > 0 && o.ax[j] * dx + o.ay[j] * dy > 0) continue;
    o.lx[i] = o.ax[j] = dx;
    o.ly[i] = o.ay[j] = dy;
  }
  if (!closed && n) {
    /* an open subpath's ends turn no corner: it leaves its first point and arrives at its last alone */
    o.ax[0] = o.lx[0];
    o.ay[0] = o.ly[0];
    o.lx[n - 1] = o.ax[n - 1];
    o.ly[n - 1] = o.ay[n - 1];
  }
  for (let i = 0; i < n; i++) {
    const turn = Math.atan2(
      o.ax[i] * o.ly[i] - o.ay[i] * o.lx[i],
      o.ax[i] * o.lx[i] + o.ay[i] * o.ly[i]
    );
    if (Math.abs(turn) >= OUTLINE.join) continue;
    const [mx, my] = unit(o.ax[i] + o.lx[i], o.ay[i] + o.ly[i]);
    o.ax[i] = o.lx[i] = mx;
    o.ay[i] = o.ly[i] = my;
  }
  return o;
}

/** An outline's loop: its points (px), the unit tangent the loop arrives at each along and the one it leaves along
    (the same but at a corner: a butt end's, or where the loop was cut), and which are corners. */
interface Loop extends Nodes {
  corner: boolean[];
}
const emptyLoop = (): Loop => ({ x: [], y: [], ax: [], ay: [], lx: [], ly: [], corner: [] });
function put(
  o: Loop,
  x: number,
  y: number,
  ax: number,
  ay: number,
  lx: number,
  ly: number,
  corner: boolean
) {
  o.x.push(x);
  o.y.push(y);
  o.ax.push(ax);
  o.ay.push(ay);
  o.lx.push(lx);
  o.ly.push(ly);
  o.corner.push(corner);
}
const copy = (to: Loop, o: Loop, i: number) =>
  put(to, o.x[i], o.y[i], o.ax[i], o.ay[i], o.lx[i], o.ly[i], o.corner[i]);

/** A loop the other way round. */
const backward = (o: Loop): Loop => ({
  x: [...o.x].reverse(),
  y: [...o.y].reverse(),
  ax: o.lx.map(v => -v).reverse(),
  ay: o.ly.map(v => -v).reverse(),
  lx: o.ax.map(v => -v).reverse(),
  ly: o.ay.map(v => -v).reverse(),
  corner: [...o.corner].reverse()
});

/** One side of a subpath's points, `side` +1 its left and -1 its right as it runs on the screen (y down), each
    carried half a width `hw` across its tangent; at a corner the side outside the turn goes round it, as a round join
    does, and the side inside takes both of its points, which the union cuts where the two legs' edges cross. */
function sideOf(nodes: Nodes, side: 1 | -1, hw: number): Loop {
  const { x, y, ax, ay, lx, ly } = nodes;
  const o = emptyLoop();
  const carried = (i: number, tx: number, ty: number): [number, number] => [
    x[i] + side * hw * ty,
    y[i] - side * hw * tx
  ];
  for (let i = 0; i < x.length; i++) {
    const turn = Math.atan2(ax[i] * ly[i] - ay[i] * lx[i], ax[i] * lx[i] + ay[i] * ly[i]);
    if (!turn) {
      put(o, ...carried(i, lx[i], ly[i]), lx[i], ly[i], lx[i], ly[i], false);
      continue;
    }
    /* turning clockwise on the screen, the left side is outside */
    if (turn * side > 0) {
      const steps = Math.ceil(Math.abs(turn) / OUTLINE.turn);
      for (let k = 0; k <= steps; k++) {
        const a = (turn * k) / steps;
        const tx = Math.cos(a) * ax[i] - Math.sin(a) * ay[i];
        const ty = Math.sin(a) * ax[i] + Math.cos(a) * ay[i];
        put(o, ...carried(i, tx, ty), tx, ty, tx, ty, false);
      }
      continue;
    }
    const [x0, y0] = carried(i, ax[i], ay[i]);
    const [x1, y1] = carried(i, lx[i], ly[i]);
    const [ux, uy] = unit(x1 - x0, y1 - y0);
    put(o, x0, y0, ax[i], ay[i], ux, uy, true);
    put(o, x1, y1, ux, uy, lx[i], ly[i], true);
  }
  return o;
}

/* where segments ab and cd cross, as the share along each, each from its start up to its end (so a crossing at a
   point two segments share is found once), or null */
function crossing(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): [number, number] | null {
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = cx - ax;
  const qy = cy - ay;
  const u = (qx * sy - qy * sx) / den;
  const v = (qx * ry - qy * rx) / den;
  return u >= 0 && u < 1 && v >= 0 && v < 1 ? [u, v] : null;
}

/** The shoelace's signed area of a polygon, positive where it runs clockwise on the screen (y down): an outline's
    loops run so, what they cover on their right, a ring's inner loop the other way. */
function signedArea(xs: readonly number[], ys: readonly number[]): number {
  let a = 0;
  for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) a += xs[j] * ys[i] - xs[i] * ys[j];
  return a / 2;
}

/** A stretch of a loop between two of its crossings, or all of an uncrossed loop: its points, and the crossings it
    starts and ends at (-1 for none). */
interface Chain extends Loop {
  from: number;
  to: number;
}

/** Loops, each covering what lies on its right, as the edge of all they cover: what a stroke covers, which a fill by
    the odd rule paints as it is, where the loops overlap or a loop overlaps itself (a fill of their every crossing,
    the nonzero rule, would paint it as well, but Figma's vector network is filled by the odd rule here, the one a paste
    has been seen to read). Every crossing of two segments of the loops is found (a grid of 2 px cells holds the
    segments), each loop cut at its crossings into chains, and a chain kept where what lies just to its left is covered
    by no loop (its winding number 0), as an edge of what they cover is; the kept chains are joined again at their
    crossings, each a corner. */
function union(loops: readonly Loop[]): Loop[] {
  const L = loops.filter(o => o.x.length >= 3);
  const first: number[] = [];
  let S = 0;
  for (const o of L) {
    first.push(S);
    S += o.x.length;
  }
  const loopOf = new Int32Array(S);
  const index = new Int32Array(S);
  L.forEach((o, l) => {
    for (let i = 0; i < o.x.length; i++) {
      loopOf[first[l] + i] = l;
      index[first[l] + i] = i;
    }
  });
  const end = (s: number) => {
    const o = L[loopOf[s]];
    const i = index[s];
    const j = (i + 1) % o.x.length;
    return [o.x[i], o.y[i], o.x[j], o.y[j]] as const;
  };
  /* the segments by the cells their boxes touch */
  const CELL = 2;
  const cellOf = (cx: number, cy: number) => (cx + 65536) * 131072 + cy + 65536;
  const grid = new Map<number, number[]>();
  for (let s = 0; s < S; s++) {
    const [ax, ay, bx, by] = end(s);
    for (
      let cx = Math.floor(Math.min(ax, bx) / CELL);
      cx <= Math.floor(Math.max(ax, bx) / CELL);
      cx++
    )
      for (
        let cy = Math.floor(Math.min(ay, by) / CELL);
        cy <= Math.floor(Math.max(ay, by) / CELL);
        cy++
      ) {
        const key = cellOf(cx, cy);
        const list = grid.get(key);
        if (list) list.push(s);
        else grid.set(key, [s]);
      }
  }
  /* each loop's crossings: where along it (a segment and a share of it), which crossing, and where */
  const cuts: { pos: number; id: number }[][] = L.map(() => []);
  const where: [number, number][] = [];
  for (const [key, list] of grid)
    for (let p = 0; p < list.length; p++)
      for (let q = p + 1; q < list.length; q++) {
        const s = Math.min(list[p], list[q]);
        const t = Math.max(list[p], list[q]);
        const l = loopOf[s];
        const n = L[l].x.length;
        /* segments that share a point */
        if (l === loopOf[t] && (t - s === 1 || (index[s] === 0 && index[t] === n - 1))) continue;
        const [ax, ay, bx, by] = end(s);
        const [cx, cy, dx, dy] = end(t);
        const c = crossing(ax, ay, bx, by, cx, cy, dx, dy);
        if (!c) continue;
        const x = ax + (bx - ax) * c[0];
        const y = ay + (by - ay) * c[0];
        /* found in the cell it lies in alone, of all the cells the two share */
        if (cellOf(Math.floor(x / CELL), Math.floor(y / CELL)) !== key) continue;
        const id = where.length;
        where.push([x, y]);
        cuts[l].push({ pos: index[s] + c[0], id });
        cuts[loopOf[t]].push({ pos: index[t] + c[1], id });
      }
  /* the winding number at a point: the loops' segments a ray to its right crosses, down +1 and up -1 */
  const winding = (px: number, py: number) => {
    let w = 0;
    for (let s = 0; s < S; s++) {
      const [ax, ay, bx, by] = end(s);
      if (ay <= py === by <= py) continue;
      if (ax + ((py - ay) / (by - ay)) * (bx - ax) > px) w += by > ay ? 1 : -1;
    }
    return w;
  };
  /* the tangent a share of the way along a loop's segment */
  const along = (o: Loop, i: number, f: number): [number, number] => {
    const j = (i + 1) % o.x.length;
    return unit(o.lx[i] + (o.ax[j] - o.lx[i]) * f, o.ly[i] + (o.ay[j] - o.ly[i]) * f);
  };
  const chains: Chain[] = [];
  L.forEach((o, l) => {
    const n = o.x.length;
    const cs = cuts[l].sort((a, b) => a.pos - b.pos);
    if (!cs.length) {
      chains.push({ ...o, from: -1, to: -1 });
      return;
    }
    cs.forEach((a, k) => {
      const b = cs[(k + 1) % cs.length];
      const ch: Chain = { ...emptyLoop(), from: a.id, to: b.id };
      const ia = Math.floor(a.pos);
      const ib = Math.floor(b.pos);
      const [lx, ly] = along(o, ia, a.pos - ia);
      put(ch, where[a.id][0], where[a.id][1], lx, ly, lx, ly, true);
      let count = (ib - ia + n) % n;
      if (!count && b.pos <= a.pos) count = n;
      for (let m = 1; m <= count; m++) copy(ch, o, (ia + m) % n);
      const [ex, ey] = along(o, ib, b.pos - ib);
      put(ch, where[b.id][0], where[b.id][1], ex, ey, ex, ey, true);
      chains.push(ch);
    });
  });
  /* a chain kept where what lies just to its left is covered by none, turned round where its right is (a stretch the
     loops go round backward alone, as a side doubled back) */
  const kept: Chain[] = [];
  if (chains.length === 1) kept.push(...chains);
  else
    for (const ch of chains) {
      /* read a hair to the left of up to five of its segments, the most of them deciding, so a segment another lies
         on (two legs' edges a width apart exactly) decides nothing alone */
      const n = ch.x.length;
      const segments = ch.from < 0 ? n : n - 1;
      const votes = new Map<number, number>();
      for (let k = 0; k < Math.min(5, segments); k++) {
        const i = Math.floor(((k + 0.5) * segments) / Math.min(5, segments));
        const j = (i + 1) % n;
        const d = Math.hypot(ch.x[j] - ch.x[i], ch.y[j] - ch.y[i]);
        if (d < 1e-9) continue;
        const e = Math.min(1e-3, d / 100);
        const w = winding(
          (ch.x[i] + ch.x[j]) / 2 + ((ch.y[j] - ch.y[i]) / d) * e,
          (ch.y[i] + ch.y[j]) / 2 - ((ch.x[j] - ch.x[i]) / d) * e
        );
        votes.set(w, (votes.get(w) ?? 0) + 1);
      }
      const w = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (w === 0) kept.push(ch);
      else if (w === -1) kept.push({ ...backward(ch), from: ch.to, to: ch.from });
    }
  /* the kept chains joined at their crossings */
  const out: Loop[] = [];
  const leaving = new Map<number, Chain[]>();
  for (const ch of kept)
    if (ch.from >= 0) {
      const list = leaving.get(ch.from);
      if (list) list.push(ch);
      else leaving.set(ch.from, [ch]);
    } else out.push(ch);
  const used = new Set<Chain>();
  for (const start of kept) {
    if (start.from < 0 || used.has(start)) continue;
    const o = emptyLoop();
    let ch: Chain | undefined = start;
    let arrive: [number, number] | null = null;
    while (ch && !used.has(ch)) {
      used.add(ch);
      const n = ch.x.length;
      const [ax, ay] = arrive ?? [ch.ax[0], ch.ay[0]];
      put(o, ch.x[0], ch.y[0], ax, ay, ch.lx[0], ch.ly[0], true);
      for (let i = 1; i < n - 1; i++) copy(o, ch, i);
      arrive = [ch.ax[n - 1], ch.ay[n - 1]];
      ch = leaving.get(ch.to)?.find(next => !used.has(next));
    }
    if (arrive) {
      o.ax[0] = arrive[0];
      o.ay[0] = arrive[1];
    }
    out.push(o);
  }
  return out;
}

/** Whether a closed subpath's inner loop is a hole's edge: whether most of its points stand half a width `hw` from the
    path, as an inner edge does, rather than nearer it across a loop too small to leave a hole (where the inner side
    turns inside out, and would be a hole the stroke covers). */
function leavesHole(path: Nodes, inner: Loop, hw: number): boolean {
  const n = path.x.length;
  const cell = Math.max(2 * hw, OUTLINE.step);
  const grid = new Map<string, number[]>();
  const key = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const k = key((path.x[i] + path.x[j]) / 2, (path.y[i] + path.y[j]) / 2);
    const list = grid.get(k);
    if (list) list.push(i);
    else grid.set(k, [i]);
  }
  let near = 0;
  for (let q = 0; q < inner.x.length; q++) {
    const x = inner.x[q];
    const y = inner.y[q];
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    let d = Infinity;
    /* a step is a cell long at most, so the middles of a point's nearest steps lie within two cells of it */
    for (let gx = cx - 2; gx <= cx + 2; gx++)
      for (let gy = cy - 2; gy <= cy + 2; gy++)
        for (const i of grid.get(`${gx},${gy}`) ?? []) {
          const j = (i + 1) % n;
          const ex = path.x[j] - path.x[i];
          const ey = path.y[j] - path.y[i];
          const f = Math.min(
            1,
            Math.max(0, ((x - path.x[i]) * ex + (y - path.y[i]) * ey) / (ex * ex + ey * ey || 1))
          );
          d = Math.min(d, Math.hypot(x - path.x[i] - ex * f, y - path.y[i] - ey * f));
        }
    if (d < 0.9 * hw) near++;
  }
  return near * 2 < inner.x.length;
}

/** A subpath's outline as loops, half a width `hw` either way, each covering what lies on its right: an open
    subpath's left side, its end, its right side back and its start; a closed one's left side and its right side back,
    the inner one left out where it leaves no hole. */
function outlineOf(cubics: readonly FigmaCubic[], closed: boolean, hw: number): Loop[] {
  const nodes = nodesOf(cubics, closed);
  const n = nodes.x.length;
  if (n < (closed ? 3 : 2)) return [];
  const left = sideOf(nodes, 1, hw);
  const right = backward(sideOf(nodes, -1, hw));
  if (!closed) {
    /* the butt ends: across the path, from the left side to the right at its end, and back at its start */
    const [ex, ey] = [nodes.ax[n - 1], nodes.ay[n - 1]];
    const [sx, sy] = [nodes.lx[0], nodes.ly[0]];
    const e = left.x.length - 1;
    const s = right.x.length - 1;
    left.corner[0] = left.corner[e] = right.corner[0] = right.corner[s] = true;
    left.lx[e] = right.ax[0] = -ey;
    left.ly[e] = right.ay[0] = ex;
    right.lx[s] = left.ax[0] = sy;
    right.ly[s] = left.ay[0] = -sx;
    const o = emptyLoop();
    for (const side of [left, right]) for (let i = 0; i < side.x.length; i++) copy(o, side, i);
    return [o];
  }
  /* a path running clockwise has its left side outside: the left loop runs clockwise, the right one back the other
     way */
  const [outer, inner] = signedArea(nodes.x, nodes.y) > 0 ? [left, right] : [right, left];
  return leavesHole(nodes, inner, hw) ? [outer, inner] : [outer];
}

/** A loop as a closed path's data: from a corner, each stretch between two fitted whole, split where it strays (a
    fit of fewer cubics than the threads' own pieces of 24 points, a fifth fewer bytes); with none, all of it from its
    first point round to it. */
function loopPath(o: Loop): string {
  const N = o.x.length;
  if (N < 3) return "";
  const p = OUTLINE_FIT.places;
  const first = Math.max(0, o.corner.indexOf(true));
  const pen = { x: Number(svgNumber(o.x[first], p)), y: Number(svgNumber(o.y[first], p)) };
  const parts = [`M${svgNumber(pen.x, p)} ${svgNumber(pen.y, p)}`];
  let st = { x: [o.x[first]], y: [o.y[first]], tx: [o.lx[first]], ty: [o.ly[first]] };
  for (let k = 1; k <= N; k++) {
    const i = (first + k) % N;
    const end = o.corner[i] || k === N;
    st.x.push(o.x[i]);
    st.y.push(o.y[i]);
    st.tx.push(end ? o.ax[i] : o.lx[i]);
    st.ty.push(end ? o.ay[i] : o.ly[i]);
    if (!end) continue;
    const n = st.x.length - 1;
    if (n > 1 || Math.hypot(st.x[1] - st.x[0], st.y[1] - st.y[0]) > 1e-6)
      fitCubics(st.x, st.y, st.tx, st.ty, 0, n, OUTLINE_FIT, pen, parts);
    st = { x: [o.x[i]], y: [o.y[i]], tx: [o.lx[i]], ty: [o.ly[i]] };
  }
  parts.push("z");
  return parts.join(" ");
}

/** A thread's path data (stringsThreads) as its outline's loops, half a width `hw` either way, as cubics. */
export const figmaStringsOutline = (d: string, hw: number): FigmaCubic[][] =>
  figmaPathLoops(
    union(figmaPathRuns(d).flatMap(({ cubics, closed }) => outlineOf(cubics, closed, hw)))
      .map(loopPath)
      .join(" ")
  );

/** The strings' layers as Figma's scene (figmaScene), and the vector networks they name. */
export function figmaStringsNodes(view: FigmaStringsView): {
  nodes: FigmaNode[];
  blobs: Uint8Array[];
} {
  const { width: W, height: H } = view;
  const m = stringsScene(
    view.palette,
    { angle: view.angle, shape: view.shape, bg: view.bg },
    { width: W, height: H }
  );
  const outlines = [...stringsThreads(m)]
    .sort((a, b) => a[0] - b[0])
    .map(([k, d]) => ({ k, loops: figmaStringsOutline(d, m.hw) }))
    .filter(o => o.loops.length);
  const { nodes, add, group } = figmaLayers();
  const blobs: Uint8Array[] = [];
  const top = add("FRAME", view.name, FIGMA_PAGE, 0, W, H, 0, 0, {
    fillPaints: [],
    frameMaskDisabled: false
  });
  const into = figmaFinish(
    { add, group },
    top,
    { width: W, height: H },
    view.finish,
    view.underlay
  );
  /* the ground at its alpha, none where it is clear */
  const grounded = m.alpha > 0;
  if (grounded)
    add("RECTANGLE", "ground", into.parent, into.index, W, H, 0, 0, {
      fillPaints: [figmaSolid(m.groundHex, m.alpha)]
    });
  if (!outlines.length) return { nodes: figmaScene(nodes), blobs };
  /* the group fits its threads' loops, which it places its threads from */
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { loops } of outlines)
    for (const loop of loops)
      for (const c of loop)
        for (const [x, y] of c) {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
  const threads = group(
    "strings",
    into.parent,
    into.index + (grounded ? 1 : 0),
    x0,
    y0,
    x1 - x0,
    y1 - y0
  );
  outlines.forEach(({ k, loops }, i) => {
    const moved = loops.map(loop =>
      loop.map(c => c.map(([x, y]) => [x - x0, y - y0] as const) as unknown as FigmaCubic)
    );
    figmaVector(add, blobs, `thread ${k}`, threads, i, moved, {
      fillPaints: [figmaSolid(stringsHex(m, k))]
    });
  });
  return { nodes: figmaScene(nodes), blobs };
}

/** The clipboard's text/html of the strings, which a paste into Figma reads as its layers. */
export function figmaStringsHtml(
  view: FigmaStringsView,
  pasteID = Math.floor(Math.random() * 0x7fffffff)
): string {
  const { nodes, blobs } = figmaStringsNodes(view);
  return figmaPasteHtml(nodes, pasteID, "grabientPasteStrings001", blobs);
}
