/**
 * serialization.ts and valibot-schema/grabient.ts import each other
 * (seedValidator uses isValidSeed). Entering the cycle via the schema module,
 * as the app bundle does, must not hit a TDZ ReferenceError from module-scope
 * reads of imported bindings. Import order here is the regression.
 */
import { describe, it, expect } from 'vitest';
import { seedValidator, DEFAULT_GLOBALS } from './valibot-schema/grabient';
import * as v from 'valibot';
import { serializeCoeffs, deserializeCoeffs } from './serialization';

describe('module cycle entered via valibot-schema', () => {
  it('serializes and validates without initialization errors', () => {
    const coeffs = [
      [0.5, 0.72, 0.51, 1],
      [0.48, 0.5, 0.49, 1],
      [1.0, 1.2, 0.8, 1],
      [0.12, 0.35, 0.83, 1],
    ] as Parameters<typeof serializeCoeffs>[0];

    const seed = serializeCoeffs(coeffs, DEFAULT_GLOBALS);
    // A TDZ/undefined read of COEFF_PRECISION makes the binary encoder bail
    // to the legacy format, so the prefix is the observable symptom here
    expect(seed.startsWith('_')).toBe(true);
    expect(v.is(seedValidator, seed)).toBe(true);
    expect(deserializeCoeffs(seed).coeffs).toEqual(coeffs);
  });
});
