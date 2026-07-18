import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { Resvg } from "@cf-wasm/resvg/workerd";
import { deserializeCoeffs } from "@repo/data-ops/serialization";
import {
    applyGlobals,
    cosineGradient,
    rgbToHex,
    calculateAverageBrightness,
} from "@repo/data-ops/gradient-gen/cosine";
import { generateSvgGradient } from "@repo/data-ops/gradient-gen/svg";
import {
    DEFAULT_STEPS,
    DEFAULT_ANGLE,
    DEFAULT_STYLE,
    seedValidator,
    stepsValidator,
    angleValidator,
    paletteStyleValidator,
} from "@repo/data-ops/valibot-schema/grabient";
import * as v from "valibot";
import { normalizeEntityMangledParams } from "@/lib/og-params";

/**
 * Bare palette PNG: the gradient exactly as the site renders it (style,
 * steps, angle all honored), full bleed, no logo or text. Exists so
 * machine consumers - notably the training-data judge, which scores
 * palettes visually - see the true product rendering rather than a
 * logo-overlaid OG card or their own approximation.
 */

const PNG_RENDER_VERSION = 1;
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

const DARK_BG = "#0a0a0b";
const LIGHT_BG = "#ffffff";

const SIZE_MIN = 64;
const SIZE_MAX = 1600;
const DEFAULT_W = 800;
const DEFAULT_H = 400;

function parseSize(raw: string | null, fallback: number): number {
    const n = raw ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(n)) return fallback;
    return Math.min(SIZE_MAX, Math.max(SIZE_MIN, n));
}

// Same construction as /api/og's angular special case (see og.ts) - kept
// local so the OG route stays untouched.
function generateAngularGradientSvg(
    hexColors: string[],
    angle: number,
    width: number,
    height: number,
): string {
    if (hexColors.length === 0) {
        return `<rect x="0" y="0" width="${width}" height="${height}" fill="#000000"/>`;
    }
    if (hexColors.length === 1) {
        return `<rect x="0" y="0" width="${width}" height="${height}" fill="${hexColors[0]}"/>`;
    }

    const centerX = width / 2;
    const centerY = height / 2;
    const diagonal = Math.sqrt(width * width + height * height);
    const radius = diagonal / 2 + 1;
    const startingAngle = angle - 90;

    const segmentsPerColorPair = 36;
    const totalSegments = (hexColors.length - 1) * segmentsPerColorPair;
    const segmentAngle = 360 / totalSegments;

    let paths = "";
    for (let i = 0; i < totalSegments; i++) {
        const colorPairIndex = Math.floor(i / segmentsPerColorPair);
        const progressInPair = (i % segmentsPerColorPair) / segmentsPerColorPair;

        const color1 = hexColors[colorPairIndex] ?? "#000000";
        const color2 =
            hexColors[Math.min(colorPairIndex + 1, hexColors.length - 1)] ??
            "#000000";

        const r1 = parseInt(color1.slice(1, 3), 16) || 0;
        const g1 = parseInt(color1.slice(3, 5), 16) || 0;
        const b1 = parseInt(color1.slice(5, 7), 16) || 0;
        const r2 = parseInt(color2.slice(1, 3), 16) || 0;
        const g2 = parseInt(color2.slice(3, 5), 16) || 0;
        const b2 = parseInt(color2.slice(5, 7), 16) || 0;

        const r = Math.round(r1 + (r2 - r1) * progressInPair);
        const g = Math.round(g1 + (g2 - g1) * progressInPair);
        const b = Math.round(b1 + (b2 - b1) * progressInPair);
        const fillColor = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;

        const segmentStart = startingAngle + i * segmentAngle;
        const segmentEnd = startingAngle + (i + 1) * segmentAngle + 0.5;

        const startRad = (segmentStart * Math.PI) / 180;
        const endRad = (segmentEnd * Math.PI) / 180;

        const startX = centerX + radius * Math.cos(startRad);
        const startY = centerY + radius * Math.sin(startRad);
        const endX = centerX + radius * Math.cos(endRad);
        const endY = centerY + radius * Math.sin(endRad);

        const largeArcFlag = segmentEnd - segmentStart > 180 ? 1 : 0;

        const pathData = `M ${centerX.toFixed(2)},${centerY.toFixed(2)} L ${startX.toFixed(2)},${startY.toFixed(2)} A ${radius.toFixed(2)},${radius.toFixed(2)} 0 ${largeArcFlag} 1 ${endX.toFixed(2)},${endY.toFixed(2)} Z`;
        paths += `<path d="${pathData}" fill="${fillColor}" />`;
    }
    return paths;
}

export const Route = createFileRoute("/api/png")({
    server: {
        handlers: {
            GET: async ({ request }) => {
                const searchParams = normalizeEntityMangledParams(
                    new URL(request.url),
                );

                const seedParam = searchParams.get("seed");
                const seedResult = v.safeParse(seedValidator, seedParam);
                if (!seedResult.success) {
                    return new Response("Missing or invalid seed", { status: 400 });
                }
                const seed = seedResult.output;

                const styleResult = v.safeParse(
                    paletteStyleValidator,
                    searchParams.get("style"),
                );
                const style = styleResult.success
                    ? styleResult.output
                    : DEFAULT_STYLE;

                const stepsParam = searchParams.get("steps");
                const stepsResult = v.safeParse(
                    stepsValidator,
                    stepsParam ? parseInt(stepsParam, 10) : NaN,
                );
                const steps = stepsResult.success
                    ? stepsResult.output
                    : DEFAULT_STEPS;

                const angleParam = searchParams.get("angle");
                const angleResult = v.safeParse(
                    angleValidator,
                    angleParam ? parseInt(angleParam, 10) : NaN,
                );
                const angle = angleResult.success
                    ? angleResult.output
                    : DEFAULT_ANGLE;

                const width = parseSize(searchParams.get("w"), DEFAULT_W);
                const height = parseSize(searchParams.get("h"), DEFAULT_H);

                const cacheKey = `png:v${PNG_RENDER_VERSION}:${seed}:${style}:${steps}:${angle}:${width}x${height}`;

                if (env.OG_IMAGE_CACHE) {
                    try {
                        const cached = await env.OG_IMAGE_CACHE.get(
                            cacheKey,
                            "arrayBuffer",
                        );
                        if (cached) {
                            return new Response(cached, {
                                status: 200,
                                headers: {
                                    "Content-Type": "image/png",
                                    "Cache-Control":
                                        "public, max-age=86400, s-maxage=604800",
                                    "CDN-Cache-Control": "public, max-age=604800",
                                    "X-Cache": "HIT",
                                },
                            });
                        }
                    } catch (e) {
                        console.warn("KV cache read error:", e);
                    }
                }

                try {
                    const { coeffs, globals } = deserializeCoeffs(seed);
                    const processedCoeffs = applyGlobals(coeffs, globals);
                    const gradientColors = cosineGradient(steps, processedCoeffs);
                    const hexColors = gradientColors.map(([r, g, b]) =>
                        rgbToHex(r, g, b),
                    );

                    // Underlay for styles that don't paint the full canvas.
                    const bgColor =
                        calculateAverageBrightness(hexColors) > 0.5
                            ? LIGHT_BG
                            : DARK_BG;

                    let svgInnerContent = "";
                    if (style === "angularGradient") {
                        svgInnerContent = generateAngularGradientSvg(
                            hexColors,
                            angle,
                            width,
                            height,
                        );
                    } else {
                        const baseSvgString = generateSvgGradient(
                            hexColors,
                            style,
                            angle,
                            { seed, searchString: "" },
                            null,
                            { width, height },
                        );
                        if (
                            baseSvgString.includes("<svg") &&
                            baseSvgString.includes("</svg>")
                        ) {
                            const openTagEndIndex =
                                baseSvgString.indexOf(
                                    ">",
                                    baseSvgString.indexOf("<svg"),
                                ) + 1;
                            const closeTagStartIndex =
                                baseSvgString.lastIndexOf("</svg>");
                            if (openTagEndIndex > 0 && closeTagStartIndex > 0) {
                                svgInnerContent = baseSvgString.substring(
                                    openTagEndIndex,
                                    closeTagStartIndex,
                                );
                            }
                        }
                    }

                    const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect x="0" y="0" width="${width}" height="${height}" fill="${bgColor}"/>
        ${svgInnerContent}
      </svg>`;

                    // free() releases WASM linear memory; without it every
                    // render leaks permanently since WASM memory never shrinks
                    const resvg = await Resvg.async(fullSvg, {
                        fitTo: { mode: "width", value: width },
                    });

                    let pngBuffer: Uint8Array;
                    try {
                        const pngData = resvg.render();
                        try {
                            pngBuffer = pngData.asPng();
                        } finally {
                            pngData.free();
                        }
                    } finally {
                        resvg.free();
                    }

                    if (env.OG_IMAGE_CACHE) {
                        try {
                            await env.OG_IMAGE_CACHE.put(cacheKey, pngBuffer, {
                                expirationTtl: CACHE_TTL_SECONDS,
                            });
                        } catch (e) {
                            console.warn("KV cache write error:", e);
                        }
                    }

                    return new Response(new Uint8Array(pngBuffer), {
                        status: 200,
                        headers: {
                            "Content-Type": "image/png",
                            "Cache-Control": "public, max-age=86400, s-maxage=604800",
                            "CDN-Cache-Control": "public, max-age=604800",
                            "X-Cache": "MISS",
                        },
                    });
                } catch (error) {
                    console.error("Error generating palette PNG:", error);
                    return new Response("Error generating image", { status: 500 });
                }
            },
        },
    },
});
