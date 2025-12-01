import {
    cosineGradient,
    rgbToHex,
    applyGlobals,
    type CosineCoeffs,
    type GlobalModifiers,
} from "@repo/data-ops/gradient-gen/cosine";
import type { AppPalette, ExportItem } from "@/queries/palettes";

export function generateHexColors(
    coeffs: CosineCoeffs,
    globals: GlobalModifiers,
    steps: number,
): string[] {
    const appliedCoeffs = applyGlobals(coeffs, globals);
    const rgbColors = cosineGradient(steps, appliedCoeffs);
    return rgbColors.map(([r, g, b]) => rgbToHex(r, g, b));
}

export function getGradientColorsWithSteps(
    palette: AppPalette,
    steps: number,
): string[] {
    return generateHexColors(palette.coeffs, palette.globals, steps);
}

const hashCache = new Map<string, string>();
const MAX_CACHE_SIZE = 1000;

function fnv1aHash(str: string): string {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

export function createExportItemId(data: Omit<ExportItem, "id" | "hexColors">): string {
    const hashData = JSON.stringify({
        seed: data.seed,
        coeffs: data.coeffs,
        style: data.style,
        steps: data.steps,
        angle: data.angle,
    });

    const cached = hashCache.get(hashData);
    if (cached) return cached;

    const hash = fnv1aHash(hashData);

    if (hashCache.size >= MAX_CACHE_SIZE) {
        const firstKey = hashCache.keys().next().value;
        if (firstKey) hashCache.delete(firstKey);
    }

    hashCache.set(hashData, hash);
    return hash;
}

export function createExportItem(
    source: AppPalette,
    overrides?: {
        style?: AppPalette["style"];
        steps?: AppPalette["steps"];
        angle?: AppPalette["angle"];
        hexColors?: string[];
    },
): ExportItem {
    const exportData: Omit<ExportItem, "id"> = {
        coeffs: source.coeffs,
        globals: source.globals,
        style: overrides?.style ?? source.style,
        steps: overrides?.steps ?? source.steps,
        angle: overrides?.angle ?? source.angle,
        seed: source.seed,
        hexColors: overrides?.hexColors ?? source.hexColors,
    };

    return {
        id: createExportItemId(exportData),
        ...exportData,
    };
}
