import { query, mutation, internalMutation, internalQuery } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'
import { vProvider, vModel, vBatchStatus, getAllModels } from './lib/providers.types'
import { paletteTagsAggregate } from './lib/aggregates'
import { ALL_LEGACY_PROMPTS } from './lib/legacyPrompts'
import {
  TAGGING_SYSTEM_PROMPT,
  TAGGING_PROMPT_VERSION,
  TAGGING_PROMPT_MESSAGE,
  REFINEMENT_SYSTEM_PROMPT,
  REFINEMENT_PROMPT_VERSION,
  REFINEMENT_PROMPT_MESSAGE,
} from './lib/prompts'

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
    promptVersion: v.string(),
    requestCount: v.number(),
    requestOrder: v.optional(v.array(v.string())), // For Google batches: customIds in order
  },
  returns: v.id('tag_batches'),
  handler: async (ctx, { cycle, provider, model, batchId, analysisCount, promptVersion, requestCount, requestOrder }) => {
    return await ctx.db.insert('tag_batches', {
      cycle,
      provider,
      model,
      batchId,
      status: 'pending',
      analysisCount,
      promptVersion,
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

    // Insert new tag and update aggregate
    const id = await ctx.db.insert('palette_tags', args)
    const doc = await ctx.db.get(id)
    await paletteTagsAggregate.insert(ctx, doc!)

    // Update consensus table (only for successful tags)
    if (args.tags) {
      await ctx.runMutation(internal.consensus.updateConsensusOnTagInsert, {
        seed: args.seed,
        tags: args.tags,
        promptVersion: args.promptVersion,
      })
    }

    return id
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
 * Get overall backfill status using aggregates for real-time counts.
 */
export const getBackfillStatus = query({
  args: {},
  handler: async (ctx) => {
    const palettes = await ctx.db.query('palettes').collect()
    const batches = await ctx.db.query('tag_batches').collect()

    // Get real-time counts from aggregate (O(log n))
    const totalTags = await paletteTagsAggregate.count(ctx)
    const successfulTags = await paletteTagsAggregate.sum(ctx)
    const totalErrors = totalTags - successfulTags

    const activeBatches = batches.filter(
      (b) => b.status === 'pending' || b.status === 'processing',
    )

    // Count unique providers from batches (small table, safe to collect)
    const uniqueProviders = new Set(batches.map((b) => b.provider)).size

    return {
      palettes: palettes.length,
      palettesWithTags: palettes.length, // Approximate - all palettes have been tagged at least once
      uniqueProviders,
      totalTags: successfulTags,
      totalErrors,
      activeBatches: activeBatches.length,
      providerStats: [], // Deprecated - use batches for per-provider info
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
 * Uses batch failedCount for summary, no full table scan needed.
 */
export const getErrorsByModel = query({
  args: {
    cycle: v.optional(v.number()),
  },
  handler: async (ctx, { cycle }) => {
    let batches = await ctx.db.query('tag_batches').collect()

    // Filter by cycle if specified
    if (cycle !== undefined && cycle > 0) {
      batches = batches.filter((b) => (b.cycle ?? 1) === cycle)
    }

    // Group failed counts by model
    const errorsByModel = new Map<string, number>()

    for (const batch of batches) {
      if (batch.failedCount > 0) {
        const key = `${batch.provider}/${batch.model}`
        const current = errorsByModel.get(key) ?? 0
        errorsByModel.set(key, current + batch.failedCount)
      }
    }

    // Convert to array format
    const result: Array<{
      model: string
      errorCount: number
      errors: Array<{ seed: string; analysisIndex: number; error: string }>
    }> = []

    for (const [model, errorCount] of errorsByModel) {
      result.push({
        model,
        errorCount,
        errors: [], // Individual errors are tracked in the tags table, but we don't scan it anymore
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
      await paletteTagsAggregate.delete(ctx, tag)
      await ctx.db.delete(tag._id)
    }

    const batches = await ctx.db.query('tag_batches').collect()
    for (const batch of batches) {
      await ctx.db.delete(batch._id)
    }

    // Also clear the aggregate
    await paletteTagsAggregate.clear(ctx)

    // Clear consensus table
    const consensus = await ctx.db.query('palette_tag_consensus').collect()
    for (const c of consensus) {
      await ctx.db.delete(c._id)
    }

    return { deleted: tags.length, batchesDeleted: batches.length, consensusDeleted: consensus.length }
  },
})

// ============================================================================
// Aggregate Backfill
// ============================================================================

/**
 * Backfill one batch of the paletteTagsAggregate.
 * Schedules the next batch until done.
 */
export const backfillPaletteTagsAggregateBatch = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, { cursor, batchSize = 500 }) => {
    const page = await ctx.db
      .query('palette_tags')
      .paginate({ cursor: cursor ?? null, numItems: batchSize })

    let processed = 0
    for (const doc of page.page) {
      await paletteTagsAggregate.insertIfDoesNotExist(ctx, doc)
      processed++
    }

    // Schedule next batch if not done
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.backfill.backfillPaletteTagsAggregateBatch, {
        cursor: page.continueCursor,
        batchSize,
      })
    }

    return {
      processed,
      isDone: page.isDone,
    }
  },
})

/**
 * Clear and rebuild the paletteTagsAggregate.
 * Use this after deploying the aggregate component or if out of sync.
 */
export const rebuildPaletteTagsAggregate = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Clear the aggregate first
    await paletteTagsAggregate.clear(ctx)

    // Schedule the first batch of backfill
    await ctx.scheduler.runAfter(0, internal.backfill.backfillPaletteTagsAggregateBatch, {
      batchSize: 500,
    })

    return { status: 'started', message: 'Aggregate cleared, backfill scheduled' }
  },
})

// ============================================================================
// Prompt Version Backfill
// ============================================================================

/**
 * Backfill legacy prompt versions from git history.
 * This should be run once to populate the prompt_versions table with historical data.
 * After running, the legacyPrompts.ts file can be deleted.
 */
export const backfillPromptVersions = mutation({
  args: {},
  handler: async (ctx) => {
    const results = { inserted: 0, skipped: 0 }

    for (const prompt of ALL_LEGACY_PROMPTS) {
      const existing = await ctx.db
        .query('prompt_versions')
        .withIndex('by_version', (q) => q.eq('version', prompt.version))
        .first()

      if (existing) {
        results.skipped++
        continue
      }

      await ctx.db.insert('prompt_versions', {
        version: prompt.version,
        type: prompt.type,
        content: prompt.content,
      })
      results.inserted++
    }

    return results
  },
})

/**
 * Get all prompt versions by type
 */
export const getPromptVersions = query({
  args: {
    type: v.optional(v.union(v.literal('tagging'), v.literal('refinement'))),
  },
  handler: async (ctx, { type }) => {
    if (type) {
      return await ctx.db
        .query('prompt_versions')
        .withIndex('by_type', (q) => q.eq('type', type))
        .collect()
    }
    return await ctx.db.query('prompt_versions').collect()
  },
})

/**
 * Get a prompt version by its hash
 */
export const getPromptByVersion = query({
  args: { version: v.string() },
  handler: async (ctx, { version }) => {
    return await ctx.db
      .query('prompt_versions')
      .withIndex('by_version', (q) => q.eq('version', version))
      .first()
  },
})

/**
 * Validate prompt versions bidirectionally:
 * 1. All registered prompts should have associated data (or be current)
 * 2. All data should reference registered prompts
 *
 * Note: Uses tag_batches for tag validation (batch level) since individual palette_tags
 * can't be paginated with other queries in same function.
 */
export const validatePromptVersions = query({
  args: {},
  handler: async (ctx) => {
    // Get all registered prompt versions
    const registeredVersions = await ctx.db.query('prompt_versions').collect()
    const registeredTagging = registeredVersions.filter((v) => v.type === 'tagging')
    const registeredRefinement = registeredVersions.filter((v) => v.type === 'refinement')
    const registeredSet = new Set(registeredVersions.map((v) => v.version))

    // Get unique versions from tag batches (with counts) - batch level
    const tagBatches = await ctx.db.query('tag_batches').collect()
    const batchVersionCounts = new Map<string, number>()
    for (const batch of tagBatches) {
      if (batch.promptVersion) {
        const count = batchVersionCounts.get(batch.promptVersion) ?? 0
        batchVersionCounts.set(batch.promptVersion, count + (batch.completedCount ?? 0))
      }
    }

    // Get unique versions from refined tags (with counts)
    const refinedTags = await ctx.db.query('palette_tag_refined').collect()
    const refinementVersionCounts = new Map<string, number>()
    for (const tag of refinedTags) {
      if (tag.promptVersion) {
        const count = refinementVersionCounts.get(tag.promptVersion) ?? 0
        refinementVersionCounts.set(tag.promptVersion, count + 1)
      }
    }

    // Check each registered version for associated data
    const taggingWithData: Array<{ version: string; count: number }> = []
    const taggingWithoutData: string[] = []
    for (const v of registeredTagging) {
      const count = batchVersionCounts.get(v.version) ?? 0
      if (count > 0) {
        taggingWithData.push({ version: v.version, count })
      } else {
        taggingWithoutData.push(v.version)
      }
    }

    const refinementWithData: Array<{ version: string; count: number }> = []
    const refinementWithoutData: string[] = []
    for (const v of registeredRefinement) {
      const count = refinementVersionCounts.get(v.version) ?? 0
      if (count > 0) {
        refinementWithData.push({ version: v.version, count })
      } else {
        refinementWithoutData.push(v.version)
      }
    }

    // Find orphaned versions (in data but not registered)
    const orphanedTagVersions = Array.from(batchVersionCounts.keys()).filter(
      (v) => !registeredSet.has(v)
    )
    const orphanedRefinementVersions = Array.from(refinementVersionCounts.keys()).filter(
      (v) => !registeredSet.has(v)
    )

    return {
      registered: {
        tagging: {
          total: registeredTagging.length,
          withData: taggingWithData,
          withoutData: taggingWithoutData,
        },
        refinement: {
          total: registeredRefinement.length,
          withData: refinementWithData,
          withoutData: refinementWithoutData,
        },
      },
      orphaned: {
        tagging: orphanedTagVersions.map((v) => ({
          version: v,
          count: batchVersionCounts.get(v) ?? 0,
        })),
        refinement: orphanedRefinementVersions.map((v) => ({
          version: v,
          count: refinementVersionCounts.get(v) ?? 0,
        })),
      },
      isValid:
        orphanedTagVersions.length === 0 &&
        orphanedRefinementVersions.length === 0,
    }
  },
})

/**
 * Get unique prompt versions from individual palette_tags (samples for validation).
 * Takes a sample of the first N tags to see what versions exist.
 */
export const sampleIndividualTagVersions = query({
  args: { sampleSize: v.optional(v.number()) },
  handler: async (ctx, { sampleSize = 1000 }) => {
    // Take a sample of tags to check versions (can't paginate fully in one query)
    const tags = await ctx.db.query('palette_tags').take(sampleSize)
    const tagVersionCounts = new Map<string, number>()
    for (const tag of tags) {
      if (tag.promptVersion) {
        const count = tagVersionCounts.get(tag.promptVersion) ?? 0
        tagVersionCounts.set(tag.promptVersion, count + 1)
      }
    }
    return {
      sampleSize: tags.length,
      versions: Object.fromEntries(tagVersionCounts),
    }
  },
})

/**
 * Get details about tags with a specific prompt version
 */
export const getTagsByVersion = query({
  args: { version: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { version, limit = 50 }) => {
    const tags = await ctx.db.query('palette_tags').take(10000)
    const matching = tags.filter((t) => t.promptVersion === version).slice(0, limit)
    const uniqueSeeds = new Set(matching.map((t) => t.seed))
    const providers = new Set(matching.map((t) => t.provider))
    const models = new Set(matching.map((t) => t.model))

    return {
      totalMatching: tags.filter((t) => t.promptVersion === version).length,
      sample: matching.map((t) => ({
        seed: t.seed,
        provider: t.provider,
        model: t.model,
        analysisIndex: t.analysisIndex ?? t.runNumber,
        hasError: !!t.error,
      })),
      uniqueSeeds: uniqueSeeds.size,
      providers: Array.from(providers),
      models: Array.from(models),
    }
  },
})

/**
 * Delete tags by prompt version.
 * Use with caution - this permanently removes tag data.
 * Returns how many tags were deleted.
 */
export const deleteTagsByVersion = mutation({
  args: { version: v.string(), batchSize: v.optional(v.number()) },
  handler: async (ctx, { version, batchSize = 500 }) => {
    // Get tags with this version (limited batch to avoid timeout)
    const tags = await ctx.db.query('palette_tags').take(batchSize * 2)
    const matching = tags.filter((t) => t.promptVersion === version).slice(0, batchSize)

    let deleted = 0
    for (const tag of matching) {
      // Update consensus before deleting (only for successful tags)
      if (tag.tags) {
        await ctx.runMutation(internal.consensus.updateConsensusOnTagDelete, {
          seed: tag.seed,
          tags: tag.tags,
          promptVersion: tag.promptVersion,
        })
      }
      await paletteTagsAggregate.delete(ctx, tag)
      await ctx.db.delete(tag._id)
      deleted++
    }

    const hasMore = tags.filter((t) => t.promptVersion === version).length > batchSize

    return {
      deleted,
      hasMore,
      message: hasMore
        ? `Deleted ${deleted} tags. Run again to delete more.`
        : `Deleted ${deleted} tags. All tags with version ${version} removed.`,
    }
  },
})

/**
 * Create placeholder entries for orphaned prompt versions (data exists but no prompt record).
 * This preserves the data relationship while marking the prompt as unrecoverable.
 *
 * Note: This only checks tag_batches and palette_tag_refined.
 * For individual palette_tags orphans, use addOrphanedTagVersions.
 */
export const backfillOrphanedPromptVersions = mutation({
  args: {},
  handler: async (ctx) => {
    const registeredVersions = await ctx.db.query('prompt_versions').collect()
    const registeredSet = new Set(registeredVersions.map((v) => v.version))

    // Find orphaned tagging versions
    const tagBatches = await ctx.db.query('tag_batches').collect()
    const tagVersionsInUse = new Set(
      tagBatches.filter((b) => b.promptVersion).map((b) => b.promptVersion!)
    )

    // Find orphaned refinement versions
    const refinedTags = await ctx.db.query('palette_tag_refined').collect()
    const refinementVersionsInUse = new Set(
      refinedTags.filter((t) => t.promptVersion).map((t) => t.promptVersion!)
    )

    const created: Array<{ version: string; type: string }> = []

    // Create placeholders for orphaned tagging versions
    for (const version of tagVersionsInUse) {
      if (!registeredSet.has(version)) {
        await ctx.db.insert('prompt_versions', {
          version,
          type: 'tagging',
          content: '[Legacy prompt - content not available]',
        })
        created.push({ version, type: 'tagging' })
      }
    }

    // Create placeholders for orphaned refinement versions
    for (const version of refinementVersionsInUse) {
      if (!registeredSet.has(version)) {
        await ctx.db.insert('prompt_versions', {
          version,
          type: 'refinement',
          content: '[Legacy prompt - content not available]',
        })
        created.push({ version, type: 'refinement' })
      }
    }

    return { created, count: created.length }
  },
})

/**
 * Add placeholders for specific orphaned tag versions found in individual palette_tags.
 * Use sampleIndividualTagVersions to discover orphans first, then call this with the versions.
 */
export const addOrphanedTagVersions = mutation({
  args: {
    versions: v.array(v.string()),
  },
  handler: async (ctx, { versions }) => {
    const registeredVersions = await ctx.db.query('prompt_versions').collect()
    const registeredSet = new Set(registeredVersions.map((v) => v.version))

    const created: string[] = []
    const skipped: string[] = []

    for (const version of versions) {
      if (registeredSet.has(version)) {
        skipped.push(version)
        continue
      }

      await ctx.db.insert('prompt_versions', {
        version,
        type: 'tagging',
        content: '[Legacy prompt - content not available]',
      })
      created.push(version)
    }

    return { created, skipped }
  },
})

/**
 * Clean up prompt versions that have no associated data.
 * Safe to run - only deletes prompts with zero tags/batches.
 */
export const cleanupUnusedPromptVersions = mutation({
  args: {},
  handler: async (ctx) => {
    const registeredVersions = await ctx.db.query('prompt_versions').collect()

    // Get versions in use
    const tagBatches = await ctx.db.query('tag_batches').collect()
    const tagVersionsInUse = new Set(
      tagBatches.filter((b) => b.promptVersion).map((b) => b.promptVersion!)
    )

    const refinedTags = await ctx.db.query('palette_tag_refined').collect()
    const refinementVersionsInUse = new Set(
      refinedTags.filter((t) => t.promptVersion).map((t) => t.promptVersion!)
    )

    const deleted: string[] = []
    for (const v of registeredVersions) {
      const inUse =
        (v.type === 'tagging' && tagVersionsInUse.has(v.version)) ||
        (v.type === 'refinement' && refinementVersionsInUse.has(v.version))

      if (!inUse) {
        await ctx.db.delete(v._id)
        deleted.push(v.version)
      }
    }

    return { deleted, count: deleted.length }
  },
})

/**
 * Register a new prompt version if it doesn't already exist.
 * Called when a batch is submitted to ensure we have a record of the prompt used.
 */
export const registerPromptVersion = internalMutation({
  args: {
    version: v.string(),
    type: v.union(v.literal('tagging'), v.literal('refinement')),
    content: v.string(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, { version, type, content, message }) => {
    // Check if already exists
    const existing = await ctx.db
      .query('prompt_versions')
      .withIndex('by_version', (q) => q.eq('version', version))
      .first()

    if (existing) {
      // Update message if provided and different
      if (message && existing.message !== message) {
        await ctx.db.patch(existing._id, { message })
        return { inserted: false, updated: true, id: existing._id }
      }
      return { inserted: false, updated: false, id: existing._id }
    }

    // Insert new version
    const id = await ctx.db.insert('prompt_versions', {
      version,
      type,
      content,
      message,
    })

    return { inserted: true, id }
  },
})

/**
 * Sync current prompt versions to database.
 * Run manually after deploy: npx convex run backfill:syncPromptVersions
 */
export const syncPromptVersions = mutation({
  args: {},
  handler: async (ctx) => {
    const results = { tagging: '', refinement: '' }

    // Register tagging prompt
    const taggingResult = await ctx.runMutation(
      internal.backfill.registerPromptVersion,
      {
        version: TAGGING_PROMPT_VERSION,
        type: 'tagging',
        content: TAGGING_SYSTEM_PROMPT,
        message: TAGGING_PROMPT_MESSAGE,
      }
    )
    results.tagging = taggingResult.inserted
      ? 'inserted'
      : taggingResult.updated
        ? 'updated'
        : 'unchanged'

    // Register refinement prompt
    const refinementResult = await ctx.runMutation(
      internal.backfill.registerPromptVersion,
      {
        version: REFINEMENT_PROMPT_VERSION,
        type: 'refinement',
        content: REFINEMENT_SYSTEM_PROMPT,
        message: REFINEMENT_PROMPT_MESSAGE,
      }
    )
    results.refinement = refinementResult.inserted
      ? 'inserted'
      : refinementResult.updated
        ? 'updated'
        : 'unchanged'

    return results
  },
})
