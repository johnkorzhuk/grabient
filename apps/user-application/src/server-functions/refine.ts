import { env } from "cloudflare:workers";
import { createOpenAI } from "@tanstack/ai-openai";
import { chat } from "@tanstack/ai";
// garbage models
// moonshotai/kimi-k2-instruct
// llama-3.3-70b-versatile
// llama-3.1-8b-instant
// meta-llama/llama-4-scout-17b-16e-instruct
// meta-llama/llama-4-maverick-17b-128e-instruct
// qwen/qwen3-32b
// const MODEL = "meta-llama/llama-4-maverick-17b-128e-instruct";
//
// openai/gpt-oss-120b
// openai/gpt-oss-20b
const MODEL = "openai/gpt-oss-120b";

export type PromptMode =
    | "unbiased"
    | "examples-only"
    | "full-feedback"
    | "positive-only";

export const PROMPT_MODE_LABELS: Record<PromptMode, string> = {
    unbiased: "Unbiased (no examples)",
    "examples-only": "Examples only",
    "full-feedback": "Examples + feedback (positive & negative)",
    "positive-only": "Examples + positive feedback only",
};

function buildBasePrompt(query: string, limit: number): string {
    return `Generate ${limit} gradient palettes for "${query}". Each palette is 8 hex colors.

## Your Anchor: "${query}"
Every palette must unmistakably evoke this theme. But there are many ways to interpret any theme.

The query "${query}" constrains some dimensions but leaves others open:
- "sunset" → constrains hue to warm, but brightness/contrast/saturation can vary freely
- "muted forest" → constrains saturation (low) and hue (green), but brightness/contrast/complexity can vary
- "neon" → constrains saturation (high), but hue/brightness/contrast can vary

Identify what "${query}" constrains, then spread your ${limit} palettes across the unconstrained dimensions.

## The Algorithm
Your colors will be fitted to: color(t) = a + b·cos(2π(c·t + d)) for each RGB channel independently.
- **a** (bias): baseline brightness of the channel
- **b** (amplitude): how much the channel oscillates
- **c** (frequency): how many oscillations across the gradient
- **d** (phase): where in the cycle the channel starts

The interplay of these parameters across R, G, B creates all color effects.

## Dimensions to Vary (mapped to algorithm)

**Brightness** (bias 'a' of all channels):
- Dark/moody (low bias) ↔ Medium ↔ Bright/airy (high bias)
- Distribute: ~1/3 dark, ~1/3 medium, ~1/3 bright

**Contrast** (amplitude 'b'):
- Dramatic: high amplitude, near-black to near-white swings
- Subtle: low amplitude, narrow value range
- Mix both across your palettes

**Saturation** (amplitude relationships between R,G,B):
- Vivid: similar amplitudes across channels
- Muted: one channel dampened
- Near-gray: all channels low amplitude

**Saturation Arc** (how saturation changes across gradient):
- Consistent: saturated throughout
- Fading: vivid→muted
- Emerging: muted→vivid
- Dip: saturated→muted→saturated

**Hue Journey** (phase 'd' relationships):
- Monochromatic: same phase, only brightness changes
- Analogous: small phase offsets, neighboring hues
- Complementary passage: passes through the complement
- Spectral: sequential phase offsets, rainbow-like

**Complexity** (frequency 'c'):
- Simple A→B (c≈0.5): one-directional flow
- Symmetric A→B→A (c≈1.0): rises and returns
- Multi-peak (c>1): multiple color cycles
- Target: ~60% simple, ~30% symmetric, ~10% complex

**Peak Position** (phase 'd' value):
- Early climax: intensity peaks at start
- Centered: peak in middle
- Late climax: builds to end

**Temperature** (bias relationships):
- Warm cast: red bias slightly higher
- Cool cast: blue bias slightly higher
- Neutral: balanced

## Worked Example

**"ocean"** constrains: blue-green hues. FREE: everything else.
- Dark abyss: low brightness, low contrast, simple A→B, late climax
- Tropical shallows: high brightness, medium contrast, analogous hues
- Storm: medium brightness, HIGH contrast, symmetric A→B→A, complementary grays
- Bioluminescence: dark with vivid accents, emerging saturation, spectral hints
- Sunset reflection: warm cast on cool base, fading saturation

## What Makes a Bad Set
- All similar brightness
- All high OR all low saturation
- All simple OR all complex
- Only obvious hue choices
- No variety in saturation arc or peak position
- Generic palettes that fit any theme

## Summary
1. Anchor every palette to "${query}" — it must be unmistakably on-theme
2. Identify what "${query}" constrains (hue? saturation? brightness?)
3. Spread your ${limit} palettes across ALL unconstrained dimensions
4. Vary: brightness levels, contrast intensity, saturation arcs, hue journeys, complexity, peak positions
5. Each palette should feel like a different interpretation of the same theme

## Output
${limit} distinct palettes for "${query}". JSON array only:
[["#hex1", "#hex2", "#hex3", "#hex4", "#hex5", "#hex6", "#hex7", "#hex8"], ...]`;
}

function buildUnbiasedPrompt(query: string, limit: number): string {
    return buildBasePrompt(query, limit);
}

function buildExamplesOnlyPrompt(
    query: string,
    limit: number,
    examples?: string[][],
): string {
    let prompt = buildBasePrompt(query, limit);

    if (examples && examples.length > 0) {
        const exampleLines = examples
            .slice(0, 24)
            .map((p) => JSON.stringify(p))
            .join("\n");
        prompt += `

## Reference Examples
Here are some example palettes that may or may not be representative of the theme. Use them as loose inspiration for style and structure, not as strict templates:
${exampleLines}`;
    }

    return prompt;
}

function buildFullFeedbackPrompt(
    query: string,
    limit: number,
    examples?: string[][],
    feedback?: PaletteFeedback,
): string {
    let prompt = buildBasePrompt(query, limit);

    if (examples && examples.length > 0) {
        const exampleLines = examples
            .slice(0, 24)
            .map((p) => JSON.stringify(p))
            .join("\n");
        prompt += `

## Reference Examples
Here are some example palettes that may or may not be representative of the theme. Use them as loose inspiration for style and structure, not as strict templates:
${exampleLines}`;
    }

    if (feedback) {
        if (feedback.good.length > 0) {
            const goodLines = feedback.good
                .slice(0, 4)
                .map((p) => JSON.stringify(p))
                .join("\n");
            prompt += `

## Positive Feedback (user liked these)
These palettes resonated with the user. Consider what makes them successful and explore similar directions:
${goodLines}`;
        }

        if (feedback.bad.length > 0) {
            const badLines = feedback.bad
                .slice(0, 4)
                .map((p) => JSON.stringify(p))
                .join("\n");
            prompt += `

## Negative Feedback (user disliked these)
These palettes didn't work for the user. Avoid similar color combinations and directions:
${badLines}`;
        }
    }

    return prompt;
}

function buildPositiveOnlyPrompt(
    query: string,
    limit: number,
    examples?: string[][],
    feedback?: PaletteFeedback,
): string {
    let prompt = buildBasePrompt(query, limit);

    if (examples && examples.length > 0) {
        const exampleLines = examples
            .slice(0, 24)
            .map((p) => JSON.stringify(p))
            .join("\n");
        prompt += `

## Reference Examples
Here are some example palettes that may or may not be representative of the theme. Use them as loose inspiration for style and structure, not as strict templates:
${exampleLines}`;
    }

    if (feedback && feedback.good.length > 0) {
        const goodLines = feedback.good
            .slice(0, 4)
            .map((p) => JSON.stringify(p))
            .join("\n");
        prompt += `

## Positive Feedback (user liked these)
These palettes resonated with the user. Consider what makes them successful and explore similar directions:
${goodLines}`;
    }

    return prompt;
}

function buildSystemPrompt(
    query: string,
    limit: number,
    mode: PromptMode,
    examples?: string[][],
    feedback?: PaletteFeedback,
): string {
    switch (mode) {
        case "unbiased":
            return buildUnbiasedPrompt(query, limit);
        case "examples-only":
            return buildExamplesOnlyPrompt(query, limit, examples);
        case "full-feedback":
            return buildFullFeedbackPrompt(query, limit, examples, feedback);
        case "positive-only":
            return buildPositiveOnlyPrompt(query, limit, examples, feedback);
    }
}

export interface StreamingPalette {
    colors: string[];
}

// Extract complete JSON arrays (palettes) from a partial JSON string
function extractPalettes(jsonBuffer: string): {
    palettes: StreamingPalette[];
    remaining: string;
} {
    const palettes: StreamingPalette[] = [];
    let remaining = jsonBuffer;

    let searchStart = 0;
    while (searchStart < remaining.length) {
        const paletteStart = remaining.indexOf('["#', searchStart);
        if (paletteStart === -1) break;

        let depth = 0;
        let inStr = false;
        let escape = false;
        let arrEnd = -1;

        for (let i = paletteStart; i < remaining.length; i++) {
            const char = remaining[i];

            if (escape) {
                escape = false;
                continue;
            }

            if (char === "\\") {
                escape = true;
                continue;
            }

            if (char === '"') {
                inStr = !inStr;
                continue;
            }

            if (!inStr) {
                if (char === "[") depth++;
                else if (char === "]") {
                    depth--;
                    if (depth === 0) {
                        arrEnd = i;
                        break;
                    }
                }
            }
        }

        if (arrEnd === -1) {
            remaining = remaining.slice(paletteStart);
            break;
        }

        const arrStr = remaining.slice(paletteStart, arrEnd + 1);
        try {
            const colors = JSON.parse(arrStr) as string[];
            if (
                Array.isArray(colors) &&
                colors.length >= 5 &&
                colors.every((c) => typeof c === "string" && c.startsWith("#"))
            ) {
                palettes.push({ colors });
            }
        } catch {
            // Invalid JSON, skip
        }

        searchStart = arrEnd + 1;
        if (searchStart >= remaining.length) {
            remaining = "";
        }
    }

    if (searchStart > 0 && searchStart < remaining.length) {
        remaining = remaining.slice(searchStart);
    } else if (searchStart >= remaining.length) {
        remaining = "";
    }

    return { palettes, remaining };
}

export interface PaletteFeedback {
    good: string[][];
    bad: string[][];
}

export async function refinePalettesStream(
    query: string,
    limit: number = 24,
    mode: PromptMode = "unbiased",
    examples?: string[][],
    feedback?: PaletteFeedback,
): Promise<Response> {
    if (!env.GROQ_API_KEY) {
        return new Response(
            JSON.stringify({ error: "GROQ_API_KEY is not configured" }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            },
        );
    }

    const adapter = createOpenAI(env.GROQ_API_KEY, {
        baseURL: "https://api.groq.com/openai/v1",
    });

    const systemPrompt = buildSystemPrompt(
        query,
        limit,
        mode,
        examples,
        feedback,
    );

    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
        { role: "user", content: `## Theme: ${query}` },
    ];

    // Cast to bypass OpenAI model type restriction - Groq uses different model names
    const stream = chat({
        adapter,
        model: MODEL as "gpt-4o",
        systemPrompts: [systemPrompt],
        messages,
        maxLength: 10240,
    });

    // Transform TanStack AI stream into palette SSE events
    const encoder = new TextEncoder();
    let jsonBuffer = "";

    const transformedStream = new ReadableStream({
        async start(controller) {
            try {
                for await (const chunk of stream) {
                    if (chunk.type === "content") {
                        // Use delta (incremental) not content (accumulated)
                        jsonBuffer += chunk.delta;

                        const { palettes, remaining } =
                            extractPalettes(jsonBuffer);
                        jsonBuffer = remaining;

                        for (const palette of palettes) {
                            controller.enqueue(
                                encoder.encode(
                                    `data: ${JSON.stringify(palette)}\n\n`,
                                ),
                            );
                        }
                    }
                }

                // Process any remaining content
                if (jsonBuffer.trim()) {
                    const { palettes } = extractPalettes(jsonBuffer);
                    for (const palette of palettes) {
                        controller.enqueue(
                            encoder.encode(
                                `data: ${JSON.stringify(palette)}\n\n`,
                            ),
                        );
                    }
                }

                controller.close();
            } catch (error) {
                console.error("Stream error:", error);
                controller.enqueue(
                    encoder.encode(
                        `data: ${JSON.stringify({ error: String(error) })}\n\n`,
                    ),
                );
                controller.close();
            }
        },
    });

    return new Response(transformedStream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
        },
    });
}
