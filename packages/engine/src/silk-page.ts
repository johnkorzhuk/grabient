/* The silk as a page that plays it, as the site's player does (ui/silk-player.ts): its design and its arithmetic in
   plain JavaScript, each expression as engine/silk.ts and silk-gl.ts write it, so a page's numbers are the player's to
   the last bit (silk-shader.test.ts holds the two together): the shape's design, the cloth's frame for the angle, the
   folds' rings for the canvas and their swings' keys, the dye's line, the uniforms and the two tables the shader
   reads. The WebGL page runs the player's own shader (silk-gl.ts), the WebGPU page the same pass in WGSL
   (silk-wgsl.ts); the players' clock (effect-page.ts) plays them. The palette comes in as the dye's three rows of
   colors, which a reader may edit. Loaded with the Shader tab's WebGL and WebGPU spellings, never with a page. */
import { EFFECT_EASE_S, type Effect } from "./effect.ts";
import type { Palette } from "./palette.ts";
import {
  bakeDye,
  crestCurve,
  LUT_N,
  MAX_FOLDS,
  PROF_N,
  type Profile,
  profileOf,
  SILK_DESIGN,
  SILK_LOOP,
  SILK_SPAN,
  valleyCurve
} from "./silk.ts";

/** What every text of the silk is, the start of its credit's last line. */
export const SILK_WHAT = "the silk, the palette dyed into folded cloth";

/** The head of the GLSL and the WGSL texts: the credit, then how a frame draws, as comment lines, and its finish where
    it has one: `"grain"` the grain laid in the same pass, `"finish"` the finish's passes after it. */
export function silkTextHead(
  credit: readonly string[],
  finish: "plain" | "grain" | "finish" = "plain"
): string {
  return [
    ...credit,
    "",
    "Each frame is one pass over the canvas: the folds' rings tested by squared distance, a pixel in a ring's band",
    "reading the valley's and the crest's profiles across it, then the dye's three rows at the pixel's place along the",
    "dye's line, lerp(lerp(dyed, shade, valley), light, crest). The tables are baked once a palette; a frame sets only",
    "the rings' middles. The uniforms' values are the page's.",
    ...(finish === "grain"
      ? ["The grain is laid over its bytes in the same pass, a speck a CSS pixel, from its tile."]
      : finish === "finish"
        ? [
            "The pass draws into the finish's frame, which the finish's passes then blur by the soft on a smaller grid,",
            "lay over the palette's gradient where the blur thins the cloth toward its edges, and grain."
          ]
        : [])
  ]
    .map(line => (line ? `// ${line}` : "//"))
    .join("\n");
}

/** A value as JavaScript writes it back, numbers in the shortest spelling that reads as the same double. */
const js = (value: unknown): string =>
  Array.isArray(value)
    ? `[${value.map(js).join(", ")}]`
    : typeof value === "object" && value
      ? `{ ${Object.entries(value)
          .map(([k, v]) => `${k}: ${js(v)}`)
          .join(", ")} }`
      : Object.is(value, -0)
        ? "-0"
        : String(value);

/** The design's numbers a key a line, its folds a line each. */
const designJs = () =>
  `{\n${Object.entries(SILK_DESIGN)
    .map(([k, v]) =>
      k === "folds"
        ? `  folds: [\n${(v as unknown[]).map(f => `    ${js(f)}`).join(",\n")}\n  ]`
        : `  ${k}: ${js(v)}`
    )
    .join(",\n")}\n}`;

/** A profile's stops, the grid index and the alpha in 255ths of each. */
const stopsJs = (p: Profile) => `{ k: ${js(p.k)}, a: ${js(p.a)} }`;

/** The design and its arithmetic in plain JavaScript, the engine's own: everything a frame draws from the settings,
    and nothing that touches the page. */
export function silkModel(): string {
  return `// The design, as the site draws it: cloth units are the covering square's side times SPAN (a 16:9 box's
// half-diagonal over its longer side), the gather and the folds' places in them, each fold's swing in degrees.
const DESIGN = ${designJs()};
const SPAN = ${SILK_SPAN};
const LOOP = ${SILK_LOOP};
const LUT_N = ${LUT_N};
const PROF_N = ${PROF_N};
const MAX_FOLDS = ${MAX_FOLDS};
const DEG = Math.PI / 180;
// The folds' two profiles across a band, the same for every shape: each a line through its stops, a stop's grid index
// (x = -1 + 2k / (PROF_N - 1)) and its alpha in 255ths; the valley's says how far the shade shows, the crest's the light.
const VALLEY = ${stopsJs(profileOf(x => valleyCurve(SILK_DESIGN, x)))};
const CREST = ${stopsJs(profileOf(x => crestCurve(SILK_DESIGN, x)))};

// mulberry32: the design's random numbers, the same everywhere.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// v to \`places\` decimals, as the site writes it
const round = (v, places) => {
  const k = 10 ** places;
  return Math.round(v * k) / k;
};

// A shape's design: 0 the silk as designed, any other number a variation: where the gather sits, how many folds there
// are and how wide, how they bunch and bend, the drape's turn, the dye's tilt and every fold's swing.
function silkDesign(shape) {
  if (!shape) return DESIGN;
  const r = mulberry32(0x9e3779b9 ^ Math.imul(shape | 0, 0x85ebca6b));
  const range = (lo, hi) => lo + (hi - lo) * r();
  const d = JSON.parse(JSON.stringify(DESIGN));
  const flip = r() < 0.5 ? -1 : 1;
  d.gx = range(-3.6, -3.0);
  d.gy = flip * range(1.3, 1.9);
  const n = 6 + Math.floor(r() * 3);
  const w0 = range(0.12, 0.16);
  const grow = range(1.14, 1.32);
  const widths = Array.from({ length: n }, (_, i) => w0 * grow ** i * range(0.88, 1.12));
  const gaps = widths.slice(1).map((w, i) => (widths[i] + w) * range(0.8, 1.08));
  const fit = 1.72 / gaps.reduce((a, b) => a + b, 0);
  const swings = [6, 8, 10, 12, 14, 16, 18, 20];
  for (let i = swings.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [swings[i], swings[j]] = [swings[j], swings[i]];
  }
  let c = range(0.2, 0.26);
  let y = flip * 0.88;
  d.folds = widths.map((w, i) => {
    const f = { y, c: flip * c, w: Math.min(0.46, w * fit), amp: range(0.8, 1.35), swings: swings[i], phase: r() };
    c = Math.min(0.3, Math.max(0.17, c + range(-0.035, 0.035)));
    if (i < gaps.length) y -= flip * gaps[i] * fit;
    return f;
  });
  d.bias = range(-4, 5);
  d.clothTurn = range(-16, 16);
  d.tilt = range(-32, -16);
  return d;
}

// A cubic-bezier timing curve's progress at x (0 to 1): its parameter found by bisection, then its y.
function bezierAt(c, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const [x1, y1, x2, y2] = c;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const u = (lo + hi) / 2;
    const xu = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
    if (xu < x) lo = u;
    else hi = u;
  }
  const u = (lo + hi) / 2;
  return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
}
const toward = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
const splitAt = ([a, b, c, d], t) => {
  const ab = toward(a, b, t);
  const bc = toward(b, c, t);
  const cd = toward(c, d, t);
  const abc = toward(ab, bc, t);
  const bcd = toward(bc, cd, t);
  const m = toward(abc, bcd, t);
  return [[a, ab, abc, m], [m, bcd, cd, d]];
};
// The part of a timing curve between two of its times, a timing curve of its own, to a millionth.
function curveBetween(curve, from, to) {
  const [x1, y1, x2, y2] = curve;
  const x = u => 3 * (1 - u) ** 2 * u * x1 + 3 * (1 - u) * u ** 2 * x2 + u ** 3;
  const at = time => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 64; i++) {
      const mid = (lo + hi) / 2;
      if (x(mid) < time) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const u0 = from <= 0 ? 0 : at(from);
  const u1 = to >= 1 ? 1 : at(to);
  const [before] = splitAt([[0, 0], [x1, y1], [x2, y2], [1, 1]], u1);
  const [, [p0, p1, p2, p3]] = splitAt(before, u1 > 0 ? u0 / u1 : 0);
  const r = v => Math.round(v * 1e6) / 1e6;
  const nx = v => r((v - p0[0]) / (p3[0] - p0[0]));
  const ny = v => r((v - p0[1]) / (p3[1] - p0[1]));
  return [nx(p1[0]), ny(p1[1]), nx(p2[0]), ny(p2[1])];
}
// A fold's swing as keys over the loop: its turning points alternate sides, each stretch eased to the next, and the
// loop starts \`phase\` of a stretch in, so it ends on its first frame.
function swingTrack(f, seed, ease, loop = LOOP) {
  const n = Math.max(2, 2 * Math.round(f.swings / 2));
  const r = mulberry32(seed);
  const turn = Array.from({ length: n }, (_, j) => (j % 2 === 0 ? 1 : -1) * f.amp * (0.55 + 0.45 * r()));
  const seg = loop / n;
  const into = Math.min(0.95, Math.max(0.05, ((f.phase % 1) + 1) % 1));
  const v0 = round(turn[n - 1] + (turn[0] - turn[n - 1]) * bezierAt(ease, into), 4);
  const keys = [{ t: 0, v: v0, e: null }];
  for (let j = 0; j < n; j++)
    keys.push({ t: round((j + 1 - into) * seg, 4), v: round(turn[j], 4), e: j === 0 ? curveBetween(ease, into, 1) : ease });
  keys.push({ t: loop, v: v0, e: curveBetween(ease, 0, into) });
  return keys;
}
// A track's value at t, any t: the loop repeats.
function trackAt(track, t, loop = LOOP) {
  const tt = t - loop * Math.floor(t / loop);
  for (let j = 1; j < track.length; j++) {
    const k1 = track[j];
    if (tt <= k1.t || j === track.length - 1) {
      const k0 = track[j - 1];
      const span = k1.t - k0.t;
      const p = span > 0 ? Math.min(1, Math.max(0, (tt - k0.t) / span)) : 1;
      return k0.v + (k1.v - k0.v) * (k1.e ? bezierAt(k1.e, p) : p);
    }
  }
  return track[0].v;
}

// The cloth in a canvas of W by H pixels at ANGLE and SHAPE: the dye's line, the gather and each fold's ring (its
// middle at rest, its radius a whole number of its band's periods and a half, its band's half-width) with its swing.
function silkScene(angle, shape, W, H) {
  const d = silkDesign(shape);
  const side = Math.max(W, H);
  const D = SPAN * side;
  const ta = (d.clothTurn + angle - 90) * DEG;
  const ex = [Math.cos(ta), Math.sin(ta)];
  const ey = [Math.sin(ta), -Math.cos(ta)];
  const at = (x, y) => [W / 2 + D * (x * ex[0] + y * ey[0]), H / 2 + D * (x * ex[1] + y * ey[1])];
  const [gx, gy] = at(d.gx, d.gy).map(v => round(v, 2));
  const a = (angle + d.tilt) * DEG;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const half = (side * (Math.abs(dx) + Math.abs(dy))) / 2;
  const folds = d.folds.map((f, i) => {
    const psi = Math.atan2(f.y - d.gy, -d.gx) + d.bias * DEG;
    const nxc = -Math.sin(psi);
    const nyc = Math.cos(psi);
    const s = f.c >= 0 ? 1 : -1;
    const X = at(0, f.y);
    const nx = s * (nxc * ex[0] + nyc * ey[0]);
    const ny = s * (nxc * ex[1] + nyc * ey[1]);
    const P = round(2 * f.w * D, 4);
    const w = P / 2;
    const r0 = D / Math.max(Math.abs(f.c), 1e-3);
    const n = Math.max(1, Math.round(r0 / P - 0.5));
    const R = (n + 0.5) * P;
    return { cx: round(X[0] + nx * R, 2), cy: round(X[1] + ny * R, 2), R, w, n, track: swingTrack(f, 0x5111c + 977 * i, d.ease) };
  });
  return {
    W,
    H,
    x1: round(W / 2 - dx * half, 2),
    y1: round(H / 2 - dy * half, 2),
    x2: round(W / 2 + dx * half, 2),
    y2: round(H / 2 + dy * half, 2),
    gx,
    gy,
    folds
  };
}

// The rings' middles at t: each turned about the gather by its track, into out[2i] and out[2i + 1].
function centresAt(scene, t, out) {
  for (let i = 0; i < scene.folds.length; i++) {
    const f = scene.folds[i];
    const th = trackAt(f.track, t) * DEG;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const px = f.cx - scene.gx;
    const py = f.cy - scene.gy;
    out[2 * i] = scene.gx + c * px - s * py;
    out[2 * i + 1] = scene.gy + s * px + c * py;
  }
}

// The shader's uniforms, as the player sets them: D, the dye's line as a texel coordinate and the canvas's height;
// G, each ring's band as squared radii; F, each ring's middle at t and its profile's texel mapping.
function sceneUniforms(scene, S) {
  const dx = scene.x2 - scene.x1;
  const dy = scene.y2 - scene.y1;
  const k = (LUT_N - 1) / (LUT_N * (dx * dx + dy * dy));
  S[0] = dx * k;
  S[1] = dy * k;
  S[2] = -(scene.x1 * dx + scene.y1 * dy) * k + 0.5 / LUT_N;
  S[3] = scene.H;
}
function bandUniforms(scene, G) {
  for (let i = 0; i < MAX_FOLDS; i++) {
    const f = scene.folds[i];
    G[2 * i] = f ? (f.R - f.w) ** 2 : 0;
    G[2 * i + 1] = f ? (f.R + f.w) ** 2 : 0;
  }
}
const CENTRES = new Float64Array(2 * MAX_FOLDS);
function foldUniforms(scene, t, F) {
  centresAt(scene, t, CENTRES);
  const g = (PROF_N - 1) / PROF_N;
  for (let i = 0; i < MAX_FOLDS; i++) {
    const o = 4 * i;
    const f = scene.folds[i];
    if (!f) {
      F[o] = F[o + 1] = F[o + 2] = F[o + 3] = 0;
      continue;
    }
    F[o] = CENTRES[2 * i];
    F[o + 1] = CENTRES[2 * i + 1];
    F[o + 2] = g / (2 * f.w);
    F[o + 3] = ((1 - f.R / f.w) / 2) * g + 0.5 / PROF_N;
  }
}

// The two tables: the dye's rows (dyed, in shade, in the light) as a 32 by 3 texture of bytes, and the profiles (valley,
// crest) as a 65 by 1 texture of two channels, each the line through its stops at every grid point.
const hexBytes = hex => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16));
function colorTexels() {
  const rows = [BASE, SHADE, LIFT];
  const out = new Uint8Array(4 * LUT_N * 3);
  for (let r = 0; r < 3; r++)
    for (let i = 0; i < LUT_N; i++) {
      const o = 4 * (r * LUT_N + i);
      out.set(hexBytes(rows[r][i]), o);
      out[o + 3] = 255;
    }
  return out;
}
function profileTable({ k: keep, a }) {
  const table = new Float64Array(PROF_N);
  for (let j = 0; j < keep.length - 1; j++) {
    const k0 = keep[j];
    const k1 = keep[j + 1];
    for (let k = k0; k <= k1; k++) table[k] = (a[j] + ((a[j + 1] - a[j]) * (k - k0)) / (k1 - k0)) / 255;
  }
  return table;
}
function profileTexels() {
  const valley = profileTable(VALLEY);
  const crest = profileTable(CREST);
  const px = new Float32Array(2 * PROF_N);
  for (let k = 0; k < PROF_N; k++) {
    px[2 * k] = valley[k];
    px[2 * k + 1] = crest[k];
  }
  return px;
}`;
}

/** The settings a reader edits, the page's first script: the dye's three rows of colors, the angle, the shape, the
    speed, the frame rate and the ease. */
export function silkSettings(P: Palette, effect: Effect, angle: number): string {
  const dye = bakeDye(P, SILK_DESIGN);
  const row = (colors: readonly string[]) =>
    `[\n${Array.from({ length: colors.length / 8 }, (_, i) =>
      colors
        .slice(8 * i, 8 * i + 8)
        .map(c => `"${c}"`)
        .join(", ")
    )
      .map(line => `  ${line}`)
      .join(",\n")}\n]`;
  return `// The palette's ${LUT_N} colors along the dye, first to last: as dyed, in the folds' shade and in their light.
const BASE = ${row(dye.base)};
const SHADE = ${row(dye.shade)};
const LIFT = ${row(dye.lift)};
// The angle the cloth and its dye turn to (90 as designed), its shape (0 as designed, up to 999), how fast it plays
// (1 as designed: a loop lasts ${SILK_LOOP} s; 0 holds the first frame), frames a second at most, and the seconds it takes
// to ease in.
const ANGLE = ${angle};
const SHAPE = ${effect.look.shape ?? 0};
const SPEED = ${effect.speed};
const FPS = ${effect.fps};
const EASE = ${EFFECT_EASE_S};`;
}
