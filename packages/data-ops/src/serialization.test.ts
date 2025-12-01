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
      const globals: GlobalModifiers = [0.999, 1.999, 1.999, 3.141];

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
        3.141, // Near max phase
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
});
