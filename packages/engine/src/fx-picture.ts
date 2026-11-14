/* The vector effects' stills as pictures the server draws (EFFECT_KINDS' picture: the aurora's): the first frame in the
   design square at FX_PICTURE_SIDE, coded as WebP (apps/web server/images/fx-picture.ts), which a page's first screen
   (server/fx-still.ts) and a list's cards (FxArt.tsx) lay over their box as a vector still is laid, centered and
   covering it, so the player, laying out the box itself, starts on that frame. Its address names the still as a page's
   holder does (effect.ts fxStillKey), with the picture's version. These are the addresses alone, which a list's start
   carries; the drawing (fx-picture-draw.ts) loads with the first picture a server draws. */
import { type FxLook, fxStillKey, hasPicture, type VectorKind } from "./effect.ts";

/** The picture's version, in its address and in what it is kept under: counted up when its pixels change (the
    effect's drawing, the side or the coding), so no picture drawn before is served for it. fx-picture.test.ts pins
    the drawing to it. */
export const FX_PICTURE_VERSION = 1;
/** Its side: the one design square every box covers. A list's card is 333 to 461 px wide on a desktop and up to some
    1,200 device pixels on a phone (an iPhone Pro Max's 398 px at 3), which 1024 keeps within a fifth of its own. */
export const FX_PICTURE_SIDE = 1024;
/** libwebp's quality for it: the aurora's 18 to 29 KiB, a level and a half to three off its CPU frame on average at a
    card's size and 8 to 16 at worst in a hundred (quality 80 is 10% heavier for a fifth of a level). */
export const FX_PICTURE_QUALITY = 75;
/** libwebp's method for it: 3 codes the aurora's in some 210 ms where its default 4 takes 260, to the same bytes, and
    2 in 170 to 6% more. */
export const FX_PICTURE_METHOD = 3;

/** The address of the picture a still's name names (fxStillKey): a look fxPictureOf draws as a picture, its ground
    none. */
export const fxPictureAddress = (key: string): string =>
  `/api/fx-still?k=${encodeURIComponent(key)}&v=${FX_PICTURE_VERSION}`;

/** The picture a still is shown as, its address and its CSS background covering any box, centered, as a vector still
    is laid (fx-still.ts fxCover); null where it is its vector still. A picture is drawn for a look a list's cards all
    share: an effect whose still the server draws (EFFECT_KINDS' picture), standing at 90 with no shape, path, steps
    or zoom of its own, whatever its ground. Its range is clear in the picture and its ground lies under it as a color,
    the very pixels its CPU drawing makes of the two (aurora-render.ts lays the range over the light so), so a ground
    changes no picture and asks for none. Any other look, an angle a list sets or a shape or a path the editor picks,
    is its vector still, drawn on the page: a list's Angle field or its ground's picker, moving, asks the server for
    nothing (John, 14 Nov 2026: changing an aurora list's background, his browser was blocked by the zone's rate
    limit, every card having asked for a picture at every color). */
export function fxPictureOf(
  kind: VectorKind,
  seed: string,
  look: FxLook
): { address: string; paint: string } | null {
  if (!hasPicture(kind) || look.angle !== 90 || look.shape || look.path) return null;
  if (look.steps !== null || look.zoom !== null) return null;
  const address = fxPictureAddress(fxStillKey(kind, seed, { ...look, shape: null, bg: null }));
  return {
    address,
    paint: `url("${address}") 50% 50% / cover no-repeat${look.bg ? `, ${look.bg}` : ""}`
  };
}
