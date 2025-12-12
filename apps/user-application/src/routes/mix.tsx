import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/header/AppHeader";
import { Footer } from "@/components/layout/Footer";
import { useStore } from "@tanstack/react-store";
import { exportStore, getUniqueSeedsFromExportList } from "@/stores/export";
import { AngleInput } from "@/components/navigation/AngleInput";
import { StepsInput } from "@/components/navigation/StepsInput";
import { StyleSelect } from "@/components/navigation/StyleSelect";
import {
    setPreviewStyle,
    setPreviewAngle,
    setPreviewSteps,
    uiStore,
    toggleIsAdvancedOpen,
    setIsAdvancedOpen,
} from "@/stores/ui";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    DEFAULT_STYLE,
    DEFAULT_ANGLE,
    DEFAULT_STEPS,
} from "@repo/data-ops/valibot-schema/grabient";
import { deserializeCoeffs } from "@repo/data-ops/serialization";
import { generateHexColors } from "@/lib/paletteUtils";
import { generateCssGradient } from "@repo/data-ops/gradient-gen";
import type { ExportItem } from "@/queries/palettes";

export const Route = createFileRoute("/mix")({
    component: MixPage,
});

function getUniquePalettesFromExportList(exportList: ExportItem[]): ExportItem[] {
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

function MixPage() {
    const exportList = useStore(exportStore, (state) => state.exportList);
    const previewStyle = useStore(uiStore, (state) => state.previewStyle);
    const previewAngle = useStore(uiStore, (state) => state.previewAngle);
    const previewSteps = useStore(uiStore, (state) => state.previewSteps);
    const isAdvancedOpen = useStore(uiStore, (state) => state.isAdvancedOpen);

    const [contentHeight, setContentHeight] = useState(0);
    const contentRef = useRef<HTMLDivElement>(null);
    const shouldAnimateRef = useRef(!isAdvancedOpen);

    useEffect(() => {
        if (contentRef.current) {
            setContentHeight(contentRef.current.scrollHeight);
        }
    }, [isAdvancedOpen]);

    useEffect(() => {
        shouldAnimateRef.current = true;
    }, []);

    const uniquePalettes = getUniquePalettesFromExportList(exportList);
    const count = uniquePalettes.length;

    const effectiveStyle = previewStyle ?? DEFAULT_STYLE;
    const effectiveAngle = previewAngle ?? DEFAULT_ANGLE;
    const effectiveSteps = previewSteps ?? DEFAULT_STEPS;

    return (
        <div className="min-h-screen-dynamic flex flex-col">
            <AppHeader />

            {/* Mobile layout (xs/sm) - uses fixed bottom panel */}
            <main className="md:hidden w-full h-viewport-content flex flex-col overflow-hidden">
                {/* Header controls */}
                <div className="shrink-0 bg-background">
                    <div className="px-5 py-4 flex items-center justify-between">
                        <h1 className="text-2xl font-bold text-foreground">
                            Mix {count} {count === 1 ? "palette" : "palettes"}
                        </h1>
                        <div className="flex items-center gap-1.5">
                            <StyleSelect
                                value="auto"
                                className="subpixel-antialiased"
                                onPreviewChange={setPreviewStyle}
                            />
                            <Tooltip delayDuration={500}>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={toggleIsAdvancedOpen}
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
                                                style={{ color: "currentColor" }}
                                            />
                                        ) : (
                                            <SlidersHorizontal
                                                size={16}
                                                style={{ color: "currentColor" }}
                                            />
                                        )}
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" align="end" sideOffset={6}>
                                    {isAdvancedOpen ? "Close options" : "More options"}
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    </div>
                    {/* Expandable panel for angle and steps */}
                    <div
                        className="overflow-hidden"
                        style={{
                            height: isAdvancedOpen ? `${contentHeight}px` : "0px",
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
                                value="auto"
                                className="subpixel-antialiased"
                                onPreviewChange={setPreviewAngle}
                            />
                            <StepsInput
                                value="auto"
                                className="subpixel-antialiased"
                                onPreviewChange={setPreviewSteps}
                            />
                        </div>
                    </div>
                </div>

                {/* Content area - 70% top for list, 30% bottom for mix result */}
                <div className="flex-1 min-h-0 flex flex-col">
                    {/* Palettes list - scrollable with hidden scrollbar */}
                    <div className="flex-[7] min-h-0 overflow-y-auto scrollbar-hidden">
                        {uniquePalettes.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-muted-foreground">
                                <p className="text-sm">No palettes selected</p>
                            </div>
                        ) : (
                            <div className="p-4 grid grid-cols-1 gap-3">
                                {uniquePalettes.map((palette) => (
                                    <PalettePreviewCard
                                        key={palette.seed}
                                        palette={palette}
                                        style={effectiveStyle}
                                        angle={effectiveAngle}
                                        steps={effectiveSteps}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Mix result area - fixed 30% */}
                    <div className="flex-[3] shrink-0 bg-background">
                        <div className="h-full flex items-center justify-center text-muted-foreground">
                            <p className="text-sm">Mix result area</p>
                        </div>
                    </div>
                </div>
            </main>

            {/* Desktop layout (md+) */}
            <main className="hidden md:block w-full min-h-viewport-content">
                {/* Header controls - full width */}
                <div className="bg-background px-5 lg:px-14 py-4 flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-foreground">
                        Mix {count} {count === 1 ? "palette" : "palettes"}
                    </h1>
                    <div className="flex items-center gap-1.5">
                        <AngleInput
                            value="auto"
                            className="subpixel-antialiased"
                            onPreviewChange={setPreviewAngle}
                        />
                        <StepsInput
                            value="auto"
                            className="subpixel-antialiased"
                            onPreviewChange={setPreviewSteps}
                        />
                        <StyleSelect
                            value="auto"
                            className="subpixel-antialiased"
                            onPreviewChange={setPreviewStyle}
                        />
                    </div>
                </div>

                {/* Side by side panels */}
                <div className="flex flex-row">
                    {/* Left panel - content flows naturally, body scrolls */}
                    <div className="w-1/2">
                        {uniquePalettes.length === 0 ? (
                            <div className="h-viewport-content flex items-center justify-center text-muted-foreground">
                                <p className="text-sm">No palettes selected</p>
                            </div>
                        ) : (
                            <div className="pl-5 lg:pl-14 pr-2.5 lg:pr-7 pt-4 pb-8 grid grid-cols-1 gap-3">
                                {uniquePalettes.map((palette) => (
                                    <PalettePreviewCard
                                        key={palette.seed}
                                        palette={palette}
                                        style={effectiveStyle}
                                        angle={effectiveAngle}
                                        steps={effectiveSteps}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Right panel - sticky to stay in view while scrolling */}
                    <div className="w-1/2 sticky top-[69px] lg:top-[89px] h-viewport-content self-start bg-background pl-2.5 lg:pl-7 pr-5 lg:pr-14">
                        <div className="h-full flex items-center justify-center text-muted-foreground">
                            <p className="text-sm">Mix result area</p>
                        </div>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
}

interface PalettePreviewCardProps {
    palette: ExportItem;
    style: typeof DEFAULT_STYLE;
    angle: number;
    steps: number;
}

function PalettePreviewCard({ palette, style, angle, steps }: PalettePreviewCardProps) {
    const { coeffs, globals } = deserializeCoeffs(palette.seed);
    const hexColors = generateHexColors(coeffs, globals, steps);
    const { gradientString } = generateCssGradient(hexColors, style, angle, {
        seed: palette.seed,
        searchString: "",
    });

    return (
        <div
            className="w-full h-20 rounded-lg overflow-hidden"
            style={{
                backgroundImage: gradientString,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
            }}
        />
    );
}
