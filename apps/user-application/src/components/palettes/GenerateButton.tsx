import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { generatePalettes, type GenerateEvent } from "@/server-functions/generate";
import { deserializeCoeffs } from "@repo/data-ops/serialization";
import { generateHexColors } from "@/lib/paletteUtils";
import { paletteStyleValidator } from "@repo/data-ops/valibot-schema/grabient";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "@tanstack/react-router";
import * as v from "valibot";
import { useProEnabled } from "@/hooks/useProEnabled";

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
    // Override props - if not "auto", use these values for all generated palettes
    style?: "auto" | PaletteStyle;
    steps?: "auto" | number;
    angle?: "auto" | number;
    disabled?: boolean;
    className?: string;
    buttonText?: string;
}

export function GenerateButton({
    query,
    onGenerateStart,
    onPaletteReceived,
    onGenerateComplete,
    onGenerateError,
    sessionId,
    onSessionCreated,
    style,
    steps,
    angle,
    disabled,
    className,
    buttonText = "Generate",
}: GenerateButtonProps) {
    const { data: session, isPending: isAuthPending } = authClient.useSession();
    const router = useRouter();
    const [isGenerating, setIsGenerating] = useState(false);
    const proEnabled = useProEnabled();

    const isAuthenticated = !!session?.user;

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

            if (done) break;

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
                        onSessionCreated?.(event.sessionId, event.version);
                    } else if (event.type === "composer_error") {
                        console.error("[GenerateButton] Composer error:", event.error);
                        throw new Error(event.error);
                    } else if (event.type === "palette") {
                        const { coeffs, globals } = deserializeCoeffs(event.seed);
                        const hexColors = generateHexColors(coeffs, globals, event.steps);

                        onPaletteReceived({
                            seed: event.seed,
                            style: event.style,
                            steps: event.steps,
                            angle: event.angle,
                            hexColors,
                            modelKey: event.modelKey,
                            theme: event.theme,
                        });
                    } else if (event.type === "painter_error") {
                        console.warn("[GenerateButton] Painter error:", event.modelKey, event.error);
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
        if (!isAuthenticated) {
            router.navigate({
                to: "/login",
                search: { redirect: window.location.pathname + window.location.search },
            });
            return;
        }

        setIsGenerating(true);
        onGenerateStart();

        try {
            const response = await generatePalettes({
                data: {
                    query,
                    sessionId: sessionId ?? undefined,
                    style,
                    steps,
                    angle,
                },
            });

            await processStream(response);

            onGenerateComplete();
        } catch (error) {
            console.error("[GenerateButton] Error:", error);
            const message = error instanceof Error ? error.message : "Failed to generate palettes";
            onGenerateError(message);
        } finally {
            setIsGenerating(false);
        }
    };

    // Hide generate button entirely when Pro features are disabled
    if (!proEnabled) {
        return null;
    }

    return (
        <div className={cn("relative inline-flex items-center", className)}>
            <button
                type="button"
                onClick={handleGenerate}
                disabled={disabled || isGenerating || isAuthPending}
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
                        <span>{buttonText}</span>
                        <Sparkles className="w-4 h-4" />
                    </>
                )}
            </button>
        </div>
    );
}
