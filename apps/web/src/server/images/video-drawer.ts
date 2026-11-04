/* A clip drawn whole in a container (apps/web container/): one Durable Object per clip, named by the clip's key, so
   every asker of a clip being drawn joins the one drawing. Its container's four cores draw the clip as one stream,
   at the size asked up to 4K, where the Worker's own parts would have drawn it smaller (video.ts). The drawing runs
   in the object's alarm, so it goes on after the askers leave, and is tried again if it fails or the object is reset
   (video-drawing.ts). Only staging binds it (VIDEO_DRAWER): production and development draw as before.
   This is the class alone, which the Worker exports from its start: what it does loads with the first call an
   isolate makes on one, so the Worker starts no larger for it. */
import { DurableObject } from "cloudflare:workers";
import type { Env } from "@grabient/server/env.ts";
import type { VideoWholeJob } from "../../../container/clip.ts";

export type { VideoWholeJob };

/** A clip to draw whole: its name in R2 and its job. */
export interface WholeClip {
  name: string;
  job: VideoWholeJob;
}

/** Where a clip's drawing stands: none begun or the last one done, being drawn (its frames coded so far, where its
    container says), or given up after its tries. */
export type WholeState =
  | { state: "idle" }
  | { state: "drawing"; since: number; coded: number; frames: number }
  | { state: "failed"; error: string };

/** What the Worker calls on a clip's object. */
export interface WholeDrawer {
  begin(clip: WholeClip): Promise<WholeState>;
  status(): Promise<WholeState>;
}

const drawing = () => import("./video-drawing.ts");

export class VideoDrawer extends DurableObject<Env> implements WholeDrawer {
  /** Begins the clip's drawing unless it is being drawn: where it stands. */
  async begin(clip: WholeClip): Promise<WholeState> {
    return (await drawing()).begin(this.ctx, clip);
  }

  async status(): Promise<WholeState> {
    return (await drawing()).status(this.ctx);
  }

  async alarm(): Promise<void> {
    return (await drawing()).alarm(this.ctx, this.env);
  }
}
