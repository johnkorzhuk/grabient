import type { AppPalette } from "@/queries/palettes";
import type * as v from "valibot";
import {
    styleWithAutoValidator,
    angleWithAutoValidator,
    stepsWithAutoValidator,
} from "@repo/data-ops/valibot-schema/grabient";
import { useStore } from "@tanstack/react-store";
import { uiStore } from "@/stores/ui";
import { useRef, useState, useEffect } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { PaletteCard } from "./palettes-grid";
import { Skeleton } from "@/components/ui/skeleton";

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
}: VirtualizedPalettesGridProps) {
    void _isExportOpen;

    const previewStyle = useStore(uiStore, (state) => state.previewStyle);
    const previewAngle = useStore(uiStore, (state) => state.previewAngle);
    const previewSteps = useStore(uiStore, (state) => state.previewSteps);

    const containerRef = useRef<HTMLOListElement>(null);
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

    // Total items = palettes + skeletons
    const totalItems = palettes.length + skeletonCount;
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

    // Flatten virtual rows into individual items (palettes + skeletons) with positions
    const visibleItems: Array<{
        type: 'palette' | 'skeleton';
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
                    />
                );
            })}
            </ol>
        </section>
    );
}
