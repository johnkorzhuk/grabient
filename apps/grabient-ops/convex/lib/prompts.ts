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

// ============================================================================
// Generation System Prompt (Palette Generation from Tags)
// ============================================================================

/**
 * Builds the generation system prompt with optional reference examples
 */
export function buildGenerationSystemPrompt(
  query: string,
  limit: number,
  examples?: string[][]
): string {
  const examplesSection = examples && examples.length > 0
    ? `## Reference Palettes
These palettes were retrieved from a database based on similarity to "${query}". They may be highly relevant, loosely related, or occasionally off-target — use your judgment. Treat them as inspiration for quality and aesthetic range, not as templates to copy or constraints to follow.

${examples.map((p) => JSON.stringify(p)).join('\n')}

`
    : ''

  const referenceEvaluation = examples && examples.length > 0
    ? `\n- REFERENCE EVALUATION: Which examples actually fit "${query}"? Which are off-target? What useful patterns exist in the relevant ones?`
    : ''

  return `Generate ${limit} gradient palettes for "${query}". Each palette is 8 hex colors.

## CRITICAL: Query Constraints Override Everything
If "${query}" contains EXPLICIT constraints, they are ABSOLUTE and override ALL other guidance in this prompt:

**Achromatic constraints** (e.g., "black and white", "grayscale", "no color", "monochrome without hue"):
→ Use ONLY true grays: #000000 to #FFFFFF with identical R=G=B values
→ NO hues whatsoever — not even slight tints or undertones
→ Ignore Category B creative expansions, color harmony modifiers, and hue variety guidelines
→ Vary ONLY: brightness levels, contrast, gradient shape

**Hue restrictions** (e.g., "only blue", "no warm colors", "earth tones only"):
→ Stay strictly within the specified hue range
→ Do NOT introduce complementary or contrasting hues for "variety"
→ Vary ONLY: saturation, brightness, gradient shape within the allowed hues

**Saturation constraints** (e.g., "muted only", "vibrant only", "desaturated"):
→ ALL palettes must respect the saturation constraint
→ Do NOT vary saturation for "distribution" purposes

When constraints exist, variety comes from what's ALLOWED, not from breaking the constraints.

${examplesSection}## Step 1: Theme Analysis (REQUIRED — do this internally, do not include in your response)
Analyze "${query}":
- EXPLICIT CONSTRAINTS: What hard limits does the query impose? (hue, saturation, brightness restrictions)
- CORE IDENTITY: What does "${query}" fundamentally mean in color terms?
- ALLOWED HUES: What colors fit within any constraints? (be specific: "dusty rose" not "pink")
- FORBIDDEN HUES: Colors explicitly excluded OR that would break the theme
- BRIGHTNESS: Natural range (dark/medium/bright) — unless constrained
- SATURATION: Natural character (vivid/muted/desaturated) — unless constrained
- ASSOCIATIONS: Related concepts, materials, environments, moods${referenceEvaluation}

## Step 2: Generate Two Categories

**Category A: Pure Interpretations (${Math.ceil(limit / 3)} palettes)**
Stay strictly within "${query}" — unmistakably on-theme with no additions.
Vary only: brightness, contrast, saturation level, gradient direction, complexity.
Someone should look at these and immediately think "${query}".

**Category B: Creative Expansions (${Math.floor((limit * 2) / 3)} palettes)**
Pair "${query}" with modifiers that create interesting combinations. Each palette should use a DIFFERENT modifier approach.

Consider two types of expansion:

*Conceptual modifiers* — dimensions that recontextualize the theme:
Time, light, weather, texture, material, emotion, temperature, age, season, environment, intensity, abstraction.

*Color harmony modifiers* — introduce hues that relate to "${query}" through color theory:
- Analogous: neighboring hues that extend the theme naturally
- Complementary: opposite hues that create vibrant tension
- Split-complementary: two hues adjacent to the complement for softer contrast

Choose modifiers — conceptual, harmonic, or combined — that genuinely enhance "${query}". Not every harmony works with every theme; select what creates *interesting tension or natural extension* for this specific query.

**CRITICAL: Anchor Rule**
Every Category B palette must remain identifiable as "${query}". At least half of each palette should be rooted in the core theme colors — enough to anchor the viewer's association. Modifiers should enhance or recontextualize, never overwhelm. If someone cannot connect the palette back to "${query}", the modifier has gone too far.

## The Algorithm
Your colors will be rendered using: color(t) = a + b·cos(2π(c·t + d))
- **a** (bias): baseline brightness
- **b** (amplitude): oscillation range
- **c** (frequency): number of color cycles (0.5 = monotonic A→B, 1.0 = A→B→A, >1 = complex)
- **d** (phase): where each channel starts

## Gradient Shapes (CRITICAL — vary these)

**Monotonic (target: ~50% of palettes)**
Frequency c ≈ 0.3–0.5. Color flows ONE direction: A → B. No peak, no return.
Use for: transitions, journeys, fades, progressions.

**Symmetric (target: ~35% of palettes)**
Frequency c ≈ 0.8–1.0. Color flows A → B → A. Has a peak or trough.
VARY THE PEAK POSITION using phase d:
- Early peak (d ≈ 0.0–0.2): intensity at start, fades out
- Center peak (d ≈ 0.25): classic glow — USE SPARINGLY
- Late peak (d ≈ 0.3–0.5): builds to climax at end

**Complex (target: ~15% of palettes)**
Frequency c > 1. Multiple color cycles. Use for: iridescence, rainbow effects, energy.

## Brightness Distribution
Across all ${limit} palettes, distribute with respect to ${query}:
- ~30% dark dominant (deep, moody, shadows)
- ~40% medium (balanced, natural)
- ~30% bright dominant (airy, light, glowing)

## Quality Checks (do these internally, do not include in your response)
✓ CONSTRAINT CHECK: Do ALL palettes respect explicit constraints in "${query}"? (If achromatic was requested, verify R=G=B for every color)
✓ Could someone identify "${query}" from Category A palettes alone?
✓ Does each Category B palette contain at least half core theme colors?
✓ Is there variety in gradient direction (monotonic vs symmetric)?
✓ Is there variety in brightness (dark/medium/bright)? (Skip if brightness was constrained)
✓ Do the palettes look distinct from each other, not like minor variations?
✓ Do Category B palettes use a mix of conceptual and harmonic modifiers? (Skip if constraints eliminate Category B)

## Output Format
Return ONLY a JSON object with two fields. No explanation, no markdown, no code blocks, no preamble.

**palettes**: Array of ${limit} palettes. First ${Math.ceil(limit / 3)} are Category A (pure), remaining are Category B (expanded).

**modifiers**: Array of 2-6 modifier tags you used for Category B palettes. These are the conceptual or harmonic modifiers you paired with "${query}" (e.g., for "ocean" you might output ["stormy", "tropical", "bioluminescent", "complementary-coral", "triadic-warm"]). Only include modifiers that actually appear in your Category B palettes.

{
  "palettes": [["#hex1", "#hex2", "#hex3", "#hex4", "#hex5", "#hex6", "#hex7", "#hex8"], ...],
  "modifiers": ["modifier1", "modifier2", ...]
}`
}

// Legacy constant for backwards compatibility (without examples)
export const GENERATION_SYSTEM_PROMPT = buildGenerationSystemPrompt('${query}', 24)

export const GENERATION_PROMPT_MESSAGE = 'Add explicit constraint override section - query constraints take precedence over variety guidelines'

export const GENERATION_PROMPT_VERSION = hashString(GENERATION_SYSTEM_PROMPT)
