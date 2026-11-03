/* What the effects' scripts share (glass.ts, blob.ts, silk.ts, rosette.ts, papercut.ts): a palette's effect behind any
   page, set by the script's own address, which is the whole setting:
     <link rel="stylesheet" href="https://grabient.com/{seed}.css?style=glass">
     <script src="https://grabient.com/{seed}.js?style=glass" async></script>
   The script is the same for every palette. It reads the palette, the effect and its soft and grain from its address
   and plays the effect on a canvas fixed behind the page, from the first frame the stylesheet of the same address
   painted in the page's first paint (server/files/effect-files.ts), or the same rules in the page's own <style> (the
   editor's Copy HTML); where the page has neither, it adopts those rules itself as soon as it runs. The canvas shows
   once its first frame, the still's own, is drawn: the glass, the silk, the rosette and the papercut fading in over a
   still the page painted, the blob (clear around itself) taking the still's place in one frame. The papercut's still
   steps its shadows (engine/effect.ts steppedStill), so its canvas brings them soft, as the site's stage does, and
   comes for a reader who asks for less motion and held at speed 0 too, holding its first frame. The still goes once
   the canvas covers it, so a resize never draws it again under the canvas, and comes back if the canvas loses its
   context. Where WebGL 2 is missing the still stays. Otherwise no context is made for a reader who asks for less
   motion, nor for a blob, a silk or a rosette held at speed 0, whose still is its whole picture at any size. The
   browser restoring a lost context plays the effect again. A soft or grained address plays as the site's stage paints
   it and as the still was painted (engine/effect-code.ts effectLayers): the canvas blurred by a share of the page's
   longer side over its palette's gradient, the layer's own ground, and the grain's tile over both, so the layer,
   opaque but where a blob's ground lets the page through, takes the still's place as one picture. It writes no markup
   and no style attribute, only CSSOM, so a page with a strict Content Security Policy and Trusted Types runs it. A
   page plays one effect: a second script, the same or another, leaves it be. */
import {
  EFFECT_KINDS,
  type Effect,
  type EffectKind,
  EMBED_PLAYING
} from "@grabient/engine/effect.ts";
import { effectLayers } from "@grabient/engine/effect-code.ts";
import { type EffectLayers, effectLayerCss } from "@grabient/engine/effect-embed.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { embedAsk, type GroundReader } from "./address.ts";
import { grainImage } from "./grain.ts";

/** How long an opaque canvas takes to fade in over its still, as the editor's glass does (GlassStage.tsx). */
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
  /** the blob's ground written in other words than hex read to the hex the server answers it at (address.ts) */
  ground?: GroundReader;
  /** the effect's first frame as a background, as the stylesheet paints it, at the address's angle, which the blob
      has none of: drawn at once, or a share at a time where that takes long (the papercut's) */
  still(P: Palette, effect: Effect, angle: number): string | Promise<string>;
  /** the player on the canvas, telling `drawn` once its first frame is and holding its first frame while `reduced`
      says so, read again on motion(); null where WebGL 2 is missing */
  play(
    canvas: HTMLCanvasElement,
    P: Palette,
    effect: Effect,
    angle: number,
    drawn: () => void,
    reduced: () => boolean
  ): { motion(): void; destroy(): void } | null;
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
  /* the palette, the effect, its angle and its finish, read as the stylesheet of the same address is (address.ts) */
  const ask = embedAsk(address, embed.ground);
  if (!ask || ask.effect.kind !== embed.kind) return;
  page[MOUNTED] = true;
  const { name, P, effect, angle, finish } = ask;
  const root = document.documentElement;
  /* the soft's blur and gradient and the grain's tile, as the stylesheet of the same address lays them */
  const layers: Promise<EffectLayers> = (
    finish.grain ? grainImage(finish.grain) : Promise.resolve(undefined)
  ).then(grain => effectLayers(P, effect, angle, finish, grain));

  /* the still: the page's own, else the stylesheet's rules adopted, which need no body. One the page painted is in
     its first paint, and an opaque canvas fades in over it; one adopted late may still be on its way to the screen
     when the player's first frame is drawn, so the canvas shows at once over it, where a fade would show the page's
     own ground */
  let fade = true;
  const still = pagePaints(address, name).then(async paints => {
    if (paints) return;
    fade = false;
    if (!("adoptedStyleSheets" in document)) return;
    const sheet = new CSSStyleSheet();
    const [paint, finished] = await Promise.all([embed.still(P, effect, angle), layers]);
    sheet.replaceSync(effectLayerCss(paint, finished));
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  });
  const body = new Promise<void>(resolve =>
    document.body
      ? resolve()
      : document.addEventListener("DOMContentLoaded", () => resolve(), { once: true })
  );

  /* the device's word on motion, the only one a page of another site has: the player holds its first frame while it
     asks for less */
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let again = 0;
  const play = (finished: EffectLayers) => {
    /* the layer, shown once the canvas has drawn its first frame: a soft effect's gradient its own ground, opaque
       under the blurred canvas, and the grain over both, so it fades in over the still, or takes its place, whole */
    const layer = document.createElement("div");
    layer.setAttribute("aria-hidden", "true");
    const box = layer.style;
    box.position = "fixed";
    box.inset = "0";
    box.zIndex = "-1";
    box.pointerEvents = "none";
    box.overflow = "hidden";
    box.opacity = "0";
    if (finished.under) box.background = finished.under;
    const canvas = document.createElement("canvas");
    const look = canvas.style;
    look.position = "absolute";
    look.inset = "0";
    look.display = "block";
    look.width = "100%";
    look.height = "100%";
    if (finished.blur) look.filter = finished.blur;
    layer.append(canvas);
    if (finished.grain) {
      const grain = document.createElement("div");
      const tile = grain.style;
      tile.position = "absolute";
      tile.inset = "0";
      tile.background = finished.grain;
      tile.imageRendering = "pixelated";
      layer.append(grain);
    }
    document.body.prepend(layer);
    let player: { motion(): void; destroy(): void } | null = null;
    /* a lost context drew nothing: the still comes back at once, and the effect plays again once the browser restores
       the context, on a canvas of its own. The old canvas's listeners end first, since destroying its player loses
       the restored context again, and that loss must not take the still's place from the new player */
    const ended = new AbortController();
    canvas.addEventListener(
      "webglcontextlost",
      () => {
        box.transition = "none";
        box.opacity = "0";
        root.removeAttribute(EMBED_PLAYING);
      },
      { signal: ended.signal }
    );
    canvas.addEventListener(
      "webglcontextrestored",
      () => {
        ended.abort();
        player?.destroy();
        layer.remove();
        if (++again <= AGAIN_MAX) play(finished);
      },
      { signal: ended.signal }
    );
    /* the still goes once the canvas covers it: the blob's at once, an opaque canvas's once it has faded in */
    const covered = () => root.setAttribute(EMBED_PLAYING, "");
    player = embed.play(
      canvas,
      P,
      effect,
      angle,
      () =>
        /* a frame after its first was drawn: a canvas shown in the frame it was first drawn in may not fade in */
        requestAnimationFrame(() => {
          if (embed.kind !== "blob" && fade) {
            box.transition = `opacity ${FADE_MS}ms ease-in-out`;
            layer.addEventListener("transitionend", covered, { once: true, signal: ended.signal });
          } else covered();
          box.opacity = "1";
        }),
      () => motion.matches
    );
    if (!player) return layer.remove();
    motion.addEventListener("change", () => player?.motion(), { signal: ended.signal });
  };
  /* the papercut's still stands in for its first frame, whose shadows are soft where the still steps them: its player
     comes held as well, holding that frame, as the site's stage does (FxLayer.tsx) */
  const stepped = EFFECT_KINDS[embed.kind].steppedStill;
  /* a blob, a silk or a rosette held at speed 0 is its still exactly, a vector drawing at any size, so it takes no
     context; the glass held keeps its canvas, which draws the frame at the screen's pixels where the still Copy HTML
     writes inside a page is a 1000-pixel picture, and the papercut its own */
  if (effect.speed === 0 && embed.kind !== "glass" && !stepped) return;
  /* for a reader who asks for less motion the still is the first frame held: no context until motion is welcome, but
     for the papercut, whose player holds its own */
  void Promise.all([layers, still, body, firstPaint()]).then(([finished]) => {
    const start = () => {
      if (motion.matches && !stepped) motion.addEventListener("change", start, { once: true });
      else play(finished);
    };
    start();
  });
}
