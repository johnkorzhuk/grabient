import { useState } from "react";
import { Sparkles, Loader2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { fitCosinePalette } from "@repo/data-ops/gradient-gen";
import { serializeCoeffs } from "@repo/data-ops/serialization";
import { DEFAULT_GLOBALS } from "@repo/data-ops/valibot-schema/grabient";
import type { StreamingPalette, PaletteFeedback } from "@/server-functions/refine";

export type { PaletteFeedback };

export type PromptMode = "vector-search" | "unbiased" | "examples-only" | "full-feedback" | "positive-only";

const PROMPT_MODE_LABELS: Record<PromptMode, string> = {
    "vector-search": "Vector search (no AI)",
    unbiased: "Unbiased (no examples)",
    "examples-only": "Examples only",
    "full-feedback": "Examples + feedback (+/-)",
    "positive-only": "Examples + positive only",
};

export interface RefinedPalette {
    seed: string;
    hexColors: string[];
}

interface RefineButtonProps {
    query: string;
    limit?: number;
    examplePalettes?: string[][];
    feedback?: PaletteFeedback;
    promptMode: PromptMode;
    onModeChange: (mode: PromptMode) => void;
    onRefineStart: () => void;
    onPaletteReceived: (palette: RefinedPalette) => void;
    onRefineComplete: () => void;
    onRefineError: (error: string) => void;
    disabled?: boolean;
    className?: string;
}

export function RefineButton({
    query,
    limit = 24,
    examplePalettes,
    feedback,
    promptMode,
    onModeChange,
    onRefineStart,
    onPaletteReceived,
    onRefineComplete,
    onRefineError,
    disabled,
    className,
}: RefineButtonProps) {
    const [isRefining, setIsRefining] = useState(false);

    const handleRefine = async () => {
        setIsRefining(true);
        onRefineStart();

        try {
            // Vector search mode: handled by parent (uses existing results with seeds)
            if (promptMode === "vector-search") {
                onRefineComplete();
                return;
            }

            const body: {
                query: string;
                limit: number;
                mode: PromptMode;
                examples?: string[][];
                feedback?: PaletteFeedback;
            } = { query, limit, mode: promptMode };

            if (promptMode !== "unbiased" && examplePalettes && examplePalettes.length > 0) {
                body.examples = examplePalettes;
            }

            // Only include feedback for modes that use it
            const usesFeedback = promptMode === "full-feedback" || promptMode === "positive-only";
            if (usesFeedback && feedback && (feedback.good.length > 0 || feedback.bad.length > 0)) {
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

    const promptModes: PromptMode[] = ["vector-search", "unbiased", "examples-only", "full-feedback", "positive-only"];

    return (
        <div className={cn("inline-flex items-center gap-2", className)}>
            <div className="relative">
                <select
                    value={promptMode}
                    onChange={(e) => onModeChange(e.target.value as PromptMode)}
                    disabled={isRefining}
                    style={{ backgroundColor: "var(--background)" }}
                    className={cn(
                        "disable-animation-on-theme-change",
                        "appearance-none rounded-md",
                        "font-medium text-xs h-8.5 pl-3 pr-7 border border-solid",
                        "border-input hover:border-muted-foreground/30 hover:bg-background/60",
                        "text-muted-foreground hover:text-foreground",
                        "transition-colors duration-200 cursor-pointer",
                        "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                    )}
                >
                    {promptModes.map((mode) => (
                        <option key={mode} value={mode}>
                            {PROMPT_MODE_LABELS[mode]}
                        </option>
                    ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>
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
