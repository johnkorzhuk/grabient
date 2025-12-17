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
import { deserializeCoeffs, isValidSeed } from '@repo/data-ops/serialization'
import {
  cosineGradient,
  rgbToHex,
  applyGlobals,
} from '@repo/data-ops/gradient-gen'

const EMBEDDING_MODEL = '@cf/google/embeddinggemma-300m'
const VECTORIZE_INDEX = 'grabient-palettes'
const VECTOR_SEARCH_LIMIT = 24

// Default model for tag selection - uses thinking for better reasoning
const TAG_SELECTION_MODEL = 'gemini-2.5-pro'

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
async function buildComposerRequests(
  tags: string[],
  variationsPerTag: number,
  palettesPerVariation: number,
): Promise<{ tag: string; systemPrompt: string; userPrompt: string }[]> {
  const requests: { tag: string; systemPrompt: string; userPrompt: string }[] = []

  for (const tag of tags) {
    const examples = await searchVectorizeForExamples(tag)
    const systemPrompt = buildComposerSystemPrompt({
      query: tag,
      variationCount: variationsPerTag,
      palettesPerVariation,
      stepsRange: [5, 8],
      examplePalettes: examples,
    })
    requests.push({
      tag,
      systemPrompt,
      userPrompt: `Generate dimension matrices for: "${tag}"`,
    })
  }

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
      custom_id: req.tag,
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

    console.log(`Anthropic composer batch created: ${batch.id} (cycle ${cycle})`)

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
        custom_id: req.tag,
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

    console.log(`OpenAI composer batch created: ${batch.id} (cycle ${cycle})`)

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
        custom_id: req.tag,
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

    console.log(`Groq composer batch created: ${batch.id} (cycle ${cycle})`)

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
      metadata: { key: req.tag },
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

    console.log(`Google composer batch created: ${batchJob.name} (cycle ${cycle})`)

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
      // TODO: Process results and store composer outputs
      // For now, mark as completed

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
    } else if (batch.processing_status === 'ended') {
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
    } else if (batch.status === 'completed') {
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
    } else if (batch.status === 'completed') {
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
      return {
        custom_id: `matrix-${i}`,
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

    await ctx.runMutation(internal.generate.createPainterBatch, {
      cycle,
      modelKey,
      provider: 'anthropic',
      batchId: batch.id,
      requestCount: matrices.length,
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
      return JSON.stringify({
        custom_id: `matrix-${i}`,
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model: modelConfig.id,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
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

    await ctx.runMutation(internal.generate.createPainterBatch, {
      cycle,
      modelKey,
      provider: 'openai',
      batchId: batch.id,
      requestCount: matrices.length,
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
      return JSON.stringify({
        custom_id: `matrix-${i}`,
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

    await ctx.runMutation(internal.generate.createPainterBatch, {
      cycle,
      modelKey,
      provider: 'groq',
      batchId: batch.id,
      requestCount: matrices.length,
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
      return {
        metadata: { key: `matrix-${i}` },
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

    await ctx.runMutation(internal.generate.createPainterBatch, {
      cycle,
      modelKey,
      provider: 'google',
      batchId: batchJob.name,
      requestCount: matrices.length,
    })

    return { batchId: batchJob.name, requestCount: matrices.length }
  },
})

// ============================================================================
// Painter Polling Stubs
// ============================================================================

export const pollAnthropicPainterBatch = internalAction({
  args: { batchId: v.string(), cycle: v.number(), modelKey: vPainterModelKey },
  handler: async (_ctx, { batchId, cycle: _cycle, modelKey: _modelKey }) => {
    // TODO: Implement full polling logic
    console.log(`Polling Anthropic painter batch ${batchId}`)
  },
})

export const pollOpenAIPainterBatch = internalAction({
  args: { batchId: v.string(), cycle: v.number(), modelKey: vPainterModelKey },
  handler: async (_ctx, { batchId, cycle: _cycle, modelKey: _modelKey }) => {
    // TODO: Implement full polling logic
    console.log(`Polling OpenAI painter batch ${batchId}`)
  },
})

export const pollGroqPainterBatch = internalAction({
  args: { batchId: v.string(), cycle: v.number(), modelKey: vPainterModelKey },
  handler: async (_ctx, { batchId, cycle: _cycle, modelKey: _modelKey }) => {
    // TODO: Implement full polling logic
    console.log(`Polling Groq painter batch ${batchId}`)
  },
})

export const pollGooglePainterBatch = internalAction({
  args: { batchId: v.string(), cycle: v.number(), modelKey: vPainterModelKey },
  handler: async (_ctx, { batchId, cycle: _cycle, modelKey: _modelKey }) => {
    // TODO: Implement full polling logic
    console.log(`Polling Google painter batch ${batchId}`)
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
