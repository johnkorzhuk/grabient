import * as v from "valibot";
import { isValidSeed } from "../serialization";

export const PALETTE_STYLES = [
    "angularGradient",
    "angularSwatches",
    "linearGradient",
    "linearSwatches",
] as const;

export type PaletteStyle = (typeof PALETTE_STYLES)[number];

export const STYLE_LABELS: Record<PaletteStyle, string> = {
    angularGradient: "Angular Gradient",
    angularSwatches: "Angular Swatches",
    linearGradient: "Linear Gradient",
    linearSwatches: "Linear Swatches",
};

/**
 * Fallback styles for non-CSS/SVG rendering
 * Currently empty since deepFlow was removed
 */
export const FALLBACK_STYLES: Partial<Record<(typeof PALETTE_STYLES)[number], (typeof PALETTE_STYLES)[number]>> = {};

export const DEFAULT_STYLE: (typeof PALETTE_STYLES)[number] = "linearGradient";
export const paletteStyleValidator = v.union(
    PALETTE_STYLES.map((t) => v.literal(t)),
);
export const styleWithAutoValidator = v.union([
    v.literal("auto"),
    paletteStyleValidator,
]);

/**
 * Validates a seed string by checking if it can be decompressed and has valid structure
 */
export const seedValidator = v.pipe(
    v.string(),
    v.check(isValidSeed, "Invalid seed: unable to deserialize"),
);

export const DEFAULT_STEPS = 7;
export const MIN_STEPS = 2;
export const MAX_STEPS = 50;
export const stepsValidator = v.pipe(
    v.number(),
    v.minValue(MIN_STEPS),
    v.maxValue(MAX_STEPS),
);
export const stepsWithAutoValidator = v.union([
    v.literal("auto"),
    stepsValidator,
]);

export const DEFAULT_ANGLE = 90.0;
export const MIN_ANGLE = 0;
export const MAX_ANGLE = 360;
export const angleValidator = v.pipe(
    v.number(),
    v.minValue(MIN_ANGLE),
    v.maxValue(MAX_ANGLE),
);
export const angleWithAutoValidator = v.union([
    v.literal("auto"),
    angleValidator,
]);

export const DEFAULT_PAGE_LIMIT = 24;
export const MIN_PAGE_LIMIT = 12;
export const MAX_PAGE_LIMIT = 96;
export const pageLimitValidator = v.pipe(
    v.number(),
    v.minValue(MIN_PAGE_LIMIT),
    v.maxValue(MAX_PAGE_LIMIT),
);
export const optionalPageLimitValidator = v.optional(
    v.fallback(pageLimitValidator, DEFAULT_PAGE_LIMIT),
    DEFAULT_PAGE_LIMIT,
);

export const DEFAULT_WIDTH = 800;
export const MIN_WIDTH = 40;
export const MAX_WIDTH = 6000;
export const widthValidator = v.pipe(
    v.number(),
    v.minValue(MIN_WIDTH),
    v.maxValue(MAX_WIDTH),
    v.transform((input) => Number(input.toFixed(2))),
);
export const widthWithAutoValidator = v.union([
    v.literal("auto"),
    widthValidator,
]);

export const DEFAULT_HEIGHT = 400;
export const MIN_HEIGHT = 40;
export const MAX_HEIGHT = 6000;
export const heightValidator = v.pipe(
    v.number(),
    v.minValue(MIN_HEIGHT),
    v.maxValue(MAX_HEIGHT),
    v.transform((input) => Number(input.toFixed(2))),
);
export const heightWithAutoValidator = v.union([
    v.literal("auto"),
    heightValidator,
]);

export const DEFAULT_SIZE = [DEFAULT_WIDTH, DEFAULT_HEIGHT] as const;

export const clampedWidthValidator = v.pipe(
    v.number(),
    v.toMinValue(MIN_WIDTH),
    v.toMaxValue(MAX_WIDTH),
    v.transform((input) => Number(input.toFixed(2))),
);
export const clampedHeightValidator = v.pipe(
    v.number(),
    v.toMinValue(MIN_HEIGHT),
    v.toMaxValue(MAX_HEIGHT),
    v.transform((input) => Number(input.toFixed(2))),
);

export const sizeValidator = v.tuple([widthValidator, heightValidator]);
export const clampedSizeValidator = v.tuple([
    clampedWidthValidator,
    clampedHeightValidator,
]);
export const sizeWithAutoValidator = v.union([
    v.literal("auto"),
    sizeValidator,
]);
export const clampedSizeWithAutoValidator = v.union([
    v.literal("auto"),
    clampedSizeValidator,
]);

export const DEFAULT_MODIFIER = "auto" as const;
export const MODIFIERS = [
    "auto",
    "exposure",
    "contrast",
    "frequency",
    "phase",
] as const;
export const modifierValidator = v.union(MODIFIERS.map((t) => v.literal(t)));

export const PI = Math.PI;
/**
 * Very important constant here.
 * I think 3 is a sweet spot where the seed generated isnt too long
 * and grainular enough to guarantee uniqueness
 */
export const COEFF_PRECISION = 3 as const;

/**
 * Cosine gradient formula: color(t) = a + b * cos(2π * (c*t + d))
 * All components maintain COEFF_PRECISION decimal places but can be any number
 */
export const componentSchema = v.pipe(
    v.number(),
    v.transform((input) => Number(input.toFixed(COEFF_PRECISION))),
);

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
        Number(vec[0].toFixed(COEFF_PRECISION)),
        Number(vec[1].toFixed(COEFF_PRECISION)),
        Number(vec[2].toFixed(COEFF_PRECISION)),
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

/**
 * Cosine gradient palette validator
 * Validates the complete structure of a gradient palette
 */
export const paletteSchema = v.object({
    coeffs: coeffsSchema,
    globals: globalsSchema,
    steps: stepsValidator,
    style: paletteStyleValidator,
    angle: angleValidator,
});
