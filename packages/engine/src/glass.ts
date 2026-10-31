/* Fluted glass: a palette's colors drifting behind a pane of curved ribs, after a reference video the owner chose, its
   numbers hill-climbed against it. One model, which the SVG draws and the WebGL player (ui/glass-player.ts) and the
   CPU draw the same, to about a level:
     1. A field: the palette's second color, then twelve soft discs of its colors (radial gradients, opaque to `core`,
        clear at the rim) painted in order in sRGB, as a browser paints SVG.
     2. One feGaussianBlur over it, in sRGB. Chromium and Firefox run the spec's three box blurs of width
        d = floor(sigma · 3 · √(2π) / 4 + 0.5); the player and the CPU blur by a Gaussian of the same variance.
     3. feDisplacementMap by the rib map: the product (feComposite arithmetic) of a lens map (a disc per rib, painted
        largest first, each a radial gradient of the folded lens profile) and a normal map (a linear gradient).
        Displacement is scale · (channel − 0.5), R across and G down, read from the nearest pixel.
     4. Each rib's light: a factor of the lens gray (feComponentTransfer) that the last composite multiplies in.
   Every number the SVG writes is rounded once here and the arithmetic uses the rounded number, so the file and the
   players agree. Each disc rides an ellipse along the ribs by two counter-turning linear CSS rotations inside a
   scale, which is the closed form glassDiscAt computes. The ribs depend on the size, the angle and the shape alone and
   the field on the palette and the shape, so a recolor bakes nothing. A shape (0 or none the design itself) draws the
   discs from a seed of its own and varies the ribs within what still reads as the reference's glass: their width, how
   fast they widen away from the middle and which way they bend. This module is the model and its SVG, all a page needs to show the still;
   glass-render.ts draws it by the CPU and prepares it for the GPU. */
import type { Size } from "./view.ts";

export { glassColors } from "./glass-colors.ts";

/** A loop's seconds at speed 1: slow, as the owner set it (the reference video's pace is about 6.7). */
export const GLASS_LOOP = 56;
/** The one design every size shows, scaled to cover the box as a background image is: the server draws it before it
    knows the screen, and the player draws the same, so the two agree at any size. */
export const GLASS_DESIGN: Size = { width: 1000, height: 1000 };
export const GLASS_SPEED_MIN = 0.1;
export const GLASS_SPEED_MAX = 10;
export const GLASS_FPS_MAX = 120;
/** The angle the ribs run at as the hill climb drew them: the view's default (view.ts). Another angle turns them, and
    the discs' orbits along them, about the middle; the colors stay where they are. */
export const GLASS_ANGLE = 90;

export interface GlassView {
  /** How fast the colors drift: the loop is GLASS_LOOP seconds over this. */
  speed: number;
  /** Frames a second at most, or null for the screen's own pace. */
  fps: number | null;
  /** The view's angle, in degrees, GLASS_ANGLE as designed. */
  angle?: number;
  /** The shape: 0 or none as designed, another number its own ribs and discs. */
  shape?: number | null;
}

/* The hill climb's numbers (W/blob-ref/proto/v4/final.json). Lengths are in the box's diagonal, or in pixels at the
   reference's 720 by 900 (diagonal REF_D), scaled to the box. */
const REF_D = 1152.56;
const T = {
  seed: 7,
  geo: {
    arcC: [-0.6939, -0.6395],
    arcDir: [0.72384, 0.68997],
    arcR0: 0.74155,
    arcG: 0.73876,
    s0: 0.088544,
    p0: 0.016224,
    betaP: 0.18037,
    betaM: 0.13328,
    phase: 6.2201
  },
  lensA: 1.8221723373606658,
  lensB: 1.3527826156950404,
  lensE: 0.6739178404790045,
  lensKappa: 0.97,
  lensShift: 0.15084155110105363,
  seamW: 13.089314648014595,
  disp: 0.8615750162531419,
  nPts: 12,
  gridX: 4,
  spread: 1.1750951232721354,
  jitter: 0.12508013085004963,
  sigma: 0.10825287299504333,
  orbitAlong: 0.1979667332590454,
  orbitAcross: 0.03473221296011865,
  discScale: 2.3983953901883925,
  core: 0.3626018216611724,
  blur: 28.823670270874572,
  base: 1,
  lensStops: 28,
  shade: 0.058023170773981086,
  shadeSkew: 0.3
} as const;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const p7 = (v: number) => Number(v.toPrecision(7));
const fmt = (v: number) => String(v).replace(/^(-?)0\./, "$1.");

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

type Geo = {
  [K in keyof typeof T.geo]: (typeof T.geo)[K] extends readonly number[]
    ? readonly number[]
    : number;
};

/** A shape's seed for its numbers, scrambled so near shapes draw unlike ones. */
const seedOf = (shape: number) => (Math.imul(shape + 1, 0x9e3779b1) ^ 0x5bd1e995) >>> 0;

/** The ribs a shape draws: the hill climb's for 0 or none; another's as wide as 0.8 to 1.3 of them, widening away from
    the middle 0.8 to 1.25 as fast and moved along by a share of a rib, always running as the angle turns them: which
    way the ribs run is the view's Angle alone. */
function geoOf(shape: number | null | undefined): Geo {
  if (!shape) return T.geo;
  const rand = dice(seedOf(shape) ^ 0x2545f491);
  const between = (least: number, most: number) => least + (most - least) * rand();
  /* the draw that once mirrored the ribs half the time, which turned them as another angle would: kept, so every
     shape keeps the width, the widening and the place it had */
  rand();
  const widen = between(0.8, 1.25);
  return {
    ...T.geo,
    p0: T.geo.p0 * between(0.8, 1.3),
    betaP: T.geo.betaP * widen,
    betaM: T.geo.betaM * widen,
    phase: T.geo.phase + rand()
  };
}

/* The ribs: circles |p − (C + s·dir)| = R0 + g·s, p from the box's middle in diagonals; the pitch in s grows away from
   s0 by beta a step, so the rib index k(s) is a logarithm. `turn` (radians, clockwise on the screen) turns C and dir,
   and with them every rib, about the middle. */
function ribs(W: number, H: number, turn: number, geo: Geo = T.geo) {
  const c = Math.cos(turn);
  const sn = Math.sin(turn);
  const rot = (v: readonly number[]): [number, number] => [
    v[0] * c - v[1] * sn,
    v[0] * sn + v[1] * c
  ];
  const g = { ...geo, arcC: rot(geo.arcC), arcDir: rot(geo.arcDir) };
  const D = Math.hypot(W, H);
  const levelAt = (X: number, Y: number) => {
    const q0 = (X - W / 2) / D - g.arcC[0];
    const q1 = (Y - H / 2) / D - g.arcC[1];
    const a2 = 1 - g.arcG * g.arcG;
    const b2 = -2 * (q0 * g.arcDir[0] + q1 * g.arcDir[1] + g.arcG * g.arcR0);
    const c2 = q0 * q0 + q1 * q1 - g.arcR0 * g.arcR0;
    return (-b2 - Math.sqrt(Math.max(b2 * b2 - 4 * a2 * c2, 0))) / (2 * a2);
  };
  const kOf = (s: number) => {
    const ds = s - g.s0;
    const b = ds >= 0 ? g.betaP : g.betaM;
    return (
      (b > 1e-5 ? (Math.sign(ds) * Math.log(1 + (b * Math.abs(ds)) / g.p0)) / b : ds / g.p0) +
      g.phase
    );
  };
  const sOf = (k: number) => {
    let lo = -5;
    let hi = 5;
    for (let i = 0; i < 70; i++) {
      const m = (lo + hi) / 2;
      if (kOf(m) < k) lo = m;
      else hi = m;
    }
    return (lo + hi) / 2;
  };
  return { g, D, levelAt, kOf, sOf };
}

/** The lens across a rib, in pitches, v from −1 (its inner edge) to 1 (its outer). */
const lensF = (v: number) =>
  -(
    T.lensA * v +
    T.lensB * v ** 3 +
    T.lensE * (v / Math.sqrt(Math.max(1 - T.lensKappa * T.lensKappa * v * v, 1e-3)) - v)
  ) + T.lensShift;

export interface GlassRib {
  cx: number;
  cy: number;
  r: number;
  /** offset in the disc, gray 0 to 255 */
  stops: [number, number][];
}
export interface GlassRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** What a size draws, whatever the palette: the ribs, their map's parts, the blur and the filter's region. */
export interface GlassGeometry {
  width: number;
  height: number;
  /** the view's angle the ribs are turned to */
  angle: number;
  /** the shape the ribs and the discs are drawn for: 0 as designed */
  shape: number;
  D: number;
  ribs: GlassRib[];
  normal: { x1: number; y1: number; x2: number; y2: number; stops: [number, number, number][] };
  /** feDisplacementMap's scale */
  scale: number;
  /** the ribs' tangent at the middle, degrees: the discs' orbits lie along it */
  alpha: number;
  sigma: number;
  sigmaEff: number;
  dBox: number;
  shadeTable: number[];
  region: GlassRegion;
}

export function glassGeometry(
  size: Size,
  angle = GLASS_ANGLE,
  shape: number | null = null
): GlassGeometry {
  const { width: W, height: H } = size;
  const { g, D, levelAt, kOf, sOf } = ribs(
    W,
    H,
    ((angle - GLASS_ANGLE) * Math.PI) / 180,
    geoOf(shape)
  );
  const u = D / REF_D;
  /* the ribs the box shows */
  const edgeK: number[] = [];
  for (let i = 0; i <= 16; i++) {
    for (const [x, y] of [
      [(i * W) / 16, 0],
      [(i * W) / 16, H],
      [0, (i * H) / 16],
      [W, (i * H) / 16]
    ])
      edgeK.push(kOf(levelAt(x, y)));
  }
  const k0 = Math.floor(Math.min(...edgeK)) - 1;
  const k1 = Math.ceil(Math.max(...edgeK)) + 1;
  const N = T.lensStops;
  const seamPx = Math.max(T.seamW * u, 1.2);
  const raw: { cx: number; cy: number; R: number; stops: [number, number][] }[] = [];
  let dmax = 1;
  for (let k = k0; k < k1; k++) {
    const sIn = sOf(k);
    const sOut = sOf(k + 1);
    const cx = W / 2 + (g.arcC[0] + sOut * g.arcDir[0]) * D;
    const cy = H / 2 + (g.arcC[1] + sOut * g.arcDir[1]) * D;
    const R = (g.arcR0 + g.arcG * sOut) * D;
    const pitch = (sOut - sIn) * (1 + g.arcG) * D;
    const seam = seamPx / pitch;
    const stops: [number, number][] = [];
    for (let j = 0; j <= N; j++) {
      /* denser toward both edges, where the fold turns */
      const x = 0.5 - 0.5 * Math.cos((Math.PI * j) / N);
      const e = Math.abs(x - 0.5) - 0.5;
      const tt = Math.min(1, Math.max(0, (e + seam) / (2 * seam)));
      const band = tt * tt * (3 - 2 * tt);
      const uf = x * (1 - band) + (1 - x) * band;
      const d = lensF(2 * uf - 1) * pitch * T.disp;
      dmax = Math.max(dmax, Math.abs(d));
      stops.push([(R - pitch + x * pitch) / R, d]);
    }
    raw.push({ cx, cy, R, stops });
  }
  dmax *= 1.02;
  const scale = r2(2 * dmax);
  /* written once: centers and radii to 2 decimals, offsets to 4, gray levels as integers */
  const ribList: GlassRib[] = raw.map(r => ({
    cx: r2(r.cx),
    cy: r2(r.cy),
    r: r2(r.R),
    stops: r.stops.map(([o, d]) => [
      r4(Math.min(1, Math.max(0, o))),
      Math.round(255 * (0.5 + (0.5 * d) / (scale / 2)))
    ])
  }));
  /* the normal: along a line through the middle across the ribs' tangent, the direction from each level's center */
  const sMid = levelAt(W / 2, H / 2);
  const cm = [
    W / 2 + (g.arcC[0] + sMid * g.arcDir[0]) * D,
    H / 2 + (g.arcC[1] + sMid * g.arcDir[1]) * D
  ];
  const nl = Math.hypot(W / 2 - cm[0], H / 2 - cm[1]);
  const n0 = [(W / 2 - cm[0]) / nl, (H / 2 - cm[1]) / nl];
  const t0 = [-n0[1], n0[0]];
  const L = Math.abs(W * t0[0]) + Math.abs(H * t0[1]);
  const nStops: [number, number, number][] = [];
  for (let j = 0; j <= 16; j++) {
    const x = -L / 2 + (L * j) / 16;
    const X = W / 2 + t0[0] * x;
    const Y = H / 2 + t0[1] * x;
    const s = levelAt(X, Y);
    const c = [
      W / 2 + (g.arcC[0] + s * g.arcDir[0]) * D,
      H / 2 + (g.arcC[1] + s * g.arcDir[1]) * D
    ];
    const l = Math.hypot(X - c[0], Y - c[1]);
    nStops.push([
      r4(j / 16),
      Math.round(255 * (0.5 + (0.5 * (X - c[0])) / l)),
      Math.round(255 * (0.5 + (0.5 * (Y - c[1])) / l))
    ]);
  }
  const normal = {
    x1: r2(W / 2 - (t0[0] * L) / 2),
    y1: r2(H / 2 - (t0[1] * L) / 2),
    x2: r2(W / 2 + (t0[0] * L) / 2),
    y2: r2(H / 2 + (t0[1] * L) / 2),
    stops: nStops
  };
  /* the discs' orbits lie along the ribs' tangent at the middle */
  const cxA = -g.arcC[0];
  const cyA = -g.arcC[1];
  const nA = Math.hypot(cxA, cyA);
  const alpha = r3((Math.atan2(-cxA / nA, cyA / nA) * 180) / Math.PI);
  const sigma = r2(T.blur * u);
  const dBox = Math.floor((sigma * 3 * Math.sqrt(2 * Math.PI)) / 4 + 0.5);
  const sigmaEff = Math.sqrt(
    dBox % 2 ? (dBox * dBox - 1) / 4 : (3 * dBox * dBox + 2 * dBox - 2) / 12
  );
  /* the ribs' light, a factor of the lens gray x = 2·gray − 1: 1 + shade·(skew·x − x² + 1/3), written as a table of
     the factor's half (feComponentTransfer) and applied as twice the product (feComposite arithmetic, k1 = 2) */
  const shadeTable = Array.from({ length: 17 }, (_, i) => {
    const x = (2 * i) / 16 - 1;
    return r4(Math.min(1, Math.max(0, 0.5 * (1 + T.shade * (T.shadeSkew * x - x * x + 1 / 3)))));
  });
  /* the filter's reach: no read moves a pixel more than half the scale, and the blur fades toward the region's edge
     over the three boxes' half width each */
  const move = Math.ceil(scale / 2) + 1;
  const reach = Math.ceil(1.5 * dBox) + 1;
  const region = {
    x: -move - reach,
    y: -move - reach,
    w: W + 2 * (move + reach),
    h: H + 2 * (move + reach)
  };
  return {
    width: W,
    height: H,
    angle,
    shape: shape ?? 0,
    D,
    ribs: ribList,
    normal,
    scale,
    alpha,
    sigma,
    sigmaEff,
    dBox,
    shadeTable,
    region
  };
}

export interface GlassDisc {
  cx: number;
  cy: number;
  /** the ellipse's half axes, along the ribs and across */
  a: number;
  b: number;
  R: number;
  /** a lap's seconds at speed 1, and the start's offset */
  dur: number;
  delay: number;
  dir: 1 | -1;
  color: string;
}
/** What a palette draws in a geometry: the base and the discs. */
export interface GlassField {
  base: string;
  core: number;
  discs: GlassDisc[];
}

/** The field of a palette's colors (glassColors) at speed 1: a player scales its clock by the speed, and an animated
    SVG writes its durations over it. Its discs are drawn from the hill climb's seed, or the geometry's shape's. */
export function glassField(geometry: GlassGeometry, colors: readonly string[]): GlassField {
  const { width: W, height: H, D } = geometry;
  const rand = dice(geometry.shape ? seedOf(geometry.shape) : T.seed);
  const rows = Math.ceil(T.nPts / T.gridX);
  const discs: GlassDisc[] = [];
  for (let i = 0; i < T.nPts; i++) {
    const gx = ((i % T.gridX) + 0.5) / T.gridX;
    const gy = (Math.floor(i / T.gridX) + 0.5) / rows;
    const bx = (gx - 0.5) * W * T.spread + (rand() - 0.5) * W * T.jitter;
    const by = (gy - 0.5) * H * T.spread + (rand() - 0.5) * H * T.jitter;
    const laps = (rand() < 0.5 ? 1 : 2) * (rand() < 0.5 ? -1 : 1);
    const th0 = rand();
    rand();
    const a = r2(Math.max(0.5, T.orbitAlong * D * (0.7 + 0.6 * rand())));
    const b = r2(Math.max(0.5, T.orbitAcross * D * (0.7 + 0.6 * rand())));
    const R = r2(T.sigma * D * (0.85 + 0.3 * rand()) * T.discScale);
    const dur = r3(GLASS_LOOP / Math.abs(laps));
    const delay = r3(-th0 * dur);
    discs.push({
      cx: r2(W / 2 + bx),
      cy: r2(H / 2 + by),
      a,
      b,
      R,
      dur,
      delay,
      dir: laps > 0 ? 1 : -1,
      color: colors[i % colors.length]
    });
  }
  return { base: colors[T.base % colors.length], core: r4(T.core), discs };
}

/** A disc's middle at time t (seconds at speed 1), where its two CSS rotations put it, into out[k] and out[k + 1]. */
export function glassDiscAt(
  geometry: GlassGeometry,
  d: GlassDisc,
  t: number,
  out: Float32Array,
  k: number
): void {
  const ang = (d.dir * 2 * Math.PI * (t - d.delay)) / d.dur;
  const al = (geometry.alpha * Math.PI) / 180;
  const ex = d.a * Math.cos(ang);
  const ey = d.b * Math.sin(ang);
  out[k] = d.cx + ex * Math.cos(al) - ey * Math.sin(al);
  out[k + 1] = d.cy + ex * Math.sin(al) + ey * Math.cos(al);
}

/* an image as a data URI, its markup as written (single quotes, and %, #, < and > escaped): it compresses far better
   than base64 */
/** SVG markup as a data URI, percent-encoding only what a URI or an HTML or CSS string around it cannot hold, which
    compresses better than base64. Its double quotes become single ones where it has none of those (a URI nested in
    it has), and are encoded otherwise. */
export const glassDataUri = (svg: string) =>
  `data:image/svg+xml,${(svg.includes("'") ? svg : svg.replaceAll('"', "'")).replace(/[%#<>"]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;

/** The SVG: the field under one filter, its discs on their CSS orbits at `speed`, or the first frame alone, each disc
    a plain circle where it starts. `cover` fills its box as a background image does, cropped to the box's shape. */
export function glassSvg(
  geometry: GlassGeometry,
  field: GlassField,
  {
    still = false,
    speed = 1,
    id = "fg",
    cover = false
  }: { still?: boolean; speed?: number; id?: string; cover?: boolean } = {}
): string {
  const { width: W, height: H, ribs: ribList, normal, scale, region, sigma, alpha } = geometry;
  const lens = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>${ribList
    .map(
      (r, i) =>
        `<radialGradient id="g${i}" gradientUnits="userSpaceOnUse" cx="${fmt(r.cx)}" cy="${fmt(r.cy)}" r="${fmt(r.r)}">${r.stops
          .map(([o, v]) => `<stop offset="${fmt(o)}" stop-color="rgb(${v},${v},${v})"/>`)
          .join("")}</radialGradient>`
    )
    .join("")}</defs><rect width="${W}" height="${H}" fill="#808080"/>${ribList
    .map((_, i) => i)
    .reverse()
    .map(
      i =>
        `<circle cx="${fmt(ribList[i].cx)}" cy="${fmt(ribList[i].cy)}" r="${fmt(ribList[i].r)}" fill="url(#g${i})"/>`
    )
    .join("")}</svg>`;
  const normals = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="n" gradientUnits="userSpaceOnUse" x1="${fmt(normal.x1)}" y1="${fmt(normal.y1)}" x2="${fmt(normal.x2)}" y2="${fmt(normal.y2)}">${normal.stops
    .map(([o, r, g]) => `<stop offset="${fmt(o)}" stop-color="rgb(${r},${g},255)"/>`)
    .join("")}</linearGradient></defs><rect width="${W}" height="${H}" fill="url(#n)"/></svg>`;
  const grads = field.discs
    .map(
      (d, i) =>
        `<radialGradient id="${id}d${i}"><stop offset="0" stop-color="${d.color}"/><stop offset="${fmt(field.core)}" stop-color="${d.color}"/><stop offset="1" stop-color="${d.color}" stop-opacity="0"/></radialGradient>`
    )
    .join("");
  const at = new Float32Array(2);
  const body = field.discs
    .map((d, i) => {
      if (still) {
        glassDiscAt(geometry, d, 0, at, 0);
        return `<circle cx="${fmt(r2(at[0]))}" cy="${fmt(r2(at[1]))}" r="${fmt(d.R)}" fill="url(#${id}d${i})"/>`;
      }
      const dur = r3(d.dur / speed);
      const delay = r3(d.delay / speed);
      const th0 = r3((d.dir * 360 * -d.delay) / d.dur);
      const spin = still
        ? ""
        : `;animation:${id}s ${fmt(dur)}s linear ${fmt(delay)}s infinite${d.dir < 0 ? " reverse" : ""}`;
      const back = still
        ? ""
        : `;animation:${id}s ${fmt(dur)}s linear ${fmt(delay)}s infinite${d.dir < 0 ? "" : " reverse"}`;
      return `<g style="transform:translate(${fmt(d.cx)}px,${fmt(d.cy)}px) rotate(${fmt(alpha)}deg) scale(${fmt(d.a)},${fmt(d.b)})"><g style="transform:rotate(${fmt(th0)}deg)${spin}"><g style="transform:translateX(1px)"><g style="transform:rotate(${fmt(-th0)}deg)${back}"><circle style="transform:scale(${fmt(p7(1 / d.a))},${fmt(p7(1 / d.b))})" r="${fmt(d.R)}" fill="url(#${id}d${i})"/></g></g></g></g>`;
    })
    .join("");
  const css = still
    ? ""
    : `<style>@keyframes ${id}s{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.${id} *{animation:none!important}}</style>`;
  const filter =
    `<filter id="${id}f" x="${region.x}" y="${region.y}" width="${region.w}" height="${region.h}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">` +
    `<feGaussianBlur stdDeviation="${fmt(sigma)}" result="b"/>` +
    `<feImage href="${glassDataUri(lens)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none" result="r"/>` +
    `<feImage href="${glassDataUri(normals)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none" result="n"/>` +
    `<feComposite in="r" in2="n" operator="arithmetic" k1="2" k2="-1" k3="-1" k4="1" result="m"/>` +
    `<feDisplacementMap in="b" in2="m" scale="${fmt(scale)}" xChannelSelector="R" yChannelSelector="G" result="d"/>` +
    `<feColorMatrix in="m" values="0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 1 0" result="g"/><feComponentTransfer in="g" result="s">${(
      ["R", "G", "B"] as const
    )
      .map(
        c => `<feFunc${c} type="table" tableValues="${geometry.shadeTable.map(fmt).join(" ")}"/>`
      )
      .join(
        ""
      )}</feComponentTransfer><feComposite in="d" in2="s" operator="arithmetic" k1="2" k2="0" k3="0" k4="0"/>` +
    `</filter>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ${cover ? 'width="100%" height="100%" preserveAspectRatio="xMidYMid slice"' : `width="${W}" height="${H}"`} viewBox="0 0 ${W} ${H}" class="${id}">${css}<defs>${grads}${filter}</defs>` +
    `<g filter="url(#${id}f)"><rect x="${region.x}" y="${region.y}" width="${region.w}" height="${region.h}" fill="${field.base}"/>${body}</g></svg>`
  );
}

const designs = new Map<string, GlassGeometry>();
/** The one design at an angle and a shape, its ribs worked out once for each. */
export function glassDesign(angle: number, shape: number | null = null): GlassGeometry {
  const key = `${angle}|${shape ?? 0}`;
  let design = designs.get(key);
  if (!design) {
    design = glassGeometry(GLASS_DESIGN, angle, shape);
    designs.set(key, design);
  }
  return design;
}

/** The first frame as a background covering its box, which a page paints before the player takes over: the one
    design at the angle and the shape under the colors (glass-colors.ts), cropped to the box's shape. */
export function glassStillBackground(
  colors: readonly string[],
  angle: number,
  shape: number | null = null
): string {
  const design = glassDesign(angle, shape);
  const svg = glassSvg(design, glassField(design, colors), { still: true, cover: true });
  return `url("${glassDataUri(svg)}") 50% 50%/cover no-repeat`;
}
