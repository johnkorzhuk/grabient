import { ChartContainer } from "@/components/ui/chart";
import { Suspense, lazy } from "react";
import { cn } from "@/lib/utils";
import { rgbChannelConfig } from "@/constants/colors";
import {
    cosineGradient,
    applyGlobals,
    type CosineCoeffs,
    type GlobalModifiers,
} from "@repo/data-ops/gradient-gen/cosine";
import { useElementSize } from "@mantine/hooks";

const LazyRechartsLineChart = lazy(() =>
    import("./recharts-line-chart").then((mod) => ({
        default: mod.RechartsLineChart,
    })),
);

interface GradientChannelsChartProps {
    steps: number;
    coeffs: CosineCoeffs;
    globals: GlobalModifiers;
    className?: string;
    showLabels?: boolean;
    showGrid?: boolean;
}

const GraphBG = ({
    className = "",
    showLabels = true,
    showGrid = true,
}: {
    className?: string;
    showLabels?: boolean;
    showGrid?: boolean;
}) => {
    const yAxisValues = [1, 0.8, 0.6, 0.4, 0.2, 0];

    return (
        <div
            className={cn(
                "relative w-full h-full rounded-md",
                className,
            )}
        >
            <div className="relative w-full h-full">
                {showGrid &&
                    yAxisValues.map((value) => {
                        const topPercent = (1 - value) * 100;

                        return (
                            <div
                                key={`line-${value}`}
                                className="absolute inset-x-0 w-full dark:opacity-60"
                                style={{
                                    top: `${topPercent}%`,
                                    height: "1px",
                                    backgroundImage:
                                        "linear-gradient(to right, var(--ring) 0%, var(--ring) 2px, transparent 2px, transparent 4px)",
                                    backgroundSize: "6px 1px",
                                    backgroundRepeat: "repeat-x",
                                    width: "100%",
                                }}
                            />
                        );
                    })}

                {showLabels &&
                    yAxisValues.map((value) => {
                        const topPercent = (1 - value) * 100;

                        return (
                            <div
                                key={`label-${value}`}
                                className="disable-animation-on-theme-change absolute font-semibold right-4 bg-background/20 backdrop-blur-sm text-muted-foreground hover:text-foreground transition-colors duration-200 text-xs font-mono px-1.5 py-0.5 rounded-sm border border-border select-none z-10 whitespace-nowrap inline-flex justify-center items-center"
                                style={{
                                    top: `${topPercent}%`,
                                    transform: "translateY(-50%)",
                                }}
                                suppressHydrationWarning
                            >
                                {value.toFixed(
                                    value === 1 || value === 0 ? 0 : 1,
                                )}
                            </div>
                        );
                    })}
            </div>
        </div>
    );
};

export function GradientChannelsChart({
    coeffs,
    globals,
    steps,
    className = "",
    showLabels = true,
    showGrid = true,
}: GradientChannelsChartProps) {
    const { ref: outerRef } = useElementSize();
    const { ref: innerRef, width, height } = useElementSize();

    const processedCoeffs = applyGlobals(coeffs, globals);
    const gradientColors = cosineGradient(steps, processedCoeffs);
    const chartData = getChartData(gradientColors);

    return (
        <figure
            className={cn("flex h-full flex-col relative", className)}
            role="img"
            ref={outerRef}
            aria-labelledby="palette-graph-title"
            aria-describedby="palette-graph-description"
        >
            <GraphBG
                className="absolute inset-0 w-full h-full pt-3 lg:pt-7 pl-0 lg:pl-0 pr-0 lg:pr-0 pb-4 lg:pb-4"
                showLabels={showLabels}
                showGrid={showGrid}
            />

            <div
                className="relative flex-1 w-full h-full pt-3 lg:pt-7 pl-0 lg:pl-0 pr-0 lg:pr-0 pb-4 lg:pb-4"
                style={{ minHeight: "150px", height: "100%" }}
            >
                <div ref={innerRef} className="h-full w-full overflow-visible">
                    <ChartContainer
                        config={rgbChannelConfig}
                        className="h-full w-full overflow-visible"
                    >
                        <Suspense fallback={<div className="w-full h-full" />}>
                            <LazyRechartsLineChart
                                data={chartData}
                                width={width || undefined}
                                height={height || undefined}
                            />
                        </Suspense>
                    </ChartContainer>
                </div>
            </div>

            <div id="palette-graph-title" className="sr-only">
                RGB Color Palette Visualization
            </div>

            <div id="palette-graph-description" className="sr-only">
                Interactive graph showing red, green, and blue color channel
                curves generated. X-axis is color(t). Y-axis is 0 to 1.
            </div>
        </figure>
    );
}

function rgbToHex(r: number, g: number, b: number) {
    const toHex = (value: number) => {
        const hex = Math.round(value * 255).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function getChartData(colors: number[][]) {
    return colors.map((color, i) => ({
        t: i / (colors.length - 1),
        red: color[0] ?? 0,
        green: color[1] ?? 0,
        blue: color[2] ?? 0,
        rgb: `rgb(${Math.round((color[0] ?? 0) * 255)}, ${Math.round((color[1] ?? 0) * 255)}, ${Math.round((color[2] ?? 0) * 255)})`,
        hex: rgbToHex(color[0] ?? 0, color[1] ?? 0, color[2] ?? 0),
    }));
}
