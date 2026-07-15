import type { AppPalette } from "@/queries/palettes";
import type * as v from "valibot";
import {
    styleWithAutoValidator,
    angleWithAutoValidator,
    stepsWithAutoValidator,
} from "@repo/data-ops/valibot-schema/grabient";
import { useStore } from "@tanstack/react-store";
import { uiStore } from "@/stores/ui";
import { exportStore } from "@/stores/export";
import { useRef, useState, useEffect, useLayoutEffect } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { PaletteCard, ExportView } from "./palettes-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

type StyleWithAuto = v.InferOutput<typeof styleWithAutoValidator>;
type AngleWithAuto = v.InferOutput<typeof angleWithAutoValidator>;
type StepsWithAuto = v.InferOutput<typeof stepsWithAutoValidator>;

type PaletteWithOptionalMeta = AppPalette & { version?: number; modelKey?: string; theme?: string };

interface VirtualizedPalettesGridProps {
    palettes: PaletteWithOptionalMeta[];
    likedSeeds: Set<string>;
    urlStyle?: StyleWithAuto;
    urlAngle?: AngleWithAuto;
    urlSteps?: StepsWithAuto;
    isExportOpen?: boolean;
    searchQuery?: string;
    onBadFeedback?: (seed: string) => void;
    skeletonCount?: number;
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
    isExportOpen = false,
    searchQuery,
    onBadFeedback,
    skeletonCount = 0,
}: VirtualizedPalettesGridProps) {
    const previewStyle = useStore(uiStore, (state) => state.previewStyle);
    const previewAngle = useStore(uiStore, (state) => state.previewAngle);
    const previewSteps = useStore(uiStore, (state) => state.previewSteps);
    const exportList = useStore(exportStore, (state) => state.exportList);
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    // Get palette metadata from cache for export items
    const getPaletteMetadataBySeed = (
        seed: string,
    ): { likesCount?: number; createdAt: Date | null } => {
        const queries = queryClient.getQueriesData<{
            palettes?: AppPalette[];
            results?: AppPalette[];
        }>({ queryKey: ["palettes"] });
        for (const [queryKey, data] of queries) {
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
        const likedSeedsCache = queryClient.getQueryData<Set<string>>([
            "user-liked-seeds",
        ]);
        if (likedSeedsCache?.has(seed)) {
            return { likesCount: 1, createdAt: null };
        }
        return { createdAt: null };
    };

    // Close export mode if list becomes empty
    useEffect(() => {
        if (isExportOpen && exportList.length === 0) {
            navigate({
                to: ".",
                search: (prev) => ({ ...prev, export: undefined }),
                replace: true,
            });
        }
    }, [isExportOpen, exportList.length, navigate]);

    const containerRef = useRef<HTMLOListElement>(null);

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
    const [columns, setColumns] = useState(1);
    const [contentWidth, setContentWidth] = useState(0);
    const [scrollMargin, setScrollMargin] = useState(0);

    // Measure layout via ResizeObserver (batched, no forced reflow) instead of
    // reading offsetWidth/offsetTop during render or in a raw resize listener.
    // useLayoutEffect runs synchronously after DOM mutations but before paint,
    // so the user never sees stale dimensions when exiting export mode
    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        setScrollMargin(el.offsetTop);

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            // Content width is the ol's width (section wrapper handles padding)
            setContentWidth(entry.contentRect.width);
            setColumns(getColumnsForWidth(window.innerWidth));
        });
        observer.observe(el);

        return () => observer.disconnect();
    }, [isExportOpen]);

    const totalItems = palettes.length + skeletonCount;
    const rowCount = Math.ceil(totalItems / columns);

    const virtualizer = useWindowVirtualizer({
        count: rowCount,
        estimateSize: () => ROW_HEIGHT,
        overscan: 1,
        scrollMargin,
    });

    const virtualRows = virtualizer.getVirtualItems();

    // Calculate column width based on content width and gaps
    const totalGapWidth = (columns - 1) * GAP_X;
    const columnWidth = contentWidth > 0 ? (contentWidth - totalGapWidth) / columns : 0;

    // Export view - render when export mode is open and we have items
    if (isExportOpen && exportList.length > 0) {
        return (
            <ExportView
                likedSeeds={likedSeeds}
                getPaletteMetadataBySeed={getPaletteMetadataBySeed}
                navigate={navigate}
            />
        );
    }

    if (totalItems === 0) {
        return null;
    }

    // Flatten virtual rows into individual items (palettes + skeletons) with positions
    const visibleItems: Array<{
        type: 'palette' | 'skeleton';
        palette?: PaletteWithOptionalMeta;
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

            if (globalIndex < palettes.length) {
                const palette = palettes[globalIndex];
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
