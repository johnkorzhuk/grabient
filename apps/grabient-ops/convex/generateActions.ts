'use node'

import { action, internalAction } from './_generated/server'
import { internal, api } from './_generated/api'
import { v } from 'convex/values'
import { GoogleGenAI } from '@google/genai'
import Cloudflare from 'cloudflare'
import { buildGenerationSystemPrompt } from './lib/prompts'
import { vRefinementModel, REFINEMENT_MODEL_PROVIDER } from './lib/providers.types'
import { deserializeCoeffs, isValidSeed } from '@repo/data-ops/serialization'
import { cosineGradient, rgbToHex, applyGlobals } from '@repo/data-ops/gradient-gen/cosine'

const EMBEDDING_MODEL = '@cf/google/embeddinggemma-300m'
const VECTORIZE_INDEX = 'grabient-palettes'
const VECTOR_SEARCH_LIMIT = 24 // Number of example palettes to fetch

// Helper to add delay between mutations to avoid OCC conflicts
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// ============================================================================
// Vector Search - Fetch example palettes from Cloudflare Vectorize
// ============================================================================

/**
 * Search Vectorize for palettes matching a query/tag
 * Returns hex color arrays for use as generation examples
 */
async function searchVectorizeForExamples(
  query: string,
  limit: number = VECTOR_SEARCH_LIMIT
): Promise<string[][]> {
  const accountId = process.env.CF_ACCOUNT_ID
  const apiToken = process.env.CF_API_TOKEN

  if (!accountId || !apiToken) {
    console.warn('Cloudflare credentials not set, skipping vector search')
    return []
  }

  try {
    const client = new Cloudflare({ apiToken })

    // Generate embedding for the query
    const embeddingResult = await client.ai.run(EMBEDDING_MODEL, {
      account_id: accountId,
      text: [query],
    })

    if (!embeddingResult || !('data' in embeddingResult) || !embeddingResult.data) {
      console.warn('Failed to generate embedding for query:', query)
      return []
    }

    const queryVector = (embeddingResult.data as number[][])[0]
    if (!queryVector) {
      console.warn('No embedding vector returned for query:', query)
      return []
    }

    // Query Vectorize index
    const searchResponse = await client.vectorize.indexes.query(VECTORIZE_INDEX, {
      account_id: accountId,
      vector: queryVector,
      topK: limit,
      returnMetadata: 'all',
    })

    if (!searchResponse?.matches) {
      console.warn('No matches returned from Vectorize for query:', query)
      return []
    }

    // Extract seeds and convert to hex colors
    const hexPalettes: string[][] = []
    const PALETTE_STEPS = 8 // Match the 8-color output format
    for (const match of searchResponse.matches) {
      const metadata = match.metadata as { seed?: string } | undefined
      if (metadata?.seed && isValidSeed(metadata.seed)) {
        try {
          const { coeffs, globals } = deserializeCoeffs(metadata.seed)
          const appliedCoeffs = applyGlobals(coeffs, globals)
          const rgbColors = cosineGradient(PALETTE_STEPS, appliedCoeffs)
          const hexColors = rgbColors.map(([r, g, b]) => rgbToHex(r, g, b))
          if (hexColors.length >= 5) {
            hexPalettes.push(hexColors)
          }
        } catch (e) {
          console.warn('Failed to convert seed to hex colors:', metadata.seed)
        }
      }
    }

    console.log(`Vector search for "${query}": found ${hexPalettes.length} example palettes`)
    return hexPalettes
  } catch (e) {
    console.error('Vector search error:', e instanceof Error ? e.message : String(e))
    return []
  }
}

// ============================================================================
// Tag Selection - Uses Gemini to select 33 underrepresented tags
// ============================================================================

interface TagWithCount {
  tag: string
  count: number
}

/**
 * Uses Gemini 2.5 Flash Lite to intelligently select 33 underrepresented tags
 * Takes tag frequencies from the frontend (already loaded from getEmbedTextTagFrequencies)
 */
export const selectUnderrepresentedTags = action({
  args: {
    tagFrequencies: v.array(v.object({ tag: v.string(), count: v.number() })),
  },
  returns: v.array(v.string()),
  handler: async (ctx, { tagFrequencies }): Promise<string[]> => {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not set')

    if (tagFrequencies.length === 0) {
      throw new Error('No tag data available for generation')
    }

    // Prepare the prompt for tag selection
    const tagListJson = JSON.stringify(
      tagFrequencies.map((t: TagWithCount) => ({ tag: t.tag, palettes: t.count })),
      null,
      2
    )

    const selectionPrompt = `You are helping balance a gradient palette database. Below is a list of tags and how many palettes exist for each tag.

Your task: Select exactly 33 tags that are UNDERREPRESENTED and would benefit from having more palettes generated.

Selection criteria:
1. Prioritize tags with LOW palette counts (underrepresented)
2. Choose diverse tags across different categories (moods, styles, colors, themes)
3. Avoid selecting very similar tags (e.g., don't pick both "warm" and "warmth")
4. Skip generic/vague tags that don't inspire specific palettes
5. Prefer tags that are evocative and would lead to interesting color combinations

Tag data (sorted by count, lowest first):
${tagListJson}

Return ONLY a JSON array of exactly 33 tag strings, nothing else:
["tag1", "tag2", ...]`

    const ai = new GoogleGenAI({ apiKey })

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: [{ role: 'user', parts: [{ text: selectionPrompt }] }],
      config: {
        temperature: 0.7,
        responseMimeType: 'application/json',
      },
    })

    const text = response.text ?? ''

    try {
      const tags = JSON.parse(text) as string[]
      if (!Array.isArray(tags) || tags.length !== 33) {
        throw new Error(`Expected 33 tags, got ${Array.isArray(tags) ? tags.length : 'non-array'}`)
      }
      return tags
    } catch (e) {
      console.error('Failed to parse tag selection response:', text)
      throw new Error(`Failed to parse tag selection: ${e instanceof Error ? e.message : String(e)}`)
    }
  },
})

// ============================================================================
// Batch Generation - Submit palettes generation to Google Batch API
// ============================================================================

interface GenerationRequest {
  customId: string // Format: tag_iterationIndex_withExamples (0 or 1)
  tag: string
  iterationIndex: number
  withExamples: boolean
}

/**
 * Parse customId format: "tag_iterationIndex_withExamples"
 * Example: "sunset_0_1" -> { tag: "sunset", iterationIndex: 0, withExamples: true }
 */
function parseGenerationCustomId(customId: string): {
  tag: string
  iterationIndex: number
  withExamples: boolean
} {
  const parts = customId.split('_')
  const withExamples = parts.pop() === '1'
  const iterationIndex = parseInt(parts.pop() ?? '0', 10)
  const tag = parts.join('_') // Rejoin in case tag had underscores
  return { tag, iterationIndex, withExamples }
}

/**
 * Starts the generation process with user-provided tags
 * (Tags should be selected/edited by user after calling selectUnderrepresentedTags)
 */
export const startGeneration = action({
  args: {
    iterationCount: v.number(), // How many times to run each tag (n)
    palettesPerTag: v.optional(v.number()), // Default 24
    tags: v.array(v.string()), // User-confirmed tags to generate for
    model: v.optional(vRefinementModel), // Model to use (defaults to gemini-2.5-flash-lite)
  },
  returns: v.object({
    cycle: v.number(),
    tags: v.array(v.string()),
    batchId: v.optional(v.string()),
    requestCount: v.optional(v.number()),
    model: v.string(),
  }),
  handler: async (ctx, { iterationCount, palettesPerTag = 24, tags, model = 'gemini-2.5-flash-lite' }): Promise<{
    cycle: number
    tags: string[]
    batchId?: string
    requestCount?: number
    model: string
  }> => {
    console.log(`Starting generation with ${iterationCount} iterations, ${palettesPerTag} palettes per tag, ${tags.length} tags, model: ${model}`)

    // Get current cycle number
    const currentCycle: number = await ctx.runQuery(api.generate.getNextGenerationCycle, {})

    // Submit batch to Google
    const result: { batchId: string; requestCount: number } | null = await ctx.runAction(internal.generateActions.submitGenerationBatch, {
      cycle: currentCycle,
      tags,
      iterationCount,
      palettesPerTag,
      model,
    })

    return {
      cycle: currentCycle,
      tags,
      batchId: result?.batchId,
      requestCount: result?.requestCount,
      model,
    }
  },
})

/**
 * Submits the generation batch to Google Batch API
 * Creates 2 requests per tag per iteration: one with examples, one without
 */
export const submitGenerationBatch = internalAction({
  args: {
    cycle: v.number(),
    tags: v.array(v.string()),
    iterationCount: v.number(),
    palettesPerTag: v.number(),
    model: vRefinementModel,
  },
  handler: async (ctx, { cycle, tags, iterationCount, palettesPerTag, model }): Promise<{ batchId: string; requestCount: number } | null> => {
    const provider = REFINEMENT_MODEL_PROVIDER[model]

    // Currently only Google Batch API is supported for generation
    if (provider !== 'google') {
      throw new Error(`Generation currently only supports Google models. Got: ${model} (provider: ${provider})`)
    }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not set')

    // Build requests: 2 per tag per iteration (with/without examples)
    const requests: GenerationRequest[] = []

    for (const tag of tags) {
      for (let i = 0; i < iterationCount; i++) {
        // Request without examples
        requests.push({
          customId: `${tag}_${i}_0`,
          tag,
          iterationIndex: i,
          withExamples: false,
        })
        // Request with examples
        requests.push({
          customId: `${tag}_${i}_1`,
          tag,
          iterationIndex: i,
          withExamples: true,
        })
      }
    }

    console.log(`Submitting ${requests.length} generation requests to Google batch API (cycle ${cycle}, model: ${model})`)

    const ai = new GoogleGenAI({ apiKey })

    // Fetch vector search examples for each unique tag (cache to avoid duplicate searches)
    const tagExamplesCache = new Map<string, string[][]>()
    const uniqueTags = [...new Set(requests.filter((r) => r.withExamples).map((r) => r.tag))]

    console.log(`Fetching vector search examples for ${uniqueTags.length} unique tags...`)
    for (const tag of uniqueTags) {
      const examples = await searchVectorizeForExamples(tag)
      tagExamplesCache.set(tag, examples)
    }

    // Build inline requests for Google batch API
    const inlinedRequests = requests.map((req) => {
      const examples = req.withExamples ? tagExamplesCache.get(req.tag) : undefined
      const prompt = buildGenerationSystemPrompt(req.tag, palettesPerTag, examples)

      return {
        metadata: { key: req.customId },
        contents: [
          {
            role: 'user' as const,
            parts: [{ text: `Generate palettes for theme: "${req.tag}"` }],
          },
        ],
        config: {
          systemInstruction: { parts: [{ text: prompt }] },
          temperature: 0.9,
          responseMimeType: 'application/json',
          maxOutputTokens: 8192,
        },
      }
    })

    // Create batch job with selected model
    const batchJob = await ai.batches.create({
      model,
      src: inlinedRequests,
      config: {
        displayName: `grabient-generate-cycle-${cycle}-${model}`,
      },
    })

    if (!batchJob.name) {
      throw new Error('Failed to create Google batch - no name returned')
    }

    console.log(`Google generation batch created:`, {
      name: batchJob.name,
      state: batchJob.state,
      model: batchJob.model,
    })

    // Record batch in database
    const requestOrder = requests.map((req) => req.customId)
    await ctx.runMutation(internal.generate.createGenerationBatch, {
      cycle,
      batchId: batchJob.name,
      tags,
      palettesPerTag,
      iterationCount,
      requestCount: requests.length,
      requestOrder,
    })

    return { batchId: batchJob.name, requestCount: requests.length }
  },
})

// ============================================================================
// Polling - Check batch status and process results
// ============================================================================

export const pollGenerationBatch = internalAction({
  args: { batchId: v.string() },
  handler: async (ctx, { batchId }) => {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not set')

    const ai = new GoogleGenAI({ apiKey })
    const batch = await ai.batches.get({ name: batchId })

    const stats = batch.completionStats
    console.log(`Google generation batch ${batchId}:`, {
      state: batch.state,
      successfulCount: stats?.successfulCount,
      failedCount: stats?.failedCount,
      incompleteCount: stats?.incompleteCount,
    })

    // Processing states
    if (batch.state === 'JOB_STATE_PENDING' || batch.state === 'JOB_STATE_RUNNING') {
      const completedCount = parseInt(stats?.successfulCount ?? '0', 10)
      const failedCount = parseInt(stats?.failedCount ?? '0', 10)

      await ctx.runMutation(internal.generate.updateGenerationBatchStatus, {
        batchId,
        status: 'processing',
        completedCount,
        failedCount,
      })
      return { status: 'processing' as const, completedCount, failedCount }
    }

    if (batch.state === 'JOB_STATE_SUCCEEDED') {
      let successCount = 0
      let failCount = 0

      const inlinedResponses = batch.dest?.inlinedResponses
      console.log(`Google generation batch ${batchId} completed with ${inlinedResponses?.length ?? 0} responses`)

      if (!inlinedResponses || inlinedResponses.length === 0) {
        console.error('No inlined responses in Google batch result')
        await ctx.runMutation(internal.generate.updateGenerationBatchStatus, {
          batchId,
          status: 'failed',
          error: 'No inlined responses in completed batch',
        })
        return { status: 'failed' as const }
      }

      // Get the stored request order and batch info from our database
      const batchRecord = await ctx.runQuery(internal.generate.getGenerationBatchByBatchId, { batchId })
      const requestOrder = batchRecord?.requestOrder

      if (!requestOrder || requestOrder.length === 0) {
        console.error(`No requestOrder stored for batch ${batchId}`)
        await ctx.runMutation(internal.generate.updateGenerationBatchStatus, {
          batchId,
          status: 'failed',
          error: 'No request order stored - cannot map responses',
        })
        return { status: 'failed' as const }
      }

      // Process responses
      for (let i = 0; i < inlinedResponses.length; i++) {
        const inlinedResponse = inlinedResponses[i]
        const customId = requestOrder[i]

        if (!customId) {
          failCount++
          continue
        }

        const { tag, iterationIndex, withExamples } = parseGenerationCustomId(customId)

        try {
          const responseData = inlinedResponse.response
          const errorData = inlinedResponse.error

          if (errorData) {
            await ctx.runMutation(internal.generate.storeGenerationError, {
              cycle: batchRecord.cycle,
              tag,
              iterationIndex,
              withExamples,
              error: JSON.stringify(errorData),
            })
            await sleep(50)
            failCount++
            continue
          }

          // Extract text from response
          let text = responseData?.text ?? ''
          if (!text && responseData?.candidates?.[0]?.content?.parts?.[0]?.text) {
            text = responseData.candidates[0].content.parts[0].text
          }

          if (!text) {
            await ctx.runMutation(internal.generate.storeGenerationError, {
              cycle: batchRecord.cycle,
              tag,
              iterationIndex,
              withExamples,
              error: 'No text in response',
            })
            await sleep(50)
            failCount++
            continue
          }

          // Parse palettes and modifiers from response
          const { palettes, modifiers } = extractGenerationResponse(text)

          if (palettes.length === 0) {
            await ctx.runMutation(internal.generate.storeGenerationError, {
              cycle: batchRecord.cycle,
              tag,
              iterationIndex,
              withExamples,
              error: `No valid palettes extracted from response: ${text.slice(0, 200)}`,
            })
            await sleep(50)
            failCount++
            continue
          }

          // Store each palette with modifiers (modifiers shared across all palettes in this response)
          for (let paletteIdx = 0; paletteIdx < palettes.length; paletteIdx++) {
            await ctx.runMutation(internal.generate.storeGeneratedPalette, {
              cycle: batchRecord.cycle,
              tag,
              iterationIndex,
              paletteIndex: paletteIdx,
              withExamples,
              colors: palettes[paletteIdx],
              modifiers: modifiers.length > 0 ? modifiers : undefined,
            })
            await sleep(20) // Shorter delay for bulk inserts
          }

          successCount++
        } catch (e) {
          await ctx.runMutation(internal.generate.storeGenerationError, {
            cycle: batchRecord.cycle,
            tag,
            iterationIndex,
            withExamples,
            error: `Processing error: ${e instanceof Error ? e.message : String(e)}`,
          })
          await sleep(50)
          failCount++
        }
      }

      await ctx.runMutation(internal.generate.updateGenerationBatchStatus, {
        batchId,
        status: 'completed',
        completedCount: successCount,
        failedCount: failCount,
      })

      return { status: 'completed' as const, successCount, failCount }
    }

    if (batch.state === 'JOB_STATE_FAILED' || batch.state === 'JOB_STATE_CANCELLED') {
      await ctx.runMutation(internal.generate.updateGenerationBatchStatus, {
        batchId,
        status: 'failed',
        error: batch.state,
      })
      return { status: 'failed' as const }
    }

    return { status: batch.state ?? 'unknown' }
  },
})

/**
 * Polls all active generation batches
 */
export const pollActiveGenerationBatches = action({
  args: {},
  returns: v.array(v.object({
    batchId: v.string(),
    status: v.string(),
    successCount: v.optional(v.number()),
    failCount: v.optional(v.number()),
    completedCount: v.optional(v.number()),
    failedCount: v.optional(v.number()),
  })),
  handler: async (ctx): Promise<Array<{
    batchId: string
    status: string
    successCount?: number
    failCount?: number
    completedCount?: number
    failedCount?: number
  }>> => {
    const activeBatches: Array<{ batchId: string }> = await ctx.runQuery(api.generate.getActiveGenerationBatches, {})

    const results: Array<{
      batchId: string
      status: string
      successCount?: number
      failCount?: number
      completedCount?: number
      failedCount?: number
    }> = []

    for (const batch of activeBatches) {
      const result = await ctx.runAction(internal.generateActions.pollGenerationBatch, {
        batchId: batch.batchId,
      })
      results.push({ batchId: batch.batchId, ...result })
    }

    return results
  },
})

// ============================================================================
// Helpers
// ============================================================================

interface GenerationResponse {
  palettes: string[][]
  modifiers: string[]
}

/**
 * Extract palettes and modifiers from JSON response
 * Expects format: { "palettes": [["#hex1", ...], ...], "modifiers": ["mod1", ...] }
 * Falls back to legacy format: [["#hex1", ...], ...] (no modifiers)
 */
function extractGenerationResponse(text: string): GenerationResponse {
  const filterPalettes = (arr: unknown[]): string[][] => {
    return arr.filter((palette): palette is string[] => {
      if (!Array.isArray(palette)) return false
      if (palette.length < 5) return false
      return palette.every((color) => typeof color === 'string' && color.startsWith('#'))
    })
  }

  const filterModifiers = (arr: unknown[]): string[] => {
    return arr
      .filter((m): m is string => typeof m === 'string' && m.length > 0)
      .slice(0, 8) // Max 8 modifiers
  }

  try {
    const parsed = JSON.parse(text)

    // New format: { palettes: [...], modifiers: [...] }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const palettes = Array.isArray(parsed.palettes) ? filterPalettes(parsed.palettes) : []
      const modifiers = Array.isArray(parsed.modifiers) ? filterModifiers(parsed.modifiers) : []
      return { palettes, modifiers }
    }

    // Legacy format: just an array of palettes
    if (Array.isArray(parsed)) {
      return { palettes: filterPalettes(parsed), modifiers: [] }
    }

    return { palettes: [], modifiers: [] }
  } catch {
    // Try to extract JSON object from text
    const objectMatch = text.match(/\{[\s\S]*"palettes"[\s\S]*\}/)
    if (objectMatch) {
      try {
        const parsed = JSON.parse(objectMatch[0])
        const palettes = Array.isArray(parsed.palettes) ? filterPalettes(parsed.palettes) : []
        const modifiers = Array.isArray(parsed.modifiers) ? filterModifiers(parsed.modifiers) : []
        return { palettes, modifiers }
      } catch {
        // Fall through to array extraction
      }
    }

    // Try to extract legacy JSON array from text
    const arrayMatch = text.match(/\[\s*\[[\s\S]*?\]\s*\]/)
    if (arrayMatch) {
      try {
        const parsed = JSON.parse(arrayMatch[0])
        return { palettes: filterPalettes(parsed), modifiers: [] }
      } catch {
        return { palettes: [], modifiers: [] }
      }
    }

    return { palettes: [], modifiers: [] }
  }
}
