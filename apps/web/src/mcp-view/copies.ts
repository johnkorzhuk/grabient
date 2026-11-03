import { drawnStops } from "@grabient/engine/soft.ts";
import { DEFAULT_SIZE } from "@grabient/engine/view.ts";
import { exportGridImage, gridLayout, paintGrid } from "@grabient/ui/exportgrid.ts";
import { grainCanvas } from "./grain.ts";
import { stopsOf, type Tile } from "./tiles.ts";

/* The palette as a PNG, drawn in the frame from its seed, since the frame fetches nothing. An app's clipboard may refuse
   an image (Claude's desktop app) or be missing (ChatGPT), so a copy answers whether it happened and the view saves the
   file or shows its address instead. A saved file is the same drawing, handed to the app as its bytes. */

const ONE = { ...DEFAULT_SIZE, columns: 1, gap: 0, padding: 0, radius: 0 };

/** The palette's PNG at the size a gallery card's PNG copies: a soft view's blurred stops (engine/soft.ts), and a
    grained one's tile over them, a speck a pixel from the picture's corner, as the site lays it. */
export function pngOf(tile: Tile): Promise<Blob> {
  const item = tile.soft ? { ...tile, drawn: drawnStops(stopsOf(tile), tile) } : tile;
  if (!tile.grain) return exportGridImage([item], ONE);
  const layout = gridLayout(1, ONE);
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const context = canvas.getContext("2d");
  if (!context) return exportGridImage([item], ONE);
  paintGrid(context, [item], ONE);
  const grain = grainCanvas(tile.grain);
  const pattern = grain && context.createPattern(grain, "repeat");
  if (pattern) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = pattern;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  return new Promise((done, fail) =>
    canvas.toBlob(blob => (blob ? done(blob) : fail(new Error("no PNG"))), "image/png")
  );
}

/** Bytes in base64, as a request to the app carries a file. Built a run at a time: one call with every byte as an
    argument overflows the stack. */
export function base64Of(bytes: Uint8Array): string {
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
}

export const pngBase64 = async (tile: Tile): Promise<string> =>
  base64Of(new Uint8Array(await (await pngOf(tile)).arrayBuffer()));

/* an app that refused an image once refuses the next, so later presses skip the drawing and the request */
let refused = false;

/** The PNG onto the clipboard, begun inside the press: Safari takes the image as a promise while it is drawn. False
    where the frame takes no image. */
export async function copyPng(tile: Tile): Promise<boolean> {
  if (refused || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": pngOf(tile) })]);
    return true;
  } catch (error) {
    if ((error as { name?: string } | null)?.name === "NotAllowedError") refused = true;
    return false;
  }
}
