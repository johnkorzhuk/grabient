import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GenerateEvent } from "@/server-functions/generate-v6";
import { deserializeCoeffs } from "@repo/data-ops/serialization";
import { generateHexColors } from "@/lib/paletteUtils";
import { paletteStyleValidator } from "@repo/data-ops/valibot-schema/grabient";
import * as v from "valibot";

type PaletteStyle = v.InferOutput<typeof paletteStyleValidator>;

export interface GeneratedPalette {
    seed: string;
    style: PaletteStyle;
    steps: number;
    angle: number;
    hexColors: string[];
    modelKey: string;
    theme: string;
}

interface GenerateButtonProps {
    query: string;
    onGenerateStart: () => void;
    onPaletteReceived: (palette: GeneratedPalette) => void;
    onGenerateComplete: () => void;
    onGenerateError: (error: string) => void;
    // Session props
    sessionId?: string | null;
    onSessionCreated?: (sessionId: string, version: number) => void;
    disabled?: boolean;
    className?: string;
}

export function GenerateButton({
    query,
    onGenerateStart,
    onPaletteReceived,
    onGenerateComplete,
    onGenerateError,
    sessionId,
    onSessionCreated,
    disabled,
    className,
}: GenerateButtonProps) {
    const [isGenerating, setIsGenerating] = useState(false);

    // Process SSE stream from server
    const processStream = async (response: Response): Promise<void> => {
        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
                console.log("[GenerateButton] Stream done");
                break;
            }

            buffer += decoder.decode(value, { stream: true });

            const events = buffer.split("\n\n");
            buffer = events.pop() || "";

            for (const eventText of events) {
                if (!eventText.trim()) continue;
                
                const dataMatch = eventText.match(/^data: (.+)$/m);
                if (!dataMatch) continue;
                
                const data = dataMatch[1]!;

                try {
                    const event = JSON.parse(data) as GenerateEvent;

                    if (event.type === "session") {
                        console.log("[GenerateButton] Session:", event.sessionId, "version:", event.version);
                        onSessionCreated?.(event.sessionId, event.version);
                    } else if (event.type === "composer_start") {
                        console.log("[GenerateButton] Composer started");
                    } else if (event.type === "composer_progress") {
                        console.log("[GenerateButton] Composer progress:", event.variationsReceived, "variations");
                    } else if (event.type === "composer_complete") {
                        console.log("[GenerateButton] Composer complete:", event.totalMatrices, "matrices");
                    } else if (event.type === "composer_error") {
                        console.error("[GenerateButton] Composer error:", event.error);
                        throw new Error(event.error);
                    } else if (event.type === "painter_start") {
                        console.log("[GenerateButton] Painter started:", event.modelName);
                    } else if (event.type === "palette") {
                        // Deserialize seed to get hex colors for display
                        const { coeffs, globals } = deserializeCoeffs(event.seed);
                        const hexColors = generateHexColors(coeffs, globals, event.steps);
                        
                        console.log("[GenerateButton] Palette from", event.modelKey, "theme:", event.theme, "steps:", event.steps, "style:", event.style);
                        onPaletteReceived({
                            seed: event.seed,
                            style: event.style,
                            steps: event.steps,
                            angle: event.angle,
                            hexColors,
                            modelKey: event.modelKey,
                            theme: event.theme,
                        });
                    } else if (event.type === "painter_complete") {
                        console.log("[GenerateButton] Painter complete:", event.modelKey, event.paletteCount, "palettes in", event.duration, "ms");
                    } else if (event.type === "painter_error") {
                        console.warn("[GenerateButton] Painter error:", event.modelKey, event.error);
                    } else if (event.type === "done") {
                        console.log("[GenerateButton] Done:", event.totalPalettes, "total palettes");
                    }
                } catch (parseError) {
                    if (parseError instanceof SyntaxError) {
                        console.warn("[GenerateButton] Failed to parse:", data.slice(0, 100));
                    } else {
                        throw parseError;
                    }
                }
            }
        }
    };

    const handleGenerate = async () => {
        console.log("[GenerateButton] handleGenerate called");
        setIsGenerating(true);
        onGenerateStart();

        try {
            const response = await fetch("/api/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query,
                    sessionId: sessionId ?? undefined,
                }),
            });

            console.log("[GenerateButton] Response status:", response.status);

            if (!response.ok) {
                const errorData = await response.json() as { error?: string };
                console.error("[GenerateButton] Error response:", errorData);
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            console.log("[GenerateButton] Processing SSE stream...");
            await processStream(response);

            console.log("[GenerateButton] Stream complete");
            onGenerateComplete();
        } catch (error) {
            console.error("[GenerateButton] Error:", error);
            const message = error instanceof Error ? error.message : "Failed to generate palettes";
            onGenerateError(message);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className={cn("inline-flex items-center gap-2", className)}>
            <button
                type="button"
                onClick={handleGenerate}
                disabled={disabled || isGenerating}
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
                {isGenerating ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Generating...</span>
                    </>
                ) : (
                    <>
                        <Sparkles className="w-4 h-4" />
                        <span>Generate</span>
                    </>
                )}
            </button>
        </div>
    );
}
