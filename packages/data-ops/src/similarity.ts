import type * as v from 'valibot';
import type { coeffsSchema, globalsSchema } from './valibot-schema/grabient';

type CosineCoeffs = v.InferOutput<typeof coeffsSchema>;
type GlobalModifiers = v.InferOutput<typeof globalsSchema>;

export function createSimilarityKey(coeffs: CosineCoeffs): string {
  const roundedCoeffs = coeffs.map((vec) => [
    Number(vec[0].toFixed(2)),
    Number(vec[1].toFixed(2)),
    Number(vec[2].toFixed(2)),
  ]).flat();

  return roundedCoeffs.join('|');
}
