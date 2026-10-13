/* The color solid's scene, pure: the palette sampled for it, and the marks that draw it on the live canvas or into a
   figure. Height is lightness, the floor is hue around and chroma out. The pole is the gray ramp; the floor carries the
   hue wheel at the palette's own chroma ceiling with rings on round values inside it; the path's shadow is its
   footprint; around it the gamut the palette is read in, its edges faint and its solid (every face in its own color)
   parked in the top right corner or home in its wireframe as a cutaway. `u` scales every pixel constant for a figure;
   `into` confines the scene to a panel. The scene is an axis picture and reads left to right in every language. The
   live scene hands back the path as drawn and the parking bay, so a pointer is judged against the picture on screen. */
import {
  fitChroma,
  lchToSrgb,
  p3ToLch,
  srgbToLch,
  type Triple,
  toHex
} from "@grabient/engine/color.ts";
import { sampleLCH } from "@grabient/engine/curve.ts";
import { clamp01, DEG } from "@grabient/engine/math.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { hueInk } from "@grabient/engine/plot.ts";
import { dir, t } from "./i18n.ts";
import type { Mark, Rect } from "./marks.ts";

export type { Rect };
export interface Cam {
  yaw: number;
  pitch: number;
}
export const CAM0: Cam = { yaw: -0.65, pitch: 0.5 };
type P3 = [number, number, number];
type Gamut = "srgb" | "p3";
export interface SolidSample {
  t: number;
  out: Triple;
  ask: number;
  hex: string;
}
/** The scene's samples: the path, the stops, the keyframes, and how they are drawn. */
export interface SolidFrame {
  cont: SolidSample[];
  stops: SolidSample[];
  keys: SolidSample[];
  stepped: boolean;
  wide: boolean;
  selection: readonly number[];
}
/** The theme's colors: read off the page by the live scene, off the tokens by a figure. */
export interface SolidInk {
  ink: string;
  ink3: string;
  edge: string;
  paper: string;
}
export interface SceneOpts {
  /** every pixel constant scaled: 1 live, more for a figure */
  u?: number;
  /** the panel of the surface the scene stands in; the whole surface by default */
  into?: Rect;
  /** 0 parked, 1 home; null draws no colored solid */
  hullK?: number | null;
  /** the gamut's wireframe, drawn only as it fits the frame; a figure's orbit leaves it out */
  hull?: boolean;
  /** the size of the scene's words against `u` */
  labelU?: number;
  /** the path over a figure's casing */
  outline?: boolean;
}
/** What a pointer reads against, as the scene drew it. */
export interface Scene {
  f: SolidFrame;
  pts: P3[];
  park: Rect | null;
  at: (s: SolidSample) => P3;
  u: number;
  frame: Rect;
  pole: [P3, P3] | null;
  floor: {
    ox: number;
    oy: number;
    scale: number;
    cp: number;
    sp: number;
    cy: number;
    sy: number;
    ab: number;
    ringC: number;
  } | null;
}
export interface SceneResult {
  marks: Mark[];
  ringC: number;
  /** the path on the surface, one point per sample of the frame's `cont` */
  path: [number, number][];
  /** where resting the pointer flies the solid home */
  bay: Rect | null;
  scene: Scene;
}

/** How near the path a mouse must be to read it or press it, in CSS px; a finger has more room. */
export const PATH_REACH = 9;
export const PATH_REACH_TOUCH = 16;
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const FACE_N = 8;

/** The point of a drawn path nearest `p`: its place along the gradient, where it is, and how far away. */
export function nearestOnPath(
  path: readonly [number, number][],
  ts: readonly number[],
  p: [number, number]
): { t: number; x: number; y: number; d: number } | null {
  if (!path.length) return null;
  if (path.length === 1)
    return {
      t: ts[0],
      x: path[0][0],
      y: path[0][1],
      d: Math.hypot(p[0] - path[0][0], p[1] - path[0][1])
    };
  let best = { t: 0, x: 0, y: 0, d: Number.POSITIVE_INFINITY };
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1];
    const [bx, by] = path[i];
    const vx = bx - ax;
    const vy = by - ay;
    const len2 = vx * vx + vy * vy;
    const k = len2 > 1e-9 ? clamp01(((p[0] - ax) * vx + (p[1] - ay) * vy) / len2) : 0;
    const x = ax + vx * k;
    const y = ay + vy * k;
    const d = Math.hypot(p[0] - x, p[1] - y);
    if (d < best.d) best = { t: ts[i - 1] + (ts[i] - ts[i - 1]) * k, x, y, d };
  }
  return best;
}

const sampleAt = (P: Palette, t: number, wide: boolean): SolidSample => {
  const ask = sampleLCH(P, t);
  const srgb = lchToSrgb(ask[0], ask[1], ask[2]);
  const out: Triple = wide
    ? [clamp01(ask[0]), fitChroma(clamp01(ask[0]), ask[1], ask[2], true), ask[2]]
    : srgbToLch(srgb);
  return { t, out, ask: ask[1], hex: toHex(srgb) };
};
/** The scene's samples: `n` along the path, the stops, and the keyframes. */
export function solidFrame(
  P: Palette,
  steps: number,
  stepped: boolean,
  wide: boolean,
  selection: readonly number[] = [],
  n = 96
): SolidFrame {
  const cont = Array.from({ length: n }, (_, i) => sampleAt(P, i / (n - 1), wide));
  const m = Math.max(2, steps);
  const stops = Array.from({ length: m }, (_, i) => sampleAt(P, i / (m - 1), wide));
  const K = P.anchors.length;
  const keys = P.anchors.map((_, i) => sampleAt(P, K === 1 ? 0.5 : i / (K - 1), wide));
  return { cont, stops, keys, stepped, wide, selection };
}

const toLch = (g: Gamut, v: Triple): P3 => (g === "p3" ? p3ToLch(v) : srgbToLch(v));
/* the gamut's twelve edges, sampled, and the most chroma on them; once per gamut */
const EDGES: Partial<Record<Gamut, { edges: P3[][]; maxC: number }>> = {};
function cubeEdges(g: Gamut) {
  const known = EDGES[g];
  if (known) return known;
  const pairs: [number[], number[]][] = [];
  for (const u of [0, 1])
    for (const v of [0, 1])
      pairs.push(
        [
          [0, u, v],
          [1, u, v]
        ],
        [
          [u, 0, v],
          [u, 1, v]
        ],
        [
          [u, v, 0],
          [u, v, 1]
        ]
      );
  let maxC = 0;
  const edges = pairs.map(([A, B]) =>
    Array.from({ length: 17 }, (_, i) => {
      const f = i / 16;
      const p = toLch(g, [0, 1, 2].map(k => A[k] + (B[k] - A[k]) * f) as Triple);
      maxC = Math.max(maxC, p[1]);
      return p;
    })
  );
  EDGES[g] = { edges, maxC };
  return EDGES[g];
}
/* the cube's faces in FACE_N by FACE_N quads, each in its own color; once per gamut */
interface Face {
  q: P3[];
  fill: string;
  flip: boolean;
}
const FACES: Partial<Record<Gamut, Face[]>> = {};
function cubeFaces(g: Gamut): Face[] {
  const known = FACES[g];
  if (known) return known;
  const out: Face[] = [];
  const N = FACE_N;
  const face = (at: (a: number, b: number) => Triple, flip: boolean) => {
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const mid = at((i + 0.5) / N, (j + 0.5) / N);
        out.push({
          q: [
            [i, j],
            [i + 1, j],
            [i + 1, j + 1],
            [i, j + 1]
          ].map(([a, b]) => toLch(g, at(a / N, b / N))),
          fill:
            g === "p3"
              ? `color(display-p3 ${mid.map(v => String(+v.toFixed(4))).join(" ")})`
              : `rgb(${mid.map(v => Math.round(v * 255)).join(",")})`,
          flip
        });
      }
  };
  for (const w of [0, 1]) {
    face((a, b) => [w, a, b], w === 0);
    face((a, b) => [a, w, b], w === 1);
    face((a, b) => [a, b, w], w === 0);
  }
  FACES[g] = out;
  return out;
}
const grayOf = (L: number) => toHex(lchToSrgb(L, 0, 0));
const flat = (pts: readonly (readonly number[])[]) => pts.flatMap(p => [p[0], p[1]]);
/* which way round a quad winds on screen, by its doubled area */
const wound = (ps: readonly P3[]) => {
  let a2 = 0;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    const q = ps[(i + 1) % ps.length];
    a2 += p[0] * q[1] - q[0] * p[1];
  }
  return a2;
};
/* the quads facing the camera, by their winding on screen, its sign set by which side is nearer on the whole */
function frontSide(quads: readonly { area: number; d: number }[]): (area: number) => boolean {
  let posD = 0;
  let posN = 0;
  let negD = 0;
  let negN = 0;
  for (const q of quads) {
    if (q.area > 1e-6) {
      posD += q.d;
      posN++;
    } else if (q.area < -1e-6) {
      negD += q.d;
      negN++;
    }
  }
  const positive =
    (posN ? posD / posN : Number.NEGATIVE_INFINITY) >
    (negN ? negD / negN : Number.NEGATIVE_INFINITY);
  return area => (positive ? area > 1e-6 : area < -1e-6);
}

/* A figure's casing under a path: a band of paper in a hairline of ink, so both ends of any palette read on either
   paper. Each is one shape, the union of what a stroke of every segment covers: a bar along each segment and a disc at
   each point as wide as the wider segment there, all wound one way. `half(i)` is segment i's half width. */
function casing(
  pts: readonly P3[],
  half: (i: number) => number,
  K: SolidInk,
  u: number,
  layer?: string
): Mark[] {
  const n = pts.length;
  return (
    [
      [K.ink, 1.8, 0.7],
      [K.paper, 1.1, 1]
    ] as const
  ).map(([fill, extra, alpha]) => {
    const e = extra * u;
    const runs: { points: number[]; closed: boolean }[] = [];
    for (let i = 1; i < n; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 1e-9) continue;
      const h = (half(i) + e) / len;
      const nx = (by - ay) * h;
      const ny = (ax - bx) * h;
      runs.push({
        points: [ax + nx, ay + ny, bx + nx, by + ny, bx - nx, by - ny, ax - nx, ay - ny],
        closed: true
      });
    }
    const circles: number[] = [];
    for (let i = 0; i < n; i++) {
      const r = Math.max(i > 0 ? half(i) : 0, i < n - 1 ? half(i + 1) : 0) + e;
      circles.push(pts[i][0], pts[i][1], r);
    }
    return { runs, circles, fill, alpha, layer };
  });
}

/** The live scene, or a figure's orbit: the marks, the path as drawn and the parking bay. */
export function solidScene(
  f: SolidFrame,
  cam: Cam,
  K: SolidInk,
  surfaceW: number,
  surfaceH: number,
  o: SceneOpts = {}
): SceneResult {
  const u = o.u ?? 1;
  const panel: Rect = o.into ?? { x: 0, y: 0, w: surfaceW, h: surfaceH };
  const { x: ox0, y: oy0, w: W, h: H } = panel;
  const gamut: Gamut = f.wide ? "p3" : "srgb";
  const { cont, stops, keys } = f;
  const n = cont.length;
  let maxC = 0.04;
  for (const s of cont) maxC = Math.max(maxC, s.out[1], s.ask);
  const ringC = Math.min(0.4, Math.max(0.05, maxC * 1.06));
  const ab = 0.42 / ringC;
  const world = (L: number, C: number, Hd: number): P3 => [
    C * Math.cos(Hd * DEG) * ab,
    L - 0.5,
    C * Math.sin(Hd * DEG) * ab
  ];
  const hullK = o.hullK === undefined ? 0 : o.hullK;
  const k = clamp01(hullK ?? 0);
  const scaffold = 1 - k;
  const showScaffold = scaffold > 0.01;
  const { edges: cube, maxC: cubeMaxC } = cubeEdges(gamut);
  const cubeFit = clamp01((0.42 * 1.55 - cubeMaxC * ab) / (0.42 * 0.2));
  /* the fit: the rulers and the path, and the gamut at the weight it is drawn at, bounded by the horizontal radius so
     orbiting never rescales */
  const subject: P3[] = [world(0, 0, 0), world(1, 0, 0)];
  for (let h = 0; h < 360; h += 15) subject.push(world(0, ringC, h));
  for (const s of cont) {
    subject.push(world(s.out[0], s.out[1], s.out[2]));
    if (s.ask - s.out[1] > 0.004) subject.push(world(s.out[0], s.ask, s.out[2]));
  }
  if (cubeFit > 0.01)
    for (const e of cube)
      for (const [L, C, Hd] of e) {
        const w = world(L, C, Hd);
        subject.push([w[0] * cubeFit, w[1], w[2] * cubeFit]);
      }
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const MX = 16 * u;
  const MT = 26 * u;
  const MB = 24 * u;
  let halfX = 1e-6;
  let top = Number.NEGATIVE_INFINITY;
  let bot = Number.POSITIVE_INFINITY;
  for (const p of subject) {
    const r = Math.hypot(p[0], p[2]);
    const a = p[1] * cp;
    halfX = Math.max(halfX, r);
    top = Math.max(top, a + r * sp);
    bot = Math.min(bot, a - r * sp);
  }
  const scale = Math.min((W / 2 - MX) / halfX, (H - MT - MB) / Math.max(1e-6, top - bot));
  const ox = ox0 + W / 2;
  const oy = oy0 + (MT + H - MB) / 2 + ((top + bot) / 2) * scale;
  const proj = (p: P3): P3 => {
    const x = p[0] * cy + p[2] * sy;
    const z = -p[0] * sy + p[2] * cy;
    const y = p[1] * cp - z * sp;
    const d = p[1] * sp + z * cp;
    return [ox + x * scale, oy - y * scale, d];
  };
  const marks: Mark[] = [];
  const line = (pts: P3[], stroke: string, width = 1, alpha = 1, dash?: number[], clip?: Rect) => {
    marks.push({
      runs: [{ points: flat(pts.map(proj)) }],
      stroke,
      width,
      alpha,
      dash,
      round: true,
      clip
    });
  };
  const labels: Mark[] = [];
  const lu = o.labelU ?? u;
  const label = (value: string, x: number, y: number, fill = K.ink3, alpha = 1) => {
    labels.push({
      text: { value, x, y, size: 10 * lu, family: MONO, halo: K.paper, haloWidth: 2.5 * lu },
      fill,
      alpha
    });
  };

  /* the colored solid: parked in the corner, or home in its wireframe */
  const parkSide = Math.max(66, Math.min(104, Math.min(W, H) * 0.3));
  const parkM = 10 * u;
  const park: Rect = { x: ox0 + W - parkM - parkSide, y: oy0 + parkM, w: parkSide, h: parkSide };
  let ghost: Mark[] = [];
  if (hullK !== null) {
    const raw = cubeFaces(gamut).map(fq => {
      const ps = fq.q.map(([L, C, Hd]) => proj(world(L, C, Hd)));
      const a2 = wound(ps);
      return {
        ps,
        fill: fq.fill,
        d: (ps[0][2] + ps[1][2] + ps[2][2] + ps[3][2]) / 4,
        area: (fq.flip ? -a2 : a2) / 2,
        front: false
      };
    });
    const faces = frontSide(raw);
    for (const fc of raw) fc.front = faces(fc.area);
    const sorted = [...raw].sort((a, b) => a.d - b.d);
    let lo0 = Number.POSITIVE_INFINITY;
    let hi0 = Number.NEGATIVE_INFINITY;
    let lo1 = Number.POSITIVE_INFINITY;
    let hi1 = Number.NEGATIVE_INFINITY;
    for (const fc of sorted)
      for (const q of fc.ps) {
        lo0 = Math.min(lo0, q[0]);
        hi0 = Math.max(hi0, q[0]);
        lo1 = Math.min(lo1, q[1]);
        hi1 = Math.max(hi1, q[1]);
      }
    const cx = (lo0 + hi0) / 2;
    const cyy = (lo1 + hi1) / 2;
    const parkScale = Math.min(
      parkSide / Math.max(1, hi0 - lo0),
      parkSide / Math.max(1, hi1 - lo1)
    );
    const sc = parkScale + (1 - parkScale) * k;
    const tx = (park.x + parkSide / 2) * (1 - k) + cx * k;
    const ty = (park.y + parkSide / 2) * (1 - k) + cyy * k;
    const at = (p: P3): [number, number] => [tx + (p[0] - cx) * sc, ty + (p[1] - cyy) * sc];
    /* a quad on screen, bled out from its middle so no seam shows between neighbors */
    const quad = (ps: readonly P3[], bleed: number) => {
      const q = ps.map(at);
      if (bleed) {
        const mx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4;
        const my = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
        for (const p of q) {
          const len = Math.hypot(p[0] - mx, p[1] - my) || 1;
          p[0] += ((p[0] - mx) / len) * bleed;
          p[1] += ((p[1] - my) / len) * bleed;
        }
      }
      return flat(q);
    };
    const near = 1 - k;
    for (const fc of sorted) {
      const alpha = fc.front ? near : 1;
      if (alpha < 0.01) continue;
      marks.push({
        runs: [{ points: quad(fc.ps, alpha > 0.99 ? 0.5 : 0), closed: true }],
        fill: fc.fill,
        alpha,
        clip: panel
      });
    }
    /* home, its back edges in ink: a quad on an edge of the cube has its neighbor on the next face, which draws their
       shared edge too when it also faces away, so each edge goes in once */
    if (k > 0.01) {
      const N = FACE_N;
      const neighbor = (fi: number, i: number, j: number) =>
        i < 0 || j < 0 || i >= N || j >= N ? null : raw[fi * N * N + i * N + j];
      const STEP: [number, number][] = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0]
      ];
      const drawn = new Set<string>();
      const runs: { points: number[] }[] = [];
      raw.forEach((fc, idx) => {
        if (fc.front) return;
        const fi = Math.floor(idx / (N * N));
        const r2 = idx % (N * N);
        const i = Math.floor(r2 / N);
        const j = r2 % N;
        for (let e = 0; e < 4; e++) {
          const other = neighbor(fi, i + STEP[e][0], j + STEP[e][1]);
          if (other && !other.front) continue;
          const [ax, ay] = at(fc.ps[e]);
          const [bx, by] = at(fc.ps[(e + 1) % 4]);
          if (!other) {
            const p = `${ax} ${ay}`;
            const q = `${bx} ${by}`;
            const key = p < q ? `${p} ${q}` : `${q} ${p}`;
            if (drawn.has(key)) continue;
            drawn.add(key);
          }
          runs.push({ points: [ax, ay, bx, by] });
        }
      });
      marks.push({
        runs,
        stroke: K.ink3,
        width: (0.9 + 0.9 * k) * u,
        alpha: 0.75 * k,
        round: true,
        clip: panel
      });
    }
    const ghostK = k * 0.34;
    if (ghostK > 0.01)
      ghost = sorted
        .filter(fc => fc.front)
        .map(fc => ({
          runs: [{ points: quad(fc.ps, 0), closed: true }],
          stroke: fc.fill,
          width: (0.35 + 1.25 * k) * u,
          alpha: ghostK,
          clip: panel
        }));
  }

  /* the rulers, fading as the solid comes home */
  const ring = (C: number, m = 60): P3[] =>
    Array.from({ length: m + 1 }, (_, i) => world(0, C, (360 * i) / m));
  const ringK = (c: number) => clamp01((ringC - c) / 0.012);
  if (showScaffold) {
    for (let c = 0.05; c < ringC - 1e-6; c += 0.05)
      line(ring(c), K.edge, u, 0.9 * ringK(c) * scaffold);
    if (0.05 * ab * scale * Math.max(0.2, sp) >= 34 * u)
      for (let c = 0.05; c < ringC - 1e-6; c += 0.05) {
        let fr: P3 = [0, 0, Number.NEGATIVE_INFINITY];
        for (let h = 0; h < 360; h += 10) {
          const q = proj(world(0, c, h));
          if (q[2] > fr[2]) fr = q;
        }
        label(c.toFixed(2), fr[0], fr[1] + 9 * u, K.ink3, 0.8 * ringK(c) * scaffold);
      }
    for (let i = 0; i < 72; i++) {
      const h0 = (360 * i) / 72;
      const a = proj(world(0, ringC, h0));
      const b = proj(world(0, ringC, (360 * (i + 1)) / 72));
      marks.push({
        runs: [{ points: [a[0], a[1], b[0], b[1]] }],
        stroke: hueInk(h0),
        width: 2.5 * u,
        alpha: 0.85 * scaffold,
        round: true
      });
    }
    let front: P3 = [0, 0, Number.NEGATIVE_INFINITY];
    for (let h = 0; h < 360; h += 5) {
      const q = proj(world(0, ringC, h));
      if (q[2] > front[2]) front = q;
    }
    label(`C ${ringC.toFixed(3)}`, front[0], front[1] + 10 * u, K.ink3, scaffold);
    const pTop = proj(world(1, 0, 0));
    const pBot = proj(world(0, 0, 0));
    line([world(0, 0, 0), world(1, 0, 0)], K.edge, 6 * u, scaffold);
    for (let i = 0; i < 24; i++)
      line(
        [world(i / 24, 0, 0), world((i + 1) / 24, 0, 0)],
        grayOf((i + 0.5) / 24),
        4 * u,
        scaffold
      );
    const lx = (x: number) => Math.min(Math.max(x, ox0 + 34 * u), ox0 + W - 34 * u);
    label(t("light · L 1"), lx(pTop[0]), pTop[1] - 9 * u, K.ink3, scaffold);
    label(t("dark · L 0"), lx(pBot[0]), pBot[1] + 10 * u, K.ink3, scaffold);
  }
  if (o.hull !== false && cubeFit > 0.01)
    for (const e of cube)
      line(
        e.map(([L, C, Hd]) => world(L, C, Hd)),
        K.edge,
        u,
        cubeFit,
        undefined,
        panel
      );
  const shadowK = clamp01((1.25 - cam.pitch) / 0.35) * scaffold;
  if (shadowK > 0.01)
    line(
      cont.map(s => world(0, s.out[1], s.out[2])),
      K.ink,
      2.5 * u,
      0.22 * shadowK
    );
  if (f.stepped && shadowK > 0.01)
    for (const s of stops)
      line(
        [world(s.out[0], s.out[1], s.out[2]), world(0, s.out[1], s.out[2])],
        K.ink3,
        u,
        0.45 * shadowK,
        [2 * u, 3 * u]
      );
  /* where the screen cannot show the chroma asked, the ask as a dashed run */
  let run: P3[] = [];
  const ask = () => {
    if (run.length > 1) line(run, K.ink3, 1.4 * u, 0.85, [3.5 * u, 2.5 * u]);
    run = [];
  };
  for (const s of cont) {
    if (s.ask - s.out[1] > 0.004) run.push(world(s.out[0], s.ask, s.out[2]));
    else ask();
  }
  ask();
  /* the path and the stops, depth-sorted together */
  const pts = cont.map(s => proj(world(s.out[0], s.out[1], s.out[2])));
  let dMin = Number.POSITIVE_INFINITY;
  let dMax = Number.NEGATIVE_INFINITY;
  for (const p of pts) {
    dMin = Math.min(dMin, p[2]);
    dMax = Math.max(dMax, p[2]);
  }
  const nearness = (d: number) => (dMax > dMin ? (d - dMin) / (dMax - dMin) : 1);
  if (o.outline)
    marks.push(
      ...casing(pts, i => ((3.6 + 2.4 * nearness((pts[i - 1][2] + pts[i][2]) / 2)) * u) / 2, K, u)
    );
  const items: { d: number; mark: Mark }[] = [];
  for (let i = 1; i < n; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const d = (a[2] + b[2]) / 2;
    items.push({
      d,
      mark: {
        runs: [{ points: [a[0], a[1], b[0], b[1]] }],
        stroke: cont[i].hex,
        width: (3.6 + 2.4 * nearness(d)) * u,
        alpha: 0.72 + 0.28 * nearness(d),
        round: true
      }
    });
  }
  if (f.stepped)
    for (const s of stops) {
      const q = proj(world(s.out[0], s.out[1], s.out[2]));
      items.push({
        d: q[2] + 0.012,
        mark: { circles: [q[0], q[1], 3.2 * u], fill: s.hex, stroke: K.ink3, width: u }
      });
    }
  items.sort((a, b) => a.d - b.d);
  for (const it of items) marks.push(it.mark);
  marks.push(...ghost);
  for (const i of f.selection) {
    const s = keys[i];
    if (!s) continue;
    const q = proj(world(s.out[0], s.out[1], s.out[2]));
    marks.push({ circles: [q[0], q[1], 5.5 * u], fill: s.hex, stroke: K.ink, width: 2 * u });
  }
  const p0 = pts[0];
  const p1 = pts[n - 1];
  marks.push({ circles: [p0[0], p0[1], 1.8 * u, p1[0], p1[1], 1.8 * u], fill: K.ink });
  const away = (p: readonly number[]): [number, number] => {
    const vx = p[0] - ox;
    const vy = p[1] - oy;
    const m = Math.hypot(vx, vy) || 1;
    return [p[0] + (vx / m) * 11 * u, p[1] + (vy / m) * 11 * u + 3 * u];
  };
  if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < 16 * u) {
    const [x, y] = away([(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]);
    label("t0 · t1", x, y, K.ink);
  } else {
    const [ax, ay] = away(p0);
    const [bx, by] = away(p1);
    label("t0", ax, ay, K.ink);
    label("t1", bx, by, K.ink);
  }
  marks.push(...labels);
  const scene: Scene = {
    f,
    pts,
    park: hullK !== null ? park : null,
    at: s => proj(world(s.out[0], s.out[1], s.out[2])),
    u,
    frame: panel,
    pole: showScaffold ? [proj(world(0, 0, 0)), proj(world(1, 0, 0))] : null,
    floor: showScaffold && sp > 0.05 ? { ox, oy, scale, cp, sp, cy, sy, ab, ringC } : null
  };
  return {
    marks,
    ringC,
    path: pts.map(q => [q[0], q[1]]),
    bay: hullK !== null ? { x: park.x - 4, y: park.y - 4, w: park.w + 8, h: park.h + 8 } : null,
    scene
  };
}

/** The pointer over a live scene, drawn over it: the bay first, then a stop, a point of the path, the pole, the floor.
    `pick`: the keyframe a press would hold is drawn as the strips draw one. Answers whether the pointer is on the bay,
    and the place along the palette it reads. */
export function drawPointer(
  ctx: CanvasRenderingContext2D,
  sc: Scene,
  K: SolidInk,
  o: { hover: [number, number]; kept?: boolean; pick?: boolean }
): { hullHot: boolean; hoverT: number | null } {
  const { f, pts, park, u } = sc;
  const { cont, stops, keys } = f;
  const n = cont.length;
  const [hx, hy] = o.hover;
  let hoverT: number | null = null;
  let hullHot = false;
  const lchOf = (s: SolidSample) =>
    `L ${s.out[0].toFixed(2)} · C ${s.out[1].toFixed(3)} · H ${s.out[1] >= 0.01 ? `${s.out[2].toFixed(0)}°` : "—"}`;
  /* `words` is a sentence in the reader's language; every other reading is notation */
  let hit: { x: number; y: number; text: string; mark: boolean; words?: boolean } | null = null;
  if (
    park &&
    hx >= park.x - 4 &&
    hx <= park.x + park.w + 4 &&
    hy >= park.y - 4 &&
    hy <= park.y + park.h + 4
  ) {
    hullHot = true;
    const space = f.wide ? "Display P3" : "sRGB";
    hit = {
      x: park.x + park.w / 2,
      y: park.y + park.h,
      text: o.kept
        ? t("{space} color space. Click to hide.", { space })
        : t("{space} color space. Click to keep.", { space }),
      mark: false,
      words: true
    };
  }
  if (!hit && f.stepped) {
    let bd = 81;
    for (const s of stops) {
      const q = sc.at(s);
      const d2 = (q[0] - hx) ** 2 + (q[1] - hy) ** 2;
      if (d2 <= bd) {
        bd = d2;
        hit = { x: q[0], y: q[1], text: `${s.hex} · ${lchOf(s)}`, mark: true };
        hoverT = s.t;
      }
    }
  }
  /* the path by its segments, so a path seen at a steep angle reads without gaps; the reading is the nearer sample */
  if (!hit) {
    const on = nearestOnPath(
      pts.map(q => [q[0], q[1]]),
      cont.map(c => c.t),
      [hx, hy]
    );
    if (on && on.d <= PATH_REACH) {
      const i = Math.round(on.t * (n - 1));
      hit = {
        x: pts[i][0],
        y: pts[i][1],
        text: `t ${cont[i].t.toFixed(2)} · ${lchOf(cont[i])} · ${cont[i].hex}`,
        mark: true
      };
      hoverT = cont[i].t;
    }
  }
  if (!hit && sc.pole) {
    const [bb, bt] = sc.pole;
    const vx = bt[0] - bb[0];
    const vy = bt[1] - bb[1];
    const len2 = vx * vx + vy * vy;
    if (len2 > 1e-6) {
      const along = clamp01(((hx - bb[0]) * vx + (hy - bb[1]) * vy) / len2);
      const qx = bb[0] + vx * along;
      const qy = bb[1] + vy * along;
      if ((qx - hx) ** 2 + (qy - hy) ** 2 <= 64)
        hit = { x: qx, y: qy, text: `L ${along.toFixed(2)}`, mark: true };
    }
  }
  if (!hit && sc.floor) {
    const { ox, oy, scale, cp, sp, cy, sy, ab, ringC } = sc.floor;
    const xs = (hx - ox) / scale;
    const ys = (oy - hy) / scale;
    const zt = (-0.5 * cp - ys) / sp;
    const wx = xs * cy - zt * sy;
    const wz = xs * sy + zt * cy;
    const C = Math.hypot(wx, wz) / ab;
    const Hd = (Math.atan2(wz, wx) / DEG + 360) % 360;
    if (C <= ringC * 1.02)
      hit = { x: hx, y: hy, text: `C ${C.toFixed(3)} · H ${Hd.toFixed(0)}°`, mark: false };
  }
  if (o.pick && hoverT != null && keys.length) {
    const i = Math.round(hoverT * (keys.length - 1));
    const s = keys[i];
    if (s && !f.selection.includes(i)) {
      const q = sc.at(s);
      ctx.beginPath();
      ctx.arc(q[0], q[1], 4.5 * u, 0, Math.PI * 2);
      ctx.fillStyle = K.paper;
      ctx.fill();
      ctx.strokeStyle = K.ink;
      ctx.lineWidth = 1.5 * u;
      ctx.stroke();
    }
  }
  if (hit) {
    if (hit.mark) {
      ctx.strokeStyle = K.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(hit.x, hit.y, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.font = `10px ${MONO}`;
    const tw = ctx.measureText(hit.text).width + 14;
    const th = 18;
    const { x: x0, y: y0, w: W } = sc.frame;
    const bx = Math.min(Math.max(hit.x - tw / 2, x0 + 4), x0 + W - tw - 4);
    const by = Math.max(y0 + 4, (hit.mark ? hit.y : hy) - 13 - th);
    ctx.fillStyle = K.ink;
    ctx.beginPath();
    ctx.roundRect(bx, by, tw, th, 4);
    ctx.fill();
    ctx.fillStyle = K.paper;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    /* the sentence runs the reader's way inside its box, which stays where it is */
    const was = ctx.direction;
    if (hit.words) ctx.direction = dir();
    ctx.fillText(hit.text, bx + 7, by + th / 2 + 0.5);
    ctx.direction = was;
  }
  return { hullHot, hoverT };
}

/* A figure's solid: the palette inside the gamut, at its true proportions, the RGB cube standing on its black corner.
   The half facing the camera is cut away to its edges, drawn over the path; the far half is a wall in its own colors
   mixed toward the paper so it stays behind the palette. The gray axis runs up the middle, and the path is the one
   solid thing, cased so both its ends read on either paper. Its parts are named layers: wall, path, grid, edges. */
const WALL_MIX = 0.45;
interface Cell {
  g: Triple[];
  lch: P3[];
  mid: Triple;
  flip: boolean;
}
type Put = (a: number, b: number) => Triple;
/* the cube's six faces on an N-grid: where a face puts its two coordinates, and whether it winds the other way */
const FACE_PUTS: [(N: number) => Put, boolean][] = [0, 1].flatMap(side => [
  [
    (N: number): Put =>
      (a, b) => [side * N, a, b],
    side === 0
  ],
  [
    (N: number): Put =>
      (a, b) => [a, side * N, b],
    side === 1
  ],
  [
    (N: number): Put =>
      (a, b) => [a, b, side * N],
    side === 0
  ]
]) as [(N: number) => Put, boolean][];
const CELLS = new Map<string, Cell[]>();
function cubeCells(gm: Gamut, N: number): Cell[] {
  const known = CELLS.get(gm + N);
  if (known) return known;
  const out: Cell[] = [];
  const seen = new Map<string, P3>();
  const lchAt = (g: Triple) => {
    const key = g.join();
    let p = seen.get(key);
    if (!p) {
      p = toLch(gm, g.map(v => v / N) as Triple);
      seen.set(key, p);
    }
    return p;
  };
  for (const [putOf, flip] of FACE_PUTS) {
    const put = putOf(N);
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const g = [put(i, j), put(i + 1, j), put(i + 1, j + 1), put(i, j + 1)];
        out.push({
          g,
          lch: g.map(lchAt),
          mid: put(i + 0.5, j + 0.5).map(v => v / N) as Triple,
          flip
        });
      }
  }
  CELLS.set(gm + N, out);
  return out;
}
const rgbOf = (hex: string): number[] => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  return m ? [0, 2, 4].map(k => Number.parseInt(m[1].slice(k, k + 2), 16) / 255) : [0.5, 0.5, 0.5];
};
/* a color of the cube as a figure writes it, `mix` of the way from the paper to it */
const cubeColor = (gm: Gamut, rgb: readonly number[], paper: readonly number[], mix = 1) => {
  const c = rgb.map((v, k) => v * mix + paper[k] * (1 - mix));
  return gm === "p3"
    ? `color(display-p3 ${c.map(v => String(+v.toFixed(4))).join(" ")})`
    : toHex(c);
};

/** The palette inside the gamut's solid, for a figure's panel. `top` keeps room for a caption across the panel's top. */
export function insideScene(
  f: SolidFrame,
  cam: Cam,
  K: SolidInk,
  o: { u?: number; into: Rect; top?: number }
): Mark[] {
  const u = o.u ?? 1;
  const { x: X0, y: Y0, w: W, h: H } = o.into;
  const gm: Gamut = f.wide ? "p3" : "srgb";
  const paper = rgbOf(K.paper);
  /* a big panel gets a finer wall, so its colors step unseen; a multiple of eight, so the near half's grid follows it */
  const N = Math.min(W, H) > 480 ? 24 : 16;
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  /* the live scene's camera, every axis at one scale */
  const view = (lch: readonly number[]): P3 => {
    const a = lch[1] * Math.cos(lch[2] * DEG);
    const b = lch[1] * Math.sin(lch[2] * DEG);
    const y = lch[0] - 0.5;
    const x = a * cy + b * sy;
    const z = -a * sy + b * cy;
    return [x, y * cp - z * sp, y * sp + z * cp];
  };
  const cells = cubeCells(gm, N);
  let lft = Number.POSITIVE_INFINITY;
  let rgt = Number.NEGATIVE_INFINITY;
  let top = Number.NEGATIVE_INFINITY;
  let bot = Number.POSITIVE_INFINITY;
  for (const c of cells)
    for (const p of c.lch) {
      const v = view(p);
      lft = Math.min(lft, v[0]);
      rgt = Math.max(rgt, v[0]);
      top = Math.max(top, v[1]);
      bot = Math.min(bot, v[1]);
    }
  const m = 12 * u;
  const mt = m + (o.top ?? 0);
  const scale = Math.min(
    (W - 2 * m) / Math.max(1e-6, rgt - lft),
    (H - m - mt) / Math.max(1e-6, top - bot)
  );
  const ox = X0 + W / 2 - ((lft + rgt) / 2) * scale;
  const oy = Y0 + mt + (H - m - mt) / 2 + ((top + bot) / 2) * scale;
  const proj = (lch: readonly number[]): P3 => {
    const v = view(lch);
    return [ox + v[0] * scale, oy - v[1] * scale, v[2]];
  };
  const quads = cells.map(c => {
    const ps = c.lch.map(proj);
    const a2 = wound(ps);
    return {
      c,
      ps,
      d: (ps[0][2] + ps[1][2] + ps[2][2] + ps[3][2]) / 4,
      area: (c.flip ? -a2 : a2) / 2,
      front: false
    };
  });
  const faces = frontSide(quads);
  for (const q of quads) q.front = faces(q.area);
  /* every cell edge is shared by two cells: between one facing the camera and one turned away is the outline; along
     the cube's own edges, two turned away are an edge on the wall and two facing an edge of the near half */
  interface Edge {
    a: P3;
    b: P3;
    mid: number[];
    fronts: boolean[];
    cube: boolean;
  }
  const edges = new Map<string, Edge>();
  for (const q of quads)
    for (let i = 0; i < 4; i++) {
      const ga = q.c.g[i];
      const gb = q.c.g[(i + 1) % 4];
      const ka = ga.join();
      const kb = gb.join();
      const key = ka < kb ? `${ka} ${kb}` : `${kb} ${ka}`;
      let e = edges.get(key);
      if (!e) {
        const cube =
          [0, 1, 2].filter(k => ga[k] === gb[k] && (ga[k] === 0 || ga[k] === N)).length === 2;
        e = {
          a: q.ps[i],
          b: q.ps[(i + 1) % 4],
          mid: ga.map((v, k) => (v + gb[k]) / 2 / N),
          fronts: [],
          cube
        };
        edges.set(key, e);
      }
      e.fronts.push(q.front);
    }
  const outline: Edge[] = [];
  const wallEdges: Edge[] = [];
  const nearEdges: Edge[] = [];
  for (const e of edges.values()) {
    if (e.fronts[0] !== e.fronts[1]) (e.cube ? nearEdges : outline).push(e);
    else if (e.cube) (e.fronts[0] ? nearEdges : wallEdges).push(e);
  }
  const marks: Mark[] = [];
  const edgeRun = (list: Edge[], width: number, mix: number, layer: string) => {
    for (const e of list)
      marks.push({
        runs: [{ points: [e.a[0], e.a[1], e.b[0], e.b[1]] }],
        stroke: cubeColor(gm, e.mid, paper, mix),
        width,
        round: true,
        layer
      });
  };
  /* the wall, far to near, each cell bled half a pixel so no seam shows */
  for (const q of quads.filter(q => !q.front).sort((a, b) => a.d - b.d)) {
    const mx = (q.ps[0][0] + q.ps[1][0] + q.ps[2][0] + q.ps[3][0]) / 4;
    const my = (q.ps[0][1] + q.ps[1][1] + q.ps[2][1] + q.ps[3][1]) / 4;
    const points = q.ps.flatMap(p => {
      const l = Math.hypot(p[0] - mx, p[1] - my) || 1;
      return [p[0] + ((p[0] - mx) / l) * 0.5, p[1] + ((p[1] - my) / l) * 0.5];
    });
    marks.push({
      runs: [{ points, closed: true }],
      fill: cubeColor(gm, q.c.mid, paper, WALL_MIX),
      layer: "wall"
    });
  }
  edgeRun(wallEdges, u, 0.6, "wall");
  /* the path over its casing */
  const pts = f.cont.map(s => proj(s.out));
  const n = pts.length;
  let dMin = Number.POSITIVE_INFINITY;
  let dMax = Number.NEGATIVE_INFINITY;
  for (const p of pts) {
    dMin = Math.min(dMin, p[2]);
    dMax = Math.max(dMax, p[2]);
  }
  const widthOf = (d: number) => (2.6 + 1.3 * (dMax > dMin ? (d - dMin) / (dMax - dMin) : 1)) * u;
  marks.push(...casing(pts, i => widthOf((pts[i - 1][2] + pts[i][2]) / 2) / 2, K, u, "path"));
  /* the gray axis, the path and its stops, near over far */
  const items: { d: number; mark: Mark }[] = [];
  const A = 24;
  for (let i = 0; i < A; i++) {
    const a = proj([i / A, 0, 0]);
    const b = proj([(i + 1) / A, 0, 0]);
    items.push({
      d: (a[2] + b[2]) / 2,
      mark: {
        runs: [{ points: [a[0], a[1], b[0], b[1]] }],
        stroke: grayOf((i + 0.5) / A),
        width: 1.5 * u,
        layer: "path"
      }
    });
  }
  for (let i = 1; i < n; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const d = (a[2] + b[2]) / 2;
    items.push({
      d,
      mark: {
        runs: [{ points: [a[0], a[1], b[0], b[1]] }],
        stroke: f.cont[i].hex,
        width: widthOf(d),
        round: true,
        layer: "path"
      }
    });
  }
  if (f.stepped)
    for (const s of f.stops) {
      const q = proj(s.out);
      items.push({
        d: q[2] + 0.01,
        mark: {
          circles: [q[0], q[1], 2.8 * u],
          fill: s.hex,
          stroke: K.paper,
          width: 1.2 * u,
          layer: "path"
        }
      });
    }
  items.sort((a, b) => a.d - b.d);
  for (const it of items) marks.push(it.mark);
  marks.push({
    circles: [pts[0][0], pts[0][1], 1.5 * u, pts[n - 1][0], pts[n - 1][1], 1.5 * u],
    fill: K.ink,
    layer: "path"
  });
  /* the near half's grid, each face in eighths as the live scene draws it home, faint in the face's own colors and over
     the path, since that half stands between the path and the eye */
  const at = new Map<string, P3>();
  for (const q of quads) for (let i = 0; i < 4; i++) at.set(q.c.g[i].join(), q.ps[i]);
  const G = N / 8;
  for (const [putOf, flip] of FACE_PUTS) {
    const w = putOf(N);
    for (let I = 0; I < 8; I++)
      for (let J = 0; J < 8; J++) {
        const a0 = I * G;
        const a1 = a0 + G;
        const b0 = J * G;
        const b1 = b0 + G;
        const corners = [w(a0, b0), w(a1, b0), w(a1, b1), w(a0, b1)].map(
          g => at.get(g.join()) as P3
        );
        const a2 = wound(corners);
        if (!faces((flip ? -a2 : a2) / 2)) continue;
        const ring: Triple[] = [];
        for (let s = 0; s < G; s++) ring.push(w(a0 + s, b0));
        for (let s = 0; s < G; s++) ring.push(w(a1, b0 + s));
        for (let s = 0; s < G; s++) ring.push(w(a1 - s, b1));
        for (let s = 0; s < G; s++) ring.push(w(a0, b1 - s));
        marks.push({
          runs: [{ points: flat(ring.map(g => at.get(g.join()) as P3)), closed: true }],
          stroke: cubeColor(
            gm,
            w(a0 + G / 2, b0 + G / 2).map(v => v / N),
            paper
          ),
          width: 1.2 * u,
          alpha: 0.34,
          round: true,
          layer: "grid"
        });
      }
  }
  /* then the near half's outline in ink and the cube's edges in their own colors */
  marks.push({
    runs: outline.map(e => ({ points: [e.a[0], e.a[1], e.b[0], e.b[1]] })),
    stroke: K.ink,
    width: 0.9 * u,
    alpha: 0.35,
    round: true,
    layer: "edges"
  });
  edgeRun(nearEdges, 1.6 * u, 1, "edges");
  return marks;
}
