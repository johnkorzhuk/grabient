import { useStore } from "@tanstack/react-store";
import { exportStore } from "@/stores/export";
import { SelectedButton } from "./SelectedButton";
import { useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { ExportActions } from "./ExportActions";
import { MixButton } from "./MixButton";
import { RefineButton } from "./RefineButton";
import { useMounted } from "@mantine/hooks";
import type { RefineResult } from "@/server-functions/refine";
import type { ReferenceExample } from "@/lib/palette-gen/prompts";

interface RefineState {
    isRefining: boolean;
    hasResults: boolean;
    limit: number;
    referenceExamples: ReferenceExample[];
    likedSeeds: string[];
    dislikedSeeds: string[];
    hasFeedback: boolean;
    canGiveFeedback: boolean;
    iterationCount: number;
    maxIterations: number;
    onRefineStart: (isUpdate: boolean) => void;
    onRefineProgress: (approved: number, currentTool?: string) => void;
    onRefineComplete: (result: RefineResult) => void;
    onRefineError: (error: string) => void;
    onRefineClear: () => void;
}

interface SelectedButtonContainerProps {
    className?: string;
    searchQuery?: string;
    refineState?: RefineState;
}

export function SelectedButtonContainer({
    className,
    searchQuery,
    refineState,
}: SelectedButtonContainerProps) {
    const mounted = useMounted();
    const exportList = useStore(exportStore, (state) => state.exportList);
    const routerState = useRouterState();
    const isExportOpen =
        (routerState.location.search as { export?: boolean }).export === true;
    // Only check for selected items after mount to avoid hydration mismatch
    const hasSelectedItems = mounted && exportList.length > 0;

    // Always render the container with fixed height to prevent layout shift
    // This ensures the negative margin positioning works consistently
    return (
        <div
            className={cn(
                "px-5 lg:px-14 flex justify-end mb-10 md:mb-12 gap-2 h-8",
                isExportOpen && "sticky top-[135px] lg:top-[151px] z-50",
                // Hide on mobile when export is open (close button is in drawer)
                isExportOpen && "hidden md:flex",
                className,
            )}
        >
            {!isExportOpen && searchQuery && refineState && (
                <RefineButton
                    query={searchQuery}
                    limit={refineState.limit}
                    isRefining={refineState.isRefining}
                    hasResults={refineState.hasResults}
                    referenceExamples={refineState.referenceExamples}
                    likedSeeds={refineState.likedSeeds}
                    dislikedSeeds={refineState.dislikedSeeds}
                    hasFeedback={refineState.hasFeedback}
                    canGiveFeedback={refineState.canGiveFeedback}
                    iterationCount={refineState.iterationCount}
                    maxIterations={refineState.maxIterations}
                    onRefineStart={refineState.onRefineStart}
                    onRefineProgress={refineState.onRefineProgress}
                    onRefineComplete={refineState.onRefineComplete}
                    onRefineError={refineState.onRefineError}
                    onRefineClear={refineState.onRefineClear}
                />
            )}
            {hasSelectedItems && (
                <>
                    {isExportOpen ? (
                        <ExportActions />
                    ) : (
                        import.meta.env.DEV && <MixButton />
                    )}
                    <SelectedButton />
                </>
            )}
        </div>
    );
}
