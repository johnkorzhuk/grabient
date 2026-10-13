/* A palette's shape, read from the colors it renders: samples along its curve, how light, vivid and warm they are, and
   how its hues relate. The search model takes these as features, and the palette's JSON says its harmony. */
import { srgbToOklab } from "./color.ts";
import { sampleSrgb } from "./curve.ts";
import type { Palette } from "./palette.ts";

/** The curve is smooth: 32 even samples hold what every view of the palette shows. */
export const SAMPLES = 32;
/** Under this chroma a color reads as neutral. */
const CHROMATIC = 0.035;

export interface Sample {
  L: number;
  a: number;
  b: number;
  C: number;
  h: number;
}
export type Harmony =
  | "achromatic"
  | "monochromatic"
  | "analogous"
  | "wide"
  | "rainbow"
  | "complementary"
  | "split-complementary"
  | "two-hue"
  | "triadic"
  | "tetradic"
  | "multi-hue";

/** OKLab and OKLCH along the palette as it renders in sRGB. */
export function samples(P: Palette, n = SAMPLES): Sample[] {
  return Array.from({ length: n }, (_, i) => {
    const [L, a, b] = srgbToOklab(...sampleSrgb(P, n === 1 ? 0.5 : i / (n - 1)));
    let h = (Math.atan2(b, a) * 180) / Math.PI;
    if (h < 0) h += 360;
    return { L, a, b, C: Math.hypot(a, b), h };
  });
}

export interface Structure {
  meanL: number;
  minL: number;
  maxL: number;
  sdL: number;
  meanC: number;
  maxC: number;
  /** 1 when the visible hues agree, 0 when they cancel out */
  hueR: number;
  /** chroma-weighted share of each 30° hue sector, the first centered on 0 */
  hueHist: number[];
  neutralFrac: number;
  warmFrac: number;
  coolFrac: number;
  darkFrac: number;
  lightFrac: number;
  vividFrac: number;
  harmony: Harmony;
}

export function structure(S: readonly Sample[]): Structure {
  const n = S.length;
  const mean = (f: (s: Sample) => number) => S.reduce((sum, s) => sum + f(s), 0) / n;
  const share = (f: (s: Sample) => boolean) => S.filter(f).length / n;
  const meanL = mean(s => s.L);
  let sx = 0;
  let sy = 0;
  let sw = 0;
  for (const s of S) {
    const w = Math.max(0, s.C - 0.01);
    sx += w * Math.cos((s.h * Math.PI) / 180);
    sy += w * Math.sin((s.h * Math.PI) / 180);
    sw += w;
  }
  const bins = new Float64Array(12);
  for (const s of S) if (s.C >= CHROMATIC) bins[Math.floor(((s.h + 15) % 360) / 30)] += s.C;
  const binSum = bins.reduce((a, b) => a + b, 0) || 1;
  const hueHist = Array.from(bins, v => v / binSum);
  /* OKLCH hues: red 29, orange 55, yellow 100, green 145, cyan 195, blue 260, purple 305 */
  const warm = (h: number) => h < 115 || h >= 335;
  const neutralFrac = share(s => s.C < CHROMATIC);
  const Ls = S.map(s => s.L);
  return {
    meanL,
    minL: Math.min(...Ls),
    maxL: Math.max(...Ls),
    sdL: Math.sqrt(mean(s => (s.L - meanL) ** 2)),
    meanC: mean(s => s.C),
    maxC: Math.max(...S.map(s => s.C)),
    hueR: sw > 0 ? Math.hypot(sx, sy) / sw : 0,
    hueHist,
    neutralFrac,
    warmFrac: share(s => s.C >= CHROMATIC && warm(s.h)),
    coolFrac: share(s => s.C >= CHROMATIC && !warm(s.h)),
    darkFrac: share(s => s.L < 0.3),
    lightFrac: share(s => s.L > 0.8),
    vividFrac: share(s => s.C > 0.17),
    harmony: harmonyOf(hueHist, neutralFrac)
  };
}

/** The color relationship, from which hue sectors are occupied and how the runs of them sit on the circle. Coarse on
    purpose: a filter for searches that name a relationship. */
export function harmonyOf(hueHist: readonly number[], neutralFrac: number): Harmony {
  if (neutralFrac > 0.9) return "achromatic";
  const on = hueHist.map(v => v > 0.08);
  const start = on.findIndex((v, i) => v && !on[(i + 11) % 12]);
  if (start < 0) return on[0] ? "rainbow" : "achromatic";
  const runs: { start: number; end: number; len: number }[] = [];
  for (let k = 0, i = start; k < 12; k++, i = (i + 1) % 12) {
    if (!on[i]) continue;
    const last = runs[runs.length - 1];
    if (last && last.end === (i + 11) % 12) {
      last.end = i;
      last.len++;
    } else runs.push({ start: i, end: i, len: 1 });
  }
  const center = (r: { start: number; len: number }) => ((r.start + (r.len - 1) / 2) * 30) % 360;
  const gap = (a: (typeof runs)[number], b: (typeof runs)[number]) => {
    const d = Math.abs(center(a) - center(b)) % 360;
    return Math.min(d, 360 - d);
  };
  if (runs.length === 1) {
    const len = runs[0].len;
    return len <= 1 ? "monochromatic" : len <= 3 ? "analogous" : len <= 7 ? "wide" : "rainbow";
  }
  if (runs.length === 2) {
    const g = gap(runs[0], runs[1]);
    const tight = runs[0].len <= 3 && runs[1].len <= 3;
    return g >= 150 && tight
      ? "complementary"
      : g >= 120 && tight
        ? "split-complementary"
        : "two-hue";
  }
  if (runs.length === 3) {
    return [gap(runs[0], runs[1]), gap(runs[1], runs[2]), gap(runs[0], runs[2])].every(g => g >= 90)
      ? "triadic"
      : "multi-hue";
  }
  return runs.length === 4 ? "tetradic" : "multi-hue";
}
