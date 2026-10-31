/* The glass's still recolored in place (glass-draw.ts's recolorStill): loaded with the still's code, which a still
   drawn here needs first, so a palette page's start carries neither. */
import type { GlassField } from "@grabient/engine/glass.ts";

/** The still `svg` shows, drawn by glassSvg for the field `was`, given the colors of `next` in their place: a palette
    changes only its discs' colors and its ground's, so the markup and the rib maps its filter reads, images decoded
    once, stay. False where the markup is not what glassSvg wrote for `was`, and the still is drawn whole. */
export function recolor(svg: Element, was: GlassField, next: GlassField): boolean {
  const discs = svg.querySelectorAll(":scope > defs > radialGradient");
  const ground = svg.querySelector(":scope > g > rect");
  /* each disc's gradient in the discs' order, its stops in the disc's color, over the ground: checked on the markup as
     it stands, so a change to how the glass is written draws it whole rather than wrong */
  if (
    !ground ||
    discs.length !== was.discs.length ||
    discs.length !== next.discs.length ||
    ground.getAttribute("fill") !== was.base ||
    [...discs].some(
      (g, i) =>
        g.children.length < 2 ||
        [...g.children].some(stop => stop.getAttribute("stop-color") !== was.discs[i].color)
    )
  )
    return false;
  discs.forEach((g, i) => {
    const color = next.discs[i].color;
    for (const stop of g.children)
      if (stop.getAttribute("stop-color") !== color) stop.setAttribute("stop-color", color);
  });
  if (next.base !== was.base) ground.setAttribute("fill", next.base);
  return true;
}
