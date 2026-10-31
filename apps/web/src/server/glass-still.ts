/* The fluted glass's still on a palette's page, drawn by the server. The page's first screen (Boot.tsx) leaves an
   empty holder naming the still it shows (data-glass-still: the ribs' angle and the palette's colors); this writes the
   glass's first frame into the head as a style for that name, the one design as a background covering the holder. A
   rule rather than markup in the holder, since the browser draws the first screen again as the page starts, and the
   editor's own holders (GlassLayer.tsx, GlassArt.tsx) take the same rule: the still stands through both, the browser
   keeping the image it decoded, and the player picks up from it without a seam. It loads with the first page that has
   a holder; a design's ribs are worked out once an isolate for each angle. */
import {
  GLASS_DESIGN,
  type GlassGeometry,
  glassDataUri,
  glassField,
  glassGeometry,
  glassSvg
} from "@grabient/engine/glass.ts";
import { readStillKey } from "@grabient/engine/glass-colors.ts";
import { GLASS_STILL_STYLE } from "../features/editor/glass-draw.ts";

const designs = new Map<number, GlassGeometry>();
const HOLDER = /<div[^>]*\sdata-glass-still="([^"]*)"/;

/** The page with the still of its holder's name in its head. */
export function glassStills(html: string): string {
  const key = HOLDER.exec(html)?.[1] ?? "";
  const named = readStillKey(key);
  if (!named) return html;
  let design = designs.get(named.angle);
  if (!design) {
    design = glassGeometry(GLASS_DESIGN, named.angle);
    designs.set(named.angle, design);
  }
  const svg = glassSvg(design, glassField(design, named.colors), { still: true, cover: true });
  const style = `<style id="${GLASS_STILL_STYLE}" data-key="${key}">[data-glass-still="${key}"]{background:url("${glassDataUri(svg)}") 50% 50%/cover no-repeat}</style>`;
  const head = html.indexOf("</head>");
  return head < 0 ? html : html.slice(0, head) + style + html.slice(head);
}
