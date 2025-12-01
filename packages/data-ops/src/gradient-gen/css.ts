import { PALETTE_STYLES, FALLBACK_STYLES } from "../valibot-schema/grabient";

type GradientStyle = (typeof PALETTE_STYLES)[number];

export interface CreditProps {
    seed: string;
    searchString: string;
    baseUrl?: string;
}

export interface GradientCssResult {
    cssString: string;
    styles: { background: string };
    gradientString: string;
}

/**
 * Generates CSS gradient with credit comments for export.
 * Isomorphic - works in browser, Node.js, and edge environments.
 * For styles that require non-CSS rendering (like deepFlow), uses fallback from FALLBACK_STYLES.
 *
 * @param hexColors - Array of hex color strings (e.g., ["#ff0000", "#00ff00"])
 * @param style - The gradient style type
 * @param angle - The gradient angle in degrees
 * @param creditProps - Credit info for CSS comment with gradient URL
 * @param activeIndex - Optional index for highlighting specific color stop
 * @returns Object with cssString (with comments), styles object, and gradientString
 */
export function generateCssGradient(
    hexColors: string[],
    style: GradientStyle,
    angle: number = 90,
    creditProps: CreditProps,
    activeIndex?: number | null,
): GradientCssResult {
    const baseUrl = creditProps.baseUrl ?? "https://grabient.com";
    const creditComment = `/* ${baseUrl}/${creditProps.seed}${creditProps.searchString} */`;

    if (hexColors.length === 0) {
        return {
            cssString: `${creditComment}\n\nbackground: none;`,
            styles: { background: "none" },
            gradientString: "",
        };
    }

    if (hexColors.length === 1) {
        const bgValue = hexColors[0]!;
        return {
            cssString: `${creditComment}\n\nbackground: ${bgValue};`,
            styles: { background: bgValue },
            gradientString: "",
        };
    }

    const inactiveAlpha = 0.5;

    const effectiveStyle: GradientStyle = (FALLBACK_STYLES[style] ?? style) as GradientStyle;

    // Helper to add alpha to hex color
    const hexToRgba = (hex: string, alpha: number = 1): string => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return alpha === 1 ? hex : `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
    };

    switch (effectiveStyle) {
        case "linearGradient": {
            let gradientString = `linear-gradient(${angle}deg,`;

            hexColors.forEach((color, index) => {
                const position = ((index / (hexColors.length - 1)) * 100).toFixed(3);
                const alpha = typeof activeIndex === "number" ? (index === activeIndex ? 1 : inactiveAlpha) : 1;
                const colorValue = hexToRgba(color, alpha);
                gradientString += ` ${colorValue} ${position}%`;
                if (index < hexColors.length - 1) {
                    gradientString += ",";
                }
            });

            gradientString += ")";
            return {
                cssString: `${creditComment}\n\nbackground: ${gradientString};`,
                styles: { background: gradientString },
                gradientString,
            };
        }

        case "linearSwatches": {
            let gradientString = `linear-gradient(${angle}deg,`;
            const segmentSize = 100 / hexColors.length;

            hexColors.forEach((color, index) => {
                const startPosNum = index * segmentSize;
                const endPosNum = (index + 1) * segmentSize;
                const alpha = typeof activeIndex === "number" ? (index === activeIndex ? 1 : inactiveAlpha) : 1;
                const colorValue = hexToRgba(color, alpha);

                if (index === 0) {
                    gradientString += ` ${colorValue} ${startPosNum.toFixed(3)}%`;
                } else {
                    // Apply antialiasing fix: use calc() for the start of each new color segment
                    gradientString += `, ${colorValue} calc(${startPosNum.toFixed(3)}% + 1px)`;
                }

                if (index < hexColors.length - 1) {
                    gradientString += `, ${colorValue} ${endPosNum.toFixed(3)}%`;
                } else {
                    gradientString += ` ${endPosNum.toFixed(3)}%`;
                }
            });

            gradientString += ")";
            return {
                cssString: `${creditComment}\n\nbackground: ${gradientString};`,
                styles: { background: gradientString },
                gradientString,
            };
        }

        case "angularGradient": {
            let gradientString = `conic-gradient(from ${angle}deg,`;

            hexColors.forEach((color, index) => {
                const anglePos = ((index / (hexColors.length - 1)) * 360).toFixed(3);
                const alpha = typeof activeIndex === "number" ? (index === activeIndex ? 1 : inactiveAlpha) : 1;
                const colorValue = hexToRgba(color, alpha);
                gradientString += ` ${colorValue} ${anglePos}deg`;
                if (index < hexColors.length - 1) {
                    gradientString += ",";
                }
            });

            gradientString += ")";
            return {
                cssString: `${creditComment}\n\nbackground: ${gradientString};`,
                styles: { background: gradientString },
                gradientString,
            };
        }

        case "angularSwatches": {
            let gradientString = `conic-gradient(from ${angle}deg,`;
            const segmentSize = 360 / hexColors.length;

            hexColors.forEach((color, index) => {
                const startAngle = (index * segmentSize).toFixed(3);
                const endAngle = ((index + 1) * segmentSize).toFixed(3);
                const alpha = typeof activeIndex === "number" ? (index === activeIndex ? 1 : inactiveAlpha) : 1;
                const colorValue = hexToRgba(color, alpha);

                if (index === 0) {
                    gradientString += ` ${colorValue} ${startAngle}deg`;
                } else {
                    // Apply antialiasing fix: add small offset to create smooth transition
                    gradientString += `, ${colorValue} calc(${startAngle}deg + 0.1deg)`;
                }

                if (index < hexColors.length - 1) {
                    gradientString += `, ${colorValue} ${endAngle}deg`;
                } else {
                    gradientString += ` ${endAngle}deg`;
                }
            });

            gradientString += ")";
            return {
                cssString: `${creditComment}\n\nbackground: ${gradientString};`,
                styles: { background: gradientString },
                gradientString,
            };
        }

        default:
            return {
                cssString: `${creditComment}\n\nbackground: none;`,
                styles: { background: "none" },
                gradientString: "",
            };
    }
}
