import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ColorData } from "./color-data";

// Current refinement prompt version - update when prompt changes
export const REFINEMENT_PROMPT_VERSION = "v2";

// Schema for the refined output - minimal for vectorization
export const refinedTagsSchema = z.object({
    // Categorical attributes (single values)
    temperature: z.enum(["warm", "cool", "neutral", "cool-warm"]),
    contrast: z.enum(["high", "medium", "low"]),
    brightness: z.enum(["dark", "light", "medium", "varied"]),
    saturation: z.enum(["vibrant", "muted", "mixed"]),

    // Curated tag arrays
    mood: z.array(z.string()),
    style: z.array(z.string()),
    dominant_colors: z.array(z.string()),
    seasonal: z.array(z.string()),
    associations: z.array(z.string()),

    // Canonical tag string for embedding
    embed_text: z.string(),
});

export type RefinedTags = z.infer<typeof refinedTagsSchema>;

// Full response is just the refined tags - no analysis needed
export type RefinementResponse = RefinedTags;

// Summary data structure (what we send to Opus)
export interface TagSummary {
    seed: string;
    colorData: ColorData;
    totalModels: number;
    sourcePromptVersion: string;
    categorical: {
        temperature: Record<string, number>;
        contrast: Record<string, number>;
        brightness: Record<string, number>;
        saturation: Record<string, number>;
    };
    tags: {
        mood: Record<string, number>;
        style: Record<string, number>;
        dominant_colors: Record<string, number>;
        seasonal: Record<string, number>;
        associations: Record<string, number>;
    };
}

export const REFINEMENT_SYSTEM_PROMPT = `You are an expert color palette analyst. Refine and curate tag data from multiple AI models into a clean output for vector embedding.

TASK:
1. Review the color data and model consensus
2. Keep high-frequency tags (>50% agreement)
3. Add missing obvious tags from your direct analysis
4. Remove hallucinated or redundant tags
5. Normalize synonyms to canonical forms
6. Generate embed_text for semantic search

OUTPUT FORMAT (JSON only):
{
  "temperature": "warm|cool|neutral|cool-warm",
  "contrast": "high|medium|low",
  "brightness": "dark|light|medium|varied",
  "saturation": "vibrant|muted|mixed",
  "mood": ["tag1", "tag2"],
  "style": ["tag1", "tag2"],
  "dominant_colors": ["color1", "color2"],
  "seasonal": ["season"],
  "associations": ["tag1", "tag2", "tag3"],
  "embed_text": "space separated tags for vector search"
}

RULES:
- All tags: lowercase, singular, 1-2 words max
- mood: 2-5 emotional qualities (not "warm" if temperature is warm)
- style: 2-5 design movements/eras
- dominant_colors: 1-4 from: white, gray, black, brown, red, orange, yellow, lime, green, teal, cyan, blue, navy, purple, magenta, pink
- seasonal: 0-2 tags (only if clearly seasonal)
- associations: 5-10 specific concrete nouns (prefer "cherry blossom" over "flower")
- embed_text: 30-50 words, most important first, space-separated

Return ONLY valid JSON, no markdown.`;

/**
 * Create the user prompt with palette data and summary
 */
export function createRefinementPrompt(summary: TagSummary): string {
    const formatFrequencies = (data: Record<string, number>) => {
        return Object.entries(data)
            .sort((a, b) => b[1] - a[1])
            .map(([tag, count]) => `${tag}: ${count}/${summary.totalModels}`)
            .join(", ");
    };

    return `## Palette Color Data
\`\`\`json
${JSON.stringify(summary.colorData, null, 2)}
\`\`\`

## Model Consensus Data (${summary.totalModels} models)

### Categorical Attributes
- Temperature: ${formatFrequencies(summary.categorical.temperature)}
- Contrast: ${formatFrequencies(summary.categorical.contrast)}
- Brightness: ${formatFrequencies(summary.categorical.brightness)}
- Saturation: ${formatFrequencies(summary.categorical.saturation)}

### Tag Frequencies
- Mood: ${formatFrequencies(summary.tags.mood) || "none"}
- Style: ${formatFrequencies(summary.tags.style) || "none"}
- Dominant Colors: ${formatFrequencies(summary.tags.dominant_colors) || "none"}
- Seasonal: ${formatFrequencies(summary.tags.seasonal) || "none"}
- Associations: ${formatFrequencies(summary.tags.associations) || "none"}

Analyze this palette and refine the tags. Return only JSON.`;
}

/**
 * Call Opus 4.5 for a single refinement (for testing/small batches)
 */
export async function refineTagsSingle(
    apiKey: string,
    summary: TagSummary
): Promise<RefinementResponse> {
    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
        model: "claude-opus-4-5-20251101",
        max_tokens: 4096,
        thinking: {
            type: "enabled",
            budget_tokens: 2048, // Medium reasoning
        },
        messages: [
            {
                role: "user",
                content: createRefinementPrompt(summary),
            },
        ],
        system: REFINEMENT_SYSTEM_PROMPT,
    });

    // Extract text from response
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text response from Opus");
    }

    // Strip markdown code fence if present
    let jsonText = textBlock.text.trim();
    if (jsonText.startsWith("```json")) {
        jsonText = jsonText.slice(7); // Remove ```json
    } else if (jsonText.startsWith("```")) {
        jsonText = jsonText.slice(3); // Remove ```
    }
    if (jsonText.endsWith("```")) {
        jsonText = jsonText.slice(0, -3); // Remove trailing ```
    }
    jsonText = jsonText.trim();

    // Parse and validate JSON - response is now directly the refined tags
    const parsed = JSON.parse(jsonText);
    return refinedTagsSchema.parse(parsed);
}

/**
 * Create a batch request for multiple palettes
 * Uses Anthropic's Message Batches API for 50% cost savings
 */
export interface BatchRequest {
    custom_id: string; // seed
    params: {
        model: string;
        max_tokens: number;
        thinking: {
            type: "enabled";
            budget_tokens: number;
        };
        system: string;
        messages: Array<{
            role: "user";
            content: string;
        }>;
    };
}

export interface BatchRequestsResult {
    requests: BatchRequest[];
    idToSeed: Map<string, string>; // Maps custom_id back to seed
}

export function createBatchRequests(summaries: TagSummary[]): BatchRequestsResult {
    const idToSeed = new Map<string, string>();

    const requests = summaries.map((summary, index) => {
        // Use index as custom_id since seeds can exceed 64 char limit
        const customId = `idx_${index}`;
        idToSeed.set(customId, summary.seed);

        return {
            custom_id: customId,
            params: {
                model: "claude-opus-4-5-20251101",
                max_tokens: 4096,
                thinking: {
                    type: "enabled" as const,
                    budget_tokens: 2048,
                },
                system: REFINEMENT_SYSTEM_PROMPT,
                messages: [
                    {
                        role: "user" as const,
                        content: createRefinementPrompt(summary),
                    },
                ],
            },
        };
    });

    return { requests, idToSeed };
}

/**
 * Submit a batch to Anthropic's Message Batches API
 * Returns the batch ID for polling
 */
export async function submitBatch(
    apiKey: string,
    requests: BatchRequest[]
): Promise<string> {
    const anthropic = new Anthropic({ apiKey });

    const batch = await anthropic.messages.batches.create({
        requests: requests,
    });

    return batch.id;
}

/**
 * Check batch status
 */
export async function getBatchStatus(
    apiKey: string,
    batchId: string
): Promise<Anthropic.Messages.Batches.Batch> {
    const anthropic = new Anthropic({ apiKey });
    return anthropic.messages.batches.retrieve(batchId);
}

/**
 * Strip markdown code fence if present
 */
function stripMarkdownFence(text: string): string {
    let jsonText = text.trim();
    if (jsonText.startsWith("```json")) {
        jsonText = jsonText.slice(7);
    } else if (jsonText.startsWith("```")) {
        jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith("```")) {
        jsonText = jsonText.slice(0, -3);
    }
    return jsonText.trim();
}

/**
 * Get batch results once complete
 * Uses results_url since Cloudflare Workers doesn't support async iterators well
 */
export async function getBatchResults(
    apiKey: string,
    batchId: string
): Promise<Map<string, RefinementResponse | { error: string }>> {
    const anthropic = new Anthropic({ apiKey });

    // Get the batch to find the results_url
    const batch = await anthropic.messages.batches.retrieve(batchId);
    if (!batch.results_url) {
        throw new Error("Batch has no results_url - may not be complete");
    }

    // Fetch the results JSONL file directly
    const response = await fetch(batch.results_url, {
        headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch results: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    const lines = text.trim().split("\n");

    const results = new Map<string, RefinementResponse | { error: string }>();

    for (const line of lines) {
        if (!line) continue;

        const result = JSON.parse(line) as {
            custom_id: string;
            result: {
                type: "succeeded" | "errored" | "canceled" | "expired";
                message?: { content: Array<{ type: string; text?: string }> };
                error?: { message: string };
            };
        };

        const customId = result.custom_id;

        if (result.result.type === "succeeded" && result.result.message) {
            try {
                const textBlock = result.result.message.content.find(
                    (block) => block.type === "text"
                );
                if (textBlock && textBlock.type === "text" && textBlock.text) {
                    const jsonText = stripMarkdownFence(textBlock.text);
                    const parsed = JSON.parse(jsonText);
                    results.set(customId, refinedTagsSchema.parse(parsed));
                } else {
                    results.set(customId, { error: "No text in response" });
                }
            } catch (e) {
                results.set(customId, {
                    error: e instanceof Error ? e.message : String(e),
                });
            }
        } else {
            results.set(customId, {
                error: result.result.type === "errored"
                    ? result.result.error?.message || "Unknown error"
                    : "Request canceled or expired",
            });
        }
    }

    return results;
}
