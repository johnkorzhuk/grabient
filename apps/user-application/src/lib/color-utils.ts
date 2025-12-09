const BASIC_COLORS: Array<{ name: string; r: number; g: number; b: number }> = [
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

    // Check if each pair of characters are the same (e.g., ff, 00, aa)
    if (
        clean[0] === clean[1] &&
        clean[2] === clean[3] &&
        clean[4] === clean[5]
    ) {
        return `#${clean[0]}${clean[2]}${clean[4]}`;
    }
    return hex;
}
