import { query, mutation } from './_generated/server'
import { v } from 'convex/values'

// Default config values
const DEFAULT_TAG_ANALYSIS_COUNT = 1

// Provider model configurations - matches backfillActions.ts
const PROVIDER_MODELS = {
  anthropic: [{ provider: 'anthropic', model: 'claude-3-5-haiku-20241022' }],
  openai: [
    { provider: 'openai', model: 'gpt-4o-mini' },
    { provider: 'openai', model: 'gpt-5-nano' },
  ],
  groq: [
    { provider: 'groq', model: 'llama-3.3-70b-versatile' },
    { provider: 'groq', model: 'meta-llama/llama-4-scout-17b-16e-instruct' },
    { provider: 'groq', model: 'qwen/qwen3-32b' },
    { provider: 'groq', model: 'openai/gpt-oss-120b' },
    { provider: 'groq', model: 'openai/gpt-oss-20b' },
  ],
  google: [
    { provider: 'google', model: 'gemini-2.0-flash' },
    { provider: 'google', model: 'gemini-2.5-flash-lite' },
  ],
} as const

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
    // Flatten the provider models into a list
    const allModels: Array<{ provider: string; model: string }> = []
    for (const [, models] of Object.entries(PROVIDER_MODELS)) {
      for (const m of models) {
        allModels.push({ provider: m.provider, model: m.model })
      }
    }
    return {
      providers: Object.keys(PROVIDER_MODELS),
      models: allModels,
    }
  },
})
