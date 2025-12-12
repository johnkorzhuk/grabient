import { Monitor, Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { useState, useEffect, useRef, useCallback } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
    devicePresets,
    deviceCategoryLabels,
    type DeviceCategory,
    type DevicePreset,
} from "@/data/device-presets";
import type { SizeType } from "@/stores/export";
import { detectDevice } from "@/lib/deviceDetection";
import { useDimensions } from "@/hooks/useDimensions";
import { setPreviewSize } from "@/stores/ui";

interface DevicePresetsProps {
    size?: SizeType;
    onSizeChange?: (newSize: SizeType) => void;
    className?: string;
    showDimensions?: boolean;
    showCustomOption?: boolean;
    showLabel?: boolean;
    side?: "top" | "bottom" | "left" | "right";
    align?: "start" | "center" | "end";
    customAlignOffset?: number;
    customSideOffset?: number;
}

export function DevicePresets({
    onSizeChange,
    className,
    showDimensions = true,
    showCustomOption = true,
    showLabel = false,
    side,
    align,
    customAlignOffset,
    customSideOffset,
}: DevicePresetsProps) {
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const isDesktop = useMediaQuery("(min-width: 768px)");
    const isMdAndSmaller = useMediaQuery("(max-width: 1023px)");
    const device = detectDevice();

    useEffect(() => {
        setMounted(true);
    }, []);
    const {
        size: urlSize,
        containerDimensions,
        setSize,
        setSizeDebounced,
    } = useDimensions();

    const getInitialExpandedCategory = (): DeviceCategory => {
        if (device.isMobile) return "mobile";
        if (device.isTablet) return "tablet";
        return "desktop";
    };

    const [expandedCategories, setExpandedCategories] = useState<
        Set<DeviceCategory>
    >(() => new Set([getInitialExpandedCategory()]));

    const exportDimensions = urlSize;
    const [customWidth, setCustomWidth] = useState("");
    const [customHeight, setCustomHeight] = useState("");
    const isEditingCustomRef = useRef(false);

    useEffect(() => {
        if (isEditingCustomRef.current) return;

        if (exportDimensions === "auto") {
            setCustomWidth(Math.round(containerDimensions.width).toString());
            setCustomHeight(Math.round(containerDimensions.height).toString());
        } else {
            setCustomWidth(exportDimensions[0].toString());
            setCustomHeight(exportDimensions[1].toString());
        }
    }, [exportDimensions, containerDimensions]);

    const isPresetDimension = (dims: [number, number]): boolean => {
        return Object.values(devicePresets)
            .flat()
            .some(
                (preset) =>
                    preset.resolution[0] === dims[0] &&
                    preset.resolution[1] === dims[1],
            );
    };

    const handlePresetSelect = (preset: DevicePreset | "auto") => {
        const newSize =
            preset === "auto"
                ? "auto"
                : isPresetSelected(preset)
                  ? "auto"
                  : preset.resolution;

        setPreviewSize(null);
        if (onSizeChange) {
            onSizeChange(newSize);
        } else {
            setSize(newSize);
        }
    };

    const handlePresetHover = useCallback(
        (preset: DevicePreset | "auto" | null) => {
            if (preset === null || preset === "auto") {
                setPreviewSize(null);
            } else {
                setPreviewSize(preset.resolution);
            }
        },
        [],
    );

    const handleWidthChange = (value: string) => {
        setCustomWidth(value);
        const width = parseInt(value);
        const height = parseInt(customHeight);
        if (
            !isNaN(width) &&
            !isNaN(height) &&
            width >= 1 &&
            width <= 6000 &&
            height >= 1 &&
            height <= 6000
        ) {
            const newSize: [number, number] = [width, height];
            setPreviewSize(newSize);
            if (onSizeChange) {
                onSizeChange(newSize);
            } else {
                setSizeDebounced(newSize);
            }
        }
    };

    const handleHeightChange = (value: string) => {
        setCustomHeight(value);
        const width = parseInt(customWidth);
        const height = parseInt(value);
        if (
            !isNaN(width) &&
            !isNaN(height) &&
            width >= 1 &&
            width <= 6000 &&
            height >= 1 &&
            height <= 6000
        ) {
            const newSize: [number, number] = [width, height];
            setPreviewSize(newSize);
            if (onSizeChange) {
                onSizeChange(newSize);
            } else {
                setSizeDebounced(newSize);
            }
        }
    };

    const isPresetSelected = (preset: DevicePreset) => {
        if (exportDimensions === "auto") return false;
        return (
            exportDimensions[0] === preset.resolution[0] &&
            exportDimensions[1] === preset.resolution[1]
        );
    };

    const isAutoSelected = exportDimensions === "auto";
    const isCustomSelected =
        exportDimensions !== "auto" && !isPresetDimension(exportDimensions);

    const displayDimensions =
        exportDimensions === "auto"
            ? `${Math.round(containerDimensions.width)}×${Math.round(containerDimensions.height)}`
            : `${exportDimensions[0]}×${exportDimensions[1]}`;

    const toggleCategory = (category: DeviceCategory) => {
        setExpandedCategories((prev) => {
            const next = new Set(prev);
            if (next.has(category)) {
                next.delete(category);
            } else {
                next.add(category);
            }
            return next;
        });
    };

    const handleOpenChange = (newOpen: boolean) => {
        setOpen(newOpen);
        if (!newOpen) {
            setPreviewSize(null);
        }
    };

    const button = (
        <button
            aria-label="Device presets"
            style={{ backgroundColor: "var(--background)" }}
            className={cn(
                "disable-animation-on-theme-change",
                "inline-flex items-center justify-center rounded-md",
                showLabel ? "h-8 px-2.5 gap-1.5" : "w-8 h-8",
                "border border-solid",
                "transition-colors duration-200 cursor-pointer",
                "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                "border-input text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground",
                "data-[state=open]:border-muted-foreground/30 data-[state=open]:text-foreground",
                className,
            )}
            suppressHydrationWarning
        >
            {showLabel && (
                <span
                    className="text-xs font-semibold"
                    style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
                >
                    Presets
                </span>
            )}
            <Monitor className="w-4 h-4" strokeWidth={2.5} />
        </button>
    );

    if (!mounted) {
        return (
            <div className="flex items-center gap-2" suppressHydrationWarning>
                <TooltipProvider>
                    <Tooltip delayDuration={500}>
                        <TooltipTrigger asChild>{button}</TooltipTrigger>
                        <TooltipContent
                            side="bottom"
                            align="start"
                            sideOffset={6}
                        >
                            <span>Device presets</span>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                {showDimensions && (
                    <span
                        className="text-[11px] text-muted-foreground font-poppins leading-none"
                        suppressHydrationWarning
                    >
                        {displayDimensions}
                    </span>
                )}
            </div>
        );
    }

    if (isDesktop) {
        return (
            <div className="flex items-center gap-2">
                <Popover
                    open={open}
                    onOpenChange={handleOpenChange}
                    modal={false}
                >
                    <TooltipProvider>
                        <Tooltip
                            delayDuration={500}
                            {...(open && { open: false })}
                        >
                            <TooltipTrigger asChild>
                                <PopoverTrigger asChild>
                                    {button}
                                </PopoverTrigger>
                            </TooltipTrigger>
                            <TooltipContent
                                side="bottom"
                                align="start"
                                sideOffset={6}
                            >
                                <span>Device presets</span>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                    <PopoverContent
                        side={side || (isMdAndSmaller ? "left" : "bottom")}
                        align={align || "end"}
                        alignOffset={customAlignOffset !== undefined ? customAlignOffset : (!side && isMdAndSmaller ? -12 : 0)}
                        sideOffset={customSideOffset !== undefined ? customSideOffset : 8}
                        className="min-w-[270px] max-h-[500px] overflow-y-auto overscroll-contain disable-animation-on-theme-change bg-background/80 backdrop-blur-sm border border-solid border-input rounded-md p-1.5"
                        onOpenAutoFocus={(e) => e.preventDefault()}
                        onCloseAutoFocus={(e) => e.preventDefault()}
                        onMouseLeave={() => {
                            if (open) {
                                setPreviewSize(null);
                            }
                        }}
                    >
                        <PopoverPresetList
                            expandedCategories={expandedCategories}
                            toggleCategory={toggleCategory}
                            handlePresetSelect={handlePresetSelect}
                            handlePresetHover={handlePresetHover}
                            isPresetSelected={isPresetSelected}
                            isAutoSelected={isAutoSelected}
                            isCustomSelected={isCustomSelected}
                            customWidth={customWidth}
                            customHeight={customHeight}
                            handleWidthChange={handleWidthChange}
                            handleHeightChange={handleHeightChange}
                            isEditingCustomRef={isEditingCustomRef}
                            showCustomOption={showCustomOption}
                        />
                    </PopoverContent>
                </Popover>
                {showDimensions && (
                    <span className="text-[11px] text-muted-foreground font-poppins leading-none">
                        {displayDimensions}
                    </span>
                )}
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <Drawer open={open} onOpenChange={handleOpenChange}>
                <TooltipProvider>
                    <Tooltip delayDuration={500} {...(open && { open: false })}>
                        <TooltipTrigger asChild>
                            <DrawerTrigger asChild>{button}</DrawerTrigger>
                        </TooltipTrigger>
                        <TooltipContent
                            side="bottom"
                            align="start"
                            sideOffset={6}
                        >
                            <span>Device presets</span>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                <DrawerContent className="disable-animation-on-theme-change">
                    <div className="mt-4 border-t max-h-[60vh] overflow-y-auto pb-4">
                        <DrawerPresetList
                            expandedCategories={expandedCategories}
                            toggleCategory={toggleCategory}
                            handlePresetSelect={handlePresetSelect}
                            handlePresetHover={handlePresetHover}
                            isPresetSelected={isPresetSelected}
                            isAutoSelected={isAutoSelected}
                            isCustomSelected={isCustomSelected}
                            customWidth={customWidth}
                            customHeight={customHeight}
                            handleWidthChange={handleWidthChange}
                            handleHeightChange={handleHeightChange}
                            isEditingCustomRef={isEditingCustomRef}
                            showCustomOption={showCustomOption}
                        />
                    </div>
                </DrawerContent>
            </Drawer>
            {showDimensions && (
                <span className="text-[12px] text-muted-foreground font-poppins leading-none">
                    {displayDimensions}
                </span>
            )}
        </div>
    );
}

function PopoverPresetList({
    expandedCategories,
    toggleCategory,
    handlePresetSelect,
    handlePresetHover,
    isPresetSelected,
    isAutoSelected,
    isCustomSelected,
    customWidth,
    customHeight,
    handleWidthChange,
    handleHeightChange,
    isEditingCustomRef,
    showCustomOption = true,
}: {
    expandedCategories: Set<DeviceCategory>;
    toggleCategory: (category: DeviceCategory) => void;
    handlePresetSelect: (preset: DevicePreset | "auto") => void;
    handlePresetHover: (preset: DevicePreset | "auto" | null) => void;
    isPresetSelected: (preset: DevicePreset) => boolean;
    isAutoSelected: boolean;
    isCustomSelected: boolean;
    customWidth: string;
    customHeight: string;
    handleWidthChange: (value: string) => void;
    handleHeightChange: (value: string) => void;
    isEditingCustomRef: React.RefObject<boolean>;
    showCustomOption?: boolean;
}) {
    return (
        <>
            {(Object.keys(devicePresets) as DeviceCategory[]).map(
                (category) => {
                    const presets = devicePresets[category];
                    return (
                        <Collapsible
                            key={category}
                            open={expandedCategories.has(category)}
                            onOpenChange={() => toggleCategory(category)}
                        >
                            <CollapsibleTrigger asChild>
                                <button className="w-full px-2 py-1.5 text-sm font-bold text-foreground/80 hover:text-foreground transition-colors duration-200 flex items-center gap-1 cursor-pointer font-poppins">
                                    <ChevronRight
                                        className={cn(
                                            "h-3.5 w-3.5 transition-transform duration-200",
                                            expandedCategories.has(category) &&
                                                "rotate-90",
                                        )}
                                        strokeWidth={2.5}
                                    />
                                    {deviceCategoryLabels[category]}
                                </button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                                {presets.map((preset) => {
                                    const isSelected = isPresetSelected(preset);
                                    return (
                                        <button
                                            key={`${category}-${preset.name}`}
                                            onClick={() =>
                                                handlePresetSelect(preset)
                                            }
                                            onMouseEnter={() =>
                                                handlePresetHover(preset)
                                            }
                                            className={cn(
                                                "w-full cursor-pointer relative h-9 min-h-[2.25rem] px-3 py-2 text-sm font-medium transition-colors duration-200 disable-animation-on-theme-change rounded-sm",
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
                            </CollapsibleContent>
                            {expandedCategories.has(category) && (
                                <div className="border-t border-border/40 my-1" />
                            )}
                        </Collapsible>
                    );
                },
            )}
            <button
                onClick={() => handlePresetSelect("auto")}
                onMouseEnter={() => handlePresetHover("auto")}
                className={cn(
                    "w-full cursor-pointer relative h-9 min-h-[2.25rem] px-3 py-2 text-sm font-bold transition-colors duration-200 disable-animation-on-theme-change font-poppins rounded-sm",
                    "text-foreground/80 hover:text-foreground hover:bg-[var(--background)]",
                    isAutoSelected && "text-foreground",
                )}
            >
                <div className="flex items-center justify-between w-full">
                    <span className={isAutoSelected ? "font-bold" : ""}>
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
            {showCustomOption && (
                <>
                    <div className="border-t border-border/40 my-1" />
                    <div
                        className={cn(
                            "relative min-h-[2.25rem] px-3 py-2 text-sm font-bold transition-colors duration-200 disable-animation-on-theme-change font-poppins",
                            "text-foreground/80",
                            isCustomSelected && "text-foreground",
                        )}
                    >
                        <div className="flex items-center justify-between w-full gap-2">
                            <span className={isCustomSelected ? "font-bold" : ""}>
                                W × H
                            </span>
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
                                        value={customWidth}
                                        onChange={(e) => handleWidthChange(e.target.value)}
                                        onFocus={(e) => {
                                            e.target.select();
                                            isEditingCustomRef.current = true;
                                        }}
                                        onBlur={() => {
                                            isEditingCustomRef.current = false;
                                        }}
                                        onKeyDown={(e) => {
                                            e.stopPropagation();
                                            if (e.key === "Enter") {
                                                e.currentTarget.blur();
                                            } else if (
                                                e.key === "ArrowUp" ||
                                                e.key === "ArrowDown"
                                            ) {
                                                e.preventDefault();
                                                const currentValue =
                                                    parseInt(customWidth) || 0;
                                                const increment = e.shiftKey ? 10 : 1;
                                                const newValue =
                                                    e.key === "ArrowUp"
                                                        ? Math.min(
                                                              6000,
                                                              currentValue + increment,
                                                          )
                                                        : Math.max(
                                                              1,
                                                              currentValue - increment,
                                                          );
                                                handleWidthChange(newValue.toString());
                                            }
                                        }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={(e) => e.stopPropagation()}
                                        onPointerDown={(e) => e.stopPropagation()}
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
                                        suppressHydrationWarning
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
                                        value={customHeight}
                                        onChange={(e) => handleHeightChange(e.target.value)}
                                        onFocus={(e) => {
                                            e.target.select();
                                            isEditingCustomRef.current = true;
                                        }}
                                        onBlur={() => {
                                            isEditingCustomRef.current = false;
                                        }}
                                        onKeyDown={(e) => {
                                            e.stopPropagation();
                                            if (e.key === "Enter") {
                                                e.currentTarget.blur();
                                            } else if (
                                                e.key === "ArrowUp" ||
                                                e.key === "ArrowDown"
                                            ) {
                                                e.preventDefault();
                                                const currentValue =
                                                    parseInt(customHeight) || 0;
                                                const increment = e.shiftKey ? 10 : 1;
                                                const newValue =
                                                    e.key === "ArrowUp"
                                                        ? Math.min(
                                                              6000,
                                                              currentValue + increment,
                                                          )
                                                        : Math.max(
                                                              1,
                                                              currentValue - increment,
                                                          );
                                                handleHeightChange(newValue.toString());
                                            }
                                        }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={(e) => e.stopPropagation()}
                                        onPointerDown={(e) => e.stopPropagation()}
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
                                        suppressHydrationWarning
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </>
    );
}

function DrawerPresetList({
    expandedCategories,
    toggleCategory,
    handlePresetSelect,
    handlePresetHover: _handlePresetHover,
    isPresetSelected,
    isAutoSelected,
    isCustomSelected,
    customWidth,
    customHeight,
    handleWidthChange,
    handleHeightChange,
    isEditingCustomRef,
    showCustomOption = true,
}: {
    expandedCategories: Set<DeviceCategory>;
    toggleCategory: (category: DeviceCategory) => void;
    handlePresetSelect: (preset: DevicePreset | "auto") => void;
    handlePresetHover: (preset: DevicePreset | "auto" | null) => void;
    isPresetSelected: (preset: DevicePreset) => boolean;
    isAutoSelected: boolean;
    isCustomSelected: boolean;
    customWidth: string;
    customHeight: string;
    handleWidthChange: (value: string) => void;
    handleHeightChange: (value: string) => void;
    isEditingCustomRef: React.MutableRefObject<boolean>;
    showCustomOption?: boolean;
}) {
    return (
        <>
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
                                className="w-full px-2 py-1.5 text-sm font-bold text-foreground/80 hover:text-foreground transition-colors duration-200 flex items-center gap-1 cursor-pointer font-poppins"
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
                                                "w-full cursor-pointer relative h-9 min-h-[2.25rem] px-3 py-2 text-sm font-medium transition-colors duration-200 disable-animation-on-theme-change",
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
                                <div className="border-t border-border/40 my-1" />
                            )}
                        </div>
                    );
                },
            )}
            <button
                onClick={() => handlePresetSelect("auto")}
                className={cn(
                    "w-full cursor-pointer relative h-9 min-h-[2.25rem] px-3 py-2 text-sm font-bold transition-colors duration-200 disable-animation-on-theme-change",
                    "text-foreground/80 hover:text-foreground hover:bg-[var(--background)]",
                    isAutoSelected && "text-foreground",
                )}
                style={{
                    fontFamily:
                        'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                }}
            >
                <div className="flex items-center justify-between w-full">
                    <span className={isAutoSelected ? "font-bold" : ""}>
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
            {showCustomOption && (
                <div
                    className={cn(
                        "w-full relative min-h-[2.25rem] px-3 py-2 text-sm font-bold transition-colors duration-200 disable-animation-on-theme-change",
                        "text-foreground/80 hover:text-foreground",
                        isCustomSelected && "text-foreground",
                    )}
                    style={{
                        fontFamily:
                            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    }}
                >
                    <div className="flex items-center justify-between w-full gap-2">
                        <span className={isCustomSelected ? "font-bold" : ""}>
                            W × H
                        </span>
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
                                    value={customWidth}
                                    onChange={(e) => handleWidthChange(e.target.value)}
                                    onFocus={(e) => {
                                        e.target.select();
                                        isEditingCustomRef.current = true;
                                    }}
                                    onBlur={() => {
                                        isEditingCustomRef.current = false;
                                    }}
                                    onKeyDown={(e) => {
                                        e.stopPropagation();
                                        if (e.key === "Enter") {
                                            e.currentTarget.blur();
                                        } else if (
                                            e.key === "ArrowUp" ||
                                            e.key === "ArrowDown"
                                        ) {
                                            e.preventDefault();
                                            const currentValue =
                                                parseInt(customWidth) || 0;
                                            const increment = e.shiftKey ? 10 : 1;
                                            const newValue =
                                                e.key === "ArrowUp"
                                                    ? Math.min(
                                                          6000,
                                                          currentValue + increment,
                                                      )
                                                    : Math.max(
                                                          1,
                                                          currentValue - increment,
                                                      );
                                            handleWidthChange(newValue.toString());
                                        }
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    onPointerDown={(e) => e.stopPropagation()}
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
                                    suppressHydrationWarning
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
                                    value={customHeight}
                                    onChange={(e) => handleHeightChange(e.target.value)}
                                    onFocus={(e) => {
                                        e.target.select();
                                        isEditingCustomRef.current = true;
                                    }}
                                    onBlur={() => {
                                        isEditingCustomRef.current = false;
                                    }}
                                    onKeyDown={(e) => {
                                        e.stopPropagation();
                                        if (e.key === "Enter") {
                                            e.currentTarget.blur();
                                        } else if (
                                            e.key === "ArrowUp" ||
                                            e.key === "ArrowDown"
                                        ) {
                                            e.preventDefault();
                                            const currentValue =
                                                parseInt(customHeight) || 0;
                                            const increment = e.shiftKey ? 10 : 1;
                                            const newValue =
                                                e.key === "ArrowUp"
                                                    ? Math.min(
                                                          6000,
                                                          currentValue + increment,
                                                      )
                                                    : Math.max(
                                                          1,
                                                          currentValue - increment,
                                                      );
                                            handleHeightChange(newValue.toString());
                                        }
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    onPointerDown={(e) => e.stopPropagation()}
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
                                    suppressHydrationWarning
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export function useDevicePresetsState(onSizeChange?: (newSize: SizeType) => void) {
    const device = detectDevice();
    const {
        size: urlSize,
        containerDimensions,
        setSize,
        setSizeDebounced,
    } = useDimensions();

    const getInitialExpandedCategory = (): DeviceCategory => {
        if (device.isMobile) return "mobile";
        if (device.isTablet) return "tablet";
        return "desktop";
    };

    const [expandedCategories, setExpandedCategories] = useState<
        Set<DeviceCategory>
    >(() => new Set([getInitialExpandedCategory()]));

    const exportDimensions = urlSize;
    const [customWidth, setCustomWidth] = useState("");
    const [customHeight, setCustomHeight] = useState("");
    const isEditingCustomRef = useRef(false);

    useEffect(() => {
        if (isEditingCustomRef.current) return;

        if (exportDimensions === "auto") {
            setCustomWidth(Math.round(containerDimensions.width).toString());
            setCustomHeight(Math.round(containerDimensions.height).toString());
        } else {
            setCustomWidth(exportDimensions[0].toString());
            setCustomHeight(exportDimensions[1].toString());
        }
    }, [exportDimensions, containerDimensions]);

    const isPresetDimension = (dims: [number, number]): boolean => {
        return Object.values(devicePresets)
            .flat()
            .some(
                (preset) =>
                    preset.resolution[0] === dims[0] &&
                    preset.resolution[1] === dims[1],
            );
    };

    const isPresetSelected = (preset: DevicePreset) => {
        if (exportDimensions === "auto") return false;
        return (
            exportDimensions[0] === preset.resolution[0] &&
            exportDimensions[1] === preset.resolution[1]
        );
    };

    const handlePresetSelect = (preset: DevicePreset | "auto") => {
        const newSize =
            preset === "auto"
                ? "auto"
                : isPresetSelected(preset)
                  ? "auto"
                  : preset.resolution;

        setPreviewSize(null);
        if (onSizeChange) {
            onSizeChange(newSize);
        } else {
            setSize(newSize);
        }
    };

    const handlePresetHover = useCallback(
        (preset: DevicePreset | "auto" | null) => {
            if (preset === null || preset === "auto") {
                setPreviewSize(null);
            } else {
                setPreviewSize(preset.resolution);
            }
        },
        [],
    );

    const handleWidthChange = (value: string) => {
        setCustomWidth(value);
        const width = parseInt(value);
        const height = parseInt(customHeight);
        if (
            !isNaN(width) &&
            !isNaN(height) &&
            width >= 1 &&
            width <= 6000 &&
            height >= 1 &&
            height <= 6000
        ) {
            const newSize: [number, number] = [width, height];
            setPreviewSize(newSize);
            if (onSizeChange) {
                onSizeChange(newSize);
            } else {
                setSizeDebounced(newSize);
            }
        }
    };

    const handleHeightChange = (value: string) => {
        setCustomHeight(value);
        const width = parseInt(customWidth);
        const height = parseInt(value);
        if (
            !isNaN(width) &&
            !isNaN(height) &&
            width >= 1 &&
            width <= 6000 &&
            height >= 1 &&
            height <= 6000
        ) {
            const newSize: [number, number] = [width, height];
            setPreviewSize(newSize);
            if (onSizeChange) {
                onSizeChange(newSize);
            } else {
                setSizeDebounced(newSize);
            }
        }
    };

    const toggleCategory = (category: DeviceCategory) => {
        setExpandedCategories((prev) => {
            const next = new Set(prev);
            if (next.has(category)) {
                next.delete(category);
            } else {
                next.add(category);
            }
            return next;
        });
    };

    const isAutoSelected = exportDimensions === "auto";
    const isCustomSelected =
        exportDimensions !== "auto" && !isPresetDimension(exportDimensions);

    return {
        expandedCategories,
        toggleCategory,
        handlePresetSelect,
        handlePresetHover,
        isPresetSelected,
        isAutoSelected,
        isCustomSelected,
        customWidth,
        customHeight,
        handleWidthChange,
        handleHeightChange,
        isEditingCustomRef,
    };
}

export { DrawerPresetList };
