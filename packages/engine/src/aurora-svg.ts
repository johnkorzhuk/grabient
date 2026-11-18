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
   The fan is as fine as the picture's pixels show (FRAME), since the fine shafts are the aurora's look: for a day a
   frame was cut by how far its colors lay from the frame's on average, which the fine shafts hardly move, and drew
   them smooth (John, 17 Nov 2026: "the vector does not look like the shader. its important there's parity there. or
   at least as close as possible with reason").
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

   Its still, for a page's first paint and a list's cards, is for browsers alone, and carries the light itself as a
   small picture: how far along the palette the light of each place reads, a pixel one of LEVELS places, in an
   indexed PNG the SVG holds (indexed-png.ts) whose own palette is the palette's colors at those places, drawn
   under the range's own shape (STILL below). So it is the shader's first frame a little soft, its shapes the
   shader's own and every pixel of it a color of the palette's own (between two pixels a browser blends theirs);
   what it weighs does not depend on the palette; and its pixels are one look's, whatever the palette, so a list of
   one look in sixteen palettes makes them once. And its colors
   are a picture's, which a browser shows on any screen as it shows the shader's canvas. For a day (17 Nov 2026)
   the picture was a JPEG of greys that one filter's tables read through the palette, and Chromium takes what a
   filter's table writes for the screen's own numbers, where it turns a picture's, a fill's and a canvas's colors
   into the screen's: on a screen of a wider gamut than sRGB the still stood apart from the shader that took over
   from it (told its screen is Display P3, Chromium drew a palette's lime 26 levels of red and 15 of blue under
   the shader's, and on an sRGB screen within one; John, that day: "the initial vector is slightly a different
   color than the shader"). Nothing that scales or mixes colors as the page is drawn is exact there either (black
   at an opacity read from the light, over a picture of the colors at full strength, lay 6 to 12 levels off in the
   dark colors): only a color that a picture, a fill or a gradient holds is the screen's as the shader's is.
   A sample of light costs a few bits of a PNG where a gradient's stop costs 47 bytes of a stylesheet, and no still
   of shapes alone came near the shader in the 40 KiB a list's still may weigh: the light as colors in broad wedges
   under a blur (until 17 Nov 2026), then as greys in wedges with the light run between them (a day), each a
   smooth picture of other shapes than the shader's, 3 to 6 from its frame on a card where the picture lies within
   1; and shapes as wide as their light under a blur, eight times the samples in the same bytes, drew moire in
   WebKit, 3 to 8 from the frame where Chromium drew them within 1.5 (John, 17 Nov 2026, of the still then: "the
   vector does not look like the shader"). */
import {
  AURORA_PAGE_NUMBERS,
  AURORA_SOFT,
  type AuroraScene,
  type AuroraView,
  auroraLift,
  auroraLight,
  auroraPoint,
  auroraRange,
  auroraScene,
  auroraStops,
  auroraTilesSteps,
  auroraTime
} from "./aurora.ts";
import { srgbToLch, toHex } from "./color.ts";
import { indexedPngSteps, pngPalette } from "./indexed-png.ts";
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
      line between two stops a reading between them: levels of a palette that spans all 255, and as many fewer as a
      palette spans less (paletteSpan) */
  ray: number;
  stop: number;
  /** the most fine rays from one kept ray to the next */
  span: number;
  /** how many layers each side of a tent is laid in */
  tent: number;
}

/** A frame's cut. The fine fan is as fine as the picture shows: a ray every 3 pixels, where two beside it differ by
    8 levels or more, and never finer than two rays a cell of the fine shafts' finest lattice, eight of its
    coarsest (aurora.ts: sheet c, three lattices), past which a frame is the same shapes whatever its size; readings
    3 pixels apart along a ray, never nearer than a 250th of the picture's height. Stops are kept looser than rays,
    at 6 levels: a slow miss along a ray shows less than a shaft that is not there.
    Measured 17 Nov 2026 over thirteen of the site's palettes as designed, as resvg draws the SVG against the CPU's
    frame, the numbers of the flat wedges it was once cut into after each: at 800 by 400, 196 KiB on average (110
    for a pale palette to 343 for one of six colors that turn dark between; 169, 108 to 220), 28 compressed (24), a
    mean of 0.59 from the frame (0.71) and a 99th percentile of 6.2 at the worst (13.1), written in 29 ms (28); at
    1920 by 1080, 357 KiB (123 to 804; 490, 253 to 795), 0.48 (0.36) and 2.8 (4.4), 84 ms (81); the suite's palette
    at 3840 by 2160, 183 KiB (803), as at 1920 by 1080 and at any size past it. Of what the frame holds finer than
    7 pixels, four fifths stands in its place at 800 by 400, where a half did in the flat wedges, whose own edges
    made up as much again. At 320 by 180, the suite's size, every look, path and ground it draws at twelve times of
    the loop lies within a mean of 0.67 and a 99th percentile of 3.5 (1.0 and 7.4), 0.04% far, in 58 KiB on average
    (43); at 640 by 360, within 0.51 and 2.2. Chromium, Firefox and WebKit draw it as resvg does (means of 0.05 to
    0.16 apart).
    Cut by the light's broad scale alone (two rays a cell of the fine shafts' coarsest lattice, rays kept at 24
    levels, readings a fortieth of the height apart), as it was for a day, it weighed 102 KiB at 800 by 400 and 126
    at 1920 by 1080, lay 0.87 and 0.76 from the frame, and drew the fine shafts smooth: a mean hardly counts them,
    and a picture of the two beside the frame does. */
const FRAME: AuroraCut = {
  px: 3,
  cell: 0.125,
  read: 3,
  gap: 0.004,
  ray: 8,
  stop: 6,
  span: 8,
  tent: 2
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
    0 to `reads` from `r0` out to `r1` of the fan's point; of every reading its color's three channels and how much
    of it shows in the box. */
interface Fan {
  a0: number;
  step: number;
  n: number;
  r0: number;
  r1: number;
  reads: number;
  light: Float64Array;
  shows: Float32Array;
}

const { cells: CELLS } = AURORA_PAGE_NUMBERS;

/* The fan over a box, and its light at T of the loop read where it can come to show: the rays and readings a cut
   asks for, each reading's share that shows in the box, and the light of every reading a wedge can reach from one
   that shows (a reading the range hides whole, far from any that shows, is never worked out: four in ten of the
   picture as designed). */
function readFan(m: AuroraScene, T: number, cut: AuroraCut): Fan {
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
  }
  /* the readings whose light is asked for: within a span of rays and a reading of one that shows */
  const along = new Uint8Array(N * K);
  for (let i = 0; i < N; i++)
    for (let k = 0; k < K; k++) {
      if (shows[i * K + k] <= 0) continue;
      const to = Math.min(K - 1, k + 1);
      for (let q = Math.max(0, k - 1); q <= to; q++) along[i * K + q] = 1;
    }
  const asked = new Uint8Array(N * K);
  for (let i = 0; i < N; i++)
    for (let k = 0; k < K; k++) {
      if (!along[i * K + k]) continue;
      const to = Math.min(N - 1, i + cut.span);
      for (let q = Math.max(0, i - cut.span); q <= to; q++) asked[q * K + k] = 1;
    }
  const light = new Float64Array(N * K * 3);
  const c = new Float64Array(3);
  for (let i = 0; i < N; i++) {
    const sin = Math.sin(a0 + i * step);
    const cos = Math.cos(a0 + i * step);
    for (let k = 0; k < K; k++) {
      if (!asked[i * K + k]) continue;
      const r = r0 + ((r1 - r0) * k) / reads;
      auroraLight(m, T, fx + r * sin, fy + r * cos, rise[i * K + k], c);
      light.set(c, (i * K + k) * 3);
    }
  }
  return { a0, step, n, r0, r1, reads, light, shows };
}

/* The rays kept, by their numbers on the fan: the first, the last, and from each kept the farthest that straight
   lines between the two keep every ray between them within `tol` levels where it shows (a reading that barely shows
   counts for less), `span` rays on at the most. */
function keptRays(fan: Fan, tol: number, span: number): number[] {
  const K = fan.reads + 1;
  const { light, shows } = fan;
  const row = K * 3;
  const misses = (a: number, b: number): boolean => {
    for (let q = a + 1; q < b; q++) {
      const f = (q - a) / (b - a);
      for (let k = 0; k < K; k++) {
        const s = shows[q * K + k];
        if (s <= 0) continue;
        const most = tol / (255 * Math.min(1, 2 * s));
        for (let j = k * 3; j < k * 3 + 3; j++)
          if (
            Math.abs(light[q * row + j] - (light[a * row + j] * (1 - f) + light[b * row + j] * f)) >
            most
          )
            return true;
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

/* The stops of ray `i` from reading `lo` to `hi`, each a reading's number and its color: from each stop the line
   runs on as far as some end keeps every reading passed within `tol` levels, and ends as near that reading's own
   light as those ends allow. A stop's color so lies within the tolerance of its reading, not on it: a line may
   pass on either side of the light it follows, and runs the farther for it (a sixth fewer stops than lines from
   reading to reading, at the same tolerance). */
function keptStops(fan: Fan, i: number, lo: number, hi: number, tol: number): [number, number[]][] {
  const { light } = fan;
  const base = i * (fan.reads + 1) * 3;
  const t = tol / 255;
  let at = [0, 1, 2].map(j => light[base + lo * 3 + j]);
  const stops: [number, number[]][] = [[lo, at]];
  const least = new Float64Array(3);
  const most = new Float64Array(3);
  const leastEnd = new Float64Array(3);
  const mostEnd = new Float64Array(3);
  for (let from = lo; from < hi; ) {
    /* the slopes, a channel, that keep every reading so far within the tolerance */
    least.fill(-Infinity);
    most.fill(Infinity);
    let end = from;
    for (let k = from + 1; k <= hi; k++) {
      let fits = true;
      for (let j = 0; j < 3 && fits; j++) {
        const v = light[base + k * 3 + j];
        if (
          Math.max(least[j], (v - t - at[j]) / (k - from)) >
          Math.min(most[j], (v + t - at[j]) / (k - from))
        )
          fits = false;
      }
      if (!fits) break;
      for (let j = 0; j < 3; j++) {
        const v = light[base + k * 3 + j];
        least[j] = Math.max(least[j], (v - t - at[j]) / (k - from));
        most[j] = Math.min(most[j], (v + t - at[j]) / (k - from));
      }
      leastEnd.set(least);
      mostEnd.set(most);
      end = k;
    }
    const run = end - from;
    const last = at;
    at = [0, 1, 2].map(j =>
      Math.min(
        1,
        Math.max(
          0,
          Math.min(
            last[j] + mostEnd[j] * run,
            Math.max(last[j] + leastEnd[j] * run, light[base + end * 3 + j])
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
function wedgesOf(fan: Fan, cut: AuroraCut): Wedge[] {
  const K = fan.reads + 1;
  const kept = keptRays(fan, cut.ray, cut.span);
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
      stops: keptStops(fan, ray, lo, hi, cut.stop),
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
   fall, and farther out, where the rays have spread, each layer's fade ends before its
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
  { tent: layers }: AuroraCut,
  place: string,
  href: string
): string {
  const tented = wedges.filter(w => w.tented);
  if (!tented.length) return "";
  const far = (fan.r1 / Math.min(...tented.map(w => w.nearest))) * 1.05;
  const wide = TENT_WIDE / layers;
  const tan = Math.tan(wide);
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
      `<stop offset="0" stop-color="${grey(1 - j / layers)}"/><stop offset="1" stop-color="${grey(1 - (j + 1) / layers)}"/></linearGradient>`;
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
  const fan = readFan(m, auroraTime(t), cut);
  /* its tolerances as shares of what the palette spans: the same miss is as much plainer in a pale palette, whose
     shafts stand a few levels over its sky, as that palette spans less */
  const spans = paletteSpan(m.ramp);
  const wedges = wedgesOf(fan, { ...cut, ray: cut.ray * spans, stop: cut.stop * spans });
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

/** The still's cut: how many pixels its picture of the light has along the box's longer side. */
export interface AuroraStillCut {
  side: number;
}

/** The still's cut: a picture 256 pixels along the box's longer side.
    Measured 18 Nov 2026 at the design square, after each the numbers of the still it follows (a JPEG of greys as
    many pixels a side, which a filter's tables read through the palette): 16.7 KiB as a CSS background as designed
    (11.7), 14.2 of them its picture, and 16 to 27 over twenty-seven looks of the most light a box holds, in any
    shape and at any angle, 21.4 on average (11 to 16, 13.3), the same for every palette; its middle 16:9 on a card
    of 400 by 224 a mean of 0.16 from the CPU's frame in the suite's palette (0.24), 0.21 in a green one (0.32) and
    0.52 in one of six colors (0.66), and as near on a screen of 1280 by 720 (0.15, 0.20 and 0.50), where it is the
    frame five times enlarged: a PNG keeps every pixel as it was written, where a JPEG's grain showed wherever the
    palette turns fast. Written in 29 ms for a look no still has shown (28), its light read at 37,000 places, and
    in 0.2 ms where its look's picture is kept (0.3), so sixteen of a look in 29 ms. Sixteen of them in a list's
    head are 268 KiB as written (189), 19.8 gzipped (14.6) and 16.6 in Brotli (10.5): a PNG does not shrink again,
    and the sixteen are one picture around sixteen palettes of 384 bytes. Sixteen cards of it are first painted by
    a software rasterizer in 120 ms (128), one filling a screen in 72 (88): it runs no filter. Chromium, Firefox
    and WebKit draw it as resvg does (means of 0.01 to 0.14 apart).
    A picture of 224 pixels weighs 14 KiB and lies 0.18 and 0.59 from the suite's frame and the six colors'; one
    of 192, 12 KiB, 0.21 and 0.71. */
const STILL: AuroraStillCut = { side: 256 };
/** A stage's still, which fills a screen where a card's fills a card: a picture 448 pixels along the box's longer
    side. A card's picture over a screen of 1920 by 1080 is seven and a half times enlarged, and showed its pixels
    (John, 17 Nov 2026, of a page's first paint: "it looks pixelated, the colors are off"). Measured 18 Nov 2026
    against the CPU's frame, a card's picture over the same screen after each: a mean of 0.10 and a 99th percentile
    of 0.6 in the suite's palette at 1920 by 1080 (0.15 and 1.3), 0.14 and 0.7 in a green one (0.20 and 1.4), 0.30
    and 2.0 in one of six colors (0.50 and 4.5), and as near at 2560 by 1440; 34.0 KiB as a CSS background as
    designed, 31.6 of them its picture, and 33 to 53 over the twenty-seven looks of the most light, 43.8 on average;
    written in 75 ms for a look no still has shown and in 0.1 where its picture is kept; first painted over a
    screen in 72 ms by a software rasterizer. The JPEG of greys it follows was 512 pixels a side at a quality of
    92: 0.16 and 0.9, 0.20 and 0.9, 0.40 and 2.6 from those frames, in 26.0 KiB as designed and 25 to 34 over those
    looks, written in 96 ms and painted in 100. A picture of 384 pixels lies 0.34 and 2.5 from the six colors'
    frame in 28 KiB, and one of 512, 0.27 and 1.6 in 41. */
export const AURORA_STAGE_STILL: AuroraStillCut = { side: 448 };

/** The light alone: a scene whose ramp is the light itself, so that auroraLight answers how much light, 0 to 1. */
const LIGHT_ALONE = Float32Array.from({ length: 128 * 3 }, (_, i) => Math.floor(i / 3) / 127);
const { low: LOW, tip: TIP, bend: BEND } = AURORA_PAGE_NUMBERS;
/* how far along the palette, from its darker end, a light is read (aurora.ts auroraRamp) */
const alongPalette = (light: number) =>
  1 - (1 - Math.min(1, Math.max(0, (light - LOW) / (TIP - LOW)))) ** BEND;
/** How many places along the palette a pixel of the still's picture may name, even steps from its darker end to
    its other: as many as the ramp the shader reads has colors (aurora.ts AURORA_RAMP). A place is a color of the
    PNG's palette, and between two pixels a browser blends their colors, so with fewer a smooth sky shows the steps
    as lines wherever the palette turns fast: 64 drew them plainly and 96 faintly in a palette of many colors on a
    screen of 1920 by 1080 (a mean of 0.44 and 0.35 from the frame, where these lie 0.31), and 256 lie 0.27 and
    weigh a quarter more. */
const LEVELS = 128;
/** The height over the line the light rises from (auroraRange) under which the light is its haze alone, one place:
    where its short rise begins (aurora.ts auroraLift). */
const HAZE_ALONE = -0.02;

/** A still's picture, which is its light's and no palette's: the whole of the still but its PNG's palette, in the
    two pieces the palette is written between. */
interface StillPicture {
  before: string;
  after: string;
}

/* The still's picture of a scene's first frame, a few rows a step: the light of each pixel's middle as a place
   along the palette, under the range as over it (the range's mask hides it there, and one place under the whole
   range is a run the PNG writes in a few bytes), then the PNG, and the SVG that lays it under the range's mask. */
function* stillPicture(m: AuroraScene, cut: AuroraStillCut): Generator<void, StillPicture> {
  const { width: W, height: H } = m;
  const scale = cut.side / Math.max(W, H);
  const w = Math.max(1, Math.floor(W * scale + 0.5));
  const h = Math.max(1, Math.floor(H * scale + 0.5));
  const lit: AuroraScene = { ...m, ramp: LIGHT_ALONE };
  const placeOf = (light: number) => Math.floor(alongPalette(light) * (LEVELS - 1) + 0.5);
  const lift = [0, 0, 0];
  auroraLift(HAZE_ALONE, lift);
  const haze = placeOf(lift[1]);
  const places = new Uint8Array(w * h);
  const at = new Float64Array(2);
  const where = new Float64Array(2);
  const c = new Float64Array(3);
  /* the line the light rises from under each pixel: in an upright picture a column's pixels share one place of it */
  const upright = m.sn === 0;
  const line = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      auroraPoint(m, ((x + 0.5) * W) / w, ((y + 0.5) * H) / h, at);
      if (!upright || y === 0) {
        auroraRange(m, at[0], at[1], where);
        line[x] = at[1] - where[1];
      }
      const over = at[1] - line[x];
      if (over <= HAZE_ALONE) places[y * w + x] = haze;
      else {
        auroraLight(lit, 0, at[0], at[1], over, c);
        places[y * w + x] = placeOf(c[0]);
      }
    }
    if (y % 4 === 3) yield;
  }
  const png = yield* indexedPngSteps(places, w, h);
  const R = rangeParts(m, false);
  return {
    before:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${R.defs}</defs>${R.under}` +
      `<g mask="url(#m)"><image width="${W}" height="${H}" preserveAspectRatio="none" href="data:image/png;base64,${png.head}`,
    after: `${png.rows}"/></g></svg>`
  };
}

/* The PNG's palette for a palette: its color at each of the LEVELS places, from its darker end, as the ramp reads
   them (aurora.ts auroraRamp), as the chunk the picture's two pieces lie around. */
function paletteChunk(P: Palette): string {
  const colors = auroraStops(P);
  const last = colors.length - 1;
  const flip = srgbToLch(colors[0])[0] > srgbToLch(colors[last])[0];
  const bytes = new Uint8Array(LEVELS * 3);
  for (let i = 0; i < LEVELS; i++) {
    const x = (i / (LEVELS - 1)) * last;
    const at = Math.min(last - 1, Math.floor(x));
    const [a, b] = flip ? [colors[last - at], colors[last - 1 - at]] : [colors[at], colors[at + 1]];
    for (let j = 0; j < 3; j++)
      bytes[i * 3 + j] = Math.floor((a[j] + (b[j] - a[j]) * (x - at)) * 255 + 0.5);
  }
  return pngPalette(bytes);
}

/** The pictures of the stills last written, by their cut, look and box: a list's cards are one look in sixteen
    palettes, and its next page sixteen more, so all but the first of them cost their palettes alone. */
const KEPT_STILLS = 12;
const keptStills = new Map<string, StillPicture>();

/** The still a step at a time, each under a millisecond but the noise's, made once a page: the first frame's light
    read a few rows a step, then written; no step where its picture is kept from a still of the same look and cut.
    `cut`: a card's unless another is given (a stage's: AURORA_STAGE_STILL). */
export function* auroraStillSteps(
  P: Palette,
  view: AuroraView,
  size: Size,
  cut: AuroraStillCut = STILL
): Generator<void, string> {
  const key = `${cut.side} ${view.angle} ${view.shape} ${view.path} ${view.bg} ${size.width} ${size.height}`;
  let picture = keptStills.get(key);
  if (!picture) {
    yield* auroraTilesSteps();
    picture = yield* stillPicture(auroraScene(P, view, size), cut);
    keptStills.set(key, picture);
    if (keptStills.size > KEPT_STILLS) keptStills.delete(keptStills.keys().next().value as string);
  }
  return picture.before + paletteChunk(P) + picture.after;
}

/** The still: auroraStillSteps, at once. */
export const auroraStillSvg = (
  P: Palette,
  view: AuroraView,
  size: Size,
  cut?: AuroraStillCut
): string => atOnce(auroraStillSteps(P, view, size, cut));
