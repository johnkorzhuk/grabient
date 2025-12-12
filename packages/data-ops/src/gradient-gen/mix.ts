/**
 * Mix Generation Module
 *
 * Generates variations of cosine palettes based on the formula:
 * color(t) = a + b · cos(2π(c·t + d))
 *
 * Uses OKLAB perceptual color space for analysis and generation.
 * Based on color theory principles for harmonious results.
 *
 * References:
 * - Cosine palettes: https://iquilezles.org/articles/palettes/
 * - OKLAB color space: https://bottosson.github.io/posts/oklab/
 * - Color harmony theory: complementary, analogous, triadic relationships
 */

import type { CosineCoeffs } from "./cosine";
import { cosineGradient } from "./cosine";

// ============================================================================
// Types
// ============================================================================

export interface PaletteAnalysis {
  brightness: number;
  amplitude: number;
  temperature: number;
  complexity: number;
}

export interface CollectiveStats {
  min: number;
  max: number;
  avg: number;
  std: number;
}

/** OKLAB color representation */
interface OkLab {
  L: number; // Lightness [0, 1]
  a: number; // Green-red axis [-0.4, 0.4]
  b: number; // Blue-yellow axis [-0.4, 0.4]
}

/** OKLCH color representation (cylindrical) */
interface OkLCH {
  L: number; // Lightness [0, 1]
  C: number; // Chroma [0, 0.4+]
  H: number; // Hue [0, 360)
}

/** Perceptual analysis of a palette in OKLAB space */
interface PerceptualProfile {
  // Lightness statistics
  lightness: { min: number; max: number; mean: number; std: number };
  // Chroma (saturation) statistics
  chroma: { min: number; max: number; mean: number; std: number };
  // Hue analysis
  hue: { dominant: number; range: number; samples: number[] };
  // The actual sampled colors in OKLCH
  samples: OkLCH[];
}

/** Statistics for cosine parameters */
interface ParameterStats {
  a: [ComponentStats, ComponentStats, ComponentStats];
  b: [ComponentStats, ComponentStats, ComponentStats];
  c: [ComponentStats, ComponentStats, ComponentStats];
  d: [ComponentStats, ComponentStats, ComponentStats];
}

interface ComponentStats {
  min: number;
  max: number;
  mean: number;
  std: number;
}

export interface CollectiveAnalysis {
  brightness: CollectiveStats;
  frequency: CollectiveStats;
  amplitude: CollectiveStats;
  temperature: CollectiveStats;
  palettes: CosineCoeffs[];
  stats: ParameterStats;
  profiles: PerceptualProfile[];
}

export interface GeneratedPalette {
  coeffs: CosineCoeffs;
  analysis: PaletteAnalysis;
  similarity: number;
}

export interface MixOptions {
  count?: number;
  seed?: number;
  /** Similarity threshold for deduplicating outputs (0-1, default 0.92) */
  dedupThreshold?: number;
  /** Max generation attempts before giving up (default 200) */
  maxAttempts?: number;
}

export interface MixResult {
  collective: CollectiveAnalysis;
  output: GeneratedPalette[];
}

// ============================================================================
// Seeded PRNG (Mulberry32)
// ============================================================================

function createRNG(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================================
// OKLAB Color Space Conversions
// Based on: https://bottosson.github.io/posts/oklab/
// ============================================================================

/**
 * Convert linear sRGB to OKLAB
 * Input: r, g, b in [0, 1] (linear, not gamma-corrected)
 */
function linearRgbToOklab(r: number, g: number, b: number): OkLab {
  // Step 1: Linear RGB to LMS
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  // Step 2: Cube root
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  // Step 3: To Lab
  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}

/**
 * Convert OKLAB to linear sRGB
 */
function oklabToLinearRgb(L: number, a: number, b: number): [number, number, number] {
  // Step 1: Lab to LMS'
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  // Step 2: Cube
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  // Step 3: To linear RGB
  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  return [r, g, blue];
}

/**
 * Convert OKLAB to OKLCH (cylindrical coordinates)
 */
function oklabToOklch(lab: OkLab): OkLCH {
  const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  let H = Math.atan2(lab.b, lab.a) * (180 / Math.PI);
  if (H < 0) H += 360;
  return { L: lab.L, C, H };
}

/**
 * Convert OKLCH to OKLAB
 */
function oklchToOklab(lch: OkLCH): OkLab {
  const hRad = lch.H * (Math.PI / 180);
  return {
    L: lch.L,
    a: lch.C * Math.cos(hRad),
    b: lch.C * Math.sin(hRad),
  };
}

/**
 * Convert sRGB [0,1] to OKLCH
 */
function rgbToOklch(r: number, g: number, b: number): OkLCH {
  // Note: cosine gradient output is already in linear-ish space
  // For simplicity, we treat it as linear
  const lab = linearRgbToOklab(r, g, b);
  return oklabToOklch(lab);
}

// ============================================================================
// Utility Functions
// ============================================================================

type Vec3 = [number, number, number];
type Idx = 0 | 1 | 2;
const INDICES: Idx[] = [0, 1, 2];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function wrapPhase(x: number): number {
  return ((x % 1) + 1) % 1;
}

function wrapAngle(x: number): number {
  return ((x % 360) + 360) % 360;
}

function angleDiff(a: number, b: number): number {
  let diff = b - a;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return diff;
}

function circularMean(angles: number[]): number {
  if (angles.length === 0) return 0;
  let sinSum = 0, cosSum = 0;
  for (const a of angles) {
    const rad = a * (Math.PI / 180);
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
  }
  let mean = Math.atan2(sinSum, cosSum) * (180 / Math.PI);
  if (mean < 0) mean += 360;
  return mean;
}

function circularRange(angles: number[]): number {
  if (angles.length < 2) return 0;
  const sorted = [...angles].sort((a, b) => a - b);
  let maxGap = 0;
  for (let i = 0; i < sorted.length; i++) {
    const next = (i + 1) % sorted.length;
    let gap = sorted[next]! - sorted[i]!;
    if (next === 0) gap += 360;
    maxGap = Math.max(maxGap, gap);
  }
  return 360 - maxGap;
}

interface Params {
  a: Vec3;
  b: Vec3;
  c: Vec3;
  d: Vec3;
}

function toParams(coeffs: CosineCoeffs): Params {
  return {
    a: [coeffs[0][0], coeffs[0][1], coeffs[0][2]],
    b: [coeffs[1][0], coeffs[1][1], coeffs[1][2]],
    c: [coeffs[2][0], coeffs[2][1], coeffs[2][2]],
    d: [coeffs[3][0], coeffs[3][1], coeffs[3][2]],
  };
}

function toCoeffs(p: Params): CosineCoeffs {
  return [
    [p.a[0], p.a[1], p.a[2], 1],
    [p.b[0], p.b[1], p.b[2], 1],
    [p.c[0], p.c[1], p.c[2], 1],
    [p.d[0], p.d[1], p.d[2], 1],
  ];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function sampleNormal(mean: number, std: number, rand: () => number): number {
  const u1 = rand();
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1 + 0.0001)) * Math.cos(2 * Math.PI * u2);
  return mean + z * std;
}

// ============================================================================
// Analysis Functions
// ============================================================================

function computeStats(values: number[]): ComponentStats {
  if (values.length === 0) return { min: 0, max: 0, mean: 0, std: 0 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  let variance = 0;
  for (const v of values) variance += (v - mean) ** 2;
  const std = Math.sqrt(variance / values.length);
  return { min, max, mean, std };
}

/**
 * Analyze a palette in OKLAB/OKLCH perceptual space
 */
function analyzePerceptual(coeffs: CosineCoeffs): PerceptualProfile {
  const rgbSamples = cosineGradient(20, coeffs);
  const samples: OkLCH[] = [];
  const lightnesses: number[] = [];
  const chromas: number[] = [];
  const hues: number[] = [];

  for (const [r, g, b] of rgbSamples) {
    const lch = rgbToOklch(r, g, b);
    samples.push(lch);
    lightnesses.push(lch.L);
    chromas.push(lch.C);
    // Only record hue for colors with meaningful chroma
    if (lch.C > 0.02) {
      hues.push(lch.H);
    }
  }

  return {
    lightness: computeStats(lightnesses),
    chroma: computeStats(chromas),
    hue: {
      dominant: hues.length > 0 ? circularMean(hues) : 0,
      range: hues.length > 1 ? circularRange(hues) : 0,
      samples: hues,
    },
    samples,
  };
}

export function analyzePalette(coeffs: CosineCoeffs): PaletteAnalysis {
  const samples = cosineGradient(100, coeffs);
  const params = toParams(coeffs);

  let brightness = 0;
  let temp = 0;
  for (const [r, g, b] of samples) {
    brightness += 0.299 * r + 0.587 * g + 0.114 * b;
    temp += (r * 2 + g) / 3 - (b * 2 + g) / 3;
  }
  brightness /= samples.length;
  temp /= samples.length;

  const amplitude = Math.sqrt(
    (params.b[0] ** 2 + params.b[1] ** 2 + params.b[2] ** 2) / 3
  );
  const complexity =
    (Math.abs(params.c[0]) + Math.abs(params.c[1]) + Math.abs(params.c[2])) / 3;

  return {
    brightness,
    amplitude,
    temperature: (temp + 1) / 2,
    complexity,
  };
}

function computeParameterStats(palettes: CosineCoeffs[]): ParameterStats {
  const allParams = palettes.map(toParams);
  return {
    a: [
      computeStats(allParams.map((p) => p.a[0])),
      computeStats(allParams.map((p) => p.a[1])),
      computeStats(allParams.map((p) => p.a[2])),
    ],
    b: [
      computeStats(allParams.map((p) => p.b[0])),
      computeStats(allParams.map((p) => p.b[1])),
      computeStats(allParams.map((p) => p.b[2])),
    ],
    c: [
      computeStats(allParams.map((p) => p.c[0])),
      computeStats(allParams.map((p) => p.c[1])),
      computeStats(allParams.map((p) => p.c[2])),
    ],
    d: [
      computeStats(allParams.map((p) => p.d[0])),
      computeStats(allParams.map((p) => p.d[1])),
      computeStats(allParams.map((p) => p.d[2])),
    ],
  };
}

function basicStats(values: number[]): CollectiveStats {
  const s = computeStats(values);
  return { min: s.min, max: s.max, avg: s.mean, std: s.std };
}

export function analyzeCollective(palettes: CosineCoeffs[]): CollectiveAnalysis {
  const analyses = palettes.map(analyzePalette);
  const profiles = palettes.map(analyzePerceptual);
  const stats = computeParameterStats(palettes);

  return {
    brightness: basicStats(analyses.map((a) => a.brightness)),
    frequency: basicStats(analyses.map((a) => a.complexity)),
    amplitude: basicStats(analyses.map((a) => a.amplitude)),
    temperature: basicStats(analyses.map((a) => a.temperature)),
    palettes,
    stats,
    profiles,
  };
}

// ============================================================================
// Generation Strategies
// ============================================================================

/**
 * Color harmony angles (in degrees) for hue shifts
 * Based on color theory: https://en.wikipedia.org/wiki/Color_scheme
 */
const HARMONY = {
  complementary: 180,    // Opposite on color wheel
  triadic: 120,          // Three evenly spaced
  splitComplementary: 150, // 150° and 210°
  analogous: 30,         // Adjacent colors
  tetradic: 90,          // Four evenly spaced
} as const;

/**
 * Generation parameters (tuned for interesting variations)
 */
const CONFIG = {
  perturbScale: 0.5,
  hueShiftMax: 45,
  blendChance: 0.7,
  harmonyChance: 0.15,
} as const;

/**
 * Apply a hue rotation to cosine parameters
 * This shifts the dominant hue while preserving the palette structure
 *
 * In cosine palettes, hue is controlled by the phase (d) relationships.
 * A coherent shift to all d values rotates the entire palette through the color wheel.
 */
function applyHueRotation(p: Params, degrees: number): void {
  // Convert degrees to phase shift (360° = 1.0 phase)
  const phaseShift = degrees / 360;
  for (const i of INDICES) {
    p.d[i] = wrapPhase(p.d[i] + phaseShift);
  }
}

/**
 * Apply a lightness adjustment
 * Modifies the 'a' (bias) parameter
 */
function applyLightnessShift(p: Params, amount: number): void {
  for (const i of INDICES) {
    p.a[i] = clamp(p.a[i] + amount, 0, 1);
  }
}

/**
 * Apply a chroma/saturation adjustment
 * Modifies the 'b' (amplitude) parameter
 */
function applyChromaScale(p: Params, scale: number): void {
  for (const i of INDICES) {
    p.b[i] = clamp(p.b[i] * scale, -0.6, 0.6);
  }
}

/**
 * Apply temperature shift (warm ↔ cool)
 * Adjusts red and blue channels inversely
 */
function applyTemperatureShift(p: Params, amount: number): void {
  // Positive = warmer (more red, less blue)
  // Negative = cooler (more blue, less red)
  p.a[0] = clamp(p.a[0] + amount * 0.1, 0, 1);
  p.a[2] = clamp(p.a[2] - amount * 0.1, 0, 1);
  // Also shift phases slightly
  p.d[0] = wrapPhase(p.d[0] + amount * 0.02);
  p.d[2] = wrapPhase(p.d[2] - amount * 0.02);
}

/**
 * Generate a variation using perceptual color theory
 */
function generateVariation(
  collective: CollectiveAnalysis,
  rand: () => number
): CosineCoeffs {
  const { palettes, profiles } = collective;

  if (palettes.length === 0) {
    throw new Error("No palettes in collective");
  }

  // Pick a base palette and its profile
  const baseIdx = Math.floor(rand() * palettes.length);
  const basePalette = palettes[baseIdx]!;
  const baseProfile = profiles[baseIdx]!;
  const base = toParams(basePalette);

  // Clone the base parameters
  const p: Params = {
    a: [...base.a],
    b: [...base.b],
    c: [...base.c],
    d: [...base.d],
  };

  // Strategy selection based on random roll
  const strategyRoll = rand();

  if (strategyRoll < CONFIG.blendChance && palettes.length > 1) {
    // === STRATEGY: Blend between two palettes ===
    let idx2 = Math.floor(rand() * palettes.length);
    if (idx2 === baseIdx) idx2 = (idx2 + 1) % palettes.length;
    const p2 = toParams(palettes[idx2]!);
    const t = 0.3 + rand() * 0.4;

    for (const i of INDICES) {
      p.a[i] = lerp(base.a[i], p2.a[i], t);
      p.b[i] = lerp(base.b[i], p2.b[i], t);
      p.c[i] = lerp(base.c[i], p2.c[i], t);
      // Circular lerp for phase
      let diff = p2.d[i] - base.d[i];
      if (diff > 0.5) diff -= 1;
      if (diff < -0.5) diff += 1;
      p.d[i] = wrapPhase(base.d[i] + diff * t);
    }
  } else if (rand() < CONFIG.harmonyChance) {
    // === STRATEGY: Color harmony transformation ===
    // Favor smaller angle harmonies (analogous, tetradic) over large ones
    const safeHarmonies: (keyof typeof HARMONY)[] = ["analogous", "tetradic", "splitComplementary"];
    const harmonyType = safeHarmonies[Math.floor(rand() * safeHarmonies.length)]!;
    const harmonyAngle = HARMONY[harmonyType];

    // Apply harmony-based hue shift
    const direction = rand() < 0.5 ? 1 : -1;
    const variation = (rand() - 0.5) * 15; // ±7.5° variation
    applyHueRotation(p, direction * harmonyAngle + variation);

    // Small adjustments to other parameters
    applyLightnessShift(p, (rand() - 0.5) * CONFIG.perturbScale * 0.4);
    applyChromaScale(p, 0.92 + rand() * 0.16);
  } else {
    // === STRATEGY: Perceptual perturbation ===

    // 1. Hue rotation (most impactful)
    const hueShift = (rand() - 0.5) * 2 * CONFIG.hueShiftMax;
    applyHueRotation(p, hueShift);

    // 2. Lightness adjustment (preserve relative contrast)
    if (rand() < 0.5) {
      const lightnessShift = (rand() - 0.5) * CONFIG.perturbScale * 0.7;
      applyLightnessShift(p, lightnessShift);
    }

    // 3. Chroma/saturation adjustment
    if (rand() < 0.4) {
      const chromaScale = 1 + (rand() - 0.5) * CONFIG.perturbScale * 0.6;
      applyChromaScale(p, chromaScale);
    }

    // 4. Temperature shift (reduced chance and magnitude)
    if (rand() < 0.25) {
      const tempShift = (rand() - 0.5) * CONFIG.perturbScale;
      applyTemperatureShift(p, tempShift);
    }

    // 5. Per-channel phase jitter (adds interest without breaking structure)
    if (rand() < 0.35) {
      for (const i of INDICES) {
        p.d[i] = wrapPhase(p.d[i] + (rand() - 0.5) * CONFIG.perturbScale * 0.2);
      }
    }

    // 6. Amplitude jitter
    if (rand() < 0.3) {
      for (const i of INDICES) {
        p.b[i] = clamp(
          p.b[i] + (rand() - 0.5) * CONFIG.perturbScale * 0.15,
          -0.5,
          0.5
        );
      }
    }
  }

  // Frequency changes (preserves structure)
  if (rand() < 0.2) {
    const freqMult = 0.9 + rand() * 0.2;
    for (const i of INDICES) {
      p.c[i] = clamp(p.c[i] * freqMult, 0.1, 3);
    }
  }

  return toCoeffs(p);
}

// ============================================================================
// Similarity Calculation
// ============================================================================

/**
 * Calculate perceptual similarity between two palettes
 * Uses OKLAB distance for perceptually uniform comparison
 */
function calculatePerceptualSimilarity(
  coeffs1: CosineCoeffs,
  coeffs2: CosineCoeffs
): number {
  const samples1 = cosineGradient(10, coeffs1);
  const samples2 = cosineGradient(10, coeffs2);

  let totalDist = 0;
  for (let i = 0; i < samples1.length; i++) {
    const [r1, g1, b1] = samples1[i]!;
    const [r2, g2, b2] = samples2[i]!;

    const lab1 = linearRgbToOklab(r1, g1, b1);
    const lab2 = linearRgbToOklab(r2, g2, b2);

    // Euclidean distance in OKLAB (perceptually uniform)
    const dL = lab1.L - lab2.L;
    const da = lab1.a - lab2.a;
    const db = lab1.b - lab2.b;
    totalDist += Math.sqrt(dL * dL + da * da + db * db);
  }

  // Convert distance to similarity (0-1)
  // Max possible distance in OKLAB is roughly 1.5
  const avgDist = totalDist / samples1.length;
  return Math.max(0, 1 - avgDist / 0.8);
}

export function calculateSimilarity(a: CosineCoeffs, b: CosineCoeffs): number {
  return calculatePerceptualSimilarity(a, b);
}

function avgSimilarity(generated: CosineCoeffs, inputs: CosineCoeffs[]): number {
  let total = 0;
  for (const input of inputs) {
    total += calculatePerceptualSimilarity(generated, input);
  }
  return total / inputs.length;
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Remove near-duplicate palettes to prevent bias toward repeated inputs
 */
function deduplicatePalettes(palettes: CosineCoeffs[], threshold = 0.95): CosineCoeffs[] {
  if (palettes.length <= 1) return palettes;

  const unique: CosineCoeffs[] = [palettes[0]!];

  for (let i = 1; i < palettes.length; i++) {
    const candidate = palettes[i]!;
    let isDuplicate = false;

    for (const existing of unique) {
      const similarity = calculatePerceptualSimilarity(candidate, existing);
      if (similarity > threshold) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      unique.push(candidate);
    }
  }

  return unique;
}

/**
 * Deduplicate generated palettes to ensure variety in output
 */
function deduplicateOutput(
  candidates: GeneratedPalette[],
  threshold: number
): GeneratedPalette[] {
  if (candidates.length <= 1) return candidates;

  const unique: GeneratedPalette[] = [candidates[0]!];

  for (let i = 1; i < candidates.length; i++) {
    const candidate = candidates[i]!;
    let isDuplicate = false;

    for (const existing of unique) {
      const similarity = calculatePerceptualSimilarity(candidate.coeffs, existing.coeffs);
      if (similarity > threshold) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      unique.push(candidate);
    }
  }

  return unique;
}

/**
 * Generate palette variations from input palettes
 *
 * Uses a retry loop to ensure output diversity:
 * - Generates candidates in batches
 * - Deduplicates outputs to remove similar palettes
 * - Continues generating until target count is reached or max attempts exceeded
 */
export function generateMix(
  palettes: CosineCoeffs[],
  options: MixOptions = {}
): MixResult {
  const count = options.count ?? 20;
  const seed = options.seed ?? Date.now();
  const dedupThreshold = options.dedupThreshold ?? 0.92;
  const maxAttempts = options.maxAttempts ?? 200;
  const rand = createRNG(seed);

  if (palettes.length === 0) {
    throw new Error("At least one input palette is required");
  }

  // Deduplicate inputs to prevent bias from repeated similar palettes
  const uniquePalettes = deduplicatePalettes(palettes);

  const collective = analyzeCollective(uniquePalettes);
  let allCandidates: GeneratedPalette[] = [];
  let uniqueOutput: GeneratedPalette[] = [];
  let attempts = 0;
  const batchSize = Math.max(10, count); // Generate at least 10 per batch

  // Keep generating until we have enough unique outputs or hit max attempts
  while (uniqueOutput.length < count && attempts < maxAttempts) {
    // Generate a batch of candidates
    for (let i = 0; i < batchSize && attempts < maxAttempts; i++) {
      const coeffs = generateVariation(collective, rand);
      allCandidates.push({
        coeffs,
        analysis: analyzePalette(coeffs),
        similarity: avgSimilarity(coeffs, uniquePalettes),
      });
      attempts++;
    }

    // Sort all candidates by similarity (best matches first)
    allCandidates.sort((a, b) => b.similarity - a.similarity);

    // Deduplicate to get unique outputs
    uniqueOutput = deduplicateOutput(allCandidates, dedupThreshold);

    // If we're making no progress, slightly lower the threshold to allow more through
    // This prevents infinite loops when inputs are very constrained
    if (uniqueOutput.length < count && attempts >= maxAttempts * 0.75) {
      uniqueOutput = deduplicateOutput(allCandidates, dedupThreshold + 0.03);
    }
  }

  return {
    collective,
    output: uniqueOutput.slice(0, count),
  };
}

/**
 * Simple helper - just returns the coefficients
 */
export function quickMix(palettes: CosineCoeffs[], count: number): CosineCoeffs[] {
  return generateMix(palettes, { count }).output.map((p) => p.coeffs);
}
