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
import { AVAILABLE_MODELS, DEFAULT_MODEL, type ModelKey, isGeminiModel } from "@/lib/model-config";

function buildSystemPrompt(
    query: string,
    limit: number,
    examples?: string[][],
    _sessionContext?: SessionContext,
    _version?: number,
): string {
    const examplesSection = examples && examples.length > 0
        ? `
**Source Palettes**:
${examples.slice(0, 12).map(p => JSON.stringify(p)).join('\n')}

Create interesting combinations, interpolations, and extrapolations from these palettes. Blend elements, shift hues, invert progressions, or merge characteristics — but always inspired by "${query}".

`
        : '';

    return `**Role**: You are a Mathematical Color Architect creating gradient keyframes optimized for Cosine Gradient Fitting.

**Context**: Your colors will be fit to: color(t) = a + b * cos(2π(c * t + d)). Each RGB channel is fit independently.
${examplesSection}**Theme**: "${query}"
Generate ${limit} UNIQUE palettes inspired by "${query}". Each palette should feel like a different creative interpretation. Include 2-3 "wildcard" palettes that are extra bold or unexpected while still fitting "${query}".

**Process**:
1. Pick 2-3 anchor colors inspired by "${query}"
2. Build smooth bridges between them (8-12 colors total, unless "${query}" implies otherwise)
3. Verify each R, G, B channel follows a single-arc rule (no zigzags)
4. Think cinematically — how would this palette unfold over time?

**Mathematical Constraints** (unless "${query}" implies otherwise):
1. **Waveform Continuity**: Each RGB channel must follow a smooth curve. No noisy jumps.
2. **Phase Offsets**: R, G, B peaks should NOT all occur at the same position. This creates rich hue shifts.
3. **Luminosity Range**: Explore a range of brightness. Flat = boring.

**Output**: JSON array only. No markdown, no explanation.

Generate ${limit} unique palettes:`;
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

    // Create Groq adapter if needed
    const groqAdapter = !isGeminiModel(modelConfig)
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
    const stream = isGeminiModel(modelConfig)
        ? chat({
            adapter: createGemini(env.GOOGLE_GENERATIVE_AI_API_KEY!, {
                generationConfig: { maxOutputTokens: 32768 },
            }),
            model: modelConfig.id,
            systemPrompts: [systemPrompt],
            messages,
        })
        : chat({
            adapter: groqAdapter!,
            model: modelConfig.id as "gpt-4o",
            systemPrompts: [systemPrompt],
            messages,
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

                // Keep-alive: send ping every 10s to prevent timeout while waiting for slow models
                const keepAlive = setInterval(() => {
                    controller.enqueue(encoder.encode(`: ping\n\n`));
                }, 10000);

                try {
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
                } finally {
                    clearInterval(keepAlive);
                }
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
