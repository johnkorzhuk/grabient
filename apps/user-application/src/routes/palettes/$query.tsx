import { createFileRoute, stripSearchParams, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import * as v from "valibot";
import {
    searchPalettesQueryOptions,
    userLikedSeedsQueryOptions,
    type SearchResultPalette,
} from "@/queries/palettes";
import { PalettesGrid } from "@/components/palettes/palettes-grid";
import { AppLayout } from "@/components/layout/AppLayout";
import { setPreviousRoute } from "@/stores/ui";
import { DEFAULT_PAGE_LIMIT } from "@repo/data-ops/valibot-schema/grabient";
import { hexToColorName, colorNameToHex, isColorName, simplifyHex, isExactColorMatch, HEX_CODE_REGEX } from "@/lib/color-utils";
import { getSeedColorData } from "@/lib/seed-color-data";
import { isValidSeed } from "@repo/data-ops/serialization";
import { Search, ArrowLeft } from "lucide-react";
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

export type SearchSortOrder = "popular" | "newest" | "oldest";

const SEARCH_DEFAULTS = {
    sort: "popular" as SearchSortOrder,
    style: "auto" as const,
    angle: "auto" as const,
    steps: "auto" as const,
    size: "auto" as SizeType,
};

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
});

function sortResults(results: SearchResultPalette[], order: SearchSortOrder): SearchResultPalette[] {
    return [...results].sort((a, b) => {
        switch (order) {
            case "newest":
                return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
            case "oldest":
                return (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
            case "popular":
            default:
                return (b.likesCount ?? 0) - (a.likesCount ?? 0);
        }
    });
}

function getQuery(param: string): string | null {
    // If it's a valid seed, return it directly
    if (isValidSeed(param)) {
        return param;
    }
    // Decode URL-safe format: dashes become spaces, decode percent-encoded chars
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
    // Check if query is a valid seed
    const seedData = getSeedColorData(query);
    if (seedData) {
        return `${formatColorList(seedData.colorNames)} palettes`;
    }

    // Check for hex codes and convert to color names
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

    // Default: use query as-is
    return `${query} palettes`;
}

export const Route = createFileRoute("/palettes/$query")({
    validateSearch: searchValidatorSchema,
    search: {
        middlewares: [stripSearchParams(SEARCH_DEFAULTS)],
    },
    loader: async ({ context, params }) => {
        const query = getQuery(params.query);
        if (!query) {
            await context.queryClient.ensureQueryData(popularTagsQueryOptions());
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
    headers: () => ({
        "cache-control": "public, max-age=300, stale-while-revalidate=600",
        "cdn-cache-control": "max-age=1800, stale-while-revalidate=3600",
    }),
    head: ({ params, match }) => {
        const query = getQuery(params.query) ?? "Search";
        const heading = getHeadingText(query);
        const title = `${heading} - Grabient`;

        const baseUrl = import.meta.env.VITE_BASE_URL || "https://grabient.com";
        const ogUrl = new URL("/api/og/query", baseUrl);
        ogUrl.searchParams.set("query", query);

        const { style, steps, angle } = match.search;
        if (style && style !== "auto") {
            ogUrl.searchParams.set("style", style);
        }
        if (steps !== undefined && steps !== "auto") {
            ogUrl.searchParams.set("steps", String(steps));
        }
        if (angle !== undefined && angle !== "auto") {
            ogUrl.searchParams.set("angle", String(angle));
        }

        return {
            meta: [
                { title },
                { name: "description", content: heading },
                { name: "og:type", content: "website" },
                { name: "og:title", content: title },
                { name: "og:description", content: heading },
                { name: "og:image", content: ogUrl.toString() },
                { name: "og:image:width", content: "1200" },
                { name: "og:image:height", content: "630" },
                { name: "twitter:card", content: "summary_large_image" },
                { name: "twitter:title", content: title },
                { name: "twitter:description", content: heading },
                { name: "twitter:image", content: ogUrl.toString() },
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
    component: SearchResultsPage,
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
    return text
        .replace(/[,#]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function parseQueryForDisplay(query: string): Array<{ type: "text" | "hex" | "colorName"; value: string; hex?: string }> {
    const sanitized = query
        .replace(/[\[\]"{}]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100);

    const parts: Array<{ type: "text" | "hex" | "colorName"; value: string; hex?: string }> = [];
    const seenColors = new Set<string>();

    // First pass: extract hex codes
    let lastIndex = 0;
    const segments: Array<{ type: "text" | "hex"; value: string; start: number; end: number }> = [];

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

    // Second pass: process segments, check text for color names
    for (const segment of segments) {
        if (segment.type === "hex") {
            const colorName = hexToColorName(segment.value);
            if (!seenColors.has(colorName)) {
                seenColors.add(colorName);
                parts.push({ type: "hex", value: segment.value });
            }
        } else {
            // Split text into words and check for color names
            const words = segment.value.split(/\s+/);
            let textBuffer = "";

            for (const word of words) {
                const cleanWord = word.replace(/[,]+/g, "").trim();
                // Skip "and" between colors - we add our own formatting
                if (cleanWord.toLowerCase() === "and") {
                    continue;
                }
                if (cleanWord && isColorName(cleanWord)) {
                    // Flush text buffer first
                    if (textBuffer.trim()) {
                        parts.push({ type: "text", value: cleanTextPart(textBuffer) });
                        textBuffer = "";
                    }
                    const hex = colorNameToHex(cleanWord);
                    if (hex && !seenColors.has(cleanWord.toLowerCase())) {
                        seenColors.add(cleanWord.toLowerCase());
                        parts.push({ type: "colorName", value: cleanWord, hex });
                    }
                } else {
                    textBuffer += (textBuffer ? " " : "") + word;
                }
            }

            // Flush remaining text
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

function getActualSearchTerms(query: string): { colorNames: string[]; hexCodes: string[] } | null {
    const seedData = getSeedColorData(query);
    if (seedData) {
        return { colorNames: seedData.colorNames, hexCodes: seedData.hexCodes };
    }

    const hexMatches = query.match(HEX_CODE_REGEX);
    if (hexMatches && hexMatches.length > 0) {
        const colorNames: string[] = [];
        const hexCodes: string[] = [];
        const seen = new Set<string>();
        for (const hex of hexMatches) {
            const name = hexToColorName(hex);
            if (!seen.has(name)) {
                seen.add(name);
                colorNames.push(name);
                hexCodes.push(colorNameToHex(name) || hex);
            }
        }
        return { colorNames, hexCodes };
    }

    return null;
}

function ResultsForSubtitle({ query, searchParams }: { query: string; searchParams: Record<string, unknown> }) {
    const queryType = getQueryType(query);

    if (queryType === "seed") {
        return (
            <p className="absolute top-full left-0 mt-1.5 text-sm text-muted-foreground font-medium flex items-center gap-1.5" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
                Showing results for seed:{" "}
                <Link
                    to="/$seed"
                    params={{ seed: query }}
                    search={searchParams}
                    className="text-foreground/80 hover:text-foreground underline underline-offset-2 decoration-muted-foreground/40 hover:decoration-foreground/50 transition-colors"
                >
                    {query.slice(0, 12)}...
                </Link>
            </p>
        );
    }

    if (queryType === "hex") {
        const searchTerms = getActualSearchTerms(query);
        if (!searchTerms) return null;

        return (
            <p className="absolute top-full left-0 mt-1.5 text-sm text-muted-foreground font-medium flex items-center gap-1.5" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
                Showing results for:
                {searchTerms.colorNames.map((name, i) => (
                    <span key={i} className="inline-flex items-center gap-1">
                        <span
                            className="inline-block w-3 h-3 rounded-sm border border-input"
                            style={{ backgroundColor: searchTerms.hexCodes[i] }}
                        />
                        <span className="text-foreground/80 capitalize">{name}</span>
                    </span>
                ))}
            </p>
        );
    }

    return null;
}

function QueryDisplay({ query }: { query: string }) {
    // Check if query is a valid seed and render hex codes from it
    const seedData = getSeedColorData(query);
    if (seedData) {
        return (
            <>
                {seedData.colorNames.map((name, i) => (
                    <span key={i} className="inline-flex items-center">
                        <ColorNameSwatch name={name} hex={seedData.hexCodes[i]!} />
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
        case "newest": return "/newest";
        case "oldest": return "/oldest";
        case "popular":
        default: return "/";
    }
}

interface SearchParams {
    sort: SearchSortOrder;
    style: "auto" | "linearGradient" | "angularGradient" | "angularSwatches" | "linearSwatches" | "deepFlow";
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

function BackButton({ sort, style, angle, steps, size }: SearchParams) {
    const nav = buildBackNavigation({ sort, style, angle, steps, size });

    return (
        <Link to={nav.to} search={nav.search}>
            <button
                type="button"
                style={{ backgroundColor: "var(--background)" }}
                className="disable-animation-on-theme-change inline-flex items-center justify-center rounded-md h-8.5 w-8.5 p-0 border border-solid border-input hover:border-muted-foreground/30 hover:bg-background/60 text-muted-foreground hover:text-foreground transition-colors duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                aria-label="Go back"
                suppressHydrationWarning
            >
                <ArrowLeft className="w-[18px] h-[18px]" strokeWidth={2.5} />
            </button>
        </Link>
    );
}

function SearchResultsPage() {
    const { query: compressedQuery } = Route.useParams();
    const { sort, style, angle, steps, size } = Route.useSearch();
    const query = getQuery(compressedQuery) ?? "";

    const { data: searchData } = useSuspenseQuery(
        searchPalettesQueryOptions(query, DEFAULT_PAGE_LIMIT),
    );
    const { data: likedSeeds } = useSuspenseQuery(userLikedSeedsQueryOptions());

    const results = sortResults(searchData?.results || [], sort);
    const backNav = buildBackNavigation({ sort, style, angle, steps, size });

    if (results.length === 0) {
        return (
            <AppLayout style={style} angle={angle} steps={steps} leftAction={<BackButton sort={sort} style={style} angle={angle} steps={steps} size={size} />} logoNavigation={backNav}>
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground px-5 lg:px-14">
                    <Search className="h-12 w-12 mb-4 opacity-50" />
                    <p className="text-lg flex items-center flex-wrap gap-2">
                        No palettes found for "<QueryDisplay query={query} />"
                    </p>
                    <p className="text-sm mt-2">Try different keywords</p>
                </div>
            </AppLayout>
        );
    }

    const queryType = getQueryType(query);
    const hasSubtitle = queryType === "seed" || queryType === "hex";
    const preservedSearch = {
        style: style !== "auto" ? style : undefined,
        angle: angle !== "auto" ? angle : undefined,
        steps: steps !== "auto" ? steps : undefined,
        size: size !== "auto" ? size : undefined,
        sort: sort !== "popular" ? sort : undefined,
    };

    return (
        <AppLayout style={style} angle={angle} steps={steps} leftAction={<BackButton sort={sort} style={style} angle={angle} steps={steps} size={size} />} logoNavigation={backNav}>
            <div className={`px-5 lg:px-14 ${hasSubtitle ? "mb-14 md:mb-16" : "mb-10 md:mb-12"}`}>
                <div className="relative">
                    <h1 className="text-3xl md:text-4xl font-bold text-foreground flex items-center flex-wrap gap-x-2 gap-y-1">
                        <QueryDisplay query={query} />
                        <span className="ml-1">palettes</span>
                    </h1>
                    <ResultsForSubtitle query={query} searchParams={preservedSearch} />
                </div>
            </div>
            <PalettesGrid palettes={results} likedSeeds={likedSeeds} urlStyle={style} urlAngle={angle} urlSteps={steps} />
            <div className="py-3 mt-16" />
        </AppLayout>
    );
}
