import { env } from "cloudflare:workers";
import { createOpenAI } from "@tanstack/ai-openai";
import { createGemini } from "@tanstack/ai-gemini";
import { chat } from "@tanstack/ai";
import { getDb } from "@repo/data-ops/database/setup";
import {
    refineSessions,
    type RefineSession,
} from "@repo/data-ops/drizzle/app-schema";
import { eq, and } from "drizzle-orm";
import { AVAILABLE_MODELS, DEFAULT_MODEL, type ModelKey, type GeminiModelId } from "@/lib/model-config";

function buildSystemPrompt(
    query: string,
    limit: number,
    examples?: string[][],
    sessionContext?: SessionContext,
    version?: number,
): string {
    let prompt = `Generate ${limit} gradient palettes for "${query}". Each palette is 8 hex colors.

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
- Monotonic A→B (c≈0.5): TRUE one-directional flow, NO peak, just steady transition
- Symmetric A→B→A (c≈1.0): rises and returns, has a peak/trough
- Multi-peak (c>1): multiple color cycles
- Target: ~50% monotonic, ~35% symmetric, ~15% symmetric/complex

**Peak Position** (only for symmetric/multi-peak, NOT monotonic):
- Early climax (d≈0.1-0.3): intensity peaks near start, then fades
- Centered (d≈0.4-0.6): peak in middle
- Late climax (d≈0.7-0.9): builds intensity toward end
- DISTRIBUTE EVENLY: ~1/3 early, ~1/3 centered, ~1/3 late
- DO NOT default to centered - this creates a repetitive "glow in the middle" look

**Temperature** (bias relationships):
- Warm cast: red bias slightly higher
- Cool cast: blue bias slightly higher
- Neutral: balanced

## Worked Example

**"ocean"** constrains: blue-green hues. FREE: everything else.
- Dark abyss: MONOTONIC dark→darker, no peak, just descent into depths
- Tropical shallows: MONOTONIC light→medium, bright start fading to deeper water
- Storm: symmetric A→B→A with EARLY peak, intensity at start then fading
- Bioluminescence: symmetric with LATE peak, builds to bright accent at end
- Coastal gradient: MONOTONIC shore→sea, steady hue transition, no brightness peak
- Sunset reflection: symmetric CENTERED peak (use sparingly - this is the default everyone overuses)

## What Makes a Bad Set
- All similar brightness
- All high OR all low saturation
- All simple OR all complex
- Only obvious hue choices

## Summary
1. Anchor every palette to "${query}" — it must be unmistakably on-theme
2. Identify what "${query}" constrains (hue? saturation? brightness?)
3. Spread your ${limit} palettes across ALL unconstrained dimensions
4. CRITICAL DISTRIBUTION:
   - ~50% MONOTONIC (no peak - purely transitional A→B)
   - ~35% symmetric with VARIED peak positions (early/centered/late equally distributed)
   - ~15% complex multi-peak
5. Avoid the "centered glow" trap - it's the most common failure mode
6. Each palette should feel like a different interpretation of the same theme

## Output
${limit} distinct palettes for "${query}". JSON array only:
[["#hex1", "#hex2", "#hex3", "#hex4", "#hex5", "#hex6", "#hex7", "#hex8"], ...]`;

    // Add reference examples (from vector search results)
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

    // Add session context for refinement rounds after v1
    if (version && version > 1 && sessionContext) {
        prompt += `

## Session Context (Refinement #${version})
This is soft guidance to help you generate fresh variations. Your primary goal remains: unique, interesting palettes for "${query}".`;

        if (sessionContext.liked.length > 0) {
            const likedLines = sessionContext.liked
                .slice(0, 4)
                .map((p) => JSON.stringify(p))
                .join("\n");
            prompt += `

### User Liked (explore similar directions)
${likedLines}`;
        }

        if (sessionContext.disliked.length > 0) {
            const dislikedLines = sessionContext.disliked
                .slice(0, 6)
                .map((p) => JSON.stringify(p))
                .join("\n");
            prompt += `

### User Disliked (avoid these directions)
${dislikedLines}`;
        }
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

// Session context built from feedback across versions
interface SessionContext {
    liked: string[][]; // Liked palettes from previous version (positive signal)
    disliked: string[][]; // Disliked palettes from ALL versions (negative signal)
}

// Normalize query for consistent session lookup
function normalizeQuery(query: string): string {
    return query.toLowerCase().trim();
}

// Get liked palettes (hex colors) from a specific version
function getVersionLikedPalettes(
    feedback: Record<string, Record<string, "good" | "bad">>,
    version: number,
    seedToHexMap: Map<string, string[]>,
): string[][] {
    const versionKey = String(version);
    const versionFeedback = feedback[versionKey] ?? {};
    const liked: string[][] = [];

    for (const [seed, rating] of Object.entries(versionFeedback)) {
        if (rating === "good") {
            const hexColors = seedToHexMap.get(seed);
            if (hexColors) {
                liked.push(hexColors);
            }
        }
    }

    return liked;
}

// Get disliked palettes (hex colors) from ALL versions
function getAllDislikedPalettes(
    feedback: Record<string, Record<string, "good" | "bad">>,
    seedToHexMap: Map<string, string[]>,
): string[][] {
    const disliked: string[][] = [];

    for (const versionFeedback of Object.values(feedback)) {
        for (const [seed, rating] of Object.entries(versionFeedback)) {
            if (rating === "bad") {
                const hexColors = seedToHexMap.get(seed);
                if (hexColors) {
                    disliked.push(hexColors);
                }
            }
        }
    }

    return disliked;
}

// Build session context from stored feedback
function buildSessionContext(
    session: RefineSession | null,
    seedToHexMap: Map<string, string[]>,
): SessionContext {
    if (!session) {
        return { liked: [], disliked: [] };
    }

    const prevVersion = session.version;

    // Liked from previous version only (positive signal)
    const liked = getVersionLikedPalettes(
        session.feedback,
        prevVersion,
        seedToHexMap,
    );

    // Disliked from ALL versions (negative signal)
    const disliked = getAllDislikedPalettes(session.feedback, seedToHexMap);

    return { liked, disliked };
}

export interface GenerateRequest {
    query: string;
    limit?: number;
    sessionId?: string;
    examples?: string[][];
    // Seed to hex color mapping for building session context
    seedToHex?: Record<string, string[]>;
    // If true, skip examples and session context (unbiased generation)
    unbiased?: boolean;
    // Model selection
    model?: ModelKey;
}

export async function generatePalettesStream(
    request: GenerateRequest,
    userId?: string | null,
): Promise<Response> {
    const {
        query,
        limit = 24,
        sessionId,
        examples,
        seedToHex,
        unbiased = false,
        model: modelKey = DEFAULT_MODEL,
    } = request;

    const modelConfig = AVAILABLE_MODELS[modelKey];

    // Check for required API key based on provider
    if (modelConfig.provider === "groq" && !env.GROQ_API_KEY) {
        return new Response(
            JSON.stringify({ error: "GROQ_API_KEY is not configured" }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            },
        );
    }

    if (modelConfig.provider === "gemini" && !env.GOOGLE_GENERATIVE_AI_API_KEY) {
        return new Response(
            JSON.stringify({ error: "GOOGLE_GENERATIVE_AI_API_KEY is not configured" }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            },
        );
    }

    const db = getDb();
    const normalizedQuery = normalizeQuery(query);

    // Load or create session
    let session: RefineSession | null = null;
    let version = 1;
    let currentSessionId = sessionId ?? crypto.randomUUID();

    if (sessionId) {
        const result = await db
            .select()
            .from(refineSessions)
            .where(
                and(
                    eq(refineSessions.id, sessionId),
                    eq(refineSessions.query, normalizedQuery),
                ),
            )
            .limit(1);
        session = result[0] ?? null;

        if (session) {
            version = session.version + 1;
        }
    }

    // Create new session if none exists
    if (!session) {
        await db.insert(refineSessions).values({
            id: currentSessionId,
            userId: userId ?? null,
            query: normalizedQuery,
            version: 1,
            generatedSeeds: {},
            feedback: {},
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    } else {
        currentSessionId = session.id;
    }

    // Build seed-to-hex map from provided data
    const seedToHexMap = new Map<string, string[]>();
    if (seedToHex) {
        for (const [seed, colors] of Object.entries(seedToHex)) {
            seedToHexMap.set(seed, colors);
        }
    }

    // Build session context from stored feedback
    const sessionContext = buildSessionContext(session, seedToHexMap);

    // Create adapter based on provider
    const geminiAdapter = modelConfig.provider === "gemini"
        ? createGemini(env.GOOGLE_GENERATIVE_AI_API_KEY!)
        : null;
    const groqAdapter = modelConfig.provider === "groq"
        ? createOpenAI(env.GROQ_API_KEY!, {
            baseURL: "https://api.groq.com/openai/v1",
        })
        : null;

    // For unbiased requests, skip examples and session context
    const systemPrompt = unbiased
        ? buildSystemPrompt(query, limit, undefined, undefined, undefined)
        : buildSystemPrompt(query, limit, examples, sessionContext, version);

    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
        { role: "user", content: `## Theme: ${query}` },
    ];

    // Log request info
    console.log(
        `\n=== Refine Request [${unbiased ? "UNBIASED" : "BIASED"}] ===`,
    );
    console.log("Query:", query);
    console.log("Model:", modelKey, `(${modelConfig.name})`);
    console.log("Provider:", modelConfig.provider);
    console.log("Limit:", limit);
    console.log("Unbiased:", unbiased);
    console.log("Session ID:", currentSessionId);
    console.log("Version:", version);
    console.log("Examples count:", unbiased ? 0 : (examples?.length ?? 0));
    console.log(
        "Session context - Liked:",
        unbiased ? 0 : sessionContext.liked.length,
        "Disliked:",
        unbiased ? 0 : sessionContext.disliked.length,
    );
    console.log("System prompt length:", systemPrompt.length, "chars");
    console.log(`--- System Prompt [${unbiased ? "UNBIASED" : "BIASED"}] ---`);
    console.log(systemPrompt);
    console.log(
        `--- End System Prompt [${unbiased ? "UNBIASED" : "BIASED"}] ---\n`,
    );

    // Create chat stream with provider-specific configuration
    const stream = geminiAdapter
        ? chat({
            adapter: geminiAdapter,
            model: modelConfig.id as GeminiModelId,
            systemPrompts: [systemPrompt],
            messages,
            providerOptions: {
                generationConfig: { maxOutputTokens: 8192 },
            } as Record<string, unknown>,
        })
        : chat({
            adapter: groqAdapter!,
            model: modelConfig.id as "gpt-4o",
            systemPrompts: [systemPrompt],
            messages,
            providerOptions: { max_tokens: 8192 } as Record<string, unknown>,
        });

    // Transform TanStack AI stream into palette SSE events
    const encoder = new TextEncoder();
    let jsonBuffer = "";

    const transformedStream = new ReadableStream({
        async start(controller) {
            try {
                // Emit session metadata as the first event
                controller.enqueue(
                    encoder.encode(
                        `data: ${JSON.stringify({
                            type: "session",
                            sessionId: currentSessionId,
                            version,
                            unbiased,
                        })}\n\n`,
                    ),
                );

                for await (const chunk of stream) {
                    if (chunk.type === "content") {
                        jsonBuffer += chunk.delta;

                        const { palettes, remaining } =
                            extractPalettes(jsonBuffer);
                        jsonBuffer = remaining;

                        for (const palette of palettes) {
                            controller.enqueue(
                                encoder.encode(
                                    `data: ${JSON.stringify({
                                        type: "palette",
                                        colors: palette.colors,
                                    })}\n\n`,
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
                                `data: ${JSON.stringify({
                                    type: "palette",
                                    colors: palette.colors,
                                })}\n\n`,
                            ),
                        );
                    }
                }

                // Update session with new version
                await db
                    .update(refineSessions)
                    .set({
                        version,
                        updatedAt: new Date(),
                    })
                    .where(eq(refineSessions.id, currentSessionId));

                controller.close();
            } catch (error) {
                console.error("Stream error:", error);
                controller.enqueue(
                    encoder.encode(
                        `data: ${JSON.stringify({
                            type: "error",
                            error: String(error),
                        })}\n\n`,
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
