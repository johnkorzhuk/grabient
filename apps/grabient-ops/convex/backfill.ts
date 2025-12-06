import { query, mutation, internalMutation } from './_generated/server'
import { v } from 'convex/values'

// ============================================================================
// Batch Management
// ============================================================================

/**
 * Create a new batch record
 */
export const createBatch = internalMutation({
  args: {
    provider: v.string(),
    model: v.string(),
    batchId: v.string(),
    requestCount: v.number(),
  },
  returns: v.id('tag_batches'),
  handler: async (ctx, { provider, model, batchId, requestCount }) => {
    return await ctx.db.insert('tag_batches', {
      provider,
      model,
      batchId,
      status: 'pending',
      requestCount,
      completedCount: 0,
      failedCount: 0,
      createdAt: Date.now(),
    })
  },
})

/**
 * Update batch status
 */
export const updateBatchStatus = internalMutation({
  args: {
    batchId: v.string(),
    status: v.union(
      v.literal('pending'),
      v.literal('processing'),
      v.literal('completed'),
      v.literal('failed'),
    ),
    completedCount: v.optional(v.number()),
    failedCount: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { batchId, status, completedCount, failedCount, error }) => {
    const batch = await ctx.db
      .query('tag_batches')
      .withIndex('by_batch_id', (q) => q.eq('batchId', batchId))
      .first()

    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`)
    }

    const updates: Record<string, unknown> = { status }
    if (completedCount !== undefined) updates.completedCount = completedCount
    if (failedCount !== undefined) updates.failedCount = failedCount
    if (error !== undefined) updates.error = error
    if (status === 'completed' || status === 'failed') {
      updates.completedAt = Date.now()
    }

    await ctx.db.patch(batch._id, updates)
  },
})

/**
 * Store a tag result from a batch
 */
export const storeTagResult = internalMutation({
  args: {
    seed: v.string(),
    provider: v.string(),
    model: v.string(),
    analysisIndex: v.number(),
    promptVersion: v.string(),
    tags: v.any(),
    error: v.optional(v.string()),
    usage: v.optional(
      v.object({
        inputTokens: v.number(),
        outputTokens: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    // Check for existing result (idempotency) - use filter since index changed
    const existingTags = await ctx.db
      .query('palette_tags')
      .withIndex('by_seed_provider', (q) =>
        q.eq('seed', args.seed).eq('provider', args.provider).eq('model', args.model),
      )
      .collect()

    const existing = existingTags.find((t) => t.analysisIndex === args.analysisIndex)
    if (existing) {
      return existing._id
    }

    return await ctx.db.insert('palette_tags', args)
  },
})

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all palettes that need tagging for a given provider and analysis count
 */
export const getPalettesNeedingTags = query({
  args: {
    provider: v.string(),
    model: v.string(),
    analysisCount: v.number(),
  },
  handler: async (ctx, { provider, model, analysisCount }) => {
    // Get all palettes
    const palettes = await ctx.db.query('palettes').collect()

    // Get existing tags for this provider/model
    const existingTags = await ctx.db
      .query('palette_tags')
      .withIndex('by_provider', (q) => q.eq('provider', provider))
      .collect()

    // Filter to only those matching our model
    const tagsForModel = existingTags.filter((t) => t.model === model)

    // Group by seed - handle both analysisIndex (new) and runNumber (legacy)
    const tagsBySeed = new Map<string, Set<number>>()
    for (const tag of tagsForModel) {
      if (!tag.error) {
        // Only count successful tags
        // Use analysisIndex if available, otherwise fall back to runNumber - 1 (0-indexed)
        const index = tag.analysisIndex ?? (tag.runNumber !== undefined ? tag.runNumber - 1 : 0)
        const indices = tagsBySeed.get(tag.seed) ?? new Set()
        indices.add(index)
        tagsBySeed.set(tag.seed, indices)
      }
    }

    // Find palettes that need more tags
    const needsTags: Array<{ _id: string; seed: string; missingIndices: number[] }> = []

    for (const palette of palettes) {
      const existingIndices = tagsBySeed.get(palette.seed) ?? new Set()
      const missingIndices: number[] = []

      for (let i = 0; i < analysisCount; i++) {
        if (!existingIndices.has(i)) {
          missingIndices.push(i)
        }
      }

      if (missingIndices.length > 0) {
        needsTags.push({ _id: palette._id, seed: palette.seed, missingIndices })
      }
    }

    return needsTags
  },
})

/**
 * Get active/pending batches
 */
export const getActiveBatches = query({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query('tag_batches')
      .withIndex('by_status', (q) => q.eq('status', 'pending'))
      .collect()

    const processing = await ctx.db
      .query('tag_batches')
      .withIndex('by_status', (q) => q.eq('status', 'processing'))
      .collect()

    return [...pending, ...processing]
  },
})

/**
 * Get batch by provider batch ID
 */
export const getBatchByBatchId = query({
  args: { batchId: v.string() },
  handler: async (ctx, { batchId }) => {
    return await ctx.db
      .query('tag_batches')
      .withIndex('by_batch_id', (q) => q.eq('batchId', batchId))
      .first()
  },
})

/**
 * Get recent batches (all statuses) for UI display
 */
export const getRecentBatches = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 20 }) => {
    const batches = await ctx.db.query('tag_batches').order('desc').take(limit)

    return batches.map((batch) => ({
      _id: batch._id,
      provider: batch.provider,
      model: batch.model ?? 'unknown',
      batchId: batch.batchId,
      status: batch.status,
      requestCount: batch.requestCount,
      completedCount: batch.completedCount,
      failedCount: batch.failedCount,
      createdAt: batch.createdAt,
      completedAt: batch.completedAt,
      error: batch.error,
    }))
  },
})

/**
 * Get overall backfill status
 */
export const getBackfillStatus = query({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db.query('config').first()
    const analysisCount = config?.tagAnalysisCount ?? 1

    const palettes = await ctx.db.query('palettes').collect()
    const tags = await ctx.db.query('palette_tags').collect()
    const batches = await ctx.db.query('tag_batches').collect()

    // Group tags by seed to count unique palettes tagged
    const seedsWithTags = new Set<string>()
    const successfulTags = tags.filter((t) => !t.error)
    for (const tag of successfulTags) {
      seedsWithTags.add(tag.seed)
    }

    // Count by unique provider (the provider field in old data is like "groq-llama3")
    const providerCounts = new Map<string, number>()
    for (const tag of successfulTags) {
      const count = providerCounts.get(tag.provider) ?? 0
      providerCounts.set(tag.provider, count + 1)
    }

    // Build provider stats from actual data
    const providerStats: Array<{
      provider: string
      model: string
      completed: number
      expected: number
    }> = []

    for (const [provider, count] of providerCounts) {
      // Find one tag to get the model
      const sampleTag = successfulTags.find((t) => t.provider === provider)
      providerStats.push({
        provider,
        model: sampleTag?.model ?? 'unknown',
        completed: count,
        expected: palettes.length * analysisCount,
      })
    }

    // Sort by provider name
    providerStats.sort((a, b) => a.provider.localeCompare(b.provider))

    const totalErrors = tags.filter((t) => t.error).length

    const activeBatches = batches.filter(
      (b) => b.status === 'pending' || b.status === 'processing',
    )

    return {
      palettes: palettes.length,
      palettesWithTags: seedsWithTags.size,
      analysisCount,
      uniqueProviders: providerCounts.size,
      totalTags: successfulTags.length,
      totalErrors,
      activeBatches: activeBatches.length,
      providerStats,
    }
  },
})

/**
 * Get errors grouped by provider/model
 */
export const getErrorsByModel = query({
  args: {},
  handler: async (ctx) => {
    const tags = await ctx.db.query('palette_tags').collect()
    const errorTags = tags.filter((t) => t.error)

    // Group by provider/model
    const errorsByModel = new Map<string, Array<{ seed: string; analysisIndex: number; error: string }>>()

    for (const tag of errorTags) {
      const key = `${tag.provider}/${tag.model}`
      const errors = errorsByModel.get(key) ?? []
      errors.push({
        seed: tag.seed,
        analysisIndex: tag.analysisIndex ?? 0,
        error: tag.error ?? 'Unknown error',
      })
      errorsByModel.set(key, errors)
    }

    // Convert to array format
    const result: Array<{
      model: string
      errorCount: number
      errors: Array<{ seed: string; analysisIndex: number; error: string }>
    }> = []

    for (const [model, errors] of errorsByModel) {
      result.push({
        model,
        errorCount: errors.length,
        errors,
      })
    }

    // Sort by error count descending
    result.sort((a, b) => b.errorCount - a.errorCount)

    return result
  },
})

/**
 * Delete all tags (for testing/reset)
 */
export const clearAllTags = mutation({
  args: {},
  handler: async (ctx) => {
    const tags = await ctx.db.query('palette_tags').collect()
    for (const tag of tags) {
      await ctx.db.delete(tag._id)
    }

    const batches = await ctx.db.query('tag_batches').collect()
    for (const batch of batches) {
      await ctx.db.delete(batch._id)
    }

    return { deleted: tags.length, batchesDeleted: batches.length }
  },
})
