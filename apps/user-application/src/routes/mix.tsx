import { createFileRoute, stripSearchParams, useRouter, useLocation, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/header/AppHeader";
import { Footer } from "@/components/layout/Footer";
import { useTheme } from "@/components/theme/theme-provider";
import { useStore } from "@tanstack/react-store";
import { exportStore, addToExportList, isInExportList } from "@/stores/export";
import { AngleInput } from "@/components/navigation/AngleInput";
import { StepsInput } from "@/components/navigation/StepsInput";
import { StyleSelect } from "@/components/navigation/StyleSelect";
import {
    setPreviewStyle,
    setPreviewAngle,
    setPreviewSteps,
    uiStore,
    toggleIsAdvancedOpen,
    setCustomCoeffs,
    setPreviousRoute,
} from "@/stores/ui";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";
import { SlidersHorizontal, X, RotateCcw, Home, Plus, Dna } from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    coeffsSchema,
    paletteStyleValidator,
    styleWithAutoValidator,
    angleWithAutoValidator,
    stepsWithAutoValidator,
    DEFAULT_GLOBALS,
} from "@repo/data-ops/valibot-schema/grabient";
import { generateMix } from "@repo/data-ops/gradient-gen";
import { serializeCoeffs } from "@repo/data-ops/serialization";
import * as v from "valibot";
import type { ExportItem, AppPalette } from "@/queries/palettes";
import { userLikedSeedsQueryOptions } from "@/queries/palettes";
import { PaletteCard } from "@/components/palettes/palettes-grid";
import { generateHexColors, createExportItem } from "@/lib/paletteUtils";
import { useQuery } from "@tanstack/react-query";

type CosineCoeffs = v.InferOutput<typeof coeffsSchema>;
type PaletteStyle = v.InferOutput<typeof paletteStyleValidator>;

const SEARCH_DEFAULTS = {
    style: "auto" as const,
    angle: "auto" as const,
    steps: "auto" as const,
};

const searchValidatorSchema = v.object({
    style: v.optional(
        v.fallback(styleWithAutoValidator, SEARCH_DEFAULTS.style),
        SEARCH_DEFAULTS.style,
    ),
    angle: v.optional(
        v.fallback(angleWithAutoValidator, SEARCH_DEFAULTS.angle),
        SEARCH_DEFAULTS.angle,
    ),
    steps: v.optional(
        v.fallback(stepsWithAutoValidator, SEARCH_DEFAULTS.steps),
        SEARCH_DEFAULTS.steps,
    ),
});

export const Route = createFileRoute("/mix")({
    validateSearch: searchValidatorSchema,
    search: {
        middlewares: [stripSearchParams(SEARCH_DEFAULTS)],
    },
    onLeave: ({ search }) => {
        const searchParams: Record<string, unknown> = {};
        if (search.style !== "auto") searchParams.style = search.style;
        if (search.angle !== "auto") searchParams.angle = search.angle;
        if (search.steps !== "auto") searchParams.steps = search.steps;
        setPreviousRoute({ path: "/mix", search: searchParams });
    },
    component: MixPage,
});

function getUniquePalettesFromExportList(
    exportList: ExportItem[],
): ExportItem[] {
    const seen = new Set<string>();
    const uniquePalettes: ExportItem[] = [];
    for (const item of exportList) {
        if (!seen.has(item.seed)) {
            seen.add(item.seed);
            uniquePalettes.push(item);
        }
    }
    return uniquePalettes;
}

function EmptyMixState() {
    const previousRoute = useStore(uiStore, (state) => state.previousRoute);
    const navSelect = useStore(uiStore, (state) => state.navSelect);

    const homePath = previousRoute?.path ?? navSelect;
    const homeSearch = previousRoute?.search;

    return (
        <div className="flex flex-col items-center justify-center gap-6 text-center px-5" suppressHydrationWarning>
            <div className="flex flex-col items-center gap-2">
                <p className="text-lg font-medium text-foreground">
                    No palettes selected
                </p>
                <p className="text-sm text-muted-foreground max-w-[280px]">
                    Add palettes to your mix by clicking the <span className="inline-flex items-center justify-center align-middle w-5 h-5 rounded border border-muted-foreground/40 mx-0.5 pointer-events-none select-none" aria-hidden="true"><Plus size={12} /></span> select button on any gradient
                </p>
            </div>
            <Link
                to={homePath}
                search={homeSearch}
                style={{ backgroundColor: "var(--background)" }}
                className={cn(
                    "disable-animation-on-theme-change inline-flex items-center justify-center gap-2 rounded-md",
                    "font-medium text-sm h-10 px-4 border border-solid",
                    "border-input hover:border-muted-foreground/30 hover:bg-background/60",
                    "text-muted-foreground hover:text-foreground",
                    "transition-colors duration-200",
                    "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                )}
                suppressHydrationWarning
            >
                <Home size={16} />
                Browse palettes
            </Link>
        </div>
    );
}

function MixPage() {
    const {
        style: urlStyle,
        angle: urlAngle,
        steps: urlSteps,
    } = Route.useSearch();
    const router = useRouter();
    const location = useLocation();
    const exportList = useStore(exportStore, (state) => state.exportList);
    const previewStyle = useStore(uiStore, (state) => state.previewStyle);
    const previewAngle = useStore(uiStore, (state) => state.previewAngle);
    const previewSteps = useStore(uiStore, (state) => state.previewSteps);
    const isAdvancedOpen = useStore(uiStore, (state) => state.isAdvancedOpen);
    const { resolved: theme } = useTheme();
    const lastClickedSeedRef = useRef<string | null>(null);

    const { data: likedSeeds } = useQuery(userLikedSeedsQueryOptions());

    const [contentHeight, setContentHeight] = useState(0);
    const contentRef = useRef<HTMLDivElement>(null);
    const shouldAnimateRef = useRef(!isAdvancedOpen);

    const [generatedPalettes, setGeneratedPalettes] = useState<AppPalette[]>([]);
    const [generateCount, setGenerateCount] = useState(20);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const hasNonAutoValues =
        urlStyle !== "auto" || urlAngle !== "auto" || urlSteps !== "auto";

    const handleReset = async () => {
        await router.navigate({
            to: location.pathname,
            search: (prev) => ({
                ...prev,
                style: "auto",
                angle: "auto",
                steps: "auto",
            }),
            replace: true,
            resetScroll: false,
        });
        setPreviewStyle(null);
        setPreviewAngle(null);
        setPreviewSteps(null);
    };

    useEffect(() => {
        if (contentRef.current) {
            setContentHeight(contentRef.current.scrollHeight);
        }
    }, [isAdvancedOpen]);

    useEffect(() => {
        shouldAnimateRef.current = true;
    }, []);

    const uniquePalettesRaw = getUniquePalettesFromExportList(exportList);
    // Use empty array during SSR to avoid hydration mismatch (exportStore is client-only)
    const uniquePalettes = mounted ? uniquePalettesRaw : [];
    const inputSeedsKey = uniquePalettesRaw.map((p) => p.seed).join(",");

    const doGenerate = () => {
        if (uniquePalettesRaw.length === 0) {
            setGeneratedPalettes([]);
            return;
        }

        const inputCoeffs = uniquePalettesRaw.map((p) => p.coeffs);
        const result = generateMix(inputCoeffs, { count: generateCount });

        const generated: AppPalette[] = result.output.map((item) => {
            const seed = serializeCoeffs(item.coeffs, DEFAULT_GLOBALS);
            const hexColors = generateHexColors(item.coeffs, DEFAULT_GLOBALS, 7);
            return {
                coeffs: item.coeffs,
                globals: DEFAULT_GLOBALS,
                style: "linearGradient" as const,
                steps: 7,
                angle: 90,
                seed,
                hexColors,
                createdAt: null,
            };
        });

        setGeneratedPalettes(generated);
    };

    // Generate on mount and when items are removed; keep results when items are added
    const hasGeneratedRef = useRef(false);
    const prevCountRef = useRef(uniquePalettesRaw.length);
    useEffect(() => {
        const prevCount = prevCountRef.current;
        const currentCount = uniquePalettesRaw.length;

        if (!hasGeneratedRef.current && currentCount > 0) {
            // Initial generation on mount
            doGenerate();
            hasGeneratedRef.current = true;
        } else if (currentCount < prevCount && currentCount > 0) {
            // Items removed → regenerate
            doGenerate();
        } else if (currentCount === 0) {
            // All items removed → clear
            setGeneratedPalettes([]);
        }
        // Items added → keep existing generated palettes

        prevCountRef.current = currentCount;
    }, [inputSeedsKey]);

    const handleGenerate = () => {
        doGenerate();
    };

    const count = uniquePalettes.length;

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
            ? uniquePalettes.findIndex(
                  (p) => p.seed === lastClickedSeedRef.current,
              )
            : -1;
        const endIndex = uniquePalettes.findIndex(
            (p) => p.seed === palette.seed,
        );

        if (startIndex !== -1 && startIndex !== endIndex) {
            const [start, end] =
                startIndex < endIndex
                    ? [startIndex, endIndex]
                    : [endIndex, startIndex];
            for (let i = start; i <= end; i++) {
                const p = uniquePalettes[i]!;
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

                const pExportItem = createExportItem(
                    {
                        ...p,
                        coeffs: p.coeffs,
                        seed: p.seed,
                        createdAt: null,
                    } as AppPalette,
                    {
                        style: pEffectiveStyle,
                        steps: pEffectiveSteps,
                        angle: pEffectiveAngle,
                        hexColors: pHexColors,
                    },
                );

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

    const palettesAsAppPalettes: AppPalette[] = uniquePalettes.map((item) => ({
        coeffs: item.coeffs,
        globals: item.globals,
        style: item.style,
        steps: item.steps,
        angle: item.angle,
        seed: item.seed,
        hexColors: item.hexColors,
        likesCount: item.likesCount,
        createdAt: item.createdAt ?? null,
    }));

    return (
        <div className="min-h-screen-dynamic flex flex-col">
            <AppHeader />

            {/* Mobile layout (xs/sm) */}
            <main className="md:hidden w-full min-h-viewport-content">
                {/* Header controls */}
                <div className="shrink-0 bg-background">
                    <div className="px-5 py-4 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <h1 className="text-2xl font-bold text-foreground" suppressHydrationWarning>
                                Mix {count} {count === 1 ? "palette" : "palettes"}
                            </h1>
                            <div className="flex items-center gap-1.5">
                            <Tooltip delayDuration={500}>
                                <TooltipTrigger asChild>
                                    <div
                                        suppressHydrationWarning
                                        style={{ backgroundColor: "var(--background)" }}
                                        className={cn(
                                            "disable-animation-on-theme-change inline-flex items-center rounded-md",
                                            "h-8.5 border border-solid",
                                            "border-input",
                                            uniquePalettes.length === 0 && "opacity-50",
                                        )}
                                    >
                                        <button
                                            onClick={handleGenerate}
                                            disabled={uniquePalettes.length === 0}
                                            className={cn(
                                                "inline-flex items-center justify-center gap-1.5 px-3 h-full",
                                                "hover:bg-background/60 rounded-l-md",
                                                "text-muted-foreground hover:text-foreground",
                                                "transition-colors duration-200 cursor-pointer",
                                                "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                                "text-sm font-medium",
                                                uniquePalettes.length === 0 && "cursor-not-allowed",
                                            )}
                                            aria-label="Generate new mix"
                                            suppressHydrationWarning
                                        >
                                            Generate
                                            <Dna
                                                size={14}
                                                style={{ color: "currentColor" }}
                                            />
                                        </button>
                                        <div className="h-5 w-px bg-border" />
                                        <input
                                            type="number"
                                            min={5}
                                            max={100}
                                            value={generateCount}
                                            onChange={(e) => {
                                                const val = Math.min(100, Math.max(5, parseInt(e.target.value) || 5));
                                                setGenerateCount(val);
                                            }}
                                            disabled={uniquePalettes.length === 0}
                                            className={cn(
                                                "w-12 h-full px-2 text-sm font-medium text-center",
                                                "bg-transparent text-muted-foreground",
                                                "outline-none focus-visible:ring-2 focus-visible:ring-ring/70 rounded-r-md",
                                                "appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                                                uniquePalettes.length === 0 && "cursor-not-allowed",
                                            )}
                                            aria-label="Number of palettes to generate"
                                            suppressHydrationWarning
                                        />
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" align="end" sideOffset={6} suppressHydrationWarning>
                                    {uniquePalettes.length === 0
                                        ? "Add palettes to mix first"
                                        : "Generate new palettes from mix (5-100)"}
                                </TooltipContent>
                            </Tooltip>
                            {hasNonAutoValues && (
                                <Tooltip delayDuration={500}>
                                    <TooltipTrigger asChild>
                                        <button
                                            onClick={handleReset}
                                            style={{
                                                backgroundColor: "var(--background)",
                                            }}
                                            className={cn(
                                                "disable-animation-on-theme-change inline-flex items-center justify-center rounded-md",
                                                "h-8.5 w-8.5 p-0 border border-solid",
                                                "border-input hover:border-muted-foreground/30 hover:bg-background/60",
                                                "text-muted-foreground hover:text-foreground",
                                                "transition-colors duration-200 cursor-pointer",
                                                "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                            )}
                                            aria-label="Reset style, angle, and steps to auto"
                                            suppressHydrationWarning
                                        >
                                            <RotateCcw
                                                size={14}
                                                style={{ color: "currentColor" }}
                                            />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" align="end" sideOffset={6}>
                                        Reset to auto
                                    </TooltipContent>
                                </Tooltip>
                            )}
                            <StyleSelect
                                value={urlStyle}
                                className="subpixel-antialiased"
                                onPreviewChange={setPreviewStyle}
                            />
                            <Tooltip delayDuration={500}>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={toggleIsAdvancedOpen}
                                        style={{
                                            backgroundColor:
                                                "var(--background)",
                                        }}
                                        className={cn(
                                            "disable-animation-on-theme-change inline-flex items-center justify-center rounded-md",
                                            "h-8.5 w-8.5 p-0 border border-solid",
                                            "border-input hover:border-muted-foreground/30 hover:bg-background/60",
                                            "text-muted-foreground hover:text-foreground",
                                            "transition-colors duration-200 cursor-pointer",
                                            "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                        )}
                                        aria-label={
                                            isAdvancedOpen
                                                ? "Close advanced options"
                                                : "Open advanced options"
                                        }
                                        aria-expanded={isAdvancedOpen}
                                        suppressHydrationWarning
                                    >
                                        {isAdvancedOpen ? (
                                            <X
                                                size={18}
                                                style={{
                                                    color: "currentColor",
                                                }}
                                            />
                                        ) : (
                                            <SlidersHorizontal
                                                size={16}
                                                style={{
                                                    color: "currentColor",
                                                }}
                                            />
                                        )}
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent
                                    side="top"
                                    align="end"
                                    sideOffset={6}
                                >
                                    {isAdvancedOpen
                                        ? "Close options"
                                        : "More options"}
                                </TooltipContent>
                            </Tooltip>
                            </div>
                        </div>
                    </div>
                    {/* Expandable panel for angle and steps */}
                    <div
                        className="overflow-hidden"
                        style={{
                            height: isAdvancedOpen
                                ? `${contentHeight}px`
                                : "0px",
                            opacity: isAdvancedOpen ? 1 : 0,
                            transition: shouldAnimateRef.current
                                ? "height 200ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms cubic-bezier(0.4, 0, 0.2, 1)"
                                : "none",
                        }}
                    >
                        <div
                            ref={contentRef}
                            className="px-5 flex justify-end gap-1.5"
                            style={{
                                paddingBottom: isAdvancedOpen ? "12px" : "0px",
                            }}
                        >
                            <AngleInput
                                value={urlAngle}
                                className="subpixel-antialiased"
                                onPreviewChange={setPreviewAngle}
                            />
                            <StepsInput
                                value={urlSteps}
                                className="subpixel-antialiased"
                                onPreviewChange={setPreviewSteps}
                            />
                        </div>
                    </div>
                </div>

                {/* Content area */}
                {uniquePalettes.length === 0 ? (
                    <div className="h-viewport-content flex items-center justify-center">
                        <EmptyMixState />
                    </div>
                ) : (
                    <>
                        {/* Input palettes */}
                        <ol className="px-5 pt-4 pb-8 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6 auto-rows-[220px]">
                            {palettesAsAppPalettes.map((palette, index) => (
                                <PaletteCard
                                    key={`mix-mobile-${palette.seed}`}
                                    palette={palette}
                                    index={index}
                                    urlStyle={urlStyle}
                                    urlAngle={urlAngle}
                                    urlSteps={urlSteps}
                                    previewStyle={previewStyle}
                                    previewAngle={previewAngle}
                                    previewSteps={previewSteps}
                                    onChannelOrderChange={
                                        onChannelOrderChange
                                    }
                                    onShiftClick={handleShiftClick}
                                    likedSeeds={likedSeeds}
                                    variant="compact"
                                    idPrefix="mix-mobile-"
                                    removeAllOnExportClick
                                />
                            ))}
                        </ol>

                        {/* Output palettes */}
                        <div>
                            {generatedPalettes.length > 0 ? (
                                <ol className="px-5 py-4 grid grid-cols-2 sm:grid-cols-3 gap-3 auto-rows-[100px]">
                                    {generatedPalettes.map((palette, index) => (
                                        <PaletteCard
                                            key={`mix-result-mobile-${palette.seed}`}
                                            palette={palette}
                                            index={index}
                                            urlStyle={urlStyle}
                                            urlAngle={urlAngle}
                                            urlSteps={urlSteps}
                                            previewStyle={previewStyle}
                                            previewAngle={previewAngle}
                                            previewSteps={previewSteps}
                                            onChannelOrderChange={onChannelOrderChange}
                                            onShiftClick={handleShiftClick}
                                            likedSeeds={likedSeeds}
                                            variant="compact"
                                            idPrefix="mix-result-mobile-"
                                        />
                                    ))}
                                </ol>
                            ) : (
                                <div className="h-32 flex items-center justify-center">
                                    <p className="text-sm text-muted-foreground">Generating...</p>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </main>

            {/* Desktop layout (md+) */}
            <main className="hidden md:block w-full min-h-viewport-content">
                {/* Header controls - full width */}
                <div className="bg-background py-4 flex flex-row gap-x-8 lg:gap-x-12">
                    {/* Left half - title and generate button */}
                    <div className="w-1/2 pl-5 lg:pl-14 flex items-center justify-between">
                        <h1 className="text-2xl font-bold text-foreground" suppressHydrationWarning>
                            Mix {count} {count === 1 ? "palette" : "palettes"}
                        </h1>
                        {uniquePalettes.length > 0 && (
                            <Tooltip delayDuration={500}>
                                <TooltipTrigger asChild>
                                    <div
                                        style={{ backgroundColor: "var(--background)" }}
                                        className={cn(
                                            "disable-animation-on-theme-change inline-flex items-center rounded-md",
                                            "h-8.5 border border-solid",
                                            "border-input",
                                        )}
                                    >
                                        <button
                                            onClick={handleGenerate}
                                            className={cn(
                                                "inline-flex items-center justify-center gap-1.5 px-3 h-full",
                                                "hover:bg-background/60 rounded-l-md",
                                                "text-muted-foreground hover:text-foreground",
                                                "transition-colors duration-200 cursor-pointer",
                                                "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                                "text-sm font-medium",
                                            )}
                                            aria-label="Generate new mix"
                                            suppressHydrationWarning
                                        >
                                            Generate
                                            <Dna
                                                size={14}
                                                style={{ color: "currentColor" }}
                                            />
                                        </button>
                                        <div className="h-5 w-px bg-border" />
                                        <input
                                            type="number"
                                            min={5}
                                            max={100}
                                            value={generateCount}
                                            onChange={(e) => {
                                                const val = Math.min(100, Math.max(5, parseInt(e.target.value) || 5));
                                                setGenerateCount(val);
                                            }}
                                            className={cn(
                                                "w-12 h-full px-2 text-sm font-medium text-center",
                                                "bg-transparent text-muted-foreground",
                                                "outline-none focus-visible:ring-2 focus-visible:ring-ring/70 rounded-r-md",
                                                "appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                                            )}
                                            aria-label="Number of palettes to generate"
                                        />
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" align="end" sideOffset={6}>
                                    Generate new palettes from mix (5-100)
                                </TooltipContent>
                            </Tooltip>
                        )}
                    </div>
                    {/* Right half - controls */}
                    <div className="w-1/2 pr-5 lg:pr-14 flex items-center justify-end gap-1.5">
                        {hasNonAutoValues && (
                            <Tooltip delayDuration={500}>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={handleReset}
                                        style={{
                                            backgroundColor: "var(--background)",
                                        }}
                                        className={cn(
                                            "disable-animation-on-theme-change inline-flex items-center justify-center rounded-md",
                                            "h-8.5 w-8.5 p-0 border border-solid",
                                            "border-input hover:border-muted-foreground/30 hover:bg-background/60",
                                            "text-muted-foreground hover:text-foreground",
                                            "transition-colors duration-200 cursor-pointer",
                                            "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                        )}
                                        aria-label="Reset style, angle, and steps to auto"
                                        suppressHydrationWarning
                                    >
                                        <RotateCcw
                                            size={14}
                                            style={{ color: "currentColor" }}
                                        />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" align="end" sideOffset={6}>
                                    Reset to auto
                                </TooltipContent>
                            </Tooltip>
                        )}
                        <AngleInput
                            value={urlAngle}
                            className="subpixel-antialiased"
                            onPreviewChange={setPreviewAngle}
                        />
                        <StepsInput
                            value={urlSteps}
                            className="subpixel-antialiased"
                            onPreviewChange={setPreviewSteps}
                        />
                        <StyleSelect
                            value={urlStyle}
                            className="subpixel-antialiased"
                            onPreviewChange={setPreviewStyle}
                        />
                    </div>
                </div>

                {/* Side by side panels */}
                <div className="flex flex-row gap-x-8 lg:gap-x-12">
                    {/* Left panel - input palettes */}
                    <div className="w-1/2">
                        {uniquePalettes.length === 0 ? (
                            <div className="h-viewport-content flex items-center justify-center">
                                <EmptyMixState />
                            </div>
                        ) : (
                            <ol className="pl-5 lg:pl-14 pr-2.5 lg:pr-7 pt-4 pb-8 grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-x-6 gap-y-6 auto-rows-[220px]">
                                {palettesAsAppPalettes.map((palette, index) => (
                                    <PaletteCard
                                        key={`mix-desktop-${palette.seed}`}
                                        palette={palette}
                                        index={index}
                                        urlStyle={urlStyle}
                                        urlAngle={urlAngle}
                                        urlSteps={urlSteps}
                                        previewStyle={previewStyle}
                                        previewAngle={previewAngle}
                                        previewSteps={previewSteps}
                                        onChannelOrderChange={
                                            onChannelOrderChange
                                        }
                                        onShiftClick={handleShiftClick}
                                        likedSeeds={likedSeeds}
                                        variant="compact"
                                        idPrefix="mix-desktop-"
                                        removeAllOnExportClick
                                    />
                                ))}
                            </ol>
                        )}
                    </div>

                    {/* Vertical dotted divider */}
                    {uniquePalettes.length > 0 && (
                        <div
                            suppressHydrationWarning
                            className={cn(
                                "w-[1px] shrink-0",
                                theme === "dark" ? "opacity-50" : "opacity-80"
                            )}
                            style={{
                                backgroundImage:
                                    "linear-gradient(to bottom, var(--muted-foreground) 0%, var(--muted-foreground) 3px, transparent 3px, transparent 12px)",
                                backgroundSize: "1px 8px",
                            }}
                        />
                    )}

                    {/* Right panel - output palettes */}
                    {uniquePalettes.length > 0 && (
                        <div className="w-1/2 pl-2.5 lg:pl-7 pr-5 lg:pr-14">
                            {generatedPalettes.length > 0 ? (
                                <ol className="pt-4 pb-8 grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-x-6 gap-y-6 auto-rows-[220px]">
                                    {generatedPalettes.map((palette, index) => (
                                        <PaletteCard
                                            key={`mix-result-desktop-${palette.seed}`}
                                            palette={palette}
                                            index={index}
                                            urlStyle={urlStyle}
                                            urlAngle={urlAngle}
                                            urlSteps={urlSteps}
                                            previewStyle={previewStyle}
                                            previewAngle={previewAngle}
                                            previewSteps={previewSteps}
                                            onChannelOrderChange={onChannelOrderChange}
                                            onShiftClick={handleShiftClick}
                                            likedSeeds={likedSeeds}
                                            variant="compact"
                                            idPrefix="mix-result-desktop-"
                                        />
                                    ))}
                                </ol>
                            ) : (
                                <div className="h-full flex items-center justify-center">
                                    <p className="text-sm text-muted-foreground">Generating...</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>

            <Footer />
        </div>
    );
}
