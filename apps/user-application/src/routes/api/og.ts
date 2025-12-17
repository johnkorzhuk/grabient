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

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

// Theme colors matching the app
const DARK_BG = "#0a0a0b";
const DARK_FG = "#fafafa";
const LIGHT_BG = "#ffffff";
const LIGHT_FG = "#0a0a0b";

// Logo path from the app
const LOGO_PATH =
    "M17.0015787 16.3699871v7.4230271h10.7969796c-.9771022 3.5394567-4.0549742 5.8499353-8.6473547 5.8499353-4.5435253 0-9.91758758-3.293661-9.91758758-10.9133247 0-7.1772315 5.32520708-10.56921083 9.86873248-10.56921083 3.9084089 0 6.5465849 2.16300133 7.9633831 4.71927553h10.3572836C35.4199556 5.84993532 27.9939787 0 19.3466241 0 8.6962098 0 0 7.86545925 0 18.7296248c0 10.4708927 8.2565138 19.0737387 19.2000587 19.0737387 10.0152978 0 19.297769-7.3247089 19.297769-19.5161707 0-.7373868 0-1.2781372-.0488552-1.9172057H17.0015787zm26.0056541 20.6959896h8.1099485V22.072445c0-4.1293661 2.638176-4.915912 6.4000195-5.0142303V8.84864166c-4.6900906 0-6.1068889 2.50711514-6.7908604 3.83441134h-.0977103V9.78266494h-7.6213973V37.0659767zM89.3854683 9.78266494V37.0659767h-8.1099485v-2.9495472h-.0977102C79.8098665 36.771022 76.4388638 38 73.2632816 38c-8.5984996 0-13.6305761-6.7839586-13.6305761-14.6002587 0-8.9469599 6.4000196-14.55109964 13.6305761-14.55109964 4.4458151 0 6.9374257 2.16300124 7.914528 3.83441134h.0977102V9.78266494h8.1099485zM67.742654 23.4980595c0 2.5562743 1.8564942 6.8822769 6.7420053 6.8822769 5.0809316 0 6.7908605-4.3260026 6.7908605-6.9805951 0-3.2936611-2.2473351-6.931436-6.8397156-6.931436-4.6412355 0-6.6931502 3.9327296-6.6931502 7.0297542zm27.9110034 13.5679172V.68822768h8.1099486V11.9456662c2.882451-3.09702454 6.742005-3.09702454 7.865673-3.09702454 5.667193 0 13.337445 4.08020694 13.337445 14.40362224C124.966724 33.084088 118.175864 38 111.287293 38c-3.810699 0-6.742005-1.8680466-7.767963-3.8344114h-.09771v2.9003881h-7.7679626zm7.8168176-13.7153946c0 3.7852523 2.540466 7.0297543 6.59544 7.0297543 4.152685 0 6.790861-3.3919793 6.790861-6.9805951 0-3.5394567-2.638176-6.931436-6.644295-6.931436-4.29925 0-6.742006 3.4902975-6.742006 6.8822768zm34.262168-13.56791716h-8.109948V37.0659767h8.109948V9.78266494zm0-9.09443726h-8.109948v6.19404916h8.109948V.68822768zm23.807174 27.82406212h8.305369c-1.319088 3.0478654-3.224437 5.4075032-5.520628 6.9805951-2.247335 1.6222509-4.934366 2.457956-7.719107 2.457956-7.767963 0-14.363403-6.3415265-14.363403-14.4527814 0-7.6196636 5.960324-14.64941784 14.216838-14.64941784 8.256513 0 14.314547 6.58732214 14.314547 14.89521344 0 1.0815007-.09771 1.5239327-.19542 2.1630013h-20.323727c.488552 3.2445019 3.175583 5.1617076 6.351165 5.1617076 2.491611 0 3.810699-1.1306597 4.934366-2.5562742zm-11.18782-8.1112549h12.311488c-.341986-1.6222509-1.954205-4.6701164-6.155744-4.6701164-4.20154 0-5.813759 3.0478655-6.155744 4.6701164zm25.028552 16.6649418h8.109948V22.2199224c0-1.6714101 0-5.702458 4.641236-5.702458 4.250394 0 4.250394 3.7360932 4.250394 5.6532989v14.8952134h8.109949V20.007762c0-5.3583441-1.661074-7.5213454-3.126727-8.7994826-1.465654-1.2781371-4.348105-2.35963774-6.937426-2.35963774-4.836656 0-6.546585 2.50711514-7.377122 3.83441134h-.09771V9.78266494h-7.572542V37.0659767zM216.091591.68822768h-8.109948v9.09443726h-4.006119v6.19404916h4.006119v21.0892626h8.109948V15.9767141H220V9.78266494h-3.908409V.68822768z";

const DEFAULT_SEED =
    "HQNgTAHANMAsEFYZjLKBaADMAzARmi2DAE4QZYTDtY8wNswQSY8B2cvXJh4BE%2Bui6ZMOIA";

function getCacheKey(
    seed: string,
    style: string,
    steps: number,
    angle: number,
): string {
    return `og:${seed}:${style}:${steps}:${angle}`;
}

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
    const totalAngle = 360;
    const segmentAngle = totalAngle / totalSegments;

    let paths = "";

    for (let i = 0; i < totalSegments; i++) {
        const colorPairIndex = Math.floor(i / segmentsPerColorPair);
        const progressInPair = (i % segmentsPerColorPair) / segmentsPerColorPair;

        const color1 = hexColors[colorPairIndex] ?? "#000000";
        const color2 = hexColors[Math.min(colorPairIndex + 1, hexColors.length - 1)] ?? "#000000";

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

        const largeArcFlag = (segmentEnd - segmentStart) > 180 ? 1 : 0;

        const pathData = `M ${centerX.toFixed(2)},${centerY.toFixed(2)} L ${startX.toFixed(2)},${startY.toFixed(2)} A ${radius.toFixed(2)},${radius.toFixed(2)} 0 ${largeArcFlag} 1 ${endX.toFixed(2)},${endY.toFixed(2)} Z`;

        paths += `<path d="${pathData}" fill="${fillColor}" />`;
    }

    return paths;
}

export const Route = createFileRoute("/api/og")({
    server: {
        handlers: {
            GET: async ({ request }) => {
                const url = new URL(request.url);
                const seedParam = url.searchParams.get("seed");

                // Validate seed first - only error if provided and invalid
                if (seedParam) {
                    const seedResult = v.safeParse(seedValidator, seedParam);
                    if (!seedResult.success) {
                        return new Response("Invalid seed format", { status: 400 });
                    }
                }

                const seed = seedParam || DEFAULT_SEED;

                // Parse style with fallback to default
                const styleParam = url.searchParams.get("style");
                const styleResult = v.safeParse(paletteStyleValidator, styleParam);
                const style = styleResult.success ? styleResult.output : DEFAULT_STYLE;

                // Parse steps with fallback to default
                const stepsParam = url.searchParams.get("steps");
                const parsedSteps = stepsParam ? parseInt(stepsParam, 10) : NaN;
                const stepsResult = v.safeParse(stepsValidator, parsedSteps);
                const steps = stepsResult.success ? stepsResult.output : DEFAULT_STEPS;

                // Parse angle with fallback to default
                const angleParam = url.searchParams.get("angle");
                const parsedAngle = angleParam ? parseInt(angleParam, 10) : NaN;
                const angleResult = v.safeParse(angleValidator, parsedAngle);
                const angle = angleResult.success ? angleResult.output : DEFAULT_ANGLE;

                const cacheKey = getCacheKey(seed, style, steps, angle);

                // Check KV cache first
                if (env.OG_IMAGE_CACHE) {
                    try {
                        const cached =
                            await env.OG_IMAGE_CACHE.get(cacheKey, "arrayBuffer");
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
                    const width = 1200;
                    const height = 630;
                    const padding = 24;
                    const headerHeight = 72; // Space for logo above palette
                    const gap = 12;
                    const borderRadius = 16;

                    // 1. Deserialize the seed to get coefficients
                    const { coeffs, globals } = deserializeCoeffs(seed);

                    // 2. Apply global modifiers and generate gradient colors
                    const processedCoeffs = applyGlobals(coeffs, globals);
                    const gradientColors = cosineGradient(steps, processedCoeffs);

                    // 3. Convert to hex colors for the SVG generator
                    const hexColors = gradientColors.map(([r, g, b]) =>
                        rgbToHex(r, g, b),
                    );

                    // 4. Calculate average brightness and choose theme
                    const avgBrightness = calculateAverageBrightness(hexColors);
                    const isDark = avgBrightness > 0.5; // If palette is bright, use dark background
                    const bgColor = isDark ? DARK_BG : LIGHT_BG;
                    const fgColor = isDark ? DARK_FG : LIGHT_FG;

                    // 5. Generate the gradient SVG content
                    const paletteWidth = width - padding * 2;
                    const paletteHeight = height - padding * 2 - headerHeight - gap;
                    let svgInnerContent = "";

                    if (style === "angularGradient") {
                        svgInnerContent = generateAngularGradientSvg(
                            hexColors,
                            angle,
                            paletteWidth,
                            paletteHeight,
                        );
                    } else {
                        const baseSvgString = generateSvgGradient(
                            hexColors,
                            style,
                            angle,
                            { seed, searchString: "" },
                            null,
                            { width: paletteWidth, height: paletteHeight },
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

                    // 6. Create gradient stops for the logo bar
                    const gradientStops = hexColors
                        .map((color, index) => {
                            const offset = (index / (hexColors.length - 1)) * 100;
                            return `<stop offset="${offset}%" stop-color="${color}" />`;
                        })
                        .join("");

                    // 7. Compose the final SVG with rounded palette and logo outside
                    const paletteY = padding + headerHeight + gap;
                    const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect x="0" y="0" width="${width}" height="${height}" fill="${bgColor}"/>
        <defs>
            <clipPath id="paletteClip">
                <rect x="${padding}" y="${paletteY}" width="${paletteWidth}" height="${paletteHeight}" rx="${borderRadius}" ry="${borderRadius}" />
            </clipPath>
            <linearGradient x1="0%" y1="0%" x2="100%" y2="0%" id="logoGradient">
                ${gradientStops}
            </linearGradient>
        </defs>
        <g clip-path="url(#paletteClip)">
            <g transform="translate(${padding}, ${paletteY})">
                ${svgInnerContent}
            </g>
        </g>
        <!-- Logo in top left, outside palette -->
        <g transform="translate(${padding}, ${padding + 6})">
            <g transform="scale(1.3)">
                <g fill="none" fill-rule="evenodd">
                    <path d="${LOGO_PATH}" fill="${fgColor}" />
                    <rect x="93" y="43" width="34" height="7" fill="url(#logoGradient)" />
                </g>
            </g>
        </g>
      </svg>`;

                    // 8. Convert SVG to PNG using @cf-wasm/resvg
                    const resvg = await Resvg.async(fullSvg, {
                        fitTo: {
                            mode: "width",
                            value: 1200,
                        },
                    });

                    const pngData = resvg.render();
                    const pngBuffer = pngData.asPng();

                    // 9. Store in KV cache for future requests
                    if (env.OG_IMAGE_CACHE) {
                        try {
                            await env.OG_IMAGE_CACHE.put(
                                cacheKey,
                                pngBuffer,
                                { expirationTtl: CACHE_TTL_SECONDS },
                            );
                        } catch (e) {
                            console.warn("KV cache write error:", e);
                        }
                    }

                    // 10. Return PNG with caching headers
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
                    console.error("Error generating OG image:", error);
                    return new Response("Error generating image", { status: 500 });
                }
            },
        },
    },
});
