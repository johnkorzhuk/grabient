'use node'

import { action, internalAction } from './_generated/server'
import { internal, api } from './_generated/api'
import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import Groq from 'groq-sdk'
import { GoogleGenAI } from '@google/genai'
import { generateColorDataFromSeed, type ColorData } from './lib/colorData'
import { TAGGING_SYSTEM_PROMPT, CURRENT_PROMPT_VERSION } from './lib/prompts'
import { tagResponseSchema, normalizeTagResponse } from './lib/providers'
import {
  PROVIDERS,
  PROVIDER_MODELS,
  vProvider,
  vModel,
  type Provider,
  type Model,
} from './lib/providers.types'

// ============================================================================
// Batch Request Builders
// ============================================================================

interface BatchRequest {
  customId: string // Format: paletteId_analysisIndex (Convex _id is 32 chars, fits in 64 char limit)
  seed: string
  paletteId: string
  analysisIndex: number
  colorData: ColorData
}

// Anthropic requires custom_id to match ^[a-zA-Z0-9_-]{1,64}
// Per docs: "Batch results can be returned in any order... always use the custom_id field"
// We use Convex palette _id + analysisIndex as custom_id for direct lookup on poll

function buildBatchRequests(
  palettesForCycle: Array<{ _id: string; seed: string; newIndices: number[] }>,
): BatchRequest[] {
  const requests: BatchRequest[] = []

  for (const { _id, seed, newIndices } of palettesForCycle) {
    const colorData = generateColorDataFromSeed(seed)

    for (const analysisIndex of newIndices) {
      requests.push({
        customId: `${_id}_${analysisIndex}`, // e.g., "jd7czbkfa6bxn3sg42hcpqs1ph7wran2_0"
        seed,
        paletteId: _id,
        analysisIndex,
        colorData,
      })
    }
  }

  return requests
}

/**
 * Parse compound custom_id format: "{paletteId}_{analysisIndex}"
 * Provider batch APIs use custom_id to correlate requests with responses.
 * We use the palette's Convex ID (32 chars) combined with the analysis index.
 */
function parseCustomId(customId: string): { paletteId: Id<'palettes'>; analysisIndex: number } {
  const lastUnderscore = customId.lastIndexOf('_')
  return {
    paletteId: customId.substring(0, lastUnderscore) as Id<'palettes'>,
    analysisIndex: parseInt(customId.substring(lastUnderscore + 1), 10),
  }
}

// ============================================================================
// Anthropic Batch API
// ============================================================================

export const submitAnthropicBatch = internalAction({
  args: { model: vModel, cycle: v.number(), analysisCount: v.number() },
  handler: async (ctx, { model, cycle, analysisCount }): Promise<{ batchId: string; requestCount: number } | null> => {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

    // Get palettes for this cycle
    const palettesForCycle = await ctx.runQuery(api.backfill.getPalettesForNewCycle, {
      provider: 'anthropic',
      model,
      analysisCount,
    })

    if (palettesForCycle.length === 0) {
      console.log(`No palettes for cycle ${cycle} anthropic:${model}`)
      return null
    }

    const requests = buildBatchRequests(palettesForCycle)
    console.log(`Submitting ${requests.length} requests to Anthropic batch API (cycle ${cycle})`)

    const anthropic = new Anthropic({ apiKey })

    // Build batch requests
    const batchRequests: Anthropic.Messages.BatchCreateParams.Request[] = requests.map((req) => ({
      custom_id: req.customId,
      params: {
        model,
        max_tokens: 1024,
        temperature: 0.7,
        system: TAGGING_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: JSON.stringify(req.colorData),
          },
        ],
      },
    }))

    // Submit batch
    const batch = await anthropic.messages.batches.create({
      requests: batchRequests,
    })

    // Record batch in database
    await ctx.runMutation(internal.backfill.createBatch, {
      cycle,
      provider: 'anthropic',
      model,
      batchId: batch.id,
      analysisCount,
      requestCount: requests.length,
    })

    console.log(`Created Anthropic batch: ${batch.id} (cycle ${cycle})`)
    return { batchId: batch.id, requestCount: requests.length }
  },
})

export const cancelAnthropicBatch = internalAction({
  args: { batchId: v.string(), model: v.optional(vModel) },
  returns: v.object({ success: v.boolean(), actualStatus: v.optional(v.string()) }),
  handler: async (ctx, { batchId, model }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

    const anthropic = new Anthropic({ apiKey })

    try {
      await anthropic.messages.batches.cancel(batchId)
      await ctx.runMutation(internal.backfill.updateBatchStatus, {
        batchId,
        status: 'failed',
        error: 'Cancelled by user',
      })
      return { success: true }
    } catch (e) {
      // If batch is already ended, process it properly
      if (e instanceof Error && (e.message.includes('409') || e.message.includes('ended'))) {
        const batch = await anthropic.messages.batches.retrieve(batchId)
        if (batch.processing_status === 'ended' && model) {
          // Batch completed - poll to process results
          await ctx.runAction(internal.backfillActions.pollAnthropicBatch, { batchId, model })
          return { success: true, actualStatus: 'completed' }
        } else {
          await ctx.runMutation(internal.backfill.updateBatchStatus, {
            batchId,
            status: 'failed',
            error: `Batch ${batch.processing_status}`,
          })
          return { success: true, actualStatus: batch.processing_status }
        }
      } else {
        throw e
      }
    }
  },
})

export const pollAnthropicBatch = internalAction({
  args: { batchId: v.string(), model: vModel },
  handler: async (ctx, { batchId, model }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

    const anthropic = new Anthropic({ apiKey })
    const batch = await anthropic.messages.batches.retrieve(batchId)

    console.log(`Anthropic batch ${batchId} status: ${batch.processing_status}`)

    if (batch.processing_status === 'in_progress') {
      await ctx.runMutation(internal.backfill.updateBatchStatus, {
        batchId,
        status: 'processing',
        completedCount: batch.request_counts.succeeded,
        failedCount: batch.request_counts.errored + batch.request_counts.expired,
      })
      return { status: 'processing' as const }
    }

    if (batch.processing_status === 'ended') {
      // Fetch results
      let successCount = 0
      let failCount = 0

      const resultsIterator = await anthropic.messages.batches.results(batchId)
      for await (const result of resultsIterator) {
        // Parse custom_id to get paletteId and analysisIndex
        const { paletteId, analysisIndex } = parseCustomId(result.custom_id)

        // Look up the palette to get the seed
        const palette = await ctx.runQuery(internal.palettes.getById, { id: paletteId })
        if (!palette) {
          console.error(`Palette not found for id ${paletteId}`)
          failCount++
          continue
        }
        const seed = palette.seed

        if (result.result.type === 'succeeded') {
          // Extract text from response
          const textContent = result.result.message.content.find(
            (c): c is Anthropic.TextBlock => c.type === 'text',
          )
          if (textContent && textContent.type === 'text') {
            try {
              const jsonText = extractJson(textContent.text)
              const parsed = JSON.parse(jsonText)
              const normalized = normalizeTagResponse(parsed)
              const tags = tagResponseSchema.parse(normalized)

              await ctx.runMutation(internal.backfill.storeTagResult, {
                seed,
                provider: 'anthropic',
                model,
                analysisIndex,
                promptVersion: CURRENT_PROMPT_VERSION,
                tags,
                usage: {
                  inputTokens: result.result.message.usage.input_tokens,
                  outputTokens: result.result.message.usage.output_tokens,
                },
              })
              successCount++
            } catch (e) {
              await ctx.runMutation(internal.backfill.storeTagResult, {
                seed,
                provider: 'anthropic',
                model,
                analysisIndex,
                promptVersion: CURRENT_PROMPT_VERSION,
                tags: null,
                error: `Parse error: ${e instanceof Error ? e.message : String(e)}`,
              })
              failCount++
            }
          }
        } else {
          const errorMsg =
            result.result.type === 'errored'
              ? JSON.stringify(result.result.error)
              : result.result.type
          await ctx.runMutation(internal.backfill.storeTagResult, {
            seed,
            provider: 'anthropic',
            model,
            analysisIndex,
            promptVersion: CURRENT_PROMPT_VERSION,
            tags: null,
            error: errorMsg,
          })
          failCount++
        }
      }

      await ctx.runMutation(internal.backfill.updateBatchStatus, {
        batchId,
        status: 'completed',
        completedCount: successCount,
        failedCount: failCount,
      })

      return { status: 'completed' as const, successCount, failCount }
    }

    return { status: batch.processing_status as 'canceling' }
  },
})

// ============================================================================
// OpenAI Batch API
// ============================================================================

// Models that only support temperature=1 (no customization)
const OPENAI_TEMP_1_ONLY_MODELS = ['gpt-5-nano']

export const submitOpenAIBatch = internalAction({
  args: { model: vModel, cycle: v.number(), analysisCount: v.number() },
  handler: async (ctx, { model, cycle, analysisCount }): Promise<{ batchId: string; requestCount: number } | null> => {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY not set')

    const palettesForCycle = await ctx.runQuery(api.backfill.getPalettesForNewCycle, {
      provider: 'openai',
      model,
      analysisCount,
    })

    if (palettesForCycle.length === 0) {
      console.log(`No palettes for cycle ${cycle} openai:${model}`)
      return null
    }

    const requests = buildBatchRequests(palettesForCycle)
    console.log(`Submitting ${requests.length} requests to OpenAI batch API (cycle ${cycle})`)

    const openai = new OpenAI({ apiKey })

    // gpt-5-nano only supports temperature=1
    const temperature = OPENAI_TEMP_1_ONLY_MODELS.includes(model) ? 1 : 1.4

    // Build JSONL content
    const jsonlLines = requests.map((req) =>
      JSON.stringify({
        custom_id: req.customId,
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model,
          temperature,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: TAGGING_SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(req.colorData) },
          ],
        },
      }),
    )

    // Upload file - OpenAI requires a File-like object
    const jsonlContent = jsonlLines.join('\n')
    const file = await openai.files.create({
      file: new File([jsonlContent], 'batch_requests.jsonl', { type: 'application/jsonl' }),
      purpose: 'batch',
    })

    // Create batch
    const batch = await openai.batches.create({
      input_file_id: file.id,
      endpoint: '/v1/chat/completions',
      completion_window: '24h',
    })

    // Record batch in database
    await ctx.runMutation(internal.backfill.createBatch, {
      cycle,
      provider: 'openai',
      model,
      batchId: batch.id,
      analysisCount,
      requestCount: requests.length,
    })

    console.log(`Created OpenAI batch: ${batch.id} (cycle ${cycle})`)
    return { batchId: batch.id, requestCount: requests.length }
  },
})

export const cancelOpenAIBatch = internalAction({
  args: { batchId: v.string(), model: v.optional(vModel) },
  returns: v.object({ success: v.boolean(), actualStatus: v.optional(v.string()) }),
  handler: async (ctx, { batchId, model }) => {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY not set')

    const openai = new OpenAI({ apiKey })

    try {
      await openai.batches.cancel(batchId)
      await ctx.runMutation(internal.backfill.updateBatchStatus, {
        batchId,
        status: 'failed',
        error: 'Cancelled by user',
      })
      return { success: true }
    } catch (e) {
      // If batch is already completed/failed, process it properly
      if (e instanceof Error && e.message.includes('409')) {
        const batch = await openai.batches.retrieve(batchId)
        if (batch.status === 'completed' && model) {
          // Batch completed - poll to process results
          await ctx.runAction(internal.backfillActions.pollOpenAIBatch, { batchId, model })
          return { success: true, actualStatus: 'completed' }
        } else {
          await ctx.runMutation(internal.backfill.updateBatchStatus, {
            batchId,
            status: 'failed',
            error: `Batch ${batch.status}`,
          })
          return { success: true, actualStatus: batch.status }
        }
      } else {
        throw e
      }
    }
  },
})

export const pollOpenAIBatch = internalAction({
  args: { batchId: v.string(), model: vModel },
  handler: async (ctx, { batchId, model }) => {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY not set')

    const openai = new OpenAI({ apiKey })
    const batch = await openai.batches.retrieve(batchId)

    console.log(`OpenAI batch ${batchId} status: ${batch.status}`)

    if (batch.status === 'in_progress' || batch.status === 'validating' || batch.status === 'finalizing') {
      await ctx.runMutation(internal.backfill.updateBatchStatus, {
        batchId,
        status: 'processing',
        completedCount: batch.request_counts?.completed ?? 0,
        failedCount: batch.request_counts?.failed ?? 0,
      })
      return { status: 'processing' as const }
    }

    if (batch.status === 'completed' && batch.output_file_id) {
      // Download results
      console.log(`OpenAI batch ${batchId} downloading results from ${batch.output_file_id}`)
      const fileResponse = await openai.files.content(batch.output_file_id)
      const content = await fileResponse.text()
      const lines = content.trim().split('\n')
      console.log(`OpenAI batch ${batchId} processing ${lines.length} results`)

      let successCount = 0
      let failCount = 0

      for (const line of lines) {
        const result = JSON.parse(line)
        // Parse custom_id to get paletteId and analysisIndex
        const { paletteId, analysisIndex } = parseCustomId(result.custom_id)

        // Look up the palette to get the seed
        const palette = await ctx.runQuery(internal.palettes.getById, { id: paletteId })
        if (!palette) {
          console.error(`Palette not found for id ${paletteId}`)
          failCount++
          continue
        }
        const seed = palette.seed

        if (result.response?.status_code === 200) {
          try {
            const message = result.response.body.choices[0].message.content
            const jsonText = extractJson(message)
            const parsed = JSON.parse(jsonText)
            const tags = tagResponseSchema.parse(parsed)

            await ctx.runMutation(internal.backfill.storeTagResult, {
              seed,
              provider: 'openai',
              model,
              analysisIndex,
              promptVersion: CURRENT_PROMPT_VERSION,
              tags,
              usage: {
                inputTokens: result.response.body.usage?.prompt_tokens ?? 0,
                outputTokens: result.response.body.usage?.completion_tokens ?? 0,
              },
            })
            successCount++
          } catch (e) {
            await ctx.runMutation(internal.backfill.storeTagResult, {
              seed,
              provider: 'openai',
              model,
              analysisIndex,
              promptVersion: CURRENT_PROMPT_VERSION,
              tags: null,
              error: `Parse error: ${e instanceof Error ? e.message : String(e)}`,
            })
            failCount++
          }
        } else {
          await ctx.runMutation(internal.backfill.storeTagResult, {
            seed,
            provider: 'openai',
            model,
            analysisIndex,
            promptVersion: CURRENT_PROMPT_VERSION,
            tags: null,
            error: result.response?.body?.error?.message ?? result.error?.message ?? 'Unknown error',
          })
          failCount++
        }
      }

      console.log(`OpenAI batch ${batchId} updating status to completed: ${successCount} success, ${failCount} failed`)
      await ctx.runMutation(internal.backfill.updateBatchStatus, {
        batchId,
        status: 'completed',
        completedCount: successCount,
        failedCount: failCount,
      })

      return { status: 'completed' as const, successCount, failCount }
    }

    if (batch.status === 'completed' && !batch.output_file_id) {
      // Batch completed but no output file - mark as failed
      console.log(`OpenAI batch ${batchId} completed but no output_file_id`)
      await ctx.runMutation(internal.backfill.updateBatchStatus, {
        batchId,
        status: 'failed',
        error: 'Batch completed but no output file',
      })
      return { status: 'failed' as const }
    }

    if (batch.status === 'failed' || batch.status === 'expired' || batch.status === 'cancelled') {
      await ctx.runMutation(internal.backfill.updateBatchStatus, {
        batchId,
        status: 'failed',
        error: batch.status,
      })
      return { status: 'failed' as const }
    }

    return { status: batch.status }
  },
})

// OpenAI poll function ends here

// ============================================================================
// Groq Batch API
// ============================================================================

export const submitGroqBatch = internalAction({
  args: { model: vModel, cycle: v.number(), analysisCount: v.number() },
  handler: async (ctx, { model, cycle, analysisCount }): Promise<{ batchId: string; requestCount: number } | null> => {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new Error('GROQ_API_KEY not set')

    const palettesForCycle = await ctx.runQuery(api.backfill.getPalettesForNewCycle, {
      provider: 'groq',
      model,
      analysisCount,
    })

    if (palettesForCycle.length === 0) {
      console.log(`No palettes for cycle ${cycle} groq:${model}`)
      return null
    }

    const requests = buildBatchRequests(palettesForCycle)
    console.log(`Submitting ${requests.length} requests to Groq batch API (cycle ${cycle})`)

    const groq = new Groq({ apiKey })

    // Build JSONL content
    const jsonlLines = requests.map((req) =>
      JSON.stringify({
        custom_id: req.customId,
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model,
          temperature: 1.4,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: TAGGING_SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(req.colorData) },
          ],
        },
      }),
    )

    // Upload file - Groq requires a File-like object
    const jsonlContent = jsonlLines.join('\n')
    const file = await groq.files.create({
      file: new File([jsonlContent], 'batch_requests.jsonl', { type: 'application/jsonl' }),
      purpose: 'batch',
    })

    if (!file.id) {
      throw new Error('Failed to upload file to Groq')
    }

    // Create batch
    const batch = await groq.batches.create({
      input_file_id: file.id,
      endpoint: '/v1/chat/completions',
      completion_window: '24h',
    })

    const groqBatchId = batch.id
    if (!groqBatchId) {
      throw new Error('Failed to create Groq batch')
    }
    // Record batch in database
    await ctx.runMutation(internal.backfill.createBatch, {
      cycle,
      provider: 'groq',
      model,
      batchId: groqBatchId,
      analysisCount,
      requestCount: requests.length,
    })

    console.log(`Created Groq batch: ${groqBatchId} (cycle ${cycle})`)
    return { batchId: groqBatchId, requestCount: requests.length }
  },
})

export const cancelGroqBatch = internalAction({
  args: { batchId: v.string(), model: v.optional(vModel) },
  returns: v.object({ success: v.boolean(), actualStatus: v.optional(v.string()) }),
  handler: async (ctx, { batchId, model }) => {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new Error('GROQ_API_KEY not set')

    const groq = new Groq({ apiKey })

    try {
      await groq.batches.cancel(batchId)
      await ctx.runMutation(internal.backfill.updateBatchStatus, {
        batchId,
        status: 'failed',
        error: 'Cancelled by user',
      })
      return { success: true }
    } catch (e) {
      // If batch is already completed/failed, process it properly
      if (e instanceof Error && e.message.includes('409')) {
        const batch = await groq.batches.retrieve(batchId)
        if (batch.status === 'completed' && model) {
          // Batch completed - poll to process results
          await ctx.runAction(internal.backfillActions.pollGroqBatch, { batchId, model })
          return { success: true, actualStatus: 'completed' }
        } else {
          await ctx.runMutation(internal.backfill.updateBatchStatus, {
            batchId,
            status: 'failed',
            error: `Batch ${batch.status}`,
          })
          return { success: true, actualStatus: batch.status }
        }
      } else {
        throw e
      }
    }
  },
})

export const pollGroqBatch = internalAction({
  args: { batchId: v.string(), model: vModel },
  handler: async (ctx, { batchId, model }) => {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new Error('GROQ_API_KEY not set')

    const groq = new Groq({ apiKey })
    const batch = await groq.batches.retrieve(batchId)

    console.log(`Groq batch ${batchId} status: ${batch.status}`)

    if (
      batch.status === 'in_progress' ||
      batch.status === 'validating' ||
      batch.status === 'finalizing'
    ) {
      await ctx.runMutation(internal.backfill.updateBatchStatus, {
        batchId,
        status: 'processing',
        completedCount: batch.request_counts?.completed ?? 0,
        failedCount: batch.request_counts?.failed ?? 0,
      })
      return { status: 'processing' as const }
    }

    if (batch.status === 'completed' && batch.output_file_id) {
      // Download results
      const fileContent = await groq.files.content(batch.output_file_id)
      const content = await fileContent.text()
      const lines = content.trim().split('\n')

      let successCount = 0
      let failCount = 0

      for (const line of lines) {
        const result = JSON.parse(line)
        // Parse custom_id to get paletteId and analysisIndex
        const { paletteId, analysisIndex } = parseCustomId(result.custom_id)

        // Look up the palette to get the seed
        const palette = await ctx.runQuery(internal.palettes.getById, { id: paletteId })
        if (!palette) {
          console.error(`Palette not found for id ${paletteId}`)
          failCount++
          continue
        }
        const seed = palette.seed

        if (result.response?.status_code === 200) {
          try {
            const message = result.response.body.choices[0].message.content
            const jsonText = extractJson(message)
            const parsed = JSON.parse(jsonText)
            const tags = tagResponseSchema.parse(parsed)

            await ctx.runMutation(internal.backfill.storeTagResult, {
              seed,
              provider: 'groq',
              model,
              analysisIndex,
              promptVersion: CURRENT_PROMPT_VERSION,
              tags,
              usage: {
                inputTokens: result.response.body.usage?.prompt_tokens ?? 0,
                outputTokens: result.response.body.usage?.completion_tokens ?? 0,
              },
            })
            successCount++
          } catch (e) {
            await ctx.runMutation(internal.backfill.storeTagResult, {
              seed,
              provider: 'groq',
              model,
              analysisIndex,
              promptVersion: CURRENT_PROMPT_VERSION,
              tags: null,
              error: `Parse error: ${e instanceof Error ? e.message : String(e)}`,
            })
            failCount++
          }
        } else {
          await ctx.runMutation(internal.backfill.storeTagResult, {
            seed,
            provider: 'groq',
            model,
            analysisIndex,
            promptVersion: CURRENT_PROMPT_VERSION,
            tags: null,
            error: result.error?.message ?? 'Unknown error',
          })
          failCount++
        }
      }

      await ctx.runMutation(internal.backfill.updateBatchStatus, {
        batchId,
        status: 'completed',
        completedCount: successCount,
        failedCount: failCount,
      })

      return { status: 'completed' as const, successCount, failCount }
    }

    if (batch.status === 'failed' || batch.status === 'expired' || batch.status === 'cancelled') {
      await ctx.runMutation(internal.backfill.updateBatchStatus, {
        batchId,
        status: 'failed',
        error: batch.status,
      })
      return { status: 'failed' as const }
    }

    return { status: batch.status }
  },
})

// ============================================================================
// Google Batch API (uses @google/genai SDK)
// ============================================================================

// Google batch uses file-based approach with JSONL for key correlation
// Each line in the JSONL file has format: { "key": "...", "request": { ... } }
// Results are returned in the same order and can be correlated by key

export const submitGoogleBatch = internalAction({
  args: { model: vModel, cycle: v.number(), analysisCount: v.number() },
  handler: async (ctx, { model, cycle, analysisCount }): Promise<{ batchId: string; requestCount: number } | null> => {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not set')

    const palettesForCycle = await ctx.runQuery(api.backfill.getPalettesForNewCycle, {
      provider: 'google',
      model,
      analysisCount,
    })

    if (palettesForCycle.length === 0) {
      console.log(`No palettes for cycle ${cycle} google:${model}`)
      return null
    }

    const requests = buildBatchRequests(palettesForCycle)
    console.log(`Submitting ${requests.length} requests to Google batch API (cycle ${cycle})`)

    const ai = new GoogleGenAI({ apiKey })

    // Build inline requests for Google batch API
    // Using inline requests avoids file upload/download complexity
    const inlinedRequests = requests.map((req) => ({
      metadata: { key: req.customId },
      contents: [
        {
          role: 'user' as const,
          parts: [{ text: JSON.stringify(req.colorData) }],
        },
      ],
      config: {
        systemInstruction: { parts: [{ text: TAGGING_SYSTEM_PROMPT }] },
        temperature: 0.7,
        responseMimeType: 'application/json',
      },
    }))

    // Create batch job with inline requests
    const batchJob = await ai.batches.create({
      model,
      src: inlinedRequests,
      config: {
        displayName: `grabient-tags-cycle-${cycle}-${model}`,
      },
    })

    if (!batchJob.name) {
      throw new Error('Failed to create Google batch - no name returned')
    }

    console.log(`Google batch job created:`, {
      name: batchJob.name,
      state: batchJob.state,
      model: batchJob.model,
    })

    // Record batch in database with request order for response mapping
    const requestOrder = requests.map((req) => req.customId)
    await ctx.runMutation(internal.backfill.createBatch, {
      cycle,
      provider: 'google',
      model,
      batchId: batchJob.name,
      analysisCount,
      requestCount: requests.length,
      requestOrder,
    })

    console.log(`Created Google batch: ${batchJob.name} (cycle ${cycle})`)
    return { batchId: batchJob.name, requestCount: requests.length }
  },
})

export const cancelGoogleBatch = internalAction({
  args: { batchId: v.string(), model: v.optional(vModel) },
  returns: v.object({ success: v.boolean(), actualStatus: v.optional(v.string()) }),
  handler: async (ctx, { batchId, model }) => {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not set')

    const ai = new GoogleGenAI({ apiKey })

    try {
      await ai.batches.cancel({ name: batchId })
      await ctx.runMutation(internal.backfill.updateBatchStatus, {
        batchId,
        status: 'failed',
        error: 'Cancelled by user',
      })
      return { success: true }
    } catch (e) {
      // If batch is already completed, process it properly
      const batch = await ai.batches.get({ name: batchId })
      if (batch.state === 'JOB_STATE_SUCCEEDED' && model) {
        // Batch completed - poll to process results
        await ctx.runAction(internal.backfillActions.pollGoogleBatch, { batchId, model })
        return { success: true, actualStatus: 'completed' }
      } else {
        await ctx.runMutation(internal.backfill.updateBatchStatus, {
          batchId,
          status: 'failed',
          error: `Batch ${batch.state}`,
        })
        return { success: true, actualStatus: batch.state }
      }
    }
  },
})

export const pollGoogleBatch = internalAction({
  args: { batchId: v.string(), model: vModel },
  handler: async (ctx, { batchId, model }) => {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not set')

    const ai = new GoogleGenAI({ apiKey })
    const batch = await ai.batches.get({ name: batchId })

    // Log full batch info for debugging
    const stats = batch.completionStats
    console.log(`Google batch ${batchId}:`, {
      state: batch.state,
      successfulCount: stats?.successfulCount,
      failedCount: stats?.failedCount,
      incompleteCount: stats?.incompleteCount,
      createTime: batch.createTime,
      updateTime: batch.updateTime,
    })

    // Processing states
    if (batch.state === 'JOB_STATE_PENDING' || batch.state === 'JOB_STATE_RUNNING') {
      const completedCount = parseInt(stats?.successfulCount ?? '0', 10)
      const failedCount = parseInt(stats?.failedCount ?? '0', 10)

      await ctx.runMutation(internal.backfill.updateBatchStatus, {
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

      // For inline batches, results are in dest.inlinedResponses
      const inlinedResponses = batch.dest?.inlinedResponses
      console.log(`Google batch ${batchId} completed with ${inlinedResponses?.length ?? 0} responses`)

      if (!inlinedResponses || inlinedResponses.length === 0) {
        console.error('No inlined responses in Google batch result')
        await ctx.runMutation(internal.backfill.updateBatchStatus, {
          batchId,
          status: 'failed',
          error: 'No inlined responses in completed batch',
        })
        return { status: 'failed' as const }
      }

      // Get the stored request order from our database
      // Google SDK doesn't return metadata in responses, so we need our stored order
      const batchRecord = await ctx.runQuery(internal.backfill.getBatchByBatchIdInternal, { batchId })
      const requestOrder = batchRecord?.requestOrder

      if (!requestOrder || requestOrder.length === 0) {
        console.error(`No requestOrder stored for batch ${batchId}`)
        await ctx.runMutation(internal.backfill.updateBatchStatus, {
          batchId,
          status: 'failed',
          error: 'No request order stored - cannot map responses',
        })
        return { status: 'failed' as const }
      }

      if (requestOrder.length !== inlinedResponses.length) {
        console.error(`Request order length (${requestOrder.length}) doesn't match responses (${inlinedResponses.length})`)
      }

      // Process responses using stored request order
      for (let i = 0; i < inlinedResponses.length; i++) {
        const inlinedResponse = inlinedResponses[i]

        try {
          const responseData = inlinedResponse.response
          const errorData = inlinedResponse.error

          // Get customId from our stored request order
          const customId = requestOrder[i]

          if (!customId) {
            console.error(`No customId for response at index ${i}`)
            failCount++
            continue
          }

          const { paletteId, analysisIndex } = parseCustomId(customId)

          // Look up the palette to get the seed
          const palette = await ctx.runQuery(internal.palettes.getById, { id: paletteId })
          if (!palette) {
            console.error(`Palette not found for id ${paletteId}`)
            failCount++
            continue
          }
          const seed = palette.seed

          // Check for error response
          if (errorData) {
            await ctx.runMutation(internal.backfill.storeTagResult, {
              seed,
              provider: 'google',
              model,
              analysisIndex,
              promptVersion: CURRENT_PROMPT_VERSION,
              tags: null,
              error: JSON.stringify(errorData),
            })
            failCount++
            continue
          }

          if (!responseData) {
            await ctx.runMutation(internal.backfill.storeTagResult, {
              seed,
              provider: 'google',
              model,
              analysisIndex,
              promptVersion: CURRENT_PROMPT_VERSION,
              tags: null,
              error: 'No response in batch result',
            })
            failCount++
            continue
          }

          // Extract text from candidates
          // Debug: log the response structure to understand what we're getting
          console.log(`Response ${i} structure:`, {
            hasText: !!responseData.text,
            hasCandidates: !!responseData.candidates,
            candidatesLength: responseData.candidates?.length,
            firstCandidateKeys: responseData.candidates?.[0] ? Object.keys(responseData.candidates[0]) : [],
          })

          // Try multiple ways to get the text
          let text = responseData.text ?? ''

          // Fallback: try to extract from candidates directly
          if (!text && responseData.candidates?.[0]?.content?.parts?.[0]?.text) {
            text = responseData.candidates[0].content.parts[0].text
          }

          if (!text) {
            await ctx.runMutation(internal.backfill.storeTagResult, {
              seed,
              provider: 'google',
              model,
              analysisIndex,
              promptVersion: CURRENT_PROMPT_VERSION,
              tags: null,
              error: 'Empty response text from model',
            })
            failCount++
            continue
          }

          const jsonText = extractJson(text)

          if (!jsonText) {
            await ctx.runMutation(internal.backfill.storeTagResult, {
              seed,
              provider: 'google',
              model,
              analysisIndex,
              promptVersion: CURRENT_PROMPT_VERSION,
              tags: null,
              error: `Could not extract JSON from response: ${text.substring(0, 200)}`,
            })
            failCount++
            continue
          }

          const parsed = JSON.parse(jsonText)
          const normalized = normalizeTagResponse(parsed)
          const tags = tagResponseSchema.parse(normalized)

          // Extract usage if available
          const usageMetadata = responseData.usageMetadata
          await ctx.runMutation(internal.backfill.storeTagResult, {
            seed,
            provider: 'google',
            model,
            analysisIndex,
            promptVersion: CURRENT_PROMPT_VERSION,
            tags,
            usage: usageMetadata
              ? {
                  inputTokens: usageMetadata.promptTokenCount ?? 0,
                  outputTokens: usageMetadata.candidatesTokenCount ?? 0,
                }
              : undefined,
          })
          successCount++
        } catch (e) {
          // Try to store the error with the seed if we have it
          const errorMsg = e instanceof Error ? e.message : String(e)
          console.error(`Error processing Google batch response at index ${i}:`, errorMsg)

          // Try to get seed for error storage
          try {
            const customId = requestOrder[i]
            if (customId) {
              const { paletteId, analysisIndex } = parseCustomId(customId)
              const palette = await ctx.runQuery(internal.palettes.getById, { id: paletteId })
              if (palette) {
                await ctx.runMutation(internal.backfill.storeTagResult, {
                  seed: palette.seed,
                  provider: 'google',
                  model,
                  analysisIndex,
                  promptVersion: CURRENT_PROMPT_VERSION,
                  tags: null,
                  error: `Parse error: ${errorMsg}`,
                })
              }
            }
          } catch {
            // Couldn't store error with seed, just count it
          }
          failCount++
        }
      }

      await ctx.runMutation(internal.backfill.updateBatchStatus, {
        batchId,
        status: 'completed',
        completedCount: successCount,
        failedCount: failCount,
      })

      return { status: 'completed' as const, successCount, failCount }
    }

    // Failed/cancelled/expired states
    if (
      batch.state === 'JOB_STATE_FAILED' ||
      batch.state === 'JOB_STATE_CANCELLED' ||
      batch.state === 'JOB_STATE_EXPIRED'
    ) {
      await ctx.runMutation(internal.backfill.updateBatchStatus, {
        batchId,
        status: 'failed',
        error: batch.state,
      })
      return { status: 'failed' as const }
    }

    return { status: batch.state ?? 'unknown' }
  },
})


// ============================================================================
// Main Backfill Action
// ============================================================================

/**
 * Start backfill for selected providers/models.
 * Creates a new cycle - all existing tag data is preserved, new tags are added with incremented indices.
 * @param selectedModels - Optional array of model names to run. If not provided, runs all models.
 * @param analysisCount - How many times each palette should be tagged by each model. Defaults to 1.
 */
export const startBackfill = action({
  args: {
    selectedModels: v.optional(v.array(v.string())),
    analysisCount: v.optional(v.number()),
  },
  handler: async (ctx, { selectedModels, analysisCount = 1 }): Promise<{
    cycle: number
    batchesCreated: number
    totalRequests: number
    results: Array<{ provider: Provider; model: Model; batchId: string | null; requestCount: number }>
  }> => {
    // Validate analysisCount
    if (analysisCount < 1 || analysisCount > 20) {
      throw new Error('analysisCount must be between 1 and 20')
    }

    // Get next cycle number
    const cycle: number = await ctx.runQuery(internal.backfill.getNextCycle, {})
    console.log(`Starting new backfill cycle: ${cycle} (analysisCount: ${analysisCount})`)

    // Helper to check if a model should be included
    const shouldInclude = (model: string) => !selectedModels || selectedModels.includes(model)

    const results: Array<{ provider: Provider; model: Model; batchId: string | null; requestCount: number }> = []

    // Submit batches for each provider
    for (const provider of PROVIDERS) {
      const models = PROVIDER_MODELS[provider]

      for (const model of models) {
        if (!shouldInclude(model)) continue

        let result: { batchId: string; requestCount: number } | null = null

        switch (provider) {
          case 'anthropic':
            result = await ctx.runAction(internal.backfillActions.submitAnthropicBatch, { model, cycle, analysisCount })
            break
          case 'openai':
            result = await ctx.runAction(internal.backfillActions.submitOpenAIBatch, { model, cycle, analysisCount })
            break
          case 'groq':
            result = await ctx.runAction(internal.backfillActions.submitGroqBatch, { model, cycle, analysisCount })
            break
          case 'google':
            result = await ctx.runAction(internal.backfillActions.submitGoogleBatch, { model, cycle, analysisCount })
            break
        }

        results.push({
          provider,
          model: model as Model,
          batchId: result?.batchId ?? null,
          requestCount: result?.requestCount ?? 0,
        })
      }
    }

    const totalRequests = results.reduce((sum, r) => sum + r.requestCount, 0)
    const batchesCreated = results.filter((r) => r.batchId).length

    return {
      cycle,
      batchesCreated,
      totalRequests,
      results,
    }
  },
})

/**
 * Cancel a batch by provider and batchId
 */
export const cancelBatch = action({
  args: {
    provider: vProvider,
    batchId: v.string(),
    model: v.optional(vModel),
  },
  returns: v.object({ success: v.boolean(), actualStatus: v.optional(v.string()) }),
  handler: async (ctx, { provider, batchId, model }): Promise<{ success: boolean; actualStatus?: string }> => {
    switch (provider) {
      case 'anthropic':
        return await ctx.runAction(internal.backfillActions.cancelAnthropicBatch, { batchId, model })
      case 'openai':
        return await ctx.runAction(internal.backfillActions.cancelOpenAIBatch, { batchId, model })
      case 'groq':
        return await ctx.runAction(internal.backfillActions.cancelGroqBatch, { batchId, model })
      case 'google':
        return await ctx.runAction(internal.backfillActions.cancelGoogleBatch, { batchId, model })
    }
  },
})

/**
 * Poll all active batches
 * Call this periodically to check batch status and fetch results
 */
export const pollActiveBatches = action({
  args: {},
  handler: async (ctx) => {
    const activeBatches = await ctx.runQuery(api.backfill.getActiveBatches, {})

    const results: Array<{ batchId: string; provider: Provider; model: Model; status: string }> = []

    for (const batch of activeBatches) {
      // Skip legacy batches without model - they can't be processed
      if (!batch.model) {
        console.warn(`Skipping batch ${batch.batchId} - no model specified (legacy batch)`)
        continue
      }

      try {
        let pollResult: { status: string }

        switch (batch.provider) {
          case 'anthropic':
            pollResult = await ctx.runAction(internal.backfillActions.pollAnthropicBatch, {
              batchId: batch.batchId,
              model: batch.model,
            })
            break
          case 'openai':
            pollResult = await ctx.runAction(internal.backfillActions.pollOpenAIBatch, {
              batchId: batch.batchId,
              model: batch.model,
            })
            break
          case 'groq':
            pollResult = await ctx.runAction(internal.backfillActions.pollGroqBatch, {
              batchId: batch.batchId,
              model: batch.model,
            })
            break
          case 'google':
            pollResult = await ctx.runAction(internal.backfillActions.pollGoogleBatch, {
              batchId: batch.batchId,
              model: batch.model,
            })
            break
          default:
            pollResult = { status: 'unknown' }
        }

        results.push({
          batchId: batch.batchId,
          provider: batch.provider,
          model: batch.model,
          status: pollResult.status,
        })
      } catch (e) {
        console.error(`Error polling batch ${batch.batchId}:`, e)
        results.push({
          batchId: batch.batchId,
          provider: batch.provider,
          model: batch.model,
          status: 'error',
        })
      }
    }

    return results
  },
})

// ============================================================================
// Scheduled Polling (called by cron)
// ============================================================================

/**
 * Internal action for cron job to poll active batches
 */
export const pollActiveBatchesInternal = internalAction({
  args: {},
  handler: async (ctx): Promise<{ polled: number; completed?: number; processing?: number; errors?: number; skipped?: number }> => {
    const activeBatches = await ctx.runQuery(api.backfill.getActiveBatches, {})

    if (activeBatches.length === 0) {
      console.log('No active batches to poll')
      return { polled: 0 }
    }

    console.log(`Polling ${activeBatches.length} active batches...`)

    let completed = 0
    let processing = 0
    let errors = 0
    let skipped = 0

    for (const batch of activeBatches) {
      // Skip legacy batches without model - they can't be processed
      if (!batch.model) {
        console.warn(`Skipping batch ${batch.batchId} - no model specified (legacy batch)`)
        skipped++
        continue
      }

      try {
        let pollResult: { status: string }

        switch (batch.provider) {
          case 'anthropic':
            pollResult = await ctx.runAction(internal.backfillActions.pollAnthropicBatch, {
              batchId: batch.batchId,
              model: batch.model,
            })
            break
          case 'openai':
            pollResult = await ctx.runAction(internal.backfillActions.pollOpenAIBatch, {
              batchId: batch.batchId,
              model: batch.model,
            })
            break
          case 'groq':
            pollResult = await ctx.runAction(internal.backfillActions.pollGroqBatch, {
              batchId: batch.batchId,
              model: batch.model,
            })
            break
          case 'google':
            pollResult = await ctx.runAction(internal.backfillActions.pollGoogleBatch, {
              batchId: batch.batchId,
              model: batch.model,
            })
            break
          default:
            pollResult = { status: 'unknown' }
        }

        if (pollResult.status === 'completed') completed++
        else if (pollResult.status === 'processing') processing++
      } catch (e) {
        console.error(`Error polling batch ${batch.batchId}:`, e)
        errors++
      }
    }

    console.log(`Poll results: ${completed} completed, ${processing} processing, ${errors} errors, ${skipped} skipped`)
    return { polled: activeBatches.length - skipped, completed, processing, errors, skipped }
  },
})

// ============================================================================
// Helpers
// ============================================================================

function extractJson(text: string): string {
  let cleaned = text.trim()
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

  const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (match && match[1]) {
    return match[1].trim()
  }

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return jsonMatch[0]
  }

  return cleaned
}
