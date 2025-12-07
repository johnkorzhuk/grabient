import { defineSchema } from 'convex/server'
import { v } from 'convex/values'
import { Table } from 'convex-helpers/server'
import {
  vProvider,
  vModel,
  vBatchStatus,
  vRefinementModel,
  vRefinementProvider,
} from './lib/providers.types'

// ============================================================================
// Palettes - seeded from D1
// ============================================================================
export const Palettes = Table('palettes', {
  seed: v.string(),
  imageUrl: v.string(), // R2 URL for palette image
})

// ============================================================================
// PaletteTags - individual tag results from providers
// ============================================================================
export const PaletteTags = Table('palette_tags', {
  seed: v.string(),
  provider: vProvider,
  model: vModel,
  // analysisIndex: which iteration (0 to tagAnalysisCount-1)
  // runNumber: legacy field from old schema (will be migrated to analysisIndex)
  analysisIndex: v.optional(v.number()),
  runNumber: v.optional(v.number()), // Deprecated - use analysisIndex
  promptVersion: v.string(),
  tags: v.any(), // TagResponse schema
  error: v.optional(v.string()),
  usage: v.optional(
    v.object({
      inputTokens: v.number(),
      outputTokens: v.number(),
    }),
  ),
})

// ============================================================================
// TagBatches - tracks batch API submissions per provider
// ============================================================================
export const TagBatches = Table('tag_batches', {
  cycle: v.optional(v.number()), // Which generation cycle this batch belongs to (optional for legacy data)
  provider: vProvider,
  model: vModel,
  batchId: v.string(), // Provider's batch ID
  status: vBatchStatus,
  analysisCount: v.optional(v.number()), // How many times each palette is tagged in this batch (optional for legacy)
  requestCount: v.number(), // How many requests in this batch
  completedCount: v.number(), // How many have completed
  failedCount: v.number(),
  createdAt: v.number(),
  completedAt: v.optional(v.number()),
  error: v.optional(v.string()),
  // For Google batches: store request order since SDK doesn't return metadata in responses
  requestOrder: v.optional(v.array(v.string())), // Array of customIds in order
})

// ============================================================================
// PaletteTagRefined - final refined tags from refinement models
// ============================================================================
export const PaletteTagRefined = Table('palette_tag_refined', {
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
})

// ============================================================================
// RefinementBatches - tracks refinement batch API submissions
// ============================================================================
export const RefinementBatches = Table('refinement_batches', {
  cycle: v.number(),
  provider: vRefinementProvider,
  model: vRefinementModel,
  batchId: v.string(),
  status: vBatchStatus,
  sourcePromptVersions: v.array(v.string()),
  requestCount: v.number(),
  completedCount: v.number(),
  failedCount: v.number(),
  createdAt: v.number(),
  completedAt: v.optional(v.number()),
  error: v.optional(v.string()),
  requestOrder: v.array(v.string()),
})

// ============================================================================
// StatsCache - cached counts to avoid expensive full-table scans
// ============================================================================
export const StatsCache = Table('stats_cache', {
  key: v.string(), // 'refinement_status' etc.
  data: v.any(), // Cached stats object
  updatedAt: v.number(),
})

export default defineSchema({
  palettes: Palettes.table.index('by_seed', ['seed']),
  palette_tags: PaletteTags.table
    .index('by_seed_provider', ['seed', 'provider', 'model'])
    .index('by_provider', ['provider']),
  tag_batches: TagBatches.table
    .index('by_cycle', ['cycle'])
    .index('by_provider', ['provider'])
    .index('by_status', ['status'])
    .index('by_batch_id', ['batchId']),
  palette_tag_refined: PaletteTagRefined.table
    .index('by_seed', ['seed'])
    .index('by_model', ['model'])
    .index('by_model_cycle', ['model', 'cycle']),
  refinement_batches: RefinementBatches.table
    .index('by_cycle', ['cycle'])
    .index('by_status', ['status'])
    .index('by_batch_id', ['batchId']),
  stats_cache: StatsCache.table.index('by_key', ['key']),
})
