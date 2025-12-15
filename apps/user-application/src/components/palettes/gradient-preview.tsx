import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/palettes/copy-button";
import { ExportButton } from "@/components/palettes/export-button";
import { createExportItem } from "@/lib/paletteUtils";
import type { PNGGenerationOptions } from "@/lib/generatePNG";
import {
    coeffsSchema,
    globalsSchema,
    type paletteStyleValidator,
    DEFAULT_SIZE,
} from "@repo/data-ops/valibot-schema/grabient";
import type * as v from "valibot";
import { DevicePresets } from "@/components/palettes/device-presets";
import { useStore } from "@tanstack/react-store";
import { exportStore } from "@/stores/export";
import { uiStore } from "@/stores/ui";
import { useRef, useEffect, useState, lazy, Suspense } from "react";
import { getGradientAriaLabel } from "@repo/data-ops/color-utils";
import { generateCssGradient } from "@repo/data-ops/gradient-gen";
import { X } from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { useHotkeys } from "@mantine/hooks";

const LazyGradientChannelsChart = lazy(() =>
    import("@/components/palettes/gradient-channels-chart").then((mod) => ({
        default: mod.GradientChannelsChart,
    })),
);

type Coeffs = v.InferOutput<typeof coeffsSchema>;
type Globals = v.InferOutput<typeof globalsSchema>;
type PaletteStyle = v.InferOutput<typeof paletteStyleValidator>;

interface GradientPreviewProps {
    seed: string;
    gradientString: string;
    currentStyle: PaletteStyle;
    currentAngle: number;
    currentSteps: number;
    size: "auto" | [number, number];
    cssString: string;
    svgString: string;
    coeffs: Coeffs;
    globals: Globals;
    hexColors: string[];
    isTouchDevice: boolean;
    isActive: boolean;
    isCopyMenuOpen: boolean;
    showMoreOptions: boolean;
    showGraph: boolean;
    onSetShowGraph: (show: boolean) => void;
    clipping?: boolean;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    onTouchToggle?: () => void;
    onEnterClipMode?: () => void;
    onExitClipMode?: () => void;
}

export function GradientPreview({
    seed,
    gradientString,
    currentStyle,
    currentAngle,
    currentSteps,
    size,
    cssString,
    svgString,
    coeffs,
    globals,
    hexColors,
    isTouchDevice,
    isActive,
    isCopyMenuOpen,
    showMoreOptions,
    showGraph,
    onSetShowGraph,
    clipping: _clipping,
    onMouseEnter,
    onMouseLeave,
    onTouchToggle,
    onEnterClipMode: _onEnterClipMode,
    onExitClipMode: _onExitClipMode,
}: GradientPreviewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerDimensions, setContainerDimensions] = useState<{
        width: number;
        height: number;
    } | null>(null);
    const previewSize = useStore(uiStore, (state) => state.previewSize);
    const borderRadius = useStore(exportStore, (state) => state.borderRadius);

    useHotkeys([["Escape", () => showGraph && onSetShowGraph(false)]]);

    useEffect(() => {
        if (!containerRef.current) return;

        const updateContainerDimensions = () => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            setContainerDimensions({
                width: rect.width,
                height: rect.height,
            });
            exportStore.setState((state) => ({
                ...state,
                containerDimensions: {
                    width: rect.width,
                    height: rect.height,
                },
            }));
        };

        updateContainerDimensions();

        const resizeObserver = new ResizeObserver(updateContainerDimensions);
        resizeObserver.observe(containerRef.current);

        return () => resizeObserver.disconnect();
    }, []);

    const displaySize = showGraph ? "auto" : (previewSize ?? size);

    const actualWidth =
        displaySize === "auto"
            ? (containerDimensions?.width ?? DEFAULT_SIZE[0])
            : displaySize[0];
    const actualHeight =
        displaySize === "auto"
            ? (containerDimensions?.height ?? DEFAULT_SIZE[1])
            : displaySize[1];

    const aspectRatio =
        displaySize !== "auto" ? displaySize[0] / displaySize[1] : null;
    const containerAspectRatio = containerDimensions
        ? containerDimensions.width / containerDimensions.height
        : DEFAULT_SIZE[0] / DEFAULT_SIZE[1];

    const graphBackgroundGradient = showGraph
        ? generateCssGradient(hexColors, "linearSwatches", 90, {
              seed,
              searchString: "",
          }).gradientString
        : null;

    return (
        <div
            ref={containerRef}
            className={cn(
                "flex-1 lg:flex-1 pb-3 lg:py-0 relative min-h-0 flex flex-col group w-full",
                displaySize !== "auto" && "pt-3 lg:pt-0",
            )}
            onMouseEnter={() => onMouseEnter?.()}
            onMouseLeave={() => {
                if (!isCopyMenuOpen) {
                    onMouseLeave?.();
                }
            }}
            onClick={() => {
                if (isTouchDevice) {
                    onTouchToggle?.();
                }
            }}
        >
            <figure
                className={cn(
                    "relative z-10 flex-1 w-full flex items-center justify-center min-h-0 overflow-visible",
                    displaySize !== "auto" ? "rounded-lg" : "lg:rounded-lg",
                )}
                role="img"
                aria-label={getGradientAriaLabel(hexColors)}
            >
                {/* Glow effect layer - duplicate gradient with blur */}
                <div
                    className={cn(
                        "absolute transition-opacity duration-300 z-0 pointer-events-none blur-lg flex items-center justify-center -inset-3",
                        displaySize !== "auto" ? "rounded-lg" : "lg:rounded-lg",
                        {
                            "opacity-0 group-hover:opacity-40": !isActive,
                            "opacity-40": isActive,
                        },
                    )}
                    aria-hidden="true"
                >
                    <div
                        className={cn(
                            "overflow-hidden",
                            displaySize !== "auto"
                                ? "rounded-lg"
                                : "lg:rounded-lg",
                        )}
                        style={
                            aspectRatio
                                ? {
                                      aspectRatio: aspectRatio.toString(),
                                      width:
                                          aspectRatio > containerAspectRatio
                                              ? "100%"
                                              : "auto",
                                      height:
                                          aspectRatio > containerAspectRatio
                                              ? "auto"
                                              : "100%",
                                      maxWidth: "100%",
                                      maxHeight: "100%",
                                  }
                                : { width: "100%", height: "100%" }
                        }
                    >
                        <div className="w-full h-full">
                            <div
                                className="w-full h-full"
                                style={{
                                    backgroundImage: gradientString,
                                    backgroundSize: "cover",
                                    backgroundPosition: "center",
                                    backgroundRepeat: "no-repeat",
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Main gradient preview */}
                <div
                    className={cn(
                        "overflow-hidden relative border border-solid border-input z-10",
                        displaySize !== "auto" ? "rounded-lg" : "lg:rounded-lg",
                        displaySize === "auto" && "border-0 lg:border",
                    )}
                    style={
                        aspectRatio
                            ? {
                                  aspectRatio: aspectRatio.toString(),
                                  width:
                                      aspectRatio > containerAspectRatio
                                          ? "100%"
                                          : "auto",
                                  height:
                                      aspectRatio > containerAspectRatio
                                          ? "auto"
                                          : "100%",
                                  maxWidth: "100%",
                                  maxHeight: "100%",
                              }
                            : { width: "100%", height: "100%" }
                    }
                    suppressHydrationWarning
                >
                    <div className="w-full h-full">
                        <div
                            className="w-full h-full"
                            style={{
                                backgroundImage: gradientString,
                                backgroundSize: "cover",
                                backgroundPosition: "center",
                                backgroundRepeat: "no-repeat",
                            }}
                        />
                    </div>

                    {/* Graph overlay - only on xs viewport when showGraph is true */}
                    {showGraph && (
                        <div className="absolute inset-0 flex flex-col sm:hidden">
                            {/* Close button */}
                            <div className="absolute top-3 left-3 z-20">
                                <Tooltip delayDuration={500}>
                                    <TooltipTrigger asChild>
                                        <button
                                            aria-label="Hide graph"
                                            style={{
                                                backgroundColor:
                                                    "var(--background)",
                                            }}
                                            className={cn(
                                                "disable-animation-on-theme-change inline-flex items-center justify-center rounded-md",
                                                "w-8 h-8 p-0 border border-solid",
                                                "text-muted-foreground hover:text-foreground",
                                                "transition-colors duration-200 cursor-pointer",
                                                "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                                "border-input hover:border-muted-foreground/30",
                                            )}
                                            type="button"
                                            onClick={() => onSetShowGraph(false)}
                                            suppressHydrationWarning
                                        >
                                            <X
                                                className="w-4 h-4"
                                                strokeWidth={2.5}
                                            />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent
                                        side="bottom"
                                        align="start"
                                        sideOffset={6}
                                    >
                                        <span className="flex items-center gap-1.5">
                                            Hide graph <Kbd>esc</Kbd>
                                        </span>
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                            {/* Graph area with blurred translucent background */}
                            <div className="flex-1 relative">
                                <div className="absolute inset-0 bg-background backdrop-blur-sm" />
                                <div className="absolute inset-x-0 top-3 bottom-3">
                                    <Suspense fallback={<div className="h-full w-full" />}>
                                        <LazyGradientChannelsChart
                                            coeffs={coeffs}
                                            globals={globals}
                                            steps={currentSteps}
                                            showLabels={true}
                                            showGrid={true}
                                        />
                                    </Suspense>
                                </div>
                            </div>
                            {/* Bottom strip showing swatches as x-axis legend */}
                            <div
                                className="h-10 shrink-0"
                                style={{
                                    backgroundImage:
                                        graphBackgroundGradient ?? "",
                                    backgroundSize: "cover",
                                    backgroundPosition: "center bottom",
                                    backgroundRepeat: "no-repeat",
                                }}
                            />
                        </div>
                    )}
                </div>
            </figure>
            <div
                className={cn(
                    "absolute right-5 z-30 pointer-events-auto transition-all duration-300 ease-in-out",
                    showMoreOptions
                        ? "top-[52px] sm:top-[52px] lg:right-3 lg:top-3"
                        : "top-[52px] sm:top-[52px] lg:right-3 lg:top-3",
                    isTouchDevice || isActive || isCopyMenuOpen
                        ? showGraph
                            ? "hidden sm:flex"
                            : "flex"
                        : "hidden",
                    "flex-col gap-2",
                )}
                suppressHydrationWarning
            >
                <CopyButton
                    id={seed}
                    cssString={cssString}
                    svgString={svgString}
                    gradientData={coeffs}
                    gradientGlobals={globals}
                    gradientColors={hexColors}
                    seed={seed}
                    style={currentStyle}
                    angle={currentAngle}
                    steps={currentSteps}
                    isActive={true}
                    pngOptions={{
                        style: currentStyle as PNGGenerationOptions["style"],
                        hexColors: hexColors,
                        angle: currentAngle,
                        seed: seed,
                        steps: currentSteps,
                        width: Math.round(actualWidth),
                        height: Math.round(actualHeight),
                        borderRadius,
                    }}
                />
                <ExportButton
                    exportItem={createExportItem(
                        {
                            seed,
                            coeffs,
                            globals,
                            style: currentStyle,
                            angle: currentAngle,
                            steps: currentSteps,
                            hexColors,
                            likesCount: 0,
                            createdAt: new Date(),
                        },
                        {
                            style: currentStyle,
                            steps: currentSteps,
                            angle: currentAngle,
                            hexColors,
                        },
                    )}
                    isActive={true}
                    removeAllOnClick={true}
                />
                <div className="hidden lg:block">
                    <DevicePresets size={size} showDimensions={false} />
                </div>
            </div>
        </div>
    );
}
