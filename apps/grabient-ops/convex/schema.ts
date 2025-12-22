import { defineSchema } from 'convex/server'
import { v } from 'convex/values'
import { Table } from 'convex-helpers/server'
import {
  vProvider,
  vModel,
  vBatchStatus,
  vRefinementModel,
  vRefinementProvider,
  vPainterModelKey,
  vPainterProvider,
  vPaletteStyle,
  vPaletteAngle,
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
  // Source table for palette IDs (palettes or staged_palettes)
  sourceTable: v.optional(v.union(v.literal('palettes'), v.literal('staged_palettes'))),
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
// ComposerBatches - tracks batched composer requests (stage 1)
// ============================================================================
export const ComposerBatches = Table('composer_batches', {
  cycle: v.number(),
  batchId: v.string(), // Provider-specific batch ID
  modelKey: v.optional(vPainterModelKey), // Model used for this batch (optional for backwards compat)
  provider: v.optional(vPainterProvider), // Provider used for this batch (optional for backwards compat)
  status: vBatchStatus,
  tags: v.array(v.string()), // Tags being generated for
  variationsPerTag: v.number(), // Number of variations per tag
  palettesPerVariation: v.number(), // Palettes per variation
  requestCount: v.number(), // Total requests in batch
  completedCount: v.number(),
  failedCount: v.number(),
  createdAt: v.number(),
  completedAt: v.optional(v.number()),
  error: v.optional(v.string()),
  requestOrder: v.array(v.string()), // Array of customIds for response mapping
})

// ============================================================================
// ComposerOutputs - matrices generated by composer (stage 1 output)
// ============================================================================
export const ComposerOutputs = Table('composer_outputs', {
  cycle: v.number(),
  tag: v.string(),
  variationIndex: v.number(),
  paletteIndex: v.number(),
  theme: v.string(), // The theme name from composer
  dimensions: v.array(v.string()), // Which dimensions are specified
  steps: v.any(), // Array of step specs (StepSpec[])
  createdAt: v.number(),
  error: v.optional(v.string()),
})

// ============================================================================
// PainterBatches - tracks batched painter requests (stage 2)
// ============================================================================
export const PainterBatches = Table('painter_batches', {
  cycle: v.number(),
  modelKey: vPainterModelKey, // Which painter model
  provider: v.optional(vPainterProvider), // Provider for this batch (optional for backwards compat)
  batchId: v.optional(v.string()), // Provider-specific batch ID
  status: vBatchStatus,
  requestCount: v.number(),
  completedCount: v.number(),
  failedCount: v.number(),
  createdAt: v.number(),
  completedAt: v.optional(v.number()),
  error: v.optional(v.string()),
  requestOrder: v.optional(v.array(v.string())), // Array of customIds for response mapping
})

// ============================================================================
// GeneratedPalettes - palettes created from painter (stage 2 output)
// Two-stage Composer/Painter pipeline
// Note: Some fields are optional for backward compatibility with legacy data
// ============================================================================
export const GeneratedPalettes = Table('generated_palettes', {
  cycle: v.number(),
  tag: v.string(), // The original tag from composer (e.g., "banana")
  // New v2 fields (optional for backward compat)
  theme: v.optional(v.string()), // The theme/variation from composer (e.g., "banana leaf")
  variationIndex: v.optional(v.number()), // Which variation of the tag (0-5)
  paletteIndex: v.optional(v.number()), // Which palette within the variation
  modelKey: v.optional(vPainterModelKey), // Which painter model generated this
  seed: v.optional(v.string()), // Fitted cosine seed
  style: v.optional(vPaletteStyle), // Visual style
  steps: v.optional(v.number()), // Number of color steps (5-8)
  angle: v.optional(vPaletteAngle), // Gradient angle
  // Legacy fields (kept for backward compat)
  iterationIndex: v.optional(v.number()),
  withExamples: v.optional(v.boolean()),
  modifiers: v.optional(v.array(v.string())),
  // Common fields
  colors: v.array(v.string()), // Original hex colors from painter
  createdAt: v.number(),
  error: v.optional(v.string()),
})

// ============================================================================
// LEGACY: GenerationBatches - kept for backwards compatibility
// Will be removed after migration
// ============================================================================
export const GenerationBatches = Table('generation_batches', {
  cycle: v.number(),
  batchId: v.string(),
  status: vBatchStatus,
  tags: v.array(v.string()),
  palettesPerTag: v.number(),
  iterationCount: v.number(),
  requestCount: v.number(),
  completedCount: v.number(),
  failedCount: v.number(),
  createdAt: v.number(),
  completedAt: v.optional(v.number()),
  error: v.optional(v.string()),
  requestOrder: v.array(v.string()),
})

// ============================================================================
// StagedPalettes - deduplicated palettes ready for curation
// Created by deduplication migration using LAB color-space distance
// ============================================================================
export const StagedPalettes = Table('staged_palettes', {
  // Reference to the canonical generated_palette this was derived from
  sourceId: v.id('generated_palettes'),
  // Cosine seed for gradient generation
  seed: v.string(),
  // Which painter model generated this
  modelKey: v.optional(vPainterModelKey),
  // Aggregated themes from this palette and all its duplicates
  themes: v.array(v.string()),
})

// ============================================================================
// VectorizedPalettes - palettes that have been embedded and upserted to Vectorize
// Pipeline: generated_palettes → staged_palettes → vectorized_palettes
// Mirrors staged_palettes schema + vectorization metadata
// ============================================================================
export const VectorizedPalettes = Table('vectorized_palettes', {
  // Mirror of staged_palettes fields (optional for D1-sourced palettes)
  sourceId: v.optional(v.id('generated_palettes')),
  seed: v.string(),
  modelKey: v.optional(vPainterModelKey),
  themes: v.optional(v.array(v.string())), // Optional for D1-sourced palettes
  // Vectorization metadata
  embedText: v.string(), // Computed embed text used for vectorization
  tags: v.array(v.string()), // Tags array (coefficient-derived + themes, deduplicated)
  vectorId: v.string(), // nanoid used as vector ID in Cloudflare Vectorize
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
  // Two-stage Composer/Painter pipeline
  composer_batches: ComposerBatches.table
    .index('by_cycle', ['cycle'])
    .index('by_status', ['status'])
    .index('by_batch_id', ['batchId']),
  composer_outputs: ComposerOutputs.table
    .index('by_cycle', ['cycle'])
    .index('by_tag', ['tag'])
    .index('by_cycle_tag', ['cycle', 'tag']),
  painter_batches: PainterBatches.table
    .index('by_cycle', ['cycle'])
    .index('by_status', ['status'])
    .index('by_model_key', ['modelKey'])
    .index('by_cycle_model', ['cycle', 'modelKey']),
  generated_palettes: GeneratedPalettes.table
    .index('by_cycle', ['cycle'])
    .index('by_tag', ['tag'])
    .index('by_model_key', ['modelKey'])
    .index('by_cycle_tag', ['cycle', 'tag'])
    .index('by_cycle_model', ['cycle', 'modelKey'])
    .index('by_cycle_tag_variation', ['cycle', 'tag', 'variationIndex']),
  // Legacy - kept for backwards compatibility
  generation_batches: GenerationBatches.table
    .index('by_cycle', ['cycle'])
    .index('by_status', ['status'])
    .index('by_batch_id', ['batchId']),
  // Deduplicated palettes for curation
  staged_palettes: StagedPalettes.table
    .index('by_seed', ['seed']),
  // Vectorized palettes (final stage of pipeline)
  vectorized_palettes: VectorizedPalettes.table
    .index('by_seed', ['seed']),
})
