import type { AppPalette } from "@/queries/palettes";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import {
    generateCssGradient,
    generateSvgGradient,
} from "@repo/data-ops/gradient-gen";
import { generateHexColors } from "@/lib/paletteUtils";
import type * as v from "valibot";
import {
    coeffsSchema,
    styleWithAutoValidator,
    angleWithAutoValidator,
    stepsWithAutoValidator,
    paletteStyleValidator,
} from "@repo/data-ops/valibot-schema/grabient";
import { useStore } from "@tanstack/react-store";
import { uiStore, setCustomCoeffs } from "@/stores/ui";
import {
    useEffect,
    useRef,
    forwardRef,
    useSyncExternalStore,
    useState,
} from "react";
import { Heart, SquarePen, Check, ThumbsUp, ThumbsDown } from "lucide-react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useDevicePresetsState, DevicePresets } from "./device-presets";
import { ExportActions } from "./ExportActions";
import { Link, useNavigate } from "@tanstack/react-router";
import { useElementSize } from "@mantine/hooks";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { CopyButton } from "./copy-button";
import { ExportButton } from "./export-button";
import { createExportItem } from "@/lib/paletteUtils";
import { generateSVGGrid } from "@/lib/generateSVGGrid";
import { exportStore, addToExportList, isInExportList, clearExportList, setContainerDimensions, setGap, setBorderRadius, setColumns, GAP_MIN, GAP_MAX, BORDER_RADIUS_MIN, BORDER_RADIUS_MAX, COLUMNS_MIN, COLUMNS_MAX } from "@/stores/export";
import { useDimensions } from "@/hooks/useDimensions";
import { useLikePaletteMutation } from "@/mutations/palettes";
import { useQueryClient } from "@tanstack/react-query";
import { serializeCoeffs } from "@repo/data-ops/serialization";
import type { PNGGenerationOptions } from "@/lib/generatePNG";
import { getGradientAriaLabel, getUniqueColorNames } from "@repo/data-ops/color-utils";
import { detectDevice } from "@/lib/deviceDetection";
import { useSearchFeedbackMutation } from "@/mutations/search-feedback";
import { searchFeedbackStore, type FeedbackType } from "@/stores/search-feedback";

type CosineCoeffs = v.InferOutput<typeof coeffsSchema>;
type StyleWithAuto = v.InferOutput<typeof styleWithAutoValidator>;
type AngleWithAuto = v.InferOutput<typeof angleWithAutoValidator>;
type StepsWithAuto = v.InferOutput<typeof stepsWithAutoValidator>;
type PaletteStyle = v.InferOutput<typeof paletteStyleValidator>;

interface PalettesGridProps {
    palettes: AppPalette[];
    likedSeeds: Set<string>;
    urlStyle?: StyleWithAuto;
    urlAngle?: AngleWithAuto;
    urlSteps?: StepsWithAuto;
    isExportOpen?: boolean;
    searchQuery?: string;
    onBadFeedback?: (seed: string) => void;
}

export function PalettesGrid({
    palettes: initialPalettes,
    likedSeeds,
    urlStyle = "auto",
    urlAngle = "auto",
    urlSteps = "auto",
    isExportOpen = false,
    searchQuery,
    onBadFeedback,
}: PalettesGridProps) {
    const previewStyle = useStore(uiStore, (state) => state.previewStyle);
    const previewAngle = useStore(uiStore, (state) => state.previewAngle);
    const previewSteps = useStore(uiStore, (state) => state.previewSteps);
    const exportList = useStore(exportStore, (state) => state.exportList);
    const { ref: firstPaletteRef, width, height } = useElementSize();
    const lastClickedSeedRef = useRef<string | null>(null);
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const getPaletteMetadataBySeed = (
        seed: string,
    ): { likesCount?: number; createdAt: Date | null } => {
        // getQueriesData with ["palettes"] does fuzzy matching - returns all queries starting with "palettes"
        // This includes: ["palettes", orderBy, page, limit], ["palettes", "liked", ...], ["palettes", "search", ...]
        const queries = queryClient.getQueriesData<{
            palettes?: AppPalette[];
            results?: AppPalette[];
        }>({ queryKey: ["palettes"] });
        for (const [queryKey, data] of queries) {
            // Search results use "results" key, others use "palettes" key
            const isSearchQuery = queryKey[1] === "search";
            const paletteList = isSearchQuery ? data?.results : data?.palettes;
            if (paletteList) {
                const found = paletteList.find((p) => p.seed === seed);
                if (found) {
                    return {
                        likesCount: found.likesCount,
                        createdAt: found.createdAt,
                    };
                }
            }
        }
        // Check if seed is in liked seeds - if so, at least 1 like
        const likedSeedsCache = queryClient.getQueryData<Set<string>>([
            "user-liked-seeds",
        ]);
        if (likedSeedsCache?.has(seed)) {
            return { likesCount: 1, createdAt: null };
        }
        return { createdAt: null };
    };

    useEffect(() => {
        if (width > 0 && height > 0) {
            setContainerDimensions({ width, height });
        }
    }, [width, height]);

    useEffect(() => {
        if (isExportOpen && exportList.length === 0) {
            navigate({
                to: ".",
                search: (prev) => ({ ...prev, export: undefined }),
                replace: true,
            });
        }
    }, [isExportOpen, exportList.length, navigate]);

    const onChannelOrderChange = (
        newCoeffs: CosineCoeffs,
        palette: AppPalette,
    ) => {
        setCustomCoeffs(palette.seed, newCoeffs);
    };

    const handleShiftClick = (
        palette: AppPalette,
        effectiveStyle: PaletteStyle,
        effectiveAngle: number,
        effectiveSteps: number,
        hexColors: string[],
        currentCoeffs: CosineCoeffs,
        currentSeed: string,
    ) => {
        const exportItem = createExportItem(
            {
                ...palette,
                coeffs: currentCoeffs,
                seed: currentSeed,
            },
            {
                style: effectiveStyle,
                steps: effectiveSteps,
                angle: effectiveAngle,
                hexColors,
            },
        );

        const startIndex = lastClickedSeedRef.current
            ? initialPalettes.findIndex(
                  (p) => p.seed === lastClickedSeedRef.current,
              )
            : -1;
        const endIndex = initialPalettes.findIndex(
            (p) => p.seed === palette.seed,
        );

        if (startIndex !== -1 && startIndex !== endIndex) {
            const [start, end] =
                startIndex < endIndex
                    ? [startIndex, endIndex]
                    : [endIndex, startIndex];
            for (let i = start; i <= end; i++) {
                const p = initialPalettes[i]!;
                const pEffectiveStyle =
                    previewStyle || (urlStyle !== "auto" ? urlStyle : p.style);
                const pEffectiveAngle =
                    previewAngle ?? (urlAngle !== "auto" ? urlAngle : p.angle);
                const pEffectiveSteps =
                    previewSteps ?? (urlSteps !== "auto" ? urlSteps : p.steps);
                const pHexColors = generateHexColors(
                    p.coeffs,
                    p.globals,
                    pEffectiveSteps,
                );

                const pExportItem = createExportItem(p, {
                    style: pEffectiveStyle,
                    steps: pEffectiveSteps,
                    angle: pEffectiveAngle,
                    hexColors: pHexColors,
                });

                if (!isInExportList(pExportItem.id)) {
                    addToExportList(pExportItem);
                }
            }
        } else {
            if (!isInExportList(exportItem.id)) {
                addToExportList(exportItem);
            }
        }
        lastClickedSeedRef.current = palette.seed;
    };

    const exportGridContent = (
        <ol className="h-full w-full relative grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 3xl:grid-cols-4 gap-x-10 gap-y-20 auto-rows-[300px]">
            {exportList.map((item, index) => {
                const metadata = getPaletteMetadataBySeed(item.seed);
                const exportPalette: AppPalette = {
                    coeffs: item.coeffs,
                    globals: item.globals,
                    style: item.style,
                    steps: item.steps,
                    angle: item.angle,
                    seed: item.seed,
                    hexColors: item.hexColors,
                    likesCount: metadata.likesCount,
                    createdAt: metadata.createdAt,
                };
                return (
                    <PaletteCard
                        key={item.id}
                        palette={exportPalette}
                        index={index}
                        urlStyle={item.style}
                        urlAngle={item.angle}
                        urlSteps={item.steps}
                        previewStyle={null}
                        previewAngle={null}
                        previewSteps={null}
                        onChannelOrderChange={onChannelOrderChange}
                        likedSeeds={likedSeeds}
                        onShiftClick={handleShiftClick}
                    />
                );
            })}
        </ol>
    );

    const paletteGridContent = (
        <ol className="h-full w-full relative grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5 4xl:grid-cols-6 gap-x-10 gap-y-20 auto-rows-[300px]">
            {initialPalettes.map((palette, index) => {
                // Include version and unbiased flag in key to handle duplicate seeds across versions/streams
                const paletteWithMeta = palette as AppPalette & { unbiased?: boolean; version?: number; modelKey?: string; theme?: string };
                const key = paletteWithMeta.version !== undefined
                    ? `${palette.seed}-v${paletteWithMeta.version}-${paletteWithMeta.modelKey ?? ""}-${index}`
                    : palette.seed;
                return (
                <PaletteCard
                    key={key}
                    palette={palette}
                    index={index}
                    urlStyle={urlStyle}
                    urlAngle={urlAngle}
                    urlSteps={urlSteps}
                    previewStyle={previewStyle}
                    previewAngle={previewAngle}
                    previewSteps={previewSteps}
                    onChannelOrderChange={onChannelOrderChange}
                    likedSeeds={likedSeeds}
                    onShiftClick={handleShiftClick}
                    ref={index === 0 ? firstPaletteRef : undefined}
                    searchQuery={searchQuery}
                    onBadFeedback={onBadFeedback}
                    theme={paletteWithMeta.theme}
                />
                );
            })}
        </ol>
    );

    if (isExportOpen && exportList.length > 0) {
        return (
            <ExportView
                exportGridContent={exportGridContent}
                navigate={navigate}
            />
        );
    }

    return (
        <section className="h-full w-full relative px-5 lg:px-14 pt-4">
            {paletteGridContent}
        </section>
    );
}

interface ExportViewProps {
    exportGridContent: React.ReactNode;
    navigate: ReturnType<typeof useNavigate>;
}

function ExportView({ exportGridContent, navigate }: ExportViewProps) {
    const isMobile = !useMediaQuery("(min-width: 768px)");
    const [drawerOpen, setDrawerOpen] = useState(true);
    const devicePresetsState = useDevicePresetsState();
    const gap = useStore(exportStore, (state) => state.gap);
    const borderRadius = useStore(exportStore, (state) => state.borderRadius);
    const columns = useStore(exportStore, (state) => state.columns);

    const handleDrawerClose = () => {
        setDrawerOpen(false);
        navigate({
            to: ".",
            search: (prev) => ({ ...prev, export: undefined }),
            replace: true,
        });
    };

    const customInputs = (
        <div className="flex gap-2 items-center">
            <div className="relative group/width">
                <span
                    className="absolute -top-4 left-2 text-[10px] text-muted-foreground/70 opacity-0 group-hover/width:opacity-100 group-focus-within/width:opacity-100 transition-opacity duration-200"
                    style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
                >
                    Width
                </span>
                <input
                    type="number"
                    placeholder="W"
                    min="1"
                    max="6000"
                    value={devicePresetsState.customWidth}
                    onChange={(e) => devicePresetsState.handleWidthChange(e.target.value)}
                    onFocus={(e) => {
                        e.target.select();
                        devicePresetsState.isEditingCustomRef.current = true;
                    }}
                    onBlur={() => {
                        devicePresetsState.isEditingCustomRef.current = false;
                    }}
                    className={cn(
                        "h-7 w-14 text-xs px-2",
                        "rounded-md border border-solid",
                        "placeholder:text-muted-foreground",
                        "transition-colors duration-200",
                        "outline-none",
                        "border-input text-muted-foreground hover:border-muted-foreground/30 hover:bg-background/60 hover:text-foreground",
                        "focus:border-muted-foreground/30 focus:bg-background/60 focus:text-foreground",
                        "[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                    )}
                    style={{ backgroundColor: "var(--background)" }}
                />
            </div>
            <span className="text-xs text-muted-foreground">×</span>
            <div className="relative group/height">
                <span
                    className="absolute -top-4 left-2 text-[10px] text-muted-foreground/70 opacity-0 group-hover/height:opacity-100 group-focus-within/height:opacity-100 transition-opacity duration-200"
                    style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
                >
                    Height
                </span>
                <input
                    type="number"
                    placeholder="H"
                    min="1"
                    max="6000"
                    value={devicePresetsState.customHeight}
                    onChange={(e) => devicePresetsState.handleHeightChange(e.target.value)}
                    onFocus={(e) => {
                        e.target.select();
                        devicePresetsState.isEditingCustomRef.current = true;
                    }}
                    onBlur={() => {
                        devicePresetsState.isEditingCustomRef.current = false;
                    }}
                    className={cn(
                        "h-7 w-14 text-xs px-2",
                        "rounded-md border border-solid",
                        "placeholder:text-muted-foreground",
                        "transition-colors duration-200",
                        "outline-none",
                        "border-input text-muted-foreground hover:border-muted-foreground/30 hover:bg-background/60 hover:text-foreground",
                        "focus:border-muted-foreground/30 focus:bg-background/60 focus:text-foreground",
                        "[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                    )}
                    style={{ backgroundColor: "var(--background)" }}
                />
            </div>
        </div>
    );

    const inputClassName = cn(
        "h-7 w-14 text-xs px-2",
        "rounded-md border border-solid",
        "placeholder:text-muted-foreground",
        "transition-colors duration-200",
        "outline-none",
        "border-input text-muted-foreground hover:border-muted-foreground/30 hover:bg-background/60 hover:text-foreground",
        "focus:border-muted-foreground/30 focus:bg-background/60 focus:text-foreground",
        "[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
    );

    const exportPanelContent = (
        <div
            className="flex flex-col pt-6"
            style={{ height: "calc(100dvh - 201px - 222px)" }}
        >
            <div className="flex items-center justify-between mb-6">
                <span
                    className="text-base text-muted-foreground font-semibold"
                    style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
                >
                    Export options
                </span>
                <button
                    onClick={clearExportList}
                    className={cn(
                        "text-xs font-semibold px-1.5 py-0.5 rounded",
                        "text-red-500 border border-red-500/50",
                        "hover:border-red-500 hover:bg-red-500/10",
                        "transition-colors duration-200 cursor-pointer",
                        "outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
                    )}
                    style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
                >
                    Clear selected
                </button>
            </div>
            <div className="flex items-center justify-between">
                <DevicePresets showDimensions={false} showCustomOption={false} side="left" align="start" />
                <div className="flex items-center gap-3">
                    <span
                        className="text-xs text-muted-foreground font-semibold"
                        style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
                    >
                        W × H
                    </span>
                    {customInputs}
                </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-3">
                <span
                    className="text-xs text-muted-foreground font-semibold"
                    style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
                >
                    Gap
                </span>
                <input
                    type="number"
                    min={GAP_MIN}
                    max={GAP_MAX}
                    value={gap}
                    onChange={(e) => setGap(parseInt(e.target.value, 10) || 0)}
                    onFocus={(e) => e.target.select()}
                    className={inputClassName}
                    style={{ backgroundColor: "var(--background)" }}
                />
            </div>
            <div className="flex items-center justify-end gap-3 mt-3">
                <span
                    className="text-xs text-muted-foreground font-semibold"
                    style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
                >
                    Border %
                </span>
                <input
                    type="number"
                    min={BORDER_RADIUS_MIN}
                    max={BORDER_RADIUS_MAX}
                    value={borderRadius}
                    onChange={(e) => setBorderRadius(parseInt(e.target.value, 10) || 0)}
                    onFocus={(e) => e.target.select()}
                    className={inputClassName}
                    style={{ backgroundColor: "var(--background)" }}
                />
            </div>
            <div className="flex items-center justify-end gap-3 mt-3">
                <span
                    className="text-xs text-muted-foreground font-semibold"
                    style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
                >
                    Columns
                </span>
                <input
                    type="number"
                    min={COLUMNS_MIN}
                    max={COLUMNS_MAX}
                    value={columns}
                    onChange={(e) => setColumns(parseInt(e.target.value, 10) || COLUMNS_MIN)}
                    onFocus={(e) => e.target.select()}
                    className={inputClassName}
                    style={{ backgroundColor: "var(--background)" }}
                />
            </div>
            <ExportPreview
                width={devicePresetsState.customWidth ? parseInt(devicePresetsState.customWidth, 10) : 800}
                height={devicePresetsState.customHeight ? parseInt(devicePresetsState.customHeight, 10) : 400}
                gap={gap}
                borderRadius={borderRadius}
                columns={columns}
            />
        </div>
    );

    return (
        <section className="h-full w-full relative px-5 lg:px-14 pt-4 pb-20">
            <div className="flex gap-8">
                {/* Grid container - full width on mobile, responsive on desktop */}
                <div className="w-full md:w-3/5 lg:w-2/3 xl:w-2/3 2xl:w-3/4 3xl:w-4/5">
                    {exportGridContent}
                </div>
                {/* Export panel - sticky on the right, hidden on mobile */}
                <div className="hidden md:block md:w-2/5 lg:w-1/3 xl:w-1/3 2xl:w-1/4 3xl:w-1/5">
                    <div className="sticky top-[185px] lg:top-[201px]">
                        {exportPanelContent}
                    </div>
                </div>
            </div>

            {/* Mobile drawer - only renders on xs/sm screens */}
            {isMobile && (
                <Drawer open={drawerOpen} onOpenChange={(open) => {
                    if (!open) handleDrawerClose();
                }}>
                    <DrawerContent className="disable-animation-on-theme-change">
                        {/* Header with copy/download buttons on top right */}
                        <div className="flex justify-end items-center px-4 pt-4 pb-3 gap-2">
                            <ExportActions />
                        </div>
                        {/* Row with W×H inputs */}
                        <div className="flex items-center px-4 pb-4 gap-3">
                            <span
                                className="text-xs text-muted-foreground font-semibold"
                                style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
                            >
                                W × H
                            </span>
                            {customInputs}
                        </div>
                        <div className="border-t">
                            <div className="px-4 pt-3 pb-2">
                                <span
                                    className="text-sm text-muted-foreground font-semibold"
                                    style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
                                >
                                    Presets
                                </span>
                            </div>
                            <div className="max-h-[50vh] overflow-y-auto pb-4">
                                <ExportDrawerPresetList
                                    expandedCategories={devicePresetsState.expandedCategories}
                                    toggleCategory={devicePresetsState.toggleCategory}
                                    handlePresetSelect={devicePresetsState.handlePresetSelect}
                                    isPresetSelected={devicePresetsState.isPresetSelected}
                                    isAutoSelected={devicePresetsState.isAutoSelected}
                                />
                            </div>
                        </div>
                    </DrawerContent>
                </Drawer>
            )}
        </section>
    );
}

import { ChevronRight } from "lucide-react";
import { devicePresets, deviceCategoryLabels, type DeviceCategory, type DevicePreset } from "@/data/device-presets";

function ExportDrawerPresetList({
    expandedCategories,
    toggleCategory,
    handlePresetSelect,
    isPresetSelected,
    isAutoSelected,
}: {
    expandedCategories: Set<DeviceCategory>;
    toggleCategory: (category: DeviceCategory) => void;
    handlePresetSelect: (preset: DevicePreset | "auto") => void;
    isPresetSelected: (preset: DevicePreset) => boolean;
    isAutoSelected: boolean;
}) {
    return (
        <>
            {/* Auto option at the top */}
            <button
                onClick={() => handlePresetSelect("auto")}
                className={cn(
                    "w-full cursor-pointer relative h-9 min-h-[2.25rem] px-4 py-2 text-sm font-medium transition-colors duration-200 disable-animation-on-theme-change",
                    "text-foreground/80 hover:text-foreground hover:bg-[var(--background)]",
                    isAutoSelected && "text-foreground",
                )}
                style={{
                    fontFamily:
                        'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                }}
            >
                <div className="flex items-center justify-between w-full">
                    <span className={isAutoSelected ? "font-semibold" : ""}>
                        Auto
                    </span>
                    {isAutoSelected && (
                        <Check
                            className="h-4 w-4 text-foreground"
                            strokeWidth={2.5}
                        />
                    )}
                </div>
            </button>
            <div className="border-t border-border/40 my-1 mx-4" />
            {/* Device presets */}
            {(Object.keys(devicePresets) as DeviceCategory[]).map(
                (category) => {
                    const presets = devicePresets[category];
                    const isExpanded = expandedCategories.has(category);
                    return (
                        <div key={category}>
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    toggleCategory(category);
                                }}
                                className="w-full px-4 py-1.5 text-sm font-bold text-foreground/80 hover:text-foreground transition-colors duration-200 flex items-center gap-1 cursor-pointer font-poppins"
                            >
                                <ChevronRight
                                    className={cn(
                                        "h-3.5 w-3.5 transition-transform duration-200",
                                        isExpanded && "rotate-90",
                                    )}
                                    strokeWidth={2.5}
                                />
                                {deviceCategoryLabels[category]}
                            </button>
                            {isExpanded &&
                                presets.map((preset) => {
                                    const isSelected = isPresetSelected(preset);
                                    return (
                                        <button
                                            key={`${category}-${preset.name}`}
                                            onClick={() =>
                                                handlePresetSelect(preset)
                                            }
                                            className={cn(
                                                "w-full cursor-pointer relative h-9 min-h-[2.25rem] px-4 py-2 text-sm font-medium transition-colors duration-200 disable-animation-on-theme-change",
                                                "text-foreground/80 hover:text-foreground hover:bg-[var(--background)]",
                                                isSelected && "text-foreground",
                                            )}
                                            style={{
                                                fontFamily:
                                                    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                                            }}
                                        >
                                            <div className="flex items-center justify-between w-full">
                                                <span
                                                    className={
                                                        isSelected
                                                            ? "font-semibold"
                                                            : ""
                                                    }
                                                >
                                                    {preset.name}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-muted-foreground font-poppins">
                                                        {preset.resolution[0]}×
                                                        {preset.resolution[1]}
                                                    </span>
                                                    {isSelected && (
                                                        <Check
                                                            className="h-4 w-4 text-foreground"
                                                            strokeWidth={2.5}
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            {isExpanded && (
                                <div className="border-t border-border/40 my-1 mx-4" />
                            )}
                        </div>
                    );
                },
            )}
        </>
    );
}

interface ExportPreviewProps {
    width: number;
    height: number;
    gap: number;
    borderRadius: number;
    columns: number;
}

function ExportPreview({ width, height, gap, borderRadius, columns }: ExportPreviewProps) {
    const exportList = useStore(exportStore, (state) => state.exportList);

    if (exportList.length === 0) {
        return null;
    }

    const svgString = generateSVGGrid({
        exportList,
        itemWidth: width,
        itemHeight: height,
        gap,
        borderRadius,
        columns,
    });

    return (
        <div
            className="mt-6 flex-1 min-h-0"
        >
            <div
                className="w-full h-full rounded-lg overflow-hidden border border-input p-2"
            >
                <div
                    className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                    dangerouslySetInnerHTML={{ __html: svgString }}
                />
            </div>
        </div>
    );
}

export type PaletteCardVariant = "default" | "compact";

export interface PaletteCardProps {
    palette: AppPalette;
    index: number;
    urlStyle: StyleWithAuto;
    urlAngle: AngleWithAuto;
    urlSteps: StepsWithAuto;
    previewStyle: PaletteStyle | null;
    previewAngle: number | null;
    previewSteps: number | null;
    onChannelOrderChange: (
        newCoeffs: CosineCoeffs,
        palette: AppPalette,
    ) => void;
    likedSeeds?: Set<string>;
    onShiftClick: (
        palette: AppPalette,
        style: PaletteStyle,
        angle: number,
        steps: number,
        hexColors: string[],
        coeffs: CosineCoeffs,
        seed: string,
    ) => void;
    variant?: PaletteCardVariant;
    idPrefix?: string;
    removeAllOnExportClick?: boolean;
    searchQuery?: string;
    version?: number;
    theme?: string;
    onBadFeedback?: (seed: string) => void;
    style?: React.CSSProperties;
    className?: string;
}

export const PaletteCard = forwardRef<HTMLLIElement, PaletteCardProps>(
    (
        {
            palette,
            urlStyle,
            urlAngle,
            urlSteps,
            previewStyle,
            previewAngle,
            previewSteps,
            likedSeeds,
            onShiftClick,
            variant = "default",
            idPrefix = "",
            removeAllOnExportClick = false,
            searchQuery,
            version,
            onBadFeedback,
            theme,
            style,
            className,
        },
        ref,
    ) => {
        const queryClient = useQueryClient();
        const isDragging = useStore(uiStore, (state) => state.isDragging);
        const customCoeffsMap = useStore(
            uiStore,
            (state) => state.customCoeffs,
        );
        const exportList = useStore(exportStore, (state) => state.exportList);
        const borderRadius = useStore(exportStore, (state) => state.borderRadius);
        const [isMounted, setIsMounted] = useState(false);
        const [isActive, setIsActive] = useState(false);
        const isTouchDeviceRef = useRef(false);
        const copyMenuOpenRef = useRef(false);

        useEffect(() => {
            setIsMounted(true);
            isTouchDeviceRef.current = detectDevice().isTouchDevice;
        }, []);

        const currentCoeffs =
            customCoeffsMap.get(palette.seed) ?? palette.coeffs;
        const hasCustomCoeffs = customCoeffsMap.has(palette.seed);
        const currentSeed = hasCustomCoeffs
            ? serializeCoeffs(currentCoeffs, palette.globals)
            : palette.seed;

        // Check if this palette is in the export list
        const isInExportListValue = exportList.some((item) => {
            const effectiveStyle =
                previewStyle ||
                (urlStyle !== "auto" ? urlStyle : palette.style);
            const effectiveAngle =
                previewAngle ??
                (urlAngle !== "auto" ? urlAngle : palette.angle);
            const effectiveSteps =
                previewSteps ??
                (urlSteps !== "auto" ? urlSteps : palette.steps);
            const exportItem = createExportItem(
                { ...palette, coeffs: currentCoeffs, seed: currentSeed },
                {
                    style: effectiveStyle,
                    steps: effectiveSteps,
                    angle: effectiveAngle,
                    hexColors: [],
                },
            );
            return item.id === exportItem.id;
        });

        const isLikedFromServer = useSyncExternalStore(
            (callback) => {
                return queryClient.getQueryCache().subscribe((event) => {
                    if (event?.query.queryKey[0] === "user-liked-seeds") {
                        callback();
                    }
                });
            },
            () => {
                const cachedSeeds = queryClient.getQueryData<Set<string>>([
                    "user-liked-seeds",
                ]);
                return (cachedSeeds ?? likedSeeds)?.has(currentSeed) ?? false;
            },
            () => likedSeeds?.has(currentSeed) ?? false,
        );

        const currentLikesCount = useSyncExternalStore(
            (callback) => {
                return queryClient.getQueryCache().subscribe((event) => {
                    if (
                        event?.query.queryKey[0] === "palettes" ||
                        event?.query.queryKey[0] === "user-liked-seeds"
                    ) {
                        callback();
                    }
                });
            },
            () => {
                // Check cache for optimistic updates (this finds the palette in any cached query)
                const allQueries = queryClient.getQueriesData<{
                    palettes?: AppPalette[];
                    results?: AppPalette[];
                }>({
                    queryKey: ["palettes"],
                });

                for (const [queryKey, data] of allQueries) {
                    const isSearchQuery = queryKey[1] === "search";
                    const paletteList = isSearchQuery
                        ? data?.results
                        : data?.palettes;
                    if (paletteList) {
                        const found = paletteList.find(
                            (p) => p.seed === currentSeed,
                        );
                        if (found?.likesCount !== undefined) {
                            return found.likesCount;
                        }
                    }
                }

                // Fall back to passed palette likesCount (covers SSR and export items)
                if (palette.likesCount !== undefined) {
                    return palette.likesCount;
                }

                // For modified palettes not in cache, check liked seeds
                const cachedSeeds = queryClient.getQueryData<Set<string>>([
                    "user-liked-seeds",
                ]);
                const isLiked = cachedSeeds?.has(currentSeed) ?? false;
                if (isLiked) {
                    return 1;
                }

                return undefined;
            },
            // Server snapshot - use palette.likesCount directly
            () => palette.likesCount,
        );

        const currentCreatedAt = useSyncExternalStore(
            (callback) => {
                return queryClient.getQueryCache().subscribe((event) => {
                    if (event?.query.queryKey[0] === "palettes") {
                        callback();
                    }
                });
            },
            () => {
                // If palette already has createdAt, use it
                if (palette.createdAt) {
                    return palette.createdAt;
                }

                // Check all palettes queries (includes search results with ["palettes", "search", ...])
                const allQueries = queryClient.getQueriesData<{
                    palettes?: AppPalette[];
                    results?: AppPalette[];
                }>({
                    queryKey: ["palettes"],
                });

                for (const [queryKey, data] of allQueries) {
                    const isSearchQuery = queryKey[1] === "search";
                    const paletteList = isSearchQuery
                        ? data?.results
                        : data?.palettes;
                    if (paletteList) {
                        const found = paletteList.find(
                            (p) => p.seed === currentSeed,
                        );
                        if (found?.createdAt) {
                            return found.createdAt;
                        }
                    }
                }

                return undefined;
            },
            () => palette.createdAt,
        );

        const likeMutation = useLikePaletteMutation();

        const handleClick = (e: React.MouseEvent) => {
            const target = e.target as HTMLElement;
            if (
                target.closest("button") ||
                target.closest("a") ||
                copyMenuOpenRef.current
            ) {
                return;
            }

            // Calculate effective values for shift-click
            const effectiveStyle =
                previewStyle ||
                (urlStyle !== "auto" ? urlStyle : palette.style);
            const effectiveAngle =
                previewAngle ??
                (urlAngle !== "auto" ? urlAngle : palette.angle);
            const effectiveSteps =
                previewSteps ??
                (urlSteps !== "auto" ? urlSteps : palette.steps);
            const hexColors = generateHexColors(
                currentCoeffs,
                palette.globals,
                effectiveSteps,
            );

            // Desktop: shift-click for multi-select
            if (e.shiftKey && !isTouchDeviceRef.current) {
                e.preventDefault();
                onShiftClick(
                    palette,
                    effectiveStyle,
                    effectiveAngle,
                    effectiveSteps,
                    hexColors,
                    currentCoeffs,
                    currentSeed,
                );
                return;
            }

            // Toggle active state for showing controls
            setIsActive((prev) => !prev);
        };

        const handleTouchStart = () => {
            isTouchDeviceRef.current = true;
        };

        const handleTouchEnd = (e: React.TouchEvent) => {
            const target = e.target as HTMLElement;
            if (
                target.closest("button") ||
                target.closest("a") ||
                copyMenuOpenRef.current
            ) {
                return;
            }
            // Toggle active state on touch
            setIsActive((prev) => !prev);
        };

        const { hexColors } = palette;
        const uniqueColorNames = getUniqueColorNames(hexColors);
        const colorList = uniqueColorNames.slice(0, 3).join(", ");
        const moreColors =
            uniqueColorNames.length > 3
                ? ` and ${uniqueColorNames.length - 3} more`
                : "";
        const ariaLabel = `${isActive ? "Deselect" : "Select"} gradient: ${colorList}${moreColors}`;

        const effectiveStyle =
            previewStyle || (urlStyle !== "auto" ? urlStyle : palette.style);
        const effectiveAngle =
            previewAngle ?? (urlAngle !== "auto" ? urlAngle : palette.angle);
        const effectiveSteps =
            previewSteps ?? (urlSteps !== "auto" ? urlSteps : palette.steps);

        // Determine if controls should be visible
        // Touch devices: show controls when tapped (isActive) OR when in export list
        // Non-touch devices: only show controls on hover (CSS handles this)
        const shouldShowControls = isTouchDeviceRef.current
            ? isActive || isInExportListValue
            : false;

        return (
            <li
                ref={ref}
                className={cn(
                    "relative w-full font-poppins",
                    isDragging && "pointer-events-none",
                    className,
                )}
                style={style}
            >
                <div className="group">
                    <div
                        className="relative w-full cursor-pointer outline-none"
                        onClick={handleClick}
                        onTouchStart={handleTouchStart}
                        onTouchEnd={handleTouchEnd}
                        tabIndex={0}
                        role="button"
                        aria-pressed={isActive}
                        aria-label={ariaLabel}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setIsActive((prev) => !prev);
                            }
                        }}
                        onFocus={() => setIsActive(true)}
                        onBlur={(e) => {
                            // Don't deactivate if focus moves within the card
                            if (
                                !e.currentTarget.contains(
                                    e.relatedTarget as Node,
                                )
                            ) {
                                setIsActive(false);
                            }
                        }}
                    >
                        <GradientPreview
                            palette={palette}
                            currentCoeffs={currentCoeffs}
                            currentSeed={currentSeed}
                            isActive={shouldShowControls}
                            isMounted={isMounted}
                            urlStyle={urlStyle}
                            urlAngle={urlAngle}
                            urlSteps={urlSteps}
                            previewStyle={previewStyle}
                            previewAngle={previewAngle}
                            previewSteps={previewSteps}
                            copyMenuOpenRef={copyMenuOpenRef}
                            variant={variant}
                            idPrefix={idPrefix}
                            removeAllOnExportClick={removeAllOnExportClick}
                            borderRadius={borderRadius}
                            searchQuery={searchQuery}
                            version={version ?? (palette as AppPalette & { version?: number }).version}
                            unbiased={(palette as AppPalette & { unbiased?: boolean }).unbiased}
                            onBadFeedback={onBadFeedback}
                        />
                    </div>

                    {/* Palette metadata */}
                    <div className="flex justify-between pt-4 relative pointer-events-none">
                        <div className="flex items-center gap-2 min-h-[28px] pointer-events-none">
                            {!currentCreatedAt && theme && (
                                <span
                                    className="text-sm font-medium text-muted-foreground truncate max-w-[240px] sm:max-w-[320px] pointer-events-auto"
                                    style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
                                >
                                    {theme}
                                </span>
                            )}
                            {currentCreatedAt && (
                                <span className="text-sm text-muted-foreground pointer-events-none select-none">
                                    {formatDistanceToNow(
                                        new Date(currentCreatedAt),
                                        {
                                            addSuffix: false,
                                        },
                                    ).replace("about", "")}
                                </span>
                            )}
                        </div>
                        {/* Like button - only render after mount */}
                        {isMounted && (
                            <div className="flex items-center min-h-[28px] pointer-events-none">
                                <Tooltip delayDuration={1000}>
                                    <TooltipTrigger asChild>
                                        <button
                                            className="group/like flex items-center text-muted-foreground transition-colors duration-200 pointer-events-auto cursor-pointer hover:text-foreground rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                likeMutation.mutate({
                                                    seed: currentSeed,
                                                    steps: effectiveSteps,
                                                    style: effectiveStyle,
                                                    angle: effectiveAngle,
                                                    palette: {
                                                        ...palette,
                                                        coeffs: currentCoeffs,
                                                        seed: currentSeed,
                                                        steps: effectiveSteps,
                                                        style: effectiveStyle,
                                                        angle: effectiveAngle,
                                                    },
                                                });
                                            }}
                                            type="button"
                                            aria-label={
                                                isLikedFromServer
                                                    ? "Unsave palette"
                                                    : "Save palette"
                                            }
                                            disabled={likeMutation.isPending}
                                        >
                                            {(currentLikesCount !== undefined &&
                                                currentLikesCount > 0) ||
                                            (currentLikesCount === undefined &&
                                                isLikedFromServer) ? (
                                                <span className="font-medium pr-4 select-none text-muted-foreground group-hover/like:text-foreground transition-colors duration-200">
                                                    {currentLikesCount ?? 1}
                                                </span>
                                            ) : null}
                                            <Heart
                                                className={cn(
                                                    "w-[22px] h-[22px] transition-all duration-200",
                                                    isLikedFromServer &&
                                                        "fill-red-700 text-red-700 animate-in zoom-in-75",
                                                )}
                                                fill={
                                                    isLikedFromServer
                                                        ? "currentColor"
                                                        : "none"
                                                }
                                            />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent
                                        side="bottom"
                                        align="end"
                                        sideOffset={6}
                                    >
                                        <p>
                                            {isLikedFromServer
                                                ? "Unsave palette"
                                                : "Save palette"}
                                        </p>
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                        )}
                    </div>
                </div>
            </li>
        );
    },
);

PaletteCard.displayName = "PaletteCard";

interface GradientPreviewProps {
    palette: AppPalette;
    currentCoeffs: CosineCoeffs;
    currentSeed: string;
    isActive: boolean;
    isMounted: boolean;
    urlStyle: StyleWithAuto;
    urlAngle: AngleWithAuto;
    urlSteps: StepsWithAuto;
    previewStyle: PaletteStyle | null;
    previewAngle: number | null;
    previewSteps: number | null;
    copyMenuOpenRef: React.MutableRefObject<boolean>;
    variant?: PaletteCardVariant;
    idPrefix?: string;
    removeAllOnExportClick?: boolean;
    borderRadius: number;
    searchQuery?: string;
    version?: number;
    unbiased?: boolean;
    onBadFeedback?: (seed: string) => void;
}

function GradientPreview({
    palette,
    currentCoeffs,
    currentSeed,
    isActive,
    isMounted,
    urlStyle,
    urlAngle,
    urlSteps,
    previewStyle,
    previewAngle,
    previewSteps,
    copyMenuOpenRef,
    variant = "default",
    idPrefix = "",
    removeAllOnExportClick = false,
    borderRadius,
    searchQuery,
    version,
    unbiased,
    onBadFeedback,
}: GradientPreviewProps) {
    const {
        style: paletteStyle,
        angle: paletteAngle,
        steps: paletteSteps,
    } = palette;

    const effectiveStyle =
        previewStyle || (urlStyle !== "auto" ? urlStyle : paletteStyle);
    const effectiveAngle =
        previewAngle ?? (urlAngle !== "auto" ? urlAngle : paletteAngle);
    const effectiveSteps =
        previewSteps ?? (urlSteps !== "auto" ? urlSteps : paletteSteps);

    const hexColors = generateHexColors(
        currentCoeffs,
        palette.globals,
        effectiveSteps,
    );
    const colorsToUse = hexColors;

    const buildQueryString = () => {
        const params = new URLSearchParams();
        if (effectiveStyle !== "linearGradient")
            params.set("style", effectiveStyle);
        if (effectiveAngle !== 90)
            params.set("angle", effectiveAngle.toString());
        if (effectiveSteps !== paletteSteps)
            params.set("steps", effectiveSteps.toString());
        const queryString = params.toString();
        return queryString ? `?${queryString}` : "";
    };

    const creditSearchString = buildQueryString();

    const { cssString, gradientString } = generateCssGradient(
        colorsToUse,
        effectiveStyle,
        effectiveAngle,
        { seed: currentSeed, searchString: creditSearchString },
    );
    const backgroundImage = gradientString;

    const { actualWidth, actualHeight } = useDimensions();

    const svgString = isMounted
        ? generateSvgGradient(
              colorsToUse,
              effectiveStyle,
              effectiveAngle,
              { seed: currentSeed, searchString: creditSearchString },
              null,
              { width: actualWidth, height: actualHeight, borderRadius },
          )
        : "";

    const heightClass = variant === "compact" ? "h-[180px]" : "h-[300px]";
    const glowOpacity = variant === "compact" ? "opacity-20" : "opacity-40";
    const glowHoverOpacity = variant === "compact" ? "group-hover:opacity-20" : "group-hover:opacity-40";
    const glowSize = variant === "compact" ? "-inset-2 blur-md" : "-inset-3 blur-lg";

    return (
        <div className={cn("relative w-full overflow-visible pointer-events-none", heightClass)}>
            {/* Glow effect layer */}
            {isMounted && (
                <div
                    className={cn(
                        "absolute transition-opacity duration-300 z-0 pointer-events-none rounded-xl flex items-center justify-center",
                        glowSize,
                        !isActive ? `opacity-0 ${glowHoverOpacity}` : glowOpacity,
                    )}
                    style={{
                        backgroundImage: gradientString,
                    }}
                    aria-hidden="true"
                />
            )}
            {/* Main gradient preview */}
            <figure
                className={cn(
                    "relative z-10 h-full w-full flex items-center justify-center overflow-hidden rounded-xl pointer-events-none transition-all duration-300",
                )}
                role="img"
                aria-label={getGradientAriaLabel(colorsToUse)}
            >
                <div
                    className="w-full h-full pointer-events-none"
                    style={{
                        backgroundImage,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        backgroundRepeat: "no-repeat",
                    }}
                />

                {/* Dev-only badges */}
                {import.meta.env.DEV && (
                    <div className="absolute bottom-3 right-3 flex gap-1.5 select-none">
                        {version !== undefined && (
                            <span className={cn(
                                "text-xs font-mono px-2 py-1 rounded",
                                unbiased
                                    ? "bg-blue-500/80 text-white"
                                    : "bg-purple-500/80 text-white"
                            )}>
                                v{version} {unbiased ? "U" : "B"}
                            </span>
                        )}
                        {palette.score !== undefined && (
                            <span className="text-xs font-mono px-2 py-1 rounded bg-background/80 text-foreground">
                                {palette.score.toFixed(4)}
                            </span>
                        )}
                    </div>
                )}

                {/* Link button in top left */}
                {isMounted && (
                    <div
                        className={cn(
                            "absolute top-3.5 left-3.5 z-20 pointer-events-auto",
                        )}
                    >
                        <Tooltip delayDuration={500}>
                            <TooltipTrigger asChild>
                                <Link
                                    to="/$seed"
                                    params={{
                                        seed: currentSeed,
                                    }}
                                    search={(search) => ({
                                        ...search,
                                        style: effectiveStyle,
                                        steps: effectiveSteps,
                                        angle: effectiveAngle,
                                    })}
                                    style={{
                                        backgroundColor: "var(--background)",
                                    }}
                                    className={cn(
                                        "disable-animation-on-theme-change inline-flex items-center justify-center rounded-md",
                                        "w-8 h-8 p-0 border border-solid",
                                        "text-muted-foreground hover:text-foreground",
                                        "transition-colors duration-200 cursor-pointer",
                                        "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                        "backdrop-blur-sm",
                                        !isActive
                                            ? "opacity-0 group-hover:opacity-100"
                                            : "opacity-100",
                                        "border-input hover:border-muted-foreground/30 hover:bg-background/60",
                                    )}
                                    aria-label="Edit palette"
                                    suppressHydrationWarning
                                >
                                    <SquarePen
                                        className="w-4 h-4"
                                        strokeWidth={2.5}
                                    />
                                </Link>
                            </TooltipTrigger>
                            <TooltipContent
                                side="bottom"
                                align="start"
                                sideOffset={6}
                            >
                                <span>Edit Palette</span>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                )}

                {/* Copy button and Export button in top right */}
                {isMounted && (
                    <div className="absolute top-3 right-3 z-20 pointer-events-auto flex flex-col gap-2">
                        <CopyButton
                            id={`${idPrefix}${currentSeed}-${effectiveStyle}-${effectiveSteps}-${effectiveAngle}`}
                            cssString={cssString}
                            svgString={svgString}
                            gradientData={currentCoeffs}
                            gradientGlobals={palette.globals}
                            gradientColors={colorsToUse}
                            seed={currentSeed}
                            style={effectiveStyle}
                            angle={effectiveAngle}
                            steps={effectiveSteps}
                            isActive={isActive}
                            onOpenChange={(isOpen) => {
                                copyMenuOpenRef.current = isOpen;
                            }}
                            pngOptions={{
                                style: effectiveStyle as PNGGenerationOptions["style"],
                                hexColors: colorsToUse,
                                angle: effectiveAngle,
                                seed: currentSeed,
                                steps: effectiveSteps,
                                width: actualWidth,
                                height: actualHeight,
                                borderRadius,
                            }}
                        />
                        <ExportButton
                            exportItem={createExportItem(
                                {
                                    ...palette,
                                    coeffs: currentCoeffs,
                                    seed: currentSeed,
                                },
                                {
                                    style: effectiveStyle,
                                    steps: effectiveSteps,
                                    angle: effectiveAngle,
                                    hexColors: colorsToUse,
                                },
                            )}
                            isActive={isActive}
                            removeAllOnClick={removeAllOnExportClick}
                        />
                    </div>
                )}

                {/* Search feedback icons in bottom left - only shown on query routes */}
                {isMounted && searchQuery && (
                    <SearchFeedbackButtons
                        searchQuery={searchQuery}
                        currentSeed={currentSeed}
                        effectiveStyle={effectiveStyle}
                        effectiveAngle={effectiveAngle}
                        effectiveSteps={effectiveSteps}
                        isActive={isActive}
                        onBadFeedback={onBadFeedback}
                    />
                )}
            </figure>
        </div>
    );
}

interface SearchFeedbackButtonsProps {
    searchQuery: string;
    currentSeed: string;
    effectiveStyle: PaletteStyle;
    effectiveAngle: number;
    effectiveSteps: number;
    isActive: boolean;
    onBadFeedback?: (seed: string) => void;
}

function SearchFeedbackButtons({
    searchQuery,
    currentSeed,
    effectiveStyle,
    effectiveAngle,
    effectiveSteps,
    isActive,
    onBadFeedback,
}: SearchFeedbackButtonsProps) {
    const feedbackMutation = useSearchFeedbackMutation();
    const currentFeedback = useStore(searchFeedbackStore, (state) =>
        state.feedback.get(searchQuery)?.get(currentSeed)?.feedback ?? null
    );

    const truncatedQuery = searchQuery.length > 16
        ? searchQuery.slice(0, 16) + "..."
        : searchQuery;

    const handleFeedback = (feedback: FeedbackType) => {
        feedbackMutation.mutate({
            query: searchQuery,
            seed: currentSeed,
            feedback,
            style: effectiveStyle,
            angle: effectiveAngle,
            steps: effectiveSteps,
        });
        if (feedback === "bad" && onBadFeedback) {
            onBadFeedback(currentSeed);
        }
    };

    return (
        <div
            className={cn(
                "absolute bottom-3.5 left-3.5 z-20 pointer-events-auto",
                !isActive
                    ? "opacity-0 group-hover:opacity-100"
                    : "opacity-100",
                "transition-opacity duration-200",
            )}
        >
            <div
                style={{ backgroundColor: "var(--background)" }}
                className={cn(
                    "disable-animation-on-theme-change inline-flex items-center rounded-md",
                    "border border-solid border-input",
                    "backdrop-blur-sm",
                )}
            >
                <Tooltip delayDuration={500}>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleFeedback("good");
                            }}
                            className={cn(
                                "inline-flex items-center justify-center",
                                "w-8 h-8 p-0 rounded-l-[5px]",
                                "transition-colors duration-200 cursor-pointer",
                                "outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-inset",
                                currentFeedback === "good"
                                    ? "text-foreground"
                                    : "text-muted-foreground hover:text-foreground hover:bg-background/60",
                            )}
                            aria-label={`Good fit for "${truncatedQuery}"`}
                            aria-pressed={currentFeedback === "good"}
                        >
                            <ThumbsUp className="w-4 h-4" strokeWidth={2.5} />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="start" sideOffset={6}>
                        <span>Good fit for "{truncatedQuery}"</span>
                    </TooltipContent>
                </Tooltip>
                <div className="w-px h-4 bg-border" />
                <Tooltip delayDuration={500}>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleFeedback("bad");
                            }}
                            className={cn(
                                "inline-flex items-center justify-center",
                                "w-8 h-8 p-0 rounded-r-[5px]",
                                "transition-colors duration-200 cursor-pointer",
                                "outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-inset",
                                currentFeedback === "bad"
                                    ? "text-foreground"
                                    : "text-muted-foreground hover:text-foreground hover:bg-background/60",
                            )}
                            aria-label={`Bad fit for "${truncatedQuery}"`}
                            aria-pressed={currentFeedback === "bad"}
                        >
                            <ThumbsDown className="w-4 h-4" strokeWidth={2.5} />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="start" sideOffset={6}>
                        <span>Bad fit for "{truncatedQuery}"</span>
                    </TooltipContent>
                </Tooltip>
            </div>
        </div>
    );
}
