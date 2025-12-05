import { deserializeCoeffs } from "@repo/data-ops/serialization";
import {
  cosineGradient,
  rgbToHex,
  applyGlobals,
} from "@repo/data-ops/gradient-gen";

export interface ColorData {
  hex: string[];
  rgb: [number, number, number][];
  hsl: [number, number, number][];
  lch: [number, number, number][];
}

/**
 * Convert RGB (0-255) to HSL
 */
function rgbToHsl(
  r: number,
  g: number,
  b: number
): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

/**
 * Convert RGB (0-255) to LCH via Lab
 */
function rgbToLch(
  r: number,
  g: number,
  b: number
): [number, number, number] {
  // RGB to XYZ (sRGB with D65 illuminant)
  let rLinear = r / 255;
  let gLinear = g / 255;
  let bLinear = b / 255;

  // Apply gamma correction
  rLinear =
    rLinear > 0.04045
      ? Math.pow((rLinear + 0.055) / 1.055, 2.4)
      : rLinear / 12.92;
  gLinear =
    gLinear > 0.04045
      ? Math.pow((gLinear + 0.055) / 1.055, 2.4)
      : gLinear / 12.92;
  bLinear =
    bLinear > 0.04045
      ? Math.pow((bLinear + 0.055) / 1.055, 2.4)
      : bLinear / 12.92;

  rLinear *= 100;
  gLinear *= 100;
  bLinear *= 100;

  // XYZ conversion matrix for sRGB
  const x = rLinear * 0.4124564 + gLinear * 0.3575761 + bLinear * 0.1804375;
  const y = rLinear * 0.2126729 + gLinear * 0.7151522 + bLinear * 0.072175;
  const z = rLinear * 0.0193339 + gLinear * 0.119192 + bLinear * 0.9503041;

  // XYZ to Lab (D65 reference white)
  const refX = 95.047;
  const refY = 100.0;
  const refZ = 108.883;

  let xr = x / refX;
  let yr = y / refY;
  let zr = z / refZ;

  const epsilon = 0.008856;
  const kappa = 903.3;

  xr = xr > epsilon ? Math.pow(xr, 1 / 3) : (kappa * xr + 16) / 116;
  yr = yr > epsilon ? Math.pow(yr, 1 / 3) : (kappa * yr + 16) / 116;
  zr = zr > epsilon ? Math.pow(zr, 1 / 3) : (kappa * zr + 16) / 116;

  const labL = 116 * yr - 16;
  const labA = 500 * (xr - yr);
  const labB = 200 * (yr - zr);

  // Lab to LCH
  const lchC = Math.sqrt(labA * labA + labB * labB);
  let lchH = (Math.atan2(labB, labA) * 180) / Math.PI;
  if (lchH < 0) lchH += 360;

  return [Math.round(labL), Math.round(lchC), Math.round(lchH)];
}

/**
 * Generate color data from a palette seed
 */
export function generateColorDataFromSeed(seed: string, steps = 11): ColorData {
  const { coeffs, globals } = deserializeCoeffs(seed);
  const appliedCoeffs = applyGlobals(coeffs, globals);
  const rgbColors = cosineGradient(steps, appliedCoeffs);

  const hex: string[] = [];
  const rgb: [number, number, number][] = [];
  const hsl: [number, number, number][] = [];
  const lch: [number, number, number][] = [];

  for (const color of rgbColors) {
    const [r, g, b] = color;
    // Convert 0-1 range to 0-255 for RGB
    const r255 = Math.round(r * 255);
    const g255 = Math.round(g * 255);
    const b255 = Math.round(b * 255);

    hex.push(rgbToHex(r, g, b));
    rgb.push([r255, g255, b255]);
    hsl.push(rgbToHsl(r255, g255, b255));
    lch.push(rgbToLch(r255, g255, b255));
  }

  return { hex, rgb, hsl, lch };
}
