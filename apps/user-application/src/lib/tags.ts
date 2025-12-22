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
    "polychromatic",
    "autumn",
    "stone",
    "earthy",
    "wood",
    "leather",
    "minimalist",
    "serene",
    "rustic",
    "summer",
    "organic",
    "natural",
    "vintage",
    "industrial",
    "calm",
    "forest",
    "winter",
    "bohemian",
    "terracotta",
    "playful",
    "spring",
    "leaf",
    "soothing",
    "garden",
    "ocean",
    "moss",
    "water",
    "mysterious",
    "beach",
    "modern",
    "soil",
    "energetic",
    "dramatic",
    "botanical",
    "foliage",
    "calming",
    "clay",
    "scandinavian",
    "sunset",
    "cozy",
    "fresh",
    "velvet",
    "sand",
    "metal",
    "nature",
    "sophisticated",
    "earth",
    "gothic",
    "retro",
    "desert",
    "flower",
    "intense",
    "woodland",
    "romantic",
    "whimsical",
    "luxurious",
    "tropical",
    "sky",
    "dreamy",
    "candy",
    "brick",
    "jewelry",
    "copper",
    "grounded",
    "neon",
    "soft",
    "elegant",
    "nostalgic",
    "pastel",
    "technology",
    "bark",
    "sunrise",
    "rust",
    "cyberpunk",
    "cloud",
    "pumpkin",
    "night",
    "luxury",
    "tree",
    "somber",
    "futuristic",
    "moody",
    "digital",
    "wine",
    "fog",
    "concrete",
    "rich",
    "rock",
    "fabric",
    "optimistic",
    "coastal",
    "refreshing",
    "fruit",
    "bold",
    "steel",
    "vibrant",
    "plant",
    "baroque",
    "carnival",
    "grass",
    "nordic",
    "youthful",
    "coffee",
    "farmhouse",
    "cheerful",
    "folk",
    "spice",
    "floral",
    "seafoam",
    "mist",
    "sea",
    "jade",
    "watercolor",
    "glacier",
    "inviting",
    "silk",
    "sensual",
    "leaves",
    "river",
    "gentle",
    "outdoor",
    "tech",
    "festival",
    "introspective",
    "victorian",
    "cabin",
    "feminine",
    "warm",
    "cinnamon",
    "growth",
    "fireplace",
    "harvest",
    "mellow",
    "meadow",
    "midcentury",
    "intimate",
    "cityscape",
    "space",
    "fashion",
    "hopeful",
    "kawaii",
    "candlelight",
    "clash",
    "textile",
    "linen",
    "neutral",
    "amber",
    "mountain",
    "passionate",
    "herb",
    "glass",
    "relaxed",
    "ice",
    "spa",
    "campfire",
    "galaxy",
    "melancholic",
    "wedding",
    "fire",
    "airy",
    "boho",
    "toy",
    "lace",
    "subdued",
    "ceramic",
    "twilight",
    "smoke",
    "adventurous",
    "halloween",
    "marble",
    "tranquil",
    "pine",
    "denim",
    "cotton",
    "serious",
    "oak",
    "southwestern",
    "subtle",
    "traditional",
    "citrus",
    "dynamic",
    "berry",
    "urban",
    "porcelain",
    "professional",
    "antique",
    "ember",
    "barn",
    "botany",
    "valentines",
    "midnight",
    "tobacco",
    "easter",
    "sunflower",
    "canyon",
    "furniture",
    "cocoa",
    "honey",
    "cactus",
    "eclectic",
    "flowers",
    "lively",
    "amethyst",
    "deep",
    "candle",
    "greenhouse",
    "pottery",
    "architecture",
    "sunny",
    "seashell",
    "comforting",
    "melancholy",
    "contemplative",
    "waterfall",
    "contemporary",
    "countryside",
    "creative",
    "gaming",
    "psychedelic",
    "butterfly",
    "lichen",
    "nightclub",
    "pearl",
    "ash",
    "peaceful",
    "futurism",
    "perfume",
    "wellness",
    "regal",
    "pebble",
    "rain",
    "sage",
    "invigorating",
    "royalty",
    "lagoon",
    "emerald",
    "corporate",
    "earthenware",
    "city",
    "tea",
    "burlap",
    "saffron",
    "ominous",
    "graffiti",
    "trail",
    "bamboo",
    "caramel",
    "sandstone",
    "paper",
    "cottage",
    "adobe",
    "autumnal",
    "pastry",
    "ecology",
    "fantasy",
    "landscape",
    "jungle",
    "country",
    "rainbow",
    "seaweed",
    "sapphire",
    "plants",
    "ecological",
    "parchment",
    "mahogany",
    "wheat",
    "synthwave",
    "cosmetics",
    "rainforest",
    "uplifting",
    "reef",
    "ink",
    "field",
    "balanced",
    "firework",
    "greenery",
    "driftwood",
    "fiery",
    "mud",
    "aquarium",
    "party",
    "lipstick",
    "hay",
    "nightlife",
    "noir",
    "gemstone",
    "stable",
    "nebula",
    "outdoorsy",
    "relaxing",
    "park",
    "wool",
    "gardening",
    "flame",
    "clouds",
    "dusk",
    "electronics",
    "outdoors",
    "mature",
    "riverbank",
    "ethereal",
    "fireworks",
    "aurora",
    "cosmetic",
    "storm",
    "refined",
    "iceberg",
    "delicate",
    "vine",
    "hiking",
    "pond",
    "lawn",
    "arcade",
    "illustration",
    "thanksgiving",
    "sunshine",
    "cobblestone",
    "obsidian",
    "evening",
    "lake",
    "asphalt",
    "software",
    "interface",
    "seaside",
    "western",
    "island",
    "exciting",
    "confident",
    "moon",
    "tangerine",
    "brass",
    "sustainable",
    "interior",
    "minimal",
    "cave",
    "makeup",
    "marigold",
    "lemon",
    "pop",
    "mineral",
    "terrain",
    "dirt",
    "crystal",
    "wave",
    "nursery",
    "sprout",
    "twig",
    "blood",
    "laser",
    "flora",
    "powerful",
    "moonlight",
    "suede",
    "pool",
    "nighttime",
    "steampunk",
    "library",
    "cathedral",
    "machinery",
    "hologram",
    "serenity",
    "opera",
    "rave",
    "surf",
    "acorn",
    "marine",
    "circuit",
    "macaron",
    "naturalistic",
    "southwest",
    "surfing",
    "achromatic",
    "mushroom",
    "ivy",
    "snow",
    "jewel",
    "goth",
    "lava",
    "industry",
    "shell",
    "tapestry",
    "biophilic",
    "shadow",
    "underwater",
    "energizing",
    "grunge",
    "tide",
    "frost",
    "electric",
    "handmade",
    "dune",
    "rugged",
    "peat",
    "moonlit",
    "vaporwave",
    "understated",
    "trustworthy",
    "satin",
    "bubblegum",
    "nautical",
    "balance",
    "ruby",
    "indie",
    "theater",
    "sun",
    "gritty",
    "renewal",
    "zen",
    "playground",
    "electronic",
    "camouflage",
    "cosmos",
    "muted",
    "book",
    "mystical",
    "spices",
    "fun",
    "sustainability",
    "factory",
    "camping",
    "folkloric",
    "glitter",
    "mermaid",
    "mystic",
    "algae",
    "artisanal",
    "fairy",
    "textiles",
    "craft",
    "palm",
    "wildflower",
    "office",
    "mining",
    "vegetation",
    "vivid",
    "finance",
    "fur",
    "blossom",
    "timeless",
    "branch",
    "icecream",
    "sunlight",
    "saddle",
    "food",
    "aquatic",
    "kitsch",
    "travel",
    "iron",
    "fern",
    "valentine",
    "lighthouse",
    "mystery",
    "techno",
    "cosmic",
    "coast",
    "trees",
    "berries",
    "market",
    "herbs",
    "rejuvenating",
    "spruce",
    "childhood",
    "expressionism",
    "lemonade",
    "reflective",
    "reassuring",
    "skyscraper",
    "kitchen",
    "avocado",
    "edm",
    "fairytale",
    "beachy",
    "dark",
    "brutalist",
    "game",
    "christmas",
    "warmth",
    "comfort",
    "toys",
    "flat",
    "bronze",
    "glow",
    "royal",
    "modernist",
    "balloon",
    "mountains",
    "flamingo",
    "weathered",
    "couture",
    "edgy",
    "farm",
    "grounding",
    "blush",
    "canvas",
    "walnut",
    "hearth",
    "coconut",
    "classic",
    "depth",
    "branding",
    "opulent",
    "baby",
    "vacation",
    "cheery",
    "texture",
    "sweet",
    "castle",
    "grape",
    "minimalism",
    "sailboat",
    "medieval",
    "trust",
    "bakery",
    "punk",
    "orchard",
    "whimsy",
    "kaleidoscope",
    "surfboard",
    "cosplay",
    "engine",
    "electricity",
    "wildlife",
    "kelp",
    "cedar",
    "cafe",
    "mustard",
    "fall",
    "circuitry",
    "holi",
    "joyful",
    "mango",
    "vegetable",
    "root",
    "relaxation",
    "morning",
    "expressionist",
    "military",
    "hill",
    "cigar",
    "circus",
    "abstract",
    "tulip",
    "peony",
    "warmhearted",
    "basalt",
    "canopy",
    "seductive",
    "nurturing",
    "butter",
    "maple",
    "festive",
    "breeze",
    "pistachio",
    "darkness",
    "metallic",
    "granite",
    "crown",
    "seascape",
    "graphite",
    "pastries",
    "mediterranean",
    "storybook",
    "mocha",
    "alchemy",
    "vinyl",
    "ecosystem",
    "aggressive",
    "bonfire",
    "restrained",
    "data",
    "cake",
    "cream",
    "apricot",
    "calmness",
    "limestone",
    "cider",
    "flamboyant",
    "caribbean",
    "unicorn",
    "child",
    "artistic",
    "coastline",
    "espresso",
    "shrub",
    "sable",
    "woodgrain",
    "mythology",
    "soot",
    "business",
    "trusting",
    "ribbon",
    "snowflake",
    "elegance",
    "gravel",
    "streetwear",
    "decor",
    "folklore",
    "sepia",
    "rug",
    "woodlands",
    "popart",
    "handcrafted",
    "cement",
    "landscaping",
    "chic",
    "submarine",
    "glitch",
    "stones",
    "innovation",
    "cocktail",
    "focused",
    "safari",
    "formal",
    "romance",
    "skincare",
    "japan",
    "gardens",
    "dessert",
    "pomegranate",
    "goldenrod",
    "confetti",
    "evergreen",
    "optimism",
    "cyber",
    "volcano",
    "shells",
    "petal",
    "friendly",
    "baking",
    "geology",
    "exotic",
    "honeycomb",
    "jellyfish",
    "marina",
    "picnic",
    "radiant",
    "cottagecore",
    "grain",
    "funfair",
    "adventure",
    "artisan",
    "hike",
    "fiber",
    "dawn",
    "papaya",
    "dust",
    "bread",
    "museum",
    "incense",
    "stability",
    "tundra",
    "sleek",
    "primitive",
    "ultraviolet",
    "stars",
    "tulle",
    "ballet",
    "meditative",
    "agriculture",
    "chlorophyll",
    "burgundy",
    "horizon",
    "earthly",
    "nostalgia",
    "ranch",
    "champagne",
    "sienna",
    "boulder",
    "teacup",
    "pasture",
    "swimming",
    "surrealism",
    "bubble",
    "creek",
    "grapes",
    "fountain",
    "ship",
    "lush",
    "decay",
    "robotics",
    "technological",
    "lilac",
    "marshmallow",
    "cucumber",
    "beachball",
    "magic",
    "perfumery",
    "seedling",
    "vineyard",
    "ancient",
    "woodworking",
    "icicle",
    "koi",
    "hillside",
    "mysticism",
    "ceramics",
    "roots",
    "energized",
    "rocky",
    "corn",
    "garnet",
    "agrarian",
    "ecofriendly",
    "terrarium",
    "club",
    "peacock",
    "paradise",
    "exuberant",
    "clothing",
    "nightscape",
    "cobalt",
    "construction",
    "parade",
    "disco",
    "caviar",
    "oceanic",
    "robot",
    "glassware",
    "pineapple",
    "fjord",
    "engineering",
    "cacao",
    "carefree",
    "wicker",
    "romanticism",
    "cork",
    "vampire",
    "cinder",
    "moonlit night",
    "racing",
    "naturalism",
    "flamenco",
    "cooking",
    "blueprint",
    "energy",
    "dance",
    "pot",
    "fiesta",
    "traffic",
    "crayon",
    "wilderness",
    "cantaloupe",
    "advertising",
    "ecstatic",
    "bouquet",
    "eerie",
    "magical",
    "recycling",
    "pewter",
    "tranquility",
    "brooding",
    "future",
    "design",
    "videogame",
    "girly",
    "dew",
    "lily",
    "wallpaper",
    "apple",
    "undergrowth",
    "twine",
    "ruins",
    "raw",
    "alley",
    "art",
    "stormcloud",
    "timber",
    "passion",
    "clown",
    "iris",
    "gradient",
    "waves",
    "lapis",
    "biscuit",
    "sweater",
    "gingerbread",
    "crafts",
    "bloom",
    "kale",
    "rococo",
    "accessory",
    "hammock",
    "lollipop",
    "cupcake",
    "rocks",
    "underbrush",
    "meditation",
    "bookbinding",
    "minerals",
    "sport",
    "berlin",
    "innovative",
    "kite",
    "naval",
    "uniform",
    "daisy",
    "seafood",
    "macaroon",
    "california",
    "moroccan",
    "woven",
    "whiskey",
    "naturalist",
    "jewels",
    "grassland",
    "futurist",
    "eucalyptus",
    "starlight",
    "harmony",
    "cherry",
    "sophistication",
    "craftsman",
    "chestnut",
    "ochre",
    "ginger",
    "tiger",
    "aged",
    "scandinavia",
    "camp",
    "conservation",
    "sailing",
    "thoughtful",
    "feather",
    "roses",
    "fruits",
    "californian",
    "upbeat",
    "dreamscape",
    "sugar",
    "springtime",
    "seashells",
    "led",
    "farming",
    "earthquake",
    "simple",
    "heritage",
    "mossy",
    "excitement",
    "technical",
    "packaging",
    "network",
    "metropolis",
    "anime",
    "skyline",
    "cyberspace",
    "runway",
    "deepsea",
    "foreboding",
    "arctic",
    "illustrative",
    "floor",
    "oriental",
    "antiques",
    "savanna",
    "drama",
    "fossil",
    "shadows",
    "woods",
    "embers",
    "computer",
    "fungi",
    "cool",
    "environment",
    "photography",
    "hope",
    "folkart",
    "tribal",
    "freshwater",
    "artnouveau",
    "expressive",
    "mansion",
    "chili",
    "mine",
    "golden",
    "retrofuturism",
    "plaid",
    "light",
    "carrot",
    "boutique",
    "harmonious",
    "wildflowers",
    "sunsets",
    "chandelier",
    "herbal",
    "branches",
    "tile",
    "terrace",
    "mosaic",
    "dashboard",
    "sunflowers",
    "waterfront",
    "pier",
    "florals",
    "parrot",
    "stationery",
    "star",
    "oasis",
    "nocturnal",
    "minimalistic",
    "luxe",
    "marsh",
    "subway",
    "forge",
    "gloomy",
    "hemp",
    "aquamarine",
    "lounge",
    "reliable",
    "emotive",
    "oil",
    "spaceship",
    "quiet",
    "frog",
    "bridal",
    "latte",
    "quilt",
    "vase",
    "scandi",
    "succulent",
    "sandcastle",
    "embroidery",
    "doll",
    "glam",
    "warehouse",
    "boudoir",
    "sketch",
    "quartz",
    "rebellious",
    "meat",
    "machine",
    "freshness",
    "gown",
    "tartan",
    "navigation",
    "communication",
    "campsite",
    "beachwear",
    "paprika",
    "beeswax",
    "fishing",
    "village",
    "cinema",
    "sunlit",
    "rusted",
    "metalwork",
    "tweed",
    "squash",
    "loam",
    "nightfall",
    "railway",
    "wabi-sabi",
    "wineglass",
    "pesto",
    "basil",
    "prairie",
    "fence",
    "harbor",
    "japanese",
    "silicon",
    "forests",
    "kayak",
    "bee",
    "boat",
    "fierce",
    "oatmeal",
    "comic",
    "hotel",
    "tropics",
    "quirky",
    "foam",
    "verdant",
    "herbalism",
    "macarons",
    "fantastical",
    "ruin",
    "sawdust",
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
