import { describe, it, expect } from 'vitest';
import { serializeCoeffs, deserializeCoeffs, isValidSeed } from './serialization';
import { DEFAULT_GLOBALS, COEFF_PRECISION } from './valibot-schema/grabient';
import type * as v from 'valibot';
import type { coeffsSchema, globalsSchema } from './valibot-schema/grabient';

type CosineCoeffs = v.InferOutput<typeof coeffsSchema>;
type GlobalModifiers = v.InferOutput<typeof globalsSchema>;

describe('serialization', () => {
  describe('serializeCoeffs and deserializeCoeffs', () => {
    it('should round-trip with default globals', () => {
      const coeffs: CosineCoeffs = [
        [0.5, 0.5, 0.5, 1],
        [0.5, 0.5, 0.5, 1],
        [1.0, 1.0, 1.0, 1],
        [0.0, 0.333, 0.667, 1],
      ];
      const globals: GlobalModifiers = [0, 1, 1, 0];

      const seed = serializeCoeffs(coeffs, globals);
      const result = deserializeCoeffs(seed);

      expect(result.coeffs).toEqual(coeffs);
      expect(result.globals).toEqual(globals);
    });

    it('should round-trip with custom globals', () => {
      const coeffs: CosineCoeffs = [
        [0.5, 0.5, 0.5, 1],
        [0.5, 0.5, 0.5, 1],
        [1.0, 1.0, 1.0, 1],
        [0.0, 0.333, 0.667, 1],
      ];
      const globals: GlobalModifiers = [0.5, 1.2, 1.5, 0.8];

      const seed = serializeCoeffs(coeffs, globals);
      const result = deserializeCoeffs(seed);

      expect(result.coeffs).toEqual(coeffs);
      expect(result.globals).toEqual(globals);
    });

    it('should handle negative coefficients', () => {
      const coeffs: CosineCoeffs = [
        [-0.5, 0.5, -0.3, 1],
        [0.2, -0.8, 0.1, 1],
        [-1.0, 1.0, -0.5, 1],
        [0.0, -0.333, 0.667, 1],
      ];
      const globals: GlobalModifiers = [0, 1, 1, 0];

      const seed = serializeCoeffs(coeffs, globals);
      const result = deserializeCoeffs(seed);

      expect(result.coeffs).toEqual(coeffs);
      expect(result.globals).toEqual(globals);
    });

    it('should handle negative decimals between -1 and 0', () => {
      const coeffs: CosineCoeffs = [
        [-0.123, -0.456, -0.789, 1],
        [-0.1, -0.2, -0.3, 1],
        [-0.999, -0.001, -0.5, 1],
        [0.0, -0.333, -0.667, 1],
      ];
      const globals: GlobalModifiers = [-0.5, 1, 1, -0.314];

      const seed = serializeCoeffs(coeffs, globals);
      const result = deserializeCoeffs(seed);

      expect(result.coeffs).toEqual(coeffs);
      expect(result.globals).toEqual(globals);
    });

    it('should handle zero values', () => {
      const coeffs: CosineCoeffs = [
        [0.0, 0.0, 0.0, 1],
        [0.5, 0.0, 0.5, 1],
        [0.0, 1.0, 0.0, 1],
        [0.0, 0.0, 0.667, 1],
      ];
      const globals: GlobalModifiers = [0, 1, 1, 0];

      const seed = serializeCoeffs(coeffs, globals);
      const result = deserializeCoeffs(seed);

      expect(result.coeffs).toEqual(coeffs);
      expect(result.globals).toEqual(globals);
    });

    it('should handle edge case values near precision limits', () => {
      const coeffs: CosineCoeffs = [
        [0.001, 0.999, -0.001, 1],
        [1.234, 5.678, 9.012, 1],
        [0.123, 0.456, 0.789, 1],
        [-1.111, 2.222, -3.333, 1],
      ];
      const globals: GlobalModifiers = [0.999, 1.999, 1.999, 0.999];

      const seed = serializeCoeffs(coeffs, globals);
      const result = deserializeCoeffs(seed);

      expect(result.coeffs).toEqual(coeffs);
      expect(result.globals).toEqual(globals);
    });

    it('should omit globals when they equal defaults (within epsilon)', () => {
      const coeffs: CosineCoeffs = [
        [0.5, 0.5, 0.5, 1],
        [0.5, 0.5, 0.5, 1],
        [1.0, 1.0, 1.0, 1],
        [0.0, 0.333, 0.667, 1],
      ];
      const globals: GlobalModifiers = [0, 1, 1, 0]; // Exactly default

      const seed = serializeCoeffs(coeffs, globals);
      const result = deserializeCoeffs(seed);

      // Should use default globals even though they weren't in the seed
      expect(result.globals).toEqual(DEFAULT_GLOBALS);
    });

    it('should include globals when they differ from defaults', () => {
      const coeffs: CosineCoeffs = [
        [0.5, 0.5, 0.5, 1],
        [0.5, 0.5, 0.5, 1],
        [1.0, 1.0, 1.0, 1],
        [0.0, 0.333, 0.667, 1],
      ];
      const globals: GlobalModifiers = [0.1, 1, 1, 0]; // Slightly different

      const seed = serializeCoeffs(coeffs, globals);
      const result = deserializeCoeffs(seed);

      expect(result.globals).toEqual(globals);
      expect(result.globals).not.toEqual(DEFAULT_GLOBALS);
    });

    it('should respect COEFF_PRECISION', () => {
      const coeffs: CosineCoeffs = [
        [0.123456789, 0.987654321, 0.111111111, 1],
        [0.5, 0.5, 0.5, 1],
        [1.0, 1.0, 1.0, 1],
        [0.0, 0.333, 0.667, 1],
      ];
      const globals: GlobalModifiers = [0, 1, 1, 0];

      const seed = serializeCoeffs(coeffs, globals);
      const result = deserializeCoeffs(seed);

      // Values should be rounded to COEFF_PRECISION decimal places
      const expectedPrecision = COEFF_PRECISION;
      expect(result.coeffs[0][0]).toBeCloseTo(0.123, expectedPrecision);
      expect(result.coeffs[0][1]).toBeCloseTo(0.988, expectedPrecision);
      expect(result.coeffs[0][2]).toBeCloseTo(0.111, expectedPrecision);
    });

    it('should handle large positive and negative values', () => {
      const coeffs: CosineCoeffs = [
        [100.123, -200.456, 50.789, 1],
        [999.999, -999.999, 0.001, 1],
        [10.5, -10.5, 5.25, 1],
        [0.0, 123.456, -789.012, 1],
      ];
      const globals: GlobalModifiers = [0, 1, 1, 0];

      const seed = serializeCoeffs(coeffs, globals);
      const result = deserializeCoeffs(seed);

      expect(result.coeffs).toEqual(coeffs);
    });
  });

  describe('isValidSeed', () => {
    it('should return true for valid seed with default globals', () => {
      const coeffs: CosineCoeffs = [
        [0.5, 0.5, 0.5, 1],
        [0.5, 0.5, 0.5, 1],
        [1.0, 1.0, 1.0, 1],
        [0.0, 0.333, 0.667, 1],
      ];
      const globals: GlobalModifiers = [0, 1, 1, 0];
      const seed = serializeCoeffs(coeffs, globals);

      expect(isValidSeed(seed)).toBe(true);
    });

    it('should return true for valid seed with custom globals', () => {
      const coeffs: CosineCoeffs = [
        [0.5, 0.5, 0.5, 1],
        [0.5, 0.5, 0.5, 1],
        [1.0, 1.0, 1.0, 1],
        [0.0, 0.333, 0.667, 1],
      ];
      const globals: GlobalModifiers = [0.5, 1.2, 1.5, 0.8];
      const seed = serializeCoeffs(coeffs, globals);

      expect(isValidSeed(seed)).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(isValidSeed('')).toBe(false);
    });

    it('should return false for invalid compressed string', () => {
      expect(isValidSeed('invalid')).toBe(false);
      expect(isValidSeed('not-a-seed')).toBe(false);
      expect(isValidSeed('abc123')).toBe(false);
    });

    it('should return false for malformed base64', () => {
      expect(isValidSeed('!!!invalid!!!')).toBe(false);
    });

    it('should return false for valid compression but wrong data structure', () => {
      // This would need to be a valid LZ-compressed string but with wrong number of values
      // Hard to construct, but the validator should catch it
      const LZString = require('lz-string');
      const badData = '1,2,3,4,5'; // Only 5 values, need 12 or 16
      const badSeed = LZString.compressToEncodedURIComponent(badData);

      expect(isValidSeed(badSeed)).toBe(false);
    });

    it('should return false for seed with NaN values', () => {
      const LZString = require('lz-string');
      const badData = '0.5,NaN,0.5,0.5,0.5,0.5,1.0,1.0,1.0,0.0,0.333,0.667';
      const badSeed = LZString.compressToEncodedURIComponent(badData);

      expect(isValidSeed(badSeed)).toBe(false);
    });

    it('should return false for seed with Infinity values', () => {
      const LZString = require('lz-string');
      const badData = '0.5,Infinity,0.5,0.5,0.5,0.5,1.0,1.0,1.0,0.0,0.333,0.667';
      const badSeed = LZString.compressToEncodedURIComponent(badData);

      expect(isValidSeed(badSeed)).toBe(false);
    });

    it('should return true for seed with negative decimals', () => {
      const coeffs: CosineCoeffs = [
        [-0.5, 0.5, -0.3, 1],
        [0.2, -0.8, 0.1, 1],
        [-1.0, 1.0, -0.5, 1],
        [0.0, -0.333, 0.667, 1],
      ];
      const globals: GlobalModifiers = [-0.5, 1, 1, 0];
      const seed = serializeCoeffs(coeffs, globals);

      expect(isValidSeed(seed)).toBe(true);
    });
  });

  describe('deserializeCoeffs error handling', () => {
    it('should throw error for empty string', () => {
      expect(() => deserializeCoeffs('')).toThrow('Invalid seed');
    });

    it('should throw error for invalid compressed string', () => {
      expect(() => deserializeCoeffs('invalid')).toThrow();
    });

    it('should throw error for wrong number of values', () => {
      const LZString = require('lz-string');
      const badData = '1,2,3,4,5'; // Only 5 values
      const badSeed = LZString.compressToEncodedURIComponent(badData);

      expect(() => deserializeCoeffs(badSeed)).toThrow('expected 12 or 16 values');
    });

    it('should throw error when decompression returns null', () => {
      expect(() => deserializeCoeffs('!!!')).toThrow('Invalid seed');
    });
  });

  describe('edge cases and special scenarios', () => {
    it('should handle coefficients at validation boundaries', () => {
      // Test values at the edges of what the validators allow
      const coeffs: CosineCoeffs = [
        [0.0, 0.0, 0.0, 1],
        [1.0, 1.0, 1.0, 1],
        [-1.0, -1.0, -1.0, 1],
        [0.5, -0.5, 0.0, 1],
      ];
      const globals: GlobalModifiers = [
        -1, // Min exposure
        2,  // Max contrast
        2,  // Max frequency
        1,  // Max phase
      ];

      const seed = serializeCoeffs(coeffs, globals);
      const result = deserializeCoeffs(seed);

      expect(result.coeffs).toEqual(coeffs);
      expect(result.globals).toEqual(globals);
    });

    it('should maintain precision for very small non-zero values', () => {
      const coeffs: CosineCoeffs = [
        [0.001, -0.001, 0.002, 1],
        [0.003, -0.002, 0.001, 1],
        [0.0, 0.0, 0.0, 1],
        [0.001, 0.001, 0.001, 1],
      ];
      const globals: GlobalModifiers = [0, 1, 1, 0];

      const seed = serializeCoeffs(coeffs, globals);
      const result = deserializeCoeffs(seed);

      expect(result.coeffs[0][0]).toBe(0.001);
      expect(result.coeffs[0][1]).toBe(-0.001);
      expect(result.coeffs[0][2]).toBe(0.002);
    });

    it('should handle repeated serialization/deserialization cycles', () => {
      let coeffs: CosineCoeffs = [
        [0.123, 0.456, 0.789, 1],
        [0.987, 0.654, 0.321, 1],
        [0.5, 0.5, 0.5, 1],
        [0.1, 0.2, 0.3, 1],
      ];
      let globals: GlobalModifiers = [0.5, 1.2, 1.5, 0.8];

      // Serialize/deserialize 5 times
      for (let i = 0; i < 5; i++) {
        const seed = serializeCoeffs(coeffs, globals);
        const result = deserializeCoeffs(seed);
        coeffs = result.coeffs;
        globals = result.globals;
      }

      // Should still be stable after multiple cycles
      expect(coeffs[0][0]).toBeCloseTo(0.123, COEFF_PRECISION);
      expect(globals[0]).toBeCloseTo(0.5, COEFF_PRECISION);
    });

    it('should produce URL-safe strings', () => {
      const coeffs: CosineCoeffs = [
        [0.5, 0.5, 0.5, 1],
        [0.5, 0.5, 0.5, 1],
        [1.0, 1.0, 1.0, 1],
        [0.0, 0.333, 0.667, 1],
      ];
      const globals: GlobalModifiers = [0, 1, 1, 0];

      const seed = serializeCoeffs(coeffs, globals);

      // Should not contain characters that need URL encoding
      expect(seed).not.toMatch(/[^A-Za-z0-9\-_.~]/);
      // Should be valid for use in URLs
      expect(() => encodeURIComponent(seed)).not.toThrow();
      expect(decodeURIComponent(seed)).toBe(seed); // Should not change when decoded
    });

    it('should handle globals very close to defaults (epsilon boundary)', () => {
      const epsilon = Math.pow(10, -COEFF_PRECISION); // For COEFF_PRECISION=3, epsilon = 0.001
      const coeffs: CosineCoeffs = [
        [0.5, 0.5, 0.5, 1],
        [0.5, 0.5, 0.5, 1],
        [1.0, 1.0, 1.0, 1],
        [0.0, 0.333, 0.667, 1],
      ];

      // Just below epsilon - should be treated as defaults (omitted from serialization)
      // Use a smaller value, like 0.0001 (which is less than 0.001)
      const globalsJustBelowEpsilon: GlobalModifiers = [
        0 + epsilon * 0.1, // 0.0001
        1 + epsilon * 0.1, // 1.0001
        1 + epsilon * 0.1, // 1.0001
        0 + epsilon * 0.1, // 0.0001
      ];

      const seed1 = serializeCoeffs(coeffs, globalsJustBelowEpsilon);
      const result1 = deserializeCoeffs(seed1);
      // When globals are omitted, deserialize returns exact defaults
      expect(result1.globals).toEqual(DEFAULT_GLOBALS);

      // Just above epsilon - should be included in serialization
      const globalsJustAboveEpsilon: GlobalModifiers = [
        0 + epsilon * 2, // 0.002
        1,
        1,
        0,
      ];

      const seed2 = serializeCoeffs(coeffs, globalsJustAboveEpsilon);
      const result2 = deserializeCoeffs(seed2);
      // When included, the values should round-trip (but may lose precision)
      expect(result2.globals[0]).toBeCloseTo(globalsJustAboveEpsilon[0], COEFF_PRECISION);
      expect(result2.globals).not.toEqual(DEFAULT_GLOBALS); // Should be different from defaults
    });
  });

  describe('binary seed format', () => {
    const coeffs: CosineCoeffs = [
      [0.5, 0.72, 0.51, 1],
      [0.48, 0.5, 0.49, 1],
      [1.0, 1.2, 0.8, 1],
      [0.12, 0.35, 0.83, 1],
    ];

    it('should produce compact seeds with a _ prefix', () => {
      const seed = serializeCoeffs(coeffs, DEFAULT_GLOBALS);
      expect(seed.startsWith('_')).toBe(true);
      expect(seed.length).toBe(31);
    });

    it('should produce 39-char seeds when globals are included', () => {
      const seed = serializeCoeffs(coeffs, [0.5, 1.2, 1.5, 0.8]);
      expect(seed.startsWith('_')).toBe(true);
      expect(seed.length).toBe(39);
    });

    it('should round-trip wide-tier values from tether/tare operations', () => {
      const wideCoeffs: CosineCoeffs = [
        [0.5, 0.72, 0.51, 1],
        [0.48, 0.5, 0.49, 1],
        [13.888, 23.232, 12.608, 1],
        [0.12, 0.35, 0.83, 1],
      ];

      const seed = serializeCoeffs(wideCoeffs, DEFAULT_GLOBALS);
      const result = deserializeCoeffs(seed);

      expect(seed.startsWith('_')).toBe(true);
      expect(result.coeffs).toEqual(wideCoeffs);
    });

    it('should fall back to legacy format for values beyond the wide tier', () => {
      const extremeCoeffs: CosineCoeffs = [
        [10000.5, 0.72, 0.51, 1],
        [0.48, 0.5, 0.49, 1],
        [1.0, 1.2, 0.8, 1],
        [0.12, 0.35, 0.83, 1],
      ];

      const seed = serializeCoeffs(extremeCoeffs, DEFAULT_GLOBALS);
      const result = deserializeCoeffs(seed);

      expect(seed.startsWith('_')).toBe(false);
      expect(isValidSeed(seed)).toBe(true);
      expect(result.coeffs).toEqual(extremeCoeffs);
    });

    it('should still decode legacy lz-string seeds', () => {
      const LZString = require('lz-string');
      const legacyData = '.5,.72,.51,.48,.5,.49,1.000,1.200,.800,.120,.350,.830';
      const legacySeed = LZString.compressToEncodedURIComponent(legacyData);

      expect(isValidSeed(legacySeed)).toBe(true);
      const result = deserializeCoeffs(legacySeed);
      expect(result.coeffs).toEqual(coeffs);
      expect(result.globals).toEqual(DEFAULT_GLOBALS);
    });

    it('should scale legacy -π..π phase when decoding legacy seeds', () => {
      const LZString = require('lz-string');
      const legacyData = '.5,.72,.51,.48,.5,.49,1.000,1.200,.800,.120,.350,.830,0,1,1,3.141';
      const legacySeed = LZString.compressToEncodedURIComponent(legacyData);

      const result = deserializeCoeffs(legacySeed);
      expect(result.globals[3]).toBeCloseTo(3.141 / Math.PI, COEFF_PRECISION);
    });

    it('should re-encode a decoded legacy seed into the binary format losslessly', () => {
      const LZString = require('lz-string');
      const legacyData = '.5,.72,.51,.48,.5,.49,1.000,1.200,.800,.120,.350,.830';
      const legacySeed = LZString.compressToEncodedURIComponent(legacyData);

      const decoded = deserializeCoeffs(legacySeed);
      const binarySeed = serializeCoeffs(decoded.coeffs, decoded.globals);
      const result = deserializeCoeffs(binarySeed);

      expect(binarySeed.startsWith('_')).toBe(true);
      expect(result.coeffs).toEqual(decoded.coeffs);
      expect(result.globals).toEqual(decoded.globals);
    });

    it('should reject malformed binary seeds', () => {
      expect(isValidSeed('_')).toBe(false);
      expect(isValidSeed('_abc')).toBe(false);
      expect(isValidSeed('_!!!invalid!!!')).toBe(false);
      const valid = serializeCoeffs(coeffs, DEFAULT_GLOBALS);
      expect(isValidSeed(valid + 'AAAAAAAA')).toBe(false);
      expect(isValidSeed(valid.slice(0, 10))).toBe(false);
    });

    it('should round-trip exact 3-decimal values across both tiers', () => {
      let state = 123456789;
      const rand = () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
      };

      for (let iteration = 0; iteration < 2000; iteration++) {
        const values = Array.from({ length: 12 }, () => {
          const roll = rand();
          const range = roll < 0.7 ? 4 : roll < 0.9 ? 16.383 : 16777.215;
          const value = Number((rand() * range - range / 2).toFixed(3));
          // Both formats normalize -0 to +0
          return value === 0 ? 0 : value;
        });
        const testCoeffs = [
          [values[0], values[1], values[2], 1],
          [values[3], values[4], values[5], 1],
          [values[6], values[7], values[8], 1],
          [values[9], values[10], values[11], 1],
        ] as CosineCoeffs;

        const seed = serializeCoeffs(testCoeffs, DEFAULT_GLOBALS);
        const result = deserializeCoeffs(seed);
        expect(result.coeffs).toEqual(testCoeffs);
      }
    });
  });
});
