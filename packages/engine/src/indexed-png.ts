/* An indexed PNG in the pieces a palette is laid between: a picture whose every pixel names a place in a palette the
   file carries beside it. The aurora's still is one (aurora-svg.ts): its pixels are its light, the same whatever the
   palette, and its palette the colors. A PNG's colors are the picture's own, which every browser shows as it shows
   any color of a page; what a filter's table writes Chromium takes for the screen's own numbers (aurora-svg.ts).
   Every piece is base64 of a whole number of three bytes, so the pieces join as text: the signature and the header
   (33 bytes), the palette's chunk (12 and three a color), then the rows and the end. */
import { deflateSteps } from "./deflate.ts";

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const CRC = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
/* a chunk: its length, its name, its bytes and the check of the name and the bytes */
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

const SIXTY_FOUR = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
/** Bytes in base64, as a data address carries them. */
export function base64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    out +=
      SIXTY_FOUR[a >> 2] +
      SIXTY_FOUR[((a & 3) << 4) | (b >> 4)] +
      (i + 1 < bytes.length ? SIXTY_FOUR[((b & 15) << 2) | (c >> 6)] : "=") +
      (i + 2 < bytes.length ? SIXTY_FOUR[c & 63] : "=");
  }
  return out;
}

/** An indexed PNG without its palette, in base64: what comes before the palette's chunk and what comes after. */
export interface IndexedPng {
  head: string;
  rows: string;
}

/** The pieces of an indexed PNG of `width` by `height` pixels, a byte a pixel, a stretch of it a step. Each row is
    written as its difference from the row above (the Up filter), which leaves a smooth picture small numbers and a
    flat one zeros: of the five filters it wrote the aurora's light smallest, as small as the best of them chosen
    row by row. */
export function* indexedPngSteps(
  pixels: Uint8Array,
  width: number,
  height: number
): Generator<void, IndexedPng> {
  const rows = new Uint8Array(height * (width + 1));
  for (let y = 0; y < height; y++) {
    const at = y * (width + 1);
    rows[at] = 2;
    for (let x = 0; x < width; x++)
      rows[at + 1 + x] = pixels[y * width + x] - (y ? pixels[(y - 1) * width + x] : 0);
  }
  const deflated = yield* deflateSteps(rows);
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  /* eight bits a pixel, indexed; deflate, the five filters, no interlace */
  header.set([8, 3, 0, 0, 0], 8);
  const head = new Uint8Array(33);
  head.set(SIGNATURE);
  head.set(chunk("IHDR", header), 8);
  const data = chunk("IDAT", deflated);
  const rest = new Uint8Array(data.length + 12);
  rest.set(data);
  rest.set(chunk("IEND", new Uint8Array(0)), data.length);
  return { head: base64(head), rows: base64(rest) };
}

/** The palette's chunk of an indexed PNG in base64, to lay between its pieces: three bytes a color, in the order the
    pixels name them. */
export const pngPalette = (colors: Uint8Array): string => base64(chunk("PLTE", colors));
