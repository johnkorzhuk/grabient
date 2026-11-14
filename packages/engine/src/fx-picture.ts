/* The vector effects' stills as pictures the server draws (EFFECT_KINDS' picture: the aurora's): the first frame in the
   design square at FX_PICTURE_SIDE, coded as WebP (apps/web server/images/fx-picture.ts), which a page's first screen
   (server/fx-still.ts) and a list's cards (FxArt.tsx) lay over their box as a vector still is laid, centered and
   covering it, so the player, laying out the box itself, starts on that frame. Its address names the still as a page's
   holder does (effect.ts fxStillKey), with the picture's version. These are the addresses alone, which a list's start
   carries; the drawing (fx-picture-draw.ts) loads with the first picture a server draws. */

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

/** The address of the picture of the still a holder names (fxStillKey). */
export const fxPictureAddress = (key: string): string =>
  `/api/fx-still?k=${encodeURIComponent(key)}&v=${FX_PICTURE_VERSION}`;

/** The picture as a CSS background covering any box, centered, as a vector still is laid (fx-still.ts fxCover). */
export const fxPictureBackground = (key: string): string =>
  `url("${fxPictureAddress(key)}") 50% 50% / cover no-repeat`;
