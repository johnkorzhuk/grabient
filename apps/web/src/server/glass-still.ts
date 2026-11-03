/* The fluted glass's stills on a page, drawn by the server. A palette's first screen (Boot.tsx) leaves an empty holder
   naming the still it shows (data-glass-still: the ribs' angle, the shape and the palette's colors); this writes the
   glass's first frame into the head as a style for that name, the one design as a background covering the holder. A
   rule rather than markup in the holder, since the browser draws the first screen again as the page starts, and the
   editor's own holders (GlassLayer.tsx, GlassArt.tsx) take the same rule: the still stands through both, the browser
   keeping the image it decoded, and the player picks up from it without a seam.
   The first frame is a picture (images/still.ts): the design at STILL_SIZE square, drawn by the glass's CPU renderer
   and coded as WebP, asked for from the head with a preload, so it is there for the first paint where it can be. Under it lies the still's field, its colors where they lie without the ribs, which shows until the picture
   lands. The still as an SVG filter cost a browser that paints without its GPU, as Lighthouse's does, more than a
   second a paint, and several at 4K.
   Every other holder (a list's cards, the header's swatch) gets the field in its place (glass.ts's
   glassFieldBackground), which the browser's still then fades over (GlassArt.tsx). As many as a first screen shows
   (stills.ts). It loads with the first page that has a holder. */
import { glassFieldBackground } from "@grabient/engine/glass.ts";
import { readStillKey } from "@grabient/engine/glass-colors.ts";
import { GLASS_FIELD_STYLE, GLASS_STILL_STYLE } from "../features/editor/glass-draw.ts";
import { FIRST_SCREEN_STILLS, holderNames, intoHead } from "./stills.ts";

/** The still's picture's version, in its address and in what it is kept under: counted up when its pixels change
    (engine/glass.ts, glass-render.ts, its size or its coding), so no picture drawn before is served for it. */
export const STILL_VERSION = 1;
export const STILL_DRAWING = `glass-still-${STILL_VERSION}`;
/** Its side: one picture for every box, covering it as the still's design does. At 2048 it stays within about a
    level and a half of the player on a phone, a desktop and a 4K screen; at 1024 a phone's folds go soft. */
export const STILL_SIZE = 2048;
/** libwebp's quality for it: about 90 KB, its worst one pixel in a hundred five levels off the player's, as the SVG's
    were. */
export const STILL_QUALITY = 85;

/** The address of the picture of the still a holder's key names (engine/glass-colors.ts's glassStillKey). Its `k` is
    the key with `-` between its parts and no `#`, which needs no escapes: 90|0|#fae4c3,#ffb999,… is
    90-0-fae4c3-ffb999-…. */
export const stillAddress = (key: string) =>
  `/api/still?k=${key.replace(/[|,]/g, "-").replaceAll("#", "")}&v=${STILL_VERSION}`;

/** The key an address's `k` spells, which readStillKey reads, refusing what is no key. */
export function stillKeyOf(k: string): string {
  const [angle = "", shape = "", ...colors] = k.split("-");
  return `${angle}|${shape}|${colors.map(color => `#${color}`).join(",")}`;
}

const FIRST_SCREEN = /<div[^>]*\sdata-glass-still="([^"]*)"/;

/** The page with its first screen's still in its head, and the field of every other still its holders name. */
export function glassStills(html: string): string {
  const key = FIRST_SCREEN.exec(html)?.[1];
  const named = key ? readStillKey(key) : null;
  const picture = key && named ? stillAddress(key) : null;
  const still =
    key && named && picture
      ? `<link rel="preload" as="image" href="${picture.replaceAll("&", "&amp;")}" fetchpriority="high">` +
        `<style id="${GLASS_STILL_STYLE}" data-key="${key}">[data-glass-still="${key}"]{background:url("${picture}") 50% 50%/cover no-repeat,${glassFieldBackground(named.colors, named.angle, named.shape)}}</style>`
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
