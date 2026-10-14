import { decodePalette } from "@grabient/engine";
import { cssLine } from "@grabient/engine/css.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import { paletteSvg } from "@grabient/engine/svg.ts";
import { isSwatchFormat, swatchFile } from "@grabient/engine/swatches.ts";
import { viewSearch } from "@grabient/engine/view.ts";
import { t } from "@grabient/i18n";
import { downloadFile } from "@grabient/ui/copy.ts";
import { exportGridImage } from "@grabient/ui/exportgrid.ts";
import type { Format } from "@grabient/ui/FormatStrip.tsx";
import { colorFormat } from "../../lib/color-format.ts";
import { copyImage, fileAddress, saveFile, swatchesOf, writeText } from "../../lib/files.ts";
import type { Drawn } from "../../lib/palette.ts";

/* What a card's strip hands over: the one palette as the card draws it, copied, saved as a file, or as the address of
   the file the site serves for it. Every function rejects with words the page can put on its line, in the reader's
   language. */

/** A card's picture as a file: two to one, as a share card is. */
const PICTURE = { width: 800, height: 400 };

const cannot = () => new Error(t("This palette can't be exported."));
const address = (p: Drawn) => `${location.origin}/${p.seed}${viewSearch(p)}`;
const name = (p: Drawn) => `grabient-${p.seed}`;
function stops(p: Drawn) {
  const palette = decodePalette(p.seed);
  if (!palette) throw cannot();
  return sampleStops(palette, Math.max(p.steps, palette.anchors.length));
}
const svg = (p: Drawn) =>
  paletteSvg(
    stops(p).map(stop => stop.hex),
    p.style,
    p.angle,
    { seed: p.seed, search: viewSearch(p), baseUrl: location.origin },
    PICTURE
  );
const picture = (p: Drawn, kind: "png" | "jpeg") =>
  exportGridImage([p], { ...PICTURE, columns: 1, gap: 0, padding: 0, radius: 0 }, `image/${kind}`);

/** The palette onto the clipboard. A PNG saves instead where no picture can be copied. */
export async function copyPalette(p: Drawn, format: Format): Promise<"copied" | "downloaded"> {
  if (format === "png" || format === "jpeg") {
    const image = picture(p, format);
    if (format === "png" && (await copyImage(image))) return "copied";
    downloadFile(`${name(p)}.${format}`, await image);
    return "downloaded";
  }
  if (isSwatchFormat(format)) {
    const file = swatchFile(format, [swatchesOf(p)]);
    if (typeof file !== "string") throw cannot();
    await writeText(file);
  } else if (format === "css") await writeText(cssLine(stops(p), p.style, p.angle, colorFormat()));
  else await writeText(format === "svg" ? svg(p) : address(p));
  return "copied";
}

/** The palette as a file. */
export async function downloadPalette(p: Drawn, format: Format): Promise<void> {
  if (format === "md" || format === "css" || isSwatchFormat(format)) return saveFile(p, format);
  if (format === "url") return writeText(address(p));
  if (format === "svg")
    return downloadFile(`${name(p)}.svg`, new Blob([svg(p)], { type: "image/svg+xml" }));
  const kind = format === "jpeg" ? "jpeg" : "png";
  downloadFile(`${name(p)}.${kind}`, await picture(p, kind));
}

/** The address of the palette's file onto the clipboard. */
export const linkPalette = (p: Drawn, format: Format): Promise<void> =>
  writeText(fileAddress(p, format));
