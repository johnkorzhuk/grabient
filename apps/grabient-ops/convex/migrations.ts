import { Migrations } from '@convex-dev/migrations'
import { components } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
import { PROVIDERS, type Provider } from './lib/providers.types'

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
 * Fix invalid provider values in palette_tags
 * Legacy data may have provider values like "groq-gpt-oss-20b" instead of "groq"
 * This extracts the correct provider and updates the model field if needed
 *
 * Run via: npx convex run migrations:run '{"name": "fixInvalidProviders"}'
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
      let newModel = doc.model
      for (const provider of PROVIDERS) {
        if (doc.provider.startsWith(`${provider}-`)) {
          const extractedModel = doc.provider.substring(provider.length + 1)
          if (extractedModel) {
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
