import { defineSchema } from 'convex/server'
import { v } from 'convex/values'
import { Table } from 'convex-helpers/server'
import { vProvider, vBatchStatus } from './lib/providers.types'

// ============================================================================
// Config - singleton table for global settings
// ============================================================================
export const Config = Table('config', {
  // How many times each palette should be tagged per provider
  // e.g., tagAnalysisCount=8 with 182 palettes = 1456 requests per provider
  tagAnalysisCount: v.number(),
})

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
  model: v.string(), // Model names vary by provider, validated at runtime
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
  model: v.optional(v.string()), // Model names vary by provider
  batchId: v.string(), // Provider's batch ID
  status: vBatchStatus,
  requestCount: v.number(), // How many requests in this batch
  completedCount: v.number(), // How many have completed
  failedCount: v.number(),
  createdAt: v.number(),
  completedAt: v.optional(v.number()),
  error: v.optional(v.string()),
})

// ============================================================================
// PaletteTagRefined - final refined tags from Opus 4.5
// ============================================================================
export const PaletteTagRefined = Table('palette_tag_refined', {
  seed: v.string(),
  tags: v.any(), // Refined canonical tags from Opus 4.5
  embedText: v.string(), // Text for vector embedding
  usage: v.optional(
    v.object({
      inputTokens: v.number(),
      outputTokens: v.number(),
    }),
  ),
})

export default defineSchema({
  config: Config.table,
  palettes: Palettes.table.index('by_seed', ['seed']),
  palette_tags: PaletteTags.table
    .index('by_seed_provider', ['seed', 'provider', 'model'])
    .index('by_provider', ['provider']),
  tag_batches: TagBatches.table
    .index('by_cycle', ['cycle'])
    .index('by_provider', ['provider'])
    .index('by_status', ['status'])
    .index('by_batch_id', ['batchId']),
  palette_tag_refined: PaletteTagRefined.table.index('by_seed', ['seed']),
})
