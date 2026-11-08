/* The strings' CPU drawing: what draws its PNG files and link cards, and the reference every other format is measured
   against. Each pixel is the ground under the two threads nearest it (strings.ts stringsShade), as the player's shader
   does it, rounded to 8 bits, straight alpha: opaque on a whole ground, the ground's alpha where a translucent or clear
   one lets the page through (each channel the premultiplied shading's over its alpha, which a whole ground's alpha of
   1 leaves as it is, to the bit). The blob's field is sampled first at every fourth pixel's corner each way, and a
   cell of four by four pixels lying past the blob's farthest end even at its corner most within it is the ground
   alone, which each of its pixels would have been: about half the pixels of a wide picture, drawn for nothing. */
import {
  STRINGS_FRAME_SIZE,
  type StringsScene,
  stringsBlob,
  stringsFrameAt,
  stringsScratch,
  stringsShade,
  stringsWarp
} from "./strings.ts";

/** Pixels a cell of the blob's samples is each way. */
export const STRINGS_CELL = 4;

/** The frame at t (seconds of the loop at speed 1): RGBA rows from the top, straight alpha, opaque on a whole ground. */
export function renderStrings(
  m: StringsScene,
  t: number,
  px: Uint8ClampedArray = new Uint8ClampedArray(m.width * m.height * 4)
): Uint8ClampedArray {
  const at = new Float64Array(STRINGS_FRAME_SIZE);
  stringsFrameAt(m, t, at);
  const { width: W, height: H, D } = m;
  const s = stringsScratch();
  const c = new Float64Array(4);
  const Q = STRINGS_CELL;
  const cw = Math.ceil(W / Q);
  const ch = Math.ceil(H / Q);
  /* the blob at each cell's corners, and its slope a px */
  const blob = new Float64Array((cw + 1) * (ch + 1));
  const blobSlope = new Float64Array((cw + 1) * (ch + 1));
  for (let j = 0; j <= ch; j++)
    for (let i = 0; i <= cw; i++) {
      const qx = (i * Q - W / 2) / D;
      const qy = (j * Q - H / 2) / D;
      stringsWarp(m, at, qx, qy, s.o);
      stringsBlob(m, at, qx, qy, s.o, s.b);
      blob[j * (cw + 1) + i] = s.b[0];
      blobSlope[j * (cw + 1) + i] = Math.sqrt(s.b[1] * s.b[1] + s.b[2] * s.b[2]) / D;
    }
  /* no thread ends past this on the blob's field, and a pixel's end shades a half pixel past it */
  const farthest = -m.stagger / 2;
  /* the ground alone, straight: none of its color where it is wholly clear */
  const ga = Math.round(m.alpha * 255);
  const g0 = ga ? Math.round(m.ground[0] * 255) : 0;
  const g1 = ga ? Math.round(m.ground[1] * 255) : 0;
  const g2 = ga ? Math.round(m.ground[2] * 255) : 0;
  for (let cj = 0; cj < ch; cj++)
    for (let ci = 0; ci < cw; ci++) {
      const o = cj * (cw + 1) + ci;
      const near = Math.max(blob[o], blob[o + 1], blob[o + cw + 1], blob[o + cw + 2]);
      const steep = Math.max(
        blobSlope[o],
        blobSlope[o + 1],
        blobSlope[o + cw + 1],
        blobSlope[o + cw + 2]
      );
      const plain = near + (Q + 0.5) * steep < farthest;
      for (let y = cj * Q; y < Math.min(H, cj * Q + Q); y++) {
        const qy = (y + 0.5 - H / 2) / D;
        for (let x = ci * Q; x < Math.min(W, ci * Q + Q); x++) {
          const i = 4 * (y * W + x);
          if (plain) {
            px[i] = g0;
            px[i + 1] = g1;
            px[i + 2] = g2;
            px[i + 3] = ga;
            continue;
          }
          stringsShade(m, at, (x + 0.5 - W / 2) / D, qy, s, c);
          const a = c[3];
          px[i + 3] = Math.round(a * 255);
          if (a > 0) {
            px[i] = Math.round((c[0] / a) * 255);
            px[i + 1] = Math.round((c[1] / a) * 255);
            px[i + 2] = Math.round((c[2] / a) * 255);
          } else px[i] = px[i + 1] = px[i + 2] = 0;
        }
      }
    }
  return px;
}
