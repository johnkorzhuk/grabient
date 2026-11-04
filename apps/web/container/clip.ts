/* A clip a container draws whole: the job the Worker sends it (server/images/video-drawer.ts), and the ask the engine
   draws it from, its soft and grain worked out here as video-make.ts works them out for the Worker's own parts, so a
   clip drawn here is the one the Worker would draw, byte for byte. */
import type { EffectFinish, EffectLook } from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import {
  type VideoAsk,
  type VideoKind,
  type VideoPlan,
  videoQuality
} from "@grabient/engine/video.ts";
import { videoFinish } from "@grabient/engine/video-finish.ts";

export interface VideoWholeJob {
  palette: Palette;
  kind: VideoKind;
  look: EffectLook;
  angle: number;
  /** the address's soft and grain, which askOf works out at the clip's size */
  finish: EffectFinish;
  width: number;
  height: number;
  fps: number;
  plan: VideoPlan;
}

export function askOf(job: VideoWholeJob) {
  const size = { width: job.width, height: job.height };
  const finish =
    job.finish.soft || job.finish.grain
      ? videoFinish(job.palette, job, job.angle, job.finish, size)
      : {};
  const ask: VideoAsk = {
    kind: job.kind,
    palette: job.palette,
    look: job.look,
    angle: job.angle,
    size,
    fps: job.fps,
    finish
  };
  return { ask, quality: videoQuality(ask) };
}

/** A frame's planes in a slot of the drawers' ring, Y then U then V, each as the module lays it out (video.c create:
    rows of the width rounded up to 32 bytes, U and V half that, half as many rows). */
export function slotLayout(width: number, height: number) {
  const stride = (width + 31) & ~31;
  const y = stride * height;
  const uv = (stride / 2) * (height / 2);
  return { y, uv, bytes: y + 2 * uv };
}
