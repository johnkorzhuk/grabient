// composer-painter.ts
// Two-stage Composer/Painter architecture for palette generation
// Shared between user-application and grabient-ops

// =============================================================================
// OUTPUT DIMENSIONS (Per-step values in the matrix)
// =============================================================================

export type Luminance =
    | "black"
    | "darker"
    | "dark"
    | "mid"
    | "light"
    | "lighter"
    | "white";
export type Chroma =
    | "gray"
    | "muted"
    | "dusty"
    | "moderate"
    | "saturated"
    | "vivid"
    | "neon";
export type Temperature = "cold" | "cool" | "neutral" | "warm" | "hot";
export type Hue =
    | "red"
    | "orange"
    | "yellow"
    | "green"
    | "cyan"
    | "blue"
    | "purple"
    | "magenta";
export type HueShift = "none" | "slight" | "moderate" | "significant" | "opposite";

export type OutputDimensionKey =
    | "luminance"
    | "chroma"
    | "temperature"
    | "hue"
    | "hueShift";

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
        description: "color wheel relationship guiding hue selection",
        values: [
            "monochromatic",
            "analogous",
            "complementary",
            "split-complementary",
            "triadic",
            "square",
            "compound",
            "shades",
        ],
    },
    luminanceShape: {
        description: "how brightness progresses across steps",
        values: [
            "ascending",
            "descending",
            "flat",
            "peaked-early",
            "peaked-center",
            "peaked-late",
            "peaked-sharp",
            "peaked-broad",
            "valleyed-early",
            "valleyed-center",
            "valleyed-late",
            "valleyed-sharp",
            "valleyed-broad",
        ],
    },
    chromaShape: {
        description: "how saturation progresses across steps",
        values: [
            "ascending",
            "descending",
            "flat",
            "peaked-early",
            "peaked-center",
            "peaked-late",
            "peaked-sharp",
            "peaked-broad",
            "valleyed-early",
            "valleyed-center",
            "valleyed-late",
            "valleyed-sharp",
            "valleyed-broad",
        ],
    },
    temperatureShift: {
        description: "how color temperature changes across steps",
        values: [
            "stable",
            "warming",
            "cooling",
            "warming-late",
            "cooling-late",
            "warm-cool-warm",
            "cool-warm-cool",
        ],
    },
    contrastLevel: {
        description: "overall difference between adjacent steps",
        values: ["minimal", "low", "moderate", "high", "extreme"],
    },
} as const;

export const OUTPUT_DIMENSIONS: Record<
    OutputDimensionKey,
    { description: string; values: string[] }
> = {
    luminance: {
        description: "brightness of this step",
        values: ["black", "darker", "dark", "mid", "light", "lighter", "white"],
    },
    chroma: {
        description: "saturation intensity of this step",
        values: ["gray", "muted", "dusty", "moderate", "saturated", "vivid", "neon"],
    },
    temperature: {
        description: "color warmth of this step",
        values: ["cold", "cool", "neutral", "warm", "hot"],
    },
    hue: {
        description: "base color of this step",
        values: [
            "red",
            "orange",
            "yellow",
            "green",
            "cyan",
            "blue",
            "purple",
            "magenta",
        ],
    },
    hueShift: {
        description: "deviation from the base hue",
        values: ["none", "slight", "moderate", "significant", "opposite"],
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
    const {
        query,
        variationCount,
        palettesPerVariation,
        stepsRange = [5, 8],
        examplePalettes,
    } = config;

    const inputDimDocs = Object.entries(INPUT_DIMENSIONS)
        .map(([key, def]) => {
            const valueList = def.values.join(", ");
            return `  ${key}:\n    ${def.description}\n    [${valueList}]`;
        })
        .join("\n\n");

    const outputDimDocs = Object.entries(OUTPUT_DIMENSIONS)
        .map(([key, def]) => `  ${key}: [${def.values.join(", ")}]`)
        .join("\n");

    // Build example palettes section if provided
    const examplesSection =
        examplePalettes && examplePalettes.length > 0
            ? `
REFERENCE PALETTES (from vector search - use as LOOSE guidance, not strict templates):
These palettes may or may not be representative of "${query}". Use them as inspiration for color choices and relationships, but prioritize your own interpretation of the theme.
${examplePalettes
    .slice(0, 5)
    .map((p, i) => `  ${i + 1}. [${p.hexColors.join(", ")}]`)
    .join("\n")}
`
            : "";

    return `You are a palette architect. Given a theme, generate thematic variations and per-step dimension matrices.

## STEP 1: Query Analysis (REQUIRED FIRST INFERENCE)

Analyze "${query}" to determine which structural decisions are IMPLIED by the query versus which are left to your creative judgment.

INPUT DIMENSIONS (structural decisions for palette construction):
${inputDimDocs}

For EACH input dimension above:
- If the query contains language that implies a specific value or range → that dimension is QUERY-CONSTRAINED (defer to the query)
- If the query is silent on that dimension → that dimension is CREATIVE (you decide what best serves the theme)

Queries imply dimensions through:
- Structural language: words describing progression, movement, contrast, or relationships between colors
- Associative patterns: themes that naturally evoke certain color behaviors or harmonies
- Directional modifiers: terms suggesting how properties should change across the palette

OUTPUT DIMENSION BIASES:
${outputDimDocs}

Similarly, detect if the query biases any output dimensions toward particular ranges:
- Luminance bias: language suggesting overall brightness or darkness
- Chroma bias: language suggesting saturation levels
- Temperature bias: language suggesting warmth or coolness
- Hue constraints: language restricting to specific colors or excluding others

When biases are detected, ALL palettes must honor them. Variety comes from the unconstrained dimensions, never from contradicting detected constraints.

HARD CONSTRAINTS (absolute restrictions):
If the query explicitly excludes color, restricts to specific hues, or demands particular saturation levels, these are inviolable. Achromatic queries (requesting absence of color) must produce matrices with no hue dimension and all chroma values set to gray.

THEME: "${query}"
VARIATIONS: ${variationCount}
PALETTES PER VARIATION: ${palettesPerVariation}
STEPS PER PALETTE: ${stepsRange[0]}-${stepsRange[1]} (you decide per palette)
${examplesSection}
## STEP 2: Generate Variations

Generate ${variationCount} THEME VARIATIONS:
- Variations 1-2: theme = "${query}" (exact, unmodified)
- Variations 3-${variationCount}: theme = "${query} + {modifier}" (modifier specializes the query)

MODIFIER PRINCIPLE (Interpolation, not Extrapolation):
Think of the query as defining a region in semantic vector space. A valid modifier selects a point WITHIN that region—it interpolates between the query's natural associations. It must not extrapolate beyond the boundary of what the query already encompasses.

The modifier must NOT:
- Introduce associations foreign to the query's natural conceptual space
- Redirect the aesthetic direction away from the query's center
- Add qualities that would not be expected results for the original search

Validity test: Every palette across all variations should be a plausible result if someone searched for the original query alone. The modifier focuses—it does not transform.

## STEP 3: Build Matrices

For each palette, apply the input dimensions (constrained values from Step 1, creative choices for the rest) to generate per-step output specifications.

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
    const paletteSpecs = matrices
        .map((matrix, i) => {
            const colorCount = matrix.steps.length;
            // Filter to only valid dimensions that exist in OUTPUT_DIMENSIONS
            const validDimensions = matrix.dimensions.filter(
                (d) => d in OUTPUT_DIMENSIONS
            );
            const dimDefs = validDimensions
                .map((d) => `${d} [${OUTPUT_DIMENSIONS[d].values.join(", ")}]`)
                .join(", ");

            const stepRows = matrix.steps
                .map((step, j) => {
                    const dimValues = validDimensions
                        .map((d) => `${d}=${step[d as keyof StepSpec] ?? "?"}`)
                        .join(", ");
                    // Include hex if specified in the step
                    const hexPart = step.hex ? ` [USE: ${step.hex}]` : "";
                    return `    ${j + 1}. ${dimValues}${hexPart}`;
                })
                .join("\n");

            return `PALETTE ${i + 1}: "${matrix.theme}" (${colorCount} colors)
  Dimensions: ${dimDefs}
  Steps:
${stepRows}`;
        })
        .join("\n\n");

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
// SINGLE PAINTER PROMPT (for batch APIs)
// =============================================================================

/**
 * Build a painter prompt for a SINGLE matrix (used by batch APIs)
 * Uses the same prompt content as buildPainterSystemPrompt but formatted for one matrix
 */
export function buildSinglePainterPrompt(matrix: PaletteMatrix): {
    system: string;
    user: string;
} {
    const colorCount = matrix.steps.length;
    const validDimensions = matrix.dimensions.filter(
        (d) => d in OUTPUT_DIMENSIONS
    );
    const dimDefs = validDimensions
        .map((d) => `${d} [${OUTPUT_DIMENSIONS[d].values.join(", ")}]`)
        .join(", ");

    const stepRows = matrix.steps
        .map((step, j) => {
            const dimValues = validDimensions
                .map((d) => `${d}=${step[d as keyof StepSpec] ?? "?"}`)
                .join(", ");
            const hexPart = step.hex ? ` [USE: ${step.hex}]` : "";
            return `  ${j + 1}. ${dimValues}${hexPart}`;
        })
        .join("\n");

    const system = `You generate gradient color palettes as hex arrays. STRICTLY match the theme's aesthetic AND dimensional specifications.

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

REQUIREMENTS (in priority order):
1. CONSTRAINTS: If matrix encodes achromatic (no hue + gray chroma), use ONLY true grays (R=G=B). No exceptions.
2. EXACT HEX: If a step has [USE: #rrggbb], use that EXACT hex code
3. DIMENSIONS: Follow ALL dimensional values in the matrix - they are specifications, not suggestions
4. THEME: Colors should evoke the theme WITHIN the constraints
5. TRANSITIONS: Smooth transitions, max 80 RGB difference between adjacent`;

    const user = `Generate a ${colorCount}-color palette for: "${matrix.theme}"

Dimensions: ${dimDefs}
Steps:
${stepRows}

Respond with ONLY a JSON array of hex colors: ["#rrggbb", ...]`;

    return { system, user };
}

// =============================================================================
// UTILITIES
// =============================================================================

export function cleanJsonResponse(raw: string): string {
    return raw
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
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

/**
 * Extract palettes from painter response
 * Expects format: [["#hex1", ...], ...]
 */
export function parsePainterOutput(raw: string): string[][] {
    const filterPalettes = (arr: unknown[]): string[][] => {
        return arr.filter((palette): palette is string[] => {
            if (!Array.isArray(palette)) return false;
            if (palette.length < 5) return false;
            return palette.every(
                (color) => typeof color === "string" && color.startsWith("#")
            );
        });
    };

    try {
        const cleaned = cleanJsonResponse(raw);
        const parsed = JSON.parse(cleaned);

        if (Array.isArray(parsed)) {
            return filterPalettes(parsed);
        }

        return [];
    } catch {
        // Try to extract JSON array from text
        const arrayMatch = raw.match(/\[\s*\[[\s\S]*?\]\s*\]/);
        if (arrayMatch) {
            try {
                const parsed = JSON.parse(arrayMatch[0]);
                return filterPalettes(parsed);
            } catch {
                return [];
            }
        }

        return [];
    }
}
