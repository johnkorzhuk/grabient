import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
    palettesQueryOptions,
    userLikedSeedsQueryOptions,
} from "@/queries/palettes";
import { PalettesGrid } from "@/components/palettes/palettes-grid";
import { PalettesPagination } from "@/components/palettes/palettes-pagination";
import { AppLayout } from "@/components/layout/AppLayout";
import { setActivePaletteId } from "@/stores/ui";

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
