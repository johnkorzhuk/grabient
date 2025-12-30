import { useState, useRef, Suspense } from "react";
import {
    createFileRoute,
    stripSearchParams,
    Link,
    redirect,
} from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useSuspenseQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import * as v from "valibot";
import { userLikedSeedsQueryOptions, searchPalettesQueryOptions, generateSessionQueryOptions, type SearchResultPalette } from "@/queries/palettes";
import { VirtualizedPalettesGrid } from "@/components/palettes/virtualized-palettes-grid";
import { AppLayout } from "@/components/layout/AppLayout";
import { setPreviousRoute, clearSearchQuery } from "@/stores/ui";
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
import { GenerateButton } from "@/components/palettes/GenerateButton";
import {
    saveGenerateSessionSeeds,
    saveGenerateSessionFeedback,
} from "@/server-functions/generate-session";
import { generateHexColors } from "@/lib/paletteUtils";
import { sessionQueryOptions } from "@/queries/auth";
import {
    PalettePageSubtitle,
    QueryDisplay,
} from "@/components/palettes/PalettePageHeader";
import { useHasActiveSubscription } from "@/hooks/useCustomerState";

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

        const generationQuery = getQueryForGeneration(query);

        // Prefetch non-blocking data
        context.queryClient.prefetchQuery(userLikedSeedsQueryOptions());

        // Block on vector search, popular tags, and session data
        // Use fetchQuery for session to always get fresh data (important for back navigation)
        await Promise.all([
            context.queryClient.ensureQueryData(searchPalettesQueryOptions(query, 48)),
            context.queryClient.ensureQueryData(popularTagsQueryOptions()),
            context.queryClient.fetchQuery(generateSessionQueryOptions(generationQuery)),
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
        clearSearchQuery();
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
    showSubscribeCta: boolean;
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
    showSubscribeCta,
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
            showSubscribeCta={showSubscribeCta}
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
    const { hasSubscription, isLoading: isSubscriptionLoading } = useHasActiveSubscription();

    const exportCount = mounted ? exportList.length : 0;
    const showExportUI = isExportOpen && exportCount > 0;
    const query = getQuery(compressedQuery) ?? "";
    const generationQuery = getQueryForGeneration(query);
    // Show CTA for non-subscribers (only after loading completes)
    const showSubscribeCta = !isSubscriptionLoading && !hasSubscription;

    // Palette type with generation metadata
    type VersionedPalette = AppPalette & { version: number; modelKey: string; theme: string };

    const queryClient = useQueryClient();

    // UI state for generation
    const [isGenerating, setIsGenerating] = useState(false);
    const [generateError, setGenerateError] = useState<string | null>(null);

    // In-flight palettes: only palettes currently being generated (not yet saved to D1)
    const [inFlightPalettes, setInFlightPalettes] = useState<VersionedPalette[]>([]);

    // Session ID for the current generation round
    const [sessionId, setSessionId] = useState<string | null>(null);

    // Load existing session from database (prefetched in loader)
    const { data: existingSession } = useSuspenseQuery(generateSessionQueryOptions(generationQuery));

    // Derive session ID from query if not set locally (handles initial load and back nav)
    const effectiveSessionId = sessionId ?? existingSession?.sessionId ?? null;

    // Convert stored palette data to VersionedPalette
    const toVersionedPalette = (
        data: { seed: string; style: string; steps: number; angle: number; keyword?: string },
        version: number,
    ): VersionedPalette => {
        const { coeffs } = deserializeCoeffs(data.seed);
        const hexColors = generateHexColors(coeffs, DEFAULT_GLOBALS, data.steps);
        return {
            seed: data.seed,
            style: data.style as VersionedPalette["style"],
            steps: data.steps,
            angle: data.angle,
            createdAt: null,
            coeffs,
            globals: DEFAULT_GLOBALS,
            hexColors,
            score: 0,
            version,
            modelKey: "unknown",
            theme: data.keyword ?? "",
        };
    };

    // Derive persisted palettes directly from query data (no sync useEffect needed)
    const persistedPalettes: VersionedPalette[] = existingSession
        ? Object.entries(existingSession.generatedSeeds ?? {}).flatMap(([versionKey, palettes]) =>
            palettes.map((p) => toVersionedPalette(p, parseInt(versionKey, 10)))
        )
        : [];

    // Track palettes to save in batch after generation completes
    const pendingRef = useRef<{
        sessionId: string | null;
        version: number;
        palettes: Array<{ seed: string; style: string; steps: number; angle: number; keyword: string }>;
    }>({ sessionId: null, version: 0, palettes: [] });

    const { data: likedSeeds = new Set<string>() } = useQuery(userLikedSeedsQueryOptions());

    // Combine in-flight + persisted palettes, sorted by version descending (latest first)
    // In-flight palettes appear first since they're from the current/latest generation
    const allGeneratedPalettes = [...inFlightPalettes, ...persistedPalettes]
        .sort((a, b) => b.version - a.version);

    // Handler for bad feedback - removes palette and saves to D1
    const handleBadFeedback = (seed: string) => {
        // Remove from in-flight if present
        setInFlightPalettes(prev => prev.filter(p => p.seed !== seed));
        // Save feedback to D1 (will be reflected when query refetches)
        if (effectiveSessionId) {
            saveGenerateSessionFeedback({
                data: { sessionId: effectiveSessionId, seed, feedback: "bad" },
            }).then(() => {
                // Invalidate to refetch persisted palettes without the removed one
                queryClient.invalidateQueries({ queryKey: ["generate-session", generationQuery] });
            }).catch(console.error);
        }
    };

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
            navigateToGenerate
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
                                sessionId={effectiveSessionId}
                                style={style}
                                steps={steps}
                                angle={angle}
                                onSessionCreated={(newSessionId, version) => {
                                    setSessionId(newSessionId);
                                    pendingRef.current = { sessionId: newSessionId, version, palettes: [] };
                                }}
                                onGenerateStart={() => {
                                    setIsGenerating(true);
                                    setGenerateError(null);
                                    setInFlightPalettes([]);
                                }}
                                onPaletteReceived={(palette) => {
                                    const currentVersion = pendingRef.current.version;
                                    const { coeffs } = deserializeCoeffs(palette.seed);
                                    const appPalette: VersionedPalette = {
                                        seed: palette.seed,
                                        style: palette.style,
                                        steps: palette.steps,
                                        angle: palette.angle,
                                        createdAt: null,
                                        coeffs,
                                        globals: DEFAULT_GLOBALS,
                                        hexColors: palette.hexColors,
                                        score: 0,
                                        version: currentVersion,
                                        modelKey: palette.modelKey,
                                        theme: palette.theme,
                                    };
                                    setInFlightPalettes(prev => [...prev, appPalette]);
                                    pendingRef.current.palettes.push({
                                        seed: palette.seed,
                                        style: palette.style,
                                        steps: palette.steps,
                                        angle: palette.angle,
                                        keyword: palette.theme,
                                    });
                                }}
                                onGenerateComplete={() => {
                                    setIsGenerating(false);
                                    const { sessionId: sid, version, palettes } = pendingRef.current;
                                    if (sid && palettes.length > 0) {
                                        saveGenerateSessionSeeds({
                                            data: { sessionId: sid, version, palettes },
                                        }).then(() => {
                                            // Clear in-flight and invalidate query to show persisted
                                            setInFlightPalettes([]);
                                            queryClient.invalidateQueries({ queryKey: ["generate-session", generationQuery] });
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
            <Suspense
                fallback={
                    <VirtualizedPalettesGrid
                        palettes={allGeneratedPalettes}
                        likedSeeds={likedSeeds}
                        urlStyle={style}
                        urlAngle={angle}
                        urlSteps={steps}
                        isExportOpen={isExportOpen}
                        searchQuery={query}
                        onBadFeedback={handleBadFeedback}
                        skeletonCount={48}
                        showSubscribeCta={showSubscribeCta}
                    />
                }
            >
                <SearchResultsGrid
                    query={query}
                    sort={sort}
                    generatedPalettes={allGeneratedPalettes}
                    likedSeeds={likedSeeds}
                    urlStyle={style}
                    urlAngle={angle}
                    urlSteps={steps}
                    isExportOpen={isExportOpen}
                    isGenerating={isGenerating}
                    pendingPalettesCount={pendingRef.current.palettes.length}
                    onBadFeedback={handleBadFeedback}
                    showSubscribeCta={showSubscribeCta}
                />
            </Suspense>
            {!isExportOpen && <div className="py-3 mt-16" />}
        </AppLayout>
    );
}
