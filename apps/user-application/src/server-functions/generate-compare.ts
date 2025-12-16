import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { streamObject, streamText } from "ai";
import { z } from "zod";
import * as v from "valibot";
import { AVAILABLE_MODELS, type ModelKey } from "@/lib/model-config";

// Event types for streaming
export type CompareEvent =
    | { type: "init"; models: { key: string; name: string }[] }
    | { type: "model_start"; modelKey: string; modelName: string }
    | { type: "palette"; modelKey: string; colors: string[] }
    | { type: "model_complete"; modelKey: string; paletteCount: number; duration: number }
    | { type: "model_error"; modelKey: string; error: string }
    | { type: "done"; allPalettes: Record<string, string[][]> };

const compareInputSchema = v.object({
    query: v.string(),
    limit: v.optional(v.number(), 12),
});

function buildSystemPrompt(query: string, limit: number): string {
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

OUTPUT: JSON array of ${limit} palettes, each with 5-7 hex colors.
Example: [["#hex1","#hex2","#hex3","#hex4","#hex5"], ...]`;
}

type ModelConfig = typeof AVAILABLE_MODELS[ModelKey];

function getModel(modelConfig: ModelConfig) {
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
}

// Generator function for a single model - yields palettes as they arrive
async function* generateForModelStream(
    modelKey: ModelKey,
    modelConfig: ModelConfig,
    systemPrompt: string,
    query: string,
): AsyncGenerator<CompareEvent> {
    const useManualParsing = modelConfig.provider === "groq" || modelConfig.provider === "openai";
    const allPalettes: string[][] = [];
    
    try {
        const model = getModel(modelConfig);
        const startTime = Date.now();
        
        yield { type: "model_start", modelKey, modelName: modelConfig.name };

        if (useManualParsing) {
            const result = streamText({
                model,
                system: systemPrompt,
                prompt: `## Theme: ${query}\n\nRespond with ONLY a JSON array of palette arrays. No markdown, no explanation. Example format:\n[["#hex1","#hex2","#hex3","#hex4","#hex5"],["#hex1","#hex2","#hex3","#hex4","#hex5"]]`,
            });

            let buffer = "";
            const paletteRegex = /\[\s*"#[0-9A-Fa-f]{6}"(?:\s*,\s*"#[0-9A-Fa-f]{6}")+\s*\]/g;

            for await (const chunk of result.textStream) {
                buffer += chunk;
                let match;
                
                while ((match = paletteRegex.exec(buffer)) !== null) {
                    try {
                        const palette = JSON.parse(match[0]) as string[];
                        if (palette.length >= 5 && palette.every(c => /^#[0-9A-Fa-f]{6}$/.test(c))) {
                            allPalettes.push(palette);
                            yield { type: "palette", modelKey, colors: palette };
                        }
                    } catch {}
                }
                
                const lastBracket = buffer.lastIndexOf(']');
                if (lastBracket > 0) {
                    buffer = buffer.slice(lastBracket + 1);
                }
            }
        } else {
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

            for await (const palette of result.elementStream) {
                allPalettes.push(palette);
                yield { type: "palette", modelKey, colors: palette };
            }
        }

        const duration = Date.now() - startTime;
        console.log(`[Compare] ${modelConfig.name} finished with ${allPalettes.length} palettes in ${duration}ms`);
        yield { type: "model_complete", modelKey, paletteCount: allPalettes.length, duration };
        
    } catch (error) {
        console.error(`[Compare] ${modelConfig.name} error:`, error);
        yield { type: "model_error", modelKey, error: String(error) };
    }
}

// Main server function using async generator
export const generateCompare = createServerFn({ method: "POST" })
    .inputValidator((input: unknown) => v.parse(compareInputSchema, input))
    .handler(async function* (ctx: { data: { query: string; limit?: number } }) {
        const { query, limit = 12 } = ctx.data;
        
        console.log(`[Compare] Starting comparison for "${query}" with limit ${limit}`);
        
        const systemPrompt = buildSystemPrompt(query, limit);
        const modelEntries = Object.entries(AVAILABLE_MODELS) as [ModelKey, ModelConfig][];
        
        // Send init event with all models
        yield {
            type: "init",
            models: modelEntries.map(([key, config]) => ({ key, name: config.name })),
        } as CompareEvent;

        // Track results from all models
        const allResults: Record<string, string[][]> = {};
        
        // Create generators for all models
        const generators = modelEntries.map(([modelKey, modelConfig]) => ({
            modelKey,
            generator: generateForModelStream(modelKey, modelConfig, systemPrompt, query),
        }));

        // Process all generators concurrently, yielding events as they come
        const activeGenerators = new Map(
            generators.map(g => [g.modelKey, g.generator])
        );
        
        // Initialize results tracking
        for (const [modelKey] of modelEntries) {
            allResults[modelKey] = [];
        }

        // Poll all generators until they're all done
        while (activeGenerators.size > 0) {
            const promises = Array.from(activeGenerators.entries()).map(
                async ([modelKey, gen]) => {
                    const result = await gen.next();
                    return { modelKey, result };
                }
            );

            // Wait for any generator to produce a value
            const settled = await Promise.race(
                promises.map(p => p.then(r => ({ ...r, done: r.result.done })))
            );

            if (settled.result.done) {
                activeGenerators.delete(settled.modelKey);
            } else {
                const event = settled.result.value as CompareEvent;
                
                // Track palettes for final summary
                if (event.type === "palette") {
                    allResults[event.modelKey]?.push(event.colors);
                }
                
                yield event;
            }

            // Continue processing remaining events from the same generator
            // by re-adding it to be polled
        }

        console.log("[Compare] All models finished");
        console.log("[Compare] Results summary:", Object.entries(allResults).map(([k, v]) => `${k}: ${v.length}`).join(", "));

        // Send done event with all palettes
        yield {
            type: "done",
            allPalettes: allResults,
        } as CompareEvent;
    });
