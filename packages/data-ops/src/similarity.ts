import type * as v from 'valibot';
import type { coeffsSchema, globalsSchema } from './valibot-schema/grabient';

type CosineCoeffs = v.InferOutput<typeof coeffsSchema>;
type GlobalModifiers = v.InferOutput<typeof globalsSchema>;

export function createSimilarityKey(coeffs: CosineCoeffs): string {
  // Only use rows 0-1 (base + amplitude) for similarity
  // These define the color range - rows 2-3 (frequency + phase) just affect
  // how the gradient "moves" through that range
  // Use 1-decimal precision for coarse grouping
  const baseAndAmplitude = coeffs.slice(0, 2);
  const roundedCoeffs = baseAndAmplitude.map((vec) => [
    Number(vec[0].toFixed(1)),
    Number(vec[1].toFixed(1)),
    Number(vec[2].toFixed(1)),
  ]).flat();

  return roundedCoeffs.join('|');
}
