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

// ============================================================================
// Palette Deduplication - Perceptual Color Space Comparison
// ============================================================================

export type RGB = { r: number; g: number; b: number }
export type LAB = { L: number; a: number; b: number }

const DEDUP_SAMPLE_POINTS = 5

export function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '').toLowerCase()
  let expanded = clean
  if (clean.length === 3) {
    expanded = `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`
  }
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  }
}

export function rgbToLab(rgb: RGB): LAB {
  // RGB to XYZ (sRGB D65)
  let r = rgb.r / 255
  let g = rgb.g / 255
  let b = rgb.b / 255

  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92

  let x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047
  let y = (r * 0.2126729 + g * 0.7151522 + b * 0.0721750) / 1.0
  let z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883

  x = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x) + 16/116
  y = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y) + 16/116
  z = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z) + 16/116

  return {
    L: (116 * y) - 16,
    a: 500 * (x - y),
    b: 200 * (y - z),
  }
}

/** CIE76 Delta E - perceptual color distance */
export function deltaE(lab1: LAB, lab2: LAB): number {
  const dL = lab1.L - lab2.L
  const da = lab1.a - lab2.a
  const db = lab1.b - lab2.b
  return Math.sqrt(dL * dL + da * da + db * db)
}

/** Pre-compute normalized LAB samples for a palette (call once per palette) */
export function computeLabSamples(colors: string[], samplePoints = DEDUP_SAMPLE_POINTS): LAB[] {
  if (colors.length === 0) return []

  const samples: LAB[] = []
  for (let i = 0; i < samplePoints; i++) {
    const t = i / (samplePoints - 1)
    const srcIndex = t * (colors.length - 1)
    const lower = Math.floor(srcIndex)
    const upper = Math.min(lower + 1, colors.length - 1)
    const frac = srcIndex - lower

    const lowerColor = colors[lower]
    const upperColor = colors[upper]
    if (!lowerColor || !upperColor) continue

    const c1 = hexToRgb(lowerColor)
    const c2 = hexToRgb(upperColor)

    const interpolated: RGB = {
      r: Math.round(c1.r + (c2.r - c1.r) * frac),
      g: Math.round(c1.g + (c2.g - c1.g) * frac),
      b: Math.round(c1.b + (c2.b - c1.b) * frac),
    }
    samples.push(rgbToLab(interpolated))
  }
  return samples
}

/** Fast distance using pre-computed LAB arrays */
export function labArrayDistance(a: LAB[], b: LAB[]): number {
  if (a.length !== b.length || a.length === 0) return Infinity
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const labA = a[i]
    const labB = b[i]
    if (!labA || !labB) continue
    sum += deltaE(labA, labB)
  }
  return sum / a.length
}

/** Compare using pre-computed LAB, check both forward and reversed directions */
export function comparePalettes(
  labA: LAB[],
  labB: LAB[],
  labBReversed: LAB[]
): { distance: number; reversed: boolean } {
  const forwardDist = labArrayDistance(labA, labB)
  const reverseDist = labArrayDistance(labA, labBReversed)

  if (reverseDist < forwardDist) {
    return { distance: reverseDist, reversed: true }
  }
  return { distance: forwardDist, reversed: false }
}

export interface PaletteForDedup {
  colors: string[]
  labSamples: LAB[]
  labSamplesReversed: LAB[]
}

/** Prepare a palette for deduplication by pre-computing LAB samples */
export function preparePaletteForDedup(colors: string[]): PaletteForDedup {
  const labSamples = computeLabSamples(colors)
  return {
    colors,
    labSamples,
    labSamplesReversed: [...labSamples].reverse(),
  }
}

export interface DeduplicationResult<T extends PaletteForDedup> {
  unique: Array<T & { duplicates: Array<T & { distance: number; reversed: boolean }> }>
  duplicateCount: number
}

/**
 * Deduplicate palettes using perceptual color distance (LAB/deltaE).
 * Checks both forward and reversed directions.
 *
 * @param palettes - Array of palettes with pre-computed LAB samples
 * @param threshold - Average deltaE threshold (higher = more aggressive dedup)
 *   - < 5: Very strict (only nearly identical palettes)
 *   - 5-10: Similar palettes
 *   - > 10: Loose matching
 */
export function deduplicatePalettes<T extends PaletteForDedup>(
  palettes: T[],
  threshold: number
): DeduplicationResult<T> {
  const unique: Array<T & { duplicates: Array<T & { distance: number; reversed: boolean }> }> = []
  let duplicateCount = 0

  for (const palette of palettes) {
    let matchIndex = -1
    let matchDistance = Infinity
    let matchReversed = false

    for (let i = 0; i < unique.length; i++) {
      const existing = unique[i]
      if (!existing) continue
      const { distance, reversed } = comparePalettes(
        palette.labSamples,
        existing.labSamples,
        existing.labSamplesReversed
      )
      if (distance < threshold) {
        if (distance < matchDistance) {
          matchIndex = i
          matchDistance = distance
          matchReversed = reversed
        }
        break // Early exit on first match for speed
      }
    }

    if (matchIndex >= 0) {
      const matched = unique[matchIndex]
      if (matched) {
        matched.duplicates.push({
          ...palette,
          distance: matchDistance,
          reversed: matchReversed,
        })
        duplicateCount++
      }
    } else {
      unique.push({
        ...palette,
        duplicates: [],
      })
    }
  }

  return { unique, duplicateCount }
}
