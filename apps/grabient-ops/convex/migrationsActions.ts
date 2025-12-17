'use node'

import { action, internalAction } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'
import { deserializeCoeffs } from '@repo/data-ops/serialization'
import {
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
  flatCoeffs: number[]
}

interface ExistingStagedPalette {
  _id: string
  seed: string
  themes: string[]
  flatCoeffs: number[]
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
 * Flatten coefficients to a 12-element array (4 rows × 3 RGB values).
 */
function flattenCoeffs(coeffs: CosineCoeffs): number[] {
  return coeffs.flatMap(vec => [vec[0], vec[1], vec[2]])
}

/**
 * Calculate euclidean distance between two coefficient vectors.
 */
function coeffDistance(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i]
    sum += diff * diff
  }
  return Math.sqrt(sum)
}

/**
 * Find index of similar palette in new palettes array, or -1 if none found.
 */
function findSimilarInNew(
  flatCoeffs: number[],
  uniquePalettes: StagedPaletteData[],
  threshold: number
): number {
  for (let i = 0; i < uniquePalettes.length; i++) {
    if (coeffDistance(flatCoeffs, uniquePalettes[i].flatCoeffs) < threshold) {
      return i
    }
  }
  return -1
}

/**
 * Find index of similar palette in existing staged palettes, or -1 if none found.
 */
function findSimilarInExisting(
  flatCoeffs: number[],
  existingPalettes: ExistingStagedPalette[],
  threshold: number
): number {
  for (let i = 0; i < existingPalettes.length; i++) {
    if (coeffDistance(flatCoeffs, existingPalettes[i].flatCoeffs) < threshold) {
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
    const { clearFirst = true, minContrast = 0.05, maxFrequency = 1.5, similarityThreshold = 0.25 } = args
    const incremental = !clearFirst

    console.log(`Starting staged palette processing (${incremental ? 'incremental' : 'full'} mode)...`)
    console.log(`Filters: minContrast=${minContrast}, maxFrequency=${maxFrequency}, similarityThreshold=${similarityThreshold}`)

    // Step 1: Load existing staged_palettes if incremental, otherwise clear
    const existingPalettes: ExistingStagedPalette[] = []
    // Map to track theme updates: existing palette ID -> new themes to add
    const themeUpdates = new Map<string, Set<string>>()

    if (incremental) {
      console.log('Loading existing staged_palettes...')
      const existing = await ctx.runQuery(internal.migrations.getStagedPalettesLookup, {})
      console.log(`Found ${existing.length} existing staged palettes`)

      for (const p of existing) {
        try {
          const { coeffs } = deserializeCoeffs(p.seed)
          existingPalettes.push({
            _id: p._id,
            seed: p.seed,
            themes: p.themes,
            flatCoeffs: flattenCoeffs(coeffs),
          })
        } catch {
          // Skip invalid seeds
        }
      }
      console.log(`Loaded ${existingPalettes.length} existing palettes with valid coefficients`)
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
      // Filter 1: Must have seed
      if (!palette.seed) {
        stats.noSeed++
        continue
      }

      // Filter 2: Valid seed that can be parsed + extract coeffs
      let coeffs: CosineCoeffs
      let flatCoeffs: number[]
      try {
        const parsed = deserializeCoeffs(palette.seed)
        coeffs = parsed.coeffs
        flatCoeffs = flattenCoeffs(coeffs)
      } catch {
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

      // Filter 5: Maximum frequency
      const avgFreq = calculateAverageFrequency(coeffs)
      if (avgFreq > maxFrequency) {
        stats.highFrequency++
        continue
      }

      // Deduplication: First check against existing palettes (incremental mode)
      if (incremental) {
        const existingMatch = findSimilarInExisting(flatCoeffs, existingPalettes, similarityThreshold)
        if (existingMatch >= 0) {
          stats.existingMatches++
          // Queue theme update for existing palette
          if (palette.theme) {
            const existingId = existingPalettes[existingMatch]._id
            if (!themeUpdates.has(existingId)) {
              themeUpdates.set(existingId, new Set(existingPalettes[existingMatch].themes))
            }
            themeUpdates.get(existingId)!.add(palette.theme)
          }
          continue
        }
      }

      // Check against new unique palettes in this batch
      const newMatch = findSimilarInNew(flatCoeffs, newUniquePalettes, similarityThreshold)
      if (newMatch >= 0) {
        stats.duplicates++
        // Merge theme into new palette
        if (palette.theme && !newUniquePalettes[newMatch].themes.includes(palette.theme)) {
          newUniquePalettes[newMatch].themes.push(palette.theme)
        }
        continue
      }

      // New unique palette - add to array
      newUniquePalettes.push({
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
        flatCoeffs,
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
            cycle: p.cycle,
            tag: p.tag,
            seed: p.seed,
            colors: p.colors,
            style: p.style,
            steps: p.steps,
            angle: p.angle,
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

// ============================================================================
// DeepFlow Style Fix
// ============================================================================

/**
 * Fix vectorized_palettes with deprecated deepFlow style by changing to linearGradient.
 *
 * Run via: npx convex run migrationsActions:fixDeepFlowStyle
 */
export const fixDeepFlowStyle = action({
  args: {},
  returns: v.object({ updated: v.number() }),
  handler: async (ctx): Promise<{ updated: number }> => {
    // Query all vectorized_palettes and filter for deepFlow
    const allPalettes: Array<{ _id: string }> = await ctx.runQuery(internal.migrations.getVectorizedPalettesWithDeepFlow, {})

    console.log(`Found ${allPalettes.length} palettes with deepFlow style`)

    if (allPalettes.length === 0) {
      return { updated: 0 }
    }

    // Update each one to linearGradient
    await ctx.runMutation(internal.migrations.updateDeepFlowToLinearGradient, {
      ids: allPalettes.map((p: { _id: string }) => p._id) as any,
    })

    console.log(`Updated ${allPalettes.length} palettes from deepFlow to linearGradient`)

    return { updated: allPalettes.length }
  },
})
