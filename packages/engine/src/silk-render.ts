/* Silk lite's CPU drawing: the reference every other format is measured against, and what draws its PNG files, link
   cards and video frames. Each pixel is the dye at its place along the gradient line, laid under the valleys' shade
   and the crests' lift by the folds' profiles there, as the SVG's masks lay them. */
import { centresAt, LUT_N, profileAt, type SilkScene } from "./silk.ts";

/** The frame at t: RGBA rows from the top. Pixel centres at (x + 1/2, y + 1/2). */
export function renderSilk(scene: SilkScene, t: number): Uint8ClampedArray {
  const { W, H } = scene;
  const out = new Uint8ClampedArray(W * H * 4);
  const n = scene.folds.length;
  const C = new Float64Array(2 * n);
  centresAt(scene, t, C);
  const R = scene.folds.map(f => f.R);
  const iw = scene.folds.map(f => 1 / f.w);
  const vt = scene.valley.table;
  const ct = scene.crest.table;
  const { baseB, liftB, shadeB } = scene.dye;
  const ux = scene.x2 - scene.x1;
  const uy = scene.y2 - scene.y1;
  const ul = 1 / (ux * ux + uy * uy);
  for (let y = 0; y < H; y++) {
    const py = y + 0.5;
    for (let x = 0; x < W; x++) {
      const px = x + 0.5;
      /* the masks: every ring's profiles, joined as layers are */
      let tv = 1;
      let tc = 1;
      for (let i = 0; i < n; i++) {
        const ddx = px - C[2 * i];
        const ddy = py - C[2 * i + 1];
        const xb = (Math.sqrt(ddx * ddx + ddy * ddy) - R[i]) * iw[i];
        if (xb <= -1 || xb >= 1) continue;
        tv *= 1 - profileAt(vt, xb);
        tc *= 1 - profileAt(ct, xb);
      }
      const V = 1 - tv;
      const Cm = 1 - tc;
      /* the dye at the pixel's place along the gradient line */
      let u = ((px - scene.x1) * ux + (py - scene.y1) * uy) * ul;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const g = u * (LUT_N - 1);
      const i0 = Math.min(LUT_N - 2, Math.floor(g));
      const fr = g - i0;
      const o = 4 * (y * W + x);
      for (let ch = 0; ch < 3; ch++) {
        const a0 = 3 * i0 + ch;
        const b = baseB[a0] + (baseB[a0 + 3] - baseB[a0]) * fr;
        const s = shadeB[a0] + (shadeB[a0 + 3] - shadeB[a0]) * fr;
        const l = liftB[a0] + (liftB[a0 + 3] - liftB[a0]) * fr;
        const m = b + (s - b) * V;
        out[o + ch] = Math.round(m + (l - m) * Cm);
      }
      out[o + 3] = 255;
    }
  }
  return out;
}
