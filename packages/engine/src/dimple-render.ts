/* The dimple's CPU drawing: what draws its PNG files and link cards, and the reference every other form is measured
   against. The ground first, a gradient about the hollow, then every disc in the stack's order, the bottom one first:
   a circle a pixel's edge soft (a box filter: its cover is its radius less the pixel's distance from its middle,
   plus a half), filled with the palette along its line toward the hollow. A pixel under no disc's edge is one disc's
   color written over the ground's, so the picture is the shader's, which finds each pixel's discs instead
   (dimple.ts dimpleShade: dimple.test.ts holds the two together), at some 50 ns a pixel where that takes 1,200: a card
   of 1200 by 630 in 38 ms and the largest picture, 3 million pixels, in 136 (10 Nov 2026). It is drawn a band of rows
   at a time, so a large picture's colors, kept whole until every disc over them is laid, take a band's memory.
   Opaque. */
import {
  DIMPLE_LOOK,
  DIMPLE_STOPS,
  type DimpleAt,
  type DimpleDisc,
  type DimpleScene,
  dimpleDisc,
  dimpleDiscBlank,
  dimpleGround,
  dimpleGroundAt,
  dimpleHollow
} from "./dimple.ts";

/** Rows drawn at a time. */
const BAND = 64;

/** The picture with the hollow at `at` (its rest where none is said): RGBA rows from the top, opaque. */
export function renderDimple(
  m: DimpleScene,
  at: DimpleAt = null,
  px: Uint8ClampedArray = new Uint8ClampedArray(m.width * m.height * 4)
): Uint8ClampedArray {
  const [cx, cy] = dimpleHollow(m, at);
  const ground = dimpleGround(m, cx, cy);
  const { width: W, height: H, r, stops } = m;
  const count = m.places.length / 2;
  const discs: DimpleDisc[] = [];
  for (let n = 0; n < count; n++)
    discs.push(dimpleDisc(m, m.places[n * 2], m.places[n * 2 + 1], cx, cy, dimpleDiscBlank()));
  /* a disc's edge is half a pixel wide past its radius */
  const edge = r + 0.5;
  const run = DIMPLE_LOOK.run;
  const last = DIMPLE_STOPS - 1;
  const band = new Float64Array(W * BAND * 3);
  const c = [0, 0, 0];
  for (let y0 = 0; y0 < H; y0 += BAND) {
    const y1 = Math.min(H, y0 + BAND);
    for (let y = y0; y < y1; y++) {
      const qy = y + 0.5 - cy;
      for (let x = 0; x < W; x++) {
        const qx = x + 0.5 - cx;
        dimpleGroundAt(ground, Math.sqrt(qx * qx + qy * qy), c);
        const o = ((y - y0) * W + x) * 3;
        band[o] = c[0];
        band[o + 1] = c[1];
        band[o + 2] = c[2];
      }
    }
    for (const disc of discs) {
      /* the rows whose pixels' middles lie within its edge */
      const ya = Math.max(y0, Math.ceil(disc.y - edge - 0.5));
      const yb = Math.min(y1 - 1, Math.floor(disc.y + edge - 0.5));
      if (ya > yb) continue;
      const reach = run * disc.k;
      for (let y = ya; y <= yb; y++) {
        const ey = y + 0.5 - disc.y;
        const half = Math.sqrt(Math.max(0, edge * edge - ey * ey));
        const xa = Math.max(0, Math.ceil(disc.x - half - 0.5));
        const xb = Math.min(W - 1, Math.floor(disc.x + half - 0.5));
        for (let x = xa; x <= xb; x++) {
          const ex = x + 0.5 - disc.x;
          const cover = Math.min(1, Math.max(0, r - Math.sqrt(ex * ex + ey * ey) + 0.5));
          if (cover <= 0) continue;
          /* the palette along its line toward the hollow (dimple.ts dimpleTint, written out) */
          const s = Math.max(-1, Math.min(1, (ex * disc.ux + ey * disc.uy) / r));
          const t = Math.min(1, Math.max(0, disc.t + reach * s)) * last;
          const i = Math.min(last - 1, Math.floor(t)) * 3;
          const f = t - i / 3;
          const o = ((y - y0) * W + x) * 3;
          const a0 = stops[i];
          const a1 = stops[i + 1];
          const a2 = stops[i + 2];
          band[o] += (a0 + (stops[i + 3] - a0) * f - band[o]) * cover;
          band[o + 1] += (a1 + (stops[i + 4] - a1) * f - band[o + 1]) * cover;
          band[o + 2] += (a2 + (stops[i + 5] - a2) * f - band[o + 2]) * cover;
        }
      }
    }
    for (let y = y0; y < y1; y++)
      for (let x = 0; x < W; x++) {
        const o = ((y - y0) * W + x) * 3;
        const i = (y * W + x) * 4;
        px[i] = Math.floor(Math.min(1, Math.max(0, band[o])) * 255 + 0.5);
        px[i + 1] = Math.floor(Math.min(1, Math.max(0, band[o + 1])) * 255 + 0.5);
        px[i + 2] = Math.floor(Math.min(1, Math.max(0, band[o + 2])) * 255 + 0.5);
        px[i + 3] = 255;
      }
  }
  return px;
}
