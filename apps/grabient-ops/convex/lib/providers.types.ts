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
 * Models by provider - the source of truth for all model configurations
 */
export const PROVIDER_MODELS = {
  anthropic: ['claude-3-5-haiku-20241022'],
  openai: ['gpt-4o-mini', 'gpt-5-nano'],
  groq: [
    'llama-3.3-70b-versatile',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'qwen/qwen3-32b',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
  ],
  google: ['gemini-2.0-flash', 'gemini-2.5-flash-lite'],
} as const satisfies Record<Provider, readonly string[]>

/**
 * All model names as a union type
 */
export type Model = (typeof PROVIDER_MODELS)[Provider][number]

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
 * Convex validator for all possible model values
 * Note: This is a string validator since models vary by provider
 * Use runtime validation with isValidModel() for stricter checks
 */
export const vModel = v.string()

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
