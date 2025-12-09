import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import * as v from "valibot";
import {
    searchPalettesQueryOptions,
    userLikedSeedsQueryOptions,
    type SearchResultPalette,
} from "@/queries/palettes";
import { PalettesGrid } from "@/components/palettes/palettes-grid";
import { AppLayout } from "@/components/layout/AppLayout";
import { DEFAULT_PAGE_LIMIT } from "@/lib/constants";
import { hexToColorName } from "@/lib/color-utils";
import { getSeedColorData } from "@/lib/seed-color-data";
import { isValidSeed } from "@repo/data-ops/serialization";
import { Search } from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    styleWithAutoValidator,
    angleWithAutoValidator,
    stepsWithAutoValidator,
} from "@repo/data-ops/valibot-schema/grabient";
import type { SizeType } from "@/stores/export";

export type SearchSortOrder = "popular" | "newest" | "oldest";

const sizeValidator = v.union([
    v.literal("auto"),
    v.pipe(
        v.tuple([v.number(), v.number()]),
        v.check(
            ([width, height]) =>
                width >= 1 && width <= 6000 && height >= 1 && height <= 6000,
            "Size must be between 1 and 6000",
        ),
    ),
]);

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
        v.fallback(sizeValidator, SEARCH_DEFAULTS.size),
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

export const Route = createFileRoute("/palettes/$query")({
    validateSearch: searchValidatorSchema,
    search: {
        middlewares: [stripSearchParams(SEARCH_DEFAULTS)],
    },
    loader: async ({ context, params }) => {
        const query = getQuery(params.query);
        if (!query) return;
        await Promise.all([
            context.queryClient.ensureQueryData(
                searchPalettesQueryOptions(query, DEFAULT_PAGE_LIMIT),
            ),
            context.queryClient.ensureQueryData(userLikedSeedsQueryOptions()),
        ]);
    },
    headers: () => ({
        "cache-control": "public, max-age=300, stale-while-revalidate=600",
        "cdn-cache-control": "max-age=1800, stale-while-revalidate=3600",
    }),
    head: ({ params }) => {
        const query = getQuery(params.query) ?? "Search";
        const title = `${query} palettes - Grabient`;
        const description = `Browse gradient palettes matching "${query}".`;

        return {
            meta: [
                { title },
                { name: "description", content: description },
                { name: "robots", content: "noindex, follow" },
            ],
        };
    },
    component: SearchResultsPage,
});

const HEX_REGEX = /#([0-9a-fA-F]{3}(?![0-9a-fA-F])|[0-9a-fA-F]{6}(?![0-9a-fA-F]))/g;

function ColorSwatch({ hex, isLast = false }: { hex: string; isLast?: boolean }) {
    const colorName = hexToColorName(hex);
    return (
        <span className={`inline-flex items-center gap-2 mx-2 ${isLast ? "pr-2" : ""}`}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span
                        className="inline-block w-4 h-4 rounded-full border border-input cursor-default"
                        style={{ backgroundColor: hex }}
                    />
                </TooltipTrigger>
                <TooltipContent>
                    <span className="capitalize">{colorName}</span>
                </TooltipContent>
            </Tooltip>
            <span className="text-foreground">{hex}</span>
        </span>
    );
}

function cleanTextPart(text: string): string {
    return text
        .replace(/[,#]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function parseQueryForDisplay(query: string): Array<{ type: "text" | "hex"; value: string }> {
    const sanitized = query
        .replace(/[\[\]"{}]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100);

    const parts: Array<{ type: "text" | "hex"; value: string }> = [];
    const seenColorNames = new Set<string>();
    let lastIndex = 0;

    for (const match of sanitized.matchAll(HEX_REGEX)) {
        if (match.index! > lastIndex) {
            const text = cleanTextPart(sanitized.slice(lastIndex, match.index));
            if (text) parts.push({ type: "text", value: text });
        }
        const colorName = hexToColorName(match[0]);
        if (!seenColorNames.has(colorName)) {
            seenColorNames.add(colorName);
            parts.push({ type: "hex", value: match[0] });
        }
        lastIndex = match.index! + match[0].length;
    }

    if (lastIndex < sanitized.length) {
        const text = cleanTextPart(sanitized.slice(lastIndex));
        if (text) parts.push({ type: "text", value: text });
    }

    return parts;
}

function QueryDisplay({ query }: { query: string }) {
    // Check if query is a valid seed and render hex codes from it
    const seedData = getSeedColorData(query);
    if (seedData) {
        const lastIndex = seedData.hexCodes.length - 1;
        return (
            <>
                {seedData.hexCodes.map((hex, i) => (
                    <ColorSwatch key={i} hex={hex} isLast={i === lastIndex} />
                ))}
            </>
        );
    }

    const parts = parseQueryForDisplay(query);

    if (parts.length === 0) {
        return <span>Search</span>;
    }

    const lastHexIndex = parts.reduce(
        (last, part, i) => (part.type === "hex" ? i : last),
        -1,
    );

    return (
        <>
            {parts.map((part, i) =>
                part.type === "hex" ? (
                    <ColorSwatch key={i} hex={part.value} isLast={i === lastHexIndex} />
                ) : (
                    <span key={i}>{part.value} </span>
                ),
            )}
        </>
    );
}

function SearchResultsPage() {
    const { query: compressedQuery } = Route.useParams();
    const { sort, style, angle, steps } = Route.useSearch();
    const query = getQuery(compressedQuery) ?? "";

    const { data: searchData } = useSuspenseQuery(
        searchPalettesQueryOptions(query, DEFAULT_PAGE_LIMIT),
    );
    const { data: likedSeeds } = useSuspenseQuery(userLikedSeedsQueryOptions());

    const results = sortResults(searchData?.results || [], sort);

    if (results.length === 0) {
        return (
            <AppLayout style={style} angle={angle} steps={steps}>
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground px-5 lg:px-14">
                    <Search className="h-12 w-12 mb-4 opacity-50" />
                    <p className="text-lg flex items-center flex-wrap gap-1">
                        No palettes found for "<QueryDisplay query={query} />"
                    </p>
                    <p className="text-sm mt-2">Try different keywords</p>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout style={style} angle={angle} steps={steps}>
            <div className="px-5 lg:px-14 mb-8">
                <h1 className="text-3xl md:text-4xl font-bold text-foreground flex items-center flex-wrap gap-1">
                    <QueryDisplay query={query} />
                    <span>palettes</span>
                </h1>
            </div>
            <PalettesGrid palettes={results} likedSeeds={likedSeeds} urlStyle={style} urlAngle={angle} urlSteps={steps} />
            <div className="py-3 mt-16" />
        </AppLayout>
    );
}
