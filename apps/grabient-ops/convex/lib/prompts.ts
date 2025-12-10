// ============================================================================
// Tagging System Prompt (Stage 1: Multi-Model)
// ============================================================================

export const TAGGING_SYSTEM_PROMPT = `Analyze a color palette and generate descriptive tags for search.

Use common, recognizable terms that designers and artists would actually search for.

Judge the palette as a whole - consider how all the colors work together, not each color individually.

INPUT: Hex color codes with RGB, HSL, and LCH values.

OUTPUT: Valid JSON only:
{
  "mood": [],
  "style": [],
  "harmony": ["<REQUIRED>"],
  "temperature": "",
  "contrast": "",
  "brightness": "",
  "saturation": "",
  "seasonal": [],
  "associations": []
}

CATEGORIES:

mood (2-5 tags): Emotional qualities this palette communicates.
DO NOT use: warm, cool, neutral, vibrant, muted, bright, dark, light, high, medium, low (these are covered by temperature/contrast/brightness/saturation)

style (1-5 tags): Design movements, eras, aesthetics, cultural or national design traditions, or
industry contexts this palette fits.

harmony (REQUIRED, 1-2 tags): The color harmony of the palette based on hue relationships. You MUST provide at least one harmony tag. Only add a second tag if it clearly applies. Choose from:
monochromatic, analogous, complementary, split-complementary, double-complementary, triadic, tetradic, square, achromatic, neutral, accented-analogous, near-complementary, clash, polychromatic

temperature (exactly one of: "warm", "cool", "neutral", "cool-warm"):
- "warm": Hues 0-60° or 300-360°
- "cool": Hues 150-270°
- "neutral": Grays/browns or saturation < 15%
- "cool-warm": Both warm and cool hues present

contrast (exactly one of: "high", "medium", "low"):
- "high": L range > 50
- "medium": L range 25-50
- "low": L range < 25

brightness (exactly one of: "dark", "medium", "light", "varied"):
- "dark": Average L < 35
- "medium": Average L 35-65
- "light": Average L > 65
- "varied": Some L < 35 AND some L > 65

saturation (exactly one of: "vibrant", "muted", "mixed"):
- "vibrant": Most S > 50%
- "muted": Most S < 40%
- "mixed": Both high and low saturation present

seasonal (0-4 tags): Time of year, season, or holiday associations. Use ONLY from this list:
Seasons: early spring, spring, late spring, summer, late summer, autumn, late autumn, winter
Holidays: christmas, halloween, easter, valentines, thanksgiving, new year, hanukkah, diwali, lunar new year, st patricks, independence day, mardi gras, cinco de mayo, oktoberfest, holi, carnival, day of the dead, kwanzaa, passover, rosh hashanah songkran, nowruz, vesak, baisakhi, obon, chuseok, canada day, australia day, chinese new year, labor day, memorial day, veterans day, mothers day, fathers day, earth day
Leave empty if no clear seasonal association.

associations (2-7 tags): Specific objects, places, materials, textures, environments, industries, time periods, nationalities, activities, foods, natural phenomena, or cultures this palette evokes.
Ask yourself what might an artist use this palette for? Be specific and concrete.

RULES:
- Lowercase only
- Singular form
- 1-2 words per tag
- Leave arrays empty if nothing fits

NEVER USE: gradient, palette, color, scheme, blend, nice, beautiful, pretty, amazing, rgb, hex, hsl, vibe, inspired, feeling or other overly generic terms similar to the examples listed.

Return ONLY VALID JSON.`

// ============================================================================
// Refinement System Prompt (Stage 2: Opus 4.5)
// ============================================================================

export const REFINEMENT_SYSTEM_PROMPT = `You are an expert in color theory refining subjective tag data from multiple AI models.

You will receive:
1. Color data (hex, RGB, HSL, LCH)
2. Consensus data showing tag frequencies across models

YOUR TASK: Refine the subjective fields. Objective fields (temperature, contrast, brightness, saturation) are computed from consensus. The embed_text will be built programmatically from your output.

FILTERING RULES:
For ALL fields: Include ALL tags that fit. Use consensus as a guide. PROMOTE quality outliers. Order matters.

mood: All emotional qualities from color psychology (expect 3-8 tags)
style: All design movements/eras that apply (expect 2-6 tags)
harmony: Color harmony based on hue relationships. Use ONLY: monochromatic, analogous, complementary, split-complementary, double-complementary, triadic, tetradic, square, achromatic, neutral, accented-analogous, near-complementary, clash, polychromatic (1-2 tags)
seasonal: Time of year, season, or holiday associations. Only include if they truly apply (0-3 tags)
associations: All specific objects/places/materials that apply to the palette. Promote at least 8 unique outliers. (expect 10-20 tags)

OUTPUT FORMAT (JSON only):
{
  "mood": ["tag1", "tag2", "tag3", "tag4", ...],
  "style": ["tag1", "tag2", ...],
  "harmony": ["tag1", "optional_tag2"],
  "seasonal": [],
  "associations": ["tag1", "tag2", "tag3", "tag4", "tag5", ...]
}

RULES:
- All tags: lowercase, singular, 1-2 words max

Return ONLY valid JSON, no markdown.`

// ============================================================================
// Prompt Change Messages
// ============================================================================
// Update these when you modify the prompts above.
// These messages help track what changed between versions.

export const TAGGING_PROMPT_MESSAGE =
  'Make harmony field required with clearer instructions'

export const REFINEMENT_PROMPT_MESSAGE =
  'LLM refines mood, style, dominant_colors, harmony, seasonal, associations; consensus only for categorical fields'

// ============================================================================
// Version Hashing
// ============================================================================

function hashString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0')
  return hex + hex.slice(0, 4)
}

export const TAGGING_PROMPT_VERSION = hashString(TAGGING_SYSTEM_PROMPT)
export const REFINEMENT_PROMPT_VERSION = hashString(REFINEMENT_SYSTEM_PROMPT)

// Legacy export for backwards compatibility
export const CURRENT_PROMPT_VERSION = TAGGING_PROMPT_VERSION
