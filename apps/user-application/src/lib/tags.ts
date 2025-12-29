import {
    getColorsWithHex,
    getColorsWithHue,
    type ColorWithHue,
} from "@repo/data-ops/color-utils";

// Emoji tags mapped to high-frequency palette tags
const EMOJI_TAGS = [
    "🌊", // ocean, water, sea
    "🌅", // sunset, sunrise
    "🍂", // autumn, leaves, fall
    "🌲", // forest, nature, woodland
    "🌸", // flowers, floral, cherry blossom
    "☀️", // summer, sunshine, light
    "🌙", // night sky, moonlight, twilight
    "❄️", // winter, ice, glacier
    "🌴", // tropical, beach
    "🍬", // candy, sweet, ice cream
    "🌿", // botanical, organic, garden
    "💎", // jewel tone, crystal, gemstone
    "🔥", // fire, neon, energetic
    "🌈", // rainbow, vibrant, playful
    "🍃", // spring, fresh, natural
    "🌹", // romantic, rose, feminine
    "🌌", // galaxy, cosmic, space
    "🍊", // citrus, warm, energetic
    "☁️", // sky, clouds, dreamy
    "🌻", // garden, sunshine, cheerful
    "🍇", // wine, grapes, rich
    "✨", // ethereal, magic, glamour
];

// Expanded list of mood/style tags
const STYLE_TAGS = [
    // === SEASONS & TIME ===
    "spring",
    "summer",
    "autumn",
    "winter",
    "sunrise",
    "sunset",
    "twilight",
    "dusk",
    "dawn",
    "midnight",
    "nighttime",
    "morning",
    "evening",
    "moonlit",
    "sunlit",

    // === NATURE - LANDSCAPES ===
    "forest",
    "woodland",
    "meadow",
    "prairie",
    "garden",
    "jungle",
    "rainforest",
    "desert",
    "canyon",
    "mountain",
    "hillside",
    "valley",
    "tundra",
    "savanna",
    "oasis",

    // === NATURE - WATER ===
    "ocean",
    "sea",
    "beach",
    "coastal",
    "tropical",
    "lagoon",
    "reef",
    "tide",
    "wave",
    "river",
    "creek",
    "waterfall",
    "pond",
    "lake",
    "marsh",
    "fjord",
    "glacier",
    "arctic",

    // === NATURE - SKY & WEATHER ===
    "sky",
    "cloud",
    "fog",
    "mist",
    "rain",
    "storm",
    "snow",
    "frost",
    "ice",
    "aurora",
    "nebula",
    "galaxy",
    "cosmos",
    "stars",
    "moon",
    "sun",
    "rainbow",

    // === NATURE - FLORA ===
    "botanical",
    "floral",
    "wildflower",
    "sunflower",
    "tulip",
    "peony",
    "daisy",
    "lily",
    "iris",
    "rose",
    "blossom",
    "bloom",
    "foliage",
    "fern",
    "moss",
    "lichen",
    "ivy",
    "vine",
    "bamboo",
    "palm",
    "succulent",
    "cactus",
    "mushroom",
    "algae",
    "seaweed",
    "kelp",

    // === NATURE - TREES & WOOD ===
    "pine",
    "cedar",
    "oak",
    "maple",
    "walnut",
    "mahogany",
    "spruce",
    "eucalyptus",
    "evergreen",
    "driftwood",
    "bark",
    "timber",

    // === NATURE - EARTH ===
    "earth",
    "soil",
    "mud",
    "clay",
    "sand",
    "dune",
    "pebble",
    "rock",
    "stone",
    "boulder",
    "gravel",
    "sandstone",
    "limestone",
    "granite",
    "basalt",
    "obsidian",
    "slate",
    "cobblestone",

    // === NATURE - ELEMENTS ===
    "fire",
    "flame",
    "ember",
    "bonfire",
    "campfire",
    "lava",
    "volcano",
    "smoke",
    "ash",
    "cinder",
    "soot",

    // === MATERIALS - METALS ===
    "metal",
    "steel",
    "iron",
    "copper",
    "brass",
    "bronze",
    "gold",
    "rust",
    "pewter",
    "silver",

    // === MATERIALS - STONE & MINERAL ===
    "marble",
    "concrete",
    "cement",
    "brick",
    "terracotta",
    "ceramic",
    "porcelain",
    "pottery",
    "earthenware",
    "crystal",
    "quartz",
    "mineral",

    // === MATERIALS - GEMS ===
    "gemstone",
    "jewel",
    "ruby",
    "emerald",
    "sapphire",
    "amethyst",
    "jade",
    "opal",
    "pearl",
    "garnet",
    "cobalt",
    "lapis",
    "aquamarine",

    // === MATERIALS - FABRIC ===
    "velvet",
    "silk",
    "satin",
    "linen",
    "cotton",
    "wool",
    "denim",
    "leather",
    "suede",
    "lace",
    "tulle",
    "burlap",
    "canvas",
    "tweed",
    "tartan",
    "plaid",

    // === MATERIALS - OTHER ===
    "glass",
    "paper",
    "parchment",
    "cork",
    "wicker",
    "bamboo",
    "hemp",

    // === FOOD & DRINK ===
    "coffee",
    "espresso",
    "mocha",
    "latte",
    "tea",
    "cocoa",
    "cacao",
    "chocolate",
    "caramel",
    "honey",
    "butter",
    "cream",
    "vanilla",
    "cinnamon",
    "ginger",
    "saffron",
    "paprika",
    "mustard",
    "spice",
    "herb",
    "basil",
    "sage",
    "mint",
    "wine",
    "burgundy",
    "champagne",
    "whiskey",
    "citrus",
    "lemon",
    "tangerine",
    "mango",
    "papaya",
    "pineapple",
    "coconut",
    "avocado",
    "pistachio",
    "olive",
    "berry",
    "cherry",
    "grape",
    "pomegranate",
    "apricot",
    "peach",
    "cantaloupe",
    "watermelon",
    "candy",
    "bubblegum",
    "marshmallow",
    "macaron",
    "pastry",
    "gingerbread",
    "cupcake",

    // === DESIGN STYLES ===
    "minimalist",
    "modern",
    "contemporary",
    "scandinavian",
    "nordic",
    "midcentury",
    "industrial",
    "rustic",
    "farmhouse",
    "cottage",
    "bohemian",
    "eclectic",
    "vintage",
    "retro",
    "antique",
    "victorian",
    "baroque",
    "rococo",
    "art deco",
    "art nouveau",
    "gothic",
    "medieval",
    "brutalist",
    "southwestern",
    "mediterranean",
    "moroccan",
    "japanese",
    "wabi-sabi",

    // === TECH & FUTURE ===
    "futuristic",
    "cyberpunk",
    "synthwave",
    "vaporwave",
    "neon",
    "digital",
    "cyber",
    "hologram",
    "laser",
    "circuit",
    "tech",
    "glitch",
    "arcade",
    "gaming",
    "led",

    // === MOODS - CALM ===
    "serene",
    "tranquil",
    "peaceful",
    "calm",
    "soothing",
    "zen",
    "meditative",
    "gentle",
    "soft",
    "mellow",
    "quiet",
    "subtle",
    "muted",
    "understated",

    // === MOODS - WARM ===
    "cozy",
    "warm",
    "inviting",
    "intimate",
    "comforting",
    "nurturing",
    "romantic",
    "sensual",
    "passionate",

    // === MOODS - BRIGHT ===
    "vibrant",
    "bold",
    "energetic",
    "lively",
    "playful",
    "cheerful",
    "joyful",
    "festive",
    "whimsical",
    "fun",
    "youthful",
    "fresh",
    "invigorating",
    "dynamic",

    // === MOODS - DARK ===
    "moody",
    "dramatic",
    "mysterious",
    "dark",
    "gothic",
    "noir",
    "somber",
    "melancholic",
    "brooding",
    "ominous",
    "eerie",
    "gloomy",

    // === MOODS - ELEGANT ===
    "elegant",
    "sophisticated",
    "luxurious",
    "opulent",
    "regal",
    "royal",
    "refined",
    "chic",
    "glamorous",
    "couture",

    // === MOODS - NATURE ===
    "organic",
    "natural",
    "earthy",
    "grounded",
    "rustic",
    "raw",
    "rugged",
    "weathered",
    "aged",

    // === MOODS - DREAMY ===
    "dreamy",
    "ethereal",
    "mystical",
    "magical",
    "fantastical",
    "whimsical",
    "fairy",
    "enchanted",
    "surreal",

    // === AESTHETICS ===
    "pastel",
    "neutral",
    "monochrome",
    "achromatic",
    "polychromatic",
    "gradient",
    "iridescent",
    "opalescent",
    "metallic",
    "matte",
    "glossy",
    "watercolor",
    "sepia",

    // === OCCASIONS & THEMES ===
    "wedding",
    "bridal",
    "valentine",
    "easter",
    "halloween",
    "thanksgiving",
    "christmas",
    "carnival",
    "festival",
    "party",
    "birthday",

    // === SPACES & PLACES ===
    "urban",
    "cityscape",
    "skyline",
    "industrial",
    "warehouse",
    "loft",
    "cabin",
    "cottage",
    "greenhouse",
    "library",
    "cafe",
    "bakery",
    "spa",
    "boutique",
    "gallery",

    // === ACTIVITIES ===
    "camping",
    "hiking",
    "sailing",
    "surfing",
    "gardening",
    "travel",
    "adventure",
    "wellness",

    // === PROFESSIONAL ===
    "corporate",
    "professional",
    "business",
    "minimal",
    "clean",
    "trustworthy",
    "innovative",

    // === CULTURAL ===
    "tribal",
    "folk",
    "artisan",
    "handcrafted",
    "boho",
    "hippie",
    "punk",
    "grunge",
    "indie",

    // === MISC EVOCATIVE ===
    "cottagecore",
    "dark academia",
    "kawaii",
    "steampunk",
    "nautical",
    "safari",
    "tropical",
    "coastal",
    "desert",
    "alpine",
    "underwater",
    "bioluminescent",
    "aurora borealis",
    "northern lights",
    "chlorophyll",
    "terrarium",
    "apothecary",
    "alchemy",
    "celestial",
];

// Get colors from shared color-utils (excludes black/white for tag suggestions)
const COLORS = getColorsWithHex().filter(
    (c) => c.name !== "black" && c.name !== "white",
);

// Get colors sorted by hue for generating complementary pairs and analogous sets
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
 * Generate color harmony sets - randomly choosing between analogous and complementary
 * Matches the color-expansion logic from grabient-ops
 */
function generateColorHarmonySets(
    colors: ColorWithHue[],
    count: number,
    random: () => number,
): Array<[ColorWithHue, ColorWithHue, ColorWithHue]> {
    const sets: Array<[ColorWithHue, ColorWithHue, ColorWithHue]> = [];
    const usedColors = new Set<string>();

    // Shuffle colors to get variety
    const shuffled = shuffle(colors, random);

    for (const baseColor of shuffled) {
        if (sets.length >= count) break;
        if (usedColors.has(baseColor.name)) continue;

        // Randomly choose between analogous (30°/60°) or complementary (180°)
        const useAnalogous = random() < 0.5;

        let secondHue: number;
        let thirdHue: number;

        if (useAnalogous) {
            // Analogous: +30° and +60° from base (neighboring hues)
            secondHue = (baseColor.hue + 30) % 360;
            thirdHue = (baseColor.hue + 60) % 360;
        } else {
            // Complementary: 180° opposite + split complement (~150° and ~210°)
            secondHue = (baseColor.hue + 180) % 360;
            thirdHue = (baseColor.hue + 150) % 360;
        }

        const excludeForSecond = new Set([...usedColors, baseColor.name]);
        const second = findColorAtHue(colors, secondHue, excludeForSecond);

        if (!second) continue;

        const excludeForThird = new Set([...excludeForSecond, second.name]);
        const third = findColorAtHue(colors, thirdHue, excludeForThird);

        if (third) {
            sets.push([baseColor, second, third]);
            usedColors.add(baseColor.name);
            usedColors.add(second.name);
            usedColors.add(third.name);
        }
    }

    return sets;
}

export type DailyTag =
    | { type: "text"; value: string }
    | { type: "emoji"; value: string }
    | { type: "color"; name: string; hex: string }
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

export function generateDailyTags(
    daysSinceEpoch: number,
    count = 24,
): DailyTag[] {
    const random = seededRandom(daysSinceEpoch);
    const tags: DailyTag[] = [];

    // Fixed emoji count: 2-3 emojis
    const emojiCount = 2 + Math.floor(random() * 2); // 2 or 3
    // Mix ratio for remaining: ~75% style tags, ~12% single colors, ~8% pairs, ~5% harmony sets
    const remaining = count - emojiCount;
    const styleCount = Math.floor(remaining * 0.75);
    const colorCount = Math.floor(remaining * 0.12);
    const pairCount = Math.floor(remaining * 0.08);
    const harmonySetCount = remaining - styleCount - colorCount - pairCount;

    // Shuffle all tag sources
    const shuffledEmojis = shuffle(EMOJI_TAGS, random);
    const shuffledStyles = shuffle(STYLE_TAGS, random);
    const shuffledColors = shuffle(COLORS, random);

    // Generate complementary pairs and harmony sets algorithmically based on hue
    const generatedPairs = generateComplementaryPairs(
        COLORS_BY_HUE,
        pairCount,
        random,
    );
    const generatedHarmonySets = generateColorHarmonySets(
        COLORS_BY_HUE,
        harmonySetCount,
        random,
    );

    // Add emoji tags
    for (let i = 0; i < emojiCount && i < shuffledEmojis.length; i++) {
        tags.push({ type: "emoji", value: shuffledEmojis[i]! });
    }

    // Add style tags
    for (let i = 0; i < styleCount && i < shuffledStyles.length; i++) {
        tags.push({ type: "text", value: shuffledStyles[i]! });
    }

    // Add single colors
    for (let i = 0; i < colorCount && i < shuffledColors.length; i++) {
        const color = shuffledColors[i]!;
        tags.push({ type: "color", name: color.name, hex: color.hex });
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

    // Add generated harmony sets (analogous or complementary)
    for (const [first, second, third] of generatedHarmonySets) {
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
        case "emoji":
            return tag.value;
        case "color":
            return tag.name;
        case "pair":
            return tag.colors.map((c) => c.name).join(" ");
        case "triad":
            return tag.colors.map((c) => c.name).join(" ");
    }
}

/**
 * Get a simple text placeholder from the daily tags (first text-type tag found)
 */
export function getPlaceholderFromTags(tags: DailyTag[]): string {
    const textTag = tags.find((tag) => tag.type === "text");
    return textTag ? textTag.value : "nature";
}

// Lazy-initialized set of all predefined tags for quick lookup
let predefinedTagsSet: Set<string> | null = null;

function getPredefinedTagsSet(): Set<string> {
    if (predefinedTagsSet) return predefinedTagsSet;

    predefinedTagsSet = new Set<string>();

    // Add style tags (lowercase)
    for (const tag of STYLE_TAGS) {
        predefinedTagsSet.add(tag.toLowerCase());
    }

    // Add emoji tags
    for (const emoji of EMOJI_TAGS) {
        predefinedTagsSet.add(emoji);
    }

    // Add color names (lowercase)
    for (const color of COLORS) {
        predefinedTagsSet.add(color.name.toLowerCase());
    }

    return predefinedTagsSet;
}

/**
 * Check if a query is a predefined tag (style, emoji, or color name)
 * Returns true if the query matches any predefined tag
 */
export function isPredefinedQuery(query: string): boolean {
    const normalized = query.toLowerCase().trim();
    if (!normalized) return false;

    const tags = getPredefinedTagsSet();

    // Direct match
    if (tags.has(normalized)) return true;

    // Check if query is a combination of color names (e.g., "red blue green")
    const words = normalized.split(/\s+/);
    if (words.length > 1 && words.every(word => tags.has(word))) {
        return true;
    }

    return false;
}
