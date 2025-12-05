import { generateObject, generateText } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { createGroq } from "@ai-sdk/groq";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { TAGGING_SYSTEM_PROMPT, CURRENT_PROMPT_VERSION } from "./prompts/index";
import type { ColorData } from "./color-data";

// Re-export prompt version for use in app.ts
export { CURRENT_PROMPT_VERSION };

// Zod schema for LLM response validation
export const tagResponseSchema = z.object({
    mood: z.array(z.string()),
    style: z.array(z.string()),
    dominant_colors: z.array(z.string()),
    temperature: z.enum(["warm", "cool", "neutral", "cool-warm"]),
    contrast: z.enum(["high", "medium", "low"]),
    brightness: z.enum(["dark", "light", "medium", "varied"]),
    saturation: z.enum(["vibrant", "muted", "mixed"]),
    seasonal: z.array(z.string()),
    associations: z.array(z.string()),
});

export type TagResponse = z.infer<typeof tagResponseSchema>;

// Provider configuration
export const PROVIDERS = [
    // Workers AI models - require deployed worker or --remote mode
    // { name: "workers-ai-gemma", model: "@cf/google/gemma-3-12b-it" },
    // { name: "workers-ai-granite", model: "@cf/ibm-granite/granite-4.0-h-micro" },
    { name: "groq-llama3", model: "llama-3.3-70b-versatile" },
    { name: "groq-llama4", model: "meta-llama/llama-4-scout-17b-16e-instruct" },
    { name: "groq-qwen3", model: "qwen/qwen3-32b" },
    { name: "groq-gpt-oss-120b", model: "openai/gpt-oss-120b" },
    { name: "groq-gpt-oss-20b", model: "openai/gpt-oss-20b" },
    { name: "google-gemini", model: "gemini-2.0-flash" },
    { name: "google-gemini-lite", model: "gemini-2.5-flash-lite" },
    { name: "openai-gpt4", model: "gpt-4o-mini" },
    { name: "openai-gpt5-nano", model: "gpt-5-nano" },
    { name: "anthropic-haiku", model: "claude-3-5-haiku-20241022" },
] as const;

export type ProviderName = (typeof PROVIDERS)[number]["name"];

export interface ProviderResult {
    provider: string;
    model: string;
    tags: TagResponse | null;
    error?: string;
}

interface Env {
    AI: Ai;
    OPENAI_API_KEY: string;
    GOOGLE_GENERATIVE_AI_API_KEY: string;
    ANTHROPIC_API_KEY: string;
    GROQ_API_KEY: string;
}

/**
 * Extract JSON from text that may be wrapped in markdown code blocks or thinking tags
 */
function extractJson(text: string): string {
    let cleaned = text.trim();

    // Remove <think>...</think> tags (Qwen3 reasoning)
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    // Check for ```json or ``` code blocks
    const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
        return match[1].trim();
    }

    // Try to find JSON object directly
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        return jsonMatch[0];
    }

    // If nothing else works, return as-is
    return cleaned;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 5,
    baseDelayMs = 1000,
): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError =
                error instanceof Error ? error : new Error(String(error));

            // Don't retry on permanent errors
            if (isPermanentError(error)) {
                throw lastError;
            }

            // Exponential backoff
            if (attempt < maxRetries - 1) {
                const delay = baseDelayMs * Math.pow(2, attempt);
                console.log(
                    `Attempt ${attempt + 1} failed, retrying in ${delay}ms...`,
                );
                await sleep(delay);
            }
        }
    }

    throw lastError;
}

/**
 * Check if an error is permanent (shouldn't retry)
 */
function isPermanentError(error: unknown): boolean {
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        // API key issues, invalid requests
        if (
            message.includes("401") ||
            message.includes("403") ||
            message.includes("unauthorized") ||
            message.includes("forbidden") ||
            message.includes("invalid api key")
        ) {
            return true;
        }
    }
    return false;
}

/**
 * Call a specific provider to generate tags
 */
export async function callProvider(
    env: Env,
    providerName: string,
    modelId: string,
    colorData: ColorData,
): Promise<TagResponse> {
    const userPrompt = JSON.stringify(colorData, null, 2);

    switch (providerName) {
        case "workers-ai-gemma":
        case "workers-ai-granite": {
            const workersAI = createWorkersAI({ binding: env.AI });
            const { object } = await generateObject({
                model: workersAI(modelId as Parameters<typeof workersAI>[0]),
                schema: tagResponseSchema,
                system: TAGGING_SYSTEM_PROMPT,
                prompt: userPrompt,
                temperature: 0.8,
            });
            return object;
        }

        case "groq-llama4": {
            const groq = createGroq({ apiKey: env.GROQ_API_KEY });
            const { object } = await generateObject({
                model: groq(modelId),
                schema: tagResponseSchema,
                system: TAGGING_SYSTEM_PROMPT,
                prompt: userPrompt,
                temperature: 0.8,
            });
            return object;
        }

        // Qwen3 doesn't support json_schema, use generateText + manual parsing
        // Also disable thinking mode with reasoning_effort: "none"
        case "groq-qwen3": {
            const groq = createGroq({ apiKey: env.GROQ_API_KEY });
            const { text } = await generateText({
                model: groq(modelId),
                system: TAGGING_SYSTEM_PROMPT,
                prompt: userPrompt,
                temperature: 0.8,
                providerOptions: {
                    groq: {
                        reasoning_effort: "none",
                    },
                },
            });
            const jsonText = extractJson(text);
            const parsed = JSON.parse(jsonText);
            return tagResponseSchema.parse(parsed);
        }

        // GPT-OSS models are reasoning models - temperature not supported
        case "groq-gpt-oss-120b":
        case "groq-gpt-oss-20b": {
            const groq = createGroq({ apiKey: env.GROQ_API_KEY });
            const { object } = await generateObject({
                model: groq(modelId),
                schema: tagResponseSchema,
                system: TAGGING_SYSTEM_PROMPT,
                prompt: userPrompt,
                providerOptions: {
                    groq: {
                        reasoning_effort: "low",
                    },
                },
            });
            return object;
        }

        // Llama 3.3 70B doesn't support json_schema, use generateText + manual parsing
        case "groq-llama3": {
            const groq = createGroq({ apiKey: env.GROQ_API_KEY });
            const { text } = await generateText({
                model: groq(modelId),
                system: TAGGING_SYSTEM_PROMPT,
                prompt: userPrompt,
                temperature: 0.8,
            });
            // Strip markdown code blocks if present
            const jsonText = extractJson(text);
            const parsed = JSON.parse(jsonText);
            return tagResponseSchema.parse(parsed);
        }

        case "google-gemini":
        case "google-gemini-lite": {
            const google = createGoogleGenerativeAI({
                apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
            });
            const { object } = await generateObject({
                model: google(modelId),
                schema: tagResponseSchema,
                system: TAGGING_SYSTEM_PROMPT,
                prompt: userPrompt,
                temperature: 0.8,
            });
            return object;
        }

        case "openai-gpt4": {
            const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
            const { object } = await generateObject({
                model: openai(modelId),
                schema: tagResponseSchema,
                system: TAGGING_SYSTEM_PROMPT,
                prompt: userPrompt,
                temperature: 0.8,
            });
            return object;
        }

        // GPT-5 nano is a reasoning model - temperature not supported
        case "openai-gpt5-nano": {
            const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
            const { object } = await generateObject({
                model: openai(modelId),
                schema: tagResponseSchema,
                system: TAGGING_SYSTEM_PROMPT,
                prompt: userPrompt,
            });
            return object;
        }

        case "anthropic-haiku": {
            const anthropic = createAnthropic({
                apiKey: env.ANTHROPIC_API_KEY,
            });
            const { object } = await generateObject({
                model: anthropic(modelId),
                schema: tagResponseSchema,
                system: TAGGING_SYSTEM_PROMPT,
                prompt: userPrompt,
                temperature: 0.8,
            });
            return object;
        }

        default:
            throw new Error(`Unknown provider: ${providerName}`);
    }
}

/**
 * Call a provider with retries
 */
export async function callProviderWithRetry(
    env: Env,
    providerName: string,
    modelId: string,
    colorData: ColorData,
): Promise<ProviderResult> {
    try {
        const tags = await withRetry(
            () => callProvider(env, providerName, modelId, colorData),
            5,
            1000,
        );
        return { provider: providerName, model: modelId, tags };
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        console.error(`Provider ${providerName} failed: ${errorMessage}`);
        return {
            provider: providerName,
            model: modelId,
            tags: null,
            error: errorMessage,
        };
    }
}

/**
 * Call specified providers for a palette in parallel
 */
export async function callAllProviders(
    env: Env,
    colorData: ColorData,
    providersToCall: ReadonlyArray<{
        readonly name: string;
        readonly model: string;
    }> = PROVIDERS,
): Promise<ProviderResult[]> {
    console.log(`Calling ${providersToCall.length} providers in parallel...`);

    const results = await Promise.all(
        providersToCall.map((provider) =>
            callProviderWithRetry(
                env,
                provider.name,
                provider.model,
                colorData,
            ),
        ),
    );

    return results;
}
