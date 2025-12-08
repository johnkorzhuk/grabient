import { Migrations } from '@convex-dev/migrations'
import { components } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
import { PROVIDERS, ALL_MODELS, type Provider, type Model } from './lib/providers.types'
import { CURRENT_PROMPT_VERSION } from './lib/prompts'

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


