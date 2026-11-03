/* The grain's tile at a strength (engine/grain.ts) as a data URI, which a palette's stylesheet and SVG carry in
   themselves, so a file works wherever it lands: one PNG a strength, made once an isolate. */
import { grainPng } from "@grabient/engine/grain.ts";

const made = new Map<number, Promise<string>>();

/* zlib's deflate by the platform's stream */
async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The tile at a grain, 1 to 100, as a PNG's data URI. */
export function grainData(grain: number): Promise<string> {
  let data = made.get(grain);
  if (!data) {
    data = grainPng(grain, deflate).then(png => {
      let text = "";
      for (let i = 0; i < png.length; i += 0x8000)
        text += String.fromCharCode(...png.subarray(i, i + 0x8000));
      return `data:image/png;base64,${btoa(text)}`;
    });
    made.set(grain, data);
  }
  return data;
}
