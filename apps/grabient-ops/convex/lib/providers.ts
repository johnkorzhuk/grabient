import { z } from 'zod'

// ============================================================================
// Tag Response Schema - used by batch actions to validate responses
// ============================================================================

/**
 * Sanitize a string value to be safe for storage in Convex.
 * Convex only allows printable ASCII characters (0x20-0x7E) in field names.
 * Removes non-ASCII (Chinese, emoji, accented chars), control characters, and validates length.
 * Returns null if the string is invalid/corrupted.
 */
function sanitizeTagString(value: string): string | null {
  if (typeof value !== 'string') return null

  // Keep only printable ASCII (space through tilde: 0x20-0x7E)
  // This removes ALL non-ASCII including Chinese, emoji, accented chars, etc.
  let sanitized = value
    .replace(/[^\x20-\x7E]/g, ' ') // Replace non-ASCII with space
    .replace(/\s+/g, ' ') // Collapse multiple whitespace
    .trim()

  // Skip if empty after sanitization
  if (!sanitized || sanitized.length === 0) return null

  // Skip if too long (likely corrupted data)
  if (sanitized.length > 100) return null

  // Skip if it looks like corrupted JSON fragments
  if (/[{}\[\]"]/.test(sanitized) && sanitized.includes(':')) return null

  return sanitized
}

// Accept string, array, null, or undefined - be maximally tolerant
const flexibleString = z.union([z.string(), z.array(z.any()), z.null(), z.undefined()]).transform(val => {
  if (val === null || val === undefined) return '';
  if (Array.isArray(val)) {
    // Flatten and get first valid string
    const flat = val.flat(2).filter((v): v is string => typeof v === 'string');
    for (const s of flat) {
      const sanitized = sanitizeTagString(s)
      if (sanitized) return sanitized
    }
    return '';
  }
  return sanitizeTagString(val) ?? '';
});

// Accept string, array (possibly nested), null, or undefined
const flexibleArray = z.union([z.string(), z.array(z.any()), z.null(), z.undefined()]).transform(val => {
  if (val === null || val === undefined) return [];
  if (typeof val === 'string') {
    const sanitized = sanitizeTagString(val)
    return sanitized ? [sanitized] : [];
  }
  if (Array.isArray(val)) {
    // Flatten nested arrays, keep only valid sanitized strings
    return val
      .flat(2)
      .filter((v): v is string => typeof v === 'string')
      .map(s => sanitizeTagString(s))
      .filter((s): s is string => s !== null);
  }
  return [];
});

export const tagResponseSchema = z.object({
  mood: flexibleArray,
  style: flexibleArray,
  dominant_colors: flexibleArray,
  harmony: flexibleArray,
  temperature: flexibleString,
  contrast: flexibleString,
  brightness: flexibleString,
  saturation: flexibleString,
  seasonal: flexibleArray,
  associations: flexibleArray,
})

export type TagResponse = z.infer<typeof tagResponseSchema>

// ============================================================================
// Normalize LLM output to fix common mistakes before validation
// ============================================================================

const SATURATION_MAP: Record<string, string> = {
  // Common mistakes -> correct value
  'high': 'vibrant',
  'bright': 'vibrant',
  'vivid': 'vibrant',
  'saturated': 'vibrant',
  'intense': 'vibrant',
  'rich': 'vibrant',
  'low': 'muted',
  'dull': 'muted',
  'desaturated': 'muted',
  'soft': 'muted',
  'pastel': 'muted',
  'subtle': 'muted',
  'moderate': 'mixed',
  'medium': 'mixed',
  'varied': 'mixed',
  'variable': 'mixed',
}

const BRIGHTNESS_MAP: Record<string, string> = {
  // Common mistakes -> correct value
  'bright': 'light',
  'pale': 'light',
  'very light': 'light',
  'dim': 'dark',
  'deep': 'dark',
  'very dark': 'dark',
  'moderate': 'medium',
  'mid': 'medium',
  'average': 'medium',
  'mixed': 'varied',
  'variable': 'varied',
  'contrast': 'varied',
}

const TEMPERATURE_MAP: Record<string, string> = {
  // Common mistakes -> correct value
  'mixed': 'cool-warm',
  'both': 'cool-warm',
  'balanced': 'neutral',
  'grey': 'neutral',
  'gray': 'neutral',
}

const CONTRAST_MAP: Record<string, string> = {
  // Common mistakes -> correct value
  'strong': 'high',
  'intense': 'high',
  'moderate': 'medium',
  'mid': 'medium',
  'subtle': 'low',
  'soft': 'low',
  'minimal': 'low',
}

/**
 * Normalize LLM output to fix common enum mistakes before validation.
 * Returns a new object with normalized values.
 */
export function normalizeTagResponse(raw: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...raw }

  // Normalize saturation
  if (typeof normalized.saturation === 'string') {
    const lower = normalized.saturation.toLowerCase().trim()
    normalized.saturation = SATURATION_MAP[lower] ?? lower
  }

  // Normalize brightness
  if (typeof normalized.brightness === 'string') {
    const lower = normalized.brightness.toLowerCase().trim()
    normalized.brightness = BRIGHTNESS_MAP[lower] ?? lower
  }

  // Normalize temperature
  if (typeof normalized.temperature === 'string') {
    const lower = normalized.temperature.toLowerCase().trim()
    normalized.temperature = TEMPERATURE_MAP[lower] ?? lower
  }

  // Normalize contrast
  if (typeof normalized.contrast === 'string') {
    const lower = normalized.contrast.toLowerCase().trim()
    normalized.contrast = CONTRAST_MAP[lower] ?? lower
  }

  // Ensure arrays exist (fix undefined -> empty array)
  if (normalized.associations === undefined || normalized.associations === null) {
    normalized.associations = []
  }
  if (normalized.seasonal === undefined || normalized.seasonal === null) {
    normalized.seasonal = []
  }
  if (normalized.mood === undefined || normalized.mood === null) {
    normalized.mood = []
  }
  if (normalized.style === undefined || normalized.style === null) {
    normalized.style = []
  }
  if (normalized.dominant_colors === undefined || normalized.dominant_colors === null) {
    normalized.dominant_colors = []
  }
  if (normalized.harmony === undefined || normalized.harmony === null) {
    normalized.harmony = []
  }

  return normalized
}
