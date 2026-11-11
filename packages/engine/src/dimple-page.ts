/* The dimple as a page that plays it, as the site's player does (ui/dimple-player.ts): its design and its arithmetic
   in plain JavaScript, each expression as engine/dimple.ts and dimple-gl.ts write it, so a page's numbers are the
   player's to the last bit (dimple-shader.test.ts holds the two together): the design at its zoom, turned by the
   angle, the uniforms, and the ground about the hollow wherever it is. The WebGL page runs the player's own pass
   (dimple-gl.ts), the WebGPU page the same pass in WGSL (dimple-wgsl.ts). It has no loop, so no clock plays it: the
   page's hollow follows the pointer over its canvas and stays where the pointer left it, as the player's does
   (DIMPLE_FOLLOW), and a frame is drawn only while it moves; a page whose address roams (ROAM) moves the hollow
   round its loop by a clock instead, eased in from its first frame as the site's player eases it. The palette comes
   in as its stops, which a reader may edit. Loaded with the Shader tab's WebGL and WebGPU spellings, never with a
   page. */
import { toHex } from "./color.ts";
import {
  DIMPLE_ACROSS,
  DIMPLE_EASE_S,
  DIMPLE_GROUND_STEPS,
  DIMPLE_LOOK,
  DIMPLE_REACH_ZOOM,
  DIMPLE_ROAM_S,
  DIMPLE_STOPS,
  dimpleStops
} from "./dimple.ts";
import {
  EFFECT_EASE_S,
  EFFECT_KINDS,
  EFFECT_PIXELS_MAX,
  EFFECT_SETTLE_MS,
  type Effect
} from "./effect.ts";
import { EFFECT_PACE } from "./effect-page.ts";
import type { Palette } from "./palette.ts";

/** What every text of the dimple is, the start of its credit's last line. */
export const DIMPLE_WHAT =
  "the dimple, the palette as a sheet of round scales pressed in at one point, which follows the pointer";

/** The colors a page starts from, as the site takes them from a palette: its stops as hex, the darker end first. */
export function dimpleColors(P: Palette): string[] {
  const stops = dimpleStops(P);
  return Array.from({ length: DIMPLE_STOPS }, (_, i) => toHex(stops.slice(3 * i, 3 * i + 3)));
}

/** The head of the GLSL and the WGSL texts: the credit, then how a picture draws, as comment lines, and its finish
    where it has one: `"grain"` the grain laid in the pass, `"finish"` the finish's passes after it. */
export function dimpleTextHead(
  credit: readonly string[],
  finish: "plain" | "grain" | "finish" = "plain"
): string {
  return [
    ...credit,
    "",
    "Each picture is one pass: at each pixel the ground, a gradient about the hollow, then the four discs at the corners",
    "of the pixel's lattice cell, found with the sheet's drawing-in toward the hollow undone, laid in the stack's order",
    "(read at the hollow's rest, so no disc changes places with its neighbour as the hollow moves), each a circle a",
    "pixel's edge soft, filled with the palette along its line toward the hollow. Nothing moves by itself: a picture",
    "is drawn when the hollow moves, and sets only where it is and the ground about it. The uniforms' values are the",
    "page's.",
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

/** The dimple's zoom's range (effect.ts EFFECT_KINDS). */
const ZOOMS = EFFECT_KINDS.dimple.zoom!;

/** A number as JavaScript source that reads back as the same double, -0 kept. */
const jsNumber = (n: number): string => (Object.is(n, -0) ? "-0" : String(n));

/** The design and its arithmetic in plain JavaScript, the engine's own: everything a picture draws from the settings
    and where the hollow is, and nothing that touches the page. */
export function dimpleModel(): string {
  const L = DIMPLE_LOOK;
  return `// The design, as the site draws it: lengths are shares of D, the canvas's longer side, so every canvas shows the one
// design its longer side frames, centered. A sheet of round scales, a hexagonal packing of discs a pitch apart, pressed
// in at one point, the hollow: the discs are drawn in toward it and overlap, each is filled with a short run of the
// palette along its line toward the hollow, the palette runs from the hollow out, and the wall facing the light is lit.
// The discs lie in one stack, the nearer the hollow's rest the higher (the pass reads it there), so none changes places
// with its neighbour as the hollow moves. The rest is on a disc's middle, the canvas's: that disc lies over all six
// about it. A zoom draws it larger: ACROSS pitches cross D at zoom 1, ACROSS / zoom at any other, the palette's reach
// growing with it up to REACH_ZOOM, where the palette's far end comes to a 16:9 canvas's corner, and no further.
const GROUND_STEPS = ${DIMPLE_GROUND_STEPS};
const ACROSS = ${DIMPLE_ACROSS};
const REACH_ZOOM = ${DIMPLE_REACH_ZOOM};
const RADIUS = ${L.radius};
const RUN = ${L.run};
const FLOOR = ${L.floor};
const REACH = ${L.reach};
const PINCH = ${L.pinch};
const PINCH_OVER = ${L.pinchOver};
const LIT_AT = ${L.litAt};
const HEART = ${L.heart};
const GROUND_BACK = ${L.under};
const ROAM_S = ${DIMPLE_ROAM_S};

const bytes = hex => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
const byte = v => Math.floor(Math.min(1, Math.max(0, v)) * 255 + 0.5) / 255;

// The dimple in a canvas of W by H pixels at ANGLE and ZOOM: the pitch and a disc's radius, the lattice's two steps
// (turned by ANGLE - 90 degrees, as the light is) and the way back from a point to lattice steps, the hollow's rest,
// which lattice place (0, 0) lies on, the bowl, and the stops.
function dimpleScene(angle, zoom, width, height) {
  const D = Math.max(width, height);
  const p = (D * zoom) / ACROSS;
  const turn = (angle - 90) * (Math.PI / 180);
  const cs = Math.cos(turn);
  const sn = Math.sin(turn);
  const a1x = ((p * Math.sqrt(3)) / 2) * cs - (p / 2) * sn;
  const a1y = ((p * Math.sqrt(3)) / 2) * sn + (p / 2) * cs;
  const a2x = -p * sn;
  const a2y = p * cs;
  const det = a1x * a2y - a2x * a1y;
  return {
    width,
    height,
    D,
    p,
    r: RADIUS * p,
    a1x,
    a1y,
    a2x,
    a2y,
    ox: width / 2,
    oy: height / 2,
    m00: a2y / det,
    m01: -a2x / det,
    m10: -a1y / det,
    m11: a1x / det,
    reach: REACH * Math.min(zoom, REACH_ZOOM) * D,
    pinch: PINCH,
    pinchOver: PINCH_OVER * p,
    litAt: LIT_AT * p,
    heart: HEART * p,
    lx: sn,
    ly: -cs,
    stops: STOPS.flatMap(bytes)
  };
}

// Where the roaming hollow is t seconds into its loop at speed 1, in the canvas's pixels: round a slow eight with
// unequal lobes, from its rest and back to it, the path turned as the sheet and its light are.
function roamAt(m, t) {
  const u = t / ROAM_S;
  const a = (u - Math.floor(u)) * 2 * Math.PI;
  const fx = 0.17 * (0.8 * Math.sin(a) - 0.2 * Math.sin(3 * a));
  const fy = 0.1 * (0.75 * Math.sin(2 * a) + 0.25 * Math.sin(a));
  const cs = -m.ly;
  const sn = m.lx;
  return [m.ox + m.D * (fx * cs - fy * sn), m.oy + m.D * (fx * sn + fy * cs)];
}

// The pass's uniforms that hold for a canvas, as the player sets them once a palette, a view or a canvas changes.
function sceneUniforms(m) {
  return {
    rest: Float32Array.of(m.ox, m.oy),
    lattice: Float32Array.of(m.a1x, m.a1y, m.a2x, m.a2y),
    back: Float32Array.of(m.m00, m.m01, m.m10, m.m11),
    bowl: Float32Array.of(m.reach, m.pinch, m.pinchOver, m.litAt),
    disc: Float32Array.of(m.r, m.heart, m.lx, m.ly),
    stops: Float32Array.from(m.stops)
  };
}

// What the pass takes each time the hollow moves: the ground's colors about it at (cx, cy), written into \`ground\`
// (three floats a color, GROUND_STEPS + 1 colors, each channel a byte's), from the heart out to the farthest corner of
// the design's square, and how far that corner is, which this gives back.
function hollowUniforms(m, cx, cy, ground) {
  const x0 = m.width / 2 - m.D / 2;
  const y0 = m.height / 2 - m.D / 2;
  const x1 = x0 + m.D;
  const y1 = y0 + m.D;
  const far = Math.sqrt(
    Math.max(
      (cx - x0) * (cx - x0) + (cy - y0) * (cy - y0),
      (x1 - cx) * (x1 - cx) + (cy - y0) * (cy - y0),
      (cx - x0) * (cx - x0) + (y1 - cy) * (y1 - cy),
      (x1 - cx) * (x1 - cx) + (y1 - cy) * (y1 - cy)
    )
  );
  const last = STOPS.length - 1;
  for (let k = 0; k <= GROUND_STEPS; k++) {
    const level = FLOOR + (1 - RUN - FLOOR) * Math.min(1, (far * k) / GROUND_STEPS / m.reach);
    const x = Math.min(1, Math.max(0, level - GROUND_BACK)) * last;
    const i = Math.min(last - 1, Math.floor(x));
    const f = x - i;
    for (let q = 0; q < 3; q++) {
      const a = m.stops[i * 3 + q];
      ground[k * 3 + q] = byte(a + (m.stops[i * 3 + 3 + q] - a) * f);
    }
  }
  return far;
}`;
}

/** The settings a reader edits, the page's first script: the stops, the angle, the zoom, how fast the hollow
    follows, the frame rate and the follow's ease. */
export function dimpleSettings(P: Palette, effect: Effect, angle: number): string {
  const stops = dimpleColors(P);
  const rows = Array.from({ length: Math.ceil(stops.length / 6) }, (_, i) =>
    stops
      .slice(6 * i, 6 * i + 6)
      .map(c => `"${c}"`)
      .join(", ")
  );
  return `// The palette's ${DIMPLE_STOPS} colors along its curve, its darker end first, which lies in the hollow: a disc reads between them
// by straight lines, a short run of them along its line toward the hollow.
const STOPS = [
${rows.map(row => `  ${row}`).join(",\n")}
];
// The angle the sheet and its light are turned to (90 as designed), its zoom (1 as designed, up to
// ${ZOOMS.most}: how much larger its discs and its hollow are drawn), whether the hollow roams (round a loop of ${DIMPLE_ROAM_S}
// seconds by itself, the pointer left alone) or follows the pointer, how fast it does either (1 as designed; 0 holds
// it at its rest), frames a second at most, and the seconds the hollow takes to come most of the way to the pointer
// at speed 1.
const ANGLE = ${angle};
const ZOOM = ${jsNumber(effect.look.zoom ?? ZOOMS.designed)};
const ROAM = ${effect.roam === true};
const SPEED = ${jsNumber(effect.speed)};
const FPS = ${jsNumber(effect.fps)};
const EASE = ${jsNumber(DIMPLE_EASE_S)};`;
}

/** How a dimple's page plays, in the page's own JavaScript: the players' size and frame rate (effect-page.ts), and
    the player's hollow in place of a clock (ui/dimple-player.ts). The page gives \`layout(w, h)\`, which lays its
    drawing out for the canvas's device pixels and sets \`scene\`, and \`draw(cx, cy)\`, which draws the picture with
    the hollow there, and calls \`lose()\` as its GPU is lost and \`found()\` once a new drawing stands on the one
    given back; this code gives the rest. */
export const DIMPLE_FOLLOW = `// The canvas's size in device pixels as the browser lays it out, up to a 4K screen's pixels, as the player sizes it.
const PIXELS_MAX = ${EFFECT_PIXELS_MAX};
let pixels = null;
let laidOut = false;
const resize = () => {
  const dpr = devicePixelRatio || 1;
  const css = canvas.getBoundingClientRect();
  if (!css.width || !css.height) return;
  const ew = Math.round(css.width * dpr);
  const eh = Math.round(css.height * dpr);
  const exact = pixels && Math.abs(pixels.w - ew) <= 2 && Math.abs(pixels.h - eh) <= 2;
  const w0 = exact ? pixels.w : ew;
  const h0 = exact ? pixels.h : eh;
  const fit = Math.min(1, Math.sqrt(PIXELS_MAX / Math.max(1, w0 * h0)));
  const w = Math.max(1, Math.round(w0 * fit));
  const h = Math.max(1, Math.round(h0 * fit));
  layout(w, h);
  laidOut = true;
};

// The hollow: where it is and where it is going, in the canvas, 0 to 1 each way, so a new size keeps its place. It is
// at its rest until a pointer has been over the canvas; then it goes to where the pointer last was there, EASE seconds
// for most of what is left at SPEED 1, and stays where the pointer left it. Nothing moves by itself: a picture is
// drawn when something changed, or while the hollow moves and one is due at FPS. A reader who asks for less motion
// sees the hollow stay where it is. Where ROAM is set, a clock moves the hollow round its loop instead, eased in from
// rest over EASE_IN seconds, and the pointer is left alone.
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let lost = false;
const following = () => !document.hidden && !reduced.matches && !lost && SPEED > 0;
let led = false;
let hu = 0;
let hv = 0;
let gu = 0;
let gv = 0;
let last = performance.now();
let changed = true;
let moved = false;
let raf = 0;
let settle = 0;
const EASE_IN = ${EFFECT_EASE_S};
let clock = 0;
let warm = 0;
${EFFECT_PACE}
const tick = now => {
  raf = 0;
  if (lost) return;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  let going = false;
  if (ROAM) {
    if (!following()) warm = 0;
    else if (laidOut) {
      warm = Math.min(EASE_IN, warm + dt);
      const e = warm / EASE_IN;
      clock += dt * SPEED * e * e * (3 - 2 * e);
      going = true;
      moved = true;
    }
  } else if (laidOut && led && following()) {
    const du = gu - hu;
    const dv = gv - hv;
    // how far it has to go, in the canvas's pixels: within a twentieth of one it is there
    const left = Math.abs(du) * scene.width + Math.abs(dv) * scene.height;
    if (left > 0) {
      const share = left < 0.05 ? 1 : 1 - Math.exp(-(dt * SPEED) / EASE);
      hu += du * share;
      hv += dv * share;
      going = true;
      moved = true;
    }
  }
  if (laidOut && (changed || (moved && due(now)))) {
    if (ROAM) {
      const at = roamAt(scene, clock);
      draw(at[0], at[1]);
    } else draw(led ? hu * scene.width : scene.ox, led ? hv * scene.height : scene.oy);
    changed = false;
    moved = false;
  }
  if (going || moved) raf = requestAnimationFrame(tick);
};
const wake = () => {
  if (raf || lost) return;
  last = performance.now();
  raf = requestAnimationFrame(tick);
};
// The pointer, wherever it is over the canvas, whatever lies over that: off the canvas it is not followed, so the
// hollow keeps the last place it was given.
const point = event => {
  if (ROAM || !laidOut) return;
  const box = canvas.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const u = (event.clientX - box.left) / box.width;
  const v = (event.clientY - box.top) / box.height;
  if (u < 0 || u > 1 || v < 0 || v > 1) return;
  if (!led) {
    hu = scene.ox / scene.width;
    hv = scene.oy / scene.height;
    led = true;
  }
  gu = u;
  gv = v;
  wake();
};
addEventListener("pointermove", point, { passive: true });
addEventListener("pointerdown", point, { passive: true });
// The first size comes before the first paint; a later one settles a moment before the drawing is laid out again.
const sizes = new ResizeObserver(entries => {
  const box = entries[entries.length - 1]?.devicePixelContentBoxSize?.[0];
  pixels = box ? { w: box.inlineSize, h: box.blockSize } : null;
  clearTimeout(settle);
  settle = setTimeout(
    () => {
      resize();
      changed = true;
      wake();
    },
    laidOut ? ${EFFECT_SETTLE_MS} : 0
  );
});
try {
  sizes.observe(canvas, { box: "device-pixel-content-box" });
} catch {
  sizes.observe(canvas);
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) wake();
});
reduced.addEventListener("change", wake);
// A GPU lost draws nothing, and nothing is asked of it until a new drawing is made on the one found again, which is
// laid out and drawn at once, the hollow where it was.
const lose = () => {
  lost = true;
  cancelAnimationFrame(raf);
  raf = 0;
};
const found = () => {
  lost = false;
  laidOut = false;
  resize();
  changed = true;
  wake();
};`;
