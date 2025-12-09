import {
    createFileRoute,
    Outlet,
    stripSearchParams,
    useLocation,
    redirect,
} from "@tanstack/react-router";
import {
    setActivePaletteId,
    setIsAdvancedOpen,
    setNavSelect,
} from "@/stores/ui";
import { userLikedSeedsQueryOptions } from "@/queries/palettes";
import * as v from "valibot";
import {
    styleWithAutoValidator,
    angleWithAutoValidator,
    stepsWithAutoValidator,
    sizeWithAutoValidator,
} from "@repo/data-ops/valibot-schema/grabient";
import { useEffect } from "react";
import type { SizeType } from "@/stores/export";
import { DEFAULT_PAGE_LIMIT } from "@/lib/constants";

const SEARCH_DEFAULTS = {
    style: "auto" as const,
    angle: "auto" as const,
    steps: "auto" as const,
    page: 1,
    limit: DEFAULT_PAGE_LIMIT,
    size: "auto" as SizeType,
    redirect: undefined as string | undefined,
};

const searchValidatorSchema = v.object({
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
    page: v.optional(
        v.fallback(v.pipe(v.number(), v.minValue(1)), SEARCH_DEFAULTS.page),
        SEARCH_DEFAULTS.page,
    ),
    limit: v.optional(
        v.fallback(
            v.pipe(v.number(), v.minValue(1), v.maxValue(100)),
            SEARCH_DEFAULTS.limit,
        ),
        SEARCH_DEFAULTS.limit,
    ),
    size: v.optional(
        v.fallback(sizeWithAutoValidator, SEARCH_DEFAULTS.size),
        SEARCH_DEFAULTS.size,
    ),
    redirect: v.optional(v.string()),
});

export const Route = createFileRoute("/_paletteList")({
    validateSearch: searchValidatorSchema,
    search: {
        middlewares: [stripSearchParams(SEARCH_DEFAULTS)],
    },
    beforeLoad: ({ search }) => {
        if (search.redirect) {
            throw redirect({
                to: ".",
                search: (prev) => {
                    const { redirect: _, ...rest } = prev;
                    return rest;
                },
                replace: true,
            });
        }
    },
    loader: async ({ context }) => {
        await context.queryClient.ensureQueryData(userLikedSeedsQueryOptions());
    },
    headers: () => {
        return {
            // Browser: Cache for 5 minutes, allow stale for 10 minutes while revalidating
            "cache-control": "public, max-age=300, stale-while-revalidate=600",
            // Cloudflare CDN: Cache for 30 minutes, stale-while-revalidate for 1 hour
            "cdn-cache-control": "max-age=1800, stale-while-revalidate=3600",
        };
    },
    onLeave: () => {
        setActivePaletteId(null);
        setIsAdvancedOpen(false);
    },
    component: LayoutComponent,
});

function LayoutComponent() {
    const location = useLocation();

    useEffect(() => {
        // Only set navSelect for valid palette list routes
        const validRoutes = ["/", "/newest", "/oldest", "/saved"];
        if (validRoutes.includes(location.pathname)) {
            setNavSelect(location.pathname);
        }
    }, [location.pathname]);

    return <Outlet />;
}
