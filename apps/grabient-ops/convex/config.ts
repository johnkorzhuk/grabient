import { query, mutation } from './_generated/server'
import { v } from 'convex/values'
import { PROVIDERS, getAllModels } from './lib/providers.types'

// Default config values
const DEFAULT_TAG_ANALYSIS_COUNT = 1

/**
 * Get the current config, creating defaults if none exists
 */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db.query('config').first()
    if (!config) {
      return {
        tagAnalysisCount: DEFAULT_TAG_ANALYSIS_COUNT,
      }
    }
    return {
      tagAnalysisCount: config.tagAnalysisCount,
    }
  },
})

/**
 * Update the tag analysis count
 */
export const setTagAnalysisCount = mutation({
  args: { count: v.number() },
  handler: async (ctx, { count }) => {
    if (count < 1 || count > 20) {
      throw new Error('tagAnalysisCount must be between 1 and 20')
    }

    const existing = await ctx.db.query('config').first()
    if (existing) {
      await ctx.db.patch(existing._id, { tagAnalysisCount: count })
    } else {
      await ctx.db.insert('config', { tagAnalysisCount: count })
    }
  },
})

/**
 * Internal query to get config for actions
 */
export const getInternal = query({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db.query('config').first()
    return {
      tagAnalysisCount: config?.tagAnalysisCount ?? DEFAULT_TAG_ANALYSIS_COUNT,
    }
  },
})

/**
 * Get available provider models for the UI
 */
export const getProviderModels = query({
  args: {},
  handler: async () => {
    return {
      providers: [...PROVIDERS],
      models: getAllModels(),
    }
  },
})
