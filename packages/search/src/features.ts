/* A palette as the palette side reads it: 281 numbers from its own colors, about a millisecond in a Worker, so a
   palette is measured when the site first sees it. The engine draws the curve and reads its shape; nothing here changes
   either. */
import type { Palette } from "@grabient/engine";
import { type Sample, type Structure, samples, structure } from "@grabient/engine/shape.ts";
import { CODEBOOK } from "./codebook.data.ts";

/** The spread of one sample over the codebook, in OKLab units. The model was trained with this value. */
const SIGMA = 0.045;
export const FEATURES = CODEBOOK.length + 25;

/** The square root of the soft color histogram over the codebook, unit length: the dot product of two is the
    Bhattacharyya coefficient of their color distributions. */
function histogram(S: readonly Sample[]): Float32Array {
  const K = CODEBOOK.length;
  const total = new Float64Array(K);
  const w = new Float64Array(K);
  const inv = 1 / (2 * SIGMA * SIGMA);
  for (const s of S) {
    let sum = 0;
    for (let k = 0; k < K; k++) {
      const c = CODEBOOK[k];
      w[k] = Math.exp(-((s.L - c[0]) ** 2 + (s.a - c[1]) ** 2 + (s.b - c[2]) ** 2) * inv);
      sum += w[k];
    }
    for (let k = 0; k < K; k++) total[k] += w[k] / sum;
  }
  const out = new Float32Array(K);
  let norm = 0;
  for (let k = 0; k < K; k++) {
    out[k] = Math.sqrt(total[k] / S.length);
    norm += out[k] * out[k];
  }
  norm = Math.sqrt(norm) || 1;
  for (let k = 0; k < K; k++) out[k] /= norm;
  return out;
}

/* the 25 structure numbers, each about 0 to 1, in the order the model was trained with */
const structureVector = (st: Structure): number[] => [
  st.meanL,
  st.minL,
  st.maxL,
  st.sdL * 3,
  st.meanC / 0.25,
  st.maxC / 0.35,
  st.hueR,
  st.neutralFrac,
  st.warmFrac,
  st.coolFrac,
  st.darkFrac,
  st.lightFrac,
  st.vividFrac,
  ...st.hueHist
];

/** The palette side's input (histogram, then structure) and the shape it was read from. */
export function paletteFeatures(P: Palette): { vector: Float32Array; structure: Structure } {
  const S = samples(P);
  const st = structure(S);
  const vector = new Float32Array(FEATURES);
  vector.set(histogram(S));
  vector.set(structureVector(st), CODEBOOK.length);
  return { vector, structure: st };
}
