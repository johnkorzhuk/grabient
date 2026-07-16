import * as v from 'valibot';
import LZString from 'lz-string';
import { coeffsSchema, globalsSchema, COEFF_PRECISION, DEFAULT_GLOBALS } from './valibot-schema/coeffs';

type CosineCoeffs = v.InferOutput<typeof coeffsSchema>;
type GlobalModifiers = v.InferOutput<typeof globalsSchema>;

/**
 * Char-aligned seed format: '_' + base64url payload where every value owns
 * exact character positions, like a hex color code.
 *
 * Each of the 12 coefficients is 3 chars (18-bit fixed point at COEFF_PRECISION
 * decimals, range ±131.071): chars 1-3 = base R, 4-6 = base G, 7-9 = base B,
 * then the amplitude, frequency, and phase rows in the same RGB order.
 * Non-default globals append 2 chars each (12-bit; schema ranges fit exactly):
 * exposure, contrast, frequency, phase. Total 37 or 45 chars.
 *
 * Editing one char group changes exactly one value — URLs are hackable.
 * Values beyond ±131.071 fall back to the legacy lz-string format.
 *
 * Decoding accepts two more formats, though only the aligned one is produced:
 * - Decimal CSV: 12 or 16 comma-separated plain numbers in the same order
 *   (coeffs, then optional globals) — the human/LLM-writable form
 * - Legacy lz-string CSV: everything else
 * Dispatch is unambiguous: aligned seeds start with '_', and ',' appears in
 * neither the aligned alphabet nor lz-string's URI-safe one (A-Za-z0-9+-$).
 */
const ALIGNED_SEED_PREFIX = '_';
const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_INDEX = new Map([...B64_ALPHABET].map((char, index) => [char, index]));

const SCALE = Math.pow(10, COEFF_PRECISION);
const COEFF_COUNT = 12;
const COEFF_OFFSET = 1 << 17; // 3 chars = 18 bits per coefficient
const GLOBAL_OFFSET = 1 << 11; // 2 chars = 12 bits per global
const COEFF_BLOCK_CHARS = COEFF_COUNT * 3;
const GLOBALS_BLOCK_CHARS = 4 * 2;

function encodeAlignedSeed(coeffValues: number[], globalValues: number[] | null): string | null {
  let out = ALIGNED_SEED_PREFIX;

  for (const value of coeffValues) {
    const q = Math.round(value * SCALE) + COEFF_OFFSET;
    if (q < 0 || q >= 1 << 18) return null;
    out += B64_ALPHABET[q >> 12]! + B64_ALPHABET[(q >> 6) & 63]! + B64_ALPHABET[q & 63]!;
  }

  if (globalValues) {
    for (const value of globalValues) {
      const q = Math.round(value * SCALE) + GLOBAL_OFFSET;
      if (q < 0 || q >= 1 << 12) return null;
      out += B64_ALPHABET[q >> 6]! + B64_ALPHABET[q & 63]!;
    }
  }

  return out;
}

function decodeAlignedSeed(seed: string): { coeffValues: number[]; globalValues: number[] } {
  const payload = seed.slice(ALIGNED_SEED_PREFIX.length);
  if (payload.length !== COEFF_BLOCK_CHARS && payload.length !== COEFF_BLOCK_CHARS + GLOBALS_BLOCK_CHARS) {
    throw new Error(`Invalid seed: expected ${COEFF_BLOCK_CHARS} or ${COEFF_BLOCK_CHARS + GLOBALS_BLOCK_CHARS} payload chars, got ${payload.length}`);
  }

  const charAt = (i: number): number => {
    const value = B64_INDEX.get(payload[i] as string);
    if (value === undefined) throw new Error('Invalid seed: malformed character');
    return value;
  };

  const coeffValues: number[] = [];
  for (let i = 0; i < COEFF_COUNT; i++) {
    const q = (charAt(i * 3) << 12) | (charAt(i * 3 + 1) << 6) | charAt(i * 3 + 2);
    coeffValues.push((q - COEFF_OFFSET) / SCALE);
  }

  let globalValues = [...DEFAULT_GLOBALS] as number[];
  if (payload.length === COEFF_BLOCK_CHARS + GLOBALS_BLOCK_CHARS) {
    globalValues = [];
    for (let i = 0; i < 4; i++) {
      const base = COEFF_BLOCK_CHARS + i * 2;
      const q = (charAt(base) << 6) | charAt(base + 1);
      globalValues.push((q - GLOBAL_OFFSET) / SCALE);
    }
  }

  return { coeffValues, globalValues };
}

export function serializeCoeffs(coeffs: CosineCoeffs, globals: GlobalModifiers): string {
  const validatedCoeffs = v.parse(coeffsSchema, coeffs);
  const validatedGlobals = v.parse(globalsSchema, globals);

  const EPSILON = Math.pow(10, -COEFF_PRECISION);
  const useDefaultGlobals = validatedGlobals.every((val, index) => {
    const defaultVal = DEFAULT_GLOBALS[index];
    if (defaultVal === undefined) return false;
    return Math.abs(val - defaultVal) < EPSILON;
  });

  const coeffValues = validatedCoeffs.flatMap((vec) => [vec[0], vec[1], vec[2]]);
  const globalValues = useDefaultGlobals ? null : [...validatedGlobals];

  const alignedSeed = encodeAlignedSeed(coeffValues, globalValues);
  if (alignedSeed === null) {
    // Unreachable: the schemas clamp coefficients to [COEFF_MIN, COEFF_MAX]
    // and bound the globals, so every validated value is encodable
    throw new Error('serializeCoeffs: validated values exceed encodable range');
  }
  return alignedSeed;
}

function parseNumber(str: string): number {
  if (str.startsWith('.')) {
    return parseFloat('0' + str);
  }
  if (str.startsWith('-.')) {
    return parseFloat('-0' + str.slice(1));
  }
  return parseFloat(str);
}

function splitSeedValues(numbers: number[]): { coeffValues: number[]; globalValues: number[] } {
  if (numbers.length !== 12 && numbers.length !== 16) {
    throw new Error(`Invalid seed format: expected 12 or 16 values, got ${numbers.length}`);
  }

  const coeffValues = numbers.slice(0, 12);
  const globalValues = numbers.length > 12 ? numbers.slice(12, 16) : [...DEFAULT_GLOBALS];

  // Backward compatibility: old seeds have phase in -π..π range (|phase| > 1)
  // New seeds have phase in -1..1 range
  const phase = globalValues[3] ?? 0;
  if (Math.abs(phase) > 1.001) {
    globalValues[3] = phase / Math.PI;
  }

  return { coeffValues, globalValues };
}

function decodeLegacySeed(seed: string): { coeffValues: number[]; globalValues: number[] } {
  const decompressed = LZString.decompressFromEncodedURIComponent(seed);

  if (!decompressed || decompressed.length === 0) {
    throw new Error('Invalid seed: failed to decompress or empty result');
  }

  return splitSeedValues(decompressed.split(',').map(parseNumber));
}

const DECIMAL_TOKEN = /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/;

function decodeDecimalSeed(seed: string): { coeffValues: number[]; globalValues: number[] } {
  const numbers = seed.split(',').map((raw) => {
    const token = raw.trim();
    if (!DECIMAL_TOKEN.test(token)) {
      throw new Error('Invalid decimal seed: malformed number');
    }
    const value = Number(token);
    if (!Number.isFinite(value)) {
      throw new Error('Invalid decimal seed: non-finite value');
    }
    return value;
  });

  return splitSeedValues(numbers);
}

export function isValidSeed(seed: string): boolean {
  try {
    if (seed.startsWith(ALIGNED_SEED_PREFIX)) {
      const { globalValues } = decodeAlignedSeed(seed);
      // Keep isValidSeed and deserializeCoeffs in agreement: a crafted payload
      // can carry a globals block outside the schema ranges
      return v.is(globalsSchema, globalValues);
    }

    if (seed.includes(',')) {
      const { globalValues } = decodeDecimalSeed(seed);
      return v.is(globalsSchema, globalValues);
    }

    const { coeffValues, globalValues } = decodeLegacySeed(seed);
    return [...coeffValues, ...globalValues].every((num) => !isNaN(num) && isFinite(num));
  } catch {
    return false;
  }
}

export const seedValidator = v.pipe(
  v.string(),
  v.check(isValidSeed, 'Invalid seed: unable to deserialize'),
);

export function deserializeCoeffs(seed: string) {
  const { coeffValues, globalValues } = seed.startsWith(ALIGNED_SEED_PREFIX)
    ? decodeAlignedSeed(seed)
    : seed.includes(',')
      ? decodeDecimalSeed(seed)
      : decodeLegacySeed(seed);

  const coeffsWithAlpha = [];
  for (let i = 0; i < 12; i += 3) {
    coeffsWithAlpha.push([coeffValues[i], coeffValues[i + 1], coeffValues[i + 2], 1]);
  }

  return {
    coeffs: v.parse(coeffsSchema, coeffsWithAlpha),
    globals: v.parse(globalsSchema, globalValues),
  };
}
