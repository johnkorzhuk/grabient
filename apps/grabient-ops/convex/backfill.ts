import { query, mutation, internalMutation, internalQuery } from './_generated/server'
import { v } from 'convex/values'
import { vProvider, vModel, vBatchStatus, getAllModels } from './lib/providers.types'

// ============================================================================
// Provider/Model Configuration
// ============================================================================

/**
 * Get all available provider/model combinations
 */
export const getProviderModels = query({
  args: {},
  handler: async () => {
    return {
      models: getAllModels(),
    }
  },
})

// ============================================================================
// Cycle Management
// ============================================================================

/**
 * Get the current (latest) cycle number from tag_batches.
 * Returns 0 if no batches exist yet.
 * Legacy batches without cycle field are treated as cycle 1.
 */
export const getCurrentCycle = query({
  args: {},
  handler: async (ctx) => {
    const batches = await ctx.db.query('tag_batches').collect()
    if (batches.length === 0) return 0
    return Math.max(...batches.map((b) => b.cycle ?? 1))
  },
})

/**
 * Get all cycle numbers that have batches, sorted descending (newest first)
 */
export const getAllCycles = query({
  args: {},
  handler: async (ctx) => {
    const batches = await ctx.db.query('tag_batches').collect()
    if (batches.length === 0) return []
    const cycles = new Set(batches.map((b) => b.cycle ?? 1))
    return Array.from(cycles).sort((a, b) => b - a)
  },
})

/**
 * Get the next cycle number (current + 1)
 * Legacy batches without cycle field are treated as cycle 1.
 */
export const getNextCycle = internalQuery({
  args: {},
  handler: async (ctx) => {
    const batches = await ctx.db.query('tag_batches').collect()
    if (batches.length === 0) return 1
    return Math.max(...batches.map((b) => b.cycle ?? 1)) + 1
  },
})

// ============================================================================
// Batch Management
// ============================================================================

/**
 * Create a new batch record
 */
export const createBatch = internalMutation({
  args: {
    cycle: v.number(),
    provider: vProvider,
    model: vModel,
    batchId: v.string(),
    analysisCount: v.number(),
    requestCount: v.number(),
    requestOrder: v.optional(v.array(v.string())), // For Google batches: customIds in order
  },
  returns: v.id('tag_batches'),
  handler: async (ctx, { cycle, provider, model, batchId, analysisCount, requestCount, requestOrder }) => {
    return await ctx.db.insert('tag_batches', {
      cycle,
      provider,
      model,
      batchId,
      status: 'pending',
      analysisCount,
      requestCount,
      completedCount: 0,
      failedCount: 0,
      createdAt: Date.now(),
      requestOrder,
    })
  },
})

/**
 * Update batch status
 */
export const updateBatchStatus = internalMutation({
  args: {
    batchId: v.string(),
    status: vBatchStatus,
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
    provider: vProvider,
    model: vModel,
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
 * Get all palettes for a new tagging cycle.
 * Each cycle adds `analysisCount` new tags per palette, starting from the next available index.
 * Previous cycle data is preserved - we always add new rows, never overwrite.
 */
export const getPalettesForNewCycle = query({
  args: {
    provider: vProvider,
    model: vModel,
    analysisCount: v.number(),
  },
  handler: async (ctx, { provider, model, analysisCount }) => {
    // Get all palettes
    const palettes = await ctx.db.query('palettes').collect()

    // Get existing tags for this provider/model to find max index per seed
    const existingTags = await ctx.db
      .query('palette_tags')
      .withIndex('by_provider', (q) => q.eq('provider', provider))
      .collect()

    // Filter to only those matching our model
    const tagsForModel = existingTags.filter((t) => t.model === model)

    // Find max analysisIndex per seed (regardless of success/error - we're moving forward)
    const maxIndexBySeed = new Map<string, number>()
    for (const tag of tagsForModel) {
      const index = tag.analysisIndex ?? (tag.runNumber !== undefined ? tag.runNumber - 1 : 0)
      const currentMax = maxIndexBySeed.get(tag.seed) ?? -1
      if (index > currentMax) {
        maxIndexBySeed.set(tag.seed, index)
      }
    }

    // Build list with new indices for this cycle
    const palettesForCycle: Array<{ _id: string; seed: string; newIndices: number[] }> = []

    for (const palette of palettes) {
      const maxExisting = maxIndexBySeed.get(palette.seed) ?? -1
      const startIndex = maxExisting + 1
      const newIndices: number[] = []

      for (let i = 0; i < analysisCount; i++) {
        newIndices.push(startIndex + i)
      }

      palettesForCycle.push({ _id: palette._id, seed: palette.seed, newIndices })
    }

    return palettesForCycle
  },
})

/**
 * Get active/pending batches for the current cycle
 */
export const getActiveBatches = query({
  args: {},
  handler: async (ctx) => {
    // Get current cycle
    const batches = await ctx.db.query('tag_batches').collect()
    if (batches.length === 0) return []
    const currentCycle = Math.max(...batches.map((b) => b.cycle ?? 1))

    // Filter to current cycle and active status
    const activeBatches = batches.filter(
      (b) => (b.cycle ?? 1) === currentCycle && (b.status === 'pending' || b.status === 'processing')
    )

    return activeBatches
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
 * Get batch by provider batch ID (internal version for actions)
 */
export const getBatchByBatchIdInternal = internalQuery({
  args: { batchId: v.string() },
  handler: async (ctx, { batchId }) => {
    return await ctx.db
      .query('tag_batches')
      .withIndex('by_batch_id', (q) => q.eq('batchId', batchId))
      .first()
  },
})

/**
 * Get batches for a specific cycle (UI display)
 * If no cycle is specified, returns batches for the current (latest) cycle
 */
export const getRecentBatches = query({
  args: { limit: v.optional(v.number()), cycle: v.optional(v.number()) },
  handler: async (ctx, { limit = 20, cycle }) => {
    // Get all batches
    const allBatches = await ctx.db.query('tag_batches').collect()
    if (allBatches.length === 0) return []

    // Determine which cycle to show
    const targetCycle = cycle ?? Math.max(...allBatches.map((b) => b.cycle ?? 1))

    // Filter to target cycle and sort by createdAt desc
    const cycleBatches = allBatches
      .filter((b) => (b.cycle ?? 1) === targetCycle)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)

    return cycleBatches.map((batch) => ({
      _id: batch._id,
      cycle: batch.cycle ?? 1,
      provider: batch.provider,
      model: batch.model,
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
 * Get overall backfill status.
 * Uses pagination to avoid the 16MB read limit on palette_tags.
 */
export const getBackfillStatus = query({
  args: {},
  handler: async (ctx) => {
    const palettes = await ctx.db.query('palettes').collect()
    const batches = await ctx.db.query('tag_batches').collect()

    // Process palette_tags with pagination to avoid 16MB limit
    const seedsWithTags = new Set<string>()
    const providerCounts = new Map<string, number>()
    const providerModels = new Map<string, string>() // Track one model per provider
    let totalSuccessful = 0
    let totalErrors = 0

    let isDone = false
    let cursor: string | null = null

    while (!isDone) {
      const page = await ctx.db
        .query('palette_tags')
        .paginate({ cursor, numItems: 1000 })

      for (const tag of page.page) {
        if (tag.error) {
          totalErrors++
        } else {
          totalSuccessful++
          seedsWithTags.add(tag.seed)
          const count = providerCounts.get(tag.provider) ?? 0
          providerCounts.set(tag.provider, count + 1)
          if (!providerModels.has(tag.provider)) {
            providerModels.set(tag.provider, tag.model)
          }
        }
      }

      isDone = page.isDone
      cursor = page.continueCursor
    }

    // Build provider stats from actual data
    const providerStats: Array<{
      provider: string
      model: string
      completed: number
      expected: number
    }> = []

    for (const [provider, count] of providerCounts) {
      providerStats.push({
        provider,
        model: providerModels.get(provider) ?? 'unknown',
        completed: count,
        expected: palettes.length,
      })
    }

    // Sort by provider name
    providerStats.sort((a, b) => a.provider.localeCompare(b.provider))

    const activeBatches = batches.filter(
      (b) => b.status === 'pending' || b.status === 'processing',
    )

    return {
      palettes: palettes.length,
      palettesWithTags: seedsWithTags.size,
      uniqueProviders: providerCounts.size,
      totalTags: totalSuccessful,
      totalErrors,
      activeBatches: activeBatches.length,
      providerStats,
    }
  },
})

/**
 * Get which cycles have errors (for dropdown filter).
 * Returns array of cycle numbers that have at least one failed batch.
 */
export const getCyclesWithErrors = query({
  args: {},
  handler: async (ctx) => {
    const batches = await ctx.db.query('tag_batches').collect()

    // Find cycles with failed batches (failedCount > 0)
    const cyclesWithErrors = new Set<number>()
    for (const batch of batches) {
      if (batch.failedCount > 0 && batch.cycle) {
        cyclesWithErrors.add(batch.cycle)
      }
    }

    // Return sorted array
    return Array.from(cyclesWithErrors).sort((a, b) => b - a) // Most recent first
  },
})

/**
 * Get errors grouped by provider/model for a specific cycle.
 * Uses pagination to avoid the 16MB read limit on palette_tags.
 */
export const getErrorsByModel = query({
  args: {
    cycle: v.optional(v.number()),
  },
  handler: async (ctx, { cycle }) => {
    const batches = await ctx.db.query('tag_batches').collect()

    // Determine index range for cycle filtering
    let startIndex = 0
    let endIndex = Infinity
    if (cycle !== undefined && cycle > 0) {
      const cycleBatches = batches.filter((b) => (b.cycle ?? 1) === cycle)
      if (cycleBatches.length > 0) {
        const analysisCount = cycleBatches[0].analysisCount ?? 1
        startIndex = (cycle - 1) * analysisCount
        endIndex = cycle * analysisCount - 1
      }
    }

    // Process palette_tags with pagination
    const errorsByModel = new Map<string, Array<{ seed: string; analysisIndex: number; error: string }>>()

    let isDone = false
    let cursor: string | null = null

    while (!isDone) {
      const page = await ctx.db
        .query('palette_tags')
        .paginate({ cursor, numItems: 1000 })

      for (const tag of page.page) {
        if (!tag.error) continue

        // Apply cycle filter if specified
        if (cycle !== undefined && cycle > 0) {
          const idx = tag.analysisIndex ?? 0
          if (idx < startIndex || idx > endIndex) continue
        }

        const key = `${tag.provider}/${tag.model}`
        const errors = errorsByModel.get(key) ?? []
        errors.push({
          seed: tag.seed,
          analysisIndex: tag.analysisIndex ?? 0,
          error: tag.error ?? 'Unknown error',
        })
        errorsByModel.set(key, errors)
      }

      isDone = page.isDone
      cursor = page.continueCursor
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
