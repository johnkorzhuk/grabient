import { query, mutation, internalMutation, internalQuery } from './_generated/server'
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
 */
export const getAvailableGenerationCycles = query({
  args: {},
  handler: async (ctx) => {
    const composerBatches = await ctx.db
      .query('composer_batches')
      .order('desc')
      .collect()

    // Also check for cycles that have palettes but no composer batch
    const palettes = await ctx.db.query('generated_palettes').collect()
    const paletteCycles = new Set(palettes.map(p => p.cycle))

    // Combine composer batch cycles with palette-only cycles
    const composerCycleSet = new Set(composerBatches.map(b => b.cycle))
    const allCycles = new Map<number, { cycle: number; status: string; tags: number; createdAt: number }>()

    // Add composer batch cycles
    for (const b of composerBatches) {
      allCycles.set(b.cycle, {
        cycle: b.cycle,
        status: b.status,
        tags: b.tags.length,
        createdAt: b.createdAt,
      })
    }

    // Add palette-only cycles (cycles with palettes but no composer batch)
    for (const cycle of paletteCycles) {
      if (!composerCycleSet.has(cycle)) {
        const cyclePalettes = palettes.filter(p => p.cycle === cycle)
        const uniqueTags = new Set(cyclePalettes.map(p => p.tag))
        allCycles.set(cycle, {
          cycle,
          status: 'completed', // Assume completed if palettes exist
          tags: uniqueTags.size,
          createdAt: cyclePalettes[0]?.createdAt ?? Date.now(),
        })
      }
    }

    return Array.from(allCycles.values()).sort((a, b) => b.cycle - a.cycle)
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
