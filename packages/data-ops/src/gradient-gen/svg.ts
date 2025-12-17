import { PALETTE_STYLES, FALLBACK_STYLES } from "../valibot-schema/grabient";

type GradientStyle = (typeof PALETTE_STYLES)[number];

export interface CreditProps {
    seed: string;
    searchString: string;
    baseUrl?: string;
}

export interface SvgGenerationOptions {
    width?: number;
    height?: number;
    gridItemIndex?: number;
    borderRadius?: number;
}

/**
 * Generates SVG gradient for export.
 * Isomorphic - works in browser, Node.js, and edge environments.
 * Uses fallback from FALLBACK_STYLES if needed.
 *
 * @param hexColors - Array of hex color strings (e.g., ["#ff0000", "#00ff00"])
 * @param style - The gradient style type
 * @param angle - The gradient angle in degrees
 * @param creditProps - Credit info for SVG comment with gradient URL
 * @param activeIndex - Optional index for highlighting specific color stop
 * @param options - Optional SVG generation options (width, height, gridItemIndex)
 * @returns SVG string
 */
export function generateSvgGradient(
    hexColors: string[],
    style: GradientStyle,
    angle: number = 90,
    creditProps: CreditProps,
    activeIndex?: number | null,
    options: SvgGenerationOptions = {},
): string {
    const { width = 800, height = 400, gridItemIndex, borderRadius = 0 } = options;

    // Convert percentage to pixels based on smaller dimension
    const minDimension = Math.min(width, height);
    const borderRadiusPx = (borderRadius / 100) * (minDimension / 2);
    const rxAttr = borderRadiusPx > 0 ? ` rx="${borderRadiusPx}" ry="${borderRadiusPx}"` : "";
    const baseUrl = creditProps.baseUrl ?? "https://grabient.com";
    const creditComment = `<!-- ${baseUrl}/${creditProps.seed}${creditProps.searchString} -->`;

    const getUniqueId = (baseId: string) =>
        typeof gridItemIndex === "number"
            ? `${baseId}_${gridItemIndex}`
            : baseId;

    // Helper to convert hex to RGB string
    const hexToRgb = (hex: string): string => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `${r}, ${g}, ${b}`;
    };

    const inactiveAlpha = 0.5;

    if (hexColors.length === 0) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
    ${creditComment}
    </svg>`;
    }

    if (hexColors.length === 1) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
          ${creditComment}
          <rect x="0" y="0" width="${width}" height="${height}"${rxAttr} fill="${hexColors[0]}"/>
        </svg>`;
    }

    const effectiveStyle: GradientStyle = (FALLBACK_STYLES[style] ??
        style) as GradientStyle;

    switch (effectiveStyle) {
        case "linearGradient": {
            // Convert CSS linear-gradient angle to SVG coordinates
            const normalizedAngle = ((angle % 360) + 360) % 360;
            const radians = (normalizedAngle * Math.PI) / 180;
            const adjustedRadians = radians - Math.PI / 2;

            const x1 = (0.5 - 0.5 * Math.cos(adjustedRadians)).toFixed(3);
            const y1 = (0.5 - 0.5 * Math.sin(adjustedRadians)).toFixed(3);
            const x2 = (0.5 + 0.5 * Math.cos(adjustedRadians)).toFixed(3);
            const y2 = (0.5 + 0.5 * Math.sin(adjustedRadians)).toFixed(3);

            let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
            ${creditComment}
            <defs>
              <linearGradient id="${getUniqueId("gradient")}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">
        `;

            // Standard gradient rendering
            hexColors.forEach((color, index) => {
                const position = (index / (hexColors.length - 1)).toFixed(3);
                const alpha =
                    typeof activeIndex === "number"
                        ? index === activeIndex
                            ? 1
                            : inactiveAlpha
                        : 1;
                const stopOpacity =
                    alpha === 1 ? "" : ` stop-opacity="${alpha.toFixed(3)}"`;
                svgContent += `<stop offset="${position}" stop-color="${color}"${stopOpacity} />`;
            });

            svgContent += `
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="${width}" height="${height}"${rxAttr} fill="url(#${getUniqueId("gradient")})" />
          </svg>`;

            return svgContent;
        }

        case "linearSwatches": {
            const normalizedAngle = ((angle % 360) + 360) % 360;

            let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
            ${creditComment}
            <defs>
              <clipPath id="${getUniqueId("bounds")}">
                <rect x="0" y="0" width="${width}" height="${height}"${rxAttr} />
              </clipPath>
            </defs>
            <g clip-path="url(#${getUniqueId("bounds")})">`;

            const radians = (normalizedAngle * Math.PI) / 180;
            const adjustedRadians = radians - Math.PI / 2;

            const dx = Math.cos(adjustedRadians);
            const dy = Math.sin(adjustedRadians);

            const centerX = width / 2;
            const centerY = height / 2;

            let gradientLength: number;

            if (Math.abs(dx) < 1e-10) {
                gradientLength = height;
            } else if (Math.abs(dy) < 1e-10) {
                gradientLength = width;
            } else {
                const corners = [
                    { x: 0, y: 0 },
                    { x: width, y: 0 },
                    { x: width, y: height },
                    { x: 0, y: height },
                ];

                let minProjection = Infinity;
                let maxProjection = -Infinity;

                corners.forEach((corner) => {
                    const relativeX = corner.x - centerX;
                    const relativeY = corner.y - centerY;
                    const projection = relativeX * dx + relativeY * dy;
                    minProjection = Math.min(minProjection, projection);
                    maxProjection = Math.max(maxProjection, projection);
                });

                gradientLength = maxProjection - minProjection;
            }

            const gradientStartX = centerX - (gradientLength / 2) * dx;
            const gradientStartY = centerY - (gradientLength / 2) * dy;

            hexColors.forEach((color, index) => {
                const startPercent = index / hexColors.length;
                const endPercent = (index + 1) / hexColors.length;

                const segmentStart = startPercent * gradientLength;
                const segmentEnd = endPercent * gradientLength;

                const startX = gradientStartX + segmentStart * dx;
                const startY = gradientStartY + segmentStart * dy;
                const endX = gradientStartX + segmentEnd * dx;
                const endY = gradientStartY + segmentEnd * dy;

                const perpX = -dy;
                const perpY = dx;

                // Calculate perpendicular extension - just enough to cover the viewport corners.
                // We extend from the center of each segment edge perpendicular to the gradient direction.
                // The extension needs to reach the farthest corner in the perpendicular direction.
                // Using half the diagonal ensures we cover all corners for any angle.
                const perpExtension = Math.sqrt(width * width + height * height) / 2;

                const x1 = startX + perpX * perpExtension;
                const y1 = startY + perpY * perpExtension;
                const x2 = startX - perpX * perpExtension;
                const y2 = startY - perpY * perpExtension;
                const x3 = endX - perpX * perpExtension;
                const y3 = endY - perpY * perpExtension;
                const x4 = endX + perpX * perpExtension;
                const y4 = endY + perpY * perpExtension;

                const alpha =
                    typeof activeIndex === "number"
                        ? index === activeIndex
                            ? 1
                            : inactiveAlpha
                        : 1;

                const pathData = `M ${x1.toFixed(3)},${y1.toFixed(3)} L ${x2.toFixed(3)},${y2.toFixed(3)} L ${x3.toFixed(3)},${y3.toFixed(3)} L ${x4.toFixed(3)},${y4.toFixed(3)} Z`;

                svgContent += `<path d="${pathData}" fill="${color}" fill-opacity="${alpha.toFixed(3)}" />`;
            });

            svgContent += `</g>
          </svg>`;

            return svgContent;
        }

        case "angularGradient": {
            // Build color stops for CSS conic-gradient
            const colorStops: string[] = [];
            hexColors.forEach((color, index) => {
                const position = (
                    (index / (hexColors.length - 1)) *
                    360
                ).toFixed(6);
                const alpha =
                    typeof activeIndex === "number"
                        ? index === activeIndex
                            ? 1
                            : inactiveAlpha
                        : 1;
                const rgbString = hexToRgb(color);
                colorStops.push(`rgba(${rgbString}, ${alpha}) ${position}deg`);
            });

            const centerX = width / 2;
            const centerY = height / 2;

            // Figma uses a large foreignObject (~5.66x the max dimension) centered at origin
            // then scales it down to fit
            const maxDim = Math.max(width, height);
            const foreignObjectSize = maxDim * 5.66;
            const foreignObjectHalf = foreignObjectSize / 2;

            // Scale factor: how much to shrink the foreignObject to fit the target area
            const scale = maxDim / foreignObjectSize;

            // Rotation: angle 90° = no rotation (top), 0° = rotated -90° (right), etc.
            const rotationDeg = angle - 90;
            const rotationRad = (rotationDeg * Math.PI) / 180;
            const cos = Math.cos(rotationRad);
            const sin = Math.sin(rotationRad);

            // SVG transform matrix: matrix(a, b, c, d, e, f)
            const a = scale * cos;
            const b = scale * sin;
            const c = -scale * sin;
            const d = scale * cos;
            const e = centerX;
            const f = centerY;

            // Build Figma gradient metadata for data-figma-gradient-fill attribute
            const gradientStops = hexColors
                .map((color, index) => {
                    const position = index / (hexColors.length - 1);
                    const r = parseInt(color.slice(1, 3), 16) / 255;
                    const g = parseInt(color.slice(3, 5), 16) / 255;
                    const b = parseInt(color.slice(5, 7), 16) / 255;
                    const alpha =
                        typeof activeIndex === "number"
                            ? index === activeIndex
                                ? 1
                                : inactiveAlpha
                            : 1;
                    return `{&quot;color&quot;:{&quot;r&quot;:${r},&quot;g&quot;:${g},&quot;b&quot;:${b},&quot;a&quot;:${alpha}},&quot;position&quot;:${position}}`;
                })
                .join(",");

            // Figma transform for data attribute
            const figmaScale = maxDim;
            const m00 = figmaScale * cos;
            const m01 = -figmaScale * sin;
            const m02 = centerX;
            const m10 = figmaScale * sin;
            const m11 = figmaScale * cos;
            const m12 = centerY;

            const gradientFillData = `{&quot;type&quot;:&quot;GRADIENT_ANGULAR&quot;,&quot;stops&quot;:[${gradientStops}],&quot;stopsVar&quot;:[${gradientStops}],&quot;transform&quot;:{&quot;m00&quot;:${m00.toFixed(6)},&quot;m01&quot;:${m01.toFixed(6)},&quot;m02&quot;:${m02.toFixed(6)},&quot;m10&quot;:${m10.toFixed(6)},&quot;m11&quot;:${m11.toFixed(6)},&quot;m12&quot;:${m12.toFixed(6)}},&quot;opacity&quot;:1.0,&quot;blendMode&quot;:&quot;NORMAL&quot;,&quot;visible&quot;:true}`;

            const clipPathId = getUniqueId("paint0_angular_clip_path");

            return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
${creditComment}
<g clip-path="url(#${clipPathId})" data-figma-skip-parse="true"><g transform="matrix(${a.toFixed(6)} ${b.toFixed(6)} ${c.toFixed(6)} ${d.toFixed(6)} ${e.toFixed(6)} ${f.toFixed(6)})"><foreignObject x="${-foreignObjectHalf}" y="${-foreignObjectHalf}" width="${foreignObjectSize}" height="${foreignObjectSize}"><div xmlns="http://www.w3.org/1999/xhtml" style="background:conic-gradient(from 90deg,${colorStops.join(",")});height:100%;width:100%;opacity:1"></div></foreignObject></g></g><rect width="${width}" height="${height}"${rxAttr} data-figma-gradient-fill="${gradientFillData}"/>
<defs>
<clipPath id="${clipPathId}"><rect width="${width}" height="${height}"${rxAttr}/></clipPath>
</defs>
</svg>`;
        }

        case "angularSwatches": {
            let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
            ${creditComment}
            <defs>
              <clipPath id="${getUniqueId("squareClip")}">
                <rect x="0" y="0" width="${width}" height="${height}"${rxAttr} />
              </clipPath>
              <filter id="${getUniqueId("antiGap")}">
                <feGaussianBlur in="SourceGraphic" stdDeviation="0.3" />
              </filter>
            </defs>
            <g clip-path="url(#${getUniqueId("squareClip")})" filter="url(#${getUniqueId("antiGap")})" shape-rendering="crispEdges">
          `;

            const centerX = (width / 2).toFixed(3);
            const centerY = (height / 2).toFixed(3);
            const diagonal = Math.sqrt(width * width + height * height);
            const radius = (diagonal / 2).toFixed(3);
            const startingAngle = angle - 90;
            const segmentSize = 360 / hexColors.length;

            hexColors.forEach((color, index) => {
                // Use exact CSS boundaries - no overlap that changes visual width
                const segmentStartAngle = (startingAngle + index * segmentSize).toFixed(3);
                const segmentEndAngle = (startingAngle + (index + 1) * segmentSize).toFixed(3);

                const startRad = (Number(segmentStartAngle) * Math.PI) / 180;
                const endRad = (Number(segmentEndAngle) * Math.PI) / 180;

                const alpha =
                    typeof activeIndex === "number"
                        ? index === activeIndex
                            ? 1
                            : inactiveAlpha
                        : 1;

                const startX = (
                    Number(centerX) +
                    Number(radius) * Math.cos(startRad)
                ).toFixed(3);
                const startY = (
                    Number(centerY) +
                    Number(radius) * Math.sin(startRad)
                ).toFixed(3);
                const endX = (
                    Number(centerX) +
                    Number(radius) * Math.cos(endRad)
                ).toFixed(3);
                const endY = (
                    Number(centerY) +
                    Number(radius) * Math.sin(endRad)
                ).toFixed(3);

                const largeArcFlag =
                    Number(segmentEndAngle) - Number(segmentStartAngle) > 180
                        ? 1
                        : 0;

                const pathData = `
              M ${centerX},${centerY}
              L ${startX},${startY}
              A ${radius},${radius} 0 ${largeArcFlag} 1 ${endX},${endY}
              Z
            `;

                svgContent += `<path d="${pathData}" fill="${color}" fill-opacity="${alpha.toFixed(3)}" />`;
            });

            svgContent += `</g>
        </svg>`;

            return svgContent;
        }

        default:
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
        ${creditComment}
      </svg>`;
    }
}
