/* The rosette as a page that plays it, as the site's player does (ui/rosette-player.ts): its design and its arithmetic
   in plain JavaScript, each expression as engine/rosette.ts, rosette-gl.ts, curve.ts and color.ts write it, so a page's
   numbers are the player's to the last bit (rosette-shader.test.ts holds the two together): the palette's colors from
   its keyframes, the shape's design widened until no gap shows, the lattice and the lens, each ring's gradient, the
   petals a canvas shows, and the uniforms. The WebGL page runs the player's own shader (rosette-gl.ts), the WebGPU page
   the same pass in WGSL (rosette-wgsl.ts); the players' clock (effect-page.ts) plays them. Loaded with the Shader tab's
   WebGL and WebGPU spellings, never with a page. */
import { encodePalette } from "./codec.ts";
import { EFFECT_EASE_S, type Effect } from "./effect.ts";
import type { Palette } from "./palette.ts";
import { HEART_STOPS, ROSETTE_DENSITY, ROSETTE_DESIGN, ROSETTE_SPAN } from "./rosette.ts";
import { ROSETTE_MAX_KEYS } from "./rosette-gl.ts";

/** What every text of the rosette is, the start of its credit's last line. */
export const ROSETTE_WHAT = "the rosette, the palette in rings of petals on a golden spiral";

/** A number as JavaScript source that reads back as the same double, -0 kept. */
const jsNumber = (n: number): string => (Object.is(n, -0) ? "-0" : String(n));
const js = (value: unknown): string =>
  Array.isArray(value)
    ? `[${value.map(js).join(", ")}]`
    : typeof value === "object" && value
      ? `{ ${Object.entries(value)
          .map(([k, v]) => `${k}: ${js(v)}`)
          .join(", ")} }`
      : typeof value === "number"
        ? jsNumber(value)
        : JSON.stringify(value);

/** The settings a reader edits, the page's first script: the palette's keyframes, the angle, the shape, the speed, the
    frame rate and the ease. */
export function rosetteSettings(P: Palette, effect: Effect, angle: number): string {
  const anchors = P.anchors
    .map(
      a =>
        `  [${[a.l, a.c, a.h, ...(a.own === undefined ? [] : [a.own])].map(jsNumber).join(", ")}]`
    )
    .join(",\n");
  return `// The palette (its seed ${encodePalette(P)}): its keyframes in OKLCH, lightness, chroma, hue in degrees, and a near
// gray's own tint where it keeps one.
const ANCHORS = [
${anchors}
];
// The angle the flower turns to (90 as designed), its shape (0 as designed, up to 999: the petals' count, the rings'
// period, how they read the palette), how fast it plays (1 as designed, 0 holds the first frame), frames a second at
// most, and the seconds it takes to ease in.
const ANGLE = ${angle};
const SHAPE = ${effect.look.shape ?? 0};
const SPEED = ${jsNumber(effect.speed)};
const FPS = ${jsNumber(effect.fps)};
const EASE = ${jsNumber(EFFECT_EASE_S)};`;
}

/** The design and its arithmetic in plain JavaScript, the engine's own: everything a frame draws from the settings,
    and nothing that touches the page. */
export function rosetteModel(): string {
  return `// The palette's colors: its keyframes' Catmull-Rom curve in OKLCH, fitted to sRGB at constant lightness and hue.
const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clamp01 = v => clamp(v, 0, 1);
function catmull(values, t) {
  const n = values.length;
  if (n === 1) return values[0];
  const x = clamp01(t) * (n - 1);
  const i = Math.min(n - 2, Math.floor(x));
  const u = x - i;
  const p0 = values[Math.max(0, i - 1)];
  const p1 = values[i];
  const p2 = values[i + 1];
  const p3 = values[Math.min(n - 1, i + 2)];
  return p1 + 0.5 * u * (p2 - p0 + u * (2 * p0 - 5 * p1 + 4 * p2 - p3 + u * (3 * (p1 - p2) + p3 - p0)));
}
function sampleLCH(t) {
  const L = clamp01(catmull(ANCHORS.map(a => a[0]), t));
  const C = Math.max(0, catmull(ANCHORS.map(a => a[1]), t));
  const H = catmull(ANCHORS.map(a => a[2]), t);
  if (!ANCHORS.some(a => a[3] !== undefined)) return [L, C, H];
  // a near gray's tint rides along as a curve of its own in OKLab
  const ride = f => catmull(ANCHORS.map(a => (a[3] === undefined ? 0 : a[1] * (f(a[3] * DEG) - f(a[2] * DEG)))), t);
  const x = C * Math.cos(H * DEG) + ride(Math.cos);
  const y = C * Math.sin(H * DEG) + ride(Math.sin);
  const turn = Math.atan2(y, x) / DEG - H;
  return [L, Math.hypot(x, y), H + turn - 360 * Math.round(turn / 360)];
}
const toLinear = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toEncoded = v => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
function oklabToLinear(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ];
}
function linOklab(r, g, b) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ];
}
const inGamut = rgb => rgb.every(v => v >= -1e-4 && v <= 1 + 1e-4);
function fitChroma(L, C, H) {
  L = clamp01(L);
  C = Math.max(0, C);
  const ca = Math.cos(H * DEG);
  const sa = Math.sin(H * DEG);
  if (inGamut(oklabToLinear(L, C * ca, C * sa))) return C;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (inGamut(oklabToLinear(L, C * m * ca, C * m * sa))) lo = m;
    else hi = m;
  }
  return C * lo;
}
function lchToSrgb(L, C, H) {
  L = clamp01(L);
  const c = fitChroma(L, C, H);
  return oklabToLinear(L, c * Math.cos(H * DEG), c * Math.sin(H * DEG)).map(v => clamp01(toEncoded(clamp01(v))));
}
function srgbToLch(rgb) {
  const [L, a, b] = linOklab(toLinear(rgb[0]), toLinear(rgb[1]), toLinear(rgb[2]));
  return [L, Math.hypot(a, b), Math.atan2(b, a) / DEG];
}
const sampleSrgb = t => lchToSrgb(...sampleLCH(t));

// The design, as the site draws it: lengths in the lattice's cell sides unless said, the heart's glow in shares of S
// (a 16:9 box's half-diagonal, as its longer side frames the flower).
const DESIGN = ${js(ROSETTE_DESIGN)};
const GROWTH = ${js(ROSETTE_DENSITY[60].growth)};
const DENSITIES = ${js(Object.values(ROSETTE_DENSITY).map(d => d.growth))};
const SPAN = ${ROSETTE_SPAN};
const MAX_KEYS = ${ROSETTE_MAX_KEYS};
const HEART_STOPS = ${js(HEART_STOPS)};
const TAU = 2 * Math.PI;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const FIB = [1, 2, 3, 5, 8, 13, 21, 34, 55];
const residual = F => {
  const a = F * GOLDEN;
  return a - TAU * Math.round(a / TAU);
};
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
// A shape's design: 0 the rosette as designed, any other a variation of the coloring, the density and the period;
// every loop lasts as long as its rings take to grow by one period, and each petal widens until no gap shows.
function rosetteDesign(shape) {
  const paced = d => ({ ...d, loop: Math.round((DESIGN.loop * d.growth * d.flow) / (DESIGN.growth * DESIGN.flow)) });
  if (!shape) return fit(paced({ ...DESIGN, growth: GROWTH }));
  const r = dice(0x9e3779b9 ^ Math.imul(shape, 0x85ebca6b));
  const lerp = (a, b) => a + (b - a) * r();
  const pick = r();
  const growth = pick < 0.25 ? DENSITIES[0] : pick < 0.75 ? DENSITIES[1] : DENSITIES[2];
  const flow = r() < 0.6 ? 34 : 21;
  const d = {
    ...DESIGN,
    growth,
    flow,
    coloring: r() < 0.7 ? "rings" : "angular",
    hand: r() < 0.5 ? 1 : -1,
    reverse: r() < 0.35,
    phase: Math.floor(r() * flow),
    base: lerp(0.95, 1.15),
    tip: lerp(0.9, 1.1),
    half: lerp(0.44, 0.5),
    grad: { ...DESIGN.grad, cv: lerp(0.25, 0.75) },
    turn0: lerp(0, TAU)
  };
  return fit(paced(d));
}
function fit(d) {
  for (let i = 0; i < 16 && gapOf(d) > 0; i++) d.half += 0.01;
  return d;
}
// The lattice: petal n at log radius k n and turn alpha n, a cell's side, the loop's turn and zoom, the two shortest
// steps.
function latticeOf(d) {
  const k = d.growth;
  const vec = F => [k * F, d.hand * residual(F)];
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
// The petal in its own frame, its anchor at (1, 0): a lens of two arcs from x0 to x1, half-width w.
function lensOf(d, L) {
  const s = L.side;
  const x0 = 1 - d.base * s;
  const x1 = 1 + d.tip * s;
  const c = (x1 - x0) / 2;
  const w = d.half * s;
  const rho = (c * c + w * w) / (2 * w);
  const xm = (x0 + x1) / 2;
  return { x0, x1, w, xm, d: rho - w, rho, reach: Math.max(1 - x0, x1 - 1, Math.hypot(Math.abs(xm - 1) + c, w)), outer: x1 };
}
function lensSd(l, qx, qy) {
  const lx = qx - l.xm;
  const ly = Math.abs(qy) + l.d;
  return Math.sqrt(lx * lx + ly * ly) - l.rho;
}
function gapOf(d, n = 20, margin = 0.012) {
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

// Each ring's gradient: a petal's slot reads one place on the palette, rings out and back over the period, or round
// the flower by its spoke's angle; each place's color shaded and tinted at the design's stops, in bytes.
function shade(c, f, chroma = 1.08) {
  const [L, C, H] = srgbToLch(c);
  const h = ((H % 360) + 360) % 360;
  let turn = 0;
  if (C > 0.02 && h > 60 && h < 140) {
    const w = (h < 70 ? (h - 60) / 10 : h > 130 ? (140 - h) / 10 : 1) * Math.min(1, (C - 0.02) / 0.03);
    turn = -w * (h - 55) * Math.min(1, (1 - f) * 2.4);
  }
  return lchToSrgb(L * f, C * chroma, H + turn);
}
function tint(c, f) {
  const [L, C, H] = srgbToLch(c);
  return lchToSrgb(L + (1 - L) * f, C * (1 - 0.35 * f + 0.4 * (1 - L) * (1 - L)), H);
}
const byte = v => Math.round(Math.min(1, Math.max(0, v)) * 255) / 255;
const bytes = c => [byte(c[0]), byte(c[1]), byte(c[2])];
const slotOf = (d, n) => (((n + d.phase) % d.flow) + d.flow) % d.flow;
function slotT(d, slot) {
  if (d.coloring === "angular") {
    const m = slot - d.phase;
    const n = m - d.flow * Math.round((m + 20) / d.flow);
    const a = (d.hand * GOLDEN * n + d.turn0) / TAU;
    return 1 - Math.abs(2 * (a - Math.floor(a)) - 1);
  }
  return 1 - Math.abs((2 * slot) / d.flow - 1);
}
function rosetteColors(d) {
  const at = t => sampleSrgb(Math.min(1, Math.max(0, d.reverse ? 1 - t : t)));
  const grads = [];
  const byT = new Map();
  const keyOfSlot = [];
  for (let slot = 0; slot < d.flow; slot++) {
    const t = Math.round(slotT(d, slot) * 1e6) / 1e6;
    let key = byT.get(t);
    if (key === undefined) {
      key = grads.length;
      byT.set(t, key);
      const c = at(t);
      grads.push(
        d.stops.map(([, tone]) =>
          bytes(tone < 0 ? shade(c, 1 + tone * (1 - d.shadeF), 1 - 0.1 * tone) : tone > 0 ? tint(c, tone * d.tintF) : c)
        )
      );
    }
    keyOfSlot.push(key);
  }
  const h0 = at(0);
  const Lh = srgbToLch(h0)[0];
  const heart = bytes(tint(h0, 0.35 * Lh * Lh));
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

// The flower in a canvas of W by H pixels at ANGLE and SHAPE: its design turned to the angle, the lattice, the lens, the
// rings' colors and its scale S, the box's longer side times SPAN.
function rosetteScene(angle, shape, W, H) {
  const design = { ...rosetteDesign(shape) };
  design.turn0 += ((angle - 90) * Math.PI) / 180;
  const lattice = latticeOf(design);
  return { design, lattice, lens: lensOf(design, lattice), colors: rosetteColors(design), box: { width: W, height: H }, S: SPAN * Math.max(W, H) };
}
const groupAt = (sc, tau) => ({ zoom: Math.exp(sc.lattice.k * sc.design.flow * tau), turn: sc.lattice.beta * tau });
function inBox(sc, r, th, pad = 2) {
  const ax = r * Math.cos(th);
  const ay = r * Math.sin(th);
  const gx = Math.max(0, Math.abs(ax) - sc.box.width / 2);
  const gy = Math.max(0, Math.abs(ay) - sc.box.height / 2);
  return gx * gx + gy * gy <= (r * sc.lens.reach + pad) ** 2;
}
// The petals any time of the loop shows: from the one whose tip reaches out of the heart's middle at the loop's end to
// the last whose reach meets the box at one of 25 times of the loop.
function rosettePetals(sc) {
  const { k, alpha } = sc.lattice;
  const d = sc.design;
  const L = sc.lens;
  const inner = d.heartIn * sc.S;
  const lo = Math.ceil(Math.log(inner / (sc.S * L.outer)) / k) - d.flow;
  const near = Math.max(0.02, 1 - L.reach);
  const corner = Math.hypot(sc.box.width, sc.box.height) / 2 / sc.S;
  const hi = Math.floor(Math.log(corner / near) / k) + 1;
  const out = [];
  const steps = 24;
  for (let n = hi; n >= lo; n--) {
    const r = sc.S * Math.exp(k * n);
    const th = alpha * n + d.turn0;
    let keep = false;
    for (let s = 0; s <= steps && !keep; s++) {
      const g = groupAt(sc, s / Math.max(1, steps));
      keep = inBox(sc, r * g.zoom, th + g.turn, 4);
    }
    if (keep) out.push(n);
  }
  return out;
}
// The most a lens reaches round from its anchor's direction, radians: its arcs sampled, with a margin.
function angMaxOf(sc) {
  const L = sc.lens;
  let most = 0;
  const a0 = Math.atan2(0 + L.d, L.x0 - L.xm);
  const a1 = Math.atan2(0 + L.d, L.x1 - L.xm);
  for (let i = 0; i <= 256; i++) {
    const a = a0 + ((a1 - a0) * i) / 256;
    const x = L.xm + L.rho * Math.cos(a);
    const y = -L.d + L.rho * Math.sin(a);
    most = Math.max(most, Math.atan2(y, x));
  }
  return most + 0.05;
}
// The shader's uniforms, as the player sets them, but uGroup, which the loop's phase sets (rosetteGroup).
function rosetteUniforms(sc) {
  const d = sc.design;
  const L = sc.lens;
  const petals = rosettePetals(sc);
  const lo = petals.reduce((m, n) => Math.min(m, n), Infinity);
  const hi = petals.reduce((m, n) => Math.max(m, n), -Infinity);
  const stop = new Float32Array(MAX_KEYS * 4 * 3);
  sc.colors.grads.forEach((g, k) => {
    g.forEach((c, j) => {
      stop.set(c, (k * 4 + j) * 3);
    });
  });
  const keyOfSlot = new Int32Array(MAX_KEYS);
  keyOfSlot.set(sc.colors.keyOfSlot.slice(0, MAX_KEYS));
  return {
    uBox: [sc.box.width, sc.box.height],
    uS: sc.S,
    uK: sc.lattice.k,
    uEk: Math.exp(-sc.lattice.k),
    uAlpha: sc.lattice.alpha,
    uTurn0: d.turn0,
    uRange: [lo, hi],
    uLens: [L.x0, L.x1, L.w, L.rho],
    uLensMid: [L.xm, L.d],
    uAngMax: angMaxOf(sc),
    uGrad: [d.grad.cu, d.grad.cv, d.grad.ru, d.grad.rv],
    uStopAt: [d.stops[0][0], d.stops[1][0], d.stops[2][0], d.stops[3][0]],
    uStop: stop,
    uKeyOfSlot: keyOfSlot,
    uFlow: d.flow,
    uPhase: d.phase,
    uGround: sc.colors.ground,
    uHeart: sc.colors.heart,
    uHeartR: [d.heartIn, d.heartOut]
  };
}
// uGroup at t seconds of the loop at speed 1: the loop's zoom (its log) and the turn the petals' group has made.
function rosetteGroup(sc, t) {
  const L = sc.design.loop;
  const tau = t / L - Math.floor(t / L);
  return [sc.lattice.k * sc.design.flow * tau, sc.lattice.beta * tau];
}`;
}
