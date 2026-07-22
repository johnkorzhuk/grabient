// RGB channel curves — SSR'd SVG (curves only, stretchable) + CSS-positioned
// HTML for grid/labels/dots/crosshair, matching the current site's GraphBG
// approach (DOM overlay so nothing distorts when the panel resizes).
// Colors are the dataviz-validated --chart-* tokens; hover handled in the nav
// layer from the embedded sample JSON.
import type { CosineCoeffs } from "@repo/data-ops/gradient-gen/cosine";

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );

const CURVE_SAMPLES = 64;
const CHANNELS = [
  { idx: 0, label: "Red", color: "var(--chart-red)" },
  { idx: 1, label: "Green", color: "var(--chart-green)" },
  { idx: 2, label: "Blue", color: "var(--chart-blue)" },
] as const;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function channelValue(coeffs: CosineCoeffs, ch: number, t: number): number {
  const a = coeffs[0]?.[ch] ?? 0;
  const b = coeffs[1]?.[ch] ?? 0;
  const c = coeffs[2]?.[ch] ?? 0;
  const d = coeffs[3]?.[ch] ?? 0;
  return clamp01(a + b * Math.cos(Math.PI * 2 * (c * t + d)));
}

export interface GraphSample {
  t: number;
  hex: string;
  rgb: [number, number, number];
}

export function channelsGraphSvg(
  appliedCoeffs: CosineCoeffs,
  steps: number,
  hexColors: string[],
): string {
  // Curves in a 0..100 stretched space; strokes stay 2px via non-scaling-stroke.
  const paths = CHANNELS.map(({ idx, color }) => {
    let d = "";
    for (let i = 0; i <= CURVE_SAMPLES; i++) {
      const t = i / CURVE_SAMPLES;
      d += `${i === 0 ? "M" : "L"}${(t * 100).toFixed(2)} ${((1 - channelValue(appliedCoeffs, idx, t)) * 100).toFixed(2)}`;
    }
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>`;
  }).join("");

  // One hover dot per channel: hidden at rest, snapped to the hovered step by
  // the nav layer (order matters — index maps to the sample's rgb tuple).
  const dots = CHANNELS.map(
    ({ color }) =>
      `<span class="graph-dot pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background opacity-0 transition-opacity duration-100" style="background:${color}" aria-hidden="true"></span>`,
  ).join("");

  const grid = [1, 0.8, 0.6, 0.4, 0.2, 0]
    .map(
      (v) =>
        `<div class="graph-gridline absolute inset-x-0" style="top:${((1 - v) * 100).toFixed(1)}%" aria-hidden="true"></div>`,
    )
    .join("");

  const yLabels = [1, 0.8, 0.6, 0.4, 0.2, 0]
    .map(
      (v) =>
        `<span class="absolute right-0 -translate-y-1/2 rounded-sm border border-border bg-background/40 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground backdrop-blur-sm" style="top:${((1 - v) * 100).toFixed(1)}%">${v === 0 || v === 1 ? v : v.toFixed(1)}</span>`,
    )
    .join("");

  const samples: GraphSample[] = [];
  for (let i = 0; i < steps; i++) {
    const t = steps > 1 ? i / (steps - 1) : 0;
    samples.push({
      t,
      hex: hexColors[i] ?? "#000000",
      rgb: [
        Math.round(channelValue(appliedCoeffs, 0, t) * 255),
        Math.round(channelValue(appliedCoeffs, 1, t) * 255),
        Math.round(channelValue(appliedCoeffs, 2, t) * 255),
      ],
    });
  }

  return `<figure class="relative m-0 h-full min-h-[150px]" role="img" aria-label="RGB channel curves. X axis is color position t from 0 to 1, Y axis is channel value from 0 to 1." data-samples="${esc(JSON.stringify(samples))}">
<div class="graph-plot absolute inset-x-0 inset-y-3 cursor-crosshair touch-pan-y">
${grid}
<svg class="block h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${paths}</svg>
${dots}
<div class="graph-crosshair pointer-events-none absolute inset-y-0 w-px bg-muted-foreground opacity-0 transition-opacity duration-100" aria-hidden="true"></div>
</div>
<div class="pointer-events-none absolute inset-y-3 right-1 z-10" aria-hidden="true">${yLabels}</div>
<div class="graph-tip pointer-events-none absolute z-20 hidden rounded-lg border border-input bg-background/90 p-2.5 shadow-lg backdrop-blur-md"></div>
</figure>`;
}
