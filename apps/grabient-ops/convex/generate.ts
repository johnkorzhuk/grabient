import { query, mutation, internalMutation, internalQuery } from './_generated/server'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { vBatchStatus, vPainterModelKey, vPainterProvider, vPaletteStyle, vPaletteAngle } from './lib/providers.types'

// ============================================================================
// Queries - Cycle Management
// ============================================================================

/**
 * Get the next generation cycle number
 */
export const getNextGenerationCycle = query({
  args: {},
  handler: async (ctx) => {
    // Check both composer and legacy batches for highest cycle
    const latestComposer = await ctx.db
      .query('composer_batches')
      .order('desc')
      .first()

    const latestLegacy = await ctx.db
      .query('generation_batches')
      .order('desc')
      .first()

    const composerCycle = latestComposer?.cycle ?? 0
    const legacyCycle = latestLegacy?.cycle ?? 0

    return Math.max(composerCycle, legacyCycle) + 1
  },
})

/**
 * Get available cycles for dropdown
 * Returns composer batches - client-side handles deduplication and formatting.
 */
export const getAvailableGenerationCycles = query({
  args: {},
  handler: async (ctx) => {
    const composerBatches = await ctx.db
      .query('composer_batches')
      .order('desc')
      .collect()

    return composerBatches.map(b => ({
      cycle: b.cycle,
      status: b.status,
      tags: b.tags.length,
      createdAt: b.createdAt,
    }))
  },
})

// ============================================================================
// Queries - Composer Stage
// ============================================================================

/**
 * Get all active (pending/processing) composer batches
 */
export const getActiveComposerBatches = query({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query('composer_batches')
      .withIndex('by_status', (q) => q.eq('status', 'pending'))
      .collect()

    const processing = await ctx.db
      .query('composer_batches')
      .withIndex('by_status', (q) => q.eq('status', 'processing'))
      .collect()

    return [...pending, ...processing]
  },
})

/**
 * Get all composer batches for display
 */
export const getAllComposerBatches = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('composer_batches')
      .order('desc')
      .collect()
  },
})

/**
 * Get composer batch by batchId (internal)
 */
export const getComposerBatchByBatchId = internalQuery({
  args: { batchId: v.string() },
  handler: async (ctx, { batchId }) => {
    return await ctx.db
      .query('composer_batches')
      .withIndex('by_batch_id', (q) => q.eq('batchId', batchId))
      .first()
  },
})

/**
 * Get composer outputs for a cycle
 */
export const getComposerOutputs = query({
  args: {
    cycle: v.number(),
    tag: v.optional(v.string()),
  },
  handler: async (ctx, { cycle, tag }) => {
    if (tag) {
      return await ctx.db
        .query('composer_outputs')
        .withIndex('by_cycle_tag', (q) => q.eq('cycle', cycle).eq('tag', tag))
        .collect()
    }

    return await ctx.db
      .query('composer_outputs')
      .withIndex('by_cycle', (q) => q.eq('cycle', cycle))
      .collect()
  },
})

// ============================================================================
// Queries - Painter Stage
// ============================================================================

/**
 * Get all active (pending/processing) painter batches
 */
export const getActivePainterBatches = query({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query('painter_batches')
      .withIndex('by_status', (q) => q.eq('status', 'pending'))
      .collect()

    const processing = await ctx.db
      .query('painter_batches')
      .withIndex('by_status', (q) => q.eq('status', 'processing'))
      .collect()

    return [...pending, ...processing]
  },
})

/**
 * Get all painter batches for display
 */
export const getAllPainterBatches = query({
  args: { cycle: v.optional(v.number()) },
  handler: async (ctx, { cycle }) => {
    if (cycle !== undefined) {
      return await ctx.db
        .query('painter_batches')
        .withIndex('by_cycle', (q) => q.eq('cycle', cycle))
        .collect()
    }

    return await ctx.db
      .query('painter_batches')
      .order('desc')
      .collect()
  },
})

/**
 * Force delete a painter batch by document ID (for stuck batches)
 */
export const forceDeletePainterBatch = mutation({
  args: { id: v.id('painter_batches') },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id)
  },
})

/**
 * Get painter batch by batchId (internal)
 */
export const getPainterBatchByBatchId = internalQuery({
  args: { batchId: v.string() },
  handler: async (ctx, { batchId }) => {
    if (!batchId) return null
    // Find painter batch by batchId - need to scan since we don't have an index on batchId
    const batches = await ctx.db.query('painter_batches').collect()
    return batches.find((b) => b.batchId === batchId) ?? null
  },
})

// ============================================================================
// Queries - Generated Palettes
// ============================================================================

/**
 * Get generated palettes for browsing
 */
export const getGeneratedPalettes = query({
  args: {
    cycle: v.optional(v.number()),
    tag: v.optional(v.string()),
    modelKey: v.optional(vPainterModelKey),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { cycle, tag, modelKey, limit = 100 }) => {
    // Use the most specific index based on provided filters
    if (cycle !== undefined && tag !== undefined) {
      const results = await ctx.db
        .query('generated_palettes')
        .withIndex('by_cycle_tag', (q) => q.eq('cycle', cycle).eq('tag', tag))
        .take(limit)

      if (modelKey) {
        return results.filter((p) => p.modelKey === modelKey)
      }
      return results
    }

    if (cycle !== undefined && modelKey !== undefined) {
      return await ctx.db
        .query('generated_palettes')
        .withIndex('by_cycle_model', (q) => q.eq('cycle', cycle).eq('modelKey', modelKey))
        .take(limit)
    }

    if (cycle !== undefined) {
      return await ctx.db
        .query('generated_palettes')
        .withIndex('by_cycle', (q) => q.eq('cycle', cycle))
        .take(limit)
    }

    if (tag !== undefined) {
      const results = await ctx.db
        .query('generated_palettes')
        .withIndex('by_tag', (q) => q.eq('tag', tag))
        .take(limit)

      if (modelKey) {
        return results.filter((p) => p.modelKey === modelKey)
      }
      return results
    }

    if (modelKey !== undefined) {
      return await ctx.db
        .query('generated_palettes')
        .withIndex('by_model_key', (q) => q.eq('modelKey', modelKey))
        .take(limit)
    }

    // No filters - return recent palettes
    return await ctx.db
      .query('generated_palettes')
      .order('desc')
      .take(limit)
  },
})

/**
 * Get all palettes from all cycles for refinement
 * WARNING: This can timeout with large datasets. Use getPaginatedGeneratedPalettes instead.
 */
export const getAllGeneratedPalettes = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('generated_palettes').collect()
  },
})

/**
 * Get generated palettes with pagination to avoid timeouts
 */
export const getPaginatedGeneratedPalettes = query({
  args: {
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { cursor, limit = 1000 }) => {
    const results = await ctx.db
      .query('generated_palettes')
      .order('desc')
      .paginate({ cursor: cursor ?? null, numItems: limit })

    return {
      palettes: results.page,
      nextCursor: results.continueCursor,
      isDone: results.isDone,
    }
  },
})

/**
 * Get generated palettes with usePaginatedQuery hook support (for refine page)
 */
export const getGeneratedPalettesPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
    cycle: v.optional(v.number()),
    tag: v.optional(v.string()),
  },
  handler: async (ctx, { paginationOpts, cycle, tag }) => {
    if (cycle !== undefined && tag !== undefined) {
      return await ctx.db
        .query('generated_palettes')
        .withIndex('by_cycle_tag', (q) => q.eq('cycle', cycle).eq('tag', tag))
        .order('desc')
        .paginate(paginationOpts)
    }

    if (cycle !== undefined) {
      return await ctx.db
        .query('generated_palettes')
        .withIndex('by_cycle', (q) => q.eq('cycle', cycle))
        .order('desc')
        .paginate(paginationOpts)
    }

    if (tag !== undefined) {
      return await ctx.db
        .query('generated_palettes')
        .withIndex('by_tag', (q) => q.eq('tag', tag))
        .order('desc')
        .paginate(paginationOpts)
    }

    return await ctx.db
      .query('generated_palettes')
      .order('desc')
      .paginate(paginationOpts)
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
    const composerBatch = await ctx.db
      .query('composer_batches')
      .withIndex('by_cycle', (q) => q.eq('cycle', cycle))
      .first()

    const painterBatches = await ctx.db
      .query('painter_batches')
      .withIndex('by_cycle', (q) => q.eq('cycle', cycle))
      .collect()

    const palettes = await ctx.db
      .query('generated_palettes')
      .withIndex('by_cycle', (q) => q.eq('cycle', cycle))
      .collect()

    const composerOutputs = await ctx.db
      .query('composer_outputs')
      .withIndex('by_cycle', (q) => q.eq('cycle', cycle))
      .collect()

    // Group by model
    const modelCounts: Record<string, number> = {}
    for (const p of palettes) {
      const key = p.modelKey ?? 'unknown'
      modelCounts[key] = (modelCounts[key] ?? 0) + 1
    }

    // Group by tag
    const tagCounts: Record<string, number> = {}
    for (const p of palettes) {
      tagCounts[p.tag] = (tagCounts[p.tag] ?? 0) + 1
    }

    const errors = palettes.filter((p) => p.error)

    return {
      composerBatch,
      painterBatches,
      composerOutputs: composerOutputs.length,
      totalPalettes: palettes.length,
      errors: errors.length,
      uniqueTags: Object.keys(tagCounts).length,
      modelCounts,
      tagCounts,
    }
  },
})

// ============================================================================
// Mutations - Composer Stage
// ============================================================================

/**
 * Create a new composer batch record
 */
export const createComposerBatch = internalMutation({
  args: {
    cycle: v.number(),
    batchId: v.string(),
    modelKey: v.optional(vPainterModelKey),
    provider: v.optional(vPainterProvider),
    tags: v.array(v.string()),
    variationsPerTag: v.number(),
    palettesPerVariation: v.number(),
    requestCount: v.number(),
    requestOrder: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('composer_batches', {
      ...args,
      status: 'pending',
      completedCount: 0,
      failedCount: 0,
      createdAt: Date.now(),
    })
  },
})

/**
 * Update composer batch status
 */
export const updateComposerBatchStatus = internalMutation({
  args: {
    batchId: v.string(),
    status: vBatchStatus,
    completedCount: v.optional(v.number()),
    failedCount: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { batchId, status, completedCount, failedCount, error }) => {
    const batch = await ctx.db
      .query('composer_batches')
      .withIndex('by_batch_id', (q) => q.eq('batchId', batchId))
      .first()

    if (!batch) {
      throw new Error(`Composer batch not found: ${batchId}`)
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
 * Fix a composer batch's provider field (for batches created before provider tracking)
 * or mark it as failed to unblock new generations
 */
export const fixComposerBatch = mutation({
  args: {
    cycle: v.number(),
    provider: v.optional(vPainterProvider),
    markFailed: v.optional(v.boolean()),
  },
  handler: async (ctx, { cycle, provider, markFailed }) => {
    const batch = await ctx.db
      .query('composer_batches')
      .withIndex('by_cycle', (q) => q.eq('cycle', cycle))
      .first()

    if (!batch) {
      throw new Error(`Composer batch not found for cycle: ${cycle}`)
    }

    const updates: Record<string, unknown> = {}

    if (provider) {
      updates.provider = provider
    }

    if (markFailed) {
      updates.status = 'failed'
      updates.error = 'Manually marked as failed'
      updates.completedAt = Date.now()
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(batch._id, updates)
    }

    return { batchId: batch.batchId, updated: Object.keys(updates) }
  },
})

/**
 * Store a composer output (matrix)
 */
export const storeComposerOutput = internalMutation({
  args: {
    cycle: v.number(),
    tag: v.string(),
    variationIndex: v.number(),
    paletteIndex: v.number(),
    theme: v.optional(v.string()),
    dimensions: v.array(v.string()),
    steps: v.any(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('composer_outputs', {
      ...args,
      // Fallback to tag if LLM didn't include theme
      theme: args.theme ?? args.tag,
      createdAt: Date.now(),
    })
  },
})

/**
 * Store a composer error
 */
export const storeComposerError = internalMutation({
  args: {
    cycle: v.number(),
    tag: v.string(),
    variationIndex: v.number(),
    error: v.string(),
  },
  handler: async (ctx, { cycle, tag, variationIndex, error }) => {
    return await ctx.db.insert('composer_outputs', {
      cycle,
      tag,
      variationIndex,
      paletteIndex: -1,
      theme: '',
      dimensions: [],
      steps: [],
      error,
      createdAt: Date.now(),
    })
  },
})

// ============================================================================
// Mutations - Painter Stage
// ============================================================================

/**
 * Create a new painter batch record
 */
export const createPainterBatch = internalMutation({
  args: {
    cycle: v.number(),
    modelKey: vPainterModelKey,
    provider: v.optional(vPainterProvider),
    batchId: v.optional(v.string()),
    requestCount: v.number(),
    requestOrder: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('painter_batches', {
      ...args,
      status: 'pending',
      completedCount: 0,
      failedCount: 0,
      createdAt: Date.now(),
    })
  },
})

/**
 * Update painter batch status
 */
export const updatePainterBatchStatus = internalMutation({
  args: {
    cycle: v.number(),
    modelKey: vPainterModelKey,
    status: vBatchStatus,
    completedCount: v.optional(v.number()),
    failedCount: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { cycle, modelKey, status, completedCount, failedCount, error }) => {
    const batch = await ctx.db
      .query('painter_batches')
      .withIndex('by_cycle_model', (q) => q.eq('cycle', cycle).eq('modelKey', modelKey))
      .first()

    if (!batch) {
      throw new Error(`Painter batch not found: cycle=${cycle}, modelKey=${modelKey}`)
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
 * Store a generated palette (single)
 */
export const storeGeneratedPalette = internalMutation({
  args: {
    cycle: v.number(),
    tag: v.string(),
    theme: v.string(),
    variationIndex: v.optional(v.number()),
    paletteIndex: v.optional(v.number()),
    modelKey: vPainterModelKey,
    seed: v.string(),
    style: vPaletteStyle,
    steps: v.number(),
    angle: vPaletteAngle,
    colors: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('generated_palettes', {
      ...args,
      createdAt: Date.now(),
    })
  },
})

const paletteEntryValidator = v.object({
  cycle: v.number(),
  tag: v.string(),
  theme: v.string(),
  variationIndex: v.optional(v.number()),
  paletteIndex: v.optional(v.number()),
  modelKey: vPainterModelKey,
  seed: v.string(),
  style: vPaletteStyle,
  steps: v.number(),
  angle: vPaletteAngle,
  colors: v.array(v.string()),
})

/**
 * Store multiple generated palettes in one mutation (batched)
 */
export const storeGeneratedPalettes = internalMutation({
  args: {
    palettes: v.array(paletteEntryValidator),
  },
  handler: async (ctx, { palettes }) => {
    const now = Date.now()
    const ids = await Promise.all(
      palettes.map((p) =>
        ctx.db.insert('generated_palettes', {
          ...p,
          createdAt: now,
        })
      )
    )
    return { count: ids.length }
  },
})

/**
 * Store a painter error
 */
export const storePainterError = internalMutation({
  args: {
    cycle: v.number(),
    tag: v.string(),
    theme: v.string(),
    modelKey: vPainterModelKey,
    error: v.string(),
  },
  handler: async (ctx, { cycle, tag, theme, modelKey, error }) => {
    return await ctx.db.insert('generated_palettes', {
      cycle,
      tag,
      theme,
      modelKey,
      seed: '',
      style: 'linearGradient',
      steps: 5,
      angle: 0,
      colors: [],
      error,
      createdAt: Date.now(),
    })
  },
})

// ============================================================================
// Mutations - Cleanup
// ============================================================================

/**
 * Delete all data for a generation cycle
 */
export const deleteGenerationCycle = mutation({
  args: { cycle: v.number() },
  handler: async (ctx, { cycle }) => {
    // Delete generated palettes
    const palettes = await ctx.db
      .query('generated_palettes')
      .withIndex('by_cycle', (q) => q.eq('cycle', cycle))
      .collect()

    for (const palette of palettes) {
      await ctx.db.delete(palette._id)
    }

    // Delete composer outputs
    const composerOutputs = await ctx.db
      .query('composer_outputs')
      .withIndex('by_cycle', (q) => q.eq('cycle', cycle))
      .collect()

    for (const output of composerOutputs) {
      await ctx.db.delete(output._id)
    }

    // Delete painter batches
    const painterBatches = await ctx.db
      .query('painter_batches')
      .withIndex('by_cycle', (q) => q.eq('cycle', cycle))
      .collect()

    for (const batch of painterBatches) {
      await ctx.db.delete(batch._id)
    }

    // Delete composer batch
    const composerBatch = await ctx.db
      .query('composer_batches')
      .withIndex('by_cycle', (q) => q.eq('cycle', cycle))
      .first()

    if (composerBatch) {
      await ctx.db.delete(composerBatch._id)
    }

    return {
      deletedPalettes: palettes.length,
      deletedComposerOutputs: composerOutputs.length,
      deletedPainterBatches: painterBatches.length,
      deletedComposerBatch: !!composerBatch,
    }
  },
})

/**
 * Delete all legacy generation data
 */
export const deleteLegacyGenerationData = mutation({
  args: {},
  handler: async (ctx) => {
    // Delete all legacy generation batches
    const legacyBatches = await ctx.db
      .query('generation_batches')
      .collect()

    for (const batch of legacyBatches) {
      await ctx.db.delete(batch._id)
    }

    return {
      deletedLegacyBatches: legacyBatches.length,
    }
  },
})

// ============================================================================
// Legacy Queries (for backwards compatibility during migration)
// ============================================================================

/**
 * Get all active (pending/processing) generation batches (legacy)
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
 * Get all generation batches for display (legacy)
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
 * Clear a generation table in batches (for dev/testing)
 */
export const clearGenerationTable = mutation({
  args: {
    table: v.union(
      v.literal('generated_palettes'),
      v.literal('composer_outputs'),
      v.literal('painter_batches'),
      v.literal('composer_batches'),
      v.literal('generation_batches')
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { table, limit = 500 }) => {
    const docs = await ctx.db.query(table).take(limit)

    for (const doc of docs) {
      await ctx.db.delete(doc._id)
    }

    return {
      deleted: docs.length,
      hasMore: docs.length === limit,
    }
  },
})

// ============================================================================
// Staged Palettes - deduplicated and filtered palettes
// ============================================================================

/**
 * Get staged palettes with pagination (for usePaginatedQuery hook)
 */
export const getStagedPalettes = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { paginationOpts }) => {
    return await ctx.db
      .query('staged_palettes')
      .order('desc')
      .paginate(paginationOpts)
  },
})

/**
 * Get staged palettes stats
 */
export const getStagedPalettesStats = query({
  args: {},
  handler: async (ctx) => {
    const allPalettes = await ctx.db.query('staged_palettes').collect()

    // Count by modelKey and themes
    const modelCounts = new Map<string, number>()
    let totalThemes = 0

    for (const p of allPalettes) {
      const key = p.modelKey || 'unknown'
      modelCounts.set(key, (modelCounts.get(key) || 0) + 1)
      totalThemes += p.themes.length
    }

    return {
      totalPalettes: allPalettes.length,
      totalThemes,
      modelCounts: Array.from(modelCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([modelKey, count]) => ({ modelKey, count })),
    }
  },
})

/**
 * Delete staged palettes by their IDs
 */
export const deleteStagedPalettes = mutation({
  args: {
    ids: v.array(v.id('staged_palettes')),
  },
  handler: async (ctx, { ids }) => {
    let deletedCount = 0
    for (const id of ids) {
      try {
        await ctx.db.delete(id)
        deletedCount++
      } catch {
        // Palette may have already been deleted
      }
    }
    return { deletedCount }
  },
})

/**
 * Get staged palettes for embedding/vectorization
 * By default returns only unvectorized palettes (those without entry in vectorized_palettes)
 * Use revectorize=true to get already-vectorized palettes for re-vectorization
 */
export const getUnvectorizedStagedPalettes = query({
  args: {
    limit: v.optional(v.number()),
    revectorize: v.optional(v.boolean()),
  },
  handler: async (ctx, { limit = 1000, revectorize = false }) => {
    // Get vectorized seeds for filtering
    const vectorizedPalettes = await ctx.db.query('vectorized_palettes').collect()
    const vectorizedSeeds = new Set(vectorizedPalettes.map((vp) => vp.seed))

    // Collect all staged palettes to properly filter
    // (we need to scan all to find unvectorized ones, as they may be spread throughout)
    const allStaged = await ctx.db.query('staged_palettes').collect()

    if (revectorize) {
      // Return staged palettes that ARE already vectorized
      return allStaged.filter((sp) => vectorizedSeeds.has(sp.seed)).slice(0, limit)
    }

    // Return only unvectorized palettes (up to limit)
    return allStaged.filter((sp) => !vectorizedSeeds.has(sp.seed)).slice(0, limit)
  },
})

/**
 * Get vectorization stats for staged palettes
 */
export const getStagedPalettesVectorizeStats = query({
  args: {},
  handler: async (ctx) => {
    // Count all staged palettes
    const allStaged = await ctx.db.query('staged_palettes').collect()

    // Count vectorized palettes
    const vectorized = await ctx.db.query('vectorized_palettes').collect()

    return {
      vectorized: vectorized.length,
      unvectorized: allStaged.length - vectorized.length,
      total: allStaged.length,
    }
  },
})

/**
 * Insert vectorized palettes (internal mutation for vectorize action)
 * Creates entries in vectorized_palettes table for each successfully vectorized palette
 */
export const insertVectorizedPalettes = internalMutation({
  args: {
    palettes: v.array(
      v.object({
        sourceId: v.optional(v.id('generated_palettes')),
        seed: v.string(),
        modelKey: v.optional(v.string()),
        themes: v.optional(v.array(v.string())),
        embedText: v.string(),
        tags: v.array(v.string()),
        vectorId: v.string(),
      })
    ),
  },
  handler: async (ctx, { palettes }) => {
    let count = 0
    for (const p of palettes) {
      await ctx.db.insert('vectorized_palettes', {
        sourceId: p.sourceId,
        seed: p.seed,
        modelKey: p.modelKey as any,
        themes: p.themes,
        embedText: p.embedText,
        tags: p.tags,
        vectorId: p.vectorId,
      })
      count++
    }
    return { count }
  },
})

/**
 * Delete vectorized palettes by seeds (for re-vectorization)
 */
export const deleteVectorizedPalettes = internalMutation({
  args: {
    seeds: v.array(v.string()),
  },
  handler: async (ctx, { seeds }) => {
    let count = 0
    for (const seed of seeds) {
      const existing = await ctx.db
        .query('vectorized_palettes')
        .withIndex('by_seed', (q) => q.eq('seed', seed))
        .first()
      if (existing) {
        await ctx.db.delete(existing._id)
        count++
      }
    }
    return { count }
  },
})

/**
 * Clear all vectorized palettes (for full re-vectorization)
 */
export const clearAllVectorizedPalettes = mutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 5000 }) => {
    const palettes = await ctx.db.query('vectorized_palettes').take(limit)

    let count = 0
    for (const p of palettes) {
      await ctx.db.delete(p._id)
      count++
    }
    return { deleted: count, hasMore: palettes.length === limit }
  },
})

/**
 * Internal: Clear all vectorized palettes (for seedVectorDatabase action)
 */
export const internalClearAllVectorizedPalettes = internalMutation({
  args: {},
  handler: async (ctx) => {
    let totalDeleted = 0
    const BATCH_SIZE = 1000

    while (true) {
      const palettes = await ctx.db.query('vectorized_palettes').take(BATCH_SIZE)
      if (palettes.length === 0) break

      for (const p of palettes) {
        await ctx.db.delete(p._id)
      }
      totalDeleted += palettes.length
      console.log(`Deleted ${totalDeleted} vectorized_palettes entries...`)
    }

    return { deleted: totalDeleted }
  },
})

