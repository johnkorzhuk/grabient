/* The grain over a picture as one PNG's data URI, which an SVG carries in itself: engine/grain.ts grainImagePng
   deflated by the platform's own stream, the Worker's or a browser's. A design app imports it one to one as one layer
   (Figma's stretches a pattern's image over the box and takes each tile a <use> lays as a rectangle of its own). */
import { grainImagePng } from "@grabient/engine/grain.ts";
import type { Size } from "@grabient/engine/view.ts";

/* zlib's deflate by CompressionStream */
async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Bytes as base64, a chunk at a time, so a large file passes no call more arguments than it takes. */
export function base64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** The grain at a strength over a picture of `size` as a PNG's data URI. */
export const grainImageUri = async (grain: number, size: Size): Promise<string> =>
  `data:image/png;base64,${base64(await grainImagePng(grain, size, deflate))}`;
