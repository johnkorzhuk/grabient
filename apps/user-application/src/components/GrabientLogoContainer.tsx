import { GrabientLogo } from "./GrabientLogo";
import { useLocation, useParams, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { palettesQueryOptions, searchPalettesQueryOptions } from "@/queries/palettes";
import { deserializeCoeffs, isValidSeed } from "@repo/data-ops/serialization";
import { generateHexColors } from "@/lib/paletteUtils";
import {
    DEFAULT_STYLE,
    DEFAULT_ANGLE,
    DEFAULT_STEPS,
    DEFAULT_PAGE_LIMIT,
} from "@repo/data-ops/valibot-schema/grabient";
import type { AppPalette } from "@/queries/palettes";
import { useStore } from "@tanstack/react-store";
import { uiStore } from "@/stores/ui";

interface GrabientLogoContainerProps {
    className?: string;
}

type OrderBy = "popular" | "newest" | "oldest";

function getOrderByFromPath(pathname: string): OrderBy {
    if (pathname === "/newest") return "newest";
    if (pathname === "/oldest") return "oldest";
    return "popular";
}

function findPaletteInCache(
    queryClient: ReturnType<typeof useQueryClient>,
    seed: string,
): AppPalette | undefined {
    const cache = queryClient.getQueryCache();
    const queries = cache.findAll({ queryKey: ["palettes"] });

    for (const query of queries) {
        const data = query.state.data as any;
        if (data?.palettes) {
            const palette = data.palettes.find((p: AppPalette) => p.seed === seed);
            if (palette) return palette;
        }
    }

    return undefined;
}

function getSearchQuery(param: string): string | null {
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

function usePalettes(): AppPalette[] {
    const location = useLocation();
    const params = useParams({ strict: false });
    const search = useSearch({ strict: false });
    const livePaletteData = useStore(uiStore, (state) => state.livePaletteData);

    const isSeedRoute = "seed" in params && typeof params.seed === "string";
    const isSearchRoute = location.pathname.startsWith("/palettes/") && "query" in params && typeof params.query === "string";

    const searchQuery = isSearchRoute ? getSearchQuery(params.query as string) : null;

    const { data: searchData } = useQuery({
        ...searchPalettesQueryOptions(searchQuery ?? "", DEFAULT_PAGE_LIMIT),
        enabled: isSearchRoute && !!searchQuery,
    });

    const orderBy = getOrderByFromPath(location.pathname);
    const rawSearch = search as { page?: number; limit?: number };
    const page = rawSearch.page ?? 1;
    const limit = rawSearch.limit ?? DEFAULT_PAGE_LIMIT;
    const { data: palettesData } = useQuery({
        ...palettesQueryOptions(orderBy, page, limit),
        enabled: !isSeedRoute && !isSearchRoute,
    });

    if (isSeedRoute && params.seed) {
        const { coeffs: urlCoeffs, globals: urlGlobals } = deserializeCoeffs(
            params.seed,
        );

        const coeffs = livePaletteData?.coeffs ?? urlCoeffs;
        const globals = livePaletteData?.globals ?? urlGlobals;

        const rawSearch = search;
        const rawStyle = rawSearch.style;
        const rawAngle = rawSearch.angle;
        const rawSteps = rawSearch.steps;

        const style =
            rawStyle === "auto" || typeof rawStyle !== "string"
                ? DEFAULT_STYLE
                : (rawStyle as AppPalette["style"]);
        const angle =
            rawAngle === "auto" || typeof rawAngle !== "number"
                ? DEFAULT_ANGLE
                : rawAngle;
        const steps =
            rawSteps === "auto" || typeof rawSteps !== "number"
                ? DEFAULT_STEPS
                : rawSteps;

        const hexColors = generateHexColors(coeffs, globals, steps);

        return [
            {
                seed: params.seed,
                coeffs,
                globals,
                hexColors,
                style,
                angle,
                steps,
                createdAt: new Date(),
                likesCount: 0,
            },
        ];
    }

    if (isSearchRoute) {
        return searchData?.results ?? [];
    }

    return palettesData?.palettes ?? [];
}

export function GrabientLogoContainer({
    className,
}: GrabientLogoContainerProps) {
    const palettes = usePalettes();
    const queryClient = useQueryClient();
    const activePaletteSeed = useStore(uiStore, (state) => state.activePaletteSeed);

    let allPalettes = palettes;

    if (activePaletteSeed && palettes.length > 1) {
        const paletteInCurrentList = palettes.find(p => p.seed === activePaletteSeed);

        if (!paletteInCurrentList) {
            const paletteFromCache = findPaletteInCache(queryClient, activePaletteSeed);
            if (paletteFromCache) {
                allPalettes = [...palettes, paletteFromCache];
            }
        }
    }

    return <GrabientLogo className={className} palettes={allPalettes} />;
}
