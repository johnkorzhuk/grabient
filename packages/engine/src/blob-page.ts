/* The blob as a page that plays it, as the site's player does (ui/blob-player.ts): the WebGL page runs the player's
   own shaders (blob-gl.ts), the WebGPU page their WGSL (blob-wgsl.ts), and both run the same script, which is the
   engine's and the player's arithmetic written out in plain JavaScript: the palette's colors from its keyframes, the
   scene a shape draws (blob.ts's blobScene), the filter's numbers, Skia's noise tables, the layout, the balls' places
   each frame, and the player's clock, which eases in from rest, keeps to a frame rate and holds the first frame for a
   reader who asks for less motion. JavaScript's doubles are the player's, so each page draws the player's pixels.
   blob-shader.test.ts holds the script's numbers to the engine's. Loaded with the Shader tab, never with a page. */

import { BLOB_LOOP } from "./blob.ts";
import {
  BLOB_EASE_S,
  BLOB_GANESH_WIDTH,
  BLOB_PIXELS_MAX,
  BLOB_RADIUS,
  BLOB_SETTLE_MS,
  BLOB_TEXELS
} from "./blob-gl.ts";
import { encodePalette } from "./codec.ts";
import type { Effect } from "./effect.ts";
import type { Palette } from "./palette.ts";

/** A number as JavaScript source that reads back as the same double, -0 kept. */
export const jsNumber = (n: number): string => (Object.is(n, -0) ? "-0" : String(n));

/** The page's settings, each a constant at the top of its script that a reader may edit: the palette's keyframes, the
    shape (null: the one the palette's own seed draws), the speed, the frame rate, the frost, the ground and the ease.
    The blob has no angle: its palette lies across every blob from left to right. */
export function blobSettings(P: Palette, effect: Effect): string {
  const anchors = P.anchors
    .map(
      a =>
        `  [${[a.l, a.c, a.h, ...(a.own === undefined ? [] : [a.own])].map(jsNumber).join(", ")}]`
    )
    .join(",\n");
  const { shape, frost, bg } = effect.look;
  return `// The palette's own seed: the shape its numbers draw where SHAPE is null.
const SEED = ${JSON.stringify(encodePalette(P))};
// The palette's keyframes in OKLCH: lightness, chroma, hue in degrees, and a near gray's own tint where it keeps one.
const ANCHORS = [
${anchors}
];
// 0 to 999 picks the blobs' forms and wanderings; null draws the palette's own.
const SHAPE = ${shape === null ? "null" : jsNumber(shape)};
// The loop's pace: it lasts ${BLOB_LOOP} s over this; 0 holds the first frame.
const SPEED = ${jsNumber(effect.speed)};
// Frames a second at most.
const FPS = ${jsNumber(effect.fps)};
// The frost: 1 as designed, 0 none, 2 twice.
const FROST = ${jsNumber(frost)};
// The ground: "#rrggbb", or "#rrggbbaa" where it lets the page through; null for none.
const BG = ${bg === null ? "null" : JSON.stringify(bg)};
// Seconds the motion takes from rest to its pace.
const EASE = ${jsNumber(BLOB_EASE_S)};`;
}

/** The blob's numbers in plain JavaScript, the engine's own: everything a frame draws from the settings above it,
    and nothing that touches the page. */
export const BLOB_MATH = `// The palette's colors: its keyframes' Catmull-Rom curve in OKLCH, fitted to sRGB at constant lightness and hue.
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
const toEncoded = v => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
// The palette's color at a place along it, 0 its first: three bytes.
function colorAt(t) {
  const [L0, C, H] = sampleLCH(t);
  const L = clamp01(L0);
  const c = fitChroma(L, C, H);
  return oklabToLinear(L, c * Math.cos(H * DEG), c * Math.sin(H * DEG)).map(v =>
    Math.round(clamp01(clamp01(toEncoded(clamp01(v)))) * 255)
  );
}

// The scene: three blobs of soft balls in one square design, 500 units a side, scaled to cover the canvas. Each blob
// is six balls on a ring, a drop among them and a core; the ring turns about the blob's middle while each ball swings
// on a circle of its own, and the blob wanders and breathes. The shape number (or the palette's seed) draws them all.
const DESIGN = 500;
const LOOP = ${BLOB_LOOP};
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
function dice(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// A blob's balls, the palette across them from left to right: its first color on the left, its last on the right.
function ballsOf(rand, spin) {
  const vary = () => 1 - 0.2 / 2 + 0.2 * rand();
  rand();
  const start = 2 * Math.PI * rand();
  const along = angle => 0.5 + 0.5 * Math.cos(angle);
  const balls = [];
  for (let i = 0; i < 6; i++) {
    const angle = start + (2 * Math.PI * i) / 6;
    balls.push({
      x: 0.55 * Math.cos(angle),
      y: 0.55 * Math.sin(angle),
      r: 0.42 * vary(),
      at: along(angle),
      swing: 0.28 * vary(),
      laps: -spin * (2 + (i % 2)),
      phase: rand(),
      ring: true
    });
  }
  const drop = start + Math.PI / 6;
  balls.push({ x: 0.8 * Math.cos(drop), y: 0.8 * Math.sin(drop), r: 0.34, at: along(drop), swing: 0.32, laps: -2 * spin, phase: rand(), ring: true });
  balls.push({ x: 0, y: 0, r: 0.6, at: 0.5, swing: 0.1, laps: spin, phase: rand(), ring: false });
  return balls;
}
function blobScene() {
  const own = SHAPE === null ? SEED : \`shape/\${SHAPE}\`;
  const rand = dice(hash(own));
  const sign = () => (rand() < 0.5 ? -1 : 1);
  const turn = 2 * Math.PI * rand();
  const laps = [[1, 2], [2, 1], [1, 3]];
  const blobs = [0, 1, 2].map(k => {
    const spin = sign();
    const angle = turn + (2 * Math.PI * k) / 3;
    const [across, down] = laps[k];
    return {
      x: DESIGN / 2 + 0.27 * DESIGN * Math.cos(angle),
      y: DESIGN / 2 + 0.27 * DESIGN * Math.sin(angle),
      R: 0.33 * DESIGN * (0.9 + 0.2 * rand()),
      balls: ballsOf(rand, spin),
      spin,
      wander: [
        { reach: 0.13 * DESIGN, laps: across * sign() },
        { reach: 0.13 * DESIGN, laps: down * sign() }
      ],
      depth: (k % 2 ? 2 : 1) * sign()
    };
  });
  const sized = rand();
  const scale = SHAPE === null ? 0.55 + (1.12 - 0.55) * Math.sqrt(sized) : 0.3 + (1.12 - 0.3) * sized;
  const near = SHAPE === null ? 1 : 0.5 + 0.5 * sized;
  const spread = (0.8 + (1.15 - 0.8) * rand()) * near;
  // far to near: the blob drawn largest is the nearest, painted last
  const layers = [[0.8, 0.65], [1, 1], [1.2, 1.4]];
  const order = blobs
    .map((b, k) => ({ b, k }))
    .sort((p, q) => p.b.R - q.b.R || p.k - q.k)
    .map(({ b }, layer) => {
      const [size, reach] = layers[layer];
      return {
        ...b,
        x: DESIGN / 2 + (b.x - DESIGN / 2) * spread,
        y: DESIGN / 2 + (b.y - DESIGN / 2) * spread,
        R: b.R * size * scale,
        wander: [
          { ...b.wander[0], reach: b.wander[0].reach * reach },
          { ...b.wander[1], reach: b.wander[1].reach * reach }
        ]
      };
    });
  return { blobs: order, pad: 1.5 * 0.24 * 1.12 * Math.max(...order.map(b => b.R)), seed: hash(own) % 9973 };
}

// The filter's numbers, as the SVG's filter writes them: the melt's blur, the lift of its edge, the frost's scatter
// and speckle, the filter region's pad, and the noise's frequency and seed.
const num = (v, digits = 2) => String(Number(v.toFixed(digits))).replace(/^(-?)0\\./, "$1.");
const written = (v, digits = 2) => Number(num(v, digits));
function blobFilter(scene) {
  const scatter = 0.075 * FROST;
  const speckle = Math.min(0.4, 0.1 * FROST);
  return {
    melt: written(0.24 * Math.max(...scene.blobs.map(b => b.R))),
    slope: written(2.2, 3),
    lift: written(0.5 - 2.2 / 2, 3),
    scatter: written(scatter * DESIGN),
    k1: written(2 * speckle, 3),
    k2: written(1 - speckle, 3),
    contrast: written(2.2, 3),
    gray: written(0.5 - 2.2 / 2, 3),
    pad: written(scene.pad),
    frequency: 0.75,
    seed: scene.seed,
    noise: scatter > 0 || speckle > 0
  };
}

// feTurbulence's tables for a seed as Chromium's Skia builds them: the lattice selector (256 bytes) and the gradients,
// four channels of 256, each kept as two 16-bit values (256 x 4 RGBA texels, low bytes first).
function noiseTables(seed) {
  const M = 2147483647;
  let s = Math.trunc(seed);
  if (s <= 0) s = -(s % (M - 1)) + 1;
  if (s > M - 1) s = M - 1;
  const random = () => {
    s = 16807 * (s % 127773) - 2836 * Math.trunc(s / 127773);
    if (s <= 0) s += M;
    return s;
  };
  const lattice = new Uint8Array(256);
  const raw = new Uint16Array(4 * 512);
  for (let c = 0; c < 4; c++) {
    for (let i = 0; i < 256; i++) {
      lattice[i] = i;
      raw[c * 512 + 2 * i] = random() % 512;
      raw[c * 512 + 2 * i + 1] = random() % 512;
    }
  }
  for (let i = 255; i > 0; i--) {
    const k = lattice[i];
    const j = random() % 256;
    lattice[i] = lattice[j];
    lattice[j] = k;
  }
  const f = Math.fround;
  const gradients = new Uint8Array(4 * 256 * 4);
  for (let c = 0; c < 4; c++) {
    for (let i = 0; i < 256; i++) {
      const at = c * 512 + 2 * lattice[i];
      const gx = f((raw[at] - 256) / 256);
      const gy = f((raw[at + 1] - 256) / 256);
      const length = Math.sqrt(gx * gx + gy * gy);
      const o = 4 * (c * 256 + i);
      for (const [k, g] of [[0, length ? f(gx * (1 / length)) : 0], [2, length ? f(gy * (1 / length)) : 0]]) {
        const v = Math.floor(f(f(g + 1) * 32767.5) + 0.5);
        gradients[o + k] = v & 255;
        gradients[o + k + 1] = v >> 8;
      }
    }
  }
  return { lattice, gradients };
}

// The canvas: its device pixels as the browser lays it out, at most ${BLOB_PIXELS_MAX} of them, and the design's map
// to them, scaled to cover the box and centered: a design unit is (sx, sy) device pixels, its corner at (tx, ty).
function canvasOf(W, H, dpr, device) {
  const ew = Math.round(W * dpr);
  const eh = Math.round(H * dpr);
  const exact = device && Math.abs(device.w - ew) <= 2 && Math.abs(device.h - eh) <= 2;
  let cw = exact && device ? device.w : ew;
  let ch = exact && device ? device.h : eh;
  const fit = Math.min(1, Math.sqrt(${BLOB_PIXELS_MAX} / Math.max(1, cw * ch)));
  cw = Math.max(1, Math.round(cw * fit));
  ch = Math.max(1, Math.round(ch * fit));
  return { w: cw, h: ch, kx: fit < 1 ? cw / W : dpr, ky: fit < 1 ? ch / H : dpr };
}
function mapOf(W, H, kx, ky) {
  const scale = Math.max(W / DESIGN, H / DESIGN);
  const x = (W - scale * DESIGN) / 2;
  const y = (H - scale * DESIGN) / 2;
  return { sx: scale * kx, sy: scale * ky, tx: x * kx, ty: y * ky };
}

// The melt: the filter region in whole device pixels, a small texture over what the canvas reads of it (each texel
// ${BLOB_TEXELS}th of the blur's deviation), and the blur's taps and weights: a Gaussian truncated at three deviations.
const RADIUS = ${BLOB_RADIUS};
function meltOf(look, map, cw, ch, weights) {
  const { pad } = look;
  const region = [
    Math.floor(-pad * map.sx + map.tx + 0.5),
    Math.floor(-pad * map.sy + map.ty + 0.5),
    Math.floor((DESIGN + pad) * map.sx + map.tx + 0.5),
    Math.floor((DESIGN + pad) * map.sy + map.ty + 0.5)
  ];
  const sigma = look.melt * Math.max(map.sx, map.sy) * ${BLOB_GANESH_WIDTH};
  const texel = Math.max(0.5, sigma / ${BLOB_TEXELS});
  const reach = Math.ceil(look.scatter * Math.max(map.sx, map.sy)) + 2;
  const x0 = Math.max(region[0], -reach);
  const y0 = Math.max(region[1], -reach);
  const x1 = Math.min(region[2], cw + reach);
  const y1 = Math.min(region[3], ch + reach);
  const margin = 3 * sigma + 2 * texel;
  const box = {
    x: x0 - margin,
    y: y0 - margin,
    texel,
    w: Math.max(1, Math.ceil((Math.max(x1, x0) - x0 + 2 * margin) / texel)),
    h: Math.max(1, Math.ceil((Math.max(y1, y0) - y0 + 2 * margin) / texel))
  };
  const s = Math.sqrt(Math.max(0.25, (sigma / texel) ** 2 - 0.25));
  const taps = Math.min(RADIUS, Math.ceil(3 * (sigma / texel)));
  let total = 0;
  for (let i = 0; i <= RADIUS; i++) {
    weights[i] = i <= taps ? Math.exp(-(i * i) / (2 * s * s)) : 0;
    total += i ? 2 * weights[i] : weights[i];
  }
  for (let i = 0; i <= RADIUS; i++) weights[i] /= total;
  return { region, box, taps };
}

// Every ball's middle and radius in the design at a share f of the loop, at every stride from 0: each blob wanders
// and breathes, its ring turns, and each ball swings on its own circle.
function places(scene, f, out, stride) {
  let k = 0;
  for (const blob of scene.blobs) {
    const scale = (1 + ((1.12 - 0.88) / 2) * Math.sin(2 * Math.PI * blob.depth * f)) * blob.R;
    const x0 = blob.x + blob.wander[0].reach * Math.sin(2 * Math.PI * blob.wander[0].laps * f);
    const y0 = blob.y + blob.wander[1].reach * Math.sin(2 * Math.PI * blob.wander[1].laps * f);
    const turn = 2 * Math.PI * blob.spin * f;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    for (const b of blob.balls) {
      const swing = 2 * Math.PI * (b.phase + b.laps * f);
      const x = b.x + b.swing * Math.cos(swing);
      const y = b.y + b.swing * Math.sin(swing);
      out[k] = x0 + (b.ring ? x * cos - y * sin : x) * scale;
      out[k + 1] = y0 + (b.ring ? x * sin + y * cos : y) * scale;
      out[k + 2] = b.r * scale;
      k += stride;
    }
  }
}

// A frame rate kept on any screen: a frame is due once each 1/fps, a little early rather than a refresh late.
function createPace() {
  let last = Number.NEGATIVE_INFINITY;
  return {
    due(now, fps) {
      if (!fps) return true;
      const every = 1000 / fps;
      if (now - last < every - Math.min(4, every * 0.2)) return false;
      last = now - last > 2 * every ? now : last + every;
      return true;
    }
  };
}

// The ground, premultiplied: its color times its alpha, and its alpha; 0s for none.
function groundOf(bg) {
  if (!bg) return [0, 0, 0, 0];
  const alpha = bg.length === 9 ? parseInt(bg.slice(7), 16) / 255 : 1;
  return [...[1, 3, 5].map(i => (parseInt(bg.slice(i, i + 2), 16) / 255) * alpha), alpha];
}`;

/** The clock and the canvas's size, the player's own: the first frame draws at once and holds still for a reader who
    asks for less motion; after it the loop advances by each frame's time, easing in from rest, at SPEED, and a frame
    is drawn when the frame rate has one due. A later size settles before the noise is baked again. `draw(at)` and
    `resize()` are the page's. */
export const BLOB_CLOCK = `// The clock: seconds of the loop at speed 1, advanced by SPEED, easing in from rest over EASE seconds. The first
// frame draws at once; a reader who asks for less motion sees it held.
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let t = 0;
let warm = 0;
let last = performance.now();
let shown = true;
let raf = 0;
let first = true;
let drawn = -1;
let changed = true;
let settle = 0;
let sized = false;
const moving = () => shown && !document.hidden && !reduced.matches && SPEED > 0;
const pace = createPace();
const share = () => (reduced.matches ? 0 : (t / LOOP) % 1);
const tick = now => {
  raf = 0;
  if (!sized) return;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!moving()) warm = 0;
  else if (!first) {
    warm = Math.min(EASE, warm + dt);
    const e = EASE ? warm / EASE : 1;
    t += dt * SPEED * e * e * (3 - 2 * e);
  }
  const at = share();
  if (changed || (at !== drawn && pace.due(now, FPS))) {
    draw(at);
    drawn = at;
    changed = false;
  }
  first = false;
  if (moving()) raf = requestAnimationFrame(tick);
};
const wake = () => {
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
};

// The canvas's size in device pixels, as the browser lays it out; a later size settles ${BLOB_SETTLE_MS} ms first.
let device = null;
const sizes = new ResizeObserver(entries => {
  const box = entries[entries.length - 1]?.devicePixelContentBoxSize?.[0];
  device = box ? { w: box.inlineSize, h: box.blockSize } : null;
  clearTimeout(settle);
  const apply = () => {
    if (!resize() && !sized) return;
    sized = true;
    changed = true;
    wake();
  };
  if (!sized) apply();
  else settle = setTimeout(apply, ${BLOB_SETTLE_MS});
});
try {
  sizes.observe(canvas, { box: "device-pixel-content-box" });
} catch {
  sizes.observe(canvas);
}
new IntersectionObserver(entries => {
  shown = entries.some(e => e.isIntersecting);
  if (shown) wake();
}).observe(canvas);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) wake();
});
reduced.addEventListener("change", wake);`;
