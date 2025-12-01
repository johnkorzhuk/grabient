import {
    X,
    ArrowRightFromLine,
    Check,
    Loader2,
    ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@tanstack/react-store";
import { exportStore, clearExportList } from "@/stores/export";
import { useDimensions } from "@/hooks/useDimensions";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Command,
    CommandGroup,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { useState, useEffect, useRef } from "react";
import { DevicePresets } from "./device-presets";
import {
    usePNGGridCache,
    useCopyPNGGrid,
    useDownloadPNGGrid,
} from "@/hooks/usePNGGridCache";
import { analytics } from "@/integrations/tracking/events";

interface ExportOptionsProps {
    onSvgExport?: (width: number, height: number) => void;
    onSvgCopy?: (width: number, height: number) => Promise<void>;
    className?: string;
}

export function ExportOptions({
    onSvgExport,
    onSvgCopy,
    className,
}: ExportOptionsProps) {
    const exportList = useStore(exportStore, (state) => state.exportList);
    const { size, actualWidth, actualHeight } = useDimensions();
    const exportCount = exportList.length;
    const [_pngProgress, setPngProgress] = useState(0);
    const [open, setOpen] = useState(false);
    const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
    const [actionType, setActionType] = useState<
        | "none"
        | "svg-export"
        | "png-export"
        | "svg-copy"
        | "png-copy"
        | "data-copy"
    >("none");
    const [showSuccess, setShowSuccess] = useState(false);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const closeTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isTouchDevice = useRef(false);

    const pngGridOptions =
        exportList.length > 0
            ? {
                  exportList,
                  itemWidth: actualWidth,
                  itemHeight: actualHeight,
              }
            : null;

    const {
        data: pngBlob,
        isFetching: isPngGenerating,
        refetch: refetchPng,
    } = usePNGGridCache(pngGridOptions, (progress) => setPngProgress(progress));
    const { mutateAsync: copyPngToClipboard, isPending: isCopyingPng } =
        useCopyPNGGrid();
    const { mutateAsync: downloadPng, isPending: isDownloadingPng } =
        useDownloadPNGGrid();

    const isPngLoading = isPngGenerating || isCopyingPng || isDownloadingPng;

    const handleSvgDownload = () => {
        if (onSvgExport) {
            onSvgExport(actualWidth, actualHeight);
            setActionType("svg-export");
            setShowSuccess(true);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                document.body.click();
            }, 300);

            analytics.download.svgGrid({
                exportCount,
                width: actualWidth,
                height: actualHeight,
            });
        }
    };

    const handlePngDownload = async () => {
        if (isPngLoading) return;

        setActionType("png-export");
        try {
            let blob = pngBlob;

            if (!blob) {
                const result = await refetchPng();
                if (!result.data) {
                    console.error("Failed to generate PNG");
                    setActionType("none");
                    return;
                }
                blob = result.data;
            }

            await downloadPng(blob);
            setShowSuccess(true);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                document.body.click();
            }, 300);

            analytics.download.pngGrid({
                exportCount,
                width: actualWidth,
                height: actualHeight,
            });
        } catch (error) {
            console.error("Failed to download PNG:", error);
            setActionType("none");
        }
    };

    const handleSvgCopy = async () => {
        if (onSvgCopy) {
            await onSvgCopy(actualWidth, actualHeight);
            setActionType("svg-copy");
            setShowSuccess(true);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                document.body.click();
            }, 300);
        }
    };

    const handlePngCopy = async () => {
        if (isPngLoading) return;

        setActionType("png-copy");
        try {
            let blob = pngBlob;

            if (!blob) {
                const result = await refetchPng();
                if (!result.data) {
                    console.error("Failed to generate PNG");
                    setActionType("none");
                    return;
                }
                blob = result.data;
            }

            await copyPngToClipboard(blob);
            setShowSuccess(true);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                setShowSuccess(false);
                setActionType("none");
                document.body.click();
            }, 1000);

            analytics.grid.copyPng({
                exportCount,
                width: actualWidth,
                height: actualHeight,
            });
        } catch (error) {
            console.error("Failed to copy PNG:", error);
            setActionType("none");
        }
    };

    const handleDataCopy = async () => {
        setActionType("data-copy");
        try {
            const dataWithUrls = exportList.map((item) => {
                const formattedCoeffs = item.coeffs.map((coeff) =>
                    coeff.slice(0, 3).map((value) => Number(value.toFixed(3))),
                );
                return {
                    coeffs: formattedCoeffs,
                    url: `${window.location.origin}/?seed=${item.seed}&style=${item.style}&angle=${item.angle}&steps=${item.steps}`,
                    seed: item.seed,
                    style: item.style,
                    angle: item.angle,
                    steps: item.steps,
                    hexColors: item.hexColors,
                };
            });
            const dataText = JSON.stringify(dataWithUrls, null, 2);
            await navigator.clipboard.writeText(dataText);
            setShowSuccess(true);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                setShowSuccess(false);
                setActionType("none");
                document.body.click();
            }, 1000);
        } catch (error) {
            console.error("Failed to copy data:", error);
            setActionType("none");
        }
    };

    useEffect(() => {
        if (
            showSuccess &&
            actionType !== "png-copy" &&
            actionType !== "data-copy"
        ) {
            const timer = setTimeout(() => {
                setShowSuccess(false);
                setActionType("none");
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [showSuccess, actionType]);

    useEffect(() => {
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            if (closeTimerRef.current) {
                clearTimeout(closeTimerRef.current);
                closeTimerRef.current = null;
            }
        };
    }, []);

    return (
        <div className={cn("relative min-w-[168px]", className)}>
            {/* Top row: Export text on left, X on right */}
            <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-muted-foreground transition-colors duration-200 disable-animation-on-theme-change relative bottom-px">
                    Export {exportCount}{" "}
                    {exportCount === 1 ? "palette" : "palettes"}
                </span>
                <TooltipProvider>
                    <Tooltip delayDuration={500}>
                        <TooltipTrigger asChild>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    clearExportList();
                                }}
                                className="cursor-pointer p-1 rounded hover:bg-muted-foreground/20 text-foreground/80 hover:text-foreground transition-colors duration-200 disable-animation-on-theme-change"
                                aria-label="Clear export list"
                            >
                                <X className="h-4 w-4" strokeWidth={2.5} />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="end" sideOffset={6}>
                            <span>Clear</span>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>

            {/* Bottom row: Device presets on left, Download icon on right */}
            <div className="flex items-center justify-between">
                <DevicePresets size={size} side="left" customAlignOffset={-12} customSideOffset={22} />
                <DropdownMenu onOpenChange={setOpen} modal={false}>
                    <TooltipProvider>
                        <Tooltip
                            delayDuration={500}
                            {...(open && { open: false })}
                        >
                            <TooltipTrigger asChild>
                                <DropdownMenuTrigger asChild>
                                    <button
                                        aria-label="Export options"
                                        style={{
                                            backgroundColor:
                                                "var(--background)",
                                        }}
                                        className={cn(
                                            "disable-animation-on-theme-change",
                                            "inline-flex items-center justify-center rounded-md",
                                            "w-8 h-8 border border-solid",
                                            "transition-colors duration-200 cursor-pointer",
                                            "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                            open
                                                ? "border-muted-foreground/30 bg-background/60 text-foreground"
                                                : "border-input text-muted-foreground hover:border-muted-foreground/30 hover:bg-background/60 hover:text-foreground",
                                        )}
                                    >
                                        <ArrowRightFromLine
                                            className="w-4 h-4"
                                            strokeWidth={2.5}
                                        />
                                    </button>
                                </DropdownMenuTrigger>
                            </TooltipTrigger>
                            <TooltipContent
                                side="bottom"
                                align="end"
                                sideOffset={6}
                            >
                                <span>Export options</span>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                    <DropdownMenuContent
                        align="end"
                        side="top"
                        sideOffset={9}
                        className="p-0 min-w-[150px] disable-animation-on-theme-change bg-background/80 backdrop-blur-sm border-input rounded-md"
                    >
                        <Command className="disable-animation-on-theme-change border-0 rounded-md w-full bg-transparent [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2 [&_[cmdk-item]]:font-system [&_[cmdk-item]]:font-medium [&_[cmdk-item]]:text-sm [&_[cmdk-item][data-selected=true]]:bg-background/60 [&_[cmdk-item][data-selected=true]]:text-foreground [&_[cmdk-item]]:hover:bg-background/60 [&_[cmdk-item]]:hover:text-foreground [&_[cmdk-item]]:text-muted-foreground">
                            <CommandList>
                                <CommandGroup>
                                    <CommandItem
                                        onSelect={handleDataCopy}
                                        className="cursor-pointer relative h-9 min-h-[2.25rem] text-foreground/80 hover:text-foreground hover:bg-background/60 transition-colors duration-200 disable-animation-on-theme-change"
                                    >
                                        <span>
                                            {actionType === "data-copy" &&
                                            showSuccess
                                                ? "Copied!"
                                                : "Copy Data"}
                                        </span>
                                        {actionType === "data-copy" &&
                                            showSuccess && (
                                                <Check className="ml-auto h-4 w-4" />
                                            )}
                                    </CommandItem>
                                    {onSvgCopy && (
                                        <CommandItem
                                            onSelect={handleSvgCopy}
                                            className="cursor-pointer relative h-9 min-h-[2.25rem] text-foreground/80 hover:text-foreground hover:bg-background/60 transition-colors duration-200 disable-animation-on-theme-change"
                                        >
                                            <span>
                                                {actionType === "svg-copy" &&
                                                showSuccess
                                                    ? "Copied!"
                                                    : "Copy SVG"}
                                            </span>
                                            {actionType === "svg-copy" &&
                                                showSuccess && (
                                                    <Check className="ml-auto h-4 w-4" />
                                                )}
                                        </CommandItem>
                                    )}
                                    <CommandItem
                                        onSelect={handlePngCopy}
                                        disabled={
                                            isCopyingPng ||
                                            (isPngGenerating && !pngBlob)
                                        }
                                        className={cn(
                                            "cursor-pointer relative h-9 min-h-[2.25rem] text-foreground/80 hover:text-foreground hover:bg-background/60 transition-colors duration-200 disable-animation-on-theme-change",
                                            (isCopyingPng ||
                                                (isPngGenerating &&
                                                    !pngBlob)) &&
                                                "opacity-50 cursor-not-allowed",
                                        )}
                                    >
                                        <span>
                                            {actionType === "png-copy" &&
                                            showSuccess
                                                ? "Copied!"
                                                : "Copy PNG"}
                                        </span>
                                        {!pngBlob && isPngGenerating ? (
                                            <Loader2 className="ml-auto h-4 w-4 animate-spin" />
                                        ) : (
                                            actionType === "png-copy" &&
                                            showSuccess && (
                                                <Check className="ml-auto h-4 w-4" />
                                            )
                                        )}
                                    </CommandItem>
                                    <div
                                        onMouseLeave={() => {
                                            if (!isTouchDevice.current) {
                                                closeTimerRef.current =
                                                    setTimeout(() => {
                                                        setDownloadMenuOpen(
                                                            false,
                                                        );
                                                    }, 300);
                                            }
                                        }}
                                    >
                                        <DropdownMenu
                                            open={downloadMenuOpen}
                                            onOpenChange={setDownloadMenuOpen}
                                            modal={false}
                                        >
                                            <DropdownMenuTrigger asChild>
                                                <div
                                                    className="cursor-pointer relative h-9 min-h-[2.25rem] text-foreground/80 hover:text-foreground transition-colors duration-200 hover:bg-background/60 focus:bg-background/60 focus:text-foreground px-3 font-system font-medium text-sm data-[state=open]:bg-background/60 data-[state=open]:text-foreground flex items-center rounded-sm outline-hidden select-none group/submenu"
                                                    onPointerDown={(e) => {
                                                        if (
                                                            e.pointerType ===
                                                            "touch"
                                                        ) {
                                                            isTouchDevice.current = true;
                                                            e.preventDefault();
                                                            setDownloadMenuOpen(
                                                                (prev) => !prev,
                                                            );
                                                        }
                                                    }}
                                                    onMouseEnter={() => {
                                                        if (
                                                            !isTouchDevice.current
                                                        ) {
                                                            if (
                                                                closeTimerRef.current
                                                            ) {
                                                                clearTimeout(
                                                                    closeTimerRef.current,
                                                                );
                                                                closeTimerRef.current =
                                                                    null;
                                                            }
                                                            setDownloadMenuOpen(
                                                                true,
                                                            );
                                                        }
                                                    }}
                                                    onClick={(e) => {
                                                        if (
                                                            isTouchDevice.current
                                                        ) {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                        }
                                                    }}
                                                >
                                                    <ChevronLeft
                                                        className={cn(
                                                            "h-4 w-4 transition-all duration-100",
                                                            downloadMenuOpen
                                                                ? "mr-2 opacity-100 animate-in slide-in-from-right-2"
                                                                : "w-0 mr-0 opacity-0",
                                                        )}
                                                    />
                                                    <span>Download</span>
                                                </div>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent
                                                side="left"
                                                align="end"
                                                sideOffset={16}
                                                alignOffset={-6}
                                                className="p-0 min-w-[150px] disable-animation-on-theme-change bg-background/80 backdrop-blur-sm border-input rounded-md"
                                                onMouseEnter={() => {
                                                    if (closeTimerRef.current) {
                                                        clearTimeout(
                                                            closeTimerRef.current,
                                                        );
                                                        closeTimerRef.current =
                                                            null;
                                                    }
                                                    setDownloadMenuOpen(true);
                                                }}
                                            >
                                                <Command className="disable-animation-on-theme-change border-0 rounded-md w-full bg-transparent [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2 [&_[cmdk-item]]:font-system [&_[cmdk-item]]:font-medium [&_[cmdk-item]]:text-sm [&_[cmdk-item][data-selected=true]]:bg-background/60 [&_[cmdk-item][data-selected=true]]:text-foreground [&_[cmdk-item]]:hover:bg-background/60 [&_[cmdk-item]]:hover:text-foreground [&_[cmdk-item]]:text-muted-foreground">
                                                    <CommandList>
                                                        <CommandGroup>
                                                            {onSvgExport && (
                                                                <CommandItem
                                                                    onSelect={
                                                                        handleSvgDownload
                                                                    }
                                                                    className="cursor-pointer relative h-9 min-h-[2.25rem] text-foreground/80 hover:text-foreground hover:bg-background/60 transition-colors duration-200 disable-animation-on-theme-change"
                                                                >
                                                                    <span>
                                                                        {actionType ===
                                                                            "svg-export" &&
                                                                        showSuccess
                                                                            ? "Downloaded!"
                                                                            : "Download SVG"}
                                                                    </span>
                                                                    {actionType ===
                                                                        "svg-export" &&
                                                                        showSuccess && (
                                                                            <Check className="ml-auto h-4 w-4" />
                                                                        )}
                                                                </CommandItem>
                                                            )}
                                                            <CommandItem
                                                                onSelect={
                                                                    handlePngDownload
                                                                }
                                                                disabled={
                                                                    isDownloadingPng ||
                                                                    (isPngGenerating &&
                                                                        !pngBlob)
                                                                }
                                                                className={cn(
                                                                    "cursor-pointer relative h-9 min-h-[2.25rem] text-foreground/80 hover:text-foreground hover:bg-background/60 transition-colors duration-200 disable-animation-on-theme-change",
                                                                    (isDownloadingPng ||
                                                                        (isPngGenerating &&
                                                                            !pngBlob)) &&
                                                                        "opacity-50 cursor-not-allowed",
                                                                )}
                                                            >
                                                                <span>
                                                                    {actionType ===
                                                                        "png-export" &&
                                                                    showSuccess
                                                                        ? "Downloaded!"
                                                                        : "Download PNG"}
                                                                </span>
                                                                {!pngBlob &&
                                                                isPngGenerating ? (
                                                                    <Loader2 className="ml-auto h-4 w-4 animate-spin" />
                                                                ) : (
                                                                    actionType ===
                                                                        "png-export" &&
                                                                    showSuccess && (
                                                                        <Check className="ml-auto h-4 w-4" />
                                                                    )
                                                                )}
                                                            </CommandItem>
                                                        </CommandGroup>
                                                    </CommandList>
                                                </Command>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}
