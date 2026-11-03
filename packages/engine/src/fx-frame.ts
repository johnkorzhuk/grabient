/* An effect's first frame as a picture of it is drawn, the server's (/{seed}.png?style=, a card under the wordmark at
   /api/og?style=) and the editor's Copy PNG and Download PNG alike, each at its own size: the frame the editor shows
   before the effect moves, drawn on the CPU, the glass by its renderer (glass-render.ts), the blob as its still
   (blob.ts), the silk and the rosette by their drawings (silk-render.ts, rosette-render.ts). A soft or a grain finishes
   it as the site paints it (fx-finish.ts): the frame blurred by a share of its longer side over the palette's gradient,
   toward clear where it lets the page through, the grain over all. Each one's code comes with the first picture that
   needs it, so the module holds none of it. */
import type { Effect, EffectFinish } from "./effect.ts";
import type { Palette } from "./palette.ts";
import type { Size } from "./view.ts";

/* The frame's pixels as its drawing gives them: four bytes a pixel, straight alpha, or three where the blob stands on
   a ground that covers the box. They are opaque but for a blob whose ground lets the page through, or that has none.
   A card, which cannot be clear, lays the blob on its near-black or near-white (blobBackdrop), which `backdrop`
   names. */
async function drawn(
  P: Palette,
  effect: Effect,
  angle: number,
  size: Size,
  card: boolean
): Promise<{ pixels: Uint8Array | Uint8ClampedArray; backdrop?: readonly number[] }> {
  /* the silk and the rosette by their CPU drawings: about 0.1 s for a card, 0.35 s for the largest picture */
  if (effect.kind === "silk" || effect.kind === "rosette") {
    const look = { angle, shape: effect.look.shape };
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
  const [model, render, colors] = await Promise.all([
    import("./glass.ts"),
    import("./glass-render.ts"),
    import("./glass-colors.ts")
  ]);
  const { geometry, window } = render.glassCover(size, 1, angle, effect.look.shape);
  // one frame, drawn without holding the rib map and each pixel's read for frames to come
  return {
    pixels: render
      .glassRenderer(geometry, window, undefined, true)
      .frame(model.glassField(geometry, colors.glassColors(P)), 0)
  };
}

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
/* Three bytes a pixel as four, each opaque. */
function rgbaOf(rgb: ArrayLike<number>, n: number): Uint8ClampedArray<ArrayBuffer> {
  const rgba = new Uint8ClampedArray(n * 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgba[i] = rgb[j];
    rgba[i + 1] = rgb[j + 1];
    rgba[i + 2] = rgb[j + 2];
    rgba[i + 3] = 255;
  }
  return rgba;
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
    four where the picture lets the page through (a blob's ground that does, or none), as a PNG takes it. A card is
    opaque: a blob stands on its near-black or near-white, which a soft one's edges thin to where no ground of its own
    covers the box. */
export async function effectFrame(
  P: Palette,
  effect: Effect,
  angle: number,
  size: Size,
  options: { card?: boolean; finish?: EffectFinish } = {}
): Promise<Uint8Array<ArrayBuffer>> {
  const n = size.width * size.height;
  const frame = await drawn(P, effect, angle, size, options.card ?? false);
  const three = frame.pixels.length === n * 3;
  const { soft, grain } = options.finish ?? {};
  if (!soft && !grain) {
    if (three || effect.kind === "blob") return frame.pixels as Uint8Array<ArrayBuffer>;
    return rgbOf(frame.pixels, n);
  }
  const finished = await finishedOf(P, effect, angle, size, frame, { soft, grain });
  if (frame.backdrop) return onColor(finished, frame.backdrop, n);
  return opaque(finished)
    ? rgbOf(finished, n)
    : new Uint8Array(finished.buffer as ArrayBuffer, finished.byteOffset, finished.length);
}

/* The frame finished: four bytes a pixel, straight alpha. Its soft edges go to the palette's gradient under it, as the
   site's do; a blob with no ground that covers the box has none under it, and thins toward the page, or on a card
   toward the backdrop it stands on there. */
async function finishedOf(
  P: Palette,
  effect: Effect,
  angle: number,
  size: Size,
  frame: Awaited<ReturnType<typeof drawn>>,
  finish: EffectFinish
): Promise<Uint8Array | Uint8ClampedArray> {
  const n = size.width * size.height;
  const rgba = frame.pixels.length === n * 3 ? rgbaOf(frame.pixels, n) : frame.pixels;
  if (!finish.soft && !finish.grain) return rgba;
  const fx = await import("./fx-finish.ts");
  const underlay = fx.effectUnderlay(P, effect, angle, finish.soft);
  return fx.finishPixels(rgba, size, finish, underlay);
}

/** The same frame as straight RGBA, four bytes a pixel, as a canvas takes it: the editor's Copy PNG and Download PNG,
    which are the server's picture of the same address. */
export async function effectRgba(
  P: Palette,
  effect: Effect,
  angle: number,
  size: Size,
  finish: EffectFinish = {}
): Promise<Uint8ClampedArray<ArrayBuffer>> {
  const frame = await drawn(P, effect, angle, size, false);
  const out = await finishedOf(P, effect, angle, size, frame, finish);
  return out instanceof Uint8ClampedArray && out.buffer instanceof ArrayBuffer
    ? (out as Uint8ClampedArray<ArrayBuffer>)
    : Uint8ClampedArray.from(out);
}
