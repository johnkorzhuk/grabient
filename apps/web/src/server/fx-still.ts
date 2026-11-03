/* The vector effects' stills on a page (silk, rosette, papercut: engine/fx-still.ts), drawn by the server as the
   blob's are (blob-still.ts). A palette's first screen (Boot.tsx) and a list's cards (FxArt.tsx) leave empty holders
   naming the still each shows (data-fx-still: the kind, the palette, the angle and the shape, all its first frame
   depends on); this writes each name's first frame into the head as a style, the one design covering whatever box
   holds it. The editor's holder (FxLayer.tsx) and a card's take the same rule, so the still stands through both and
   the player picks up from it without a seam. A still is a plain SVG of shapes and gradients, no filter: about 1.5 KB
   in the compressed page (the papercut's, its cut paths, about 3) and a few milliseconds to paint, so a page names as
   many as its first screen shows (stills.ts). It loads with the first page that has a holder. */
import { decodePalette } from "@grabient/engine/codec.ts";
import { fxStillBackground, readFxStillKey } from "@grabient/engine/fx-still.ts";
import { FX_STILL_STYLE } from "../features/editor/fx-draw.ts";
import { FIRST_SCREEN_STILLS, holderNames, intoHead } from "./stills.ts";

/** The stills an isolate drew, by name, the latest KEPT of them: a papercut's takes several milliseconds (its cuts
    traced from its field, where the silk's and the rosette's take a few tenths), and a list's first screen names
    sixteen, which the next request for that list names again. About 15 KB a papercut's. */
const KEPT = 128;
const drawn = new Map<string, string>();

/** A still's background by its name, drawn once while it is kept; null for a name no page wrote. */
function stillOf(key: string): string | null {
  const kept = drawn.get(key);
  if (kept !== undefined) return kept;
  const named = readFxStillKey(key);
  const P = named ? decodePalette(named.seed) : null;
  if (!named || !P) return null;
  const paint = fxStillBackground(named.kind, P, named.look);
  drawn.set(key, paint);
  if (drawn.size > KEPT) drawn.delete(drawn.keys().next().value as string);
  return paint;
}

/** The page with the stills its holders name in its head, the names it paints on the style. */
export function fxStills(html: string): string {
  const rules: string[] = [];
  const painted: string[] = [];
  for (const key of holderNames(html, "data-fx-still")) {
    if (painted.length === FIRST_SCREEN_STILLS) break;
    const paint = stillOf(key);
    if (paint === null) continue;
    rules.push(`[data-fx-still="${key}"]{background:${paint}}`);
    painted.push(key);
  }
  return rules.length
    ? intoHead(
        html,
        `<style id="${FX_STILL_STYLE}" data-key="${painted.join(" ")}">${rules.join("")}</style>`
      )
    : html;
}
