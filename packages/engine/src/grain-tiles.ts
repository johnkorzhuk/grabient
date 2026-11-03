/* The grain's tile as a picture lays it: its side, and its image over a box in an SVG. They stand apart from grain.ts,
   whose specks and PNGs only what draws the grain loads, since the gradient's CSS and SVG writers (css.ts, svg.ts),
   which every page and the Worker's first request read, need no more than these; grain.ts names them too. */
import type { Size } from "./view.ts";

/** The tile's side, px: one speck a pixel. */
export const GRAIN_SIDE = 128;

const fmt = (v: number) => Number(v.toFixed(3)).toString();

/** The grain over a box as SVG: one image of it at the box's size (grain.ts grainImagePng, `src` its data URI), a
    speck a pixel from its corner, clipped to the box's corners where it rounds them (`rx`). Browsers draw it as they
    drew the tile repeated, and Figma's importer takes it one to one as one layer, where it stretches a pattern's
    image over the whole box and takes each tile a <use> lays as a rectangle of its own. The document names the xlink
    namespace. */
export function grainSvg(
  src: string,
  size: Size,
  ids: { tile: string; clip: string } = { tile: "gfx-grain", clip: "gfx-grain-box" },
  rx = 0
): string {
  const { width: w, height: h } = size;
  const image = `<image id="${ids.tile}" width="${w}" height="${h}" xlink:href="${src}" style="image-rendering:pixelated"`;
  if (rx <= 0) return `${image}/>`;
  return `<defs><clipPath id="${ids.clip}"><rect width="${w}" height="${h}" rx="${fmt(rx)}" ry="${fmt(rx)}"/></clipPath></defs>${image} clip-path="url(#${ids.clip})"/>`;
}
