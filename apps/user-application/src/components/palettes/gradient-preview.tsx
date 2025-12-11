import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/palettes/copy-button";
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
import { useRef, useEffect, useState } from "react";
import { getGradientAriaLabel } from "@/lib/color-utils";

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

    const displaySize = previewSize ?? size;

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
                </div>
            </figure>
            <div
                className={cn(
                    "absolute right-5 z-30 pointer-events-auto transition-all duration-300 ease-in-out",
                    showMoreOptions
                        ? "top-[52px] sm:top-[52px] lg:right-3 lg:top-3"
                        : "top-[52px] sm:top-[52px] lg:right-3 lg:top-3",
                    isTouchDevice || isActive || isCopyMenuOpen
                        ? "flex"
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
                    }}
                />
                <div className="hidden lg:block">
                    <DevicePresets size={size} showDimensions={false} />
                </div>
            </div>
        </div>
    );
}
