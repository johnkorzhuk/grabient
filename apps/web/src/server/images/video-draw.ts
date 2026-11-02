/* A part of a palette's effect as video, drawn and coded in this invocation (engine/video.ts): the module
   (engine/video/video.wasm, compiled with the Worker) and the engine's video code load with the first video asked for.
   A part is handed its palette rather than the seed it reads from, so this imports nothing the Worker starts with,
   and its loading moves none of the Worker's start into chunks of its own. */
import type { EffectKind, EffectLook } from "@grabient/engine/effect.ts";
import type { Mp4Frame } from "@grabient/engine/mp4.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import wasm from "@grabient/engine/video/video.wasm";
import { type VideoPlan, videoFrames } from "@grabient/engine/video.ts";

/** One part of a clip, as its answer hands it to an invocation of its own: the palette, the effect, the clip, the
    frames to draw, and the encoder's state where the part before stopped (none for the first). */
export interface VideoPartJob {
  palette: Palette;
  kind: EffectKind;
  look: EffectLook;
  angle: number;
  width: number;
  height: number;
  fps: number;
  plan: VideoPlan;
  from: number;
  to: number;
  state: Uint8Array | null;
}

/** A part's frames, and the encoder's state after them, which the next part goes on from. */
export interface VideoPartDrawn {
  frames: Mp4Frame[];
  state: Uint8Array;
}

/** Draws and codes a part's frames. */
export function drawVideoPart(job: VideoPartJob): VideoPartDrawn {
  return videoFrames(
    wasm,
    {
      kind: job.kind,
      palette: job.palette,
      look: job.look,
      angle: job.angle,
      size: { width: job.width, height: job.height },
      fps: job.fps
    },
    job.plan,
    job.from,
    job.to,
    job.state
  );
}
