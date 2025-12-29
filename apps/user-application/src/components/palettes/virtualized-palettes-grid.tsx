import type { AppPalette } from "@/queries/palettes";
import type * as v from "valibot";
import {
    styleWithAutoValidator,
    angleWithAutoValidator,
    stepsWithAutoValidator,
} from "@repo/data-ops/valibot-schema/grabient";
import { useStore } from "@tanstack/react-store";
import { uiStore } from "@/stores/ui";
import { paletteAnimationStore } from "@/stores/palette-animation";
import { useRef, useState, useEffect, useLayoutEffect } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { PaletteCard } from "./palettes-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "@tanstack/react-router";
import { Rocket } from "lucide-react";
import { GradientBorderButton } from "@/components/GradientBorderButton";
import { cn } from "@/lib/utils";

const FIXED_STOP_COUNT = 10;
const TWEEN_DURATION = 2000;

function interpolateColor(color1: string, color2: string, factor: number): string {
    const r1 = parseInt(color1.slice(1, 3), 16);
    const g1 = parseInt(color1.slice(3, 5), 16);
    const b1 = parseInt(color1.slice(5, 7), 16);

    const r2 = parseInt(color2.slice(1, 3), 16);
    const g2 = parseInt(color2.slice(3, 5), 16);
    const b2 = parseInt(color2.slice(5, 7), 16);

    const r = Math.round(r1 + (r2 - r1) * factor);
    const g = Math.round(g1 + (g2 - g1) * factor);
    const b = Math.round(b1 + (b2 - b1) * factor);

    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

type StyleWithAuto = v.InferOutput<typeof styleWithAutoValidator>;
type AngleWithAuto = v.InferOutput<typeof angleWithAutoValidator>;
type StepsWithAuto = v.InferOutput<typeof stepsWithAutoValidator>;

type VersionedPalette = AppPalette & { version: number; modelKey: string; theme: string };

interface VirtualizedPalettesGridProps {
    palettes: VersionedPalette[];
    likedSeeds: Set<string>;
    urlStyle?: StyleWithAuto;
    urlAngle?: AngleWithAuto;
    urlSteps?: StepsWithAuto;
    isExportOpen?: boolean;
    searchQuery?: string;
    onBadFeedback?: (seed: string) => void;
    skeletonCount?: number;
    showSubscribeCta?: boolean;
}

// Breakpoints matching Tailwind config (must match grid-cols breakpoints)
// From styles.css: 3xl = 120rem (1920px), 4xl = 192rem (3072px)
function getColumnsForWidth(width: number): number {
    if (width >= 3072) return 6;  // 4xl
    if (width >= 1920) return 5;  // 3xl
    if (width >= 1536) return 4;  // 2xl
    if (width >= 1280) return 3;  // xl
    if (width >= 768) return 2;   // md
    return 1;
}

// Row height = 300px (auto-rows-[300px]) + 80px (gap-y-20 = 5rem)
const ROW_HEIGHT = 380;
const PALETTE_HEIGHT = 300;
const GAP_X = 40; // gap-x-10 = 2.5rem = 40px

export function VirtualizedPalettesGrid({
    palettes,
    likedSeeds,
    urlStyle = "auto",
    urlAngle = "auto",
    urlSteps = "auto",
    isExportOpen: _isExportOpen = false,
    searchQuery,
    onBadFeedback,
    skeletonCount = 0,
    showSubscribeCta = false,
}: VirtualizedPalettesGridProps) {
    void _isExportOpen;

    const previewStyle = useStore(uiStore, (state) => state.previewStyle);
    const previewAngle = useStore(uiStore, (state) => state.previewAngle);
    const previewSteps = useStore(uiStore, (state) => state.previewSteps);
    const targetColors = useStore(paletteAnimationStore, (state) => state.normalizedColors);
    const navigate = useNavigate();

    const containerRef = useRef<HTMLOListElement>(null);
    const animationRef = useRef<number | null>(null);
    const tweenStateRef = useRef<{
        startColors: string[];
        endColors: string[];
        startTime: number;
    } | null>(null);

    // Track which palette seeds have been rendered (for fade-in animation)
    // Seeds seen on initial render won't animate, only new ones added later will
    const seenSeedsRef = useRef<Set<string>>(new Set());

    // Initialize seen seeds on mount with current palettes (skip animation for initial data)
    useLayoutEffect(() => {
        const newSeeds = new Set(seenSeedsRef.current);
        for (const p of palettes) {
            newSeeds.add(p.seed);
        }
        seenSeedsRef.current = newSeeds;
    }, []);
    const [displayedColors, setDisplayedColors] = useState<string[]>(
        () => Array(FIXED_STOP_COUNT).fill("#888888")
    );

    useEffect(() => {
        if (targetColors.length === 0) return;

        tweenStateRef.current = {
            startColors: [...displayedColors],
            endColors: [...targetColors],
            startTime: performance.now(),
        };

        const animate = (currentTime: number) => {
            const state = tweenStateRef.current;
            if (!state) return;

            const elapsed = currentTime - state.startTime;
            const progress = Math.min(elapsed / TWEEN_DURATION, 1);

            const interpolated = state.startColors.map((startColor, i) => {
                const endColor = state.endColors[i] || startColor;
                return interpolateColor(startColor, endColor, progress);
            });

            setDisplayedColors(interpolated);

            if (progress < 1) {
                animationRef.current = requestAnimationFrame(animate);
            } else {
                tweenStateRef.current = null;
            }
        };

        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }

        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
                animationRef.current = null;
            }
        };
    }, [targetColors]);
    const [columns, setColumns] = useState(1);
    const [contentWidth, setContentWidth] = useState(0);

    // Track window width for responsive columns and content width for positioning
    useEffect(() => {
        const updateDimensions = () => {
            const windowWidth = window.innerWidth;
            setColumns(getColumnsForWidth(windowWidth));
            if (containerRef.current) {
                // Content width is the ol's width (section wrapper handles padding)
                setContentWidth(containerRef.current.offsetWidth);
            }
        };

        updateDimensions();
        window.addEventListener('resize', updateDimensions);
        return () => window.removeEventListener('resize', updateDimensions);
    }, []);

    // Total items = CTA (if shown) + palettes + skeletons
    const ctaOffset = showSubscribeCta ? 1 : 0;
    const totalItems = ctaOffset + palettes.length + skeletonCount;
    const rowCount = Math.ceil(totalItems / columns);

    const virtualizer = useWindowVirtualizer({
        count: rowCount,
        estimateSize: () => ROW_HEIGHT,
        overscan: 1,
        scrollMargin: containerRef.current?.offsetTop ?? 0,
    });

    const virtualRows = virtualizer.getVirtualItems();

    // Calculate column width based on content width and gaps
    const totalGapWidth = (columns - 1) * GAP_X;
    const columnWidth = contentWidth > 0 ? (contentWidth - totalGapWidth) / columns : 0;

    if (totalItems === 0) {
        return null;
    }

    // Flatten virtual rows into individual items (CTA + palettes + skeletons) with positions
    const visibleItems: Array<{
        type: 'cta' | 'palette' | 'skeleton';
        palette?: VersionedPalette;
        globalIndex: number;
        row: number;
        col: number;
        yOffset: number;
    }> = [];

    for (const virtualRow of virtualRows) {
        const rowStartIndex = virtualRow.index * columns;
        const yOffset = virtualRow.start - virtualizer.options.scrollMargin;

        for (let col = 0; col < columns; col++) {
            const globalIndex = rowStartIndex + col;
            if (globalIndex >= totalItems) break;

            // First item is CTA if showSubscribeCta is true
            if (showSubscribeCta && globalIndex === 0) {
                visibleItems.push({
                    type: 'cta',
                    globalIndex,
                    row: virtualRow.index,
                    col,
                    yOffset,
                });
            } else {
                // Adjust index for palettes (subtract CTA offset)
                const paletteIndex = globalIndex - ctaOffset;
                if (paletteIndex < palettes.length) {
                    const palette = palettes[paletteIndex];
                    if (palette) {
                        visibleItems.push({
                            type: 'palette',
                            palette,
                            globalIndex,
                            row: virtualRow.index,
                            col,
                            yOffset,
                        });
                    }
                } else {
                    // Skeleton item
                    visibleItems.push({
                        type: 'skeleton',
                        globalIndex,
                        row: virtualRow.index,
                        col,
                        yOffset,
                    });
                }
            }
        }
    }

    return (
        <section className="h-full w-full relative px-5 lg:px-14 pt-4">
            <ol
                ref={containerRef}
                className="relative w-full"
                style={{
                    height: `${virtualizer.getTotalSize()}px`,
                }}
            >
                {visibleItems.map((item) => {
                const xOffset = item.col * (columnWidth + GAP_X);
                const itemStyle = {
                    position: 'absolute' as const,
                    top: 0,
                    left: 0,
                    width: `${columnWidth}px`,
                    height: `${PALETTE_HEIGHT}px`,
                    transform: `translate(${xOffset}px, ${item.yOffset}px)`,
                };

                if (item.type === 'cta') {
                    return (
                        <li
                            key="subscribe-cta"
                            className="relative w-full"
                            style={itemStyle}
                        >
                            <div className="flex flex-col items-center justify-center w-full h-full rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20">
                                <div className="flex items-center gap-2 mb-3">
                                    <Rocket className="w-8 h-8 text-foreground" />
                                </div>
                                <p className="text-sm text-muted-foreground text-center px-4 mb-1">
                                    Subscribe to{" "}
                                    <span className="font-bold text-foreground">Grabient</span>
                                    <span className="relative -mt-px ml-1 inline-block">
                                        <span className="text-base font-bold text-foreground">Pro</span>
                                        <span
                                            className="absolute left-0 right-0 bottom-[-2px] h-[4px]"
                                            style={{
                                                backgroundImage: `linear-gradient(90deg, ${displayedColors.join(", ")})`,
                                            }}
                                        />
                                    </span>
                                </p>
                                <p className="text-sm text-muted-foreground text-center px-4 mb-4">
                                    to generate unique palettes with AI
                                </p>
                                <GradientBorderButton
                                    onClick={() => navigate({ to: "/pricing" })}
                                    className={cn(
                                        "disable-animation-on-theme-change",
                                        "inline-flex items-center justify-center rounded-md",
                                        "font-medium text-sm h-10 px-5 border border-solid",
                                        "border-muted-foreground/30 text-foreground",
                                        "hover:border-transparent",
                                        "transition-colors duration-200 cursor-pointer",
                                        "outline-none",
                                    )}
                                >
                                    Upgrade
                                </GradientBorderButton>
                            </div>
                        </li>
                    );
                }

                if (item.type === 'skeleton') {
                    return (
                        <li
                            key={`skeleton-${item.globalIndex}`}
                            className="relative w-full"
                            style={itemStyle}
                        >
                            <Skeleton className="w-full h-full rounded-lg border border-border/50" />
                        </li>
                    );
                }

                const palette = item.palette!;
                const key = palette.version !== undefined
                    ? `${palette.seed}-v${palette.version}-${palette.modelKey ?? ""}-${item.globalIndex}`
                    : palette.seed;

                // Check if this is a new palette that should animate
                const isNew = !seenSeedsRef.current.has(palette.seed);
                if (isNew) {
                    seenSeedsRef.current.add(palette.seed);
                }

                return (
                    <PaletteCard
                        key={key}
                        palette={palette}
                        index={item.globalIndex}
                        urlStyle={urlStyle}
                        urlAngle={urlAngle}
                        urlSteps={urlSteps}
                        previewStyle={previewStyle}
                        previewAngle={previewAngle}
                        previewSteps={previewSteps}
                        onChannelOrderChange={() => {}}
                        likedSeeds={likedSeeds}
                        onShiftClick={() => {}}
                        searchQuery={searchQuery}
                        onBadFeedback={onBadFeedback}
                        theme={palette.theme}
                        style={itemStyle}
                        className={isNew ? "animate-in fade-in slide-in-from-top-2 duration-300" : undefined}
                    />
                );
            })}
            </ol>
        </section>
    );
}
