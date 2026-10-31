/* The blob's drawing in the browser: the engine's blob (engine/blob.ts) loaded on demand, as the menu opens or the blob
   is chosen, so a palette page's start carries none of it; its first frame as a background that fits any box, the
   same the server draws into a blob page's head (server/blob-still.ts); and the blob's view of an effect's settings. */
import type { BlobView } from "@grabient/engine/blob.ts";
import type { EffectSettings } from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";

/** The id of the head's style the server writes a blob page's still in. */
export const BLOB_STILL_STYLE = "blob-still";

let blob: typeof import("@grabient/engine/blob.ts") | null = null;
let loading: Promise<void> | null = null;

/** The blob's code, asked for once. */
export const loadBlob = (): Promise<void> =>
  (loading ??= import("@grabient/engine/blob.ts").then(m => {
    blob = m;
  }));

/** Whether the server drew the still `key` names into the page's head, which paints every holder naming it. */
export const serverBlobStill = (key: string): boolean =>
  typeof document !== "undefined" && document.getElementById(BLOB_STILL_STYLE)?.dataset.key === key;

/** The blob's view of an effect's settings at the view's angle: moving at its speed (0 holds the first frame), or its
    first frame alone. */
export const blobViewOf = (s: EffectSettings, angle: number, still = false): BlobView => ({
  speed: s.speed,
  fps: s.fps,
  still,
  frost: s.look.frost,
  shape: s.look.shape,
  bg: s.look.bg,
  angle
});

/** The blob's first frame at the angle as a background for a box of any size (engine/blob.ts's blobStillBackground),
    on `ground` where the blob has none of its own, or null while its code loads. */
export function blobStillBackground(
  P: Palette,
  s: EffectSettings,
  angle: number,
  ground?: string
): string | null {
  return blob
    ? blob.blobStillBackground(P, { ...blobViewOf(s, angle, true), speed: 1 }, ground)
    : null;
}
