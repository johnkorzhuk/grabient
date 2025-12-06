import { mutation } from './_generated/server'

/**
 * Migrate legacy runNumber field to analysisIndex
 *
 * Legacy data has runNumber (1-indexed), new data uses analysisIndex (0-indexed)
 * This migration:
 * 1. Finds all tags with runNumber but no analysisIndex
 * 2. Sets analysisIndex = runNumber - 1
 *
 * Run via: npx convex run migrations:migrateRunNumberToAnalysisIndex
 */
export const migrateRunNumberToAnalysisIndex = mutation({
  args: {},
  handler: async (ctx) => {
    const allTags = await ctx.db.query('palette_tags').collect()

    let migrated = 0
    let skipped = 0

    for (const tag of allTags) {
      // Skip if already has analysisIndex
      if (tag.analysisIndex !== undefined) {
        skipped++
        continue
      }

      // Migrate runNumber to analysisIndex
      if (tag.runNumber !== undefined) {
        await ctx.db.patch(tag._id, {
          analysisIndex: tag.runNumber - 1, // Convert 1-indexed to 0-indexed
        })
        migrated++
      } else {
        // No runNumber either, set to 0 as default
        await ctx.db.patch(tag._id, {
          analysisIndex: 0,
        })
        migrated++
      }
    }

    return {
      total: allTags.length,
      migrated,
      skipped,
    }
  },
})

/**
 * Clear legacy runNumber field after migration
 * Only run this after verifying migration worked
 *
 * Run via: npx convex run migrations:clearLegacyRunNumber
 */
export const clearLegacyRunNumber = mutation({
  args: {},
  handler: async (ctx) => {
    const allTags = await ctx.db.query('palette_tags').collect()

    let cleared = 0

    for (const tag of allTags) {
      if (tag.runNumber !== undefined) {
        await ctx.db.patch(tag._id, {
          runNumber: undefined,
        })
        cleared++
      }
    }

    return { cleared }
  },
})

/**
 * Check migration status
 *
 * Run via: npx convex run migrations:checkMigrationStatus
 */
export const checkMigrationStatus = mutation({
  args: {},
  handler: async (ctx) => {
    const allTags = await ctx.db.query('palette_tags').collect()

    let hasAnalysisIndex = 0
    let hasRunNumber = 0
    let hasBoth = 0
    let hasNeither = 0

    for (const tag of allTags) {
      const hasAI = tag.analysisIndex !== undefined
      const hasRN = tag.runNumber !== undefined

      if (hasAI && hasRN) hasBoth++
      else if (hasAI) hasAnalysisIndex++
      else if (hasRN) hasRunNumber++
      else hasNeither++
    }

    return {
      total: allTags.length,
      hasAnalysisIndex,
      hasRunNumber,
      hasBoth,
      hasNeither,
      needsMigration: hasRunNumber + hasNeither,
    }
  },
})
