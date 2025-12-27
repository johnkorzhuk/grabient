import {
    createFileRoute,
    stripSearchParams,
    Link,
} from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useSuspenseQuery } from "@tanstack/react-query";
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
import {
    styleWithAutoValidator,
    angleWithAutoValidator,
    stepsWithAutoValidator,
    sizeWithAutoValidator,
} from "@repo/data-ops/valibot-schema/grabient";
import { hexToColorName, HEX_CODE_REGEX } from "@repo/data-ops/color-utils";
import { getSeedColorData } from "@/lib/seed-color-data";
import { isValidSeed } from "@repo/data-ops/serialization";
import { ArrowLeft, Search, Sparkles } from "lucide-react";
import type { SizeType } from "@/stores/export";
import { popularTagsQueryOptions } from "@/server-functions/popular-tags";
import { SelectedButtonContainer } from "@/components/palettes/SelectedButtonContainer";
import { useMounted } from "@mantine/hooks";
import {
    PalettePageSubtitle,
    QueryDisplay,
    queryHasSubtitle,
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

export const Route = createFileRoute("/palettes/$query/")({
    validateSearch: searchValidatorSchema,
    search: {
        middlewares: [stripSearchParams(SEARCH_DEFAULTS)],
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
                searchPalettesQueryOptions(query, 48),
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

function GenerateButton({ query, search }: { query: string; search: SearchParams }) {
    return (
        <Link
            to="/palettes/$query/generate"
            params={{ query }}
            search={{
                style: search.style !== "auto" ? search.style : undefined,
                angle: search.angle !== "auto" ? search.angle : undefined,
                steps: search.steps !== "auto" ? search.steps : undefined,
                size: search.size !== "auto" ? search.size : undefined,
                sort: search.sort !== "popular" ? search.sort : undefined,
            }}
            style={{ backgroundColor: "var(--background)" }}
            className={cn(
                "disable-animation-on-theme-change",
                "inline-flex items-center justify-center gap-2 rounded-md",
                "font-bold text-sm h-8.5 px-3 border border-solid",
                "border-input hover:border-muted-foreground/30 hover:bg-background/60",
                "text-muted-foreground hover:text-foreground",
                "transition-colors duration-200 cursor-pointer",
                "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
            )}
        >
            <span>Generate</span>
            <Sparkles className="w-4 h-4" />
        </Link>
    );
}

function SearchResultsPage() {
    const { query: compressedQuery } = Route.useParams();
    const search = Route.useSearch();
    const { sort, style, angle, steps, size } = search;
    const isExportOpen = search.export === true;
    const mounted = useMounted();
    const exportList = useStore(exportStore, (state) => state.exportList);
    const exportCount = mounted ? exportList.length : 0;
    const showExportUI = isExportOpen && exportCount > 0;
    const query = getQuery(compressedQuery) ?? "";

    const { data: searchData } = useSuspenseQuery(
        searchPalettesQueryOptions(query, 48),
    );
    const { data: likedSeeds } = useSuspenseQuery(userLikedSeedsQueryOptions());

    const results = sortResults(searchData?.results || [], sort);

    const backNav = buildBackNavigation({ sort, style, angle, steps, size });

    if (results.length === 0) {
        return (
            <AppLayout
                style={style}
                angle={angle}
                steps={steps}
                leftAction={
                    <BackButton
                        sort={sort}
                        style={style}
                        angle={angle}
                        steps={steps}
                        size={size}
                    />
                }
                logoNavigation={backNav}
                isExportOpen={showExportUI}
            >
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

    const hasSubtitle = queryHasSubtitle(query);
    const preservedSearch = {
        style: style !== "auto" ? style : undefined,
        angle: angle !== "auto" ? angle : undefined,
        steps: steps !== "auto" ? steps : undefined,
        size: size !== "auto" ? size : undefined,
        sort: sort !== "popular" ? sort : undefined,
    };

    return (
        <AppLayout
            style={style}
            angle={angle}
            steps={steps}
            leftAction={
                <BackButton
                    sort={sort}
                    style={style}
                    angle={angle}
                    steps={steps}
                    size={size}
                />
            }
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
                            <QueryDisplay query={query} />
                            <span className="ml-1">palettes</span>
                        </h1>
                        <div className="flex items-center gap-2 shrink-0">
                            <GenerateButton query={compressedQuery} search={{ sort, style, angle, steps, size }} />
                            <SelectedButtonContainer className="contents" />
                        </div>
                    </div>
                    <PalettePageSubtitle
                        query={query}
                        searchParams={preservedSearch}
                    />
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
            <PalettesGrid
                palettes={results}
                likedSeeds={likedSeeds}
                urlStyle={style}
                urlAngle={angle}
                urlSteps={steps}
                isExportOpen={isExportOpen}
                searchQuery={query}
            />
            {!isExportOpen && <div className="py-3 mt-16" />}
        </AppLayout>
    );
}
