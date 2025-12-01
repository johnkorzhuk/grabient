import { describe, it, expect } from 'vitest';
import { applyGlobals, cosineGradient, rgbToHex } from './cosine';
import { serializeCoeffs, deserializeCoeffs } from '../serialization';
import { DEFAULT_GLOBALS } from '../valibot-schema/grabient';
import type { CosineCoeffs, GlobalModifiers } from './cosine';

describe('seed normalization (applyGlobals approach)', () => {
  describe('color output consistency', () => {
    it('should produce identical colors after normalization', () => {
      const coeffs: CosineCoeffs = [
        [0.5, 0.5, 0.5, 1],
        [0.5, 0.5, 0.5, 1],
        [1.0, 1.0, 1.0, 1],
        [0.0, 0.333, 0.667, 1],
      ];
      const globals: GlobalModifiers = [0.2, 1.5, 1.2, 0.5];
      const steps = 10;

      // Generate colors with original coeffs + globals
      const originalCoeffsWithGlobals = applyGlobals(coeffs, globals);
      const originalColors = cosineGradient(steps, originalCoeffsWithGlobals);

      // Normalize: apply globals to coeffs, those become the new coeffs
      const normalizedCoeffs = applyGlobals(coeffs, globals);
      const normalizedColors = cosineGradient(steps, normalizedCoeffs);

      // Colors should be identical
      expect(originalColors.length).toBe(normalizedColors.length);
      for (let i = 0; i < originalColors.length; i++) {
        const original = originalColors[i];
        const normalized = normalizedColors[i];

        if (original && normalized) {
          expect(normalized[0]).toBeCloseTo(original[0], 10);
          expect(normalized[1]).toBeCloseTo(original[1], 10);
          expect(normalized[2]).toBeCloseTo(original[2], 10);
        }
      }
    });

    it('should produce identical hex colors after normalization', () => {
      const coeffs: CosineCoeffs = [
        [0.5, 0.5, 0.5, 1],
        [0.5, 0.5, 0.5, 1],
        [1.0, 1.0, 1.0, 1],
        [0.0, 0.333, 0.667, 1],
      ];
      const globals: GlobalModifiers = [0.2, 1.5, 1.2, 0.5];
      const steps = 10;

      // Generate hex colors with original coeffs + globals
      const originalCoeffsWithGlobals = applyGlobals(coeffs, globals);
      const originalColors = cosineGradient(steps, originalCoeffsWithGlobals);
      const originalHexes = originalColors.map(([r, g, b]) => rgbToHex(r, g, b));

      // Normalize and generate hex colors
      const normalizedCoeffs = applyGlobals(coeffs, globals);
      const normalizedColors = cosineGradient(steps, normalizedCoeffs);
      const normalizedHexes = normalizedColors.map(([r, g, b]) => rgbToHex(r, g, b));

      // Hex colors should be identical
      expect(normalizedHexes).toEqual(originalHexes);
    });

    it('should handle extreme global values', () => {
      const coeffs: CosineCoeffs = [
        [0.3, 0.7, 0.4, 1],
        [0.2, 0.3, 0.5, 1],
        [0.8, 1.2, 0.9, 1],
        [0.1, 0.5, 0.8, 1],
      ];
      const globals: GlobalModifiers = [-0.5, 0.5, 1.8, -1.2];
      const steps = 20;

      const originalCoeffsWithGlobals = applyGlobals(coeffs, globals);
      const originalColors = cosineGradient(steps, originalCoeffsWithGlobals);

      const normalizedCoeffs = applyGlobals(coeffs, globals);
      const normalizedColors = cosineGradient(steps, normalizedCoeffs);

      for (let i = 0; i < originalColors.length; i++) {
        const original = originalColors[i];
        const normalized = normalizedColors[i];
        if (original && normalized) {
          expect(normalized[0]).toBeCloseTo(original[0], 10);
          expect(normalized[1]).toBeCloseTo(original[1], 10);
          expect(normalized[2]).toBeCloseTo(original[2], 10);
        }
      }
    });

    it('should handle negative coefficients', () => {
      const coeffs: CosineCoeffs = [
        [-0.2, 0.5, -0.3, 1],
        [0.3, -0.4, 0.2, 1],
        [1.2, 0.8, -0.5, 1],
        [-0.1, 0.6, -0.4, 1],
      ];
      const globals: GlobalModifiers = [0.3, 1.2, 0.9, 0.4];
      const steps = 15;

      const originalCoeffsWithGlobals = applyGlobals(coeffs, globals);
      const originalColors = cosineGradient(steps, originalCoeffsWithGlobals);

      const normalizedCoeffs = applyGlobals(coeffs, globals);
      const normalizedColors = cosineGradient(steps, normalizedCoeffs);

      for (let i = 0; i < originalColors.length; i++) {
        const original = originalColors[i];
        const normalized = normalizedColors[i];
        if (original && normalized) {
          expect(normalized[0]).toBeCloseTo(original[0], 10);
          expect(normalized[1]).toBeCloseTo(original[1], 10);
          expect(normalized[2]).toBeCloseTo(original[2], 10);
        }
      }
    });

    it('should work with default globals (no-op)', () => {
      const coeffs: CosineCoeffs = [
        [0.5, 0.5, 0.5, 1],
        [0.5, 0.5, 0.5, 1],
        [1.0, 1.0, 1.0, 1],
        [0.0, 0.333, 0.667, 1],
      ];
      const steps = 10;

      const originalColors = cosineGradient(steps, applyGlobals(coeffs, DEFAULT_GLOBALS));

      const normalizedCoeffs = applyGlobals(coeffs, DEFAULT_GLOBALS);
      const normalizedColors = cosineGradient(steps, normalizedCoeffs);

      // When globals are already defaults, coeffs should remain unchanged
      expect(normalizedCoeffs).toEqual(applyGlobals(coeffs, DEFAULT_GLOBALS));
      for (let i = 0; i < originalColors.length; i++) {
        const original = originalColors[i];
        const normalized = normalizedColors[i];
        if (original && normalized) {
          expect(normalized).toEqual(original);
        }
      }
    });
  });

  describe('seed normalization workflow', () => {
    it('should maintain visual output through full normalization workflow', () => {
      // Original seed with custom globals
      const originalCoeffs: CosineCoeffs = [
        [0.5, 0.5, 0.5, 1],
        [0.5, 0.5, 0.5, 1],
        [1.0, 1.0, 1.0, 1],
        [0.0, 0.333, 0.667, 1],
      ];
      const originalGlobals: GlobalModifiers = [0.2, 1.5, 1.2, 0.5];
      const steps = 10;

      // Serialize original
      const originalSeed = serializeCoeffs(originalCoeffs, originalGlobals);

      // Generate colors from original
      const originalResult = deserializeCoeffs(originalSeed);
      const originalWithGlobals = applyGlobals(originalResult.coeffs, originalResult.globals);
      const originalColors = cosineGradient(steps, originalWithGlobals);

      // Normalize: apply globals to coeffs, use default globals
      const normalizedCoeffs = applyGlobals(originalCoeffs, originalGlobals);
      const normalizedSeed = serializeCoeffs(normalizedCoeffs, DEFAULT_GLOBALS);

      // Generate colors from normalized seed
      const normalizedResult = deserializeCoeffs(normalizedSeed);
      const normalizedWithGlobals = applyGlobals(normalizedResult.coeffs, normalizedResult.globals);
      const normalizedColors = cosineGradient(steps, normalizedWithGlobals);

      // Visual output should be identical
      expect(normalizedColors.length).toBe(originalColors.length);
      for (let i = 0; i < originalColors.length; i++) {
        const original = originalColors[i];
        const normalized = normalizedColors[i];
        if (original && normalized) {
          expect(normalized[0]).toBeCloseTo(original[0], 10);
          expect(normalized[1]).toBeCloseTo(original[1], 10);
          expect(normalized[2]).toBeCloseTo(original[2], 10);
        }
      }

      // Normalized seed should use default globals
      expect(normalizedResult.globals).toEqual(DEFAULT_GLOBALS);
    });

    it('should handle multiple normalizations idempotently', () => {
      const coeffs: CosineCoeffs = [
        [0.5, 0.5, 0.5, 1],
        [0.5, 0.5, 0.5, 1],
        [1.0, 1.0, 1.0, 1],
        [0.0, 0.333, 0.667, 1],
      ];
      const globals: GlobalModifiers = [0.2, 1.5, 1.2, 0.5];
      const steps = 10;

      // First normalization
      const normalized1 = applyGlobals(coeffs, globals);
      const colors1 = cosineGradient(steps, normalized1);

      // Second normalization (with defaults - should be no-op)
      const normalized2 = applyGlobals(normalized1, DEFAULT_GLOBALS);
      const colors2 = cosineGradient(steps, normalized2);

      // Colors should remain identical
      for (let i = 0; i < colors1.length; i++) {
        const color1 = colors1[i];
        const color2 = colors2[i];
        if (color1 && color2) {
          expect(color2[0]).toBeCloseTo(color1[0], 10);
          expect(color2[1]).toBeCloseTo(color1[1], 10);
          expect(color2[2]).toBeCloseTo(color1[2], 10);
        }
      }
    });
  });

  describe('serialization round-trip', () => {
    it('should maintain colors through serialize-normalize-deserialize cycle', () => {
      const coeffs: CosineCoeffs = [
        [0.3, 0.7, 0.4, 1],
        [0.2, 0.3, 0.5, 1],
        [0.8, 1.2, 0.9, 1],
        [0.1, 0.5, 0.8, 1],
      ];
      const globals: GlobalModifiers = [0.15, 1.3, 1.1, 0.7];
      const steps = 10;

      // Original colors
      const originalSeed = serializeCoeffs(coeffs, globals);
      const { coeffs: originalCoeffs, globals: originalGlobals } = deserializeCoeffs(originalSeed);
      const originalColorsOutput = cosineGradient(steps, applyGlobals(originalCoeffs, originalGlobals));

      // Normalize by applying globals
      const normalizedCoeffs = applyGlobals(coeffs, globals);
      const normalizedSeed = serializeCoeffs(normalizedCoeffs, DEFAULT_GLOBALS);

      // Deserialize normalized
      const { coeffs: deserializedCoeffs, globals: deserializedGlobals } = deserializeCoeffs(normalizedSeed);
      const normalizedColorsOutput = cosineGradient(steps, applyGlobals(deserializedCoeffs, deserializedGlobals));

      // Should produce same colors
      expect(deserializedGlobals).toEqual(DEFAULT_GLOBALS);
      for (let i = 0; i < originalColorsOutput.length; i++) {
        const original = originalColorsOutput[i];
        const normalized = normalizedColorsOutput[i];
        if (original && normalized) {
          expect(normalized[0]).toBeCloseTo(original[0], 3); // 3 decimal precision due to serialization
          expect(normalized[1]).toBeCloseTo(original[1], 3);
          expect(normalized[2]).toBeCloseTo(original[2], 3);
        }
      }
    });
  });
});
