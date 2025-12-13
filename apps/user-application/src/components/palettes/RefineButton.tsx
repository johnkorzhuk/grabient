import { cn } from "@/lib/utils";
import { Sparkles, Loader2, X } from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { testRefineConnection, type RefineResult, type RefinedPalette } from "@/server-functions/refine";
import type { ReferenceExample } from "@/lib/palette-gen/prompts";

interface RefineButtonProps {
    query: string;
    limit: number;
    isRefining: boolean;
    onRefineStart: (isUpdate: boolean) => void;
    onRefineProgress: (approved: number, currentTool?: string) => void;
    onRefineComplete: (result: RefineResult) => void;
    onRefineError: (error: string) => void;
    onRefineClear: () => void;
    hasResults: boolean;
    referenceExamples: ReferenceExample[];
    likedSeeds: string[];
    dislikedSeeds: string[];
    hasFeedback: boolean;
    canGiveFeedback: boolean;
    iterationCount: number;
    maxIterations: number;
    className?: string;
}

export function RefineButton({
    query,
    limit,
    isRefining,
    onRefineStart,
    onRefineProgress,
    onRefineComplete,
    onRefineError,
    onRefineClear,
    hasResults,
    referenceExamples,
    likedSeeds,
    dislikedSeeds,
    hasFeedback,
    canGiveFeedback,
    iterationCount,
    maxIterations,
    className,
}: RefineButtonProps) {
    const handleRefine = async (isUpdate: boolean) => {
        if (!query || isRefining) return;
        if (isUpdate && !canGiveFeedback) return;

        onRefineStart(isUpdate);

        try {
            const response = await testRefineConnection({
                data: {
                    query,
                    limit,
                    referenceExamples,
                    likedSeeds: likedSeeds.length > 0 ? likedSeeds : undefined,
                    dislikedSeeds: dislikedSeeds.length > 0 ? dislikedSeeds : undefined,
                },
            });

            if (response instanceof Response) {
                const reader = response.body?.getReader();
                if (!reader) {
                    throw new Error("No response body");
                }

                const decoder = new TextDecoder();
                let buffer = "";
                const palettes: RefinedPalette[] = [];

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });

                    // Parse NDJSON lines
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";

                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const msg = JSON.parse(line);
                            if (msg.type === "palette") {
                                palettes.push(msg.palette);
                                onRefineProgress(palettes.length, "generating");
                            } else if (msg.type === "done") {
                                onRefineComplete({ palettes });
                            } else if (msg.type === "error") {
                                onRefineError(msg.error);
                            }
                        } catch {
                            // Skip unparseable lines
                        }
                    }
                }

                // Process remaining buffer
                if (buffer.trim()) {
                    try {
                        const msg = JSON.parse(buffer);
                        if (msg.type === "palette") {
                            palettes.push(msg.palette);
                        }
                        if (msg.type === "done" || palettes.length > 0) {
                            onRefineComplete({ palettes });
                        } else if (msg.type === "error") {
                            onRefineError(msg.error);
                        }
                    } catch {
                        // If we have palettes but no done message, still complete
                        if (palettes.length > 0) {
                            onRefineComplete({ palettes });
                        }
                    }
                }
            } else {
                onRefineError("Unexpected response format");
            }
        } catch (err) {
            onRefineError(err instanceof Error ? err.message : "Failed to refine");
            console.error("Refine error:", err);
        }
    };

    const remainingIterations = maxIterations - iterationCount;

    return (
        <div className={cn("flex items-center gap-2", className)}>
            <TooltipProvider>
                <Tooltip delayDuration={500}>
                    <TooltipTrigger asChild>
                        <button
                            aria-label={
                                hasFeedback && canGiveFeedback
                                    ? "Update results with feedback"
                                    : hasResults
                                      ? "Clear refined results"
                                      : "Refine palettes with AI"
                            }
                            onClick={
                                hasFeedback && canGiveFeedback
                                    ? () => handleRefine(true)
                                    : hasResults
                                      ? onRefineClear
                                      : () => handleRefine(false)
                            }
                            disabled={isRefining || (hasFeedback && !canGiveFeedback)}
                            className={cn(
                                "disable-animation-on-theme-change",
                                "inline-flex items-center justify-center gap-1.5 rounded-md",
                                "h-8 px-2.5 border border-solid",
                                "transition-colors duration-200 cursor-pointer",
                                "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                "font-medium text-xs",
                                "border-input hover:border-muted-foreground/30",
                                "text-muted-foreground hover:text-foreground",
                                "bg-background hover:bg-background/60",
                                isRefining && "opacity-70 cursor-wait",
                                (hasResults || hasFeedback) && "border-muted-foreground/30 text-foreground",
                                hasFeedback && !canGiveFeedback && "opacity-50 cursor-not-allowed",
                            )}
                            style={{ backgroundColor: "var(--background)" }}
                        >
                            {isRefining ? (
                                <>
                                    <span>Refining...</span>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.5} />
                                </>
                            ) : hasFeedback ? (
                                <>
                                    <span>Update ({remainingIterations})</span>
                                    <Sparkles className="w-3.5 h-3.5" strokeWidth={2.5} />
                                </>
                            ) : hasResults ? (
                                <>
                                    <span>Clear</span>
                                    <X className="w-3.5 h-3.5" strokeWidth={2.5} />
                                </>
                            ) : (
                                <>
                                    <span>Refine</span>
                                    <Sparkles className="w-3.5 h-3.5" strokeWidth={2.5} />
                                </>
                            )}
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="end" sideOffset={6}>
                        <span>
                            {hasFeedback && !canGiveFeedback
                                ? "No more updates available"
                                : hasFeedback
                                  ? `Update results based on feedback (${remainingIterations} remaining)`
                                  : hasResults
                                    ? "Clear and show search results"
                                    : "Refine palettes with AI"}
                        </span>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
    );
}
