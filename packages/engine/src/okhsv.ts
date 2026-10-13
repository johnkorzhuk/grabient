/* Okhsv, Björn Ottosson's picker space over OKLab (see NOTICE): saturation and value on a square as a color picker
   draws it, white at its top start, black along its foot and sRGB's most colorful color of the hue at its top end. Its
   hue is OKLCH's own, in degrees. */
import { oklabToLinear, srgbToOklab, type Triple, toEncoded } from "./color.ts";
import { clamp01, DEG, onWheel } from "./math.ts";

const K1 = 0.206;
const K2 = 0.03;
const K3 = (1 + K1) / (1 + K2);
const toe = (x: number) => 0.5 * (K3 * x - K1 + Math.sqrt((K3 * x - K1) ** 2 + 4 * K2 * K3 * x));
const toeInv = (x: number) => (x * x + K1 * x) / (K3 * (x + K2));

/** The most saturation (C / L) sRGB holds at the hue whose unit direction in OKLab is (a, b): a polynomial for the
    channel that leaves the cube first, then one step of Halley's method. */
function maxSaturation(a: number, b: number): number {
  const [k0, k1, k2, k3, k4, wl, wm, ws] =
    -1.88170328 * a - 0.80936493 * b > 1
      ? [
          1.19086277, 1.76576728, 0.59662641, 0.75515197, 0.56771245, 4.0767416621, -3.3077115913,
          0.2309699292
        ]
      : 1.81444104 * a - 1.19445276 * b > 1
        ? [
            0.73956515, -0.45954404, 0.08285427, 0.1254107, 0.14503204, -1.2684380046, 2.6097574011,
            -0.3413193965
          ]
        : [
            1.35733652, -0.00915799, -1.1513021, -0.50559606, 0.00692167, -0.0041960863,
            -0.7034186147, 1.707614701
          ];
  const S = k0 + k1 * a + k2 * b + k3 * a * a + k4 * a * b;
  const kl = 0.3963377774 * a + 0.2158037573 * b;
  const km = -0.1055613458 * a - 0.0638541728 * b;
  const ks = -0.0894841775 * a - 1.291485548 * b;
  const l_ = 1 + S * kl;
  const m_ = 1 + S * km;
  const s_ = 1 + S * ks;
  const f = wl * l_ ** 3 + wm * m_ ** 3 + ws * s_ ** 3;
  const f1 = 3 * (wl * kl * l_ * l_ + wm * km * m_ * m_ + ws * ks * s_ * s_);
  const f2 = 6 * (wl * kl * kl * l_ + wm * km * km * m_ + ws * ks * ks * s_);
  return S - (f * f1) / (f1 * f1 - 0.5 * f * f2);
}
/** How the square stands on sRGB's most colorful color at a hue (the cusp). */
function frame(a: number, b: number) {
  const S = maxSaturation(a, b);
  const at = oklabToLinear(1, S * a, S * b);
  const L = Math.cbrt(1 / Math.max(at[0], at[1], at[2]));
  const C = L * S;
  const S0 = 0.5;
  return { T: C / (1 - L), S0, k: 1 - S0 / (C / L) };
}
/** How far a color on the square's value line is scaled to reach the cube's edge. */
function scaleAt(a: number, b: number, Lv: number, Cv: number) {
  const Lvt = toeInv(Lv);
  const Cvt = (Cv * Lvt) / Lv;
  const rgb = oklabToLinear(Lvt, a * Cvt, b * Cvt);
  return Math.cbrt(1 / Math.max(rgb[0], rgb[1], rgb[2], 0));
}
const valueLine = (s: number, T: number, S0: number, k: number) => ({
  Lv: 1 - (s * S0) / (S0 + T - T * k * s),
  Cv: (s * T * S0) / (S0 + T - T * k * s)
});

/** Okhsv (hue in degrees, saturation and value 0 to 1) to sRGB 0 to 1. */
export function okhsvToSrgb(hDeg: number, s: number, v: number): Triple {
  s = clamp01(s);
  v = clamp01(v);
  if (v <= 0) return [0, 0, 0];
  const a = Math.cos(hDeg * DEG);
  const b = Math.sin(hDeg * DEG);
  const { T, S0, k } = frame(a, b);
  const { Lv, Cv } = valueLine(s, T, S0, k);
  let L = v * Lv;
  let C = v * Cv;
  const Ln = toeInv(L);
  C = (C * Ln) / L;
  L = Ln;
  const scale = scaleAt(a, b, Lv, Cv);
  const rgb = oklabToLinear(L * scale, C * scale * a, C * scale * b);
  return [
    clamp01(toEncoded(clamp01(rgb[0]))),
    clamp01(toEncoded(clamp01(rgb[1]))),
    clamp01(toEncoded(clamp01(rgb[2])))
  ];
}
/** The square at one hue into RGBA bytes, `cols` across (saturation 0 to 1) and `rows` down (value 1 to 0): the colors
    of `okhsvToSrgb` with the hue's frame and each column's saturation worked out once, so a picker repaints its field
    within a frame while its hue is dragged. */
export function okhsvPaint(hDeg: number, cols: number, rows: number, out: Uint8ClampedArray): void {
  const a = Math.cos(hDeg * DEG);
  const b = Math.sin(hDeg * DEG);
  const { T, S0, k } = frame(a, b);
  for (let x = 0; x < cols; x++) {
    const { Lv, Cv } = valueLine(cols > 1 ? x / (cols - 1) : 0, T, S0, k);
    const scale = scaleAt(a, b, Lv, Cv);
    for (let y = 0; y < rows; y++) {
      const at = (y * cols + x) * 4;
      const v = rows > 1 ? 1 - y / (rows - 1) : 1;
      out[at + 3] = 255;
      if (v <= 0) {
        out[at] = out[at + 1] = out[at + 2] = 0;
        continue;
      }
      const L0 = v * Lv;
      const Ln = toeInv(L0);
      const C = ((v * Cv * Ln) / L0) * scale;
      const rgb = oklabToLinear(Ln * scale, C * a, C * b);
      /* the bytes round as they are written */
      out[at] = toEncoded(clamp01(rgb[0])) * 255;
      out[at + 1] = toEncoded(clamp01(rgb[1])) * 255;
      out[at + 2] = toEncoded(clamp01(rgb[2])) * 255;
    }
  }
}
/** sRGB 0 to 1 to Okhsv. A gray has no hue and black no saturation either: they read 0, and a picker keeps its own. */
export function srgbToOkhsv(rgb: readonly number[]): Triple {
  const [L0, A, B] = srgbToOklab(rgb[0], rgb[1], rgb[2]);
  const C0 = Math.hypot(A, B);
  if (L0 <= 1e-7) return [0, 0, 0];
  const h = onWheel(Math.atan2(B, A) / DEG);
  if (C0 < 1e-7) return [0, 0, clamp01(toe(L0))];
  const a = A / C0;
  const b = B / C0;
  const { T, S0, k } = frame(a, b);
  const t = T / (C0 + L0 * T);
  const Lv = t * L0;
  const Cv = t * C0;
  const L = L0 / scaleAt(a, b, Lv, Cv);
  return [h, clamp01(((S0 + T) * Cv) / (T * S0 + T * k * Cv)), clamp01(toe(L) / Lv)];
}
