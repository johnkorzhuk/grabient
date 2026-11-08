/* A field effect's CPU drawing: what draws its PNG files and link cards, and the reference every other format is
   measured against. The field is read once at each pixel's middle, on a grid a pixel wider and taller than the box, so
   a pixel's change to its right and below (shade.ts's g) are two subtractions, the same numbers a shader reads by
   reading the field there itself; the shadow's and the rim's points are read where the effect has them. Each pixel is
   then kitShade's, taken to bytes as every format takes them (kitByte). */
import type { KitScene } from "./scene.ts";
import { kitByte, kitFrameAt, kitTurnX, kitTurnY } from "./scene.ts";
import { kitScratch, kitShade } from "./shade.ts";
import { kitFrameSize } from "./types.ts";

/** The frame at t (seconds of the loop at speed 1): RGBA rows from the top, opaque. */
export function kitRender(
  m: KitScene,
  t: number,
  px: Uint8ClampedArray = new Uint8ClampedArray(m.width * m.height * 4)
): Uint8ClampedArray {
  const def = m.def;
  const at = new Float64Array(kitFrameSize(def));
  kitFrameAt(m, t, at);
  const F = at.subarray(0, def.tracks);
  const sx = at[def.tracks];
  const sy = at[def.tracks + 1];
  const rx = at[def.tracks + 2];
  const ry = at[def.tracks + 3];
  const shadow = !!def.sheets?.shadow;
  const rim = !!def.sheets?.rim;
  const { width: W, height: H, D, U } = m;
  const field = def.field;
  const W1 = W + 1;
  const grid = new Float64Array(W1 * (H + 1));
  for (let y = 0; y <= H; y++) {
    const qy = (y + 0.5 - H / 2) / D;
    for (let x = 0; x <= W; x++) {
      const qx = (x + 0.5 - W / 2) / D;
      grid[y * W1 + x] = field(kitTurnX(m, qx, qy), kitTurnY(m, qx, qy), U, F);
    }
  }
  const c = kitScratch();
  const out = kitScratch();
  for (let y = 0; y < H; y++) {
    const qy = (y + 0.5 - H / 2) / D;
    for (let x = 0; x < W; x++) {
      const qx = (x + 0.5 - W / 2) / D;
      const f = grid[y * W1 + x];
      const gx = grid[y * W1 + x + 1] - f;
      const gy = grid[(y + 1) * W1 + x] - f;
      const g = Math.max(1e-9, Math.sqrt(gx * gx + gy * gy));
      const fs = shadow
        ? field(kitTurnX(m, qx - sx, qy - sy), kitTurnY(m, qx - sx, qy - sy), U, F)
        : f;
      const fr = rim
        ? field(kitTurnX(m, qx - rx, qy - ry), kitTurnY(m, qx - rx, qy - ry), U, F)
        : f;
      kitShade(m, f, g, fs, fr, c, out);
      const i = 4 * (y * W + x);
      px[i] = kitByte(out[0]);
      px[i + 1] = kitByte(out[1]);
      px[i + 2] = kitByte(out[2]);
      px[i + 3] = 255;
    }
  }
  return px;
}
