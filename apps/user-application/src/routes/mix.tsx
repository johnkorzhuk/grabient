import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";

export const Route = createFileRoute("/mix")({
    component: MixPage,
});

function MixPage() {
    return (
        <AppLayout showNavigation={false}>
            <div className="px-5 lg:px-14 py-8">
                <h1 className="text-3xl md:text-4xl font-bold text-foreground">
                    Mix
                </h1>
            </div>
        </AppLayout>
    );
}
