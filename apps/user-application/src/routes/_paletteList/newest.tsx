import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import {
    palettesQueryOptions,
    userLikedSeedsQueryOptions,
} from "@/queries/palettes";
import { PalettesGrid } from "@/components/palettes/palettes-grid";
import { PalettesPagination } from "@/components/palettes/palettes-pagination";
import { AppLayout } from "@/components/layout/AppLayout";
import { SelectedButtonContainer } from "@/components/palettes/SelectedButtonContainer";
import { setPreviousRoute } from "@/stores/ui";
import { exportStore } from "@/stores/export";
import { DEFAULT_PAGE_LIMIT } from "@repo/data-ops/valibot-schema/grabient";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_paletteList/newest")({
    loaderDeps: ({ search }) => ({
        page: search.page,
        limit: search.limit,
    }),
    loader: async ({ context, deps }) => {
        await context.queryClient.ensureQueryData(
            palettesQueryOptions("newest", deps.page, deps.limit),
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
        setPreviousRoute({ path: "/newest", search: searchParams });
    },
    component: NewestPage,
});

function NewestPage() {
    const search = Route.useSearch();
    const { page, limit, style, angle, steps } = search;
    const isExportOpen = search.export === true;
    const exportList = useStore(exportStore, (state) => state.exportList);
    const showExportUI = isExportOpen && exportList.length > 0;
    const { data } = useSuspenseQuery(
        palettesQueryOptions("newest", page, limit),
    );
    const { data: likedSeeds } = useSuspenseQuery(
        userLikedSeedsQueryOptions(),
    );

    return (
        <AppLayout style={style} angle={angle} steps={steps} isExportOpen={showExportUI}>
            <div className={cn("px-5 lg:px-14 mb-10 md:mb-12.5", !isExportOpen && "invisible")}>
                <h1 className="text-3xl md:text-4xl font-bold text-foreground">
                    {exportList.length} {exportList.length === 1 ? "item" : "items"} selected
                </h1>
            </div>
            <SelectedButtonContainer className="-mt-[72px] md:-mt-[84px]" />
            <PalettesGrid palettes={data.palettes} likedSeeds={likedSeeds} urlStyle={style} urlAngle={angle} urlSteps={steps} isExportOpen={isExportOpen} />
            {!showExportUI && (
                <PalettesPagination
                    currentPage={page}
                    totalPages={data.totalPages}
                    limit={limit}
                />
            )}
        </AppLayout>
    );
}
