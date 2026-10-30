/* The Worker's own entrypoint for a part of a blob's GIF (gifs.ts): each call is an invocation of its own, with its own
   allowance of work, so a GIF's frames are shared out among several. Only the Worker reaches it, through its loopback
   (`exports.GifParts` in cloudflare:workers); nothing outside can call it. */
import { WorkerEntrypoint } from "cloudflare:workers";
import { drawGifPart, type GifPartJob } from "./gifs.ts";

export class GifParts extends WorkerEntrypoint {
  draw(job: GifPartJob): Promise<Uint8Array> {
    return drawGifPart(job);
  }
}
