/* The blob as an animated GIF: one whole loop of blobRenderer's frames as blobGifPlan lays it out, written by gif.ts, so
   it loops as the SVG does. Transparent unless it asks for a ground, as the SVG is; a GIF has no soft edge, so the
   blob's edge is sprayed in whole pixels. The frost's grain hides a color held a little past where it drifted, which
   makes a GIF on a ground about half the size; without frost nothing is held, and an ordered dither keeps the gradient
   from banding. Its own module, which only a GIF's answer loads. */
import { type BlobView, blobGifPlan, blobRenderer } from "./blob.ts";
import { encodeGif, gifDelays } from "./gif.ts";
import { clamp01 } from "./math.ts";
import type { Palette } from "./palette.ts";
import type { Size } from "./view.ts";

/** The GIF of a palette's blob at a size asked for. `pause` is awaited after each frame, so the drawing can let other
    work run. */
export function blobGif(
  P: Palette,
  view: BlobView,
  asked: Size,
  pause?: () => Promise<void>
): Promise<Uint8Array<ArrayBuffer>> {
  const { size, frames, seconds } = blobGifPlan(view, asked);
  const drawn = blobRenderer(P, view, size);
  const delays = gifDelays(frames, seconds);
  return encodeGif(
    {
      width: size.width,
      height: size.height,
      channels: drawn.channels,
      frames,
      frame: i => drawn.frame(i / frames),
      delay: i => delays[i]
    },
    {
      tolerance: Math.round(800 * Math.min(1, view.frost)),
      dither: Math.round(6 * clamp01(1 - 2 * view.frost)),
      pause
    }
  );
}
