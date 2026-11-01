/* What the effects' scripts share (glass.ts, blob.ts): a palette's fluted glass or blob behind any page, set by the
   script's own address, which is the whole setting:
     <link rel="stylesheet" href="https://grabient.com/{seed}.css?style=glass">
     <script src="https://grabient.com/{seed}.js?style=glass" async></script>
   The script is the same for every palette. It reads the palette and the effect from its address and plays the effect
   on a canvas fixed behind the page, from the first frame the stylesheet of the same address painted in the page's
   first paint (server/files/effect-files.ts), or the same rules in the page's own <style> (the editor's Copy HTML);
   where the page has neither, it adopts those rules itself as soon as it runs. The canvas shows once its first frame,
   the still's own, is drawn: the glass fading in over a still the page painted, the blob (clear around itself) taking
   the still's place in one frame. Where WebGL 2 is missing the still stays, and for a reader who asks for less motion the still is the
   picture and no context is made. A lost context brings the still back until the browser restores the context. It
   writes no markup and no style attribute, only CSSOM, so a page with a strict Content Security Policy and Trusted
   Types runs it. A page plays one effect: a second script, the same or another, leaves it be. */
import { decodePalette } from "@grabient/engine/codec.ts";
import {
  type Effect,
  type EffectKind,
  EMBED_PLAYING,
  effectLayerCss,
  parseEffect
} from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { parseView } from "@grabient/engine/view.ts";

/** How long the glass's canvas takes to fade in over its still, as the editor's does (GlassStage.tsx). */
const FADE_MS = 700;
/** How far into the page's life its context waits for the page's first paint: one made while the GPU paints the still
    waits on that painting, and the page's thread with it. */
const PAINT_WAIT_MS = 2000;
/** How long a stylesheet of the still on its way is waited for before the script paints the still itself. */
const SHEET_WAIT_MS = 3000;
/** How many times the effect plays again on a context the browser restores before the still stays. */
const AGAIN_MAX = 3;
/* the mark of the page's one effect, in the registry every script of the page shares */
const MOUNTED = Symbol.for("grabient-effect");

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
  ): { destroy(): void } | null;
}

const waited = (ms: number, work: (done: () => void) => void): Promise<void> =>
  new Promise(resolve => {
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, ms);
    work(done);
  });

/** Whether the page paints the still already: its own CSS paints html::before, from the stylesheet of this script's
    palette or its rules in a <style>. What a stylesheet paints is read once it has come: one of this palette still on
    its way is waited for, while the page loads. A link is no proof, since a stylesheet a policy refused or that never
    came still has a sheet in some browsers. */
async function pagePaints(address: URL, name: string): Promise<boolean> {
  const painted = () =>
    getComputedStyle(document.documentElement, "::before").backgroundImage !== "none";
  const coming = [
    ...document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]')
  ].filter(link => {
    const href = new URL(link.href, location.href);
    return href.origin === address.origin && href.pathname === `/${name}.css` && !link.sheet;
  });
  if (!painted() && coming.length && document.readyState !== "complete")
    await waited(SHEET_WAIT_MS, done => {
      for (const link of coming) {
        link.addEventListener("load", done, { once: true });
        link.addEventListener("error", done, { once: true });
      }
      addEventListener("load", done, { once: true });
    });
  return painted();
}

/** Done once the page has painted, a frame later, or once its first seconds have gone. */
const firstPaint = (): Promise<void> =>
  waited(Math.max(0, PAINT_WAIT_MS - performance.now()), done => {
    if (!PerformanceObserver.supportedEntryTypes?.includes("paint")) return done();
    const observer = new PerformanceObserver(list => {
      if (!list.getEntries().length) return;
      observer.disconnect();
      requestAnimationFrame(() => requestAnimationFrame(done));
    });
    observer.observe({ type: "paint", buffered: true });
  });

export function mount(embed: EmbedEffect): void {
  const script = document.currentScript;
  const page = document as Document & { [MOUNTED]?: true };
  if (!(script instanceof HTMLScriptElement) || !script.src || page[MOUNTED]) return;
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
  page[MOUNTED] = true;
  const angle = parseView(address.searchParams).angle;
  const root = document.documentElement;

  /* the still: the page's own, else the stylesheet's rules adopted, which need no body. One the page painted is in
     its first paint, and the glass fades in over it; one adopted late may still be on its way to the screen when the
     player's first frame is drawn, which then shows at once rather than fade in from the page's own ground */
  let fade = true;
  const still = pagePaints(address, name).then(paints => {
    if (paints) return;
    fade = false;
    if (!("adoptedStyleSheets" in document)) return;
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(effectLayerCss(embed.kind, embed.still(P, effect, angle)));
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  });
  const body = new Promise<void>(resolve =>
    document.body
      ? resolve()
      : document.addEventListener("DOMContentLoaded", () => resolve(), { once: true })
  );

  let again = 0;
  const play = () => {
    const layer = document.createElement("div");
    layer.setAttribute("aria-hidden", "true");
    const box = layer.style;
    box.position = "fixed";
    box.inset = "0";
    box.zIndex = "-1";
    box.pointerEvents = "none";
    box.overflow = "hidden";
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
    let player: { destroy(): void } | null = null;
    /* a lost context drew nothing: the still comes back at once, and the effect plays again once the browser restores
       the context, on a canvas of its own */
    canvas.addEventListener("webglcontextlost", () => {
      look.transition = "none";
      look.opacity = "0";
      root.removeAttribute(EMBED_PLAYING);
    });
    canvas.addEventListener(
      "webglcontextrestored",
      () => {
        player?.destroy();
        layer.remove();
        if (++again <= AGAIN_MAX) play();
      },
      { once: true }
    );
    player = embed.play(canvas, P, effect, angle, () =>
      /* a frame after its first was drawn: a canvas shown in the frame it was first drawn in may not fade in */
      requestAnimationFrame(() => {
        if (embed.kind === "blob") root.setAttribute(EMBED_PLAYING, "");
        else if (fade) look.transition = `opacity ${FADE_MS}ms ease-in-out`;
        look.opacity = "1";
      })
    );
    if (!player) layer.remove();
  };
  /* for a reader who asks for less motion the still is the first frame held: no context until motion is welcome */
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  void Promise.all([still, body, firstPaint()]).then(function start() {
    if (motion.matches) motion.addEventListener("change", start, { once: true });
    else play();
  });
}
