import * as v from 'valibot';
import LZString from 'lz-string';
import { coeffsSchema, globalsSchema, COEFF_PRECISION, DEFAULT_GLOBALS } from './valibot-schema/grabient';

type CosineCoeffs = v.InferOutput<typeof coeffsSchema>;
type GlobalModifiers = v.InferOutput<typeof globalsSchema>;

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

  const data = [
    ...validatedCoeffs.map((vec) => [vec[0], vec[1], vec[2]]).flat(),
    ...(useDefaultGlobals ? [] : validatedGlobals),
  ];

  const packed = data.map(formatNumber).join(',');

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

export function isValidSeed(seed: string): boolean {
  try {
    const decompressed = LZString.decompressFromEncodedURIComponent(seed);
    if (!decompressed || decompressed.length === 0) return false;

    const numbers = decompressed.split(',').map(parseNumber);

    if (numbers.length !== 12 && numbers.length !== 16) return false;

    return numbers.every(num => !isNaN(num) && isFinite(num));
  } catch {
    return false;
  }
}

export function deserializeCoeffs(seed: string) {
  const decompressed = LZString.decompressFromEncodedURIComponent(seed);

  if (!decompressed || decompressed.length === 0) {
    throw new Error('Invalid seed: failed to decompress or empty result');
  }

  const numbers = decompressed.split(',').map(parseNumber);

  if (numbers.length !== 12 && numbers.length !== 16) {
    throw new Error(`Invalid seed format: expected 12 or 16 values, got ${numbers.length}`);
  }

  const coeffsData = numbers.slice(0, 12);
  let globalsData = numbers.length > 12 ? numbers.slice(12, 16) : [...DEFAULT_GLOBALS];

  // Backward compatibility: old seeds have phase in -π..π range (|phase| > 1)
  // New seeds have phase in -1..1 range
  if (globalsData.length === 4) {
    const phase = globalsData[3] ?? 0;
    if (Math.abs(phase) > 1.001) {
      // Old format - scale from -π..π to -1..1
      globalsData[3] = phase / Math.PI;
    }
  }

  const coeffsWithAlpha = [];
  for (let i = 0; i < 12; i += 3) {
    coeffsWithAlpha.push([coeffsData[i], coeffsData[i + 1], coeffsData[i + 2], 1]);
  }

  return {
    coeffs: v.parse(coeffsSchema, coeffsWithAlpha),
    globals: v.parse(globalsSchema, globalsData),
  };
}
