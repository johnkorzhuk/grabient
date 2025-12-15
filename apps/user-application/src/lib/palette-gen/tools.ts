import { hexToColorName } from "@repo/data-ops/color-utils";
import {
    cosineGradient,
    rgbToHex,
    quickMix,
    fitCosinePalette,
} from "@repo/data-ops/gradient-gen";
import {
    serializeCoeffs,
    deserializeCoeffs,
} from "@repo/data-ops/serialization";
import { DEFAULT_GLOBALS } from "@repo/data-ops/valibot-schema/grabient";

// Maximum times the same signature can be used
export const MAX_SIGNATURE_USES = 2;

/**
 * Converts a hex palette to a color signature for uniqueness checking.
 * Returns deduplicated adjacent color names joined by arrows.
 */
export function getPaletteSignature(hexColors: string[]): string {
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

/**
 * Get hex preview colors from a seed
 */
export function seedToHexPreview(seed: string, steps = 9): string[] {
    const { coeffs } = deserializeCoeffs(seed);
    const rgb = cosineGradient(steps, coeffs);
    return rgb.map((c) => rgbToHex(c[0], c[1], c[2]));
}

/**
 * Tool definitions for LLM palette curation
 */
export const paletteTools = {
    preview_seed: {
        description: "Preview a palette by its seed. Returns hex colors and color signature to help evaluate if it matches the query.",
        parameters: {
            type: "object" as const,
            properties: {
                seed: {
                    type: "string" as const,
                    description: "The palette seed string",
                },
            },
            required: ["seed"],
        },
    },
    fit_palette: {
        description: "Create a new palette from hex colors. Fits the colors to a smooth cosine gradient and returns a seed. Use this to generate entirely new palettes that match the query theme.",
        parameters: {
            type: "object" as const,
            properties: {
                hexColors: {
                    type: "array" as const,
                    items: { type: "string" as const },
                    description: "Array of 5-11 hex color codes (e.g. [\"#1a1a2e\", \"#16213e\", \"#0f3460\"])",
                },
            },
            required: ["hexColors"],
        },
    },
    mix_seeds: {
        description: "Mix multiple palette seeds to create new variations. Select seeds that best match the query theme, then mix to generate related palettes.",
        parameters: {
            type: "object" as const,
            properties: {
                seeds: {
                    type: "array" as const,
                    items: { type: "string" as const },
                    description: "Array of 1-5 palette seeds to mix together",
                },
                count: {
                    type: "number" as const,
                    description: "Number of variations to generate (1-8, default 4)",
                },
            },
            required: ["seeds"],
        },
    },
    approve_palette: {
        description: "Approve a palette for inclusion in results. Call this ONLY for palettes that: 1) Match the query theme well, 2) Are visually distinct from already-approved palettes. The palette will be added to the final results.",
        parameters: {
            type: "object" as const,
            properties: {
                seed: {
                    type: "string" as const,
                    description: "The seed of the palette to approve",
                },
                reason: {
                    type: "string" as const,
                    description: "Brief reason why this palette fits the query (helps track decisions)",
                },
            },
            required: ["seed"],
        },
    },
};

export interface ToolResult {
    success: boolean;
    message: string;
    data?: {
        seed?: string;
        seeds?: string[];
        hexColors?: string[];
        signature?: string;
        previews?: Array<{ seed: string; hexColors: string[]; signature: string }>;
    };
}

export interface ApprovedPalette {
    seed: string;
    hexColors: string[];
    signature: string;
    reason?: string;
}

export interface ToolCall {
    tool: string;
    args: Record<string, unknown>;
    result: ToolResult;
    timestamp: number;
}

export interface ToolContext {
    approvedPalettes: ApprovedPalette[];
    signatureCounts: Map<string, number>;
    seenSeeds: Set<string>;
    toolCalls: ToolCall[];
}

/**
 * Handle tool calls for palette curation
 */
export function handlePaletteTool(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolContext,
): ToolResult {
    const result = handleToolInternal(toolName, args, context);

    // Log the tool call
    context.toolCalls.push({
        tool: toolName,
        args,
        result,
        timestamp: Date.now(),
    });

    return result;
}

function handleToolInternal(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolContext,
): ToolResult {
    if (toolName === "preview_seed") {
        const seed = args.seed as string;
        if (!seed) {
            return { success: false, message: "ERROR: seed is required" };
        }

        try {
            const hexColors = seedToHexPreview(seed);
            const signature = getPaletteSignature(hexColors);
            return {
                success: true,
                message: `Signature: "${signature}". Colors: ${hexColors.slice(0, 5).join(", ")}...`,
                data: { seed, hexColors, signature },
            };
        } catch (e) {
            return {
                success: false,
                message: `ERROR: Invalid seed - ${e instanceof Error ? e.message : "unknown error"}`,
            };
        }
    }

    if (toolName === "fit_palette") {
        const hexColors = args.hexColors as string[];
        if (!hexColors || hexColors.length < 5) {
            return { success: false, message: "ERROR: Need at least 5 hex colors" };
        }
        if (hexColors.length > 11) {
            return { success: false, message: "ERROR: Maximum 11 hex colors" };
        }

        try {
            const result = fitCosinePalette(hexColors);
            const seed = serializeCoeffs(result.coeffs, DEFAULT_GLOBALS);
            const fittedRgb = cosineGradient(hexColors.length, result.coeffs);
            const fittedHexColors = fittedRgb.map((c) => rgbToHex(c[0], c[1], c[2]));
            const signature = getPaletteSignature(fittedHexColors);

            const errorLevel =
                result.error < 0.05
                    ? "excellent"
                    : result.error < 0.15
                      ? "good"
                      : result.error < 0.3
                        ? "acceptable"
                        : "poor";

            return {
                success: true,
                message: `Fit ${errorLevel} (error: ${result.error.toFixed(3)}). Seed: "${seed.slice(0, 25)}...". Signature: "${signature}"`,
                data: { seed, hexColors: fittedHexColors, signature },
            };
        } catch (e) {
            return {
                success: false,
                message: `ERROR: ${e instanceof Error ? e.message : "Fitting failed"}`,
            };
        }
    }

    if (toolName === "mix_seeds") {
        const seeds = args.seeds as string[];
        const count = Math.min(Math.max((args.count as number) || 4, 1), 8);

        if (!seeds || seeds.length < 1) {
            return { success: false, message: "ERROR: Need at least 1 seed to mix" };
        }
        if (seeds.length > 5) {
            return { success: false, message: "ERROR: Maximum 5 seeds allowed" };
        }

        try {
            // Deserialize input seeds to coefficients
            const inputCoeffs = seeds.map((s) => deserializeCoeffs(s).coeffs);

            // Generate mixed variations
            const mixedCoeffs = quickMix(inputCoeffs, count);

            // Convert to seeds and previews
            const previews = mixedCoeffs.map((coeffs) => {
                const seed = serializeCoeffs(coeffs, DEFAULT_GLOBALS);
                const hexColors = cosineGradient(9, coeffs).map((c) =>
                    rgbToHex(c[0], c[1], c[2]),
                );
                const signature = getPaletteSignature(hexColors);
                return { seed, hexColors, signature };
            });

            const resultSeeds = previews.map((p) => p.seed);

            return {
                success: true,
                message: `Generated ${previews.length} variations:\n${previews.map((p, i) => `${i + 1}. seed="${p.seed.slice(0, 20)}..." sig="${p.signature}"`).join("\n")}`,
                data: { seeds: resultSeeds, previews },
            };
        } catch (e) {
            return {
                success: false,
                message: `ERROR: ${e instanceof Error ? e.message : "Mixing failed"}`,
            };
        }
    }

    if (toolName === "approve_palette") {
        const seed = args.seed as string;
        const reason = args.reason as string | undefined;

        if (!seed) {
            return { success: false, message: "ERROR: seed is required" };
        }

        // Check if already approved
        if (context.seenSeeds.has(seed)) {
            return {
                success: false,
                message: "REJECTED: This exact palette was already approved",
            };
        }

        try {
            const hexColors = seedToHexPreview(seed);
            const signature = getPaletteSignature(hexColors);

            // Check signature uniqueness
            const signatureCount = context.signatureCounts.get(signature) || 0;
            if (signatureCount >= MAX_SIGNATURE_USES) {
                return {
                    success: false,
                    message: `REJECTED: Signature "${signature}" already used ${signatureCount} times (max ${MAX_SIGNATURE_USES}). Choose a more distinct palette.`,
                };
            }

            // Approve the palette
            context.seenSeeds.add(seed);
            context.signatureCounts.set(signature, signatureCount + 1);
            context.approvedPalettes.push({ seed, hexColors, signature, reason });

            return {
                success: true,
                message: `APPROVED: "${signature}" (${context.approvedPalettes.length} total approved)`,
                data: { seed, hexColors, signature },
            };
        } catch (e) {
            return {
                success: false,
                message: `ERROR: Invalid seed - ${e instanceof Error ? e.message : "unknown error"}`,
            };
        }
    }

    return { success: false, message: "Unknown tool" };
}
