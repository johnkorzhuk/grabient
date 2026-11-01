/* The fluted glass's stills on a page, drawn by the server. A palette's first screen (Boot.tsx) leaves an empty holder
   naming the still it shows (data-glass-still: the ribs' angle, the shape and the palette's colors); this writes the
   glass's first frame into the head as a style for that name, the one design as a background covering the holder. A
   rule rather than markup in the holder, since the browser draws the first screen again as the page starts, and the
   editor's own holders (GlassLayer.tsx, GlassArt.tsx) take the same rule: the still stands through both, the browser
   keeping the image it decoded, and the player picks up from it without a seam. A design's ribs are worked out once an
   isolate for each angle.
   Every other holder (a list's cards, the header's swatch) gets the still's field in its place: its colors where they
   lie, without the ribs (glass.ts's glassFieldBackground), which the browser's still then fades over (GlassArt.tsx).
   The still's filter takes the browser about a tenth of a second to paint at a card's size, which a first screen of
   cards would add to its first paint; the field takes none. As many as a first screen shows (stills.ts). It loads
   with the first page that has a holder. */
import { glassFieldBackground, glassStillBackground } from "@grabient/engine/glass.ts";
import { readStillKey } from "@grabient/engine/glass-colors.ts";
import { GLASS_FIELD_STYLE, GLASS_STILL_STYLE } from "../features/editor/glass-draw.ts";
import { FIRST_SCREEN_STILLS, holderNames, intoHead } from "./stills.ts";

const FIRST_SCREEN = /<div[^>]*\sdata-glass-still="([^"]*)"/;

/** The page with its first screen's still in its head, and the field of every other still its holders name. */
export function glassStills(html: string): string {
  const key = FIRST_SCREEN.exec(html)?.[1];
  const named = key ? readStillKey(key) : null;
  const still = named
    ? `<style id="${GLASS_STILL_STYLE}" data-key="${key}">[data-glass-still="${key}"]{background:${glassStillBackground(named.colors, named.angle, named.shape)}}</style>`
    : "";
  const rules: string[] = [];
  const fields: string[] = [];
  for (const name of holderNames(html, "data-glass-still")) {
    if (fields.length === FIRST_SCREEN_STILLS) break;
    const field = name === key ? null : readStillKey(name);
    if (!field) continue;
    rules.push(
      `[data-glass-still="${name}"]{background:${glassFieldBackground(field.colors, field.angle, field.shape)}}`
    );
    fields.push(name);
  }
  return intoHead(
    html,
    still +
      (rules.length
        ? `<style id="${GLASS_FIELD_STYLE}" data-key="${fields.join(" ")}">${rules.join("")}</style>`
        : "")
  );
}
