/* The aurora as an SVG: any frame of it as shapes alone, which is its file and its copy, and its still.
   The light is read on a fan of fine rays, and a ray is kept only where the light needs one: wherever straight lines
   between the two kept beside it would miss a ray between them by more than a tolerance, so a calm sky takes few and
   a shaft's side many. Each kept ray is one wedge filled by one gradient along it, its stops the ray's own light (a
   stop wherever a straight line between two would miss a reading by more than a tolerance). The wedges lie in two
   layers, every other ray in each: the first layer's wedges meet on the second's rays and are drawn whole; the
   second's reach from the ray before them to the ray after and lie under a mask of tents, white on their ray and
   black on the rays beside it, so the light runs in straight lines from ray to ray and no wedge shows as a flat
   stripe. Until 16 Nov 2026 every wedge was flat, 4 pixels wide at any size, and lay half under the next: two
   wedges at every place for the one that showed, and a file that grew with its box (John, that day: "the aurora
   vector representation is really heavy. i notice thats theres 2 layers for each strip").
   A tent is its ray's own, sized where that ray's light is nearest the fan's point, and falls from white on its ray
   to black on the ray beside it in a few layers of greys (tentParts). There it is exact; farther out, where the
   rays have spread, each layer's fade ends before its width does, so the tent falls in as many short steps joined
   by flats, never more than a layer's share from the straight line and with no break anywhere (one gradient across
   a whole side left a flat a third of a wedge wide at the picture's top, which showed as an edge along every ray).
   Over the light lies the range: a mask that thins the light away at the range's soft edge, and the range's color,
   where it has one, under the light. The shapes are new at every frame, so the file never moves (effect-why.ts).
   The range's mask is the address's path itself, closed over everything above it, laid EDGE_STEPS times, each copy a
   step higher and a grey lighter, so that together they rise across the soft edge as the drawings' smooth step
   does: one path, so nothing shows between pieces at any size, and whole greys, which a design tool reads as a
   browser does (tentParts). Over those copies, on each side of an upright wall, lies a strip as wide as the
   drawings soften the wall: the soft edge of the wall's other side as greys (one gradient, moved to that side's
   height), laid WALL_STEPS times, each copy reaching the wall from a step nearer it and so much more opaque that
   together they fade in toward the wall as the drawings do (a fade no stack of whole greys gives, so beside a wall,
   and nowhere else, a design tool draws the range's edge a little harder than a browser). Each copy is a plain
   shape with its fill's own opacity: a strip faded by a mask of its own, or by an opacity that makes it a layer,
   stops resvg (2.6.2 panics on a layer inside a mask where the masked layer reaches well past the picture's top, as
   the wedges of a turned picture do). The light thinned over the color is the drawings' own sum: the light where
   it shows, the range's color at its cover where it does not.

   Its still, for a page's first paint and a list's cards, is for browsers alone, and carries the light itself: each
   wedge's stops are greys, how far along the palette the light there reads, and one filter reads the finished greys
   through the palette (STILL below). So every color it shows is the palette's own and a palette's bands stay sharp
   however few the rays, where its light blended as colors under a blur, as it was until 17 Nov 2026, turned a
   palette of many colors to mud (four of its pixels in ten more than 8 levels off the palette, none now); what it
   weighs no longer depends on the palette; and its shapes are one look's, whatever the palette, so a list of one
   look in sixteen palettes writes them once. */
import {
  AURORA_PAGE_NUMBERS,
  AURORA_SOFT,
  type AuroraScene,
  type AuroraView,
  auroraLight,
  auroraRange,
  auroraScene,
  auroraStops,
  auroraTilesSteps,
  auroraTime
} from "./aurora.ts";
import { srgbToLch, toHex } from "./color.ts";
import type { Palette } from "./palette.ts";
import { svgNumber } from "./svg-fit.ts";
import type { Size } from "./view.ts";

const n1 = (v: number) => svgNumber(v, 1);
const n2 = (v: number) => svgNumber(v, 2);
const n3 = (v: number) => svgNumber(v, 3);
const n4 = (v: number) => svgNumber(v, 4);
const n5 = (v: number) => svgNumber(v, 5);

/** How the light is cut into rays and stops. */
export interface AuroraCut {
  /** the fine fan the light is read on: a ray no nearer the next than `px` pixels where the fan is at its middle
      distance, nor than `cell` cells of the fine shafts' coarsest lattice (aurora.ts: sheet c) */
  px: number;
  cell: number;
  /** the readings along a ray: no nearer one another than `read` pixels, nor than `gap` of the picture's height */
  read: number;
  gap: number;
  /** how far, in levels of 255, straight lines between two kept rays may miss a ray between them, and a straight
      line between two stops a reading between them: for a frame, whose light is written in the palette's colors,
      levels of a palette that spans all 255, and as many fewer as a palette spans less (paletteSpan); for a still,
      whose light is written as how far along the palette it reads, 255ths of the palette's length */
  ray: number;
  stop: number;
  /** the most fine rays from one kept ray to the next */
  span: number;
  /** how many layers each side of a tent is laid in, and how round the tent is: 0 falls in a straight line from its
      ray, 1 as a smooth step, level on the ray and level again on the ray beside it */
  tent: number;
  round: number;
  /** how many fine rays each way across the fan, and readings each way along a ray, the light is averaged over
      before any ray or stop is kept (nearer ones counting more): detail finer than the cut is taken out of the
      picture, not caught by whichever ray happens on it */
  soft: number;
}

/** A frame's cut. The fine fan is no finer than pixels show nor than two rays a cell of the fine shafts, and the
    readings no nearer than a fortieth of the picture's height, so past some 800 pixels wide a frame is the same
    shapes whatever its size, where the flat wedges it was once cut into were as many as its pixels.
    Measured 17 Nov 2026 over thirteen of the site's palettes as designed, as resvg draws the SVG against the CPU's
    frame, the flat wedges' numbers after each: at 800 by 400, 102 KiB on average (38 for a pale palette to 191 for
    one of six colors that turn dark between; 169, 108 to 220) and a mean of 0.87 from the frame (0.71), written in
    13 ms (28); at 1920 by 1080, 126 KiB (40 to 270; 490, 253 to 795), 0.76 (0.36), 17 ms (81); the suite's palette
    at 3840 by 2160, 62 KiB (803). At 320 by 180, the suite's size and the hardest, every look, path and ground it
    draws at twelve times of the loop lies within a mean of 0.81 and a 99th percentile of 4.9 (1.0 and 7.4), 0.07%
    far, in 42 KiB on average (43); at 640 by 360, within 0.68 and 4.2. Chromium, Firefox and WebKit draw it as
    resvg does (means of 0.05 to 0.16 apart), and Figma's importer too (0.18: tentParts). Rays kept at 16 levels
    and stops at 3 weigh a third more (133 KiB at 800 by 400) and lie 0.72 from the frame, a difference no picture
    of the two shows. */
const FRAME: AuroraCut = {
  px: 4,
  cell: 0.5,
  read: 4,
  gap: 0.025,
  ray: 24,
  stop: 5,
  span: 8,
  tent: 2,
  round: 0,
  soft: 0
};

/** How many steps the range's soft edge is laid in, and each side of an upright wall. */
const EDGE_STEPS = 20;
const WALL_STEPS = 10;
/** How far to each side the range's shape reaches past the picture's middle, in its units: past any box turned any
    way, whose corners lie within 1.26. */
const FAR = 2;
/** A tent's side as it is written, radians: every tent is this one turned to its ray and drawn as narrow as the
    ray beside it is near, and as large as its ray's light is far from the fan's point. Wide enough that its numbers
    keep four figures. */
const TENT_WIDE = 0.1;
/** How far past its side a wedge reaches under the one drawn after it, in pixels where the fan is at its middle
    distance: two wedges that only met would let what is behind them through along the line. */
const LAP = 0.6;

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
  const h = Math.floor(Math.min(1, Math.max(0, v)) * 255 + 0.5)
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
/* the range's edge: the smooth step, whole at the last copy, each copy the grey the light shows by from its edge up
   to the next copy's */
const EDGE_GREYS = Array.from({ length: EDGE_STEPS }, (_, k) => {
  const x = (k + 1) / EDGE_STEPS;
  return grey(x * x * (3 - 2 * x));
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
  const steps = EDGE_GREYS.map(
    (fill, k) =>
      `<use ${href}="#r" transform="translate(0 ${n5(-SOFT + (2 * SOFT * (k + 0.5)) / EDGE_STEPS)})" fill="${fill}"/>`
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
      `<path id="r" d="${edgePath(m)}V3H${-FAR}Z"/>` +
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

/** The light read on a fan over a box: rays 0 to `n` from the angle `a0`, a `step` apart, and along each a reading
    0 to `reads` from `r0` out to `r1` of the fan's point; of every reading `ch` numbers (three channels of a color,
    or one: how far along the palette the light reads) and how much of it shows in the box. */
interface Fan {
  a0: number;
  step: number;
  n: number;
  r0: number;
  r1: number;
  reads: number;
  ch: number;
  light: Float64Array;
  shows: Float32Array;
}

/** The light alone: a scene whose ramp is the light itself, so that auroraLight answers how much light, 0 to 1. */
const LIGHT_ALONE = Float32Array.from({ length: 128 * 3 }, (_, i) => Math.floor(i / 3) / 127);
const { low: LOW, tip: TIP, bend: BEND, cells: CELLS } = AURORA_PAGE_NUMBERS;
/* how far along the palette, from its darker end, a light is read (aurora.ts auroraRamp) */
const alongPalette = (light: number) =>
  1 - (1 - Math.min(1, Math.max(0, (light - LOW) / (TIP - LOW)))) ** BEND;
/** How a still's greys spend their 256 levels along the palette: a grey is how far along the palette the light
    reads, to this power, so the palette's darker end, where most of a frame's light lies and lies smoothest (over
    half its pixels in the first third), takes most of the levels. And WebKit takes a filter's picture through
    8 bits of linear light and back whatever space the filter is said to work in (greys 0 to 43 come out as 0, 13,
    22, 28, 34, 38 and 42: 17 Nov 2026, Playwright's WebKit): greys read straight along the palette left a dark
    sky seven levels, drawn as blocks, where this power, the transfer curve's own nearly, leaves that round trip
    the palette in even steps. The price is the light running in straight lines of greys, not of the palette,
    between stops and rays: a tenth to a sixth farther from the frame at the same weight. */
const GREY_BEND = 0.45;
/** How many straight lines the filter's tables read the palette by, even steps of grey: at the palette's lighter
    end, where a step of grey is the longest step along the palette, as long as the palette's own 32 (fewer round
    a palette's sharpest turns: 32 lay up to 31 levels off a palette of many colors there, 64 up to 15). */
const TABLE = 64;
/* how many times as far along the palette a grey moves as the grey itself, at that grey: what a miss in greys is
   worth along the palette, where the tolerances are counted (never under a tenth: no grey is free to stray) */
const greySteep = (grey: number) => Math.max(0.1, grey ** (1 / GREY_BEND - 1) / GREY_BEND);

/* The fan over a box, and its light at T of the loop read where it can come to show, a few rays a step: the rays
   and readings a cut asks for, each reading's share that shows in the box, and the light of every reading a wedge
   or an averaging can reach from one that shows (a reading the range hides whole, far from any that shows, is never
   worked out: four in ten of the picture as designed). `greys` reads how far along the palette in place of the
   color; `reach`, how many rays and readings an averaging of the light may reach (softened). */
function* readFan(
  m: AuroraScene,
  T: number,
  cut: AuroraCut,
  greys: boolean,
  reach: number
): Generator<void, Fan> {
  const { width: W, height: H, cs, sn, ext } = m;
  const { x: fx, y: fy } = m.design.fan;
  /* the angles and distances of the box's rim from the fan's point */
  let a0 = 9;
  let a1 = -9;
  let r0 = 9;
  let r1 = 0;
  for (let i = 0; i < 256; i++) {
    const q = (i % 64) / 63;
    const [x, y] = [
      [q * W, 0],
      [W, q * H],
      [q * W, H],
      [0, q * H]
    ][i >> 6];
    const dx = x - W / 2;
    const dy = y - H / 2;
    const X = (dx * cs + dy * sn) / ext - fx;
    const Y = 0.5 - (-dx * sn + dy * cs) / ext - fy;
    const a = Math.atan2(X, Y);
    const r = Math.hypot(X, Y);
    a0 = Math.min(a0, a);
    a1 = Math.max(a1, a);
    r0 = Math.min(r0, r);
    r1 = Math.max(r1, r);
  }
  r0 *= 0.985;
  r1 *= 1.01;
  const apart = Math.max(cut.px / (0.5 * (r0 + r1) * ext), cut.cell / (m.design.c.across * CELLS));
  const n = Math.max(8, Math.ceil((a1 - a0) / apart));
  const step = (a1 - a0) / n;
  const reads = Math.max(8, Math.ceil((r1 - r0) / Math.max(cut.read / ext, cut.gap)));
  const N = n + 1;
  const K = reads + 1;
  const ch = greys ? 1 : 3;
  const shows = new Float32Array(N * K);
  const rise = new Float32Array(N * K);
  const where = new Float64Array(2);
  for (let i = 0; i < N; i++) {
    const sin = Math.sin(a0 + i * step);
    const cos = Math.cos(a0 + i * step);
    for (let k = 0; k < K; k++) {
      const r = r0 + ((r1 - r0) * k) / reads;
      auroraRange(m, fx + r * sin, fy + r * cos, where);
      rise[i * K + k] = where[1];
      if (where[0] <= 0) continue;
      const [x, y] = pixelOf(m, fx + r * sin, fy + r * cos);
      if (x >= -1 && x <= W + 1 && y >= -1 && y <= H + 1) shows[i * K + k] = where[0];
    }
    if (i % 16 === 15) yield;
  }
  /* the readings whose light is asked for: within a span of rays and a reading of one that shows, and as far again
     as the averaging reaches */
  const along = new Uint8Array(N * K);
  for (let i = 0; i < N; i++)
    for (let k = 0; k < K; k++) {
      if (shows[i * K + k] <= 0) continue;
      const to = Math.min(K - 1, k + 1 + reach);
      for (let q = Math.max(0, k - 1 - reach); q <= to; q++) along[i * K + q] = 1;
    }
  const asked = new Uint8Array(N * K);
  for (let i = 0; i < N; i++)
    for (let k = 0; k < K; k++) {
      if (!along[i * K + k]) continue;
      const to = Math.min(N - 1, i + cut.span + reach);
      for (let q = Math.max(0, i - cut.span - reach); q <= to; q++) asked[q * K + k] = 1;
    }
  const lit: AuroraScene = greys ? { ...m, ramp: LIGHT_ALONE } : m;
  const light = new Float64Array(N * K * ch);
  const c = new Float64Array(3);
  for (let i = 0; i < N; i++) {
    const sin = Math.sin(a0 + i * step);
    const cos = Math.cos(a0 + i * step);
    for (let k = 0; k < K; k++) {
      if (!asked[i * K + k]) continue;
      const r = r0 + ((r1 - r0) * k) / reads;
      auroraLight(lit, T, fx + r * sin, fy + r * cos, rise[i * K + k], c);
      if (greys) light[i * K + k] = alongPalette(c[0]);
      else light.set(c, (i * K + k) * 3);
    }
    if (i % 4 === 3) yield;
  }
  return { a0, step, n, r0, r1, reads, ch, light, shows };
}

/* A fan's light averaged over `reach` rays each way across the fan, then over as many readings each way along each
   ray, nearer ones counting more: a new array, the fan's own left as read. */
function softened(fan: Fan, reach: number): Float64Array {
  const R = Math.ceil(reach) - 1;
  if (R < 1) return fan.light;
  const N = fan.n + 1;
  const K = fan.reads + 1;
  const { ch } = fan;
  const weights = Array.from({ length: 2 * R + 1 }, (_, d) => 1 - Math.abs(d - R) / reach);
  const pass = (from: Float64Array, across: boolean): Float64Array => {
    const to = new Float64Array(from.length);
    const count = across ? N : K;
    const stride = (across ? K : 1) * ch;
    for (let i = 0; i < N; i++)
      for (let k = 0; k < K; k++) {
        const at = across ? i : k;
        const base = (i * K + k) * ch;
        for (let j = 0; j < ch; j++) {
          let sum = 0;
          let weight = 0;
          for (let d = -R; d <= R; d++) {
            const q = Math.min(count - 1, Math.max(0, at + d));
            sum += weights[d + R] * from[base + (q - at) * stride + j];
            weight += weights[d + R];
          }
          to[base + j] = sum / weight;
        }
      }
    return to;
  };
  return pass(pass(fan.light, true), false);
}

/* The rays kept, by their numbers on the fan: the first, the last, and from each kept the farthest that straight
   lines between the two keep every ray between them within `tol` levels where it shows (a reading that barely shows
   counts for less), `span` rays on at the most. A fan of greys counts a miss by how far along the palette it is
   (greySteep), so its tolerance is the same anywhere along the palette. */
function keptRays(fan: Fan, light: Float64Array, tol: number, span: number): number[] {
  const K = fan.reads + 1;
  const { ch, shows } = fan;
  const greys = ch === 1;
  const row = K * ch;
  const misses = (a: number, b: number): boolean => {
    for (let q = a + 1; q < b; q++) {
      const f = (q - a) / (b - a);
      for (let k = 0; k < K; k++) {
        const s = shows[q * K + k];
        if (s <= 0) continue;
        const most = tol / (255 * Math.min(1, 2 * s));
        for (let j = k * ch; j < k * ch + ch; j++) {
          const here = light[q * row + j];
          const miss = Math.abs(here - (light[a * row + j] * (1 - f) + light[b * row + j] * f));
          if ((greys ? miss * greySteep(here) : miss) > most) return true;
        }
      }
    }
    return false;
  };
  const kept = [0];
  let from = 0;
  for (let i = 2; i <= fan.n; i++)
    if (i - from > span || misses(from, i)) {
      kept.push(i - 1);
      from = i - 1;
    }
  kept.push(fan.n);
  return kept;
}

/* The stops of ray `i` from reading `lo` to `hi`, each a reading's number and its `ch` numbers: from each stop the
   line runs on as far as some end keeps every reading passed within `tol` levels, and ends as near that reading's
   own light as those ends allow. A stop's color so lies within the tolerance of its reading, not on it: a line may
   pass on either side of the light it follows, and runs the farther for it (a sixth fewer stops than lines from
   reading to reading, at the same tolerance). */
function keptStops(
  fan: Fan,
  light: Float64Array,
  i: number,
  lo: number,
  hi: number,
  tol: number
): [number, number[]][] {
  const { ch } = fan;
  const base = i * (fan.reads + 1) * ch;
  /* a reading's tolerance: a grey's is as much wider as it moves less far along the palette */
  const within = (v: number) => (ch === 1 ? tol / (255 * greySteep(v)) : tol / 255);
  let at = Array.from({ length: ch }, (_, j) => light[base + lo * ch + j]);
  const stops: [number, number[]][] = [[lo, at]];
  const least = new Float64Array(ch);
  const most = new Float64Array(ch);
  const leastEnd = new Float64Array(ch);
  const mostEnd = new Float64Array(ch);
  for (let from = lo; from < hi; ) {
    /* the slopes, a channel, that keep every reading so far within the tolerance */
    least.fill(-Infinity);
    most.fill(Infinity);
    let end = from;
    for (let k = from + 1; k <= hi; k++) {
      let fits = true;
      for (let j = 0; j < ch && fits; j++) {
        const v = light[base + k * ch + j];
        const t = within(v);
        const a = Math.max(least[j], (v - t - at[j]) / (k - from));
        const b = Math.min(most[j], (v + t - at[j]) / (k - from));
        if (a > b) fits = false;
      }
      if (!fits) break;
      for (let j = 0; j < ch; j++) {
        const v = light[base + k * ch + j];
        const t = within(v);
        least[j] = Math.max(least[j], (v - t - at[j]) / (k - from));
        most[j] = Math.min(most[j], (v + t - at[j]) / (k - from));
      }
      leastEnd.set(least);
      mostEnd.set(most);
      end = k;
    }
    const run = end - from;
    const last = at;
    at = Array.from({ length: ch }, (_, j) =>
      Math.min(
        1,
        Math.max(
          0,
          Math.min(
            last[j] + mostEnd[j] * run,
            Math.max(last[j] + leastEnd[j] * run, light[base + end * ch + j])
          )
        )
      )
    );
    stops.push([end, at]);
    from = end;
  }
  return stops;
}

/** A kept ray as it is written: its number on the fan and the numbers of the kept rays before and after it (its
    own at the fan's ends), whether it lies under the tents (every other one does), its stops, and the distance from
    the fan's point at which its light is nearest. */
interface Wedge {
  ray: number;
  before: number;
  after: number;
  tented: boolean;
  stops: [number, number[]][];
  nearest: number;
}

/* The wedges a fan's light is written as, in their order across the fan: a kept ray whose wedge shows nowhere in
   the box is left out, and the stops of one the range hides in part end a reading past where it does. */
function wedgesOf(fan: Fan, light: Float64Array, cut: AuroraCut): Wedge[] {
  const K = fan.reads + 1;
  const kept = keptRays(fan, light, cut.ray, cut.span);
  const wedges: Wedge[] = [];
  kept.forEach((ray, s) => {
    const before = kept[Math.max(0, s - 1)];
    const after = kept[Math.min(kept.length - 1, s + 1)];
    let lo = -1;
    let hi = -1;
    for (let k = 0; k < K; k++)
      for (let q = before; q <= after; q++)
        if (fan.shows[q * K + k] > 0) {
          if (lo < 0) lo = k;
          hi = k;
          break;
        }
    if (lo < 0) return;
    lo = Math.max(0, lo - 1);
    hi = Math.min(fan.reads, hi + 1);
    wedges.push({
      ray,
      before,
      after,
      tented: s % 2 === 1,
      stops: keptStops(fan, light, ray, lo, hi, cut.stop),
      nearest: fan.r0 + ((fan.r1 - fan.r0) * lo) / fan.reads
    });
  });
  return wedges;
}

/* The tents: a tent's two sides as they are written (`q`, the side written first, and `Q`, the one written over
   it), and the mask (`o`) of every tent, each side its shape turned to its ray, drawn as narrow as the ray beside
   it is near and as large as the ray's light is far from the fan's point. A side falls from white on its ray to
   black at its end in `layers` layers, each a wedge faded across its own width by a gradient of greys whose line
   stands on the layer's first side where the side is 1 from the fan's point: there the layers join into one even
   fall (or a rounder one: `round`), and farther out, where the rays have spread, each layer's fade ends before its
   width does and holds its last grey to the next layer, which starts on that grey.
   Nothing in a tent only meets: two shapes that met on a line would each cover half of every pixel along it and
   let a quarter of the mask through, which the still's filter turns into a dashed line of another color wherever
   the palette turns fast. So the layers are written from the last to the first and each reaches a layer back,
   under the one written after it, at its own first grey; and a tent's narrower side is written first and reaches
   half its own width past the ray, white, under the side written after it (never as far as that side's end, where
   the white would show between two tents).
   Whole greys, and no white fading to clear: a design tool reads a mask by its colors times its alpha where a
   browser reads it by its alpha alone (Figma drew a white of half opacity as a quarter, and a tent of fading whites
   as that tent squared, its wedges back to flat stripes: 17 Nov 2026, a pasted frame a mean of 1.47 from resvg's
   drawing of it, 0.18 in greys). `place` is the fan's own frame, its point at 0 0 and a ray at the angle a toward
   (sin a, cos a); `href` names a copy's shape as the document does. */
function tentParts(
  m: AuroraScene,
  fan: Fan,
  wedges: readonly Wedge[],
  { tent: layers, round }: AuroraCut,
  place: string,
  href: string
): string {
  const tented = wedges.filter(w => w.tented);
  if (!tented.length) return "";
  const far = (fan.r1 / Math.min(...tented.map(w => w.nearest))) * 1.05;
  const wide = TENT_WIDE / layers;
  const tan = Math.tan(wide);
  /* how far the tent has fallen x of the way from its ray to its end */
  const fallen = (x: number) => (1 - round) * x + round * x * x * (3 - 2 * x);
  /* a layer's wedge, from one angle to another */
  const wedge = (from: number, to: number, j: number) =>
    `<path d="M0 0L${n5(far * Math.tan(from))} ${n4(far)}L${n5(far * Math.tan(to))} ${n4(far)}Z" fill="url(#t${j})"/>`;
  let fades = "";
  let first = "";
  let second = "";
  for (let j = layers - 1; j >= 0; j--) {
    const sin = Math.sin(j * wide);
    const cos = Math.cos(j * wide);
    fades +=
      `<linearGradient id="t${j}" gradientUnits="userSpaceOnUse" x1="${n5(sin)}" y1="${n5(cos)}" x2="${n5(sin + cos * tan)}" y2="${n5(cos - sin * tan)}">` +
      `<stop offset="0" stop-color="${grey(1 - fallen(j / layers))}"/><stop offset="1" stop-color="${grey(1 - fallen((j + 1) / layers))}"/></linearGradient>`;
    first += wedge(j ? (j - 1) * wide : -TENT_WIDE / 2, (j + 1) * wide, j);
    second += wedge(Math.max(0, j - 1) * wide, (j + 1) * wide, j);
  }
  const narrow = (rays: number) => Math.tan(rays * fan.step) / Math.tan(TENT_WIDE);
  const tents = tented
    .map(w => {
      const turn = `rotate(${n3((-(fan.a0 + w.ray * fan.step) * 180) / Math.PI)})`;
      const size = n4(w.nearest);
      /* its narrower side first, which reaches half its own width past the ray: never as far as the other's end */
      const sides = [w.before - w.ray, w.after - w.ray].sort((a, b) => Math.abs(a) - Math.abs(b));
      return sides
        .map(
          (rays, k) =>
            `<use ${href}="#${k ? "Q" : "q"}" transform="${turn}scale(${n4(Math.sign(rays) * w.nearest * narrow(Math.abs(rays)))} ${size})"/>`
        )
        .join("");
    })
    .join("");
  return `${fades}<g id="q">${first}</g><g id="Q">${second}</g><mask id="o" maskUnits="userSpaceOnUse" x="0" y="0" width="${m.width}" height="${m.height}"><g transform="${place}">${tents}</g></mask>`;
}

/* a fan's own frame over the box: its point at 0 0 */
const fanPlace = (m: AuroraScene) =>
  `${placeOf(m)}translate(${n4(m.design.fan.x)} ${n4(m.design.fan.y)})`;

/* How much of a channel's whole range a palette's ramp spans, its widest channel's: 1 for a palette that runs from
   black to white, about a third for a pale one. */
function paletteSpan(ramp: Float32Array): number {
  let widest = 0;
  for (let j = 0; j < 3; j++) {
    let least = 1;
    let most = 0;
    for (let i = j; i < ramp.length; i += 3) {
      least = Math.min(least, ramp[i]);
      most = Math.max(most, ramp[i]);
    }
    widest = Math.max(widest, most - least);
  }
  return widest;
}

/* a generator's steps run at once */
function atOnce<T>(steps: Generator<void, T>): T {
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/** The frame at t (seconds of the loop at speed 1) as an SVG of a size: what any moment of it is as a vector
    picture. Every reader of SVG draws it: its wedges are plain paths, each from the fan's point out, with a gradient
    of its own in the picture's pixels, and a copy names its shape by `xlink:href`. Under the range's mask the light
    is one group that stands alone (`isolation`), and so are the wedges under the tents: WebKit thins a masked
    group's shapes one at a time unless it does, and wedges that reach over one another then show twice through the
    mask (a 99th percentile of 9.8 from the other readers' along the range, 0.5 with it). `cut`: the frame's own
    unless another is given, which is how a cut is weighed against it. */
export function auroraFrameSvg(
  P: Palette,
  view: AuroraView,
  size: Size,
  t: number,
  cut: AuroraCut = FRAME
): string {
  const m = auroraScene(P, view, size);
  const fan = atOnce(readFan(m, auroraTime(t), cut, false, Math.ceil(cut.soft)));
  /* its tolerances as shares of what the palette spans: the same miss is as much plainer in a pale palette, whose
     shafts stand a few levels over its sky, as that palette spans less */
  const spans = paletteSpan(m.ramp);
  const wedges = wedgesOf(fan, softened(fan, cut.soft), {
    ...cut,
    ray: cut.ray * spans,
    stop: cut.stop * spans
  });
  const { x: fx, y: fy } = m.design.fan;
  const at = (r: number, a: number) => pixelOf(m, fx + r * Math.sin(a), fy + r * Math.cos(a));
  const point = (r: number, a: number) => at(r, a).map(n1).join(" ");
  const lap = LAP / (0.5 * (fan.r0 + fan.r1) * m.ext);
  let fills = "";
  let ground = "";
  let tented = "";
  wedges.forEach((w, s) => {
    const a = fan.a0 + w.ray * fan.step;
    const from = fan.a0 + w.before * fan.step;
    const to = fan.a0 + w.after * fan.step + lap;
    const g0 = at(fan.r0, a);
    const g1 = at(fan.r1, a);
    fills += `<linearGradient id="w${s}" gradientUnits="userSpaceOnUse" x1="${n1(g0[0])}" y1="${n1(g0[1])}" x2="${n1(g1[0])}" y2="${n1(g1[1])}">${w.stops
      .map(([k, c]) => `<stop offset="${n3(k / fan.reads)}" stop-color="${toHex(c)}"/>`)
      .join("")}</linearGradient>`;
    /* out to where its far side clears the fan's reach at every angle it spans */
    const far = fan.r1 / Math.cos(Math.max(a - from, to - a));
    const path = `<path d="M${point(0, a)}L${point(far, from)}L${point(far, to)}Z" fill="url(#w${s})"/>`;
    if (w.tented) tented += path;
    else ground += path;
  });
  const R = rangeParts(m, true);
  const tents = tentParts(m, fan, wedges, cut, fanPlace(m), "xlink:href");
  const { width: W, height: H } = m;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${R.defs}${tents}${fills}</defs>${R.under}` +
    `<g mask="url(#m)"><g style="isolation:isolate">${ground}${tented ? `<g mask="url(#o)"><g style="isolation:isolate">${tented}</g></g>` : ""}</g></g></svg>`
  );
}

/** Its SVG file: its first frame at any speed, since its shapes are new at every frame. */
export const auroraFileSvg = (P: Palette, view: AuroraView, size: Size): string =>
  auroraFrameSvg(P, view, size, 0);

/** A still's cut: an AuroraCut whose `px` and `read` are shares of the box's longer side where a frame's are
    pixels (a still is one design laid over any box), and `most`, the most it may weigh as a CSS background,
    bytes. */
export type AuroraStillCut = AuroraCut & { most: number };

/** The still's cut, and the most it may weigh, under the 40 KiB a list's still may (fx-still.ts). A look whose
    light fills more of the box than that weight holds is cut coarser until it fits (auroraStillSteps).
    Measured 17 Nov 2026 at the design square over thirteen looks (shapes, angles, low ranges, walls), the old
    still's numbers after each (its light as colors in broad wedges under a blur, cut to fill 39 KiB): 17 to 24
    KiB as a CSS background, 20.6 on average (34 to 38, 36.4), the same for every palette; its middle 16:9 at 960
    by 540 a mean of 1.74 from the CPU's frame in the suite's palette (1.78), 2.71 in a green one (2.86) and 6.88
    in one of six colors (7.07); written in 5 ms, its light read on a fan of rays two cells of the fine shafts
    apart (10 ms), and in 0.2 ms where its look's shapes are kept; sixteen cards of it first painted by a
    software rasterizer in 200 ms (208), one filling a screen in 60 (68). Chromium and Firefox draw it as resvg
    does (means of 0.02 to 0.19 apart) and WebKit within 0.06 to 0.39.
    Its tent has three layers and is round: a fourth costs a list of cards 12 ms of first paint and a twelfth 120,
    and none draws it nearer the frame. */
const STILL: AuroraStillCut = {
  px: 0.006,
  cell: 2,
  read: 0.006,
  gap: 0.03,
  ray: 24,
  stop: 8,
  span: 5,
  tent: 3,
  round: 1,
  soft: 2,
  most: 25 * 1024
};
/** How many times as broad as designed a still's averaging grows at the most, as it is cut coarser to fit. */
const BROADEST = 2;

/* what a piece of SVG weighs in a CSS background (css.ts svgUrl escapes four characters as three) */
const cssWeight = (svg: string) => svg.length + 2 * (svg.match(/[<>#%]/g)?.length ?? 0);

/** A still's shapes, which are its light's and no palette's: the whole of it but the filter's tables, in the two
    pieces the tables are written between. */
interface StillShapes {
  before: string;
  after: string;
}

/* The still's shapes of a fan's light, written short, for a browser: the wedges one shape turned about the fan's
   point to each wedge's first side and reaching past its last, where the next, drawn after it, lies over it; each
   with its own stops on one gradient's line, so a wedge costs its stops and little more. The stops are greys, how
   far along the palette the light reads, and the filter, whose tables a palette fills, reads the greys through that
   palette once the wedges and the tents have made the light whole. */
function stillShapes(m: AuroraScene, fan: Fan, light: Float64Array, cut: AuroraCut): StillShapes {
  const wedges = wedgesOf(fan, light, cut);
  const { width: W, height: H } = m;
  const lap = LAP / (0.5 * (fan.r0 + fan.r1) * m.ext);
  let fills = "";
  let ground = "";
  let tented = "";
  let widest = 0;
  wedges.forEach((w, s) => {
    const from = fan.a0 + w.before * fan.step;
    /* the gradient runs along the wedge's first side, a little aside of its ray: a reading stands where its
       distance along the ray reaches along that side */
    const aside = Math.cos((w.ray - w.before) * fan.step);
    fills += `<linearGradient id="g${s}" href="#g">${w.stops
      .map(([k, c]) => {
        const r = fan.r0 + ((fan.r1 - fan.r0) * k) / fan.reads;
        return `<stop offset="${n3(Math.max(0, (r * aside - fan.r0) / (fan.r1 - fan.r0)))}" stop-color="${grey(c[0])}"/>`;
      })
      .join("")}</linearGradient>`;
    const use = `<use href="#p" fill="url(#g${s})" transform="rotate(${n3((-from * 180) / Math.PI)})"/>`;
    if (w.tented) tented += use;
    else ground += use;
    widest = Math.max(widest, (w.after - w.before) * fan.step);
  });
  const place = fanPlace(m);
  const far = fan.r1 * 1.05;
  const R = rangeParts(m, false);
  return {
    before:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${R.defs}` +
      `<filter id="f" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}" color-interpolation-filters="sRGB"><feComponentTransfer>`,
    after:
      `</feComponentTransfer></filter>` +
      `<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="${n4(fan.r0)}" x2="0" y2="${n4(fan.r1)}"/>` +
      `<path id="p" d="M0 0L0 ${n4(far)}L${n4(far * Math.tan(widest + lap))} ${n4(far)}Z"/>` +
      `${tentParts(m, fan, wedges, cut, place, "href")}${fills}</defs>${R.under}` +
      `<g mask="url(#m)"><g filter="url(#f)"><g transform="${place}">${ground}</g>${tented ? `<g mask="url(#o)"><g style="isolation:isolate" transform="${place}">${tented}</g></g>` : ""}</g></g></svg>`
  };
}

/* The filter's tables for a palette: its colors from its darker end, as the ramp reads them (aurora.ts auroraRamp),
   at even steps of grey, a table a channel. */
function paletteTables(P: Palette): string {
  const colors = auroraStops(P);
  const last = colors.length - 1;
  const flip = srgbToLch(colors[0])[0] > srgbToLch(colors[last])[0];
  const along = Array.from({ length: TABLE + 1 }, (_, i) => {
    const x = (i / TABLE) ** (1 / GREY_BEND) * last;
    const at = Math.min(last - 1, Math.floor(x));
    const [a, b] = flip ? [colors[last - at], colors[last - 1 - at]] : [colors[at], colors[at + 1]];
    return a.map((v, j) => v + (b[j] - v) * (x - at));
  });
  return ["R", "G", "B"]
    .map((c, j) => `<feFunc${c} type="table" tableValues="${along.map(v => n3(v[j])).join(" ")}"/>`)
    .join("");
}

/** The shapes of the stills last written, by their look and box: a list's cards are one look in sixteen palettes,
    and its next page sixteen more, so all but the first of them cost their tables alone. */
const KEPT_STILLS = 8;
const keptStills = new Map<string, StillShapes>();

/** The still a step at a time, each under a millisecond but the noise's, made once a page: the first frame's light
    read on its fan a few rays a step, then written; no step where its shapes are kept from a still of the same
    look. `cut`: the still's own unless another is given. */
export function* auroraStillSteps(
  P: Palette,
  view: AuroraView,
  size: Size,
  cut: AuroraStillCut = STILL
): Generator<void, string> {
  const key = `${view.angle} ${view.shape} ${view.path} ${view.bg} ${size.width} ${size.height}`;
  let shapes = cut === STILL ? keptStills.get(key) : undefined;
  if (!shapes) {
    yield* auroraTilesSteps();
    const m = auroraScene(P, view, size);
    const side = Math.max(m.width, m.height);
    const fan = yield* readFan(
      m,
      0,
      { ...cut, px: cut.px * side, read: cut.read * side },
      true,
      Math.ceil(cut.soft * BROADEST)
    );
    /* cut coarser, round by round, until it weighs what it may: its tolerances wider, its averaging broader */
    const tables = cssWeight(paletteTables(P));
    for (let coarser = 1, round = 0; ; round++) {
      /* averaged as read, along the palette, then bent into greys */
      const light = softened(fan, cut.soft * Math.min(BROADEST, Math.sqrt(coarser))).map(
        v => v ** GREY_BEND
      );
      yield;
      shapes = stillShapes(m, fan, light, {
        ...cut,
        ray: cut.ray * coarser,
        stop: cut.stop * coarser
      });
      const weight = cssWeight(shapes.before) + tables + cssWeight(shapes.after);
      if (weight <= cut.most || round > 6) break;
      coarser *= (weight / cut.most) ** 2;
      yield;
    }
    if (cut === STILL) {
      keptStills.set(key, shapes);
      if (keptStills.size > KEPT_STILLS)
        keptStills.delete(keptStills.keys().next().value as string);
    }
  }
  return shapes.before + paletteTables(P) + shapes.after;
}

/** The still: auroraStillSteps, at once. */
export const auroraStillSvg = (
  P: Palette,
  view: AuroraView,
  size: Size,
  cut?: AuroraStillCut
): string => atOnce(auroraStillSteps(P, view, size, cut));
