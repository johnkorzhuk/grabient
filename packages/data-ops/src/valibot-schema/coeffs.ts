import * as v from "valibot";

/**
 * Very important constant here.
 * I think 3 is a sweet spot where the seed generated isnt too long
 * and grainular enough to guarantee uniqueness
 */
export const COEFF_PRECISION = 3 as const;

/**
 * Coefficient bounds come from the seed encoding: 18-bit fixed point at
 * COEFF_PRECISION decimals. Values are clamped, not rejected, so repeated
 * tare/tether operations saturate at the bound instead of erroring.
 */
export const COEFF_MAX = ((1 << 17) - 1) / Math.pow(10, COEFF_PRECISION);
export const COEFF_MIN = -(1 << 17) / Math.pow(10, COEFF_PRECISION);

const clampComponent = (input: number) =>
    Number(Math.min(COEFF_MAX, Math.max(COEFF_MIN, input)).toFixed(COEFF_PRECISION));

/**
 * Cosine gradient formula: color(t) = a + b * cos(2π * (c*t + d))
 * All components maintain COEFF_PRECISION decimal places, clamped to
 * [COEFF_MIN, COEFF_MAX]
 */
export const componentSchema = v.pipe(v.number(), v.transform(clampComponent));

export const vectorSchema = v.tuple([
    componentSchema, // R component
    componentSchema, // G component
    componentSchema, // B component
    v.literal(1), // A component
]);

// Schema for raw vector input (3 numbers), transforms to normalized 4-tuple with alpha=1
export const rawVectorInputSchema = v.pipe(
    v.tuple([v.number(), v.number(), v.number()]),
    v.transform((vec): [number, number, number, 1] => [
        clampComponent(vec[0]),
        clampComponent(vec[1]),
        clampComponent(vec[2]),
        1,
    ]),
);

export const coeffsSchema = v.tuple([
    vectorSchema, // a: offset vector (base color)
    vectorSchema, // b: amplitude vector (color range)
    vectorSchema, // c: frequency vector (color cycles)
    vectorSchema, // d: phase vector (color shift)
]);

// Global modifiers with value constraints
export const globalExposureSchema = v.pipe(
    v.number(),
    v.minValue(-1),
    v.maxValue(1),
    v.transform((input) => Number(input.toFixed(COEFF_PRECISION))),
);

export const globalContrastSchema = v.pipe(
    v.number(),
    v.minValue(0),
    v.maxValue(2),
    v.transform((input) => Number(input.toFixed(COEFF_PRECISION))),
);

export const globalFrequencySchema = v.pipe(
    v.number(),
    v.minValue(0),
    v.maxValue(2),
    v.transform((input) => Number(input.toFixed(COEFF_PRECISION))),
);

export const globalPhaseSchema = v.pipe(
    v.number(),
    v.minValue(-1 - Math.pow(10, -COEFF_PRECISION)),
    v.maxValue(1 + Math.pow(10, -COEFF_PRECISION)),
    v.transform((input) => Number(input.toFixed(COEFF_PRECISION))),
);

export const globalsSchema = v.tuple([
    globalExposureSchema, // exposure [-1, 1]
    globalContrastSchema, // contrast [0, 2]
    globalFrequencySchema, // frequency [0, 2]
    globalPhaseSchema, // phase [-1, 1]
]);

// Default values for global modifiers [exposure, contrast, frequency, phase]
export const DEFAULT_GLOBALS = [0, 1, 1, 0] as v.InferOutput<
    typeof globalsSchema
>;
