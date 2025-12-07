import { query, mutation, internalMutation, internalQuery } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'
import { vBatchStatus, vRefinementModel, vRefinementProvider } from './lib/providers.types'
import { generateColorDataFromSeed } from './lib/colorData'
import type { TagSummary } from './lib/refinement'
import { refinedSeedsAggregate, paletteTagsAggregate } from './lib/aggregates'

// ============================================================================
// Prompt Version Discovery
// ============================================================================

/**
 * Get available prompt versions for refinement UI.
 * Returns versions with a 'version' property (not 'promptVersion') for frontend compatibility.
 *
 * This is an alias for getAvailableTagCycles with normalized property names.
 */
export const getAvailablePromptVersions = query({
  args: {},
  handler: async (ctx) => {
    // Get registered tagging prompt versions
    const promptVersions = await ctx.db
      .query('prompt_versions')
      .withIndex('by_type', (q) => q.eq('type', 'tagging'))
      .collect()

    if (promptVersions.length === 0) {
      return []
    }

    // Sample individual palette_tags to get version distribution
    const halfSample = 5000
    const oldestTags = await ctx.db.query('palette_tags').take(halfSample)
    const newestTags = await ctx.db.query('palette_tags').order('desc').take(halfSample)

    // Count tags per version from both samples
    const versionCounts = new Map<string, number>()
    for (const tag of oldestTags) {
      if (tag.promptVersion) {
        const count = versionCounts.get(tag.promptVersion) ?? 0
        versionCounts.set(tag.promptVersion, count + 1)
      }
    }
    for (const tag of newestTags) {
      if (tag.promptVersion) {
        const count = versionCounts.get(tag.promptVersion) ?? 0
        versionCounts.set(tag.promptVersion, count + 1)
      }
    }
    const tagsSample = [...oldestTags, ...newestTags]

    // Get total tags count from aggregate (accurate)
    const totalTags = await paletteTagsAggregate.count(ctx)

    // Scale up sample counts to estimate actual counts
    const scaleFactor = tagsSample.length > 0 ? totalTags / tagsSample.length : 1

    // Also check tag_batches for cycle information (newer batches have promptVersion)
    const batches = await ctx.db.query('tag_batches').collect()
    const cyclesByVersion = new Map<string, Set<number>>()
    for (const batch of batches) {
      if (batch.promptVersion) {
        const cycles = cyclesByVersion.get(batch.promptVersion) ?? new Set()
        cycles.add(batch.cycle ?? 1)
        cyclesByVersion.set(batch.promptVersion, cycles)
      }
    }

    // Build result from registered prompt versions
    // Use 'version' instead of 'promptVersion' for frontend compatibility
    const versions = promptVersions
      .map((pv) => {
        const sampleCount = versionCounts.get(pv.version) ?? 0
        const estimatedCount = Math.round(sampleCount * scaleFactor)
        const cycles = cyclesByVersion.get(pv.version)

        return {
          version: pv.version, // Frontend expects 'version', not 'promptVersion'
          cycles: cycles ? Array.from(cycles).sort((a, b) => b - a) : [],
          tagCount: estimatedCount,
          paletteCount: 0,
          createdAt: pv._creationTime,
          message: pv.message,
        }
      })
      // Filter out versions with no data
      .filter((v) => v.tagCount > 0)
      // Sort by creation time descending (most recent first)
      .sort((a, b) => b.createdAt - a.createdAt)

    return versions
  },
})

// ============================================================================
// Cycle Management
// ============================================================================

/**
 * Get the current (latest) refinement cycle number.
 * Returns 0 if no refinement batches exist yet.
 */
export const getCurrentRefinementCycle = query({
  args: {},
  handler: async (ctx) => {
    const batches = await ctx.db.query('refinement_batches').collect()
    if (batches.length === 0) return 0
    return Math.max(...batches.map((b) => b.cycle))
  },
})

/**
 * Get the next refinement cycle number (current + 1)
 */
export const getNextRefinementCycle = internalQuery({
  args: {},
  handler: async (ctx) => {
    const batches = await ctx.db.query('refinement_batches').collect()
    if (batches.length === 0) return 1
    return Math.max(...batches.map((b) => b.cycle)) + 1
  },
})

// ============================================================================
// Refinement Queries
// ============================================================================

/**
 * Get palettes that need refinement for a specific model and cycle.
 * A palette needs refinement if:
 * 1. It has consensus data from any of the specified prompt versions
 * 2. It doesn't already have a successful refinement from this specific model+cycle
 *
 * OPTIMIZED: Uses palette_tag_consensus table instead of scanning palette_tags.
 * This reduces reads from O(tags_per_seed × num_seeds) to O(consensus_docs).
 *
 * @param model - The refinement model to check against
 * @param cycle - The refinement cycle number
 * @param sourcePromptVersions - Array of prompt versions to include (defaults to all)
 */
export const getPalettesForRefinement = query({
  args: {
    model: vRefinementModel,
    cycle: v.number(),
    sourcePromptVersions: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { model, cycle, sourcePromptVersions, limit = 1000 }) => {
    // Get existing refinements FOR THIS SPECIFIC MODEL+CYCLE using index
    const refinements = await ctx.db
      .query('palette_tag_refined')
      .withIndex('by_model_cycle', (q) => q.eq('model', model).eq('cycle', cycle))
      .collect()
    const refinedSeeds = new Set(
      refinements
        .filter((r) => !r.error)
        .map((r) => r.seed)
    )

    // Determine which prompt versions to filter by
    const targetVersions = sourcePromptVersions && sourcePromptVersions.length > 0
      ? new Set(sourcePromptVersions)
      : null // null means all versions

    // OPTIMIZED: Query palette_tag_consensus instead of scanning palette_tags
    // Each consensus doc is per seed+promptVersion, much smaller than palette_tags
    // Use pagination to avoid hitting memory limits with large datasets
    const PAGE_SIZE = 500
    let cursor: string | null = null
    const seedsWithConsensus = new Map<string, { totalModels: number; promptVersions: Set<string> }>()

    // Paginate through consensus docs
    while (true) {
      const page = await ctx.db
        .query('palette_tag_consensus')
        .paginate({ cursor, numItems: PAGE_SIZE })

      for (const doc of page.page) {
        // Filter by target prompt versions if specified
        if (targetVersions !== null && (!doc.promptVersion || !targetVersions.has(doc.promptVersion))) {
          continue
        }

        // Skip if already refined for this model+cycle
        if (refinedSeeds.has(doc.seed)) continue

        // Accumulate consensus data per seed
        const existing = seedsWithConsensus.get(doc.seed)
        if (existing) {
          existing.totalModels += doc.totalModels
          if (doc.promptVersion) {
            existing.promptVersions.add(doc.promptVersion)
          }
        } else {
          seedsWithConsensus.set(doc.seed, {
            totalModels: doc.totalModels,
            promptVersions: new Set(doc.promptVersion ? [doc.promptVersion] : []),
          })
        }
      }

      if (page.isDone) break
      cursor = page.continueCursor
    }

    // Get palette info for seeds with consensus (we need imageUrl and _id)
    // Only fetch palettes for seeds we care about
    const seedsToFetch = Array.from(seedsWithConsensus.keys()).slice(0, limit * 2) // Fetch extras in case some don't exist

    const palettesNeedingRefinement: Array<{
      seed: string
      imageUrl: string
      _id: string
      tagCount: number
    }> = []

    for (const seed of seedsToFetch) {
      const palette = await ctx.db
        .query('palettes')
        .withIndex('by_seed', (q) => q.eq('seed', seed))
        .first()

      if (!palette) continue

      const consensusInfo = seedsWithConsensus.get(seed)!
      palettesNeedingRefinement.push({
        _id: palette._id,
        seed: palette.seed,
        imageUrl: palette.imageUrl,
        tagCount: consensusInfo.totalModels,
      })

      // Early exit if we have enough
      if (palettesNeedingRefinement.length >= limit) break
    }

    // Sort by tag count (prioritize palettes with more tags)
    palettesNeedingRefinement.sort((a, b) => b.tagCount - a.tagCount)

    return palettesNeedingRefinement.slice(0, limit)
  },
})

/**
 * Build TagSummaries for palettes ready for refinement.
 *
 * OPTIMIZED: Reads exclusively from the pre-computed palette_tag_consensus table.
 * Seeds without consensus data are skipped (getPalettesForRefinement ensures
 * only seeds with consensus are passed here).
 *
 * This reduces reads from O(tags_per_seed × num_seeds) to O(num_seeds × num_versions).
 * With 4 prompt versions, that's ~4 reads per seed vs ~130 reads per seed.
 *
 * @param sourcePromptVersions - Array of prompt versions to include (all versions if empty)
 */
export const buildTagSummaries = internalQuery({
  args: {
    seeds: v.array(v.string()),
    sourcePromptVersions: v.array(v.string()),
  },
  handler: async (ctx, { seeds, sourcePromptVersions }) => {
    const summaries: TagSummary[] = []

    // Build set of target prompt versions for efficient lookup
    const targetVersions = sourcePromptVersions.length > 0
      ? new Set(sourcePromptVersions)
      : null // null means all versions

    for (const seed of seeds) {
      // Fetch palette by seed
      const palette = await ctx.db
        .query('palettes')
        .withIndex('by_seed', (q) => q.eq('seed', seed))
        .first()

      if (!palette) continue

      // Get all consensus docs for this seed (one per prompt version)
      const consensusDocs = await ctx.db
        .query('palette_tag_consensus')
        .withIndex('by_seed', (q) => q.eq('seed', seed))
        .collect()

      // Skip seeds without consensus data
      // (getPalettesForRefinement ensures only seeds with consensus are returned)
      if (consensusDocs.length === 0) {
        console.warn(`Skipping seed ${seed}: no consensus data found`)
        continue
      }

      // Filter by target prompt versions if specified
      const filteredDocs = targetVersions
        ? consensusDocs.filter((c) => c.promptVersion && targetVersions.has(c.promptVersion))
        : consensusDocs

      if (filteredDocs.length === 0) {
        console.warn(`Skipping seed ${seed}: no consensus for target versions`)
        continue
      }

      // Merge consensus from matching versions
      const merged = mergeConsensusDocsForSummary(filteredDocs)

      const colorData = generateColorDataFromSeed(palette.seed)

      // Use the first matching version as the "source" (for display purposes)
      const sourcePromptVersion = filteredDocs[0].promptVersion ?? 'unknown'

      summaries.push({
        seed: palette.seed,
        paletteId: palette._id,
        colorData,
        imageUrl: palette.imageUrl,
        totalModels: merged.totalModels,
        sourcePromptVersion,
        categorical: merged.categorical,
        tags: merged.tags,
      })
    }

    return summaries
  },
})

/**
 * Helper to merge multiple consensus docs into a single summary.
 * Used when aggregating across prompt versions.
 */
function mergeConsensusDocsForSummary(
  docs: Array<{
    totalModels: number
    categorical: TagSummary['categorical']
    tags: TagSummary['tags']
  }>
): { totalModels: number; categorical: TagSummary['categorical']; tags: TagSummary['tags'] } {
  const result = {
    totalModels: 0,
    categorical: {
      temperature: {} as Record<string, number>,
      contrast: {} as Record<string, number>,
      brightness: {} as Record<string, number>,
      saturation: {} as Record<string, number>,
    },
    tags: {
      mood: {} as Record<string, number>,
      style: {} as Record<string, number>,
      dominant_colors: {} as Record<string, number>,
      seasonal: {} as Record<string, number>,
      associations: {} as Record<string, number>,
    },
  }

  for (const doc of docs) {
    result.totalModels += doc.totalModels

    // Merge categorical
    for (const cat of ['temperature', 'contrast', 'brightness', 'saturation'] as const) {
      for (const [key, count] of Object.entries(doc.categorical[cat])) {
        result.categorical[cat][key] = (result.categorical[cat][key] ?? 0) + count
      }
    }

    // Merge tags
    for (const tagType of ['mood', 'style', 'dominant_colors', 'seasonal', 'associations'] as const) {
      for (const [key, count] of Object.entries(doc.tags[tagType])) {
        result.tags[tagType][key] = (result.tags[tagType][key] ?? 0) + count
      }
    }
  }

  return result
}

// ============================================================================
// Refinement Batch Management
// ============================================================================

/**
 * Create a new refinement batch record
 */
export const createRefinementBatch = internalMutation({
  args: {
    cycle: v.number(),
    provider: vRefinementProvider,
    model: vRefinementModel,
    batchId: v.string(),
    sourcePromptVersions: v.array(v.string()),
    requestCount: v.number(),
    requestOrder: v.array(v.string()),
  },
  returns: v.id('refinement_batches'),
  handler: async (ctx, args) => {
    return await ctx.db.insert('refinement_batches', {
      ...args,
      status: 'pending',
      completedCount: 0,
      failedCount: 0,
      createdAt: Date.now(),
    })
  },
})

/**
 * Update refinement batch status
 */
export const updateRefinementBatchStatus = internalMutation({
  args: {
    batchId: v.string(),
    status: vBatchStatus,
    completedCount: v.optional(v.number()),
    failedCount: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { batchId, status, completedCount, failedCount, error }) => {
    const batch = await ctx.db
      .query('refinement_batches')
      .withIndex('by_batch_id', (q) => q.eq('batchId', batchId))
      .first()

    if (!batch) {
      throw new Error(`Refinement batch not found: ${batchId}`)
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
 * Force-fail a stuck batch (public mutation for dashboard use)
 * Use this when a batch is stuck and cancel isn't working
 */
export const forceFailBatch = mutation({
  args: {
    batchId: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { batchId, reason }) => {
    const batch = await ctx.db
      .query('refinement_batches')
      .withIndex('by_batch_id', (q) => q.eq('batchId', batchId))
      .first()

    if (!batch) {
      throw new Error(`Refinement batch not found: ${batchId}`)
    }

    await ctx.db.patch(batch._id, {
      status: 'failed',
      error: reason ?? 'Force-failed by user',
      completedAt: Date.now(),
    })

    return { success: true, previousStatus: batch.status }
  },
})

/**
 * Store a refined tag result
 */
export const storeRefinedResult = internalMutation({
  args: {
    seed: v.string(),
    model: vRefinementModel,
    cycle: v.number(),
    promptVersion: v.string(),
    sourcePromptVersions: v.array(v.string()),
    tags: v.any(),
    embedText: v.string(),
    inputSummary: v.optional(v.any()),
    error: v.optional(v.string()),
    usage: v.optional(
      v.object({
        inputTokens: v.number(),
        outputTokens: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    // Check for existing result for this seed+model+cycle (idempotency)
    const existing = await ctx.db
      .query('palette_tag_refined')
      .withIndex('by_model_cycle', (q) => q.eq('model', args.model).eq('cycle', args.cycle))
      .filter((q) => q.eq(q.field('seed'), args.seed))
      .first()

    if (existing) {
      // Update aggregate: replace old doc with new values
      const oldDoc = existing
      await ctx.db.patch(existing._id, {
        tags: args.tags,
        embedText: args.embedText,
        promptVersion: args.promptVersion,
        sourcePromptVersions: args.sourcePromptVersions,
        inputSummary: args.inputSummary,
        error: args.error,
        usage: args.usage,
      })
      const newDoc = await ctx.db.get(existing._id)
      await refinedSeedsAggregate.replace(ctx, oldDoc, newDoc!)
      return existing._id
    }

    // Insert new record and update aggregate
    const id = await ctx.db.insert('palette_tag_refined', args)
    const doc = await ctx.db.get(id)
    await refinedSeedsAggregate.insert(ctx, doc!)
    return id
  },
})

/**
 * Get refinement batch by batch ID (internal)
 */
export const getRefinementBatchByBatchId = internalQuery({
  args: { batchId: v.string() },
  handler: async (ctx, { batchId }) => {
    return await ctx.db
      .query('refinement_batches')
      .withIndex('by_batch_id', (q) => q.eq('batchId', batchId))
      .first()
  },
})

// ============================================================================
// Status Queries
// ============================================================================

/**
 * Get active refinement batches
 */
export const getActiveRefinementBatches = query({
  args: {},
  handler: async (ctx) => {
    const batches = await ctx.db.query('refinement_batches').collect()
    return batches.filter((b) => b.status === 'pending' || b.status === 'processing')
  },
})

/**
 * Get recent refinement batches for display
 */
export const getRecentRefinementBatches = query({
  args: { limit: v.optional(v.number()), cycle: v.optional(v.number()) },
  handler: async (ctx, { limit = 20, cycle }) => {
    const allBatches = await ctx.db.query('refinement_batches').collect()
    if (allBatches.length === 0) return []

    const targetCycle = cycle ?? Math.max(...allBatches.map((b) => b.cycle))

    return allBatches
      .filter((b) => b.cycle === targetCycle)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
  },
})

/**
 * Get overall refinement status using aggregates for real-time counts.
 * Falls back to cached values for stats that aren't aggregated yet.
 */
export const getRefinementStatus = query({
  args: {},
  handler: async (ctx) => {
    // Get real-time counts from aggregates (O(log n) operations)
    const totalRefinedAttempts = await refinedSeedsAggregate.count(ctx)
    const successfulRefinements = await refinedSeedsAggregate.sum(ctx)
    const erroredRefinements = totalRefinedAttempts - successfulRefinements

    // Get cached stats for values we don't aggregate yet
    const cached = await ctx.db
      .query('stats_cache')
      .withIndex('by_key', (q) => q.eq('key', 'refinement_status'))
      .first()

    // Get active batches count (this is a small table, safe to scan)
    const batches = await ctx.db
      .query('refinement_batches')
      .withIndex('by_status', (q) => q.eq('status', 'processing'))
      .collect()
    const pendingBatches = await ctx.db
      .query('refinement_batches')
      .withIndex('by_status', (q) => q.eq('status', 'pending'))
      .collect()
    const activeBatchCount = batches.length + pendingBatches.length

    // Use cached values for palette counts, aggregate values for refinement counts
    const totalPalettes = cached?.data?.totalPalettes ?? 0
    const palettesWithTags = cached?.data?.palettesWithTags ?? 0

    return {
      totalPalettes,
      palettesWithTags,
      refined: successfulRefinements,
      pending: Math.max(0, palettesWithTags - successfulRefinements - erroredRefinements),
      errors: erroredRefinements,
      activeBatches: activeBatchCount,
      cachedAt: cached?.updatedAt ?? null,
    }
  },
})

/**
 * Refresh the refinement status cache for palette/tag counts only.
 * Refined counts now come from aggregates in real-time.
 *
 * Uses paletteTagsAggregate to get tag counts without full table scan.
 * For palettesWithTags, we use an approximation: if we have successful tags,
 * assume all palettes have been tagged at least once (since batches cover all palettes).
 */
export const refreshRefinementStatusCache = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Count palettes (small table, safe to collect)
    const palettes = await ctx.db.query('palettes').collect()

    // Use aggregate to check if any successful tags exist
    const successfulTagCount = await paletteTagsAggregate.sum(ctx)

    // If we have successful tags, all palettes have been tagged
    // (since batch jobs process all palettes together)
    const palettesWithTags = successfulTagCount > 0 ? palettes.length : 0

    const stats = {
      totalPalettes: palettes.length,
      palettesWithTags,
    }

    // Upsert cache
    const existing = await ctx.db
      .query('stats_cache')
      .withIndex('by_key', (q) => q.eq('key', 'refinement_status'))
      .first()

    if (existing) {
      await ctx.db.patch(existing._id, {
        data: stats,
        updatedAt: Date.now(),
      })
    } else {
      await ctx.db.insert('stats_cache', {
        key: 'refinement_status',
        data: stats,
        updatedAt: Date.now(),
      })
    }

    return stats
  },
})

/**
 * Get a refined result by seed
 */
export const getRefinedBySeed = query({
  args: { seed: v.string() },
  handler: async (ctx, { seed }) => {
    return await ctx.db
      .query('palette_tag_refined')
      .withIndex('by_seed', (q) => q.eq('seed', seed))
      .first()
  },
})

/**
 * Get seeds that have failed refinements for a specific model (for retry).
 * Returns seeds that have refinement records with errors for the given model.
 */
export const getFailedRefinementSeeds = internalQuery({
  args: {
    model: vRefinementModel,
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { model, limit = 1000 }) => {
    const refined = await ctx.db.query('palette_tag_refined').collect()
    const failedSeeds = refined
      .filter((r) => r.model === model && r.error)
      .map((r) => r.seed)
      .slice(0, limit)
    return failedSeeds
  },
})

/**
 * Get failed refinement errors for a specific model (for UI display).
 * Returns seed and error message pairs.
 */
export const getFailedRefinementErrors = query({
  args: {
    model: vRefinementModel,
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { model, limit = 50 }) => {
    const refined = await ctx.db
      .query('palette_tag_refined')
      .withIndex('by_model', (q) => q.eq('model', model))
      .collect()

    return refined
      .filter((r) => r.error)
      .slice(0, limit)
      .map((r) => ({
        seed: r.seed,
        error: r.error!,
      }))
  },
})

/**
 * Delete failed refinement records for a specific model so they can be retried.
 * Called before submitting a retry batch.
 */
export const deleteFailedRefinements = internalMutation({
  args: {
    model: vRefinementModel,
    seeds: v.array(v.string()),
  },
  handler: async (ctx, { model, seeds }) => {
    const seedSet = new Set(seeds)
    const refined = await ctx.db.query('palette_tag_refined').collect()
    let deleted = 0
    for (const r of refined) {
      if (r.model === model && r.error && seedSet.has(r.seed)) {
        await refinedSeedsAggregate.delete(ctx, r)
        await ctx.db.delete(r._id)
        deleted++
      }
    }
    return { deleted }
  },
})

// ============================================================================
// Admin Actions
// ============================================================================

/**
 * Clear failed refinement records for a specific model.
 * This allows starting fresh without the failed records blocking new jobs.
 */
export const clearFailedRefinements = mutation({
  args: {
    model: vRefinementModel,
  },
  handler: async (ctx, { model }) => {
    const refined = await ctx.db
      .query('palette_tag_refined')
      .withIndex('by_model', (q) => q.eq('model', model))
      .collect()

    let deleted = 0
    for (const r of refined) {
      if (r.error) {
        await refinedSeedsAggregate.delete(ctx, r)
        await ctx.db.delete(r._id)
        deleted++
      }
    }

    return { deleted, model }
  },
})

/**
 * Clear all refinement data (for testing/reset)
 */
export const clearAllRefinements = mutation({
  args: {},
  handler: async (ctx) => {
    const refined = await ctx.db.query('palette_tag_refined').collect()
    for (const r of refined) {
      await refinedSeedsAggregate.delete(ctx, r)
      await ctx.db.delete(r._id)
    }

    const batches = await ctx.db.query('refinement_batches').collect()
    for (const b of batches) {
      await ctx.db.delete(b._id)
    }

    return { deleted: refined.length, batchesDeleted: batches.length }
  },
})

// ============================================================================
// Aggregate Backfill
// ============================================================================

/**
 * Backfill one batch of the refinedSeedsAggregate.
 * Call repeatedly with cursor until isDone is true, or use kickoffRebuildRefinedAggregate.
 */
export const backfillRefinedAggregateBatch = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, { cursor, batchSize = 500 }) => {
    const page = await ctx.db
      .query('palette_tag_refined')
      .paginate({ cursor: cursor ?? null, numItems: batchSize })

    let processed = 0
    for (const doc of page.page) {
      await refinedSeedsAggregate.insertIfDoesNotExist(ctx, doc)
      processed++
    }

    // Schedule next batch if not done
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.refinement.backfillRefinedAggregateBatch, {
        cursor: page.continueCursor,
        batchSize,
      })
    }

    return {
      processed,
      isDone: page.isDone,
      nextCursor: page.isDone ? null : page.continueCursor,
    }
  },
})

/**
 * Clear the aggregate and start rebuild.
 * This kicks off a chain of scheduled mutations to rebuild the entire aggregate.
 */
export const rebuildRefinedAggregate = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Clear the aggregate first
    await refinedSeedsAggregate.clear(ctx)

    // Schedule the first batch of backfill
    await ctx.scheduler.runAfter(0, internal.refinement.backfillRefinedAggregateBatch, {
      batchSize: 500,
    })

    return { status: 'started', message: 'Aggregate cleared, backfill scheduled' }
  },
})
