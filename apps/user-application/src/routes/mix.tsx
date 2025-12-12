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
} from "@/stores/ui";
import { cn } from "@/lib/utils";
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

    const uniquePalettes = getUniquePalettesFromExportList(exportList);
    const count = uniquePalettes.length;

    const effectiveStyle = previewStyle ?? DEFAULT_STYLE;
    const effectiveAngle = previewAngle ?? DEFAULT_ANGLE;
    const effectiveSteps = previewSteps ?? DEFAULT_STEPS;

    return (
        <div className="min-h-screen-dynamic flex flex-col">
            <AppHeader />

            <main className="w-full h-viewport-content overflow-x-hidden overflow-y-auto">
                {/* Mobile layout (xs/sm) */}
                <div className="md:hidden h-full">
                    {/* Header controls */}
                    <div className="bg-background px-5 py-4 flex items-center justify-between">
                        <h1 className="text-2xl font-bold text-foreground">
                            Mix {count} {count === 1 ? "palette" : "palettes"}
                        </h1>
                        <div className="flex items-center gap-1.5">
                            <StyleSelect
                                value="auto"
                                className="subpixel-antialiased"
                                onPreviewChange={setPreviewStyle}
                            />
                        </div>
                    </div>

                    {/* Palettes list - flows naturally */}
                    <div>
                        {uniquePalettes.length === 0 ? (
                            <div className="h-[50vh] flex items-center justify-center text-muted-foreground">
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

                    {/* Sticky bottom panel - Mix result area */}
                    <div className="sticky bottom-0 h-[30vh] bg-background z-10">
                        <div className="h-full flex items-center justify-center text-muted-foreground">
                            <p className="text-sm">Mix result area</p>
                        </div>
                    </div>
                </div>

                {/* Desktop layout (md+) */}
                <div className="hidden md:block">
                    {/* Header controls */}
                    <div className="sticky top-0 z-10 bg-background px-5 lg:px-14 py-4 flex items-center justify-between">
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
                        {/* Left panel */}
                        <div className="w-1/2">
                            {uniquePalettes.length === 0 ? (
                                <div className="h-[50vh] flex items-center justify-center text-muted-foreground">
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

                        {/* Right panel - sticky to viewport */}
                        <div className="w-1/2 sticky top-[61px] h-[calc(100vh-61px)] self-start bg-background">
                            <div className="h-full flex items-center justify-center text-muted-foreground">
                                <p className="text-sm">Mix result area</p>
                            </div>
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
