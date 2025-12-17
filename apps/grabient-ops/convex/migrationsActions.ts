'use node'

import { internalAction } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'
import { deserializeCoeffs, isValidSeed } from '@repo/data-ops/serialization'
import {
  calculateAverageBrightness,
  calculateAverageFrequency,
  calculateContrast,
  type CosineCoeffs,
} from '@repo/data-ops/gradient-gen'

// ============================================================================
// Types
// ============================================================================

interface GeneratedPalette {
  _id: string
  cycle: number
  tag: string
  theme?: string
  seed?: string
  colors: string[]
  style?: string
  steps?: number
  angle?: number
  modelKey?: string
}

interface StagedPaletteData {
  similarityKey: string
  sourceId: string
  cycle: number
  tag: string
  seed: string
  colors: string[]
  style?: string
  steps?: number
  angle?: number
  modelKey?: string
  themes: string[]
}

interface FilterStats {
  total: number
  noSeed: number
  invalidSeed: number
  dominated: number // 90%+ same color
  lowContrast: number
  highFrequency: number
  duplicates: number
  passed: number
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a 2-decimal precision similarity key from a cosine seed.
 * This allows grouping "near-duplicate" palettes together.
 */
function createSimilarityKey(seed: string): string | null {
  if (!isValidSeed(seed)) return null

  try {
    const { coeffs, globals } = deserializeCoeffs(seed)

    // Round all coefficient values to 2 decimal places
    const parts: string[] = []
    for (const vec of coeffs) {
      parts.push(vec[0].toFixed(2), vec[1].toFixed(2), vec[2].toFixed(2))
    }
    // Add globals rounded to 2 decimals
    parts.push(...globals.map((g: number) => g.toFixed(2)))

    return parts.join('|')
  } catch {
    return null
  }
}

/**
 * Check if a palette is dominated by a single color (90%+ same color).
 */
function isDominatedPalette(colors: string[]): boolean {
  if (colors.length === 0) return true

  // Normalize colors to lowercase for comparison
  const normalizedColors = colors.map(c => c.toLowerCase())
  const firstColor = normalizedColors[0]
  const sameCount = normalizedColors.filter(c => c === firstColor).length

  return sameCount / colors.length > 0.9
}

/**
 * Check if frequency is too high (jittery/chaotic gradients).
 * Threshold: average frequency > 1.5
 */
function isHighFrequency(coeffs: CosineCoeffs): boolean {
  const avgFreq = calculateAverageFrequency(coeffs)
  return avgFreq > 1.5
}

/**
 * Check if contrast is too low (visually flat gradients).
 * Threshold: contrast < 0.05
 */
function isLowContrast(colors: string[]): boolean {
  const contrast = calculateContrast(colors)
  return contrast < 0.05
}

// ============================================================================
// Main Deduplication Action
// ============================================================================

/**
 * Process ALL generated_palettes and create staged_palettes with deduplication + quality filters.
 *
 * This action:
 * 1. Paginates through all generated_palettes (can handle 44k+)
 * 2. Applies quality filters in memory
 * 3. Deduplicates using 2-decimal precision similarity keys
 * 4. Writes results to staged_palettes in batches
 *
 * Run via: npx convex run migrationsActions:processAndStagePalettes '{}'
 */
export const processAndStagePalettes = internalAction({
  args: {
    clearFirst: v.optional(v.boolean()), // Clear staged_palettes before processing
    minContrast: v.optional(v.number()), // Override default contrast threshold (0.05)
    maxFrequency: v.optional(v.number()), // Override default frequency threshold (1.5)
  },
  handler: async (ctx, args) => {
    const { clearFirst = true, minContrast = 0.05, maxFrequency = 1.5 } = args

    console.log('Starting staged palette processing...')
    console.log(`Filters: minContrast=${minContrast}, maxFrequency=${maxFrequency}`)

    // Step 1: Clear existing staged_palettes if requested
    if (clearFirst) {
      console.log('Clearing existing staged_palettes...')
      const deleteResult = await ctx.runMutation(internal.migrations.clearStagedPalettes, {})
      console.log(`Deleted ${deleteResult.deleted} existing staged palettes`)
    }

    // Step 2: Load all palettes via pagination
    const allPalettes: GeneratedPalette[] = []
    let cursor: string | null = null
    let pageCount = 0

    console.log('Loading all generated_palettes...')

    // Helper to fetch a page
    const fetchPage = async (c: string | null) => {
      return ctx.runQuery(internal.migrations.getGeneratedPalettesBatch, {
        cursor: c,
        limit: 2000,
      })
    }

    let result = await fetchPage(cursor)
    while (true) {
      for (const p of result.palettes) {
        allPalettes.push(p as GeneratedPalette)
      }
      pageCount++

      if (pageCount % 5 === 0) {
        console.log(`Loaded ${allPalettes.length} palettes (${pageCount} pages)...`)
      }

      if (result.isDone) {
        break
      }
      result = await fetchPage(result.nextCursor)
    }

    console.log(`Loaded ${allPalettes.length} total palettes`)

    // Step 3: Process palettes - apply filters and deduplicate
    const stats: FilterStats = {
      total: allPalettes.length,
      noSeed: 0,
      invalidSeed: 0,
      dominated: 0,
      lowContrast: 0,
      highFrequency: 0,
      duplicates: 0,
      passed: 0,
    }

    // Map: similarityKey -> best palette data + aggregated themes
    const uniquePalettes = new Map<string, StagedPaletteData>()

    console.log('Filtering and deduplicating...')

    for (const palette of allPalettes) {
      // Filter 1: Must have seed
      if (!palette.seed) {
        stats.noSeed++
        continue
      }

      // Filter 2: Valid seed that can be parsed
      const similarityKey = createSimilarityKey(palette.seed)
      if (!similarityKey) {
        stats.invalidSeed++
        continue
      }

      // Filter 3: Color diversity (not dominated by single color)
      if (isDominatedPalette(palette.colors)) {
        stats.dominated++
        continue
      }

      // Filter 4: Minimum contrast
      const contrast = calculateContrast(palette.colors)
      if (contrast < minContrast) {
        stats.lowContrast++
        continue
      }

      // Filter 5: Maximum frequency (parse coeffs for this check)
      try {
        const { coeffs } = deserializeCoeffs(palette.seed)
        const avgFreq = calculateAverageFrequency(coeffs)
        if (avgFreq > maxFrequency) {
          stats.highFrequency++
          continue
        }
      } catch {
        stats.invalidSeed++
        continue
      }

      // Deduplication: Check if we've seen this similarity key
      const existing = uniquePalettes.get(similarityKey)
      if (existing) {
        stats.duplicates++
        // Add theme to existing entry if not already present
        if (palette.theme && !existing.themes.includes(palette.theme)) {
          existing.themes.push(palette.theme)
        }
        continue
      }

      // New unique palette - add to map
      uniquePalettes.set(similarityKey, {
        similarityKey,
        sourceId: palette._id,
        cycle: palette.cycle,
        tag: palette.tag,
        seed: palette.seed,
        colors: palette.colors,
        style: palette.style,
        steps: palette.steps,
        angle: palette.angle,
        modelKey: palette.modelKey,
        themes: palette.theme ? [palette.theme] : [],
      })
      stats.passed++
    }

    console.log('Filter stats:', stats)
    console.log(`Unique palettes to stage: ${uniquePalettes.size}`)

    // Step 4: Write to staged_palettes in batches
    const palettesToInsert = Array.from(uniquePalettes.values())
    const WRITE_BATCH_SIZE = 100
    let insertedCount = 0

    console.log('Writing to staged_palettes...')

    for (let i = 0; i < palettesToInsert.length; i += WRITE_BATCH_SIZE) {
      const batch = palettesToInsert.slice(i, i + WRITE_BATCH_SIZE)

      await ctx.runMutation(internal.migrations.insertStagedPalettesBatch, {
        palettes: batch,
      })

      insertedCount += batch.length

      if (insertedCount % 500 === 0 || insertedCount === palettesToInsert.length) {
        console.log(`Inserted ${insertedCount}/${palettesToInsert.length} staged palettes`)
      }
    }

    console.log('Done!')

    return {
      stats,
      uniqueCount: uniquePalettes.size,
      insertedCount,
    }
  },
})
