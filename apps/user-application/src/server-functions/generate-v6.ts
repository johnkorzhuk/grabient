// generate-v6.ts
// Two-stage Composer/Painter pipeline for palette generation

import { env } from "cloudflare:workers";
import { createGroq } from "@ai-sdk/groq";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { getDb } from "@repo/data-ops/database/setup";
import { refineSessions } from "@repo/data-ops/drizzle/app-schema";
import { eq, and } from "drizzle-orm";
import {
    fitCosinePalette,
    determinePaletteProperties,
} from "@repo/data-ops/gradient-gen";
import { serializeCoeffs } from "@repo/data-ops/serialization";
import { DEFAULT_GLOBALS } from "@repo/data-ops/valibot-schema/grabient";
import type { CosineCoeffs } from "@repo/data-ops/gradient-gen/cosine";
import {
    buildComposerSystemPrompt,
    buildPainterSystemPrompt,
    parseComposerOutput,
    type PaletteMatrix,
    type ComposerOutput,
    type ExamplePalette,
} from "@/lib/prompt-builders-v6";
import { deserializeCoeffs } from "@repo/data-ops/serialization";
import { generateHexColors } from "@/lib/paletteUtils";
import * as v from "valibot";
import {
    seedValidator,
    paletteStyleValidator,
    stepsValidator,
    angleValidator,
} from "@repo/data-ops/valibot-schema/grabient";
import { replaceHexWithColorNames } from "@repo/data-ops/color-utils";

type PaletteStyle = v.InferOutput<typeof paletteStyleValidator>;

// =============================================================================
// MODEL CONFIGURATION
// =============================================================================

const COMPOSER_MODEL = {
    // id: "openai/gpt-oss-120b",
    // name: "GPT OSS 120B (Composer)",
    // provider: "groq" as const,
    id: "llama-3.3-70b-versatile",
    name: "Llama 3.3 70B (Composer)",
    provider: "groq" as const,
    // id: "moonshotai/kimi-k2-instruct-0905",
    // name: "Kimi K2 (Composer)",
    // provider: "groq" as const,
    // id: "gpt-4.1-nano",
    // name: "GPT-4.1 Nano (Composer)",
    // provider: "openai" as const,
    // id: "google/gemini-2.5-flash-lite",
    // name: "Gemini 2.5 Flash Lite (Composer)",
    // provider: "openrouter" as const,
};

const PAINTER_MODELS = [
    {
        key: "llama-4-maverick",
        id: "meta-llama/llama-4-maverick-17b-128e-instruct",
        name: "Llama 4 Maverick",
        provider: "groq" as const,
    },
    {
        key: "llama-4-scout",
        id: "meta-llama/llama-4-scout-17b-16e-instruct",
        name: "Llama 4 Scout",
        provider: "groq" as const,
    },
    {
        key: "gpt-4.1-nano",
        id: "gpt-4.1-nano",
        name: "GPT-4.1 Nano",
        provider: "openai" as const,
    },
    {
        key: "llama-3.3-70b",
        id: "llama-3.3-70b-versatile",
        name: "Llama 3.3 70B",
        provider: "groq" as const,
    },
    {
        key: "gemini-flash-lite",
        id: "google/gemini-2.5-flash-lite",
        name: "Gemini 2.5 Flash Lite",
        provider: "openrouter" as const,
    },
    {
        key: "kimi-k2",
        id: "moonshotai/kimi-k2-instruct-0905",
        name: "Kimi K2",
        provider: "groq" as const,
    },
] as const;

// =============================================================================
// STREAMING EVENT TYPES
// =============================================================================

import type { PaletteAngle } from "@repo/data-ops/gradient-gen/cosine";

export type GenerateEvent =
    | { type: "session"; sessionId: string; version: number }
    | { type: "composer_start" }
    | { type: "composer_progress"; variationsReceived: number }
    | { type: "composer_complete"; totalMatrices: number }
    | { type: "composer_error"; error: string }
    | {
          type: "painter_start";
          modelKey: string;
          modelName: string;
          matricesCount: number;
      }
    | {
          type: "palette";
          modelKey: string;
          seed: string;
          style: PaletteStyle;
          steps: number;
          angle: PaletteAngle;
          theme: string;
      }
    | {
          type: "painter_complete";
          modelKey: string;
          paletteCount: number;
          duration: number;
      }
    | { type: "painter_error"; modelKey: string; error: string }
    | { type: "done"; totalPalettes: number };

// =============================================================================
// MODEL PROVIDERS
// =============================================================================

function getGroqModel(modelId: string) {
    if (!env.GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");
    const groq = createGroq({ apiKey: env.GROQ_API_KEY });
    return groq(modelId);
}

function getOpenAIModel(modelId: string) {
    if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");
    const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
    return openai(modelId);
}

function getOpenRouterModel(modelId: string) {
    if (!env.OPENROUTER_API_KEY)
        throw new Error("OPENROUTER_API_KEY not configured");
    const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
    return openrouter(modelId);
}

function getModel(provider: "groq" | "openai" | "openrouter", modelId: string) {
    switch (provider) {
        case "groq":
            return getGroqModel(modelId);
        case "openai":
            return getOpenAIModel(modelId);
        case "openrouter":
            return getOpenRouterModel(modelId);
    }
}

/**
 * Apply ±5% jitter to frequency (c) and phase (d) values for variation.
 */
function applyJitter(coeffs: CosineCoeffs): CosineCoeffs {
    const jitter = () => 1 + (Math.random() * 0.1 - 0.05); // ±5% random

    return [
        coeffs[0], // a (bias) - no change
        coeffs[1], // b (amplitude) - no change
        [coeffs[2][0] * jitter(), coeffs[2][1] * jitter(), coeffs[2][2] * jitter(), 1], // c (frequency) - jitter
        [coeffs[3][0] * jitter(), coeffs[3][1] * jitter(), coeffs[3][2] * jitter(), 1], // d (phase) - jitter
    ] as CosineCoeffs;
}

// =============================================================================
// VECTOR SEARCH FOR EXAMPLE PALETTES
// =============================================================================

const vectorMetadataSchema = v.object({
    seed: seedValidator,
    tags: v.array(v.string()),
    style: paletteStyleValidator,
    steps: stepsValidator,
    angle: angleValidator,
    likesCount: v.number(),
    createdAt: v.number(),
});

async function getExamplePalettes(
    query: string,
    limit = 5,
): Promise<ExamplePalette[]> {
    if (!env.AI || !env.VECTORIZE) {
        console.log("[VectorSearch] AI/Vectorize bindings not available");
        return [];
    }

    try {
        const normalizedQuery = replaceHexWithColorNames(query);

        const embeddingResponse = await env.AI.run(
            "@cf/google/embeddinggemma-300m",
            { text: [normalizedQuery] },
        );

        if (!("data" in embeddingResponse) || !embeddingResponse.data) {
            return [];
        }

        const queryVector = embeddingResponse.data[0];
        if (!queryVector) {
            return [];
        }

        const matches = await env.VECTORIZE.query(queryVector, {
            topK: limit,
            returnMetadata: "all",
        });

        return matches.matches
            .map((match) => {
                const parsed = v.safeParse(
                    vectorMetadataSchema,
                    match.metadata,
                );
                if (!parsed.success) return null;

                const { coeffs, globals } = deserializeCoeffs(
                    parsed.output.seed,
                );
                const hexColors = generateHexColors(
                    coeffs,
                    globals,
                    parsed.output.steps,
                );

                return {
                    hexColors,
                    score: match.score,
                };
            })
            .filter((r): r is ExamplePalette => r !== null);
    } catch (e) {
        console.error("[VectorSearch] Error:", e);
        return [];
    }
}

// =============================================================================
// COMPOSER STAGE (yields events)
// =============================================================================

async function* runComposer(
    query: string,
    variationCount: number,
    palettesPerVariation: number,
    examplePalettes?: ExamplePalette[],
): AsyncGenerator<
    GenerateEvent | { type: "__result"; data: ComposerOutput | null }
> {
    const systemPrompt = buildComposerSystemPrompt({
        query,
        variationCount,
        palettesPerVariation,
        stepsRange: [5, 8],
        examplePalettes,
    });

    console.log("[Composer] Starting with query:", query);
    yield { type: "composer_start" };

    try {
        const model = getModel(COMPOSER_MODEL.provider, COMPOSER_MODEL.id);

        const result = streamText({
            model,
            system: systemPrompt,
            prompt: `Generate dimension matrices for: "${query}"`,
        });

        let fullText = "";
        let lastVariationCount = 0;

        for await (const chunk of result.textStream) {
            fullText += chunk;

            // Try to count variations received so far for progress updates
            const partialParsed = parseComposerOutput(fullText);
            if (
                partialParsed?.variations?.length &&
                partialParsed.variations.length > lastVariationCount
            ) {
                lastVariationCount = partialParsed.variations.length;
                yield {
                    type: "composer_progress",
                    variationsReceived: lastVariationCount,
                };
            }
        }

        console.log("[Composer] Raw output length:", fullText.length);
        console.log("[Composer] Raw output:", fullText);

        const parsed = parseComposerOutput(fullText);
        if (!parsed) {
            console.error(
                "[Composer] Failed to parse output - full text:",
                fullText,
            );
            yield {
                type: "composer_error",
                error: "Failed to parse composer output",
            };
            yield { type: "__result", data: null };
            return;
        }

        // Count total matrices
        let totalMatrices = 0;
        for (const variation of parsed.variations) {
            totalMatrices += variation.palettes.length;
        }

        console.log("[Composer] Complete with", totalMatrices, "matrices");

        // Log matrices as formatted table
        let matrixIndex = 0;
        for (const variation of parsed.variations) {
            for (const palette of variation.palettes) {
                matrixIndex++;
                console.log(`\n[Matrix ${matrixIndex}] Theme: "${palette.theme}"`);
                console.log(`Dimensions: ${palette.dimensions.join(", ")}`);
                console.log("Steps:");
                palette.steps.forEach((step, i) => {
                    const stepValues = Object.entries(step)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(", ");
                    console.log(`  ${i + 1}. ${stepValues}`);
                });
            }
        }
        yield { type: "composer_complete", totalMatrices };
        yield { type: "__result", data: parsed };
    } catch (error) {
        console.error("[Composer] Error:", error);
        yield { type: "composer_error", error: String(error) };
        yield { type: "__result", data: null };
    }
}

// =============================================================================
// PAINTER STAGE
// =============================================================================

interface PaletteOverrides {
    style?: "auto" | PaletteStyle;
    steps?: "auto" | number;
    angle?: "auto" | number;
}

async function* runPainter(
    modelConfig: (typeof PAINTER_MODELS)[number],
    matrices: PaletteMatrix[],
    overrides?: PaletteOverrides,
): AsyncGenerator<GenerateEvent> {
    const startTime = Date.now();
    const palettes: string[][] = [];
    let paletteIndex = 0;

    yield {
        type: "painter_start",
        modelKey: modelConfig.key,
        modelName: modelConfig.name,
        matricesCount: matrices.length,
    };

    try {
        const model = getModel(modelConfig.provider, modelConfig.id);
        const systemPrompt = buildPainterSystemPrompt(matrices);

        const result = streamText({
            model,
            system: systemPrompt,
            prompt: `Generate ${matrices.length} palettes as JSON array. Each palette should have the color count specified in parentheses.\n\nRespond with ONLY JSON: [["#hex",...], ...]`,
        });

        let buffer = "";
        const paletteRegex =
            /\[\s*"#[0-9A-Fa-f]{6}"(?:\s*,\s*"#[0-9A-Fa-f]{6}")+\s*\]/g;

        for await (const chunk of result.textStream) {
            buffer += chunk;
            let match;

            // Reset regex lastIndex before each search
            paletteRegex.lastIndex = 0;
            let lastMatchEnd = 0;

            while ((match = paletteRegex.exec(buffer)) !== null) {
                lastMatchEnd = paletteRegex.lastIndex;
                try {
                    const palette = JSON.parse(match[0]) as string[];
                    const invalidColors = palette.filter(
                        (c) => !/^#[0-9A-Fa-f]{6}$/i.test(c),
                    );
                    if (palette.length >= 5 && invalidColors.length === 0) {
                        // Get theme from corresponding matrix (palettes come in order)
                        const theme =
                            matrices[paletteIndex]?.theme ?? "unknown";

                        // Fit cosine palette on server side and apply jitter
                        const fitResult = fitCosinePalette(palette);
                        const jitteredCoeffs = applyJitter(fitResult.coeffs);
                        const seed = serializeCoeffs(
                            jitteredCoeffs,
                            DEFAULT_GLOBALS,
                        );

                        // Determine steps, style, and angle based on palette complexity
                        // Use overrides if provided (not "auto" or undefined)
                        const computed = determinePaletteProperties(jitteredCoeffs, palette);
                        const style = (overrides?.style && overrides.style !== "auto")
                            ? overrides.style
                            : computed.style;
                        const steps = (overrides?.steps && overrides.steps !== "auto")
                            ? overrides.steps
                            : computed.steps;
                        const angle = (overrides?.angle !== undefined && overrides.angle !== "auto")
                            ? overrides.angle as PaletteAngle
                            : computed.angle;

                        palettes.push(palette);
                        paletteIndex++;
                        yield {
                            type: "palette",
                            modelKey: modelConfig.key,
                            seed,
                            style,
                            steps,
                            angle,
                            theme,
                        };
                    }
                } catch (e) {
                    console.error(
                        `[Painter:${modelConfig.key}] Error processing palette:`,
                        e,
                    );
                }
            }

            // Keep only unprocessed part of buffer
            if (lastMatchEnd > 0) {
                buffer = buffer.slice(lastMatchEnd);
            } else {
                // If no match, keep last 500 chars to avoid buffer growing too large
                if (buffer.length > 1000) {
                    buffer = buffer.slice(-500);
                }
            }
        }

        const duration = Date.now() - startTime;
        yield {
            type: "painter_complete",
            modelKey: modelConfig.key,
            paletteCount: palettes.length,
            duration,
        };
    } catch (error) {
        console.error(`[Painter:${modelConfig.key}] Error:`, error);
        yield {
            type: "painter_error",
            modelKey: modelConfig.key,
            error: String(error),
        };
    }
}

// =============================================================================
// UTILITIES
// =============================================================================

function normalizeQuery(query: string): string {
    return query.toLowerCase().trim();
}

// =============================================================================
// MAIN SSE FUNCTION (API route compatible)
// =============================================================================

export interface GenerateRequest {
    query: string;
    sessionId?: string;
    style?: "auto" | PaletteStyle;
    steps?: "auto" | number;
    angle?: "auto" | number;
}

export async function generatePalettesSSE(
    request: GenerateRequest,
    userId: string,
): Promise<Response> {
    const { query, sessionId, style, steps, angle } = request;
    const overrides: PaletteOverrides = { style, steps, angle };
    const db = getDb();
    const normalizedQuery = normalizeQuery(query);

    // Session management
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
        const session = result[0] ?? null;
        if (session) {
            version = session.version + 1;
            currentSessionId = session.id;
        }
    }

    if (!sessionId) {
        await db.insert(refineSessions).values({
            id: currentSessionId,
            userId,
            query: normalizedQuery,
            version: 1,
            generatedSeeds: {},
            feedback: {},
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    }

    // SSE stream setup
    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    const sendEvent = async (event: GenerateEvent) => {
        await writer.write(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
    };

    // Run pipeline in background
    (async () => {
        let totalPalettes = 0;

        try {
            // Send session info
            await sendEvent({
                type: "session",
                sessionId: currentSessionId,
                version,
            });

            // Fetch example palettes from vector search (runs in parallel with session setup)
            const examplePalettes = await getExamplePalettes(query, 5);
            console.log(
                `[GenerateV6] Found ${examplePalettes.length} example palettes for query: ${query}`,
            );

            // Stage 1: Composer - generate 6 variations with 1 palette spec each = 6 matrices
            // Then 6 painters each paint all 6 = 36 total palettes
            let composerOutput: ComposerOutput | null = null;
            for await (const event of runComposer(
                query,
                6,
                1,
                examplePalettes,
            )) {
                if (event.type === "__result") {
                    composerOutput = event.data;
                } else {
                    await sendEvent(event as GenerateEvent);
                }
            }

            if (!composerOutput) {
                await writer.close();
                return;
            }

            // Collect all matrices from all variations
            const allMatrices: PaletteMatrix[] = [];
            for (const variation of composerOutput.variations) {
                allMatrices.push(...variation.palettes);
            }

            // Each painter gets ALL matrices (6 total) and generates 6 palettes
            const painterTasks: Array<{
                modelConfig: (typeof PAINTER_MODELS)[number];
                matrices: PaletteMatrix[];
            }> = [];

            for (const modelConfig of PAINTER_MODELS) {
                painterTasks.push({
                    modelConfig,
                    matrices: allMatrices,
                });
            }

            // Stage 2: Run all painters in parallel
            const painterPromises = painterTasks.map(async (task) => {
                for await (const event of runPainter(
                    task.modelConfig,
                    task.matrices,
                    overrides,
                )) {
                    if (event.type === "palette") {
                        totalPalettes++;
                    }
                    await sendEvent(event);
                }
            });

            await Promise.allSettled(painterPromises);

            // Update session
            await db
                .update(refineSessions)
                .set({ version, updatedAt: new Date() })
                .where(eq(refineSessions.id, currentSessionId));

            await sendEvent({ type: "done", totalPalettes });
            await writer.close();
        } catch (error) {
            console.error("[GenerateV6] Pipeline error:", error);
            try {
                await sendEvent({
                    type: "composer_error",
                    error: String(error),
                });
                await writer.close();
            } catch {}
        }
    })();

    return new Response(readable, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        },
    });
}
