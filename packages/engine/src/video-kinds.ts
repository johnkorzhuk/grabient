/* The effects a clip can be drawn of (video.ts, video/video.wasm): the one list the clips' address
   (apps/web server/images/video.ts) and the editor's MP4 download and link read, so an effect that gains clips gains
   them everywhere at once. It names the effects alone and loads nothing, so a page's start can read it: the drawing
   loads with the first clip asked for. */
import type { EffectKind } from "./effect.ts";

export const VIDEO_KINDS = [
  "glass",
  "blob",
  "silk",
  "rosette",
  "papercut"
] as const satisfies readonly EffectKind[];
export type VideoKind = (typeof VIDEO_KINDS)[number];

/** Whether an effect's clips are drawn. */
export const hasVideo = (kind: EffectKind): kind is VideoKind =>
  (VIDEO_KINDS as readonly EffectKind[]).includes(kind);
