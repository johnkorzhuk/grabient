import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { Resvg } from "@cf-wasm/resvg/workerd";
import { deserializeCoeffs } from "@repo/data-ops/serialization";
import {
    applyGlobals,
    cosineGradient,
    rgbToHex,
} from "@repo/data-ops/gradient-gen/cosine";
import { generateSvgGradient } from "@repo/data-ops/gradient-gen/svg";
import {
    DEFAULT_PAGE_LIMIT,
    stepsValidator,
    angleValidator,
    paletteStyleValidator,
    seedValidator,
} from "@repo/data-ops/valibot-schema/grabient";
import * as v from "valibot";
import { replaceHexWithColorNames } from "@/lib/color-utils";

const OG_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

// Theme colors matching the app
const DARK_BG = "#0a0a0b";
const DARK_FG = "#fafafa";
const LIGHT_BG = "#ffffff";
const LIGHT_FG = "#0a0a0b";

// Logo path from the app
const LOGO_PATH =
    "M17.0015787 16.3699871v7.4230271h10.7969796c-.9771022 3.5394567-4.0549742 5.8499353-8.6473547 5.8499353-4.5435253 0-9.91758758-3.293661-9.91758758-10.9133247 0-7.1772315 5.32520708-10.56921083 9.86873248-10.56921083 3.9084089 0 6.5465849 2.16300133 7.9633831 4.71927553h10.3572836C35.4199556 5.84993532 27.9939787 0 19.3466241 0 8.6962098 0 0 7.86545925 0 18.7296248c0 10.4708927 8.2565138 19.0737387 19.2000587 19.0737387 10.0152978 0 19.297769-7.3247089 19.297769-19.5161707 0-.7373868 0-1.2781372-.0488552-1.9172057H17.0015787zm26.0056541 20.6959896h8.1099485V22.072445c0-4.1293661 2.638176-4.915912 6.4000195-5.0142303V8.84864166c-4.6900906 0-6.1068889 2.50711514-6.7908604 3.83441134h-.0977103V9.78266494h-7.6213973V37.0659767zM89.3854683 9.78266494V37.0659767h-8.1099485v-2.9495472h-.0977102C79.8098665 36.771022 76.4388638 38 73.2632816 38c-8.5984996 0-13.6305761-6.7839586-13.6305761-14.6002587 0-8.9469599 6.4000196-14.55109964 13.6305761-14.55109964 4.4458151 0 6.9374257 2.16300124 7.914528 3.83441134h.0977102V9.78266494h8.1099485zM67.742654 23.4980595c0 2.5562743 1.8564942 6.8822769 6.7420053 6.8822769 5.0809316 0 6.7908605-4.3260026 6.7908605-6.9805951 0-3.2936611-2.2473351-6.931436-6.8397156-6.931436-4.6412355 0-6.6931502 3.9327296-6.6931502 7.0297542zm27.9110034 13.5679172V.68822768h8.1099486V11.9456662c2.882451-3.09702454 6.742005-3.09702454 7.865673-3.09702454 5.667193 0 13.337445 4.08020694 13.337445 14.40362224C124.966724 33.084088 118.175864 38 111.287293 38c-3.810699 0-6.742005-1.8680466-7.767963-3.8344114h-.09771v2.9003881h-7.7679626zm7.8168176-13.7153946c0 3.7852523 2.540466 7.0297543 6.59544 7.0297543 4.152685 0 6.790861-3.3919793 6.790861-6.9805951 0-3.5394567-2.638176-6.931436-6.644295-6.931436-4.29925 0-6.742006 3.4902975-6.742006 6.8822768zm34.262168-13.56791716h-8.109948V37.0659767h8.109948V9.78266494zm0-9.09443726h-8.109948v6.19404916h8.109948V.68822768zm23.807174 27.82406212h8.305369c-1.319088 3.0478654-3.224437 5.4075032-5.520628 6.9805951-2.247335 1.6222509-4.934366 2.457956-7.719107 2.457956-7.767963 0-14.363403-6.3415265-14.363403-14.4527814 0-7.6196636 5.960324-14.64941784 14.216838-14.64941784 8.256513 0 14.314547 6.58732214 14.314547 14.89521344 0 1.0815007-.09771 1.5239327-.19542 2.1630013h-20.323727c.488552 3.2445019 3.175583 5.1617076 6.351165 5.1617076 2.491611 0 3.810699-1.1306597 4.934366-2.5562742zm-11.18782-8.1112549h12.311488c-.341986-1.6222509-1.954205-4.6701164-6.155744-4.6701164-4.20154 0-5.813759 3.0478655-6.155744 4.6701164zm25.028552 16.6649418h8.109948V22.2199224c0-1.6714101 0-5.702458 4.641236-5.702458 4.250394 0 4.250394 3.7360932 4.250394 5.6532989v14.8952134h8.109949V20.007762c0-5.3583441-1.661074-7.5213454-3.126727-8.7994826-1.465654-1.2781371-4.348105-2.35963774-6.937426-2.35963774-4.836656 0-6.546585 2.50711514-7.377122 3.83441134h-.09771V9.78266494h-7.572542V37.0659767zM216.091591.68822768h-8.109948v9.09443726h-4.006119v6.19404916h4.006119v21.0892626h8.109948V15.9767141H220V9.78266494h-3.908409V.68822768z";

type GradientStyle = v.InferOutput<typeof paletteStyleValidator>;

function getSearchCacheKey(query: string, limit: number): string {
    return `search:${query.toLowerCase().trim()}:${limit}`;
}

function getOgCacheKey(
    query: string,
    style: GradientStyle | "auto",
    steps: number | "auto",
    angle: number | "auto",
): string {
    const normalizedQuery = replaceHexWithColorNames(query);
    return `og-query:${normalizedQuery.toLowerCase().trim()}:${style}:${steps}:${angle}`;
}

interface SearchResult {
    seed: string;
    tags: string[];
    style: GradientStyle;
    steps: number;
    angle: number;
    likesCount: number;
    createdAt: number;
    score: number;
}

const vectorMetadataSchema = v.object({
    seed: seedValidator,
    tags: v.array(v.string()),
    style: paletteStyleValidator,
    steps: stepsValidator,
    angle: angleValidator,
    likesCount: v.number(),
    createdAt: v.number(),
});

const searchResultSchema = v.object({
    ...vectorMetadataSchema.entries,
    score: v.number(),
});

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

function generateGradientSvgContent(
    seed: string,
    style: GradientStyle,
    steps: number,
    angle: number,
    width: number,
    height: number,
    gridItemIndex: number,
): { content: string; hexColors: string[] } {
    const { coeffs, globals } = deserializeCoeffs(seed);
    const processedCoeffs = applyGlobals(coeffs, globals);
    const gradientColors = cosineGradient(steps, processedCoeffs);
    const hexColors = gradientColors.map(([r, g, b]) => rgbToHex(r, g, b));

    if (style === "angularGradient") {
        return {
            content: generateAngularGradientSvg(hexColors, angle, width, height),
            hexColors,
        };
    }

    let effectiveStyle: GradientStyle = style;
    if (style === "deepFlow") {
        effectiveStyle = "linearSwatches";
    }

    const baseSvgString = generateSvgGradient(
        hexColors,
        effectiveStyle,
        angle,
        { seed, searchString: "" },
        null,
        { width, height, gridItemIndex },
    );

    if (baseSvgString.includes("<svg") && baseSvgString.includes("</svg>")) {
        const openTagEndIndex =
            baseSvgString.indexOf(">", baseSvgString.indexOf("<svg")) + 1;
        const closeTagStartIndex = baseSvgString.lastIndexOf("</svg>");
        if (openTagEndIndex > 0 && closeTagStartIndex > 0) {
            return {
                content: baseSvgString.substring(openTagEndIndex, closeTagStartIndex),
                hexColors,
            };
        }
    }

    return { content: "", hexColors };
}

function calculateAverageBrightness(hexColors: string[]): number {
    if (hexColors.length === 0) return 0.5;

    let totalBrightness = 0;
    for (const hex of hexColors) {
        const r = (parseInt(hex.slice(1, 3), 16) || 0) / 255;
        const g = (parseInt(hex.slice(3, 5), 16) || 0) / 255;
        const b = (parseInt(hex.slice(5, 7), 16) || 0) / 255;
        // Standard luminance formula
        totalBrightness += r * 0.299 + g * 0.587 + b * 0.114;
    }
    return totalBrightness / hexColors.length;
}

interface GridItemData {
    seed: string;
    style: GradientStyle;
    steps: number;
    angle: number;
}

function generate4x3GridSvg(
    results: SearchResult[],
    urlStyle: GradientStyle | "auto",
    urlSteps: number | "auto",
    urlAngle: number | "auto",
): string {
    const width = 1200;
    const height = 630;
    const padding = 24;
    const gap = 24;
    const headerHeight = 72; // More space for logo
    const borderRadius = 10;

    const cols = 4;
    const rows = 3;

    const gridWidth = width - padding * 2;
    const gridHeight = height - padding * 2 - headerHeight - gap;
    const cellWidth = (gridWidth - gap * (cols - 1)) / cols;
    const cellHeight = (gridHeight - gap * (rows - 1)) / rows;

    const gridItems = results.slice(0, 12);
    const gridItemsData: GridItemData[] = gridItems.map((item) => ({
        seed: item.seed,
        style: urlStyle === "auto" ? item.style : urlStyle,
        steps: urlSteps === "auto" ? item.steps : urlSteps,
        angle: urlAngle === "auto" ? item.angle : urlAngle,
    }));

    // Collect all hex colors from the 9 palettes to calculate average brightness
    const allHexColors: string[] = [];
    const cellContents: { content: string; hexColors: string[] }[] = [];

    for (let i = 0; i < gridItemsData.length; i++) {
        const itemData = gridItemsData[i]!;
        const result = generateGradientSvgContent(
            itemData.seed,
            itemData.style,
            itemData.steps,
            itemData.angle,
            cellWidth,
            cellHeight,
            i,
        );
        cellContents.push(result);
        allHexColors.push(...result.hexColors);
    }

    // Calculate average brightness and choose theme
    const avgBrightness = calculateAverageBrightness(allHexColors);
    const isDark = avgBrightness > 0.5; // If palettes are bright, use dark background
    const bgColor = isDark ? DARK_BG : LIGHT_BG;
    const fgColor = isDark ? DARK_FG : LIGHT_FG;

    // Get first item colors for logo gradient bar
    const firstItemColors = cellContents[0]?.hexColors ?? ["#ffffff"];

    // Build gradient stops for logo bar
    const gradientStops = firstItemColors
        .map((color, index) => {
            const offset = (index / (firstItemColors.length - 1)) * 100;
            return `<stop offset="${offset}%" stop-color="${color}" />`;
        })
        .join("");

    let svgContent = "";

    // Generate grid cells with rounded corners
    for (let i = 0; i < gridItemsData.length; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = padding + col * (cellWidth + gap);
        const y = padding + headerHeight + gap + row * (cellHeight + gap);

        const cellContent = cellContents[i]?.content ?? "";

        svgContent += `
            <defs>
                <clipPath id="cell-clip-${i}">
                    <rect x="${x}" y="${y}" width="${cellWidth}" height="${cellHeight}" rx="${borderRadius}" ry="${borderRadius}" />
                </clipPath>
            </defs>
            <g clip-path="url(#cell-clip-${i})">
                <g transform="translate(${x}, ${y})">
                    ${cellContent}
                </g>
            </g>`;
    }

    // Fill remaining cells with placeholder if less than 12 results
    for (let i = gridItemsData.length; i < 12; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = padding + col * (cellWidth + gap);
        const y = padding + headerHeight + gap + row * (cellHeight + gap);
        svgContent += `<rect x="${x}" y="${y}" width="${cellWidth}" height="${cellHeight}" rx="${borderRadius}" ry="${borderRadius}" fill="#1a1a1a"/>`;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect x="0" y="0" width="${width}" height="${height}" fill="${bgColor}"/>
        ${svgContent}
        <defs>
            <linearGradient x1="0%" y1="0%" x2="100%" y2="0%" id="logoGradient">
                ${gradientStops}
            </linearGradient>
        </defs>
        <!-- Logo in top left -->
        <g transform="translate(${padding}, ${padding + 6})">
            <g transform="scale(1.3)">
                <g fill="none" fill-rule="evenodd">
                    <path d="${LOGO_PATH}" fill="${fgColor}" />
                    <rect x="93" y="43" width="34" height="7" fill="url(#logoGradient)" />
                </g>
            </g>
        </g>
    </svg>`;
}

export const Route = createFileRoute("/api/og/query")({
    server: {
        handlers: {
            GET: async ({ request }) => {
                const url = new URL(request.url);
                const queryParam = url.searchParams.get("query") || url.searchParams.get("q");

                if (!queryParam || !queryParam.trim()) {
                    return new Response("Missing query parameter", {
                        status: 400,
                    });
                }

                const query = queryParam.trim();
                const limit = DEFAULT_PAGE_LIMIT;

                // Parse style with fallback to auto
                const styleParam = url.searchParams.get("style");
                const styleResult = v.safeParse(paletteStyleValidator, styleParam);
                const style: GradientStyle | "auto" = styleResult.success
                    ? styleResult.output
                    : "auto";

                // Parse steps with fallback to auto
                const stepsParam = url.searchParams.get("steps");
                const parsedSteps = stepsParam ? parseInt(stepsParam, 10) : NaN;
                const stepsResult = v.safeParse(stepsValidator, parsedSteps);
                const steps: number | "auto" = stepsResult.success
                    ? stepsResult.output
                    : "auto";

                // Parse angle with fallback to auto
                const angleParam = url.searchParams.get("angle");
                const parsedAngle = angleParam ? parseInt(angleParam, 10) : NaN;
                const angleResult = v.safeParse(angleValidator, parsedAngle);
                const angle: number | "auto" = angleResult.success
                    ? angleResult.output
                    : "auto";

                const ogCacheKey = getOgCacheKey(query, style, steps, angle);

                // 1. Check OG image cache first
                if (env.OG_IMAGE_CACHE) {
                    try {
                        const cached = await env.OG_IMAGE_CACHE.get(
                            ogCacheKey,
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
                        console.warn("OG cache read error:", e);
                    }
                }

                // 2. Get search results from SEARCH_CACHE (same key format as search server fn)
                const normalizedQuery = replaceHexWithColorNames(query);
                const searchCacheKey = getSearchCacheKey(normalizedQuery, limit);

                let searchResults: SearchResult[] = [];

                if (env.SEARCH_CACHE) {
                    try {
                        const cached = await env.SEARCH_CACHE.get<SearchResult[]>(
                            searchCacheKey,
                            "json",
                        );
                        if (cached) {
                            searchResults = cached;
                        }
                    } catch (e) {
                        console.warn("Search cache read error:", e);
                    }
                }

                // 3. If no cached search results, perform the vector search
                if (searchResults.length === 0) {
                    if (!env.AI || !env.VECTORIZE) {
                        return new Response(
                            "Search unavailable: AI/Vectorize bindings not available",
                            { status: 503 },
                        );
                    }

                    try {
                        const embeddingResponse = await env.AI.run(
                            "@cf/google/embeddinggemma-300m",
                            { text: [normalizedQuery] },
                        );

                        if (
                            !("data" in embeddingResponse) ||
                            !embeddingResponse.data
                        ) {
                            return new Response("Failed to generate embedding", {
                                status: 500,
                            });
                        }

                        const queryVector = embeddingResponse.data[0];
                        if (!queryVector) {
                            return new Response("Failed to generate embedding", {
                                status: 500,
                            });
                        }

                        const matches = await env.VECTORIZE.query(queryVector, {
                            topK: limit,
                            returnMetadata: "all",
                        });

                        searchResults = matches.matches
                            .map((match) => {
                                const parsed = v.safeParse(
                                    searchResultSchema,
                                    { ...match.metadata, score: match.score },
                                );
                                if (!parsed.success) return null;
                                return parsed.output;
                            })
                            .filter((r): r is SearchResult => r !== null);

                        // Store in search cache for future requests
                        if (env.SEARCH_CACHE && searchResults.length > 0) {
                            try {
                                await env.SEARCH_CACHE.put(
                                    searchCacheKey,
                                    JSON.stringify(searchResults),
                                    { expirationTtl: 60 * 60 * 24 * 3 }, // 3 days
                                );
                            } catch (e) {
                                console.warn("Search cache write error:", e);
                            }
                        }
                    } catch (e) {
                        console.error("Vector search error:", e);
                        return new Response("Search failed", { status: 500 });
                    }
                }

                if (searchResults.length === 0) {
                    return new Response("No results found", { status: 404 });
                }

                try {
                    // 4. Generate 4x3 grid SVG with UI-like styling
                    const fullSvg = generate4x3GridSvg(
                        searchResults,
                        style,
                        steps,
                        angle,
                    );

                    // 5. Convert SVG to PNG
                    const resvg = await Resvg.async(fullSvg, {
                        fitTo: { mode: "width", value: 1200 },
                    });

                    const pngData = resvg.render();
                    const pngBuffer = pngData.asPng();

                    // 6. Store in OG cache
                    if (env.OG_IMAGE_CACHE) {
                        try {
                            await env.OG_IMAGE_CACHE.put(ogCacheKey, pngBuffer, {
                                expirationTtl: OG_CACHE_TTL_SECONDS,
                            });
                        } catch (e) {
                            console.warn("OG cache write error:", e);
                        }
                    }

                    // 7. Return PNG
                    return new Response(new Uint8Array(pngBuffer), {
                        status: 200,
                        headers: {
                            "Content-Type": "image/png",
                            "Cache-Control":
                                "public, max-age=86400, s-maxage=604800",
                            "CDN-Cache-Control": "public, max-age=604800",
                            "X-Cache": "MISS",
                        },
                    });
                } catch (error) {
                    console.error("Error generating search OG image:", error);
                    return new Response("Error generating image", {
                        status: 500,
                    });
                }
            },
        },
    },
});
