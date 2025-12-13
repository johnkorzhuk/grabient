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

function buildSystemPrompt(limit: number): string {
    return `You are a color palette generator. Generate ${limit} palettes of 8 hex colors each.

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

## Creating Variety Within the Theme
Explore these dimensions **where the theme permits**:
- **Hue complexity**: some 2-hue, some 3+ hue journeys
- **Saturation**: muted ↔ vivid
- **Value range**: high contrast ↔ compressed
- **Temperature**: warmer ↔ cooler
- **Direction**: light→dark vs dark→light

Open themes → explore widely. Constrained themes → vary within bounds.

## Output
Return ONLY a JSON array of ${limit} arrays:
[["#hex1", "#hex2", "#hex3", "#hex4", "#hex5", "#hex6", "#hex7", "#hex8"], ...]`;
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

export async function refinePalettesStream(
    query: string,
    limit: number = 24,
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

    const systemPrompt = buildSystemPrompt(limit);
    const userMessage = `## Theme: ${query}`;

    // Cast to bypass OpenAI model type restriction - Groq uses different model names
    const stream = chat({
        adapter,
        model: MODEL as "gpt-4o",
        systemPrompts: [systemPrompt],
        messages: [{ role: "user", content: userMessage }],
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
