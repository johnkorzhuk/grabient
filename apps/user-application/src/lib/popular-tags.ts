import { BASIC_COLORS, getColorsWithHue, type ColorWithHue } from "./color-utils";

const STYLE_TAGS = [
    "modern",
    "vibrant",
    "calm",
    "serene",
    "minimalist",
    "summer",
    "vintage",
    "ocean",
    "cool",
    "sunset",
    "energetic",
    "earthy",
    "retro",
    "nature",
    "warm",
    "muted",
    "light",
    "sky",
    "forest",
    "neon",
    "tropical",
    "fresh",
    "futuristic",
    "easter",
    "christmas",
    "city night",
    "autumn",
    "spring",
    "winter",
    "beach",
    "dreamy",
    "romantic",
    "elegant",
    "bold",
    "pastel",
    "dark",
    "bright",
    "soft",
    "dramatic",
    "playful",
    "sophisticated",
    "rustic",
    "industrial",
    "bohemian",
    "nordic",
    "mediterranean",
    "desert",
    "moonlight",
    "sunrise",
    "twilight",
    "garden",
    "coastal",
    "mountain",
    "urban",
    "abstract",
    "geometric",
    "organic",
    "metallic",
    "jewel tones",
    "candy",
    "ice cream",
    "cotton candy",
    "aurora",
    "galaxy",
    "rainbow",
    "monochrome",
    "duotone",
    "watercolor",
    "fire",
    "ice",
    "earth",
    "water",
    "air",
    "mystical",
    "zen",
    "cyberpunk",
    "vaporwave",
    "synthwave",
    "90s",
    "80s",
    "70s",
    "art deco",
    "pop art",
    "grunge",
];

const COLOR_NAMES = BASIC_COLORS
    .filter((c) => c.name !== "black" && c.name !== "white" && c.name !== "gray")
    .map((c) => c.name);

function seededRandom(seed: number): () => number {
    return () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
    };
}

function shuffleArray<T>(array: T[], random: () => number): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [result[i], result[j]] = [result[j]!, result[i]!];
    }
    return result;
}

function generateSeededHex(random: () => number): string {
    const r = Math.floor(random() * 256);
    const g = Math.floor(random() * 256);
    const b = Math.floor(random() * 256);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * Get a complementary color (opposite on the color wheel, ~180 degrees apart)
 */
function getComplementaryColor(color: ColorWithHue, colors: ColorWithHue[]): ColorWithHue {
    const targetHue = (color.hue + 180) % 360;
    let closest = colors[0]!;
    let minDiff = Infinity;

    for (const c of colors) {
        if (c.name === color.name) continue;
        const diff = Math.min(
            Math.abs(c.hue - targetHue),
            360 - Math.abs(c.hue - targetHue)
        );
        if (diff < minDiff) {
            minDiff = diff;
            closest = c;
        }
    }
    return closest;
}

/**
 * Get an analogous color (adjacent on the color wheel, ~30 degrees apart)
 */
function getAnalogousColor(color: ColorWithHue, colors: ColorWithHue[], random: () => number): ColorWithHue {
    // Target ~30 degrees in either direction
    const direction = random() < 0.5 ? 1 : -1;
    const targetHue = (color.hue + direction * 30 + 360) % 360;

    let closest = colors[0]!;
    let minDiff = Infinity;

    for (const c of colors) {
        if (c.name === color.name) continue;
        const diff = Math.min(
            Math.abs(c.hue - targetHue),
            360 - Math.abs(c.hue - targetHue)
        );
        if (diff < minDiff) {
            minDiff = diff;
            closest = c;
        }
    }
    return closest;
}

/**
 * Generate a color pair tag (e.g., "red and cyan" or "blue and purple")
 */
function generateColorPair(colors: ColorWithHue[], random: () => number): string {
    const shuffled = shuffleArray(colors, random);
    const baseColor = shuffled[0]!;

    // 50/50 chance of complementary vs analogous
    const useComplementary = random() < 0.5;
    const pairColor = useComplementary
        ? getComplementaryColor(baseColor, colors)
        : getAnalogousColor(baseColor, colors, random);

    return `${baseColor.name} and ${pairColor.name}`;
}

function generatePopularTags(count: number, seed: number): string[] {
    const random = seededRandom(seed);
    const colorsWithHue = getColorsWithHue();

    const shuffledStyles = shuffleArray(STYLE_TAGS, random);
    const shuffledColors = shuffleArray(colorsWithHue, random);

    // Generate 2-3 single colors
    const singleColorCount = random() < 0.5 ? 2 : 3;
    const singleColors: string[] = [];
    for (let i = 0; i < singleColorCount; i++) {
        // 50/50 chance of hex vs color name for single colors
        if (random() < 0.5) {
            singleColors.push(generateSeededHex(random));
        } else {
            singleColors.push(shuffledColors[i]!.name);
        }
    }

    // Generate 1-2 color pairs
    const pairCount = random() < 0.5 ? 1 : 2;
    const colorPairs: string[] = [];
    for (let i = 0; i < pairCount; i++) {
        colorPairs.push(generateColorPair(colorsWithHue, random));
    }

    // Combine all color tags
    const allColorTags = [...singleColors, ...colorPairs];
    const colorTagCount = allColorTags.length;

    // Fill the rest with style tags
    const styleTagCount = count - colorTagCount;
    const styleTags = shuffledStyles.slice(0, styleTagCount);

    // Combine and shuffle to distribute colors throughout
    const allTags = [...styleTags, ...allColorTags];
    return shuffleArray(allTags, random);
}

export function getRandomPopularTags(count: number): string[] {
    const seed = Math.floor(Math.random() * 1000000);
    return generatePopularTags(count, seed);
}
