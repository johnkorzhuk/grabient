import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { DEFAULT_PAGE_LIMIT } from "@repo/data-ops/valibot-schema/grabient";
import {
    fitCosinePalette,
    cosineGradient,
    rgbToHex,
} from "@repo/data-ops/gradient-gen";
import { serializeCoeffs } from "@repo/data-ops/serialization";
import { DEFAULT_GLOBALS } from "@repo/data-ops/valibot-schema/grabient";
import { hexToColorName } from "@/lib/color-utils";

const refineInputSchema = z.object({
    query: z.string().min(1).max(500),
    limit: z.number().min(1).max(100).optional(),
    referenceExamples: z.array(z.object({
        hexColors: z.array(z.string()),
    })),
    likedSeeds: z.array(z.string()).optional(),
    dislikedSeeds: z.array(z.string()).optional(),
});

export interface RefinedPalette {
    seed: string;
    hexColors: string[];
    signature: string;
}

export interface RefineResult {
    palettes: RefinedPalette[];
}

// Get color signature for uniqueness checking
function getPaletteSignature(hexColors: string[]): string {
    const names: string[] = [];
    let lastName = "";
    for (const hex of hexColors) {
        const name = hexToColorName(hex);
        if (name !== lastName) {
            names.push(name);
            lastName = name;
        }
    }
    return names.join(" → ");
}

// Fit hex colors to a cosine gradient and return seed + fitted colors
function fitPalette(hexColors: string[]): { seed: string; fittedColors: string[] } | null {
    try {
        const result = fitCosinePalette(hexColors);
        const seed = serializeCoeffs(result.coeffs, DEFAULT_GLOBALS);
        const fittedRgb = cosineGradient(9, result.coeffs);
        const fittedColors = fittedRgb.map((c) => rgbToHex(c[0], c[1], c[2]));
        return { seed, fittedColors };
    } catch {
        return null;
    }
}

// Build prompt for LLM
function buildPrompt(
    query: string,
    limit: number,
    referenceExamples: { hexColors: string[] }[],
): string {
    const perSet = Math.ceil(limit / 3);
    const examples = referenceExamples
        .slice(0, 12)
        .map((ex) => ex.hexColors.slice(0, 5).join(", "))
        .join("\n");

    return `Generate gradient palettes for: "${query}"

You must create 3 DISTINCT sets of palettes:

SET 1 - PURE INTERPRETATION (${perSet} palettes):
Create palettes based ONLY on your understanding of "${query}".
Ignore the reference palettes below. Use your knowledge of colors, themes, and aesthetics.

SET 2 - REFERENCE-INSPIRED (${perSet} palettes):
Use these reference palettes as inspiration:
${examples}
Create palettes that follow similar color patterns and styles to these references.

SET 3 - CREATIVE FUSION (${perSet} palettes):
Combine your pure interpretation with elements from the references.
Take the best aspects of both approaches to create unique variations.

IMPORTANT:
- Consider color harmony, contrast, and visual flow within each gradient
- Each palette should have 5-7 hex colors
- Ensure variety WITHIN each set (don't repeat similar palettes)
- Ensure variety BETWEEN sets (each set should feel different)
- Output ONLY a single JSON array containing ALL ${limit} palettes
- No explanations, labels, or set markers in the output

Example format:
[
  ["#ff6b6b", "#feca57", "#48dbfb", "#1dd1a1", "#5f27cd"],
  ["#2c3e50", "#3498db", "#1abc9c", "#27ae60", "#f39c12"]
]

Output only valid JSON.`;
}

export const testRefineConnection = createServerFn({ method: "POST" })
    .inputValidator((input: unknown) => refineInputSchema.parse(input))
    .handler(async (ctx) => {
        const {
            query,
            limit = DEFAULT_PAGE_LIMIT,
            referenceExamples,
        } = ctx.data;

        if (!env.GROQ_API_KEY) {
            throw new Error("GROQ_API_KEY is not configured");
        }

        const prompt = buildPrompt(query, limit, referenceExamples);

        // Call Groq API directly with streaming
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${env.GROQ_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "moonshotai/kimi-k2-instruct",
                messages: [
                    { role: "user", content: prompt },
                ],
                max_tokens: 4096,
                stream: true,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Groq API error: ${error}`);
        }

        // Stream processing - accumulate content and fit palettes as they complete
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();

        const seenSeeds = new Set<string>();
        const signatureCounts = new Map<string, number>();
        const MAX_SIGNATURE_USES = 2;

        (async () => {
            try {
                let buffer = "";
                let jsonBuffer = "";
                const reader = response.body?.getReader();
                if (!reader) throw new Error("No response body");

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });

                    // Process SSE lines
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";

                    for (const line of lines) {
                        if (!line.startsWith("data: ")) continue;
                        const data = line.slice(6);
                        if (data === "[DONE]") continue;

                        try {
                            const json = JSON.parse(data);
                            const content = json.choices?.[0]?.delta?.content;
                            if (content) {
                                jsonBuffer += content;

                                // Try to extract complete palette arrays as they stream
                                const palettes = extractCompletePalettes(jsonBuffer);
                                for (const hexColors of palettes.complete) {
                                    const fitted = fitPalette(hexColors);
                                    if (!fitted) continue;
                                    if (seenSeeds.has(fitted.seed)) continue;

                                    const signature = getPaletteSignature(fitted.fittedColors);
                                    const sigCount = signatureCounts.get(signature) || 0;
                                    if (sigCount >= MAX_SIGNATURE_USES) continue;

                                    seenSeeds.add(fitted.seed);
                                    signatureCounts.set(signature, sigCount + 1);

                                    // Send fitted palette to client
                                    await writer.write(encoder.encode(
                                        JSON.stringify({
                                            type: "palette",
                                            palette: {
                                                seed: fitted.seed,
                                                hexColors: fitted.fittedColors,
                                                signature,
                                            },
                                        }) + "\n"
                                    ));
                                }
                                jsonBuffer = palettes.remaining;
                            }
                        } catch {
                            // Skip unparseable chunks
                        }
                    }
                }

                // Process any remaining content
                const finalPalettes = extractCompletePalettes(jsonBuffer + "]");
                for (const hexColors of finalPalettes.complete) {
                    const fitted = fitPalette(hexColors);
                    if (!fitted) continue;
                    if (seenSeeds.has(fitted.seed)) continue;

                    const signature = getPaletteSignature(fitted.fittedColors);
                    const sigCount = signatureCounts.get(signature) || 0;
                    if (sigCount >= MAX_SIGNATURE_USES) continue;

                    seenSeeds.add(fitted.seed);
                    signatureCounts.set(signature, sigCount + 1);

                    await writer.write(encoder.encode(
                        JSON.stringify({
                            type: "palette",
                            palette: {
                                seed: fitted.seed,
                                hexColors: fitted.fittedColors,
                                signature,
                            },
                        }) + "\n"
                    ));
                }

                // Signal completion
                await writer.write(encoder.encode(
                    JSON.stringify({ type: "done" }) + "\n"
                ));

            } catch (error) {
                console.error("[refine] Error:", error);
                const errorMsg = error instanceof Error ? error.message : "Unknown error";
                await writer.write(encoder.encode(
                    JSON.stringify({ type: "error", error: errorMsg }) + "\n"
                ));
            } finally {
                await writer.close();
            }
        })();

        return new Response(readable, {
            headers: {
                "Content-Type": "application/x-ndjson",
                "Transfer-Encoding": "chunked",
            },
        });
    });

// Extract complete palette arrays from streaming JSON
function extractCompletePalettes(buffer: string): { complete: string[][]; remaining: string } {
    const complete: string[][] = [];

    // Find all complete arrays like ["#xxx", "#yyy", ...]
    const arrayRegex = /\["#[0-9a-fA-F]{6}"(?:,\s*"#[0-9a-fA-F]{6}")*\]/g;
    let match;
    let lastIndex = 0;

    while ((match = arrayRegex.exec(buffer)) !== null) {
        try {
            const arr = JSON.parse(match[0]) as string[];
            if (arr.length >= 5) {
                complete.push(arr);
            }
            lastIndex = match.index + match[0].length;
        } catch {
            // Skip invalid JSON
        }
    }

    // Return remaining unparsed content
    const remaining = buffer.slice(lastIndex);
    return { complete, remaining };
}
