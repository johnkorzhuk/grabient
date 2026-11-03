import { decodePalette } from "@grabient/engine";
import type { Effect } from "@grabient/engine/effect.ts";
import {
  blurRgba,
  effectBlurSigma,
  effectUnderlay,
  overUnder,
  underlayPixels
} from "@grabient/engine/fx-finish.ts";
import { papercutScene } from "@grabient/engine/papercut.ts";
import { papercutRows } from "@grabient/engine/papercut-render.ts";
import { finishOf } from "@grabient/engine/view.ts";
import { grainSrc } from "../../lib/picture.ts";
import type { Taken } from "./formats.ts";

/* The papercut's PNG as Copy PNG and Download PNG take it (formats.ts pngOf), loaded with the first one taken, so
   neither a page's start nor the Worker carries it: its first frame by its CPU drawing, as its PNG file and its cards
   are drawn (engine/papercut-render.ts), about 0.3 s at 1600 by 900 on a desktop, a band of rows a task so the page
   goes on meanwhile, where its SVG file, which blurs each of its shadows, took a second to draw without the GPU. Its
   soft and grain as the stage lays them: the frame blurred by the browser's own filter (the stage's CSS blur) over the
   palette's gradient, its edges going to it, and the grain's tile over all; a browser whose canvas has no filter
   blurs it as fx-finish.ts does (its blur and gradient alone: its grain on pixels would bring the tile's hash into
   every page's start, where grain.ts stands). */

/* the milliseconds of a task the drawing takes at a time, the page's own work between */
const DRAW_SHARE_MS = 30;
const nextTask = () => new Promise<void>(done => setTimeout(done));

export async function papercutPng(p: Taken, effect: Effect): Promise<Blob> {
  const P = decodePalette(p.seed)!;
  const size = p.pixels;
  const { width, height } = size;
  const frame = papercutRows(
    papercutScene(P, { angle: p.angle, shape: effect.look.shape }, size),
    0
  );
  let y = 0;
  for (let end = performance.now() + DRAW_SHARE_MS; ; end = performance.now() + DRAW_SHARE_MS) {
    let done = false;
    while (!done && performance.now() < end) {
      y += 8;
      done = frame.rows(y);
    }
    if (done) break;
    await nextTask();
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no 2d context");
  const finish = finishOf(p);
  const sigma = effectBlurSigma(finish.soft, size);
  const under = effectUnderlay(P, effect, p.angle, finish.soft);
  const pixels = new ImageData(new Uint8ClampedArray(frame.px), width, height);
  if (sigma > 0 && under && typeof context.filter === "string") {
    /* CSS's gradient line at the angle, corner to corner */
    const a = (under.angle * Math.PI) / 180;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    const half = (width * Math.abs(dx) + height * Math.abs(dy)) / 2;
    const line = context.createLinearGradient(
      width / 2 - dx * half,
      height / 2 - dy * half,
      width / 2 + dx * half,
      height / 2 + dy * half
    );
    for (const [i, stop] of under.stops.entries())
      line.addColorStop(under.at?.[i] ?? i / Math.max(1, under.stops.length - 1), stop.hex);
    context.fillStyle = line;
    context.fillRect(0, 0, width, height);
    const layer = document.createElement("canvas");
    layer.width = width;
    layer.height = height;
    layer.getContext("2d")?.putImageData(pixels, 0, 0);
    context.filter = `blur(${sigma}px)`;
    context.drawImage(layer, 0, 0);
    context.filter = "none";
  } else if (sigma > 0 && under) {
    /* the blur as fx-finish.ts draws it over the gradient (finishPixels's soft, the grain laid below as the tile) */
    const rgb = overUnder(
      blurRgba(frame.px, width, height, sigma),
      underlayPixels(under, size),
      width,
      height
    );
    const opaque = new Uint8ClampedArray(width * height * 4);
    for (let i = 0, j = 0; i < opaque.length; i += 4, j += 3) {
      opaque[i] = rgb[j];
      opaque[i + 1] = rgb[j + 1];
      opaque[i + 2] = rgb[j + 2];
      opaque[i + 3] = 255;
    }
    context.putImageData(new ImageData(opaque, width, height), 0, 0);
  } else context.putImageData(pixels, 0, 0);
  if (finish.grain) {
    const tile = new Image();
    tile.src = grainSrc(finish.grain);
    await tile.decode();
    context.fillStyle = context.createPattern(tile, "repeat") ?? "transparent";
    context.fillRect(0, 0, width, height);
  }
  const png = await new Promise<Blob | null>(done => canvas.toBlob(done, "image/png"));
  if (!png) throw new Error("no PNG");
  return png;
}
