/* What a copy of a soft or grained picture carries (lib/picture.ts paints it on the page): the blurred stops once the
   blur's code is here, and the grain's tile as a data URI, read from the file the page's pictures lay over, so a
   copied stylesheet or SVG works wherever it lands. Loaded with the editor's copies alone. */
import type { Stop } from "@grabient/engine/curve.ts";
import type { Size, Style } from "@grabient/engine/view.ts";
import { drawn, grainSrc } from "../../lib/picture.ts";
import { loadSoft } from "../../lib/soft-load.ts";

/** A view's stops as its picture draws them, once the blur's code is here. */
export async function drawnSoon(
  stops: readonly Stop[],
  view: { style: Style; soft?: number | null }
) {
  if (view.soft) await loadSoft();
  return drawn(stops, view);
}

/* the latest few made, by strength and size: the selection's tiles share one */
const PICTURES_KEPT = 4;
const pictures = new Map<string, Promise<string>>();

/** The grain over a picture of `size` as one image's data URI, which a copied SVG carries in itself
    (lib/grain-image.ts: a design app imports it as one layer, one to one), its code loaded with the first. */
export function grainPictureUrl(grain: number, size: Size): Promise<string> {
  const key = `${grain}:${size.width}x${size.height}`;
  let made = pictures.get(key);
  if (!made) {
    made = import("../../lib/grain-image.ts").then(m => m.grainImageUri(grain, size));
    made.catch(() => pictures.delete(key));
    pictures.set(key, made);
    if (pictures.size > PICTURES_KEPT) pictures.delete(pictures.keys().next().value!);
  }
  return made;
}

/** The grain's data as code shows it, elided: a copy writes it whole (grainDataUrl). */
export const GRAIN_SHOWN = "data:image/png;base64,…";

/* each strength's tile as a data URI, read once from the file the page's pictures lay over */
const dataUrls = new Map<number, Promise<string>>();

/** The grain's tile at a strength as a data URI, which a copied stylesheet or SVG carries in itself. */
export function grainDataUrl(grain: number): Promise<string> {
  let made = dataUrls.get(grain);
  if (!made) {
    made = fetch(grainSrc(grain))
      .then(answer => {
        if (!answer.ok) throw new Error(`grain ${grain}: ${answer.status}`);
        return answer.blob();
      })
      .then(
        blob =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          })
      );
    made.catch(() => dataUrls.delete(grain));
    dataUrls.set(grain, made);
  }
  return made;
}
