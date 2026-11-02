/* The Worker's own entrypoint for a part of a palette's video (video.ts): each call is an invocation of its own, with its
   own allowance of work, so a clip's frames are shared out among several, each going on from the state of the one
   before. Only the Worker reaches it, through its loopback (`exports.VideoParts` in cloudflare:workers); nothing
   outside can call it. Its drawing loads with the first part. */
import { WorkerEntrypoint } from "cloudflare:workers";
import type { VideoPartDrawn, VideoPartJob } from "./video-draw.ts";

export class VideoParts extends WorkerEntrypoint {
  async draw(job: VideoPartJob): Promise<VideoPartDrawn> {
    const { drawVideoPart } = await import("./video-draw.ts");
    return drawVideoPart(job);
  }
}
