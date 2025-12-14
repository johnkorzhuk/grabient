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
const MODEL = "openai/gpt-oss-120b";

export type PromptMode = "unbiased" | "full-feedback" | "positive-only";

export const PROMPT_MODE_LABELS: Record<PromptMode, string> = {
    unbiased: "Unbiased (no examples)",
    "full-feedback": "Examples + feedback (positive & negative)",
    "positive-only": "Examples + positive feedback only",
};

function buildBasePrompt(query: string, limit: number): string {
    return `You are a color palette generator. Generate ${limit} palettes of 8 hex colors each.

## Theme: "${query}"
This is your anchor. Every palette must clearly connect to this theme.

Consider what "${query}" evokes:
- What colors, moods, or imagery come to mind?
- Does it imply constraints (like "muted" or "warm") or invite exploration?
- What emotions or atmospheres should the palettes capture?

Generate ${limit} distinct interpretations that all feel true to "${query}".

## How to Create Great Palettes
Your palettes will be fitted to cosine gradients: color(t) = a + b·cos(2π(c·t + d))

This algorithm excels at smooth oscillations and hue journeys:
- Channels can rise and fall naturally (that's what cosine does)
- Phase offsets between R/G/B create beautiful hue rotations
- Simple A→B flows work great; A→B→C or A→B→A journeys add variety when appropriate

**Different journeys serve different moods:**
- Simple 2-hue flows (blue→purple): elegant, calm, focused
- 3-hue journeys (teal→gold→rose): balanced, dynamic
- Multi-hue paths (navy→coral→mint→plum): energetic, complex, playful
- Through-neutral paths (red→gray→blue): sophisticated transitions

All of these are valid. Match the complexity to the theme's energy.

## Vary the Unconstrained Dimensions
The query may lock certain dimensions (e.g., "warm" locks temperature, "muted" locks saturation). Identify which dimensions are FREE and spread your palettes across them.

**Critical dimensions to vary** (these map directly to cosine parameters):

1. **Exposure/Brightness** (cosine bias 'a'):
   - Some palettes should be predominantly dark, others light, others mid-toned
   - Example: deep navy→purple→maroon vs pale pink→lavender→sky

2. **Contrast/Value Range** (cosine amplitude 'b'):
   - Some high contrast: near-black to near-white
   - Some low contrast: all pastels, or all deep tones
   - Example: #1a1a2e→#eeeef0 vs #667788→#8899aa

3. **Hue Transitions / Frequency** (cosine frequency 'c'):
   Target distribution (adjust based on query energy):
   - ~60-70%: 2-3 hue transitions (the workhorses—elegant and versatile)
   - ~20-30%: 4+ hue transitions (exploratory, more dynamic)
   - ~10-20%: unexpected interpretations (surprising but still clearly connected to the theme)

   Shift this ratio based on theme: "neon carnival" → more high-frequency; "minimal zen" → more simple flows.
   Don't default to complex. A beautiful 2-hue gradient is often exactly right.

4. **Saturation**: muted/grayish ↔ vivid/pure
5. **Temperature**: warmer ↔ cooler
6. **Direction**: light→dark vs dark→light

Example: Query "ocean" → vary exposure (bright shallow water vs deep abyss), contrast (subtle gradients vs dramatic), frequency (simple blue→teal vs blue→green→purple→navy).

Don't produce ${limit} similar palettes. Spread across the free dimensions.

## Final Check: Theme Alignment
Before outputting, verify each palette against the theme "${query}":
- Would someone seeing this palette think of "${query}"?
- Every palette—including creative ones—must have a clear connection
- If a palette feels random or disconnected, replace it
- Variety in style is good; departure from the theme is not

## Output
Return ONLY a JSON array of ${limit} arrays:
[["#hex1", "#hex2", "#hex3", "#hex4", "#hex5", "#hex6", "#hex7", "#hex8"], ...]`;
}

function buildUnbiasedPrompt(query: string, limit: number): string {
    return buildBasePrompt(query, limit);
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
            .slice(0, 6)
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
            .slice(0, 6)
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

    const systemPrompt = buildSystemPrompt(query, limit, mode, examples, feedback);

    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
        { role: "user", content: `## Theme: ${query}` },
    ];

    // Cast to bypass OpenAI model type restriction - Groq uses different model names
    const stream = chat({
        adapter,
        model: MODEL as "gpt-4o",
        systemPrompts: [systemPrompt],
        messages,
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
