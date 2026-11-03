/* The grain's tile as a picture lays it: its side, and its tiles over a box in an SVG. They stand apart from grain.ts,
   whose specks and PNG only what draws the tile loads, since the gradient's CSS and SVG writers (css.ts, svg.ts),
   which every page and the Worker's first request read, need no more than these; grain.ts names them too. */
import type { Size } from "./view.ts";

/** The tile's side, px: one speck a pixel. */
export const GRAIN_SIDE = 128;

const fmt = (v: number) => Number(v.toFixed(3)).toString();

/** The grain's tile over a box as SVG: the tile's image once (a data URI) and a use of it per tile, clipped to the box
    (rounded by `rx`), a speck a pixel from its corner. Browsers draw it as a pattern; Figma's importer takes each use
    as a rectangle filled with the tile one to one, where it stretches a pattern's image over the whole box. The
    document names the xlink namespace. */
export function grainTilesSvg(
  src: string,
  size: Size,
  ids: { tile: string; clip: string } = { tile: "gfx-grain", clip: "gfx-grain-box" },
  rx = 0
): string {
  const { width: w, height: h } = size;
  const round = rx > 0 ? ` rx="${fmt(rx)}" ry="${fmt(rx)}"` : "";
  let uses = "";
  for (let y = 0; y < h; y += GRAIN_SIDE)
    for (let x = 0; x < w; x += GRAIN_SIDE)
      uses += `<use xlink:href="#${ids.tile}" x="${x}" y="${y}"/>`;
  return `<defs><clipPath id="${ids.clip}"><rect width="${w}" height="${h}"${round}/></clipPath><image id="${ids.tile}" width="${GRAIN_SIDE}" height="${GRAIN_SIDE}" xlink:href="${src}" style="image-rendering:pixelated"/></defs><g clip-path="url(#${ids.clip})">${uses}</g>`;
}
