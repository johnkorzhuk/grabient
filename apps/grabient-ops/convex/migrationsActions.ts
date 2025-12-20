'use node'

import { internalAction } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'
import { deserializeCoeffs } from '@repo/data-ops/serialization'
import {
  calculateAverageFrequency,
  calculateContrast,
  type CosineCoeffs,
} from '@repo/data-ops/gradient-gen'
import {
  computeLabSamples,
  comparePalettes,
  type LAB,
} from '@repo/data-ops/similarity'

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
  sourceId: string
  seed: string
  modelKey?: string
  themes: string[]
  labSamples: LAB[]
  labSamplesReversed: LAB[]
}

interface ExistingStagedPalette {
  _id: string
  seed: string
  colors: string[]
  themes: string[]
  labSamples: LAB[]
  labSamplesReversed: LAB[]
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
 * Find index of similar palette in new palettes array using LAB color distance.
 * Returns -1 if none found.
 */
function findSimilarInNew(
  labSamples: LAB[],
  uniquePalettes: StagedPaletteData[],
  threshold: number
): number {
  for (let i = 0; i < uniquePalettes.length; i++) {
    const existing = uniquePalettes[i]
    if (!existing) continue
    const { distance } = comparePalettes(labSamples, existing.labSamples, existing.labSamplesReversed)
    if (distance < threshold) {
      return i
    }
  }
  return -1
}

/**
 * Find index of similar palette in existing staged palettes using LAB color distance.
 * Returns -1 if none found.
 */
function findSimilarInExisting(
  labSamples: LAB[],
  existingPalettes: ExistingStagedPalette[],
  threshold: number
): number {
  for (let i = 0; i < existingPalettes.length; i++) {
    const existing = existingPalettes[i]
    if (!existing) continue
    const { distance } = comparePalettes(labSamples, existing.labSamples, existing.labSamplesReversed)
    if (distance < threshold) {
      return i
    }
  }
  return -1
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

// ============================================================================
// Main Deduplication Action
// ============================================================================

/**
 * Process generated_palettes and create/update staged_palettes with deduplication + quality filters.
 *
 * Modes:
 * - Full (clearFirst=true): Clear existing, process all, insert fresh
 * - Incremental (clearFirst=false): Load existing, compare new against existing+new, update themes
 *
 * Run via: npx convex run migrationsActions:processAndStagePalettes '{}'
 * Incremental: npx convex run migrationsActions:processAndStagePalettes '{"clearFirst": false}'
 */
export const processAndStagePalettes = internalAction({
  args: {
    clearFirst: v.optional(v.boolean()), // Clear staged_palettes before processing (default true)
    minContrast: v.optional(v.number()), // Override default contrast threshold (0.05)
    maxFrequency: v.optional(v.number()), // Override default frequency threshold (1.5)
    similarityThreshold: v.optional(v.number()), // Euclidean distance threshold (default 0.25)
  },
  handler: async (ctx, args) => {
    const { clearFirst = true, minContrast = 0.05, maxFrequency = 3.0, similarityThreshold = 11 } = args
    const incremental = !clearFirst

    console.log(`Starting staged palette processing (${incremental ? 'incremental' : 'full'} mode)...`)
    console.log(`Filters: minContrast=${minContrast}, maxFrequency=${maxFrequency}, similarityThreshold=${similarityThreshold}`)

    // Step 1: Load existing staged_palettes if incremental, otherwise clear
    const existingPalettes: ExistingStagedPalette[] = []
    // Map to track theme updates: existing palette ID -> new themes to add
    const themeUpdates = new Map<string, Set<string>>()

    if (incremental) {
      // Note: Incremental mode is no longer fully supported since staged_palettes
      // doesn't store colors. We'd need to look up colors from generated_palettes via sourceId.
      // For now, just warn and continue - existing palettes won't be deduplicated against.
      console.log('Warning: Incremental mode has limited support - staged_palettes lacks colors field')
      console.log('Existing staged palettes will be preserved but not deduplicated against.')
    } else {
      console.log('Clearing existing staged_palettes...')
      const deleteResult = await ctx.runMutation(internal.migrations.clearStagedPalettes, {})
      console.log(`Deleted ${deleteResult.deleted} existing staged palettes`)
    }

    // Step 2: Load all generated_palettes via pagination
    const allPalettes: GeneratedPalette[] = []
    let cursor: string | null = null
    let pageCount = 0

    console.log('Loading all generated_palettes...')

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
    const stats: FilterStats & { existingMatches: number } = {
      total: allPalettes.length,
      noSeed: 0,
      invalidSeed: 0,
      dominated: 0,
      lowContrast: 0,
      highFrequency: 0,
      duplicates: 0,
      existingMatches: 0,
      passed: 0,
    }

    // Array of NEW unique palettes (not matching existing)
    const newUniquePalettes: StagedPaletteData[] = []

    console.log('Filtering and deduplicating...')

    for (const palette of allPalettes) {
      // Filter 1: Must have valid colors
      if (!palette.colors || palette.colors.length === 0) {
        stats.noSeed++
        continue
      }

      // Filter 2: Must have seed
      if (!palette.seed) {
        stats.noSeed++
        continue
      }

      // Filter 3: Seed must be valid (parseable coefficients)
      let coeffs: CosineCoeffs
      try {
        const parsed = deserializeCoeffs(palette.seed)
        coeffs = parsed.coeffs
      } catch {
        // Invalid seed - can't use this palette
        stats.invalidSeed++
        continue
      }

      // Filter 4: Color diversity (not dominated by single color)
      if (isDominatedPalette(palette.colors)) {
        stats.dominated++
        continue
      }

      // Filter 5: Minimum contrast
      const contrast = calculateContrast(palette.colors)
      if (contrast < minContrast) {
        stats.lowContrast++
        continue
      }

      // Filter 6: Maximum frequency
      const avgFreq = calculateAverageFrequency(coeffs)
      if (avgFreq > maxFrequency) {
        stats.highFrequency++
        continue
      }

      // Pre-compute LAB samples for deduplication
      const labSamples = computeLabSamples(palette.colors)
      const labSamplesReversed = [...labSamples].reverse()

      // Deduplication: First check against existing palettes (incremental mode)
      if (incremental) {
        const existingMatch = findSimilarInExisting(labSamples, existingPalettes, similarityThreshold)
        if (existingMatch >= 0) {
          stats.existingMatches++
          // Queue theme update for existing palette
          const existingPalette = existingPalettes[existingMatch]
          if (palette.theme && existingPalette) {
            const existingId = existingPalette._id
            if (!themeUpdates.has(existingId)) {
              themeUpdates.set(existingId, new Set(existingPalette.themes))
            }
            themeUpdates.get(existingId)!.add(palette.theme)
          }
          continue
        }
      }

      // Check against new unique palettes in this batch
      const newMatch = findSimilarInNew(labSamples, newUniquePalettes, similarityThreshold)
      if (newMatch >= 0) {
        stats.duplicates++
        // Merge theme into new palette
        const matchedPalette = newUniquePalettes[newMatch]
        if (palette.theme && matchedPalette && !matchedPalette.themes.includes(palette.theme)) {
          matchedPalette.themes.push(palette.theme)
        }
        continue
      }

      // New unique palette - add to array
      newUniquePalettes.push({
        sourceId: palette._id,
        seed: palette.seed,
        modelKey: palette.modelKey,
        themes: palette.theme ? [palette.theme] : [],
        labSamples,
        labSamplesReversed,
      })
      stats.passed++
    }

    console.log('Filter stats:', stats)
    console.log(`New unique palettes to insert: ${newUniquePalettes.length}`)
    if (incremental) {
      console.log(`Existing palettes to update themes: ${themeUpdates.size}`)
    }

    // Step 4: Insert new palettes in batches
    const WRITE_BATCH_SIZE = 100
    let insertedCount = 0

    if (newUniquePalettes.length > 0) {
      console.log('Inserting new staged_palettes...')

      for (let i = 0; i < newUniquePalettes.length; i += WRITE_BATCH_SIZE) {
        const batch = newUniquePalettes.slice(i, i + WRITE_BATCH_SIZE)

        await ctx.runMutation(internal.migrations.insertStagedPalettesBatch, {
          palettes: batch.map(p => ({
            sourceId: p.sourceId,
            seed: p.seed,
            modelKey: p.modelKey,
            themes: [...new Set(p.themes)], // Dedupe themes
          })),
        })

        insertedCount += batch.length

        if (insertedCount % 500 === 0 || insertedCount === newUniquePalettes.length) {
          console.log(`Inserted ${insertedCount}/${newUniquePalettes.length} new staged palettes`)
        }
      }
    }

    // Step 5: Update themes on existing palettes (incremental mode)
    let updatedCount = 0
    if (incremental && themeUpdates.size > 0) {
      console.log('Updating themes on existing staged_palettes...')

      const updates = Array.from(themeUpdates.entries()).map(([id, themes]) => ({
        id: id as any, // Will be cast properly in the mutation
        themes: [...themes], // Convert Set to Array (already deduped)
      }))

      for (let i = 0; i < updates.length; i += WRITE_BATCH_SIZE) {
        const batch = updates.slice(i, i + WRITE_BATCH_SIZE)
        await ctx.runMutation(internal.migrations.updateStagedPaletteThemes, { updates: batch })
        updatedCount += batch.length

        if (updatedCount % 500 === 0 || updatedCount === updates.length) {
          console.log(`Updated ${updatedCount}/${updates.length} existing palettes`)
        }
      }
    }

    console.log('Done!')

    return {
      stats,
      newUniqueCount: newUniquePalettes.length,
      insertedCount,
      updatedCount,
    }
  },
})

// Note: DeepFlow style fix action removed - style field no longer exists on vectorized_palettes
