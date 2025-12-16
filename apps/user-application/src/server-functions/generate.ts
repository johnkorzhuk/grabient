import { env } from "cloudflare:workers";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
// import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { streamObject, streamText } from "ai";
import { z } from "zod";
import { getDb } from "@repo/data-ops/database/setup";
import {
    refineSessions,
    type RefineSession,
} from "@repo/data-ops/drizzle/app-schema";
import { eq, and } from "drizzle-orm";
import { AVAILABLE_MODELS, DEFAULT_MODEL, type ModelKey } from "@/lib/model-config";

// Session context built from feedback across versions
interface SessionContext {
    liked: string[][];
    disliked: string[][];
}

function buildSystemPrompt(query: string, limit: number, examples?: string[][]): string {
    const exampleSection = examples?.length 
        ? `\nReference palettes (for inspiration, not copying):\n${examples.slice(0, 6).map(p => JSON.stringify(p)).join('\n')}\n`
        : '';

    return `You generate gradient color palettes as JSON arrays of hex codes.

THEME: "${query}"
COUNT: ${limit} unique palettes

GRADIENT STRUCTURE (critical for smooth interpolation):
- Use exactly 5-7 colors per palette
- Each color channel (R, G, B) should follow ONE of these patterns:
  * Rising: low → high (e.g., R: 20 → 80 → 140 → 200)
  * Falling: high → low
  * Hill: low → high → low  
  * Valley: high → low → high
- NEVER zigzag (e.g., 50 → 150 → 80 → 200 is BAD)
- Adjacent colors: max 100 difference per channel

GOOD EXAMPLE - "Ocean":
["#0a1628","#0d3b4a","#1a6b6b","#4a9b8a","#8bcbaa","#d4f0e0"]
Why it works:
- R: 10→13→26→74→139→212 (smooth rise)
- G: 22→59→107→155→203→240 (smooth rise)  
- B: 40→74→107→138→170→224 (smooth rise)
All channels follow simple curves.

BAD EXAMPLE:
["#ff0000","#00ff00","#0000ff","#ffff00","#ff00ff"]
Why it fails:
- R: 255→0→0→255→255 (zigzag chaos)
- Channels jump wildly, impossible to fit smoothly

THEME INTERPRETATION for "${query}":
- What are 2-3 signature colors that DEFINE this theme?
- Build smooth bridges between them
- Vary the mood: some palettes dark/moody, some bright/vibrant
${exampleSection}
OUTPUT: JSON array only, no explanation.
[["#hex1",...],["#hex1",...],...]`;
}

function normalizeQuery(query: string): string {
    return query.toLowerCase().trim();
}

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
            if (hexColors) liked.push(hexColors);
        }
    }
    return liked;
}

function getAllDislikedPalettes(
    feedback: Record<string, Record<string, "good" | "bad">>,
    seedToHexMap: Map<string, string[]>,
): string[][] {
    const disliked: string[][] = [];
    for (const versionFeedback of Object.values(feedback)) {
        for (const [seed, rating] of Object.entries(versionFeedback)) {
            if (rating === "bad") {
                const hexColors = seedToHexMap.get(seed);
                if (hexColors) disliked.push(hexColors);
            }
        }
    }
    return disliked;
}

function buildSessionContext(
    session: RefineSession | null,
    seedToHexMap: Map<string, string[]>,
): SessionContext {
    if (!session) return { liked: [], disliked: [] };
    const prevVersion = session.version;
    const liked = getVersionLikedPalettes(session.feedback, prevVersion, seedToHexMap);
    const disliked = getAllDislikedPalettes(session.feedback, seedToHexMap);
    return { liked, disliked };
}

export interface GenerateRequest {
    query: string;
    limit?: number;
    sessionId?: string;
    examples?: string[][];
    seedToHex?: Record<string, string[]>;
    unbiased?: boolean;
    model?: ModelKey;
}

export async function generatePalettesStream(
    request: GenerateRequest,
    userId?: string | null,
): Promise<Response> {
    const { query, limit = 24, sessionId, examples, seedToHex, unbiased = false, model: modelKey = DEFAULT_MODEL } = request;

    const modelConfig = AVAILABLE_MODELS[modelKey];
    if (!modelConfig) {
        return new Response(
            JSON.stringify({ error: `Unknown model: ${modelKey}` }),
            { status: 500, headers: { "Content-Type": "application/json" } },
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
            .where(and(eq(refineSessions.id, sessionId), eq(refineSessions.query, normalizedQuery)))
            .limit(1);
        session = result[0] ?? null;
        if (session) version = session.version + 1;
    }

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

    // Build context (for future use with session feedback)
    const seedToHexMap = new Map<string, string[]>();
    if (seedToHex) {
        for (const [seed, colors] of Object.entries(seedToHex)) {
            seedToHexMap.set(seed, colors);
        }
    }
    // Session context available for future refinement features
    buildSessionContext(session, seedToHexMap);

    const systemPrompt = unbiased
        ? buildSystemPrompt(query, limit)
        : buildSystemPrompt(query, limit, examples);

    console.log(`\n=== Generate [${unbiased ? "UNBIASED" : "BIASED"}] ===`);
    console.log("Query:", query, "| Model:", modelConfig.name, "(", modelConfig.id, ") | Provider:", modelConfig.provider, "| Session:", currentSessionId, "| Version:", version);
    console.log("Examples injected:", !unbiased && examples?.length ? examples.length : 0);
    console.log("System Prompt:\n", systemPrompt);

    // Create the appropriate provider based on model config
    const getModel = () => {
        const { provider } = modelConfig;
        
        switch (provider) {
            case "openrouter": {
                if (!env.OPENROUTER_API_KEY) {
                    throw new Error("OPENROUTER_API_KEY is not configured");
                }
                const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
                return openrouter(modelConfig.id);
            }
            case "google": {
                if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
                    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not configured");
                }
                const google = createGoogleGenerativeAI({
                    apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
                });
                return google(modelConfig.id);
            }
            case "groq": {
                if (!env.GROQ_API_KEY) {
                    throw new Error("GROQ_API_KEY is not configured");
                }
                const groq = createGroq({ apiKey: env.GROQ_API_KEY });
                return groq(modelConfig.id);
            }
            // case "anthropic": {
            //     if (!env.ANTHROPIC_API_KEY) {
            //         throw new Error("ANTHROPIC_API_KEY is not configured");
            //     }
            //     const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
            //     return anthropic(modelConfig.id);
            // }
            case "openai": {
                if (!env.OPENAI_API_KEY) {
                    throw new Error("OPENAI_API_KEY is not configured");
                }
                const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
                return openai(modelConfig.id);
            }
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    };

    let model;
    try {
        model = getModel();
    } catch (error) {
        return new Response(
            JSON.stringify({ error: String(error) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
        );
    }

    const isGroq = modelConfig.provider === "groq";
    const isOpenAI = modelConfig.provider === "openai";
    const useManualParsing = isGroq || isOpenAI; // OpenAI doesn't support streamObject with output: "array"

    // Transform the element stream into SSE events
    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    if (useManualParsing) {
        // Groq and OpenAI don't support streamObject with output: "array" - use streamText with manual JSON parsing
        console.log(`[Generate] Using streamText for ${modelConfig.provider} (manual JSON parsing)`);
        
        const result = streamText({
            model,
            system: systemPrompt,
            prompt: `## Theme: ${query}\n\nRespond with ONLY a JSON array of palette arrays. No markdown, no explanation. Example format:\n[["#hex1","#hex2","#hex3","#hex4","#hex5"],["#hex1","#hex2","#hex3","#hex4","#hex5"]]`,
        });

        // Process in background with manual palette extraction
        (async () => {
            try {
                // Send session info first
                await writer.write(encoder.encode(
                    `data: ${JSON.stringify({ type: "session", sessionId: currentSessionId, version, unbiased })}\n\n`
                ));

                let buffer = "";
                let palettesEmitted = 0;
                const allPalettes: string[][] = []; // Track all palettes streamed

                for await (const chunk of result.textStream) {
                    buffer += chunk;
                    
                    // Try to extract complete palettes from buffer
                    // Look for patterns like ["#hex","#hex","#hex","#hex","#hex"]
                    const paletteRegex = /\[\s*"#[0-9A-Fa-f]{6}"(?:\s*,\s*"#[0-9A-Fa-f]{6}")+\s*\]/g;
                    let match;
                    
                    while ((match = paletteRegex.exec(buffer)) !== null) {
                        try {
                            const palette = JSON.parse(match[0]) as string[];
                            if (palette.length >= 5 && palette.every(c => /^#[0-9A-Fa-f]{6}$/.test(c))) {
                                allPalettes.push(palette);
                                await writer.write(encoder.encode(
                                    `data: ${JSON.stringify({ type: "palette", colors: palette })}\n\n`
                                ));
                                palettesEmitted++;
                            }
                        } catch {}
                    }
                    
                    // Keep only the last part of buffer that might be incomplete
                    const lastBracket = buffer.lastIndexOf(']');
                    if (lastBracket > 0) {
                        buffer = buffer.slice(lastBracket + 1);
                    }
                }

                console.log("[Generate] Groq finished, emitted", palettesEmitted, "palettes");
                console.log("[Generate] All palettes:", JSON.stringify(allPalettes));

                // Update session after completion
                await db.update(refineSessions)
                    .set({ version, updatedAt: new Date() })
                    .where(eq(refineSessions.id, currentSessionId));

                await writer.close();
            } catch (error) {
                console.error("[Generate] Groq stream error:", error);
                try {
                    await writer.write(encoder.encode(
                        `data: ${JSON.stringify({ type: "error", error: String(error) })}\n\n`
                    ));
                    await writer.close();
                } catch {}
            }
        })();
    } else {
        // Use streamObject for providers that support json_schema (OpenRouter, Google)
        const paletteSchema = z.array(z.string().regex(/^#[0-9A-Fa-f]{6}$/))
            .min(5)
            .max(16)
            .describe("A palette of hex colors");

        const result = streamObject({
            model,
            output: "array",
            schema: paletteSchema,
            system: systemPrompt,
            prompt: `## Theme: ${query}`,
        });

        // Process in background
        (async () => {
            try {
                // Send session info first
                await writer.write(encoder.encode(
                    `data: ${JSON.stringify({ type: "session", sessionId: currentSessionId, version, unbiased })}\n\n`
                ));

                const allPalettes: string[][] = []; // Track all palettes streamed

                // Stream each palette as it arrives
                for await (const palette of result.elementStream) {
                    allPalettes.push(palette);
                    await writer.write(encoder.encode(
                        `data: ${JSON.stringify({ type: "palette", colors: palette })}\n\n`
                    ));
                }

                console.log("[Generate] Finished, emitted", allPalettes.length, "palettes");
                console.log("[Generate] All palettes:", JSON.stringify(allPalettes));

                // Update session after completion
                await db.update(refineSessions)
                    .set({ version, updatedAt: new Date() })
                    .where(eq(refineSessions.id, currentSessionId));

                await writer.close();
            } catch (error) {
                console.error("[Generate] Stream error:", error);
                try {
                    await writer.write(encoder.encode(
                        `data: ${JSON.stringify({ type: "error", error: String(error) })}\n\n`
                    ));
                    await writer.close();
                } catch {}
            }
        })();
    }

    return new Response(readable, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    });
}
