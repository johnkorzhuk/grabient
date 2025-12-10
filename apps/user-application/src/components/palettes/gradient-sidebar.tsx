import { RGBTabs } from "@/components/palettes/rgb-tabs";
import { SaveButton } from "@/components/palettes/save-button";
import { Suspense, lazy } from "react";
import { GradientModifierControls } from "@/components/palettes/gradient-modifier-controls";
import { DevicePresets } from "@/components/palettes/device-presets";
import { PaletteChartIcon } from "@/components/icons/PaletteChartIcon";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import type { AppPalette } from "@/queries/palettes";
import {
    coeffsSchema,
    globalsSchema,
    type paletteStyleValidator,
} from "@repo/data-ops/valibot-schema/grabient";
import type { MODIFIERS } from "@repo/data-ops/valibot-schema/grabient";
import type * as v from "valibot";
import { applyGlobals } from "@repo/data-ops/gradient-gen/cosine";
import { toggleShowGraph, uiStore } from "@/stores/ui";
import { useStore } from "@tanstack/react-store";

const LazyGradientChannelsChart = lazy(() =>
    import("@/components/palettes/gradient-channels-chart").then((mod) => ({
        default: mod.GradientChannelsChart,
    })),
);

type Coeffs = v.InferOutput<typeof coeffsSchema>;
type Globals = v.InferOutput<typeof globalsSchema>;
type PaletteStyle = v.InferOutput<typeof paletteStyleValidator>;

interface GradientSidebarProps {
    palette: AppPalette;
    mod: string;
    coeffs: Coeffs;
    globals: Globals;
    currentSteps: number;
    currentStyle: PaletteStyle;
    currentAngle: number;
    seed: string;
    likeInfo?: { likesCount: number; isLiked: boolean };
    isLikesLoading: boolean;
    isTouchDevice: boolean;
    onChannelOrderChange: (newCoeffs: Coeffs, palette: AppPalette) => void;
    onGlobalChange: (modifierIndex: number, value: number) => void;
    onRGBChannelChange: (
        modifierIndex: number,
        channelIndex: number,
        value: number,
    ) => void;
    onToggleModifier: (modifier: (typeof MODIFIERS)[number]) => void;
    onTareModifier?: (modifierIndex: number) => void;
}

export function GradientSidebar({
    palette,
    mod,
    coeffs,
    globals,
    currentSteps,
    currentStyle,
    currentAngle,
    seed,
    likeInfo,
    isLikesLoading,
    isTouchDevice,
    onChannelOrderChange,
    onGlobalChange,
    onRGBChannelChange,
    onToggleModifier,
    onTareModifier,
}: GradientSidebarProps) {
    const processedCoeffs = applyGlobals(coeffs, globals);
    const showGraph = useStore(uiStore, (state) => state.showGraph);

    return (
        <aside className="h-[280px] lg:h-full lg:w-[340px] w-full shrink-0 lg:pl-8 px-5 lg:pr-0 pb-2 lg:pt-0 lg:pb-1 relative z-20">
            <div className="h-full w-full flex flex-col lg:gap-4">
                <div className="flex-1 w-full flex flex-row min-h-0 gap-3 lg:flex-col lg:gap-0 lg:min-h-[200px]">
                    <div className="h-full flex-1 hidden sm:flex lg:w-full lg:flex-1 rounded-lg flex-col">
                        <div className="flex items-start justify-between lg:pt-0">
                            <RGBTabs
                                palette={palette}
                                onOrderChange={onChannelOrderChange}
                            />
                            <SaveButton
                                palette={palette}
                                seed={seed}
                                style={currentStyle}
                                angle={currentAngle}
                                steps={currentSteps}
                                likeInfo={likeInfo}
                                isLoading={isLikesLoading}
                            />
                        </div>
                        <div className="flex-1 pt-3 mb-3 lg:mb-6 min-h-0">
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
                    <div className="h-full max-h-[280px] w-full sm:flex-1 sm:h-full lg:w-full lg:h-[220px] lg:max-h-[220px] lg:shrink-0 flex flex-col min-h-0">
                        <div className="flex items-center justify-between sm:hidden pb-6 sm:pb-3 shrink-0">
                            <div className="flex items-center gap-2">
                                <Tooltip delayDuration={1000}>
                                    <TooltipTrigger asChild>
                                        <button
                                            aria-label="Show graph"
                                            style={{ backgroundColor: "var(--background)" }}
                                            className={cn(
                                                "disable-animation-on-theme-change",
                                                "inline-flex items-center justify-center rounded-md",
                                                "group/chart w-8 h-8 mr-3 border border-solid",
                                                "transition-colors duration-200 cursor-pointer",
                                                "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                                "border-input text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground",
                                                showGraph && "border-muted-foreground/30 text-foreground",
                                            )}
                                            type="button"
                                            onClick={toggleShowGraph}
                                            suppressHydrationWarning
                                        >
                                            <PaletteChartIcon
                                                coeffs={processedCoeffs}
                                                size={22}
                                            />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent
                                        side="top"
                                        align="start"
                                        sideOffset={6}
                                    >
                                        <span className="flex items-center gap-1.5">
                                            {showGraph ? "Hide graph" : "Show graph"}
                                            {showGraph && <Kbd>esc</Kbd>}
                                        </span>
                                    </TooltipContent>
                                </Tooltip>
                                <RGBTabs
                                    palette={palette}
                                    onOrderChange={onChannelOrderChange}
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <SaveButton
                                    palette={palette}
                                    seed={seed}
                                    style={currentStyle}
                                    angle={currentAngle}
                                    steps={currentSteps}
                                    likeInfo={likeInfo}
                                    isLoading={isLikesLoading}
                                />
                                <div className="ml-3">
                                    <DevicePresets showDimensions={false} />
                                </div>
                            </div>
                        </div>
                        <div className="flex-1 w-full pb-2.5 sm:px-5 sm:pl-5 sm:pr-0 lg:pb-0 lg:px-0 flex flex-col justify-end">
                            <GradientModifierControls
                                mod={mod}
                                coeffs={coeffs}
                                globals={globals}
                                onGlobalChange={onGlobalChange}
                                onRGBChannelChange={onRGBChannelChange}
                                onToggleModifier={onToggleModifier}
                                onTareModifier={onTareModifier}
                                showDevicePresets={true}
                                isTouchDevice={isTouchDevice}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </aside>
    );
}
