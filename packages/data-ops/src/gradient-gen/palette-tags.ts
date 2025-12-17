/**
 * Palette Tagging System
 * Derives semantic tags from IQ cosine coefficients
 */

import type { CosineCoeffs as MatrixCoeffs } from './cosine';

const TAU = Math.PI * 2;

// =============================================================================
// Types
// =============================================================================

/** Named coefficient format used by tag analysis */
export interface NamedCosineCoeffs {
  a: [number, number, number];
  b: [number, number, number];
  c: [number, number, number];
  d: [number, number, number];
}

export type TextureTag = 'monochrome' | 'subtle' | 'soft' | 'rich' | 'bold' | 'vivid' | 'electric';
export type WarmthTag = 'warm' | 'cool' | 'neutral';
export type JourneyTag = 'warming' | 'cooling' | 'stable';
export type ContrastTag = 'gentle' | 'smooth' | 'dynamic' | 'dramatic';

export interface PaletteTags {
  dominantColors: string[];
  texture: TextureTag;
  warmth: WarmthTag;
  journey: JourneyTag;
  contrast: ContrastTag;
}

// =============================================================================
// Tag Category Definitions
// =============================================================================

export const TAG_CATEGORIES = {
  dominantColor: {
    description: 'primary colors detected in palette (1-3)',
    values: [
      'crimson', 'coral', 'salmon', 'rose', 'pink', 'magenta', 'orchid', 'plum', 'violet', 'purple',
      'indigo', 'navy', 'blue', 'azure', 'teal', 'turquoise', 'aqua', 'cyan', 'mint', 'green',
      'lime', 'olive', 'khaki', 'gold', 'yellow', 'orange', 'tan', 'peach', 'beige', 'chocolate',
      'brown', 'maroon', 'charcoal', 'slate', 'gray', 'silver', 'ivory', 'white', 'black', 'lavender'
    ]
  },
  texture: {
    description: 'saturation character of the palette',
    values: ['monochrome', 'subtle', 'soft', 'rich', 'bold', 'vivid', 'electric'] as TextureTag[]
  },
  warmth: {
    description: 'overall color temperature',
    values: ['warm', 'cool', 'neutral'] as WarmthTag[]
  },
  journey: {
    description: 'how temperature changes across the palette',
    values: ['warming', 'cooling', 'stable'] as JourneyTag[]
  },
  contrast: {
    description: 'tonal variation intensity',
    values: ['gentle', 'smooth', 'dynamic', 'dramatic'] as ContrastTag[]
  }
} as const;

// =============================================================================
// Basic Colors (for dominant color detection via colorDistance)
// =============================================================================

const BASIC_COLORS: Array<{ name: string; r: number; g: number; b: number }> = [
  { name: 'black', r: 0, g: 0, b: 0 },
  { name: 'white', r: 255, g: 255, b: 255 },
  { name: 'red', r: 255, g: 0, b: 0 },
  { name: 'green', r: 0, g: 128, b: 0 },
  { name: 'blue', r: 0, g: 0, b: 255 },
  { name: 'yellow', r: 255, g: 255, b: 0 },
  { name: 'cyan', r: 0, g: 255, b: 255 },
  { name: 'magenta', r: 255, g: 0, b: 255 },
  { name: 'orange', r: 255, g: 165, b: 0 },
  { name: 'pink', r: 255, g: 192, b: 203 },
  { name: 'purple', r: 128, g: 0, b: 128 },
  { name: 'brown', r: 165, g: 42, b: 42 },
  { name: 'gray', r: 128, g: 128, b: 128 },
  { name: 'gold', r: 255, g: 215, b: 0 },
  { name: 'teal', r: 0, g: 128, b: 128 },
  { name: 'navy', r: 0, g: 0, b: 128 },
  { name: 'maroon', r: 128, g: 0, b: 0 },
  { name: 'olive', r: 128, g: 128, b: 0 },
  { name: 'turquoise', r: 64, g: 224, b: 208 },
  { name: 'indigo', r: 75, g: 0, b: 130 },
  { name: 'violet', r: 238, g: 130, b: 238 },
  { name: 'beige', r: 245, g: 245, b: 220 },
  { name: 'tan', r: 210, g: 180, b: 140 },
  { name: 'coral', r: 255, g: 127, b: 80 },
  { name: 'salmon', r: 250, g: 128, b: 114 },
  { name: 'khaki', r: 240, g: 230, b: 140 },
  { name: 'lavender', r: 230, g: 230, b: 250 },
  { name: 'peach', r: 255, g: 218, b: 185 },
  { name: 'mint', r: 189, g: 252, b: 201 },
  { name: 'lime', r: 0, g: 255, b: 0 },
  { name: 'aqua', r: 0, g: 255, b: 255 },
  { name: 'silver', r: 192, g: 192, b: 192 },
  { name: 'crimson', r: 220, g: 20, b: 60 },
  { name: 'chocolate', r: 210, g: 105, b: 30 },
  { name: 'ivory', r: 255, g: 255, b: 240 },
  { name: 'azure', r: 240, g: 255, b: 255 },
  { name: 'plum', r: 221, g: 160, b: 221 },
  { name: 'orchid', r: 218, g: 112, b: 214 },
  { name: 'rose', r: 255, g: 0, b: 127 },
  { name: 'slate', r: 112, g: 128, b: 144 },
  { name: 'charcoal', r: 54, g: 69, b: 79 },
];

// =============================================================================
// Helper Functions
// =============================================================================

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr + dg * dg + db * db;
}

function findClosestColorName(r: number, g: number, b: number): string {
  let closestName = 'gray';
  let minDist = Infinity;
  for (const c of BASIC_COLORS) {
    const dist = colorDistance(r * 255, g * 255, b * 255, c.r, c.g, c.b);
    if (dist < minDist) {
      minDist = dist;
      closestName = c.name;
    }
  }
  return closestName;
}

function cosineColor(
  t: number,
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number]
): [number, number, number] {
  return [
    Math.max(0, Math.min(1, a[0] + b[0] * Math.cos(TAU * (c[0] * t + d[0])))),
    Math.max(0, Math.min(1, a[1] + b[1] * Math.cos(TAU * (c[1] * t + d[1])))),
    Math.max(0, Math.min(1, a[2] + b[2] * Math.cos(TAU * (c[2] * t + d[2])))),
  ];
}

// =============================================================================
// Format Conversion
// =============================================================================

/**
 * Convert from 4x4 matrix format to named {a, b, c, d} format.
 * Matrix format: [[a_r, a_g, a_b, 1], [b_r, b_g, b_b, 1], [c_r, c_g, c_b, 1], [d_r, d_g, d_b, 1]]
 */
export function matrixToNamedCoeffs(matrix: MatrixCoeffs): NamedCosineCoeffs {
  return {
    a: [matrix[0][0], matrix[0][1], matrix[0][2]],
    b: [matrix[1][0], matrix[1][1], matrix[1][2]],
    c: [matrix[2][0], matrix[2][1], matrix[2][2]],
    d: [matrix[3][0], matrix[3][1], matrix[3][2]],
  };
}

// =============================================================================
// Main Tag Analysis Function
// =============================================================================

/**
 * Analyze palette tags from named coefficient format {a, b, c, d}
 */
export function analyzePaletteTags(coeffs: NamedCosineCoeffs): PaletteTags {
  const { a, b, c, d } = coeffs;
  const tags: PaletteTags = {
    dominantColors: [],
    texture: 'soft',
    warmth: 'neutral',
    journey: 'stable',
    contrast: 'smooth'
  };

  // Sample the palette at multiple points
  const samplePoints = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
  const samples = samplePoints.map(t => {
    const [r, g, bl] = cosineColor(t, a, b, c, d);
    const temp = r - bl;
    const saturation = Math.max(r, g, bl) - Math.min(r, g, bl);
    const colorName = saturation > 0.08 ? findClosestColorName(r, g, bl) : null;
    return { r, g, bl, temp, saturation, colorName };
  });

  // --- DOMINANT COLORS (1-3 with increasing thresholds) ---
  const colorStats = new Map<string, { count: number; totalSat: number }>();
  for (const s of samples) {
    if (s.colorName) {
      const existing = colorStats.get(s.colorName);
      if (existing) {
        existing.count++;
        existing.totalSat += s.saturation;
      } else {
        colorStats.set(s.colorName, { count: 1, totalSat: s.saturation });
      }
    }
  }

  const sortedColors = Array.from(colorStats.entries())
    .map(([name, stats]) => ({
      name,
      count: stats.count,
      avgSat: stats.totalSat / stats.count,
      score: stats.count * (stats.totalSat / stats.count)
    }))
    .sort((a, b) => b.score - a.score);

  const totalSamples = samples.filter(s => s.colorName).length;

  if (sortedColors.length > 0) {
    const first = sortedColors[0]!;
    // 1st color: always include
    tags.dominantColors.push(first.name);

    // 2nd color: must appear in at least 15% AND have at least 30% the score of first
    if (sortedColors.length > 1) {
      const second = sortedColors[1]!;
      if (second.count >= totalSamples * 0.15 && second.score >= first.score * 0.3) {
        tags.dominantColors.push(second.name);

        // 3rd color: must appear in at least 15% AND have at least 50% the score of second
        if (sortedColors.length > 2) {
          const third = sortedColors[2]!;
          if (third.count >= totalSamples * 0.15 && third.score >= second.score * 0.5) {
            tags.dominantColors.push(third.name);
          }
        }
      }
    }
  } else {
    // Fallback: use midpoint color even if low saturation
    const mid = samples[Math.floor(samples.length / 2)]!;
    tags.dominantColors.push(findClosestColorName(mid.r, mid.g, mid.bl));
  }

  // --- TEXTURE (saturation character) ---
  const avgSat = samples.reduce((sum, s) => sum + s.saturation, 0) / samples.length;
  if (avgSat < 0.05) tags.texture = 'monochrome';
  else if (avgSat < 0.15) tags.texture = 'subtle';
  else if (avgSat < 0.28) tags.texture = 'soft';
  else if (avgSat < 0.42) tags.texture = 'rich';
  else if (avgSat < 0.55) tags.texture = 'bold';
  else if (avgSat < 0.7) tags.texture = 'vivid';
  else tags.texture = 'electric';

  // --- OVERALL WARMTH (static temperature) ---
  const avgTemp = samples.reduce((sum, s) => sum + s.temp, 0) / samples.length;
  if (avgTemp > 0.1) tags.warmth = 'warm';
  else if (avgTemp < -0.1) tags.warmth = 'cool';
  else tags.warmth = 'neutral';

  // --- COLOR JOURNEY (temperature direction) ---
  const tempDelta = samples[samples.length - 1]!.temp - samples[0]!.temp;
  if (tempDelta > 0.15) tags.journey = 'warming';
  else if (tempDelta < -0.15) tags.journey = 'cooling';
  else tags.journey = 'stable';

  // --- CONTRAST (from amplitude) ---
  const avgAmplitude = (Math.abs(b[0]) + Math.abs(b[1]) + Math.abs(b[2])) / 3;
  if (avgAmplitude < 0.15) tags.contrast = 'gentle';
  else if (avgAmplitude < 0.28) tags.contrast = 'smooth';
  else if (avgAmplitude < 0.42) tags.contrast = 'dynamic';
  else tags.contrast = 'dramatic';

  return tags;
}

/**
 * Analyze palette tags from 4x4 matrix coefficient format.
 * This is a convenience wrapper for use with deserializeCoeffs output.
 */
export function analyzeCoefficients(coeffs: MatrixCoeffs): PaletteTags {
  return analyzePaletteTags(matrixToNamedCoeffs(coeffs));
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a short tag string from palette tags.
 * Example: "coral warm smooth" or "blue teal cool dynamic"
 */
export function tagsToString(tags: PaletteTags): string {
  const parts = [
    ...tags.dominantColors,
    tags.warmth !== 'neutral' ? tags.warmth : null,
    tags.texture !== 'soft' ? tags.texture : null,
    tags.contrast !== 'smooth' ? tags.contrast : null,
    tags.journey !== 'stable' ? tags.journey : null,
  ].filter(Boolean);

  return parts.join(' ');
}

/**
 * Generate all individual tag values as an array.
 * Useful for filtering and categorization.
 */
export function tagsToArray(tags: PaletteTags): string[] {
  return [
    ...tags.dominantColors,
    tags.texture,
    tags.warmth,
    tags.journey,
    tags.contrast,
  ];
}

// =============================================================================
// Palette Validation
// =============================================================================

/**
 * Check if a palette's colors array represents a valid, non-corrupted gradient.
 * Returns false for:
 * - Empty colors array
 * - All black colors (corrupted)
 * - All identical colors (no gradient)
 * - Extremely low brightness across all colors
 */
export function isValidPaletteColors(colors: string[]): boolean {
  if (!colors || colors.length === 0) return false;

  // Parse hex colors to RGB
  const rgbColors = colors.map(hex => {
    const clean = hex.replace('#', '');
    return {
      r: parseInt(clean.slice(0, 2), 16) || 0,
      g: parseInt(clean.slice(2, 4), 16) || 0,
      b: parseInt(clean.slice(4, 6), 16) || 0,
    };
  });

  // Check average brightness - reject if all colors are nearly black
  const avgBrightness = rgbColors.reduce((sum, c) => sum + (c.r + c.g + c.b) / 3, 0) / rgbColors.length;
  if (avgBrightness < 5) return false; // Average brightness < 5/255 = corrupted/black

  // Check for color variation - reject if all colors are identical
  if (rgbColors.length > 1) {
    const first = rgbColors[0]!;
    const allSame = rgbColors.every(c =>
      Math.abs(c.r - first.r) < 3 &&
      Math.abs(c.g - first.g) < 3 &&
      Math.abs(c.b - first.b) < 3
    );
    if (allSame) return false;
  }

  return true;
}

/**
 * Validate a palette from its coefficient matrix.
 * Samples the gradient and checks for corrupted output.
 */
export function isValidPaletteCoeffs(coeffs: MatrixCoeffs): boolean {
  const named = matrixToNamedCoeffs(coeffs);
  const { a, b, c, d } = named;

  // Sample at 5 points
  const samples = [0, 0.25, 0.5, 0.75, 1].map(t => cosineColor(t, a, b, c, d));

  // Check average brightness
  const avgBrightness = samples.reduce((sum, [r, g, bl]) => sum + (r + g + bl) / 3, 0) / samples.length;
  if (avgBrightness < 0.02) return false; // < 2% brightness = corrupted

  // Check for variation
  const first = samples[0]!;
  const allSame = samples.every(([r, g, bl]) =>
    Math.abs(r - first[0]) < 0.02 &&
    Math.abs(g - first[1]) < 0.02 &&
    Math.abs(bl - first[2]) < 0.02
  );
  if (allSame && avgBrightness < 0.1) return false; // All same and dark = likely corrupted

  return true;
}
