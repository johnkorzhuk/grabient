import { useState, useEffect, useRef } from "react";
import { useStore } from "@tanstack/react-store";
import { Copy, Download, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
    DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { exportStore } from "@/stores/export";
import { useDimensions } from "@/hooks/useDimensions";
import {
    usePNGGridCache,
    useCopyPNGGrid,
    useDownloadPNGGrid,
} from "@/hooks/usePNGGridCache";
import { downloadSVGGrid, copySVGGridToClipboard } from "@/lib/generateSVGGrid";

export function ExportActions() {
    const exportList = useStore(exportStore, (state) => state.exportList);
    const gap = useStore(exportStore, (state) => state.gap);
    const borderRadius = useStore(exportStore, (state) => state.borderRadius);
    const columns = useStore(exportStore, (state) => state.columns);
    const { actualWidth, actualHeight } = useDimensions();
    const [actionType, setActionType] = useState<
        | "none"
        | "svg-download"
        | "png-download"
        | "svg-copy"
        | "png-copy"
        | "data-copy"
    >("none");
    const [showSuccess, setShowSuccess] = useState(false);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const pngGridOptions =
        exportList.length > 0
            ? {
                  exportList,
                  itemWidth: actualWidth,
                  itemHeight: actualHeight,
                  gap,
                  borderRadius,
                  columns,
              }
            : null;

    const {
        data: pngBlob,
        isFetching: isPngGenerating,
        refetch: refetchPng,
    } = usePNGGridCache(pngGridOptions);
    const { mutateAsync: copyPngToClipboard, isPending: isCopyingPng } =
        useCopyPNGGrid();
    const { mutateAsync: downloadPng, isPending: isDownloadingPng } =
        useDownloadPNGGrid();

    const isPngLoading = isPngGenerating || isCopyingPng || isDownloadingPng;

    useEffect(() => {
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (showSuccess && actionType !== "png-copy" && actionType !== "data-copy") {
            const timer = setTimeout(() => {
                setShowSuccess(false);
                setActionType("none");
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [showSuccess, actionType]);

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
            }, 1000);
        } catch (error) {
            console.error("Failed to copy data:", error);
            setActionType("none");
        }
    };

    const handleCopySvg = async () => {
        setActionType("svg-copy");
        try {
            await copySVGGridToClipboard({
                exportList,
                itemWidth: actualWidth,
                itemHeight: actualHeight,
                gap,
                borderRadius,
                columns,
            });
            setShowSuccess(true);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                setShowSuccess(false);
                setActionType("none");
            }, 1000);
        } catch (error) {
            console.error("Failed to copy SVG:", error);
            setActionType("none");
        }
    };

    const handleCopyPng = async () => {
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
            }, 1000);
        } catch (error) {
            console.error("Failed to copy PNG:", error);
            setActionType("none");
        }
    };

    const handleDownloadSvg = () => {
        setActionType("svg-download");
        try {
            downloadSVGGrid({
                exportList,
                itemWidth: actualWidth,
                itemHeight: actualHeight,
                gap,
                borderRadius,
                columns,
            });
            setShowSuccess(true);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                setShowSuccess(false);
                setActionType("none");
            }, 1000);
        } catch (error) {
            console.error("Failed to download SVG:", error);
            setActionType("none");
        }
    };

    const handleDownloadPng = async () => {
        if (isPngLoading) return;

        setActionType("png-download");
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
                setShowSuccess(false);
                setActionType("none");
            }, 1000);
        } catch (error) {
            console.error("Failed to download PNG:", error);
            setActionType("none");
        }
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        aria-label="Copy options"
                        style={{ backgroundColor: "var(--background)" }}
                        className={cn(
                            "disable-animation-on-theme-change",
                            "inline-flex items-center justify-center gap-1.5 rounded-md",
                            "h-8 px-2.5 border border-solid",
                            "transition-colors duration-200 cursor-pointer",
                            "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                            "border-input text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground hover:bg-background/60",
                            "data-[state=open]:border-muted-foreground/30 data-[state=open]:text-foreground",
                        )}
                    >
                        <span className="text-xs font-medium">Copy</span>
                        <Copy className="w-3.5 h-3.5" strokeWidth={2.5} />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="end"
                    sideOffset={8}
                    className="p-1.5 min-w-[7.5rem] disable-animation-on-theme-change bg-background/80 backdrop-blur-sm border border-solid border-input rounded-md"
                >
                    <DropdownMenuItem
                        onSelect={(e) => {
                            e.preventDefault();
                            handleDataCopy();
                        }}
                        className="cursor-pointer h-8 text-foreground/80 hover:text-foreground transition-colors duration-200 hover:bg-[var(--background)] focus:bg-[var(--background)] focus:text-foreground px-3 font-medium text-sm justify-between"
                    >
                        <span>{actionType === "data-copy" && showSuccess ? "Copied!" : "Data"}</span>
                        <span className="w-4">
                            {actionType === "data-copy" && showSuccess && (
                                <Check className="h-4 w-4" />
                            )}
                        </span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onSelect={(e) => {
                            e.preventDefault();
                            handleCopySvg();
                        }}
                        className="cursor-pointer h-8 text-foreground/80 hover:text-foreground transition-colors duration-200 hover:bg-[var(--background)] focus:bg-[var(--background)] focus:text-foreground px-3 font-medium text-sm justify-between"
                    >
                        <span>{actionType === "svg-copy" && showSuccess ? "Copied!" : "SVG"}</span>
                        <span className="w-4">
                            {actionType === "svg-copy" && showSuccess && (
                                <Check className="h-4 w-4" />
                            )}
                        </span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onSelect={(e) => {
                            e.preventDefault();
                            handleCopyPng();
                        }}
                        disabled={isCopyingPng || (isPngGenerating && !pngBlob)}
                        className={cn(
                            "cursor-pointer h-8 text-foreground/80 hover:text-foreground transition-colors duration-200 hover:bg-[var(--background)] focus:bg-[var(--background)] focus:text-foreground px-3 font-medium text-sm justify-between",
                            (isCopyingPng || (isPngGenerating && !pngBlob)) && "opacity-50 cursor-not-allowed",
                        )}
                    >
                        <span>{actionType === "png-copy" && showSuccess ? "Copied!" : "PNG"}</span>
                        <span className="w-4">
                            {!pngBlob && isPngGenerating ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                actionType === "png-copy" && showSuccess && (
                                    <Check className="h-4 w-4" />
                                )
                            )}
                        </span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        aria-label="Download options"
                        style={{ backgroundColor: "var(--background)" }}
                        className={cn(
                            "disable-animation-on-theme-change",
                            "inline-flex items-center justify-center gap-1.5 rounded-md",
                            "h-8 px-2.5 border border-solid",
                            "transition-colors duration-200 cursor-pointer",
                            "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                            "border-input text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground hover:bg-background/60",
                            "data-[state=open]:border-muted-foreground/30 data-[state=open]:text-foreground",
                        )}
                    >
                        <span className="text-xs font-medium">Download</span>
                        <Download className="w-3.5 h-3.5" strokeWidth={2.5} />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="end"
                    sideOffset={8}
                    className="p-1.5 min-w-[6.5rem] disable-animation-on-theme-change bg-background/80 backdrop-blur-sm border border-solid border-input rounded-md"
                >
                    <DropdownMenuItem
                        onSelect={(e) => {
                            e.preventDefault();
                            handleDownloadSvg();
                        }}
                        className="cursor-pointer h-8 text-foreground/80 hover:text-foreground transition-colors duration-200 hover:bg-[var(--background)] focus:bg-[var(--background)] focus:text-foreground px-3 font-medium text-sm justify-between"
                    >
                        <span>{actionType === "svg-download" && showSuccess ? "Done!" : "SVG"}</span>
                        <span className="w-4">
                            {actionType === "svg-download" && showSuccess && (
                                <Check className="h-4 w-4" />
                            )}
                        </span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onSelect={(e) => {
                            e.preventDefault();
                            handleDownloadPng();
                        }}
                        disabled={isDownloadingPng || (isPngGenerating && !pngBlob)}
                        className={cn(
                            "cursor-pointer h-8 text-foreground/80 hover:text-foreground transition-colors duration-200 hover:bg-[var(--background)] focus:bg-[var(--background)] focus:text-foreground px-3 font-medium text-sm justify-between",
                            (isDownloadingPng || (isPngGenerating && !pngBlob)) && "opacity-50 cursor-not-allowed",
                        )}
                    >
                        <span>{actionType === "png-download" && showSuccess ? "Done!" : "PNG"}</span>
                        <span className="w-4">
                            {!pngBlob && isPngGenerating ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                actionType === "png-download" && showSuccess && (
                                    <Check className="h-4 w-4" />
                                )
                            )}
                        </span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </>
    );
}
