import { useClipboard } from "@mantine/hooks";
import { Copy, Check, Loader2, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
    DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { usePNGCache, useCopyPNG, useDownloadPNG } from "@/hooks/usePNGCache";
import type { PNGGenerationOptions } from "@/lib/generatePNG";
import { useStore } from "@tanstack/react-store";
import { uiStore, setOpenCopyMenuId } from "@/stores/ui";
import { analytics } from "@/integrations/tracking/events";
import {
    applyGlobals,
    type CosineCoeffs,
    type GlobalModifiers,
} from "@repo/data-ops/gradient-gen/cosine";

interface CopyButtonProps {
    id: string;
    cssString: string;
    svgString: string | undefined;
    gradientData?: CosineCoeffs;
    gradientGlobals?: GlobalModifiers;
    gradientColors?: string[];
    seed?: string;
    style?: string;
    angle?: number;
    steps?: number;
    isActive?: boolean;
    onOpen?: () => void;
    onOpenChange?: (open: boolean) => void;
    pngOptions?: PNGGenerationOptions;
}

export function CopyButton({
    id,
    cssString,
    svgString,
    gradientData,
    gradientGlobals,
    gradientColors,
    seed,
    style,
    angle,
    steps,
    isActive = false,
    onOpen,
    onOpenChange,
    pngOptions,
}: CopyButtonProps) {
    const clipboard = useClipboard({ timeout: 1000 });
    const [copiedType, setCopiedType] = useState<
        "none" | "css" | "svg" | "data" | "colors" | "png" | "seed" | "svg-download" | "png-download"
    >("none");
    const openCopyMenuId = useStore(uiStore, (state) => state.openCopyMenuId);
    const open = openCopyMenuId === id;
    const [dataMenuOpen, setDataMenuOpen] = useState(false);
    const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const closeTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isTouchDevice = useRef(false);

    const {
        data: pngBlob,
        isFetching: isPngGenerating,
        refetch: refetchPng,
    } = usePNGCache(pngOptions ?? null);
    const { mutateAsync: copyToClipboard, isPending: isCopyingPng } =
        useCopyPNG();
    const { mutateAsync: downloadPng, isPending: isDownloadingPng } =
        useDownloadPNG();

    const handleCopyCss = () => {
        clipboard.copy(cssString);
        setCopiedType("css");
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            setCopiedType("none");
        }, 1000);

        if (seed) {
            analytics.copy.css({
                seed,
                style: style as "linearGradient" | "linearSwatches" | "angularSwatches" | undefined,
                angle,
                steps,
            });
        }
    };

    const handleCopySvg = () => {
        clipboard.copy(svgString);
        setCopiedType("svg");
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            setCopiedType("none");
        }, 1000);

        if (seed) {
            analytics.copy.svg({
                seed,
                style: style as "linearGradient" | "linearSwatches" | "angularSwatches" | undefined,
                angle,
                steps,
            });
        }
    };

    const handleCopyData = () => {
        if (gradientData && gradientGlobals) {
            const withGlobals = applyGlobals(gradientData, gradientGlobals);
            const formattedData = withGlobals.map((coeff) =>
                coeff.slice(0, 3).map((value) => Number(value.toFixed(3))),
            );
            const dataString = JSON.stringify(formattedData);
            clipboard.copy(dataString);
            setCopiedType("data");
            if (timerRef.current) clearTimeout(timerRef.current);
            if (closeTimerRef.current) {
                clearTimeout(closeTimerRef.current);
                closeTimerRef.current = null;
            }
            timerRef.current = setTimeout(() => {
                setCopiedType("none");
            }, 1000);

            if (seed) {
                analytics.copy.vectors({
                    seed,
                    style: style as "linearGradient" | "linearSwatches" | "angularSwatches" | undefined,
                    angle,
                    steps,
                });
            }
        }
    };

    const handleCopyColors = () => {
        if (gradientColors) {
            const colorsString = JSON.stringify(gradientColors, null, 2);
            clipboard.copy(colorsString);
            setCopiedType("colors");
            if (timerRef.current) clearTimeout(timerRef.current);
            if (closeTimerRef.current) {
                clearTimeout(closeTimerRef.current);
                closeTimerRef.current = null;
            }
            timerRef.current = setTimeout(() => {
                setCopiedType("none");
            }, 1000);

            if (seed) {
                analytics.copy.colors({
                    seed,
                    style: style as "linearGradient" | "linearSwatches" | "angularSwatches" | undefined,
                    angle,
                    steps,
                    colorCount: gradientColors.length,
                });
            }
        }
    };

    const handleCopySeed = () => {
        if (seed) {
            const params = new URLSearchParams();
            if (style && style !== "linearGradient") params.set("style", style);
            if (angle !== undefined && angle !== 90)
                params.set("angle", angle.toString());
            if (steps !== undefined) params.set("steps", steps.toString());
            const queryString = params.toString();
            const url = `https://grabient.com/${seed}${queryString ? `?${queryString}` : ""}`;
            clipboard.copy(url);
            setCopiedType("seed");
            if (timerRef.current) clearTimeout(timerRef.current);
            if (closeTimerRef.current) {
                clearTimeout(closeTimerRef.current);
                closeTimerRef.current = null;
            }
            timerRef.current = setTimeout(() => {
                setCopiedType("none");
            }, 1000);

            analytics.copy.link({
                seed,
                style: style as "linearGradient" | "linearSwatches" | "angularSwatches" | undefined,
                angle,
                steps,
            });
        }
    };

    const handleCopyPng = async () => {
        if (isCopyingPng || isPngGenerating) return;

        try {
            let blob = pngBlob;

            if (!blob) {
                const result = await refetchPng();
                if (!result.data) {
                    console.error("Failed to generate PNG");
                    return;
                }
                blob = result.data;
            }

            await copyToClipboard(blob);
            setCopiedType("png");
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                setCopiedType("none");
            }, 1000);

            if (seed) {
                analytics.copy.png({
                    seed,
                    style: style as "linearGradient" | "linearSwatches" | "angularSwatches" | undefined,
                    angle,
                    steps,
                    width: pngOptions?.width,
                    height: pngOptions?.height,
                });
            }
        } catch (error) {
            console.error("Failed to copy PNG:", error);
        }
    };

    const handleDownloadSvg = () => {
        if (svgString) {
            const blob = new Blob([svgString], { type: "image/svg+xml" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `gradient-${Date.now()}.svg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setCopiedType("svg-download");
            if (timerRef.current) clearTimeout(timerRef.current);
            if (closeTimerRef.current) {
                clearTimeout(closeTimerRef.current);
                closeTimerRef.current = null;
            }
            timerRef.current = setTimeout(() => {
                setCopiedType("none");
            }, 1000);

            if (seed) {
                analytics.download.svg({
                    seed,
                    style: style as "linearGradient" | "linearSwatches" | "angularSwatches" | undefined,
                    angle,
                    steps,
                    width: pngOptions?.width,
                    height: pngOptions?.height,
                });
            }
        }
    };

    const handleDownloadPng = async () => {
        if (isDownloadingPng || isPngGenerating) return;

        try {
            let blob = pngBlob;

            if (!blob) {
                const result = await refetchPng();
                if (!result.data) {
                    console.error("Failed to generate PNG");
                    return;
                }
                blob = result.data;
            }

            await downloadPng(blob);
            setCopiedType("png-download");
            if (timerRef.current) clearTimeout(timerRef.current);
            if (closeTimerRef.current) {
                clearTimeout(closeTimerRef.current);
                closeTimerRef.current = null;
            }
            timerRef.current = setTimeout(() => {
                setCopiedType("none");
            }, 1000);

            if (seed) {
                analytics.download.png({
                    seed,
                    style: style as "linearGradient" | "linearSwatches" | "angularSwatches" | undefined,
                    angle,
                    steps,
                    width: pngOptions?.width,
                    height: pngOptions?.height,
                });
            }
        } catch (error) {
            console.error("Failed to download PNG:", error);
        }
    };

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
        <div
            className="relative"
            onClick={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
        >
            <DropdownMenu
                modal={true}
                open={open}
                onOpenChange={(isOpen) => {
                    setOpenCopyMenuId(isOpen ? id : null);
                    onOpenChange?.(isOpen);
                    if (isOpen && onOpen) {
                        onOpen();
                    }
                }}
            >
                <DropdownMenuTrigger asChild>
                    <button
                        style={{ backgroundColor: "var(--background)" }}
                        className={cn(
                            "disable-animation-on-theme-change inline-flex items-center justify-center rounded-md",
                            "w-8 h-8 p-0 border border-solid",
                            "text-muted-foreground hover:text-foreground",
                            "transition-colors duration-200 cursor-pointer",
                            "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                            "backdrop-blur-sm",
                            !open && !isActive
                                ? "opacity-0 group-hover:opacity-100"
                                : "opacity-100",
                            open
                                ? "border-muted-foreground/30 bg-background/60 text-foreground"
                                : "border-input hover:border-muted-foreground/30 hover:bg-background/60",
                        )}
                        suppressHydrationWarning
                        aria-label="Copy options"
                        aria-expanded={open}
                        onClick={(e) => e.stopPropagation()}
                        onTouchEnd={(e) => e.stopPropagation()}
                    >
                        <Copy className="w-4 h-4" strokeWidth={2.5} />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="end"
                    sideOffset={8}
                    className="p-1.5 w-[154px] md:min-w-[150px] md:w-auto disable-animation-on-theme-change bg-background/80 backdrop-blur-sm border border-solid border-input rounded-md"
                    onClick={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                >
                    <DropdownMenuItem
                        onSelect={(e) => {
                            e.preventDefault();
                            handleCopyCss();
                        }}
                        className="cursor-pointer relative h-9 min-h-[2.25rem] text-foreground/80 hover:text-foreground transition-colors duration-200 hover:bg-[var(--background)] focus:bg-[var(--background)] focus:text-foreground px-3 font-system font-medium text-sm"
                    >
                        <span>
                            {copiedType === "css" ? "Copied!" : "Copy CSS"}
                        </span>
                        {copiedType === "css" && (
                            <Check className="ml-auto h-4 w-4" />
                        )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onSelect={(e) => {
                            e.preventDefault();
                            handleCopySvg();
                        }}
                        className="cursor-pointer relative h-9 min-h-[2.25rem] text-foreground/80 hover:text-foreground transition-colors duration-200 hover:bg-[var(--background)] focus:bg-[var(--background)] focus:text-foreground px-3 font-system font-medium text-sm"
                    >
                        <span>
                            {copiedType === "svg" ? "Copied!" : "Copy SVG"}
                        </span>
                        {copiedType === "svg" && (
                            <Check className="ml-auto h-4 w-4" />
                        )}
                    </DropdownMenuItem>
                    {pngOptions && (
                        <DropdownMenuItem
                            onSelect={(e) => {
                                e.preventDefault();
                                handleCopyPng();
                            }}
                            disabled={
                                isCopyingPng || (isPngGenerating && !pngBlob)
                            }
                            className={cn(
                                "cursor-pointer relative h-9 min-h-[2.25rem] text-foreground/80 hover:text-foreground transition-colors duration-200 hover:bg-[var(--background)] focus:bg-[var(--background)] focus:text-foreground px-3 font-medium text-sm",
                                (isCopyingPng ||
                                    (isPngGenerating && !pngBlob)) &&
                                    "opacity-50 cursor-not-allowed",
                            )}
                        >
                            <span>
                                {copiedType === "png" ? "Copied!" : "Copy PNG"}
                            </span>
                            {!pngBlob && isPngGenerating ? (
                                <Loader2 className="ml-auto h-4 w-4 animate-spin" />
                            ) : (
                                copiedType === "png" && (
                                    <Check className="ml-auto h-4 w-4" />
                                )
                            )}
                        </DropdownMenuItem>
                    )}
                    {((gradientData && gradientGlobals) || gradientColors || seed) && (
                        <div
                            onMouseLeave={() => {
                                if (!isTouchDevice.current) {
                                    closeTimerRef.current = setTimeout(() => {
                                        setDataMenuOpen(false);
                                    }, 300);
                                }
                            }}
                        >
                            <DropdownMenu
                                open={dataMenuOpen}
                                onOpenChange={setDataMenuOpen}
                                modal={false}
                            >
                                <DropdownMenuTrigger asChild>
                                    <div
                                        className="cursor-pointer relative h-9 min-h-[2.25rem] text-foreground/80 hover:text-foreground transition-colors duration-200 hover:bg-[var(--background)] focus:bg-[var(--background)] focus:text-foreground px-3 font-system font-medium text-sm data-[state=open]:bg-[var(--background)] data-[state=open]:text-foreground flex items-center rounded-sm outline-hidden select-none group/submenu"
                                        onPointerDown={(e) => {
                                            if (e.pointerType === "touch") {
                                                isTouchDevice.current = true;
                                                e.preventDefault();
                                                setDataMenuOpen(
                                                    (prev) => !prev,
                                                );
                                            }
                                        }}
                                        onMouseEnter={() => {
                                            if (!isTouchDevice.current) {
                                                if (closeTimerRef.current) {
                                                    clearTimeout(
                                                        closeTimerRef.current,
                                                    );
                                                    closeTimerRef.current =
                                                        null;
                                                }
                                                setDataMenuOpen(true);
                                            }
                                        }}
                                        onClick={(e) => {
                                            if (isTouchDevice.current) {
                                                e.preventDefault();
                                                e.stopPropagation();
                                            }
                                        }}
                                    >
                                        <ChevronLeft
                                            className={cn(
                                                "h-4 w-4 transition-all duration-100",
                                                dataMenuOpen
                                                    ? "mr-2 opacity-100 animate-in slide-in-from-right-2"
                                                    : "w-0 mr-0 opacity-0",
                                            )}
                                        />
                                        <span>Copy data</span>
                                    </div>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    side="left"
                                    align="end"
                                    sideOffset={16}
                                    alignOffset={-6}
                                    className="p-1.5 w-[154px] md:min-w-[150px] md:w-auto disable-animation-on-theme-change bg-background/80 backdrop-blur-sm border border-solid border-input rounded-md"
                                    onMouseEnter={() => {
                                        if (closeTimerRef.current) {
                                            clearTimeout(closeTimerRef.current);
                                            closeTimerRef.current = null;
                                        }
                                        setDataMenuOpen(true);
                                    }}
                                >
                                    {gradientData && gradientGlobals && (
                                        <DropdownMenuItem
                                            onSelect={(e) => {
                                                e.preventDefault();
                                                handleCopyData();
                                            }}
                                            className="cursor-pointer relative h-9 min-h-[2.25rem] text-foreground/80 hover:text-foreground transition-colors duration-200 hover:bg-[var(--background)] focus:bg-[var(--background)] focus:text-foreground px-3 font-system font-medium text-sm"
                                        >
                                            <span>
                                                {copiedType === "data"
                                                    ? "Copied!"
                                                    : "Copy vectors"}
                                            </span>
                                            {copiedType === "data" && (
                                                <Check className="ml-auto h-4 w-4" />
                                            )}
                                        </DropdownMenuItem>
                                    )}
                                    {gradientColors && (
                                        <DropdownMenuItem
                                            onSelect={(e) => {
                                                e.preventDefault();
                                                handleCopyColors();
                                            }}
                                            className="cursor-pointer relative h-9 min-h-[2.25rem] text-foreground/80 hover:text-foreground transition-colors duration-200 hover:bg-[var(--background)] focus:bg-[var(--background)] focus:text-foreground px-3 font-system font-medium text-sm"
                                        >
                                            <span>
                                                {copiedType === "colors"
                                                    ? "Copied!"
                                                    : "Copy colors"}
                                            </span>
                                            {copiedType === "colors" && (
                                                <Check className="ml-auto h-4 w-4" />
                                            )}
                                        </DropdownMenuItem>
                                    )}
                                    {seed && (
                                        <DropdownMenuItem
                                            onSelect={(e) => {
                                                e.preventDefault();
                                                handleCopySeed();
                                            }}
                                            className="cursor-pointer relative h-9 min-h-[2.25rem] text-foreground/80 hover:text-foreground transition-colors duration-200 hover:bg-[var(--background)] focus:bg-[var(--background)] focus:text-foreground px-3 font-system font-medium text-sm"
                                        >
                                            <span>
                                                {copiedType === "seed"
                                                    ? "Copied!"
                                                    : "Copy link"}
                                            </span>
                                            {copiedType === "seed" && (
                                                <Check className="ml-auto h-4 w-4" />
                                            )}
                                        </DropdownMenuItem>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    )}
                    <div
                        onMouseLeave={() => {
                            if (!isTouchDevice.current) {
                                closeTimerRef.current = setTimeout(() => {
                                    setDownloadMenuOpen(false);
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
                                    className="cursor-pointer relative h-9 min-h-[2.25rem] text-foreground/80 hover:text-foreground transition-colors duration-200 hover:bg-[var(--background)] focus:bg-[var(--background)] focus:text-foreground px-3 font-system font-medium text-sm data-[state=open]:bg-[var(--background)] data-[state=open]:text-foreground flex items-center rounded-sm outline-hidden select-none group/submenu"
                                    onPointerDown={(e) => {
                                        if (e.pointerType === "touch") {
                                            isTouchDevice.current = true;
                                            e.preventDefault();
                                            setDownloadMenuOpen((prev) => !prev);
                                        }
                                    }}
                                    onMouseEnter={() => {
                                        if (!isTouchDevice.current) {
                                            if (closeTimerRef.current) {
                                                clearTimeout(closeTimerRef.current);
                                                closeTimerRef.current = null;
                                            }
                                            setDownloadMenuOpen(true);
                                        }
                                    }}
                                    onClick={(e) => {
                                        if (isTouchDevice.current) {
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
                                className="p-1.5 w-[154px] md:min-w-[150px] md:w-auto disable-animation-on-theme-change bg-background/80 backdrop-blur-sm border border-solid border-input rounded-md"
                                onMouseEnter={() => {
                                    if (closeTimerRef.current) {
                                        clearTimeout(closeTimerRef.current);
                                        closeTimerRef.current = null;
                                    }
                                    setDownloadMenuOpen(true);
                                }}
                            >
                                {svgString && (
                                    <DropdownMenuItem
                                        onSelect={(e) => {
                                            e.preventDefault();
                                            handleDownloadSvg();
                                        }}
                                        className="cursor-pointer relative h-9 min-h-[2.25rem] text-foreground/80 hover:text-foreground transition-colors duration-200 hover:bg-[var(--background)] focus:bg-[var(--background)] focus:text-foreground px-3 font-system font-medium text-sm"
                                    >
                                        <span>
                                            {copiedType === "svg-download"
                                                ? "Downloaded!"
                                                : "Download SVG"}
                                        </span>
                                        {copiedType === "svg-download" && (
                                            <Check className="ml-auto h-4 w-4" />
                                        )}
                                    </DropdownMenuItem>
                                )}
                                {pngOptions && (
                                    <DropdownMenuItem
                                        onSelect={(e) => {
                                            e.preventDefault();
                                            handleDownloadPng();
                                        }}
                                        disabled={
                                            isDownloadingPng || (isPngGenerating && !pngBlob)
                                        }
                                        className={cn(
                                            "cursor-pointer relative h-9 min-h-[2.25rem] text-foreground/80 hover:text-foreground transition-colors duration-200 hover:bg-[var(--background)] focus:bg-[var(--background)] focus:text-foreground px-3 font-system font-medium text-sm",
                                            (isDownloadingPng ||
                                                (isPngGenerating && !pngBlob)) &&
                                                "opacity-50 cursor-not-allowed",
                                        )}
                                    >
                                        <span>
                                            {copiedType === "png-download"
                                                ? "Downloaded!"
                                                : "Download PNG"}
                                        </span>
                                        {!pngBlob && isPngGenerating ? (
                                            <Loader2 className="ml-auto h-4 w-4 animate-spin" />
                                        ) : (
                                            copiedType === "png-download" && (
                                                <Check className="ml-auto h-4 w-4" />
                                            )
                                        )}
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
