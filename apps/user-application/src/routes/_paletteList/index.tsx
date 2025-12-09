import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
    palettesQueryOptions,
    userLikedSeedsQueryOptions,
} from "@/queries/palettes";
import { PalettesGrid } from "@/components/palettes/palettes-grid";
import { PalettesPagination } from "@/components/palettes/palettes-pagination";
import { AppLayout } from "@/components/layout/AppLayout";
import { setActivePaletteId, setPreviousRoute } from "@/stores/ui";
import { DEFAULT_PAGE_LIMIT } from "@/lib/constants";

export const Route = createFileRoute("/_paletteList/")({
    beforeLoad: () => {
        setActivePaletteId(null);
    },
    loaderDeps: ({ search }) => ({
        page: search.page,
        limit: search.limit,
    }),
    loader: async ({ context, deps }) => {
        await context.queryClient.ensureQueryData(
            palettesQueryOptions("popular", deps.page, deps.limit),
        );
    },
    onLeave: (match) => {
        const search = match.search;
        const searchParams: Record<string, unknown> = {};
        if (search.style !== "auto") searchParams.style = search.style;
        if (search.angle !== "auto") searchParams.angle = search.angle;
        if (search.steps !== "auto") searchParams.steps = search.steps;
        if (search.size !== "auto") searchParams.size = search.size;
        if (search.page !== 1) searchParams.page = search.page;
        if (search.limit !== DEFAULT_PAGE_LIMIT) searchParams.limit = search.limit;
        setPreviousRoute({ path: "/", search: searchParams });
    },
    component: HomePage,
});

function HomePage() {
    const { page, limit, style, angle, steps } = Route.useSearch();
    const { data } = useSuspenseQuery(
        palettesQueryOptions("popular", page, limit),
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
