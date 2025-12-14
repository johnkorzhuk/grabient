import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fitCosinePalette } from "@repo/data-ops/gradient-gen";
import { serializeCoeffs } from "@repo/data-ops/serialization";
import { DEFAULT_GLOBALS } from "@repo/data-ops/valibot-schema/grabient";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { AVAILABLE_MODELS, type ModelKey } from "@/lib/model-config";

// Stream event types from the server
interface SessionEvent {
    type: "session";
    sessionId: string;
    version: number;
    unbiased: boolean;
}

interface PaletteEvent {
    type: "palette";
    colors: string[];
}

interface ErrorEvent {
    type: "error";
    error: string;
}

type StreamEvent = SessionEvent | PaletteEvent | ErrorEvent;

export type GenerateMode = "biased" | "unbiased";

export interface GeneratedPalette {
    seed: string;
    hexColors: string[];
    unbiased: boolean;
}

interface GenerateButtonProps {
    query: string;
    limit?: number;
    examplePalettes?: string[][];
    onGenerateStart: () => void;
    onPaletteReceived: (palette: GeneratedPalette) => void;
    onGenerateComplete: () => void;
    onGenerateError: (error: string) => void;
    // Session props
    sessionId?: string | null;
    seedToHex?: Record<string, string[]>;
    onSessionCreated?: (sessionId: string, version: number) => void;
    disabled?: boolean;
    className?: string;
    // Debug mode selector
    showModeSelector?: boolean;
}

export function GenerateButton({
    query,
    limit = 24,
    examplePalettes,
    onGenerateStart,
    onPaletteReceived,
    onGenerateComplete,
    onGenerateError,
    sessionId,
    seedToHex,
    onSessionCreated,
    disabled,
    className,
    showModeSelector = false,
}: GenerateButtonProps) {
    const [isGenerating, setIsGenerating] = useState(false);
    const [mode, setMode] = useState<GenerateMode>("biased");
    const [selectedModel, setSelectedModel] = useState<ModelKey>("groq-oss-120b");

    // Process a single stream and call callbacks for each palette
    const processStream = async (
        response: Response,
        isUnbiased: boolean,
    ): Promise<void> => {
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

            const lines = buffer.split("\n\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const data = line.slice(6);

                try {
                    const event = JSON.parse(data) as StreamEvent;

                    console.log("[GenerateButton] Event received:", event.type);

                    if (event.type === "session") {
                        console.log("[GenerateButton] Session event:", event.sessionId, "version:", event.version);
                        onSessionCreated?.(event.sessionId, event.version);
                    } else if (event.type === "palette") {
                        console.log("[GenerateButton] Palette event, colors:", event.colors.length);
                        const fitResult = fitCosinePalette(event.colors);
                        const seed = serializeCoeffs(fitResult.coeffs, DEFAULT_GLOBALS);

                        onPaletteReceived({
                            seed,
                            hexColors: event.colors,
                            unbiased: isUnbiased,
                        });
                    } else if (event.type === "error") {
                        console.error("[GenerateButton] Error event:", event.error);
                        throw new Error(event.error);
                    }
                } catch (parseError) {
                    console.warn("Failed to parse event:", parseError);
                }
            }
        }
    };

    const handleGenerate = async () => {
        console.log("[GenerateButton] handleGenerate called, mode:", mode);
        setIsGenerating(true);
        onGenerateStart();

        try {
            const isUnbiased = mode === "unbiased";
            console.log("[GenerateButton] Making request, isUnbiased:", isUnbiased);

            const response = await fetch("/api/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query,
                    limit,
                    sessionId: sessionId ?? undefined,
                    examples: !isUnbiased && examplePalettes && examplePalettes.length > 0
                        ? examplePalettes
                        : undefined,
                    seedToHex: !isUnbiased && seedToHex && Object.keys(seedToHex).length > 0
                        ? seedToHex
                        : undefined,
                    unbiased: isUnbiased,
                    model: selectedModel,
                }),
            });

            console.log("[GenerateButton] Response status:", response.status);

            if (!response.ok) {
                const errorData = await response.json() as { error?: string };
                console.error("[GenerateButton] Error response:", errorData);
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            console.log("[GenerateButton] Processing stream...");
            await processStream(response, isUnbiased);

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
            {showModeSelector && (
                <>
                    <Select value={selectedModel} onValueChange={(v) => setSelectedModel(v as ModelKey)}>
                        <SelectTrigger
                            style={{ backgroundColor: "var(--background)" }}
                            className={cn(
                                "disable-animation-on-theme-change",
                                "w-[180px] h-8.5 text-sm font-medium",
                                "border-input hover:border-muted-foreground/30",
                                "text-muted-foreground",
                            )}
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.entries(AVAILABLE_MODELS).map(([key, model]) => (
                                <SelectItem key={key} value={key}>
                                    {model.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={mode} onValueChange={(v) => setMode(v as GenerateMode)}>
                        <SelectTrigger
                            style={{ backgroundColor: "var(--background)" }}
                            className={cn(
                                "disable-animation-on-theme-change",
                                "w-[110px] h-8.5 text-sm font-medium",
                                "border-input hover:border-muted-foreground/30",
                                "text-muted-foreground",
                            )}
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="biased">Biased</SelectItem>
                            <SelectItem value="unbiased">Unbiased</SelectItem>
                        </SelectContent>
                    </Select>
                </>
            )}
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
