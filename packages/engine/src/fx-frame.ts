/* An effect's first frame as its pictures are drawn, the server's (/{seed}.png?style=, a card under the wordmark at
   /api/og?style=, server/images/effect-frame.ts) and the editor's Copy PNG and Download PNG of the glass alike (the
   other effects' copies are their finished SVG drawn by the browser), each at its own size: the frame the editor shows
   before the effect moves, drawn on the CPU, the glass by its renderer (glass-render.ts), the blob as its still
   (blob.ts), the silk and the rosette by their drawings (silk-render.ts, rosette-render.ts), and its soft as the
   site paints it (fx-finish.ts blurOver): the frame blurred by a share of its
   longer side over the palette's gradient, toward clear where it lets the page through. Each effect's drawing comes
   with the first picture of it, so the module holds none of them. The grain is laid by each, the server's from
   fx-finish's specks, the editor's with its canvas: the specks come from grain.ts, which every page starts with, and
   reading them here would put their code in every page's start. */
import type { Effect } from "./effect.ts";
import { blurOver, effectBlurSigma, effectUnderlay } from "./fx-finish.ts";
import { glassColors } from "./glass-colors.ts";
import type { Palette } from "./palette.ts";
import type { Size } from "./view.ts";

/** A frame's pixels as its drawing gives them: four bytes a pixel, straight alpha, or three where the blob stands on a
    ground that covers the box. They are opaque but for a blob whose ground lets the page through, or that has none. A
    card, which cannot be clear, lays the blob on its near-black or near-white (blobBackdrop), which `backdrop` names. */
export interface EffectDrawn {
  pixels: Uint8Array | Uint8ClampedArray;
  backdrop?: readonly number[];
}

/** An effect's first frame at a size, unfinished. */
export async function effectDrawn(
  P: Palette,
  effect: Effect,
  angle: number,
  size: Size,
  card = false
): Promise<EffectDrawn> {
  /* the silk, the rosette and the papercut by their CPU drawings: about 0.1 s for a card, 0.35 s for the largest
     picture */
  if (effect.kind === "silk" || effect.kind === "rosette" || effect.kind === "papercut") {
    const look = { angle, shape: effect.look.shape };
    if (effect.kind === "papercut") {
      const [model, render] = await Promise.all([
        import("./papercut.ts"),
        import("./papercut-render.ts")
      ]);
      return { pixels: render.renderPapercut(model.papercutScene(P, look, size), 0) };
    }
    if (effect.kind === "rosette") {
      const [model, render] = await Promise.all([
        import("./rosette.ts"),
        import("./rosette-render.ts")
      ]);
      return { pixels: render.renderRosette(model.rosetteScene(P, look, size), 0, true) };
    }
    const [model, render] = await Promise.all([import("./silk.ts"), import("./silk-render.ts")]);
    return { pixels: render.renderSilk(model.silkScene(P, look, size), 0) };
  }
  if (effect.kind === "blob") {
    const blob = await import("./blob.ts");
    const backdrop = card ? blob.blobBackdrop(P) : undefined;
    return { pixels: blob.blobStill(P, effect.look, size, backdrop), backdrop };
  }
  const [model, render] = await Promise.all([import("./glass.ts"), import("./glass-render.ts")]);
  const { geometry, window } = render.glassCover(size, 1, angle, effect.look.shape);
  // one frame, drawn without holding the rib map and each pixel's read for frames to come
  return {
    pixels: render
      .glassRenderer(geometry, window, undefined, true)
      .frame(model.glassField(geometry, glassColors(P)), 0)
  };
}

/** A frame's pixels as four bytes each, three-byte ones made opaque. */
export function rgbaOf(pixels: Uint8Array | Uint8ClampedArray, n: number): Uint8ClampedArray {
  if (pixels.length === n * 4)
    return pixels instanceof Uint8ClampedArray ? pixels : new Uint8ClampedArray(pixels);
  const rgba = new Uint8ClampedArray(n * 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgba[i] = pixels[j];
    rgba[i + 1] = pixels[j + 1];
    rgba[i + 2] = pixels[j + 2];
    rgba[i + 3] = 255;
  }
  return rgba;
}

/** An effect's first frame blurred by its soft over the gradient under it, straight RGBA, four bytes a pixel, as a
    canvas takes it: the editor's Copy PNG and Download PNG, which lay the grain's tile over it with the canvas as the
    page lays it, within a level of the server's picture at a speck. */
export async function effectRgba(
  P: Palette,
  effect: Effect,
  angle: number,
  size: Size,
  soft?: number | null
): Promise<Uint8ClampedArray<ArrayBuffer>> {
  const rgba = rgbaOf((await effectDrawn(P, effect, angle, size)).pixels, size.width * size.height);
  const sigma = effectBlurSigma(soft, size);
  if (sigma > 0) return blurOver(rgba, size, sigma, effectUnderlay(P, effect, angle, soft));
  return new Uint8ClampedArray(rgba);
}
