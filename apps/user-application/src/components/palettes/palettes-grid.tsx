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
import { uiStore, setActivePaletteSeed, setCustomCoeffs } from "@/stores/ui";
import { PaletteChartIcon } from "@/components/icons/PaletteChartIcon";
import { applyGlobals } from "@repo/data-ops/gradient-gen/cosine";
import {
    useEffect,
    useRef,
    forwardRef,
    useSyncExternalStore,
    useState,
    lazy,
    Suspense,
} from "react";
import { Heart, SquarePen, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useElementSize, useHotkeys } from "@mantine/hooks";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { CopyButton } from "./copy-button";
import { ExportButton } from "./export-button";
import { ExportOptions } from "./export-options";
import { createExportItem } from "@/lib/paletteUtils";
import { exportStore } from "@/stores/export";
import { downloadSVGGrid, copySVGGridToClipboard } from "@/lib/generateSVGGrid";
import { useFooterOverlap } from "@/hooks/useFooterOverlap";
import { setContainerDimensions } from "@/stores/export";
import { useDimensions } from "@/hooks/useDimensions";
import { useLikePaletteMutation } from "@/mutations/palettes";
import { useQueryClient } from "@tanstack/react-query";
import { serializeCoeffs } from "@repo/data-ops/serialization";
import type { PNGGenerationOptions } from "@/lib/generatePNG";
import { Kbd } from "@/components/ui/kbd";
import { getGradientAriaLabel, getUniqueColorNames } from "@/lib/color-utils";

const LazyGradientChannelsChart = lazy(() =>
    import("./gradient-channels-chart").then((mod) => ({
        default: mod.GradientChannelsChart,
    })),
);

const LazyRGBTabs = lazy(() =>
    import("./rgb-tabs").then((mod) => ({
        default: mod.RGBTabs,
    })),
);

type CosineCoeffs = v.InferOutput<typeof coeffsSchema>;
type StyleWithAuto = v.InferOutput<typeof styleWithAutoValidator>;
type AngleWithAuto = v.InferOutput<typeof angleWithAutoValidator>;
type StepsWithAuto = v.InferOutput<typeof stepsWithAutoValidator>;
type PaletteStyle = v.InferOutput<typeof paletteStyleValidator>;

interface PalettesGridProps {
    palettes: AppPalette[];
    likedSeeds: Set<string>;
    showRgbTabs?: boolean;
    urlStyle?: StyleWithAuto;
    urlAngle?: AngleWithAuto;
    urlSteps?: StepsWithAuto;
}

export function PalettesGrid({
    palettes: initialPalettes,
    likedSeeds,
    showRgbTabs = true,
    urlStyle = "auto",
    urlAngle = "auto",
    urlSteps = "auto",
}: PalettesGridProps) {
    const previewStyle = useStore(uiStore, (state) => state.previewStyle);
    const previewAngle = useStore(uiStore, (state) => state.previewAngle);
    const previewSteps = useStore(uiStore, (state) => state.previewSteps);
    const exportList = useStore(exportStore, (state) => state.exportList);
    const { footerOffset } = useFooterOverlap();
    const { ref: firstPaletteRef, width, height } = useElementSize();

    useEffect(() => {
        if (width > 0 && height > 0) {
            setContainerDimensions({ width, height });
        }
    }, [width, height]);

    const onChannelOrderChange = (
        newCoeffs: CosineCoeffs,
        palette: AppPalette,
    ) => {
        setCustomCoeffs(palette.seed, newCoeffs);
    };

    return (
        <section className="h-full w-full relative">
            <ol
                className={cn(
                    "h-full w-full relative px-5 lg:px-14",
                    "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5 4xl:grid-cols-6 gap-x-10 gap-y-20 auto-rows-[300px]",
                )}
            >
                {initialPalettes.map((palette, index) => (
                    <PaletteCard
                        key={palette.seed}
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
                        showRgbTabs={showRgbTabs}
                        ref={index === 0 ? firstPaletteRef : undefined}
                    />
                ))}
            </ol>

            {exportList.length > 0 && (
                <div
                    className={cn(
                        "fixed z-[50]",
                        "px-3 py-2.5",
                        "rounded-lg border border-solid border-input",
                        "shadow-lg transition-colors duration-200",
                        "w-auto",
                        "bg-background",
                        "disable-animation-on-theme-change",
                    )}
                    style={{
                        right: "calc(var(--fixed-right-offset, 1.25rem) + var(--scrollbar-offset, 0px))",
                        bottom: `${32 + footerOffset}px`,
                    }}
                >
                    <ExportOptions
                        onSvgExport={(itemWidth, itemHeight) => {
                            downloadSVGGrid({
                                exportList,
                                itemWidth,
                                itemHeight,
                            });
                        }}
                        onSvgCopy={async (itemWidth, itemHeight) => {
                            await copySVGGridToClipboard({
                                exportList,
                                itemWidth,
                                itemHeight,
                            });
                        }}
                    />
                </div>
            )}
        </section>
    );
}

interface PaletteCardProps {
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
    showRgbTabs?: boolean;
}

const PaletteCard = forwardRef<HTMLLIElement, PaletteCardProps>(
    (
        {
            palette,
            urlStyle,
            urlAngle,
            urlSteps,
            previewStyle,
            previewAngle,
            previewSteps,
            onChannelOrderChange,
            likedSeeds,
            showRgbTabs = true,
        },
        ref,
    ) => {
        const queryClient = useQueryClient();
        const activePaletteSeed = useStore(
            uiStore,
            (state) => state.activePaletteSeed,
        );
        const isDragging = useStore(uiStore, (state) => state.isDragging);
        const customCoeffsMap = useStore(
            uiStore,
            (state) => state.customCoeffs,
        );
        const itemActive = activePaletteSeed === palette.seed;
        const [isMounted, setIsMounted] = useState(false);
        const [showGraph, setShowGraph] = useState(false);

        useEffect(() => {
            setIsMounted(true);
        }, []);

        useEffect(() => {
            if (activePaletteSeed !== palette.seed && showGraph) {
                setShowGraph(false);
            }
        }, [activePaletteSeed, palette.seed, showGraph]);

        useHotkeys([
            ["Escape", () => showGraph && setShowGraph(false)],
        ]);

        const currentCoeffs =
            customCoeffsMap.get(palette.seed) ?? palette.coeffs;
        // Only re-serialize if user actually modified the coeffs, otherwise use original seed
        const hasCustomCoeffs = customCoeffsMap.has(palette.seed);
        const currentSeed = hasCustomCoeffs
            ? serializeCoeffs(currentCoeffs, palette.globals)
            : palette.seed;
        const isPaletteModified = hasCustomCoeffs;

        // Subscribe to query cache changes for optimistic updates
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
                // If palette hasn't been modified, use its own likesCount
                // This ensures search results display their own like counts (for consistent sorting)
                if (!isPaletteModified && palette.likesCount !== undefined) {
                    return palette.likesCount;
                }

                const allPaletteQueries = queryClient.getQueriesData<{
                    palettes: AppPalette[];
                    totalPages: number;
                    total: number;
                }>({
                    queryKey: ["palettes"],
                });

                // Look for the current seed's like count (needed when channels are reordered)
                const foundPalette = allPaletteQueries
                    .flatMap(([_, data]) => data?.palettes ?? [])
                    .find((p) => p.seed === currentSeed);

                if (foundPalette) {
                    return foundPalette.likesCount;
                }

                // If palette was modified (channels reordered), check if the new variant is liked
                if (isPaletteModified) {
                    const cachedSeeds = queryClient.getQueryData<Set<string>>([
                        "user-liked-seeds",
                    ]);
                    const isLiked = cachedSeeds?.has(currentSeed) ?? false;
                    // New variant can only have 0 or 1 likes (user's like)
                    return isLiked ? 1 : 0;
                }

                // If not found and not modified, check if current seed is liked
                const cachedSeeds = queryClient.getQueryData<Set<string>>([
                    "user-liked-seeds",
                ]);
                const isLiked = cachedSeeds?.has(currentSeed) ?? false;
                if (isLiked) {
                    return 1;
                }

                // Fall back to original palette's like count
                return palette.likesCount;
            },
            () => {
                const isLiked = likedSeeds?.has(currentSeed) ?? false;
                if (isLiked && isPaletteModified) {
                    return 1;
                }
                return palette.likesCount;
            },
        );

        const copyMenuOpenRef = useRef(false);
        const likeMutation = useLikePaletteMutation();
        const isMouseInteractionRef = useRef(false);

        const handleInteraction = () => {
            if (activePaletteSeed === palette.seed && !showGraph) {
                setActivePaletteSeed(null);
            } else {
                setActivePaletteSeed(palette.seed);
            }
        };

        const handleMouseDown = () => {
            isMouseInteractionRef.current = true;
        };

        const handleClick = (e: React.MouseEvent) => {
            const target = e.target as HTMLElement;
            if (
                target.closest('button:not([role="button"])') ||
                copyMenuOpenRef.current
            ) {
                return;
            }
            handleInteraction();
        };

        const handleTouchEnd = (e: React.TouchEvent) => {
            const target = e.target as HTMLElement;
            if (
                target.closest('button:not([role="button"])') ||
                copyMenuOpenRef.current
            ) {
                return;
            }
            isMouseInteractionRef.current = true;
            handleInteraction();
        };

        const handleKeyDown = (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                handleInteraction();
            }
        };

        const handleFocus = (e: React.FocusEvent) => {
            const isFocusFromWithinPalette =
                e.relatedTarget &&
                (e.currentTarget as HTMLElement).contains(
                    e.relatedTarget as HTMLElement,
                );

            if (!isMouseInteractionRef.current && !isFocusFromWithinPalette) {
                setActivePaletteSeed(palette.seed);
            }
            isMouseInteractionRef.current = false;
        };

        const { hexColors } = palette;
        const uniqueColorNames = getUniqueColorNames(hexColors);
        const colorList = uniqueColorNames.slice(0, 3).join(", ");
        const moreColors =
            uniqueColorNames.length > 3 ? ` and ${uniqueColorNames.length - 3} more` : "";
        const ariaLabel = `${itemActive ? "Deselect" : "Select"} gradient: ${colorList}${moreColors}`;

        // Calculate effective render settings (same logic as GradientPreview)
        const effectiveStyle =
            previewStyle || (urlStyle !== "auto" ? urlStyle : palette.style);
        const effectiveAngle =
            previewAngle ?? (urlAngle !== "auto" ? urlAngle : palette.angle);
        const effectiveSteps =
            previewSteps ?? (urlSteps !== "auto" ? urlSteps : palette.steps);

        return (
            <li
                ref={ref}
                className={cn(
                    "relative w-full font-poppins",
                    isDragging && !itemActive && "pointer-events-none",
                )}
            >
                <div className="group">
                    <div
                        className="relative w-full cursor-pointer outline-none"
                        onMouseDown={handleMouseDown}
                        onClick={handleClick}
                        onTouchEnd={handleTouchEnd}
                        onKeyDown={handleKeyDown}
                        onFocus={handleFocus}
                        tabIndex={0}
                        role="button"
                        aria-pressed={itemActive}
                        aria-label={ariaLabel}
                    >
                        <GradientPreview
                            palette={palette}
                            currentCoeffs={currentCoeffs}
                            currentSeed={currentSeed}
                            itemActive={itemActive}
                            isMounted={isMounted}
                            urlStyle={urlStyle}
                            urlAngle={urlAngle}
                            urlSteps={urlSteps}
                            previewStyle={previewStyle}
                            previewAngle={previewAngle}
                            previewSteps={previewSteps}
                            copyMenuOpenRef={copyMenuOpenRef}
                            showGraph={showGraph}
                            onCloseGraph={() => setShowGraph(false)}
                        />
                    </div>

                    {/* Palette metadata - interactive elements only render after mount */}
                    <div className="flex justify-between pt-4 relative pointer-events-none">
                        <div className="flex items-center min-h-[28px] pointer-events-none">
                            {showRgbTabs && (
                                <>
                                    {/* Graph icon and RGB Tabs - only render after mount */}
                                    {isMounted && (
                                        <div
                                            className={cn(
                                                "flex items-center gap-2 transition-all duration-200 z-10",
                                                itemActive
                                                    ? "opacity-100 pointer-events-auto"
                                                    : isDragging
                                                      ? "opacity-0 pointer-events-none"
                                                      : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto",
                                            )}
                                            aria-label="Color channel controls"
                                        >
                                            <Tooltip delayDuration={1000}>
                                                <TooltipTrigger asChild>
                                                    <button
                                                        aria-label={
                                                            showGraph
                                                                ? "Hide graph"
                                                                : "Show graph"
                                                        }
                                                        style={{
                                                            backgroundColor:
                                                                "var(--background)",
                                                        }}
                                                        className={cn(
                                                            "disable-animation-on-theme-change",
                                                            "inline-flex items-center justify-center rounded-md",
                                                            "w-8 h-8 mr-1 border border-solid",
                                                            "transition-colors duration-200 cursor-pointer",
                                                            "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                                            "border-input text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground",
                                                            showGraph &&
                                                                "border-muted-foreground/30 text-foreground",
                                                        )}
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const newShowGraph = !showGraph;
                                                            setShowGraph(newShowGraph);
                                                            if (newShowGraph) {
                                                                setActivePaletteSeed(palette.seed);
                                                            }
                                                        }}
                                                        suppressHydrationWarning
                                                    >
                                                        <PaletteChartIcon
                                                            coeffs={applyGlobals(
                                                                currentCoeffs,
                                                                palette.globals,
                                                            )}
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
                                                        {showGraph
                                                            ? "Hide graph"
                                                            : "Show graph"}
                                                        {showGraph && <Kbd>esc</Kbd>}
                                                    </span>
                                                </TooltipContent>
                                            </Tooltip>
                                            <Suspense fallback={<div className="h-8 w-[104px]" />}>
                                                <LazyRGBTabs
                                                    key={palette.seed}
                                                    palette={{
                                                        ...palette,
                                                        coeffs: currentCoeffs,
                                                    }}
                                                    onOrderChange={onChannelOrderChange}
                                                />
                                            </Suspense>
                                        </div>
                                    )}

                                    {/* Creation date display - always render for SSR */}
                                    {palette.createdAt && (
                                        <span
                                            className={cn(
                                                "text-sm text-muted-foreground transition-all duration-50 absolute left-0 pointer-events-none",
                                                isMounted && itemActive
                                                    ? "invisible"
                                                    : isMounted && isDragging
                                                      ? "visible"
                                                      : "visible group-hover:invisible",
                                            )}
                                        >
                                            {formatDistanceToNow(
                                                new Date(palette.createdAt),
                                                {
                                                    addSuffix: false,
                                                },
                                            ).replace("about", "")}
                                        </span>
                                    )}
                                </>
                            )}
                            {!showRgbTabs && palette.createdAt && (
                                <span className="text-sm text-muted-foreground pointer-events-none">
                                    {formatDistanceToNow(
                                        new Date(palette.createdAt),
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

interface GradientPreviewProps {
    palette: AppPalette;
    currentCoeffs: CosineCoeffs;
    currentSeed: string;
    itemActive: boolean;
    isMounted: boolean;
    urlStyle: StyleWithAuto;
    urlAngle: AngleWithAuto;
    urlSteps: StepsWithAuto;
    previewStyle: PaletteStyle | null;
    previewAngle: number | null;
    previewSteps: number | null;
    copyMenuOpenRef: React.MutableRefObject<boolean>;
    showGraph: boolean;
    onCloseGraph: () => void;
}

function GradientPreview({
    palette,
    currentCoeffs,
    currentSeed,
    itemActive,
    isMounted,
    urlStyle,
    urlAngle,
    urlSteps,
    previewStyle,
    previewAngle,
    previewSteps,
    copyMenuOpenRef,
    showGraph,
    onCloseGraph,
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

    // Only generate what's needed for display - gradientString for background
    const { cssString, gradientString } = generateCssGradient(
        colorsToUse,
        effectiveStyle,
        effectiveAngle,
        { seed: currentSeed, searchString: creditSearchString },
    );
    const backgroundImage = gradientString;

    const { actualWidth, actualHeight } = useDimensions();

    // Defer SVG generation until after mount since it's only needed for copy/export
    const svgString = isMounted
        ? generateSvgGradient(
              colorsToUse,
              effectiveStyle,
              effectiveAngle,
              { seed: currentSeed, searchString: creditSearchString },
              null,
              { width: actualWidth, height: actualHeight },
          )
        : "";

    return (
        <div className="relative h-[300px] w-full overflow-visible pointer-events-none">
            {/* Glow effect layer - only render after mount since it's hover-only */}
            {isMounted && (
                <div
                    className={cn(
                        "absolute -inset-3 transition-opacity duration-300 z-0 pointer-events-none blur-lg rounded-xl flex items-center justify-center",
                        {
                            "opacity-0 group-hover:opacity-40": !itemActive,
                            "opacity-40": itemActive,
                        },
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

                {/* Dev-only score badge */}
                {import.meta.env.DEV && palette.score !== undefined && (
                    <span className="absolute bottom-3 right-3 text-xs font-mono px-2 py-1 rounded bg-background/80 text-foreground">
                        {palette.score.toFixed(4)}
                    </span>
                )}

                {/* Graph overlay */}
                {showGraph && (
                    <div className="absolute -inset-px flex flex-col overflow-hidden pointer-events-auto">
                        {/* Full background layer */}
                        <div className="absolute -inset-px bg-background" />
                        {/* Close button */}
                        <div className="absolute top-3.5 left-3.5 z-20">
                            <Tooltip delayDuration={500}>
                                <TooltipTrigger asChild>
                                    <button
                                        aria-label="Hide graph"
                                        style={{ backgroundColor: "var(--background)" }}
                                        className={cn(
                                            "disable-animation-on-theme-change inline-flex items-center justify-center rounded-md",
                                            "w-8 h-8 p-0 border border-solid",
                                            "text-muted-foreground hover:text-foreground",
                                            "transition-colors duration-200 cursor-pointer",
                                            "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                            "border-input hover:border-muted-foreground/30",
                                        )}
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onCloseGraph();
                                        }}
                                        suppressHydrationWarning
                                    >
                                        <X className="w-4 h-4" strokeWidth={2.5} />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" align="start" sideOffset={6}>
                                    <span className="flex items-center gap-1.5">
                                        Hide graph <Kbd>esc</Kbd>
                                    </span>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        {/* Graph area */}
                        <div className="flex-1 relative py-3">
                            <div className="absolute inset-x-0 top-3 bottom-3">
                                <Suspense fallback={<div className="h-full w-full" />}>
                                    <LazyGradientChannelsChart
                                        coeffs={currentCoeffs}
                                        globals={palette.globals}
                                        steps={effectiveSteps}
                                        showLabels={true}
                                        showGrid={true}
                                    />
                                </Suspense>
                            </div>
                        </div>
                        {/* Bottom strip showing swatches as x-axis legend */}
                        <div
                            className="h-10 shrink-0 relative"
                            style={{
                                backgroundImage: generateCssGradient(
                                    colorsToUse,
                                    "linearSwatches",
                                    90,
                                    { seed: currentSeed, searchString: "" },
                                ).gradientString,
                                backgroundSize: "cover",
                                backgroundPosition: "center bottom",
                                backgroundRepeat: "no-repeat",
                            }}
                        />
                    </div>
                )}

                {/* Link button in top left - only render after mount to reduce SSR DOM */}
                {isMounted && !showGraph && (
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
                                style={{ backgroundColor: "var(--background)" }}
                                className={cn(
                                    "disable-animation-on-theme-change inline-flex items-center justify-center rounded-md",
                                    "w-8 h-8 p-0 border border-solid",
                                    "text-muted-foreground hover:text-foreground",
                                    "transition-colors duration-200 cursor-pointer",
                                    "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                    "backdrop-blur-sm",
                                    !itemActive
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

                {/* Copy button in top right - only render after mount to reduce SSR DOM */}
                {isMounted && !showGraph && (
                <div className="absolute top-3 right-3 z-20 pointer-events-auto flex flex-col gap-2">
                    <CopyButton
                        id={palette.seed}
                        cssString={cssString}
                        svgString={svgString}
                        gradientData={currentCoeffs}
                        gradientGlobals={palette.globals}
                        gradientColors={colorsToUse}
                        seed={currentSeed}
                        style={effectiveStyle}
                        angle={effectiveAngle}
                        steps={effectiveSteps}
                        isActive={itemActive}
                        onOpen={() => {
                            if (!itemActive) {
                                setActivePaletteSeed(palette.seed);
                            }
                        }}
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
                        isActive={itemActive}
                    />
                </div>
                )}
            </figure>
        </div>
    );
}
