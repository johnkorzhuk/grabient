import { queryOptions } from "@tanstack/react-query";
import type { Palette } from "@repo/data-ops/drizzle/app-schema";
import {
    getPalettesPaginated,
    getUserLikedPalettes,
    getUserLikedSeeds,
    getPaletteLikeInfo,
} from "@/server-functions/palettes";
import { searchPalettes } from "@/server-functions/search";
import { deserializeCoeffs } from "@repo/data-ops/serialization";
import { generateHexColors } from "@/lib/paletteUtils";
import { DEFAULT_PAGE_LIMIT } from "@repo/data-ops/valibot-schema/grabient";

export type AppPalette = {
    seed: string;
    style: Palette["style"];
    steps: Palette["steps"];
    angle: Palette["angle"];
    createdAt: Palette["createdAt"] | null;
    coeffs: ReturnType<typeof deserializeCoeffs>["coeffs"];
    globals: ReturnType<typeof deserializeCoeffs>["globals"];
    hexColors: string[];
    likesCount?: number;
    score?: number;
};

export interface ExportItem {
    id: string;
    coeffs: ReturnType<typeof deserializeCoeffs>["coeffs"];
    globals: ReturnType<typeof deserializeCoeffs>["globals"];
    style: Palette["style"];
    steps: Palette["steps"];
    angle: Palette["angle"];
    seed: string;
    hexColors: string[];
}

function enrichPalette(palette: { seed: string; style: Palette["style"]; steps: Palette["steps"]; angle: Palette["angle"]; createdAt: Palette["createdAt"]; likesCount?: number }): AppPalette {
    const { coeffs, globals } = deserializeCoeffs(palette.seed);
    const hexColors = generateHexColors(coeffs, globals, palette.steps);

    return {
        ...palette,
        coeffs,
        globals,
        hexColors,
    };
}

export const palettesQueryOptions = (
    orderBy: "popular" | "newest" | "oldest" = "popular",
    page = 1,
    limit = DEFAULT_PAGE_LIMIT,
) =>
    queryOptions({
        queryKey: ["palettes", orderBy, page, limit],
        queryFn: async () => {
            const result = await getPalettesPaginated({ data: { page, limit, orderBy } });
            return {
                ...result,
                palettes: result.palettes.map(enrichPalette),
            };
        },
        // Public data - 10 minutes staleTime is acceptable
        // Popular changes slowly, newest/oldest changes with new submissions
        staleTime: orderBy === "popular" ? 1000 * 60 * 10 : 1000 * 60 * 5,
    });

export const userLikedPalettesQueryOptions = (
    page = 1,
    limit = DEFAULT_PAGE_LIMIT,
) =>
    queryOptions({
        queryKey: ["palettes", "liked", page, limit],
        queryFn: async () => {
            const result = await getUserLikedPalettes({ data: { page, limit } });
            return {
                ...result,
                palettes: result.palettes.map(enrichPalette),
            };
        },
        // User's saved palettes - 2 minutes for more responsive feel after likes/unlikes
        staleTime: 1000 * 60 * 2,
    });

export const userLikedSeedsQueryOptions = () =>
    queryOptions({
        queryKey: ["user-liked-seeds"],
        queryFn: async () => {
            try {
                const result = await getUserLikedSeeds({ data: undefined });
                return new Set(result.seeds);
            } catch (error) {
                return new Set<string>();
            }
        },
        // User's liked seeds - used for heart icons UI state
        // 2 minutes for responsive feel, but optimistic updates handle immediate feedback
        staleTime: 1000 * 60 * 2,
        retry: false,
    });

export const paletteLikeInfoQueryOptions = (seed: string) =>
    queryOptions({
        queryKey: ["palette-like-info", seed],
        queryFn: async () => {
            const result = await getPaletteLikeInfo({ data: { seed } });
            return result;
        },
        // Like count for individual palette - 5 minutes is fine
        // Optimistic updates handle immediate feedback for current user's like status
        staleTime: 1000 * 60 * 5,
    });

export type SearchResultPalette = AppPalette & {
    tags: string[];
    score: number;
};

export const searchPalettesQueryOptions = (query: string, limit = DEFAULT_PAGE_LIMIT) =>
    queryOptions({
        queryKey: ["palettes", "search", query, limit],
        queryFn: async () => {
            if (!query.trim()) {
                return { results: [] as SearchResultPalette[] };
            }
            const result = await searchPalettes({ data: { query, limit } });
            return {
                results: result.results.map((r) => {
                    const { coeffs, globals } = deserializeCoeffs(r.seed);
                    const hexColors = generateHexColors(coeffs, globals, r.steps);
                    return {
                        seed: r.seed,
                        style: r.style,
                        steps: r.steps,
                        angle: r.angle,
                        createdAt: new Date(r.createdAt as number),
                        coeffs,
                        globals,
                        hexColors,
                        likesCount: r.likesCount,
                        tags: r.tags,
                        score: r.score,
                    };
                }),
            };
        },
        enabled: !!query.trim(),
        staleTime: 1000 * 60 * 5,
    });

