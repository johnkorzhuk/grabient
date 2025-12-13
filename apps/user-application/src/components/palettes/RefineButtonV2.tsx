import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fitCosinePalette } from "@repo/data-ops/gradient-gen";
import { serializeCoeffs } from "@repo/data-ops/serialization";
import { DEFAULT_GLOBALS } from "@repo/data-ops/valibot-schema/grabient";
import type { StreamingPalette, PaletteFeedback } from "@/server-functions/refine-v2";

export type { PaletteFeedback };

export interface RefinedPaletteV2 {
    seed: string;
    hexColors: string[];
}

interface RefineButtonV2Props {
    query: string;
    limit?: number;
    examplePalettes?: string[][];
    feedback?: PaletteFeedback;
    onRefineStart: () => void;
    onPaletteReceived: (palette: RefinedPaletteV2) => void;
    onRefineComplete: () => void;
    onRefineError: (error: string) => void;
    disabled?: boolean;
    className?: string;
}

export function RefineButtonV2({
    query,
    limit = 24,
    examplePalettes,
    feedback,
    onRefineStart,
    onPaletteReceived,
    onRefineComplete,
    onRefineError,
    disabled,
    className,
}: RefineButtonV2Props) {
    const [isRefining, setIsRefining] = useState(false);
    const [includeExamples, setIncludeExamples] = useState(false);

    const handleRefine = async () => {
        setIsRefining(true);
        onRefineStart();

        try {
            const body: {
                query: string;
                limit: number;
                examples?: string[][];
                feedback?: PaletteFeedback;
            } = { query, limit };

            if (includeExamples && examplePalettes && examplePalettes.length > 0) {
                body.examples = examplePalettes;
            }

            if (feedback && (feedback.good.length > 0 || feedback.bad.length > 0)) {
                body.feedback = feedback;
            }

            const response = await fetch("/api/refine", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errorData = await response.json() as { error?: string };
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error("No response body");
            }

            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Process SSE lines
                const lines = buffer.split("\n\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    const data = line.slice(6);

                    try {
                        const palette = JSON.parse(data) as StreamingPalette;

                        // Convert hex colors to cosine coefficients
                        const fitResult = fitCosinePalette(palette.colors);
                        const seed = serializeCoeffs(fitResult.coeffs, DEFAULT_GLOBALS);

                        onPaletteReceived({
                            seed,
                            hexColors: palette.colors,
                        });
                    } catch (parseError) {
                        console.warn("Failed to parse/fit palette:", parseError);
                    }
                }
            }

            onRefineComplete();
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to refine palettes";
            onRefineError(message);
        } finally {
            setIsRefining(false);
        }
    };

    const hasExamples = examplePalettes && examplePalettes.length > 0;

    return (
        <div className={cn("inline-flex items-center gap-3", className)}>
            {hasExamples && (
                <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={includeExamples}
                        onChange={(e) => setIncludeExamples(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-input accent-foreground cursor-pointer"
                    />
                    <span>Include examples</span>
                </label>
            )}
            <button
                type="button"
                onClick={handleRefine}
                disabled={disabled || isRefining}
                style={{ backgroundColor: "var(--background)" }}
                className={cn(
                    "disable-animation-on-theme-change",
                    "inline-flex items-center justify-center gap-2 rounded-md",
                    "font-bold text-sm h-8.5 px-3 border border-solid",
                    "border-input hover:border-muted-foreground/30 hover:bg-background/60",
                    "text-muted-foreground hover:text-foreground",
                    "transition-colors duration-200 cursor-pointer",
                    "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
            >
                {isRefining ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Refining...</span>
                    </>
                ) : (
                    <>
                        <Sparkles className="w-4 h-4" />
                        <span>Refine</span>
                    </>
                )}
            </button>
        </div>
    );
}
