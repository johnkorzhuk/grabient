import { defineSchema } from 'convex/server'
import { v } from 'convex/values'
import { Table } from 'convex-helpers/server'

export const Palettes = Table('palettes', {
  seed: v.string(),
  imageUrl: v.string(), // R2 URL for palette image
})

export const PaletteTags = Table('palette_tags', {
  seed: v.string(),
  provider: v.string(),
  model: v.string(),
  runNumber: v.number(), // Which run (1-N)
  promptVersion: v.string(),
  tags: v.any(),
  error: v.optional(v.string()),

  // Token usage (normalized across providers)
  usage: v.optional(
    v.object({
      inputTokens: v.number(),
      outputTokens: v.number(),
    }),
  ),
})

export const PaletteTagRefined = Table('palette_tag_refined', {
  seed: v.string(),
  tags: v.any(), // Refined canonical tags from Opus 4.5
  embedText: v.string(), // Text for vector embedding

  // Token usage from refinement
  usage: v.optional(
    v.object({
      inputTokens: v.number(),
      outputTokens: v.number(),
    }),
  ),
})

export default defineSchema({
  palettes: Palettes.table.index('by_seed', ['seed']),
  palette_tags: PaletteTags.table
    .index('by_seed_run_provider', ['seed', 'runNumber', 'provider'])
    .index('by_run', ['runNumber']),
  palette_tag_refined: PaletteTagRefined.table.index('by_seed', ['seed']),
})
