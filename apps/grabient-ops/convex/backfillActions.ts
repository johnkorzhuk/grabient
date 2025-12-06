'use node'

import { action, internalAction } from './_generated/server'
import { internal, api } from './_generated/api'
import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import Groq from 'groq-sdk'
import { generateColorDataFromSeed, type ColorData } from './lib/colorData'
import { TAGGING_SYSTEM_PROMPT, CURRENT_PROMPT_VERSION } from './lib/prompts'
import { tagResponseSchema, normalizeTagResponse } from './lib/providers'

// ============================================================================
// Provider Configurations
// ============================================================================

const PROVIDER_CONFIGS = {
  anthropic: [{ name: 'anthropic', model: 'claude-3-5-haiku-20241022' }],
  openai: [
    { name: 'openai', model: 'gpt-4o-mini' },
    { name: 'openai', model: 'gpt-5-nano' },
  ],
  groq: [
    { name: 'groq', model: 'llama-3.3-70b-versatile' },
    { name: 'groq', model: 'meta-llama/llama-4-scout-17b-16e-instruct' },
    { name: 'groq', model: 'qwen/qwen3-32b' },
    { name: 'groq', model: 'openai/gpt-oss-120b' },
    { name: 'groq', model: 'openai/gpt-oss-20b' },
  ],
  google: [
    { name: 'google', model: 'gemini-2.0-flash' },
    { name: 'google', model: 'gemini-2.5-flash-lite' },
  ],
} as const

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
  args: { model: v.string(), cycle: v.number() },
  handler: async (ctx, { model, cycle }): Promise<{ batchId: string; requestCount: number } | null> => {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

    // Get config
    const config = await ctx.runQuery(api.config.get, {})

    // Get palettes for this cycle
    const palettesForCycle = await ctx.runQuery(api.backfill.getPalettesForNewCycle, {
      provider: 'anthropic',
      model,
      analysisCount: config.tagAnalysisCount,
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
            content: JSON.stringify(req.colorData, null, 2),
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
      requestCount: requests.length,
    })

    console.log(`Created Anthropic batch: ${batch.id} (cycle ${cycle})`)
    return { batchId: batch.id, requestCount: requests.length }
  },
})

export const cancelAnthropicBatch = internalAction({
  args: { batchId: v.string(), model: v.optional(v.string()) },
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
  args: { batchId: v.string(), model: v.string() },
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
  args: { model: v.string(), cycle: v.number() },
  handler: async (ctx, { model, cycle }): Promise<{ batchId: string; requestCount: number } | null> => {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY not set')

    const config = await ctx.runQuery(api.config.get, {})

    const palettesForCycle = await ctx.runQuery(api.backfill.getPalettesForNewCycle, {
      provider: 'openai',
      model,
      analysisCount: config.tagAnalysisCount,
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
            { role: 'user', content: JSON.stringify(req.colorData, null, 2) },
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
      requestCount: requests.length,
    })

    console.log(`Created OpenAI batch: ${batch.id} (cycle ${cycle})`)
    return { batchId: batch.id, requestCount: requests.length }
  },
})

export const cancelOpenAIBatch = internalAction({
  args: { batchId: v.string(), model: v.optional(v.string()) },
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
  args: { batchId: v.string(), model: v.string() },
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
  args: { model: v.string(), cycle: v.number() },
  handler: async (ctx, { model, cycle }): Promise<{ batchId: string; requestCount: number } | null> => {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new Error('GROQ_API_KEY not set')

    const config = await ctx.runQuery(api.config.get, {})

    const palettesForCycle = await ctx.runQuery(api.backfill.getPalettesForNewCycle, {
      provider: 'groq',
      model,
      analysisCount: config.tagAnalysisCount,
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
            { role: 'user', content: JSON.stringify(req.colorData, null, 2) },
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
      requestCount: requests.length,
    })

    console.log(`Created Groq batch: ${groqBatchId} (cycle ${cycle})`)
    return { batchId: groqBatchId, requestCount: requests.length }
  },
})

export const cancelGroqBatch = internalAction({
  args: { batchId: v.string(), model: v.optional(v.string()) },
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
  args: { batchId: v.string(), model: v.string() },
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
// Google Batch API (uses different SDK approach)
// ============================================================================

// Google's batch API is different - it uses inline requests or file uploads
// For simplicity, we'll use parallel sync calls with rate limiting for Google
// TODO: Implement proper Google batch API when needed

export const submitGoogleBatch = internalAction({
  args: { model: v.string() },
  handler: async (_ctx, { model }): Promise<{ batchId: string; requestCount: number } | null> => {
    // Google's batch API is more complex - for now, use parallel sync calls
    // This can be improved later with proper batch API integration
    console.log(`Google batch API not yet implemented for ${model}, using sync calls`)
    return null
  },
})

// ============================================================================
// Main Backfill Action
// ============================================================================

/**
 * Start backfill for all providers.
 * Creates a new cycle - all existing tag data is preserved, new tags are added with incremented indices.
 */
export const startBackfill = action({
  args: {},
  handler: async (ctx): Promise<{
    cycle: number
    batchesCreated: number
    totalRequests: number
    results: Array<{ provider: string; model: string; batchId: string | null; requestCount: number }>
  }> => {
    // Get next cycle number
    const cycle: number = await ctx.runQuery(internal.backfill.getNextCycle, {})
    console.log(`Starting new backfill cycle: ${cycle}`)

    const results: Array<{ provider: string; model: string; batchId: string | null; requestCount: number }> = []

    // Submit Anthropic batches
    for (const { model } of PROVIDER_CONFIGS.anthropic) {
      const result = await ctx.runAction(internal.backfillActions.submitAnthropicBatch, { model, cycle })
      results.push({
        provider: 'anthropic',
        model,
        batchId: result?.batchId ?? null,
        requestCount: result?.requestCount ?? 0,
      })
    }

    // Submit OpenAI batches
    for (const { model } of PROVIDER_CONFIGS.openai) {
      const result = await ctx.runAction(internal.backfillActions.submitOpenAIBatch, { model, cycle })
      results.push({
        provider: 'openai',
        model,
        batchId: result?.batchId ?? null,
        requestCount: result?.requestCount ?? 0,
      })
    }

    // Submit Groq batches
    for (const { model } of PROVIDER_CONFIGS.groq) {
      const result = await ctx.runAction(internal.backfillActions.submitGroqBatch, { model, cycle })
      results.push({
        provider: 'groq',
        model,
        batchId: result?.batchId ?? null,
        requestCount: result?.requestCount ?? 0,
      })
    }

    // Google - for now skip or use sync
    for (const { model } of PROVIDER_CONFIGS.google) {
      results.push({
        provider: 'google',
        model,
        batchId: null,
        requestCount: 0,
      })
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
    provider: v.string(),
    batchId: v.string(),
    model: v.optional(v.string()),
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
      default:
        throw new Error(`Unknown provider: ${provider}`)
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

    const results: Array<{ batchId: string; provider: string; model: string; status: string }> = []

    for (const batch of activeBatches) {
      const model = batch.model ?? 'unknown'
      try {
        let pollResult: { status: string }

        switch (batch.provider) {
          case 'anthropic':
            pollResult = await ctx.runAction(internal.backfillActions.pollAnthropicBatch, {
              batchId: batch.batchId,
              model,
            })
            break
          case 'openai':
            pollResult = await ctx.runAction(internal.backfillActions.pollOpenAIBatch, {
              batchId: batch.batchId,
              model,
            })
            break
          case 'groq':
            pollResult = await ctx.runAction(internal.backfillActions.pollGroqBatch, {
              batchId: batch.batchId,
              model,
            })
            break
          default:
            pollResult = { status: 'unknown' }
        }

        results.push({
          batchId: batch.batchId,
          provider: batch.provider,
          model,
          status: pollResult.status,
        })
      } catch (e) {
        console.error(`Error polling batch ${batch.batchId}:`, e)
        results.push({
          batchId: batch.batchId,
          provider: batch.provider,
          model,
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
  handler: async (ctx): Promise<{ polled: number; completed?: number; processing?: number; errors?: number }> => {
    const activeBatches = await ctx.runQuery(api.backfill.getActiveBatches, {}) as Array<{
      batchId: string
      provider: string
      model?: string
      status: string
    }>

    if (activeBatches.length === 0) {
      console.log('No active batches to poll')
      return { polled: 0 }
    }

    console.log(`Polling ${activeBatches.length} active batches...`)

    let completed = 0
    let processing = 0
    let errors = 0

    for (const batch of activeBatches) {
      const model = batch.model ?? 'unknown'
      try {
        let pollResult: { status: string }

        switch (batch.provider) {
          case 'anthropic':
            pollResult = await ctx.runAction(internal.backfillActions.pollAnthropicBatch, {
              batchId: batch.batchId,
              model,
            })
            break
          case 'openai':
            pollResult = await ctx.runAction(internal.backfillActions.pollOpenAIBatch, {
              batchId: batch.batchId,
              model,
            })
            break
          case 'groq':
            pollResult = await ctx.runAction(internal.backfillActions.pollGroqBatch, {
              batchId: batch.batchId,
              model,
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

    console.log(`Poll results: ${completed} completed, ${processing} processing, ${errors} errors`)
    return { polled: activeBatches.length, completed, processing, errors }
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
