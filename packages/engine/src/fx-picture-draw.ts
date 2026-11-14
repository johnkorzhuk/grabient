/* The pixels of an effect's still as the server draws it as a picture (fx-picture.ts, EFFECT_KINDS' picture): its
   first frame in the design square, by its CPU drawing, the reference every other format is held to. The aurora's at
   1024 takes about 0.3 s. */
import { auroraScene } from "./aurora.ts";
import { renderAurora } from "./aurora-render.ts";
import type { FxLook, PictureKind } from "./effect.ts";
import type { Palette } from "./palette.ts";

/** The still's first frame in the design square of a side: RGBA rows from the top, straight alpha. */
export function fxPicturePixels(
  kind: PictureKind,
  P: Palette,
  look: FxLook,
  side: number
): Uint8ClampedArray<ArrayBuffer> {
  const pixels = new Uint8ClampedArray(side * side * 4);
  switch (kind) {
    case "aurora":
      renderAurora(auroraScene(P, look, { width: side, height: side }), 0, pixels);
      return pixels;
  }
}
