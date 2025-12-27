import { useState, useRef, useEffect, Suspense } from "react";
import {
    createFileRoute,
    stripSearchParams,
    Link,
    redirect,
} from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import * as v from "valibot";
import { userLikedSeedsQueryOptions, searchPalettesQueryOptions, type SearchResultPalette } from "@/queries/palettes";
import { VirtualizedPalettesGrid } from "@/components/palettes/virtualized-palettes-grid";
import { PalettesGrid } from "@/components/palettes/palettes-grid";
import { AppLayout } from "@/components/layout/AppLayout";
import { setPreviousRoute } from "@/stores/ui";
import { exportStore } from "@/stores/export";
import { hexToColorName, HEX_CODE_REGEX } from "@repo/data-ops/color-utils";
import { getSeedColorData } from "@/lib/seed-color-data";
import { isValidSeed, deserializeCoeffs } from "@repo/data-ops/serialization";
import {
    DEFAULT_GLOBALS,
    styleWithAutoValidator,
    angleWithAutoValidator,
    stepsWithAutoValidator,
    sizeWithAutoValidator,
} from "@repo/data-ops/valibot-schema/grabient";
import type { AppPalette } from "@/queries/palettes";
import { ArrowLeft, Sparkles } from "lucide-react";
import type { SizeType } from "@/stores/export";
import { popularTagsQueryOptions } from "@/server-functions/popular-tags";
import { SelectedButtonContainer } from "@/components/palettes/SelectedButtonContainer";
import { useMounted } from "@mantine/hooks";
import {
    GenerateButton,
    type GeneratedPalette,
} from "@/components/palettes/GenerateButton";
import {
    getGenerateSessionByQuery,
    saveGenerateSessionSeeds,
    saveGenerateSessionFeedback,
} from "@/server-functions/generate-session";
import { generateHexColors } from "@/lib/paletteUtils";
import { sessionQueryOptions } from "@/queries/auth";
import {
    PalettePageSubtitle,
    QueryDisplay,
} from "@/components/palettes/PalettePageHeader";

export type SearchSortOrder = "popular" | "newest" | "oldest";

function sortResults(
    results: SearchResultPalette[],
    order: SearchSortOrder,
): SearchResultPalette[] {
    return [...results].sort((a, b) => {
        switch (order) {
            case "newest":
                return (
                    (b.createdAt?.getTime() ?? 0) -
                    (a.createdAt?.getTime() ?? 0)
                );
            case "oldest":
                return (
                    (a.createdAt?.getTime() ?? 0) -
                    (b.createdAt?.getTime() ?? 0)
                );
            case "popular":
            default:
                return (b.likesCount ?? 0) - (a.likesCount ?? 0);
        }
    });
}

const SEARCH_DEFAULTS = {
    sort: "popular" as SearchSortOrder,
    style: "auto" as const,
    angle: "auto" as const,
    steps: "auto" as const,
    size: "auto" as SizeType,
    export: false,
};

const exportValidator = v.pipe(
    v.optional(v.boolean(), false),
    v.transform((value) => (typeof window === "undefined" ? false : value)),
);

const searchValidatorSchema = v.object({
    sort: v.optional(
        v.fallback(
            v.picklist(["popular", "newest", "oldest"]),
            SEARCH_DEFAULTS.sort,
        ),
        SEARCH_DEFAULTS.sort,
    ),
    style: v.optional(
        v.fallback(styleWithAutoValidator, SEARCH_DEFAULTS.style),
        SEARCH_DEFAULTS.style,
    ),
    angle: v.optional(
        v.fallback(angleWithAutoValidator, SEARCH_DEFAULTS.angle),
        SEARCH_DEFAULTS.angle,
    ),
    steps: v.optional(
        v.fallback(stepsWithAutoValidator, SEARCH_DEFAULTS.steps),
        SEARCH_DEFAULTS.steps,
    ),
    size: v.optional(
        v.fallback(sizeWithAutoValidator, SEARCH_DEFAULTS.size),
        SEARCH_DEFAULTS.size,
    ),
    export: exportValidator,
});

function getQuery(param: string): string | null {
    if (isValidSeed(param)) {
        return param;
    }
    try {
        const withSpaces = param.replace(/-/g, " ");
        return decodeURIComponent(withSpaces);
    } catch {
        return param.replace(/-/g, " ");
    }
}

function formatColorList(colors: string[]): string {
    if (colors.length === 0) return "";
    if (colors.length === 1) return colors[0]!;
    return colors.join(", ");
}

function getQueryForGeneration(query: string): string {
    const seedData = getSeedColorData(query);
    if (seedData) {
        return formatColorList(seedData.colorNames);
    }
    return query;
}

function getHeadingText(query: string): string {
    const seedData = getSeedColorData(query);
    if (seedData) {
        return `${formatColorList(seedData.colorNames)} palettes`;
    }

    const hexMatches = query.match(HEX_CODE_REGEX);
    if (hexMatches && hexMatches.length > 0) {
        const colorNames: string[] = [];
        const seen = new Set<string>();
        for (const hex of hexMatches) {
            const name = hexToColorName(hex);
            if (!seen.has(name)) {
                seen.add(name);
                colorNames.push(name);
            }
        }
        if (colorNames.length > 0) {
            return `${formatColorList(colorNames)} palettes`;
        }
    }

    return `${query} palettes`;
}

export const Route = createFileRoute("/palettes/$query/generate")({
    validateSearch: searchValidatorSchema,
    search: {
        middlewares: [stripSearchParams(SEARCH_DEFAULTS)],
    },
    beforeLoad: async ({ context, params }) => {
        // Check authentication - redirect to login if not authenticated
        const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
        if (!session?.user) {
            throw redirect({
                to: "/login",
                search: {
                    redirect: `/palettes/${params.query}/generate`,
                },
            });
        }
        // Page is accessible to any authenticated user
        // Subscription status is checked in the UI for the Generate button
    },
    loader: async ({ context, params }) => {
        const query = getQuery(params.query);
        if (!query) {
            await context.queryClient.ensureQueryData(
                popularTagsQueryOptions(),
            );
            return;
        }
        // Prefetch search results without blocking (will be picked up by useSuspenseQuery)
        context.queryClient.prefetchQuery(searchPalettesQueryOptions(query, 48));

        await Promise.all([
            context.queryClient.ensureQueryData(userLikedSeedsQueryOptions()),
            context.queryClient.ensureQueryData(popularTagsQueryOptions()),
        ]);
    },
    head: ({ params }) => {
        const query = getQuery(params.query) ?? "Search";
        const heading = getHeadingText(query);
        const title = `Generate ${heading} - Grabient`;

        return {
            meta: [
                { title },
                { name: "description", content: `AI-generated ${heading}` },
            ],
        };
    },
    onLeave: (match) => {
        const search = match.search;
        const searchParams: Record<string, unknown> = {};
        if (search.style !== "auto") searchParams.style = search.style;
        if (search.angle !== "auto") searchParams.angle = search.angle;
        if (search.steps !== "auto") searchParams.steps = search.steps;
        if (search.size !== "auto") searchParams.size = search.size;
        if (search.sort !== "popular") searchParams.sort = search.sort;
        setPreviousRoute({ path: match.pathname, search: searchParams });
    },
    component: GeneratePage,
});

function sortToRoute(sort: SearchSortOrder): string {
    switch (sort) {
        case "newest":
            return "/newest";
        case "oldest":
            return "/oldest";
        case "popular":
        default:
            return "/";
    }
}

interface SearchParams {
    sort: SearchSortOrder;
    style: v.InferOutput<typeof styleWithAutoValidator>;
    angle: "auto" | number;
    steps: "auto" | number;
    size: SizeType;
}

function buildBackNavigation(params: SearchParams) {
    return {
        to: sortToRoute(params.sort),
        search: {
            style: params.style !== "auto" ? params.style : undefined,
            angle: params.angle !== "auto" ? params.angle : undefined,
            steps: params.steps !== "auto" ? params.steps : undefined,
            size: params.size !== "auto" ? params.size : undefined,
        },
    };
}

function BackButton({ query }: { query: string }) {
    return (
        <Link to="/palettes/$query" params={{ query }}>
            <button
                type="button"
                style={{ backgroundColor: "var(--background)" }}
                className="disable-animation-on-theme-change inline-flex items-center justify-center rounded-md h-8.5 w-8.5 p-0 border border-solid border-input hover:border-muted-foreground/30 hover:bg-background/60 text-muted-foreground hover:text-foreground transition-colors duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                aria-label="Back to search results"
                suppressHydrationWarning
            >
                <ArrowLeft className="w-[18px] h-[18px]" strokeWidth={2.5} />
            </button>
        </Link>
    );
}

// Component that suspends while loading search results
interface SearchResultsProps {
    query: string;
    sort: SearchSortOrder;
    generatedPalettes: Array<AppPalette & { version: number; modelKey: string; theme: string }>;
    likedSeeds: Set<string>;
    urlStyle: v.InferOutput<typeof styleWithAutoValidator>;
    urlAngle: "auto" | number;
    urlSteps: "auto" | number;
    isExportOpen: boolean;
    isGenerating: boolean;
    pendingPalettesCount: number;
    onBadFeedback: (seed: string) => void;
}

function SearchResultsGrid({
    query,
    sort,
    generatedPalettes,
    likedSeeds,
    urlStyle,
    urlAngle,
    urlSteps,
    isExportOpen,
    isGenerating,
    pendingPalettesCount,
    onBadFeedback,
}: SearchResultsProps) {
    // This will suspend until search results are ready
    const { data: searchData } = useSuspenseQuery(searchPalettesQueryOptions(query, 48));

    // Sort search results according to the sort order, then combine with generated palettes
    const sortedSearchResults = sortResults(searchData?.results ?? [], sort);
    const combinedPalettes = [
        ...generatedPalettes,
        ...sortedSearchResults.map((p) => ({
            ...p,
            version: 0,
            modelKey: "",
            theme: "",
        })),
    ];

    // Show empty state if no palettes at all
    if (combinedPalettes.length === 0 && !isGenerating) {
        return (
            <div className="px-5 lg:px-14 py-16 text-center">
                <Sparkles className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-lg text-muted-foreground mb-2">
                    No palettes yet
                </p>
                <p className="text-sm text-muted-foreground">
                    Click the Generate button above to create AI-powered palettes
                </p>
            </div>
        );
    }

    if (isExportOpen) {
        return (
            <PalettesGrid
                palettes={combinedPalettes}
                likedSeeds={likedSeeds}
                urlStyle={urlStyle}
                urlAngle={urlAngle}
                urlSteps={urlSteps}
                isExportOpen={isExportOpen}
                searchQuery={query}
                onBadFeedback={onBadFeedback}
            />
        );
    }

    return (
        <VirtualizedPalettesGrid
            palettes={combinedPalettes}
            likedSeeds={likedSeeds}
            urlStyle={urlStyle}
            urlAngle={urlAngle}
            urlSteps={urlSteps}
            isExportOpen={isExportOpen}
            searchQuery={query}
            onBadFeedback={onBadFeedback}
            skeletonCount={isGenerating ? Math.max(0, 30 - pendingPalettesCount) : 0}
        />
    );
}

function GeneratePage() {
    const { query: compressedQuery } = Route.useParams();
    const search = Route.useSearch();
    const { sort, style, angle, steps, size } = search;
    const isExportOpen = search.export === true;
    const mounted = useMounted();
    const exportList = useStore(exportStore, (state) => state.exportList);

    const exportCount = mounted ? exportList.length : 0;
    const showExportUI = isExportOpen && exportCount > 0;
    const query = getQuery(compressedQuery) ?? "";
    const generationQuery = getQueryForGeneration(query);

    // Generate state - palettes include version info, model source, and theme
    type VersionedPalette = AppPalette & { version: number; modelKey: string; theme: string };
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedPalettes, setGeneratedPalettes] = useState<VersionedPalette[]>([]);
    const [generateError, setGenerateError] = useState<string | null>(null);

    // Session state for multi-round generation
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [sessionLoaded, setSessionLoaded] = useState(false);


    // Load existing session from database
    // Use generationQuery (color names for seeds) since sessions are stored with the transformed query
    const { data: existingSession } = useQuery({
        queryKey: ["generate-session", generationQuery],
        queryFn: () => getGenerateSessionByQuery({ data: { query: generationQuery } }),
        enabled: !!generationQuery && !sessionLoaded,
        staleTime: 0,
    });

    // Convert stored palette data to a VersionedPalette (for loading from DB)
    const storedToVersionedPalette = (
        paletteData: string | { seed: string; style: string; steps: number; angle: number; keyword?: string },
        version: number,
        modelKey: string = "unknown"
    ): VersionedPalette => {
        // Handle both old format (string) and new format (object)
        const seed = typeof paletteData === 'string' ? paletteData : paletteData.seed;
        const paletteStyle = typeof paletteData === 'string' ? "linearGradient" : paletteData.style;
        const paletteSteps = typeof paletteData === 'string' ? 8 : paletteData.steps;
        const paletteAngle = typeof paletteData === 'string' ? 90 : paletteData.angle;
        const theme = typeof paletteData === 'string' ? "" : (paletteData.keyword ?? "");

        const { coeffs } = deserializeCoeffs(seed);
        const hexColors = generateHexColors(coeffs, DEFAULT_GLOBALS, paletteSteps);
        return {
            seed,
            style: paletteStyle as VersionedPalette["style"],
            steps: paletteSteps,
            angle: paletteAngle,
            createdAt: null,
            coeffs,
            globals: DEFAULT_GLOBALS,
            hexColors,
            score: 0,
            version,
            modelKey,
            theme,
        };
    };

    // Initialize state from loaded session
    useEffect(() => {
        if (existingSession && !sessionLoaded) {
            setSessionId(existingSession.sessionId);

            // Reconstruct palettes from stored data
            const palettes: VersionedPalette[] = [];
            const generatedSeeds = existingSession.generatedSeeds ?? {};

            for (const [versionKey, paletteDataArray] of Object.entries(generatedSeeds)) {
                const ver = parseInt(versionKey, 10);
                for (const paletteData of paletteDataArray) {
                    palettes.push(storedToVersionedPalette(paletteData, ver));
                }
            }

            setGeneratedPalettes(palettes);
            setSessionLoaded(true);
        }
    }, [existingSession, sessionLoaded]);

    // Reset session when generation query changes
    const prevQueryRef = useRef(generationQuery);
    useEffect(() => {
        if (prevQueryRef.current !== generationQuery) {
            setSessionId(null);
            setGeneratedPalettes([]);
            setSessionLoaded(false);
            prevQueryRef.current = generationQuery;
        }
    }, [generationQuery]);

    // Convert GeneratedPalette to AppPalette format with version
    const generatedToAppPalette = (generated: GeneratedPalette, version: number): VersionedPalette => {
        const { coeffs } = deserializeCoeffs(generated.seed);
        return {
            seed: generated.seed,
            style: generated.style,
            steps: generated.steps,
            angle: generated.angle,
            createdAt: null,
            coeffs,
            globals: DEFAULT_GLOBALS,
            hexColors: generated.hexColors,
            score: 0,
            version,
            modelKey: generated.modelKey,
            theme: generated.theme,
        };
    };

    // Track palettes to save in batch after generation completes
    const pendingSeedsRef = useRef<{ 
        sessionId: string | null; 
        version: number; 
        palettes: Array<{ seed: string; style: string; steps: number; angle: number; keyword: string }>;
    }>({
        sessionId: null,
        version: 0,
        palettes: [],
    });

    const { data: likedSeeds } = useSuspenseQuery(userLikedSeedsQueryOptions());

    // Generated palettes sorted by version descending (latest first)
    const sortedGeneratedPalettes = generatedPalettes
        .slice()
        .sort((a, b) => b.version - a.version);

    const hasGeneratedPalettes = sortedGeneratedPalettes.length > 0;

    const backNav = buildBackNavigation({ sort, style, angle, steps, size });

    // On generate route, only show subtitle for seeds (not hex codes)
    const isSeed = isValidSeed(query);
    const hasSubtitle = isSeed;

    return (
        <AppLayout
            style={style}
            angle={angle}
            steps={steps}
            leftAction={<BackButton query={compressedQuery} />}
            logoNavigation={backNav}
            isExportOpen={showExportUI}
        >
            <div className="relative">
                <div
                    className={cn(
                        "px-5 lg:px-14",
                        hasSubtitle ? "mb-14 md:mb-16" : "mb-10 md:mb-12.5",
                        !isExportOpen && "invisible"
                    )}
                >
                    <h1 className="text-3xl md:text-4xl font-bold text-foreground">
                        {exportCount} {exportCount === 1 ? "item" : "items"} selected
                    </h1>
                </div>
                <div
                    className={cn(
                        "absolute inset-0 px-5 lg:px-14",
                        isExportOpen && "hidden"
                    )}
                >
                    <div className="flex items-start justify-between gap-4">
                        <h1 className="text-xl sm:text-3xl md:text-4xl font-bold text-foreground flex items-center flex-wrap gap-x-2 gap-y-1 min-w-0">
                            <Sparkles className="w-6 h-6 md:w-8 md:h-8 text-muted-foreground" />
                            <QueryDisplay query={query} />
                            <span>palettes</span>
                        </h1>
                        <div className="flex items-center gap-2 shrink-0">
                            <GenerateButton
                                query={generationQuery}
                                buttonText="Create more"
                                sessionId={sessionId}
                                style={style}
                                steps={steps}
                                angle={angle}
                                onSessionCreated={(newSessionId, version) => {
                                    setSessionId(newSessionId);
                                    pendingSeedsRef.current = { sessionId: newSessionId, version, palettes: [] };
                                }}
                                onGenerateStart={() => {
                                    setIsGenerating(true);
                                    setGenerateError(null);
                                }}
                                onPaletteReceived={(palette) => {
                                    // Use ref version instead of state to avoid stale closure
                                    const currentVersion = pendingSeedsRef.current.version;
                                    const appPalette = generatedToAppPalette(palette, currentVersion);
                                    setGeneratedPalettes(prev => [...prev, appPalette]);
                                    // Store full palette metadata for session persistence
                                    pendingSeedsRef.current.palettes.push({
                                        seed: palette.seed,
                                        style: palette.style,
                                        steps: palette.steps,
                                        angle: palette.angle,
                                        keyword: palette.theme,
                                    });
                                }}
                                onGenerateComplete={() => {
                                    setIsGenerating(false);
                                    const { sessionId: sid, version, palettes } = pendingSeedsRef.current;
                                    if (sid && palettes.length > 0) {
                                        saveGenerateSessionSeeds({
                                            data: { sessionId: sid, version, palettes },
                                        }).catch(console.error);
                                    }
                                }}
                                onGenerateError={(error) => {
                                    setGenerateError(error);
                                    setIsGenerating(false);
                                }}
                            />
                            <SelectedButtonContainer className="contents" />
                        </div>
                    </div>
                    {isSeed && <PalettePageSubtitle query={query} />}
                </div>
            </div>
            <SelectedButtonContainer
                className={cn(
                    hasSubtitle
                        ? "-mt-[88px] md:-mt-[100px]"
                        : "-mt-[72px] md:-mt-[84px]",
                    !isExportOpen && "[&>*]:invisible"
                )}
            />
            {generateError && !isExportOpen && (
                <div className="px-5 lg:px-14 mb-4">
                    <div className="text-red-500 text-sm p-4 rounded-md bg-red-500/10 border border-red-500/20">
                        {generateError}
                    </div>
                </div>
            )}
            {(hasGeneratedPalettes || isGenerating) && !generateError ? (
                <Suspense
                    fallback={
                        isExportOpen ? (
                            <PalettesGrid
                                palettes={sortedGeneratedPalettes}
                                likedSeeds={likedSeeds}
                                urlStyle={style}
                                urlAngle={angle}
                                urlSteps={steps}
                                isExportOpen={isExportOpen}
                                searchQuery={query}
                                onBadFeedback={(seed) => {
                                    setGeneratedPalettes(prev => prev.filter(p => p.seed !== seed));
                                    if (sessionId) {
                                        saveGenerateSessionFeedback({
                                            data: { sessionId, seed, feedback: "bad" },
                                        }).catch(console.error);
                                    }
                                }}
                            />
                        ) : (
                            <VirtualizedPalettesGrid
                                palettes={sortedGeneratedPalettes}
                                likedSeeds={likedSeeds}
                                urlStyle={style}
                                urlAngle={angle}
                                urlSteps={steps}
                                isExportOpen={isExportOpen}
                                searchQuery={query}
                                onBadFeedback={(seed) => {
                                    setGeneratedPalettes(prev => prev.filter(p => p.seed !== seed));
                                    if (sessionId) {
                                        saveGenerateSessionFeedback({
                                            data: { sessionId, seed, feedback: "bad" },
                                        }).catch(console.error);
                                    }
                                }}
                                skeletonCount={isGenerating ? Math.max(0, 30 - pendingSeedsRef.current.palettes.length) : 0}
                            />
                        )
                    }
                >
                    <SearchResultsGrid
                        query={query}
                        sort={sort}
                        generatedPalettes={sortedGeneratedPalettes}
                        likedSeeds={likedSeeds}
                        urlStyle={style}
                        urlAngle={angle}
                        urlSteps={steps}
                        isExportOpen={isExportOpen}
                        isGenerating={isGenerating}
                        pendingPalettesCount={pendingSeedsRef.current.palettes.length}
                        onBadFeedback={(seed) => {
                            setGeneratedPalettes(prev => prev.filter(p => p.seed !== seed));
                            if (sessionId) {
                                saveGenerateSessionFeedback({
                                    data: { sessionId, seed, feedback: "bad" },
                                }).catch(console.error);
                            }
                        }}
                    />
                </Suspense>
            ) : !isExportOpen && !isGenerating ? (
                <Suspense
                    fallback={
                        <div className="px-5 lg:px-14 py-16 text-center">
                            <Sparkles className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                            <p className="text-lg text-muted-foreground mb-2">
                                Loading palettes...
                            </p>
                        </div>
                    }
                >
                    <SearchResultsGrid
                        query={query}
                        sort={sort}
                        generatedPalettes={sortedGeneratedPalettes}
                        likedSeeds={likedSeeds}
                        urlStyle={style}
                        urlAngle={angle}
                        urlSteps={steps}
                        isExportOpen={isExportOpen}
                        isGenerating={isGenerating}
                        pendingPalettesCount={0}
                        onBadFeedback={(seed) => {
                            setGeneratedPalettes(prev => prev.filter(p => p.seed !== seed));
                            if (sessionId) {
                                saveGenerateSessionFeedback({
                                    data: { sessionId, seed, feedback: "bad" },
                                }).catch(console.error);
                            }
                        }}
                    />
                </Suspense>
            ) : null}
            {!isExportOpen && <div className="py-3 mt-16" />}
        </AppLayout>
    );
}
