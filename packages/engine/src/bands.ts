/* A palette as an animated SVG, after a looping animation of upright bands. Each band is one vertical gradient from its
   middle out: a bloom, a dark ring, then a dim glow past the ring. The farther a band stands from the center, the
   farther out its ring sits, so the rings draw an X. A pulse walks each stop along the palette, from its dark end
   toward its light end and back, and each band runs the pulse a little after the band inside it, so the bloom spreads
   out from the center and loops.

   Plain CSS animates the stops: no script and no SMIL, so the file moves as an <img>, a CSS background and inline
   markup alike. Its ids, classes and keyframes carry a mark of the file, so two such files inline in one page keep
   apart. The stops' own colors hold one frame of the bloom, which a renderer without CSS animations and a reader who
   asks for less motion see; the animation starts on that frame.

   The shapes and timing were measured from the reference animation (19 bands, 4.4 seconds a loop at 30 frames a
   second). A level is a place on the palette, 0 its dark end and 1 its light end. */
import { toHex } from "./color.ts";
import { pageBox, svgUrl } from "./css.ts";
import { sampleLCH, sampleSrgb } from "./curve.ts";
import { clamp, clamp01 } from "./math.ts";
import type { Palette } from "./palette.ts";
import type { ParamReader, Size } from "./view.ts";

/** The `style` that asks a palette's SVG for this animation. */
export const BANDS_STYLE = "bands";
export const BANDS_MIN = 3;
export const BANDS_MAX = 41;
export const DEFAULT_BANDS = 19;
export const DURATION_MIN = 0.5;
export const DURATION_MAX = 60;
export const DEFAULT_DURATION = 4.4;
/** The reference's shape. The picture stretches to any box. */
export const BANDS_SIZE: Size = { width: 400, height: 500 };

export interface BandsView {
  /** Odd, so one band stands in the center. */
  bands: number;
  /** A loop's seconds. */
  duration: number;
  /** `out` spreads the bloom from the center, `in` gathers it to the center. */
  dir: "out" | "in";
  /** true runs the palette from its light end, false from its first color; null puts its darker end in the dim parts. */
  reverse: boolean | null;
}

export const isBands = (params: ParamReader) => params.get("style") === BANDS_STYLE;

/** The animation an address asks for: a value that is missing or no number takes the default, a number out of bounds
    comes into them, and an even count of bands takes one more. */
export function parseBands(params: ParamReader): BandsView {
  const count = params.get("bands");
  const seconds = params.get("duration");
  const reverse = params.get("reverse");
  const bands =
    count && /^\d+$/.test(count) ? clamp(Number(count), BANDS_MIN, BANDS_MAX) : DEFAULT_BANDS;
  return {
    bands: bands % 2 ? bands : bands + 1,
    duration:
      seconds && /^\d+(\.\d+)?$/.test(seconds)
        ? clamp(Math.round(Number(seconds) * 100) / 100, DURATION_MIN, DURATION_MAX)
        : DEFAULT_DURATION,
    dir: params.get("dir") === "in" ? "in" : "out",
    reverse: reverse === "1" ? true : reverse === "0" ? false : null
  };
}

/** The animation's query: `style=bands`, then what differs from the defaults in one order, then `extra`. */
export function bandsSearch(view: BandsView, extra: readonly string[] = []): string {
  const parts = [
    `style=${BANDS_STYLE}`,
    view.bands !== DEFAULT_BANDS && `bands=${view.bands}`,
    view.duration !== DEFAULT_DURATION && `duration=${view.duration}`,
    view.dir === "in" && "dir=in",
    view.reverse !== null && `reverse=${view.reverse ? 1 : 0}`,
    ...extra
  ].filter(Boolean);
  return `?${parts.join("&")}`;
}

/* The pulse, as shares of the loop: an eased rise, a short hold at the top, a fall that mirrors the rise, then dim to
   the loop's end. Since the fall mirrors the rise, the file writes only the half from the middle of the dim to the
   middle of the hold, and CSS plays it forward and back. */
const RISE = 0.34;
const HOLD = 0.05;
const TOP = RISE + HOLD / 2;
const ease = (x: number) => x * x * (3 - 2 * x);
/** The bloom's height at a phase of the loop, the rise starting at 0. */
function pulse(phase: number): number {
  const off = Math.abs(phase - TOP - Math.round(phase - TOP));
  return 1 - ease(clamp01((off - HOLD / 2) / RISE));
}
/** How far behind the center band the edge band runs, as a share of the loop; the bands between keep even steps. */
const SPREAD = 0.287;
/** The phase of the frame the stops hold and the animation starts on: the center near its peak, the edge about to
    rise. */
const STILL = 0.29;

/* A band's ring, from its middle: its inner edge 0.097 of the height out at the center band and 0.8 of the height
   farther at the edge band, on a straight line between. Every stop stands at a multiple of that distance. */
const RING_CENTER = 0.097;
const RING_EDGE = 0.8;
/** The bloom's ten stops, a tenth of the ring's distance apart from the middle out: each one's level at the bloom's
    height, and its level at rest as a share of its band's rest level. */
const BLOOM_STEP = 0.1;
const BLOOM_PEAK = [1, 0.863, 0.658, 0.557, 0.461, 0.347, 0.298, 0.251, 0.179, 0.08];
const BLOOM_REST = [1, 0.893, 0.783, 0.673, 0.567, 0.463, 0.367, 0.273, 0.193, 0.102];
/** The ring is dark from its distance to 1.4 times it. The glow past it pulses faintly: where, its level at rest and
    at the peak. Past its last stop the glow holds. */
const RING = [1, 1.4];
const GLOW = [
  [2, 0.049, 0.096],
  [2.8, 0.101, 0.225],
  [3.8, 0.117, 0.26]
] as const;
const EXTENT = 3.8;
/** A band's rest level by its distance from the center: the center band goes dark between blooms and the two beside
    it nearly so, at 19 bands. Another count takes the level nearest its distance, so every count shares these four
    sets of keyframes. */
const REST = [
  [0, 0],
  [1 / 9, 0.169],
  [2 / 9, 0.221],
  [1 / 3, 0.26]
] as const;
function restLevel(u: number): number {
  const along = (i: number) => {
    const [u0, r0] = REST[i - 1];
    const [u1, r1] = REST[i];
    return r0 + ((r1 - r0) * (u - u0)) / (u1 - u0);
  };
  const i = REST.findIndex(([at]) => u <= at);
  const level = i < 0 ? REST[REST.length - 1][1] : i === 0 ? 0 : along(i);
  return REST.reduce((near, [, r]) => (Math.abs(r - level) < Math.abs(near - level) ? r : near), 0);
}

interface Stop {
  /** from the band's middle, in the ring's distances */
  at: number;
  rest: number;
  peak: number;
}
/** A band's stops from its middle out, at its rest level: the bloom's ten, the ring's two edges, the glow's three. */
const bandStops = (rest: number): Stop[] => [
  ...BLOOM_PEAK.map((peak, k) => ({ at: k * BLOOM_STEP, rest: rest * BLOOM_REST[k], peak })),
  ...RING.map(at => ({ at, rest: 0, peak: 0 })),
  ...GLOW.map(([at, r, p]) => ({ at, rest: r, peak: p }))
];
/** The stops every file keeps: the middle, the ring's edges and the last. */
const FIXED = new Set([
  0,
  BLOOM_PEAK.length,
  BLOOM_PEAK.length + 1,
  BLOOM_PEAK.length + RING.length + GLOW.length - 1
]);

/** The palette's color at a level, written into `out` at `at`: read from its curve at 257 places once, and blended
    between them. The darker end is the dim one unless `reverse` says. */
function paletteLevels(P: Palette, reverse: boolean | null) {
  const flip = reverse ?? sampleLCH(P, 0)[0] > sampleLCH(P, 1)[0];
  const PLACES = 256;
  const table = new Float64Array(3 * (PLACES + 1));
  for (let i = 0; i <= PLACES; i++)
    table.set(sampleSrgb(P, flip ? 1 - i / PLACES : i / PLACES), 3 * i);
  return (level: number, out: Float64Array, at: number) => {
    const x = clamp01(level) * PLACES;
    const i = Math.min(PLACES - 1, Math.floor(x));
    const f = x - i;
    for (let c = 0; c < 3; c++) {
      out[at + c] = table[3 * i + c] + (table[3 * i + 3 + c] - table[3 * i + c]) * f;
    }
  };
}

/* A stop's colors at whole percents of the half the file writes, the dim's middle to the hold's. NEAR is how far the
   file's colors may stray from them: a stop that the straight blend between its neighbours draws within NEAR of, at
   every percent and in every band, is left out; two stops whose colors keep within NEAR share keyframes; and the
   keyframes leave out each run of percents that the straight blend between the run's ends draws within NEAR of. */
const NEAR = 6 / 255;
const STEPS = 100;
const PERCENTS = Array.from({ length: STEPS + 1 }, (_, i) => TOP - 0.5 + i / (2 * STEPS));
const hexAt = (colors: Float64Array, i: number) =>
  toHex([colors[3 * i], colors[3 * i + 1], colors[3 * i + 2]]);
const alike = (a: Float64Array, b: Float64Array) => a.every((v, k) => Math.abs(v - b[k]) <= NEAR);

function keyframes(colors: Float64Array): string {
  const kept = [0];
  for (let i = 0; i < STEPS; ) {
    /* each channel's slopes from percent i that pass within NEAR of every percent after it so far */
    const lo = [-Infinity, -Infinity, -Infinity];
    const hi = [Infinity, Infinity, Infinity];
    let j = i + 1;
    for (; j < STEPS; j++) {
      let fits = true;
      for (let c = 0; c < 3; c++) {
        const from = colors[3 * i + c];
        lo[c] = Math.max(lo[c], (colors[3 * j + c] - from - NEAR) / (j - i));
        hi[c] = Math.min(hi[c], (colors[3 * j + c] - from + NEAR) / (j - i));
        const next = (colors[3 * (j + 1) + c] - from) / (j + 1 - i);
        if (next < lo[c] || next > hi[c]) fits = false;
      }
      if (!fits) break;
    }
    kept.push(j);
    i = j;
  }
  /* a color held over a run is written once, at both its percents */
  let css = "";
  for (let k = 0; k < kept.length; k++) {
    const hex = hexAt(colors, kept[k]);
    const held = k + 1 < kept.length && hexAt(colors, kept[k + 1]) === hex;
    css += held ? `${kept[k]}%,${kept[++k]}%` : `${kept[k]}%`;
    css += `{stop-color:${hex}}`;
  }
  return css;
}

/** The stops a file writes, by their place in bandStops: of each run between stops it keeps, the ones whose colors
    the straight blend across the run draws within NEAR of in every band are left out. */
function keptStops(at: readonly number[], bands: readonly (readonly Float64Array[])[]): number[] {
  const straight = (i: number, j: number) =>
    bands.every(colors => {
      for (let m = i + 1; m < j; m++) {
        const f = (at[m] - at[i]) / (at[j] - at[i]);
        const [a, b, c] = [colors[i], colors[j], colors[m]];
        for (let k = 0; k < c.length; k++)
          if (Math.abs(a[k] + (b[k] - a[k]) * f - c[k]) > NEAR) return false;
      }
      return true;
    });
  const kept = [0];
  for (let i = 0; i < at.length - 1; ) {
    let j = i + 1;
    while (j < at.length - 1 && !FIXED.has(j) && straight(i, j + 1)) j++;
    kept.push(j);
    i = j;
  }
  return kept;
}

/** A number as the file writes it: at most `digits` decimals, no trailing zeros, no zero before the point. */
const num = (v: number, digits = 3) => String(Number(v.toFixed(digits))).replace(/^(-?)0\./, "$1.");

/* FNV-1a, in base 36 after a letter: the mark that keeps one file's names apart from another's in one page. */
function mark(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return `g${((h >>> 0) % 36 ** 4).toString(36).padStart(4, "0")}`;
}

/** The animated SVG of a palette at a size, credited in a comment to `credit`, the palette's address. It draws one
    quarter, the bands right of the center and below the middle, and mirrors it into the other three. */
export function bandsSvg(P: Palette, view: BandsView, size: Size, credit: string): string {
  const { width: W, height: H } = size;
  const color = paletteLevels(P, view.reverse);
  const id = mark(JSON.stringify([P.anchors, view, W, H]));
  const side = (view.bands - 1) / 2;
  const band = W / view.bands;

  /* every stop's colors at every percent, once for each pair of levels */
  const walks = new Map<string, Float64Array>();
  const colorsOf = (s: Stop) => {
    const pair = `${s.rest} ${s.peak}`;
    let colors = walks.get(pair);
    if (!colors) {
      colors = new Float64Array(3 * (STEPS + 1));
      for (let i = 0; i <= STEPS; i++)
        color(s.rest + (s.peak - s.rest) * pulse(PERCENTS[i]), colors, 3 * i);
      walks.set(pair, colors);
    }
    return colors;
  };
  const rests = Array.from({ length: side + 1 }, (_, b) => restLevel(b / side));
  const groups = [...new Set(rests)].map(bandStops);
  const kept = keptStops(
    groups[0].map(s => s.at),
    groups.map(stops => stops.map(colorsOf))
  );

  /* one set of keyframes to each pair of levels, shared by every pair whose colors keep within NEAR of its own */
  const sets: { colors: Float64Array; name: string; frames: string }[] = [];
  const names = new Map<string, string>();
  const named = (s: Stop) => {
    const pair = `${s.rest} ${s.peak}`;
    let name = names.get(pair);
    if (!name) {
      const colors = colorsOf(s);
      let set = sets.find(o => alike(o.colors, colors));
      if (!set) {
        set = { colors, name: `k${sets.length}`, frames: keyframes(colors) };
        sets.push(set);
      }
      name = set.name;
      names.set(pair, name);
    }
    return name;
  };
  const still = new Float64Array(3);
  const delays: string[] = [];
  const gradients: string[] = [];
  const paths: string[] = [];
  /* each band reaches a quarter band under the next band out, and the quarter reaches past the lines its copies mirror
     on, so no seam shows between bands or copies at any scale. Above the middle each gradient runs on to its first
     stop past the middle, mirrored, so the copies agree where they overlap. */
  const under = band / 4;
  const top = num(H / 2 - BLOOM_STEP * RING_CENTER * H);
  for (let b = 0; b <= side; b++) {
    const u = b / side;
    const ring = (RING_CENTER + RING_EDGE * u) * H;
    const lag = SPREAD * (view.dir === "in" ? 1 - u : u);
    const phase = STILL - lag;
    const height = pulse(phase);
    const into = phase - (TOP - 0.5) - Math.floor(phase - (TOP - 0.5));
    if (into > 0) delays.push(`#${id}${b} stop{animation-delay:-${num(into * view.duration)}s}`);
    const own = bandStops(rests[b]);
    const stops = kept.map(k => own[k]);
    const first = -stops[1].at;
    const length = EXTENT - first;
    const written = [{ ...stops[1], at: first }, ...stops].map(s => {
      color(s.rest + (s.peak - s.rest) * height, still, 0);
      const moves = s.peak !== s.rest ? ` class="${named(s)}"` : "";
      return `<stop offset="${num((s.at - first) / length, 4)}" stop-color="${hexAt(still, 0)}"${moves}/>`;
    });
    gradients.push(
      `<linearGradient id="${id}${b}" gradientUnits="userSpaceOnUse" x2="0" y1="${num(H / 2 + first * ring)}" y2="${num(H / 2 + EXTENT * ring)}">${written.join("")}</linearGradient>`
    );
    const x0 = num(b ? W / 2 + (b - 0.5) * band : W / 2 - under);
    const x1 = num(W / 2 + (b + 0.5) * band + under);
    paths.push(`<path fill="url(#${id}${b})" d="M${x0} ${top}H${x1}V${H}H${x0}z"/>`);
  }
  const motion = [
    `.${id} stop{animation-duration:${num(view.duration / 2)}s;animation-timing-function:linear;animation-iteration-count:infinite;animation-direction:alternate}`,
    ...sets.map(s => `.${id} .${s.name}{animation-name:${id}${s.name}}`),
    ...delays
  ].join("");
  const frames = sets.map(s => `@keyframes ${id}${s.name}{${s.frames}}`).join("");
  const comment = `<!-- ${credit.replace(/--/g, "-%2D")} -->`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="${id}">\n${comment}\n<style>${frames}@media (prefers-reduced-motion:no-preference){${motion}}</style>\n<defs>${gradients.join("")}</defs>\n<g id="${id}h"><g id="${id}q">${paths.join("")}</g><use href="#${id}q" transform="matrix(-1 0 0 1 ${W} 0)"/></g><use href="#${id}h" transform="matrix(1 0 0 -1 0 ${H})"/>\n</svg>`;
}

/** The frame the file's stops hold, as pixels at a size, three bytes each and row after row, with every band's stops in
    full: the file where no animation plays, such as a link's preview. */
export function bandsStill(P: Palette, view: BandsView, size: Size): Uint8Array<ArrayBuffer> {
  const { width: W, height: H } = size;
  const color = paletteLevels(P, view.reverse);
  const side = (view.bands - 1) / 2;
  const rgb = new Float64Array(3);
  /* each band's column of pixels, read down its gradient from the middle out and the same above it */
  const columns = Array.from({ length: side + 1 }, (_, b) => {
    const u = b / side;
    const ring = (RING_CENTER + RING_EDGE * u) * H;
    const height = pulse(STILL - SPREAD * (view.dir === "in" ? 1 - u : u));
    const stops = bandStops(restLevel(u)).map(s => {
      color(s.rest + (s.peak - s.rest) * height, rgb, 0);
      return { at: s.at * ring, rgb: [rgb[0], rgb[1], rgb[2]] };
    });
    const column = new Uint8Array(3 * H);
    for (let y = 0; y < H; y++) {
      const d = Math.abs(y + 0.5 - H / 2);
      let k = 0;
      while (k < stops.length - 2 && stops[k + 1].at < d) k++;
      const [a, z] = [stops[k], stops[k + 1]];
      const f = clamp01((d - a.at) / (z.at - a.at));
      for (let c = 0; c < 3; c++) {
        column[3 * y + c] = Math.round(255 * clamp01(a.rgb[c] + (z.rgb[c] - a.rgb[c]) * f));
      }
    }
    return column;
  });
  const band = Array.from({ length: W }, (_, x) =>
    Math.abs(Math.min(view.bands - 1, Math.floor(((x + 0.5) * view.bands) / W)) - side)
  );
  const out = new Uint8Array(3 * W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const column = columns[band[x]];
      const at = 3 * (y * W + x);
      out[at] = column[3 * y];
      out[at + 1] = column[3 * y + 1];
      out[at + 2] = column[3 * y + 2];
    }
  }
  return out;
}

/** The animated SVG as CSS that works alone: the page's background plays it, the SVG carried inside as a data URI,
    over the palette's dim end until it is drawn. The box is the size asked for,
    else at least the window's height, and the SVG stretches to it. */
export function bandsCss(P: Palette, view: BandsView, size: Size | null, credit: string): string {
  const svg = bandsSvg(P, view, size ?? BANDS_SIZE, credit);
  const dim = new Float64Array(3);
  paletteLevels(P, view.reverse)(0, dim, 0);
  return `/* ${credit} */\nhtml {\n  ${pageBox(size)}\n  background: ${hexAt(dim, 0)} ${svgUrl(svg)} center / 100% 100% no-repeat;\n}\n`;
}
