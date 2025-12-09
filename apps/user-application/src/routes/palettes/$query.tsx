import { createFileRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import * as v from "valibot";
import {
    searchPalettesQueryOptions,
    userLikedSeedsQueryOptions,
    type SearchResultPalette,
} from "@/queries/palettes";
import { PalettesGrid } from "@/components/palettes/palettes-grid";
import { AppLayout } from "@/components/layout/AppLayout";
import { isValidSearchQuery } from "@/lib/validators/search";
import { DEFAULT_PAGE_LIMIT } from "@/lib/constants";
import { decompressQuery } from "@/lib/utils";
import { Search } from "lucide-react";

export type SearchSortOrder = "popular" | "newest" | "oldest";

const SEARCH_DEFAULTS = {
    sort: "popular" as SearchSortOrder,
};

const searchValidatorSchema = v.object({
    sort: v.optional(
        v.fallback(
            v.picklist(["popular", "newest", "oldest"]),
            SEARCH_DEFAULTS.sort,
        ),
        SEARCH_DEFAULTS.sort,
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

function getQuery(compressedParam: string): string | null {
    try {
        return decompressQuery(compressedParam);
    } catch {
        return null;
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

function SearchResultsPage() {
    const { query: compressedQuery } = Route.useParams();
    const { sort } = Route.useSearch();
    const query = getQuery(compressedQuery) ?? "";

    const { data: searchData } = useSuspenseQuery(
        searchPalettesQueryOptions(query, DEFAULT_PAGE_LIMIT),
    );
    const { data: likedSeeds } = useSuspenseQuery(userLikedSeedsQueryOptions());

    const results = sortResults(searchData?.results || [], sort);

    if (results.length === 0) {
        return (
            <AppLayout>
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground px-5 lg:px-14">
                    <Search className="h-12 w-12 mb-4 opacity-50" />
                    <p className="text-lg">No palettes found for "{query}"</p>
                    <p className="text-sm mt-2">Try different keywords</p>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout>
            <div className="px-5 lg:px-14 mb-8">
                <h1 className="text-3xl md:text-4xl font-bold text-foreground">
                    {query} palettes
                </h1>
            </div>
            <PalettesGrid palettes={results} likedSeeds={likedSeeds} />
            <div className="py-3 mt-16" />
        </AppLayout>
    );
}
