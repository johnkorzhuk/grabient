/* The papercut as a page that plays it, as the site's player does (ui/papercut-player.ts): its design and its
   arithmetic in plain JavaScript, each expression as engine/papercut.ts, papercut-gl.ts and color.ts write it, so a
   page's numbers are the player's to the last bit (papercut-shader.test.ts holds the two together): the relief (the
   designed one or a shape's seeded hills and hollows), the levels that give every sheet an equal share of the first
   frame, each sheet's lit cut and the shadow it casts from its own color, the shadows' sizes for the canvas, the
   uniforms and each frame's motion. The WebGL page runs the player's own two passes (papercut-gl.ts), the WebGPU page
   the same passes in WGSL (papercut-wgsl.ts); the players' clock (effect-page.ts) plays them. The palette comes in as
   its sheets' colors, which a reader may edit. Loaded with the Shader tab's WebGL and WebGPU spellings, never with a
   page. */
import { sampleHex } from "./curve.ts";
import { EFFECT_EASE_S, type Effect } from "./effect.ts";
import type { Palette } from "./palette.ts";
import {
  PAPERCUT_BUMP,
  PAPERCUT_DESIGNED,
  PAPERCUT_DESIGNED_PHASE,
  PAPERCUT_GRID,
  PAPERCUT_LOOK,
  PAPERCUT_LOOP,
  PAPERCUT_MAX_BUMPS,
  PAPERCUT_MAX_SHEETS,
  PAPERCUT_REACH,
  PAPERCUT_SPAN,
  PAPERCUT_SPECK,
  PAPERCUT_YELLOW
} from "./papercut.ts";
import { PAPERCUT_QUARTER } from "./papercut-render.ts";

/** What every text of the papercut is, the start of its credit's last line. */
export const PAPERCUT_WHAT = "the papercut, the palette cut into sheets of paper";

/** The papercut's sheets as the site cuts them from a palette: its colors at even steps along its curve, first to
    last. */
export const papercutSheetHexes = (P: Palette): string[] => {
  const n = Math.max(2, Math.min(PAPERCUT_MAX_SHEETS, Math.round(PAPERCUT_LOOK.sheets)));
  return Array.from({ length: n }, (_, i) => sampleHex(P, i / (n - 1)));
};

/** The head of the GLSL and the WGSL texts: the credit, then how a frame draws, as comment lines, and its finish where
    it has one: `"grain"` the grain laid in the shading pass, `"finish"` the finish's passes after it. */
export function papercutTextHead(
  credit: readonly string[],
  finish: "plain" | "grain" | "finish" = "plain"
): string {
  return [
    ...credit,
    "",
    "Each frame is two passes: the field (a ramp along the angle, a few hills and hollows, two waves bending them), its",
    "slope and its curvature at every fourth pixel each way, kept as exact floats; then each pixel's sheets shaded from",
    "the four samples about it, each sheet's drop shadow, contact shadow, lit cut and face painted over the one below",
    "from the field's own distance to its cut, and a half-level dither. A frame sets only the hills, the waves' phases",
    "and the light. The uniforms' values are the page's.",
    ...(finish === "grain"
      ? [
          "The grain is laid over its bytes in the shading pass, a speck a CSS pixel, from its tile."
        ]
      : finish === "finish"
        ? [
            "The shading pass draws into the finish's frame, which the finish's passes then blur by the soft on a smaller",
            "grid, lay over the palette's gradient where the blur thins the paper toward its edges, and grain."
          ]
        : [])
  ]
    .map(line => (line ? `// ${line}` : "//"))
    .join("\n");
}

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

/** The design and its arithmetic in plain JavaScript, the engine's own: everything a frame draws from the settings,
    and nothing that touches the page. */
export function papercutModel(): string {
  return `// The design, as the site draws it: lengths in D units, D the canvas's longer side times SPAN, the relief laid out in
// a 16:9 box of that longer side (its half width and height FRAME_HW and FRAME_HH), so every canvas shows the one
// relief its longer side frames, centered. Each hill (a > 0) or hollow (a < 0) is the bell (1 - s^2)^3 over a circle of
// radius r, its middle at (x, y) in the box's own -1..1 units, drifting (ax, ay) of them on cosines of kx, ky whole
// cycles a loop, its height breathing by b of itself on kb cycles.
const LOOK = ${js(PAPERCUT_LOOK)};
const DESIGNED = [
${PAPERCUT_DESIGNED.map(b => `  ${js(b)}`).join(",\n")}
];
const DESIGNED_PHASE = ${js(PAPERCUT_DESIGNED_PHASE)};
const LOOP = ${PAPERCUT_LOOP};
const SPAN = ${PAPERCUT_SPAN};
const FRAME_HW = 0.5 / SPAN;
const FRAME_HH = 0.28125 / SPAN;
const MAX_BUMPS = ${PAPERCUT_MAX_BUMPS};
const MAX_SHEETS = ${PAPERCUT_MAX_SHEETS};
const BUMP = ${PAPERCUT_BUMP};
const QUARTER = ${PAPERCUT_QUARTER};
const REACH = ${PAPERCUT_REACH};
const GRID_W = ${PAPERCUT_GRID.w};
const GRID_H = ${PAPERCUT_GRID.h};
const SPECK = ${PAPERCUT_SPECK};
const YELLOW = ${PAPERCUT_YELLOW};
const TAU = Math.PI * 2;
const round = (v, step) => Math.round(v / step) * step;

// mulberry32: the design's random numbers, the same everywhere.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// A shape's relief: 0 the designed one (a peak toward the head, a basin toward the tail, a small island and a dip),
// any other number four or five hills and hollows on a jittered ring and one near the middle, heights alternating in
// sign so the sheets keep their shares, and the waves' phases.
function relief(shape) {
  if (!shape) return { bumps: DESIGNED, phase: DESIGNED_PHASE };
  const r = rng(Math.imul(shape, 2654435761));
  const count = 4 + Math.floor(r() * 2);
  const turn = r() * Math.PI * 2;
  const bumps = [];
  for (let i = 0; i < count; i++) {
    const mid = i === count - 1;
    const th = turn + (i / (count - 1)) * Math.PI * 2 + (r() - 0.5) * 0.9;
    const rad = mid ? r() * 0.25 : 0.4 + r() * 0.3;
    bumps.push({
      x: mid ? (r() - 0.5) * 0.4 : Math.cos(th) * rad,
      y: mid ? (r() - 0.5) * 0.4 : Math.sin(th) * rad,
      r: mid ? 0.3 + r() * 0.15 : 0.18 + r() * 0.16,
      a: (i % 2 === 0 ? 1 : -1) * (mid ? 0.15 + r() * 0.15 : 0.3 + r() * 0.3),
      ax: 0.06 + r() * 0.08,
      ay: 0.06 + r() * 0.08,
      kx: 1 + Math.floor(r() * 3),
      ky: 1 + Math.floor(r() * 3),
      px: r() * 6.2832,
      py: r() * 6.2832,
      b: 0.15 + r() * 0.15,
      kb: 1 + Math.floor(r() * 3),
      pb: r() * 6.2832
    });
  }
  return { bumps, phase: [r() * 6.2832, r() * 6.2832, r() * 6.2832, r() * 6.2832] };
}

// Colors: sRGB 0 to 1 to OKLCH and back, the chroma lowered at constant lightness and hue until the color fits.
const DEG = Math.PI / 180;
const clamp01 = v => Math.min(1, Math.max(0, v));
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
const toHex = rgb => \`#\${rgb.map(v => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0")).join("")}\`;
const bytes = hex => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255);

// Each sheet's colors from its own: its face, its lit cut a little lighter, and the shadow it casts on the sheet below,
// that paper deeper, a yellow's turned toward ochre (kept at its own hue it goes olive, which no paper's shadow does).
function sheetColors(hex) {
  const lch = hex.map(h => srgbToLch(bytes(h)));
  const wallHex = lch.map(([L, C, H]) => toHex(lchToSrgb(Math.min(1, L + LOOK.wallLift), C * 0.9, H)));
  const shadowHex = lch.map((_, k) => {
    const [L, C, H] = lch[Math.max(0, k - 1)];
    const off = ((((H - YELLOW) % 360) + 540) % 360) - 180;
    const turn = LOOK.ochre * Math.max(0, 1 - Math.abs(off) / 45) * Math.min(1, C / 0.06);
    return toHex(lchToSrgb(L * LOOK.shadowDepth, C * LOOK.shadowChroma, H - turn));
  });
  return { face: hex.flatMap(bytes), wallRgb: wallHex.flatMap(bytes), shadowRgb: shadowHex.flatMap(bytes) };
}

// The papercut in a canvas of W by H pixels at ANGLE and SHAPE: the ramp along the angle, the relief, the light from the
// angle's head turned toward the top, the sheets, their colors, and each one's shadows in pixels.
const levelsKept = new Map();
function papercutScene(angle, shape, width, height) {
  const D = SPAN * Math.max(width, height);
  const rad = (angle * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const half = Math.max(LOOK.rampMin, Math.abs(dx) * FRAME_HW + Math.abs(dy) * FRAME_HH);
  const le = (LOOK.lean * Math.PI) / 180;
  let px = dy;
  let py = -dx;
  if (py > 0 || (py === 0 && px < 0)) {
    px = -px;
    py = -py;
  }
  const lx = Math.cos(le) * dx + Math.sin(le) * px;
  const ly = Math.cos(le) * dy + Math.sin(le) * py;
  const layout = relief(shape);
  const n = Math.max(2, Math.min(MAX_SHEETS, SHEETS.length));
  const hex = Array.from({ length: n }, (_, i) => SHEETS[Math.min(i, SHEETS.length - 1)]);
  const thick = k => (LOOK.index > 0 && k % LOOK.index === 0 ? LOOK.indexScale : 1);
  const m = {
    width,
    height,
    D,
    rx: (dx / half) * LOOK.slope,
    ry: (dy / half) * LOOK.slope,
    bumps: layout.bumps,
    wa: LOOK.warp,
    wf: LOOK.warpFreq,
    wa2: LOOK.warp2,
    wf2: LOOK.warpFreq2,
    phase: layout.phase,
    cycles: [1, -1, 2, -1],
    lx,
    ly,
    swing: (LOOK.swing * Math.PI) / 180,
    n,
    levels: [],
    ...sheetColors(hex),
    // a hundredth of a pixel at least, so a canvas a few pixels wide divides by none
    sigma: Array.from({ length: n }, (_, k) => Math.max(0.01, round(LOOK.shadowBlur * D * Math.sqrt(thick(k)), 0.01))),
    offset: Array.from({ length: n }, (_, k) => round(LOOK.shadowOffset * D * thick(k), 0.01)),
    alpha: Array.from({ length: n }, (_, k) => round(Math.min(0.9, LOOK.shadowAlpha * Math.sqrt(thick(k))), 0.001)),
    csigma: Math.max(0.01, round(LOOK.contactBlur * D, 0.01)),
    calpha: round(LOOK.contactAlpha, 0.001),
    wall: round(LOOK.wall * D, 0.01)
  };
  m.isigma = m.sigma.map(v => 1 / v);
  m.reach = m.sigma.map((v, k) => round(1.5 * (m.offset[k] + REACH * v), 0.01));
  m.icsigma = 1 / m.csigma;
  // the levels depend on the angle, the shape and the sheets alone, never on the canvas: found once
  const view = \`\${angle}|\${shape || 0}|\${hex.length}\`;
  if (!levelsKept.has(view)) levelsKept.set(view, levelsOf(m));
  m.levels = levelsKept.get(view).slice();
  return m;
}

// The frame at t (seconds of the loop at speed 1): every hill's middle, 1/r^2 and height, then the waves' phases, then
// toward the light, into \`at\`.
function frameAt(m, time, at) {
  const t = time - LOOP * Math.floor(time / LOOP);
  const w = TAU / LOOP;
  for (let i = 0; i < m.bumps.length; i++) {
    const b = m.bumps[i];
    const o = i * BUMP;
    at[o] = (b.x + b.ax * (Math.cos(w * b.kx * t + b.px) - Math.cos(b.px))) * FRAME_HW;
    at[o + 1] = (b.y + b.ay * (Math.sin(w * b.ky * t + b.py) - Math.sin(b.py))) * FRAME_HH;
    at[o + 2] = 1 / (b.r * b.r);
    at[o + 3] = b.a * (1 + b.b * (Math.sin(w * b.kb * t + b.pb) - Math.sin(b.pb)));
  }
  const o = m.bumps.length * BUMP;
  for (let j = 0; j < 4; j++) at[o + j] = m.phase[j] + w * m.cycles[j] * t;
  // the light's swing: a sine, so it leaves the designed light at t = 0 at its fastest and turns back at the ends
  const a = m.swing * Math.sin(w * t);
  const c = Math.cos(a);
  const s = Math.sin(a);
  at[o + 4] = c * m.lx - s * m.ly;
  at[o + 5] = s * m.lx + c * m.ly;
}

// The field alone at q (D units), as the field pass works it out with its slope and curvature.
function fieldValue(m, at, qx, qy) {
  const nb = m.bumps.length;
  const o = nb * BUMP;
  const wx = qx + m.wa * Math.sin(m.wf * qy + at[o]) + m.wa2 * Math.sin(m.wf2 * (qx - qy) + at[o + 3]);
  const wy = qy + m.wa * Math.sin(m.wf * qx + at[o + 1]) + m.wa2 * Math.sin(m.wf2 * (qx + qy) + at[o + 2]);
  let f = wx * m.rx + wy * m.ry;
  for (let i = 0; i < nb; i++) {
    const b = i * BUMP;
    const ex = wx - at[b];
    const ey = wy - at[b + 1];
    const s = (ex * ex + ey * ey) * at[b + 2];
    if (s < 1) {
      const k = 1 - s;
      f += at[b + 3] * k * k * k;
    }
  }
  return f;
}

// The levels that give every sheet an equal share of the design's box at t = 0 (quantiles of the field over a grid),
// each then moved a hair past any island or hole it would cut smaller than SPECK of the box, so the first frame never
// shows a speck.
function levelsOf(m) {
  const gw = GRID_W;
  const gh = GRID_H;
  const cells = gw * gh;
  const at = new Float64Array(m.bumps.length * BUMP + 6);
  frameAt(m, 0, at);
  const vals = new Float64Array(cells);
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++)
      vals[j * gw + i] = fieldValue(m, at, ((i + 0.5) / gw - 0.5) * 2 * FRAME_HW, ((j + 0.5) / gh - 0.5) * 2 * FRAME_HH);
  const sorted = vals.slice().sort();
  const shares = Array.from({ length: m.n - 1 }, (_, k) => sorted[Math.floor(((k + 1) / m.n) * cells)]);
  const levels = shares.slice();
  const label = new Int32Array(cells);
  const stack = new Int32Array(cells);
  const min = SPECK * cells;
  for (let k = 0; k < levels.length; k++) {
    for (let pass = 0; pass < 4; pass++) {
      const L = levels[k];
      label.fill(0);
      let moved = false;
      let id = 0;
      for (let s = 0; s < cells && !moved; s++) {
        if (label[s]) continue;
        // flood one region on one side of the level
        const above = vals[s] >= L;
        id++;
        let top = 0;
        stack[top++] = s;
        label[s] = id;
        let size = 0;
        let edge = false;
        let lo = Infinity;
        let hi = -Infinity;
        while (top) {
          const c = stack[--top];
          size++;
          const v = vals[c];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
          const i = c % gw;
          const j = (c - i) / gw;
          if (i === 0 || j === 0 || i === gw - 1 || j === gh - 1) edge = true;
          if (i > 0 && !label[c - 1] && vals[c - 1] >= L === above) {
            label[c - 1] = id;
            stack[top++] = c - 1;
          }
          if (i < gw - 1 && !label[c + 1] && vals[c + 1] >= L === above) {
            label[c + 1] = id;
            stack[top++] = c + 1;
          }
          if (j > 0 && !label[c - gw] && vals[c - gw] >= L === above) {
            label[c - gw] = id;
            stack[top++] = c - gw;
          }
          if (j < gh - 1 && !label[c + gw] && vals[c + gw] >= L === above) {
            label[c + gw] = id;
            stack[top++] = c + gw;
          }
        }
        if (edge || size >= min) continue;
        // a speck: the level moved a hair past it, so it is gone
        levels[k] = above ? hi + 1e-4 : lo - 1e-4;
        moved = true;
      }
      if (!moved) break;
    }
  }
  // a speck nested in another would move two levels past one top, to the same place: both keep their shares instead
  const out = levels.map(v => round(v, 1e-6));
  const share = shares.map(v => round(v, 1e-6));
  for (let k = 1; k < out.length; k++)
    if (out[k] <= out[k - 1] && (out[k] !== share[k] || out[k - 1] !== share[k - 1])) {
      out[k] = share[k];
      out[k - 1] = share[k - 1];
      k = Math.max(0, k - 2);
    }
  return out;
}

// The field's texture for a canvas: a sample every QUARTER pixels each way and one past each edge.
const fieldSize = m => ({ w: Math.ceil((m.width - 1) / QUARTER) + 3, h: Math.ceil((m.height - 1) / QUARTER) + 3 });

// The shading pass's uniforms, as the player sets them once a palette, a view or a canvas changes: the levels, the
// sheets' colors, each sheet's 1 / sigma, offset, opacity and the contact's 1 / sigma, the second sheet up's reach, and
// the contact's opacity with the lit cut's width.
function sceneUniforms(m) {
  const level = new Float32Array(MAX_SHEETS);
  level.set(m.levels);
  const face = new Float32Array(MAX_SHEETS * 3);
  face.set(m.face);
  const wall = new Float32Array(MAX_SHEETS * 3);
  wall.set(m.wallRgb);
  const shadow = new Float32Array(MAX_SHEETS * 3);
  shadow.set(m.shadowRgb);
  const reach = new Float32Array(MAX_SHEETS);
  reach.set(m.reach);
  const sheet = new Float32Array(MAX_SHEETS * 4);
  for (let k = 0; k < m.n; k++) {
    sheet[k * 4] = m.isigma[k];
    sheet[k * 4 + 1] = m.offset[k];
    sheet[k * 4 + 2] = m.alpha[k];
    sheet[k * 4 + 3] = m.icsigma;
  }
  return { level, face, wall, shadow, sheet, reach, misc: [m.calpha, m.wall] };
}

// A frame's uniforms at t, as the player sets them: the hills' (MAX_BUMPS vec4s) into \`bump\`, the waves' four phases
// and toward the light into \`rest\`, by way of \`at\`, a scratch of floats as the player's.
function frameUniforms(m, t, at, bump, rest) {
  frameAt(m, t, at);
  const nb = m.bumps.length * BUMP;
  for (let i = 0; i < nb; i++) bump[i] = at[i];
  for (let i = 0; i < 6; i++) rest[i] = at[nb + i];
}`;
}

/** The settings a reader edits, the page's first script: the sheets' colors, the angle, the shape, the speed, the
    frame rate and the ease. */
export function papercutSettings(P: Palette, effect: Effect, angle: number): string {
  const hex = papercutSheetHexes(P);
  const rows = Array.from({ length: Math.ceil(hex.length / 6) }, (_, i) =>
    hex
      .slice(6 * i, 6 * i + 6)
      .map(c => `"${c}"`)
      .join(", ")
  );
  return `// The palette's ${hex.length} colors at even steps along its curve, a sheet of paper each, from the angle's tail to its
// head: two to ${PAPERCUT_MAX_SHEETS} of them, each sheet's lit cut and shadow worked out from its own.
const SHEETS = [
${rows.map(row => `  ${row}`).join(",\n")}
];
// The angle the sheets climb toward (90 as designed), its shape (0 as designed, up to 999: the hills and hollows), how
// fast it plays (1 as designed: a loop lasts ${PAPERCUT_LOOP} s; 0 holds the first frame), frames a second at most, and the
// seconds it takes to ease in.
const ANGLE = ${angle};
const SHAPE = ${effect.look.shape ?? 0};
const SPEED = ${jsNumber(effect.speed)};
const FPS = ${jsNumber(effect.fps)};
const EASE = ${jsNumber(EFFECT_EASE_S)};`;
}
