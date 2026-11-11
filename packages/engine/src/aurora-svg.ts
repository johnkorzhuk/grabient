/* The aurora as an SVG of shapes alone: any frame of it, which is its file and its copy, and its still.
   The light is cut into wedges of the fan, each a four-cornered path filled by a gradient along its ray whose stops
   are the frame's own colors there (a stop a straight line between its neighbours gives to within a few levels is
   left out), each wedge reaching over the next, which is drawn over it, so no seam shows at any size. Only what
   shows is read and written: a wedge the range hides whole is left out, and the stops of one it hides in part end
   where it does. Over them lies the range: a mask that thins the light away at the range's soft edge, and the
   range's color, where it has one, under the light. The shapes are new at every frame, so the file never moves
   (effect-why.ts).
   The mask is the address's path itself, closed over everything above it, laid EDGE_STEPS times, each copy a step
   higher and so much more opaque that together they rise across the soft edge as the drawings' smooth step does: one
   path, so nothing shows between pieces at any size. Over those copies, on each side of an upright wall, lies a
   strip as wide as the drawings soften the wall: the soft edge of the wall's other side as greys (one gradient, moved
   to that side's height), laid WALL_STEPS times, each copy reaching the wall from a step nearer it and so much more
   opaque that together they fade in toward the wall as the drawings do. Each copy is a plain shape with its fill's
   own opacity: a strip faded by a mask of its own, or by an opacity that makes it a layer, stops resvg (2.6.2
   panics on a layer inside a mask where the masked layer reaches well past the picture's top, as the wedges of a
   turned picture do). The light thinned over the color is the drawings' own sum: the light where it shows, the
   range's color at its cover where it does not.

   Its still, for a page's first paint and a list's cards, stands in for its first frame (STILL below): the same
   light in wedges five times as broad or more under one blur, since the frame itself as shapes weighs hundreds of
   kilobytes where a still may weigh 40. */
import {
  AURORA_FAN,
  AURORA_SOFT,
  type AuroraScene,
  type AuroraView,
  auroraLight,
  auroraRange,
  auroraScene,
  auroraTilesSteps,
  auroraTime
} from "./aurora.ts";
import { toHex } from "./color.ts";
import type { Palette } from "./palette.ts";
import { svgNumber } from "./svg-fit.ts";
import type { Size } from "./view.ts";

const n2 = (v: number) => svgNumber(v, 2);
const n3 = (v: number) => svgNumber(v, 3);
const n4 = (v: number) => svgNumber(v, 4);
const n5 = (v: number) => svgNumber(v, 5);

/** How the light is cut: how wide a wedge is where the fan is at its middle distance and how far apart along a wedge
    the frame is read, both in pixels, and how far past the box the wedges are kept, for a blur to draw on. */
interface Cut {
  wedge: number;
  read: number;
  pad: number;
}
/** A frame's cut, and how far (in levels of 255) a straight line between two kept stops may miss a reading it leaves
    out. Measured on palettes of many colors at 1000 by 1000, as resvg draws the SVG against the CPU's frame: at 3 and
    8 pixels the frame as shapes lies a mean of 0.33 and a 99th percentile of 1.58 from it in 443 KiB, at 4 and 10
    0.41 and 2.42 in 315 KiB (these, written in 44 ms), at 5 and 12 0.50 and 3.27 in 238, and at 6 and 19 0.65 and
    4.92 in 165. The cut is in pixels, so a small frame is the hardest: at 320 by 180, the suite's size, a frame lies
    1.0 and 7.4 from the CPU's at worst, under the suite's 1.5 and 8, in 42 KiB. A blur over the wedges measures
    worse at any strength: it rounds the wedges' flat faces and the flames' own detail with them. */
const FRAME: Cut = { wedge: 4, read: 10, pad: 0 };
const FRAME_TOL = 3;

/** How many steps the range's soft edge is laid in, and each side of an upright wall. */
const EDGE_STEPS = 20;
const WALL_STEPS = 10;
/** How far to each side the range's shape reaches past the picture's middle, in its units: past any box turned any
    way, whose corners lie within 1.26. */
const FAR = 2;

/* the scene's units to the box's pixels, as an SVG transform and as a function */
const placeOf = ({ width: W, height: H, cs, sn, ext }: AuroraScene) =>
  `matrix(${n5(ext * cs)} ${n5(ext * sn)} ${n5(ext * sn)} ${n5(-ext * cs)} ${n2(W / 2 - 0.5 * ext * sn)} ${n2(H / 2 + 0.5 * ext * cs)})`;
const pixelOf = (
  { width: W, height: H, cs, sn, ext }: AuroraScene,
  X: number,
  Y: number
): [number, number] => [
  W / 2 + ext * (X * cs - (0.5 - Y) * sn),
  H / 2 + ext * (X * sn + (0.5 - Y) * cs)
];

/* The range's edge as an SVG path's commands, in the scene's units, from far left of the picture to far right: a
   straight line a straight piece, a curved piece as the drawings read it, which is exactly a cubic Bezier (its place
   runs evenly along it, so its handles stand at thirds), and an upright line a wall. */
function edgePath(m: AuroraScene): string {
  const X = (s: number) => (s * 2 - 1) * m.half;
  let d = `M${-FAR} ${n5(m.segA[2])}H${n5(-m.half)}`;
  for (let j = 0; j < m.segs; j++) {
    const [x0, x1, y0, y1] = m.segA.subarray(j * 4, j * 4 + 4);
    const [p0, p3, yl] = m.segB.subarray(j * 4, j * 4 + 3);
    if (yl !== y0) d += `V${n5(y0)}`;
    if (!m.bend[j]) d += `L${n5(X(x1))} ${n5(y1)}`;
    else {
      const third = (X(x1) - X(x0)) / 3;
      d += `C${n5(X(x0) + third)} ${n5(y0 + (y1 - p0) / 6)} ${n5(X(x1) - third)} ${n5(y1 - (p3 - y0) / 6)} ${n5(X(x1))} ${n5(y1)}`;
    }
  }
  return `${d}H${FAR}`;
}

const grey = (v: number) => {
  const h = Math.floor(v * 255 + 0.5)
    .toString(16)
    .padStart(2, "0");
  return `#${h}${h}${h}`;
};
/* a smooth step from 0 to 1 as an SVG gradient's stops of grey, read at nine places */
const stepStops = () =>
  Array.from({ length: 9 }, (_, i) => {
    const x = i / 8;
    return `<stop offset="${x}" stop-color="${grey(x * x * (3 - 2 * x))}"/>`;
  }).join("");

/* How opaque each of `steps` copies laid one over another is, so that together they rise as `whole` says: `whole(k)`
   is how much the copies up to k cover, and each copy covers that much of what the copies under it have left. */
function stepOpacities(steps: number, whole: (k: number) => number): number[] {
  let below = 0;
  return Array.from({ length: steps }, (_, k) => {
    const opacity = (whole(k) - below) / (1 - below);
    below = whole(k);
    return opacity;
  });
}
/* the range's edge: the smooth step, whole at the last copy */
const EDGE_OPACITIES = stepOpacities(EDGE_STEPS, k => {
  const x = (k + 1) / EDGE_STEPS;
  return x * x * (3 - 2 * x);
});
/* a wall's side: the half of the smooth step that runs from none, a side's width from the wall, to a half at the
   wall, read at each step's middle */
const WALL_OPACITIES = stepOpacities(WALL_STEPS, k => {
  const q = (k + 0.5) / WALL_STEPS / 2;
  return q * q * (3 - 2 * q);
});

/* The range as an SVG lays it over a light: `defs`, the mask (`m`) that thins the light away at the range's soft
   edge, and `under`, the range's color where it has one, beneath the light (the light is whole above the edge, so
   the color under it is a plain rectangle). `plain` writes it for every reader of SVG: a copy names its shape by
   `xlink:href`, and a wall's side is its rectangles written out. Else it is written short, for a browser: `href`,
   and a wall's side one use of a side a unit wide, widened and turned over. */
function rangeParts(m: AuroraScene, plain: boolean): { defs: string; under: string } {
  const SOFT = AURORA_SOFT;
  const href = plain ? "xlink:href" : "href";
  const steps = EDGE_OPACITIES.map(
    (opacity, k) =>
      `<use ${href}="#r" transform="translate(0 ${n5(-SOFT + (2 * SOFT * (k + 0.5)) / EDGE_STEPS)})"${k < EDGE_STEPS - 1 ? ` opacity="${n5(opacity)}"` : ""}/>`
  ).join("");
  /* a wall's side `wide` across, from the wall at `at` out to the left or the right: each copy reaches the wall
     from a step nearer it */
  const side = (wide: number, at: number, left: boolean) =>
    WALL_OPACITIES.map((opacity, k) => {
      const reach = wide * (1 - k / WALL_STEPS);
      return `<rect x="${n5(left ? at - reach : at)}" y="-1.2" width="${n5(reach)}" height="2.6" fill-opacity="${n5(opacity)}"/>`;
    }).join("");
  let strips = "";
  const X = (s: number) => (s * 2 - 1) * m.half;
  for (let j = 1; j < m.segs; j++) {
    const y0 = m.segA[j * 4 + 2];
    const yl = m.segB[j * 4 + 2];
    if (yl === y0) continue;
    /* the wall, how wide each of its sides is softened, and the height each side shows: the other side's */
    const at = X(m.segA[j * 4]);
    const before = Math.min(SOFT, (at - X(m.segA[(j - 1) * 4])) / 2);
    const after = Math.min(SOFT, (X(m.segA[j * 4 + 1]) - at) / 2);
    strips += plain
      ? `<g transform="translate(0 ${n5(y0)})" fill="url(#v)">${side(before, at, true)}</g>` +
        `<g transform="translate(0 ${n5(yl)})" fill="url(#v)">${side(after, at, false)}</g>`
      : `<use href="#s" transform="translate(${n5(at)} ${n5(y0)})scale(${n5(before)} 1)"/>` +
        `<use href="#s" transform="translate(${n5(at)} ${n5(yl)})scale(${n5(-after)} 1)"/>`;
  }
  const { width: W, height: H } = m;
  return {
    defs:
      `<path id="r" d="${edgePath(m)}V3H${-FAR}Z" fill="#fff"/>` +
      (strips
        ? `<linearGradient id="v" gradientUnits="userSpaceOnUse" x1="0" y1="${-SOFT}" x2="0" y2="${SOFT}">${stepStops()}</linearGradient>` +
          (plain ? "" : `<g id="s" fill="url(#v)">${side(1, 0, true)}</g>`)
        : "") +
      `<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><g transform="${placeOf(m)}">${steps}${strips}</g></mask>`,
    under:
      m.cover > 0
        ? `<rect width="${W}" height="${H}" fill="${toHex(m.range)}"${m.cover < 1 ? ` fill-opacity="${n5(m.cover)}"` : ""}/>`
        : ""
  };
}

/** The fan over a box: the angle its first wedge starts at and a wedge's width, how many wedges, the distances from
    the fan's point they run between, and how many times the light is read along one. */
interface Fan {
  a0: number;
  step: number;
  n: number;
  r0: number;
  r1: number;
  reads: number;
}
/* the fan's reach over the box: the angles and distances of the box's rim from the fan's point */
function fanOf(m: AuroraScene, cut: Cut): Fan {
  const { width: W, height: H, cs, sn, ext } = m;
  const pad = cut.pad;
  let a0 = 9;
  let a1 = -9;
  let r0 = 9;
  let r1 = 0;
  for (let i = 0; i < 256; i++) {
    const q = (i % 64) / 63;
    const [x, y] = [
      [q * (W + 2 * pad) - pad, -pad],
      [W + pad, q * (H + 2 * pad) - pad],
      [q * (W + 2 * pad) - pad, H + pad],
      [-pad, q * (H + 2 * pad) - pad]
    ][i >> 6];
    const dx = x - W / 2;
    const dy = y - H / 2;
    const X = (dx * cs + dy * sn) / ext - AURORA_FAN.x;
    const Y = 0.5 - (-dx * sn + dy * cs) / ext - AURORA_FAN.y;
    const a = Math.atan2(X, Y);
    const r = Math.hypot(X, Y);
    a0 = Math.min(a0, a);
    a1 = Math.max(a1, a);
    r0 = Math.min(r0, r);
    r1 = Math.max(r1, r);
  }
  r0 *= 0.985;
  r1 *= 1.01;
  const n = Math.max(8, Math.ceil(((a1 - a0) * 0.5 * (r0 + r1) * ext) / cut.wedge));
  return {
    a0,
    step: (a1 - a0) / n,
    n,
    r0,
    r1,
    reads: Math.max(8, Math.ceil(((r1 - r0) * ext) / cut.read))
  };
}

/* The light along wedge i of a fan at T of the loop, into `cols` (three channels a reading, `fan.reads` + 1 of
   them): its middle ray and one each side, averaged. Only the readings that show are made, with one each end past
   them: those in the box (and `cut.pad` pixels past it) where the range lets the light through, or within `under`
   of the picture's height beneath where it does. The first and the last reading made, or null for a wedge that
   shows nowhere. */
function readWedge(
  m: AuroraScene,
  T: number,
  fan: Fan,
  cut: Cut,
  under: number,
  i: number,
  cols: Float64Array
): [number, number] | null {
  const { width: W, height: H } = m;
  const mid = fan.a0 + (i + 0.5) * fan.step;
  const where = new Float64Array(2);
  const c = new Float64Array(3);
  const pad = cut.pad;
  /* a reading's light, or whether it shows */
  const reading = (k: number, light: boolean): boolean => {
    const r = fan.r0 + ((fan.r1 - fan.r0) * k) / fan.reads;
    let shows = false;
    if (light) cols[k * 3] = cols[k * 3 + 1] = cols[k * 3 + 2] = 0;
    for (const o of [-0.33, 0, 0.33]) {
      const X = AURORA_FAN.x + r * Math.sin(mid + o * fan.step);
      const Y = AURORA_FAN.y + r * Math.cos(mid + o * fan.step);
      auroraRange(m, X, Y, where);
      if (light) {
        auroraLight(m, T, X, Y, where[1], c);
        for (let j = 0; j < 3; j++) cols[k * 3 + j] += c[j] / 3;
      } else if (where[0] > 0 || where[1] > -under) {
        const [x, y] = pixelOf(m, X, Y);
        if (x >= -pad && x <= W + pad && y >= -pad && y <= H + pad) shows = true;
      }
    }
    return shows;
  };
  let lo = -1;
  let hi = -1;
  for (let k = 0; k <= fan.reads; k++)
    if (reading(k, false)) {
      if (lo < 0) lo = k;
      hi = k;
    }
  if (lo < 0) return null;
  lo = Math.max(0, lo - 1);
  hi = Math.min(fan.reads, hi + 1);
  for (let k = lo; k <= hi; k++) reading(k, true);
  return [lo, hi];
}

/* the readings from lo to hi a gradient keeps as stops: one wherever a straight line between two kept would miss a
   reading between them by more than `tol` levels of 255 */
function keptStops(cols: Float64Array, lo: number, hi: number, tol: number): number[] {
  const keep = [lo];
  let from = lo;
  for (let k = lo + 2; k <= hi; k++) {
    let off = 0;
    for (let q = from + 1; q < k; q++)
      for (let j = 0; j < 3; j++)
        off = Math.max(
          off,
          Math.abs(
            cols[q * 3 + j] -
              (cols[from * 3 + j] +
                ((cols[k * 3 + j] - cols[from * 3 + j]) * (q - from)) / (k - from))
          ) * 255
        );
    if (off > tol) {
      keep.push(k - 1);
      from = k - 1;
    }
  }
  if (hi > lo) keep.push(hi);
  return keep;
}
const stopsOf = (cols: Float64Array, keep: readonly number[], reads: number) =>
  keep
    .map(
      k =>
        `<stop offset="${n3(k / reads)}" stop-color="${toHex([cols[k * 3], cols[k * 3 + 1], cols[k * 3 + 2]])}"/>`
    )
    .join("");

/** The frame at t (seconds of the loop at speed 1) as an SVG of a size: what any moment of it is as a vector
    picture. Every reader of SVG draws it: its wedges are plain paths, each with a gradient of its own in the
    picture's pixels. Under the mask they are one group that stands alone (`isolation`): WebKit thins a masked
    group's shapes one at a time unless it does, and wedges that reach over one another then show twice through the
    soft edge, which draws it hard (a 99th percentile of 9.8 from the other readers' along the range, 0.5 with it).
    At 800 by 400, a file's size where none is asked, it weighs 163 KiB and is written in 20 ms; at 1920 by 1080,
    420 KiB in 86 ms. */
export function auroraFrameSvg(P: Palette, view: AuroraView, size: Size, t: number): string {
  const m = auroraScene(P, view, size);
  const T = auroraTime(t);
  const fan = fanOf(m, FRAME);
  const at = (r: number, a: number) =>
    pixelOf(m, AURORA_FAN.x + r * Math.sin(a), AURORA_FAN.y + r * Math.cos(a));
  const corner = (r: number, a: number) => at(r, a).map(n2).join(" ");
  const cols = new Float64Array((fan.reads + 1) * 3);
  let defs = "";
  let shapes = "";
  for (let i = 0; i < fan.n; i++) {
    const span = readWedge(m, T, fan, FRAME, 0, i, cols);
    if (!span) continue;
    const a = fan.a0 + i * fan.step;
    const g0 = at(fan.r0, a + fan.step / 2);
    const g1 = at(fan.r1, a + fan.step / 2);
    defs += `<linearGradient id="w${i}" gradientUnits="userSpaceOnUse" x1="${n2(g0[0])}" y1="${n2(g0[1])}" x2="${n2(g1[0])}" y2="${n2(g1[1])}">${stopsOf(cols, keptStops(cols, span[0], span[1], FRAME_TOL), fan.reads)}</linearGradient>`;
    shapes += `<path d="M${corner(fan.r0, a)}L${corner(fan.r1, a)}L${corner(fan.r1, a + 2 * fan.step)}L${corner(fan.r0, a + 2 * fan.step)}Z" fill="url(#w${i})"/>`;
  }
  const R = rangeParts(m, true);
  const { width: W, height: H } = m;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${R.defs}${defs}</defs>${R.under}<g mask="url(#m)"><g style="isolation:isolate">${shapes}</g></g></svg>`;
}

/** Its SVG file: its first frame at any speed, since its shapes are new at every frame. */
export const auroraFileSvg = (P: Palette, view: AuroraView, size: Size): string =>
  auroraFrameSvg(P, view, size, 0);

/** The still's cut at its finest, in shares of the box's longer side: a wedge's width and how far apart the light is
    read along it; the blur over the wedges, in wedges' widths; the tolerance its stops are kept by; and the most it
    may weigh as a CSS background, bytes, under the 40 KiB a list's still may (fx-still.ts). A still is cut as fine
    as fits that weight, and no finer than this: a look whose light fills more of the box, or whose palette has more
    colors, is cut coarser (STILL_FIRST below).
    Measured at the design square over four palettes, four paths and four angles: 19 to 39 KiB, 34 on average,
    written in 4 to 26 ms once the noise is made (some 50 ms, once a page). As resvg draws it at 640 by 360 it lies
    a mean of 1.0 to 1.5 from its first frame's SVG on the suite's palette as designed, 1.9 to 3.2 on palettes of
    many colors, and up to 5.4 where such a palette's light fills the box over a low range. Chromium, Firefox and
    WebKit draw it as resvg does (means of 0.07 to 0.54 apart), and thirty cards of it take a software rasterizer
    1.1 s to draw first, the dimple's 0.8, the strings' 1.3 and the papercut's 8.4. */
const STILL = { wedge: 0.02, read: 0.01, blur: 0.6, tol: 8, most: 39 * 1024 };
/** How much coarser than its finest a still is first cut, to weigh it: its wedges weigh as one over their width, so
    the first cut says how fine the one that fills the weight is, at a quarter of the finest cut's readings. And how
    much coarser than that a cut is made, so that it seldom weighs over and is cut again. */
const STILL_FIRST = 2;
const STILL_SPARE = 1.06;

/* Readings lo to hi averaged along their wedge over `reach` readings each way, nearer ones counting more: the blur
   over the wedges takes detail finer than itself out of the picture, so out of the readings first it costs no
   stops. */
function soften(cols: Float64Array, lo: number, hi: number, reach: number) {
  const R = Math.ceil(reach) - 1;
  if (R < 1) return;
  const from = cols.slice(lo * 3, (hi + 1) * 3);
  const n = hi - lo + 1;
  for (let k = 0; k < n; k++)
    for (let j = 0; j < 3; j++) {
      let sum = 0;
      let weight = 0;
      for (let d = -R; d <= R; d++) {
        const w = 1 - Math.abs(d) / reach;
        if (w <= 0) continue;
        sum += w * from[Math.min(n - 1, Math.max(0, k + d)) * 3 + j];
        weight += w;
      }
      cols[(lo + k) * 3 + j] = sum / weight;
    }
}

/* what a piece of SVG weighs in a CSS background (css.ts svgUrl escapes four characters as three) */
const cssWeight = (svg: string) => svg.length + 2 * (svg.match(/[<>#%]/g)?.length ?? 0);

/** The still a step at a time, each under a millisecond but the noise's, made once a page: the first frame's light
    in broad wedges under a blur, the range as it is. Its wedges are one shape turned about the fan's point, each
    with its own stops on one gradient's line, so a wedge costs its stops and little more. */
export function* auroraStillSteps(
  P: Palette,
  view: AuroraView,
  size: Size
): Generator<void, string> {
  yield* auroraTilesSteps();
  const m = auroraScene(P, view, size);
  const { width: W, height: H, ext } = m;
  const side = Math.max(W, H);
  const R = rangeParts(m, false);
  const corner = (r: number, a: number) => `${n4(r * Math.sin(a))} ${n4(r * Math.cos(a))}`;
  for (let coarser = STILL_FIRST, round = 0; ; round++) {
    const wide = STILL.wedge * side * coarser;
    const sigma = STILL.blur * wide;
    const pad = Math.ceil(3 * sigma);
    const cut: Cut = { wedge: wide, read: STILL.read * side * coarser, pad };
    const fan = fanOf(m, cut);
    const cols = new Float64Array((fan.reads + 1) * 3);
    let stops = "";
    let uses = "";
    for (let i = 0, shown = 0; i < fan.n; i++) {
      /* the light a blur reaches from beneath the range's edge is kept, two of its widths down */
      const span = readWedge(m, 0, fan, cut, (2 * sigma) / ext, i, cols);
      if (span) {
        soften(cols, span[0], span[1], sigma / cut.read);
        stops += `<linearGradient id="g${shown}" href="#g">${stopsOf(cols, keptStops(cols, span[0], span[1], STILL.tol), fan.reads)}</linearGradient>`;
        uses += `<use href="#p" fill="url(#g${shown++})" transform="rotate(${n2((-(fan.a0 + (i + 0.5) * fan.step) * 180) / Math.PI)})"/>`;
      }
      if (i % 4 === 3) yield;
    }
    /* one wedge about the fan's point, its middle ray straight up: from half a wedge before the ray to one and a
       half after it, so it reaches over the next */
    const wedge = `M${corner(fan.r0, -fan.step / 2)}L${corner(fan.r1, -fan.step / 2)}L${corner(fan.r1, 1.5 * fan.step)}L${corner(fan.r0, 1.5 * fan.step)}Z`;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${R.defs}` +
      `<filter id="f" filterUnits="userSpaceOnUse" x="${-pad}" y="${-pad}" width="${W + 2 * pad}" height="${H + 2 * pad}"><feGaussianBlur stdDeviation="${n2(sigma)}"/></filter>` +
      `<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="${n4(fan.r0)}" x2="0" y2="${n4(fan.r1)}"/><path id="p" d="${wedge}"/>` +
      `${stops}</defs>${R.under}<g mask="url(#m)"><g filter="url(#f)"><g transform="${placeOf(m)}translate(${AURORA_FAN.x} ${AURORA_FAN.y})">${uses}</g></g></g></svg>`;
    /* the cut that fills the weight: the wedges weigh as one over their width, the rest weighs what it weighs */
    const wedges = cssWeight(stops + uses);
    const weight = cssWeight(svg);
    const fills = Math.max(1, (coarser * wedges * STILL_SPARE) / (STILL.most - (weight - wedges)));
    if (round > 6 || (weight <= STILL.most && fills > coarser / STILL_SPARE ** 2)) return svg;
    coarser = fills;
  }
}

/** The still: auroraStillSteps, at once. */
export function auroraStillSvg(P: Palette, view: AuroraView, size: Size): string {
  const steps = auroraStillSteps(P, view, size);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}
