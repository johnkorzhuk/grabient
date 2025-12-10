import { getColorsWithHex, getColorsWithHue, type ColorWithHue } from "./color-utils";

// Expanded list of mood/style tags
const STYLE_TAGS = [
    "analogous",
    "medium",
    "vibrant",
    "calm",
    "modern",
    "serene",
    "minimalist",
    "monochromatic",
    "polychromatic",
    "summer",
    "spring",
    "vintage",
    "ocean",
    "cool-warm",
    "cool",
    "water",
    "playful",
    "autumn",
    "stone",
    "sunset",
    "energetic",
    "scandinavian",
    "earthy",
    "beach",
    "retro",
    "nature",
    "optimistic",
    "wood",
    "dreamy",
    "mysterious",
    "warm",
    "muted",
    "night sky",
    "light",
    "organic",
    "candy",
    "sky",
    "technology",
    "forest",
    "velvet",
    "natural",
    "rustic",
    "winter",
    "neon",
    "romantic",
    "earth",
    "leather",
    "bohemian",
    "ceramic",
    "nostalgic",
    "tropical",
    "sophisticated",
    "moss",
    "high",
    "flowers",
    "fresh",
    "tranquil",
    "garden",
    "contemplative",
    "refreshing",
    "tech",
    "glass",
    "soothing",
    "botanical",
    "foliage",
    "futuristic",
    "digital art",
    "low",
    "sea",
    "introspective",
    "industrial",
    "ice cream",
];

// Get colors from shared color-utils (excludes black/white for tag suggestions)
const COLORS = getColorsWithHex().filter(
    (c) => c.name !== "black" && c.name !== "white",
);

// Get colors sorted by hue for generating complementary pairs and triads
const COLORS_BY_HUE = getColorsWithHue();

/**
 * Find the color closest to a target hue from the sorted color list
 */
function findColorAtHue(
    colors: ColorWithHue[],
    targetHue: number,
    excludeNames: Set<string>,
): ColorWithHue | null {
    // Normalize target hue to 0-360
    const normalizedTarget = ((targetHue % 360) + 360) % 360;

    let closest: ColorWithHue | null = null;
    let minDistance = Infinity;

    for (const color of colors) {
        if (excludeNames.has(color.name)) continue;

        // Calculate shortest distance around the color wheel
        const diff = Math.abs(color.hue - normalizedTarget);
        const distance = Math.min(diff, 360 - diff);

        if (distance < minDistance) {
            minDistance = distance;
            closest = color;
        }
    }

    return closest;
}

/**
 * Generate complementary color pairs (180° apart on the color wheel)
 */
function generateComplementaryPairs(
    colors: ColorWithHue[],
    count: number,
    random: () => number,
): Array<[ColorWithHue, ColorWithHue]> {
    const pairs: Array<[ColorWithHue, ColorWithHue]> = [];
    const usedColors = new Set<string>();

    // Shuffle colors to get variety
    const shuffled = shuffle(colors, random);

    for (const baseColor of shuffled) {
        if (pairs.length >= count) break;
        if (usedColors.has(baseColor.name)) continue;

        // Find complement (180° away)
        const complementHue = (baseColor.hue + 180) % 360;
        const complement = findColorAtHue(colors, complementHue, usedColors);

        if (complement && complement.name !== baseColor.name) {
            pairs.push([baseColor, complement]);
            usedColors.add(baseColor.name);
            usedColors.add(complement.name);
        }
    }

    return pairs;
}

/**
 * Generate triadic color combinations (120° apart on the color wheel)
 */
function generateTriads(
    colors: ColorWithHue[],
    count: number,
    random: () => number,
): Array<[ColorWithHue, ColorWithHue, ColorWithHue]> {
    const triads: Array<[ColorWithHue, ColorWithHue, ColorWithHue]> = [];
    const usedColors = new Set<string>();

    // Shuffle colors to get variety
    const shuffled = shuffle(colors, random);

    for (const baseColor of shuffled) {
        if (triads.length >= count) break;
        if (usedColors.has(baseColor.name)) continue;

        // Find colors at 120° and 240° from base
        const secondHue = (baseColor.hue + 120) % 360;
        const thirdHue = (baseColor.hue + 240) % 360;

        const excludeForSecond = new Set([...usedColors, baseColor.name]);
        const second = findColorAtHue(colors, secondHue, excludeForSecond);

        if (!second) continue;

        const excludeForThird = new Set([...excludeForSecond, second.name]);
        const third = findColorAtHue(colors, thirdHue, excludeForThird);

        if (third) {
            triads.push([baseColor, second, third]);
            usedColors.add(baseColor.name);
            usedColors.add(second.name);
            usedColors.add(third.name);
        }
    }

    return triads;
}

export type DailyTag =
    | { type: "text"; value: string }
    | { type: "color"; name: string; hex: string }
    | { type: "hex"; hex: string }
    | { type: "pair"; colors: Array<{ name: string; hex: string }> }
    | { type: "triad"; colors: Array<{ name: string; hex: string }> };

// Seeded random number generator for deterministic shuffling
function seededRandom(seed: number): () => number {
    return () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
    };
}

function shuffle<T>(array: T[], random: () => number): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [result[i], result[j]] = [result[j]!, result[i]!];
    }
    return result;
}

export function generateDailyTags(daysSinceEpoch: number, count = 24): DailyTag[] {
    const random = seededRandom(daysSinceEpoch);
    const tags: DailyTag[] = [];

    // Mix ratio: ~75% style tags, ~12% single colors, ~8% pairs, ~5% triads
    const styleCount = Math.floor(count * 0.75);
    const colorCount = Math.floor(count * 0.12);
    const pairCount = Math.floor(count * 0.08);
    const triadCount = count - styleCount - colorCount - pairCount;

    // Shuffle style tags
    const shuffledStyles = shuffle(STYLE_TAGS, random);
    const shuffledColors = shuffle(COLORS, random);

    // Generate complementary pairs and triads algorithmically based on hue
    const generatedPairs = generateComplementaryPairs(COLORS_BY_HUE, pairCount, random);
    const generatedTriads = generateTriads(COLORS_BY_HUE, triadCount, random);

    // Add style tags
    for (let i = 0; i < styleCount && i < shuffledStyles.length; i++) {
        tags.push({ type: "text", value: shuffledStyles[i]! });
    }

    // Add single colors (mix of name+swatch and random hex+swatch)
    for (let i = 0; i < colorCount && i < shuffledColors.length; i++) {
        const color = shuffledColors[i]!;
        // 70% show color name, 30% show random hex
        if (random() < 0.7) {
            tags.push({ type: "color", name: color.name, hex: color.hex });
        } else {
            // Generate a random hex color
            const randomHex = `#${Math.floor(random() * 0xffffff).toString(16).padStart(6, "0")}`;
            tags.push({ type: "hex", hex: randomHex });
        }
    }

    // Add generated complementary pairs
    for (const [first, second] of generatedPairs) {
        tags.push({
            type: "pair",
            colors: [
                { name: first.name, hex: first.hex },
                { name: second.name, hex: second.hex },
            ],
        });
    }

    // Add generated triads
    for (const [first, second, third] of generatedTriads) {
        tags.push({
            type: "triad",
            colors: [
                { name: first.name, hex: first.hex },
                { name: second.name, hex: second.hex },
                { name: third.name, hex: third.hex },
            ],
        });
    }

    // Shuffle the final result to mix everything together
    return shuffle(tags, random);
}

export function getDaysSinceEpoch(): number {
    return Math.floor(Date.now() / (1000 * 60 * 60 * 24));
}

export function getTagSearchQuery(tag: DailyTag): string {
    switch (tag.type) {
        case "text":
            return tag.value;
        case "color":
            return tag.name;
        case "hex":
            return tag.hex;
        case "pair":
            return tag.colors.map((c) => c.name).join(" ");
        case "triad":
            return tag.colors.map((c) => c.name).join(" ");
    }
}
