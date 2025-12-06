import { query } from './_generated/server'

/**
 * Get refinement status for the dashboard
 */
export const refinementStatus = query({
  handler: async (ctx) => {
    // Get palettes with tags (ready for refinement)
    const palettes = await ctx.db.query('palettes').collect()
    const tags = await ctx.db.query('palette_tags').collect()
    const refined = await ctx.db.query('palette_tag_refined').collect()

    // Seeds that have at least one tag
    const taggedSeeds = new Set(tags.map((t) => t.seed))

    // Seeds that have been refined
    const refinedSeeds = new Set(refined.map((r) => r.seed))

    // Seeds with errors (have error field set)
    const errorSeeds = new Set(
      refined.filter((r) => r.tags === null || r.embedText === '').map((r) => r.seed),
    )

    return {
      totalPalettes: palettes.length,
      totalTagged: taggedSeeds.size,
      refined: refinedSeeds.size,
      pending: taggedSeeds.size - refinedSeeds.size,
      errors: errorSeeds.size,
    }
  },
})

/**
 * Get token usage stats
 */
export const tokenUsage = query({
  handler: async (ctx) => {
    const tags = await ctx.db.query('palette_tags').collect()
    const refined = await ctx.db.query('palette_tag_refined').collect()

    // Aggregate by provider
    const byProvider: Record<string, { input: number; output: number }> = {}

    for (const tag of tags) {
      if (tag.usage) {
        if (!byProvider[tag.provider]) {
          byProvider[tag.provider] = { input: 0, output: 0 }
        }
        byProvider[tag.provider].input += tag.usage.inputTokens
        byProvider[tag.provider].output += tag.usage.outputTokens
      }
    }

    // Refinement tokens (Opus 4.5)
    let refinementInput = 0
    let refinementOutput = 0
    for (const r of refined) {
      if (r.usage) {
        refinementInput += r.usage.inputTokens
        refinementOutput += r.usage.outputTokens
      }
    }

    return {
      byProvider,
      refinement: { input: refinementInput, output: refinementOutput },
    }
  },
})
