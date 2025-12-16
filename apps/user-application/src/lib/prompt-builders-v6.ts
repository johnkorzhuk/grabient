// prompt-builders-v6.ts
// Two-stage Composer/Painter architecture for palette generation

// =============================================================================
// OUTPUT DIMENSIONS (Per-step values in the matrix)
// =============================================================================

export type Luminance = 'black' | 'darker' | 'dark' | 'mid' | 'light' | 'lighter' | 'white';
export type Chroma = 'gray' | 'muted' | 'dusty' | 'moderate' | 'saturated' | 'vivid' | 'neon';
export type Temperature = 'cold' | 'cool' | 'neutral' | 'warm' | 'hot';
export type Hue = 'red' | 'orange' | 'yellow' | 'green' | 'cyan' | 'blue' | 'purple' | 'magenta';
export type HueShift = 'none' | 'slight' | 'moderate' | 'significant' | 'opposite';

export type OutputDimensionKey = 'luminance' | 'chroma' | 'temperature' | 'hue' | 'hueShift';

export interface StepSpec {
    luminance?: Luminance;
    chroma?: Chroma;
    temperature?: Temperature;
    hue?: Hue;
    hueShift?: HueShift;
    hex?: string; // Optional: exact hex code for this step
}

export interface PaletteMatrix {
    theme: string;
    dimensions: OutputDimensionKey[];
    steps: StepSpec[];
}

export interface VariationOutput {
    palettes: PaletteMatrix[];
}

export interface ComposerOutput {
    variations: VariationOutput[];
}

// =============================================================================
// DIMENSION DEFINITIONS
// =============================================================================

const INPUT_DIMENSIONS = {
    harmony: {
        description: 'color wheel relationship guiding hue selection',
        values: ['monochromatic', 'analogous', 'complementary', 'split-complementary', 'triadic', 'square', 'compound', 'shades'],
    },
    luminanceShape: {
        description: 'how brightness progresses across steps',
        values: [
            'ascending', 'descending', 'flat',
            'peaked-early', 'peaked-center', 'peaked-late', 'peaked-sharp', 'peaked-broad',
            'valleyed-early', 'valleyed-center', 'valleyed-late', 'valleyed-sharp', 'valleyed-broad',
        ],
    },
    chromaShape: {
        description: 'how saturation progresses across steps',
        values: [
            'ascending', 'descending', 'flat',
            'peaked-early', 'peaked-center', 'peaked-late', 'peaked-sharp', 'peaked-broad',
            'valleyed-early', 'valleyed-center', 'valleyed-late', 'valleyed-sharp', 'valleyed-broad',
        ],
    },
    temperatureShift: {
        description: 'how color temperature changes across steps',
        values: ['stable', 'warming', 'cooling', 'warming-late', 'cooling-late', 'warm-cool-warm', 'cool-warm-cool'],
    },
    contrastLevel: {
        description: 'overall difference between adjacent steps',
        values: ['minimal', 'low', 'moderate', 'high', 'extreme'],
    },
} as const;

const OUTPUT_DIMENSIONS: Record<OutputDimensionKey, { description: string; values: string[] }> = {
    luminance: {
        description: 'brightness of this step',
        values: ['black', 'darker', 'dark', 'mid', 'light', 'lighter', 'white'],
    },
    chroma: {
        description: 'saturation intensity of this step',
        values: ['gray', 'muted', 'dusty', 'moderate', 'saturated', 'vivid', 'neon'],
    },
    temperature: {
        description: 'color warmth of this step',
        values: ['cold', 'cool', 'neutral', 'warm', 'hot'],
    },
    hue: {
        description: 'base color of this step',
        values: ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'magenta'],
    },
    hueShift: {
        description: 'deviation from the base hue',
        values: ['none', 'slight', 'moderate', 'significant', 'opposite'],
    },
};

// =============================================================================
// COMPOSER PROMPT BUILDER
// =============================================================================

export interface ExamplePalette {
    hexColors: string[];
    score: number;
}

export interface ComposerConfig {
    query: string;
    variationCount: number;
    palettesPerVariation: number;
    stepsRange?: [number, number];
    examplePalettes?: ExamplePalette[];
}

export function buildComposerSystemPrompt(config: ComposerConfig): string {
    const { query, variationCount, palettesPerVariation, stepsRange = [5, 8], examplePalettes } = config;

    const inputDimDocs = Object.entries(INPUT_DIMENSIONS)
        .map(([key, def]) => {
            const valueList = def.values.join(', ');
            return `  ${key}:\n    ${def.description}\n    [${valueList}]`;
        })
        .join('\n\n');

    const outputDimDocs = Object.entries(OUTPUT_DIMENSIONS)
        .map(([key, def]) => `  ${key}: [${def.values.join(', ')}]`)
        .join('\n');

    // Build example palettes section if provided
    const examplesSection = examplePalettes && examplePalettes.length > 0
        ? `
REFERENCE PALETTES (from vector search - use as LOOSE guidance, not strict templates):
These palettes may or may not be representative of "${query}". Use them as inspiration for color choices and relationships, but prioritize your own interpretation of the theme.
${examplePalettes.slice(0, 5).map((p, i) => `  ${i + 1}. [${p.hexColors.join(', ')}]`).join('\n')}
`
        : '';

    return `You are a palette architect. Given a theme, generate thematic variations and per-step dimension matrices.

## CRITICAL: Query Constraints Override Everything
BEFORE doing anything else, analyze "${query}" for EXPLICIT constraints. These are ABSOLUTE and override all other guidance. Enforce constraints through your dimension and value choices:

**Achromatic constraints** (e.g., "black and white", "grayscale", "no color", "monochrome without hue", "no hues"):
→ DO NOT include "hue" or "hueShift" in dimensions array - they are FORBIDDEN
→ Include "chroma" in dimensions and set ALL step chroma values to "gray"
→ Use only "luminance" to create variety (black → white range)
→ The Painter interprets: no hue dimension + all gray chroma = true grayscale (R=G=B)

**Hue restrictions** (e.g., "only blue", "no warm colors", "earth tones only"):
→ Include "hue" but ONLY use values that fit the restriction
→ DO NOT add complementary or contrasting hues for "variety"
→ Variety comes from luminance, chroma, and temperature within allowed hues

**Saturation constraints** (e.g., "muted only", "vibrant only", "desaturated"):
→ Include "chroma" and set ALL values to respect the constraint
→ "muted only" → use only: gray, muted, dusty
→ "vibrant only" → use only: saturated, vivid, neon

When constraints exist, variety comes from what's ALLOWED, not from breaking the constraints.

THEME: "${query}"
VARIATIONS: ${variationCount}
PALETTES PER VARIATION: ${palettesPerVariation}
STEPS PER PALETTE: ${stepsRange[0]}-${stepsRange[1]} (you decide per palette)
${examplesSection}
PROCESS: 

1. Generate ${variationCount} THEME VARIATIONS for "${query}":
   - Variations 1-2: "${query}" (exact, unmodified) - use the original theme as-is
   - Variations 3-${variationCount}: "${query}" with a thematically appropriate modifier
   
   CRITICAL MODIFIER GUIDANCE:
   The modifier must PRESERVE the essential character of "${query}". 
   Ask: "If someone searched for '${query}', would they expect to see palettes from '${query} + modifier'?"
   
   The modifier should:
   - Refine or narrow the theme, NOT transform it
   - Add a mood/atmosphere that already exists within "${query}"
   - Result in palettes that still feel like "${query}" at their core
   
   The modifier must NOT:
   - Introduce colors or moods foreign to the original theme
   - Shift the palette into a completely different aesthetic
   - Override or contradict the dominant colors expected from "${query}"
   
   Test: All ${variationCount} palettes should be recognizable as "${query}" palettes.
   Creativity is encouraged, but ONLY within the bounds of what "${query}" naturally encompasses.

2. For each palette, internally decide structure using INPUT DIMENSIONS (not in output):

${inputDimDocs}

3. Translate into per-step OUTPUT DIMENSIONS:

${outputDimDocs}

SHAPE MEANINGS:
- peaked-early: peak at step 2 (front-weighted curve)
- peaked-center: peak at middle step (symmetric curve)
- peaked-late: peak near end (back-weighted curve)
- peaked-sharp: narrow peak, rapid falloff on both sides
- peaked-broad: wide peak, gradual falloff
- valleyed-*: same positions/widths but inverted (trough instead of peak)

STEP COUNT GUIDANCE (${stepsRange[0]}-${stepsRange[1]}):
- 5 steps: simple gradients, clear transitions
- 6 steps: moderate complexity, room for subtle shifts
- 7 steps: complex gradients, nuanced progressions
- 8 steps: maximum detail, intricate color journeys
Choose based on theme complexity and shape requirements. Vary across palettes.

MATRIX RULES:
- Select 2-5 output dimensions relevant to the theme
- Include ${stepsRange[0]}-${stepsRange[1]} steps (rows) based on palette complexity
- Each step has explicit values for selected dimensions only
- Omitted dimensions are left to Painter interpretation

HEX CODE RULES (when theme contains hex codes):
- Include "hex" field in steps to specify exact colors the Painter must use
- 1 hex code in theme: 1/3 to 2/3 of steps should have hex fields (the hex or colors near it)
- 2 hex codes in theme: approximately 2/3 of steps should have hex fields
- 3+ hex codes in theme: 2/3 of steps should be dedicated to those hex colors
- Distribute hex codes across steps to create smooth gradients between them

OUTPUT FORMAT:
{
  "variations": [
    {
      "palettes": [
        {
          "theme": "theme name",
          "dimensions": ["dim1", "dim2"],
          "steps": [
            { "dim1": "value", "dim2": "value" },
            { "dim1": "value", "hex": "#rrggbb" }
          ]
        }
      ]
    }
  ]
}

The number of rows in "steps" determines the palette's color count (${stepsRange[0]}-${stepsRange[1]}).

JSON only. No markdown.`;
}

// =============================================================================
// PAINTER PROMPT BUILDER
// =============================================================================

export function buildPainterSystemPrompt(matrices: PaletteMatrix[]): string {
    const paletteSpecs = matrices.map((matrix, i) => {
        const colorCount = matrix.steps.length;
        // Filter to only valid dimensions that exist in OUTPUT_DIMENSIONS
        const validDimensions = matrix.dimensions.filter(d => d in OUTPUT_DIMENSIONS);
        const dimDefs = validDimensions
            .map(d => `${d} [${OUTPUT_DIMENSIONS[d].values.join(', ')}]`)
            .join(', ');

        const stepRows = matrix.steps
            .map((step, j) => {
                const dimValues = validDimensions
                    .map(d => `${d}=${step[d as keyof StepSpec] ?? '?'}`)
                    .join(', ');
                // Include hex if specified in the step
                const hexPart = step.hex ? ` [USE: ${step.hex}]` : '';
                return `    ${j + 1}. ${dimValues}${hexPart}`;
            })
            .join('\n');

        return `PALETTE ${i + 1}: "${matrix.theme}" (${colorCount} colors)
  Dimensions: ${dimDefs}
  Steps:
${stepRows}`;
    }).join('\n\n');

    return `You generate gradient color palettes as hex arrays. STRICTLY match each theme's aesthetic AND dimensional specifications.

COUNT: ${matrices.length} palettes

## CRITICAL: Constraint Detection from Matrix Structure
The matrix dimensions encode constraints. You MUST detect and respect them:

**Achromatic/Grayscale Detection:**
If a palette has NO "hue" dimension AND all chroma values are "gray":
→ This is an ACHROMATIC palette - use ONLY true grays where R=G=B
→ Examples: #000000, #333333, #666666, #999999, #CCCCCC, #FFFFFF
→ NO hues whatsoever - not even slight tints or warm/cool grays

**Hue Restriction Detection:**
If "hue" dimension exists but uses only a subset of values (e.g., only "blue" and "cyan"):
→ Stay strictly within those hues - do NOT add others for variety

**Saturation Restriction Detection:**
If all chroma values are in the low range (gray, muted, dusty):
→ Keep all colors desaturated - do NOT add vibrant colors

The dimensional specs are PRIMARY when they encode constraints. The theme name is SECONDARY context.

SCALES (for dimension guidance):
- luminance: black (darkest) → white (brightest)
- chroma: gray (no saturation, R=G=B) → neon (max saturation)
- temperature: cold (blue-shifted) → hot (red-shifted) - SKIP if achromatic
- hue: position on color wheel - SKIP if achromatic
- hueShift: none (base hue) → opposite (complementary) - SKIP if achromatic

SPECIFICATIONS:
${paletteSpecs}

REQUIREMENTS (in priority order):
1. CONSTRAINTS: If matrix encodes achromatic (no hue + gray chroma), use ONLY true grays (R=G=B). No exceptions.
2. EXACT HEX: If a step has [USE: #rrggbb], use that EXACT hex code
3. DIMENSIONS: Follow ALL dimensional values in the matrix - they are specifications, not suggestions
4. THEME: Colors should evoke the theme WITHIN the constraints
5. TRANSITIONS: Smooth transitions, max 80 RGB difference between adjacent
- Each palette has its own color count (specified above)

OUTPUT: Array of ${matrices.length} palettes, each with its specified color count.
[["#rrggbb",...], ...]

JSON only.`;
}

// =============================================================================
// UTILITIES
// =============================================================================

export function cleanJsonResponse(raw: string): string {
    return raw
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
}

export function parseComposerOutput(raw: string): ComposerOutput | null {
    try {
        const cleaned = cleanJsonResponse(raw);
        const parsed = JSON.parse(cleaned) as ComposerOutput;
        
        if (!parsed.variations || !Array.isArray(parsed.variations)) {
            return null;
        }
        
        return parsed;
    } catch {
        return null;
    }
}

export { OUTPUT_DIMENSIONS };
