/* What the conformance suite draws an SVG with and how it measures two frames apart: resvg (a renderer of SVG alone,
   in WebAssembly, the same everywhere), and OKLab differences in hundredths, a pixel's own and its 3 by 3
   neighbourhood's mean, so an edge drawn a hair aside by another rasterizer counts for little and a shape out of place
   for much. */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { srgbToOklab } from "../src/color.ts";

let ready: Promise<void> | null = null;
/** resvg's module, loaded once. */
export const resvgReady = (): Promise<void> => {
  ready ??= initWasm(
    readFileSync(createRequire(import.meta.url).resolve("@resvg/resvg-wasm/index_bg.wasm"))
  );
  return ready;
};

/** An SVG drawn `width` pixels wide (its height as its viewBox has it), RGBA. */
export function rasterize(svg: string, width: number): Uint8Array {
  const out = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { loadSystemFonts: false }
  }).render().pixels;
  return new Uint8Array(out);
}

export interface FrameDiff {
  /** the mean OKLab difference, in hundredths */
  mean: number;
  /** the 99th percentile of the 3 by 3 neighbourhoods' mean colors' difference, in hundredths */
  p99: number;
  /** the share of neighbourhoods more than 10 hundredths apart */
  far: number;
}

/** How far two frames of `width` by `height` pixels, RGBA or RGB, are apart. */
export function frameDiff(
  a: Uint8Array | Uint8ClampedArray,
  b: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number
): FrameDiff {
  const n = width * height;
  const lab = (p: Uint8Array | Uint8ClampedArray) => {
    const step = p.length / n;
    const out = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) {
      const [L, A, B] = srgbToOklab(
        p[i * step] / 255,
        p[i * step + 1] / 255,
        p[i * step + 2] / 255
      );
      out.set([L, A, B], i * 3);
    }
    return out;
  };
  const la = lab(a);
  const lb = lab(b);
  let sum = 0;
  for (let i = 0; i < n; i++)
    sum += Math.hypot(
      la[3 * i] - lb[3 * i],
      la[3 * i + 1] - lb[3 * i + 1],
      la[3 * i + 2] - lb[3 * i + 2]
    );
  const near: number[] = [];
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      let d0 = 0;
      let d1 = 0;
      let d2 = 0;
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++) {
          const o = 3 * ((y + j) * width + x + i);
          d0 += la[o] - lb[o];
          d1 += la[o + 1] - lb[o + 1];
          d2 += la[o + 2] - lb[o + 2];
        }
      near.push((Math.hypot(d0, d1, d2) / 9) * 100);
    }
  near.sort((x, y) => x - y);
  return {
    mean: (sum / n) * 100,
    p99: near[Math.floor(near.length * 0.99)] ?? 0,
    far: near.filter(v => v > 10).length / Math.max(1, near.length)
  };
}
