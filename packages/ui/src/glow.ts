import type { Style } from "@grabient/engine/view.ts";

/* The card whose glow is lit, for the water behind the page. A palette card or a collection's mosaic lights a blurred
   copy of its picture under itself on hover or focus, and the water takes that light in as paint. One card at a time,
   the last lit. It is a plain module value: the water reads it on every frame it draws and nothing else does, so
   lighting a card triggers no reactive update. The water never reads it under reduced motion. */
export interface GlowTile {
  /** the stops the picture is drawn with */
  stops: readonly string[];
  style?: Style;
  angle?: number;
  /** where the tile sits in the picture, as fractions of its box: the whole picture by default, a cell of a mosaic */
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}
export interface GlowSource {
  /** the picture: the glow lies under its box */
  el: Element;
  /** what the picture shows; a new array is a new picture */
  tiles: readonly GlowTile[];
  /** whether the card still glows: one taken out of its collection does not */
  on?: () => boolean;
}

let lit: GlowSource | null = null;
const same = (a: readonly GlowTile[], b: readonly GlowTile[]) =>
  a.length === b.length &&
  a.every(
    (t, i) =>
      t.stops === b[i].stops &&
      t.style === b[i].style &&
      t.angle === b[i].angle &&
      t.x === b[i].x &&
      t.y === b[i].y &&
      t.w === b[i].w &&
      t.h === b[i].h
  );

/** A card's glow is lit: the water takes it in. Lit again with the same picture, nothing changes. */
export function glowOn(el: Element, tiles: readonly GlowTile[], on?: () => boolean): void {
  if (lit?.el === el && same(lit.tiles, tiles)) return;
  lit = { el, tiles, on };
}
/** A card's glow is out: what it let into the water drifts off. */
export function glowOff(el: Element): void {
  if (lit?.el === el) lit = null;
}
/** The card lit now, while it is on the page and still glows. */
export function glowing(): GlowSource | null {
  if (lit && !lit.el.isConnected) lit = null;
  return lit && (!lit.on || lit.on()) ? lit : null;
}

/** While the water takes a card's glow in, the glow under a card drops to 40%: the water carries the rest, and both at
    full strength read as twice the glow. Set once on the root, which every card's glow reads (`--card-glow`). */
export function waterTakesGlow(on: boolean): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  if (on) root.setProperty("--card-glow", "0.4");
  else root.removeProperty("--card-glow");
}
