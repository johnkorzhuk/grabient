/* What the effects' scripts share (glass.ts, blob.ts): a palette's fluted glass or blob behind any page, set by the
   script's own address, which is the whole setting:
     <link rel="stylesheet" href="https://grabient.com/{seed}.css?style=glass">
     <script src="https://grabient.com/{seed}.js?style=glass" async></script>
   The script is the same for every palette. It reads the palette and the effect from its address and plays the effect
   on a canvas fixed behind the page, from the first frame the stylesheet of the same address painted in the page's
   first paint (server/files/effect-files.ts), or from one it paints itself where the page has no such stylesheet. The
   canvas shows once its first frame, the still's own, is drawn: the glass fading in over the still, the blob (clear
   around itself) taking the still's place in one frame. Where WebGL 2 is missing the still stays, and a reader who asks
   for less motion sees the first frame held. It writes no markup and no style attribute, only CSSOM properties, so a
   page with a strict Content Security Policy runs it. */
import { decodePalette } from "@grabient/engine/codec.ts";
import { type Effect, type EffectKind, parseEffect } from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { parseView } from "@grabient/engine/view.ts";

/** effect-files.ts's EMBED_PLAYING: the root's mark once the canvas shows, which takes the blob's still away. */
const PLAYING = "data-grabient-playing";
/** How long the glass's canvas takes to fade in over its still, as the editor's does (GlassStage.tsx). */
const FADE_MS = 700;

export interface EmbedEffect {
  kind: EffectKind;
  /** the effect's first frame as a background, as the stylesheet paints it */
  still(P: Palette, effect: Effect, angle: number): string;
  /** the player on the canvas, telling `drawn` once its first frame is; null where WebGL 2 is missing */
  play(
    canvas: HTMLCanvasElement,
    P: Palette,
    effect: Effect,
    angle: number,
    drawn: () => void
  ): unknown;
}

/** Whether the page paints the still already: it links the stylesheet of this script's palette, or holds its rule. */
function painted(address: URL, name: string): boolean {
  const links = document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]');
  for (const link of links) {
    const href = new URL(link.href, location.href);
    if (href.origin === address.origin && href.pathname === `/${name}.css`) return true;
  }
  return getComputedStyle(document.documentElement, "::before").backgroundImage !== "none";
}

export function mount(embed: EmbedEffect): void {
  const script = document.currentScript;
  if (!(script instanceof HTMLScriptElement) || !script.src) return;
  const address = new URL(script.src, location.href);
  const file = address.pathname.slice(address.pathname.lastIndexOf("/") + 1);
  let name: string;
  try {
    name = decodeURIComponent(file.replace(/\.js$/, ""));
  } catch {
    return;
  }
  const P = decodePalette(name);
  const effect = parseEffect(address.searchParams);
  if (!P || !effect || effect.kind !== embed.kind) return;
  const angle = parseView(address.searchParams).angle;

  const start = () => {
    const root = document.documentElement;
    const layer = document.createElement("div");
    layer.setAttribute("aria-hidden", "true");
    const box = layer.style;
    box.position = "fixed";
    box.inset = "0";
    box.zIndex = "-1";
    box.pointerEvents = "none";
    box.overflow = "hidden";
    const own = !painted(address, name);
    if (own) box.background = embed.still(P, effect, angle);
    const canvas = document.createElement("canvas");
    const look = canvas.style;
    look.position = "absolute";
    look.inset = "0";
    look.display = "block";
    look.width = "100%";
    look.height = "100%";
    look.opacity = "0";
    layer.append(canvas);
    document.body.prepend(layer);
    embed.play(canvas, P, effect, angle, () =>
      /* a frame after its first was drawn: a canvas shown in the frame it was first drawn in may not fade in */
      requestAnimationFrame(() => {
        if (embed.kind === "glass") {
          look.transition = `opacity ${FADE_MS}ms ease-in-out`;
          look.opacity = "1";
          return;
        }
        root.setAttribute(PLAYING, "");
        if (own) box.backgroundImage = "none";
        look.opacity = "1";
      })
    );
  };
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
}
