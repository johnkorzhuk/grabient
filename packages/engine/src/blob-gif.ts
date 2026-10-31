/* The blob as an animated GIF: one whole loop of blobRenderer's frames as blobGifPlan lays it out, written by gif.ts, so
   it loops as the SVG does. Transparent unless it asks for a ground, as the SVG is; a GIF has no soft edge, so the
   blob's edge is sprayed in whole pixels. The frost's grain hides a color held a little past where it drifted, which
   makes a GIF on a ground about half the size; without frost nothing is held, and an ordered dither keeps the gradient
   from banding. A GIF too large to draw in one piece of work is drawn in parts (blobGifParts): one color table cut
   from frames across the loop (blobGifTable), each part's frames written against it (blobGifPart), and the parts
   joined between the GIF's start and its end. Its own module, which only a GIF's answer loads. */
import { type BlobGifPlan, type BlobView, blobGifPlan, blobRenderer } from "./blob.ts";
import {
  GIF_END,
  type GifOptions,
  gifDelays,
  gifFrames,
  gifSamples,
  gifStart,
  gifTable,
  joinBytes
} from "./gif.ts";
import { clamp01 } from "./math.ts";
import type { Palette } from "./palette.ts";
import type { Size } from "./view.ts";

/** The most a part of a GIF is drawn with, its pixels times its frames counted half again, for its three blobs: a few
    tenths of a second. */
export const BLOB_GIF_PART_WORK = 6_000_000;

/* a held color and a dither by the frost: the grain hides the one, and only a smooth gradient needs the other */
const optionsOf = (view: BlobView): GifOptions => ({
  tolerance: Math.round(800 * Math.min(1, view.frost)),
  dither: Math.round(6 * clamp01(1 - 2 * view.frost))
});

/* the blob's frames at the plan's size, and their delays */
function sourceOf(P: Palette, view: BlobView, plan: BlobGifPlan) {
  const { size, frames, seconds } = plan;
  const drawn = blobRenderer(P, view, size);
  const delays = gifDelays(frames, seconds);
  return {
    width: size.width,
    height: size.height,
    channels: drawn.channels,
    frames,
    frame: (i: number) => drawn.frame(i / frames),
    delay: (i: number) => delays[i]
  };
}

/** The frames each part of a GIF draws, from and to, each part within `work`: one part where the GIF fits in it. */
export function blobGifParts(
  view: BlobView,
  asked: Size,
  work = BLOB_GIF_PART_WORK
): [number, number][] {
  const { size, frames } = blobGifPlan(view, asked);
  const weight = 1.5;
  const each = Math.max(1, Math.floor(work / (weight * size.width * size.height)));
  const count = Math.ceil(frames / each);
  /* the frames shared out evenly */
  return Array.from({ length: count }, (_, k) => [
    Math.round((k * frames) / count),
    Math.round(((k + 1) * frames) / count)
  ]);
}

/** A GIF's plan and its color table, cut from frames sampled across its loop: what every part is written against. */
export function blobGifTable(P: Palette, view: BlobView, asked: Size) {
  const plan = blobGifPlan(view, asked);
  const source = sourceOf(P, view, plan);
  const table = gifTable(gifSamples(plan.frames).map(source.frame), plan.size, source.channels);
  return { plan, table, start: gifStart(plan.size, table) };
}

/** Frames `from` to `to` of a blob's GIF against its table: a part, which joins the others in order between the
    GIF's start and GIF_END. `pause` is awaited after each frame, so the drawing can let other work run. */
export function blobGifPart(
  P: Palette,
  view: BlobView,
  asked: Size,
  table: readonly number[][],
  from: number,
  to: number,
  pause?: () => Promise<void>
): Promise<Uint8Array<ArrayBuffer>> {
  const source = sourceOf(P, view, blobGifPlan(view, asked));
  return gifFrames(source, table, from, to, { ...optionsOf(view), pause });
}

/** The GIF of a palette's blob at a size asked for, in one piece of work. */
export async function blobGif(
  P: Palette,
  view: BlobView,
  asked: Size,
  pause?: () => Promise<void>
): Promise<Uint8Array<ArrayBuffer>> {
  const plan = blobGifPlan(view, asked);
  const source = sourceOf(P, view, plan);
  /* the frames the table is cut from, kept to be written in their turn */
  const sampled = new Map(gifSamples(plan.frames).map(i => [i, source.frame(i)]));
  const table = gifTable([...sampled.values()], plan.size, source.channels);
  const frames = await gifFrames(
    {
      ...source,
      frame: i => {
        const kept = sampled.get(i);
        sampled.delete(i);
        return kept ?? source.frame(i);
      }
    },
    table,
    0,
    plan.frames,
    { ...optionsOf(view), pause }
  );
  return joinBytes([gifStart(plan.size, table), frames, GIF_END]);
}
