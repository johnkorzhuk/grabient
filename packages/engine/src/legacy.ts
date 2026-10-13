/* Old grabient.com palettes. A `_` seed is a cosine palette, clamp01(a + b·cos(2π(c·t + d))) per channel (Inigo
   Quilez's), with grabient.com's four globals: twelve numbers of 3 base64url characters (n = 131072 + v·1000), then the
   globals at 2 characters each (n = 2048 + v·1000) when any is off its default. Older addresses carry the numbers as
   lz-string text, which grabient.com answered with its `_` form. The reader is bit-identical to the original engine. */
import { BASE64URL } from "./codec.ts";
import type { Triple } from "./color.ts";
import { clamp01 } from "./math.ts";

export interface LegacyPalette {
  a: number[];
  b: number[];
  c: number[];
  d: number[];
  exposure: number;
  contrast: number;
  frequency: number;
  phase: number;
}

const digit = (ch: string) => BASE64URL.indexOf(ch);

/** `_` and 36 characters, or 44 with the globals; null for anything else. */
export function decodeLegacySeed(seed: unknown): LegacyPalette | null {
  if (typeof seed !== "string" || seed[0] !== "_") return null;
  const body = seed.slice(1);
  if ((body.length !== 36 && body.length !== 44) || /[^A-Za-z0-9_-]/.test(body)) return null;
  const n: number[] = [];
  for (let i = 0; i < 36; i += 3) {
    n.push(
      (((digit(body[i]) << 12) | (digit(body[i + 1]) << 6) | digit(body[i + 2])) - 131072) / 1000
    );
  }
  const [exposure, contrast, frequency, phase] =
    body.length === 44
      ? [36, 38, 40, 42].map(i => (((digit(body[i]) << 6) | digit(body[i + 1])) - 2048) / 1000)
      : [0, 1, 1, 0];
  return {
    a: n.slice(0, 3),
    b: n.slice(3, 6),
    c: n.slice(6, 9),
    d: n.slice(9, 12),
    exposure,
    contrast,
    frequency,
    phase
  };
}

/** The color at t, clamped as grabient.com clamped it. */
export function legacySrgb(P: LegacyPalette, t: number): Triple {
  const channel = (i: number) =>
    clamp01(
      P.a[i] +
        P.exposure +
        P.b[i] * P.contrast * Math.cos(2 * Math.PI * (P.c[i] * P.frequency * t + P.d[i] + P.phase))
    );
  return [channel(0), channel(1), channel(2)];
}

/* lz-string 1.5.0's decompressFromEncodedURIComponent, cut to that one function (Copyright (c) 2013 pieroxy, MIT
   License; the text is in NOTICE). */
const URI_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";
function lzDecompress(input: string): string | null {
  const read = (i: number) => Math.max(0, URI_SAFE.indexOf(input.charAt(i)));
  let value = read(0);
  let position = 32;
  let index = 1;
  const bits = (count: number) => {
    let n = 0;
    for (let power = 1; power !== 1 << count; power <<= 1) {
      const bit = value & position;
      position >>= 1;
      if (position === 0) {
        position = 32;
        value = read(index++);
      }
      if (bit > 0) n |= power;
    }
    return n;
  };
  const dictionary: string[] = [];
  let enlargeIn = 4;
  let size = 4;
  let width = 3;
  const first = bits(2);
  if (first === 2) return "";
  if (first !== 0 && first !== 1) return null;
  let w = String.fromCharCode(bits(first === 0 ? 8 : 16));
  dictionary[3] = w;
  const result = [w];
  for (;;) {
    if (index > input.length) return "";
    let code = bits(width);
    if (code === 0 || code === 1) {
      dictionary[size++] = String.fromCharCode(bits(code === 0 ? 8 : 16));
      code = size - 1;
      enlargeIn--;
    } else if (code === 2) return result.join("");
    if (enlargeIn === 0) {
      enlargeIn = 1 << width;
      width++;
    }
    const entry = dictionary[code] ?? (code === size ? w + w.charAt(0) : null);
    if (entry === null) return null;
    result.push(entry);
    dictionary[size++] = w + entry.charAt(0);
    enlargeIn--;
    w = entry;
    if (enlargeIn === 0) {
      enlargeIn = 1 << width;
      width++;
    }
  }
}

/* grabient.com's number rules: 12 or 16 values, a phase over one read as radians, coefficients clamped to the 18-bit
   range at three decimals, globals refused outside their ranges and left out at their defaults */
const COEFF_MAX = ((1 << 17) - 1) / 1000;
const COEFF_MIN = -(1 << 17) / 1000;
const GLOBAL_RANGES: readonly [number, number][] = [
  [-1, 1],
  [0, 2],
  [0, 2],
  [-1.001, 1.001]
];
const GLOBAL_DEFAULTS = [0, 1, 1, 0];
const fixed = (n: number) => Number(n.toFixed(3));
const numberOf = (s: string) =>
  parseFloat(s.startsWith(".") ? `0${s}` : s.startsWith("-.") ? `-0${s.slice(1)}` : s);

/** The keyframe seed the migration maps (`lookup`) hold for an old id, read as it is or, for an lz-string id, as its
    `_` form; null when they hold neither. A request resolves old ids only this way: it never fits. */
export function legacyTarget(
  id: string,
  lookup: (id: string) => string | undefined
): { seed: string; via: "mapped" | "aligned" } | null {
  const mapped = lookup(id);
  if (mapped) return { seed: mapped, via: "mapped" };
  const aligned = alignedLegacySeed(id);
  const seed = aligned ? lookup(aligned) : undefined;
  return seed ? { seed, via: "aligned" } : null;
}

/** An old compressed palette address as the `_` seed grabient.com wrote for it; null for anything else. */
export function alignedLegacySeed(id: string): string | null {
  if (id.length < 16 || id.length > 240 || !/^[A-Za-z0-9+$-]+$/.test(id)) return null;
  const text = lzDecompress(id);
  if (!text || !/^[0-9eE+.,-]+$/.test(text)) return null;
  const values = text.split(",").map(numberOf);
  if ((values.length !== 12 && values.length !== 16) || values.some(n => !Number.isFinite(n)))
    return null;
  const globals = values.length === 16 ? values.slice(12) : [...GLOBAL_DEFAULTS];
  /* the first of these links wrote the phase in radians */
  if (Math.abs(globals[3]) > 1.001) globals[3] /= Math.PI;
  if (globals.some((n, i) => n < GLOBAL_RANGES[i][0] || n > GLOBAL_RANGES[i][1])) return null;
  let seed = "_";
  for (const n of values.slice(0, 12)) {
    const q = Math.round(fixed(Math.min(COEFF_MAX, Math.max(COEFF_MIN, n))) * 1000) + (1 << 17);
    seed += BASE64URL[q >> 12] + BASE64URL[(q >> 6) & 63] + BASE64URL[q & 63];
  }
  const g = globals.map(fixed);
  if (g.some((n, i) => Math.abs(n - GLOBAL_DEFAULTS[i]) >= 1e-3)) {
    for (const n of g) {
      const q = Math.round(n * 1000) + (1 << 11);
      if (q < 0 || q >= 1 << 12) return null;
      seed += BASE64URL[q >> 6] + BASE64URL[q & 63];
    }
  }
  return seed;
}
