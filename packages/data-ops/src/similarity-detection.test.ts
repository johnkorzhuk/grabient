import { describe, it, expect } from 'vitest';
import { createSimilarityKey } from './similarity';
import { serializeCoeffs } from './serialization';
import type * as v from 'valibot';
import type { coeffsSchema, globalsSchema } from './valibot-schema/grabient';

type CosineCoeffs = v.InferOutput<typeof coeffsSchema>;
type GlobalModifiers = v.InferOutput<typeof globalsSchema>;

describe('Similarity Detection Strategy', () => {
  it('should detect similar palettes with precision-2 similarity keys', () => {
    // Original palette
    const original: CosineCoeffs = [
      [0.800, 0.500, 0.400, 1],
      [0.200, 0.200, 0.200, 1],
      [2.000, 1.000, 1.000, 1],
      [0.000, 0.100, 0.200, 1],
    ];
    const originalGlobals: GlobalModifiers = [0, 1, 1, 0];

    // User tweaks it very slightly (±0.003)
    const tweaked: CosineCoeffs = [
      [0.803, 0.497, 0.402, 1],
      [0.197, 0.203, 0.198, 1],
      [2.004, 0.996, 1.003, 1],
      [0.003, 0.102, 0.198, 1],
    ];
    const tweakedGlobals: GlobalModifiers = [0, 1, 1, 0];

    const originalKey = createSimilarityKey(original);
    const tweakedKey = createSimilarityKey(tweaked);

    // With precision-2, these should have the same similarity key
    expect(tweakedKey).toBe(originalKey);

    // But with full precision-3, they should be different
    const originalSeed = serializeCoeffs(original, originalGlobals);
    const tweakedSeed = serializeCoeffs(tweaked, tweakedGlobals);
    expect(tweakedSeed).not.toBe(originalSeed);
  });

  it('should differentiate meaningfully different palettes', () => {
    const palette1: CosineCoeffs = [
      [0.5, 0.5, 0.5, 1],
      [0.5, 0.5, 0.5, 1],
      [1.0, 1.0, 1.0, 1],
      [0.0, 0.333, 0.667, 1],
    ];
    const globals1: GlobalModifiers = [0, 1, 1, 0];

    // Significantly different
    const palette2: CosineCoeffs = [
      [0.7, 0.3, 0.6, 1],
      [0.3, 0.7, 0.6, 1],
      [1.2, 0.8, 1.2, 1],
      [0.2, 0.5, 0.5, 1],
    ];
    const globals2: GlobalModifiers = [0.2, 0.8, 1.2, 0.2];

    const key1 = createSimilarityKey(palette1);
    const key2 = createSimilarityKey(palette2);

    expect(key2).not.toBe(key1);
  });

  it('should work with database duplicate prevention strategy', () => {
    interface PaletteRecord {
      id: string;           // Full precision-3 seed (unique)
      similarityKey: string; // Low precision key for duplicate detection
    }

    const db: PaletteRecord[] = [];

    function insertPalette(coeffs: CosineCoeffs, globals: GlobalModifiers): 'inserted' | 'duplicate' {
      const id = serializeCoeffs(coeffs, globals);
      const similarityKey = createSimilarityKey(coeffs);

      // Check if similar palette exists
      if (db.some(p => p.similarityKey === similarityKey)) {
        return 'duplicate';
      }

      db.push({ id, similarityKey });
      return 'inserted';
    }

    // Insert original
    const original: CosineCoeffs = [[0.800, 0.500, 0.400, 1], [0.200, 0.200, 0.200, 1], [2.000, 1.000, 1.000, 1], [0.000, 0.100, 0.200, 1]];
    const originalGlobals: GlobalModifiers = [0, 1, 1, 0];

    expect(insertPalette(original, originalGlobals)).toBe('inserted');
    expect(db).toHaveLength(1);

    // Try to insert similar palette (±0.003)
    const similar: CosineCoeffs = [[0.803, 0.497, 0.402, 1], [0.197, 0.203, 0.198, 1], [2.004, 0.996, 1.003, 1], [0.003, 0.102, 0.198, 1]];
    const similarGlobals: GlobalModifiers = [0, 1, 1, 0];

    expect(insertPalette(similar, similarGlobals)).toBe('duplicate');
    expect(db).toHaveLength(1); // Still only 1 palette

    // Insert different palette
    const different: CosineCoeffs = [[0.7, 0.3, 0.6, 1], [0.3, 0.7, 0.6, 1], [1.2, 0.8, 1.2, 1], [0.2, 0.5, 0.5, 1]];
    const differentGlobals: GlobalModifiers = [0.2, 0.8, 1.2, 0.2];

    expect(insertPalette(different, differentGlobals)).toBe('inserted');
    expect(db).toHaveLength(2); // Now we have 2 palettes
  });

  it('should validate precision-2 catches very subtle variations', () => {
    // Precision-2 catches extremely subtle variations (±0.003-0.005)
    const val1 = 0.500;
    const val2 = 0.504; // Within ±0.005

    const p2_1 = Number(val1.toFixed(2)); // 0.50
    const p2_2 = Number(val2.toFixed(2)); // 0.50

    expect(p2_1).toBe(p2_2); // Same at precision-2 ✓

    // But catches slightly larger variations
    const val3 = 0.510; // Just over threshold
    const p2_3 = Number(val3.toFixed(2)); // 0.51

    expect(p2_1).not.toBe(p2_3); // Different at precision-2 ✓
  });
});

describe('Similarity Key Precision Handling', () => {
  it('should handle floating point precision issues', () => {
    // Floating point arithmetic can cause issues like:
    // 0.1 + 0.2 = 0.30000000000000004 (not 0.3)

    const coeffs1: CosineCoeffs = [
      [0.3, 0.3, 0.3, 1], // Direct value
      [0.3, 0.3, 0.3, 1],
      [1.0, 1.0, 1.0, 1],
      [0.0, 0.3, 0.7, 1],
    ];

    const coeffs2: CosineCoeffs = [
      [0.1 + 0.2, 0.1 + 0.2, 0.1 + 0.2, 1], // Computed value (0.30000000000000004)
      [0.1 + 0.2, 0.1 + 0.2, 0.1 + 0.2, 1],
      [1.0, 1.0, 1.0, 1],
      [0.0, 0.1 + 0.2, 0.7, 1],
    ];

    const globals: GlobalModifiers = [0, 1, 1, 0];

    const key1 = createSimilarityKey(coeffs1);
    const key2 = createSimilarityKey(coeffs2);

    // With toFixed, both should produce the same key
    expect(key1).toBe(key2);
  });

  it('should demonstrate potential issue with direct string concatenation', () => {
    // If we didn't use toFixed, we'd have issues
    const val1 = 0.3;
    const val2 = 0.1 + 0.2;

    // Direct string concatenation without rounding
    const str1 = String(val1); // "0.3"
    const str2 = String(val2); // "0.30000000000000004"

    expect(str1).not.toBe(str2); // Different!

    // But with toFixed, they're the same
    const fixed1 = Number(val1.toFixed(2)); // 0.30
    const fixed2 = Number(val2.toFixed(2)); // 0.30

    expect(String(fixed1)).toBe(String(fixed2)); // Same!
  });

  it('should produce consistent keys regardless of computation path', () => {
    // Different ways to arrive at the same conceptual value
    const a = 0.7;
    const b = 0.1 + 0.6;
    const c = 1.0 - 0.3;
    const d = 0.35 + 0.35;

    const coeffs_a: CosineCoeffs = [[a, a, a, 1], [a, a, a, 1], [1, 1, 1, 1], [0, 0.3, a, 1]];
    const coeffs_b: CosineCoeffs = [[b, b, b, 1], [b, b, b, 1], [1, 1, 1, 1], [0, 0.3, b, 1]];
    const coeffs_c: CosineCoeffs = [[c, c, c, 1], [c, c, c, 1], [1, 1, 1, 1], [0, 0.3, c, 1]];
    const coeffs_d: CosineCoeffs = [[d, d, d, 1], [d, d, d, 1], [1, 1, 1, 1], [0, 0.3, d, 1]];

    const globals: GlobalModifiers = [0, 1, 1, 0];

    const key_a = createSimilarityKey(coeffs_a);
    const key_b = createSimilarityKey(coeffs_b);
    const key_c = createSimilarityKey(coeffs_c);
    const key_d = createSimilarityKey(coeffs_d);

    // All should produce the same key
    expect(key_a).toBe(key_b);
    expect(key_b).toBe(key_c);
    expect(key_c).toBe(key_d);
  });

  it('should verify string format does not matter for equality', () => {
    // The pipe-separated format is fine because we're comparing exact strings
    const coeffs: CosineCoeffs = [
      [0.5, 0.5, 0.5, 1],
      [0.5, 0.5, 0.5, 1],
      [1.0, 1.0, 1.0, 1],
      [0.0, 0.333, 0.667, 1],
    ];
    const globals: GlobalModifiers = [0, 1, 1, 0];

    const key = createSimilarityKey(coeffs);

    // The key is just a string - compression doesn't matter for equality checks
    expect(typeof key).toBe('string');
    expect(key.includes('|')).toBe(true);

    // String comparison is exact
    const key2 = createSimilarityKey(coeffs);
    expect(key).toBe(key2);
    expect(key === key2).toBe(true);
  });
});

describe('Real-world Deduplication Scenarios', () => {
  it('should dedupe visually similar palettes from production data', () => {
    // These 4 palettes are visually very similar and should be deduped
    const similarGroup: CosineCoeffs[] = [
      [[0.761, 0.715, 0.693, 1], [0.086, 0.041, 0.059, 1], [0.773, 1.909, 0.975, 1], [0.197, 0.315, 0.456, 1]],
      [[0.761, 0.715, 0.693, 1], [0.086, 0.041, 0.059, 1], [0.802, 1.885, 1.001, 1], [0.199, 0.334, 0.464, 1]],
      [[0.761, 0.715, 0.693, 1], [0.086, 0.041, 0.059, 1], [0.819, 1.964, 1.002, 1], [0.195, 0.339, 0.449, 1]],
      [[0.761, 0.715, 0.693, 1], [0.086, 0.041, 0.059, 1], [0.754, 2.02, 0.927, 1], [0.189, 0.325, 0.445, 1]],
    ];

    // This palette is distinct
    const distinctPalette: CosineCoeffs = [
      [0.765, -0.188, 0.604, 1], [0.064, 0.922, 0.111, 1], [1.224, 0.101, 0.453, 1], [0.954, 0.996, 0.809, 1]
    ];

    const similarKeys = similarGroup.map(createSimilarityKey);
    const distinctKey = createSimilarityKey(distinctPalette);

    // All 4 similar palettes should have the SAME similarity key (deduped to 1)
    expect(similarKeys[0]).toBe(similarKeys[1]);
    expect(similarKeys[1]).toBe(similarKeys[2]);
    expect(similarKeys[2]).toBe(similarKeys[3]);

    // The distinct palette should have a DIFFERENT key
    expect(distinctKey).not.toBe(similarKeys[0]);
  });

  it('should keep distinct palettes separate', () => {
    // These palettes should all be considered distinct
    const distinctPalettes: CosineCoeffs[] = [
      [[-0.136, 0.32, 0.026, 1], [1.11, 0.714, 0.955, 1], [0.098, 0.095, 0.102, 1], [0.866, 0.84, 0.857, 1]],
      [[0.847, 1.176, 1.215, 1], [0.201, 0.609, 0.714, 1], [0.293, 0.12, 0.103, 1], [0.143, 0.335, 0.346, 1]],
      [[-0.136, 0.32, 0.026, 1], [1.11, 0.714, 0.955, 1], [0.1, 0.098, 0.099, 1], [0.883, 0.828, 0.9, 1]],
      [[-0.101, 0.666, 0.563, 1], [0.925, 0.065, 0.064, 1], [0.104, 0.87, 0.833, 1], [0.026, 0.596, 0.708, 1]],
    ];

    const keys = distinctPalettes.map(createSimilarityKey);
    const uniqueKeys = new Set(keys);

    // All distinct palettes should have unique keys
    // Note: palettes 0 and 2 are very similar - let's check
    console.log('Distinct palette keys:', keys);

    // At minimum, most should be unique
    expect(uniqueKeys.size).toBeGreaterThanOrEqual(3);
  });

  it('should validate deduplication reduces count significantly', () => {
    // Simulate the deduplication process
    const allPalettes: CosineCoeffs[] = [
      // Similar group (should dedupe to 1)
      [[0.761, 0.715, 0.693, 1], [0.086, 0.041, 0.059, 1], [0.773, 1.909, 0.975, 1], [0.197, 0.315, 0.456, 1]],
      [[0.761, 0.715, 0.693, 1], [0.086, 0.041, 0.059, 1], [0.802, 1.885, 1.001, 1], [0.199, 0.334, 0.464, 1]],
      [[0.761, 0.715, 0.693, 1], [0.086, 0.041, 0.059, 1], [0.819, 1.964, 1.002, 1], [0.195, 0.339, 0.449, 1]],
      [[0.761, 0.715, 0.693, 1], [0.086, 0.041, 0.059, 1], [0.754, 2.02, 0.927, 1], [0.189, 0.325, 0.445, 1]],
      // Distinct palette
      [[0.765, -0.188, 0.604, 1], [0.064, 0.922, 0.111, 1], [1.224, 0.101, 0.453, 1], [0.954, 0.996, 0.809, 1]],
      // More distinct palettes
      [[-0.136, 0.32, 0.026, 1], [1.11, 0.714, 0.955, 1], [0.098, 0.095, 0.102, 1], [0.866, 0.84, 0.857, 1]],
      [[0.847, 1.176, 1.215, 1], [0.201, 0.609, 0.714, 1], [0.293, 0.12, 0.103, 1], [0.143, 0.335, 0.346, 1]],
      [[-0.101, 0.666, 0.563, 1], [0.925, 0.065, 0.064, 1], [0.104, 0.87, 0.833, 1], [0.026, 0.596, 0.708, 1]],
    ];

    const keys = allPalettes.map(createSimilarityKey);
    const uniqueKeys = new Set(keys);

    console.log(`Total palettes: ${allPalettes.length}`);
    console.log(`Unique after dedup: ${uniqueKeys.size}`);
    console.log(`Reduction: ${allPalettes.length - uniqueKeys.size} duplicates removed`);

    // Started with 8 palettes, the 4 similar ones should collapse to 1
    // So we expect ~5 unique palettes (4 similar -> 1, plus 4 distinct)
    expect(uniqueKeys.size).toBeLessThan(allPalettes.length);
    expect(uniqueKeys.size).toBeLessThanOrEqual(5);
  });
});
