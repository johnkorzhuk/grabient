/* The vector effects' stills on a page (engine/effect.ts's EFFECT_KINDS, engine/fx-still.ts), drawn by the server as
   the blob's are (blob-still.ts). A palette's first screen (Boot.tsx) and a list's cards (FxArt.tsx) leave empty
   holders naming the still each shows (data-fx-still: the kind, the palette, the angle and the shape, all its first
   frame depends on); this writes each name's first frame into the head as a style, the one design covering whatever
   box holds it. The editor's holder (FxLayer.tsx) and a card's take the same rule, so the still stands through both
   and the player picks up from it without a seam. A still is a plain SVG of shapes and gradients, no filter: about 1.5
   KB in the compressed page (the papercut's, its cut paths, about 3; the aurora's, a small picture of its light whose
   own palette is the palette's colors, about 0.6 past the first of its look, whose picture is 11) and a few
   milliseconds to paint, so a page names as many as its first screen shows (stills.ts). Where a look is drawn as a
   picture too (engine/fx-picture.ts fxPictureOf: the aurora's, as designed, upright, any ground), the vector still is
   still the first paint, so the page shows the effect as soon as it loads (John, 14 Nov 2026, of a gradient flashing
   before the aurora: "The idea a user using the effect would get a vector to load first, so that something is visible
   as soon as the page loads while the shader picks up"), and the picture is asked for from the head at a low priority,
   which the page lays in the vector still's place once it has come (FxArt.tsx, FxLayer.tsx). Never the two at once:
   under the picture's soft edge, which lets what is under it through, the vector still showed 20 levels off. A stage's
   holder names its still a second time (data-fx-stage), and a name a stage says is painted as the still for a box that
   fills a screen, wherever the page lays it (the aurora's has a picture of three times a card's pixels:
   engine/fx-still.ts fxStillSvg): a card's still over a whole screen showed its picture's pixels (John, 17 Nov 2026:
   "it looks pixelated, the colors are off"). One rule a name, so a page carries one still of its stage's, not a card's
   beside it. It loads with the first page that has a holder. */
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

/** A still's background by its name, a card's or a stage's, drawn once while it is kept, and the address of its
    picture where its look is drawn as one too (engine/fx-picture.ts fxPictureOf); null for a name no page wrote. */
function stillOf(key: string, stage = false): { paint: string; picture: string | null } | null {
  const named = readFxStillKey(key);
  const picture = named ? (fxPictureOf(named.kind, named.seed, named.look)?.address ?? null) : null;
  const name = stage ? `${key} stage` : key;
  const kept = drawn.get(name);
  if (kept !== undefined) return { paint: kept, picture };
  const P = named ? decodePalette(named.seed) : null;
  if (!named || !P) return null;
  const paint = fxStillBackground(named.kind, P, named.look, stage);
  drawn.set(name, paint);
  if (drawn.size > KEPT) drawn.delete(drawn.keys().next().value as string);
  return { paint, picture };
}

/** The page with the stills its holders name in its head, the names it paints on the style, and a preload at a low
    priority of each picture its holders lay in their stills' place (one a picture, which grounds share). */
export function fxStills(html: string): string {
  const rules: string[] = [];
  const painted: string[] = [];
  const pictures = new Set<string>();
  /* the names a stage says: each is painted as a stage's still */
  const staged = new Set(holderNames(html, "data-fx-stage"));
  for (const key of holderNames(html, "data-fx-still")) {
    if (painted.length === FIRST_SCREEN_STILLS) break;
    const still = stillOf(key, staged.has(key));
    if (still === null) continue;
    if (still.picture) pictures.add(still.picture);
    rules.push(`[data-fx-still="${key}"]{background:${still.paint}}`);
    painted.push(key);
  }
  const preloads = [...pictures]
    .map(
      address =>
        `<link rel="preload" as="image" href="${address.replaceAll("&", "&amp;")}" fetchpriority="low">`
    )
    .join("");
  return rules.length
    ? intoHead(
        html,
        `${preloads}<style id="${FX_STILL_STYLE}" data-key="${painted.join(" ")}">${rules.join("")}</style>`
      )
    : html;
}
