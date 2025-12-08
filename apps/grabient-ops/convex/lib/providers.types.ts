import { v } from 'convex/values'

// ============================================================================
// Provider and Model Type Definitions
// ============================================================================

/**
 * All supported providers
 */
export const PROVIDERS = ['anthropic', 'openai', 'groq', 'google'] as const
export type Provider = (typeof PROVIDERS)[number]

/**
 * Model definitions by provider - for tagging
 */
export const ANTHROPIC_MODELS = ['claude-3-5-haiku-20241022'] as const
export const OPENAI_MODELS = ['gpt-4o-mini', 'gpt-5-nano'] as const
export const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'qwen/qwen3-32b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
] as const
export const GOOGLE_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.5-flash-lite',
] as const

/**
 * Model union types by provider
 */
export type AnthropicModel = (typeof ANTHROPIC_MODELS)[number]
export type OpenAIModel = (typeof OPENAI_MODELS)[number]
export type GroqModel = (typeof GROQ_MODELS)[number]
export type GoogleModel = (typeof GOOGLE_MODELS)[number]

/**
 * All model names as a union type
 */
export type Model = AnthropicModel | OpenAIModel | GroqModel | GoogleModel

/**
 * Models by provider - the source of truth for all model configurations
 */
export const PROVIDER_MODELS: {
  anthropic: readonly AnthropicModel[]
  openai: readonly OpenAIModel[]
  groq: readonly GroqModel[]
  google: readonly GoogleModel[]
} = {
  anthropic: ANTHROPIC_MODELS,
  openai: OPENAI_MODELS,
  groq: GROQ_MODELS,
  google: GOOGLE_MODELS,
}

/**
 * Get all models as a flat array with provider info
 */
export function getAllModels(): Array<{ provider: Provider; model: Model }> {
  const result: Array<{ provider: Provider; model: Model }> = []
  for (const provider of PROVIDERS) {
    for (const model of PROVIDER_MODELS[provider]) {
      result.push({ provider, model: model as Model })
    }
  }
  return result
}

/**
 * Get models for a specific provider
 */
export function getModelsForProvider<P extends Provider>(
  provider: P,
): (typeof PROVIDER_MODELS)[P] {
  return PROVIDER_MODELS[provider]
}

/**
 * Check if a string is a valid provider
 */
export function isValidProvider(value: string): value is Provider {
  return PROVIDERS.includes(value as Provider)
}

/**
 * Check if a string is a valid model for a provider
 */
export function isValidModel(
  provider: Provider,
  model: string,
): model is Model {
  return (PROVIDER_MODELS[provider] as readonly string[]).includes(model)
}

// ============================================================================
// Convex Validators
// ============================================================================

/**
 * Convex validator for provider field
 */
export const vProvider = v.union(
  v.literal('anthropic'),
  v.literal('openai'),
  v.literal('groq'),
  v.literal('google'),
)

/**
 * All valid model names as a flat array
 */
export const ALL_MODELS = [
  ...PROVIDER_MODELS.anthropic,
  ...PROVIDER_MODELS.openai,
  ...PROVIDER_MODELS.groq,
  ...PROVIDER_MODELS.google,
] as const

/**
 * Convex validator for all possible model values
 */
export const vModel = v.union(
  // Anthropic
  v.literal('claude-3-5-haiku-20241022'),
  // OpenAI
  v.literal('gpt-4o-mini'),
  v.literal('gpt-5-nano'),
  // Groq
  v.literal('llama-3.3-70b-versatile'),
  v.literal('llama-3.1-8b-instant'),
  v.literal('meta-llama/llama-4-scout-17b-16e-instruct'),
  v.literal('meta-llama/llama-4-maverick-17b-128e-instruct'),
  v.literal('qwen/qwen3-32b'),
  v.literal('openai/gpt-oss-120b'),
  v.literal('openai/gpt-oss-20b'),
  // Google
  v.literal('gemini-2.0-flash'),
  v.literal('gemini-2.5-flash-lite'),
)

/**
 * Convex validator for batch status
 */
export const vBatchStatus = v.union(
  v.literal('pending'),
  v.literal('processing'),
  v.literal('completed'),
  v.literal('failed'),
)
export type BatchStatus = 'pending' | 'processing' | 'completed' | 'failed'

// ============================================================================
// Refinement Models
// ============================================================================

/**
 * Models used for refinement - includes all tagging models plus premium options
 *
 * Premium (reasoning/thinking):
 * - claude-opus-4-5-20251101: Claude Opus 4.5 with extended thinking (2048 budget)
 * - gpt-5-mini: Best quality within budget ($2/1M output)
 * - gpt-4.1-mini: Fast, beats GPT-4o (~$1.60/1M output)
 *
 * Groq (with thinking/reasoning support):
 * - qwen/qwen3-32b: Qwen 3 32B with reasoning_effort: 'default'
 * - openai/gpt-oss-120b: GPT-OSS 120B with reasoning_effort: 'medium'
 *
 * Groq (fast/cheap, no thinking):
 * - moonshotai/kimi-k2-instruct: Kimi K2 (256k context, fast)
 *
 * Tagging models (also available for refinement):
 * - All models from ANTHROPIC_MODELS, OPENAI_MODELS, GROQ_MODELS, GOOGLE_MODELS
 */
export const REFINEMENT_ANTHROPIC_MODELS = [
  'claude-opus-4-5-20251101',
  ...ANTHROPIC_MODELS,
] as const
export const REFINEMENT_OPENAI_MODELS = [
  'gpt-5-mini',
  'gpt-4.1-mini',
  ...OPENAI_MODELS,
] as const
export const REFINEMENT_GROQ_MODELS = [
  'moonshotai/kimi-k2-instruct',
  ...GROQ_MODELS,
] as const
export const REFINEMENT_GOOGLE_MODELS = [...GOOGLE_MODELS] as const

export const REFINEMENT_MODELS = [
  ...REFINEMENT_ANTHROPIC_MODELS,
  ...REFINEMENT_OPENAI_MODELS,
  ...REFINEMENT_GROQ_MODELS,
  ...REFINEMENT_GOOGLE_MODELS,
] as const
export type RefinementModel = (typeof REFINEMENT_MODELS)[number]

/**
 * Convex validator for refinement model
 */
export const vRefinementModel = v.union(
  // Premium Anthropic
  v.literal('claude-opus-4-5-20251101'),
  // Tagging Anthropic
  v.literal('claude-3-5-haiku-20241022'),
  // Premium OpenAI
  v.literal('gpt-5-mini'),
  v.literal('gpt-4.1-mini'),
  // Tagging OpenAI
  v.literal('gpt-4o-mini'),
  v.literal('gpt-5-nano'),
  // Groq (premium + tagging)
  v.literal('moonshotai/kimi-k2-instruct'),
  v.literal('llama-3.3-70b-versatile'),
  v.literal('llama-3.1-8b-instant'),
  v.literal('meta-llama/llama-4-scout-17b-16e-instruct'),
  v.literal('meta-llama/llama-4-maverick-17b-128e-instruct'),
  v.literal('qwen/qwen3-32b'),
  v.literal('openai/gpt-oss-120b'),
  v.literal('openai/gpt-oss-20b'),
  // Google
  v.literal('gemini-2.0-flash'),
  v.literal('gemini-2.5-flash-lite'),
)

/**
 * Refinement providers - includes Google for tagging models
 */
export const REFINEMENT_PROVIDERS = [
  'anthropic',
  'openai',
  'groq',
  'google',
] as const
export type RefinementProvider = (typeof REFINEMENT_PROVIDERS)[number]

export const vRefinementProvider = v.union(
  v.literal('anthropic'),
  v.literal('openai'),
  v.literal('groq'),
  v.literal('google'),
)

/**
 * Map refinement model to provider
 */
export const REFINEMENT_MODEL_PROVIDER: Record<
  RefinementModel,
  RefinementProvider
> = {
  // Anthropic
  'claude-opus-4-5-20251101': 'anthropic',
  'claude-3-5-haiku-20241022': 'anthropic',
  // OpenAI
  'gpt-5-mini': 'openai',
  'gpt-4.1-mini': 'openai',
  'gpt-4o-mini': 'openai',
  'gpt-5-nano': 'openai',
  // Groq
  'moonshotai/kimi-k2-instruct': 'groq',
  'llama-3.3-70b-versatile': 'groq',
  'llama-3.1-8b-instant': 'groq',
  'meta-llama/llama-4-scout-17b-16e-instruct': 'groq',
  'meta-llama/llama-4-maverick-17b-128e-instruct': 'groq',
  'qwen/qwen3-32b': 'groq',
  'openai/gpt-oss-120b': 'groq',
  'openai/gpt-oss-20b': 'groq',
  // Google
  'gemini-2.0-flash': 'google',
  'gemini-2.5-flash-lite': 'google',
}

/**
 * Groq models that support reasoning_effort parameter
 * Maps model to the appropriate reasoning_effort value
 * Valid values: 'none' or 'default' only
 */
export const GROQ_REASONING_EFFORT: Partial<Record<RefinementModel, string>> = {
  'qwen/qwen3-32b': 'none',
}

/**
 * Groq models that support reasoning_format=raw parameter
 * Only some models support exposing their reasoning in <think> tags
 */
export const GROQ_REASONING_FORMAT_SUPPORTED: Set<RefinementModel> = new Set([
  'qwen/qwen3-32b',
])

/**
 * Get all refinement models with provider info
 */
export function getAllRefinementModels(): Array<{
  provider: RefinementProvider
  model: RefinementModel
}> {
  return REFINEMENT_MODELS.map((model) => ({
    provider: REFINEMENT_MODEL_PROVIDER[model],
    model,
  }))
}

// ============================================================================
// Model Blacklists - Models to hide from UI (but keep in schema for data)
// ============================================================================

/**
 * Models blacklisted from tagging UI.
 * These models exist in the schema (for legacy data) but should not be shown
 * in dropdowns or used for new tagging jobs.
 */
export const BLACKLISTED_TAGGING_MODELS: Set<Model> = new Set([
  'openai/gpt-oss-120b',
])

/**
 * Models blacklisted from refinement UI.
 * These models exist in the schema (for legacy data) but should not be shown
 * in dropdowns or used for new refinement jobs.
 */
export const BLACKLISTED_REFINEMENT_MODELS: Set<RefinementModel> = new Set([
  'openai/gpt-oss-120b',
  'llama-3.1-8b-instant',
  'qwen/qwen3-32b',
  'gpt-5-nano',
])

/**
 * Get tagging models filtered by blacklist
 */
export function getActiveTaggingModels(): Array<{ provider: Provider; model: Model }> {
  return getAllModels().filter(({ model }) => !BLACKLISTED_TAGGING_MODELS.has(model))
}

/**
 * Get refinement models filtered by blacklist
 */
export function getActiveRefinementModels(): Array<{
  provider: RefinementProvider
  model: RefinementModel
}> {
  return getAllRefinementModels().filter(
    ({ model }) => !BLACKLISTED_REFINEMENT_MODELS.has(model)
  )
}
