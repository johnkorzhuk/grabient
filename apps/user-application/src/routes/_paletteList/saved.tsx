import {
    createFileRoute,
    redirect,
} from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { userLikedPalettesQueryOptions, userLikedSeedsQueryOptions } from "@/queries/palettes";
import { sessionQueryOptions } from "@/queries/auth";
import { PalettesGrid } from "@/components/palettes/palettes-grid";
import { PalettesPagination } from "@/components/palettes/palettes-pagination";
import { AppLayout } from "@/components/layout/AppLayout";
import { setActivePaletteId, setPreviousRoute } from "@/stores/ui";
import { UndoButton } from "@/components/navigation/UndoButton";
import { DEFAULT_PAGE_LIMIT } from "@repo/data-ops/valibot-schema/grabient";

export const Route = createFileRoute("/_paletteList/saved")({
    beforeLoad: async ({ context }) => {
        setActivePaletteId(null);

        try {
            const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
            if (!session?.user) {
                throw redirect({
                    to: "/login",
                    search: {
                        redirect: "/saved",
                    },
                });
            }
        } catch (error) {
            throw redirect({
                to: "/login",
                search: {
                    redirect: "/saved",
                },
            });
        }
    },
    loaderDeps: ({ search }) => ({
        page: search.page,
        limit: search.limit,
    }),
    loader: async ({ context, deps }) => {
        try {
            await context.queryClient.ensureQueryData(
                userLikedPalettesQueryOptions(
                    deps.page,
                    deps.limit,
                ),
            );
        } catch (error) {
            if (error instanceof Error && 'status' in error && (error as any).status === 401) {
                throw redirect({
                    to: "/login",
                    search: {
                        redirect: "/saved",
                    },
                });
            }
            throw error;
        }
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
        setPreviousRoute({ path: "/saved", search: searchParams });
    },
    component: SavedPalettesPage,
});

function SavedPalettesPage() {
    const { page, limit, style, angle, steps } = Route.useSearch();
    const { data } = useSuspenseQuery(
        userLikedPalettesQueryOptions(page, limit),
    );
    const { data: likedSeeds } = useSuspenseQuery(
        userLikedSeedsQueryOptions(),
    );

    return (
        <AppLayout style={style} angle={angle} steps={steps} leftAction={<UndoButton />}>
            {data.palettes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                    <p className="text-muted-foreground text-lg">
                        You haven't saved any palettes yet
                    </p>
                </div>
            ) : (
                <>
                    <PalettesGrid
                        palettes={data.palettes}
                        likedSeeds={likedSeeds}
                        showRgbTabs={false}
                        urlStyle={style}
                        urlAngle={angle}
                        urlSteps={steps}
                    />
                    <PalettesPagination
                        currentPage={page}
                        totalPages={data.totalPages}
                        limit={limit}
                    />
                </>
            )}
        </AppLayout>
    );
}
