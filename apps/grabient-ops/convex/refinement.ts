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

    // Get accurate tag counts from consensus table (totalModels = number of tags)
    // Use collect() - Convex only allows one paginated query per function
    const versionCounts = new Map<string, number>()
    const consensusDocs = await ctx.db.query('palette_tag_consensus').collect()

    for (const doc of consensusDocs) {
      if (doc.promptVersion) {
        const current = versionCounts.get(doc.promptVersion) ?? 0
        versionCounts.set(doc.promptVersion, current + doc.totalModels)
      }
    }

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
        const tagCount = versionCounts.get(pv.version) ?? 0
        const cycles = cyclesByVersion.get(pv.version)

        return {
          version: pv.version, // Frontend expects 'version', not 'promptVersion'
          cycles: cycles ? Array.from(cycles).sort((a, b) => b - a) : [],
          tagCount,
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
 * 1. It has consensus data (meaning it has been tagged)
 * 2. It doesn't already have a successful refinement from this specific model+cycle
 *
 * LIGHTWEIGHT: Uses consensus table to identify seeds with tags without loading
 * the actual tag data. The tag data is loaded later by buildTagSummaries in batches.
 *
 * Uses the by_prompt_version index when specific versions are requested,
 * avoiding full table scans.
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

    // Group consensus by seed
    const seedsWithTags = new Map<string, number>()

    // If specific prompt versions are requested, use the index for each version
    // This is much more efficient than scanning all consensus docs
    if (sourcePromptVersions && sourcePromptVersions.length > 0) {
      for (const version of sourcePromptVersions) {
        // Use the by_prompt_version index - only reads docs for this specific version
        const versionDocs = await ctx.db
          .query('palette_tag_consensus')
          .withIndex('by_prompt_version', (q) => q.eq('promptVersion', version))
          .collect()

        for (const doc of versionDocs) {
          // Skip if already refined for this model+cycle
          if (refinedSeeds.has(doc.seed)) continue

          // Accumulate tag count per seed
          const existing = seedsWithTags.get(doc.seed) ?? 0
          seedsWithTags.set(doc.seed, existing + doc.totalModels)
        }
      }
    } else {
      // No specific versions - need to scan all consensus docs
      // Take more than limit to account for filtering
      const consensusDocs = await ctx.db
        .query('palette_tag_consensus')
        .take(limit * 5)

      for (const doc of consensusDocs) {
        // Skip if already refined for this model+cycle
        if (refinedSeeds.has(doc.seed)) continue

        // Accumulate tag count per seed
        const existing = seedsWithTags.get(doc.seed) ?? 0
        seedsWithTags.set(doc.seed, existing + doc.totalModels)
      }
    }

    // Get palette info for seeds with tags (need imageUrl and _id)
    const palettesNeedingRefinement: Array<{
      seed: string
      imageUrl: string
      _id: string
      tagCount: number
    }> = []

    // Fetch palettes for the seeds we found
    for (const [seed, tagCount] of seedsWithTags) {
      if (palettesNeedingRefinement.length >= limit) break

      const palette = await ctx.db
        .query('palettes')
        .withIndex('by_seed', (q) => q.eq('seed', seed))
        .first()

      if (!palette) continue

      palettesNeedingRefinement.push({
        _id: palette._id,
        seed: palette.seed,
        imageUrl: palette.imageUrl,
        tagCount,
      })
    }

    // Sort by tag count (prioritize palettes with more tags)
    palettesNeedingRefinement.sort((a, b) => b.tagCount - a.tagCount)

    return palettesNeedingRefinement.slice(0, limit)
  },
})

/**
 * Build TagSummaries for palettes ready for refinement.
 *
 * OPTIMIZED: Reads from pre-computed palette_tag_consensus table instead of
 * re-aggregating from palette_tags. This reduces reads by ~10x since we read
 * 1 consensus doc per seed instead of 10+ palette_tags docs per seed.
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

      // Get consensus docs for this seed (one per prompt version)
      const consensusDocs = await ctx.db
        .query('palette_tag_consensus')
        .withIndex('by_seed', (q) => q.eq('seed', seed))
        .collect()

      // Filter by prompt versions if specified
      const matchingDocs = targetVersions
        ? consensusDocs.filter((c) => c.promptVersion && targetVersions.has(c.promptVersion))
        : consensusDocs

      if (matchingDocs.length === 0) {
        console.warn(`Skipping seed ${seed}: no consensus data found`)
        continue
      }

      // Merge consensus from all matching versions
      const merged = mergeConsensusData(matchingDocs)

      const colorData = generateColorDataFromSeed(palette.seed)

      // Use the first matching version as the "source" (for display purposes)
      const sourcePromptVersion = matchingDocs[0].promptVersion ?? 'unknown'

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
 * Helper to merge multiple consensus documents into one.
 * Used when aggregating across prompt versions.
 */
function mergeConsensusData(docs: Array<{
  totalModels: number
  categorical: {
    temperature: Array<{ key: string; value: number }>
    contrast: Array<{ key: string; value: number }>
    brightness: Array<{ key: string; value: number }>
    saturation: Array<{ key: string; value: number }>
  }
  tags: {
    harmony: Array<{ key: string; value: number }>
    mood: Array<{ key: string; value: number }>
    style: Array<{ key: string; value: number }>
    dominant_colors: Array<{ key: string; value: number }>
    seasonal: Array<{ key: string; value: number }>
    associations: Array<{ key: string; value: number }>
  }
}>): {
  totalModels: number
  categorical: TagSummary['categorical']
  tags: TagSummary['tags']
} {
  // Use Maps for efficient merging
  const categoricalMaps = {
    temperature: new Map<string, number>(),
    contrast: new Map<string, number>(),
    brightness: new Map<string, number>(),
    saturation: new Map<string, number>(),
  }
  const tagMaps = {
    harmony: new Map<string, number>(),
    mood: new Map<string, number>(),
    style: new Map<string, number>(),
    seasonal: new Map<string, number>(),
    associations: new Map<string, number>(),
  }

  let totalModels = 0

  for (const doc of docs) {
    totalModels += doc.totalModels

    // Merge categorical
    for (const cat of ['temperature', 'contrast', 'brightness', 'saturation'] as const) {
      for (const entry of doc.categorical[cat]) {
        const current = categoricalMaps[cat].get(entry.key) ?? 0
        categoricalMaps[cat].set(entry.key, current + entry.value)
      }
    }

    // Merge tags (dominant_colors removed - now computed algorithmically from hex)
    for (const tagType of ['harmony', 'mood', 'style', 'seasonal', 'associations'] as const) {
      for (const entry of doc.tags[tagType]) {
        const current = tagMaps[tagType].get(entry.key) ?? 0
        tagMaps[tagType].set(entry.key, current + entry.value)
      }
    }
  }

  // Convert Maps back to arrays
  const mapToArray = (map: Map<string, number>) =>
    Array.from(map.entries()).map(([key, value]) => ({ key, value }))

  return {
    totalModels,
    categorical: {
      temperature: mapToArray(categoricalMaps.temperature),
      contrast: mapToArray(categoricalMaps.contrast),
      brightness: mapToArray(categoricalMaps.brightness),
      saturation: mapToArray(categoricalMaps.saturation),
    },
    tags: {
      harmony: mapToArray(tagMaps.harmony),
      mood: mapToArray(tagMaps.mood),
      style: mapToArray(tagMaps.style),
      seasonal: mapToArray(tagMaps.seasonal),
      associations: mapToArray(tagMaps.associations),
    },
  }
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
    retryCount: v.optional(v.number()),
  },
  returns: v.id('refinement_batches'),
  handler: async (ctx, args) => {
    return await ctx.db.insert('refinement_batches', {
      ...args,
      status: 'pending',
      completedCount: 0,
      failedCount: 0,
      createdAt: Date.now(),
      retryCount: args.retryCount ?? 0,
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
 * Store multiple refined tag results in a single mutation (batch insert)
 * Much more efficient than calling storeRefinedResult one by one.
 * Set skipAggregates=true for bulk operations - run backfillRefinedSeedsAggregate after.
 */
export const storeRefinedResultsBatch = internalMutation({
  args: {
    results: v.array(
      v.object({
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
      }),
    ),
    skipAggregates: v.optional(v.boolean()),
  },
  handler: async (ctx, { results, skipAggregates }) => {
    let inserted = 0
    let updated = 0

    for (const args of results) {
      // Check for existing result for this seed+model (idempotency)
      // Use by_seed index which is most selective
      const existingForSeed = await ctx.db
        .query('palette_tag_refined')
        .withIndex('by_seed', (q) => q.eq('seed', args.seed))
        .collect()

      // Find the one matching model and cycle
      const existing = existingForSeed.find(
        (e) => e.model === args.model && e.cycle === args.cycle
      )

      if (existing) {
        // Update existing record
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
        if (!skipAggregates) {
          const newDoc = await ctx.db.get(existing._id)
          await refinedSeedsAggregate.replace(ctx, oldDoc, newDoc!)
        }
        updated++
      } else {
        // Insert new record
        const id = await ctx.db.insert('palette_tag_refined', args)
        if (!skipAggregates) {
          const doc = await ctx.db.get(id)
          await refinedSeedsAggregate.insert(ctx, doc!)
        }
        inserted++
      }
    }

    return { inserted, updated, total: results.length }
  },
})

/**
 * Fast bulk insert for new refinement results - NO idempotency checks.
 * Use only when you're confident there are no duplicates (e.g., fresh batch job).
 * Skips aggregates - run backfillRefinedSeedsAggregate after.
 */
export const bulkInsertRefinedResults = internalMutation({
  args: {
    results: v.array(
      v.object({
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
      }),
    ),
  },
  handler: async (ctx, { results }) => {
    // Direct insert - no queries, no aggregates, maximum speed
    for (const args of results) {
      await ctx.db.insert('palette_tag_refined', args)
    }
    return { inserted: results.length }
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
 * Get refined results for multiple seeds (batch lookup)
 * Returns a map of seed -> refinement data (embedText + tags)
 * Optionally filter by specific model and cycles
 */
export const getRefinedBySeeds = internalQuery({
  args: {
    seeds: v.array(v.string()),
    model: v.optional(vRefinementModel),
    cycles: v.optional(v.array(v.number())),
  },
  handler: async (ctx, { seeds, model, cycles }) => {
    const results: Record<
      string,
      { embedText: string; tags: Record<string, string[]> }
    > = {}

    const cycleSet = cycles?.length ? new Set(cycles) : null

    for (const seed of seeds) {
      // If model/cycles specified, look for match in any of the cycles
      let refined
      if (model && cycleSet) {
        // Query by seed first, then filter by model and any matching cycle
        const allForSeed = await ctx.db
          .query('palette_tag_refined')
          .withIndex('by_seed', (q) => q.eq('seed', seed))
          .collect()
        refined = allForSeed.find((r) => r.model === model && cycleSet.has(r.cycle))
      } else {
        // Just get the first refinement for this seed
        refined = await ctx.db
          .query('palette_tag_refined')
          .withIndex('by_seed', (q) => q.eq('seed', seed))
          .first()
      }

      if (refined && !refined.error && refined.embedText && refined.tags) {
        results[seed] = {
          embedText: refined.embedText,
          tags: refined.tags as Record<string, string[]>,
        }
      }
    }

    return results
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

// ============================================================================
// Tag Frequency Analysis
// ============================================================================

/**
 * Get available cycles for a given refinement model.
 * Used for cycle selector in the Embed Text Analysis panel.
 */
export const getAvailableCyclesForModel = query({
  args: {
    model: vRefinementModel,
  },
  handler: async (ctx, { model }) => {
    const refinements = await ctx.db
      .query('palette_tag_refined')
      .withIndex('by_model', (q) => q.eq('model', model))
      .collect()

    const cycles = new Set<number>()
    for (const r of refinements) {
      if (!r.error && r.cycle !== undefined) {
        cycles.add(r.cycle)
      }
    }

    // Sort descending (latest first)
    return Array.from(cycles).sort((a, b) => b - a)
  },
})

/**
 * Get tag frequencies from embed_text across all refinements for a given model.
 *
 * Uses the structured tags from each refinement to build a dictionary of known
 * multi-word tags (like "cherry blossom"). Then uses greedy string matching
 * to extract tags from embed_text, preserving multi-word and hyphenated tags.
 *
 * OPTIMIZED: Instead of running regex per known tag, we use indexOf for matching
 * which is much faster. Known tags are sorted by length (longest first) for
 * greedy matching.
 *
 * Returns all tags as an array of {key, value} objects to avoid Convex's
 * 1024 field limit (which only applies to object properties, not array elements).
 */
export const getEmbedTextTagFrequencies = query({
  args: {
    model: vRefinementModel,
    cycle: v.optional(v.number()),
    cycles: v.optional(v.array(v.number())),
  },
  handler: async (ctx, { model, cycle, cycles }) => {
    // Get refinements for this model, optionally filtered by cycle(s)
    let refinements

    // Support both single cycle and multiple cycles
    const cycleSet = cycles?.length ? new Set(cycles) : cycle !== undefined ? new Set([cycle]) : null

    if (cycleSet && cycleSet.size === 1) {
      // Single cycle - use index
      const singleCycle = [...cycleSet][0]
      refinements = await ctx.db
        .query('palette_tag_refined')
        .withIndex('by_model_cycle', (q) => q.eq('model', model).eq('cycle', singleCycle))
        .collect()
    } else if (cycleSet && cycleSet.size > 1) {
      // Multiple cycles - query by model and filter
      const allForModel = await ctx.db
        .query('palette_tag_refined')
        .withIndex('by_model', (q) => q.eq('model', model))
        .collect()
      refinements = allForModel.filter((r) => cycleSet.has(r.cycle))
    } else {
      // No cycle filter - get all for model
      refinements = await ctx.db
        .query('palette_tag_refined')
        .withIndex('by_model', (q) => q.eq('model', model))
        .collect()
    }

    // Filter to only successful refinements (no error, has tags)
    const successfulRefinements = refinements.filter((r) => !r.error && r.tags)

    // Count tag frequencies directly from the structured tags field
    // This is much faster than parsing embed_text strings
    const tagFrequencies: Record<string, number> = {}

    for (const r of successfulRefinements) {
      const tags = r.tags as {
        mood?: string[]
        style?: string[]
        dominant_colors?: string[]
        harmony?: string[]
        seasonal?: string[]
        associations?: string[]
      }

      // Collect all tags from all categories, counting each once per refinement
      const foundTags = new Set<string>()

      for (const arr of [
        tags.mood,
        tags.style,
        tags.dominant_colors,
        tags.harmony,
        tags.seasonal,
        tags.associations,
      ]) {
        if (arr) {
          for (const tag of arr) {
            if (tag) {
              const normalized = tag.toLowerCase().trim()
              if (normalized) {
                foundTags.add(normalized)
              }
            }
          }
        }
      }

      // Count frequencies (each tag once per refinement)
      for (const tag of foundTags) {
        tagFrequencies[tag] = (tagFrequencies[tag] ?? 0) + 1
      }
    }

    // Convert to array of {key, value} and sort by frequency (descending)
    // Using array format avoids the 1024 field limit for objects
    const tags = Object.entries(tagFrequencies)
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => b.value - a.value)

    return {
      model,
      totalRefinements: successfulRefinements.length,
      uniqueTags: tags.length,
      tags,
    }
  },
})

/**
 * Get all refined palettes for a given model/cycle
 * Used by vectorize action to seed the vector database
 */
export const getRefinedPalettes = query({
  args: {
    model: vRefinementModel,
    cycle: v.number(),
  },
  handler: async (ctx, { model, cycle }) => {
    const refinements = await ctx.db
      .query('palette_tag_refined')
      .withIndex('by_model_cycle', (q) => q.eq('model', model).eq('cycle', cycle))
      .collect()

    return refinements.map((r) => ({
      seed: r.seed,
      embedText: r.embedText,
      tags: r.tags,
      error: r.error,
    }))
  },
})

// ============================================================================
// Staged Palette Refinement
// ============================================================================

/**
 * Get staged palettes that need refinement for a specific model and cycle.
 * A staged palette needs refinement if:
 * 1. It has consensus data (meaning it has been tagged)
 * 2. It doesn't already have a successful refinement from this specific model+cycle
 *
 * @param model - The refinement model to check against
 * @param cycle - The refinement cycle number
 * @param sourcePromptVersions - Array of prompt versions to include (defaults to all)
 */
export const getStagedPalettesForRefinement = query({
  args: {
    model: vRefinementModel,
    cycle: v.number(),
    sourcePromptVersions: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { model, cycle, sourcePromptVersions, limit = 1000 }) => {
    // Get existing refinements FOR THIS MODEL (any cycle) - allows resuming across cycles
    const refinements = await ctx.db
      .query('palette_tag_refined')
      .withIndex('by_model', (q) => q.eq('model', model))
      .collect()
    const refinedSeeds = new Set(
      refinements
        .filter((r) => !r.error)
        .map((r) => r.seed)
    )

    // Get all staged palette seeds
    const stagedPalettes = await ctx.db.query('staged_palettes').collect()
    const stagedSeeds = new Set(stagedPalettes.map((p) => p.seed))

    // Group consensus by seed (only for staged palette seeds)
    const seedsWithTags = new Map<string, number>()

    // If specific prompt versions are requested, use the index for each version
    if (sourcePromptVersions && sourcePromptVersions.length > 0) {
      for (const version of sourcePromptVersions) {
        const versionDocs = await ctx.db
          .query('palette_tag_consensus')
          .withIndex('by_prompt_version', (q) => q.eq('promptVersion', version))
          .collect()

        for (const doc of versionDocs) {
          // Only include staged palette seeds
          if (!stagedSeeds.has(doc.seed)) continue
          // Skip if already refined for this model+cycle
          if (refinedSeeds.has(doc.seed)) continue

          const existing = seedsWithTags.get(doc.seed) ?? 0
          seedsWithTags.set(doc.seed, existing + doc.totalModels)
        }
      }
    } else {
      // No specific versions - need to scan all consensus docs
      const consensusDocs = await ctx.db
        .query('palette_tag_consensus')
        .take(limit * 5)

      for (const doc of consensusDocs) {
        // Only include staged palette seeds
        if (!stagedSeeds.has(doc.seed)) continue
        // Skip if already refined for this model+cycle
        if (refinedSeeds.has(doc.seed)) continue

        const existing = seedsWithTags.get(doc.seed) ?? 0
        seedsWithTags.set(doc.seed, existing + doc.totalModels)
      }
    }

    // Build result array with seed info
    const palettesNeedingRefinement: Array<{
      seed: string
      _id: string
      tagCount: number
    }> = []

    // Fetch staged palettes for the seeds we found
    for (const [seed, tagCount] of seedsWithTags) {
      if (palettesNeedingRefinement.length >= limit) break

      const palette = await ctx.db
        .query('staged_palettes')
        .withIndex('by_seed', (q) => q.eq('seed', seed))
        .first()

      if (!palette) continue

      palettesNeedingRefinement.push({
        _id: palette._id,
        seed: palette.seed,
        tagCount,
      })
    }

    // Sort by tag count (prioritize palettes with more tags)
    palettesNeedingRefinement.sort((a, b) => b.tagCount - a.tagCount)

    return palettesNeedingRefinement.slice(0, limit)
  },
})

/**
 * Build TagSummaries for staged palettes ready for refinement.
 * Similar to buildTagSummaries but works with staged_palettes table.
 * Staged palettes don't have imageUrl, so we omit it.
 */
export const buildStagedTagSummaries = internalQuery({
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
      // Fetch staged palette by seed
      const palette = await ctx.db
        .query('staged_palettes')
        .withIndex('by_seed', (q) => q.eq('seed', seed))
        .first()

      if (!palette) continue

      // Get consensus docs for this seed (one per prompt version)
      const consensusDocs = await ctx.db
        .query('palette_tag_consensus')
        .withIndex('by_seed', (q) => q.eq('seed', seed))
        .collect()

      // Filter by prompt versions if specified
      const matchingDocs = targetVersions
        ? consensusDocs.filter((c) => c.promptVersion && targetVersions.has(c.promptVersion))
        : consensusDocs

      if (matchingDocs.length === 0) {
        console.warn(`Skipping staged seed ${seed}: no consensus data found`)
        continue
      }

      // Merge consensus from all matching versions
      const merged = mergeConsensusData(matchingDocs)

      const colorData = generateColorDataFromSeed(palette.seed)

      // Use the first matching version as the "source" (for display purposes)
      const sourcePromptVersion = matchingDocs[0].promptVersion ?? 'unknown'

      summaries.push({
        seed: palette.seed,
        paletteId: palette._id,
        colorData,
        imageUrl: '', // Staged palettes don't have images yet
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
 * Get refinement status specifically for staged palettes.
 * Optimized to avoid reading entire tables by using indexed lookups per seed.
 */
export const getStagedRefinementStatus = query({
  args: {},
  handler: async (ctx) => {
    // Count staged palettes (this table is small)
    const stagedPalettes = await ctx.db.query('staged_palettes').collect()
    const totalStaged = stagedPalettes.length

    // Sample up to 500 staged palettes to estimate stats
    // (checking all 3300+ would be too slow)
    const sampleSize = Math.min(500, stagedPalettes.length)
    const sample = stagedPalettes.slice(0, sampleSize)

    let withTagsSample = 0
    let refinedSample = 0

    for (const palette of sample) {
      // Check if has consensus data (using index)
      const consensus = await ctx.db
        .query('palette_tag_consensus')
        .withIndex('by_seed', (q) => q.eq('seed', palette.seed))
        .first()

      if (consensus) {
        withTagsSample++

        // Check if has refinement (using index)
        const refinement = await ctx.db
          .query('palette_tag_refined')
          .withIndex('by_seed', (q) => q.eq('seed', palette.seed))
          .first()

        if (refinement && !refinement.error) {
          refinedSample++
        }
      }
    }

    // Extrapolate to full dataset
    const ratio = totalStaged / sampleSize
    const withTags = Math.round(withTagsSample * ratio)
    const refined = Math.round(refinedSample * ratio)

    return {
      totalStaged,
      withTags,
      refined,
      pending: Math.max(0, withTags - refined),
    }
  },
})

