/* The aurora's CPU drawing: what draws its PNG files and link cards, and the reference every other format is measured
   against. Each pixel is the light at its middle (aurora.ts auroraLight) with the range in front (auroraRange), as
   the player's shader does it, rounded to 8 bits, straight alpha: opaque over the range's edge and on a range of a
   whole color, the range's cover under its edge where it lets the page through, none of its color where it is wholly
   clear. A pixel the range covers whole is the range alone, so the light under it is never worked out: four pixels
   in ten of the picture as designed. */
import { type AuroraScene, auroraLight, auroraPoint, auroraRange, auroraTime } from "./aurora.ts";

/** The frame at t (seconds of the loop at speed 1): RGBA rows from the top, straight alpha. */
export function renderAurora(
  m: AuroraScene,
  t: number,
  px: Uint8ClampedArray = new Uint8ClampedArray(m.width * m.height * 4)
): Uint8ClampedArray {
  const T = auroraTime(t);
  const { width: W, height: H, range, cover } = m;
  const at = new Float64Array(2);
  const c = new Float64Array(3);
  /* the range alone, straight: none of its color where it is wholly clear */
  const ra = Math.floor(cover * 255 + 0.5);
  const r0 = ra ? Math.floor(range[0] * 255 + 0.5) : 0;
  const r1 = ra ? Math.floor(range[1] * 255 + 0.5) : 0;
  const r2 = ra ? Math.floor(range[2] * 255 + 0.5) : 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = 4 * (y * W + x);
      auroraPoint(m, x + 0.5, y + 0.5, at);
      const X = at[0];
      const Y = at[1];
      auroraRange(m, X, Y, at);
      const show = at[0];
      if (show <= 0) {
        px[i] = r0;
        px[i + 1] = r1;
        px[i + 2] = r2;
        px[i + 3] = ra;
        continue;
      }
      auroraLight(m, T, X, Y, at[1], c);
      /* the range in front, its edge soft: as much of its color as its ground covers, the picture clear for the
         rest */
      const cov = 1 - show;
      const alpha = 1 - cov + cover * cov;
      const a = Math.floor(alpha * 255 + 0.5);
      px[i + 3] = a;
      if (a > 0) {
        px[i] = Math.floor(((c[0] * (1 - cov) + range[0] * cover * cov) / alpha) * 255 + 0.5);
        px[i + 1] = Math.floor(((c[1] * (1 - cov) + range[1] * cover * cov) / alpha) * 255 + 0.5);
        px[i + 2] = Math.floor(((c[2] * (1 - cov) + range[2] * cover * cov) / alpha) * 255 + 0.5);
      } else px[i] = px[i + 1] = px[i + 2] = 0;
    }
  return px;
}
