import { query, mutation, internalMutation, internalQuery } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'
import { vBatchStatus, vRefinementModel, vRefinementProvider } from './lib/providers.types'
import { generateColorDataFromSeed } from './lib/colorData'
import type { TagSummary } from './lib/refinement'
import { refinedSeedsAggregate } from './lib/aggregates'

// ============================================================================
// Prompt Version Discovery
// ============================================================================

/**
 * Get all available prompt versions from palette_tags with counts.
 * Uses pagination to avoid the 16MB read limit.
 */
export const getAvailablePromptVersions = query({
  args: {},
  handler: async (ctx) => {
    // Count tags by prompt version using pagination
    const versionData = new Map<string, {
      total: number
      uniqueSeeds: Set<string>
      earliestCreation: number
      latestCreation: number
    }>()

    let isDone = false
    let cursor: string | null = null

    while (!isDone) {
      const page = await ctx.db
        .query('palette_tags')
        .paginate({ cursor, numItems: 1000 })

      for (const tag of page.page) {
        if (tag.error) continue // Skip error tags

        const version = tag.promptVersion
        const existing = versionData.get(version) ?? {
          total: 0,
          uniqueSeeds: new Set(),
          earliestCreation: Infinity,
          latestCreation: 0,
        }
        existing.total++
        existing.uniqueSeeds.add(tag.seed)
        const creationTime = tag._creationTime
        existing.earliestCreation = Math.min(existing.earliestCreation, creationTime)
        existing.latestCreation = Math.max(existing.latestCreation, creationTime)
        versionData.set(version, existing)
      }

      isDone = page.isDone
      cursor = page.continueCursor
    }

    // Convert to array and sort by latest creation time (most recent first)
    const versions = Array.from(versionData.entries())
      .map(([version, data]) => ({
        version,
        tagCount: data.total,
        paletteCount: data.uniqueSeeds.size,
        createdAt: data.latestCreation,
      }))
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
// Tag Aggregation for Refinement
// ============================================================================

/**
 * Sanitize a string to be ASCII-safe for use as object keys in Convex.
 * Convex doesn't allow non-ASCII characters or control characters in field names.
 * This converts accented characters to their ASCII equivalents and removes invalid chars.
 */
function sanitizeKey(key: string): string {
  // Use normalize to decompose accented characters, then remove diacritics
  return key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove combining diacritical marks
    .replace(/[^\x20-\x7E]/g, '') // Keep only printable ASCII (space to tilde)
    .trim() // Remove leading/trailing whitespace
}

/**
 * Sanitize all keys in a Record to be ASCII-safe.
 * Skips invalid keys (empty, too long, or corrupted data).
 */
function sanitizeRecordKeys(record: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [key, value] of Object.entries(record)) {
    const sanitizedKey = sanitizeKey(key)
    // Skip empty keys or keys that look like corrupted data
    if (!sanitizedKey || sanitizedKey.length > 100 || sanitizedKey.includes('"')) {
      continue
    }
    // Merge values if sanitization causes key collision
    result[sanitizedKey] = (result[sanitizedKey] ?? 0) + value
  }
  return result
}

/**
 * Aggregate tag results for a single palette into a TagSummary.
 * This summarizes the consensus from all models for refinement.
 */
function aggregateTagsForSeed(
  tags: Array<{
    seed: string
    provider: string
    model: string
    tags: Record<string, unknown> | null
    promptVersion: string
  }>,
  palette: { _id: string; seed: string; imageUrl: string },
): TagSummary | null {
  // Filter to only successful tags
  const validTags = tags.filter((t) => t.tags !== null)
  if (validTags.length === 0) return null

  const colorData = generateColorDataFromSeed(palette.seed)
  const totalModels = validTags.length

  // Get the most common prompt version (source)
  const versionCounts = new Map<string, number>()
  for (const tag of validTags) {
    versionCounts.set(tag.promptVersion, (versionCounts.get(tag.promptVersion) ?? 0) + 1)
  }
  const sourcePromptVersion =
    Array.from(versionCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown'

  // Initialize frequency counters
  const categorical = {
    temperature: {} as Record<string, number>,
    contrast: {} as Record<string, number>,
    brightness: {} as Record<string, number>,
    saturation: {} as Record<string, number>,
  }

  const tagFrequencies = {
    mood: {} as Record<string, number>,
    style: {} as Record<string, number>,
    dominant_colors: {} as Record<string, number>,
    seasonal: {} as Record<string, number>,
    associations: {} as Record<string, number>,
  }

  // Count frequencies
  for (const tag of validTags) {
    const data = tag.tags as Record<string, unknown>

    // Categorical attributes (single values)
    for (const cat of ['temperature', 'contrast', 'brightness', 'saturation'] as const) {
      const value = data[cat]
      if (typeof value === 'string' && value) {
        const lower = value.toLowerCase().trim()
        categorical[cat][lower] = (categorical[cat][lower] ?? 0) + 1
      }
    }

    // Tag arrays
    for (const tagType of ['mood', 'style', 'dominant_colors', 'seasonal', 'associations'] as const) {
      const values = data[tagType]
      if (Array.isArray(values)) {
        for (const val of values) {
          if (typeof val === 'string' && val) {
            const lower = val.toLowerCase().trim()
            tagFrequencies[tagType][lower] = (tagFrequencies[tagType][lower] ?? 0) + 1
          }
        }
      }
    }
  }

  // Sanitize all keys to be ASCII-safe for Convex serialization
  return {
    seed: palette.seed,
    paletteId: palette._id,
    colorData,
    imageUrl: palette.imageUrl,
    totalModels,
    sourcePromptVersion,
    categorical: {
      temperature: sanitizeRecordKeys(categorical.temperature),
      contrast: sanitizeRecordKeys(categorical.contrast),
      brightness: sanitizeRecordKeys(categorical.brightness),
      saturation: sanitizeRecordKeys(categorical.saturation),
    },
    tags: {
      mood: sanitizeRecordKeys(tagFrequencies.mood),
      style: sanitizeRecordKeys(tagFrequencies.style),
      dominant_colors: sanitizeRecordKeys(tagFrequencies.dominant_colors),
      seasonal: sanitizeRecordKeys(tagFrequencies.seasonal),
      associations: sanitizeRecordKeys(tagFrequencies.associations),
    },
  }
}

/**
 * Get palettes that need refinement for a specific model and cycle.
 * A palette needs refinement if:
 * 1. It has tag data from any of the specified prompt versions
 * 2. It doesn't already have a successful refinement from this specific model+cycle
 *
 * This allows running multiple refinement cycles with the same model (like tag analysis).
 *
 * @param model - The refinement model to check against
 * @param cycle - The refinement cycle number
 * @param sourcePromptVersions - Array of prompt versions to include (defaults to all available)
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

    // Determine which prompt versions to use
    const targetVersions = sourcePromptVersions && sourcePromptVersions.length > 0
      ? new Set(sourcePromptVersions)
      : null // null means all versions

    // Get palettes with their tag counts efficiently
    // We'll process in batches to avoid memory issues
    const palettes = await ctx.db.query('palettes').collect()

    const palettesNeedingRefinement: Array<{
      seed: string
      imageUrl: string
      _id: string
      tagCount: number
    }> = []

    // Process each palette - check tags using index
    for (const palette of palettes) {
      // Skip if already refined for this model+cycle
      if (refinedSeeds.has(palette.seed)) continue

      // Get tags for this seed using index
      const tags = await ctx.db
        .query('palette_tags')
        .withIndex('by_seed_provider', (q) => q.eq('seed', palette.seed))
        .collect()

      // Filter to valid tags with target versions
      const validTags = tags.filter(
        (t) => t.tags !== null && (targetVersions === null || targetVersions.has(t.promptVersion)),
      )

      if (validTags.length === 0) continue

      palettesNeedingRefinement.push({
        _id: palette._id,
        seed: palette.seed,
        imageUrl: palette.imageUrl,
        tagCount: validTags.length,
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
 * This aggregates all tag data from multiple models into consensus summaries.
 *
 * Uses seeds array instead of paletteIds to query tags by seed directly,
 * avoiding the need to batch-fetch all tags at once.
 *
 * @param sourcePromptVersions - Array of prompt versions to include (all versions if empty/undefined)
 */
export const buildTagSummaries = internalQuery({
  args: {
    seeds: v.array(v.string()),
    sourcePromptVersions: v.array(v.string()),
  },
  handler: async (ctx, { seeds, sourcePromptVersions }) => {
    const summaries: TagSummary[] = []
    const targetVersions = sourcePromptVersions.length > 0 ? new Set(sourcePromptVersions) : null

    for (const seed of seeds) {
      // Fetch palette by seed
      const palette = await ctx.db
        .query('palettes')
        .withIndex('by_seed', (q) => q.eq('seed', seed))
        .first()

      if (!palette) continue

      // Fetch tags for this specific seed using the index
      // This queries by seed prefix which is efficient
      const tags = await ctx.db
        .query('palette_tags')
        .withIndex('by_seed_provider', (q) => q.eq('seed', seed))
        .collect()

      // Filter to target prompt versions (or all if not specified)
      const filteredTags = tags.filter(
        (t) => t.tags !== null && (targetVersions === null || targetVersions.has(t.promptVersion)),
      )

      const summary = aggregateTagsForSeed(
        filteredTags.map((t) => ({
          seed: t.seed,
          provider: t.provider,
          model: t.model,
          tags: t.tags,
          promptVersion: t.promptVersion,
        })),
        { _id: palette._id, seed: palette.seed, imageUrl: palette.imageUrl },
      )

      if (summary) {
        summaries.push(summary)
      }
    }

    return summaries
  },
})

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
 * Uses pagination to avoid the 16MB read limit on palette_tags.
 */
export const refreshRefinementStatusCache = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Count palettes (small table, safe to collect)
    const palettes = await ctx.db.query('palettes').collect()

    // Count unique seeds with valid tags using pagination to avoid 16MB limit
    const seedsWithTags = new Set<string>()
    let isDone = false
    let cursor: string | null = null

    while (!isDone) {
      const page = await ctx.db
        .query('palette_tags')
        .paginate({ cursor, numItems: 1000 })

      for (const tag of page.page) {
        if (tag.tags !== null) {
          seedsWithTags.add(tag.seed)
        }
      }

      isDone = page.isDone
      cursor = page.continueCursor
    }

    const stats = {
      totalPalettes: palettes.length,
      palettesWithTags: seedsWithTags.size,
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
