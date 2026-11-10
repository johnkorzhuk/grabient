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
import { type Effect, fxLookOf, isVectorKind } from "./effect.ts";
import { blurOver, effectBlurSigma, effectUnderlay } from "./fx-finish.ts";
import { glassColors } from "./glass-colors.ts";
import { isKitKind } from "./kit/kinds.ts";
import type { Palette } from "./palette.ts";
import type { Size } from "./view.ts";

/** A frame's pixels as its drawing gives them: four bytes a pixel, straight alpha, or three where the blob stands on a
    ground that covers the box. They are opaque but where the effect's picture lets the page through (effect.ts
    effectBare): a blob whose ground does, or that has none, and the strings on a ground that does. A card, which cannot
    be clear, lays such a picture over the ground a picture that cannot be clear takes, which `backdrop` names: the
    blob on its near-black or near-white (blobBackdrop), the strings' ground over their designed one (stringsSolid). */
export interface EffectDrawn {
  pixels: Uint8Array | Uint8ClampedArray;
  backdrop?: readonly number[];
}

/** An effect's first frame at a size, unfinished; a vector effect's frame at `t` seconds of its loop at speed 1 where
    one is asked (the glass and the blob draw their first alone), and an effect the pointer moves (the dimple) with
    the pointer at `at`, in the box 0 to 1 each way, where one is said. */
export async function effectDrawn(
  P: Palette,
  effect: Effect,
  angle: number,
  size: Size,
  card = false,
  t = 0,
  at: readonly [number, number] | null = null
): Promise<EffectDrawn> {
  /* the vector effects by their CPU drawings: about 0.1 s for a card, 0.35 s for the largest picture (the strings'
     about four times that). A field effect's card, coded, takes 0.21 s, 0.36 to 0.37 s soft and grained, in an
     isolate that has written its still first, as one serving its pages has (kit/render.ts, 8 Nov 2026: the
     sandstone's, its kernel read once a pixel; a kernel at the kit's budget read three times a pixel, as the zen
     garden's was while the site played it, 0.44 to 0.46 s and up to 0.65); its picture is drawn within a card's
     pixels (apps/web lib/picture-size.ts KIT_PICTURE_BOUNDS), where four cards' took that kernel 1.8 to 2.4 s */
  if (isVectorKind(effect.kind)) {
    const look = fxLookOf(effect.look, angle);
    if (isKitKind(effect.kind)) {
      const [registry, scene, render] = await Promise.all([
        import("./kit/registry.ts"),
        import("./kit/scene.ts"),
        import("./kit/render.ts")
      ]);
      const def = registry.kitEffect(effect.kind);
      return { pixels: render.kitRender(scene.kitScene(def, P, look, size), t) };
    }
    switch (effect.kind) {
      case "papercut": {
        const [model, render] = await Promise.all([
          import("./papercut.ts"),
          import("./papercut-render.ts")
        ]);
        return { pixels: render.renderPapercut(model.papercutScene(P, look, size), t) };
      }
      case "rosette": {
        const [model, render] = await Promise.all([
          import("./rosette.ts"),
          import("./rosette-render.ts")
        ]);
        const sc = model.rosetteScene(P, look, size);
        /* the first frame as the still holds its petals; any other with every petal a frame of the loop shows */
        return {
          pixels: t
            ? render.renderRosette(sc, model.rosettePhase(sc, t))
            : render.renderRosette(sc, 0, true)
        };
      }
      case "strings": {
        const [model, render] = await Promise.all([
          import("./strings.ts"),
          import("./strings-render.ts")
        ]);
        const scene = model.stringsScene(P, look, size);
        if (!card || scene.alpha >= 1) return { pixels: render.renderStrings(scene, t) };
        /* a card is never clear: its ground over the designed one, which its soft edges thin to */
        return {
          pixels: render.renderStrings(model.stringsSolid(scene), t),
          backdrop: scene.backdrop.map(v => Math.round(v * 255))
        };
      }
      case "dimple": {
        /* a card of 1200 by 630 in 38 ms, the largest picture in 136 (dimple-render.ts, 10 Nov 2026) */
        const [model, render] = await Promise.all([
          import("./dimple.ts"),
          import("./dimple-render.ts")
        ]);
        return {
          pixels: render.renderDimple(
            model.dimpleScene(P, look, size),
            at && [at[0] * size.width, at[1] * size.height]
          )
        };
      }
      case "silk": {
        const [model, render] = await Promise.all([
          import("./silk.ts"),
          import("./silk-render.ts")
        ]);
        return { pixels: render.renderSilk(model.silkScene(P, look, size), t) };
      }
    }
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
