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
 * Model definitions by provider
 */
export const ANTHROPIC_MODELS = ['claude-3-5-haiku-20241022'] as const
export const OPENAI_MODELS = ['gpt-4o-mini', 'gpt-5-nano'] as const
export const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'qwen/qwen3-32b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
] as const
export const GOOGLE_MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash-lite'] as const

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
export function isValidModel(provider: Provider, model: string): model is Model {
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
  v.literal('meta-llama/llama-4-scout-17b-16e-instruct'),
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
