/* A palette's fluted glass or blob behind any page, by two files whose address is the whole setting:
     <link rel="stylesheet" href="https://grabient.com/{seed}.css?style=glass">
     <script src="https://grabient.com/{seed}.js?style=glass" async></script>
   The stylesheet paints the effect's first frame behind the page, as its palette's page paints it (glass-still.ts,
   blob-still.ts), and being a stylesheet it is in the page's first paint; the script (src/embed) plays the effect from
   that very frame. The still is a layer fixed behind the page, where the script's canvas comes: the glass's canvas is
   opaque and fades in over it, and the blob's is clear around the blob, so its still goes in the frame the canvas
   comes (the script marks the root). This module loads with the first stylesheet asked for. */
import { blobStillBackground } from "@grabient/engine/blob.ts";
import type { Effect } from "@grabient/engine/effect.ts";
import { glassStillBackground } from "@grabient/engine/glass.ts";
import { glassColors } from "@grabient/engine/glass-colors.ts";
import type { Palette } from "@grabient/engine/palette.ts";

/** The attribute the script sets on the page's root once its canvas shows (src/embed/mount.ts). */
export const EMBED_PLAYING = "data-grabient-playing";

/** The effect's first frame as a background, all it depends on named: the glass's colors and angle, the blob's look. */
export const effectStill = (P: Palette, effect: Effect, angle: number): string =>
  effect.kind === "glass"
    ? glassStillBackground(glassColors(P), angle)
    : blobStillBackground(P, { speed: 1, fps: null, still: true, ...effect.look });

/** The stylesheet: the still on a layer fixed behind the page, under the page's own content and over its ground. */
export function effectCss(P: Palette, effect: Effect, angle: number, credit: string): string {
  const layer = `html::before {\n  content: "";\n  position: fixed;\n  inset: 0;\n  z-index: -1;\n  pointer-events: none;\n  background: ${effectStill(P, effect, angle)};\n}\n`;
  const handover =
    effect.kind === "blob"
      ? `html[${EMBED_PLAYING}]::before {\n  background-image: none;\n}\n`
      : "";
  return `/* ${credit} */\n${layer}${handover}`;
}
