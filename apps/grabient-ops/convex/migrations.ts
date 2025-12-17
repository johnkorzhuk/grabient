import { Migrations } from '@convex-dev/migrations'
import { v } from 'convex/values'
import { components } from './_generated/api'
import type { DataModel, Id } from './_generated/dataModel'
import { internalMutation, internalQuery } from './_generated/server'
import { PROVIDERS, ALL_MODELS, type Provider, type Model } from './lib/providers.types'
import { CURRENT_PROMPT_VERSION } from './lib/prompts'
import { deserializeCoeffs, isValidSeed } from '@repo/data-ops/serialization'

// Initialize migrations component
export const migrations = new Migrations<DataModel>(components.migrations)
export const run = migrations.runner()

// ============================================================================
// Provider Fix Migration
// ============================================================================

/**
 * Parse a potentially malformed provider string and extract the correct provider.
 * Handles cases like "groq-gpt-oss-20b" -> "groq"
 */
function extractProvider(providerValue: string): Provider | null {
  // Direct match
  if ((PROVIDERS as readonly string[]).includes(providerValue)) {
    return providerValue as Provider
  }

  // Check if it starts with a valid provider (e.g., "groq-something" -> "groq")
  for (const provider of PROVIDERS) {
    if (providerValue.startsWith(`${provider}-`) || providerValue.startsWith(`${provider}_`)) {
      return provider
    }
  }

  // Check if it contains a valid provider anywhere
  for (const provider of PROVIDERS) {
    if (providerValue.includes(provider)) {
      return provider
    }
  }

  return null
}

/**
 * Check if a model string is a valid Model type
 */
function isValidModel(model: string): model is Model {
  return (ALL_MODELS as readonly string[]).includes(model)
}

/**
 * Fix invalid provider values in palette_tags
 * Legacy data may have provider values like "groq-gpt-oss-20b" instead of "groq"
 * This extracts the correct provider and updates the model field if needed
 *
 * Run via: npx convex run migrations:run '{"fn": "migrations:fixInvalidProviders"}'
 */
export const fixInvalidProviders = migrations.define({
  table: 'palette_tags',
  migrateOne: async (ctx, doc) => {
    const validProviders = new Set<string>(PROVIDERS)

    // Skip if provider is already valid
    if (validProviders.has(doc.provider)) {
      return
    }

    // Try to extract the correct provider
    const correctProvider = extractProvider(doc.provider)

    if (correctProvider) {
      // If provider was like "groq-gpt-oss-20b", extract model too
      let newModel: Model = doc.model as Model
      for (const provider of PROVIDERS) {
        if (doc.provider.startsWith(`${provider}-`)) {
          const extractedModel = doc.provider.substring(provider.length + 1)
          if (extractedModel && isValidModel(extractedModel)) {
            newModel = extractedModel
          }
          break
        }
      }

      await ctx.db.patch(doc._id, {
        provider: correctProvider,
        model: newModel,
      })
    } else {
      // Can't determine correct provider - delete the record
      console.log(`Deleting record with unknown provider: ${doc.provider}`)
      await ctx.db.delete(doc._id)
    }
  },
})

// ============================================================================
// Model Fix Migration
// ============================================================================

/**
 * Map of malformed model values to correct values
 */
const MODEL_FIXES: Record<string, Model> = {
  // Groq models without prefix
  'gpt-oss-20b': 'openai/gpt-oss-20b',
  'gpt-oss-120b': 'openai/gpt-oss-120b',
  'llama-4-scout-17b-16e-instruct': 'meta-llama/llama-4-scout-17b-16e-instruct',
  'qwen3-32b': 'qwen/qwen3-32b',
}

/**
 * Fix invalid model values in palette_tags
 * Legacy data may have model values like "gpt-oss-20b" instead of "openai/gpt-oss-20b"
 *
 * Run via: npx convex run migrations:run '{"fn": "migrations:fixInvalidModels"}'
 */
export const fixInvalidModels = migrations.define({
  table: 'palette_tags',
  migrateOne: async (ctx, doc) => {
    // Skip if model is already valid
    if (isValidModel(doc.model)) {
      return
    }

    // Check if we have a fix for this model
    const fixedModel = MODEL_FIXES[doc.model]
    if (fixedModel) {
      console.log(`Fixing model: ${doc.model} -> ${fixedModel}`)
      await ctx.db.patch(doc._id, { model: fixedModel })
      return
    }

    // Unknown model - log and delete
    console.log(`Deleting record with unknown model: ${doc.model}`)
    await ctx.db.delete(doc._id)
  },
})

// ============================================================================
// Legacy Migrations (for reference)
// ============================================================================

/**
 * Migrate legacy runNumber field to analysisIndex
 * Legacy data has runNumber (1-indexed), new data uses analysisIndex (0-indexed)
 *
 * Run via: npx convex run migrations:run '{"name": "migrateRunNumberToAnalysisIndex"}'
 */
export const migrateRunNumberToAnalysisIndex = migrations.define({
  table: 'palette_tags',
  migrateOne: async (ctx, doc) => {
    // Skip if already has analysisIndex
    if (doc.analysisIndex !== undefined) {
      return
    }

    // Migrate runNumber to analysisIndex
    if (doc.runNumber !== undefined) {
      await ctx.db.patch(doc._id, {
        analysisIndex: doc.runNumber - 1, // Convert 1-indexed to 0-indexed
      })
    } else {
      // No runNumber either, set to 0 as default
      await ctx.db.patch(doc._id, {
        analysisIndex: 0,
      })
    }
  },
})

/**
 * Clear legacy runNumber field after migration
 *
 * Run via: npx convex run migrations:run '{"name": "clearLegacyRunNumber"}'
 */
export const clearLegacyRunNumber = migrations.define({
  table: 'palette_tags',
  migrateOne: async (ctx, doc) => {
    if (doc.runNumber !== undefined) {
      await ctx.db.patch(doc._id, {
        runNumber: undefined,
      })
    }
  },
})

// ============================================================================
// Refinement Schema Migration
// ============================================================================

/**
 * Migrate refinement records to use sourceCycles instead of sourcePromptVersions.
 * - Convert sourcePromptVersions (string[]) to sourceCycles (number[])
 * - For existing data, set sourceCycles to empty array (meaning "used all available cycles")
 *
 * Run via: npx convex run migrations:run '{"fn": "migrations:migrateRefinementToSourceCycles"}'
 */
export const migrateRefinementToSourceCycles = migrations.define({
  table: 'palette_tag_refined',
  migrateOne: async (ctx, doc) => {
    const updates: Record<string, unknown> = {}

    // Convert sourcePromptVersions to sourceCycles
    if ((doc as any).sourceCycles === undefined) {
      // For legacy data, we don't know which cycles were used, so set to empty (all cycles)
      updates.sourceCycles = []
    }

    // Clear legacy fields
    if ((doc as any).sourcePromptVersions !== undefined) {
      updates.sourcePromptVersions = undefined
    }
    if ((doc as any).sourcePromptVersion !== undefined) {
      updates.sourcePromptVersion = undefined
    }

    // Add cycle if missing
    if ((doc as any).cycle === undefined) {
      updates.cycle = 0
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(doc._id, updates)
    }
  },
})

/**
 * Migrate refinement batch records to use sourceCycles instead of sourcePromptVersions.
 *
 * Run via: npx convex run migrations:run '{"fn": "migrations:migrateRefinementBatchToSourceCycles"}'
 */
export const migrateRefinementBatchToSourceCycles = migrations.define({
  table: 'refinement_batches',
  migrateOne: async (ctx, doc) => {
    const updates: Record<string, unknown> = {}

    // Convert sourcePromptVersions to sourceCycles
    if ((doc as any).sourceCycles === undefined) {
      // For legacy data, we don't know which cycles were used, so set to empty (all cycles)
      updates.sourceCycles = []
    }

    // Clear legacy fields
    if ((doc as any).sourcePromptVersions !== undefined) {
      updates.sourcePromptVersions = undefined
    }
    if ((doc as any).sourcePromptVersion !== undefined) {
      updates.sourcePromptVersion = undefined
    }

    // Ensure requestOrder exists
    if ((doc as any).requestOrder === undefined) {
      updates.requestOrder = []
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(doc._id, updates)
    }
  },
})

/**
 * Delete all refinement records with errors
 *
 * Run via: npx convex run migrations:run '{"fn": "migrations:deleteRefinementErrors"}'
 */
export const deleteRefinementErrors = migrations.define({
  table: 'palette_tag_refined',
  migrateOne: async (ctx, doc) => {
    if (doc.error) {
      await ctx.db.delete(doc._id)
    }
  },
})

/**
 * Delete all failed refinement batches
 *
 * Run via: npx convex run migrations:run '{"fn": "migrations:deleteFailedBatches"}'
 */
export const deleteFailedBatches = migrations.define({
  table: 'refinement_batches',
  migrateOne: async (ctx, doc) => {
    if (doc.status === 'failed') {
      await ctx.db.delete(doc._id)
    }
  },
})

// ============================================================================
// Tag Batch Schema Migration
// ============================================================================

/**
 * Backfill promptVersion on legacy tag_batches.
 * All existing batches were created with the current prompt version.
 *
 * Run via: npx convex run migrations:run '{"fn": "migrations:backfillBatchPromptVersion"}'
 */
export const backfillBatchPromptVersion = migrations.define({
  table: 'tag_batches',
  migrateOne: async (ctx, doc) => {
    // Skip if promptVersion already set
    if (doc.promptVersion !== undefined) {
      return
    }

    // Set promptVersion to current version (all legacy batches used this)
    await ctx.db.patch(doc._id, {
      promptVersion: CURRENT_PROMPT_VERSION,
    })
  },
})

// ============================================================================
// Consensus Schema Migration (Record -> Array format)
// ============================================================================

/**
 * Delete all consensus documents so they can be rebuilt with the new array format.
 * The consensus table schema changed from Record<string, number> to Array<{key, value}>
 * to avoid Convex field name restrictions on AI-generated tag strings.
 *
 * After this migration runs, call `npx convex run consensus:rebuildAllConsensus`
 * to rebuild the consensus data from palette_tags with the new format.
 *
 * Run via: npx convex run migrations:run '{"fn": "migrations:clearConsensusForRebuild"}'
 */
export const clearConsensusForRebuild = migrations.define({
  table: 'palette_tag_consensus',
  migrateOne: async (ctx, doc) => {
    // Delete all consensus documents - they'll be rebuilt with new format
    await ctx.db.delete(doc._id)
  },
})

// ============================================================================
// Palette Deduplication Migration
// ============================================================================

/**
 * Create a 2-decimal precision similarity key from a seed string.
 * Returns null if the seed is invalid.
 */
function createSimilarityKeyFromSeed(seed: string): string | null {
  try {
    if (!isValidSeed(seed)) return null

    const { coeffs, globals } = deserializeCoeffs(seed)

    // Round coeffs to 2 decimal places (skip the alpha channel at index 3)
    const coeffParts: string[] = []
    for (const vec of coeffs) {
      coeffParts.push(vec[0].toFixed(2), vec[1].toFixed(2), vec[2].toFixed(2))
    }

    // Round globals to 2 decimal places
    const globalParts = globals.map((g: number) => g.toFixed(2))

    return [...coeffParts, ...globalParts].join('|')
  } catch {
    return null
  }
}

/**
 * Get all staged palettes for building the lookup map.
 * Called at the start of each batch to ensure we have the latest state.
 */
export const getStagedPalettesLookup = internalQuery({
  args: {},
  returns: v.array(v.object({
    _id: v.id('staged_palettes'),
    similarityKey: v.string(),
    themes: v.array(v.string()),
  })),
  handler: async (ctx) => {
    const staged = await ctx.db.query('staged_palettes').collect()
    return staged.map(s => ({
      _id: s._id,
      similarityKey: s.similarityKey,
      themes: s.themes,
    }))
  },
})

/**
 * Get a batch of generated palettes for processing.
 */
export const getGeneratedPalettesBatch = internalQuery({
  args: {
    cursor: v.union(v.string(), v.null()),
    limit: v.number(),
  },
  handler: async (ctx, { cursor, limit }) => {
    const result = await ctx.db
      .query('generated_palettes')
      .order('desc')
      .paginate({ cursor, numItems: limit })

    return {
      palettes: result.page.map(p => ({
        _id: p._id,
        cycle: p.cycle,
        tag: p.tag,
        theme: p.theme,
        seed: p.seed,
        colors: p.colors,
        style: p.style,
        steps: p.steps,
        angle: p.angle,
        modelKey: p.modelKey,
        createdAt: p.createdAt,
      })),
      nextCursor: result.continueCursor,
      isDone: result.isDone,
    }
  },
})

/**
 * Process a batch of generated palettes and create/update staged palettes.
 * Uses index-based lookups instead of loading all staged_palettes into memory.
 *
 * Run via: npx convex run migrations:deduplicatePalettesBatch '{"cursor": null}'
 * Then continue with the returned cursor until isDone is true.
 */
export const deduplicatePalettesBatch = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    nextCursor: v.union(v.string(), v.null()),
    isDone: v.boolean(),
    stats: v.object({
      processed: v.number(),
      created: v.number(),
      duplicates: v.number(),
      themesAdded: v.number(),
      skipped: v.number(),
    }),
  }),
  handler: async (ctx, { cursor, batchSize = 500 }) => {
    // Get batch of generated palettes
    const result = await ctx.db
      .query('generated_palettes')
      .order('desc')
      .paginate({ cursor, numItems: batchSize })

    const stats = { processed: 0, created: 0, duplicates: 0, themesAdded: 0, skipped: 0 }

    // Track keys we've seen in THIS batch to avoid duplicate index lookups
    const batchCache = new Map<string, { _id: Id<'staged_palettes'>; themes: string[] }>()

    for (const palette of result.page) {
      stats.processed++

      // Skip palettes without seeds
      if (!palette.seed) {
        stats.skipped++
        continue
      }

      // Generate similarity key
      const similarityKey = createSimilarityKeyFromSeed(palette.seed)
      if (!similarityKey) {
        stats.skipped++
        continue
      }

      // Check batch cache first (for duplicates within same batch)
      let existingEntry = batchCache.get(similarityKey)

      // If not in batch cache, check database using index
      if (!existingEntry) {
        const existing = await ctx.db
          .query('staged_palettes')
          .withIndex('by_similarity_key', q => q.eq('similarityKey', similarityKey))
          .first()

        if (existing) {
          existingEntry = { _id: existing._id, themes: existing.themes }
          batchCache.set(similarityKey, existingEntry)
        }
      }

      if (existingEntry) {
        // Duplicate found - check if we need to add the theme
        stats.duplicates++

        if (palette.theme && !existingEntry.themes.includes(palette.theme)) {
          // Add the theme to the existing staged palette
          const newThemes = [...existingEntry.themes, palette.theme]
          await ctx.db.patch(existingEntry._id, { themes: newThemes })
          existingEntry.themes = newThemes // Update cache
          stats.themesAdded++
        }
      } else {
        // New unique palette - create staged entry
        const themes: Array<string> = palette.theme ? [palette.theme] : []
        const newId = await ctx.db.insert('staged_palettes', {
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
          themes,
        })
        batchCache.set(similarityKey, { _id: newId, themes })
        stats.created++
      }
    }

    return {
      nextCursor: result.continueCursor,
      isDone: result.isDone,
      stats,
    }
  },
})

/**
 * Clear staged palettes in batches to avoid read limits.
 *
 * Run via: npx convex run migrations:clearStagedPalettes '{}'
 * Keep running until deleted returns 0
 */
export const clearStagedPalettes = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  returns: v.object({ deleted: v.number(), hasMore: v.boolean() }),
  handler: async (ctx, { batchSize = 1000 }) => {
    const batch = await ctx.db.query('staged_palettes').take(batchSize)
    for (const doc of batch) {
      await ctx.db.delete(doc._id)
    }
    return { deleted: batch.length, hasMore: batch.length === batchSize }
  },
})

/**
 * Get deduplication progress stats.
 *
 * Run via: npx convex run migrations:getDeduplicationStats '{}'
 */
export const getDeduplicationStats = internalQuery({
  args: {},
  returns: v.object({
    totalGenerated: v.number(),
    totalStaged: v.number(),
    totalThemes: v.number(),
  }),
  handler: async (ctx) => {
    // Count generated palettes (use index scan with limit to estimate)
    const generatedSample = await ctx.db.query('generated_palettes').take(10000)
    const totalGenerated = generatedSample.length

    // Get staged stats
    const staged = await ctx.db.query('staged_palettes').collect()
    const totalStaged = staged.length
    const totalThemes = staged.reduce((sum, s) => sum + s.themes.length, 0)

    return { totalGenerated, totalStaged, totalThemes }
  },
})

/**
 * Batch insert staged palettes (called by the action).
 * This mutation is internal and handles writing the filtered + deduplicated palettes.
 */
export const insertStagedPalettesBatch = internalMutation({
  args: {
    palettes: v.array(
      v.object({
        similarityKey: v.string(),
        sourceId: v.string(),
        cycle: v.number(),
        tag: v.string(),
        seed: v.string(),
        colors: v.array(v.string()),
        style: v.optional(v.string()),
        steps: v.optional(v.number()),
        angle: v.optional(v.number()),
        modelKey: v.optional(v.string()),
        themes: v.array(v.string()),
      })
    ),
  },
  returns: v.object({ inserted: v.number() }),
  handler: async (ctx, { palettes }) => {
    for (const p of palettes) {
      await ctx.db.insert('staged_palettes', {
        similarityKey: p.similarityKey,
        sourceId: p.sourceId as Id<'generated_palettes'>,
        cycle: p.cycle,
        tag: p.tag,
        seed: p.seed,
        colors: p.colors,
        style: p.style as any,
        steps: p.steps,
        angle: p.angle as any,
        modelKey: p.modelKey as any,
        themes: p.themes,
      })
    }
    return { inserted: palettes.length }
  },
})

