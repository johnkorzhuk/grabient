import { internalMutation, internalQuery, mutation, query } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'

// ============================================================================
// Types
// ============================================================================

/**
 * Frequency entry using array format to avoid Convex field name restrictions.
 * AI-generated tags may contain non-ASCII characters which are invalid as field names.
 */
type FrequencyEntry = { key: string; value: number }
type FrequencyArray = FrequencyEntry[]

interface ConsensusData {
  totalModels: number
  categorical: {
    temperature: FrequencyArray
    contrast: FrequencyArray
    brightness: FrequencyArray
    saturation: FrequencyArray
  }
  tags: {
    harmony: FrequencyArray
    mood: FrequencyArray
    style: FrequencyArray
    dominant_colors: FrequencyArray
    seasonal: FrequencyArray
    associations: FrequencyArray
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Create an empty consensus structure
 */
function emptyConsensus(): ConsensusData {
  return {
    totalModels: 0,
    categorical: {
      temperature: [],
      contrast: [],
      brightness: [],
      saturation: [],
    },
    tags: {
      harmony: [],
      mood: [],
      style: [],
      dominant_colors: [],
      seasonal: [],
      associations: [],
    },
  }
}

/**
 * Find an entry in a frequency array by key
 */
function findEntry(arr: FrequencyArray, key: string): FrequencyEntry | undefined {
  return arr.find((e) => e.key === key)
}

/**
 * Increment a value in a frequency array (returns new array)
 * No sanitization needed - we store the raw strings as values, not field names.
 */
function incrementFrequency(arr: FrequencyArray, key: string, delta: number = 1): FrequencyArray {
  // Normalize key: lowercase and trim
  const normalizedKey = key.toLowerCase().trim()
  if (!normalizedKey || normalizedKey.length > 100) return arr

  const existing = findEntry(arr, normalizedKey)
  if (existing) {
    const newValue = existing.value + delta
    if (newValue <= 0) {
      // Remove entry
      return arr.filter((e) => e.key !== normalizedKey)
    } else {
      // Update entry
      return arr.map((e) => (e.key === normalizedKey ? { key: normalizedKey, value: newValue } : e))
    }
  } else if (delta > 0) {
    // Add new entry
    return [...arr, { key: normalizedKey, value: delta }]
  }
  return arr
}

/**
 * Extract tag frequencies from a tag document's tags field.
 * Handles both categorical (single string) and array fields.
 */
function extractTagFrequencies(
  tagData: Record<string, unknown> | null,
): { categorical: ConsensusData['categorical']; tags: ConsensusData['tags'] } {
  const categorical: ConsensusData['categorical'] = {
    temperature: [],
    contrast: [],
    brightness: [],
    saturation: [],
  }
  const tags: ConsensusData['tags'] = {
    harmony: [],
    mood: [],
    style: [],
    dominant_colors: [],
    seasonal: [],
    associations: [],
  }

  if (!tagData) return { categorical, tags }

  // Categorical attributes (single values)
  for (const cat of ['temperature', 'contrast', 'brightness', 'saturation'] as const) {
    const value = tagData[cat]
    if (typeof value === 'string' && value) {
      categorical[cat] = incrementFrequency([], value, 1)
    }
  }

  // Tag arrays
  for (const tagType of ['harmony', 'mood', 'style', 'dominant_colors', 'seasonal', 'associations'] as const) {
    const values = tagData[tagType]
    if (Array.isArray(values)) {
      let arr: FrequencyArray = []
      for (const val of values) {
        if (typeof val === 'string' && val) {
          arr = incrementFrequency(arr, val, 1)
        }
      }
      tags[tagType] = arr
    }
  }

  return { categorical, tags }
}

/**
 * Merge frequencies from a tag into existing consensus.
 * @param consensus - Existing consensus data
 * @param tagData - The tags field from a palette_tag document
 * @param delta - 1 to add, -1 to remove
 */
function mergeTagIntoConsensus(
  consensus: ConsensusData,
  tagData: Record<string, unknown> | null,
  delta: 1 | -1 = 1,
): ConsensusData {
  const { categorical, tags } = extractTagFrequencies(tagData)

  // Update totals
  const newTotalModels = Math.max(0, consensus.totalModels + delta)

  // Merge categorical frequencies
  const newCategorical = { ...consensus.categorical }
  for (const cat of ['temperature', 'contrast', 'brightness', 'saturation'] as const) {
    let arr = [...newCategorical[cat]]
    for (const entry of categorical[cat]) {
      arr = incrementFrequency(arr, entry.key, entry.value * delta)
    }
    newCategorical[cat] = arr
  }

  // Merge tag frequencies
  const newTags = { ...consensus.tags }
  for (const tagType of ['harmony', 'mood', 'style', 'dominant_colors', 'seasonal', 'associations'] as const) {
    let arr = [...newTags[tagType]]
    for (const entry of tags[tagType]) {
      arr = incrementFrequency(arr, entry.key, entry.value * delta)
    }
    newTags[tagType] = arr
  }

  return {
    totalModels: newTotalModels,
    categorical: newCategorical,
    tags: newTags,
  }
}

/**
 * Merge multiple consensus objects into one combined consensus.
 * Used when aggregating across prompt versions.
 */
function mergeConsensusObjects(consensusList: ConsensusData[]): ConsensusData {
  let result = emptyConsensus()

  for (const consensus of consensusList) {
    result.totalModels += consensus.totalModels

    // Merge categorical
    for (const cat of ['temperature', 'contrast', 'brightness', 'saturation'] as const) {
      for (const entry of consensus.categorical[cat]) {
        result.categorical[cat] = incrementFrequency(result.categorical[cat], entry.key, entry.value)
      }
    }

    // Merge tags
    for (const tagType of ['harmony', 'mood', 'style', 'dominant_colors', 'seasonal', 'associations'] as const) {
      for (const entry of consensus.tags[tagType]) {
        result.tags[tagType] = incrementFrequency(result.tags[tagType], entry.key, entry.value)
      }
    }
  }

  return result
}

// ============================================================================
// Mutations
// ============================================================================

/**
 * Update consensus when a tag is added.
 * Called after storeTagResult inserts a new palette_tag.
 * Now stores per seed+promptVersion.
 */
export const updateConsensusOnTagInsert = internalMutation({
  args: {
    seed: v.string(),
    tags: v.any(), // The tags field from palette_tag
    promptVersion: v.string(),
  },
  handler: async (ctx, { seed, tags, promptVersion }) => {
    // Skip if tag has no data (error case)
    if (!tags) return { updated: false }

    // Get existing consensus for this seed+promptVersion
    const existing = await ctx.db
      .query('palette_tag_consensus')
      .withIndex('by_seed_version', (q) => q.eq('seed', seed).eq('promptVersion', promptVersion))
      .unique()

    const currentConsensus: ConsensusData = existing
      ? {
          totalModels: existing.totalModels,
          categorical: existing.categorical,
          tags: existing.tags,
        }
      : emptyConsensus()

    // Merge new tag data
    const updated = mergeTagIntoConsensus(currentConsensus, tags, 1)

    // Upsert consensus document
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...updated,
        updatedAt: Date.now(),
      })
    } else {
      await ctx.db.insert('palette_tag_consensus', {
        seed,
        promptVersion,
        ...updated,
        updatedAt: Date.now(),
      })
    }

    return { updated: true }
  },
})

/**
 * Update consensus when a tag is deleted.
 * Called when deleting palette_tag documents.
 */
export const updateConsensusOnTagDelete = internalMutation({
  args: {
    seed: v.string(),
    tags: v.any(), // The tags field from the deleted palette_tag
    promptVersion: v.string(),
  },
  handler: async (ctx, { seed, tags, promptVersion }) => {
    // Skip if tag had no data
    if (!tags) return { updated: false }

    // Get existing consensus for this seed+promptVersion
    const existing = await ctx.db
      .query('palette_tag_consensus')
      .withIndex('by_seed_version', (q) => q.eq('seed', seed).eq('promptVersion', promptVersion))
      .unique()

    if (!existing) return { updated: false }

    const currentConsensus: ConsensusData = {
      totalModels: existing.totalModels,
      categorical: existing.categorical,
      tags: existing.tags,
    }

    // Remove tag data (delta = -1)
    const updated = mergeTagIntoConsensus(currentConsensus, tags, -1)

    // Update or delete consensus document
    if (updated.totalModels === 0) {
      // No more tags for this seed+version, delete consensus
      await ctx.db.delete(existing._id)
    } else {
      await ctx.db.patch(existing._id, {
        ...updated,
        updatedAt: Date.now(),
      })
    }

    return { updated: true }
  },
})

// ============================================================================
// Queries
// ============================================================================

/**
 * Get consensus for a seed, optionally filtered by prompt versions.
 * Returns merged consensus across the specified versions (or all if not specified).
 */
export const getConsensusForSeed = internalQuery({
  args: {
    seed: v.string(),
    promptVersions: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { seed, promptVersions }) => {
    // Get all consensus docs for this seed
    const allConsensus = await ctx.db
      .query('palette_tag_consensus')
      .withIndex('by_seed', (q) => q.eq('seed', seed))
      .collect()

    if (allConsensus.length === 0) return null

    // Filter by prompt versions if specified
    const targetVersions = promptVersions && promptVersions.length > 0
      ? new Set(promptVersions)
      : null

    const filtered = targetVersions
      ? allConsensus.filter((c) => c.promptVersion && targetVersions.has(c.promptVersion))
      : allConsensus

    if (filtered.length === 0) return null

    // Merge all matching consensus docs
    const merged = mergeConsensusObjects(
      filtered.map((c) => ({
        totalModels: c.totalModels,
        categorical: c.categorical,
        tags: c.tags,
      }))
    )

    return {
      seed,
      promptVersions: filtered.map((c) => c.promptVersion).filter((v): v is string => v !== undefined),
      ...merged,
    }
  },
})

/**
 * Get consensus for multiple seeds efficiently.
 * This is the optimized replacement for buildTagSummaries.
 */
export const getConsensusForSeeds = internalQuery({
  args: {
    seeds: v.array(v.string()),
    promptVersions: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { seeds, promptVersions }) => {
    const targetVersions = promptVersions && promptVersions.length > 0
      ? new Set(promptVersions)
      : null

    const results: Array<{
      seed: string
      promptVersions: string[]
      totalModels: number
      categorical: ConsensusData['categorical']
      tags: ConsensusData['tags']
    } | null> = []

    for (const seed of seeds) {
      // Get all consensus docs for this seed
      const allConsensus = await ctx.db
        .query('palette_tag_consensus')
        .withIndex('by_seed', (q) => q.eq('seed', seed))
        .collect()

      if (allConsensus.length === 0) {
        results.push(null)
        continue
      }

      // Filter by prompt versions if specified
      const filtered = targetVersions
        ? allConsensus.filter((c) => c.promptVersion && targetVersions.has(c.promptVersion))
        : allConsensus

      if (filtered.length === 0) {
        results.push(null)
        continue
      }

      // Merge all matching consensus docs
      const merged = mergeConsensusObjects(
        filtered.map((c) => ({
          totalModels: c.totalModels,
          categorical: c.categorical,
          tags: c.tags,
        }))
      )

      results.push({
        seed,
        promptVersions: filtered.map((c) => c.promptVersion).filter((v): v is string => v !== undefined),
        ...merged,
      })
    }

    return results
  },
})

/**
 * Get consensus stats for dashboard display.
 */
export const getConsensusStats = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Count consensus documents
    const consensusDocs = await ctx.db.query('palette_tag_consensus').collect()

    // Get unique seeds and prompt versions
    const uniqueSeeds = new Set<string>()
    const uniqueVersions = new Set<string>()
    let totalModels = 0

    for (const c of consensusDocs) {
      uniqueSeeds.add(c.seed)
      if (c.promptVersion) {
        uniqueVersions.add(c.promptVersion)
      }
      totalModels += c.totalModels
    }

    return {
      totalDocs: consensusDocs.length,
      totalSeeds: uniqueSeeds.size,
      totalModels,
      uniquePromptVersions: uniqueVersions.size,
      promptVersions: Array.from(uniqueVersions),
    }
  },
})

// ============================================================================
// Public Queries (for UI)
// ============================================================================

/**
 * Get aggregated consensus preview for selected prompt versions.
 * Used in the New Refinement Job screen to show what data will be used.
 */
export const getConsensusPreview = query({
  args: {
    promptVersions: v.array(v.string()),
  },
  handler: async (ctx, { promptVersions }) => {
    if (promptVersions.length === 0) {
      return null
    }

    const targetVersions = new Set(promptVersions)

    // Get all consensus docs for selected versions
    const allDocs = await ctx.db.query('palette_tag_consensus').collect()
    const matchingDocs = allDocs.filter(
      (c) => c.promptVersion && targetVersions.has(c.promptVersion)
    )

    if (matchingDocs.length === 0) {
      return null
    }

    // Aggregate across all seeds for the selected versions
    // Use Map for efficient aggregation, then convert to array
    const aggregated = {
      totalSeeds: new Set(matchingDocs.map((c) => c.seed)).size,
      totalModels: 0,
      categorical: {
        temperature: new Map<string, number>(),
        contrast: new Map<string, number>(),
        brightness: new Map<string, number>(),
        saturation: new Map<string, number>(),
      },
      tags: {
        harmony: new Map<string, number>(),
        mood: new Map<string, number>(),
        style: new Map<string, number>(),
        dominant_colors: new Map<string, number>(),
        seasonal: new Map<string, number>(),
        associations: new Map<string, number>(),
      },
    }

    for (const doc of matchingDocs) {
      aggregated.totalModels += doc.totalModels

      // Merge categorical (doc.categorical[cat] is now an array)
      for (const cat of ['temperature', 'contrast', 'brightness', 'saturation'] as const) {
        for (const entry of doc.categorical[cat]) {
          const current = aggregated.categorical[cat].get(entry.key) ?? 0
          aggregated.categorical[cat].set(entry.key, current + entry.value)
        }
      }

      // Merge tags (doc.tags[tagType] is now an array)
      for (const tagType of ['harmony', 'mood', 'style', 'dominant_colors', 'seasonal', 'associations'] as const) {
        for (const entry of doc.tags[tagType]) {
          const current = aggregated.tags[tagType].get(entry.key) ?? 0
          aggregated.tags[tagType].set(entry.key, current + entry.value)
        }
      }
    }

    // Sort and limit each category to top N entries
    const sortAndLimit = (map: Map<string, number>, limit = 10) => {
      return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([value, count]) => ({ value, count }))
    }

    return {
      totalSeeds: aggregated.totalSeeds,
      totalModels: aggregated.totalModels,
      promptVersions: promptVersions,
      categorical: {
        temperature: sortAndLimit(aggregated.categorical.temperature, 5),
        contrast: sortAndLimit(aggregated.categorical.contrast, 5),
        brightness: sortAndLimit(aggregated.categorical.brightness, 5),
        saturation: sortAndLimit(aggregated.categorical.saturation, 5),
      },
      tags: {
        harmony: sortAndLimit(aggregated.tags.harmony, 5),
        mood: sortAndLimit(aggregated.tags.mood),
        style: sortAndLimit(aggregated.tags.style),
        dominant_colors: sortAndLimit(aggregated.tags.dominant_colors),
        seasonal: sortAndLimit(aggregated.tags.seasonal),
        associations: sortAndLimit(aggregated.tags.associations, 15),
      },
    }
  },
})

// ============================================================================
// Schema Migration Helper
// ============================================================================

/**
 * Clear all consensus documents for schema migration.
 * Call this BEFORE pushing schema changes when migrating from Record to Array format.
 *
 * Usage:
 * 1. Run: npx convex run consensus:clearAllConsensusForMigration
 * 2. Push schema: npx convex dev --once
 * 3. Rebuild: npx convex run consensus:rebuildAllConsensus
 */
export const clearAllConsensusForMigration = mutation({
  args: {},
  handler: async (ctx) => {
    const docs = await ctx.db.query('palette_tag_consensus').collect()
    let deleted = 0
    for (const doc of docs) {
      await ctx.db.delete(doc._id)
      deleted++
    }
    return { deleted, message: 'Consensus cleared. Now push schema and run rebuildAllConsensus.' }
  },
})

// ============================================================================
// Backfill & Repair
// ============================================================================

/**
 * Rebuild consensus for a single seed from scratch.
 * Fetches all palette_tags for the seed and computes consensus per prompt version.
 */
export const rebuildConsensusForSeed = internalMutation({
  args: {
    seed: v.string(),
  },
  handler: async (ctx, { seed }) => {
    // Delete existing consensus for this seed
    const existingDocs = await ctx.db
      .query('palette_tag_consensus')
      .withIndex('by_seed', (q) => q.eq('seed', seed))
      .collect()
    for (const doc of existingDocs) {
      await ctx.db.delete(doc._id)
    }

    // Fetch all tags for this seed
    const tags = await ctx.db
      .query('palette_tags')
      .withIndex('by_seed_provider', (q) => q.eq('seed', seed))
      .collect()

    // Filter to successful tags only
    const validTags = tags.filter((t) => t.tags !== null)

    if (validTags.length === 0) {
      return { rebuilt: false, tagCount: 0, versionsCreated: 0 }
    }

    // Group by prompt version
    const byVersion = new Map<string, ConsensusData>()
    for (const tag of validTags) {
      const version = tag.promptVersion
      const existing = byVersion.get(version) ?? emptyConsensus()
      const updated = mergeTagIntoConsensus(existing, tag.tags, 1)
      byVersion.set(version, updated)
    }

    // Create consensus docs for each version
    let versionsCreated = 0
    for (const [promptVersion, consensus] of byVersion) {
      await ctx.db.insert('palette_tag_consensus', {
        seed,
        promptVersion,
        ...consensus,
        updatedAt: Date.now(),
      })
      versionsCreated++
    }

    return { rebuilt: true, tagCount: validTags.length, versionsCreated }
  },
})

/**
 * Backfill consensus for a batch of seeds.
 * Schedules the next batch until all seeds are processed.
 */
export const backfillConsensusBatch = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, { cursor, batchSize = 50 }) => {
    // Paginate through palettes (source of truth for seeds)
    const page = await ctx.db
      .query('palettes')
      .paginate({ cursor: cursor ?? null, numItems: batchSize })

    let processed = 0
    for (const palette of page.page) {
      await ctx.runMutation(internal.consensus.rebuildConsensusForSeed, {
        seed: palette.seed,
      })
      processed++
    }

    // Schedule next batch if not done
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.consensus.backfillConsensusBatch, {
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
 * Clear all consensus data and start fresh backfill.
 * Use this if consensus data is corrupted.
 */
export const rebuildAllConsensus = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Clear existing consensus data
    const existing = await ctx.db.query('palette_tag_consensus').collect()
    for (const doc of existing) {
      await ctx.db.delete(doc._id)
    }

    // Schedule backfill
    await ctx.scheduler.runAfter(0, internal.consensus.backfillConsensusBatch, {
      batchSize: 50,
    })

    return {
      status: 'started',
      message: `Cleared ${existing.length} consensus docs, backfill scheduled`,
    }
  },
})

/**
 * Verify consensus accuracy by comparing to actual tags for a sample of seeds.
 */
export const verifyConsensus = internalQuery({
  args: {
    sampleSize: v.optional(v.number()),
  },
  handler: async (ctx, { sampleSize = 10 }) => {
    // Get a sample of seeds from palettes
    const palettes = await ctx.db.query('palettes').take(sampleSize)

    const results: Array<{
      seed: string
      consensusCount: number
      actualCount: number
      match: boolean
      byVersion: Array<{ version: string; consensusCount: number; actualCount: number; match: boolean }>
    }> = []

    for (const palette of palettes) {
      // Get consensus docs for this seed
      const consensusDocs = await ctx.db
        .query('palette_tag_consensus')
        .withIndex('by_seed', (q) => q.eq('seed', palette.seed))
        .collect()

      // Count actual valid tags for this seed
      const tags = await ctx.db
        .query('palette_tags')
        .withIndex('by_seed_provider', (q) => q.eq('seed', palette.seed))
        .collect()
      const validTags = tags.filter((t) => t.tags !== null)

      // Group actual tags by version
      const actualByVersion = new Map<string, number>()
      for (const tag of validTags) {
        const count = actualByVersion.get(tag.promptVersion) ?? 0
        actualByVersion.set(tag.promptVersion, count + 1)
      }

      // Compare per version
      const byVersion: Array<{ version: string; consensusCount: number; actualCount: number; match: boolean }> = []
      const allVersions = new Set([
        ...consensusDocs.map((c) => c.promptVersion).filter((v): v is string => v !== undefined),
        ...actualByVersion.keys(),
      ])

      for (const version of allVersions) {
        const consensusDoc = consensusDocs.find((c) => c.promptVersion === version)
        const consensusCount = consensusDoc?.totalModels ?? 0
        const actualCount = actualByVersion.get(version) ?? 0
        byVersion.push({
          version,
          consensusCount,
          actualCount,
          match: consensusCount === actualCount,
        })
      }

      const totalConsensus = consensusDocs.reduce((sum, c) => sum + c.totalModels, 0)
      const totalActual = validTags.length

      results.push({
        seed: palette.seed,
        consensusCount: totalConsensus,
        actualCount: totalActual,
        match: totalConsensus === totalActual,
        byVersion,
      })
    }

    const allMatch = results.every((r) => r.match)
    const mismatches = results.filter((r) => !r.match)

    return {
      sampleSize: results.length,
      allMatch,
      mismatches,
      details: results,
    }
  },
})
