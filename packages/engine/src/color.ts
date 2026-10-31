/* Color spaces: sRGB, OKLab and OKLCH (Björn Ottosson's conversion, see NOTICE), Display-P3, CIELAB, and WCAG 2
   luminance. Every other module converts through these, so one color has one set of numbers everywhere. Linear
   components may leave 0..1: a color outside sRGB has negative linear sRGB, and clamping early would fold a wider
   gamut onto the narrow one. */
import { clamp01, DEG, onWheel } from "./math.ts";

/** Three channels: sRGB or Display-P3 0 to 1, or an OKLab, OKLCH or CIELAB color. */
export type Triple = [number, number, number];

/** The sRGB transfer curve, encoded to linear and back. Display-P3 shares it. */
export const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
export const toEncoded = (v: number) =>
  v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;

export function linOklab(r: number, g: number, b: number): Triple {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ];
}
export const srgbToOklab = (r: number, g: number, b: number) =>
  linOklab(toLinear(r), toLinear(g), toLinear(b));
export function oklabToLinear(L: number, a: number, b: number): Triple {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ];
}

/* Linear sRGB to linear Display-P3 and back: both are D65, so one fixed matrix each way (colorjs.io's values). */
const S2P3 = [
  [0.8224621, 0.177538, 0],
  [0.0331941, 0.9668058, 0],
  [0.0170827, 0.0723974, 0.9105199]
] as const;
const P3_2S = [
  [1.2249401, -0.2249404, 0],
  [-0.0420569, 1.0420571, 0],
  [-0.0196376, -0.0786361, 1.0982735]
] as const;
export function oklabToLinearP3(L: number, a: number, b: number): Triple {
  const [r, g, bl] = oklabToLinear(L, a, b);
  return [
    S2P3[0][0] * r + S2P3[0][1] * g,
    S2P3[1][0] * r + S2P3[1][1] * g,
    S2P3[2][0] * r + S2P3[2][1] * g + S2P3[2][2] * bl
  ];
}

const inGamut = (rgb: Triple) => rgb.every(v => v >= -1e-4 && v <= 1 + 1e-4);
/** The chroma the target gamut shows at this lightness and hue: C itself when it fits, else a bisection of the scale.
    A picture redrawn while a hand drags asks for fewer steps: 12 land within 1/4096 of the chroma, under 8 bits. */
export function fitChroma(L: number, C: number, H: number, wide = false, steps = 24): number {
  L = clamp01(L);
  C = Math.max(0, C);
  const toLin = wide ? oklabToLinearP3 : oklabToLinear;
  const ca = Math.cos(H * DEG);
  const sa = Math.sin(H * DEG);
  if (inGamut(toLin(L, C * ca, C * sa))) return C;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < steps; i++) {
    const m = (lo + hi) / 2;
    if (inGamut(toLin(L, C * m * ca, C * m * sa))) lo = m;
    else hi = m;
  }
  return C * lo;
}
const encoded = (lin: Triple): Triple => [
  clamp01(toEncoded(clamp01(lin[0]))),
  clamp01(toEncoded(clamp01(lin[1]))),
  clamp01(toEncoded(clamp01(lin[2])))
];
/** OKLCH to sRGB, chroma lowered at constant lightness and hue until the color fits. */
export function lchToSrgb(L: number, C: number, H: number): Triple {
  L = clamp01(L);
  const c = fitChroma(L, C, H, false);
  return encoded(oklabToLinear(L, c * Math.cos(H * DEG), c * Math.sin(H * DEG)));
}
/* oklabToLinear into these three, and whether the color fits sRGB, for a picture's bytes alone (lchToSrgbBytes): no
   array made, and its cubes products, where a power is a library call and three of them most of a conversion's time.
   The two differ in the last bit at most, and a picture's bytes not at all (color.test.ts); a color's own numbers keep
   oklabToLinear's doubles, which fixtures and old links' fits pin. */
let lr = 0;
let lg = 0;
let lb = 0;
const fitsIn = (v: number) => v >= -1e-4 && v <= 1 + 1e-4;
function linearInto(L: number, a: number, b: number): boolean {
  const l1 = L + 0.3963377774 * a + 0.2158037573 * b;
  const m1 = L - 0.1055613458 * a - 0.0638541728 * b;
  const s1 = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l1 * l1 * l1;
  const m = m1 * m1 * m1;
  const s = s1 * s1 * s1;
  lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return fitsIn(lr) && fitsIn(lg) && fitsIn(lb);
}
const byte = (v: number) => Math.round(clamp01(toEncoded(clamp01(v))) * 255);
/** lchToSrgb(L, fitChroma(L, C, H, false, steps), H) as bytes, 0 to 255, into `out` from `at`, for a picture of
    thousands of colors drawn again at every move of a drag: the same bytes, made faster (linearInto). The fitted
    color is in sRGB by its search, so the second fit lchToSrgb makes changes nothing and is not made. */
export function lchToSrgbBytes(
  L: number,
  C: number,
  H: number,
  steps: number,
  out: Uint8ClampedArray,
  at: number
): void {
  L = clamp01(L);
  C = Math.max(0, C);
  const ca = Math.cos(H * DEG);
  const sa = Math.sin(H * DEG);
  if (!linearInto(L, C * ca, C * sa)) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < steps; i++) {
      const m = (lo + hi) / 2;
      if (linearInto(L, C * m * ca, C * m * sa)) lo = m;
      else hi = m;
    }
    const c = C * lo;
    linearInto(L, c * ca, c * sa);
  }
  out[at] = byte(lr);
  out[at + 1] = byte(lg);
  out[at + 2] = byte(lb);
}
/** OKLCH to Display-P3, fitted to P3 the same way. */
export function lchToP3(L: number, C: number, H: number): Triple {
  L = clamp01(L);
  const c = fitChroma(L, C, H, true);
  return encoded(oklabToLinearP3(L, c * Math.cos(H * DEG), c * Math.sin(H * DEG)));
}
export function srgbToLch(rgb: readonly number[]): Triple {
  const [L, a, b] = srgbToOklab(rgb[0], rgb[1], rgb[2]);
  return [L, Math.hypot(a, b), Math.atan2(b, a) / DEG];
}
/** Display-P3 back to OKLCH, the hue on the wheel. */
export function p3ToLch(p3: readonly number[]): Triple {
  const l = p3.map(toLinear);
  const r = P3_2S[0][0] * l[0] + P3_2S[0][1] * l[1] + P3_2S[0][2] * l[2];
  const g = P3_2S[1][0] * l[0] + P3_2S[1][1] * l[1] + P3_2S[1][2] * l[2];
  const b = P3_2S[2][0] * l[0] + P3_2S[2][1] * l[1] + P3_2S[2][2] * l[2];
  const [L, A, B] = linOklab(r, g, b);
  return [L, Math.hypot(A, B), onWheel(Math.atan2(B, A) / DEG)];
}
export const toCssP3 = (p3: readonly number[]) =>
  `color(display-p3 ${p3.map(v => v.toFixed(4)).join(" ")})`;

export const toHex = (rgb: readonly number[]) =>
  `#${rgb
    .map(v =>
      Math.round(clamp01(v) * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
/** Six hex digits, with or without `#`, as sRGB 0 to 1; null for anything else. */
export function hexToSrgb(hex: string): Triple | null {
  const digits = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())?.[1];
  if (!digits) return null;
  const n = parseInt(digits, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
/** A hex color's bytes, read without a check: for hexes the engine wrote. */
export const hexBytes = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

/** ΔE in OKLab between two OKLCH triples, safe across the hue's turns. */
export function deltaE(p: readonly number[], q: readonly number[]): number {
  return Math.hypot(
    p[0] - q[0],
    p[1] * Math.cos(p[2] * DEG) - q[1] * Math.cos(q[2] * DEG),
    p[1] * Math.sin(p[2] * DEG) - q[1] * Math.sin(q[2] * DEG)
  );
}

/** WCAG 2's relative luminance of an sRGB color, 0 for black to 1 for white. */
export const luminance = (rgb: readonly number[]) =>
  0.2126 * toLinear(rgb[0]) + 0.7152 * toLinear(rgb[1]) + 0.0722 * toLinear(rgb[2]);
/** WCAG 2's contrast of two luminances, 1 to 21. */
export const contrastOf = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** sRGB to CIELAB with the D65 white: the space of the color survey's names and of what a reader cannot tell apart. */
export function srgbToLab(rgb: readonly number[]): Triple {
  const R = toLinear(rgb[0]);
  const G = toLinear(rgb[1]);
  const B = toLinear(rgb[2]);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (v: number) => (v > 216 / 24389 ? Math.cbrt(v) : ((24389 / 27) * v + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
