import { useState, useRef, useEffect } from "react";
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
import {
    searchPalettesQueryOptions,
    userLikedSeedsQueryOptions,
    type SearchResultPalette,
} from "@/queries/palettes";
import { PalettesGrid } from "@/components/palettes/palettes-grid";
import { AppLayout } from "@/components/layout/AppLayout";
import { setPreviousRoute } from "@/stores/ui";
import { exportStore } from "@/stores/export";
import { DEFAULT_PAGE_LIMIT } from "@repo/data-ops/valibot-schema/grabient";
import {
    hexToColorName,
    colorNameToHex,
    isColorName,
    simplifyHex,
    isExactColorMatch,
    HEX_CODE_REGEX,
} from "@/lib/color-utils";
import { getSeedColorData } from "@/lib/seed-color-data";
import { isValidSeed, deserializeCoeffs } from "@repo/data-ops/serialization";
import { DEFAULT_GLOBALS } from "@repo/data-ops/valibot-schema/grabient";
import type { AppPalette } from "@/queries/palettes";
import { ArrowLeft, Sparkles } from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    styleWithAutoValidator,
    angleWithAutoValidator,
    stepsWithAutoValidator,
    sizeWithAutoValidator,
} from "@repo/data-ops/valibot-schema/grabient";
import type { SizeType } from "@/stores/export";
import { popularTagsQueryOptions } from "@/server-functions/popular-tags";
import { SelectedButtonContainer } from "@/components/palettes/SelectedButtonContainer";
import { useMounted } from "@mantine/hooks";
import {
    GenerateButton,
    type GeneratedPalette,
} from "@/components/palettes/GenerateButton";
import { VersionPagination } from "@/components/palettes/version-pagination";
import {
    getGenerateSessionByQuery,
    saveGenerateSessionSeeds,
} from "@/server-functions/generate-session";
import { generateHexColors } from "@/lib/paletteUtils";
import { sessionQueryOptions } from "@/queries/auth";

export type SearchSortOrder = "popular" | "newest" | "oldest";

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
        // Check authentication - redirect to search page if not logged in
        try {
            const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
            if (!session?.user) {
                throw redirect({
                    to: "/palettes/$query",
                    params: { query: params.query },
                });
            }
        } catch {
            throw redirect({
                to: "/palettes/$query",
                params: { query: params.query },
            });
        }
    },
    loader: async ({ context, params }) => {
        const query = getQuery(params.query);
        if (!query) {
            await context.queryClient.ensureQueryData(
                popularTagsQueryOptions(),
            );
            return;
        }
        await Promise.all([
            context.queryClient.ensureQueryData(
                searchPalettesQueryOptions(query, DEFAULT_PAGE_LIMIT),
            ),
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

function ColorSwatch({ hex }: { hex: string }) {
    const colorName = hexToColorName(hex);
    const displayHex = simplifyHex(hex);
    const isExact = isExactColorMatch(hex);

    const swatch = (
        <span
            className="inline-block w-4 h-4 rounded-full border border-input cursor-default"
            style={{ backgroundColor: hex }}
        />
    );

    return (
        <span className="inline-flex items-center gap-1.5">
            {isExact ? (
                <Tooltip>
                    <TooltipTrigger asChild>{swatch}</TooltipTrigger>
                    <TooltipContent>
                        <span className="capitalize">{colorName}</span>
                    </TooltipContent>
                </Tooltip>
            ) : (
                swatch
            )}
            <span className="text-foreground">{displayHex}</span>
        </span>
    );
}

function ColorNameSwatch({ name, hex }: { name: string; hex: string }) {
    const displayHex = simplifyHex(hex);
    const isExact = isExactColorMatch(hex);

    const swatch = (
        <span
            className="inline-block w-4 h-4 rounded-full border border-input cursor-default"
            style={{ backgroundColor: hex }}
        />
    );

    return (
        <span className="inline-flex items-center gap-1.5">
            {isExact ? (
                <Tooltip>
                    <TooltipTrigger asChild>{swatch}</TooltipTrigger>
                    <TooltipContent>
                        <span>{displayHex}</span>
                    </TooltipContent>
                </Tooltip>
            ) : (
                swatch
            )}
            <span className="text-foreground capitalize">{name}</span>
        </span>
    );
}

function cleanTextPart(text: string): string {
    return text.replace(/[,#]+/g, " ").replace(/\s+/g, " ").trim();
}

function parseQueryForDisplay(
    query: string,
): Array<{ type: "text" | "hex" | "colorName"; value: string; hex?: string }> {
    const sanitized = query
        .replace(/[\[\]"{}]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100);

    const parts: Array<{
        type: "text" | "hex" | "colorName";
        value: string;
        hex?: string;
    }> = [];
    const seenColors = new Set<string>();

    let lastIndex = 0;
    const segments: Array<{
        type: "text" | "hex";
        value: string;
        start: number;
        end: number;
    }> = [];

    for (const match of sanitized.matchAll(HEX_CODE_REGEX)) {
        if (match.index! > lastIndex) {
            segments.push({
                type: "text",
                value: sanitized.slice(lastIndex, match.index),
                start: lastIndex,
                end: match.index!,
            });
        }
        segments.push({
            type: "hex",
            value: match[0],
            start: match.index!,
            end: match.index! + match[0].length,
        });
        lastIndex = match.index! + match[0].length;
    }

    if (lastIndex < sanitized.length) {
        segments.push({
            type: "text",
            value: sanitized.slice(lastIndex),
            start: lastIndex,
            end: sanitized.length,
        });
    }

    for (const segment of segments) {
        if (segment.type === "hex") {
            const colorName = hexToColorName(segment.value);
            if (!seenColors.has(colorName)) {
                seenColors.add(colorName);
                parts.push({ type: "hex", value: segment.value });
            }
        } else {
            const words = segment.value.split(/\s+/);
            let textBuffer = "";

            for (const word of words) {
                const cleanWord = word.replace(/[,]+/g, "").trim();
                if (cleanWord.toLowerCase() === "and") {
                    continue;
                }
                if (cleanWord && isColorName(cleanWord)) {
                    if (textBuffer.trim()) {
                        parts.push({
                            type: "text",
                            value: cleanTextPart(textBuffer),
                        });
                        textBuffer = "";
                    }
                    const hex = colorNameToHex(cleanWord);
                    if (hex && !seenColors.has(cleanWord.toLowerCase())) {
                        seenColors.add(cleanWord.toLowerCase());
                        parts.push({
                            type: "colorName",
                            value: cleanWord,
                            hex,
                        });
                    }
                } else {
                    textBuffer += (textBuffer ? " " : "") + word;
                }
            }

            if (textBuffer.trim()) {
                const cleaned = cleanTextPart(textBuffer);
                if (cleaned) parts.push({ type: "text", value: cleaned });
            }
        }
    }

    return parts;
}

type QueryType = "seed" | "hex" | "text";

function getQueryType(query: string): QueryType {
    if (isValidSeed(query)) return "seed";
    if (HEX_CODE_REGEX.test(query)) {
        HEX_CODE_REGEX.lastIndex = 0;
        return "hex";
    }
    return "text";
}

function QueryDisplay({ query }: { query: string }) {
    const seedData = getSeedColorData(query);
    if (seedData) {
        return (
            <>
                {seedData.colorNames.map((name, i) => (
                    <span key={i} className="inline-flex items-center">
                        <ColorNameSwatch
                            name={name}
                            hex={seedData.hexCodes[i]!}
                        />
                    </span>
                ))}
            </>
        );
    }

    const parts = parseQueryForDisplay(query);

    if (parts.length === 0) {
        return <span>Search</span>;
    }

    return (
        <>
            {parts.map((part, i) => {
                if (part.type === "hex") {
                    return (
                        <span key={i} className="inline-flex items-center">
                            <ColorSwatch hex={part.value} />
                        </span>
                    );
                }
                if (part.type === "colorName" && part.hex) {
                    return (
                        <span key={i} className="inline-flex items-center">
                            <ColorNameSwatch name={part.value} hex={part.hex} />
                        </span>
                    );
                }
                return <span key={i}>{part.value}</span>;
            })}
        </>
    );
}

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
    style:
        | "auto"
        | "linearGradient"
        | "angularGradient"
        | "angularSwatches"
        | "linearSwatches"
        | "deepFlow";
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

    // Generate state - palettes include version info and unbiased flag
    type VersionedPalette = AppPalette & { version: number; unbiased: boolean };
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedPalettes, setGeneratedPalettes] = useState<VersionedPalette[]>([]);
    const [generateError, setGenerateError] = useState<string | null>(null);

    // Session state for multi-round generation
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [sessionVersion, setSessionVersion] = useState(1);
    const [selectedVersion, setSelectedVersion] = useState(1);
    const [sessionLoaded, setSessionLoaded] = useState(false);

    // Load existing session from database
    const { data: existingSession } = useQuery({
        queryKey: ["generate-session", query],
        queryFn: () => getGenerateSessionByQuery({ data: { query } }),
        enabled: !!query && !sessionLoaded,
        staleTime: 0,
    });

    // Convert a seed to a VersionedPalette (for loading from DB)
    const seedToVersionedPalette = (seed: string, version: number, unbiased: boolean): VersionedPalette => {
        const { coeffs } = deserializeCoeffs(seed);
        const hexColors = generateHexColors(coeffs, DEFAULT_GLOBALS, 8);
        return {
            seed,
            style: "linearGradient",
            steps: 8,
            angle: 90,
            createdAt: null,
            coeffs,
            globals: DEFAULT_GLOBALS,
            hexColors,
            score: 0,
            version,
            unbiased,
        };
    };

    // Initialize state from loaded session
    useEffect(() => {
        if (existingSession && !sessionLoaded) {
            setSessionId(existingSession.sessionId);
            setSessionVersion(existingSession.version);
            setSelectedVersion(existingSession.version);

            // Reconstruct palettes from stored seeds
            const palettes: VersionedPalette[] = [];
            const generatedSeeds = existingSession.generatedSeeds ?? {};

            for (const [versionKey, seeds] of Object.entries(generatedSeeds)) {
                const version = parseInt(versionKey, 10);
                for (const seed of seeds as string[]) {
                    palettes.push(seedToVersionedPalette(seed, version, false));
                }
            }

            setGeneratedPalettes(palettes);
            setSessionLoaded(true);
        }
    }, [existingSession, sessionLoaded]);

    // Reset session when query changes
    const prevQueryRef = useRef(query);
    useEffect(() => {
        if (prevQueryRef.current !== query) {
            setSessionId(null);
            setSessionVersion(1);
            setSelectedVersion(1);
            setGeneratedPalettes([]);
            setSessionLoaded(false);
            prevQueryRef.current = query;
        }
    }, [query]);

    // Auto-select latest version when new version arrives
    const prevSessionVersionRef = useRef(sessionVersion);
    useEffect(() => {
        if (prevSessionVersionRef.current !== sessionVersion) {
            setSelectedVersion(sessionVersion);
            prevSessionVersionRef.current = sessionVersion;
        }
    }, [sessionVersion]);

    // Convert GeneratedPalette to AppPalette format with version and unbiased flag
    const generatedToAppPalette = (generated: GeneratedPalette, version: number): VersionedPalette => {
        const { coeffs } = deserializeCoeffs(generated.seed);
        return {
            seed: generated.seed,
            style: "linearGradient",
            steps: generated.hexColors.length,
            angle: 90,
            createdAt: null,
            coeffs,
            globals: DEFAULT_GLOBALS,
            hexColors: generated.hexColors,
            score: 0,
            version,
            unbiased: generated.unbiased,
        };
    };

    // Track seeds to save in batch after generation completes
    const pendingSeedsRef = useRef<{ sessionId: string | null; version: number; seeds: string[] }>({
        sessionId: null,
        version: 0,
        seeds: [],
    });

    const { data: searchData } = useSuspenseQuery(
        searchPalettesQueryOptions(query, DEFAULT_PAGE_LIMIT),
    );
    const { data: likedSeeds } = useSuspenseQuery(userLikedSeedsQueryOptions());

    const results = sortResults(searchData?.results || [], sort);

    // Build seed-to-hex mapping for session context
    const seedToHex: Record<string, string[]> = {};
    for (const p of [...results, ...generatedPalettes]) {
        if (!seedToHex[p.seed]) {
            seedToHex[p.seed] = p.hexColors;
        }
    }

    const hasGeneratedResults = generatedPalettes.length > 0 || generateError !== null;

    const backNav = buildBackNavigation({ sort, style, angle, steps, size });

    const queryType = getQueryType(query);
    const hasSubtitle = queryType === "seed" || queryType === "hex";

    return (
        <AppLayout
            style={style}
            angle={angle}
            steps={steps}
            leftAction={<BackButton query={compressedQuery} />}
            logoNavigation={backNav}
            isExportOpen={showExportUI}
        >
            <div
                className={cn(
                    "px-5 lg:px-14",
                    hasSubtitle ? "mb-14 md:mb-16" : "mb-10 md:mb-12.5",
                    isExportOpen && "invisible"
                )}
            >
                <div className="flex items-start justify-between gap-4">
                    <h1 className="text-xl sm:text-3xl md:text-4xl font-bold text-foreground flex items-center flex-wrap gap-x-2 gap-y-1 min-w-0">
                        <Sparkles className="w-6 h-6 md:w-8 md:h-8 text-muted-foreground" />
                        <span>Generate</span>
                        <QueryDisplay query={query} />
                        <span>palettes</span>
                    </h1>
                    {!isExportOpen && (
                        <div className="flex items-center gap-2 shrink-0">
                            <GenerateButton
                                query={query}
                                limit={DEFAULT_PAGE_LIMIT}
                                examplePalettes={results.map(r => r.hexColors)}
                                sessionId={sessionId}
                                seedToHex={seedToHex}
                                showModeSelector
                                onSessionCreated={(newSessionId, version) => {
                                    console.log("[generate.tsx] onSessionCreated:", newSessionId, "version:", version);
                                    setSessionId(newSessionId);
                                    setSessionVersion(version);
                                    pendingSeedsRef.current = { sessionId: newSessionId, version, seeds: [] };
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
                                    pendingSeedsRef.current.seeds.push(palette.seed);
                                }}
                                onGenerateComplete={() => {
                                    setIsGenerating(false);
                                    const { sessionId: sid, version, seeds } = pendingSeedsRef.current;
                                    if (sid && seeds.length > 0) {
                                        saveGenerateSessionSeeds({
                                            data: { sessionId: sid, version, seeds },
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
                    )}
                </div>
            </div>
            {isExportOpen && (
                <SelectedButtonContainer
                    className={cn(
                        hasSubtitle
                            ? "-mt-[88px] md:-mt-[100px]"
                            : "-mt-[72px] md:-mt-[84px]",
                    )}
                />
            )}
            {hasGeneratedResults ? (
                <>
                    <div className="px-5 lg:px-14 mb-6">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-lg font-semibold">Generated Palettes</h2>
                                {isGenerating && (
                                    <span className="text-sm text-muted-foreground animate-pulse">
                                        Generating... ({generatedPalettes.filter(p => p.version === sessionVersion).length} received)
                                    </span>
                                )}
                                {!isGenerating && (
                                    <span className="text-sm text-muted-foreground">
                                        {generatedPalettes.filter(p => p.version === selectedVersion).length} palettes
                                    </span>
                                )}
                            </div>
                            <VersionPagination
                                currentVersion={selectedVersion}
                                totalVersions={sessionVersion}
                                onVersionChange={setSelectedVersion}
                            />
                        </div>
                        {generateError && (
                            <div className="text-red-500 text-sm p-4 mt-4 rounded-md bg-red-500/10 border border-red-500/20">
                                {generateError}
                            </div>
                        )}
                    </div>
                    {!generateError && (
                        <PalettesGrid
                            palettes={generatedPalettes.filter(p => p.version === selectedVersion)}
                            likedSeeds={likedSeeds}
                            urlStyle={style}
                            urlAngle={angle}
                            urlSteps={steps}
                            isExportOpen={isExportOpen}
                            searchQuery={query}
                        />
                    )}
                </>
            ) : (
                <div className="px-5 lg:px-14 py-16 text-center">
                    <Sparkles className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-lg text-muted-foreground mb-2">
                        No generated palettes yet
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Click the Generate button above to create AI-powered palettes
                    </p>
                </div>
            )}
            {!isExportOpen && <div className="py-3 mt-16" />}
        </AppLayout>
    );
}
