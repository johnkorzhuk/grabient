import {
  isSwatchFormat,
  type SwatchPalette,
  swatchFile,
  swatchName,
  swatchPalette
} from "@grabient/engine/swatches.ts";
import { viewSearch } from "@grabient/engine/view.ts";
import { zipFiles } from "@grabient/engine/zip.ts";
import { locale, t } from "@grabient/i18n";
import {
  cellFor,
  type ExportSettings,
  exportGridCss,
  exportGridImage,
  exportGridSvg,
  gridFor
} from "@grabient/ui/exportgrid.ts";
import type { Format } from "@grabient/ui/FormatStrip.tsx";
import { colorFormat } from "../../lib/color-format.ts";
import { copyImage, downloadFile, writeText } from "../../lib/files.ts";
import type { SelectedPalette } from "./selection.ts";

/* The selection's copies and files, all from the grid the export column's settings describe, so the image shown is the
   image taken. A copy and the SVG are the whole selection as one image; a PNG or JPEG download is a file for each
   palette at the column's size and corners, zipped when there are several; a swatch file holds every palette. Every
   function rejects with words the page can put on its status line, in the reader's language. */

type AutoSize = { width: number; height: number };
const fileName = (p: SelectedPalette) => `grabient-${p.seed}`;
const addressOf = (p: SelectedPalette) => `${location.origin}/${p.seed}${viewSearch(p)}`;
const language = () => ({ t, locale: locale() });
const swatches = (items: readonly SelectedPalette[]) =>
  items
    .map(item => swatchPalette(item.seed, item, location.origin, undefined, language()))
    .filter((p): p is SwatchPalette => !!p);
const swatchBlob = (format: Parameters<typeof swatchFile>[0], palettes: readonly SwatchPalette[]) =>
  new Blob([swatchFile(format, palettes, t("Selection"))], { type: "application/octet-stream" });

/** The selection onto the clipboard, as the column shows it; a picture saves instead where none can be copied. */
export async function copySelection(
  items: readonly SelectedPalette[],
  settings: ExportSettings,
  format: Format,
  autoSize?: AutoSize
): Promise<"copied" | "downloaded"> {
  if (!items.length) throw new Error(t("Select a palette first."));
  if (isSwatchFormat(format)) {
    const text = swatchFile(format, swatches(items), t("Selection"));
    await writeText(typeof text === "string" ? text : new TextDecoder().decode(text));
    return "copied";
  }
  const grid = gridFor(items.length, settings, autoSize);
  if (format === "css") await writeText(exportGridCss(items, location.origin, colorFormat()));
  else if (format === "svg") await writeText(exportGridSvg(items, grid, location.origin));
  else if (format === "url") await writeText(items.map(addressOf).join("\n"));
  else {
    const image = exportGridImage(items, grid, format === "jpeg" ? "image/jpeg" : "image/png");
    if (format === "png" && (await copyImage(image))) return "copied";
    downloadFile(`grabient-selection.${format === "jpeg" ? "jpeg" : "png"}`, await image);
    return "downloaded";
  }
  return "copied";
}

/** The selection's files: one SVG or CSS of all of it, a picture of each palette, or a swatch file of every one. */
export async function downloadSelection(
  items: readonly SelectedPalette[],
  settings: ExportSettings,
  format: Format,
  autoSize?: AutoSize
): Promise<void> {
  if (!items.length) throw new Error(t("Select a palette first."));
  if (isSwatchFormat(format)) {
    downloadFile(swatchName(t("Selection"), format), swatchBlob(format, swatches(items)));
    return;
  }
  const grid = gridFor(items.length, settings, autoSize);
  if (format === "svg")
    downloadFile(
      "grabient-selection.svg",
      new Blob([exportGridSvg(items, grid, location.origin)], { type: "image/svg+xml" })
    );
  else if (format === "css")
    downloadFile(
      "grabient-selection.css",
      new Blob([exportGridCss(items, location.origin, colorFormat())], { type: "text/css" })
    );
  else if (format === "url") await writeText(items.map(addressOf).join("\n"));
  else {
    /* drawn one at a time, so a full selection's large pictures never share a canvas */
    const kind = format === "jpeg" ? "jpeg" : "png";
    const cell = cellFor(settings, autoSize);
    const draw = (item: SelectedPalette) => exportGridImage([item], cell, `image/${kind}`);
    if (items.length === 1)
      return downloadFile(`${fileName(items[0])}.${kind}`, await draw(items[0]));
    const files: { name: string; data: Uint8Array }[] = [];
    for (const [i, item] of items.entries()) {
      const data = new Uint8Array(await (await draw(item)).arrayBuffer());
      files.push({ name: `${String(i + 1).padStart(2, "0")}-${fileName(item)}.${kind}`, data });
    }
    downloadFile(
      "grabient-selection.zip",
      new Blob([zipFiles(files)], { type: "application/zip" })
    );
  }
}
