import { useStore } from "@tanstack/react-store";
import { exportStore } from "@/stores/export";
import { SelectedButton } from "./SelectedButton";
import { useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { ExportActions } from "./ExportActions";
import { MixButton } from "./MixButton";
import { useMounted } from "@mantine/hooks";

interface SelectedButtonContainerProps {
    className?: string;
}

export function SelectedButtonContainer({
    className,
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
            {hasSelectedItems && (
                <>
                    {isExportOpen ? (
                        <ExportActions />
                    ) : (
                        <MixButton />
                    )}
                    <SelectedButton />
                </>
            )}
        </div>
    );
}
