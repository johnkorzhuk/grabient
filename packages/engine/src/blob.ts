/* A palette as an animated SVG blob, after the grainy gradient blobs of poster design: soft balls of the palette's
   colors, a ring of them turning about the middle while each swings on a circle of its own, melted into one amorphous
   shape by a blur and a lift of its edge, and grained by a fine noise. The noise scatters the melt's pixels before the
   edge is lifted, so the edge breaks into sprayed dots, and it speckles the surface. The blob wanders a figure eight
   as far as the box allows. Nothing else is drawn: the background is transparent.

   Plain CSS turns the balls: no script and no SMIL, so the file moves as an <img>, a CSS background and inline markup
   alike, and a reader who asks for less motion sees the first frame held. Every motion makes whole laps in a loop, so
   the loop closes on itself. The palette's colors lie across the blob, its darker end on one side. Where the balls
   sit, how far they swing and which way the blob turns are drawn from the palette, so every palette has a blob of its
   own and keeps it. */
import { toHex } from "./color.ts";
import { pageBox, svgUrl } from "./css.ts";
import { sampleLCH, sampleSrgb } from "./curve.ts";
import { clamp } from "./math.ts";
import type { Palette } from "./palette.ts";
import type { ParamReader, Size } from "./view.ts";

/** The `style` that asks a palette's SVG for this animation. */
export const BLOB_STYLE = "blob";
export const BLOB_DURATION_MIN = 2;
export const BLOB_DURATION_MAX = 120;
export const DEFAULT_BLOB_DURATION = 16;
/** The picture stretches to any box, the blob keeping its shape. */
export const BLOB_SIZE: Size = { width: 500, height: 500 };

export interface BlobView {
  /** A loop's seconds. */
  duration: number;
}

export const isBlob = (params: ParamReader) => params.get("style") === BLOB_STYLE;

/** The animation an address asks for: a duration that is missing or no number takes the default, and one out of
    bounds comes into them. */
export function parseBlob(params: ParamReader): BlobView {
  const seconds = params.get("duration");
  return {
    duration:
      seconds && /^\d+(\.\d+)?$/.test(seconds)
        ? clamp(Math.round(Number(seconds) * 100) / 100, BLOB_DURATION_MIN, BLOB_DURATION_MAX)
        : DEFAULT_BLOB_DURATION
  };
}

/** The animation's query: `style=blob`, then what differs from the default, then `extra`. */
export function blobSearch(view: BlobView, extra: readonly string[] = []): string {
  const parts = [
    `style=${BLOB_STYLE}`,
    view.duration !== DEFAULT_BLOB_DURATION && `duration=${view.duration}`,
    ...extra
  ].filter(Boolean);
  return `?${parts.join("&")}`;
}

/* Sizes are in the blob's radius unless said: RADIUS of the box's shorter side. */
const RADIUS = 0.29;
/** The melt: a blur this wide, then alpha lifted SLOPE times as steeply about its half, so the edge sits where the
    melt is half and fades over about a tenth of the blob. */
const MELT = 0.24;
const SLOPE = 2.2;
/** The grain: noise this fine a pixel, which scatters the melt's pixels up to about a third of SCATTER of the shorter
    side, and which moves the surface's colors by up to SPECKLE of themselves at CONTRAST. */
const FREQUENCY = 0.75;
const OCTAVES = 2;
const SCATTER = 0.11;
const SPECKLE = 0.16;
const CONTRAST = 2.5;
/** Six balls on a ring and a drop among them that swells the edge further, all turning about the middle, and a core
    over them. A ball's size and swing vary by up to VARY of their own about these. */
const RING = { count: 6, at: 0.55, r: 0.42, swing: 0.28 };
const DROP = { at: 0.8, r: 0.34, swing: 0.32 };
const CORE = { r: 0.6, swing: 0.1 };
const VARY = 0.2;
/** How far past its balls the lifted edge and the grain reach: the edge, in radii; the scatter, of the shorter side. */
const FEATHER = 0.1;
const SPRAY = 0.04;
/** The farthest the blob wanders, of the shorter side. */
const WANDER = 0.5;

/** A number as the file writes it: at most `digits` decimals, no trailing zeros, no zero before the point. */
const num = (v: number, digits = 2) => String(Number(v.toFixed(digits))).replace(/^(-?)0\./, "$1.");

/* FNV-1a */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
/** mulberry32: the same numbers from the same seed, on any machine. */
function dice(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Ball {
  /** its place at rest from the blob's middle, in radii */
  x: number;
  y: number;
  r: number;
  /** where on the palette its color is, 0 its darker end */
  at: number;
  /** the circle it swings on: its radius, whole laps a loop (signed, clockwise on screen when positive), and the turn
      it starts at */
  swing: number;
  laps: number;
  phase: number;
  /** whether it rides the ring, which makes `spin` laps a loop about the middle */
  ring: boolean;
}

export interface BlobScene {
  /** the blob's radius in pixels */
  R: number;
  balls: Ball[];
  spin: number;
  /** how far the blob wanders left and right, and up and down, in pixels */
  wander: { x: number; y: number };
  /** the palette's color at a place on it */
  color: (at: number) => string;
  /** the noise's seed */
  seed: number;
}

/** A ball's middle at a share `f` of the loop, in radii from the blob's middle. */
function ballAt(b: Ball, spin: number, f: number): [number, number] {
  const swing = 2 * Math.PI * (b.phase + b.laps * f);
  const x = b.x + b.swing * Math.cos(swing);
  const y = b.y + b.swing * Math.sin(swing);
  if (!b.ring) return [x, y];
  const turn = 2 * Math.PI * spin * f;
  return [x * Math.cos(turn) - y * Math.sin(turn), x * Math.sin(turn) + y * Math.cos(turn)];
}
/** The wander's shape at a share of the loop, -1 to 1 a side: a sine across the loop, twice as fast up and down. */
const wanderAt = (f: number): [number, number] => [
  Math.sin(2 * Math.PI * f),
  Math.sin(4 * Math.PI * f)
];

/** The blob a palette draws in a box: its balls, read from the palette's own numbers, and how far it may wander and
    stay whole inside the box at every moment of the loop. */
export function blobScene(P: Palette, size: Size): BlobScene {
  const { width: W, height: H } = size;
  const S = Math.min(W, H);
  const R = RADIUS * S;
  const rand = dice(hash(JSON.stringify(P.anchors)));
  const vary = () => 1 - VARY / 2 + VARY * rand();
  const spin = rand() < 0.5 ? -1 : 1;
  const across = 2 * Math.PI * rand();
  const start = 2 * Math.PI * rand();
  /* the palette's darker end on the side `across` points away from, its lighter end on the side it points to */
  const along = (angle: number) => 0.5 - 0.5 * Math.cos(angle - across);
  const balls: Ball[] = [];
  for (let i = 0; i < RING.count; i++) {
    const angle = start + (2 * Math.PI * i) / RING.count;
    balls.push({
      x: RING.at * Math.cos(angle),
      y: RING.at * Math.sin(angle),
      r: RING.r * vary(),
      at: along(angle),
      swing: RING.swing * vary(),
      laps: -spin * (2 + (i % 2)),
      phase: rand(),
      ring: true
    });
  }
  const drop = start + Math.PI / RING.count;
  balls.push({
    x: DROP.at * Math.cos(drop),
    y: DROP.at * Math.sin(drop),
    r: DROP.r,
    at: along(drop),
    swing: DROP.swing,
    laps: -2 * spin,
    phase: rand(),
    ring: true
  });
  balls.push({
    x: 0,
    y: 0,
    r: CORE.r,
    at: 0.5,
    swing: CORE.swing,
    laps: spin,
    phase: rand(),
    ring: false
  });

  /* the wander as wide as keeps every ball, its feather and its spray inside the box at every sampled moment */
  const margin = SPRAY * S;
  let wx = WANDER * S;
  let wy = WANDER * S;
  const STEPS = 240;
  for (let k = 0; k < STEPS; k++) {
    const f = k / STEPS;
    const [sx, sy] = wanderAt(f);
    let [left, right, top, bottom] = [0, 0, 0, 0];
    for (const b of balls) {
      const [x, y] = ballAt(b, spin, f);
      const reach = b.r + FEATHER;
      left = Math.min(left, (x - reach) * R);
      right = Math.max(right, (x + reach) * R);
      top = Math.min(top, (y - reach) * R);
      bottom = Math.max(bottom, (y + reach) * R);
    }
    const room = (side: number, toward: number, far: number) =>
      toward > 1e-9 ? (side / 2 - margin - far) / toward : Number.POSITIVE_INFINITY;
    wx = Math.min(wx, room(W, sx, right), room(W, -sx, -left));
    wy = Math.min(wy, room(H, sy, bottom), room(H, -sy, -top));
  }
  const flip = sampleLCH(P, 0)[0] > sampleLCH(P, 1)[0];
  return {
    R,
    balls,
    spin,
    wander: { x: Math.max(0, wx * 0.97), y: Math.max(0, wy * 0.97) },
    color: (at: number) => toHex(sampleSrgb(P, flip ? 1 - at : at)),
    seed: hash(JSON.stringify(P.anchors)) % 9973
  };
}

/* the file's mark, which keeps its names apart from another such file's in one page */
const mark = (text: string) => `b${(hash(text) % 36 ** 4).toString(36).padStart(4, "0")}`;

/** The animated SVG of a palette at a size, credited in a comment to `credit`, the palette's address. */
export function blobSvg(P: Palette, view: BlobView, size: Size, credit: string): string {
  const { width: W, height: H } = size;
  const S = Math.min(W, H);
  const scene = blobScene(P, size);
  const { R } = scene;
  const id = mark(JSON.stringify([P.anchors, view, W, H]));
  const D = view.duration;

  /* one class to each count of laps, which sets its duration and way round */
  const laps = new Map<number, string>();
  const lapClass = (n: number) => {
    let name = laps.get(n);
    if (!name) {
      name = `t${laps.size}`;
      laps.set(n, name);
    }
    return name;
  };
  const ball = (b: Ball) =>
    `<g transform="translate(${num(b.x * R)} ${num(b.y * R)}) rotate(${num(b.phase * 360, 1)})"><g class="s ${lapClass(b.laps)}"><circle cx="${num(b.swing * R)}" r="${num(b.r * R)}" fill="${scene.color(b.at)}"/></g></g>`;
  const ring = scene.balls
    .filter(b => b.ring)
    .map(ball)
    .join("");
  const core = scene.balls
    .filter(b => !b.ring)
    .map(ball)
    .join("");
  const spin = lapClass(scene.spin);

  const ease = "cubic-bezier(.37,0,.63,1)";
  const { x: wx, y: wy } = scene.wander;
  const wanders = [wx >= 0.5 && ["x", "X", wx, D / 2], wy >= 0.5 && ["y", "Y", wy, D / 4]].filter(
    w => w !== false
  ) as [string, string, number, number][];
  const motion = [
    `.${id} .s{animation:${id}s 1s linear infinite}`,
    ...[...laps].map(
      ([n, name]) =>
        `.${id} .${name}{animation-duration:${num(D / Math.abs(n), 3)}s${n < 0 ? ";animation-direction:reverse" : ""}}`
    ),
    /* half a sweep each way, played forward and back from the middle of the first */
    ...wanders.map(
      ([axis, , , half]) =>
        `.${id} .${axis}{animation:${id}${axis} ${num(half, 3)}s ${ease} -${num(half / 2, 3)}s infinite alternate}`
    )
  ].join("");
  const frames = [
    `@keyframes ${id}s{to{transform:rotate(360deg)}}`,
    ...wanders.map(
      ([axis, Axis, a]) =>
        `@keyframes ${id}${axis}{from{transform:translate${Axis}(${num(-a)}px)}to{transform:translate${Axis}(${num(a)}px)}}`
    )
  ].join("");
  let body = `<g class="s ${spin}">${ring}</g>${core}`;
  for (const [axis] of [...wanders].reverse()) body = `<g class="${axis}">${body}</g>`;

  /* blur; scatter by the noise's red and green; lift the edge; speckle by its blue, alpha kept */
  const lift = `0 0 0 ${num(SLOPE, 3)} ${num(0.5 - SLOPE / 2, 3)}`;
  const gray = `0 0 ${num(CONTRAST, 3)} 0 ${num(0.5 - CONTRAST / 2, 3)}`;
  const filter = [
    `<filter id="${id}f" x="0" y="0" width="${W}" height="${H}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">`,
    `<feGaussianBlur stdDeviation="${num(MELT * R)}" result="b"/>`,
    `<feTurbulence type="fractalNoise" baseFrequency="${FREQUENCY}" numOctaves="${OCTAVES}" seed="${scene.seed}" result="n"/>`,
    `<feDisplacementMap in="b" in2="n" scale="${num(SCATTER * S)}" xChannelSelector="R" yChannelSelector="G"/>`,
    `<feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 ${lift}" result="g"/>`,
    `<feColorMatrix in="n" values="${gray} ${gray} ${gray} 0 0 0 0 1"/>`,
    `<feComposite in="g" operator="arithmetic" k1="${num(2 * SPECKLE, 3)}" k2="${num(1 - SPECKLE, 3)}"/>`,
    "</filter>"
  ].join("");
  const comment = `<!-- ${credit.replace(/--/g, "-%2D")} -->`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="${id}">\n${comment}\n<style>${frames}@media (prefers-reduced-motion:no-preference){${motion}}</style>\n<defs>${filter}</defs>\n<g filter="url(#${id}f)"><g transform="translate(${num(W / 2)} ${num(H / 2)})">${body}</g></g>\n</svg>`;
}

/** The animated SVG as CSS that works alone: the page's background plays it, the SVG carried inside as a data URI,
    the blob as large as the page's box holds it and over whatever the page draws. The box is the size asked for, else
    at least the window's height. */
export function blobCss(P: Palette, view: BlobView, size: Size | null, credit: string): string {
  const svg = blobSvg(P, view, size ?? BLOB_SIZE, credit);
  return `/* ${credit} */\nhtml {\n  ${pageBox(size)}\n  background: ${svgUrl(svg)} center / contain no-repeat;\n}\n`;
}
