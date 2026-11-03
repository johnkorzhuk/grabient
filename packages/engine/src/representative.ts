/* The few palettes that show a whole set: a collection's sheet has room for eight rows, and its eight most liked can
   all be one color (John, 3 Nov 2026, of the Christmas gradients' sheet: "theres not greens"). The first palette
   stays, the card a reader meets first. Each of the others is the palette that brings the rest of the set nearest a
   row: every palette is read as the color coins read it (dominant.ts: along its curve, in OKLab, lightness counting
   for less than hue and chroma), and two palettes are as far apart as each reading is from the other's nearest,
   on average, both ways. Likes choose only between palettes that do about as well: a pick's gain counts up to
   LIKED more for the set's most liked palette. The picks come back in the set's own order. A hundred palettes, the
   most a collection holds, take about 6 ms. */
import { decodePalette } from "./codec.ts";
import { srgbToOklab } from "./color.ts";
import { sampleSrgb } from "./curve.ts";
import { L_WEIGHT, READINGS } from "./dominant.ts";

/** How much more a pick's gain counts for the set's most liked palette than for one nobody liked. */
const LIKED = 0.3;

/* a palette's readings, three numbers each */
function readingsOf(seed: string): Float64Array | null {
  const P = decodePalette(seed);
  if (!P) return null;
  const out = new Float64Array(READINGS * 3);
  for (let i = 0; i < READINGS; i++) {
    const [L, a, b] = srgbToOklab(...sampleSrgb(P, i / (READINGS - 1)));
    out.set([L * L_WEIGHT, a, b], i * 3);
  }
  return out;
}

/* how far apart two palettes look: the mean distance from each reading to the other's nearest, both ways */
const toQ = new Float64Array(READINGS);
const toP = new Float64Array(READINGS);
function apart(p: Float64Array, q: Float64Array): number {
  toQ.fill(Infinity);
  toP.fill(Infinity);
  for (let i = 0; i < READINGS; i++) {
    const L = p[i * 3];
    const a = p[i * 3 + 1];
    const b = p[i * 3 + 2];
    for (let j = 0; j < READINGS; j++) {
      const dL = L - q[j * 3];
      const da = a - q[j * 3 + 1];
      const db = b - q[j * 3 + 2];
      const d = dL * dL + da * da + db * db;
      if (d < toQ[i]) toQ[i] = d;
      if (d < toP[j]) toP[j] = d;
    }
  }
  let sum = 0;
  for (let i = 0; i < READINGS; i++) sum += Math.sqrt(toQ[i]) + Math.sqrt(toP[i]);
  return sum / (2 * READINGS);
}

/** The places in `palettes` of the `count` that together look most like all of them, in their order: the first
    palette and the ones that bring the rest nearest. A seed that names no palette is never picked. */
export function representatives(
  palettes: readonly { seed: string; likes?: number }[],
  count: number
): number[] {
  const readings = palettes.map(p => readingsOf(p.seed));
  const places = readings.flatMap((r, i) => (r ? [i] : []));
  if (places.length <= count) return places;
  const n = places.length;
  const far = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      far[i * n + j] = far[j * n + i] = apart(
        readings[places[i]] as Float64Array,
        readings[places[j]] as Float64Array
      );
    }
  }
  const likes = places.map(i => Math.max(0, palettes[i].likes ?? 0));
  const most = Math.max(...likes);
  const worth = likes.map(l => (most > 0 ? 1 + (LIKED * Math.log1p(l)) / Math.log1p(most) : 1));
  /* each palette's distance to its nearest pick so far: the first is picked */
  const reach = far.slice(0, n);
  const picked = [0];
  while (picked.length < count) {
    let best = -1;
    let bestScore = -1;
    for (let j = 1; j < n; j++) {
      if (picked.includes(j)) continue;
      let gain = 0;
      for (let i = 0; i < n; i++) {
        const d = far[i * n + j];
        if (d < reach[i]) gain += reach[i] - d;
      }
      if (gain * worth[j] > bestScore) {
        bestScore = gain * worth[j];
        best = j;
      }
    }
    picked.push(best);
    for (let i = 0; i < n; i++) reach[i] = Math.min(reach[i], far[i * n + best]);
  }
  return picked.map(k => places[k]).sort((a, b) => a - b);
}
