import { useStore } from "@tanstack/react-store";
import { exportStore } from "@/stores/export";
import { SelectedButton } from "./SelectedButton";
import { useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

interface SelectedButtonContainerProps {
    className?: string;
}

export function SelectedButtonContainer({ className }: SelectedButtonContainerProps) {
    const exportList = useStore(exportStore, (state) => state.exportList);
    const routerState = useRouterState();
    const isExportOpen = (routerState.location.search as { export?: boolean }).export === true;
    const hasSelectedItems = exportList.length > 0;

    // Don't render if no items selected
    if (!hasSelectedItems) {
        return null;
    }

    return (
        <div className={cn(
            "px-5 lg:px-14 flex justify-end mb-10 md:mb-12",
            isExportOpen && "sticky top-[135px] lg:top-[151px] z-50",
            className
        )}>
            <SelectedButton />
        </div>
    );
}
