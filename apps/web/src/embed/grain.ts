/* The grain's tile at a strength as the effect's stylesheet carries it (engine/grain.ts grainPng), made in the page for
   the canvas's layer: the same indexed PNG, its rows stored in zlib's format rather than deflated, so it needs no
   stream a browser may lack and reads back nothing a canvas drew, which some browsers blur or blank for privacy. */
import { grainPng } from "@grabient/engine/grain.ts";

/* bytes in zlib's format, stored: its header, blocks of up to 65,535 bytes as they are, and its Adler-32 */
function stored(bytes: Uint8Array): Uint8Array {
  const BLOCK = 65_535;
  const blocks = Math.max(1, Math.ceil(bytes.length / BLOCK));
  const out = new Uint8Array(2 + blocks * 5 + bytes.length + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let at = 2;
  for (let i = 0; i < blocks; i++) {
    const part = bytes.subarray(i * BLOCK, (i + 1) * BLOCK);
    out[at] = i === blocks - 1 ? 1 : 0;
    out[at + 1] = part.length & 255;
    out[at + 2] = part.length >>> 8;
    out[at + 3] = ~part.length & 255;
    out[at + 4] = (~part.length >>> 8) & 255;
    out.set(part, at + 5);
    at += 5 + part.length;
  }
  let a = 1;
  let b = 0;
  for (const v of bytes) {
    a = (a + v) % 65_521;
    b = (b + a) % 65_521;
  }
  out.set([b >>> 8, b & 255, a >>> 8, a & 255], at);
  return out;
}

/** The tile at a grain, 1 to 100, as a CSS image: a PNG's data URI. */
export async function grainImage(grain: number): Promise<string> {
  const png = await grainPng(grain, stored);
  let text = "";
  for (let i = 0; i < png.length; i += 0x8000)
    text += String.fromCharCode(...png.subarray(i, i + 0x8000));
  return `url("data:image/png;base64,${btoa(text)}")`;
}
