import * as v from "valibot";
import { coeffsSchema, globalsSchema } from "../valibot-schema/coeffs";

export type CosineCoeffs = v.InferOutput<typeof coeffsSchema>;
export type GlobalModifiers = v.InferOutput<typeof globalsSchema>;

/**
 * Bake the four global modifiers into their corresponding coefficient rows.
 * This module intentionally depends only on the low-level coefficient schema
 * so serialization can use it without creating a serialization/schema cycle.
 */
export function applyGlobals(
    cosCoeffs: CosineCoeffs,
    globals: GlobalModifiers,
): CosineCoeffs {
    return cosCoeffs.map((coeff, i) => {
        const alpha = coeff[3] ?? 1;
        switch (i) {
            case 0:
                return [
                    ...coeff.slice(0, 3).map((value) => value + (globals[0] ?? 0)),
                    alpha,
                ];
            case 1:
                return [
                    ...coeff.slice(0, 3).map((value) => value * (globals[1] ?? 1)),
                    alpha,
                ];
            case 2:
                return [
                    ...coeff.slice(0, 3).map((value) => value * (globals[2] ?? 1)),
                    alpha,
                ];
            case 3:
                return [
                    ...coeff.slice(0, 3).map((value) => value + (globals[3] ?? 0)),
                    alpha,
                ];
            default:
                return coeff;
        }
    }) as CosineCoeffs;
}
