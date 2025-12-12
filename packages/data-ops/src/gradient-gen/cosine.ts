import * as v from "valibot";
import { coeffsSchema, globalsSchema } from "../valibot-schema/grabient";

const TAU = Math.PI * 2;

// RGB color tuple - always exactly 3 numbers [r, g, b]
export type RGB = [number, number, number];

export type CosineCoeffs = v.InferOutput<typeof coeffsSchema>;
export type GlobalModifiers = v.InferOutput<typeof globalsSchema>;

export function cosineGradient(numStops: number, coeffs: CosineCoeffs) {
    const result: RGB[] = [];

    const offsets = coeffs[0];
    const amplitudes = coeffs[1];
    const frequencies = coeffs[2];
    const phases = coeffs[3];

    if (!offsets || !amplitudes || !frequencies || !phases) {
        return [];
    }

    for (let i = 0; i < numStops; i++) {
        const t = numStops > 1 ? i / (numStops - 1) : 0;

        // Calculate RGB values (always exactly 3 channels)
        const r =
            (offsets[0] ?? 0) +
            (amplitudes[0] ?? 0) *
                Math.cos(TAU * ((frequencies[0] ?? 0) * t + (phases[0] ?? 0)));

        const g =
            (offsets[1] ?? 0) +
            (amplitudes[1] ?? 0) *
                Math.cos(TAU * ((frequencies[1] ?? 0) * t + (phases[1] ?? 0)));

        const b =
            (offsets[2] ?? 0) +
            (amplitudes[2] ?? 0) *
                Math.cos(TAU * ((frequencies[2] ?? 0) * t + (phases[2] ?? 0)));

        // Explicitly construct RGB tuple with exact type
        const rClamped = Math.max(0, Math.min(1, r));
        const gClamped = Math.max(0, Math.min(1, g));
        const bClamped = Math.max(0, Math.min(1, b));
        result.push([rClamped, gClamped, bClamped]);
    }

    return result;
}

export function rgbToHex(r: number, g: number, b: number): string {
    const toHex = (n: number) => {
        const hex = Math.round(n * 255).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const clean = hex.replace("#", "").toLowerCase();
    let expanded = clean;
    if (clean.length === 3) {
        expanded = `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`;
    }
    return {
        r: parseInt(expanded.slice(0, 2), 16) || 0,
        g: parseInt(expanded.slice(2, 4), 16) || 0,
        b: parseInt(expanded.slice(4, 6), 16) || 0,
    };
}

/**
 * Calculate average perceived brightness of an array of hex colors.
 * Uses ITU-R BT.601 luma coefficients (0.299 R + 0.587 G + 0.114 B).
 * Returns value between 0 (dark) and 1 (bright).
 */
export function calculateAverageBrightness(hexColors: string[]): number {
    if (hexColors.length === 0) return 0.5;

    let totalBrightness = 0;
    for (const hex of hexColors) {
        const rgb = hexToRgb(hex);
        totalBrightness += (rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114) / 255;
    }
    return totalBrightness / hexColors.length;
}

export function applyGlobals(
    cosCoeffs: CosineCoeffs,
    globals: GlobalModifiers,
): CosineCoeffs {
    return cosCoeffs.map((coeff, i) => {
        const alpha = coeff[3] ?? 1;
        switch (i) {
            case 0:
                return [
                    ...coeff.slice(0, 3).map((v) => v + (globals[0] ?? 0)),
                    alpha,
                ];
            case 1:
                return [
                    ...coeff.slice(0, 3).map((v) => v * (globals[1] ?? 1)),
                    alpha,
                ];
            case 2:
                return [
                    ...coeff.slice(0, 3).map((v) => v * (globals[2] ?? 1)),
                    alpha,
                ];
            case 3:
                return [
                    ...coeff.slice(0, 3).map((v) => v + (globals[3] ?? 0)),
                    alpha,
                ];
            default:
                return coeff;
        }
    }) as CosineCoeffs;
}

export function applyInverseGlobal(
    modifierIndex: number,
    value: number,
    globals: GlobalModifiers,
): number {
    switch (modifierIndex) {
        case 0:
            return value - globals[0];
        case 1:
            return value / globals[1];
        case 2:
            return value / globals[2];
        case 3:
            return value - globals[3];
        default:
            return value;
    }
}

export function updateCoeffWithInverseGlobal(
    coeffs: CosineCoeffs,
    modifierIndex: number,
    channelIndex: number,
    value: number,
    globals: GlobalModifiers,
): CosineCoeffs {
    const newCoeffs = coeffs.map((vector) =>
        vector.map((val) => val),
    ) as CosineCoeffs;

    const row = newCoeffs[modifierIndex];
    if (row) {
        row[channelIndex] = applyInverseGlobal(modifierIndex, value, globals);
    }

    return newCoeffs;
}

export function normalizeCoeffsToDefaults(
    cosCoeffs: CosineCoeffs,
    globals: GlobalModifiers,
): CosineCoeffs {
    return cosCoeffs.map((coeff, i) => {
        const alpha = coeff[3] ?? 1;
        switch (i) {
            case 0:
                return [
                    ...coeff.slice(0, 3).map((v) => v - (globals[0] ?? 0)),
                    alpha,
                ];
            case 1:
                return [
                    ...coeff.slice(0, 3).map((v) => v / (globals[1] ?? 1)),
                    alpha,
                ];
            case 2:
                return [
                    ...coeff.slice(0, 3).map((v) => v / (globals[2] ?? 1)),
                    alpha,
                ];
            case 3:
                return [
                    ...coeff.slice(0, 3).map((v) => v - (globals[3] ?? 0)),
                    alpha,
                ];
            default:
                return coeff;
        }
    }) as CosineCoeffs;
}

export function tareModifier(
    coeffs: CosineCoeffs,
    globals: GlobalModifiers,
    modifierIndex: number,
    defaultGlobal: number,
): { coeffs: CosineCoeffs; globals: GlobalModifiers } {
    const currentGlobal = globals[modifierIndex];

    if (currentGlobal === undefined || currentGlobal === defaultGlobal) {
        return { coeffs, globals };
    }

    const newCoeffs = coeffs.map((vector, i) => {
        if (i !== modifierIndex) return vector;

        const alpha = vector[3] ?? 1;
        switch (modifierIndex) {
            case 0:
                return [
                    ...vector.slice(0, 3).map((v) => v + currentGlobal - defaultGlobal),
                    alpha,
                ];
            case 1:
                return [
                    ...vector.slice(0, 3).map((v) => (v * currentGlobal) / defaultGlobal),
                    alpha,
                ];
            case 2:
                return [
                    ...vector.slice(0, 3).map((v) => (v * currentGlobal) / defaultGlobal),
                    alpha,
                ];
            case 3:
                return [
                    ...vector.slice(0, 3).map((v) => v + currentGlobal - defaultGlobal),
                    alpha,
                ];
            default:
                return vector;
        }
    }) as CosineCoeffs;

    const newGlobals = [...globals] as GlobalModifiers;
    newGlobals[modifierIndex] = defaultGlobal;

    return { coeffs: newCoeffs, globals: newGlobals };
}
