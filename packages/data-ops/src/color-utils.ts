/** Matches hex codes: #RGB or #RRGGBB (works in arrays, quotes, or standalone) */
export const HEX_CODE_REGEX = /#([0-9a-fA-F]{3}(?![0-9a-fA-F])|[0-9a-fA-F]{6}(?![0-9a-fA-F]))/g;

/** Checks if a string is a valid hex color code */
export function isHexColor(str: string): boolean {
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(str);
}

export const BASIC_COLORS: Array<{ name: string; r: number; g: number; b: number }> = [
    { name: "black", r: 0, g: 0, b: 0 },
    { name: "white", r: 255, g: 255, b: 255 },
    { name: "red", r: 255, g: 0, b: 0 },
    { name: "green", r: 0, g: 128, b: 0 },
    { name: "blue", r: 0, g: 0, b: 255 },
    { name: "yellow", r: 255, g: 255, b: 0 },
    { name: "cyan", r: 0, g: 255, b: 255 },
    { name: "magenta", r: 255, g: 0, b: 255 },
    { name: "orange", r: 255, g: 165, b: 0 },
    { name: "pink", r: 255, g: 192, b: 203 },
    { name: "purple", r: 128, g: 0, b: 128 },
    { name: "brown", r: 165, g: 42, b: 42 },
    { name: "gray", r: 128, g: 128, b: 128 },
    { name: "gold", r: 255, g: 215, b: 0 },
    { name: "teal", r: 0, g: 128, b: 128 },
    { name: "navy", r: 0, g: 0, b: 128 },
    { name: "maroon", r: 128, g: 0, b: 0 },
    { name: "olive", r: 128, g: 128, b: 0 },
    { name: "turquoise", r: 64, g: 224, b: 208 },
    { name: "indigo", r: 75, g: 0, b: 130 },
    { name: "violet", r: 238, g: 130, b: 238 },
    { name: "beige", r: 245, g: 245, b: 220 },
    { name: "tan", r: 210, g: 180, b: 140 },
    { name: "coral", r: 255, g: 127, b: 80 },
    { name: "salmon", r: 250, g: 128, b: 114 },
    { name: "khaki", r: 240, g: 230, b: 140 },
    { name: "lavender", r: 230, g: 230, b: 250 },
    { name: "peach", r: 255, g: 218, b: 185 },
    { name: "mint", r: 189, g: 252, b: 201 },
    { name: "lime", r: 0, g: 255, b: 0 },
    { name: "aqua", r: 0, g: 255, b: 255 },
    { name: "silver", r: 192, g: 192, b: 192 },
    { name: "crimson", r: 220, g: 20, b: 60 },
    { name: "chocolate", r: 210, g: 105, b: 30 },
    { name: "ivory", r: 255, g: 255, b: 240 },
    { name: "azure", r: 240, g: 255, b: 255 },
    { name: "plum", r: 221, g: 160, b: 221 },
    { name: "orchid", r: 218, g: 112, b: 214 },
    { name: "rose", r: 255, g: 0, b: 127 },
    { name: "slate", r: 112, g: 128, b: 144 },
    { name: "charcoal", r: 54, g: 69, b: 79 },
];

function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const clean = hex.replace("#", "").toLowerCase();
    let expanded = clean;
    if (clean.length === 3) {
        expanded = `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`;
    }
    return {
        r: parseInt(expanded.slice(0, 2), 16),
        g: parseInt(expanded.slice(2, 4), 16),
        b: parseInt(expanded.slice(4, 6), 16),
    };
}

function colorDistance(
    c1: { r: number; g: number; b: number },
    c2: { r: number; g: number; b: number },
): number {
    const dr = c1.r - c2.r;
    const dg = c1.g - c2.g;
    const db = c1.b - c2.b;
    return dr * dr + dg * dg + db * db;
}

export function hexToColorName(hex: string): string {
    const rgb = hexToRgb(hex);
    let closestName = "color";
    let minDistance = Number.MAX_SAFE_INTEGER;

    for (const color of BASIC_COLORS) {
        const dist = colorDistance(rgb, color);
        if (dist < minDistance) {
            minDistance = dist;
            closestName = color.name;
        }
        if (dist === 0) break;
    }

    return closestName;
}

/** Replaces all hex codes in a string with their closest color names */
export function replaceHexWithColorNames(query: string): string {
    return query.replace(HEX_CODE_REGEX, (match) => hexToColorName(match));
}

const COLOR_NAME_MAP = new Map(
    BASIC_COLORS.map((c) => [c.name.toLowerCase(), c]),
);

export function colorNameToHex(name: string): string | null {
    const color = COLOR_NAME_MAP.get(name.toLowerCase());
    if (!color) return null;
    const toHex = (n: number) => n.toString(16).padStart(2, "0");
    return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

export function isColorName(word: string): boolean {
    return COLOR_NAME_MAP.has(word.toLowerCase());
}

export function simplifyHex(hex: string): string {
    const clean = hex.replace("#", "").toLowerCase();
    if (clean.length !== 6) return hex;

    if (
        clean[0] === clean[1] &&
        clean[2] === clean[3] &&
        clean[4] === clean[5]
    ) {
        return `#${clean[0]}${clean[2]}${clean[4]}`;
    }
    return hex;
}

export function isExactColorMatch(hex: string): boolean {
    const rgb = hexToRgb(hex);
    for (const color of BASIC_COLORS) {
        if (color.r === rgb.r && color.g === rgb.g && color.b === rgb.b) {
            return true;
        }
    }
    return false;
}

/**
 * Get unique color names from an array of hex colors, preserving order.
 * Adjacent duplicates are removed to create a readable description.
 */
export function getUniqueColorNames(hexColors: string[]): string[] {
    const names: string[] = [];
    const seen = new Set<string>();

    for (const hex of hexColors) {
        const name = hexToColorName(hex);
        if (!seen.has(name)) {
            seen.add(name);
            names.push(name);
        }
    }

    return names;
}

/**
 * Generate a human-readable gradient description for accessibility.
 * Example: "gradient with coral, salmon, pink, and lavender"
 */
export function getGradientAriaLabel(hexColors: string[]): string {
    const names = getUniqueColorNames(hexColors);

    if (names.length === 0) return "gradient";
    if (names.length === 1) return `${names[0]} gradient`;
    if (names.length === 2) return `gradient from ${names[0]} to ${names[1]}`;

    const last = names[names.length - 1];
    const rest = names.slice(0, -1).join(", ");
    return `gradient with ${rest}, and ${last}`;
}

function rgbToHex(r: number, g: number, b: number): string {
    const toHex = (n: number) => n.toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Convert RGB to HSL. Returns hue in degrees (0-360), saturation and lightness as 0-1.
 */
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    if (max === min) {
        return { h: 0, s: 0, l };
    }

    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    let h = 0;
    if (max === r) {
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
        h = ((b - r) / d + 2) / 6;
    } else {
        h = ((r - g) / d + 4) / 6;
    }

    return { h: h * 360, s, l };
}

export function getColorsWithHex(): Array<{ name: string; hex: string }> {
    return BASIC_COLORS.map((c) => ({
        name: c.name,
        hex: rgbToHex(c.r, c.g, c.b),
    }));
}

export interface ColorWithHue {
    name: string;
    hex: string;
    hue: number;
    saturation: number;
    lightness: number;
}

/**
 * Get colors with HSL values, optionally filtered and sorted by hue.
 * Excludes achromatic colors (black, white, grays) by default.
 */
export function getColorsWithHue(options?: {
    excludeAchromatic?: boolean;
    minSaturation?: number;
}): ColorWithHue[] {
    const { excludeAchromatic = true, minSaturation = 0.1 } = options ?? {};

    return BASIC_COLORS
        .map((c) => {
            const { h, s, l } = rgbToHsl(c.r, c.g, c.b);
            return {
                name: c.name,
                hex: rgbToHex(c.r, c.g, c.b),
                hue: h,
                saturation: s,
                lightness: l,
            };
        })
        .filter((c) => !excludeAchromatic || c.saturation >= minSaturation)
        .sort((a, b) => a.hue - b.hue);
}

/**
 * Check if a tag/word is a basic color name
 */
export function isBasicColor(tag: string): boolean {
    return COLOR_NAME_MAP.has(tag.toLowerCase());
}

/**
 * Get the ColorWithHue data for a basic color name
 */
function getColorData(colorName: string): ColorWithHue | null {
    const color = COLOR_NAME_MAP.get(colorName.toLowerCase());
    if (!color) return null;

    const { h, s, l } = rgbToHsl(color.r, color.g, color.b);
    return {
        name: color.name,
        hex: rgbToHex(color.r, color.g, color.b),
        hue: h,
        saturation: s,
        lightness: l,
    };
}

/**
 * Get all chromatic colors (non-gray colors with sufficient saturation) sorted by hue
 */
function getChromaticColors(): ColorWithHue[] {
    return getColorsWithHue({ excludeAchromatic: true, minSaturation: 0.15 });
}

/**
 * Find the closest color by hue, searching in a specific direction
 * @param targetHue - The hue to search from (0-360)
 * @param direction - 1 for clockwise, -1 for counter-clockwise
 * @param excludeNames - Color names to exclude from results
 * @param count - Number of colors to find
 */
function findColorsByHueDirection(
    targetHue: number,
    direction: 1 | -1,
    excludeNames: Set<string>,
    count: number
): ColorWithHue[] {
    const chromatic = getChromaticColors();
    const results: ColorWithHue[] = [];

    const sortedByDistance = chromatic
        .filter(c => !excludeNames.has(c.name))
        .map(c => {
            let diff = c.hue - targetHue;
            if (direction === 1) {
                if (diff < 0) diff += 360;
            } else {
                if (diff > 0) diff -= 360;
                diff = Math.abs(diff);
            }
            return { color: c, distance: diff };
        })
        .sort((a, b) => a.distance - b.distance);

    for (const item of sortedByDistance) {
        if (results.length >= count) break;
        if (!excludeNames.has(item.color.name)) {
            results.push(item.color);
            excludeNames.add(item.color.name);
        }
    }

    return results;
}

/**
 * Find complementary colors (opposite on the color wheel, ~180 degrees apart)
 */
function findComplementaryColors(
    targetHue: number,
    excludeNames: Set<string>,
    count: number
): ColorWithHue[] {
    const chromatic = getChromaticColors();
    const complementHue = (targetHue + 180) % 360;

    const sortedByDistance = chromatic
        .filter(c => !excludeNames.has(c.name))
        .map(c => {
            const diff = Math.abs(c.hue - complementHue);
            const distance = Math.min(diff, 360 - diff);
            return { color: c, distance };
        })
        .sort((a, b) => a.distance - b.distance);

    const results: ColorWithHue[] = [];
    for (const item of sortedByDistance) {
        if (results.length >= count) break;
        results.push(item.color);
    }

    return results;
}

export interface ColorCombinationSet {
    type: "analogous" | "complementary";
    colors: string[];
}

/**
 * Generate color combination sets for a given base color.
 * Returns sets for gradient generation:
 * - 2 analogous sets of 2 (one in each direction on color wheel)
 * - 2 analogous sets of 3 (one in each direction on color wheel)
 * - 2 complementary sets of 2 (base + complement variations)
 * - 2 complementary sets of 3 (base + analogous + complement variations)
 */
export function generateColorCombinations(baseColorName: string): ColorCombinationSet[] {
    const baseData = getColorData(baseColorName);
    if (!baseData || baseData.saturation < 0.1) {
        return [];
    }

    const baseName = baseData.name;
    const baseHue = baseData.hue;
    const results: ColorCombinationSet[] = [];

    // Analogous Set of 2: clockwise neighbor
    const clockwise1 = findColorsByHueDirection(baseHue, 1, new Set([baseName]), 1);
    if (clockwise1.length > 0 && clockwise1[0]) {
        results.push({
            type: "analogous",
            colors: [baseName, clockwise1[0].name],
        });
    }

    // Analogous Set of 2: counter-clockwise neighbor
    const counterClockwise1 = findColorsByHueDirection(baseHue, -1, new Set([baseName]), 1);
    if (counterClockwise1.length > 0 && counterClockwise1[0]) {
        results.push({
            type: "analogous",
            colors: [baseName, counterClockwise1[0].name],
        });
    }

    // Analogous Set of 3: clockwise (base + 2 neighbors)
    const clockwise2 = findColorsByHueDirection(baseHue, 1, new Set([baseName]), 2);
    if (clockwise2.length >= 2 && clockwise2[0] && clockwise2[1]) {
        results.push({
            type: "analogous",
            colors: [baseName, clockwise2[0].name, clockwise2[1].name],
        });
    }

    // Analogous Set of 3: counter-clockwise (base + 2 neighbors)
    const counterClockwise2 = findColorsByHueDirection(baseHue, -1, new Set([baseName]), 2);
    if (counterClockwise2.length >= 2 && counterClockwise2[0] && counterClockwise2[1]) {
        results.push({
            type: "analogous",
            colors: [baseName, counterClockwise2[0].name, counterClockwise2[1].name],
        });
    }

    // Complementary Sets of 2
    const complements = findComplementaryColors(baseHue, new Set([baseName]), 2);
    if (complements.length >= 1 && complements[0]) {
        results.push({
            type: "complementary",
            colors: [baseName, complements[0].name],
        });
    }
    if (complements.length >= 2 && complements[1]) {
        results.push({
            type: "complementary",
            colors: [baseName, complements[1].name],
        });
    }

    // Complementary Set of 3: base + clockwise neighbor + complement
    if (clockwise1.length > 0 && complements.length >= 1 && clockwise1[0] && complements[0]) {
        results.push({
            type: "complementary",
            colors: [baseName, clockwise1[0].name, complements[0].name],
        });
    }

    // Complementary Set of 3: base + counter-clockwise neighbor + second complement
    if (counterClockwise1.length > 0 && complements.length >= 2 && counterClockwise1[0] && complements[1]) {
        results.push({
            type: "complementary",
            colors: [baseName, counterClockwise1[0].name, complements[1].name],
        });
    }

    return results;
}

/**
 * Process a list of tags and expand any basic color names into color combination sets.
 * Non-color tags are passed through unchanged.
 * Returns both the original tags and the generated combination tags.
 */
export function expandColorTags(tags: string[]): {
    originalTags: string[];
    colorCombinations: Array<{ baseColor: string; combinations: ColorCombinationSet[] }>;
} {
    const originalTags: string[] = [];
    const colorCombinations: Array<{ baseColor: string; combinations: ColorCombinationSet[] }> = [];

    for (const tag of tags) {
        originalTags.push(tag);

        if (isBasicColor(tag)) {
            const combinations = generateColorCombinations(tag);
            if (combinations.length > 0) {
                colorCombinations.push({
                    baseColor: tag.toLowerCase(),
                    combinations,
                });
            }
        }
    }

    return { originalTags, colorCombinations };
}

/**
 * Convert a color combination set to a tag string for use in queries.
 * Example: ["gold", "yellow"] => "gold yellow"
 */
export function combinationToTag(combination: ColorCombinationSet): string {
    return combination.colors.join(" ");
}

/**
 * Get all expanded tags from a list, including both original and color combinations.
 */
export function getAllExpandedTags(tags: string[]): string[] {
    const result: string[] = [];
    const { originalTags, colorCombinations } = expandColorTags(tags);

    result.push(...originalTags);

    for (const { combinations } of colorCombinations) {
        for (const combo of combinations) {
            result.push(combinationToTag(combo));
        }
    }

    return result;
}
