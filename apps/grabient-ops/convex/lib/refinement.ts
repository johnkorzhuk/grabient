'use node'

import { z } from 'zod'
import type { ColorData } from './colorData'

// Re-export prompt and version from prompts.ts for convenience
export { REFINEMENT_SYSTEM_PROMPT, REFINEMENT_PROMPT_VERSION } from './prompts'

// ============================================================================
// Refined Tags Schema
// ============================================================================

export const refinedTagsSchema = z.object({
  // Categorical attributes (single values) - optional, we only require embed_text
  temperature: z.enum(['warm', 'cool', 'neutral', 'cool-warm']).optional(),
  contrast: z.enum(['high', 'medium', 'low']).optional(),
  brightness: z.enum(['dark', 'light', 'medium', 'varied']).optional(),
  saturation: z.enum(['vibrant', 'muted', 'mixed']).optional(),

  // Curated tag arrays
  harmony: z.array(z.string()).min(1).max(2), // Required: 1-2 color harmony tags
  mood: z.array(z.string()).optional(),
  style: z.array(z.string()).optional(),
  dominant_colors: z.array(z.string()).optional(),
  seasonal: z.array(z.string()).optional(),
  associations: z.array(z.string()).optional(),

  // Canonical tag string for embedding - REQUIRED
  embed_text: z.string(),
})

export type RefinedTags = z.infer<typeof refinedTagsSchema>

// ============================================================================
// Tag Summary - aggregated consensus data sent to refinement model
// ============================================================================

/**
 * Frequency entry using array format to avoid Convex field name restrictions.
 * AI-generated tags may contain non-ASCII characters which are invalid as field names.
 */
export type FrequencyEntry = { key: string; value: number }
export type FrequencyArray = FrequencyEntry[]

export interface TagSummary {
  seed: string
  paletteId: string
  colorData: ColorData
  imageUrl: string
  totalModels: number
  sourcePromptVersion: string
  categorical: {
    temperature: FrequencyArray
    contrast: FrequencyArray
    brightness: FrequencyArray
    saturation: FrequencyArray
  }
  tags: {
    harmony: FrequencyArray
    mood: FrequencyArray
    style: FrequencyArray
    dominant_colors: FrequencyArray
    seasonal: FrequencyArray
    associations: FrequencyArray
  }
}

// ============================================================================
// Refinement Prompt Builder
// ============================================================================

/**
 * Format frequency data for display in prompt.
 * Accepts FrequencyArray format (array of {key, value} objects).
 */
function formatFrequencies(
  data: FrequencyArray,
  totalModels: number,
): string {
  return (
    [...data]
      .sort((a, b) => b.value - a.value)
      .map((entry) => `${entry.key}: ${entry.value}/${totalModels}`)
      .join(', ') || 'none'
  )
}

/**
 * Create the text portion of the refinement prompt
 */
export function createRefinementPromptText(summary: TagSummary): string {
  return `## Palette Color Data
\`\`\`json
${JSON.stringify(summary.colorData, null, 2)}
\`\`\`

## Model Consensus Data (${summary.totalModels} models)

### Categorical Attributes
- Temperature: ${formatFrequencies(summary.categorical.temperature, summary.totalModels)}
- Contrast: ${formatFrequencies(summary.categorical.contrast, summary.totalModels)}
- Brightness: ${formatFrequencies(summary.categorical.brightness, summary.totalModels)}
- Saturation: ${formatFrequencies(summary.categorical.saturation, summary.totalModels)}

### Tag Frequencies
- Harmony: ${formatFrequencies(summary.tags.harmony, summary.totalModels)}
- Mood: ${formatFrequencies(summary.tags.mood, summary.totalModels)}
- Style: ${formatFrequencies(summary.tags.style, summary.totalModels)}
- Dominant Colors: ${formatFrequencies(summary.tags.dominant_colors, summary.totalModels)}
- Seasonal: ${formatFrequencies(summary.tags.seasonal, summary.totalModels)}
- Associations: ${formatFrequencies(summary.tags.associations, summary.totalModels)}

Review the color data (hex values, RGB) and model consensus above. Refine the tags into canonical forms. Return only JSON.`
}

/**
 * Create the full message content array for Anthropic API.
 * Note: Image URLs are disabled for batch API as R2 URLs may not be accessible.
 * The color data and model consensus provide sufficient context for refinement.
 */
export function createRefinementMessageContent(
  summary: TagSummary,
): Array<{ type: 'text'; text: string }> {
  // Note: We don't include images in batch requests because:
  // 1. R2 URLs may not be accessible to Anthropic's servers
  // 2. The color data (hex values, RGB) provides equivalent information
  // 3. The model consensus already captures visual attributes

  return [
    {
      type: 'text',
      text: createRefinementPromptText(summary),
    },
  ]
}

/**
 * Legacy function for text-only prompts (kept for compatibility)
 * @deprecated Use createRefinementMessageContent for full image support
 */
export function createRefinementPrompt(summary: TagSummary): string {
  return createRefinementPromptText(summary)
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Strip markdown code fence if present
 */
export function stripMarkdownFence(text: string): string {
  let jsonText = text.trim()
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.slice(7)
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.slice(3)
  }
  if (jsonText.endsWith('```')) {
    jsonText = jsonText.slice(0, -3)
  }
  return jsonText.trim()
}

/**
 * Extract JSON from response text (handles thinking tags, code fences, etc.)
 */
export function extractJson(text: string): string {
  let cleaned = text.trim()
  // Remove thinking tags if present
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

  // Try to extract from code fence - use greedy match inside for complete content
  // Match ```json or ``` followed by content and closing ```
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (fenceMatch && fenceMatch[1]) {
    const extracted = fenceMatch[1].trim()
    // Verify it looks like JSON before returning
    if (extracted.startsWith('{') || extracted.startsWith('[')) {
      return extracted
    }
  }

  // Try alternative: find JSON object directly (handles incomplete fences)
  // This looks for the outermost { } pair
  const jsonStart = cleaned.indexOf('{')
  if (jsonStart !== -1) {
    // Find matching closing brace by counting
    let depth = 0
    let inString = false
    let escape = false
    for (let i = jsonStart; i < cleaned.length; i++) {
      const char = cleaned[i]
      if (escape) {
        escape = false
        continue
      }
      if (char === '\\' && inString) {
        escape = true
        continue
      }
      if (char === '"' && !escape) {
        inString = !inString
        continue
      }
      if (!inString) {
        if (char === '{') depth++
        else if (char === '}') {
          depth--
          if (depth === 0) {
            return cleaned.slice(jsonStart, i + 1)
          }
        }
      }
    }
  }

  // Fallback: return cleaned text and let JSON.parse fail with helpful error
  return cleaned
}

// ============================================================================
// Normalization for Refinement Output
// ============================================================================

const SATURATION_MAP: Record<string, string> = {
  high: 'vibrant',
  bright: 'vibrant',
  vivid: 'vibrant',
  saturated: 'vibrant',
  intense: 'vibrant',
  rich: 'vibrant',
  low: 'muted',
  dull: 'muted',
  desaturated: 'muted',
  soft: 'muted',
  pastel: 'muted',
  subtle: 'muted',
  moderate: 'mixed',
  medium: 'mixed',
  varied: 'mixed',
  variable: 'mixed',
}

const BRIGHTNESS_MAP: Record<string, string> = {
  bright: 'light',
  pale: 'light',
  'very light': 'light',
  dim: 'dark',
  deep: 'dark',
  'very dark': 'dark',
  moderate: 'medium',
  mid: 'medium',
  average: 'medium',
  mixed: 'varied',
  variable: 'varied',
  contrast: 'varied',
}

const TEMPERATURE_MAP: Record<string, string> = {
  mixed: 'cool-warm',
  both: 'cool-warm',
  balanced: 'neutral',
  grey: 'neutral',
  gray: 'neutral',
}

const CONTRAST_MAP: Record<string, string> = {
  strong: 'high',
  intense: 'high',
  moderate: 'medium',
  mid: 'medium',
  subtle: 'low',
  soft: 'low',
  minimal: 'low',
}

// Valid enum values for each categorical field
const VALID_TEMPERATURE = new Set(['warm', 'cool', 'neutral', 'cool-warm'])
const VALID_CONTRAST = new Set(['high', 'medium', 'low'])
const VALID_BRIGHTNESS = new Set(['dark', 'light', 'medium', 'varied'])
const VALID_SATURATION = new Set(['vibrant', 'muted', 'mixed'])

/**
 * Normalize refinement output - we only require embed_text.
 * All other fields are optional and will be passed through if valid.
 * Invalid categorical values are removed to prevent validation errors.
 */
export function normalizeRefinedTags(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...raw }

  // Ensure embed_text exists and is a string
  if (typeof normalized.embed_text !== 'string') {
    normalized.embed_text = ''
  }

  // Normalize saturation
  if (typeof normalized.saturation === 'string') {
    const lower = normalized.saturation.toLowerCase().trim()
    const mapped = SATURATION_MAP[lower] ?? lower
    if (VALID_SATURATION.has(mapped)) {
      normalized.saturation = mapped
    } else {
      delete normalized.saturation
    }
  } else if (normalized.saturation !== undefined) {
    delete normalized.saturation
  }

  // Normalize brightness
  if (typeof normalized.brightness === 'string') {
    const lower = normalized.brightness.toLowerCase().trim()
    const mapped = BRIGHTNESS_MAP[lower] ?? lower
    if (VALID_BRIGHTNESS.has(mapped)) {
      normalized.brightness = mapped
    } else {
      delete normalized.brightness
    }
  } else if (normalized.brightness !== undefined) {
    delete normalized.brightness
  }

  // Normalize temperature
  if (typeof normalized.temperature === 'string') {
    const lower = normalized.temperature.toLowerCase().trim()
    const mapped = TEMPERATURE_MAP[lower] ?? lower
    if (VALID_TEMPERATURE.has(mapped)) {
      normalized.temperature = mapped
    } else {
      delete normalized.temperature
    }
  } else if (normalized.temperature !== undefined) {
    delete normalized.temperature
  }

  // Normalize contrast
  if (typeof normalized.contrast === 'string') {
    const lower = normalized.contrast.toLowerCase().trim()
    const mapped = CONTRAST_MAP[lower] ?? lower
    if (VALID_CONTRAST.has(mapped)) {
      normalized.contrast = mapped
    } else {
      delete normalized.contrast
    }
  } else if (normalized.contrast !== undefined) {
    delete normalized.contrast
  }

  // Remove any problematic fields that might cause validation errors
  delete normalized.mappings

  return normalized
}
