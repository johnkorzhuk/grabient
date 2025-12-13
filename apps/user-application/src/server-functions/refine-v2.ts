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

function buildSystemPrompt(limit: number, examples?: string[][]): string {
    let prompt = `You are a color palette generator. Generate ${limit} palettes of 8 hex colors each.

## Your Primary Goal: Interpret the Theme
The user's query is everything. Your job is to translate their theme into compelling color journeys.

**Read the query carefully.** Consider:
- What colors, moods, or imagery does it evoke?
- Is it abstract ("energy") or concrete ("forest at dawn")?
- Does it imply constraints ("muted pastels") or invite exploration ("vibrant")?
- What emotions or atmospheres should the palettes capture?

Generate ${limit} distinct interpretations that ALL feel true to the theme.

## How to Create Great Palettes
Your palettes will be fitted to cosine gradients: color(t) = a + b·cos(2π(c·t + d))

This algorithm excels at smooth oscillations and multi-hue journeys:
- Channels can rise and fall naturally (that's what cosine does)
- Phase offsets between R/G/B create beautiful hue rotations
- Don't just do A→B linear blends—explore A→B→C or A→B→A journeys

**Avoid** (underuses the algorithm):
- Simple two-color blends: blue→purple, orange→red
- Monotonic single-hue progressions

**Embrace** (leverages cosine strengths):
- Multi-hue journeys: teal→gold→rose, navy→coral→mint
- Through-neutral paths: red→gray→blue, forest→cream→plum
- Oscillating lightness: bright→dark→bright with hue shifts

## Maximize Variety in Unconstrained Dimensions
The query may lock certain dimensions (e.g., "warm" locks temperature, "muted" locks saturation). Identify which dimensions are FREE and push variety hard in those.

**Critical dimensions to vary** (these map directly to cosine parameters):

1. **Exposure/Brightness** (cosine bias 'a'):
   - Some palettes should be predominantly dark, others light, others mid-toned
   - Example: deep navy→purple→maroon vs pale pink→lavender→sky

2. **Contrast/Value Range** (cosine amplitude 'b'):
   - Some high contrast: near-black to near-white
   - Some low contrast: all pastels, or all deep tones
   - Example: #1a1a2e→#eeeef0 vs #667788→#8899aa

3. **Frequency/Complexity** (cosine frequency 'c'):
   - Some simple 2-color journeys (half wave)
   - Some 3-4 color journeys (full wave)
   - Some complex 5+ transitions (multiple waves)
   - Example: blue→orange vs blue→purple→gold→teal→rose

4. **Saturation**: muted/grayish ↔ vivid/pure
5. **Temperature**: warmer ↔ cooler
6. **Direction**: light→dark vs dark→light

Example: Query "ocean" → vary exposure (bright shallow water vs deep abyss), contrast (subtle gradients vs dramatic), frequency (simple blue→teal vs blue→green→purple→navy).

Don't produce ${limit} similar palettes. Spread across ALL free dimensions.

## Output
Return ONLY a JSON array of ${limit} arrays:
[["#hex1", "#hex2", "#hex3", "#hex4", "#hex5", "#hex6", "#hex7", "#hex8"], ...]`;

    if (examples && examples.length > 0) {
        const exampleLines = examples.slice(0, 6).map(p => JSON.stringify(p)).join("\n");
        prompt += `

## Reference Examples
Here are some example palettes that may or may not be representative of the theme. Use them as loose inspiration for style and structure, not as strict templates:
${exampleLines}`;
    }

    return prompt;
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

    const systemPrompt = buildSystemPrompt(limit, examples);

    // Build messages with feedback if provided
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

    // Add feedback context first if available (soft hints, not hard constraints)
    if (feedback && (feedback.good.length > 0 || feedback.bad.length > 0)) {
        let feedbackMessage = "Some optional context on my preferences (use as soft hints, not strict rules):\n";

        if (feedback.good.length > 0) {
            feedbackMessage += "\nI somewhat liked these:\n";
            feedbackMessage += feedback.good.slice(0, 3).map(p => JSON.stringify(p)).join("\n");
        }

        if (feedback.bad.length > 0) {
            feedbackMessage += "\nThese weren't quite right for me:\n";
            feedbackMessage += feedback.bad.slice(0, 3).map(p => JSON.stringify(p)).join("\n");
        }

        messages.push({ role: "user", content: feedbackMessage });
        messages.push({ role: "assistant", content: "Noted. I'll keep that in mind while still exploring diverse options." });
    }

    // Add the main theme request
    messages.push({ role: "user", content: `## Theme: ${query}` });

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
