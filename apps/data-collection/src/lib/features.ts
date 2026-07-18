import * as v from "valibot";
import {
  cosineGradient,
  rgbToHex,
  calculateAverageBrightness,
  calculateContrast,
  determinePaletteProperties,
  normalizeCoeffsToDefaults,
  analyzeCoefficients,
  tagsToArray,
  isValidPaletteCoeffs,
  type CosineCoeffs,
  type PaletteAngle,
} from "@repo/data-ops/gradient-gen";
import type { PaletteStyle } from "@repo/data-ops/valibot-schema/grabient";
import { computeLabSamples } from "@repo/data-ops/similarity";
import { serializeCoeffs } from "@repo/data-ops/serialization";
import {
  coeffsSchema,
  DEFAULT_GLOBALS,
  COEFF_PRECISION,
} from "@repo/data-ops/valibot-schema/coeffs";

export const HEX_STOP_COUNT = 8;
export const FEATURE_SAMPLE_POINTS = 8;
const LAB_DIMENSIONS = FEATURE_SAMPLE_POINTS * 3; // [L,a,b] per sample
// Vectorize requires dimensions in [32, 1536]; the 24 informative LAB values
// are zero-padded to 32, which leaves euclidean distances unchanged.
export const FEATURE_DIMENSIONS = 32;

// The training target is 12 floats: a,b,c,d as RGB triples in row order.
// data-ops CosineCoeffs carries a 4th alpha=1 component per row; every
// conversion between the two shapes lives here and nowhere else.
export function toCosineCoeffs(flat12: number[]): CosineCoeffs {
  if (flat12.length !== 12) {
    throw new Error(`expected 12 coefficients, got ${flat12.length}`);
  }
  const rows = [];
  for (let i = 0; i < 12; i += 3) {
    rows.push([flat12[i], flat12[i + 1], flat12[i + 2], 1]);
  }
  return v.parse(coeffsSchema, rows);
}

export function toFlat12(coeffs: CosineCoeffs): number[] {
  return coeffs.flatMap((row) => [
    round3(row[0]),
    round3(row[1]),
    round3(row[2]),
  ]);
}

export function round3(n: number): number {
  return Number(n.toFixed(COEFF_PRECISION));
}

export interface CanonicalPalette {
  seed: string;
  coeffs: CosineCoeffs;
  flat12: number[];
  hexStops: string[];
  tags: string[];
  brightness: number;
  contrast: number;
  style: PaletteStyle;
  steps: number;
  angle: PaletteAngle;
  valid: boolean;
}

/** djb2 hash of the seed string mapped to [0, 1) so derived presentation is a
 * pure function of the palette. */
function seedToUnit(seed: string): number {
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0;
  }
  return (((hash % 1000) + 1000) % 1000) / 1000;
}

/**
 * Canonicalize arbitrary coeff input: normalize globals to defaults, round to
 * COEFF_PRECISION (before deriving anything, so seed <-> vector is exact),
 * then derive seed, hex stops, tags and metrics.
 */
export function canonicalize(flat12: number[]): CanonicalPalette {
  const normalized = normalizeCoeffsToDefaults(
    toCosineCoeffs(flat12),
    DEFAULT_GLOBALS,
  );
  // Round via toFlat12 then re-parse so stored floats match the seed exactly
  const roundedFlat = toFlat12(normalized);
  const coeffs = toCosineCoeffs(roundedFlat);
  const seed = serializeCoeffs(coeffs, DEFAULT_GLOBALS);
  const stops = cosineGradient(HEX_STOP_COUNT, coeffs);
  const hexStops = stops.map(([r, g, b]) => rgbToHex(r, g, b));
  const presentation = determinePaletteProperties(
    coeffs,
    hexStops,
    seedToUnit(seed),
  );
  return {
    seed,
    coeffs,
    flat12: roundedFlat,
    hexStops,
    tags: tagsToArray(analyzeCoefficients(coeffs)),
    brightness: calculateAverageBrightness(hexStops),
    contrast: calculateContrast(hexStops),
    style: presentation.style,
    steps: presentation.steps,
    angle: presentation.angle,
    valid: isValidPaletteCoeffs(coeffs),
  };
}

/**
 * Deterministic Vectorize feature vector: FEATURE_SAMPLE_POINTS LAB samples of
 * the rendered gradient, flattened to [L,a,b] * N. Euclidean distance over
 * this vector ~= sqrt(N) * RMS deltaE between palettes.
 */
export function featureVector(hexStops: string[]): number[] {
  const labs = computeLabSamples(hexStops, FEATURE_SAMPLE_POINTS);
  const vector = labs.flatMap((lab) => [lab.L, lab.a, lab.b]);
  return vector.concat(new Array(FEATURE_DIMENSIONS - LAB_DIMENSIONS).fill(0));
}

export function reversedFeatureVector(hexStops: string[]): number[] {
  return featureVector([...hexStops].reverse());
}
