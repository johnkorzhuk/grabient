import * as v from 'valibot';
import LZString from 'lz-string';
import { coeffsSchema, globalsSchema, COEFF_PRECISION, DEFAULT_GLOBALS } from './valibot-schema/grabient';

type CosineCoeffs = v.InferOutput<typeof coeffsSchema>;
type GlobalModifiers = v.InferOutput<typeof globalsSchema>;

/**
 * Binary seed format: '_' + base64url-encoded bit-packed payload.
 *
 * Each of the 12 coefficient values is stored as fixed-point at COEFF_PRECISION
 * decimals with a 1-bit width selector: narrow 14-bit (±8.191) for typical values,
 * wide 24-bit (±8388.607) for values blown up by tare/tether operations.
 * Non-default globals append 4 × 12-bit values (their schema ranges fit exactly).
 * Values beyond the wide range fall back to the legacy lz-string format.
 *
 * The '_' prefix never appears in lz-string's URI-safe alphabet (A-Za-z0-9+-$),
 * so legacy seeds remain decodable and dispatch is unambiguous.
 */
const BINARY_SEED_PREFIX = '_';
const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_INDEX = new Map([...B64_ALPHABET].map((char, index) => [char, index]));

// Computed lazily: this module and valibot-schema/grabient import each other
// (seedValidator uses isValidSeed), so imported bindings must not be read at
// module scope
const getScale = () => Math.pow(10, COEFF_PRECISION);
const NARROW_BITS = 14;
const NARROW_OFFSET = 1 << (NARROW_BITS - 1);
const WIDE_BITS = 24;
const WIDE_OFFSET = 1 << (WIDE_BITS - 1);
const GLOBAL_BITS = 12;
const GLOBAL_OFFSET = 1 << (GLOBAL_BITS - 1);
const GLOBALS_BLOCK_BITS = 4 * GLOBAL_BITS;
const COEFF_COUNT = 12;

class BitWriter {
  private chars = '';
  private acc = 0;
  private accBits = 0;

  write(value: number, width: number): void {
    this.acc = this.acc * Math.pow(2, width) + value;
    this.accBits += width;
    while (this.accBits >= 6) {
      this.accBits -= 6;
      const shift = Math.pow(2, this.accBits);
      const charValue = Math.floor(this.acc / shift);
      this.acc -= charValue * shift;
      this.chars += B64_ALPHABET[charValue];
    }
  }

  toString(): string {
    if (this.accBits > 0) {
      const charValue = this.acc * Math.pow(2, 6 - this.accBits);
      return this.chars + B64_ALPHABET[charValue];
    }
    return this.chars;
  }
}

class BitReader {
  private pos = 0;
  private acc = 0;
  private accBits = 0;

  constructor(private readonly payload: string) {}

  remaining(): number {
    return (this.payload.length - this.pos) * 6 + this.accBits;
  }

  read(width: number): number {
    while (this.accBits < width) {
      const charValue = B64_INDEX.get(this.payload[this.pos] as string);
      if (charValue === undefined) {
        throw new Error('Invalid seed: malformed binary payload');
      }
      this.pos++;
      this.acc = this.acc * 64 + charValue;
      this.accBits += 6;
    }
    this.accBits -= width;
    const shift = Math.pow(2, this.accBits);
    const value = Math.floor(this.acc / shift);
    this.acc -= value * shift;
    return value;
  }
}

function encodeBinarySeed(coeffValues: number[], globalValues: number[] | null): string | null {
  const SCALE = getScale();
  const writer = new BitWriter();

  for (const value of coeffValues) {
    const quantized = Math.round(value * SCALE);
    if (quantized >= -NARROW_OFFSET && quantized < NARROW_OFFSET) {
      writer.write(0, 1);
      writer.write(quantized + NARROW_OFFSET, NARROW_BITS);
    } else if (quantized >= -WIDE_OFFSET && quantized < WIDE_OFFSET) {
      writer.write(1, 1);
      writer.write(quantized + WIDE_OFFSET, WIDE_BITS);
    } else {
      return null;
    }
  }

  if (globalValues) {
    for (const value of globalValues) {
      const quantized = Math.round(value * SCALE) + GLOBAL_OFFSET;
      if (quantized < 0 || quantized >= 1 << GLOBAL_BITS) {
        return null;
      }
      writer.write(quantized, GLOBAL_BITS);
    }
  }

  return BINARY_SEED_PREFIX + writer.toString();
}

function decodeBinarySeed(seed: string): { coeffValues: number[]; globalValues: number[] } {
  const SCALE = getScale();
  const reader = new BitReader(seed.slice(BINARY_SEED_PREFIX.length));

  const coeffValues: number[] = [];
  for (let i = 0; i < COEFF_COUNT; i++) {
    if (reader.remaining() < 1 + NARROW_BITS) {
      throw new Error('Invalid seed: truncated binary payload');
    }
    const wide = reader.read(1) === 1;
    const quantized = wide
      ? reader.read(WIDE_BITS) - WIDE_OFFSET
      : reader.read(NARROW_BITS) - NARROW_OFFSET;
    coeffValues.push(quantized / SCALE);
  }

  let globalValues = [...DEFAULT_GLOBALS] as number[];
  if (reader.remaining() >= GLOBALS_BLOCK_BITS) {
    globalValues = [];
    for (let i = 0; i < 4; i++) {
      globalValues.push((reader.read(GLOBAL_BITS) - GLOBAL_OFFSET) / SCALE);
    }
  }

  // Base64 padding leaves at most 5 trailing bits; anything more is garbage
  if (reader.remaining() >= 6) {
    throw new Error('Invalid seed: unexpected trailing data');
  }

  return { coeffValues, globalValues };
}

function formatNumber(num: number): string {
  const formattedStr = num.toFixed(COEFF_PRECISION);

  if (num > -1 && num < 1 && num !== 0) {
    return formattedStr.replace(/^(-?)0\./, '$1.');
  } else if (num === 0) {
    return '0';
  }

  return formattedStr;
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

  const binarySeed = encodeBinarySeed(coeffValues, globalValues);
  if (binarySeed !== null) {
    return binarySeed;
  }

  const packed = [...coeffValues, ...(globalValues ?? [])].map(formatNumber).join(',');
  return LZString.compressToEncodedURIComponent(packed);
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

function decodeLegacySeed(seed: string): { coeffValues: number[]; globalValues: number[] } {
  const decompressed = LZString.decompressFromEncodedURIComponent(seed);

  if (!decompressed || decompressed.length === 0) {
    throw new Error('Invalid seed: failed to decompress or empty result');
  }

  const numbers = decompressed.split(',').map(parseNumber);

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

export function isValidSeed(seed: string): boolean {
  try {
    if (seed.startsWith(BINARY_SEED_PREFIX)) {
      const { globalValues } = decodeBinarySeed(seed);
      // Keep isValidSeed and deserializeCoeffs in agreement: a crafted payload
      // can carry a globals block outside the schema ranges
      return v.is(globalsSchema, globalValues);
    }

    const { coeffValues, globalValues } = decodeLegacySeed(seed);
    return [...coeffValues, ...globalValues].every((num) => !isNaN(num) && isFinite(num));
  } catch {
    return false;
  }
}

export function deserializeCoeffs(seed: string) {
  const { coeffValues, globalValues } = seed.startsWith(BINARY_SEED_PREFIX)
    ? decodeBinarySeed(seed)
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
