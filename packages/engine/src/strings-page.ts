/* The strings as a page that plays them, as the site's player does (ui/strings-player.ts): its design and its
   arithmetic in plain JavaScript, each expression as engine/strings.ts and strings-gl.ts write it, so a page's numbers
   are the player's to the last bit (strings-shader.test.ts holds the two together): the design a shape draws, turned by
   the angle, the uniforms and each frame's phases. The WebGL page runs the player's own pass (strings-gl.ts), the
   WebGPU page the same pass in WGSL (strings-wgsl.ts); the players' clock (effect-page.ts) plays them. The palette
   comes in as its stops and the ground, which a reader may edit; a ground with an alpha lets the page through, which
   each page's canvas lays premultiplied over it. Loaded with the Shader tab's WebGL and WebGPU spellings, never with a
   page. */
import { CLEAR_GROUND, EFFECT_EASE_S, type Effect } from "./effect.ts";
import type { Palette } from "./palette.ts";
import {
  STRINGS_DESIGNED_SEED,
  STRINGS_FRAME_SIZE,
  STRINGS_LOOK,
  STRINGS_LOOP,
  STRINGS_LUMPS,
  STRINGS_SHEARS,
  STRINGS_SPAN,
  STRINGS_STOPS,
  STRINGS_WAVES,
  stringsScene
} from "./strings.ts";

/** What every text of the strings is, the start of its credit's last line: on the palette's darkest color as
    designed, or on the ground its look names. */
export const stringsWhat = (bg: string | null): string =>
  `the strings, the palette as threads stirred on ${bg === null ? "its darkest color" : bg === CLEAR_GROUND ? "a clear ground" : bg}`;

/** The colors a page starts from, as the site takes them from a palette and a ground (none as designed): the ground,
    `#rrggbbaa` where it lets the page through, and the stops, as hex. */
export function stringsColors(
  P: Palette,
  bg: string | null = null
): { ground: string; stops: string[] } {
  const m = stringsScene(P, { angle: 90, shape: null, bg }, { width: 9, height: 9 });
  const hex = (rgb: number[]) =>
    `#${rgb
      .map(v =>
        Math.round(v * 255)
          .toString(16)
          .padStart(2, "0")
      )
      .join("")}`;
  return {
    ground: bg ?? m.groundHex,
    stops: Array.from({ length: STRINGS_STOPS }, (_, i) => hex(m.stops.slice(3 * i, 3 * i + 3)))
  };
}

/** The head of the GLSL and the WGSL texts: the credit, then how a frame draws, as comment lines, and its finish where
    it has one: `"grain"` the grain laid in the pass, `"finish"` the finish's passes after it. */
export function stringsTextHead(
  credit: readonly string[],
  finish: "plain" | "grain" | "finish" = "plain"
): string {
  return [
    ...credit,
    "",
    `Each frame is one pass: at each pixel the plane stirred by ${STRINGS_SHEARS} shears, ${STRINGS_WAVES} waves there summed, and the`,
    "field N x / sqrt(1 + x^2) of their sum over its saturation, whose whole levels are the threads, packed into ribbons",
    "where the sum crosses 0; the two threads nearest the pixel, each a width wide, ended where they crowd (by rank) and",
    "past the blob's edge (each at its own place), laid over the ground farther first. A frame sets only the",
    `${STRINGS_FRAME_SIZE} phases. The uniforms' values are the page's.`,
    ...(finish === "grain"
      ? ["The grain is laid over its bytes in the pass, a speck a CSS pixel, from its tile."]
      : finish === "finish"
        ? [
            "The pass draws into the finish's frame, which the finish's passes then blur by the soft on a smaller grid,",
            "lay over the palette's gradient where the blur thins the threads toward its edges, and grain."
          ]
        : [])
  ]
    .map(line => (line ? `// ${line}` : "//"))
    .join("\n");
}

/** A number as JavaScript source that reads back as the same double, -0 kept. */
const jsNumber = (n: number): string => (Object.is(n, -0) ? "-0" : String(n));

/** The design and its arithmetic in plain JavaScript, the engine's own: everything a frame draws from the settings,
    and nothing that touches the page. */
export function stringsModel(): string {
  const L = STRINGS_LOOK;
  return `// The design, as the site draws it: lengths in D units, D the canvas's longer side times SPAN, so every canvas shows
// the one design its longer side frames, centered. The threads are the whole levels of a field that runs between -N
// and N: ten waves summed where four shears have stirred the plane, saturated so its levels pack into ribbons where the
// sum crosses 0. Where threads crowd past GAP widths, every other one ends by its rank; each ends where it crosses the
// blob's edge, at a place of its own. Every wave's phase swings about its rest, whole cycles a loop.
const LOOP = ${STRINGS_LOOP};
const SPAN = ${STRINGS_SPAN};
const DESIGNED = ${STRINGS_DESIGNED_SEED};
const SHEARS = ${STRINGS_SHEARS};
const WAVES = ${STRINGS_WAVES};
const LUMPS = ${STRINGS_LUMPS};
const FRAME_SIZE = ${STRINGS_FRAME_SIZE};
const THREADS = ${L.threads};
const SAT = ${L.sat};
const WIDTH = ${L.width};
const GAP = ${L.gap};
const JITTER = ${L.jitter};
const STAGGER = ${L.stagger};
const SHARE = ${L.share};
const BLOB_X = ${L.rx};
const BLOB_Y = ${L.ry};
const BLOB_LUMPS = ${L.lumps};
const TAU = Math.PI * 2;
const GOLDEN = 2.39996;
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
// A shape's design: four shears, ten waves and three lumps, each a wave along (dx, dy), each the golden angle on from
// the last, k radians a D unit, its reach or height a, its phase at rest, and how its phase swings: the radians it
// swings (less for a wide wave), its whole cycles a loop and its phase at the loop's start.
function design(shape) {
  const r = rng(Math.imul(shape || DESIGNED, 2654435761));
  let turn = r() * TAU;
  const wave = (k0, kSpan, slope) => {
    turn += GOLDEN + (r() - 0.5) * 0.6;
    const k = k0 + r() * kSpan;
    const a = slope(k);
    const ph = r() * TAU;
    const swing = 1.6 * (0.6 + 0.8 * r()) * Math.min(1, (k / 7) ** 1.5);
    const cycles = 1 + Math.floor(r() * 2);
    const psi = r() * TAU;
    return {
      dx: round(Math.cos(turn), 1e-6),
      dy: round(Math.sin(turn), 1e-6),
      k: round(k, 1e-6),
      a: round(a, 1e-6),
      ph: round(ph, 1e-6),
      swing: round(swing, 1e-6),
      cycles,
      psi: round(psi, 1e-6)
    };
  };
  const shears = Array.from({ length: SHEARS }, () => wave(3, 4, k => ((0.6 + r() * 0.6) * 1.3) / k));
  const waves = Array.from({ length: WAVES }, () => wave(5.5, 8, k => (0.5 + r() * 0.5) / k));
  const lumps = Array.from({ length: LUMPS }, () => wave(3.5, 3, () => 1));
  return { shears, waves, lumps };
}
// The design turned by the angle: every direction turned clockwise on the screen by ANGLE - 90 degrees.
function turned(d, angle) {
  const rad = ((angle - 90) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const turn = v => ({ ...v, dx: c * v.dx - s * v.dy, dy: s * v.dx + c * v.dy });
  return { shears: d.shears.map(turn), waves: d.waves.map(turn), lumps: d.lumps.map(turn) };
}

// The frame at t (seconds of the loop at speed 1): every shear's, wave's and lump's phase, its rest plus its swing
// then, in one turn, into \`at\`.
function frameAt(m, time, at) {
  const t = time - LOOP * Math.floor(time / LOOP);
  let i = 0;
  for (const set of [m.design.shears, m.design.waves, m.design.lumps])
    for (const v of set) {
      const p = v.ph + v.swing * Math.sin((TAU * v.cycles * t) / LOOP + v.psi);
      at[i++] = p - TAU * Math.floor(p / TAU);
    }
}

const bytes = hex => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
// The ground as the pass takes it: its color times its alpha, then the alpha, 1 for six digits.
const groundOf = hex => {
  const alpha = hex.length === 9 ? Number.parseInt(hex.slice(7), 16) / 255 : 1;
  return [...bytes(hex).map(v => v * alpha), alpha];
};

// The strings in a canvas of W by H pixels at ANGLE and SHAPE: the design, the threads' width and least spacing, the
// blob and the colors.
function stringsScene(angle, shape, width, height) {
  const D = SPAN * Math.max(width, height);
  const lw = round(WIDTH * D, 0.001);
  return {
    width,
    height,
    D,
    design: turned(design(shape), angle),
    n: THREADS,
    sat: SAT,
    lw,
    hw: lw / 2,
    need: round(GAP * lw, 0.001),
    jitter: JITTER,
    stagger: STAGGER,
    share: SHARE,
    bx: BLOB_X,
    by: BLOB_Y,
    lumps: BLOB_LUMPS,
    ground: groundOf(GROUND),
    stops: STOPS.flatMap(bytes)
  };
}

// The pass's uniforms, as the player sets them once a palette, a view or a canvas changes.
function sceneUniforms(m) {
  const { shears, waves, lumps } = m.design;
  return {
    field: Float32Array.of(m.n, m.sat),
    shear: Float32Array.from(shears.flatMap(v => [v.dx, v.dy, v.k, v.a])),
    wave: Float32Array.from(waves.flatMap(v => [v.dx, v.dy, v.k, v.a])),
    lump: Float32Array.from(lumps.flatMap(v => [v.dx, v.dy, v.k])),
    line: Float32Array.of(m.hw, m.need, m.jitter, m.stagger),
    blob: Float32Array.of(m.share, m.bx, m.by, m.lumps),
    ground: Float32Array.from(m.ground),
    stops: Float32Array.from(m.stops)
  };
}`;
}

/** The settings a reader edits, the page's first script: the ground and the stops, the angle, the shape, the speed, the
    frame rate and the ease. */
export function stringsSettings(P: Palette, effect: Effect, angle: number): string {
  const bg = effect.look.bg;
  const { ground, stops } = stringsColors(P, bg);
  const rows = Array.from({ length: Math.ceil(stops.length / 6) }, (_, i) =>
    stops
      .slice(6 * i, 6 * i + 6)
      .map(c => `"${c}"`)
      .join(", ")
  );
  return `${
    bg === null
      ? `// The ground, the palette's darkest color made deeper, and the palette's ${STRINGS_STOPS} stops along its curve, each lifted off
// the ground where it would sink into it: a ribbon's threads take their colors from the stops, from its one side to its
// other.`
      : `// The ground ("#rrggbbaa" lets the page through, which the canvas lays itself over), and the palette's ${STRINGS_STOPS} stops along its
// curve, each lifted off the ground where it would sink into it, raised or, on a light one, lowered (off the palette's
// darkest color made deeper where the ground is clear): a ribbon's threads take their colors from the stops, from its
// one side to its other.`
  }
const GROUND = "${ground}";
const STOPS = [
${rows.map(row => `  ${row}`).join(",\n")}
];
// The angle the stirring is turned to (90 as designed), its shape (0 as designed, up to 999: the stirring and the
// blob), how fast it plays (1 as designed: a loop lasts ${STRINGS_LOOP} s; 0 holds the first frame), frames a second at most,
// and the seconds it takes to ease in.
const ANGLE = ${angle};
const SHAPE = ${effect.look.shape ?? 0};
const SPEED = ${jsNumber(effect.speed)};
const FPS = ${jsNumber(effect.fps)};
const EASE = ${jsNumber(EFFECT_EASE_S)};`;
}
