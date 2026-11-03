/* Grain: film grain over a picture, one tile of 128 by 128 specks repeated, each speck a pixel of black or white at a
   low alpha laid over with plain alpha (no blend mode), so a stylesheet, an SVG, the painter's PNG and a shader
   composite it alike. Each speck comes from an integer hash of its place, so a shader computes the same tile a file
   carries. Its strength, 1 to 100, scales every speck's alpha: at 100 a speck one standard deviation out has an alpha
   of 0.16, the lab's that John chose it in (2 Nov 2026). The site lays the tile at a strength as a background over
   the picture (grainLayer); a file carries it in itself. */
import { GRAIN_SIDE } from "./grain-tiles.ts";
import { GRAIN_MAX } from "./view.ts";

export { GRAIN_SIDE, grainTilesSvg } from "./grain-tiles.ts";

/** A one-sigma speck's alpha at GRAIN_MAX. */
export const GRAIN_FULL = 0.16;

/** A speck: whether it is white (else black), and its size in standard deviations, from a hash of its place in the
    tile (wrapped to it). */
export function grainSpeck(x: number, y: number): { white: boolean; size: number } {
  let h = (Math.imul(x & 127, 0x27d4eb2d) ^ Math.imul(y & 127, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  /* two uniforms from the hash, a normal from them (Box-Muller): its sign the speck's shade, its size the alpha's */
  const u1 = ((h & 0xffff) + 0.5) / 65536;
  const u2 = ((h >>> 16) + 0.5) / 65536;
  const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return { white: g > 0, size: Math.abs(g) };
}

/** A speck's alpha at a grain, 0 to 254 in steps of 2: a step no eye tells apart, which makes the tile's file a third
    smaller. */
export const grainAlpha = (size: number, grain: number): number =>
  Math.min(
    254,
    2 *
      Math.round(
        (size * GRAIN_FULL * (Math.min(GRAIN_MAX, Math.max(0, grain)) / GRAIN_MAX) * 255) / 2
      )
  );

/** The tile at a grain as RGBA bytes, row after row. */
export function grainTile(grain: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(GRAIN_SIDE * GRAIN_SIDE * 4);
  for (let y = 0; y < GRAIN_SIDE; y++)
    for (let x = 0; x < GRAIN_SIDE; x++) {
      const { white, size } = grainSpeck(x, y);
      const at = (y * GRAIN_SIDE + x) * 4;
      const v = white ? 255 : 0;
      out[at] = v;
      out[at + 1] = v;
      out[at + 2] = v;
      out[at + 3] = grainAlpha(size, grain);
    }
  return out;
}

/** A grain an address names: a whole number from 1 to GRAIN_MAX, else none. */
export const grainOf = (v: unknown): number => {
  const n = typeof v === "string" && /^\d{1,3}$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= GRAIN_MAX ? n : 0;
};

/** The grain's tile as a background layer over a picture: `src` the tile's address at that grain, a speck a CSS
    pixel. */
export const grainLayer = (src: string): string =>
  `url("${src}") 0 0 / ${GRAIN_SIDE}px ${GRAIN_SIDE}px`;

/** Lays the tile at a grain over RGB pixels in place, the tile's corner at the picture's: the painter's PNG. */
export function grainOver(pixels: Uint8Array, width: number, height: number, grain: number): void {
  if (!grain) return;
  const alpha = new Uint8Array(GRAIN_SIDE * GRAIN_SIDE);
  const white = new Uint8Array(GRAIN_SIDE * GRAIN_SIDE);
  for (let y = 0; y < GRAIN_SIDE; y++)
    for (let x = 0; x < GRAIN_SIDE; x++) {
      const { white: w, size } = grainSpeck(x, y);
      alpha[y * GRAIN_SIDE + x] = grainAlpha(size, grain);
      white[y * GRAIN_SIDE + x] = w ? 255 : 0;
    }
  for (let y = 0; y < height; y++) {
    const row = (y & (GRAIN_SIDE - 1)) * GRAIN_SIDE;
    for (let x = 0; x < width; x++) {
      const k = row + (x & (GRAIN_SIDE - 1));
      const a = alpha[k];
      if (!a) continue;
      const v = white[k];
      const at = (y * width + x) * 3;
      for (let c = 0; c < 3; c++)
        pixels[at + c] = Math.round((pixels[at + c] * (255 - a) + v * a) / 255);
    }
  }
}

const CRC = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  let c = 0xffffffff;
  for (let i = 4; i < 8 + data.length; i++) c = CRC[(c ^ out[i]) & 255] ^ (c >>> 8);
  view.setUint32(8 + data.length, (c ^ 0xffffffff) >>> 0);
  return out;
}

/** The tile at a grain as an indexed PNG, its palette the specks it holds (black or white at an alpha), the smallest
    file of it: about 11 KB at 40. `deflate` deflates in zlib's format (CompressionStream's "deflate", node's zlib). */
export async function grainPng(
  grain: number,
  deflate: (bytes: Uint8Array) => Uint8Array | Promise<Uint8Array>
): Promise<Uint8Array> {
  const index = new Map<number, number>();
  const rows = new Uint8Array(GRAIN_SIDE * (GRAIN_SIDE + 1));
  for (let y = 0; y < GRAIN_SIDE; y++)
    for (let x = 0; x < GRAIN_SIDE; x++) {
      const { white, size } = grainSpeck(x, y);
      const key = (white ? 256 : 0) + grainAlpha(size, grain);
      let i = index.get(key);
      if (i === undefined) {
        i = index.size;
        index.set(key, i);
      }
      rows[y * (GRAIN_SIDE + 1) + 1 + x] = i;
    }
  const colors = new Uint8Array(index.size * 3);
  const alphas = new Uint8Array(index.size);
  for (const [key, i] of index) {
    colors.fill(key >= 256 ? 255 : 0, i * 3, i * 3 + 3);
    alphas[i] = key & 255;
  }
  const head = new Uint8Array(13);
  const view = new DataView(head.buffer);
  view.setUint32(0, GRAIN_SIDE);
  view.setUint32(4, GRAIN_SIDE);
  head.set([8, 3, 0, 0, 0], 8);
  const parts = [
    Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
    chunk("IHDR", head),
    chunk("PLTE", colors),
    chunk("tRNS", alphas),
    chunk("IDAT", await deflate(rows)),
    chunk("IEND", new Uint8Array())
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
