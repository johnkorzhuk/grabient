'use node'

import { action, internalAction } from './_generated/server'
import { internal, api } from './_generated/api'
import { v } from 'convex/values'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import Groq from 'groq-sdk'
import Cloudflare from 'cloudflare'
import {
  buildComposerSystemPrompt,
  buildSinglePainterPrompt,
  type PaletteMatrix,
  type ExamplePalette,
  type OutputDimensionKey,
  type StepSpec,
} from '@repo/data-ops/prompts'
import {
  PAINTER_MODELS,
  vPainterModelKey,
  type PainterModelKey,
} from './lib/providers.types'
import { deserializeCoeffs, isValidSeed, serializeCoeffs } from '@repo/data-ops/serialization'
import { DEFAULT_GLOBALS } from '@repo/data-ops/valibot-schema/grabient'
import {
  cosineGradient,
  rgbToHex,
  applyGlobals,
  fitCosinePalette,
  type CosineCoeffs,
} from '@repo/data-ops/gradient-gen'

const EMBEDDING_MODEL = '@cf/google/embeddinggemma-300m'
const VECTORIZE_INDEX = 'grabient-palettes'
const VECTOR_SEARCH_LIMIT = 24

// Default model for tag selection - uses thinking for better reasoning
const TAG_SELECTION_MODEL = 'gemini-2.5-pro'

// ============================================================================
// Palette Processing Utilities
// ============================================================================

/**
 * Apply ±5% jitter to frequency (c) and phase (d) values for variation.
 */
function applyJitter(coeffs: CosineCoeffs): CosineCoeffs {
  const jitter = () => 1 + (Math.random() * 0.1 - 0.05) // ±5% random

  return [
    coeffs[0], // a (bias) - no change
    coeffs[1], // b (amplitude) - no change
    [coeffs[2][0] * jitter(), coeffs[2][1] * jitter(), coeffs[2][2] * jitter(), 1], // c (frequency) - jitter
    [coeffs[3][0] * jitter(), coeffs[3][1] * jitter(), coeffs[3][2] * jitter(), 1], // d (phase) - jitter
  ] as CosineCoeffs
}

/**
 * Process hex colors: fit cosine palette, apply jitter, and serialize to seed
 */
function processColorsToSeed(colors: string[]): string {
  const fitResult = fitCosinePalette(colors)
  const jitteredCoeffs = applyJitter(fitResult.coeffs)
  return serializeCoeffs(jitteredCoeffs, DEFAULT_GLOBALS)
}

/**
 * Clean LLM output by removing thinking tags, markdown code blocks, and other wrappers
 */
function cleanLLMOutput(content: string): string {
  return content
    // Remove <think>...</think> tags (reasoning models like qwen3)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    // Remove markdown code blocks
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim()
}

// ============================================================================
// Vector Search - Fetch example palettes from Cloudflare Vectorize
// ============================================================================

async function searchVectorizeForExamples(
  query: string,
  limit: number = VECTOR_SEARCH_LIMIT
): Promise<ExamplePalette[]> {
  const accountId = process.env.CF_ACCOUNT_ID
  const apiToken = process.env.CF_API_TOKEN

  if (!accountId || !apiToken) {
    console.warn('Cloudflare credentials not set, skipping vector search')
    return []
  }

  try {
    const client = new Cloudflare({ apiToken })

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

    const results: ExamplePalette[] = []
    const PALETTE_STEPS = 8
    for (const match of searchResponse.matches) {
      const metadata = match.metadata as { seed?: string } | undefined
      if (metadata?.seed && isValidSeed(metadata.seed)) {
        try {
          const { coeffs, globals } = deserializeCoeffs(metadata.seed)
          const appliedCoeffs = applyGlobals(coeffs, globals)
          const rgbColors = cosineGradient(PALETTE_STEPS, appliedCoeffs)
          const hexColors = rgbColors.map(([r, g, b]) => rgbToHex(r, g, b))
          if (hexColors.length >= 5) {
            results.push({ hexColors, score: match.score ?? 0 })
          }
        } catch (e) {
          console.warn('Failed to convert seed to hex colors:', metadata.seed)
        }
      }
    }

    console.log(`Vector search for "${query}": found ${results.length} example palettes`)
    return results
  } catch (e) {
    console.error('Vector search error:', e instanceof Error ? e.message : String(e))
    return []
  }
}

// ============================================================================
// Tag Selection - Uses Gemini to select underrepresented tags
// ============================================================================

interface TagWithCount {
  tag: string
  count: number
}

export const selectUnderrepresentedTags = action({
  args: {
    tagFrequencies: v.array(v.object({ tag: v.string(), count: v.number() })),
  },
  returns: v.array(v.string()),
  handler: async (_ctx, { tagFrequencies }): Promise<string[]> => {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not set')

    if (tagFrequencies.length === 0) {
      throw new Error('No tag data available for generation')
    }

    const tagListJson = JSON.stringify(
      tagFrequencies.map((t: TagWithCount) => ({ tag: t.tag, palettes: t.count })),
      null,
      2
    )

    const selectionPrompt = `You are helping balance a gradient palette database. Below is a list of existing tags and their palette counts.

Your task has TWO parts:

PART 1 - Select 22 UNDERREPRESENTED existing tags:
- Choose tags with LOW palette counts that would benefit from more palettes
- REJECT overly generic or abstract terms - these produce bland, unfocused palettes
- REJECT broad category terms that could mean anything
- PREFER specific, evocative, niche terms that conjure distinct visual imagery
- PREFER terms tied to concrete subjects, distinct aesthetics, or specific moods
- Ensure diversity across categories (nature, emotions, eras, materials, places, etc.)
- Avoid selecting semantically similar tags

PART 2 - Suggest 11 NEW terms to add to our database:
- These should NOT exist in the provided tag list
- Think creatively about gaps in our taxonomy
- Consider specific cultural references, time periods, materials, natural phenomena, architectural styles, artistic movements, sensory experiences, or niche aesthetics
- Each suggestion should evoke a distinct, memorable color palette

Tag data (sorted by count, lowest first):
${tagListJson}

Return a JSON object with two arrays:
{
  "existing": ["tag1", "tag2", ...],  // exactly 22 existing underrepresented tags
  "suggestions": ["newterm1", "newterm2", ...]  // exactly 11 new terms to add
}`

    // Dynamic import to avoid bundling issues
    const { GoogleGenAI } = await import('@google/genai')
    const ai = new GoogleGenAI({ apiKey })

    const response = await ai.models.generateContent({
      model: TAG_SELECTION_MODEL,
      contents: [{ role: 'user', parts: [{ text: selectionPrompt }] }],
      config: {
        temperature: 0.7,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 2048 },
      },
    })

    const text = response.text ?? ''

    try {
      const result = JSON.parse(text) as { existing: string[]; suggestions: string[] }

      if (!result.existing || !Array.isArray(result.existing)) {
        throw new Error('Missing or invalid "existing" array')
      }
      if (!result.suggestions || !Array.isArray(result.suggestions)) {
        throw new Error('Missing or invalid "suggestions" array')
      }

      // Combine existing and new suggestions
      const allTags = [...result.existing, ...result.suggestions]
      console.log(`Selected ${result.existing.length} existing + ${result.suggestions.length} new = ${allTags.length} tags`)

      return allTags
    } catch (e) {
      console.error('Failed to parse tag selection response:', text.slice(0, 500))
      throw new Error(`Failed to parse tag selection: ${e instanceof Error ? e.message : String(e)}`)
    }
  },
})

// ============================================================================
// Composer Stage - Build requests and submit batches
// ============================================================================

interface StartGenerationResult {
  cycle: number
  tags: string[]
  composerBatchId?: string
  requestCount?: number
}

export const startGeneration = action({
  args: {
    tags: v.array(v.string()),
    composerModelKey: vPainterModelKey,
    variationsPerTag: v.optional(v.number()),
    palettesPerVariation: v.optional(v.number()),
  },
  returns: v.object({
    cycle: v.number(),
    tags: v.array(v.string()),
    composerBatchId: v.optional(v.string()),
    requestCount: v.optional(v.number()),
  }),
  handler: async (ctx, { tags, composerModelKey, variationsPerTag = 6, palettesPerVariation = 1 }): Promise<StartGenerationResult> => {
    const modelConfig = PAINTER_MODELS.find((m) => m.key === composerModelKey)
    if (!modelConfig) {
      throw new Error(`Unknown composer model: ${composerModelKey}`)
    }

    console.log(`Starting composer with ${tags.length} tags using model ${composerModelKey} (${modelConfig.provider})`)

    const currentCycle: number = await ctx.runQuery(api.generate.getNextGenerationCycle, {})

    let result: { batchId: string; requestCount: number } | null = null

    switch (modelConfig.provider) {
      case 'anthropic':
        result = await ctx.runAction(internal.generateActions.submitAnthropicComposerBatch, {
          cycle: currentCycle,
          tags,
          modelKey: composerModelKey,
          variationsPerTag,
          palettesPerVariation,
        })
        break
      case 'openai':
        result = await ctx.runAction(internal.generateActions.submitOpenAIComposerBatch, {
          cycle: currentCycle,
          tags,
          modelKey: composerModelKey,
          variationsPerTag,
          palettesPerVariation,
        })
        break
      case 'groq':
        result = await ctx.runAction(internal.generateActions.submitGroqComposerBatch, {
          cycle: currentCycle,
          tags,
          modelKey: composerModelKey,
          variationsPerTag,
          palettesPerVariation,
        })
        break
      case 'google':
        result = await ctx.runAction(internal.generateActions.submitGoogleComposerBatch, {
          cycle: currentCycle,
          tags,
          modelKey: composerModelKey,
          variationsPerTag,
          palettesPerVariation,
        })
        break
    }

    return {
      cycle: currentCycle,
      tags,
      composerBatchId: result?.batchId,
      requestCount: result?.requestCount,
    }
  },
})

// Helper to build composer requests for a set of tags
// Creates palettesPerVariation requests per tag for a total of tags.length * palettesPerVariation requests
async function buildComposerRequests(
  tags: string[],
  variationsPerTag: number,
  palettesPerVariation: number,
): Promise<{ tag: string; matrixIndex: number; systemPrompt: string; userPrompt: string }[]> {
  const requests: { tag: string; matrixIndex: number; systemPrompt: string; userPrompt: string }[] = []

  for (const tag of tags) {
    const examples = await searchVectorizeForExamples(tag)

    // Create palettesPerVariation separate requests per tag
    for (let matrixIndex = 0; matrixIndex < palettesPerVariation; matrixIndex++) {
      const systemPrompt = buildComposerSystemPrompt({
        query: tag,
        variationCount: variationsPerTag,
        palettesPerVariation: 1, // Each request generates 1 matrix
        stepsRange: [5, 8],
        examplePalettes: examples,
      })
      requests.push({
        tag,
        matrixIndex,
        systemPrompt,
        userPrompt: `Generate dimension matrices for: "${tag}"`,
      })
    }
  }

  console.log(`Built ${requests.length} composer requests (${tags.length} tags × ${palettesPerVariation} matrices)`)
  return requests
}

// ============================================================================
// Anthropic Composer Batch
// ============================================================================

export const submitAnthropicComposerBatch = internalAction({
  args: {
    cycle: v.number(),
    tags: v.array(v.string()),
    modelKey: vPainterModelKey,
    variationsPerTag: v.number(),
    palettesPerVariation: v.number(),
  },
  handler: async (ctx, { cycle, tags, modelKey, variationsPerTag, palettesPerVariation }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

    const modelConfig = PAINTER_MODELS.find((m) => m.key === modelKey)
    if (!modelConfig) throw new Error(`Unknown model: ${modelKey}`)

    console.log(`Building ${tags.length} composer requests for Anthropic batch (cycle ${cycle})`)
    const requests = await buildComposerRequests(tags, variationsPerTag, palettesPerVariation)

    const anthropic = new Anthropic({ apiKey })

    const batchRequests = requests.map((req) => ({
      custom_id: `${req.tag}__${req.matrixIndex}`,
      params: {
        model: modelConfig.id,
        max_tokens: 8192,
        system: req.systemPrompt,
        messages: [{ role: 'user' as const, content: req.userPrompt }],
      },
    }))

    const batch = await anthropic.messages.batches.create({
      requests: batchRequests,
    })

    console.log(`Anthropic composer batch created: ${batch.id} with ${requests.length} requests (cycle ${cycle})`)

    await ctx.runMutation(internal.generate.createComposerBatch, {
      cycle,
      batchId: batch.id,
      modelKey,
      provider: 'anthropic',
      tags,
      variationsPerTag,
      palettesPerVariation,
      requestCount: requests.length,
      requestOrder: tags,
    })

    return { batchId: batch.id, requestCount: requests.length }
  },
})

// ============================================================================
// OpenAI Composer Batch
// ============================================================================

export const submitOpenAIComposerBatch = internalAction({
  args: {
    cycle: v.number(),
    tags: v.array(v.string()),
    modelKey: vPainterModelKey,
    variationsPerTag: v.number(),
    palettesPerVariation: v.number(),
  },
  handler: async (ctx, { cycle, tags, modelKey, variationsPerTag, palettesPerVariation }) => {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY not set')

    const modelConfig = PAINTER_MODELS.find((m) => m.key === modelKey)
    if (!modelConfig) throw new Error(`Unknown model: ${modelKey}`)

    console.log(`Building ${tags.length} composer requests for OpenAI batch (cycle ${cycle})`)
    const requests = await buildComposerRequests(tags, variationsPerTag, palettesPerVariation)

    const openai = new OpenAI({ apiKey })

    const jsonlLines = requests.map((req) =>
      JSON.stringify({
        custom_id: `${req.tag}__${req.matrixIndex}`,
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model: modelConfig.id,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: req.systemPrompt },
            { role: 'user', content: req.userPrompt },
          ],
        },
      })
    )

    const file = await openai.files.create({
      file: new File([jsonlLines.join('\n')], 'composer_batch.jsonl', {
        type: 'application/jsonl',
      }),
      purpose: 'batch',
    })

    const batch = await openai.batches.create({
      input_file_id: file.id,
      endpoint: '/v1/chat/completions',
      completion_window: '24h',
    })

    console.log(`OpenAI composer batch created: ${batch.id} with ${requests.length} requests (cycle ${cycle})`)

    await ctx.runMutation(internal.generate.createComposerBatch, {
      cycle,
      batchId: batch.id,
      modelKey,
      provider: 'openai',
      tags,
      variationsPerTag,
      palettesPerVariation,
      requestCount: requests.length,
      requestOrder: tags,
    })

    return { batchId: batch.id, requestCount: requests.length }
  },
})

// ============================================================================
// Groq Composer Batch
// ============================================================================

export const submitGroqComposerBatch = internalAction({
  args: {
    cycle: v.number(),
    tags: v.array(v.string()),
    modelKey: vPainterModelKey,
    variationsPerTag: v.number(),
    palettesPerVariation: v.number(),
  },
  handler: async (ctx, { cycle, tags, modelKey, variationsPerTag, palettesPerVariation }) => {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new Error('GROQ_API_KEY not set')

    const modelConfig = PAINTER_MODELS.find((m) => m.key === modelKey)
    if (!modelConfig) throw new Error(`Unknown model: ${modelKey}`)

    console.log(`Building ${tags.length} composer requests for Groq batch (cycle ${cycle})`)
    const requests = await buildComposerRequests(tags, variationsPerTag, palettesPerVariation)

    const groq = new Groq({ apiKey })

    const jsonlLines = requests.map((req) =>
      JSON.stringify({
        custom_id: `${req.tag}__${req.matrixIndex}`,
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model: modelConfig.id,
          messages: [
            { role: 'system', content: req.systemPrompt },
            { role: 'user', content: req.userPrompt },
          ],
        },
      })
    )

    const file = await groq.files.create({
      file: new File([jsonlLines.join('\n')], 'composer_batch.jsonl', {
        type: 'application/jsonl',
      }),
      purpose: 'batch',
    })

    if (!file.id) {
      throw new Error('Failed to upload Groq composer batch file - no id returned')
    }

    const batch = await groq.batches.create({
      input_file_id: file.id,
      endpoint: '/v1/chat/completions',
      completion_window: '24h',
    })

    if (!batch.id) {
      throw new Error('Failed to create Groq composer batch - no id returned')
    }

    console.log(`Groq composer batch created: ${batch.id} with ${requests.length} requests (cycle ${cycle})`)

    await ctx.runMutation(internal.generate.createComposerBatch, {
      cycle,
      batchId: batch.id,
      modelKey,
      provider: 'groq',
      tags,
      variationsPerTag,
      palettesPerVariation,
      requestCount: requests.length,
      requestOrder: tags,
    })

    return { batchId: batch.id, requestCount: requests.length }
  },
})

// ============================================================================
// Google Composer Batch
// ============================================================================

export const submitGoogleComposerBatch = internalAction({
  args: {
    cycle: v.number(),
    tags: v.array(v.string()),
    modelKey: vPainterModelKey,
    variationsPerTag: v.number(),
    palettesPerVariation: v.number(),
  },
  handler: async (ctx, { cycle, tags, modelKey, variationsPerTag, palettesPerVariation }) => {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not set')

    const modelConfig = PAINTER_MODELS.find((m) => m.key === modelKey)
    if (!modelConfig) throw new Error(`Unknown model: ${modelKey}`)

    console.log(`Building ${tags.length} composer requests for Google batch (cycle ${cycle})`)
    const requests = await buildComposerRequests(tags, variationsPerTag, palettesPerVariation)

    const { GoogleGenAI } = await import('@google/genai')
    const ai = new GoogleGenAI({ apiKey })

    const inlinedRequests = requests.map((req) => ({
      metadata: { key: `${req.tag}__${req.matrixIndex}` },
      contents: [
        {
          role: 'user' as const,
          parts: [{ text: req.userPrompt }],
        },
      ],
      config: {
        systemInstruction: { parts: [{ text: req.systemPrompt }] },
        temperature: 0.9,
        responseMimeType: 'application/json',
        maxOutputTokens: 8192,
      },
    }))

    const batchJob = await ai.batches.create({
      model: modelConfig.id,
      src: inlinedRequests,
      config: {
        displayName: `grabient-composer-cycle-${cycle}`,
      },
    })

    if (!batchJob.name) {
      throw new Error('Failed to create Google batch - no name returned')
    }

    console.log(`Google composer batch created: ${batchJob.name} with ${requests.length} requests (cycle ${cycle})`)

    await ctx.runMutation(internal.generate.createComposerBatch, {
      cycle,
      batchId: batchJob.name,
      modelKey,
      provider: 'google',
      tags,
      variationsPerTag,
      palettesPerVariation,
      requestCount: requests.length,
      requestOrder: tags,
    })

    return { batchId: batchJob.name, requestCount: requests.length }
  },
})

// ============================================================================
// Polling - Poll all active batches
// ============================================================================

export const pollAllActiveBatches = action({
  args: {},
  returns: v.object({
    composerPolled: v.number(),
    painterPolled: v.number(),
  }),
  handler: async (ctx) => {
    const activeComposerBatches = await ctx.runQuery(api.generate.getActiveComposerBatches, {})
    const activePainterBatches = await ctx.runQuery(api.generate.getActivePainterBatches, {})

    let composerPolled = 0
    let painterPolled = 0

    // Poll composer batches
    for (const batch of activeComposerBatches) {
      if (!batch.batchId || !batch.provider) continue

      try {
        switch (batch.provider) {
          case 'anthropic':
            await ctx.runAction(internal.generateActions.pollAnthropicComposerBatch, { batchId: batch.batchId })
            break
          case 'openai':
            await ctx.runAction(internal.generateActions.pollOpenAIComposerBatch, { batchId: batch.batchId })
            break
          case 'groq':
            await ctx.runAction(internal.generateActions.pollGroqComposerBatch, { batchId: batch.batchId })
            break
          case 'google':
            await ctx.runAction(internal.generateActions.pollGoogleComposerBatch, { batchId: batch.batchId })
            break
        }
        composerPolled++
      } catch (e) {
        console.error(`Failed to poll composer batch ${batch.batchId}:`, e)
      }
    }

    // Poll painter batches
    for (const batch of activePainterBatches) {
      if (!batch.batchId || !batch.provider) continue

      try {
        switch (batch.provider) {
          case 'anthropic':
            await ctx.runAction(internal.generateActions.pollAnthropicPainterBatch, {
              batchId: batch.batchId,
              cycle: batch.cycle,
              modelKey: batch.modelKey,
            })
            break
          case 'openai':
            await ctx.runAction(internal.generateActions.pollOpenAIPainterBatch, {
              batchId: batch.batchId,
              cycle: batch.cycle,
              modelKey: batch.modelKey,
            })
            break
          case 'groq':
            await ctx.runAction(internal.generateActions.pollGroqPainterBatch, {
              batchId: batch.batchId,
              cycle: batch.cycle,
              modelKey: batch.modelKey,
            })
            break
          case 'google':
            await ctx.runAction(internal.generateActions.pollGooglePainterBatch, {
              batchId: batch.batchId,
              cycle: batch.cycle,
              modelKey: batch.modelKey,
            })
            break
        }
        painterPolled++
      } catch (e) {
        console.error(`Failed to poll painter batch ${batch.batchId}:`, e)
      }
    }

    return { composerPolled, painterPolled }
  },
})

// ============================================================================
// Polling - Google Composer Batch
// ============================================================================

export const pollGoogleComposerBatch = internalAction({
  args: { batchId: v.string() },
  handler: async (ctx, { batchId }) => {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not set')

    const { GoogleGenAI } = await import('@google/genai')
    const ai = new GoogleGenAI({ apiKey })
    const batch = await ai.batches.get({ name: batchId })

    const stats = batch.completionStats
    console.log(`Google composer batch ${batchId}:`, {
      state: batch.state,
      successfulCount: stats?.successfulCount,
      failedCount: stats?.failedCount,
    })

    if (batch.state === 'JOB_STATE_PENDING' || batch.state === 'JOB_STATE_RUNNING') {
      const completedCount = parseInt(stats?.successfulCount ?? '0', 10)
      const failedCount = parseInt(stats?.failedCount ?? '0', 10)

      await ctx.runMutation(internal.generate.updateComposerBatchStatus, {
        batchId,
        status: 'processing',
        completedCount,
        failedCount,
      })
      return
    }

    if (batch.state === 'JOB_STATE_SUCCEEDED') {
      // Get batch record to find cycle and request order
      const batchRecord = await ctx.runQuery(internal.generate.getComposerBatchByBatchId, { batchId })
      if (!batchRecord) {
        console.error(`Batch record not found for ${batchId}`)
        return
      }

      const cycle = batchRecord.cycle
      const tags = batchRecord.tags
      const palettesPerVariation = batchRecord.palettesPerVariation
      console.log(`Processing Google composer results for cycle ${cycle}`)

      let storedCount = 0
      let errorCount = 0

      // Get inline responses - they're in the same order as requests
      const inlinedResponses = batch.dest?.inlinedResponses ?? []

      // Reconstruct request order: for each tag, there are palettesPerVariation requests
      let requestIndex = 0
      for (const tag of tags) {
        for (let matrixIndex = 0; matrixIndex < palettesPerVariation; matrixIndex++) {
          const result = inlinedResponses[requestIndex]
          requestIndex++

          if (!result) {
            errorCount++
            continue
          }

          if (result.error) {
            await ctx.runMutation(internal.generate.storeComposerError, {
              cycle,
              tag,
              variationIndex: matrixIndex,
              error: result.error.message ?? 'Unknown error',
            })
            errorCount++
            continue
          }

          const contentStr = result.response?.candidates?.[0]?.content?.parts?.[0]?.text
          if (!contentStr) {
            await ctx.runMutation(internal.generate.storeComposerError, {
              cycle,
              tag,
              variationIndex: matrixIndex,
              error: 'No response content',
            })
            errorCount++
            continue
          }

          try {
            const content = JSON.parse(contentStr) as {
              variations: Array<{
                palettes: Array<{
                  theme: string
                  dimensions: string[]
                  steps: unknown[]
                }>
              }>
            }

            for (let variationIndex = 0; variationIndex < content.variations.length; variationIndex++) {
              const variation = content.variations[variationIndex]
              for (let paletteIndex = 0; paletteIndex < variation.palettes.length; paletteIndex++) {
                const palette = variation.palettes[paletteIndex]
                await ctx.runMutation(internal.generate.storeComposerOutput, {
                  cycle,
                  tag,
                  variationIndex,
                  paletteIndex: matrixIndex * 100 + paletteIndex,
                  theme: palette.theme,
                  dimensions: palette.dimensions,
                  steps: palette.steps,
                })
                storedCount++
              }
            }
          } catch (e) {
            console.error(`Failed to parse Google result for ${tag}__${matrixIndex}:`, e)
            await ctx.runMutation(internal.generate.storeComposerError, {
              cycle,
              tag,
              variationIndex: matrixIndex,
              error: e instanceof Error ? e.message : String(e),
            })
            errorCount++
          }
        }
      }

      console.log(`Google composer batch ${batchId} processed: ${storedCount} palettes stored, ${errorCount} errors`)

      await ctx.runMutation(internal.generate.updateComposerBatchStatus, {
        batchId,
        status: 'completed',
        completedCount: parseInt(stats?.successfulCount ?? '0', 10),
        failedCount: parseInt(stats?.failedCount ?? '0', 10),
      })
    } else if (batch.state === 'JOB_STATE_FAILED' || batch.state === 'JOB_STATE_CANCELLED') {
      await ctx.runMutation(internal.generate.updateComposerBatchStatus, {
        batchId,
        status: 'failed',
        error: `Batch ${batch.state}`,
      })
    }
  },
})

// ============================================================================
// Polling stubs for other providers (to be implemented)
// ============================================================================

export const pollAnthropicComposerBatch = internalAction({
  args: { batchId: v.string() },
  handler: async (ctx, { batchId }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

    const anthropic = new Anthropic({ apiKey })
    const batch = await anthropic.messages.batches.retrieve(batchId)

    console.log(`Anthropic composer batch ${batchId}:`, {
      status: batch.processing_status,
      succeeded: batch.request_counts.succeeded,
      failed: batch.request_counts.errored,
    })

    if (batch.processing_status === 'in_progress') {
      await ctx.runMutation(internal.generate.updateComposerBatchStatus, {
        batchId,
        status: 'processing',
        completedCount: batch.request_counts.succeeded,
        failedCount: batch.request_counts.errored,
      })
      return
    }

    if (batch.processing_status === 'ended') {
      // Get batch record to find cycle
      const batchRecord = await ctx.runQuery(internal.generate.getComposerBatchByBatchId, { batchId })
      if (!batchRecord) {
        console.error(`Batch record not found for ${batchId}`)
        return
      }

      const cycle = batchRecord.cycle
      console.log(`Processing Anthropic composer results for cycle ${cycle}`)

      let storedCount = 0
      let errorCount = 0

      // Iterate through all results
      const resultsDecoder = await anthropic.messages.batches.results(batchId)
      for await (const result of resultsDecoder) {
        const customId = result.custom_id
        // Parse custom_id format: "tag__matrixIndex"
        const [tag, matrixIndexStr] = customId.split('__')
        const matrixIndex = parseInt(matrixIndexStr ?? '0', 10)

        if (result.result.type === 'succeeded') {
          try {
            // Extract text content from the message
            const message = result.result.message
            const textBlock = message.content.find((block): block is Anthropic.TextBlock => block.type === 'text')
            if (!textBlock) {
              console.warn(`No text content in result for ${customId}`)
              errorCount++
              continue
            }

            // Parse the JSON response
            const content = JSON.parse(textBlock.text) as {
              variations: Array<{
                palettes: Array<{
                  theme: string
                  dimensions: string[]
                  steps: unknown[]
                }>
              }>
            }

            // Store each palette from each variation
            for (let variationIndex = 0; variationIndex < content.variations.length; variationIndex++) {
              const variation = content.variations[variationIndex]
              for (let paletteIndex = 0; paletteIndex < variation.palettes.length; paletteIndex++) {
                const palette = variation.palettes[paletteIndex]
                await ctx.runMutation(internal.generate.storeComposerOutput, {
                  cycle,
                  tag,
                  variationIndex,
                  paletteIndex: matrixIndex * 100 + paletteIndex, // Unique index combining matrix and palette
                  theme: palette.theme,
                  dimensions: palette.dimensions,
                  steps: palette.steps,
                })
                storedCount++
              }
            }
          } catch (e) {
            console.error(`Failed to parse result for ${customId}:`, e)
            await ctx.runMutation(internal.generate.storeComposerError, {
              cycle,
              tag,
              variationIndex: matrixIndex,
              error: e instanceof Error ? e.message : String(e),
            })
            errorCount++
          }
        } else {
          // Handle error results
          const errorMsg = result.result.type === 'errored'
            ? result.result.error?.error?.message ?? 'Unknown error'
            : 'Request expired or cancelled'

          await ctx.runMutation(internal.generate.storeComposerError, {
            cycle,
            tag,
            variationIndex: matrixIndex,
            error: errorMsg,
          })
          errorCount++
        }
      }

      console.log(`Anthropic composer batch ${batchId} processed: ${storedCount} palettes stored, ${errorCount} errors`)

      await ctx.runMutation(internal.generate.updateComposerBatchStatus, {
        batchId,
        status: 'completed',
        completedCount: batch.request_counts.succeeded,
        failedCount: batch.request_counts.errored,
      })
    }
  },
})

export const pollOpenAIComposerBatch = internalAction({
  args: { batchId: v.string() },
  handler: async (ctx, { batchId }) => {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY not set')

    const openai = new OpenAI({ apiKey })
    const batch = await openai.batches.retrieve(batchId)

    console.log(`OpenAI composer batch ${batchId}:`, {
      status: batch.status,
      completed: batch.request_counts?.completed,
      failed: batch.request_counts?.failed,
    })

    if (batch.status === 'in_progress' || batch.status === 'validating' || batch.status === 'finalizing') {
      await ctx.runMutation(internal.generate.updateComposerBatchStatus, {
        batchId,
        status: 'processing',
        completedCount: batch.request_counts?.completed ?? 0,
        failedCount: batch.request_counts?.failed ?? 0,
      })
      return
    }

    if (batch.status === 'completed') {
      // Get batch record to find cycle
      const batchRecord = await ctx.runQuery(internal.generate.getComposerBatchByBatchId, { batchId })
      if (!batchRecord) {
        console.error(`Batch record not found for ${batchId}`)
        return
      }

      const cycle = batchRecord.cycle
      console.log(`Processing OpenAI composer results for cycle ${cycle}`)

      // Download the output file
      if (!batch.output_file_id) {
        console.error(`No output file for batch ${batchId}`)
        await ctx.runMutation(internal.generate.updateComposerBatchStatus, {
          batchId,
          status: 'failed',
          error: 'No output file',
        })
        return
      }

      const fileResponse = await openai.files.content(batch.output_file_id)
      const fileContent = await fileResponse.text()
      const lines = fileContent.trim().split('\n')

      let storedCount = 0
      let errorCount = 0

      for (const line of lines) {
        try {
          const result = JSON.parse(line) as {
            custom_id: string
            response?: {
              status_code: number
              body: {
                choices: Array<{
                  message: {
                    content: string
                  }
                }>
              }
            }
            error?: { message: string }
          }

          const customId = result.custom_id
          const [tag, matrixIndexStr] = customId.split('__')
          const matrixIndex = parseInt(matrixIndexStr ?? '0', 10)

          if (result.response?.status_code === 200) {
            const contentStr = result.response.body.choices[0]?.message?.content
            if (!contentStr) {
              errorCount++
              continue
            }

            const content = JSON.parse(contentStr) as {
              variations: Array<{
                palettes: Array<{
                  theme: string
                  dimensions: string[]
                  steps: unknown[]
                }>
              }>
            }

            for (let variationIndex = 0; variationIndex < content.variations.length; variationIndex++) {
              const variation = content.variations[variationIndex]
              for (let paletteIndex = 0; paletteIndex < variation.palettes.length; paletteIndex++) {
                const palette = variation.palettes[paletteIndex]
                await ctx.runMutation(internal.generate.storeComposerOutput, {
                  cycle,
                  tag,
                  variationIndex,
                  paletteIndex: matrixIndex * 100 + paletteIndex,
                  theme: palette.theme,
                  dimensions: palette.dimensions,
                  steps: palette.steps,
                })
                storedCount++
              }
            }
          } else {
            await ctx.runMutation(internal.generate.storeComposerError, {
              cycle,
              tag,
              variationIndex: matrixIndex,
              error: result.error?.message ?? 'Request failed',
            })
            errorCount++
          }
        } catch (e) {
          console.error(`Failed to parse OpenAI result line:`, e)
          errorCount++
        }
      }

      console.log(`OpenAI composer batch ${batchId} processed: ${storedCount} palettes stored, ${errorCount} errors`)

      await ctx.runMutation(internal.generate.updateComposerBatchStatus, {
        batchId,
        status: 'completed',
        completedCount: batch.request_counts?.completed ?? 0,
        failedCount: batch.request_counts?.failed ?? 0,
      })
    } else if (batch.status === 'failed' || batch.status === 'cancelled' || batch.status === 'expired') {
      await ctx.runMutation(internal.generate.updateComposerBatchStatus, {
        batchId,
        status: 'failed',
        error: `Batch ${batch.status}`,
      })
    }
  },
})

export const pollGroqComposerBatch = internalAction({
  args: { batchId: v.string() },
  handler: async (ctx, { batchId }) => {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new Error('GROQ_API_KEY not set')

    const groq = new Groq({ apiKey })
    const batch = await groq.batches.retrieve(batchId)

    console.log(`Groq composer batch ${batchId}:`, {
      status: batch.status,
      completed: batch.request_counts?.completed,
      failed: batch.request_counts?.failed,
    })

    if (batch.status === 'in_progress' || batch.status === 'validating' || batch.status === 'finalizing') {
      await ctx.runMutation(internal.generate.updateComposerBatchStatus, {
        batchId,
        status: 'processing',
        completedCount: batch.request_counts?.completed ?? 0,
        failedCount: batch.request_counts?.failed ?? 0,
      })
      return
    }

    if (batch.status === 'completed') {
      // Get batch record to find cycle
      const batchRecord = await ctx.runQuery(internal.generate.getComposerBatchByBatchId, { batchId })
      if (!batchRecord) {
        console.error(`Batch record not found for ${batchId}`)
        return
      }

      const cycle = batchRecord.cycle
      console.log(`Processing Groq composer results for cycle ${cycle}`)

      // Download the output file
      if (!batch.output_file_id) {
        console.error(`No output file for batch ${batchId}`)
        await ctx.runMutation(internal.generate.updateComposerBatchStatus, {
          batchId,
          status: 'failed',
          error: 'No output file',
        })
        return
      }

      const fileContent = await groq.files.content(batch.output_file_id)
      const text = await fileContent.text()
      const lines = text.trim().split('\n')

      let storedCount = 0
      let errorCount = 0

      for (const line of lines) {
        try {
          const result = JSON.parse(line) as {
            custom_id: string
            response?: {
              status_code: number
              body: {
                choices: Array<{
                  message: {
                    content: string
                  }
                }>
              }
            }
            error?: { message: string }
          }

          const customId = result.custom_id
          const [tag, matrixIndexStr] = customId.split('__')
          const matrixIndex = parseInt(matrixIndexStr ?? '0', 10)

          if (result.response?.status_code === 200) {
            const contentStr = result.response.body.choices[0]?.message?.content
            if (!contentStr) {
              errorCount++
              continue
            }

            const content = JSON.parse(contentStr) as {
              variations: Array<{
                palettes: Array<{
                  theme: string
                  dimensions: string[]
                  steps: unknown[]
                }>
              }>
            }

            for (let variationIndex = 0; variationIndex < content.variations.length; variationIndex++) {
              const variation = content.variations[variationIndex]
              for (let paletteIndex = 0; paletteIndex < variation.palettes.length; paletteIndex++) {
                const palette = variation.palettes[paletteIndex]
                await ctx.runMutation(internal.generate.storeComposerOutput, {
                  cycle,
                  tag,
                  variationIndex,
                  paletteIndex: matrixIndex * 100 + paletteIndex,
                  theme: palette.theme,
                  dimensions: palette.dimensions,
                  steps: palette.steps,
                })
                storedCount++
              }
            }
          } else {
            await ctx.runMutation(internal.generate.storeComposerError, {
              cycle,
              tag,
              variationIndex: matrixIndex,
              error: result.error?.message ?? 'Request failed',
            })
            errorCount++
          }
        } catch (e) {
          console.error(`Failed to parse Groq result line:`, e)
          errorCount++
        }
      }

      console.log(`Groq composer batch ${batchId} processed: ${storedCount} palettes stored, ${errorCount} errors`)

      await ctx.runMutation(internal.generate.updateComposerBatchStatus, {
        batchId,
        status: 'completed',
        completedCount: batch.request_counts?.completed ?? 0,
        failedCount: batch.request_counts?.failed ?? 0,
      })
    } else if (batch.status === 'failed' || batch.status === 'cancelled' || batch.status === 'expired') {
      await ctx.runMutation(internal.generate.updateComposerBatchStatus, {
        batchId,
        status: 'failed',
        error: `Batch ${batch.status}`,
      })
    }
  },
})

// ============================================================================
// Painter Stage - Start painter batches
// ============================================================================

export const startPainterBatch = action({
  args: {
    cycle: v.number(),
    modelKeys: v.optional(v.array(v.string())),
  },
  returns: v.object({
    cycle: v.number(),
    painterBatches: v.array(v.object({
      modelKey: v.string(),
      status: v.string(),
      batchId: v.optional(v.string()),
    })),
  }),
  handler: async (ctx, { cycle, modelKeys }) => {
    const composerOutputs = await ctx.runQuery(api.generate.getComposerOutputs, { cycle })

    if (composerOutputs.length === 0) {
      throw new Error(`No composer outputs found for cycle ${cycle}`)
    }

    const modelsToRun = modelKeys && modelKeys.length > 0
      ? PAINTER_MODELS.filter((m) => modelKeys.includes(m.key))
      : PAINTER_MODELS

    console.log(`Starting painter batch for cycle ${cycle} with ${composerOutputs.length} matrices and ${modelsToRun.length} models`)

    type ComposerOutputRow = typeof composerOutputs[number]
    const matrices: PaletteMatrix[] = composerOutputs
      .filter((o: ComposerOutputRow) => !o.error && o.theme)
      .map((o: ComposerOutputRow) => ({
        theme: o.theme!,
        dimensions: o.dimensions as OutputDimensionKey[],
        steps: o.steps as StepSpec[],
      }))

    const painterBatches: Array<{ modelKey: string; status: string; batchId?: string }> = []

    for (const modelConfig of modelsToRun) {
      try {
        let result: { batchId: string; requestCount: number }

        switch (modelConfig.provider) {
          case 'anthropic':
            result = await ctx.runAction(internal.generateActions.submitAnthropicPainterBatch, {
              cycle,
              modelKey: modelConfig.key as PainterModelKey,
              matrices,
            })
            break
          case 'openai':
            result = await ctx.runAction(internal.generateActions.submitOpenAIPainterBatch, {
              cycle,
              modelKey: modelConfig.key as PainterModelKey,
              matrices,
            })
            break
          case 'groq':
            result = await ctx.runAction(internal.generateActions.submitGroqPainterBatch, {
              cycle,
              modelKey: modelConfig.key as PainterModelKey,
              matrices,
            })
            break
          case 'google':
            result = await ctx.runAction(internal.generateActions.submitGooglePainterBatch, {
              cycle,
              modelKey: modelConfig.key as PainterModelKey,
              matrices,
            })
            break
        }

        painterBatches.push({ modelKey: modelConfig.key, status: 'pending', batchId: result.batchId })
      } catch (error) {
        console.error(`[Painter:${modelConfig.key}] Batch submission failed:`, error)
        painterBatches.push({ modelKey: modelConfig.key, status: 'failed' })
      }
    }

    return { cycle, painterBatches }
  },
})

// ============================================================================
// Painter Batch Submission Stubs
// ============================================================================

const vPaletteMatrix = v.object({
  theme: v.string(),
  dimensions: v.array(v.string()),
  steps: v.array(v.any()),
})

export const submitAnthropicPainterBatch = internalAction({
  args: {
    cycle: v.number(),
    modelKey: vPainterModelKey,
    matrices: v.array(vPaletteMatrix),
  },
  handler: async (ctx, { cycle, modelKey, matrices }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

    const modelConfig = PAINTER_MODELS.find((m) => m.key === modelKey)
    if (!modelConfig) throw new Error(`Unknown model: ${modelKey}`)

    const anthropic = new Anthropic({ apiKey })

    const batchRequests = matrices.map((matrix, i) => {
      const prompt = buildSinglePainterPrompt(matrix as PaletteMatrix)
      // Include theme in custom_id for traceability (sanitize to remove special chars)
      const safeTheme = matrix.theme.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 50)
      return {
        custom_id: `${safeTheme}__${i}`,
        params: {
          model: modelConfig.id,
          max_tokens: 2048,
          system: prompt.system,
          messages: [{ role: 'user' as const, content: prompt.user }],
        },
      }
    })

    const batch = await anthropic.messages.batches.create({
      requests: batchRequests,
    })

    console.log(`Anthropic painter batch created: ${batch.id} with ${matrices.length} requests for model ${modelKey}`)

    const requestOrder = matrices.map(m => m.theme)

    await ctx.runMutation(internal.generate.createPainterBatch, {
      cycle,
      modelKey,
      provider: 'anthropic',
      batchId: batch.id,
      requestCount: matrices.length,
      requestOrder,
    })

    return { batchId: batch.id, requestCount: matrices.length }
  },
})

export const submitOpenAIPainterBatch = internalAction({
  args: {
    cycle: v.number(),
    modelKey: vPainterModelKey,
    matrices: v.array(vPaletteMatrix),
  },
  handler: async (ctx, { cycle, modelKey, matrices }) => {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY not set')

    const modelConfig = PAINTER_MODELS.find((m) => m.key === modelKey)
    if (!modelConfig) throw new Error(`Unknown model: ${modelKey}`)

    const openai = new OpenAI({ apiKey })

    const jsonlLines = matrices.map((matrix, i) => {
      const prompt = buildSinglePainterPrompt(matrix as PaletteMatrix)
      const safeTheme = matrix.theme.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 50)
      return JSON.stringify({
        custom_id: `${safeTheme}__${i}`,
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model: modelConfig.id,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'palette_colors',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  colors: {
                    type: 'array',
                    items: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
                    minItems: 5,
                    maxItems: 12,
                  },
                },
                required: ['colors'],
                additionalProperties: false,
              },
            },
          },
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user + '\n\nRespond with JSON: {"colors": ["#hex1", "#hex2", ...]}' },
          ],
        },
      })
    })

    const file = await openai.files.create({
      file: new File([jsonlLines.join('\n')], 'painter_batch.jsonl', {
        type: 'application/jsonl',
      }),
      purpose: 'batch',
    })

    const batch = await openai.batches.create({
      input_file_id: file.id,
      endpoint: '/v1/chat/completions',
      completion_window: '24h',
    })

    console.log(`OpenAI painter batch created: ${batch.id} with ${matrices.length} requests for model ${modelKey}`)

    const requestOrder = matrices.map(m => m.theme)

    await ctx.runMutation(internal.generate.createPainterBatch, {
      cycle,
      modelKey,
      provider: 'openai',
      batchId: batch.id,
      requestCount: matrices.length,
      requestOrder,
    })

    return { batchId: batch.id, requestCount: matrices.length }
  },
})

export const submitGroqPainterBatch = internalAction({
  args: {
    cycle: v.number(),
    modelKey: vPainterModelKey,
    matrices: v.array(vPaletteMatrix),
  },
  handler: async (ctx, { cycle, modelKey, matrices }) => {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new Error('GROQ_API_KEY not set')

    const modelConfig = PAINTER_MODELS.find((m) => m.key === modelKey)
    if (!modelConfig) throw new Error(`Unknown model: ${modelKey}`)

    const groq = new Groq({ apiKey })

    const jsonlLines = matrices.map((matrix, i) => {
      const prompt = buildSinglePainterPrompt(matrix as PaletteMatrix)
      const safeTheme = matrix.theme.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 50)
      return JSON.stringify({
        custom_id: `${safeTheme}__${i}`,
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model: modelConfig.id,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
        },
      })
    })

    const file = await groq.files.create({
      file: new File([jsonlLines.join('\n')], 'painter_batch.jsonl', {
        type: 'application/jsonl',
      }),
      purpose: 'batch',
    })

    if (!file.id) {
      throw new Error('Failed to upload Groq painter batch file - no id returned')
    }

    const batch = await groq.batches.create({
      input_file_id: file.id,
      endpoint: '/v1/chat/completions',
      completion_window: '24h',
    })

    if (!batch.id) {
      throw new Error('Failed to create Groq painter batch - no id returned')
    }

    console.log(`Groq painter batch created: ${batch.id} with ${matrices.length} requests for model ${modelKey}`)

    // Store the themes in order so we can map results back
    const requestOrder = matrices.map(m => m.theme)

    await ctx.runMutation(internal.generate.createPainterBatch, {
      cycle,
      modelKey,
      provider: 'groq',
      batchId: batch.id,
      requestCount: matrices.length,
      requestOrder,
    })

    return { batchId: batch.id, requestCount: matrices.length }
  },
})

export const submitGooglePainterBatch = internalAction({
  args: {
    cycle: v.number(),
    modelKey: vPainterModelKey,
    matrices: v.array(vPaletteMatrix),
  },
  handler: async (ctx, { cycle, modelKey, matrices }) => {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not set')

    const modelConfig = PAINTER_MODELS.find((m) => m.key === modelKey)
    if (!modelConfig) throw new Error(`Unknown model: ${modelKey}`)

    const { GoogleGenAI } = await import('@google/genai')
    const ai = new GoogleGenAI({ apiKey })

    const inlinedRequests = matrices.map((matrix, i) => {
      const prompt = buildSinglePainterPrompt(matrix as PaletteMatrix)
      const safeTheme = matrix.theme.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 50)
      return {
        metadata: { key: `${safeTheme}__${i}` },
        contents: [
          {
            role: 'user' as const,
            parts: [{ text: prompt.user }],
          },
        ],
        config: {
          systemInstruction: { parts: [{ text: prompt.system }] },
          temperature: 0.7,
          responseMimeType: 'application/json',
          maxOutputTokens: 2048,
        },
      }
    })

    const batchJob = await ai.batches.create({
      model: modelConfig.id,
      src: inlinedRequests,
      config: {
        displayName: `grabient-painter-cycle-${cycle}-${modelKey}`,
      },
    })

    if (!batchJob.name) {
      throw new Error('Failed to create Google painter batch - no name returned')
    }

    console.log(`Google painter batch created: ${batchJob.name} with ${matrices.length} requests for model ${modelKey}`)

    const requestOrder = matrices.map(m => m.theme)

    await ctx.runMutation(internal.generate.createPainterBatch, {
      cycle,
      modelKey,
      provider: 'google',
      batchId: batchJob.name,
      requestCount: matrices.length,
      requestOrder,
    })

    return { batchId: batchJob.name, requestCount: matrices.length }
  },
})

// ============================================================================
// Painter Polling Stubs
// ============================================================================

export const pollAnthropicPainterBatch = internalAction({
  args: { batchId: v.string(), cycle: v.number(), modelKey: vPainterModelKey },
  handler: async (ctx, { batchId, cycle, modelKey }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

    const anthropic = new Anthropic({ apiKey })
    const batch = await anthropic.messages.batches.retrieve(batchId)

    console.log(`Anthropic painter batch ${batchId} (${modelKey}):`, {
      status: batch.processing_status,
      succeeded: batch.request_counts.succeeded,
      failed: batch.request_counts.errored,
    })

    if (batch.processing_status === 'in_progress') {
      await ctx.runMutation(internal.generate.updatePainterBatchStatus, {
        cycle,
        modelKey,
        status: 'processing',
        completedCount: batch.request_counts.succeeded,
        failedCount: batch.request_counts.errored,
      })
      return
    }

    if (batch.processing_status === 'ended') {
      // Get the painter batch record for requestOrder
      const batchRecord = await ctx.runQuery(internal.generate.getPainterBatchByBatchId, { batchId })
      const requestOrder = batchRecord?.requestOrder ?? []

      let storedCount = 0
      let errorCount = 0
      const palettesToStore: Array<{
        cycle: number
        tag: string
        theme: string
        paletteIndex: number
        modelKey: PainterModelKey
        seed: string
        style: 'linearGradient' | 'linearSwatches' | 'angularGradient' | 'angularSwatches' | 'deepFlow'
        steps: number
        angle: 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315
        colors: string[]
      }> = []

      const resultsDecoder = await anthropic.messages.batches.results(batchId)
      for await (const result of resultsDecoder) {
        const parts = result.custom_id.split('__')
        const index = parseInt(parts[parts.length - 1] ?? '0', 10)
        const theme = requestOrder[index] ?? result.custom_id.replace(/__\d+$/, '').replace(/_/g, ' ')

        if (result.result.type === 'succeeded') {
          const textBlock = result.result.message.content.find((block): block is Anthropic.TextBlock => block.type === 'text')
          if (!textBlock) {
            errorCount++
            continue
          }

          try {
            const cleaned = cleanLLMOutput(textBlock.text)
            const colors = JSON.parse(cleaned) as string[]

            if (Array.isArray(colors) && colors.length > 0 && colors.every(c => typeof c === 'string' && c.startsWith('#'))) {
              palettesToStore.push({
                cycle,
                tag: theme,
                theme,
                paletteIndex: index,
                modelKey,
                seed: processColorsToSeed(colors),
                style: 'linearGradient',
                steps: colors.length,
                angle: 0,
                colors,
              })
              storedCount++
            } else {
              errorCount++
            }
          } catch {
            errorCount++
          }
        } else {
          errorCount++
        }
      }

      // Store all palettes in batches
      if (palettesToStore.length > 0) {
        for (let i = 0; i < palettesToStore.length; i += 100) {
          const chunk = palettesToStore.slice(i, i + 100)
          await ctx.runMutation(internal.generate.storeGeneratedPalettes, { palettes: chunk })
        }
      }

      console.log(`Anthropic painter batch ${batchId} processed: ${storedCount} palettes stored, ${errorCount} errors`)

      await ctx.runMutation(internal.generate.updatePainterBatchStatus, {
        cycle,
        modelKey,
        status: 'completed',
        completedCount: batch.request_counts.succeeded,
        failedCount: batch.request_counts.errored,
      })
    }
  },
})

export const pollOpenAIPainterBatch = internalAction({
  args: { batchId: v.string(), cycle: v.number(), modelKey: vPainterModelKey },
  handler: async (ctx, { batchId, cycle, modelKey }) => {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY not set')

    const openai = new OpenAI({ apiKey })
    const batch = await openai.batches.retrieve(batchId)

    console.log(`OpenAI painter batch ${batchId} (${modelKey}):`, {
      status: batch.status,
      completed: batch.request_counts?.completed,
      failed: batch.request_counts?.failed,
    })

    if (batch.status === 'in_progress' || batch.status === 'validating' || batch.status === 'finalizing') {
      await ctx.runMutation(internal.generate.updatePainterBatchStatus, {
        cycle,
        modelKey,
        status: 'processing',
        completedCount: batch.request_counts?.completed ?? 0,
        failedCount: batch.request_counts?.failed ?? 0,
      })
      return
    }

    if (batch.status === 'completed') {
      // Get the painter batch record for requestOrder
      const batchRecord = await ctx.runQuery(internal.generate.getPainterBatchByBatchId, { batchId })
      const requestOrder = batchRecord?.requestOrder ?? []

      if (!batch.output_file_id) {
        console.error(`No output file for OpenAI painter batch ${batchId}`)
        await ctx.runMutation(internal.generate.updatePainterBatchStatus, {
          cycle,
          modelKey,
          status: 'failed',
          error: 'No output file',
        })
        return
      }

      const fileResponse = await openai.files.content(batch.output_file_id)
      const fileContent = await fileResponse.text()
      const lines = fileContent.trim().split('\n')

      let storedCount = 0
      let errorCount = 0
      const palettesToStore: Array<{
        cycle: number
        tag: string
        theme: string
        paletteIndex: number
        modelKey: PainterModelKey
        seed: string
        style: 'linearGradient' | 'linearSwatches' | 'angularGradient' | 'angularSwatches' | 'deepFlow'
        steps: number
        angle: 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315
        colors: string[]
      }> = []

      for (const line of lines) {
        try {
          const result = JSON.parse(line) as {
            custom_id: string
            response?: {
              status_code: number
              body: {
                choices: Array<{
                  message: {
                    content: string
                  }
                }>
              }
            }
            error?: { message: string }
          }

          const parts = result.custom_id.split('__')
          const index = parseInt(parts[parts.length - 1] ?? '0', 10)
          const theme = requestOrder[index] ?? result.custom_id.replace(/__\d+$/, '').replace(/_/g, ' ')

          if (result.response?.status_code === 200) {
            const contentStr = result.response.body.choices[0]?.message?.content
            if (!contentStr) {
              errorCount++
              continue
            }

            try {
              const cleaned = cleanLLMOutput(contentStr)
              const parsed = JSON.parse(cleaned) as string[] | { colors: string[] }
              // Handle both structured output {colors: [...]} and raw array [...]
              const colors = Array.isArray(parsed) ? parsed : parsed.colors

              if (Array.isArray(colors) && colors.length > 0 && colors.every(c => typeof c === 'string' && c.startsWith('#'))) {
                palettesToStore.push({
                  cycle,
                  tag: theme,
                  theme,
                  paletteIndex: index,
                  modelKey,
                  seed: processColorsToSeed(colors),
                  style: 'linearGradient',
                  steps: colors.length,
                  angle: 0,
                  colors,
                })
                storedCount++
              } else {
                errorCount++
              }
            } catch {
              errorCount++
            }
          } else {
            errorCount++
          }
        } catch {
          errorCount++
        }
      }

      // Store all palettes in batches
      if (palettesToStore.length > 0) {
        for (let i = 0; i < palettesToStore.length; i += 100) {
          const chunk = palettesToStore.slice(i, i + 100)
          await ctx.runMutation(internal.generate.storeGeneratedPalettes, { palettes: chunk })
        }
      }

      console.log(`OpenAI painter batch ${batchId} processed: ${storedCount} palettes stored, ${errorCount} errors`)

      await ctx.runMutation(internal.generate.updatePainterBatchStatus, {
        cycle,
        modelKey,
        status: 'completed',
        completedCount: batch.request_counts?.completed ?? 0,
        failedCount: batch.request_counts?.failed ?? 0,
      })
    } else if (batch.status === 'failed' || batch.status === 'cancelled' || batch.status === 'expired') {
      await ctx.runMutation(internal.generate.updatePainterBatchStatus, {
        cycle,
        modelKey,
        status: 'failed',
        error: `Batch ${batch.status}`,
      })
    }
  },
})

export const pollGroqPainterBatch = internalAction({
  args: { batchId: v.string(), cycle: v.number(), modelKey: vPainterModelKey },
  handler: async (ctx, { batchId, cycle, modelKey }) => {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new Error('GROQ_API_KEY not set')

    const groq = new Groq({ apiKey })
    const batch = await groq.batches.retrieve(batchId)

    console.log(`Groq painter batch ${batchId} (${modelKey}):`, {
      status: batch.status,
      completed: batch.request_counts?.completed,
      failed: batch.request_counts?.failed,
    })

    if (batch.status === 'in_progress' || batch.status === 'validating' || batch.status === 'finalizing') {
      await ctx.runMutation(internal.generate.updatePainterBatchStatus, {
        cycle,
        modelKey,
        status: 'processing',
        completedCount: batch.request_counts?.completed ?? 0,
        failedCount: batch.request_counts?.failed ?? 0,
      })
      return
    }

    if (batch.status === 'completed') {
      // Get the painter batch record for requestOrder
      const batchRecord = await ctx.runQuery(internal.generate.getPainterBatchByBatchId, { batchId })
      const requestOrder = batchRecord?.requestOrder ?? []

      // Download the output file
      if (!batch.output_file_id) {
        console.error(`No output file for Groq painter batch ${batchId}`)
        await ctx.runMutation(internal.generate.updatePainterBatchStatus, {
          cycle,
          modelKey,
          status: 'failed',
          error: 'No output file',
        })
        return
      }

      const fileContent = await groq.files.content(batch.output_file_id)
      const text = await fileContent.text()
      const lines = text.trim().split('\n')

      let storedCount = 0
      let errorCount = 0
      const palettesToStore: Array<{
        cycle: number
        tag: string
        theme: string
        paletteIndex: number
        modelKey: PainterModelKey
        seed: string
        style: 'linearGradient' | 'linearSwatches' | 'angularGradient' | 'angularSwatches' | 'deepFlow'
        steps: number
        angle: 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315
        colors: string[]
      }> = []

      for (const line of lines) {
        try {
          const result = JSON.parse(line) as {
            custom_id: string
            response?: {
              status_code: number
              body: {
                choices: Array<{
                  message: {
                    content: string
                  }
                }>
              }
            }
            error?: { message: string }
          }

          // Parse custom_id format: "safeTheme__index"
          const parts = result.custom_id.split('__')
          const index = parseInt(parts[parts.length - 1] ?? '0', 10)
          const theme = requestOrder[index] ?? result.custom_id.replace(/__\d+$/, '').replace(/_/g, ' ')

          if (result.response?.status_code === 200) {
            const contentStr = result.response.body.choices[0]?.message?.content
            if (!contentStr) {
              errorCount++
              continue
            }

            try {
              // Parse the JSON array of hex colors (strip thinking tags and markdown)
              const cleaned = cleanLLMOutput(contentStr)
              const parsed = JSON.parse(cleaned) as string[] | { colors: string[] }
              // Handle both structured output {colors: [...]} and raw array [...]
              const colors = Array.isArray(parsed) ? parsed : parsed.colors

              if (Array.isArray(colors) && colors.length > 0 && colors.every(c => typeof c === 'string' && c.startsWith('#'))) {
                palettesToStore.push({
                  cycle,
                  tag: theme, // Use theme as tag
                  theme,
                  paletteIndex: index,
                  modelKey,
                  seed: processColorsToSeed(colors),
                  style: 'linearGradient',
                  steps: colors.length,
                  angle: 0,
                  colors,
                })
                storedCount++
              } else {
                console.warn(`Invalid colors format for ${result.custom_id}:`, colors)
                errorCount++
              }
            } catch (parseErr) {
              console.error(`Failed to parse colors for ${result.custom_id}:`, parseErr)
              errorCount++
            }
          } else {
            errorCount++
          }
        } catch (e) {
          console.error(`Failed to parse Groq painter result line:`, e)
          errorCount++
        }
      }

      // Store all palettes in batches
      if (palettesToStore.length > 0) {
        // Store in chunks of 100
        for (let i = 0; i < palettesToStore.length; i += 100) {
          const chunk = palettesToStore.slice(i, i + 100)
          await ctx.runMutation(internal.generate.storeGeneratedPalettes, { palettes: chunk })
        }
      }

      console.log(`Groq painter batch ${batchId} processed: ${storedCount} palettes stored, ${errorCount} errors`)

      await ctx.runMutation(internal.generate.updatePainterBatchStatus, {
        cycle,
        modelKey,
        status: 'completed',
        completedCount: batch.request_counts?.completed ?? 0,
        failedCount: batch.request_counts?.failed ?? 0,
      })
    } else if (batch.status === 'failed' || batch.status === 'cancelled' || batch.status === 'expired') {
      await ctx.runMutation(internal.generate.updatePainterBatchStatus, {
        cycle,
        modelKey,
        status: 'failed',
        error: `Batch ${batch.status}`,
      })
    }
  },
})

export const pollGooglePainterBatch = internalAction({
  args: { batchId: v.string(), cycle: v.number(), modelKey: vPainterModelKey },
  handler: async (ctx, { batchId, cycle, modelKey }) => {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not set')

    const { GoogleGenAI } = await import('@google/genai')
    const ai = new GoogleGenAI({ apiKey })
    const batch = await ai.batches.get({ name: batchId })

    const stats = batch.completionStats
    console.log(`Google painter batch ${batchId} (${modelKey}):`, {
      state: batch.state,
      successfulCount: stats?.successfulCount,
      failedCount: stats?.failedCount,
    })

    if (batch.state === 'JOB_STATE_PENDING' || batch.state === 'JOB_STATE_RUNNING') {
      const completedCount = parseInt(stats?.successfulCount ?? '0', 10)
      const failedCount = parseInt(stats?.failedCount ?? '0', 10)

      await ctx.runMutation(internal.generate.updatePainterBatchStatus, {
        cycle,
        modelKey,
        status: 'processing',
        completedCount,
        failedCount,
      })
      return
    }

    if (batch.state === 'JOB_STATE_SUCCEEDED') {
      // Get the painter batch record for requestOrder
      const batchRecord = await ctx.runQuery(internal.generate.getPainterBatchByBatchId, { batchId })
      const requestOrder = batchRecord?.requestOrder ?? []

      // Get inline responses
      const inlinedResponses = batch.dest?.inlinedResponses ?? []

      let storedCount = 0
      let errorCount = 0
      const palettesToStore: Array<{
        cycle: number
        tag: string
        theme: string
        paletteIndex: number
        modelKey: PainterModelKey
        seed: string
        style: 'linearGradient' | 'linearSwatches' | 'angularGradient' | 'angularSwatches' | 'deepFlow'
        steps: number
        angle: 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315
        colors: string[]
      }> = []

      for (let index = 0; index < inlinedResponses.length; index++) {
        const result = inlinedResponses[index]
        const theme = requestOrder[index] ?? `theme-${index}`

        if (result.error) {
          errorCount++
          continue
        }

        const contentStr = result.response?.candidates?.[0]?.content?.parts?.[0]?.text
        if (!contentStr) {
          errorCount++
          continue
        }

        try {
          const cleaned = cleanLLMOutput(contentStr)
          const colors = JSON.parse(cleaned) as string[]

          if (Array.isArray(colors) && colors.length > 0 && colors.every(c => typeof c === 'string' && c.startsWith('#'))) {
            palettesToStore.push({
              cycle,
              tag: theme,
              theme,
              paletteIndex: index,
              modelKey,
              seed: processColorsToSeed(colors),
              style: 'linearGradient',
              steps: colors.length,
              angle: 0,
              colors,
            })
            storedCount++
          } else {
            errorCount++
          }
        } catch {
          errorCount++
        }
      }

      // Store all palettes in batches
      if (palettesToStore.length > 0) {
        for (let i = 0; i < palettesToStore.length; i += 100) {
          const chunk = palettesToStore.slice(i, i + 100)
          await ctx.runMutation(internal.generate.storeGeneratedPalettes, { palettes: chunk })
        }
      }

      console.log(`Google painter batch ${batchId} processed: ${storedCount} palettes stored, ${errorCount} errors`)

      await ctx.runMutation(internal.generate.updatePainterBatchStatus, {
        cycle,
        modelKey,
        status: 'completed',
        completedCount: parseInt(stats?.successfulCount ?? '0', 10),
        failedCount: parseInt(stats?.failedCount ?? '0', 10),
      })
    } else if (batch.state === 'JOB_STATE_FAILED' || batch.state === 'JOB_STATE_CANCELLED') {
      await ctx.runMutation(internal.generate.updatePainterBatchStatus, {
        cycle,
        modelKey,
        status: 'failed',
        error: `Batch ${batch.state}`,
      })
    }
  },
})

// ============================================================================
// Cancel Actions
// ============================================================================

export const cancelComposerBatch = action({
  args: {
    batchId: v.string(),
    provider: v.union(v.literal('anthropic'), v.literal('openai'), v.literal('groq'), v.literal('google')),
  },
  returns: v.object({ success: v.boolean(), actualStatus: v.optional(v.string()) }),
  handler: async (ctx, { batchId, provider }): Promise<{ success: boolean; actualStatus?: string }> => {
    try {
      switch (provider) {
        case 'anthropic': {
          const apiKey = process.env.ANTHROPIC_API_KEY
          if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')
          const anthropic = new Anthropic({ apiKey })
          await anthropic.messages.batches.cancel(batchId)
          break
        }
        case 'openai': {
          const apiKey = process.env.OPENAI_API_KEY
          if (!apiKey) throw new Error('OPENAI_API_KEY not set')
          const openai = new OpenAI({ apiKey })
          await openai.batches.cancel(batchId)
          break
        }
        case 'groq': {
          const apiKey = process.env.GROQ_API_KEY
          if (!apiKey) throw new Error('GROQ_API_KEY not set')
          const groq = new Groq({ apiKey })
          await groq.batches.cancel(batchId)
          break
        }
        case 'google': {
          const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
          if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not set')
          const { GoogleGenAI } = await import('@google/genai')
          const ai = new GoogleGenAI({ apiKey })
          await ai.batches.cancel({ name: batchId })
          break
        }
      }

      await ctx.runMutation(internal.generate.updateComposerBatchStatus, {
        batchId,
        status: 'failed',
        error: 'Cancelled by user',
      })

      return { success: true }
    } catch (e) {
      console.error(`Failed to cancel composer batch ${batchId}:`, e)
      return { success: false, actualStatus: String(e) }
    }
  },
})

export const cancelPainterBatch = action({
  args: {
    batchId: v.string(),
    modelKey: vPainterModelKey,
    provider: v.union(v.literal('anthropic'), v.literal('openai'), v.literal('groq'), v.literal('google')),
  },
  returns: v.object({ success: v.boolean(), actualStatus: v.optional(v.string()) }),
  handler: async (ctx, { batchId, modelKey, provider }): Promise<{ success: boolean; actualStatus?: string }> => {
    try {
      switch (provider) {
        case 'anthropic': {
          const apiKey = process.env.ANTHROPIC_API_KEY
          if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')
          const anthropic = new Anthropic({ apiKey })
          await anthropic.messages.batches.cancel(batchId)
          break
        }
        case 'openai': {
          const apiKey = process.env.OPENAI_API_KEY
          if (!apiKey) throw new Error('OPENAI_API_KEY not set')
          const openai = new OpenAI({ apiKey })
          await openai.batches.cancel(batchId)
          break
        }
        case 'groq': {
          const apiKey = process.env.GROQ_API_KEY
          if (!apiKey) throw new Error('GROQ_API_KEY not set')
          const groq = new Groq({ apiKey })
          await groq.batches.cancel(batchId)
          break
        }
        case 'google': {
          const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
          if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not set')
          const { GoogleGenAI } = await import('@google/genai')
          const ai = new GoogleGenAI({ apiKey })
          await ai.batches.cancel({ name: batchId })
          break
        }
      }

      // Get cycle from batch record to update status
      const batch = await ctx.runQuery(internal.generate.getPainterBatchByBatchId, { batchId })
      if (batch) {
        await ctx.runMutation(internal.generate.updatePainterBatchStatus, {
          cycle: batch.cycle,
          modelKey,
          status: 'failed',
          error: 'Cancelled by user',
        })
      }

      return { success: true }
    } catch (e) {
      console.error(`Failed to cancel painter batch ${batchId}:`, e)
      return { success: false, actualStatus: String(e) }
    }
  },
})

// ============================================================================
// Palette Deduplication
// ============================================================================

/**
 * Create a similarity key by rounding cosine coefficients to 2 decimal precision.
 * This allows detecting near-duplicate palettes.
 */
function createSimilarityKey(seed: string): string | null {
  try {
    const { coeffs, globals } = deserializeCoeffs(seed)

    // Round each coefficient to 2 decimal places
    const roundedParts: string[] = []
    for (const vec of coeffs) {
      roundedParts.push(
        vec[0].toFixed(2),
        vec[1].toFixed(2),
        vec[2].toFixed(2)
      )
    }
    // Include rounded globals in the key
    for (const g of globals) {
      roundedParts.push(g.toFixed(2))
    }

    return roundedParts.join('|')
  } catch {
    return null
  }
}

/**
 * Get all palettes deduplicated using 2-decimal precision similarity keys.
 * Uses pagination to avoid query timeouts.
 */
export const getDeduplicatedPalettes = action({
  args: {},
  handler: async (ctx): Promise<{
    palettes: Array<{
      _id: string
      cycle: number
      tag: string
      theme?: string
      seed?: string
      colors: string[]
      modelKey?: string
      variationIndex?: number
      paletteIndex?: number
      similarityKey: string
    }>
    stats: {
      totalProcessed: number
      withoutSeed: number
      duplicates: number
      unique: number
      cycles: number
    }
  }> => {
    const seenKeys = new Set<string>()
    const seenCycles = new Set<number>()
    const deduplicated: Array<{
      _id: string
      cycle: number
      tag: string
      theme?: string
      seed?: string
      colors: string[]
      modelKey?: string
      variationIndex?: number
      paletteIndex?: number
      similarityKey: string
    }> = []

    let totalProcessed = 0
    let withoutSeed = 0
    let duplicates = 0

    // Use pagination to load all palettes
    let cursor: string | null = null
    let isDone = false

    while (!isDone) {
      const result: {
        palettes: Array<{
          _id: string
          cycle: number
          tag: string
          theme?: string
          seed?: string
          colors: string[]
          modelKey?: string
          variationIndex?: number
          paletteIndex?: number
        }>
        nextCursor: string
        isDone: boolean
      } = await ctx.runQuery(api.generate.getPaginatedGeneratedPalettes, {
        cursor,
        limit: 2000,
      })

      for (const palette of result.palettes) {
        totalProcessed++
        seenCycles.add(palette.cycle)

        if (!palette.seed) {
          withoutSeed++
          continue
        }

        const key = createSimilarityKey(palette.seed)
        if (!key) {
          withoutSeed++
          continue
        }

        if (seenKeys.has(key)) {
          duplicates++
          continue
        }

        seenKeys.add(key)
        deduplicated.push({
          _id: palette._id,
          cycle: palette.cycle,
          tag: palette.tag,
          theme: palette.theme,
          seed: palette.seed,
          colors: palette.colors,
          modelKey: palette.modelKey,
          variationIndex: palette.variationIndex,
          paletteIndex: palette.paletteIndex,
          similarityKey: key,
        })
      }

      cursor = result.nextCursor
      isDone = result.isDone
    }

    return {
      palettes: deduplicated,
      stats: {
        totalProcessed,
        withoutSeed,
        duplicates,
        unique: deduplicated.length,
        cycles: seenCycles.size,
      },
    }
  },
})
