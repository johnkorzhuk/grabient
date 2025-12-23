import { useState } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { AppLayout } from "@/components/layout/AppLayout";
import { Sparkles, Loader2, ArrowLeft } from "lucide-react";
import { AVAILABLE_MODELS, type ModelKey } from "@/lib/model-config";
import { fitCosinePalette } from "@repo/data-ops/gradient-gen";
import { serializeCoeffs } from "@repo/data-ops/serialization";
import { DEFAULT_GLOBALS } from "@repo/data-ops/valibot-schema/grabient";
import { PalettesGrid } from "@/components/palettes/palettes-grid";
import type { AppPalette } from "@/queries/palettes";
import { generateCompare } from "@/server-functions/generate-compare";
import { authClient } from "@/lib/auth-client";
import type { AuthUser } from "@repo/data-ops/auth/client-types";

function getQuery(param: string): string {
    try {
        const withSpaces = param.replace(/-/g, " ");
        return decodeURIComponent(withSpaces);
    } catch {
        return param.replace(/-/g, " ");
    }
}

export const Route = createFileRoute("/palettes/$query/compare")({
    component: ComparePage,
});

// Event types are imported from server function

interface ModelResult {
    modelKey: ModelKey;
    modelName: string;
    palettes: AppPalette[];
    isLoading: boolean;
    error: string | null;
    startTime: number | null;
    endTime: number | null;
}

function BackButton({ query }: { query: string }) {
    return (
        <Link to="/palettes/$query" params={{ query }}>
            <button
                type="button"
                style={{ backgroundColor: "var(--background)" }}
                className="inline-flex items-center justify-center rounded-md h-8.5 w-8.5 p-0 border border-solid border-input hover:border-muted-foreground/30 hover:bg-background/60 text-muted-foreground hover:text-foreground transition-colors duration-200 cursor-pointer"
                aria-label="Back to search results"
            >
                <ArrowLeft className="w-[18px] h-[18px]" strokeWidth={2.5} />
            </button>
        </Link>
    );
}

function ComparePage() {
    const { query: compressedQuery } = Route.useParams();
    const query = getQuery(compressedQuery);
    const { data: session, isPending } = authClient.useSession();
    const user = session?.user as AuthUser | undefined;

    const [isGenerating, setIsGenerating] = useState(false);
    const [modelResults, setModelResults] = useState<Record<string, ModelResult>>({});

    // Redirect non-admin users
    if (!isPending && user?.role !== "admin") {
        return <Navigate to="/palettes/$query" params={{ query: compressedQuery }} />;
    }

    // Show nothing while auth is loading
    if (isPending) {
        return null;
    }

    const handleGenerate = async () => {
        setIsGenerating(true);
        setModelResults({});

        try {
            // Use TanStack Start's async generator streaming
            for await (const event of await generateCompare({ data: { query, limit: 12 } })) {
                if (event.type === "init") {
                    // Initialize all models
                    const initialResults: Record<string, ModelResult> = {};
                    for (const model of event.models) {
                        initialResults[model.key] = {
                            modelKey: model.key as ModelKey,
                            modelName: model.name,
                            palettes: [],
                            isLoading: true,
                            error: null,
                            startTime: null,
                            endTime: null,
                        };
                    }
                    setModelResults(initialResults);
                } else if (event.type === "model_start") {
                    setModelResults(prev => {
                        const existing = prev[event.modelKey];
                        if (!existing) return prev;
                        return {
                            ...prev,
                            [event.modelKey]: {
                                ...existing,
                                startTime: Date.now(),
                            },
                        };
                    });
                } else if (event.type === "palette") {
                    const colors = event.colors;
                    const fitResult = fitCosinePalette(colors);
                    const seed = serializeCoeffs(fitResult.coeffs, DEFAULT_GLOBALS);
                    
                    const appPalette: AppPalette = {
                        seed,
                        coeffs: fitResult.coeffs,
                        globals: DEFAULT_GLOBALS,
                        hexColors: colors,
                        style: "linearGradient",
                        steps: colors.length,
                        angle: 90,
                        createdAt: null,
                    };

                    setModelResults(prev => {
                        const existing = prev[event.modelKey];
                        if (!existing) return prev;
                        return {
                            ...prev,
                            [event.modelKey]: {
                                ...existing,
                                palettes: [...existing.palettes, appPalette],
                            },
                        };
                    });
                } else if (event.type === "model_complete") {
                    setModelResults(prev => {
                        const existing = prev[event.modelKey];
                        if (!existing) return prev;
                        return {
                            ...prev,
                            [event.modelKey]: {
                                ...existing,
                                isLoading: false,
                                endTime: Date.now(),
                            },
                        };
                    });
                } else if (event.type === "model_error") {
                    setModelResults(prev => {
                        const existing = prev[event.modelKey];
                        if (!existing) return prev;
                        return {
                            ...prev,
                            [event.modelKey]: {
                                ...existing,
                                error: event.error,
                                isLoading: false,
                                endTime: Date.now(),
                            },
                        };
                    });
                } else if (event.type === "done") {
                    console.log("[Compare] All models complete");
                }
            }
        } catch (error) {
            console.error("[Compare] Error:", error);
        }

        setIsGenerating(false);
    };

    const modelEntries = Object.entries(modelResults);
    const hasResults = modelEntries.length > 0;

    return (
        <AppLayout
            style="auto"
            angle="auto"
            steps="auto"
            leftAction={<BackButton query={compressedQuery} />}
            isExportOpen={false}
        >
            <div className="px-5 lg:px-14 mb-10">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <h1 className="text-xl sm:text-3xl md:text-4xl font-bold text-foreground flex items-center gap-2">
                        <Sparkles className="w-6 h-6 md:w-8 md:h-8 text-muted-foreground" />
                        Compare: {query}
                    </h1>
                    <button
                        type="button"
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className={cn(
                            "h-9 px-4 rounded-md font-medium text-sm transition-colors",
                            "bg-primary text-primary-foreground hover:bg-primary/90",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                            "flex items-center gap-2"
                        )}
                    >
                        {isGenerating ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Generating...
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-4 h-4" />
                                Generate All ({Object.keys(AVAILABLE_MODELS).length} models)
                            </>
                        )}
                    </button>
                </div>
            </div>

            {hasResults ? (
                <div className="px-5 lg:px-14 space-y-8">
                    {modelEntries.map(([modelKey, result]) => (
                        <ModelResultCard key={modelKey} result={result} />
                    ))}
                </div>
            ) : (
                <div className="px-5 lg:px-14 py-16 text-center">
                    <Sparkles className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-lg text-muted-foreground mb-2">
                        Compare AI models for "{query}" palettes
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Click Generate to see results from all {Object.keys(AVAILABLE_MODELS).length} models
                    </p>
                </div>
            )}

            <div className="py-8" />
        </AppLayout>
    );
}

function ModelResultCard({ result }: { result: ModelResult }) {
    const duration = result.startTime && result.endTime 
        ? ((result.endTime - result.startTime) / 1000).toFixed(1) 
        : null;

    return (
        <div className="border border-input rounded-lg overflow-hidden">
            <div className="flex items-center justify-between p-4 bg-muted/30">
                <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-lg">{result.modelName}</h3>
                    {result.isLoading && (
                        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            {result.palettes.length} palettes...
                        </span>
                    )}
                    {!result.isLoading && !result.error && (
                        <span className="text-sm text-muted-foreground">
                            {result.palettes.length} palettes {duration && `• ${duration}s`}
                        </span>
                    )}
                    {result.error && (
                        <span className="text-sm text-red-500">
                            Error: {result.error}
                        </span>
                    )}
                </div>
            </div>

            {result.palettes.length > 0 && (
                <PalettesGrid
                    palettes={result.palettes}
                    likedSeeds={new Set()}
                    urlStyle="auto"
                    urlAngle="auto"
                    urlSteps="auto"
                    isExportOpen={false}
                />
            )}

            {result.isLoading && result.palettes.length === 0 && (
                <div className="h-24 flex items-center justify-center text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Waiting for palettes...
                </div>
            )}
        </div>
    );
}
