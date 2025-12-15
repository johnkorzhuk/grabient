import { query, mutation, internalMutation, internalQuery } from './_generated/server'
import { v } from 'convex/values'
import { vBatchStatus } from './lib/providers.types'

// ============================================================================
// Queries
// ============================================================================

/**
 * Get the next generation cycle number
 */
export const getNextGenerationCycle = query({
  args: {},
  handler: async (ctx) => {
    const latestBatch = await ctx.db
      .query('generation_batches')
      .order('desc')
      .first()

    return (latestBatch?.cycle ?? 0) + 1
  },
})

/**
 * Get all active (pending/processing) generation batches
 */
export const getActiveGenerationBatches = query({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query('generation_batches')
      .withIndex('by_status', (q) => q.eq('status', 'pending'))
      .collect()

    const processing = await ctx.db
      .query('generation_batches')
      .withIndex('by_status', (q) => q.eq('status', 'processing'))
      .collect()

    return [...pending, ...processing]
  },
})

/**
 * Get all generation batches for display
 */
export const getAllGenerationBatches = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('generation_batches')
      .order('desc')
      .collect()
  },
})

/**
 * Get generation batch by batchId (internal)
 */
export const getGenerationBatchByBatchId = internalQuery({
  args: { batchId: v.string() },
  handler: async (ctx, { batchId }) => {
    return await ctx.db
      .query('generation_batches')
      .withIndex('by_batch_id', (q) => q.eq('batchId', batchId))
      .first()
  },
})

/**
 * Get generated palettes for browsing
 */
export const getGeneratedPalettes = query({
  args: {
    cycle: v.optional(v.number()),
    tag: v.optional(v.string()),
    withExamples: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { cycle, tag, withExamples, limit = 100 }) => {
    // Use the most specific index based on provided filters
    if (cycle !== undefined && tag !== undefined && withExamples !== undefined) {
      return await ctx.db
        .query('generated_palettes')
        .withIndex('by_cycle_tag_examples', (idx) =>
          idx.eq('cycle', cycle).eq('tag', tag).eq('withExamples', withExamples)
        )
        .take(limit)
    }

    if (cycle !== undefined && withExamples !== undefined) {
      return await ctx.db
        .query('generated_palettes')
        .withIndex('by_cycle_examples', (idx) =>
          idx.eq('cycle', cycle).eq('withExamples', withExamples)
        )
        .take(limit)
    }

    if (cycle !== undefined && tag !== undefined) {
      return await ctx.db
        .query('generated_palettes')
        .withIndex('by_cycle_tag', (idx) =>
          idx.eq('cycle', cycle).eq('tag', tag)
        )
        .take(limit)
    }

    if (cycle !== undefined) {
      return await ctx.db
        .query('generated_palettes')
        .withIndex('by_cycle', (idx) => idx.eq('cycle', cycle))
        .take(limit)
    }

    if (tag !== undefined) {
      const results = await ctx.db
        .query('generated_palettes')
        .withIndex('by_tag', (idx) => idx.eq('tag', tag))
        .take(limit)

      // Filter by withExamples if provided
      if (withExamples !== undefined) {
        return results.filter((p) => p.withExamples === withExamples)
      }
      return results
    }

    // No filters - return recent palettes
    const results = await ctx.db
      .query('generated_palettes')
      .order('desc')
      .take(limit)

    if (withExamples !== undefined) {
      return results.filter((p) => p.withExamples === withExamples)
    }
    return results
  },
})

/**
 * Get unique tags from generated palettes for a cycle
 */
export const getGeneratedTags = query({
  args: { cycle: v.number() },
  handler: async (ctx, { cycle }) => {
    const palettes = await ctx.db
      .query('generated_palettes')
      .withIndex('by_cycle', (q) => q.eq('cycle', cycle))
      .collect()

    const tags = new Set(palettes.map((p) => p.tag))
    return Array.from(tags).sort()
  },
})

/**
 * Get statistics for a generation cycle
 */
export const getGenerationStats = query({
  args: { cycle: v.number() },
  handler: async (ctx, { cycle }) => {
    const batch = await ctx.db
      .query('generation_batches')
      .withIndex('by_cycle', (q) => q.eq('cycle', cycle))
      .first()

    const palettes = await ctx.db
      .query('generated_palettes')
      .withIndex('by_cycle', (q) => q.eq('cycle', cycle))
      .collect()

    const withExamples = palettes.filter((p) => p.withExamples)
    const withoutExamples = palettes.filter((p) => !p.withExamples)
    const errors = palettes.filter((p) => p.error)

    const tagCounts: Record<string, { with: number; without: number }> = {}
    for (const p of palettes) {
      if (!tagCounts[p.tag]) {
        tagCounts[p.tag] = { with: 0, without: 0 }
      }
      if (p.withExamples) {
        tagCounts[p.tag].with++
      } else {
        tagCounts[p.tag].without++
      }
    }

    return {
      batch,
      totalPalettes: palettes.length,
      withExamples: withExamples.length,
      withoutExamples: withoutExamples.length,
      errors: errors.length,
      uniqueTags: Object.keys(tagCounts).length,
      tagCounts,
    }
  },
})

/**
 * Get available cycles for dropdown
 */
export const getAvailableGenerationCycles = query({
  args: {},
  handler: async (ctx) => {
    const batches = await ctx.db
      .query('generation_batches')
      .order('desc')
      .collect()

    return batches.map((b) => ({
      cycle: b.cycle,
      status: b.status,
      tags: b.tags.length,
      createdAt: b.createdAt,
    }))
  },
})

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new generation batch record
 */
export const createGenerationBatch = internalMutation({
  args: {
    cycle: v.number(),
    batchId: v.string(),
    tags: v.array(v.string()),
    palettesPerTag: v.number(),
    iterationCount: v.number(),
    requestCount: v.number(),
    requestOrder: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('generation_batches', {
      ...args,
      status: 'pending',
      completedCount: 0,
      failedCount: 0,
      createdAt: Date.now(),
    })
  },
})

/**
 * Update generation batch status
 */
export const updateGenerationBatchStatus = internalMutation({
  args: {
    batchId: v.string(),
    status: vBatchStatus,
    completedCount: v.optional(v.number()),
    failedCount: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { batchId, status, completedCount, failedCount, error }) => {
    const batch = await ctx.db
      .query('generation_batches')
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
 * Store a generated palette
 */
export const storeGeneratedPalette = internalMutation({
  args: {
    cycle: v.number(),
    tag: v.string(),
    iterationIndex: v.number(),
    paletteIndex: v.number(),
    withExamples: v.boolean(),
    colors: v.array(v.string()),
    modifiers: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('generated_palettes', {
      ...args,
      createdAt: Date.now(),
    })
  },
})

/**
 * Store a generation error
 */
export const storeGenerationError = internalMutation({
  args: {
    cycle: v.number(),
    tag: v.string(),
    iterationIndex: v.number(),
    withExamples: v.boolean(),
    error: v.string(),
  },
  handler: async (ctx, { cycle, tag, iterationIndex, withExamples, error }) => {
    return await ctx.db.insert('generated_palettes', {
      cycle,
      tag,
      iterationIndex,
      paletteIndex: -1, // Indicates error, not a real palette
      withExamples,
      colors: [],
      error,
      createdAt: Date.now(),
    })
  },
})

/**
 * Delete all generated palettes for a cycle (for cleanup/retry)
 */
export const deleteGenerationCycle = mutation({
  args: { cycle: v.number() },
  handler: async (ctx, { cycle }) => {
    // Delete palettes
    const palettes = await ctx.db
      .query('generated_palettes')
      .withIndex('by_cycle', (q) => q.eq('cycle', cycle))
      .collect()

    for (const palette of palettes) {
      await ctx.db.delete(palette._id)
    }

    // Delete batch record
    const batch = await ctx.db
      .query('generation_batches')
      .withIndex('by_cycle', (q) => q.eq('cycle', cycle))
      .first()

    if (batch) {
      await ctx.db.delete(batch._id)
    }

    return { deletedPalettes: palettes.length, deletedBatch: !!batch }
  },
})
