import { cn } from "@/lib/utils";
import { useStore } from "@tanstack/react-store";
import { exportStore } from "@/stores/export";
import { useLocation, useRouter, useRouterState } from "@tanstack/react-router";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowRightFromLine, X } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { useMounted } from "@mantine/hooks";

interface SelectedButtonProps {
    className?: string;
}

export function SelectedButton({ className }: SelectedButtonProps) {
    const mounted = useMounted();
    const exportList = useStore(exportStore, (state) => state.exportList);
    const router = useRouter();
    const location = useLocation();
    const routerState = useRouterState();
    const isExportOpen = (routerState.location.search as { export?: boolean }).export === true;

    // Only show count after mount to avoid hydration mismatch
    const exportCount = mounted ? exportList.length : 0;

    const handleClick = () => {
        router.navigate({
            to: location.pathname,
            search: (prev) => ({ ...prev, export: !isExportOpen }),
            resetScroll: false,
            replace: true,
        });
    };

    return (
        <div className={cn("flex items-center gap-2", className)}>
            <TooltipProvider>
                <Tooltip delayDuration={500}>
                    <TooltipTrigger asChild>
                        <button
                            aria-label={isExportOpen ? "Close export panel" : "Export selected palettes"}
                            onClick={handleClick}
                            className={cn(
                                "disable-animation-on-theme-change",
                                "inline-flex items-center justify-center gap-1.5 rounded-md",
                                "h-8 px-2.5 border border-solid border-transparent",
                                "transition-colors duration-200 cursor-pointer",
                                "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                "font-medium text-xs",
                                "bg-foreground/80 text-background hover:bg-foreground/90",
                            )}
                        >
                            {isExportOpen ? (
                                <>
                                    <span>Close</span>
                                    <X className="w-3.5 h-3.5" strokeWidth={2.5} />
                                </>
                            ) : (
                                <>
                                    <span>Export</span>
                                    <ArrowRightFromLine className="w-3.5 h-3.5" strokeWidth={2.5} />
                                </>
                            )}
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="end" sideOffset={6}>
                        <span>{isExportOpen ? "Close export panel" : `Export ${exportCount} selected`}</span>
                        {isExportOpen && <Kbd className="ml-1.5">Esc</Kbd>}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
    );
}
