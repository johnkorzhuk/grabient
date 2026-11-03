/* The grain's tile in the view, made in the frame from its hash (engine/grain.ts), since the frame fetches nothing: one
   tile a strength, a speck a CSS pixel, as the site lays it over a picture. */
import { GRAIN_SIDE, grainTile } from "@grabient/engine/grain.ts";

const canvases = new Map<number, HTMLCanvasElement | null>();
const datas = new Map<number, string>();

/** The tile at a grain on a canvas, made once a strength; none where the frame draws no canvas. */
export function grainCanvas(grain: number): HTMLCanvasElement | null {
  let canvas = canvases.get(grain);
  if (canvas === undefined) {
    canvas = document.createElement("canvas");
    canvas.width = GRAIN_SIDE;
    canvas.height = GRAIN_SIDE;
    const context = canvas.getContext("2d");
    if (context)
      context.putImageData(
        new ImageData(new Uint8ClampedArray(grainTile(grain)), GRAIN_SIDE, GRAIN_SIDE),
        0,
        0
      );
    else canvas = null;
    canvases.set(grain, canvas);
  }
  return canvas;
}

/* the tile at a grain as its PNG's base64; empty where the frame draws no canvas */
function tileBase64(grain: number): string {
  let data = datas.get(grain);
  if (data === undefined) {
    data =
      grainCanvas(grain)
        ?.toDataURL("image/png")
        .replace(/^data:image\/png;base64,/, "") ?? "";
    datas.set(grain, data);
  }
  return data;
}

/** The tile at a grain as a data URI, which a copied SVG carries in itself; none for none. */
export const grainData = (grain?: number): string | undefined => {
  const data = grain ? tileBase64(grain) : "";
  return data ? `data:image/png;base64,${data}` : undefined;
};
/** The tile as a CSS image, which a copied stylesheet carries; none for none. */
export const grainImage = (grain?: number): string | undefined => {
  const data = grain ? tileBase64(grain) : "";
  return data ? `url("data:image/png;base64,${data}")` : undefined;
};
/** A picture's background with the grain's tile laid over it at its strength. */
export const withGrain = (background: string, grain?: number): string => {
  const image = grainImage(grain);
  return image ? `${image} 0 0 / ${GRAIN_SIDE}px ${GRAIN_SIDE}px, ${background}` : background;
};
