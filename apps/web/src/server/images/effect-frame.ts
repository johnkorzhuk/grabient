/* An effect's first frame as the server's pictures of it are, its picture alone (/{seed}.png?style=) and its card
   (/api/og?style=): drawn on the CPU (engine/fx-frame.ts), finished by the soft and the grain the address names as the
   site paints them (engine/fx-finish.ts finishPixels), three bytes a pixel where it covers the box. Its code comes
   with the first such picture an isolate draws. */
import { type Effect, type EffectFinish, effectBare } from "@grabient/engine/effect.ts";
import { effectUnderlay, finishPixels } from "@grabient/engine/fx-finish.ts";
import { effectDrawn, rgbaOf } from "@grabient/engine/fx-frame.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import type { Size } from "@grabient/engine/view.ts";

/* Four bytes a pixel as three: the smaller file, for a picture every pixel of which is opaque. */
function rgbOf(rgba: ArrayLike<number>, n: number): Uint8Array<ArrayBuffer> {
  const rgb = new Uint8Array(n * 3);
  for (let i = 0, j = 0; j < rgb.length; i += 4, j += 3) {
    rgb[j] = rgba[i];
    rgb[j + 1] = rgba[i + 1];
    rgb[j + 2] = rgba[i + 2];
  }
  return rgb;
}
/* Straight-alpha pixels laid on a solid color: three bytes a pixel. */
function onColor(rgba: ArrayLike<number>, rgb: readonly number[], n: number) {
  const out = new Uint8Array(n * 3);
  for (let i = 0, j = 0; j < out.length; i += 4, j += 3) {
    const a = rgba[i + 3] / 255;
    for (let c = 0; c < 3; c++) out[j + c] = Math.round(rgba[i + c] * a + rgb[c] * (1 - a));
  }
  return out;
}
const opaque = (rgba: ArrayLike<number>) => {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) return false;
  return true;
};

/** An effect's first frame at a size, finished by the soft and the grain the address names: three bytes a pixel, or
    four where the picture lets the page through (engine/effect.ts effectBare: a blob's ground that does, or none, and
    the strings' on a ground that does), as a PNG takes it. Its soft edges go to the palette's gradient under it, as
    the site's do; a picture that lets the page through has none under it, and thins toward the page, or on a card,
    which is opaque, toward what it stands on there: the blob's near-black or near-white, the strings' designed
    ground. */
export async function effectFrame(
  P: Palette,
  effect: Effect,
  angle: number,
  size: Size,
  options: { card?: boolean; finish?: EffectFinish } = {}
): Promise<Uint8Array<ArrayBuffer>> {
  const n = size.width * size.height;
  const frame = await effectDrawn(P, effect, angle, size, options.card ?? false);
  const { soft, grain } = options.finish ?? {};
  if (!soft && !grain) {
    if (
      frame.pixels.length === n * 3 ||
      effect.kind === "blob" ||
      (!frame.backdrop && effectBare(effect.kind, effect.look))
    )
      return frame.pixels as Uint8Array<ArrayBuffer>;
    return rgbOf(frame.pixels, n);
  }
  const finished = finishPixels(
    rgbaOf(frame.pixels, n),
    size,
    { soft, grain },
    effectUnderlay(P, effect, angle, soft)
  );
  if (frame.backdrop) return onColor(finished, frame.backdrop, n);
  return opaque(finished)
    ? rgbOf(finished, n)
    : new Uint8Array(finished.buffer as ArrayBuffer, finished.byteOffset, finished.length);
}
