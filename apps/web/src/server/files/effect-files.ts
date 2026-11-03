/* A palette's effect (fluted glass, blob, silk, rosette) as files, which load with the first one asked for. The page
   background is two files whose address is the whole setting:
     <link rel="stylesheet" href="https://grabient.com/{seed}.css?style=glass">
     <script src="https://grabient.com/{seed}.js?style=glass" async></script>
   The stylesheet paints the effect's first frame behind the page, as its palette's page paints it (glass-still.ts,
   blob-still.ts, fx-still.ts), its soft and grain as the page's stage lays them, and being a stylesheet it is in the
   page's first paint; the script (src/embed) plays the effect from that very frame. The still is a layer fixed behind
   the page, where the script's canvas comes: the glass's, the silk's and the rosette's canvases are opaque and fade in
   over it, and the blob's is clear around the blob, so its still goes in the frame the canvas comes (the script marks
   the root). Both and the moving SVG are the engine's writing (engine/effect-code.ts), which the editor's copies are
   too. */
import { type Effect, type EffectFinish, effectAddressParts } from "@grabient/engine/effect.ts";
import { effectSize, effectStylesheet, effectSvg } from "@grabient/engine/effect-code.ts";
import { readingName, readPalette } from "@grabient/engine/name.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { resolveSize, type SizeChoice } from "@grabient/engine/view.ts";
import { ANIMATION, EMBEDDED } from "../../lib/cache.ts";
import { effectCard } from "../../lib/page-meta.ts";
import { isLinkPreview } from "../crawlers.ts";
import { svgPreview } from "./preview.ts";

/** /{seed}.css?style=: the effect's first frame behind the page, finished by the view's soft and grain, `grain` the
    grain's tile as a CSS image. */
export const effectCssAnswer = (
  origin: string,
  seed: string,
  P: Palette,
  effect: Effect,
  angle: number,
  finish: EffectFinish = {},
  grain?: string
): Response =>
  new Response(effectStylesheet(P, seed, effect, angle, origin, finish, grain), {
    headers: { ...ANIMATION, ...EMBEDDED, "Content-Type": "text/css; charset=utf-8" }
  });

/** /{seed}.svg?style=glass or blob: the moving SVG, 800 by 400 for the glass and 500 by 500 for the blob unless the
    address asks; an app previewing a posted link gets a page whose card is the effect's first frame (preview.ts). */
export function effectSvgAnswer(
  request: Request,
  origin: string,
  seed: string,
  P: Palette,
  effect: Effect,
  angle: number,
  asked: SizeChoice | null | undefined,
  finish: EffectFinish = {},
  grain?: string
): Response {
  const size = resolveSize(asked, effectSize(effect));
  if (isLinkPreview(request)) {
    const sized = asked ? [`w=${size.width}`, `h=${size.height}`] : [];
    return svgPreview({
      address: `${origin}/${seed}.svg?${[...effectAddressParts(effect, angle, finish), ...sized].join("&")}`,
      card: `${origin}${effectCard(seed, effect, angle, finish)}`,
      title: `${readingName(readPalette(P))} · Grabient`,
      about:
        effect.kind === "glass"
          ? "An animated SVG of a Grabient palette: fluted glass with its colors drifting behind the ribs, moved by CSS alone."
          : effect.kind === "silk"
            ? "An animated SVG of a Grabient palette: its colors dyed into silk that drapes in soft folds, swaying, moved by SMIL alone."
            : effect.kind === "rosette"
              ? "An animated SVG of a Grabient palette: a rosette of petals in its colors, the rings rippling out from the heart, moved by CSS alone."
              : "An animated SVG of a Grabient palette: a frosted blob of its colors, drifting, moved by CSS alone."
    });
  }
  return new Response(effectSvg(P, seed, effect, angle, size, origin, finish, grain), {
    headers: { ...ANIMATION, ...EMBEDDED, "Content-Type": "image/svg+xml; charset=utf-8" }
  });
}
