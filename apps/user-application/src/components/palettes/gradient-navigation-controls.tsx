import { Link, useSearch } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { ArrowLeft, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { AngleInput } from "@/components/navigation/AngleInput";
import { StepsInput } from "@/components/navigation/StepsInput";
import { StyleSelect } from "@/components/navigation/StyleSelect";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { type paletteStyleValidator } from "@repo/data-ops/valibot-schema/grabient";
import type * as v from "valibot";
import { useStore } from "@tanstack/react-store";
import { uiStore } from "@/stores/ui";

type PaletteStyle = v.InferOutput<typeof paletteStyleValidator>;

interface GradientNavigationControlsProps {
    seed: string;
    style: "auto" | PaletteStyle;
    angle: "auto" | number;
    steps: "auto" | number;
    hasCustomValues: boolean;
    showMoreOptions: boolean;
    isTouchDevice: boolean;
    isActive: boolean;
    isCopyMenuOpen: boolean;
    onReset: () => void;
    onToggleMoreOptions: () => void;
    onPreviewStyleChange: (value: PaletteStyle | null) => void;
    onPreviewAngleChange: (value: number | null) => void;
    onPreviewStepsChange: (value: number | null) => void;
    onMouseEnter?: () => void;
}

export function GradientNavigationControls({
    seed: _seed,
    style,
    angle,
    steps,
    hasCustomValues,
    showMoreOptions,
    isTouchDevice,
    isActive,
    isCopyMenuOpen,
    onReset,
    onToggleMoreOptions,
    onPreviewStyleChange,
    onPreviewAngleChange,
    onPreviewStepsChange,
    onMouseEnter,
}: GradientNavigationControlsProps) {
    const shouldShow = isTouchDevice || isActive || isCopyMenuOpen;
    const navSelect = useStore(uiStore, (state) => state.navSelect);
    const currentSearch = useSearch({ from: "/$seed" });

    return (
        <>
            <div
                className={cn(
                    "absolute top-3 left-5 z-50 lg:top-0 lg:left-0 lg:right-0 lg:px-14 pointer-events-none",
                    "lg:block",
                    shouldShow ? "block" : "hidden",
                )}
                onMouseEnter={() => onMouseEnter?.()}
                suppressHydrationWarning
            >
                <Link
                    to={navSelect}
                    search={(prevSearch) => ({
                        ...prevSearch,
                        style: currentSearch.style,
                        angle: currentSearch.angle,
                        steps: currentSearch.steps,
                    })}
                    className="pointer-events-auto"
                >
                    <button
                        type="button"
                        style={{ backgroundColor: "var(--background)" }}
                        className={cn(
                            "disable-animation-on-theme-change inline-flex items-center justify-center rounded-md",
                            "h-8 w-8 lg:h-8.5 lg:w-8.5 p-0 border border-solid",
                            "border-input hover:border-muted-foreground/30 hover:bg-background/60 backdrop-blur-sm lg:backdrop-blur-none",
                            "text-muted-foreground hover:text-foreground",
                            "transition-colors duration-200 cursor-pointer",
                            "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                        )}
                        aria-label="Go back"
                        suppressHydrationWarning
                    >
                        <ArrowLeft
                            className="w-4 h-4 lg:w-[18px] lg:h-[18px]"
                            strokeWidth={2.5}
                        />
                    </button>
                </Link>
            </div>

            <div
                className={cn(
                    "absolute top-3 right-5 z-50 lg:top-0 lg:right-14 flex items-start justify-end pointer-events-none",
                    "lg:flex",
                    shouldShow ? "flex" : "hidden",
                )}
                onMouseEnter={() => onMouseEnter?.()}
                suppressHydrationWarning
            >
                <div className="flex flex-col items-end gap-2 pointer-events-none">
                    <div className="flex items-center gap-2 pointer-events-auto">
                        {hasCustomValues && (
                            <Tooltip delayDuration={500}>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={onReset}
                                        style={{
                                            backgroundColor:
                                                "var(--background)",
                                        }}
                                        className={cn(
                                            "disable-animation-on-theme-change inline-flex items-center justify-center rounded-md",
                                            "h-8 w-8 lg:h-8.5 lg:w-8.5 p-0 border border-solid",
                                            "border-input hover:border-muted-foreground/30 hover:bg-background/60 backdrop-blur-sm lg:backdrop-blur-none",
                                            "text-muted-foreground hover:text-foreground",
                                            "transition-colors duration-200 cursor-pointer",
                                            "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                        )}
                                        aria-label="Reset to initial values"
                                    >
                                        <RotateCcw className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent
                                    side="top"
                                    align="end"
                                    sideOffset={6}
                                >
                                    <p>Reset</p>
                                </TooltipContent>
                            </Tooltip>
                        )}
                        <AngleInput
                            value={angle}
                            className="subpixel-antialiased lg:bg-background bg-background/80 backdrop-blur-sm disable-animation-on-theme-change hidden sm:flex"
                            onPreviewChange={onPreviewAngleChange}
                        />
                        <StepsInput
                            value={steps}
                            className="subpixel-antialiased lg:bg-background bg-background/80 backdrop-blur-sm disable-animation-on-theme-change hidden sm:flex"
                            onPreviewChange={onPreviewStepsChange}
                        />
                        <StyleSelect
                            value={style}
                            className="subpixel-antialiased lg:bg-background bg-background/80 backdrop-blur-sm disable-animation-on-theme-change"
                            onPreviewChange={onPreviewStyleChange}
                        />
                        <Tooltip delayDuration={500}>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={onToggleMoreOptions}
                                    style={{
                                        backgroundColor:
                                            "var(--background)",
                                    }}
                                    className={cn(
                                        "disable-animation-on-theme-change inline-flex items-center justify-center rounded-md",
                                        "h-8 w-8 lg:h-8.5 lg:w-8.5 p-0 border border-solid",
                                        "text-muted-foreground hover:text-foreground",
                                        "transition-colors duration-200 cursor-pointer",
                                        "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                        "backdrop-blur-sm lg:backdrop-blur-none",
                                        "sm:hidden",
                                        showMoreOptions
                                            ? "border-muted-foreground/30 bg-background/60 text-foreground"
                                            : "border-input hover:border-muted-foreground/30 hover:bg-background/60",
                                    )}
                                    aria-label={
                                        showMoreOptions
                                            ? "Hide more options"
                                            : "Show more options"
                                    }
                                    aria-expanded={showMoreOptions}
                                    suppressHydrationWarning
                                >
                                    {showMoreOptions ? (
                                        <X className="w-4 h-4 lg:w-[18px] lg:h-[18px]" />
                                    ) : (
                                        <SlidersHorizontal className="w-4 h-4 lg:w-[18px] lg:h-[18px]" />
                                    )}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent
                                side="top"
                                align="end"
                                sideOffset={6}
                            >
                                <p>
                                    {showMoreOptions
                                        ? "Hide options"
                                        : "More options"}
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    </div>

                    <div
                        className={cn(
                            "flex items-center overflow-hidden sm:hidden pointer-events-auto",
                            showMoreOptions
                                ? "max-h-[36px] opacity-100 gap-2"
                                : "max-h-0 opacity-0 gap-2 pointer-events-none",
                        )}
                    >
                        <AngleInput
                            value={angle}
                            className="subpixel-antialiased lg:bg-background bg-background/80 backdrop-blur-sm disable-animation-on-theme-change"
                            onPreviewChange={onPreviewAngleChange}
                        />
                        <StepsInput
                            value={steps}
                            className="subpixel-antialiased lg:bg-background bg-background/80 backdrop-blur-sm disable-animation-on-theme-change"
                            onPreviewChange={onPreviewStepsChange}
                        />
                        <div className="w-8 h-8" />
                    </div>
                </div>
            </div>
        </>
    );
}
