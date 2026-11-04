/* The selection composed on its grid (exportgrid.ts), each palette in its own picture: its PNG's pixels, or its own
   SVG, its ids made its own. It comes with the export screen, never with a page's start. */
import type { Size } from "@grabient/engine/view.ts";
import { type GridOptions, gridLayout, placeOf } from "./exportgrid.ts";
import { t } from "./i18n.ts";

/** A tile of the grid: where it stands in the image's raw pixels (the SVG's units), and in the image's own pixels,
    whole numbers that meet the next tile's as the scaled grid has them, so its picture is drawn at its own pixels and
    laid with no scaling. */
export interface GridTile {
  raw: { x: number; y: number };
  x: number;
  y: number;
  width: number;
  height: number;
}
/** The grid's image for a count of palettes: its layout (gridLayout), each tile in its place, and the corners as a
    radius in raw pixels. */
export function gridTiles(count: number, input: GridOptions) {
  const layout = gridLayout(count, input);
  const o = layout.options;
  const sx = layout.width / layout.rawWidth;
  const sy = layout.height / layout.rawHeight;
  const tiles = Array.from({ length: count }, (_, index): GridTile => {
    const raw = placeOf(index, o, layout.columns);
    const x = Math.round(raw.x * sx);
    const y = Math.round(raw.y * sy);
    return {
      raw,
      x,
      y,
      width: Math.max(1, Math.round((raw.x + o.width) * sx) - x),
      height: Math.max(1, Math.round((raw.y + o.height) * sy) - y)
    };
  });
  return { layout, tiles, corner: ((o.radius / 100) * Math.min(o.width, o.height)) / 2 };
}

/** An SVG document's ids, and every reference to them, under a prefix of its own: a tile's, so the pictures of a grid
    never take each other's gradients, filters or clips. The documents its images carry (data URIs) keep theirs, which
    are their own. */
export function scopeSvgIds(svg: string, prefix: string): string {
  const ids = new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  if (!ids.size) return svg;
  const at = (id: string) => (ids.has(id) ? `${prefix}${id}` : id);
  return svg
    .replace(/(\sid=")([^"]+)"/g, (_, head: string, id: string) => `${head}${at(id)}"`)
    .replace(/url\(#([^)\s]+)\)/g, (_, id: string) => `url(#${at(id)})`)
    .replace(/(href=")#([^"]+)"/g, (_, head: string, id: string) => `${head}#${at(id)}"`);
}

const escaped = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/** The selection on its grid as one SVG: each tile its palette's own SVG at the cell's raw size (`svg`, a whole
    document: its gradient, or its effect's first frame), its ids its own (scopeSvgIds), standing in its place
    clipped to its corners and titled with its palette's address. A design app reads each as a frame of its own. */
export function composeGridSvg(
  tiles: readonly { svg: string; title: string }[],
  input: GridOptions
): string {
  if (!tiles.length) throw new Error(t("Select a palette first."));
  const { layout, tiles: places, corner } = gridTiles(tiles.length, input);
  const o = layout.options;
  const body = tiles.map((tile, index) => {
    const { x, y } = places[index].raw;
    const prefix = `t${index + 1}-`;
    const own = scopeSvgIds(tile.svg.trim(), prefix).replace(
      /^<svg\b([^>]*)>/,
      (_, attrs: string) => `<svg x="${x}" y="${y}"${attrs.replace(/\s(x|y)="[^"]*"/g, "")}>`
    );
    const clip = corner > 0 ? `${prefix}corners` : null;
    const defs = clip
      ? `<defs><clipPath id="${clip}"><rect x="${x}" y="${y}" width="${o.width}" height="${o.height}" rx="${corner}" ry="${corner}"/></clipPath></defs>`
      : "";
    return `<g${clip ? ` clip-path="url(#${clip})"` : ""}><title>${escaped(tile.title)}</title>${defs}${own}</g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.rawWidth} ${layout.rawHeight}">\n${body.join("\n")}\n</svg>`;
}

/* the page's own work between two tiles drawn */
const nextTask = () => new Promise<void>(done => setTimeout(done));

/** The grid as a PNG, its ground clear, or a JPEG on white paper, each tile the picture `picture` draws of its palette
    at the tile's own pixels, laid clipped to its corners. One tile is drawn at a time with the page's own work
    between, so a large selection never holds the page. Browser only. */
export async function composeGridImage(
  count: number,
  input: GridOptions,
  type: "image/png" | "image/jpeg",
  picture: (index: number, size: Size) => Promise<CanvasImageSource>
): Promise<Blob> {
  if (!count) throw new Error(t("Select a palette first."));
  const { layout, tiles, corner } = gridTiles(count, input);
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(t("This browser can't export images."));
  if (type === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const scale = Math.min(layout.width / layout.rawWidth, layout.height / layout.rawHeight);
  for (const [index, tile] of tiles.entries()) {
    const drawn = await picture(index, { width: tile.width, height: tile.height });
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(tile.x, tile.y, tile.width, tile.height, corner * scale);
    ctx.clip();
    ctx.drawImage(drawn, tile.x, tile.y, tile.width, tile.height);
    ctx.restore();
    if (index < tiles.length - 1) await nextTask();
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error(t("Couldn't export the image.")))),
      type,
      type === "image/jpeg" ? 0.92 : undefined
    )
  );
}
