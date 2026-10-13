/* A picture's colors, read from its pixels: at most five hex codes in the order that blends truest, each with the spot
   of the picture it was read from. Pure, so a search by image costs what a search by hex codes costs and the picture
   never leaves the browser that holds it. */
import { linOklab, srgbToOklab, type Triple, toHex, toLinear } from "@grabient/engine/color.ts";
import { sampleSrgb } from "@grabient/engine/curve.ts";
import { invented, paletteOf } from "./colors.ts";

/** the long side a picture is read at: a small accent keeps a few pixels, and the reading takes milliseconds */
export const READ_SIZE = 200;
/** the most colors a picture gives: what a search by colors reads well */
export const IMAGE_COLORS = 5;
/** lightness counts a little less than hue and chroma, so a shadow joins its color before two hues join */
const L_WEIGHT = 0.8;
const GROUPS = 24;
const ROUNDS = 12;
/** a base color covers this share of the picture; an accent's hue, this */
const BASE_SHARE = 0.003;
const ACCENT_SHARE = 0.002;
/** picked colors stand this far apart in OKLab */
const APART = 0.08;
/** an accent is this colorful, and far from the rest or this many times as colorful as the picture */
const ACCENT_CHROMA = 0.09;
const ACCENT_FAR = 0.2;
const ACCENT_VIVID = 2.5;
/** what a fall in lightness along the palette costs, beside blending through colors the picture lacks */
const FALL = 0.12;
/** in 8-bit sRGB, a color this near the line between two much larger ones is their soft edge */
const ON_LINE = 10;

/** A color a picture was read as, and where it is, across and down from 0 to 1. */
export interface Sample {
  hex: string;
  x: number;
  y: number;
}

/** RGBA pixels of a picture. */
export interface Pixels {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

interface Group {
  hex: string;
  rgb: Triple;
  lab: Triple;
  share: number;
  chroma: number;
  hue: number;
  contrast: number;
  score: number;
  vivid: { hex: string; lab: Triple };
  accent?: boolean;
}

const lin = (v: number) => toLinear(v / 255);
const dist = (p: Triple, q: Triple) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};
/* a fixed seed taken from the picture: the same picture always gives the same colors */
function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The index a uniform draw lands on when each of `n` weighs as given, the last when the draw runs past them. */
function drawn(
  rand: () => number,
  n: number,
  weight: (i: number) => number,
  total: number
): number {
  let left = rand() * total;
  let i = 0;
  while (i < n - 1) {
    left -= weight(i);
    if (left <= 0) break;
    i++;
  }
  return i;
}

/** The colors a picture reads as, at most five, in the order that blends truest: four that cover it, then up to two
    accents (a small, vivid hue unlike the rest), lightness rising, each with its spot. None for a picture with no
    opaque pixel. */
export function imageSamples(rgba: ArrayLike<number>, width: number, height: number): Sample[] {
  // bins of 5 bits a channel, each keeping the exact sum of its colors, so a flat color reads back as its own hex
  const binOf = new Int32Array(32768).fill(-1);
  const sum: number[] = [];
  const pixelBin = new Int32Array(width * height).fill(-1);
  let pixels = 0;
  for (let p = 0; p < width * height * 4; p += 4) {
    if (rgba[p + 3] < 128) continue;
    pixels++;
    const key = ((rgba[p] >> 3) << 10) | ((rgba[p + 1] >> 3) << 5) | (rgba[p + 2] >> 3);
    let b = binOf[key];
    if (b < 0) {
      b = binOf[key] = sum.length / 4;
      sum.push(0, 0, 0, 0);
    }
    pixelBin[p / 4] = b;
    sum[b * 4] += rgba[p];
    sum[b * 4 + 1] += rgba[p + 1];
    sum[b * 4 + 2] += rgba[p + 2];
    sum[b * 4 + 3]++;
  }
  const n = sum.length / 4;
  if (!n) return [];
  const count = new Float64Array(n);
  const lab = new Float32Array(n * 3);
  const chroma = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    count[i] = sum[i * 4 + 3];
    const c = count[i];
    const o = linOklab(lin(sum[i * 4] / c), lin(sum[i * 4 + 1] / c), lin(sum[i * 4 + 2] / c));
    lab[i * 3] = o[0] * L_WEIGHT;
    lab[i * 3 + 1] = o[1];
    lab[i * 3 + 2] = o[2];
    chroma[i] = Math.hypot(o[1], o[2]);
  }
  const d2 = (i: number, at: Float32Array, k: number) =>
    (lab[i * 3] - at[k * 3]) ** 2 +
    (lab[i * 3 + 1] - at[k * 3 + 1]) ** 2 +
    (lab[i * 3 + 2] - at[k * 3 + 2]) ** 2;

  // k-means++, drawn by distance and by count; a vivid bin pulls harder, so a small accent gets a group of its own
  const k = Math.min(GROUPS, n);
  const rand = seeded(n * 2654435761 + pixels);
  const centers = new Float32Array(k * 3);
  const near = new Float64Array(n).fill(Infinity);
  const pull = Float64Array.from(count, (c, i) => c * (1 + 6 * Math.min(chroma[i], 0.25)) ** 2);
  const first = drawn(
    rand,
    n,
    i => pull[i],
    pull.reduce((s, v) => s + v, 0)
  );
  centers.set(lab.subarray(first * 3, first * 3 + 3), 0);
  for (let c = 1; c < k; c++) {
    let all = 0;
    for (let i = 0; i < n; i++) {
      near[i] = Math.min(near[i], d2(i, centers, c - 1));
      all += near[i] * pull[i];
    }
    const j = drawn(rand, n, i => near[i] * pull[i], all);
    centers.set(lab.subarray(j * 3, j * 3 + 3), c * 3);
  }
  const owner = new Uint8Array(n);
  for (let round = 0; round < ROUNDS; round++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = d2(i, centers, c);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (owner[i] !== best) {
        owner[i] = best;
        moved++;
      }
    }
    const acc = new Float64Array(k * 4);
    for (let i = 0; i < n; i++) {
      const c = owner[i] * 4;
      acc[c] += lab[i * 3] * count[i];
      acc[c + 1] += lab[i * 3 + 1] * count[i];
      acc[c + 2] += lab[i * 3 + 2] * count[i];
      acc[c + 3] += count[i];
    }
    for (let c = 0; c < k; c++) {
      if (acc[c * 4 + 3])
        for (let j = 0; j < 3; j++) centers[c * 3 + j] = acc[c * 4 + j] / acc[c * 4 + 3];
    }
    if (round && !moved) break;
  }

  /* each group as a real color: its largest bin when that holds a quarter of it (flat artwork), else the bin nearest its
     middle; and its vivid core, the mean of its most colorful quarter, which is what an eyedropper on the sun picks */
  const tally = Array.from({ length: k }, () => ({
    w: 0,
    near: -1,
    nearD: Infinity,
    big: -1,
    core: [0, 0, 0, 0]
  }));
  for (let i = 0; i < n; i++) {
    const g = tally[owner[i]];
    const d = d2(i, centers, owner[i]);
    g.w += count[i];
    if (d < g.nearD) {
      g.nearD = d;
      g.near = i;
    }
    if (g.big < 0 || count[i] > count[g.big]) g.big = i;
  }
  for (const i of Array.from({ length: n }, (_, i) => i).sort((a, b) => chroma[b] - chroma[a])) {
    const g = tally[owner[i]];
    const q = g.core;
    const take = Math.min(count[i], g.w / 4 - q[3]);
    if (take <= 0) continue;
    for (let j = 0; j < 3; j++) q[j] += (sum[i * 4 + j] / count[i]) * take;
    q[3] += take;
  }
  const rgbOf = (i: number): Triple => [
    sum[i * 4] / count[i] / 255,
    sum[i * 4 + 1] / count[i] / 255,
    sum[i * 4 + 2] / count[i] / 255
  ];
  const labOfRgb = (rgb: Triple): Triple =>
    linOklab(lin(rgb[0] * 255), lin(rgb[1] * 255), lin(rgb[2] * 255));
  const groups: Group[] = tally
    .filter(g => g.w > 0)
    .map(g => {
      const flat = count[g.big] >= g.w / 4;
      const i = flat ? g.big : g.near;
      const own = labOfRgb(rgbOf(i));
      const core: Triple = flat
        ? rgbOf(i)
        : [g.core[0] / g.core[3] / 255, g.core[1] / g.core[3] / 255, g.core[2] / g.core[3] / 255];
      return {
        hex: toHex(rgbOf(i)),
        rgb: rgbOf(i).map(v => v * 255) as Triple,
        lab: own,
        share: g.w / pixels,
        chroma: Math.hypot(own[1], own[2]),
        hue: ((Math.atan2(own[2], own[1]) * 180) / Math.PI + 360) % 360,
        contrast: 0,
        score: 0,
        vivid: { hex: toHex(core), lab: labOfRgb(core) }
      };
    })
    .sort((p, q) => q.share - p.share);
  // a group far from most of the picture stands out however small it is
  for (const g of groups) {
    g.contrast = groups.reduce((s, q) => s + q.share * dist(g.lab, q.lab), 0);
    g.score = Math.sqrt(g.share) * (1 + 6 * Math.min(g.chroma, 0.25));
  }

  /* the soft edge between two larger colors (antialiasing, an outline the scaling blurred) lies on the line between them:
     it is their blend, or a logo of two colors would come back with three more */
  const blend = (g: Group) =>
    groups.some(
      p =>
        p.share > g.share * 4 &&
        groups.some(
          q => q !== p && q.share > g.share * 4 && toSegment(g.rgb, p.rgb, q.rgb) < ON_LINE
        )
    );
  const picked: Group[] = [];
  const pool = groups.filter(g => g.share >= BASE_SHARE && !blend(g));
  const apartFrom = (g: { lab: Triple }) =>
    picked.length ? Math.min(...picked.map(p => dist(p.lab, g.lab))) : 1;
  // the base, by how much it covers and how vivid it is, each clearly apart from the ones before it
  const pickBase = (upTo: number) => {
    while (picked.length < upTo) {
      let best: Group | null = null;
      let bestV = 0;
      for (const g of pool) {
        const apart = apartFrom(g);
        const v = g.score * Math.min(1, apart / 0.2);
        if (apart >= APART && !picked.some(p => p.hex === g.hex) && v > bestV) {
          bestV = v;
          best = g;
        }
      }
      if (!best) return;
      picked.push(best);
    }
  };
  pickBase(IMAGE_COLORS - 1);
  // accents: a small object splits over several groups, so the groups of one hue count together, shown by the leading one
  const meanChroma = groups.reduce((s, g) => s + g.share * g.chroma, 0);
  const hues: { lead: Group; share: number }[] = [];
  for (const g of groups
    .filter(g => g.chroma >= ACCENT_CHROMA && !picked.includes(g))
    .sort((p, q) => q.share * q.chroma - p.share * p.chroma)) {
    const home = hues.find(h => hueGap(h.lead.hue, g.hue) <= 25);
    if (home) home.share += g.share;
    else hues.push({ lead: g, share: g.share });
  }
  const accents = hues
    .filter(
      h =>
        h.share >= ACCENT_SHARE &&
        (h.lead.contrast >= ACCENT_FAR || h.lead.chroma >= ACCENT_VIVID * meanChroma) &&
        !blend(h.lead)
    )
    .sort(
      (p, q) =>
        q.lead.contrast * Math.sqrt(q.share) * q.lead.chroma -
        p.lead.contrast * Math.sqrt(p.share) * p.lead.chroma
    );
  for (const { lead } of accents) {
    if (picked.length >= IMAGE_COLORS || picked.filter(p => p.accent).length >= 2) break;
    const shown = { ...lead, hex: lead.vivid.hex, lab: lead.vivid.lab, accent: true };
    if (apartFrom(shown) >= APART) picked.push(shown);
  }
  // a picture with no accent gives a fifth base color
  pickBase(IMAGE_COLORS);

  // each pixel as its bin's color, in OKLab: a bin is a few levels wide, near enough to find where a color is
  const pixelLab = new Float32Array(width * height * 3).fill(Number.NaN);
  for (let i = 0; i < pixelBin.length; i++) {
    if (pixelBin[i] < 0) continue;
    const b = pixelBin[i] * 3;
    pixelLab[i * 3] = lab[b] / L_WEIGHT;
    pixelLab[i * 3 + 1] = lab[b + 1];
    pixelLab[i * 3 + 2] = lab[b + 2];
  }
  const order = truest(
    picked,
    pool.map(g => g.lab)
  );
  const spots = spotsOf(
    pixelLab,
    width,
    height,
    order.map(g => g.lab)
  );
  return order.map((g, i) => ({ hex: g.hex, ...spots[i] }));
}

/** Where each color is: the pixel nearest it inside a patch of its own color, with how far it differs from the pixels
    beside it counting too, and of the pixels as good, the one nearest their middle. A point there sits in the color,
    never on its edge, and moves the least when the color is read again from it. */
function spotsOf(lab: Float32Array, width: number, height: number, colors: readonly Triple[]) {
  const n = width * height;
  const rough = new Float32Array(n).fill(Infinity);
  const apart = (i: number, j: number) =>
    Math.hypot(
      lab[i * 3] - lab[j * 3],
      lab[i * 3 + 1] - lab[j * 3 + 1],
      lab[i * 3 + 2] - lab[j * 3 + 2]
    );
  // a point starts a little in from the picture's edge, where it is seen whole
  const mx = Math.max(1, Math.round(width * 0.03));
  const my = Math.max(1, Math.round(height * 0.03));
  for (let y = my; y < height - my; y++) {
    for (let x = mx; x < width - mx; x++) {
      const i = y * width + x;
      if (Number.isNaN(lab[i * 3])) continue;
      // a transparent neighbor is as far as a color gets
      rough[i] =
        [i - 1, i + 1, i - width, i + width].reduce(
          (s, j) => s + (Number.isNaN(lab[j * 3]) ? 1 : apart(i, j)),
          0
        ) / 4;
    }
  }
  return colors.map(color => {
    const score = new Float32Array(n);
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      score[i] =
        rough[i] === Infinity
          ? Infinity
          : Math.hypot(
              lab[i * 3] - color[0],
              lab[i * 3 + 1] - color[1],
              lab[i * 3 + 2] - color[2]
            ) + rough[i];
      if (score[i] < best) best = score[i];
    }
    if (best === Infinity) return { x: 0.5, y: 0.5 };
    let sx = 0;
    let sy = 0;
    let found = 0;
    for (let i = 0; i < n; i++) {
      if (score[i] > best + 0.01) continue;
      sx += i % width;
      sy += Math.floor(i / width);
      found++;
    }
    let at = 0;
    let nearest = Infinity;
    for (let i = 0; i < n; i++) {
      if (score[i] > best + 0.01) continue;
      const d = ((i % width) - sx / found) ** 2 + (Math.floor(i / width) - sy / found) ** 2;
      if (d < nearest) {
        nearest = d;
        at = i;
      }
    }
    return { x: ((at % width) + 0.5) / width, y: (Math.floor(at / width) + 0.5) / height };
  });
}

/** The color at a spot of a picture: the mean of the 3x3 pixels around it, so one noisy pixel never decides it. */
export function colorAt(pixels: Pixels, x: number, y: number): string {
  const cx = Math.min(pixels.width - 1, Math.max(0, Math.floor(x * pixels.width)));
  const cy = Math.min(pixels.height - 1, Math.max(0, Math.floor(y * pixels.height)));
  const total = [0, 0, 0];
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const px = cx + dx;
      const py = cy + dy;
      if (px < 0 || py < 0 || px >= pixels.width || py >= pixels.height) continue;
      const p = (py * pixels.width + px) * 4;
      if (pixels.data[p + 3] < 128) continue;
      total[0] += pixels.data[p];
      total[1] += pixels.data[p + 1];
      total[2] += pixels.data[p + 2];
      n++;
    }
  }
  return n ? toHex([total[0] / n / 255, total[1] / n / 255, total[2] / n / 255]) : "#000000";
}

/** The order whose blend stays nearest the picture's own colors, darker end first: every order of up to five. */
function truest(colors: readonly Group[], image: readonly Triple[]): Group[] {
  if (colors.length < 3) return [...colors].sort((p, q) => p.lab[0] - q.lab[0]);
  let best = [...colors];
  let bestCost = Infinity;
  const walk = (path: Group[], rest: Group[]) => {
    if (!rest.length) {
      // a path and its reverse blend the same colors: each is weighed once
      if (path[0].lab[0] > path[path.length - 1].lab[0]) return;
      let fall = 0;
      for (let i = 1; i < path.length; i++)
        fall += Math.max(0, path[i - 1].lab[0] - path[i].lab[0]);
      // a turn only adds to the cost, so an order already dearer than the best is not measured for one
      const hexes = path.map(g => g.hex);
      const base = stray(hexes, image) + FALL * fall;
      const cost = base < bestCost ? base + turn(hexes) : Infinity;
      if (cost < bestCost) {
        bestCost = cost;
        best = path;
      }
      return;
    }
    for (let i = 0; i < rest.length; i++) {
      walk([...path, rest[i]], [...rest.slice(0, i), ...rest.slice(i + 1)]);
    }
  };
  walk([], [...colors]);
  return best;
}

/** how far a blend through these colors turns through a hue they lack, past a little */
function turn(hexes: string[]): number {
  const palette = paletteOf(hexes);
  return palette ? Math.max(0, invented(palette, hexes) - 0.03) : Infinity;
}

/** how far a blend through these colors strays from the picture: the mean distance, along its curve, to the nearest
    color the picture has */
function stray(hexes: string[], image: readonly Triple[]): number {
  const palette = paletteOf(hexes);
  if (!palette) return Infinity;
  let total = 0;
  for (let i = 0; i < 24; i++) {
    const x = srgbToOklab(...sampleSrgb(palette, i / 23));
    total += Math.min(...image.map(c => dist(x, c)));
  }
  return total / 24;
}

/** the distance from a point to the line between two others, where it falls between them; Infinity at or past an end */
function toSegment(x: Triple, p: Triple, q: Triple): number {
  const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
  const len = d[0] ** 2 + d[1] ** 2 + d[2] ** 2;
  const t = len ? ((x[0] - p[0]) * d[0] + (x[1] - p[1]) * d[1] + (x[2] - p[2]) * d[2]) / len : 0;
  return t > 0.05 && t < 0.95
    ? Math.hypot(x[0] - p[0] - t * d[0], x[1] - p[1] - t * d[1], x[2] - p[2] - t * d[2])
    : Infinity;
}
