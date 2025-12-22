/**
 * Color Harmony Detection Library
 *
 * Detects color harmonies using OkLCh color space (perceptually uniform)
 * and standard color theory angle relationships.
 *
 * References:
 * - OkLab: https://bottosson.github.io/posts/oklab/
 * - Color harmonies: https://www.sessions.edu/color-calculator/
 */

import { hexToOkLch, type OkLch } from './color-utils';

// =============================================================================
// Types
// =============================================================================

export type HarmonyType =
  | 'monochromatic'
  | 'analogous'
  | 'complementary'
  | 'split-complementary'
  | 'triadic'
  | 'tetradic';

export interface DetectedHarmony {
  type: HarmonyType;
  confidence: number;
}

// =============================================================================
// Hue Analysis Utilities
// =============================================================================

/** Angular distance between two hues (0-180) */
function hueDist(h1: number, h2: number): number {
  const diff = Math.abs(h1 - h2);
  return Math.min(diff, 360 - diff);
}

/** Normalize hue to 0-360 */
function normalizeHue(h: number): number {
  return ((h % 360) + 360) % 360;
}

/** Circular mean of hues weighted by chroma */
function weightedHueMean(colors: OkLch[]): number {
  let sinSum = 0;
  let cosSum = 0;
  let totalWeight = 0;

  for (const c of colors) {
    const weight = c.C;
    const rad = (c.h * Math.PI) / 180;
    sinSum += Math.sin(rad) * weight;
    cosSum += Math.cos(rad) * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;
  let mean = (Math.atan2(sinSum, cosSum) * 180) / Math.PI;
  if (mean < 0) mean += 360;
  return mean;
}

// =============================================================================
// Dominant Hue Extraction
// =============================================================================

interface DominantHue {
  hue: number;
  weight: number; // Total chroma weight
}

/**
 * Extract dominant hues from a gradient by sampling key positions
 * and clustering similar hues together.
 */
function extractDominantHues(hexColors: string[]): DominantHue[] {
  // Sample 5 key positions: start, 25%, middle, 75%, end
  const len = hexColors.length;
  const sampleIndices = [
    0,
    Math.floor(len * 0.25),
    Math.floor(len * 0.5),
    Math.floor(len * 0.75),
    len - 1,
  ];

  const samples: OkLch[] = [];
  for (const idx of sampleIndices) {
    const hex = hexColors[idx];
    if (hex) {
      const oklch = hexToOkLch(hex);
      // Only include chromatic colors (C > 0.02 is visible saturation)
      if (oklch.C > 0.02) {
        samples.push(oklch);
      }
    }
  }

  if (samples.length === 0) return [];

  // Cluster hues within 25° of each other
  const clusters: OkLch[][] = [];
  const used = new Set<number>();

  for (let i = 0; i < samples.length; i++) {
    if (used.has(i)) continue;

    const cluster: OkLch[] = [samples[i]!];
    used.add(i);

    for (let j = i + 1; j < samples.length; j++) {
      if (used.has(j)) continue;
      if (hueDist(samples[i]!.h, samples[j]!.h) <= 25) {
        cluster.push(samples[j]!);
        used.add(j);
      }
    }
    clusters.push(cluster);
  }

  // Convert clusters to dominant hues
  const dominants: DominantHue[] = clusters.map((cluster) => ({
    hue: weightedHueMean(cluster),
    weight: cluster.reduce((sum, c) => sum + c.C, 0),
  }));

  // Sort by weight (most prominent first)
  return dominants.sort((a, b) => b.weight - a.weight);
}

// =============================================================================
// Harmony Detection Functions
// =============================================================================

/**
 * Monochromatic: Single hue (all dominant hues within ~15°)
 */
function detectMonochromatic(hues: DominantHue[]): number {
  if (hues.length <= 1) return 1;

  // Check if all hues are within 15° of each other
  for (let i = 0; i < hues.length; i++) {
    for (let j = i + 1; j < hues.length; j++) {
      if (hueDist(hues[i]!.hue, hues[j]!.hue) > 15) {
        return 0;
      }
    }
  }
  return 1;
}

/**
 * Analogous: Adjacent colors within 30-60° range
 * Classic analogous is 3 colors, each ~30° apart
 */
function detectAnalogous(hues: DominantHue[]): number {
  if (hues.length < 2) return 0;

  // Find total hue span
  let maxSpan = 0;
  for (let i = 0; i < hues.length; i++) {
    for (let j = i + 1; j < hues.length; j++) {
      maxSpan = Math.max(maxSpan, hueDist(hues[i]!.hue, hues[j]!.hue));
    }
  }

  // Analogous: span should be 25-90° (allows for 2-3 adjacent hues)
  if (maxSpan >= 25 && maxSpan <= 90) return 1;
  return 0;
}

/**
 * Complementary: Two hues ~180° apart
 */
function detectComplementary(hues: DominantHue[]): number {
  if (hues.length < 2) return 0;

  // Check if any two dominant hues are near-complementary
  for (let i = 0; i < hues.length; i++) {
    for (let j = i + 1; j < hues.length; j++) {
      const dist = hueDist(hues[i]!.hue, hues[j]!.hue);
      // Within 20° of true complement (180°)
      if (dist >= 160 && dist <= 180) return 1;
    }
  }
  return 0;
}

/**
 * Split-complementary: Base hue + two hues at ~150° and ~210° (±30° from complement)
 */
function detectSplitComplementary(hues: DominantHue[]): number {
  if (hues.length < 3) return 0;

  const primary = hues[0]!;
  const complement = normalizeHue(primary.hue + 180);
  const split1 = normalizeHue(complement - 30); // 150° from primary
  const split2 = normalizeHue(complement + 30); // 210° from primary

  let foundSplit1 = false;
  let foundSplit2 = false;

  for (let i = 1; i < hues.length; i++) {
    const h = hues[i]!.hue;
    if (hueDist(h, split1) <= 20) foundSplit1 = true;
    if (hueDist(h, split2) <= 20) foundSplit2 = true;
  }

  return foundSplit1 && foundSplit2 ? 1 : 0;
}

/**
 * Triadic: Three hues ~120° apart
 */
function detectTriadic(hues: DominantHue[]): number {
  if (hues.length < 3) return 0;

  const primary = hues[0]!;
  const pos1 = normalizeHue(primary.hue + 120);
  const pos2 = normalizeHue(primary.hue + 240);

  let found1 = false;
  let found2 = false;

  for (let i = 1; i < hues.length; i++) {
    const h = hues[i]!.hue;
    if (hueDist(h, pos1) <= 20) found1 = true;
    if (hueDist(h, pos2) <= 20) found2 = true;
  }

  return found1 && found2 ? 1 : 0;
}

/**
 * Tetradic (Square): Four hues ~90° apart
 */
function detectTetradic(hues: DominantHue[]): number {
  if (hues.length < 4) return 0;

  const primary = hues[0]!;
  const positions = [
    normalizeHue(primary.hue + 90),
    normalizeHue(primary.hue + 180),
    normalizeHue(primary.hue + 270),
  ];

  let matches = 0;
  for (const pos of positions) {
    for (let i = 1; i < hues.length; i++) {
      if (hueDist(hues[i]!.hue, pos) <= 20) {
        matches++;
        break;
      }
    }
  }

  return matches >= 3 ? 1 : 0;
}

// =============================================================================
// Main API
// =============================================================================

/**
 * Detect color harmonies in a palette.
 *
 * Uses OkLCh color space for perceptually uniform hue analysis.
 * Only returns harmonies that clearly match - no partial matches.
 *
 * @param hexColors - Array of hex color strings from the gradient
 * @param maxResults - Maximum number of harmonies to return (default: 3)
 * @returns Array of detected harmonies (empty if no clear harmony found)
 */
export function detectHarmonies(
  hexColors: string[],
  maxResults: number = 3
): DetectedHarmony[] {
  if (!hexColors || hexColors.length < 2) return [];

  // Extract dominant hues using OkLCh
  const dominantHues = extractDominantHues(hexColors);

  // No chromatic content = no harmony
  if (dominantHues.length === 0) return [];

  // Test each harmony type (order matters - more specific first)
  const results: DetectedHarmony[] = [];

  // Monochromatic - single hue family
  if (detectMonochromatic(dominantHues)) {
    results.push({ type: 'monochromatic', confidence: 1 });
  }

  // Only check multi-hue harmonies if we have multiple distinct hues
  if (dominantHues.length >= 2 && !results.some((r) => r.type === 'monochromatic')) {
    if (detectComplementary(dominantHues)) {
      results.push({ type: 'complementary', confidence: 1 });
    }

    if (detectAnalogous(dominantHues)) {
      results.push({ type: 'analogous', confidence: 1 });
    }
  }

  if (dominantHues.length >= 3) {
    if (detectTriadic(dominantHues)) {
      results.push({ type: 'triadic', confidence: 1 });
    }

    if (detectSplitComplementary(dominantHues)) {
      results.push({ type: 'split-complementary', confidence: 1 });
    }
  }

  if (dominantHues.length >= 4) {
    if (detectTetradic(dominantHues)) {
      results.push({ type: 'tetradic', confidence: 1 });
    }
  }

  return results.slice(0, maxResults);
}

/**
 * Get a human-readable description of a harmony type.
 */
export function getHarmonyDescription(type: HarmonyType): string {
  switch (type) {
    case 'monochromatic':
      return 'Single hue family';
    case 'analogous':
      return 'Adjacent colors (30-90°)';
    case 'complementary':
      return 'Opposite colors (180°)';
    case 'split-complementary':
      return 'Base + split complement (150°/210°)';
    case 'triadic':
      return 'Three colors (120° apart)';
    case 'tetradic':
      return 'Four colors (90° apart)';
  }
}

/**
 * Format harmonies as a short string for display.
 */
export function harmoniesToString(harmonies: DetectedHarmony[]): string {
  if (harmonies.length === 0) return '';
  return harmonies.map((h) => h.type).join(', ');
}
