import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fitCosinePalette } from "@repo/data-ops/gradient-gen";
import { serializeCoeffs } from "@repo/data-ops/serialization";
import { DEFAULT_GLOBALS } from "@repo/data-ops/valibot-schema/grabient";
import type { StreamingPalette } from "@/server-functions/refine-v2";

export interface RefinedPaletteV2 {
    seed: string;
    hexColors: string[];
}

interface RefineButtonV2Props {
    query: string;
    limit?: number;
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
    onRefineStart,
    onPaletteReceived,
    onRefineComplete,
    onRefineError,
    disabled,
    className,
}: RefineButtonV2Props) {
    const [isRefining, setIsRefining] = useState(false);

    const handleRefine = async () => {
        setIsRefining(true);
        onRefineStart();

        try {
            const response = await fetch("/api/refine", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query, limit }),
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

    return (
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
                className,
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
    );
}
