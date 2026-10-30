/* A palette's blob as an animated GIF, /{seed}.gif?style=blob: one whole loop at the size and frame rate the address
   asks for, within the budget engine/blob.ts's blobGifPlan keeps. Drawing it is about a second of work, the most any
   picture costs, so it is drawn within allowances of its own (serve.ts), lets other requests run between its frames,
   and is kept at the edge as a palette's other pictures are. The encoder loads with the first GIF asked for. */
import { BLOB_GIF_SIZE, blobGifPlan, blobSearch, parseBlob } from "@grabient/engine/blob.ts";
import type { Resolved } from "../files/resolve.ts";
import { answerPicture, type Keep, type PictureEnv } from "./serve.ts";
import { gifSize } from "./size.ts";

/** The blob's GIF drawing, counted up for a change to engine/blob.ts or gif.ts that moves its pixels. */
const GIF_DRAWING = "blob-gif-1";

/** A turn for the requests waiting behind this one. */
const yieldTurn = () => new Promise<void>(resolve => setTimeout(resolve, 0));

export function paletteGif(
  request: Request,
  env: PictureEnv,
  found: Resolved,
  params: URLSearchParams,
  keep: Keep
): Promise<Response> {
  const blob = { ...parseBlob(params), still: false };
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
        const { blobGif } = await import("@grabient/engine/blob-gif.ts");
        return blobGif(found.palette, blob, asked, yieldTurn);
      }
    },
    keep
  );
}
