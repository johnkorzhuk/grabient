import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
    palettesQueryOptions,
    userLikedSeedsQueryOptions,
} from "@/queries/palettes";
import { PalettesGrid } from "@/components/palettes/palettes-grid";
import { PalettesPagination } from "@/components/palettes/palettes-pagination";
import { AppLayout } from "@/components/layout/AppLayout";
import { setActivePaletteId, setPreviousRouteHref } from "@/stores/ui";
import { DEFAULT_PAGE_LIMIT } from "@/lib/constants";

export const Route = createFileRoute("/_paletteList/oldest")({
    beforeLoad: () => {
        setActivePaletteId(null);
    },
    loaderDeps: ({ search }) => ({
        page: search.page,
        limit: search.limit,
    }),
    loader: async ({ context, deps }) => {
        await context.queryClient.ensureQueryData(
            palettesQueryOptions("oldest", deps.page, deps.limit),
        );
    },
    onLeave: (match) => {
        const searchParams = new URLSearchParams();
        const search = match.search;
        if (search.style && search.style !== "auto") searchParams.set("style", search.style);
        if (search.angle && search.angle !== "auto") searchParams.set("angle", String(search.angle));
        if (search.steps && search.steps !== "auto") searchParams.set("steps", String(search.steps));
        if (search.page && search.page !== 1) searchParams.set("page", String(search.page));
        if (search.limit && search.limit !== DEFAULT_PAGE_LIMIT) searchParams.set("limit", String(search.limit));
        const searchString = searchParams.toString();
        const href = searchString ? `/oldest?${searchString}` : "/oldest";
        setPreviousRouteHref(href);
    },
    component: OldestPage,
});

function OldestPage() {
    const { page, limit, style, angle, steps } = Route.useSearch();
    const { data } = useSuspenseQuery(
        palettesQueryOptions("oldest", page, limit),
    );
    const { data: likedSeeds } = useSuspenseQuery(
        userLikedSeedsQueryOptions(),
    );

    return (
        <AppLayout style={style} angle={angle} steps={steps}>
            <PalettesGrid palettes={data.palettes} likedSeeds={likedSeeds} urlStyle={style} urlAngle={angle} urlSteps={steps} />
            <PalettesPagination
                currentPage={page}
                totalPages={data.totalPages}
                limit={limit}
            />
        </AppLayout>
    );
}
