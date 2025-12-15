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
  promptVersion: v.optional(v.string()), // Prompt version used for this batch
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
  sourceCycles: v.optional(v.array(v.number())), // Which tag analysis cycles were used as input
  // Legacy field - kept for migration, will be removed after migration completes
  sourcePromptVersions: v.optional(v.array(v.string())),
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
  sourceCycles: v.optional(v.array(v.number())), // Which tag analysis cycles were used as input
  // Legacy field - kept for migration, will be removed after migration completes
  sourcePromptVersions: v.optional(v.array(v.string())),
  requestCount: v.number(),
  completedCount: v.number(),
  failedCount: v.number(),
  createdAt: v.number(),
  completedAt: v.optional(v.number()),
  error: v.optional(v.string()),
  retryCount: v.optional(v.number()), // Number of retry attempts (0 = original, 1+ = retries)
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

// ============================================================================
// PromptVersions - stores prompt content with version hashes
// ============================================================================
export const PromptVersions = Table('prompt_versions', {
  version: v.string(), // Hash of the prompt content
  type: v.union(v.literal('tagging'), v.literal('refinement')),
  content: v.string(), // Full prompt text
  message: v.optional(v.string()), // Optional commit message describing changes
})

// ============================================================================
// PaletteTagConsensus - pre-aggregated tag frequency counts per seed + prompt version
// Updated via triggers when palette_tags change. One doc per seed+promptVersion combo.
// This avoids expensive full-table scans when building tag summaries for refinement.
// Storing per-version allows filtering by specific prompt versions at query time.
//
// IMPORTANT: We use arrays instead of records to avoid Convex field name restrictions.
// Convex only allows ASCII printable characters in field names, but AI-generated tags
// may contain non-ASCII characters (Chinese, emoji, etc.). Using arrays with {key, value}
// objects bypasses this restriction since the tag strings are values, not field names.
// ============================================================================
const vFrequencyEntry = v.object({ key: v.string(), value: v.number() })
const vFrequencyArray = v.array(vFrequencyEntry)

export const PaletteTagConsensus = Table('palette_tag_consensus', {
  seed: v.string(),
  promptVersion: v.optional(v.string()), // Each doc is for ONE prompt version (optional for migration)
  promptVersions: v.optional(v.array(v.string())), // Legacy field - will be removed after migration
  totalModels: v.number(), // Number of tag records from this version that contributed
  categorical: v.object({
    temperature: vFrequencyArray,
    contrast: vFrequencyArray,
    brightness: vFrequencyArray,
    saturation: vFrequencyArray,
  }),
  tags: v.object({
    harmony: vFrequencyArray,
    mood: vFrequencyArray,
    style: vFrequencyArray,
    dominant_colors: vFrequencyArray,
    seasonal: vFrequencyArray,
    associations: vFrequencyArray,
  }),
  updatedAt: v.number(),
})

// ============================================================================
// GenerationBatches - tracks batch palette generation jobs
// ============================================================================
export const GenerationBatches = Table('generation_batches', {
  cycle: v.number(),
  batchId: v.string(), // Google batch job name
  status: vBatchStatus,
  tags: v.array(v.string()), // The 33 tags being generated for
  palettesPerTag: v.number(), // Number of palettes per tag (default 24)
  iterationCount: v.number(), // How many times to run (n)
  requestCount: v.number(), // Total requests in batch
  completedCount: v.number(),
  failedCount: v.number(),
  createdAt: v.number(),
  completedAt: v.optional(v.number()),
  error: v.optional(v.string()),
  requestOrder: v.array(v.string()), // Array of customIds for response mapping
})

// ============================================================================
// GeneratedPalettes - palettes created from batch generation
// ============================================================================
export const GeneratedPalettes = Table('generated_palettes', {
  cycle: v.number(),
  tag: v.string(), // The tag this palette was generated for
  iterationIndex: v.number(), // Which iteration (0 to n-1)
  paletteIndex: v.number(), // Which palette in the batch (0 to 23)
  withExamples: v.boolean(), // Whether examples were included in the prompt
  colors: v.array(v.string()), // Array of 8 hex colors
  modifiers: v.optional(v.array(v.string())), // 2-8 tag modifiers generated by LLM (shared per response)
  seed: v.optional(v.string()), // Fitted seed (optional, filled by post-processing)
  createdAt: v.number(),
  error: v.optional(v.string()),
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
  prompt_versions: PromptVersions.table
    .index('by_version', ['version'])
    .index('by_type', ['type']),
  palette_tag_consensus: PaletteTagConsensus.table
    .index('by_seed', ['seed'])
    .index('by_seed_version', ['seed', 'promptVersion'])
    .index('by_prompt_version', ['promptVersion']),
  generation_batches: GenerationBatches.table
    .index('by_cycle', ['cycle'])
    .index('by_status', ['status'])
    .index('by_batch_id', ['batchId']),
  generated_palettes: GeneratedPalettes.table
    .index('by_cycle', ['cycle'])
    .index('by_tag', ['tag'])
    .index('by_cycle_tag', ['cycle', 'tag'])
    .index('by_cycle_tag_examples', ['cycle', 'tag', 'withExamples'])
    .index('by_cycle_examples', ['cycle', 'withExamples']),
})
