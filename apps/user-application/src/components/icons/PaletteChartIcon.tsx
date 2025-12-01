import { rgbChannelConfig } from "@/constants/colors";
import {
    cosineGradient,
    type CosineCoeffs,
} from "@repo/data-ops/gradient-gen/cosine";

interface PaletteChartIconProps {
    coeffs: CosineCoeffs;
    size?: number;
    className?: string;
}

export function PaletteChartIcon({
    coeffs,
    size = 20,
    className,
}: PaletteChartIconProps) {
    const numPoints = 8;
    const colors = cosineGradient(numPoints, coeffs);

    const paths = [0, 1, 2].map((channel) => {
        const points: string[] = [];
        for (let i = 0; i < colors.length; i++) {
            const t = i / (colors.length - 1);
            const value = colors[i]?.[channel] ?? 0;
            const x = 47 + t * 113;
            const y = 155 - value * 105;
            points.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
        }
        return (
            `M${points[0]}` +
            points
                .slice(1)
                .map((p) => ` L${p}`)
                .join("")
        );
    });

    const strokeColors = [
        rgbChannelConfig.red.color,
        rgbChannelConfig.green.color,
        rgbChannelConfig.blue.color,
    ];

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 200 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            <path
                d="M25 25V158.333C25 162.754 26.7559 166.993 29.8816 170.118C33.0072 173.244 37.2464 175 41.6667 175H175"
                stroke="currentColor"
                strokeWidth="10"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {paths.map((pathData, i) => (
                <path
                    key={i}
                    d={pathData}
                    stroke={strokeColors[i]}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            ))}
        </svg>
    );
}
