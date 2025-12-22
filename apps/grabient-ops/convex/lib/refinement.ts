'use node'

import { z } from 'zod'
import type { ColorData } from './colorData'

// Re-export prompt and version from prompts.ts for convenience
export { REFINEMENT_SYSTEM_PROMPT, REFINEMENT_PROMPT_VERSION } from './prompts'

// ============================================================================
// Refined Tags Schema
// ============================================================================

// Schema for LLM refinement output
// LLM refines subjective fields (mood, style, harmony, seasonal, associations)
// Color names are computed algorithmically from hex values, not by LLM
// embed_text is constructed programmatically from consensus + LLM output + colorNames
export const refinedTagsSchema = z.object({
  mood: z.array(z.string()).optional(),
  style: z.array(z.string()).optional(),
  harmony: z.array(z.string()).optional(),
  seasonal: z.array(z.string()).optional(),
  associations: z.array(z.string()).optional(),
})

export type RefinedTags = z.infer<typeof refinedTagsSchema>

// ============================================================================
// Embed Text Construction
// ============================================================================

/**
 * Get top value from a frequency array (highest consensus)
 */
function getTopValue(frequencies: FrequencyArray): string | null {
  if (frequencies.length === 0) return null
  const sorted = [...frequencies].sort((a, b) => b.value - a.value)
  return sorted[0].key
}

/**
 * Build embed_text programmatically from consensus data + LLM-refined tags + color names + harmony.
 *
 * Order: categorical values, harmony (algorithmic), colorNames (at ~1/3), mood, style, seasonal, associations
 * Target: up to 120 words
 *
 * Note: Harmony tags are now computed algorithmically using OkLCh color space analysis,
 * not from LLM refinement, for more accurate color theory-based detection.
 */
export function buildEmbedText(
  consensus: {
    categorical: TagSummary['categorical']
  },
  refined: {
    mood?: string[]
    style?: string[]
    seasonal?: string[]
    associations?: string[]
  },
  colorNames: string[],
  harmonyTags: string[] = [],
): string {
  const parts: string[] = []

  // Categorical values from consensus (single top value each)
  const temperature = getTopValue(consensus.categorical.temperature)
  const contrast = getTopValue(consensus.categorical.contrast)
  const brightness = getTopValue(consensus.categorical.brightness)
  const saturation = getTopValue(consensus.categorical.saturation)

  if (temperature) parts.push(temperature)
  if (contrast) parts.push(contrast)
  if (brightness) parts.push(brightness)
  if (saturation) parts.push(saturation)

  // Harmony from algorithmic detection (OkLCh color space analysis)
  if (harmonyTags.length > 0) {
    parts.push(...harmonyTags)
  }

  // Color names from algorithmic conversion (deduped, ~1/3 into text)
  if (colorNames.length > 0) {
    parts.push(...colorNames)
  }

  // Mood from LLM refinement (all of them)
  if (refined.mood && refined.mood.length > 0) {
    parts.push(...refined.mood)
  }

  // Style from LLM refinement (all of them)
  if (refined.style && refined.style.length > 0) {
    parts.push(...refined.style)
  }

  // Seasonal from LLM refinement (all of them)
  if (refined.seasonal && refined.seasonal.length > 0) {
    parts.push(...refined.seasonal)
  }

  // Associations from LLM refinement (all of them)
  if (refined.associations && refined.associations.length > 0) {
    parts.push(...refined.associations)
  }

  // Join and trim to ~120 words max if needed
  let embedText = parts.join(' ')
  const words = embedText.split(/\s+/)
  if (words.length > 120) {
    embedText = words.slice(0, 120).join(' ')
  }

  return embedText
}

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

/**
 * Normalize LLM refinement output - ensures required fields exist
 */
export function normalizeRefinedTags(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...raw }

  // Ensure array fields are arrays (or empty arrays)
  if (!Array.isArray(normalized.mood)) {
    normalized.mood = []
  }
  if (!Array.isArray(normalized.style)) {
    normalized.style = []
  }
  if (!Array.isArray(normalized.harmony)) {
    normalized.harmony = []
  }
  if (!Array.isArray(normalized.seasonal)) {
    normalized.seasonal = []
  }
  if (!Array.isArray(normalized.associations)) {
    normalized.associations = []
  }

  return normalized
}
