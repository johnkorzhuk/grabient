/* A palette's blob as an animated GIF, /{seed}.gif?style=blob: one whole loop at the size and frame rate the address
   asks for, within the budget engine/blob.ts's blobGifPlan keeps. Drawing every frame of a loop is more work than one
   invocation of the Worker may spend, so a GIF past a part's work (engine/blob-gif.ts) is drawn in parts, each in an
   invocation of its own through the Worker's own entrypoint (gif-parts.ts), against one color table this answer cuts,
   and joined here in order. It is drawn within allowances of its own (serve.ts), lets other requests run between its
   frames, and is kept at the edge as a palette's other pictures are. The encoder loads with the first GIF asked for. */
import { BLOB_GIF_SIZE, blobGifPlan, blobSearch, parseBlob } from "@grabient/engine/blob.ts";
import type { Size } from "@grabient/engine/view.ts";
import type { Resolved } from "../files/resolve.ts";
import { resolvePalette } from "../files/resolve.ts";
import { answerPicture, type Keep, type PictureEnv } from "./serve.ts";
import { gifSize } from "./size.ts";

/** The blob's GIF drawing, counted up for a change to engine/blob.ts or gif.ts that moves its pixels. */
const GIF_DRAWING = "blob-gif-1";

/** A turn for the requests waiting behind this one. */
const yieldTurn = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/** One part of a GIF, as its answer hands it to an invocation of its own: the palette, the blob's query, the size
    asked for, the GIF's color table and the frames to draw. */
export interface GifPartJob {
  seed: string;
  search: string;
  width: number;
  height: number;
  table: number[][];
  from: number;
  to: number;
}
/** Draws a part, in an invocation of its own. */
export type GifPartRunner = (job: GifPartJob) => Promise<Uint8Array>;

const viewOf = (search: string) => ({ ...parseBlob(new URLSearchParams(search)), still: false });

/** A part's frames, written against the GIF's table. */
export async function drawGifPart(job: GifPartJob): Promise<Uint8Array<ArrayBuffer>> {
  const found = resolvePalette(job.seed);
  if (!found) throw new Error(`No palette for a GIF's part: ${job.seed}`);
  const { blobGifPart } = await import("@grabient/engine/blob-gif.ts");
  const size: Size = { width: job.width, height: job.height };
  return blobGifPart(
    found.palette,
    viewOf(job.search),
    size,
    job.table,
    job.from,
    job.to,
    yieldTurn
  );
}

export function paletteGif(
  request: Request,
  env: PictureEnv,
  found: Resolved,
  params: URLSearchParams,
  keep: Keep,
  parts?: GifPartRunner,
  partWork?: number
): Promise<Response> {
  const search = blobSearch({ ...parseBlob(params), still: false });
  const blob = viewOf(search);
  const asked = gifSize(params, BLOB_GIF_SIZE);
  const { size, frames } = blobGifPlan(blob, asked);
  return answerPicture(
    request,
    env,
    {
      kind: "gif",
      type: "image/gif",
      branded: false,
      svg: `/${found.seed}.svg${blobSearch(blob, [`size=${size.width}x${size.height}`])}`,
      parts: [
        GIF_DRAWING,
        found.seed,
        blobSearch({ ...blob, fps: null }),
        size.width,
        size.height,
        frames
      ],
      width: size.width,
      height: size.height,
      draw: async () => {
        const { blobGif, blobGifParts, blobGifTable } = await import(
          "@grabient/engine/blob-gif.ts"
        );
        const ranges = blobGifParts(blob, asked, partWork);
        if (!parts || ranges.length < 2) return blobGif(found.palette, blob, asked, yieldTurn);
        const { GIF_END, joinBytes } = await import("@grabient/engine/gif.ts");
        const { table, start } = blobGifTable(found.palette, blob, asked);
        const drawn = await Promise.all(
          ranges.map(([from, to]) => parts({ seed: found.seed, search, ...asked, table, from, to }))
        );
        return joinBytes([start, ...drawn, GIF_END]);
      }
    },
    keep
  );
}
