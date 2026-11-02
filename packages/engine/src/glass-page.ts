/* The fluted glass's design in a page's JavaScript, for its shader pages (glass-shader.ts): worked out exactly as the
   site's player works it out (engine/glass.ts's ribs, discs and their orbits, glass-render.ts's cover and blur plan),
   so the page's GPU draws from the same numbers. The pages play it by the players' clock (effect-page.ts); the WebGL
   page runs the player's own GLSL (glass-gl.ts), the WebGPU page the same passes in WGSL (glass-wgsl.ts). */
import { EFFECT_EASE_S, type Effect } from "./effect.ts";
import { GLASS_ANGLE, GLASS_DESIGN, GLASS_LOOP, GLASS_REF_D, GLASS_TUNING } from "./glass.ts";
import { glassColors } from "./glass-colors.ts";
import type { Palette } from "./palette.ts";

/** A value as JavaScript writes it back, numbers in the shortest spelling that reads as the same double: an object a
    key a line, nested ones on one. */
const js = (value: unknown, top = false): string =>
  Array.isArray(value)
    ? `[${value.map(v => js(v)).join(", ")}]`
    : typeof value === "object" && value
      ? top
        ? `{\n${Object.entries(value)
            .map(([k, v]) => `  ${k}: ${js(v)}`)
            .join(",\n")}\n}`
        : `{ ${Object.entries(value)
            .map(([k, v]) => `${k}: ${js(v)}`)
            .join(", ")} }`
      : String(value);

/** The design and its arithmetic in plain JavaScript, each expression as engine/glass.ts and glass-render.ts write it,
    so a page computes the player's numbers to the last bit (glass-page.test.ts holds the two together). */
export const GLASS_MODEL = `// The design, as the site draws it: the hill climb's numbers. Lengths are in the box's diagonal, or in pixels at
// the reference's 720 by 900 (diagonal REF_D), scaled to the box.
const T = ${js(GLASS_TUNING, true)};
const REF_D = ${GLASS_REF_D};
const DESIGN = ${GLASS_DESIGN.width};
const LOOP = ${GLASS_LOOP};
const DESIGN_ANGLE = ${GLASS_ANGLE};
const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
const r4 = v => Math.round(v * 10000) / 10000;

// mulberry32: the design's random numbers, the same everywhere.
function dice(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// A shape's seed, scrambled so near shapes draw unlike ones.
const seedOf = shape => (Math.imul(shape + 1, 0x9e3779b1) ^ 0x5bd1e995) >>> 0;

// The ribs a shape draws: the design's for 0, another's a little wider or narrower and widening faster or slower.
function geoOf(shape) {
  if (!shape) return T.geo;
  const rand = dice(seedOf(shape) ^ 0x2545f491);
  const between = (least, most) => least + (most - least) * rand();
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

// The ribs: circles |p - (C + s dir)| = R0 + g s, p from the box's middle in diagonals, the pitch in s growing away
// from s0, so the rib index k(s) is a logarithm; \`turn\` turns them about the middle.
function ribs(W, H, turn, geo) {
  const c = Math.cos(turn);
  const sn = Math.sin(turn);
  const rot = v => [v[0] * c - v[1] * sn, v[0] * sn + v[1] * c];
  const g = { ...geo, arcC: rot(geo.arcC), arcDir: rot(geo.arcDir) };
  const D = Math.hypot(W, H);
  const levelAt = (X, Y) => {
    const q0 = (X - W / 2) / D - g.arcC[0];
    const q1 = (Y - H / 2) / D - g.arcC[1];
    const a2 = 1 - g.arcG * g.arcG;
    const b2 = -2 * (q0 * g.arcDir[0] + q1 * g.arcDir[1] + g.arcG * g.arcR0);
    const c2 = q0 * q0 + q1 * q1 - g.arcR0 * g.arcR0;
    return (-b2 - Math.sqrt(Math.max(b2 * b2 - 4 * a2 * c2, 0))) / (2 * a2);
  };
  const kOf = s => {
    const ds = s - g.s0;
    const b = ds >= 0 ? g.betaP : g.betaM;
    return (
      (b > 1e-5 ? (Math.sign(ds) * Math.log(1 + (b * Math.abs(ds)) / g.p0)) / b : ds / g.p0) +
      g.phase
    );
  };
  const sOf = k => {
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

// The ribs' tangent at the middle in degrees, which the colors' orbits lie along.
function alphaOf(angle, shape) {
  const turn = ((angle - DESIGN_ANGLE) * Math.PI) / 180;
  const c = Math.cos(turn);
  const sn = Math.sin(turn);
  const [x, y] = geoOf(shape).arcC;
  const cxA = -(x * c - y * sn);
  const cyA = -(x * sn + y * c);
  const nA = Math.hypot(cxA, cyA);
  return r3((Math.atan2(-cxA / nA, cyA / nA) * 180) / Math.PI);
}

// The lens across a rib, in pitches, v from -1 (its inner edge) to 1 (its outer).
const lensF = v =>
  -(
    T.lensA * v +
    T.lensB * v ** 3 +
    T.lensE * (v / Math.sqrt(Math.max(1 - T.lensKappa * T.lensKappa * v * v, 1e-3)) - v)
  ) + T.lensShift;

// What a size draws, whatever the colors: the ribs and their lens grays, the normal, the light, the blur and the
// filter's region.
function geometry(W, H, angle, shape) {
  const { g, D, levelAt, kOf, sOf } = ribs(W, H, ((angle - DESIGN_ANGLE) * Math.PI) / 180, geoOf(shape));
  const u = D / REF_D;
  const edgeK = [];
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
  const raw = [];
  let dmax = 1;
  for (let k = k0; k < k1; k++) {
    const sIn = sOf(k);
    const sOut = sOf(k + 1);
    const cx = W / 2 + (g.arcC[0] + sOut * g.arcDir[0]) * D;
    const cy = H / 2 + (g.arcC[1] + sOut * g.arcDir[1]) * D;
    const R = (g.arcR0 + g.arcG * sOut) * D;
    const pitch = (sOut - sIn) * (1 + g.arcG) * D;
    const seam = seamPx / pitch;
    const stops = [];
    for (let j = 0; j <= N; j++) {
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
  const ribList = raw.map(r => ({
    cx: r2(r.cx),
    cy: r2(r.cy),
    r: r2(r.R),
    stops: r.stops.map(([o, d]) => [
      r4(Math.min(1, Math.max(0, o))),
      Math.round(255 * (0.5 + (0.5 * d) / (scale / 2)))
    ])
  }));
  const sMid = levelAt(W / 2, H / 2);
  const cm = [
    W / 2 + (g.arcC[0] + sMid * g.arcDir[0]) * D,
    H / 2 + (g.arcC[1] + sMid * g.arcDir[1]) * D
  ];
  const nl = Math.hypot(W / 2 - cm[0], H / 2 - cm[1]);
  const n0 = [(W / 2 - cm[0]) / nl, (H / 2 - cm[1]) / nl];
  const t0 = [-n0[1], n0[0]];
  const L = Math.abs(W * t0[0]) + Math.abs(H * t0[1]);
  const nStops = [];
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
  const alpha = alphaOf(angle, shape);
  const sigma = r2(T.blur * u);
  const dBox = Math.floor((sigma * 3 * Math.sqrt(2 * Math.PI)) / 4 + 0.5);
  const sigmaEff = Math.sqrt(
    dBox % 2 ? (dBox * dBox - 1) / 4 : (3 * dBox * dBox + 2 * dBox - 2) / 12
  );
  const shadeTable = Array.from({ length: 17 }, (_, i) => {
    const x = (2 * i) / 16 - 1;
    return r4(Math.min(1, Math.max(0, 0.5 * (1 + T.shade * (T.shadeSkew * x - x * x + 1 / 3)))));
  });
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

// The colors' discs: the base, then twelve soft discs riding ellipses along the ribs.
function field(geometry, colors) {
  const { width: W, height: H, D } = geometry;
  const rand = dice(geometry.shape ? seedOf(geometry.shape) : T.seed);
  const rows = Math.ceil(T.nPts / T.gridX);
  const discs = [];
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
    const dur = r3(LOOP / Math.abs(laps));
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

// A disc's middle at t, seconds of the loop at speed 1, into out[k] and out[k + 1].
function discAt(geometry, d, t, out, k) {
  const ang = (d.dir * 2 * Math.PI * (t - d.delay)) / d.dur;
  const al = (geometry.alpha * Math.PI) / 180;
  const ex = d.a * Math.cos(ang);
  const ey = d.b * Math.sin(ang);
  out[k] = d.cx + ex * Math.cos(al) - ey * Math.sin(al);
  out[k + 1] = d.cy + ex * Math.sin(al) + ey * Math.cos(al);
}

// The one design scaled to cover a canvas of w by h device pixels, and the part of it the canvas shows.
function cover(width, height, angle, shape) {
  const k = Math.max(width / DESIGN, height / DESIGN);
  const g = geometry(
    Math.max(1, Math.round(DESIGN * k)),
    Math.max(1, Math.round(DESIGN * k)),
    angle,
    shape
  );
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  return { geometry: g, window: { x: Math.round((g.width - w) / 2), y: Math.round((g.height - h) / 2), w, h } };
}

// The field's texture: 1/q of the region, q set so the blur spans about three texels, and its blur as a Gaussian of
// the three boxes' variance, eleven taps a pass (the middle and five bilinear pairs either side).
function plan(geometry) {
  const q = Math.max(1, geometry.sigmaEff / 3);
  const fw = Math.ceil(geometry.region.w / q) + 1;
  const fh = Math.ceil(geometry.region.h / q) + 1;
  const s = geometry.sigmaEff / q;
  const w = [];
  for (let i = 0; i <= 10; i++) w.push(Math.exp(-(i * i) / (2 * s * s)));
  const tot = w[0] + 2 * w.slice(1).reduce((a, b) => a + b, 0);
  const taps = [[0, w[0] / tot]];
  for (let i = 1; i <= 9; i += 2) {
    const a = w[i] / tot;
    const b = w[i + 1] / tot;
    taps.push([i + b / (a + b), a + b]);
  }
  return { q, fw, fh, s, taps };
}

const hexRgb = hex => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};`;

/** The settings a reader edits, the page's first script, as its JavaScript names them. */
export function glassSettingsJs(P: Palette, effect: Effect, angle: number): string {
  return `// The glass's colors (the site takes six along the palette; any number will do), the angle its ribs run at
// (${GLASS_ANGLE} as designed), its shape (0 as designed, up to 999), how fast it plays (1 as designed, 0 holds the first
// frame), frames a second at most, and the seconds it takes to ease in.
const COLORS = [${glassColors(P)
    .map(c => `"${c}"`)
    .join(", ")}];
const ANGLE = ${angle};
const SHAPE = ${effect.look.shape ?? 0};
const SPEED = ${effect.speed};
const FPS = ${effect.fps};
const EASE = ${EFFECT_EASE_S};`;
}

/** Code a level in, as a page writes it inside a function. */
export function indent(text: string): string {
  return text
    .split("\n")
    .map(line => (line ? `  ${line}` : line))
    .join("\n");
}
