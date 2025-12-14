import { hexToRgb, rgbToHex, type CosineCoeffs } from "./cosine";

type Vec3 = [number, number, number];

export interface FitResult {
    coeffs: CosineCoeffs;
    error: number;
}

export interface FitValidation {
    colorComparisons: Array<{
        original: string;
        fitted: string;
        error: number;
    }>;
}

function hexToVec3(hex: string): Vec3 {
    const rgb = hexToRgb(hex);
    return [rgb.r / 255, rgb.g / 255, rgb.b / 255];
}

/**
 * Solve linear least squares: find x that minimizes ||Ax - b||²
 * Uses normal equations: x = (AᵀA)⁻¹Aᵀb
 * Optimized for 3×3 system using Cramer's rule.
 */
function solveLinearLeastSquares(A: number[][], b: number[]): number[] {
    const m = A.length;
    const n = A[0]!.length;

    // Compute AᵀA (n×n)
    const AtA: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            for (let k = 0; k < m; k++) {
                AtA[i]![j]! += A[k]![i]! * A[k]![j]!;
            }
        }
    }

    // Compute Aᵀb (n×1)
    const Atb: number[] = Array(n).fill(0);
    for (let i = 0; i < n; i++) {
        for (let k = 0; k < m; k++) {
            Atb[i]! += A[k]![i]! * b[k]!;
        }
    }

    // Solve 3×3 system using Cramer's rule
    const det =
        AtA[0]![0]! * (AtA[1]![1]! * AtA[2]![2]! - AtA[1]![2]! * AtA[2]![1]!) -
        AtA[0]![1]! * (AtA[1]![0]! * AtA[2]![2]! - AtA[1]![2]! * AtA[2]![0]!) +
        AtA[0]![2]! * (AtA[1]![0]! * AtA[2]![1]! - AtA[1]![1]! * AtA[2]![0]!);

    if (Math.abs(det) < 1e-10) {
        // Degenerate case: return simple average
        const avg = b.reduce((s, v) => s + v, 0) / b.length;
        return [avg, 0, 0];
    }

    // Inverse of 3×3 matrix
    const inv: number[][] = [
        [
            (AtA[1]![1]! * AtA[2]![2]! - AtA[1]![2]! * AtA[2]![1]!) / det,
            (AtA[0]![2]! * AtA[2]![1]! - AtA[0]![1]! * AtA[2]![2]!) / det,
            (AtA[0]![1]! * AtA[1]![2]! - AtA[0]![2]! * AtA[1]![1]!) / det,
        ],
        [
            (AtA[1]![2]! * AtA[2]![0]! - AtA[1]![0]! * AtA[2]![2]!) / det,
            (AtA[0]![0]! * AtA[2]![2]! - AtA[0]![2]! * AtA[2]![0]!) / det,
            (AtA[0]![2]! * AtA[1]![0]! - AtA[0]![0]! * AtA[1]![2]!) / det,
        ],
        [
            (AtA[1]![0]! * AtA[2]![1]! - AtA[1]![1]! * AtA[2]![0]!) / det,
            (AtA[0]![1]! * AtA[2]![0]! - AtA[0]![0]! * AtA[2]![1]!) / det,
            (AtA[0]![0]! * AtA[1]![1]! - AtA[0]![1]! * AtA[1]![0]!) / det,
        ],
    ];

    // x = inv(AᵀA) · Aᵀb
    return [
        inv[0]![0]! * Atb[0]! + inv[0]![1]! * Atb[1]! + inv[0]![2]! * Atb[2]!,
        inv[1]![0]! * Atb[0]! + inv[1]![1]! * Atb[1]! + inv[1]![2]! * Atb[2]!,
        inv[2]![0]! * Atb[0]! + inv[2]![1]! * Atb[1]! + inv[2]![2]! * Atb[2]!,
    ];
}

const TAU = Math.PI * 2;

/**
 * For a single channel, find optimal (a, b, d) given fixed frequency c.
 * Uses trig identity: a + b·cos(2π(ct+d)) = A + B·cos(2πct) + C·sin(2πct)
 * which is linear in A, B, C.
 */
function fitChannelAtFrequency(
    targets: number[],
    tValues: number[],
    freq: number,
): [number, number, number, number] {
    // Build design matrix: [1, cos(2πct), sin(2πct)]
    const A: number[][] = tValues.map((t) => [
        1,
        Math.cos(TAU * freq * t),
        Math.sin(TAU * freq * t),
    ]);

    // Solve for [A, B, C] where color = A + B·cos + C·sin
    const [bigA, B, C] = solveLinearLeastSquares(A, targets);

    // Recover original parameters from trig identity
    const a = bigA!;
    const b = Math.sqrt(B! * B! + C! * C!);
    const d = b > 1e-10 ? Math.atan2(-C!, B!) / TAU : 0;

    // Compute error
    let error = 0;
    for (let i = 0; i < targets.length; i++) {
        const predicted = a + b * Math.cos(TAU * (freq * tValues[i]! + d));
        const diff = predicted - targets[i]!;
        error += diff * diff;
    }

    return [a, b, d, error];
}

// Frequency candidates: 0.1 to 2.0 in steps of 0.02
const FREQ_CANDIDATES = Array.from({ length: 96 }, (_, i) => 0.1 + i * 0.02);

/**
 * Create dense samples from linear interpolation of input colors.
 * This is the key to getting good fits - we fit the entire gradient shape,
 * not just the sparse input points.
 */
function createDenseTargets(
    hexColors: string[],
    numSamples: number = 64,
): { tValues: number[]; targets: [number[], number[], number[]] } {
    const colors = hexColors.map(hexToVec3);

    const tValues: number[] = [];
    const targets: [number[], number[], number[]] = [[], [], []];

    for (let i = 0; i < numSamples; i++) {
        const t = i / (numSamples - 1);
        tValues.push(t);

        // Find which segment we're in
        const scaledT = t * (colors.length - 1);
        const idx = Math.min(Math.floor(scaledT), colors.length - 2);
        const localT = scaledT - idx;

        // Linear interpolation between colors[idx] and colors[idx+1]
        const c0 = colors[idx]!;
        const c1 = colors[idx + 1]!;
        targets[0].push(c0[0] + (c1[0] - c0[0]) * localT);
        targets[1].push(c0[1] + (c1[1] - c0[1]) * localT);
        targets[2].push(c0[2] + (c1[2] - c0[2]) * localT);
    }

    return { tValues, targets };
}

/**
 * Fits cosine palette coefficients to hex colors using linear least squares.
 *
 * Key insight: fit against a densely sampled linear interpolation of the input
 * colors, not just the sparse input points. This ensures the fitted curve
 * approximates the expected gradient shape rather than oscillating wildly
 * between sample points.
 *
 * @param hexColors Array of 3-8 hex colors representing key points along the gradient
 * @returns Fitted coefficients and error metric
 */
export function fitCosinePalette(hexColors: string[]): FitResult {
    // Create dense samples from linear interpolation
    const { tValues, targets } = createDenseTargets(hexColors, 64);

    const bestParams: Vec3[] = [
        [0, 0, 0], // a (bias)
        [0, 0, 0], // b (amplitude)
        [0, 0, 0], // c (frequency)
        [0, 0, 0], // d (phase)
    ];
    let totalError = 0;

    // Fit each channel independently
    for (let ch = 0; ch < 3; ch++) {
        let bestFreq = 1;
        let bestA = 0.5;
        let bestB = 0;
        let bestD = 0;
        let bestErr = Infinity;

        // Phase 1: Coarse grid search
        for (const freq of FREQ_CANDIDATES) {
            const [a, b, d, err] = fitChannelAtFrequency(
                targets[ch]!,
                tValues,
                freq,
            );
            if (err < bestErr) {
                bestErr = err;
                bestFreq = freq;
                bestA = a;
                bestB = b;
                bestD = d;
            }
        }

        // Phase 2: Fine search around best frequency
        const fineStep = 0.005;
        for (let f = bestFreq - 0.05; f <= bestFreq + 0.05; f += fineStep) {
            if (f < 0.1) continue;
            const [a, b, d, err] = fitChannelAtFrequency(
                targets[ch]!,
                tValues,
                f,
            );
            if (err < bestErr) {
                bestErr = err;
                bestFreq = f;
                bestA = a;
                bestB = b;
                bestD = d;
            }
        }

        bestParams[0]![ch] = bestA;
        bestParams[1]![ch] = bestB;
        bestParams[2]![ch] = Math.max(0.1, bestFreq);
        bestParams[3]![ch] = ((bestD % 1) + 1) % 1;
        totalError += bestErr;
    }

    return {
        coeffs: [
            [bestParams[0]![0], bestParams[0]![1], bestParams[0]![2], 1],
            [bestParams[1]![0], bestParams[1]![1], bestParams[1]![2], 1],
            [bestParams[2]![0], bestParams[2]![1], bestParams[2]![2], 1],
            [bestParams[3]![0], bestParams[3]![1], bestParams[3]![2], 1],
        ] as CosineCoeffs,
        error: totalError,
    };
}

function cosineColor(t: number, a: Vec3, b: Vec3, c: Vec3, d: Vec3): Vec3 {
    return [
        a[0] + b[0] * Math.cos(TAU * (c[0] * t + d[0])),
        a[1] + b[1] * Math.cos(TAU * (c[1] * t + d[1])),
        a[2] + b[2] * Math.cos(TAU * (c[2] * t + d[2])),
    ];
}

/**
 * Validates the fit quality by comparing original and fitted colors.
 */
export function validateFit(
    hexColors: string[],
    result: FitResult,
): FitValidation {
    const tValues = hexColors.map((_, i) => i / (hexColors.length - 1));
    const a: Vec3 = [
        result.coeffs[0][0],
        result.coeffs[0][1],
        result.coeffs[0][2],
    ];
    const b: Vec3 = [
        result.coeffs[1][0],
        result.coeffs[1][1],
        result.coeffs[1][2],
    ];
    const c: Vec3 = [
        result.coeffs[2][0],
        result.coeffs[2][1],
        result.coeffs[2][2],
    ];
    const d: Vec3 = [
        result.coeffs[3][0],
        result.coeffs[3][1],
        result.coeffs[3][2],
    ];

    return {
        colorComparisons: hexColors.map((hex, i) => {
            const target = hexToVec3(hex);
            const generated = cosineColor(tValues[i]!, a, b, c, d);

            // Clamp generated values to valid range
            const clamped: Vec3 = [
                Math.max(0, Math.min(1, generated[0])),
                Math.max(0, Math.min(1, generated[1])),
                Math.max(0, Math.min(1, generated[2])),
            ];

            // Calculate error as average RGB difference (0-255 scale for readability)
            const error =
                ((Math.abs(target[0] - clamped[0]) +
                    Math.abs(target[1] - clamped[1]) +
                    Math.abs(target[2] - clamped[2])) /
                    3) *
                255;

            return {
                original: hex,
                fitted: rgbToHex(clamped[0], clamped[1], clamped[2]),
                error: Math.round(error * 10) / 10,
            };
        }),
    };
}
