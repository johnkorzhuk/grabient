/* A palette's fluted glass or blob behind any page, by two files whose address is the whole setting:
     <link rel="stylesheet" href="https://grabient.com/{seed}.css?style=glass">
     <script src="https://grabient.com/{seed}.js?style=glass" async></script>
   The stylesheet paints the effect's first frame behind the page, as its palette's page paints it (glass-still.ts,
   blob-still.ts), and being a stylesheet it is in the page's first paint; the script (src/embed) plays the effect from
   that very frame. The still is a layer fixed behind the page, where the script's canvas comes: the glass's canvas is
   opaque and fades in over it, and the blob's is clear around the blob, so its still goes in the frame the canvas
   comes (the script marks the root). This module loads with the first stylesheet asked for. */
import { BLOB_SIZE, blobStillBackground, blobSvg } from "@grabient/engine/blob.ts";
import { type Effect, effectAddressParts, effectLayerCss } from "@grabient/engine/effect.ts";
import { glassDesign, glassField, glassStillBackground, glassSvg } from "@grabient/engine/glass.ts";
import { glassColors } from "@grabient/engine/glass-colors.ts";
import { readingName, readPalette } from "@grabient/engine/name.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { DEFAULT_SIZE, resolveSize, type Size, type SizeChoice } from "@grabient/engine/view.ts";
import { ANIMATION, EMBEDDED } from "../../lib/cache.ts";
import { effectCard } from "../../lib/page-meta.ts";
import { isLinkPreview } from "../crawlers.ts";
import { svgPreview } from "./preview.ts";

/** The effect's first frame as a background, all it depends on named: the glass's colors and angle, the blob's look. */
export const effectStill = (P: Palette, effect: Effect, angle: number): string =>
  effect.kind === "glass"
    ? glassStillBackground(glassColors(P), angle)
    : blobStillBackground(P, { speed: 1, fps: null, still: true, ...effect.look });

/** The stylesheet: the still on a layer fixed behind the page, under the page's own content and over its ground
    (engine/effect.ts's effectLayerCss, which the editor's copied tags hold too). */
export const effectCss = (P: Palette, effect: Effect, angle: number, credit: string): string =>
  `/* ${credit} */\n${effectLayerCss(effect.kind, effectStill(P, effect, angle))}`;

/** The effect as a moving SVG, moved by CSS alone: the glass covering its box, its colors drifting behind the ribs, or
    the blob fitted in it; at speed 0 its first frame. */
export function effectSvg(
  P: Palette,
  effect: Effect,
  angle: number,
  size: Size,
  credit: string
): string {
  const still = effect.speed === 0;
  if (effect.kind === "blob")
    return blobSvg(
      P,
      { ...effect.look, speed: effect.speed || 1, fps: effect.fps, still },
      size,
      credit
    );
  const design = glassDesign(angle);
  return glassSvg(design, glassField(design, glassColors(P)), {
    still,
    speed: effect.speed || 1,
    cover: true
  }).replace('width="100%" height="100%"', `width="${size.width}" height="${size.height}"`);
}

/** /{seed}.svg?style=glass or blob: the moving SVG, 800 by 400 for the glass and 500 by 500 for the blob unless the
    address asks; an app previewing a posted link gets a page whose card is the effect's first frame (preview.ts). */
export function effectSvgAnswer(
  request: Request,
  origin: string,
  seed: string,
  P: Palette,
  effect: Effect,
  angle: number,
  asked: SizeChoice | null | undefined
): Response {
  const size = resolveSize(asked, effect.kind === "blob" ? BLOB_SIZE : DEFAULT_SIZE);
  if (isLinkPreview(request)) {
    const sized = asked ? [`w=${size.width}`, `h=${size.height}`] : [];
    return svgPreview({
      address: `${origin}/${seed}.svg?${[...effectAddressParts(effect, angle), ...sized].join("&")}`,
      card: `${origin}${effectCard(seed, effect, angle)}`,
      title: `${readingName(readPalette(P))} · Grabient`,
      about:
        effect.kind === "glass"
          ? "An animated SVG of a Grabient palette: fluted glass with its colors drifting behind the ribs, moved by CSS alone."
          : "An animated SVG of a Grabient palette: a frosted blob of its colors, drifting, moved by CSS alone."
    });
  }
  return new Response(effectSvg(P, effect, angle, size, `${origin}/${seed}`), {
    headers: { ...ANIMATION, ...EMBEDDED, "Content-Type": "image/svg+xml; charset=utf-8" }
  });
}
