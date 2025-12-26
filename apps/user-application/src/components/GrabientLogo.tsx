import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useStore } from "@tanstack/react-store";
import { uiStore } from "@/stores/ui";
import { exportStore } from "@/stores/export";
import { generateHexColors } from "@/lib/paletteUtils";
import { updatePaletteAnimation } from "@/stores/palette-animation";
import type { AppPalette } from "@/queries/palettes";

interface GrabientLogoProps {
    className?: string;
    palettes: AppPalette[];
    isExportMode?: boolean;
}

const TRANSITION_DURATION = 2000;
const FIXED_STOP_COUNT = 10;

function interpolateColor(
    color1: string,
    color2: string,
    factor: number,
): string {
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

function normalizeGradient(hexColors: string[], targetStops: number): string[] {
    if (hexColors.length === 0) return Array(targetStops).fill("#000000");
    if (hexColors.length === 1) return Array(targetStops).fill(hexColors[0]!);

    const normalized: string[] = [];

    for (let i = 0; i < targetStops; i++) {
        const position = (i / (targetStops - 1)) * (hexColors.length - 1);
        const lowerIndex = Math.floor(position);
        const upperIndex = Math.min(lowerIndex + 1, hexColors.length - 1);
        const factor = position - lowerIndex;

        const color = interpolateColor(
            hexColors[lowerIndex]!,
            hexColors[upperIndex]!,
            factor,
        );
        normalized.push(color);
    }

    return normalized;
}

export function GrabientLogo({ className, palettes, isExportMode = false }: GrabientLogoProps) {
    const livePaletteData = useStore(uiStore, (state) => state.livePaletteData);
    const exportList = useStore(exportStore, (state) => state.exportList);

    const [currentIndex, setCurrentIndex] = useState(0);

    const hasExportItems = exportList.length > 0;
    const hasPalettes = palettes.length > 0;
    const isSinglePalette = palettes.length === 1;
    const isSingleExport = exportList.length === 1;

    // Use export list only when export mode is active AND there are items
    const useExportList = isExportMode && hasExportItems;

    // Priority: export mode > single palette with live data > palette cycling
    const getHexColors = (): string[] => {
        // If export mode is active and has items, use export list
        if (useExportList) {
            const currentExportItem = exportList[currentIndex % exportList.length]!;
            return currentExportItem.hexColors;
        }

        // If single palette route with live data (slider dragging)
        if (isSinglePalette && hasPalettes && livePaletteData) {
            return generateHexColors(
                livePaletteData.coeffs,
                livePaletteData.globals,
                palettes[0]!.steps
            );
        }

        // If single palette, use its colors
        if (isSinglePalette && hasPalettes) {
            return palettes[0]!.hexColors;
        }

        // Multiple palettes: cycle through them
        if (hasPalettes) {
            return palettes[currentIndex % palettes.length]!.hexColors;
        }

        return ["#000000"];
    };

    const hexColors = getHexColors();
    const normalizedColors = normalizeGradient(hexColors, FIXED_STOP_COUNT);

    // Publish colors to shared store for other components (like GradientBorderButton)
    useEffect(() => {
        updatePaletteAnimation(currentIndex, normalizedColors);
    }, [currentIndex, normalizedColors]);

    // Determine if we should cycle
    const shouldCycle = useExportList
        ? exportList.length > 1  // Cycle through export list if multiple items
        : !isSinglePalette && hasPalettes;  // Otherwise cycle palettes if multiple

    // Fixed (no transitions) when:
    // - In export mode with single export item
    // - NOT in export mode AND (single palette OR has live data from sliders)
    const isFixed = useExportList
        ? isSingleExport
        : (isSinglePalette || livePaletteData !== null);

    useEffect(() => {
        if (!shouldCycle) {
            return;
        }

        const totalItems = useExportList ? exportList.length : palettes.length;

        setCurrentIndex((prev) => (prev + 1) % totalItems);

        const interval = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % totalItems);
        }, TRANSITION_DURATION);

        return () => clearInterval(interval);
    }, [shouldCycle, useExportList, exportList.length, palettes.length]);

    // Reset index when switching between export mode and normal mode
    useEffect(() => {
        setCurrentIndex(0);
    }, [useExportList]);

    const stops = normalizedColors.map((color, i) => {
        const offset = (i / (FIXED_STOP_COUNT - 1)) * 100;
        return { color, offset };
    });

    return (
        <div
            className={cn("inline-flex items-center", className)}
            aria-label="Grabient Logo"
        >
            <svg
                width="220"
                height="50"
                viewBox="0 0 220 50"
                xmlns="http://www.w3.org/2000/svg"
                className="h-full w-full"
            >
                <defs>
                    <linearGradient
                        id="logoGradient"
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="0%"
                    >
                        {stops.map((stop, i) => (
                            <stop
                                key={`${i}-${isFixed ? 'fixed' : 'cycling'}`}
                                offset={`${stop.offset}%`}
                                stopColor={stop.color}
                                style={{
                                    transition: isFixed
                                        ? "none !important"
                                        : "stop-color 3s cubic-bezier(0.2, 0.9, 0.3, 1)",
                                }}
                                suppressHydrationWarning
                            />
                        ))}
                    </linearGradient>
                </defs>
                <g fill="none" fillRule="evenodd">
                    <path
                        className="disable-animation-on-theme-change"
                        d="M17.0015787 16.3699871v7.4230271h10.7969796c-.9771022 3.5394567-4.0549742 5.8499353-8.6473547 5.8499353-4.5435253 0-9.91758758-3.293661-9.91758758-10.9133247 0-7.1772315 5.32520708-10.56921083 9.86873248-10.56921083 3.9084089 0 6.5465849 2.16300133 7.9633831 4.71927553h10.3572836C35.4199556 5.84993532 27.9939787 0 19.3466241 0 8.6962098 0 0 7.86545925 0 18.7296248c0 10.4708927 8.2565138 19.0737387 19.2000587 19.0737387 10.0152978 0 19.297769-7.3247089 19.297769-19.5161707 0-.7373868 0-1.2781372-.0488552-1.9172057H17.0015787zm26.0056541 20.6959896h8.1099485V22.072445c0-4.1293661 2.638176-4.915912 6.4000195-5.0142303V8.84864166c-4.6900906 0-6.1068889 2.50711514-6.7908604 3.83441134h-.0977103V9.78266494h-7.6213973V37.0659767zM89.3854683 9.78266494V37.0659767h-8.1099485v-2.9495472h-.0977102C79.8098665 36.771022 76.4388638 38 73.2632816 38c-8.5984996 0-13.6305761-6.7839586-13.6305761-14.6002587 0-8.9469599 6.4000196-14.55109964 13.6305761-14.55109964 4.4458151 0 6.9374257 2.16300124 7.914528 3.83441134h.0977102V9.78266494h8.1099485zM67.742654 23.4980595c0 2.5562743 1.8564942 6.8822769 6.7420053 6.8822769 5.0809316 0 6.7908605-4.3260026 6.7908605-6.9805951 0-3.2936611-2.2473351-6.931436-6.8397156-6.931436-4.6412355 0-6.6931502 3.9327296-6.6931502 7.0297542zm27.9110034 13.5679172V.68822768h8.1099486V11.9456662c2.882451-3.09702454 6.742005-3.09702454 7.865673-3.09702454 5.667193 0 13.337445 4.08020694 13.337445 14.40362224C124.966724 33.084088 118.175864 38 111.287293 38c-3.810699 0-6.742005-1.8680466-7.767963-3.8344114h-.09771v2.9003881h-7.7679626zm7.8168176-13.7153946c0 3.7852523 2.540466 7.0297543 6.59544 7.0297543 4.152685 0 6.790861-3.3919793 6.790861-6.9805951 0-3.5394567-2.638176-6.931436-6.644295-6.931436-4.29925 0-6.742006 3.4902975-6.742006 6.8822768zm34.262168-13.56791716h-8.109948V37.0659767h8.109948V9.78266494zm0-9.09443726h-8.109948v6.19404916h8.109948V.68822768zm23.807174 27.82406212h8.305369c-1.319088 3.0478654-3.224437 5.4075032-5.520628 6.9805951-2.247335 1.6222509-4.934366 2.457956-7.719107 2.457956-7.767963 0-14.363403-6.3415265-14.363403-14.4527814 0-7.6196636 5.960324-14.64941784 14.216838-14.64941784 8.256513 0 14.314547 6.58732214 14.314547 14.89521344 0 1.0815007-.09771 1.5239327-.19542 2.1630013h-20.323727c.488552 3.2445019 3.175583 5.1617076 6.351165 5.1617076 2.491611 0 3.810699-1.1306597 4.934366-2.5562742zm-11.18782-8.1112549h12.311488c-.341986-1.6222509-1.954205-4.6701164-6.155744-4.6701164-4.20154 0-5.813759 3.0478655-6.155744 4.6701164zm25.028552 16.6649418h8.109948V22.2199224c0-1.6714101 0-5.702458 4.641236-5.702458 4.250394 0 4.250394 3.7360932 4.250394 5.6532989v14.8952134h8.109949V20.007762c0-5.3583441-1.661074-7.5213454-3.126727-8.7994826-1.465654-1.2781371-4.348105-2.35963774-6.937426-2.35963774-4.836656 0-6.546585 2.50711514-7.377122 3.83441134h-.09771V9.78266494h-7.572542V37.0659767zM216.091591.68822768h-8.109948v9.09443726h-4.006119v6.19404916h4.006119v21.0892626h8.109948V15.9767141H220V9.78266494h-3.908409V.68822768z"
                        fill="currentColor"
                        suppressHydrationWarning
                    />
                    <rect
                        x="93"
                        y="43"
                        width="34"
                        height="7"
                        fill="url(#logoGradient)"
                    />
                </g>
            </svg>
        </div>
    );
}
