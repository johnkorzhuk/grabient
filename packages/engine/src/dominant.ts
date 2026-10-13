/* The colors a set of palettes blooms with, one to five: every palette read along its curve, the readings grouped by
   how alike they look, and each group large enough giving the reading nearest its middle, so every color shown is a
   color in the set. Shades of one hue merge sooner than two hues do, and pale colors of clearly different hues stay
   apart however near they sit. The colors come in the order that moves least from one to the next, darker end first. */
import { decodePalette } from "./codec.ts";
import { srgbToOklab, type Triple, toHex } from "./color.ts";
import { sampleSrgb } from "./curve.ts";

export const DOMINANT_MAX = 5;
/** The most palettes read: a collection's first ones, the ones its card shows. */
export const DOMINANT_PALETTES = 12;
const READINGS = 9;
/** lightness counts for less than hue and chroma, so shades of a hue group before two hues do */
const L_WEIGHT = 0.55;
/** nearer than this, two groups read as one color */
const ALIKE = 0.095;
/** a group needs this share of the readings to count */
const SHARE = 0.06;
/** a group this colorful and this light has a hue a reader sees; in the dark or near gray, hues run together */
const HUE_CHROMA = 0.035;
const HUE_LIGHT = 0.4;
/** two such hues this far apart are two colors, however near their groups sit (pale pink and pale blue) */
const HUE_APART = 35;
/** two colors nearer than this look like one: the smaller group's is left out */
const TWIN = 0.05;
const GROUPS = 8;
const ROUNDS = 6;

interface Reading {
  at: Triple;
  lab: Triple;
  rgb: Triple;
}
const d2 = (p: readonly number[], q: readonly number[]) =>
  (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
function nearest(at: Triple, centers: readonly Triple[]) {
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k < centers.length; k++) {
    const d = d2(at, centers[k]);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}
function middles(
  readings: readonly Reading[],
  owner: ArrayLike<number>,
  count: number,
  previous: readonly Triple[]
) {
  const sum = Array.from({ length: count }, () => [0, 0, 0, 0]);
  readings.forEach((r, i) => {
    const s = sum[owner[i]];
    s[0] += r.at[0];
    s[1] += r.at[1];
    s[2] += r.at[2];
    s[3]++;
  });
  return sum.map((s, k): Triple => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : previous[k]));
}

/** One to five hex colors for the palettes these seeds name; none when no seed decodes. */
export function dominantColors(seeds: readonly string[], max = DOMINANT_MAX): string[] {
  const readings: Reading[] = [];
  for (const seed of seeds.slice(0, DOMINANT_PALETTES)) {
    const P = decodePalette(seed);
    if (!P) continue;
    for (let i = 0; i < READINGS; i++) {
      const rgb = sampleSrgb(P, i / (READINGS - 1));
      const lab = srgbToOklab(rgb[0], rgb[1], rgb[2]);
      readings.push({ at: [lab[0] * L_WEIGHT, lab[1], lab[2]], lab, rgb });
    }
  }
  const n = readings.length;
  if (!n) return [];
  /* start from the reading nearest the middle of them all, then the reading farthest from every start so far: the same
     answer every time */
  const all = middles(readings, new Uint8Array(n), 1, [[0, 0, 0]])[0];
  let centers: Triple[] = [
    readings.reduce((best, r) => (d2(r.at, all) < d2(best.at, all) ? r : best)).at
  ];
  const reach = new Float64Array(n).fill(Infinity);
  while (centers.length < GROUPS) {
    const last = centers[centers.length - 1];
    let far = 0;
    for (let i = 0; i < n; i++) {
      reach[i] = Math.min(reach[i], d2(readings[i].at, last));
      if (reach[i] > reach[far]) far = i;
    }
    if (reach[far] < (ALIKE / 2) ** 2) break;
    centers.push(readings[far].at);
  }
  const owner = new Uint8Array(n);
  for (let round = 0; round < ROUNDS; round++) {
    for (let i = 0; i < n; i++) owner[i] = nearest(readings[i].at, centers);
    centers = middles(readings, owner, centers.length, centers);
  }
  /* groups that read as one color become one, the nearest pair first. Each keeps the hues of the colored groups it
     took in, and two whose hues were clearly apart stay apart: without this the pastels would chain into one beige */
  const weight = centers.map((_, k) => owner.reduce((sum, o) => sum + (o === k ? 1 : 0), 0));
  const hues = centers.map(c =>
    Math.hypot(c[1], c[2]) >= HUE_CHROMA && c[0] / L_WEIGHT >= HUE_LIGHT
      ? [(Math.atan2(c[2], c[1]) * 180) / Math.PI]
      : []
  );
  const clash = (i: number, j: number) =>
    hues[i].some(h =>
      hues[j].some(k => {
        const d = Math.abs(h - k) % 360;
        return Math.min(d, 360 - d) >= HUE_APART;
      })
    );
  for (;;) {
    let a = -1;
    let b = -1;
    let best = ALIKE ** 2;
    for (let i = 0; i < centers.length; i++) {
      for (let j = i + 1; j < centers.length; j++) {
        const d = d2(centers[i], centers[j]);
        if (d < best && !clash(i, j)) {
          best = d;
          a = i;
          b = j;
        }
      }
    }
    if (a < 0) break;
    const w = weight[a] + weight[b] || 1;
    centers[a] = [0, 1, 2].map(
      x => (centers[a][x] * weight[a] + centers[b][x] * weight[b]) / w
    ) as Triple;
    weight[a] += weight[b];
    hues[a] = [...hues[a], ...hues[b]];
    centers.splice(b, 1);
    weight.splice(b, 1);
    hues.splice(b, 1);
  }
  for (let i = 0; i < n; i++) owner[i] = nearest(readings[i].at, centers);
  const groups = centers
    .map((center, k) => {
      const members = readings.filter((_, i) => owner[i] === k);
      return {
        share: members.length / n,
        color: members.length
          ? members.reduce((best, r) => (d2(r.at, center) < d2(best.at, center) ? r : best))
          : null
      };
    })
    .filter((g): g is { share: number; color: Reading } => g.color !== null)
    .sort((p, q) => q.share - p.share);
  const most = Math.max(1, Math.min(DOMINANT_MAX, Math.floor(max)));
  const kept: Reading[] = [];
  for (const g of groups.filter((g, i) => i === 0 || g.share >= SHARE)) {
    if (kept.length >= most) break;
    if (!kept.some(k => d2(k.lab, g.color.lab) < TWIN ** 2)) kept.push(g.color);
  }
  return inOrder(kept).map(r => toHex(r.rgb));
}

/* the order that moves least from one color to the next, darker end first: at most five, so every order is tried */
function inOrder(colors: readonly Reading[]): Reading[] {
  if (colors.length < 3) return [...colors].sort((p, q) => p.lab[0] - q.lab[0]);
  let best: Reading[] = [...colors];
  let bestLength = Infinity;
  const walk = (path: Reading[], rest: Reading[], length: number) => {
    if (length >= bestLength) return;
    if (!rest.length) {
      best = path;
      bestLength = length;
      return;
    }
    rest.forEach((next, i) => {
      const step = path.length ? Math.sqrt(d2(path[path.length - 1].lab, next.lab)) : 0;
      walk(
        [...path, next],
        rest.filter((_, j) => j !== i),
        length + step
      );
    });
  };
  walk([], [...colors], 0);
  return best[0].lab[0] <= best[best.length - 1].lab[0] ? best : best.reverse();
}
