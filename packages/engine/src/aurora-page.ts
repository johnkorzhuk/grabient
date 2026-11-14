/* The aurora as a page that plays it, as the site's player does (ui/aurora-player.ts): its arithmetic in plain
   JavaScript, each expression as engine/aurora.ts, aurora-path.ts and aurora-gl.ts write it, so a page's numbers are
   the player's to the last bit (aurora-shader.test.ts holds the two together): the noise's two tiles, the ramp the
   palette is read through, the range's pieces its path makes, the light its shape draws, all of it turned by the
   angle, then the table and the uniforms the pass reads, and each frame's share of the loop. The WebGL page runs the
   player's own pass (aurora-gl.ts), the WebGPU page the same pass in WGSL (aurora-wgsl.ts); the players' clock
   (effect-page.ts) plays them. The palette comes in as its stops, the range as its path and its color, which a reader
   may edit; a range that lets the page through shows the page's own, over which each page's canvas lays itself
   premultiplied. Loaded with the Shader tab's WebGL and WebGPU spellings, never with a page. */
import {
  AURORA_FAN,
  AURORA_HALF,
  AURORA_LIGHT,
  AURORA_LOOP,
  AURORA_RAMP,
  AURORA_SHAPES,
  AURORA_SLOTS,
  AURORA_SPAN,
  AURORA_TILE,
  auroraStops,
  AURORA_PAGE_NUMBERS as M
} from "./aurora.ts";
import { AURORA_SHEETS, AURORA_TABLE } from "./aurora-gl.ts";
import { AURORA_DESIGNED_PATH, AURORA_PATH_MOST } from "./aurora-path.ts";
import { EFFECT_EASE_S, type Effect } from "./effect.ts";
import type { Palette } from "./palette.ts";

/** What every text of the aurora is, the start of its credit's last line: behind a clear range as designed, or behind
    one of the color its look names. */
export const auroraWhat = (bg: string | null): string =>
  `the aurora, the palette as light rising behind ${bg === null ? "a clear range" : `a range of ${bg}`}`;

const hex = (rgb: readonly number[]) =>
  `#${rgb
    .map(v =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;

/** The palette's colors a page starts from, as the site reads them (aurora.ts auroraStops): its stops along its curve,
    as hex. */
export const auroraColors = (P: Palette): string[] => auroraStops(P).map(hex);

/** The head of the GLSL and the WGSL texts: the credit, then how a frame draws, as comment lines, and its finish where
    it has one: `"grain"` the grain laid in the pass, `"finish"` the finish's passes after it. */
export function auroraTextHead(
  credit: readonly string[],
  finish: "plain" | "grain" | "finish" = "plain"
): string {
  return [
    ...credit,
    "",
    "Each frame is one pass: at each pixel its place in the picture, 16 by 9 in the square of the canvas's longer side,",
    "turned by the angle; the range's edge under it, from the path's pieces in the table, and how much of the light",
    "shows there, soft across the edge and across an upright wall; then six sheets of one noise, two tiles read between",
    "their pixels by straight lines and repeating, stretched along the rays of a fan and each slid whole tiles a loop,",
    "multiplied into shafts, their halos, fine shafts and hot spots, gathered by a slow sheet, rising from the range and",
    "thinning away; that light read through the palette's ramp, the table's first row; and the range in front, its",
    "color at its cover, premultiplied. A frame sets only uTime, the loop's share. The uniforms' and the textures'",
    "values are the page's.",
    ...(finish === "grain"
      ? ["The grain is laid over its bytes in the pass, a speck a CSS pixel, from its tile."]
      : finish === "finish"
        ? [
            "The pass draws into the finish's frame, which the finish's passes then blur by the soft on a smaller grid,",
            "lay over the palette's gradient where the blur thins the picture toward its edges, and grain."
          ]
        : [])
  ]
    .map(line => (line ? `// ${line}` : "//"))
    .join("\n");
}

/** A number as JavaScript source that reads back as the same double, -0 kept. */
const jsNumber = (n: number): string => (Object.is(n, -0) ? "-0" : String(n));

/* the sheets as designed, as the page writes them */
const sheetsJs = () =>
  AURORA_SHEETS.map(name => {
    const s = AURORA_LIGHT[name];
    return `  ${name}: { across: ${jsNumber(s.across)}, along: ${jsNumber(s.along)}, u0: ${jsNumber(s.u0)}, v0: ${jsNumber(s.v0)}, du: ${jsNumber(s.du)}, dv: ${jsNumber(s.dv)} }`;
  }).join(",\n");

/** The aurora's arithmetic in plain JavaScript, the engine's own: everything a frame draws from the settings, and
    nothing that touches the page. */
export function auroraModel(): string {
  const S = AURORA_SHAPES;
  return `// The aurora, as the site draws it: a picture 16 by 9, 1 its height, x from its middle and y up from its bottom, set in
// the square of the canvas's longer side and turned about its middle by the angle, the model going on past the
// picture's sides, so every canvas shows the one picture its longer side frames. Its light is six sheets of one noise
// read along the rays of a fan, each sliding whole tiles a loop, read through a ramp of the palette; in front stands
// the range, still, its outline the path.
const LOOP = ${AURORA_LOOP};
const SPAN = ${jsNumber(AURORA_SPAN)};
const HALF = ${jsNumber(AURORA_HALF)};
const TILE = ${AURORA_TILE};
const CELLS = ${M.cells};
const TILE_SEED = ${M.tileSeed};
const RAMP = ${AURORA_RAMP};
const LOW = ${M.low};
const TIP = ${M.tip};
const BEND = ${M.bend};
const WALL_EASE = ${M.wallEase};
const SLOTS = ${AURORA_SLOTS};
const TABLE_ROWS = ${AURORA_TABLE.height};
const RIDGE = ${M.ridge};
const PATH_MOST = ${AURORA_PATH_MOST};
const DESIGNED_PATH = "${AURORA_DESIGNED_PATH}";
// The point the rays fan from, under the picture; what a shape may change, each from its least to its most (the fan's
// depth and lean, the shafts' width, the gathering's span), and the height the shafts are kept as wide at.
const FAN = { x: ${jsNumber(AURORA_FAN.x)}, y: ${jsNumber(AURORA_FAN.y)} };
const SHAPES = {
  depth: [${S.depth.join(", ")}],
  lean: [${S.lean.join(", ")}],
  wide: [${S.wide.join(", ")}],
  gather: [${S.gather.join(", ")}]
};
const KEEP_AT = ${M.keepAt};
// The six sheets as designed, in the order the pass reads them: how many tiles each spans a radian across the fan (the
// hot spots' a unit across the picture) and a unit along, where it starts, and the whole tiles it slides a loop each
// way, so the loop's last frame is its first.
const SHEETS = {
${sheetsJs()}
};
const SHEET_ORDER = ${JSON.stringify(AURORA_SHEETS)};
const DEG = Math.PI / 180;
const clamp01 = v => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => {
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};

// An integer hash to 0 up to 1, in 32-bit unsigned arithmetic: the noise's lattices and every shape's numbers.
function auroraHash(n, seed) {
  let h = (Math.imul(n | 0, 0x27d4eb2d) ^ Math.imul(seed | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

// The noise: two tiles of TILE by TILE pixels, four bytes each, the same for every aurora. Each channel of the first is
// a smooth noise, three lattices of random numbers (the coarsest CELLS a side) read smoothly between and added; the
// second is the first made soft, averaged over its neighbours across and down three times over. Each is stretched to
// fill 0 to 255.
function stretch(f, out, c) {
  let lo = 1e9;
  let hi = -1e9;
  for (let i = 0; i < f.length; i++) {
    lo = Math.min(lo, f[i]);
    hi = Math.max(hi, f[i]);
  }
  for (let i = 0; i < f.length; i++) out[i * 4 + c] = Math.floor(((f[i] - lo) / (hi - lo)) * 255 + 0.5);
}
function noiseChannel(out, c, seed) {
  const N = TILE;
  const f = new Float32Array(N * N);
  const i0 = new Int32Array(N);
  const i1 = new Int32Array(N);
  const w = new Float64Array(N);
  for (const [cells, amp] of [[CELLS, 1], [CELLS * 2, 0.42], [CELLS * 4, 0.16]]) {
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
  }
  stretch(f, out, c);
}
function softChannel(src, out, c, radius) {
  const N = TILE;
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
    for (let x = 0; x < N; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += b[((k + N) % N) * N + x];
      for (let y = 0; y < N; y++) {
        a[y * N + x] = sum / span;
        sum += b[((y + radius + 1) % N) * N + x] - b[((y - radius + N) % N) * N + x];
      }
    }
  }
  stretch(a, out, c);
}
function auroraTiles() {
  const noise = new Uint8Array(TILE * TILE * 4);
  const soft = new Uint8Array(TILE * TILE * 4);
  for (let c = 0; c < 4; c++) noiseChannel(noise, c, TILE_SEED);
  for (let c = 0; c < 4; c++) softChannel(noise, soft, c, 5);
  return { noise, soft };
}

// Color: sRGB to OKLCH and back, by OKLab (Bjorn Ottosson's conversion), as the site converts.
const toLinear = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toEncoded = v => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
function srgbToLch(rgb) {
  const r = toLinear(rgb[0]);
  const g = toLinear(rgb[1]);
  const b = toLinear(rgb[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A) / DEG];
}
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
const inGamut = rgb => rgb.every(v => v >= -1e-4 && v <= 1 + 1e-4);
// OKLCH to sRGB, its chroma lowered at constant lightness and hue until the color fits.
function lchToSrgb(L, C, H) {
  L = clamp01(L);
  let c = Math.max(0, C);
  const ca = Math.cos(H * DEG);
  const sa = Math.sin(H * DEG);
  if (!inGamut(oklabToLinear(L, c * ca, c * sa))) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      const m = (lo + hi) / 2;
      if (inGamut(oklabToLinear(L, c * m * ca, c * m * sa))) lo = m;
      else hi = m;
    }
    c *= lo;
  }
  return oklabToLinear(L, c * Math.cos(H * DEG), c * Math.sin(H * DEG)).map(v => clamp01(toEncoded(clamp01(v))));
}
const byte = v => Math.floor(clamp01(v) * 255 + 0.5) / 255;
const colorOf = hex => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255);

// The ramp the light is read through, RAMP colors from the least light to the hottest: the palette's stops from its
// darker end to its lighter, every one of them as it is, its later colors taking more of the light (LOW, TIP and
// BEND), then on past its last toward white.
function auroraRamp() {
  const n = STOPS.length;
  const stops = new Float64Array(n * 3);
  const light = new Float64Array(n);
  let lMax = -1;
  for (let i = 0; i < n; i++) {
    const c = colorOf(STOPS[i]);
    stops.set(c, i * 3);
    light[i] = srgbToLch(c)[0];
    lMax = Math.max(lMax, light[i]);
  }
  const flip = light[0] > light[n - 1];
  const at = v => {
    const x = clamp01(flip ? 1 - v : v) * (n - 1);
    const i = Math.min(n - 2, Math.floor(x));
    const f = x - i;
    return [0, 1, 2].map(k => stops[i * 3 + k] + (stops[i * 3 + 3 + k] - stops[i * 3 + k]) * f);
  };
  const end = at(1);
  const [Ll, Cl, Hl] = srgbToLch(end);
  const hot = lchToSrgb(
    Math.min(0.985, Math.max(Ll + 0.14, Ll * 1.18, lMax + 0.05)),
    Math.min(Cl * 0.35, 0.04),
    Hl
  ).map(byte);
  const ramp = new Float32Array(RAMP * 3);
  for (let i = 0; i < RAMP; i++) {
    const l = i / (RAMP - 1);
    if (l <= TIP) ramp.set(at(1 - (1 - clamp01((l - LOW) / (TIP - LOW))) ** BEND), i * 3);
    else {
      const f = (l - TIP) / (1 - TIP);
      ramp.set(end.map((v, k) => v + (hot[k] - v) * f), i * 3);
    }
  }
  return ramp;
}

// The range's path read: its heights (0 to 1), each one's place (0 to 1 across, never falling; two at one place an
// upright wall) and, of each piece between two heights, whether a curve joins them. Null for anything that is no
// path, which draws the designed range.
const NUMBER = /^(?:100|\\d{1,2})(?:\\.\\d)?$/;
function auroraPathParts(path) {
  if (typeof path !== "string") return null;
  let heights = [];
  let places = [];
  let curved = [];
  let curve = null;
  let word = false;
  let placed = null;
  for (const t of path.split(",")) {
    if (t === "line" || t === "curve") {
      if (word) return null;
      curve = t === "curve";
      word = true;
      continue;
    }
    const at = t.indexOf(":");
    const h = at < 0 ? t : t.slice(at + 1);
    if (curve === null || !NUMBER.test(h) || Number(h) > 100) return null;
    if (placed === null) placed = at >= 0;
    else if (placed !== at >= 0) return null;
    if (at >= 0) {
      const x = t.slice(0, at);
      if (!NUMBER.test(x) || Number(x) > 100) return null;
      const place = Math.round(Number(x) * 10);
      if (places.length && place < places[places.length - 1]) return null;
      places.push(place);
    }
    if (heights.length) curved.push(curve);
    heights.push(Number(h) / 100);
    word = false;
  }
  if (word || heights.length < 2 || heights.length > PATH_MOST) return null;
  if (!placed)
    return { heights, places: heights.map((_, i) => i / (heights.length - 1)), curved, placed: false };
  const keep = heights.map((h, i) => !(i && places[i] === places[i - 1] && h === heights[i - 1]));
  if (keep[1] !== false && places[1] === 0) keep[0] = false;
  const end = heights.length - 1;
  if (keep[end] && places[end - 1] === 1000 && keep[end - 1]) keep[end] = false;
  curved = curved.filter((_, k) => (keep[0] ? keep[k + 1] : k > 0 && keep[k + 1]));
  heights = heights.filter((_, i) => keep[i]);
  places = places.filter((_, i) => keep[i]);
  if (heights.length < 2) return null;
  for (let i = 2; i < places.length; i++) if (places[i] === places[i - 2]) return null;
  return {
    heights,
    places: places.map(x => x / 1000),
    curved: curved.map((c, k) => c && places[k + 1] > places[k]),
    placed: true
  };
}

// Piece i's height at s across the picture: the cubic through its two heights, bent by its two others.
function auroraHeight(segA, segB, i, s) {
  const x0 = segA[i * 4];
  const y0 = segA[i * 4 + 2];
  const y1 = segA[i * 4 + 3];
  const p0 = segB[i * 4];
  const p3 = segB[i * 4 + 1];
  const u = (s - x0) / (segA[i * 4 + 1] - x0);
  return y0 + 0.5 * u * (y1 - p0 + u * (2 * p0 - 5 * y0 + 4 * y1 - p3 + u * (3 * (y0 - y1) + p3 - p0)));
}
// A path's pieces, from the picture's left side to its right: of each, its two places and two heights, then the two
// heights its curve bends by (a straight piece's keep it straight; a curved one's slopes are a parabola's through its
// neighbours inside a run of curves, half its own at a run's end), and the heights beside it, its own but where an
// upright wall stands between; the slots it is looked up by; and where it has a wall, the line the light rises from,
// drawn down near each wall toward its foot (WALL_EASE) and averaged so no ridge shows.
function auroraPieces(P) {
  const x = [...P.places];
  const y = [...P.heights];
  const c = [...P.curved];
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
  const at = [];
  for (let i = 0; i + 1 < x.length; i++) if (x[i + 1] > x[i]) at.push(i);
  const n = at.length;
  const wide = at.map(i => x[i + 1] - x[i]);
  const slope = at.map((i, j) => (y[i + 1] - y[i]) / wide[j]);
  const run = j => j >= 0 && j + 1 < n && c[at[j]] && c[at[j + 1]] && at[j] + 1 === at[j + 1];
  const segA = new Float32Array(n * 4);
  const segB = new Float32Array(n * 4);
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
    }
    segA.set([x[i], x[i + 1], y0, y1], j * 4);
    segB.set([p0, p3, j > 0 ? y[at[j - 1] + 1] : y0, j + 1 < n ? y[at[j + 1]] : y1], j * 4);
  }
  const ease = WALL_EASE / (2 * HALF);
  const walls = [];
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
  const rise = new Float32Array(SLOTS);
  if (walls.length)
    for (let k = 0, j = 0; k < SLOTS; k++) {
      const s = k / (SLOTS - 1);
      while (j + 1 < n && s >= segA[j * 4 + 1]) j++;
      const e = auroraHeight(segA, segB, j, s);
      let l = e;
      for (const w of walls) {
        const d = Math.abs(s - w.x);
        if (d < ease) l = Math.min(l, w.low + (e - w.low) * smooth(0, 1, d / ease));
      }
      rise[k] = l;
    }
  for (let pass = 0; pass < 2 && walls.length; pass++) {
    const from = Float32Array.from(rise);
    for (let k = 0; k < SLOTS; k++) {
      let sum = 0;
      for (let d = -RIDGE; d <= RIDGE; d++) sum += from[Math.min(SLOTS - 1, Math.max(0, k + d))];
      rise[k] = sum / (2 * RIDGE + 1);
    }
  }
  const slots = new Float32Array(SLOTS);
  for (let slot = 0, j = 0; slot < SLOTS; slot++) {
    while (j + 1 < n && segA[(j + 1) * 4] <= slot / SLOTS) j++;
    slots[slot] = j;
  }
  return { segs: n, segA, segB, slots, walls: walls.length > 0, rise };
}

// The light a shape draws: as designed for 0, and for any other number up to 999 a fan of its own (SHAPES), its
// shafts spread over the fan by how far it reaches, and every sheet starting at a place of its own in the tile; the
// sheets slide as designed, so every shape's loop closes at the designed pace.
const kept4 = v => Math.floor(v * 10000 + 0.5) / 10000;
const DESIGNED = { fan: FAN, ...SHEETS };
function auroraDesign(shape) {
  if (!shape) return DESIGNED;
  let i = 0;
  const r = () => auroraHash(i++, shape * 104729 + 5);
  const between = ([least, most]) => least + (most - least) * r();
  const depth = between(SHAPES.depth);
  const lean = between(SHAPES.lean);
  const wide = between(SHAPES.wide);
  const gather = between(SHAPES.gather);
  const keep = (depth + KEEP_AT) / (-FAN.y + KEEP_AT);
  const start = (s, across) => ({ ...s, across: kept4(across), u0: kept4(r()), v0: kept4(r()) });
  return {
    fan: { x: kept4(lean), y: kept4(-depth) },
    a: start(SHEETS.a, (SHEETS.a.across * keep) / wide),
    b: start(SHEETS.b, (SHEETS.b.across * keep) / wide),
    c: start(SHEETS.c, SHEETS.c.across * keep),
    h1: start(SHEETS.h1, SHEETS.h1.across),
    h2: start(SHEETS.h2, SHEETS.h2.across),
    g: start(SHEETS.g, gather * keep)
  };
}

// The aurora in a canvas of W by H pixels at ANGLE and SHAPE: the picture turned and set in the square of the canvas's
// longer side, the ramp, the range's color and how much of what is behind it covers, its path's pieces and the light.
function auroraScene(angle, shape, width, height) {
  const th = ((angle - 90) * Math.PI) / 180;
  return {
    width,
    height,
    cs: Math.cos(th),
    sn: Math.sin(th),
    ext: SPAN * Math.max(width, height),
    half: HALF,
    ramp: auroraRamp(),
    range: RANGE ? colorOf(RANGE) : [0, 0, 0],
    cover: RANGE ? (RANGE.length === 9 ? Number.parseInt(RANGE.slice(7), 16) / 255 : 1) : 0,
    ...auroraPieces(auroraPathParts(PATH) ?? auroraPathParts(DESIGNED_PATH)),
    design: auroraDesign(shape)
  };
}

// The table the pass reads texel by texel, SLOTS by TABLE_ROWS, four floats each, a row each: the ramp (a color a
// texel), the pieces' places and heights, the heights they bend by and the ones beside them, the slots they are looked
// up by, and the line the light rises from.
function auroraTableOf(m) {
  const W = SLOTS;
  const data = new Float32Array(W * TABLE_ROWS * 4);
  for (let i = 0; i < RAMP; i++) data.set([m.ramp[i * 3], m.ramp[i * 3 + 1], m.ramp[i * 3 + 2], 1], i * 4);
  data.set(m.segA, W * 4);
  data.set(m.segB, W * 8);
  for (let i = 0; i < SLOTS; i++) {
    data[(W * 3 + i) * 4] = m.slots[i];
    data[(W * 4 + i) * 4] = m.rise[i];
  }
  return data;
}
// The pass's uniforms, as the player sets them once a palette, a view or a canvas changes: the frame (the angle's
// cosine and sine, the picture's height in pixels), the path (half the picture's width, how many pieces, 1 where it
// has an upright wall), the range's color premultiplied by its cover, the cover last, the point the rays fan from, and
// each sheet's spans across and along, then its starts.
function sceneUniforms(m) {
  const D = m.design;
  return {
    frame: Float32Array.of(m.cs, m.sn, m.ext),
    path: Float32Array.of(m.half, m.segs, m.walls ? 1 : 0),
    range: Float32Array.of(...m.range.map(v => v * m.cover), m.cover),
    fan: Float32Array.of(D.fan.x, D.fan.y),
    sheets: Float32Array.from(SHEET_ORDER.flatMap(name => [D[name].across, D[name].along, D[name].u0, D[name].v0]))
  };
}
// The share of the loop gone by at t seconds of it at speed 1: 0 up to 1.
const auroraTime = t => {
  const T = t / LOOP;
  return T - Math.floor(T);
};`;
}

/** The settings a reader edits, the page's first script: the palette's stops, the range's color and path, the angle,
    the shape, the speed, the frame rate and the ease. */
export function auroraSettings(P: Palette, effect: Effect, angle: number): string {
  const stops = auroraColors(P);
  const rows = Array.from({ length: Math.ceil(stops.length / 6) }, (_, i) =>
    stops
      .slice(6 * i, 6 * i + 6)
      .map(c => `"${c}"`)
      .join(", ")
  );
  const bg = effect.look.bg;
  return `// The palette, ${stops.length} colors along its curve from its start to its end, as the site reads it: the light runs through them
// from the darker end to the lighter, each taking its share, then on past the last toward white. And the range's
// color: "#rrggbb", or "#rrggbbaa" to let the page through (over which the canvas lays itself), or null for a clear
// range.
const STOPS = [
${rows.map(row => `  ${row}`).join(",\n")}
];
const RANGE = ${bg === null ? "null" : `"${bg}"`};
// The range's outline, as its address writes it: \`line\` or \`curve\`, how the heights after it are joined, then 2 to
// ${AURORA_PATH_MOST} heights from the left edge to the right, each from 0 (the bottom) to 100 (the top), a tenth at the finest, with
// commas between, either word again where the joining changes; or every height \`place:height\`, the place from 0 (the
// left edge) to 100 (the right) and never falling, two heights at one place an upright wall. What is no path draws
// the designed range, this one where the address names none.
const PATH = "${effect.look.path ?? AURORA_DESIGNED_PATH}";
// The angle the picture is turned to (90 as designed: the light rises from the bottom), its shape (0 as designed, up
// to 999: the fan the light rises in and where its noise starts), how fast it plays (1 as designed: a loop lasts
// ${AURORA_LOOP} s; 0 holds the first frame), frames a second at most, and the seconds it takes to ease in.
const ANGLE = ${angle};
const SHAPE = ${effect.look.shape ?? 0};
const SPEED = ${jsNumber(effect.speed)};
const FPS = ${jsNumber(effect.fps)};
const EASE = ${jsNumber(EFFECT_EASE_S)};`;
}
