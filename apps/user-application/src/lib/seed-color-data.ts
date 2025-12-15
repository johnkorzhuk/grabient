import { isValidSeed, deserializeCoeffs } from "@repo/data-ops/serialization";
import { cosineGradient, rgbToHex, applyGlobals } from "@repo/data-ops/gradient-gen";
import { hexToColorName } from "@repo/data-ops/color-utils";

const SEED_STEPS = 11;

export interface SeedColorData {
    hexCodes: string[];
    colorNames: string[];
}

export function getSeedColorData(seed: string): SeedColorData | null {
    if (!isValidSeed(seed)) return null;

    try {
        const { coeffs, globals } = deserializeCoeffs(seed);
        const appliedCoeffs = applyGlobals(coeffs, globals);
        const rgbColors = cosineGradient(SEED_STEPS, appliedCoeffs);

        const seenNames = new Set<string>();
        const hexCodes: string[] = [];
        const colorNames: string[] = [];

        for (const color of rgbColors) {
            const hex = rgbToHex(color[0], color[1], color[2]);
            const name = hexToColorName(hex);
            if (!seenNames.has(name)) {
                seenNames.add(name);
                hexCodes.push(hex);
                colorNames.push(name);
            }
        }

        return { hexCodes, colorNames };
    } catch {
        return null;
    }
}
