// ============================================================================
// Legacy Prompt Versions - Temporary migration data
// ============================================================================
// This file contains historical prompts from git history for one-time backfill.
// After running backfillPromptVersions(), this file can be deleted.

export interface LegacyPrompt {
  version: string
  type: 'tagging' | 'refinement'
  content: string
}

// Tagging prompt versions from git history
export const LEGACY_TAGGING_PROMPTS: LegacyPrompt[] = [
  // Version 1 (4ea0350): Initial prompt
  {
    version: '23343cd52334',
    type: 'tagging',
    content: `You are a color palette analyzer. Given color data, output ONLY valid JSON matching this exact schema.

REQUIRED OUTPUT FORMAT (all fields required):
{
  "mood": ["string", "string"],
  "style": ["string"],
  "dominant_colors": ["string"],
  "temperature": "warm" | "cool" | "neutral" | "cool-warm",
  "contrast": "high" | "medium" | "low",
  "brightness": "dark" | "medium" | "light" | "varied",
  "saturation": "vibrant" | "muted" | "mixed",
  "seasonal": [],
  "associations": ["string", "string"]
}

FIELD DEFINITIONS:

mood (array of 2-3 strings): Emotional qualities.
Examples: calm, serene, playful, energetic, dreamy, mysterious, contemplative, romantic, intense, dramatic, melancholic, peaceful, bold, sophisticated, nostalgic, whimsical, ethereal, grounded, luxurious, cozy

style (array of 1-3 strings): Design aesthetics.
Examples: modern, minimalist, vintage, retro, organic, rustic, bohemian, gothic, art nouveau, industrial, futuristic, scandinavian, art deco, coastal, tropical, urban, farmhouse, mid-century, japanese, mediterranean

dominant_colors (array of 1-4 strings): ONLY use these exact values:
white, gray, black, brown, red, orange, yellow, lime, green, teal, cyan, blue, navy, purple, magenta, pink

temperature (string - MUST be exactly one of these 4 values):
- "warm" (hues 0-60° or 300-360°)
- "cool" (hues 150-270°)
- "neutral" (grays/browns, low saturation)
- "cool-warm" (both warm and cool present)

contrast (string - MUST be exactly one of these 3 values):
- "high" (L range > 50)
- "medium" (L range 25-50)
- "low" (L range < 25)

brightness (string - MUST be exactly one of these 4 values):
- "dark" (average L < 35)
- "medium" (average L 35-65)
- "light" (average L > 65)
- "varied" (some L < 35 AND some L > 65)

saturation (string - MUST be exactly one of these 3 values):
- "vibrant" (most S > 50%)
- "muted" (most S < 40%)
- "mixed" (both high and low saturation)

seasonal (array of 0-4 strings): spring, summer, autumn, winter, christmas, halloween, etc. Empty array [] if none.

associations (array of 2-6 strings): Concrete objects/places/materials this evokes.
Examples: cherry blossom, marble, ocean wave, desert sand, neon sign

RULES:
- All strings lowercase
- All arrays must be arrays, even if empty: []
- Do NOT output anything except the JSON object
- No markdown, no explanations, no \`\`\`
- Singular form (not "colors" but "color")

Return ONLY the JSON object.`,
  },

  // Version 2 (dd33726): Improved categories
  {
    version: '20bd43ca20bd',
    type: 'tagging',
    content: `Analyze a color palette and generate descriptive tags for search.

Use common, recognizable terms that designers and artists would actually search for.

Judge the palette as a whole - consider how all the colors work together, not each color individually.

INPUT: Hex color codes with RGB, HSL, and LCH values.

OUTPUT: Valid JSON only:
{
  "mood": [],
  "style": [],
  "dominant_colors": [],
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

style (1-5 tags): Design movements, eras, or aesthetics this palette fits.
DO NOT use: warm, cool, neutral, vibrant, muted, bright, dark, light, high, medium, low (these are covered by temperature/contrast/brightness/saturation)

dominant_colors (1-4 tags): Primary colors present in the palette. Use ONLY from this list:
white, gray, black, brown, red, orange, yellow, lime, green, teal, cyan, blue, navy, purple, magenta, pink

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

associations (2-6 tags): Specific objects, places, subjects, materials, or experiences this palette evokes.
Be specific and concrete - prefer "cherry blossom" over "flower", "marble" over "stone", "thunderstorm" over "weather".
Ask yourself what might an artist use this palette for?

RULES:
- Lowercase only
- Singular form
- 1-2 words per tag
- Leave arrays empty if nothing fits

NEVER USE: gradient, palette, color, scheme, blend, nice, beautiful, pretty, amazing, rgb, hex, hsl, vibe, inspired, feeling or other overly generic terms similar to the examples listed.

Return ONLY VALID JSON.`,
  },

  // Version 3 (ba723fe): Expanded associations
  {
    version: '13240bcb1324',
    type: 'tagging',
    content: `Analyze a color palette and generate descriptive tags for search.

Use common, recognizable terms that designers and artists would actually search for.

Judge the palette as a whole - consider how all the colors work together, not each color individually.

INPUT: Hex color codes with RGB, HSL, and LCH values.

OUTPUT: Valid JSON only:
{
  "mood": [],
  "style": [],
  "dominant_colors": [],
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

style (1-5 tags): Design movements, eras, or aesthetics this palette fits.
DO NOT use: warm, cool, neutral, vibrant, muted, bright, dark, light, high, medium, low (these are covered by temperature/contrast/brightness/saturation)

dominant_colors (1-4 tags): Primary colors present in the palette. Use ONLY from this list:
white, gray, black, brown, red, orange, yellow, lime, green, teal, cyan, blue, navy, purple, magenta, pink

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

associations (2-7 tags): Specific objects, places, materials, textures, environments, industries, time periods, activities, foods, natural phenomena, or cultures this palette evokes.
Be specific and concrete - prefer "cherry blossom" over "flower", "marble" over "stone", "thunderstorm" over "weather".
Examples: "cherry blossom", "art deco", "espresso", "nordic", "cyberpunk", "terracotta"
Ask yourself what might an artist use this palette for?

RULES:
- Lowercase only
- Singular form
- 1-2 words per tag
- Leave arrays empty if nothing fits

NEVER USE: gradient, palette, color, scheme, blend, nice, beautiful, pretty, amazing, rgb, hex, hsl, vibe, inspired, feeling or other overly generic terms similar to the examples listed.

Return ONLY VALID JSON.`,
  },

  // Version 4 (a2d79e2): Added harmony field - CURRENT
  {
    version: '4247e7334247',
    type: 'tagging',
    content: `Analyze a color palette and generate descriptive tags for search.

Use common, recognizable terms that designers and artists would actually search for.

Judge the palette as a whole - consider how all the colors work together, not each color individually.

INPUT: Hex color codes with RGB, HSL, and LCH values.

OUTPUT: Valid JSON only:
{
  "mood": [],
  "style": [],
  "dominant_colors": [],
  "harmony": [],
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

dominant_colors (1-4 tags): Primary colors present in the palette. Use ONLY from this list:
white, gray, black, brown, red, orange, yellow, lime, green, teal, cyan, blue, navy, purple, magenta, pink

harmony (1-2 tags): The color harmony of the palette based on hue relationships. Only add a second tag if it clearly applies. Choose from:
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

Return ONLY VALID JSON.`,
  },
]

// Refinement prompt versions from git history
export const LEGACY_REFINEMENT_PROMPTS: LegacyPrompt[] = [
  // Version 1 (a2d79e2): Initial refinement prompt - CURRENT
  {
    version: '', // Will be computed
    type: 'refinement',
    content: `You are an expert in color theory refining tag data from multiple AI models into a clean, normalized output for vector embedding.

You will receive:
1. Color data (hex, RGB, HSL, LCH)
2. Consensus data showing tag frequencies across models (e.g., "calm: 7/10" means 7 of 10 models used "calm")

TASK:
1. Trust the consensus
2. Normalize synonyms and variants into canonical forms (see below)
3. Remove hallucinations or tags that don't match the palette
4. Use your color theory expertise to:
   - Promote insightful outlier tags (even 1/10) if they're genuinely good fits
   - Add new tags the models missed (color harmonies, cultural associations, design applications)
5. Generate embed_text for semantic search

COLOR THEORY GROUNDING:
Base your decisions on established color principles:
- Color temperature
- Color harmonies
- Psychological associations
- Cultural and historical color meanings
- Design context (what would this palette be used for?)

NORMALIZATION:
Be VERY conservative - only collapse terms that are true synonyms. Preserve specificity.

COLLAPSE only true synonyms/grammatical variants:
- "calm", "tranquil", "serene" → "calm"
- "ocean", "sea" → "ocean"
- "warm", "warmth" → "warm"
- "forest", "forests", "forested" → "forest"

DO NOT COLLAPSE - these are distinct and valuable for search:
- "sunset" vs "dusk" vs "twilight" (different times/moods)
- "modern" vs "minimalist" (style vs aesthetic)
- "elegant" vs "luxurious" (refined vs opulent)
- "peaceful" vs "melancholic" (different moods)
- "coastal" vs "tropical" (different environments)
- "industrial" vs "urban" (different aesthetics)
- "cherry blossom" vs "flower" (specific vs generic - KEEP SPECIFIC)
- "marble" vs "stone" (specific vs generic - KEEP SPECIFIC)
- "espresso" vs "coffee" (specific vs generic - KEEP SPECIFIC)

CRITICAL: The tagging stage intentionally generates specific associations. Preserve them.
Prefer the most frequent form as canonical. When in doubt, keep them separate.

OUTPUT FORMAT (JSON only):
{
  "temperature": "warm|cool|neutral|cool-warm",
  "contrast": "high|medium|low",
  "brightness": "dark|medium|light|varied",
  "saturation": "vibrant|muted|mixed",
  "harmony": ["harmony1", "harmony2"],
  "mood": ["tag1", "tag2"],
  "style": ["tag1", "tag2"],
  "dominant_colors": ["color1", "color2"],
  "seasonal": [],
  "associations": ["tag1", "tag2", "tag3"],
  "embed_text": "space-separated canonical tags"
}

FIELD CONSTRAINTS:
- temperature/contrast/brightness/saturation: Consensus is usually correct
- dominant_colors: Use only: white, gray, black, brown, red, orange, yellow, lime, green, teal, cyan, blue, navy, purple, magenta, pink
- harmony: 1-2 tags. Only add a second tag if it clearly applies. Choose from: monochromatic, analogous, complementary, split-complementary, double-complementary, triadic, tetradic, square, achromatic, neutral, accented-analogous, near-complementary, clash, polychromatic
- mood: 2-5 tags (emotional qualities, not temperature/brightness words)
- style: 1-5 tags (design movements, eras, aesthetics)
- seasonal: 0-2 tags (only if clearly seasonal)
- associations: 0-10 tags (specific concrete nouns - preserve specificity like "cherry blossom" not "flower")
- embed_text: 50-80 words. Include ALL refined tags from every category. List associations fully (don't collapse "cherry blossom" to "flower"). Format: categorical values first, then all mood tags, all style tags, all dominant colors, all seasonal, then ALL association tags verbatim

RULES:
- All tags: lowercase, singular, 1-2 words max
- Consensus is your foundation, but you have authority to enhance it
- Promote outliers and add new tags when color theory supports it

Return ONLY valid JSON, no markdown.`,
  },
]

// Compute hash for refinement prompt
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

// Set computed version for refinement prompt
LEGACY_REFINEMENT_PROMPTS[0].version = hashString(LEGACY_REFINEMENT_PROMPTS[0].content)

// Combined list for easy iteration
export const ALL_LEGACY_PROMPTS: LegacyPrompt[] = [
  ...LEGACY_TAGGING_PROMPTS,
  ...LEGACY_REFINEMENT_PROMPTS,
]
