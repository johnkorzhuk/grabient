/* A palette as an animated SVG blob, after the grainy gradient blobs of poster design: soft balls of the palette's
   colors, a ring of them turning about the middle while each swings on a circle of its own, melted into one amorphous
   shape by a blur and a lift of its edge, and frosted by a fine noise that scatters the melt's pixels before the edge
   is lifted, so the edge breaks into sprayed dots, and that speckles the surface. Three blobs fill the box, one far,
   one midway and one near: the nearer is larger, wanders farther and is painted later, so where they melt into one
   another its colors lie over the farther's, and each swells and shrinks a little as it drifts near and far. The
   palette lies across every blob along the view's angle, as a gradient's does at it, its first color toward the
   angle's tail. Nothing is drawn behind the blobs unless the address asks for a ground: a color, which may let what
   is behind it through.

   One filter draws everything: a second, masked drawing cross-faded by depth made Chrome's GPU painter drop the filter on
   some tiles and flicker, so the file keeps to the work it paints reliably. Plain CSS
   moves everything: no script and no SMIL, so the file moves as an <img>, a CSS background and inline markup alike,
   and a reader who asks for less motion sees the first frame held. Every motion makes whole laps in a loop, so the loop
   closes on itself. Every shape is written where it stands in the first frame and turns about an origin of its own,
   with no transform attribute for an optimizer to move onto a moving element, and a renderer without CSS draws that
   first frame. The palette's colors lie across each blob, its darker end on one side. Where the balls sit, how they
   swing and turn and when they come near are drawn from the palette, or from the palette and a shape number, so every
   palette has blobs of its own and keeps them.

   Everything is drawn in one square design, BLOB_DESIGN, scaled to cover the box as a background image is (xMidYMid
   slice). So one still SVG, drawn before anyone knows the screen, fits any box, and the WebGL player
   (ui/blob-player.ts) draws the same design scaled the same way, its frost the SVG's own feTurbulence computed as
   Chromium computes it, so it takes over from the still without a seam. The ground fills the box: the file's ground
   rect covers its whole viewport, and a page that shows a fluid still (no size) paints it behind (blobScene's
   backdrop). */
import { encodePalette } from "./codec.ts";
import { contrastOf, hexBytes, luminance, toHex } from "./color.ts";
import { pageBox, svgUrl } from "./css.ts";
import { sampleSrgb } from "./curve.ts";
import { groundHex, groundParts } from "./effect.ts";
import { clamp, clamp01 } from "./math.ts";
import type { Palette } from "./palette.ts";
import { type ParamReader, parseView, type Size } from "./view.ts";

/** The `style` that asks a palette's SVG for this animation. */
export const BLOB_STYLE = "blob";
/** A loop's seconds at speed 1. */
export const BLOB_LOOP = 16;
export const BLOB_SPEED_MIN = 0.1;
export const BLOB_SPEED_MAX = 10;
export const BLOB_FROST_MAX = 2;
export const BLOB_SHAPE_MAX = 9999;
export const BLOB_FPS_MAX = 120;
/** A GIF's frames a second where its address asks for none. */
export const BLOB_GIF_FPS = 12;
/** The fastest a GIF plays as written: browsers draw a delay under two hundredths of a second at a tenth. */
export const BLOB_GIF_FPS_MAX = 50;
/** A GIF's size where its address asks for none. */
export const BLOB_GIF_SIZE: Size = { width: 400, height: 400 };
/** The most a GIF is drawn with, its pixels times its frames, a filled one's counted half again: about a second. */
export const BLOB_GIF_WORK = 32_000_000;
/** The fewest frames a GIF's loop is drawn in before its size is made smaller. */
const GIF_FRAMES_LEAST = 96;
/** The picture fits any box, covering it: the file's size where its address asks for none. */
export const BLOB_SIZE: Size = { width: 500, height: 500 };
/** The one square design every box shows, scaled to cover it (blobFit). */
export const BLOB_DESIGN: Size = { width: 500, height: 500 };

export interface BlobView {
  /** How fast it moves: the loop is BLOB_LOOP seconds over this. */
  speed: number;
  /** How much frost: 1 as designed, 0 none, 2 twice. */
  frost: number;
  /** A shape of its own, the same whatever the colors, or null for the shape the palette's own numbers draw. */
  shape: number | null;
  /** The ground behind the blobs: none, or a color as #rrggbb, or #rrggbbaa where it lets what is behind it through. */
  bg: string | null;
  /** The view's angle, in degrees: the palette lies across every blob along it, its first color toward its tail. */
  angle: number;
  /** The first frame alone, with no motion: what a page paints before a player takes over. */
  still: boolean;
  /** Frames a second: a GIF's own (BLOB_GIF_FPS where none is asked), a player's most; null leaves a player the
      screen's own pace. The SVG, which the browser moves, takes none. */
  fps: number | null;
}

export const isBlob = (params: ParamReader) => params.get("style") === BLOB_STYLE;

const decimal = (raw: string | null, min: number, max: number, otherwise: number) =>
  raw && /^\d+(\.\d+)?$/.test(raw)
    ? clamp(Math.round(Number(raw) * 100) / 100, min, max)
    : otherwise;

/** The animation an address asks for. A speed or frost that is missing or no number takes the default and one out of
    bounds comes into them; `shape` takes up to four digits; `bg` a hex color of 3, 4, 6 or 8 digits, with or without
    its `#` (effect.ts's groundHex); `angle` the view's; `still=1` is the first frame alone; `fps` takes 1 to 120. */
export function parseBlob(params: ParamReader): BlobView {
  const shape = params.get("shape");
  const fps = params.get("fps");
  return {
    speed: decimal(params.get("speed"), BLOB_SPEED_MIN, BLOB_SPEED_MAX, 1),
    frost: decimal(params.get("frost"), 0, BLOB_FROST_MAX, 1),
    shape: shape && /^\d{1,4}$/.test(shape) ? Number(shape) : null,
    bg: groundHex(params.get("bg")),
    angle: parseView(params).angle,
    still: params.get("still") === "1",
    fps:
      fps && /^\d{1,3}$/.test(fps) && Number(fps) > 0 ? Math.min(Number(fps), BLOB_FPS_MAX) : null
  };
}

export interface BlobGifPlan {
  size: Size;
  frames: number;
  /** the loop's length */
  seconds: number;
}

/** What a GIF is drawn as (blob-gif.ts): one whole loop in frames of the rate asked for (BLOB_GIF_FPS where none is,
    at most BLOB_GIF_FPS_MAX), as many as BLOB_GIF_WORK allows, at the size asked for or smaller. Past the budget the
    loop takes fewer frames, which a slow blob, moving little from frame to frame, hardly shows; a size that would
    leave fewer than GIF_FRAMES_LEAST is drawn smaller, its shape kept. */
export function blobGifPlan(view: Pick<BlobView, "speed" | "fps">, asked: Size): BlobGifPlan {
  const seconds = BLOB_LOOP / view.speed;
  const weight = 1.5;
  const fps = Math.min(view.fps ?? BLOB_GIF_FPS, BLOB_GIF_FPS_MAX);
  const wanted = Math.max(2, Math.round(seconds * fps));
  const most = BLOB_GIF_WORK / (weight * Math.min(wanted, GIF_FRAMES_LEAST));
  const scale = Math.min(1, Math.sqrt(most / (asked.width * asked.height)));
  const size = {
    width: Math.max(1, Math.floor(asked.width * scale)),
    height: Math.max(1, Math.floor(asked.height * scale))
  };
  const fits = Math.floor(BLOB_GIF_WORK / (weight * size.width * size.height));
  return { size, frames: Math.max(2, Math.min(wanted, fits)), seconds };
}

/** The animation's query: `style=blob`, then what differs from the defaults in one order, then `extra`. Without the
    loop, the query of its first frame, which no speed changes. */
export function blobSearch(view: BlobView, extra: readonly string[] = [], loop = true): string {
  const parts = [
    `style=${BLOB_STYLE}`,
    view.angle !== 90 && `angle=${view.angle}`,
    loop && view.speed !== 1 && `speed=${view.speed}`,
    view.frost !== 1 && `frost=${view.frost}`,
    view.shape !== null && `shape=${view.shape}`,
    view.bg && `bg=${view.bg.replace("#", "")}`,
    loop && view.still && "still=1",
    loop && view.fps !== null && `fps=${view.fps}`,
    ...extra
  ].filter(Boolean);
  return `?${parts.join("&")}`;
}

/* Sizes are in a blob's radius unless said; a blob's radius is FILL.radius of the design's side, times its layer's. */
/** The melt: a blur this wide, then alpha lifted SLOPE times as steeply about its half, so the edge sits where the
    melt is half and fades over about a tenth of the blob. */
const MELT = 0.24;
const SLOPE = 2.2;
/** The frost: noise this fine a pixel, which scatters the melt's pixels up to about a third of SCATTER of the shorter
    side, and which moves the surface's colors by up to SPECKLE of themselves at CONTRAST. */
const FREQUENCY = 0.75;
const OCTAVES = 2;
const SCATTER = 0.075;
const SPECKLE = 0.1;
const CONTRAST = 2.2;
/** Six balls on a ring and a drop among them that swells the edge further, all turning about the middle, and a core
    over them. A ball's size and swing vary by up to VARY of their own about these. */
const RING = { count: 6, at: 0.55, r: 0.42, swing: 0.28 };
const DROP = { at: 0.8, r: 0.34, swing: 0.32 };
const CORE = { r: 0.6, swing: 0.1 };
const VARY = 0.2;
/** Each blob's breath: its size from far to near as it drifts, about its size in the first frame, which is midway. */
const DEPTH = { far: 0.88, near: 1.12 };
/** Three blobs this large, out from the design's middle by a share of its side, each wandering `wander` of it. A
    shape scales them all by SCALE and spreads them by REACH, so some shapes are small blobs
    with the ground between them and some fill it. */
const FILL = { count: 3, radius: 0.33, out: 0.27, wander: 0.13 };
const SCALE = { least: 0.55, most: 1.12 };
const REACH = { least: 0.8, most: 1.15 };
/** The three layers, far to near, in the order they are painted: each one's size and the reach of its wander, so the
    nearer is larger and moves farther, as nearer things do. */
const LAYERS = [
  { size: 0.8, reach: 0.65 },
  { size: 1, reach: 1 },
  { size: 1.2, reach: 1.4 }
] as const;
/** How many laps of the loop each blob's wander makes across and down. */
const FILL_LAPS: readonly (readonly [number, number])[] = [
  [1, 2],
  [2, 1],
  [1, 3]
];

/** A number as the file writes it: at most `digits` decimals, no trailing zeros, no zero before the point. */
const num = (v: number, digits = 2) => String(Number(v.toFixed(digits))).replace(/^(-?)0\./, "$1.");
const px = (x: number, y: number) => `${num(x)}px ${num(y)}px`;

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
  /** its place at rest from its blob's middle, in radii */
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

/** A wander to and fro along one axis: half its width in the design's units, and whole laps a loop, its sign the way
    it starts. */
interface Sweep {
  reach: number;
  laps: number;
}

export interface Blob {
  /** its middle at rest, in the design's units */
  x: number;
  y: number;
  /** its radius in the design's units, midway in depth */
  R: number;
  balls: Ball[];
  spin: number;
  /** its wander across and down */
  wander: [Sweep, Sweep];
  /** its depth: laps a loop, the sign whether it comes near first */
  depth: number;
}

export interface BlobScene {
  blobs: Blob[];
  /** what the blobs are drawn on, or null for nothing */
  backdrop: string | null;
  /** how far past the design square the melt reads, in its units: filled blobs wander past its edge and still melt
      there */
  pad: number;
  /** the palette's color at a place on it */
  color: (at: number) => string;
  /** the noise's seed */
  seed: number;
}

/** A ball's middle at a share `f` of the loop, in radii from its blob's middle. */
function ballAt(b: Ball, spin: number, f: number): [number, number] {
  const swing = 2 * Math.PI * (b.phase + b.laps * f);
  const x = b.x + b.swing * Math.cos(swing);
  const y = b.y + b.swing * Math.sin(swing);
  if (!b.ring) return [x, y];
  const turn = 2 * Math.PI * spin * f;
  return [x * Math.cos(turn) - y * Math.sin(turn), x * Math.sin(turn) + y * Math.cos(turn)];
}
/** A to-and-fro at a share of the loop, -1 to 1: a sine of its laps, starting from the middle. */
const sweepAt = (laps: number, f: number) => Math.sin(2 * Math.PI * laps * f);
/** A blob's size at a share of the loop, as a share of its size midway. */
const depthAt = (depth: number, f: number) =>
  1 + ((DEPTH.near - DEPTH.far) / 2) * sweepAt(depth, f);

/** A blob's balls about its middle: six on a ring, a drop among them and a core, drawn from `rand`, the palette across
    them toward `toward` (radians on the screen, clockwise from the right): its first color on the far side, its last
    on that one. */
function ballsOf(rand: () => number, spin: number, toward: number): Ball[] {
  const vary = () => 1 - VARY / 2 + VARY * rand();
  /* a number drawn and left, so a shape's blobs stand where they stood before the angle laid their colors */
  rand();
  const start = 2 * Math.PI * rand();
  const along = (angle: number) => 0.5 + 0.5 * Math.cos(angle - toward);
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
  return balls;
}

/** The direction a view's angle points on the screen, in radians clockwise from the right: CSS's angle, 0 up and 90
    to the right. */
const towardOf = (angle: number) => ((angle - 90) * Math.PI) / 180;

/** The scene a palette draws, in the design square (BLOB_DESIGN) whatever the box, `size`, it is shown in: its three
    blobs, far to near, read from the shape number or else the palette's own numbers, the palette across each along
    the angle, and its ground. */
export function blobScene(
  P: Palette,
  _size: Size = BLOB_DESIGN,
  view: Pick<BlobView, "shape" | "bg" | "angle"> = { shape: null, bg: null, angle: 90 }
): BlobScene {
  const { width: W, height: H } = BLOB_DESIGN;
  const S = Math.min(W, H);
  /* a shape number alone decides the shape, so recoloring a palette keeps its blobs; without one the palette does, by
     its seed, which every JavaScript engine writes alike: its anchors' last digits differ between engines (Node's V8
     and Chrome's decode one hue as -93.43961502960886 and ...893), and a hash of them gave the server's still and the
     browser's player two different blobs */
  const own = view.shape === null ? encodePalette(P) : `shape/${view.shape}`;
  const rand = dice(hash(own));
  const sign = () => (rand() < 0.5 ? -1 : 1);
  const color = (at: number) => toHex(sampleSrgb(P, at));
  const seed = hash(own) % 9973;
  const backdrop = view.bg ?? null;
  const toward = towardOf(view.angle ?? 90);
  const turn = 2 * Math.PI * rand();
  /* the shape's own scale and spread, drawn after the blobs so they stand where they did */
  const blobs = Array.from({ length: FILL.count }, (_, k): Blob => {
    const spin = sign();
    const angle = turn + (2 * Math.PI * k) / FILL.count;
    const [across, down] = FILL_LAPS[k % FILL_LAPS.length];
    return {
      x: W / 2 + FILL.out * W * Math.cos(angle),
      y: H / 2 + FILL.out * H * Math.sin(angle),
      R: FILL.radius * S * (0.9 + 0.2 * rand()),
      balls: ballsOf(rand, spin, toward),
      spin,
      wander: [
        { reach: FILL.wander * W, laps: across * sign() },
        { reach: FILL.wander * H, laps: down * sign() }
      ],
      depth: (k % 2 ? 2 : 1) * sign()
    };
  });
  /* most shapes near full, a few small: the scale's draw leans toward its top */
  const scale = SCALE.least + (SCALE.most - SCALE.least) * Math.sqrt(rand());
  const spread = REACH.least + (REACH.most - REACH.least) * rand();
  /* far to near: the blob drawn largest is the nearest, painted last */
  const order = blobs
    .map((b, k) => ({ b, k }))
    .sort((p, q) => p.b.R - q.b.R || p.k - q.k)
    .map(({ b }, layer) => {
      const { size, reach } = LAYERS[layer];
      return {
        ...b,
        x: W / 2 + (b.x - W / 2) * spread,
        y: H / 2 + (b.y - H / 2) * spread,
        R: b.R * size * scale,
        wander: [
          { ...b.wander[0], reach: b.wander[0].reach * reach },
          { ...b.wander[1], reach: b.wander[1].reach * reach }
        ] as [Sweep, Sweep]
      };
    });
  return {
    blobs: order,
    backdrop,
    pad: 1.5 * MELT * DEPTH.near * Math.max(...order.map(b => b.R)),
    color,
    seed
  };
}

/** Where a blob's ball stands at a share of the loop, in the design's units from its corner, and its radius there,
    with the blob's wander and its breath: what the file draws then. */
export function ballPlace(blob: Blob, b: Ball, f: number): [number, number, number] {
  const [x, y] = ballAt(b, blob.spin, f);
  const scale = depthAt(blob.depth, f) * blob.R;
  return [
    blob.x + blob.wander[0].reach * sweepAt(blob.wander[0].laps, f) + x * scale,
    blob.y + blob.wander[1].reach * sweepAt(blob.wander[1].laps, f) + y * scale,
    b.r * scale
  ];
}

/** ballPlace for every ball of a scene at a share `f` of the loop, in the file's order, written into `out` as x, y and
    radius at every `stride` from 0, allocating nothing: what a player draws each frame. */
export function blobPlaces(scene: BlobScene, f: number, out: Float32Array, stride: number): void {
  let k = 0;
  for (const blob of scene.blobs) {
    const scale = depthAt(blob.depth, f) * blob.R;
    const x0 = blob.x + blob.wander[0].reach * sweepAt(blob.wander[0].laps, f);
    const y0 = blob.y + blob.wander[1].reach * sweepAt(blob.wander[1].laps, f);
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

/** One ball as a player draws it at a moment: its middle and radius in the design's units and its color. */
export interface BlobDot {
  x: number;
  y: number;
  r: number;
  color: string;
}
/** Every ball of a scene at a share `f` of the loop, in the order the file paints them, with each blob's wander and
    breath: what a player draws, frame after frame, from the file's own motion. */
export function blobFrame(scene: BlobScene, f: number): BlobDot[] {
  return scene.blobs.flatMap(blob =>
    blob.balls.map(b => {
      const [x, y, r] = ballPlace(blob, b, f);
      return { x, y, r, color: scene.color(b.at) };
    })
  );
}

/** How a player melts and frosts a scene, every number as the SVG's filter writes it, lengths in the design's units
    (blobFit scales them to a box): the melt's blur (stdDeviation), the lift of its edge (alpha times `slope` plus
    `lift`), how far the frost scatters (the displacement's scale), the speckle's arithmetic (k1, k2) and its gray
    (the noise's blue times `contrast` plus `gray`), how far past the design square the melt reads (the filter
    region's pad), and the frost's noise: feTurbulence's frequency, octaves and seed, none at frost 0. */
export function blobFilter(view: Pick<BlobView, "frost">, _size: Size, scene: BlobScene) {
  const { scatter, speckle } = frostOf(view.frost);
  const written = (v: number, digits = 2) => Number(num(v, digits));
  return {
    melt: written(MELT * Math.max(...scene.blobs.map(b => b.R))),
    slope: written(SLOPE, 3),
    lift: written(0.5 - SLOPE / 2, 3),
    scatter: written(scatter * BLOB_DESIGN.width),
    speckle,
    k1: written(2 * speckle, 3),
    k2: written(1 - speckle, 3),
    contrast: written(CONTRAST, 3),
    gray: written(0.5 - CONTRAST / 2, 3),
    pad: written(scene.pad),
    frequency: FREQUENCY,
    octaves: OCTAVES,
    seed: scene.seed,
    /** whether the noise is drawn at all: frost 0 leaves it out, with its scatter and speckle */
    noise: scatter > 0 || speckle > 0
  };
}

/** How the design fills a box: scaled by `scale`, its corner at (x, y) in the box. It covers the box, cropped to its
    shape and centered. */
export interface BlobFit {
  scale: number;
  x: number;
  y: number;
}
export function blobFit(size: Size): BlobFit {
  const across = size.width / BLOB_DESIGN.width;
  const down = size.height / BLOB_DESIGN.height;
  const scale = Math.max(across, down);
  return {
    scale,
    x: (size.width - scale * BLOB_DESIGN.width) / 2,
    y: (size.height - scale * BLOB_DESIGN.height) / 2
  };
}

/** The frost at a view's frost: how far the noise scatters, as a share of the shorter side, and how much it speckles. */
const frostOf = (frost: number) => ({
  scatter: SCATTER * frost,
  speckle: Math.min(0.4, SPECKLE * frost)
});

/* the file's mark, which keeps its names apart from another such file's in one page */
const mark = (text: string) => `b${(hash(text) % 36 ** 4).toString(36).padStart(4, "0")}`;

/** The animated SVG of a palette at a size, credited in a comment to `credit`, the palette's address: the design
    scaled to cover the size, its ground (if any) over the whole of it. With no size it is fluid, as wide and tall as
    what holds it, which then paints the ground behind it (blobScene's backdrop): one still a server draws before it
    knows the box. */
export function blobSvg(P: Palette, view: BlobView, size: Size | null, credit: string): string {
  const W = size?.width;
  const H = size?.height;
  const S = BLOB_DESIGN.width;
  const scene = blobScene(P, BLOB_DESIGN, view);
  const id = mark(JSON.stringify([encodePalette(P), view, W ?? "fluid", H ?? "fluid"]));
  const D = BLOB_LOOP / view.speed;
  const ease = "cubic-bezier(.37,0,.63,1)";

  /* one class to each count of laps a turn makes, which sets its duration and way round */
  const turns = new Map<number, string>();
  const turnClass = (n: number) => {
    let name = turns.get(n);
    if (!name) {
      name = `t${turns.size}`;
      turns.set(n, name);
    }
    return name;
  };
  /* one class to each to-and-fro, played forward and back from the middle of its first half; keyframes are shared by
     every to-and-fro between the same two ends */
  const rules = new Map<string, string>();
  const frames = new Map<string, string>([["s", "to{transform:rotate(360deg)}"]]);
  const sweepClass = (between: string, laps: number) => {
    let keyframes = [...frames].find(([, b]) => b === between)?.[0];
    if (!keyframes) {
      keyframes = `k${frames.size}`;
      frames.set(keyframes, between);
    }
    const half = D / (2 * Math.abs(laps));
    const rule = `animation:${id}${keyframes} ${num(half, 3)}s ${ease} -${num(half / 2, 3)}s infinite alternate${laps < 0 ? "-reverse" : ""}`;
    let name = rules.get(rule);
    if (!name) {
      name = `a${rules.size}`;
      rules.set(rule, name);
    }
    return name;
  };
  const wandering = (blob: Blob, inner: string) => {
    let body = inner;
    for (const [axis, sweep] of [
      ["Y", blob.wander[1]],
      ["X", blob.wander[0]]
    ] as const) {
      if (sweep.reach < 0.5) continue;
      const a = num(sweep.reach);
      const name = sweepClass(
        `from{transform:translate${axis}(-${a}px)}to{transform:translate${axis}(${a}px)}`,
        sweep.laps
      );
      body = `<g class="${name}">${body}</g>`;
    }
    return body;
  };
  const deepening = (blob: Blob, far: number, near: number) =>
    sweepClass(
      `from{transform:scale(${num(far, 3)})}to{transform:scale(${num(near, 3)})}`,
      blob.depth
    );

  /* each blob's balls where they stand in the first frame, each swinging about its place at rest, the ring turning
     about the blob's middle and the whole drawing breathing about it */
  const balls = scene.blobs
    .map(blob => {
      const { R } = blob;
      const ball = (b: Ball) => {
        const [hx, hy] = [blob.x + b.x * R, blob.y + b.y * R];
        const turn = 2 * Math.PI * b.phase;
        return `<circle class="s ${turnClass(b.laps)}" style="transform-origin:${px(hx, hy)}" cx="${num(hx + b.swing * R * Math.cos(turn))}" cy="${num(hy + b.swing * R * Math.sin(turn))}" r="${num(b.r * R)}" fill="${scene.color(b.at)}"/>`;
      };
      const middle = `transform-origin:${px(blob.x, blob.y)}`;
      const ring = `<g class="s ${turnClass(blob.spin)}" style="${middle}">${blob.balls
        .filter(b => b.ring)
        .map(ball)
        .join("")}</g>${blob.balls
        .filter(b => !b.ring)
        .map(ball)
        .join("")}`;
      return wandering(
        blob,
        `<g class="${deepening(blob, DEPTH.far, DEPTH.near)}" style="${middle}">${ring}</g>`
      );
    })
    .join("");

  const R = Math.max(...scene.blobs.map(b => b.R));
  const pad = scene.pad;
  const { width: DW, height: DH } = BLOB_DESIGN;
  const region = `x="${num(-pad)}" y="${num(-pad)}" width="${num(DW + 2 * pad)}" height="${num(DH + 2 * pad)}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"`;
  const gray = `0 0 ${num(CONTRAST, 3)} 0 ${num(0.5 - CONTRAST / 2, 3)}`;
  /* blur; scatter by the noise's red and green; lift the edge; speckle by the noise's blue, alpha kept */
  const { scatter, speckle } = frostOf(view.frost);
  const filter = [
    `<filter id="${id}f" ${region}>`,
    `<feGaussianBlur stdDeviation="${num(MELT * R)}" result="b"/>`,
    scatter || speckle
      ? `<feTurbulence type="fractalNoise" baseFrequency="${FREQUENCY}" numOctaves="${OCTAVES}" seed="${scene.seed}" result="n"/>`
      : "",
    scatter
      ? `<feDisplacementMap in="b" in2="n" scale="${num(scatter * S)}" xChannelSelector="R" yChannelSelector="G"/>`
      : "",
    `<feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 ${num(SLOPE, 3)} ${num(0.5 - SLOPE / 2, 3)}" result="g"/>`,
    speckle
      ? `<feColorMatrix in="n" values="${gray} ${gray} ${gray} 0 0 0 0 1"/><feComposite in="g" operator="arithmetic" k1="${num(2 * speckle, 3)}" k2="${num(1 - speckle, 3)}"/>`
      : "",
    "</filter>"
  ].join("");
  /* the ground over the whole viewport, in the design's units, rounded outward so no sliver of the box is left bare */
  let base = "";
  if (scene.backdrop && W !== undefined && H !== undefined) {
    const fit = blobFit({ width: W, height: H });
    const x0 = Math.floor((-fit.x / fit.scale) * 100) / 100;
    const y0 = Math.floor((-fit.y / fit.scale) * 100) / 100;
    const x1 = Math.ceil(((W - fit.x) / fit.scale) * 100) / 100;
    const y1 = Math.ceil(((H - fit.y) / fit.scale) * 100) / 100;
    const at = `${x0 ? ` x="${num(x0)}"` : ""}${y0 ? ` y="${num(y0)}"` : ""}`;
    const { hex, alpha } = groundParts(scene.backdrop);
    const clear = alpha < 1 ? ` fill-opacity="${num(alpha, 3)}"` : "";
    base = `<rect${at} width="${num(x1 - x0)}" height="${num(y1 - y0)}" fill="${hex}"${clear}/>`;
  }
  const defs = filter;
  const body = `${base}<g filter="url(#${id}f)">${balls}</g>`;

  const motion = [
    `.${id} .s{animation:${id}s 1s linear infinite}`,
    ...[...turns].map(
      ([n, name]) =>
        `.${id} .${name}{animation-duration:${num(D / Math.abs(n), 3)}s${n < 0 ? ";animation-direction:reverse" : ""}}`
    ),
    ...[...rules].map(([rule, name]) => `.${id} .${name}{${rule}}`)
  ].join("");
  const keyframes = [...frames]
    .map(([name, between]) => `@keyframes ${id}${name}{${between}}`)
    .join("");
  const comment = `<!-- ${credit.replace(/--/g, "-%2D")} -->`;
  /* the still frame carries no motion at all: what it draws is where every motion starts */
  const style = view.still
    ? ""
    : `<style>${keyframes}@media (prefers-reduced-motion:no-preference){${motion}}</style>\n`;
  /* the design scaled to cover the box */
  const box = W === undefined ? 'width="100%" height="100%"' : `width="${W}" height="${H}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" ${box} viewBox="0 0 ${DW} ${DH}" preserveAspectRatio="xMidYMid slice" class="${id}">\n${comment}\n${style}<defs>${defs}</defs>\n${body}\n</svg>`;
}

/** The animated SVG as CSS that works alone: the page's background plays it, the SVG carried inside as a data URI,
    covering the page's box, on its ground's color where it has one. The box is the size asked for, else at least the
    window's height. */
export function blobCss(P: Palette, view: BlobView, size: Size | null, credit: string): string {
  const box = size ?? BLOB_SIZE;
  /* the file's own ground covers the box: no color under it, which would show through a ground that lets it */
  const svg = blobSvg(P, view, box, credit);
  return `/* ${credit} */\nhtml {\n  ${pageBox(size)}\n  background: ${svgUrl(svg)} center / cover no-repeat;\n}\n`;
}

/** feTurbulence's tables for a seed as Chromium's Skia builds them (SkPerlinNoiseShaderImpl.h): the SVG 1.1 reference
    init (setup_seed, its random, four channels of gradients, the lattice selector shuffled after them), the gradients
    permuted by the lattice and normalized, each kept as two 16-bit values round((g + 1) * 32767.5). `gradients` is
    Skia's noise bitmap byte for byte, 256 x 4 RGBA8 (a row a channel, each texel a gradient's x and y, low byte
    first), which its GPU code decodes as (hi + lo / 256) / 255 * 2 - 1; `lattice` is its 256-byte selector. A shader
    that reads these as Ganesh does computes the SVG's noise exactly (ui/blob-player.ts). */
export function blobNoiseTables(seed: number): { lattice: Uint8Array; gradients: Uint8Array } {
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
      for (const [k, g] of [
        [0, length ? f(gx * (1 / length)) : 0],
        [2, length ? f(gy * (1 / length)) : 0]
      ]) {
        const v = Math.floor(f(f(g + 1) * 32767.5) + 0.5);
        gradients[o + k] = v & 255;
        gradients[o + k + 1] = v >> 8;
      }
    }
  }
  return { lattice, gradients };
}

/* The still frame. */

/** The widths of three boxes whose blurs, one after another, come near a Gaussian blur of `sigma`. */
function boxes(sigma: number): number[] {
  const ideal = Math.sqrt(4 * sigma * sigma + 1);
  let lower = Math.floor(ideal);
  if (lower % 2 === 0) lower--;
  const m = Math.round(
    (12 * sigma * sigma - 3 * lower * lower - 12 * lower - 9) / (-4 * lower - 4)
  );
  return [0, 1, 2].map(i => (i < m ? lower : lower + 2));
}
/** One box blur of four channels, across rows (`step` 4) or down columns (`step` 4 × the width), nothing outside. */
function boxBlur(
  from: Float32Array,
  to: Float32Array,
  lines: number,
  length: number,
  line: number,
  step: number,
  width: number
) {
  const r = (width - 1) / 2;
  for (let l = 0; l < lines; l++) {
    for (let c = 0; c < 4; c++) {
      const at = (i: number) => l * line + i * step + c;
      let sum = 0;
      for (let i = 0; i <= r && i < length; i++) sum += from[at(i)];
      for (let i = 0; i < length; i++) {
        to[at(i)] = sum / width;
        if (i + r + 1 < length) sum += from[at(i + r + 1)];
        if (i - r >= 0) sum -= from[at(i - r)];
      }
    }
  }
}

/** lowbias32: a pixel's noise from its index. */
function noise(n: number): number {
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return (n ^ (n >>> 16)) >>> 0;
}
/** Two bytes of noise as one value about a half with the file's turbulence's spread, 0.12. */
const SPREAD = 0.292 / 255;
const near = (bits: number) => 0.5 + ((bits & 255) + ((bits >>> 8) & 255) - 255) * SPREAD;

/** Draws the scene's frames as pixels at a size, row after row: four bytes each, alpha the file's and its ground's,
    or three on `backdrop` (0 to 255 a channel), the ground laid over it where it has one. It is the file's drawing by
    the same numbers, the design scaled to cover the box as the file scales it (blobFit), its blur in three boxes at a
    smaller scale and its frost noise of the same spread, which stays put from frame to frame as the file's does, so
    it is read once: a frame then costs the balls, the small blur and one pass. */
export function blobRenderer(
  P: Palette,
  view: Pick<BlobView, "frost" | "shape" | "bg" | "angle">,
  size: Size,
  backdrop?: readonly number[]
) {
  const { width: W, height: H } = size;
  const scene = blobScene(P, BLOB_DESIGN, view);
  /* the design in the box's pixels */
  const fit = blobFit(size);
  const k = fit.scale;
  const S = BLOB_DESIGN.width * k;
  const R = Math.max(...scene.blobs.map(b => b.R)) * k;
  /* the ground, a color and how much of it covers what is behind; over the backdrop where one is given */
  const ground = scene.backdrop ? groundParts(scene.backdrop) : null;
  const groundRgb = ground ? hexBytes(ground.hex) : null;
  const under: number[] | undefined =
    backdrop && groundRgb && ground
      ? groundRgb.map((v, i) => Math.round(v * ground.alpha + backdrop[i] * (1 - ground.alpha)))
      : backdrop
        ? [...backdrop]
        : groundRgb && ground && ground.alpha === 1
          ? groundRgb
          : undefined;
  /* a clear picture's ground that lets something through: its color and alpha under every pixel */
  const veil = !under && groundRgb && ground ? { rgb: groundRgb, alpha: ground.alpha } : null;
  const channels: 3 | 4 = under ? 3 : 4;
  /* the melt, drawn and blurred at 1/q of the size, where the blur is about four pixels, over the box and its pad, with
     a texel of nothing around it, so a read past its edge needs no test */
  const q = Math.max(1, Math.floor((MELT * R) / 4));
  const pad = Math.ceil((scene.pad * k) / q) + 1;
  const w = Math.ceil(W / q) + 2 * pad;
  const h = Math.ceil(H / q) + 2 * pad;
  const melt = new Float32Array(4 * w * h);
  const across = new Float32Array(melt.length);
  const widths = boxes((MELT * R) / q);
  const colors = new Map<string, number[]>();
  /* each pixel's place in the melt, scattered by the frost, and its speckle: the same in every frame, so each pixel's
     four texels and its share of each are read once */
  const { scatter, speckle } = frostOf(view.frost);
  const seed = Math.imul(scene.seed + 1, 0x9e3779b1);
  const N = W * H;
  const corner = new Int32Array(N);
  const across_ = new Float32Array(N);
  const down = new Float32Array(N);
  const grains = new Float32Array(N);
  for (let y = 0, p = 0; y < H; y++) {
    for (let x = 0; x < W; x++, p++) {
      const a = noise((2 * p) ^ seed);
      const b = noise((2 * p + 1) ^ seed);
      const u = clamp((x + 0.5 + scatter * S * (near(a) - 0.5)) / q - 0.5 + pad, 0, w - 1.001);
      const v = clamp(
        (y + 0.5 + scatter * S * (near(a >>> 16) - 0.5)) / q - 0.5 + pad,
        0,
        h - 1.001
      );
      const x0 = Math.floor(u);
      const y0 = Math.floor(v);
      corner[p] = 4 * (y0 * w + x0);
      across_[p] = u - x0;
      down[p] = v - y0;
      grains[p] = 1 - speckle + 2 * speckle * clamp01(0.5 + CONTRAST * (near(b) - 0.5));
    }
  }
  const row = 4 * w;
  const lift0 = 0.5 - SLOPE / 2;

  /** The frame at a share `f` of the loop. */
  const frame = (f: number): Uint8Array<ArrayBuffer> => {
    melt.fill(0);
    for (const dot of blobFrame(scene, f)) {
      const cx = (fit.x + dot.x * k) / q + pad;
      const cy = (fit.y + dot.y * k) / q + pad;
      const r = (dot.r * k) / q;
      let rgb = colors.get(dot.color);
      if (!rgb) {
        rgb = hexBytes(dot.color).map(v => v / 255);
        colors.set(dot.color, rgb);
      }
      const [red, green, blue] = rgb;
      for (let y = Math.max(1, Math.floor(cy - r - 1)); y < Math.min(h - 1, cy + r + 1); y++) {
        for (let x = Math.max(1, Math.floor(cx - r - 1)); x < Math.min(w - 1, cx + r + 1); x++) {
          const cover = clamp01(r - Math.hypot(x + 0.5 - cx, y + 0.5 - cy) + 0.5);
          if (!cover) continue;
          const at = 4 * (y * w + x);
          const keep = 1 - cover;
          melt[at] = red * cover + melt[at] * keep;
          melt[at + 1] = green * cover + melt[at + 1] * keep;
          melt[at + 2] = blue * cover + melt[at + 2] * keep;
          melt[at + 3] = cover + melt[at + 3] * keep;
        }
      }
    }
    for (const width of widths) {
      boxBlur(melt, across, h, w, 4 * w, 4, width);
      boxBlur(across, melt, w, h, 4, 4 * w, width);
    }
    const out = new Uint8Array(channels * N);
    for (let p = 0; p < N; p++) {
      /* the melt read through the scattered place, bilinear */
      const at = corner[p];
      const fx = across_[p];
      const fy = down[p];
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;
      const a0 =
        melt[at + 3] * w00 +
        melt[at + 7] * w10 +
        melt[at + row + 3] * w01 +
        melt[at + row + 7] * w11;
      /* lifted, speckled */
      const lift = a0 > 0 ? Math.min(1, Math.max(0, SLOPE * a0 + lift0)) : 0;
      const alpha = Math.min(1, lift * (1 + speckle));
      const o = channels * p;
      if (!alpha) {
        if (under) {
          out[o] = under[0];
          out[o + 1] = under[1];
          out[o + 2] = under[2];
        } else if (veil) {
          out[o] = veil.rgb[0];
          out[o + 1] = veil.rgb[1];
          out[o + 2] = veil.rgb[2];
          out[o + 3] = 255 * veil.alpha + 0.5;
        }
        continue;
      }
      const scale = (lift * grains[p]) / a0;
      const red = Math.min(
        alpha,
        (melt[at] * w00 + melt[at + 4] * w10 + melt[at + row] * w01 + melt[at + row + 4] * w11) *
          scale
      );
      const green = Math.min(
        alpha,
        (melt[at + 1] * w00 +
          melt[at + 5] * w10 +
          melt[at + row + 1] * w01 +
          melt[at + row + 5] * w11) *
          scale
      );
      const blue = Math.min(
        alpha,
        (melt[at + 2] * w00 +
          melt[at + 6] * w10 +
          melt[at + row + 2] * w01 +
          melt[at + row + 6] * w11) *
          scale
      );
      if (under) {
        const rest = 1 - alpha;
        out[o] = 255 * red + under[0] * rest + 0.5;
        out[o + 1] = 255 * green + under[1] * rest + 0.5;
        out[o + 2] = 255 * blue + under[2] * rest + 0.5;
      } else if (veil) {
        /* the blobs over a ground that lets something through: premultiplied, then unpremultiplied */
        const rest = veil.alpha * (1 - alpha);
        const all = alpha + rest;
        out[o] = (255 * red + veil.rgb[0] * rest) / all + 0.5;
        out[o + 1] = (255 * green + veil.rgb[1] * rest) / all + 0.5;
        out[o + 2] = (255 * blue + veil.rgb[2] * rest) / all + 0.5;
        out[o + 3] = 255 * all + 0.5;
      } else {
        out[o] = (255 * red) / alpha + 0.5;
        out[o + 1] = (255 * green) / alpha + 0.5;
        out[o + 2] = (255 * blue) / alpha + 0.5;
        out[o + 3] = 255 * alpha + 0.5;
      }
    }
    return out;
  };
  return { width: W, height: H, channels, frame };
}

/** The first frame as pixels at a size (blobRenderer's): the frame a reader who asks for less motion sees, and the
    one link previews and the PNG still show. */
export const blobStill = (
  P: Palette,
  view: Pick<BlobView, "frost" | "shape" | "bg" | "angle">,
  size: Size,
  backdrop?: readonly number[]
): Uint8Array<ArrayBuffer> => blobRenderer(P, view, size, backdrop).frame(0);

const DARK = [14, 14, 16];
const LIGHT = [243, 241, 238];
/** What a picture that cannot be transparent, such as a link's card, sets blobs on where the address asks for no
    ground: near black, or near white for a palette whose colors are darker than that reads well on. */
export function blobBackdrop(P: Palette): number[] {
  const light =
    Array.from({ length: 9 }, (_, i) => luminance(sampleSrgb(P, i / 8))).reduce((a, b) => a + b) /
    9;
  const lum = (rgb: number[]) => luminance(rgb.map(v => v / 255));
  return contrastOf(light, lum(DARK)) >= contrastOf(light, lum(LIGHT)) ? DARK : LIGHT;
}

/** A blob's first frame as a CSS background for a box of any size: the design covering it, over the blob's own ground
    where it has one, else over `ground` where given. The server's still on a blob's page
    (apps/web/src/server/blob-still.ts) and the editor's holders take it alike, so the player's first frame picks up
    from it (blob-player.ts). */
export function blobStillBackground(P: Palette, view: BlobView, ground?: string): string {
  const still = { ...view, still: true };
  const under = blobScene(P, BLOB_DESIGN, still).backdrop ?? ground;
  return `${svgUrl(blobSvg(P, still, null, ""))} 50% 50% / 100% 100% no-repeat${under ? ` ${under}` : ""}`;
}
