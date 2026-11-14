/* The vector effects' stills on a page (engine/effect.ts's EFFECT_KINDS, engine/fx-still.ts), drawn by the server as the
   blob's are (blob-still.ts). A palette's first screen (Boot.tsx) and a list's cards (FxArt.tsx) leave empty holders
   naming the still each shows (data-fx-still: the kind, the palette, the angle and the shape, all its first frame
   depends on); this writes each name's first frame into the head as a style, the one design covering whatever box
   holds it. The editor's holder (FxLayer.tsx) and a card's take the same rule, so the still stands through both and
   the player picks up from it without a seam. A still is a plain SVG of shapes and gradients, no filter: about 1.5 KB
   in the compressed page (the papercut's, its cut paths, about 3) and a few milliseconds to paint, so a page names as
   many as its first screen shows (stills.ts). Where the effect's still is a picture the server draws (EFFECT_KINDS'
   picture: the aurora's) and its look is one drawn as a picture (engine/fx-picture.ts fxPictureOf: as designed, upright,
   any ground, which lies under it as a color), the rule names the picture's address in place of the drawing, and the
   first is asked for from the head with a preload, so it is there for the first paint where it can be: no still is
   drawn here, where the aurora's took some 12 ms and 34 KiB each. It loads with the first page that has a holder. */
import { decodePalette } from "@grabient/engine/codec.ts";
import { fxPictureOf } from "@grabient/engine/fx-picture.ts";
import { fxStillBackground, readFxStillKey } from "@grabient/engine/fx-still.ts";
import { FX_STILL_STYLE } from "../features/editor/fx-draw.ts";
import { FIRST_SCREEN_STILLS, holderNames, intoHead } from "./stills.ts";

/** The stills an isolate drew, by name, the latest KEPT of them: a papercut's takes several milliseconds (its cuts
    traced from its field, where the silk's and the rosette's take a few tenths), and a list's first screen names
    sixteen, which the next request for that list names again. About 15 KB a papercut's. */
const KEPT = 128;
const drawn = new Map<string, string>();

/** A still's background by its name, drawn once while it is kept, or its picture's where its look is drawn as one
    (engine/fx-picture.ts fxPictureOf), with the picture's address; null for a name no page wrote. */
function stillOf(key: string): { paint: string; picture: string | null } | null {
  const kept = drawn.get(key);
  if (kept !== undefined) return { paint: kept, picture: null };
  const named = readFxStillKey(key);
  const P = named ? decodePalette(named.seed) : null;
  if (!named || !P) return null;
  const picture = fxPictureOf(named.kind, named.seed, named.look);
  if (picture) return { paint: picture.paint, picture: picture.address };
  const paint = fxStillBackground(named.kind, P, named.look);
  drawn.set(key, paint);
  if (drawn.size > KEPT) drawn.delete(drawn.keys().next().value as string);
  return { paint, picture: null };
}

/** The page with the stills its holders name in its head, the names it paints on the style, and a preload of the first
    where it is a picture. */
export function fxStills(html: string): string {
  const rules: string[] = [];
  const painted: string[] = [];
  let preload = "";
  for (const key of holderNames(html, "data-fx-still")) {
    if (painted.length === FIRST_SCREEN_STILLS) break;
    const still = stillOf(key);
    if (still === null) continue;
    /* the page's first still, a list's first card or a palette's stage, asked for at once where it is a picture: the
       largest paint of its first screen, often */
    if (still.picture && !painted.length)
      preload = `<link rel="preload" as="image" href="${still.picture.replaceAll("&", "&amp;")}" fetchpriority="high">`;
    rules.push(`[data-fx-still="${key}"]{background:${still.paint}}`);
    painted.push(key);
  }
  return rules.length
    ? intoHead(
        html,
        `${preload}<style id="${FX_STILL_STYLE}" data-key="${painted.join(" ")}">${rules.join("")}</style>`
      )
    : html;
}
