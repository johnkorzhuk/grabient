import { z } from 'zod'

// ============================================================================
// Tag Response Schema - used by batch actions to validate responses
// ============================================================================

export const tagResponseSchema = z.object({
  mood: z.array(z.string()),
  style: z.array(z.string()),
  dominant_colors: z.array(z.string()),
  temperature: z.enum(['warm', 'cool', 'neutral', 'cool-warm']),
  contrast: z.enum(['high', 'medium', 'low']),
  brightness: z.enum(['dark', 'light', 'medium', 'varied']),
  saturation: z.enum(['vibrant', 'muted', 'mixed']),
  seasonal: z.array(z.string()),
  associations: z.array(z.string()),
})

export type TagResponse = z.infer<typeof tagResponseSchema>
