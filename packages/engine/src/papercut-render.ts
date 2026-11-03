/* Papercut's CPU drawing: what draws its PNG files and link cards, and the reference every other format is measured
   against. It draws as the player does (papercut-gl.ts): the field, its slope and its curvature at every fourth pixel
   each way, one more past each edge, then each pixel's sheets shaded from the four about it mixed bilinearly (the
   field is smooth, so a cut moves under a hundredth of a pixel), plus the same half-level dither, rounded to 8 bits:
   within a level of the field taken at every pixel, at half its cost, about 115 ns a pixel (0.1 s for a 1200 by 630
   card, 0.35 s for 3 megapixels). */
import {
  type PapercutScene,
  papercutDither,
  papercutField,
  papercutFrameAt,
  papercutFrameSize,
  papercutShade
} from "./papercut.ts";

/** Pixels a sample of the field each way, as the player's field pass. */
export const PAPERCUT_QUARTER = 4;

/** The frame at t (seconds of the loop at speed 1), drawn a band of rows at a time from the top: `rows(end)` draws on
    to row `end`, taking the field's samples as its rows come to them, and says whether the frame is done, so a page
    can draw a large one between its other work. `px` holds it: RGBA rows from the top, opaque. The field's samples
    are four numbers each (the field, its slope, its curvature) on a grid whose sample (i, j) lies at the pixel-space
    point ((i - 1) Q + 0.5, (j - 1) Q + 0.5), y down. */
export function papercutRows(
  m: PapercutScene,
  t: number,
  px: Uint8ClampedArray = new Uint8ClampedArray(m.width * m.height * 4)
): { px: Uint8ClampedArray; rows(end: number): boolean } {
  const at = new Float64Array(papercutFrameSize(m));
  papercutFrameAt(m, t, at);
  const lx = at[at.length - 2];
  const ly = at[at.length - 1];
  const Q = PAPERCUT_QUARTER;
  const { width: W, height: H } = m;
  const w = Math.ceil((W - 1) / Q) + 3;
  const h = Math.ceil((H - 1) / Q) + 3;
  const field = new Float64Array(w * h * 4);
  const sample = new Float64Array(4);
  let sampled = 0;
  const sampleTo = (end: number) => {
    for (; sampled < Math.min(end, h); sampled++) {
      const j = sampled;
      const qy = ((j - 1) * Q + 0.5 - H / 2) / m.D;
      for (let i = 0; i < w; i++) {
        papercutField(m, at, ((i - 1) * Q + 0.5 - W / 2) / m.D, qy, sample);
        field.set(sample, (j * w + i) * 4);
      }
    }
  };
  const c = new Float64Array(3);
  const mixed = new Float64Array(4);
  let y = 0;
  let o = 0;
  return {
    px,
    rows(end) {
      for (; y < Math.min(end, H); y++) {
        const ty = y / Q + 1;
        const j = Math.floor(ty);
        const ay = ty - j;
        sampleTo(j + 2);
        for (let x = 0; x < W; x++) {
          const tx = x / Q + 1;
          const i = Math.floor(tx);
          const ax = tx - i;
          const s00 = (j * w + i) * 4;
          const s01 = s00 + w * 4;
          for (let n = 0; n < 4; n++) {
            const top = field[s00 + n] + (field[s00 + 4 + n] - field[s00 + n]) * ax;
            const bottom = field[s01 + n] + (field[s01 + 4 + n] - field[s01 + n]) * ax;
            mixed[n] = top + (bottom - top) * ay;
          }
          papercutShade(m, mixed[0], mixed[1], mixed[2], mixed[3], lx, ly, c);
          const n = papercutDither(x, y);
          px[o] = Math.round((c[0] + n) * 255);
          px[o + 1] = Math.round((c[1] + n) * 255);
          px[o + 2] = Math.round((c[2] + n) * 255);
          px[o + 3] = 255;
          o += 4;
        }
      }
      return y >= H;
    }
  };
}

/** The frame at t (seconds of the loop at speed 1): RGBA rows from the top, opaque. */
export function renderPapercut(
  m: PapercutScene,
  t: number,
  px?: Uint8ClampedArray
): Uint8ClampedArray {
  const frame = papercutRows(m, t, px);
  frame.rows(m.height);
  return frame.px;
}
