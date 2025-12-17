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
  'claude-opus-4-5-20251101',
  'openai/gpt-oss-120b',
  'llama-3.1-8b-instant',
  'qwen/qwen3-32b',
  'gpt-5-nano',
])

/**
 * Get tagging models filtered by blacklist
 */
export function getActiveTaggingModels(): Array<{
  provider: Provider
  model: Model
}> {
  return getAllModels().filter(
    ({ model }) => !BLACKLISTED_TAGGING_MODELS.has(model),
  )
}

/**
 * Get refinement models filtered by blacklist
 */
export function getActiveRefinementModels(): Array<{
  provider: RefinementProvider
  model: RefinementModel
}> {
  return getAllRefinementModels().filter(
    ({ model }) => !BLACKLISTED_REFINEMENT_MODELS.has(model),
  )
}

// ============================================================================
// Painter Models (for two-stage generation pipeline)
// Used for both Composer (batched) and Painter (streaming) stages
// ============================================================================

/**
 * Painter models with keys for identification
 * These match the active refinement models (excluding blacklisted ones)
 */
export const PAINTER_MODELS = [
  // Anthropic
  {
    key: 'claude-3-5-haiku',
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic' as const,
  },
  // OpenAI
  {
    key: 'gpt-5-mini',
    id: 'gpt-5-mini',
    name: 'GPT-5 Mini',
    provider: 'openai' as const,
  },
  {
    key: 'gpt-4.1-mini',
    id: 'gpt-4.1-mini',
    name: 'GPT-4.1 Mini',
    provider: 'openai' as const,
  },
  // Groq
  {
    key: 'kimi-k2',
    id: 'moonshotai/kimi-k2-instruct',
    name: 'Kimi K2',
    provider: 'groq' as const,
  },
  {
    key: 'llama-3.3-70b',
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B',
    provider: 'groq' as const,
  },
  {
    key: 'llama-4-scout',
    id: 'meta-llama/llama-4-scout-17b-16e-instruct',
    name: 'Llama 4 Scout',
    provider: 'groq' as const,
  },
  {
    key: 'llama-4-maverick',
    id: 'meta-llama/llama-4-maverick-17b-128e-instruct',
    name: 'Llama 4 Maverick',
    provider: 'groq' as const,
  },
  {
    key: 'gpt-oss-20b',
    id: 'openai/gpt-oss-20b',
    name: 'GPT-OSS 20B',
    provider: 'groq' as const,
  },
  {
    key: 'qwen3-32b',
    id: 'qwen/qwen3-32b',
    name: 'Qwen3 32B',
    provider: 'groq' as const,
  },
  {
    key: 'gpt-oss-120b',
    id: 'openai/gpt-oss-120b',
    name: 'GPT-OSS 120B',
    provider: 'groq' as const,
  },
  // Google (direct API)
  {
    key: 'gemini-2.0-flash',
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'google' as const,
  },
  {
    key: 'gemini-flash-lite',
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    provider: 'google' as const,
  },
] as const

export type PainterModelKey = (typeof PAINTER_MODELS)[number]['key']
export type PainterProvider = 'anthropic' | 'groq' | 'openai' | 'google'

/**
 * Convex validator for painter model keys
 */
export const vPainterModelKey = v.union(
  // Anthropic
  v.literal('claude-3-5-haiku'),
  // OpenAI
  v.literal('gpt-5-mini'),
  v.literal('gpt-4.1-mini'),
  // Groq
  v.literal('kimi-k2'),
  v.literal('llama-3.3-70b'),
  v.literal('llama-4-scout'),
  v.literal('llama-4-maverick'),
  v.literal('gpt-oss-20b'),
  v.literal('qwen3-32b'),
  v.literal('gpt-oss-120b'),
  // Google (via OpenRouter)
  v.literal('gemini-2.0-flash'),
  v.literal('gemini-flash-lite'),
)

/**
 * Convex validator for painter provider
 */
export const vPainterProvider = v.union(
  v.literal('anthropic'),
  v.literal('groq'),
  v.literal('openai'),
  v.literal('google'),
)

/**
 * Palette style type (matching user-application)
 */
export const PALETTE_STYLES = [
  'angularGradient',
  'angularSwatches',
  'linearGradient',
  'linearSwatches',
  'deepFlow',
] as const
export type PaletteStyle = (typeof PALETTE_STYLES)[number]

export const vPaletteStyle = v.union(
  v.literal('angularGradient'),
  v.literal('angularSwatches'),
  v.literal('linearGradient'),
  v.literal('linearSwatches'),
  v.literal('deepFlow'),
)

/**
 * Palette angles
 */
export const PALETTE_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315] as const
export type PaletteAngle = (typeof PALETTE_ANGLES)[number]

export const vPaletteAngle = v.union(
  v.literal(0),
  v.literal(45),
  v.literal(90),
  v.literal(135),
  v.literal(180),
  v.literal(225),
  v.literal(270),
  v.literal(315),
)
