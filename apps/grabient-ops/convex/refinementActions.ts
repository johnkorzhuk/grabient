'use node'

import { action, internalAction, type ActionCtx } from './_generated/server'
import { internal, api } from './_generated/api'
import { v } from 'convex/values'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import Groq from 'groq-sdk'
import {
  REFINEMENT_SYSTEM_PROMPT,
  REFINEMENT_PROMPT_VERSION,
  buildEmbedText,
  createRefinementMessageContent,
  createRefinementPromptText,
  extractJson,
  normalizeRefinedTags,
  refinedTagsSchema,
  type TagSummary,
} from './lib/refinement'
import { generateColorDataFromSeed } from './lib/colorData'
import { REFINEMENT_PROMPT_MESSAGE } from './lib/prompts'
import {
  vRefinementModel,
  REFINEMENT_MODEL_PROVIDER,
  GROQ_REASONING_EFFORT,
  GROQ_REASONING_FORMAT_SUPPORTED,
  type RefinementModel,
  type RefinementProvider,
} from './lib/providers.types'

// ============================================================================
// Shared Helpers
// ============================================================================

/**
 * Helper to get summaries for refinement
 * Processes in chunks to avoid Convex read limits
 *
 * @param model - The refinement model to check against (for per-model refinement tracking)
 * @param sourcePromptVersions - Array of prompt versions to include (all versions if empty)
 * @param cycle - The refinement cycle number
 */
async function getRefinementSummaries(
  ctx: ActionCtx,
  model: RefinementModel,
  sourcePromptVersions: string[],
  limit: number,
  cycle: number,
): Promise<{ summaries: TagSummary[]; requestOrder: string[]; cycle: number } | null> {
  const palettesForRefinement = await ctx.runQuery(
    api.refinement.getPalettesForRefinement,
    {
      model,
      cycle,
      sourcePromptVersions: sourcePromptVersions.length > 0 ? sourcePromptVersions : undefined,
      limit,
    },
  )

  if (palettesForRefinement.length === 0) {
    console.log(`No palettes need refinement for cycle ${cycle}`)
    return null
  }

  console.log(
    `Building tag summaries for ${palettesForRefinement.length} palettes (cycle ${cycle}, source prompts: ${sourcePromptVersions.length > 0 ? sourcePromptVersions.map(v => v.slice(0, 8)).join(', ') : 'all'})`,
  )

  // Process in chunks to avoid Convex read limits (16MB / ~29k docs)
  // Each palette can have many tags across providers, so keep chunks small
  const CHUNK_SIZE = 50
  const allSummaries: TagSummary[] = []
  const seeds = palettesForRefinement.map((p: { seed: string }) => p.seed)

  for (let i = 0; i < seeds.length; i += CHUNK_SIZE) {
    const chunkSeeds = seeds.slice(i, i + CHUNK_SIZE)
    const chunkSummaries: TagSummary[] = await ctx.runQuery(
      internal.refinement.buildTagSummaries,
      {
        seeds: chunkSeeds,
        sourcePromptVersions,
      },
    )
    allSummaries.push(...chunkSummaries)
  }

  if (allSummaries.length === 0) {
    console.log(`No valid tag summaries for cycle ${cycle}`)
    return null
  }

  const requestOrder = allSummaries.map((s) => s.seed)
  return { summaries: allSummaries, requestOrder, cycle }
}

/**
 * Process parsed refinement result and store it.
 * Builds embed_text programmatically from consensus + LLM-refined tags.
 */
async function storeRefinementResult(
  ctx: ActionCtx,
  seed: string,
  model: RefinementModel,
  cycle: number,
  sourcePromptVersions: string[],
  summary: TagSummary | null,
  responseText: string | null,
  usage: { inputTokens: number; outputTokens: number } | null,
  error?: string,
): Promise<boolean> {
  if (error || !responseText) {
    await ctx.runMutation(internal.refinement.storeRefinedResult, {
      seed,
      model,
      cycle,
      promptVersion: REFINEMENT_PROMPT_VERSION,
      sourcePromptVersions,
      tags: null,
      embedText: '',
      error: error ?? 'No response text',
    })
    return false
  }

  try {
    const jsonText = extractJson(responseText)
    const parsed = JSON.parse(jsonText)
    const normalized = normalizeRefinedTags(parsed)
    const tags = refinedTagsSchema.parse(normalized)

    // Build embed_text programmatically from consensus + LLM-refined tags + color names
    // Generate colorNames from seed (11 steps, deduped)
    let embedText = ''
    if (summary) {
      const colorData = generateColorDataFromSeed(seed)
      embedText = buildEmbedText(
        { categorical: summary.categorical },
        { mood: tags.mood, style: tags.style, harmony: tags.harmony, seasonal: tags.seasonal, associations: tags.associations },
        colorData.colorNames,
      )
    }

    await ctx.runMutation(internal.refinement.storeRefinedResult, {
      seed,
      model,
      cycle,
      promptVersion: REFINEMENT_PROMPT_VERSION,
      sourcePromptVersions,
      tags,
      embedText,
      usage: usage ?? undefined,
    })
    return true
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e)
    console.error(`Parse error for seed ${seed}:`, errorMsg)

    await ctx.runMutation(internal.refinement.storeRefinedResult, {
      seed,
      model,
      cycle,
      promptVersion: REFINEMENT_PROMPT_VERSION,
      sourcePromptVersions,
      tags: null,
      embedText: '',
      error: `Parse error: ${errorMsg}`,
    })
    return false
  }
}

// ============================================================================
// Anthropic Batch API for Refinement
// ============================================================================

/**
 * Submit refinement batch to Anthropic's Message Batches API.
 * Uses Opus 4.5 with extended thinking and vision for palette images.
 */
export const submitAnthropicRefinementBatch = internalAction({
  args: {
    model: vRefinementModel,
    cycle: v.number(),
    sourcePromptVersions: v.array(v.string()),
    limit: v.optional(v.number()),
    retryCount: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { model, cycle, sourcePromptVersions, limit = 1000, retryCount = 0 },
  ): Promise<{ batchId: string; requestCount: number } | null> => {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

    const result = await getRefinementSummaries(
      ctx,
      model,
      sourcePromptVersions,
      limit,
      cycle,
    )
    if (!result) return null

    const { summaries, requestOrder } = result

    console.log(
      `Submitting ${summaries.length} requests to Anthropic refinement batch API (cycle ${cycle})`,
    )

    const anthropic = new Anthropic({ apiKey })

    // Only Opus 4.5 supports extended thinking
    const supportsThinking = model === 'claude-opus-4-5-20251101'

    // Build batch requests with vision support (and extended thinking for supported models)
    const batchRequests: Anthropic.Messages.BatchCreateParams.Request[] =
      summaries.map((summary, index) => ({
        custom_id: `idx_${index}`,
        params: {
          model,
          max_tokens: 4096,
          ...(supportsThinking && {
            thinking: {
              type: 'enabled' as const,
              budget_tokens: 1024,
            },
          }),
          system: REFINEMENT_SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: createRefinementMessageContent(summary) as any,
            },
          ],
        },
      }))

    // Submit batch
    const batch = await anthropic.messages.batches.create({
      requests: batchRequests,
    })

    // Register prompt version (idempotent - will skip if exists)
    await ctx.runMutation(internal.backfill.registerPromptVersion, {
      version: REFINEMENT_PROMPT_VERSION,
      type: 'refinement',
      content: REFINEMENT_SYSTEM_PROMPT,
      message: REFINEMENT_PROMPT_MESSAGE,
    })

    // Record batch in database
    await ctx.runMutation(internal.refinement.createRefinementBatch, {
      cycle,
      provider: 'anthropic',
      model,
      batchId: batch.id,
      sourcePromptVersions,
      requestCount: summaries.length,
      requestOrder,
      retryCount,
    })

    console.log(
      `Created Anthropic refinement batch: ${batch.id} (cycle ${cycle})`,
    )
    return { batchId: batch.id, requestCount: summaries.length }
  },
})

/**
 * Cancel an Anthropic refinement batch
 */
export const cancelAnthropicRefinementBatch = internalAction({
  args: { batchId: v.string(), model: v.optional(vRefinementModel) },
  returns: v.object({
    success: v.boolean(),
    actualStatus: v.optional(v.string()),
  }),
  handler: async (ctx, { batchId, model }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

    const anthropic = new Anthropic({ apiKey })

    try {
      await anthropic.messages.batches.cancel(batchId)
      await ctx.runMutation(internal.refinement.updateRefinementBatchStatus, {
        batchId,
        status: 'failed',
        error: 'Cancelled by user',
      })
      return { success: true }
    } catch (e) {
      if (
        e instanceof Error &&
        (e.message.includes('409') || e.message.includes('ended'))
      ) {
        const batch = await anthropic.messages.batches.retrieve(batchId)
        if (batch.processing_status === 'ended' && model) {
          await ctx.runAction(
            internal.refinementActions.pollAnthropicRefinementBatch,
            {
              batchId,
              model,
            },
          )
          return { success: true, actualStatus: 'completed' }
        } else {
          await ctx.runMutation(
            internal.refinement.updateRefinementBatchStatus,
            {
              batchId,
              status: 'failed',
              error: `Batch ${batch.processing_status}`,
            },
          )
          return { success: true, actualStatus: batch.processing_status }
        }
      }
      throw e
    }
  },
})

/**
 * Poll Anthropic refinement batch status and process results when complete
 */
export const pollAnthropicRefinementBatch = internalAction({
  args: { batchId: v.string(), model: vRefinementModel },
  handler: async (ctx, { batchId, model }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

    const anthropic = new Anthropic({ apiKey })
    const batch = await anthropic.messages.batches.retrieve(batchId)

    console.log(
      `Anthropic refinement batch ${batchId} status: ${batch.processing_status}`,
    )

    if (batch.processing_status === 'in_progress') {
      await ctx.runMutation(internal.refinement.updateRefinementBatchStatus, {
        batchId,
        status: 'processing',
        completedCount: batch.request_counts.succeeded,
        failedCount:
          batch.request_counts.errored + batch.request_counts.expired,
      })
      return { status: 'processing' as const }
    }

    if (batch.processing_status === 'ended') {
      const batchRecord = await ctx.runQuery(
        internal.refinement.getRefinementBatchByBatchId,
        {
          batchId,
        },
      )

      if (!batchRecord?.requestOrder) {
        console.error(`No requestOrder stored for refinement batch ${batchId}`)
        await ctx.runMutation(internal.refinement.updateRefinementBatchStatus, {
          batchId,
          status: 'failed',
          error: 'No request order stored - cannot map responses',
        })
        return { status: 'failed' as const }
      }

      const requestOrder = batchRecord.requestOrder
      const cycle = batchRecord.cycle
      // Use sourcePromptVersions if available, fall back to empty array
      const sourcePromptVersions = batchRecord.sourcePromptVersions ?? []

      let successCount = 0
      let failCount = 0

      const resultsIterator = await anthropic.messages.batches.results(batchId)
      for await (const result of resultsIterator) {
        const index = parseInt(result.custom_id.replace('idx_', ''), 10)
        const seed = requestOrder[index]

        if (!seed) {
          console.error(`No seed found for custom_id ${result.custom_id}`)
          failCount++
          continue
        }

        if (result.result.type === 'succeeded') {
          const textContent = result.result.message.content.find(
            (c): c is Anthropic.TextBlock => c.type === 'text',
          )

          // Fetch consensus for building embed_text
          const consensus = await ctx.runQuery(internal.consensus.getConsensusForSeed, {
            seed,
            promptVersions: sourcePromptVersions.length > 0 ? sourcePromptVersions : undefined,
          })
          const summary: TagSummary | null = consensus ? {
            seed,
            paletteId: '',
            colorData: { colors: [] } as any,
            imageUrl: '',
            totalModels: consensus.totalModels,
            sourcePromptVersion: consensus.promptVersions[0] ?? '',
            categorical: consensus.categorical,
            tags: consensus.tags,
          } : null

          const success = await storeRefinementResult(
            ctx,
            seed,
            model,
            cycle,
            sourcePromptVersions,
            summary,
            textContent?.text ?? null,
            {
              inputTokens: result.result.message.usage.input_tokens,
              outputTokens: result.result.message.usage.output_tokens,
            },
            textContent ? undefined : 'No text content in response',
          )
          if (success) successCount++
          else failCount++
        } else {
          const errorMsg =
            result.result.type === 'errored'
              ? JSON.stringify(result.result.error)
              : result.result.type

          await storeRefinementResult(
            ctx,
            seed,
            model,
            cycle,
            sourcePromptVersions,
            null,
            null,
            null,
            errorMsg,
          )
          failCount++
        }
      }

      await ctx.runMutation(internal.refinement.updateRefinementBatchStatus, {
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
// OpenAI Batch API for Refinement
// ============================================================================

/**
 * Submit refinement batch to OpenAI's Batch API.
 * Uses o1 model with built-in reasoning.
 */
export const submitOpenAIRefinementBatch = internalAction({
  args: {
    model: vRefinementModel,
    cycle: v.number(),
    sourcePromptVersions: v.array(v.string()),
    limit: v.optional(v.number()),
    retryCount: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { model, cycle, sourcePromptVersions, limit = 1000, retryCount = 0 },
  ): Promise<{ batchId: string; requestCount: number } | null> => {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY not set')

    const result = await getRefinementSummaries(
      ctx,
      model,
      sourcePromptVersions,
      limit,
      cycle,
    )
    if (!result) return null

    const { summaries, requestOrder } = result

    console.log(
      `Submitting ${summaries.length} requests to OpenAI refinement batch API (cycle ${cycle})`,
    )

    const openai = new OpenAI({ apiKey })

    // Build JSONL content for OpenAI batch API with vision support
    const jsonlLines = summaries.map((summary, index) => {
      // Build message content with image if available
      const userContent: Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      > = []

      // Add palette image first if available
      if (summary.imageUrl) {
        userContent.push({
          type: 'image_url',
          image_url: { url: summary.imageUrl },
        })
      }

      // Add text prompt
      userContent.push({
        type: 'text',
        text: createRefinementPromptText(summary),
      })

      return JSON.stringify({
        custom_id: `idx_${index}`,
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model,
          messages: [
            { role: 'system', content: REFINEMENT_SYSTEM_PROMPT },
            { role: 'user', content: userContent },
          ],
        },
      })
    })

    // Upload file
    const jsonlContent = jsonlLines.join('\n')
    const file = await openai.files.create({
      file: new File([jsonlContent], 'refinement_batch.jsonl', {
        type: 'application/jsonl',
      }),
      purpose: 'batch',
    })

    // Create batch
    const batch = await openai.batches.create({
      input_file_id: file.id,
      endpoint: '/v1/chat/completions',
      completion_window: '24h',
    })

    // Register prompt version (idempotent - will skip if exists)
    await ctx.runMutation(internal.backfill.registerPromptVersion, {
      version: REFINEMENT_PROMPT_VERSION,
      type: 'refinement',
      content: REFINEMENT_SYSTEM_PROMPT,
      message: REFINEMENT_PROMPT_MESSAGE,
    })

    // Record batch in database
    await ctx.runMutation(internal.refinement.createRefinementBatch, {
      cycle,
      provider: 'openai',
      model,
      batchId: batch.id,
      sourcePromptVersions,
      requestCount: summaries.length,
      requestOrder,
      retryCount,
    })

    console.log(`Created OpenAI refinement batch: ${batch.id} (cycle ${cycle})`)
    return { batchId: batch.id, requestCount: summaries.length }
  },
})

/**
 * Cancel an OpenAI refinement batch
 */
export const cancelOpenAIRefinementBatch = internalAction({
  args: { batchId: v.string(), model: v.optional(vRefinementModel) },
  returns: v.object({
    success: v.boolean(),
    actualStatus: v.optional(v.string()),
  }),
  handler: async (ctx, { batchId, model }) => {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY not set')

    const openai = new OpenAI({ apiKey })

    try {
      await openai.batches.cancel(batchId)
      await ctx.runMutation(internal.refinement.updateRefinementBatchStatus, {
        batchId,
        status: 'failed',
        error: 'Cancelled by user',
      })
      return { success: true }
    } catch (e) {
      if (e instanceof Error && e.message.includes('409')) {
        const batch = await openai.batches.retrieve(batchId)
        if (batch.status === 'completed' && model) {
          await ctx.runAction(
            internal.refinementActions.pollOpenAIRefinementBatch,
            {
              batchId,
              model,
            },
          )
          return { success: true, actualStatus: 'completed' }
        } else {
          await ctx.runMutation(
            internal.refinement.updateRefinementBatchStatus,
            {
              batchId,
              status: 'failed',
              error: `Batch ${batch.status}`,
            },
          )
          return { success: true, actualStatus: batch.status }
        }
      }
      throw e
    }
  },
})

/**
 * Poll OpenAI refinement batch status and process results when complete
 */
export const pollOpenAIRefinementBatch = internalAction({
  args: { batchId: v.string(), model: vRefinementModel },
  handler: async (ctx, { batchId, model }) => {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY not set')

    const openai = new OpenAI({ apiKey })
    const batch = await openai.batches.retrieve(batchId)

    console.log(`OpenAI refinement batch ${batchId} status: ${batch.status}, output_file_id: ${batch.output_file_id ?? 'none'}`)

    if (
      batch.status === 'in_progress' ||
      batch.status === 'validating' ||
      batch.status === 'finalizing'
    ) {
      await ctx.runMutation(internal.refinement.updateRefinementBatchStatus, {
        batchId,
        status: 'processing',
        completedCount: batch.request_counts?.completed ?? 0,
        failedCount: batch.request_counts?.failed ?? 0,
      })
      return { status: 'processing' as const }
    }

    // Handle completed batch with no output file (all requests failed)
    if (batch.status === 'completed' && !batch.output_file_id) {
      let errorDetails = 'Batch completed with no output - all requests failed'

      // Try to get error details from error file
      if (batch.error_file_id) {
        try {
          const errorFileResponse = await openai.files.content(batch.error_file_id)
          const errorContent = await errorFileResponse.text()
          const errorLines = errorContent.trim().split('\n').slice(0, 5) // First 5 errors
          const errors = errorLines.map(line => {
            try {
              const parsed = JSON.parse(line)
              return parsed.error?.message || parsed.response?.error?.message || JSON.stringify(parsed.error || parsed.response?.error)
            } catch {
              return line.slice(0, 200)
            }
          })
          errorDetails = `All requests failed. Errors: ${errors.join('; ')}`
          console.error(`OpenAI batch ${batchId} errors:`, errors)
        } catch (e) {
          console.error(`Failed to read error file for batch ${batchId}:`, e)
        }
      }

      console.error(`OpenAI batch ${batchId} completed but has no output file - all requests failed`)
      await ctx.runMutation(internal.refinement.updateRefinementBatchStatus, {
        batchId,
        status: 'failed',
        error: errorDetails,
        failedCount: batch.request_counts?.total ?? 0,
      })
      return { status: 'failed' as const }
    }

    if (batch.status === 'completed' && batch.output_file_id) {
      const batchRecord = await ctx.runQuery(
        internal.refinement.getRefinementBatchByBatchId,
        {
          batchId,
        },
      )

      if (!batchRecord?.requestOrder) {
        console.error(`No requestOrder stored for refinement batch ${batchId}`)
        await ctx.runMutation(internal.refinement.updateRefinementBatchStatus, {
          batchId,
          status: 'failed',
          error: 'No request order stored - cannot map responses',
        })
        return { status: 'failed' as const }
      }

      const requestOrder = batchRecord.requestOrder
      const cycle = batchRecord.cycle
      // Use sourcePromptVersions if available, fall back to empty array
      const sourcePromptVersions = batchRecord.sourcePromptVersions ?? []

      // Download results
      const fileResponse = await openai.files.content(batch.output_file_id)
      const content = await fileResponse.text()
      const lines = content.trim().split('\n')

      let successCount = 0
      let failCount = 0

      for (const line of lines) {
        const result = JSON.parse(line)
        const index = parseInt(result.custom_id.replace('idx_', ''), 10)
        const seed = requestOrder[index]

        if (!seed) {
          console.error(`No seed found for custom_id ${result.custom_id}`)
          failCount++
          continue
        }

        if (result.response?.status_code === 200) {
          const choice = result.response.body.choices?.[0]
          let message = choice?.message?.content

          if (!message) {
            // Log the structure for debugging
            console.error(`OpenAI: No content found for seed ${seed}. Choice:`,
              JSON.stringify(choice, null, 2).slice(0, 1000))
          }

          // Fetch consensus for building embed_text
          const consensus = await ctx.runQuery(internal.consensus.getConsensusForSeed, {
            seed,
            promptVersions: sourcePromptVersions.length > 0 ? sourcePromptVersions : undefined,
          })
          const summary: TagSummary | null = consensus ? {
            seed,
            paletteId: '',
            colorData: { colors: [] } as any,
            imageUrl: '',
            totalModels: consensus.totalModels,
            sourcePromptVersion: consensus.promptVersions[0] ?? '',
            categorical: consensus.categorical,
            tags: consensus.tags,
          } : null

          const success = await storeRefinementResult(
            ctx,
            seed,
            model,
            cycle,
            sourcePromptVersions,
            summary,
            message ?? null,
            {
              inputTokens: result.response.body.usage?.prompt_tokens ?? 0,
              outputTokens: result.response.body.usage?.completion_tokens ?? 0,
            },
          )
          if (success) successCount++
          else failCount++
        } else {
          const errorMsg =
            result.error?.message ?? `Status ${result.response?.status_code}`
          await storeRefinementResult(
            ctx,
            seed,
            model,
            cycle,
            sourcePromptVersions,
            null,
            null,
            null,
            errorMsg,
          )
          failCount++
        }
      }

      await ctx.runMutation(internal.refinement.updateRefinementBatchStatus, {
        batchId,
        status: 'completed',
        completedCount: successCount,
        failedCount: failCount,
      })

      return { status: 'completed' as const, successCount, failCount }
    }

    if (
      batch.status === 'failed' ||
      batch.status === 'expired' ||
      batch.status === 'cancelled'
    ) {
      await ctx.runMutation(internal.refinement.updateRefinementBatchStatus, {
        batchId,
        status: 'failed',
        error: `Batch ${batch.status}`,
      })
      return { status: 'failed' as const }
    }

    return { status: batch.status as string }
  },
})

// ============================================================================
// Groq Batch API for Refinement
// ============================================================================

/**
 * Submit refinement batch to Groq's Batch API.
 * Supports qwen3-32b, gpt-oss-120b (with reasoning), and kimi-k2 (fast/cheap)
 */
export const submitGroqRefinementBatch = internalAction({
  args: {
    model: vRefinementModel,
    cycle: v.number(),
    sourcePromptVersions: v.array(v.string()),
    limit: v.optional(v.number()),
    retryCount: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { model, cycle, sourcePromptVersions, limit = 1000, retryCount = 0 },
  ): Promise<{ batchId: string; requestCount: number } | null> => {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new Error('GROQ_API_KEY not set')

    const result = await getRefinementSummaries(
      ctx,
      model,
      sourcePromptVersions,
      limit,
      cycle,
    )
    if (!result) return null

    const { summaries, requestOrder } = result

    console.log(
      `Submitting ${summaries.length} requests to Groq refinement batch API (cycle ${cycle}, model: ${model})`,
    )

    const groq = new Groq({ apiKey })

    // Get reasoning_effort if model supports it
    const reasoningEffort = GROQ_REASONING_EFFORT[model as RefinementModel]
    const supportsReasoningFormat = GROQ_REASONING_FORMAT_SUPPORTED.has(model as RefinementModel)

    // Build JSONL content
    const jsonlLines = summaries.map((summary, index) => {
      const body: Record<string, any> = {
        model,
        messages: [
          { role: 'system', content: REFINEMENT_SYSTEM_PROMPT },
          { role: 'user', content: createRefinementPromptText(summary) },
        ],
      }

      // Add reasoning_effort for models that support it
      if (reasoningEffort) {
        body.reasoning_effort = reasoningEffort
        // Only add reasoning_format for models that support it
        if (supportsReasoningFormat) {
          body.reasoning_format = 'raw'
        }
      }

      return JSON.stringify({
        custom_id: `idx_${index}`,
        method: 'POST',
        url: '/v1/chat/completions',
        body,
      })
    })

    // Upload file to Groq
    const jsonlContent = jsonlLines.join('\n')
    const file = await groq.files.create({
      file: new File([jsonlContent], 'refinement_batch.jsonl', {
        type: 'application/jsonl',
      }),
      purpose: 'batch',
    })

    const fileId = file.id
    if (!fileId) {
      throw new Error('Failed to create Groq file')
    }

    // Create batch
    const batch = await groq.batches.create({
      input_file_id: fileId,
      endpoint: '/v1/chat/completions',
      completion_window: '24h',
    })

    const groqBatchId = batch.id as string
    if (!groqBatchId) {
      throw new Error('Failed to create Groq batch')
    }

    // Register prompt version (idempotent - will skip if exists)
    await ctx.runMutation(internal.backfill.registerPromptVersion, {
      version: REFINEMENT_PROMPT_VERSION,
      type: 'refinement',
      content: REFINEMENT_SYSTEM_PROMPT,
      message: REFINEMENT_PROMPT_MESSAGE,
    })

    // Record batch in database
    await ctx.runMutation(internal.refinement.createRefinementBatch, {
      cycle,
      provider: 'groq',
      model,
      batchId: groqBatchId,
      sourcePromptVersions,
      requestCount: summaries.length,
      requestOrder,
      retryCount,
    })

    console.log(
      `Created Groq refinement batch: ${groqBatchId} (cycle ${cycle})`,
    )
    return { batchId: groqBatchId, requestCount: summaries.length }
  },
})

/**
 * Cancel a Groq refinement batch
 */
export const cancelGroqRefinementBatch = internalAction({
  args: { batchId: v.string(), model: v.optional(vRefinementModel) },
  returns: v.object({
    success: v.boolean(),
    actualStatus: v.optional(v.string()),
  }),
  handler: async (ctx, { batchId, model }) => {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new Error('GROQ_API_KEY not set')

    const groq = new Groq({ apiKey })

    // First check the actual batch status from Groq
    let batch
    try {
      batch = await groq.batches.retrieve(batchId)
      console.log(`Groq batch ${batchId} current status: ${batch.status}`)
    } catch (retrieveError) {
      console.error(`Failed to retrieve Groq batch ${batchId}:`, retrieveError)
      // If we can't retrieve, mark as failed
      await ctx.runMutation(internal.refinement.updateRefinementBatchStatus, {
        batchId,
        status: 'failed',
        error: `Cannot retrieve batch: ${retrieveError instanceof Error ? retrieveError.message : String(retrieveError)}`,
      })
      return { success: true, actualStatus: 'unknown' }
    }

    // If already completed, poll to process results
    if (batch.status === 'completed' && model) {
      console.log(`Batch ${batchId} already completed, polling for results`)
      await ctx.runAction(
        internal.refinementActions.pollGroqRefinementBatch,
        { batchId, model },
      )
      return { success: true, actualStatus: 'completed' }
    }

    // If already failed/cancelled/expired, just update our status
    if (batch.status === 'failed' || batch.status === 'cancelled' || batch.status === 'expired') {
      await ctx.runMutation(internal.refinement.updateRefinementBatchStatus, {
        batchId,
        status: 'failed',
        error: `Batch already ${batch.status}`,
      })
      return { success: true, actualStatus: batch.status }
    }

    // Try to cancel
    try {
      await groq.batches.cancel(batchId)
      await ctx.runMutation(internal.refinement.updateRefinementBatchStatus, {
        batchId,
        status: 'failed',
        error: 'Cancelled by user',
      })
      return { success: true }
    } catch (e) {
      console.error(`Failed to cancel Groq batch ${batchId}:`, e)
      // Mark as failed anyway since user wants to cancel
      await ctx.runMutation(internal.refinement.updateRefinementBatchStatus, {
        batchId,
        status: 'failed',
        error: `Cancel failed: ${e instanceof Error ? e.message : String(e)}`,
      })
      return { success: true, actualStatus: batch.status }
    }
  },
})

/**
 * Poll Groq refinement batch status and process results when complete
 */
export const pollGroqRefinementBatch = internalAction({
  args: { batchId: v.string(), model: vRefinementModel },
  handler: async (ctx, { batchId, model }) => {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new Error('GROQ_API_KEY not set')

    const groq = new Groq({ apiKey })
    const batch = await groq.batches.retrieve(batchId)

    console.log(`Groq refinement batch ${batchId} status: ${batch.status}, output_file_id: ${batch.output_file_id ?? 'none'}`)

    if (
      batch.status === 'in_progress' ||
      batch.status === 'validating' ||
      batch.status === 'finalizing'
    ) {
      await ctx.runMutation(internal.refinement.updateRefinementBatchStatus, {
        batchId,
        status: 'processing',
        completedCount: batch.request_counts?.completed ?? 0,
        failedCount: batch.request_counts?.failed ?? 0,
      })
      return { status: 'processing' as const }
    }

    // Handle completed batch with no output file (all requests failed)
    if (batch.status === 'completed' && !batch.output_file_id) {
      let errorDetails = 'Batch completed with no output - all requests failed'

      // Try to get error details from error file
      if (batch.error_file_id) {
        try {
          const errorFileContent = await groq.files.content(batch.error_file_id)
          const errorContent = await errorFileContent.text()
          const errorLines = errorContent.trim().split('\n').slice(0, 5) // First 5 errors
          const errors = errorLines.map(line => {
            try {
              const parsed = JSON.parse(line)
              return parsed.error?.message || parsed.response?.error?.message || JSON.stringify(parsed.error || parsed.response?.error)
            } catch {
              return line.slice(0, 200)
            }
          })
          errorDetails = `All requests failed. Errors: ${errors.join('; ')}`
          console.error(`Groq batch ${batchId} errors:`, errors)
        } catch (e) {
          console.error(`Failed to read error file for batch ${batchId}:`, e)
        }
      }

      console.error(`Groq batch ${batchId} completed but has no output file - all requests failed`)
      await ctx.runMutation(internal.refinement.updateRefinementBatchStatus, {
        batchId,
        status: 'failed',
        error: errorDetails,
        failedCount: batch.request_counts?.total ?? 0,
      })
      return { status: 'failed' as const }
    }

    if (batch.status === 'completed' && batch.output_file_id) {
      const batchRecord = await ctx.runQuery(
        internal.refinement.getRefinementBatchByBatchId,
        {
          batchId,
        },
      )

      if (!batchRecord?.requestOrder) {
        console.error(`No requestOrder stored for refinement batch ${batchId}`)
        await ctx.runMutation(internal.refinement.updateRefinementBatchStatus, {
          batchId,
          status: 'failed',
          error: 'No request order stored - cannot map responses',
        })
        return { status: 'failed' as const }
      }

      const requestOrder = batchRecord.requestOrder
      const cycle = batchRecord.cycle
      // Use sourcePromptVersions if available, fall back to empty array
      const sourcePromptVersions = batchRecord.sourcePromptVersions ?? []

      // Download results
      const fileContent = await groq.files.content(batch.output_file_id)
      const content = await fileContent.text()
      const lines = content.trim().split('\n')

      let successCount = 0
      let failCount = 0

      for (const line of lines) {
        const result = JSON.parse(line)
        const index = parseInt(result.custom_id.replace('idx_', ''), 10)
        const seed = requestOrder[index]

        if (!seed) {
          console.error(`No seed found for custom_id ${result.custom_id}`)
          failCount++
          continue
        }

        if (result.response?.status_code === 200) {
          const choice = result.response.body.choices?.[0]
          // Try content first, then check if reasoning contains JSON (some models put output there)
          let message = choice?.message?.content
          if (!message && choice?.message?.reasoning) {
            // Some reasoning models put the JSON in reasoning field
            const reasoning = choice.message.reasoning
            // Check if reasoning contains JSON with mood/style/associations
            if (reasoning.includes('{') && (reasoning.includes('mood') || reasoning.includes('associations'))) {
              message = reasoning
            }
          }

          if (!message) {
            // Log the structure for debugging
            console.error(`Groq: No content found for seed ${seed}. Choice:`,
              JSON.stringify(choice, null, 2).slice(0, 1000))
          }

          // Fetch consensus for building embed_text
          const consensus = await ctx.runQuery(internal.consensus.getConsensusForSeed, {
            seed,
            promptVersions: sourcePromptVersions.length > 0 ? sourcePromptVersions : undefined,
          })
          const summary: TagSummary | null = consensus ? {
            seed,
            paletteId: '',
            colorData: { colors: [] } as any,
            imageUrl: '',
            totalModels: consensus.totalModels,
            sourcePromptVersion: consensus.promptVersions[0] ?? '',
            categorical: consensus.categorical,
            tags: consensus.tags,
          } : null

          const success = await storeRefinementResult(
            ctx,
            seed,
            model,
            cycle,
            sourcePromptVersions,
            summary,
            message ?? null,
            {
              inputTokens: result.response.body.usage?.prompt_tokens ?? 0,
              outputTokens: result.response.body.usage?.completion_tokens ?? 0,
            },
          )
          if (success) successCount++
          else failCount++
        } else {
          const errorMsg =
            result.error?.message ?? `Status ${result.response?.status_code}`
          await storeRefinementResult(
            ctx,
            seed,
            model,
            cycle,
            sourcePromptVersions,
            null,
            null,
            null,
            errorMsg,
          )
          failCount++
        }
      }

      await ctx.runMutation(internal.refinement.updateRefinementBatchStatus, {
        batchId,
        status: 'completed',
        completedCount: successCount,
        failedCount: failCount,
      })

      return { status: 'completed' as const, successCount, failCount }
    }

    if (
      batch.status === 'failed' ||
      batch.status === 'expired' ||
      batch.status === 'cancelled'
    ) {
      await ctx.runMutation(internal.refinement.updateRefinementBatchStatus, {
        batchId,
        status: 'failed',
        error: `Batch ${batch.status}`,
      })
      return { status: 'failed' as const }
    }

    return { status: batch.status as string }
  },
})

// ============================================================================
// Google Batch API for Refinement
// ============================================================================

/**
 * Submit refinement batch to Google's Batch API.
 * Uses Gemini models with inline requests.
 */
export const submitGoogleRefinementBatch = internalAction({
  args: {
    model: vRefinementModel,
    cycle: v.number(),
    sourcePromptVersions: v.array(v.string()),
    limit: v.optional(v.number()),
    retryCount: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { model, cycle, sourcePromptVersions, limit = 1000, retryCount = 0 },
  ): Promise<{ batchId: string; requestCount: number } | null> => {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not set')

    const result = await getRefinementSummaries(
      ctx,
      model,
      sourcePromptVersions,
      limit,
      cycle,
    )
    if (!result) return null

    const { summaries, requestOrder } = result

    console.log(
      `Submitting ${summaries.length} requests to Google refinement batch API (cycle ${cycle}, model: ${model})`,
    )

    // Dynamic import to avoid bundling issues
    const { GoogleGenAI } = await import('@google/genai')
    const ai = new GoogleGenAI({ apiKey })

    // Build inline requests for Google batch API
    const inlinedRequests = summaries.map((summary, index) => ({
      metadata: { key: `idx_${index}` },
      contents: [
        {
          role: 'user' as const,
          parts: [{ text: createRefinementPromptText(summary) }],
        },
      ],
      config: {
        systemInstruction: { parts: [{ text: REFINEMENT_SYSTEM_PROMPT }] },
        temperature: 0.7,
        responseMimeType: 'application/json',
      },
    }))

    // Create batch job with inline requests
    const batchJob = await ai.batches.create({
      model,
      src: inlinedRequests,
      config: {
        displayName: `grabient-refinement-cycle-${cycle}-${model}`,
      },
    })

    if (!batchJob.name) {
      throw new Error('Failed to create Google batch - no name returned')
    }

    // Register prompt version (idempotent - will skip if exists)
    await ctx.runMutation(internal.backfill.registerPromptVersion, {
      version: REFINEMENT_PROMPT_VERSION,
      type: 'refinement',
      content: REFINEMENT_SYSTEM_PROMPT,
      message: REFINEMENT_PROMPT_MESSAGE,
    })

    // Record batch in database
    await ctx.runMutation(internal.refinement.createRefinementBatch, {
      cycle,
      provider: 'google',
      model,
      batchId: batchJob.name,
      sourcePromptVersions,
      requestCount: summaries.length,
      requestOrder,
      retryCount,
    })

    console.log(
      `Created Google refinement batch: ${batchJob.name} (cycle ${cycle})`,
    )
    return { batchId: batchJob.name, requestCount: summaries.length }
  },
})

/**
 * Cancel a Google refinement batch
 */
export const cancelGoogleRefinementBatch = internalAction({
  args: { batchId: v.string(), model: v.optional(vRefinementModel) },
  returns: v.object({
    success: v.boolean(),
    actualStatus: v.optional(v.string()),
  }),
  handler: async (ctx, { batchId, model }) => {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not set')

    const { GoogleGenAI } = await import('@google/genai')
    const ai = new GoogleGenAI({ apiKey })

    try {
      await ai.batches.cancel({ name: batchId })
      await ctx.runMutation(internal.refinement.updateRefinementBatchStatus, {
        batchId,
        status: 'failed',
        error: 'Cancelled by user',
      })
      return { success: true }
    } catch (e) {
      const batch = await ai.batches.get({ name: batchId })
      if (batch.state === 'JOB_STATE_SUCCEEDED' && model) {
        await ctx.runAction(
          internal.refinementActions.pollGoogleRefinementBatch,
          {
            batchId,
            model,
          },
        )
        return { success: true, actualStatus: 'completed' }
      } else {
        await ctx.runMutation(
          internal.refinement.updateRefinementBatchStatus,
          {
            batchId,
            status: 'failed',
            error: `Batch ${batch.state}`,
          },
        )
        return { success: true, actualStatus: batch.state }
      }
    }
  },
})

/**
 * Poll Google refinement batch status and process results when complete
 */
export const pollGoogleRefinementBatch = internalAction({
  args: { batchId: v.string(), model: vRefinementModel },
  handler: async (ctx, { batchId, model }) => {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not set')

    const { GoogleGenAI } = await import('@google/genai')
    const ai = new GoogleGenAI({ apiKey })
    const batch = await ai.batches.get({ name: batchId })

    const stats = batch.completionStats
    console.log(`Google refinement batch ${batchId}:`, {
      state: batch.state,
      successfulCount: stats?.successfulCount,
      failedCount: stats?.failedCount,
    })

    if (batch.state === 'JOB_STATE_PENDING' || batch.state === 'JOB_STATE_RUNNING') {
      const completedCount = parseInt(stats?.successfulCount ?? '0', 10)
      const failedCount = parseInt(stats?.failedCount ?? '0', 10)

      await ctx.runMutation(internal.refinement.updateRefinementBatchStatus, {
        batchId,
        status: 'processing',
        completedCount,
        failedCount,
      })
      return { status: 'processing' as const }
    }

    if (batch.state === 'JOB_STATE_SUCCEEDED') {
      const batchRecord = await ctx.runQuery(
        internal.refinement.getRefinementBatchByBatchId,
        { batchId },
      )

      if (!batchRecord?.requestOrder) {
        console.error(`No requestOrder stored for refinement batch ${batchId}`)
        await ctx.runMutation(internal.refinement.updateRefinementBatchStatus, {
          batchId,
          status: 'failed',
          error: 'No request order stored - cannot map responses',
        })
        return { status: 'failed' as const }
      }

      const requestOrder = batchRecord.requestOrder
      const cycle = batchRecord.cycle
      const sourcePromptVersions = batchRecord.sourcePromptVersions ?? []
      const inlinedResponses = batch.dest?.inlinedResponses

      if (!inlinedResponses || inlinedResponses.length === 0) {
        await ctx.runMutation(internal.refinement.updateRefinementBatchStatus, {
          batchId,
          status: 'failed',
          error: 'No inlined responses in completed batch',
        })
        return { status: 'failed' as const }
      }

      let successCount = 0
      let failCount = 0

      for (let i = 0; i < inlinedResponses.length; i++) {
        const inlinedResponse = inlinedResponses[i]
        const seed = requestOrder[i]

        if (!seed) {
          console.error(`No seed for response at index ${i}`)
          failCount++
          continue
        }

        try {
          const responseData = inlinedResponse.response
          const errorData = inlinedResponse.error

          if (errorData) {
            await storeRefinementResult(
              ctx,
              seed,
              model,
              cycle,
              sourcePromptVersions,
              null,
              null,
              null,
              `Google error: ${JSON.stringify(errorData)}`,
            )
            failCount++
            continue
          }

          // Extract text from Google response
          const candidate = responseData?.candidates?.[0]
          const textPart = candidate?.content?.parts?.find(
            (p: { text?: string }) => p.text,
          )
          const responseText = textPart?.text

          // Fetch consensus for building embed_text
          const consensus = await ctx.runQuery(internal.consensus.getConsensusForSeed, {
            seed,
            promptVersions: sourcePromptVersions.length > 0 ? sourcePromptVersions : undefined,
          })
          const summary: TagSummary | null = consensus ? {
            seed,
            paletteId: '',
            colorData: { colors: [] } as any,
            imageUrl: '',
            totalModels: consensus.totalModels,
            sourcePromptVersion: consensus.promptVersions[0] ?? '',
            categorical: consensus.categorical,
            tags: consensus.tags,
          } : null

          const usage = responseData?.usageMetadata
          const success = await storeRefinementResult(
            ctx,
            seed,
            model,
            cycle,
            sourcePromptVersions,
            summary,
            responseText ?? null,
            usage
              ? {
                  inputTokens: usage.promptTokenCount ?? 0,
                  outputTokens: usage.candidatesTokenCount ?? 0,
                }
              : null,
            responseText ? undefined : 'No text in response',
          )
          if (success) successCount++
          else failCount++
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e)
          await storeRefinementResult(
            ctx,
            seed,
            model,
            cycle,
            sourcePromptVersions,
            null,
            null,
            null,
            `Process error: ${errorMsg}`,
          )
          failCount++
        }
      }

      await ctx.runMutation(internal.refinement.updateRefinementBatchStatus, {
        batchId,
        status: 'completed',
        completedCount: successCount,
        failedCount: failCount,
      })

      return { status: 'completed' as const, successCount, failCount }
    }

    if (
      batch.state === 'JOB_STATE_FAILED' ||
      batch.state === 'JOB_STATE_CANCELLED'
    ) {
      await ctx.runMutation(internal.refinement.updateRefinementBatchStatus, {
        batchId,
        status: 'failed',
        error: `Batch ${batch.state}`,
      })
      return { status: 'failed' as const }
    }

    return { status: batch.state as string }
  },
})

// ============================================================================
// Provider Router - Routes to correct provider-specific actions
// ============================================================================

/**
 * Submit refinement batch - routes to the correct provider
 */
export const submitRefinementBatch = internalAction({
  args: {
    model: vRefinementModel,
    cycle: v.number(),
    sourcePromptVersions: v.array(v.string()),
    limit: v.optional(v.number()),
    retryCount: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { model, cycle, sourcePromptVersions, limit = 1000, retryCount = 0 },
  ): Promise<{ batchId: string; requestCount: number } | null> => {
    const provider = REFINEMENT_MODEL_PROVIDER[model as RefinementModel]

    switch (provider) {
      case 'anthropic':
        return ctx.runAction(
          internal.refinementActions.submitAnthropicRefinementBatch,
          {
            model,
            cycle,
            sourcePromptVersions,
            limit,
            retryCount,
          },
        )
      case 'openai':
        return ctx.runAction(
          internal.refinementActions.submitOpenAIRefinementBatch,
          {
            model,
            cycle,
            sourcePromptVersions,
            limit,
            retryCount,
          },
        )
      case 'groq':
        return ctx.runAction(
          internal.refinementActions.submitGroqRefinementBatch,
          {
            model,
            cycle,
            sourcePromptVersions,
            limit,
            retryCount,
          },
        )
      case 'google':
        return ctx.runAction(
          internal.refinementActions.submitGoogleRefinementBatch,
          {
            model,
            cycle,
            sourcePromptVersions,
            limit,
            retryCount,
          },
        )
      default:
        throw new Error(`Unknown provider for model ${model}`)
    }
  },
})

/**
 * Cancel refinement batch - routes to the correct provider
 */
export const cancelRefinementBatch = internalAction({
  args: {
    batchId: v.string(),
    model: v.optional(vRefinementModel),
    provider: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    actualStatus: v.optional(v.string()),
  }),
  handler: async (
    ctx,
    { batchId, model, provider: providerArg },
  ): Promise<{ success: boolean; actualStatus?: string }> => {
    // Determine provider from model or explicit provider arg
    let provider: RefinementProvider | undefined
    if (model) {
      provider = REFINEMENT_MODEL_PROVIDER[model as RefinementModel]
    } else if (providerArg) {
      provider = providerArg as RefinementProvider
    } else {
      // Try to look up from batch record
      const batchRecord = await ctx.runQuery(
        internal.refinement.getRefinementBatchByBatchId,
        {
          batchId,
        },
      )
      provider = batchRecord?.provider as RefinementProvider | undefined
    }

    if (!provider) {
      throw new Error('Could not determine provider for batch')
    }

    switch (provider) {
      case 'anthropic':
        return ctx.runAction(
          internal.refinementActions.cancelAnthropicRefinementBatch,
          {
            batchId,
            model,
          },
        )
      case 'openai':
        return ctx.runAction(
          internal.refinementActions.cancelOpenAIRefinementBatch,
          {
            batchId,
            model,
          },
        )
      case 'groq':
        return ctx.runAction(
          internal.refinementActions.cancelGroqRefinementBatch,
          {
            batchId,
            model,
          },
        )
      case 'google':
        return ctx.runAction(
          internal.refinementActions.cancelGoogleRefinementBatch,
          {
            batchId,
            model,
          },
        )
      default:
        throw new Error(`Unknown provider: ${provider}`)
    }
  },
})

/**
 * Poll refinement batch - routes to the correct provider
 */
export const pollRefinementBatch = internalAction({
  args: { batchId: v.string(), model: vRefinementModel },
  handler: async (
    ctx,
    { batchId, model },
  ): Promise<{ status: string; successCount?: number; failCount?: number }> => {
    const provider = REFINEMENT_MODEL_PROVIDER[model as RefinementModel]

    switch (provider) {
      case 'anthropic':
        return ctx.runAction(
          internal.refinementActions.pollAnthropicRefinementBatch,
          {
            batchId,
            model,
          },
        )
      case 'openai':
        return ctx.runAction(
          internal.refinementActions.pollOpenAIRefinementBatch,
          {
            batchId,
            model,
          },
        )
      case 'groq':
        return ctx.runAction(
          internal.refinementActions.pollGroqRefinementBatch,
          {
            batchId,
            model,
          },
        )
      case 'google':
        return ctx.runAction(
          internal.refinementActions.pollGoogleRefinementBatch,
          {
            batchId,
            model,
          },
        )
      default:
        throw new Error(`Unknown provider for model ${model}`)
    }
  },
})

// ============================================================================
// Main Refinement Action
// ============================================================================

/**
 * Start refinement for palettes with tags.
 * Creates a new refinement cycle and submits batch to selected model.
 *
 * @param model - Refinement model to use (defaults to Opus 4.5)
 * @param sourcePromptVersions - Which tag analysis prompt versions to include (defaults to all)
 * @param limit - Max palettes to refine in this batch (defaults to 1000)
 */
export const startRefinement = action({
  args: {
    model: v.optional(vRefinementModel),
    sourcePromptVersions: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { model = 'claude-opus-4-5-20251101', sourcePromptVersions, limit = 1000 },
  ): Promise<{
    cycle: number
    batchId: string | null
    requestCount: number
    sourcePromptVersions: string[]
  }> => {
    // Get next cycle number
    const cycle: number = await ctx.runQuery(
      internal.refinement.getNextRefinementCycle,
      {},
    )
    // Use provided prompt versions or empty array (which means all versions)
    const targetPromptVersions = sourcePromptVersions ?? []

    console.log(
      `Starting refinement cycle ${cycle} (model: ${model}, source prompts: ${targetPromptVersions.length > 0 ? targetPromptVersions.map(v => v.slice(0, 8)).join(', ') : 'all'}, limit: ${limit})`,
    )

    // Submit refinement batch via router
    const result = await ctx.runAction(
      internal.refinementActions.submitRefinementBatch,
      {
        model,
        cycle,
        sourcePromptVersions: targetPromptVersions,
        limit,
      },
    )

    return {
      cycle,
      batchId: result?.batchId ?? null,
      requestCount: result?.requestCount ?? 0,
      sourcePromptVersions: targetPromptVersions,
    }
  },
})

// Maximum number of retry attempts before giving up
const MAX_REFINEMENT_RETRIES = 5

/**
 * Poll all active refinement batches.
 * Call this periodically to check batch status and fetch results.
 */
export const pollActiveRefinementBatches = action({
  args: {},
  handler: async (ctx) => {
    const activeBatches = await ctx.runQuery(
      api.refinement.getActiveRefinementBatches,
      {},
    )

    const results: Array<{
      batchId: string
      model: string
      status: string
      retryTriggered?: boolean
    }> = []

    for (const batch of activeBatches) {
      try {
        const pollResult = await ctx.runAction(
          internal.refinementActions.pollRefinementBatch,
          {
            batchId: batch.batchId,
            model: batch.model,
          },
        )

        let retryTriggered = false

        // Auto-retry on failures (but not if manually cancelled or max retries reached)
        if (pollResult.status === 'completed' && pollResult.failCount && pollResult.failCount > 0) {
          const batchRecord = await ctx.runQuery(
            internal.refinement.getRefinementBatchByBatchId,
            { batchId: batch.batchId },
          )

          // Don't retry if batch was manually cancelled
          const wasCancelled = batchRecord?.error?.includes('Cancelled by user')
          const currentRetryCount = batchRecord?.retryCount ?? 0

          if (wasCancelled) {
            console.log(`Batch ${batch.batchId} was cancelled by user - skipping auto-retry`)
          } else if (currentRetryCount >= MAX_REFINEMENT_RETRIES) {
            console.log(`Batch ${batch.batchId} has reached max retries (${MAX_REFINEMENT_RETRIES}) - skipping auto-retry`)
          } else {
            console.log(
              `Batch ${batch.batchId} completed with ${pollResult.failCount} failures. Triggering auto-retry (attempt ${currentRetryCount + 1}/${MAX_REFINEMENT_RETRIES})...`,
            )

            try {
              const sourcePromptVersions = batchRecord?.sourcePromptVersions ?? []
              const cycle = batchRecord?.cycle ?? 1

              const retryResult = await ctx.runAction(
                internal.refinementActions.retryFailedRefinements,
                {
                  model: batch.model,
                  sourcePromptVersions,
                  cycle,
                  limit: pollResult.failCount + 10,
                  retryCount: currentRetryCount + 1,
                },
              )

              if (retryResult?.batchId) {
                console.log(
                  `Auto-retry batch submitted: ${retryResult.batchId} with ${retryResult.requestCount} requests (cycle ${cycle}, retry ${retryResult.retryCount}/${MAX_REFINEMENT_RETRIES})`,
                )
                retryTriggered = true
              }
            } catch (retryError) {
              console.error(`Failed to trigger auto-retry for batch ${batch.batchId}:`, retryError)
            }
          }
        }

        results.push({
          batchId: batch.batchId,
          model: batch.model,
          status: pollResult.status,
          retryTriggered,
        })
      } catch (e) {
        console.error(`Error polling refinement batch ${batch.batchId}:`, e)
        results.push({
          batchId: batch.batchId,
          model: batch.model,
          status: 'error',
        })
      }
    }

    return results
  },
})

/**
 * Internal action for cron job to poll active refinement batches.
 * After a batch completes with failures, automatically triggers a retry.
 */
export const pollActiveRefinementBatchesInternal = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    polled: number
    completed?: number
    processing?: number
    errors?: number
    retriesTriggered?: number
  }> => {
    const activeBatches = await ctx.runQuery(
      api.refinement.getActiveRefinementBatches,
      {},
    )

    if (activeBatches.length === 0) {
      console.log('No active refinement batches to poll')
      return { polled: 0 }
    }

    console.log(`Polling ${activeBatches.length} active refinement batches...`)

    let completed = 0
    let processing = 0
    let errors = 0
    let retriesTriggered = 0

    for (const batch of activeBatches) {
      try {
        const pollResult = await ctx.runAction(
          internal.refinementActions.pollRefinementBatch,
          {
            batchId: batch.batchId,
            model: batch.model,
          },
        )

        if (pollResult.status === 'completed') {
          completed++

          // Check if there were failures and trigger auto-retry (but not if manually cancelled or max retries reached)
          if (pollResult.failCount && pollResult.failCount > 0) {
            const batchRecord = await ctx.runQuery(
              internal.refinement.getRefinementBatchByBatchId,
              { batchId: batch.batchId },
            )

            // Don't retry if batch was manually cancelled
            const wasCancelled = batchRecord?.error?.includes('Cancelled by user')
            const currentRetryCount = batchRecord?.retryCount ?? 0

            if (wasCancelled) {
              console.log(`Batch ${batch.batchId} was cancelled by user - skipping auto-retry`)
            } else if (currentRetryCount >= MAX_REFINEMENT_RETRIES) {
              console.log(`Batch ${batch.batchId} has reached max retries (${MAX_REFINEMENT_RETRIES}) - skipping auto-retry`)
            } else {
              console.log(
                `Batch ${batch.batchId} completed with ${pollResult.failCount} failures. Triggering auto-retry (attempt ${currentRetryCount + 1}/${MAX_REFINEMENT_RETRIES})...`,
              )

              try {
                const sourcePromptVersions = batchRecord?.sourcePromptVersions ?? []
                const cycle = batchRecord?.cycle ?? 1

                const retryResult = await ctx.runAction(
                  internal.refinementActions.retryFailedRefinements,
                  {
                    model: batch.model,
                    sourcePromptVersions,
                    cycle,
                    limit: pollResult.failCount + 10,
                    retryCount: currentRetryCount + 1,
                  },
                )

                if (retryResult?.batchId) {
                  console.log(
                    `Auto-retry batch submitted: ${retryResult.batchId} with ${retryResult.requestCount} requests (cycle ${cycle}, retry ${retryResult.retryCount}/${MAX_REFINEMENT_RETRIES})`,
                  )
                  retriesTriggered++
                }
              } catch (retryError) {
                console.error(`Failed to trigger auto-retry for batch ${batch.batchId}:`, retryError)
              }
            }
          }
        } else if (pollResult.status === 'processing') {
          processing++
        }
      } catch (e) {
        console.error(`Error polling refinement batch ${batch.batchId}:`, e)
        errors++
      }
    }

    console.log(
      `Refinement poll results: ${completed} completed, ${processing} processing, ${errors} errors, ${retriesTriggered} retries triggered`,
    )

    // Refresh stats cache if any batches completed
    if (completed > 0) {
      try {
        await ctx.runMutation(internal.refinement.refreshRefinementStatusCache, {})
        console.log('Stats cache refreshed after batch completion')
      } catch (e) {
        console.error('Failed to refresh stats cache:', e)
      }
    }

    return { polled: activeBatches.length, completed, processing, errors, retriesTriggered }
  },
})

/**
 * Retry failed refinements by deleting failed records and submitting a new batch.
 * This action is called automatically after a batch completes with failures.
 * Reuses the same cycle number since retries are part of completing the same cycle.
 */
export const retryFailedRefinements = internalAction({
  args: {
    model: vRefinementModel,
    sourcePromptVersions: v.array(v.string()),
    cycle: v.number(), // Reuse the same cycle
    limit: v.optional(v.number()),
    retryCount: v.optional(v.number()), // Current retry attempt (0 = first retry)
  },
  handler: async (
    ctx,
    { model, sourcePromptVersions, cycle, limit = 1000, retryCount = 0 },
  ): Promise<{ batchId: string; requestCount: number; cycle: number; retryCount: number } | null> => {
    // Get seeds that have failed refinements for this specific model
    const failedSeeds: string[] = await ctx.runQuery(
      internal.refinement.getFailedRefinementSeeds,
      { model, limit },
    )

    if (failedSeeds.length === 0) {
      console.log(`No failed refinements to retry for model ${model}`)
      return null
    }

    console.log(`Found ${failedSeeds.length} failed refinements to retry for model ${model} (cycle ${cycle})`)

    // Delete the failed records for this model so they can be retried
    const deleteResult = await ctx.runMutation(
      internal.refinement.deleteFailedRefinements,
      { model, seeds: failedSeeds },
    )
    console.log(`Deleted ${deleteResult.deleted} failed refinement records`)

    // Submit a new batch with the same cycle number and incremented retry count
    const result = await ctx.runAction(
      internal.refinementActions.submitRefinementBatch,
      {
        model,
        cycle,
        sourcePromptVersions,
        limit: failedSeeds.length + 10, // Small buffer
        retryCount,
      },
    )

    if (!result) {
      console.log('No palettes needed refinement after deleting failed records')
      return null
    }

    console.log(
      `Retry batch submitted: cycle=${cycle}, batchId=${result.batchId}, requests=${result.requestCount}, retryCount=${retryCount}`,
    )

    return {
      batchId: result.batchId,
      requestCount: result.requestCount,
      cycle,
      retryCount,
    }
  },
})

/**
 * Cancel a refinement batch by batchId
 * First marks the batch as failed in our DB (stops polling immediately),
 * then tries to cancel with the provider API
 */
export const cancelRefinement = action({
  args: {
    batchId: v.string(),
    model: v.optional(vRefinementModel),
  },
  returns: v.object({
    success: v.boolean(),
    actualStatus: v.optional(v.string()),
  }),
  handler: async (
    ctx,
    { batchId, model },
  ): Promise<{ success: boolean; actualStatus?: string }> => {
    // FIRST: Immediately mark as failed in our DB to stop the polling loop
    await ctx.runMutation(api.refinement.forceFailBatch, {
      batchId,
      reason: 'Cancelled by user',
    })

    // THEN: Try to cancel with the provider (best effort, don't fail if this errors)
    try {
      await ctx.runAction(
        internal.refinementActions.cancelRefinementBatch,
        {
          batchId,
          model,
        },
      )
    } catch (e) {
      console.log(`Provider cancel failed (batch already marked failed in DB): ${e}`)
    }

    return { success: true, actualStatus: 'cancelled' }
  },
})
