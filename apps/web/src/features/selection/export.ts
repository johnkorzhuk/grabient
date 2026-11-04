import { decodePalette } from "@grabient/engine/codec.ts";
import { cssLine } from "@grabient/engine/css.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import { effectAddressParts } from "@grabient/engine/effect.ts";
import type { Namer } from "@grabient/engine/precise-names.ts";
import {
  isSwatchFormat,
  type SwatchPalette,
  swatchFile,
  swatchName,
  swatchPalette
} from "@grabient/engine/swatches.ts";
import { effectSoftShare, finishOf, type Size, viewSearch } from "@grabient/engine/view.ts";
import { zipFiles } from "@grabient/engine/zip.ts";
import { locale, t } from "@grabient/i18n";
import { downloadFile } from "@grabient/ui/copy.ts";
import { composeGridImage, composeGridSvg, gridTiles } from "@grabient/ui/exportcompose.ts";
import {
  cellFor,
  type ExportSettings,
  type GridOptions,
  gridFor
} from "@grabient/ui/exportgrid.ts";
import type { Format } from "@grabient/ui/FormatStrip.tsx";
import { colorFormat } from "../../lib/color-format.ts";
import { namesWithin } from "../../lib/color-names.ts";
import { copyImage, copySwatches, writeText } from "../../lib/files.ts";
import type { Taken } from "../editor/formats.ts";
import { nameOf } from "../gallery/drawing.ts";
import type { SelectedPalette } from "./selection.ts";

/* The selection's copies and files, all from the grid the export column's settings describe, so the image shown is the
   image taken, each palette in its look: its gradient with its soft and grain, or the first frame of the effect it
   played, as nothing moves here. A copy and the SVG are the whole selection as one image; a PNG or JPEG download is a
   file for each palette at the column's size and corners, zipped when there are several; a swatch file holds every
   palette. Each palette's picture and SVG are its own files' as the editor takes them (formats.ts, which comes with
   the first copy or download), and its CSS the rule its stylesheet would write. Every function rejects with words the
   page can put on its status line, in the reader's language. */

type AutoSize = { width: number; height: number };
const formats = () => import("../editor/formats.ts");
/* the effects' stills and the rules that finish them, with the first CSS of one */
const effectCode = () => import("@grabient/engine/effect-code.ts");
const embedCode = () => import("@grabient/engine/effect-embed.ts");

const fileName = (p: SelectedPalette) => `grabient-${p.seed}${p.effect ? `-${p.effect.kind}` : ""}`;
/** A palette's address in its look: its view, or the effect it plays, which its page plays as designed. */
const addressOf = (p: SelectedPalette) =>
  `${location.origin}/${p.seed}${
    p.effect ? `?${effectAddressParts(p.effect, p.angle, finishOf(p)).join("&")}` : viewSearch(p)
  }`;
const language = () => ({ t, locale: locale() });
const swatches = (items: readonly SelectedPalette[], names: Namer | null) =>
  items
    .map(item => swatchPalette(item.seed, item, location.origin, { language: language(), names }))
    .filter((p): p is SwatchPalette => !!p);
const swatchBlob = (format: Parameters<typeof swatchFile>[0], palettes: readonly SwatchPalette[]) =>
  new Blob([swatchFile(format, palettes, t("Selection"))], { type: "application/octet-stream" });

/* a palette as the editor's files take it, at a picture's pixels */
function takenOf(p: SelectedPalette, pixels: Size): Taken {
  const palette = decodePalette(p.seed);
  if (!palette) throw new Error(t("Invalid palette."));
  return {
    seed: p.seed,
    style: p.style,
    steps: p.steps,
    angle: p.angle,
    ...finishOf(p),
    size: null,
    pixels,
    stops: sampleStops(palette, p.steps),
    effect: p.effect ?? null,
    name: nameOf(p)
  };
}

/* the palettes on their grid as one picture, each drawn at its tile's own pixels */
async function gridImage(
  items: readonly SelectedPalette[],
  grid: GridOptions,
  type: "image/png" | "image/jpeg"
): Promise<Blob> {
  const { pictureCanvas } = await formats();
  return composeGridImage(items.length, grid, type, (index, size) =>
    pictureCanvas(takenOf(items[index], size))
  );
}

/* the palettes on their grid as one SVG, each its own SVG at a cell's size, its grain made at the pixels the grid
   shows it at */
async function gridSvg(items: readonly SelectedPalette[], grid: GridOptions): Promise<string> {
  const { stillSvg } = await formats();
  const { layout } = gridTiles(items.length, grid);
  const o = layout.options;
  const cell = { width: o.width, height: o.height };
  const shown = {
    width: Math.max(1, Math.round((o.width * layout.width) / layout.rawWidth)),
    height: Math.max(1, Math.round((o.height * layout.height) / layout.rawHeight))
  };
  const tiles: { svg: string; title: string }[] = [];
  for (const item of items)
    tiles.push({ svg: await stillSvg(takenOf(item, cell), shown), title: addressOf(item) });
  return composeGridSvg(tiles, grid);
}

/* the custom property a stylesheet holds a grain's tile in, once a strength */
const grainVar = (grain: number) => `--grabient-grain-${grain}`;
/* Every palette as a CSS rule in the reader's spelling, each under its address: a gradient's soft stops at their
   places, an effect's first frame as its stylesheet paints it (engine/effect-code.ts effectStill), its soft a blur by
   a share of the cell's longer side in pixels, as a rule is no page whose `vmax` it could take; the grain's tile at
   each strength held once in a custom property on the root, which every rule of that grain lays. */
async function gridCss(items: readonly SelectedPalette[], cell: Size): Promise<string> {
  const { drawnSoon, grainDataUrl } = await formats();
  const kind = colorFormat();
  const grains = [...new Set(items.flatMap(p => (p.grain ? [p.grain] : [])))].sort((a, b) => a - b);
  const held = grains.length
    ? `:root {\n${(
        await Promise.all(
          grains.map(async g => `  ${grainVar(g)}: url("${await grainDataUrl(g)}");`)
        )
      ).join("\n")}\n}\n\n`
    : "";
  const effects = items.some(p => p.effect) ? await Promise.all([effectCode(), embedCode()]) : null;
  const rules = await Promise.all(
    items.map(async (p, i) => {
      const palette = decodePalette(p.seed);
      if (!palette) throw new Error(t("Invalid palette."));
      const selector = `.palette-${i + 1}`;
      const grain = p.grain ? `var(${grainVar(p.grain)})` : undefined;
      if (p.effect && effects) {
        const [code, embed] = effects;
        const layers = code.effectLayers(palette, p.effect, p.angle, finishOf(p), grain);
        const sigma = p.soft ? effectSoftShare(p.soft) * Math.max(cell.width, cell.height) : 0;
        return `/* ${addressOf(p)} */\n${embed.effectRuleCss(
          selector,
          code.effectStill(palette, p.effect, p.angle),
          { ...layers, ...(sigma ? { blur: `blur(${sigma.toFixed(2)}px)` } : {}) }
        )}`;
      }
      const drawn = await drawnSoon(sampleStops(palette, p.steps), p);
      return `/* ${addressOf(p)} */\n${selector} {\n  ${cssLine(
        drawn.stops,
        drawn.style,
        p.angle,
        kind,
        {
          ...(drawn.at ? { at: drawn.at } : {}),
          ...(grain ? { grain } : {})
        }
      )}\n}\n`;
    })
  );
  return `${held}${rules.join("\n")}`;
}

/** The selection onto the clipboard, as the column shows it; a picture saves instead where none can be copied. */
export async function copySelection(
  items: readonly SelectedPalette[],
  settings: ExportSettings,
  format: Format,
  autoSize?: AutoSize
): Promise<"copied" | "downloaded"> {
  if (!items.length) throw new Error(t("Select a palette first."));
  if (isSwatchFormat(format)) {
    await copySwatches(names => swatchFile(format, swatches(items, names), t("Selection")));
    return "copied";
  }
  const grid = gridFor(items.length, settings, autoSize);
  if (format === "css")
    await writeText(await gridCss(items, { width: grid.width, height: grid.height }));
  else if (format === "svg") await writeText(await gridSvg(items, grid));
  else if (format === "url") await writeText(items.map(addressOf).join("\n"));
  else {
    const image = gridImage(items, grid, format === "jpeg" ? "image/jpeg" : "image/png");
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
    downloadFile(
      swatchName(t("Selection"), format),
      swatchBlob(format, swatches(items, await namesWithin()))
    );
    return;
  }
  const grid = gridFor(items.length, settings, autoSize);
  if (format === "svg")
    downloadFile(
      "grabient-selection.svg",
      new Blob([await gridSvg(items, grid)], { type: "image/svg+xml" })
    );
  else if (format === "css")
    downloadFile(
      "grabient-selection.css",
      new Blob([await gridCss(items, { width: grid.width, height: grid.height })], {
        type: "text/css"
      })
    );
  else if (format === "url") await writeText(items.map(addressOf).join("\n"));
  else {
    /* drawn one at a time, so a full selection's large pictures never share a canvas */
    const kind = format === "jpeg" ? "jpeg" : "png";
    const cell = cellFor(settings, autoSize);
    const draw = (item: SelectedPalette) => gridImage([item], cell, `image/${kind}`);
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
