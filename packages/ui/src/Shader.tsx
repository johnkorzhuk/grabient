import { type Triple, toHex } from "@grabient/engine/color.ts";
import { sampleLCH, sampleStops } from "@grabient/engine/curve.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { createEffect, onSettled } from "solid-js";
import { type LCH, lchSamples, MOVES, mixStops, toSrgb } from "./bartween.ts";
import type { Flow } from "./flow.ts";
import { glowing, waterTakesGlow } from "./glow.ts";
import { reducedMotion, reducesNow } from "./motion.ts";
import { barLight, barUnpainted, paintBar, paneBar } from "./panebar.ts";
import { waterAllowed } from "./renderer.ts";
import styles from "./Shader.module.css";
import { BRAND_SUPPLY, brandSupply } from "./supply.ts";

/* The water behind every page: paint flows from the wordmark's bar across the page (flow.ts) on one canvas that the
   shell keeps mounted as pages change. With `paint` the source is what the page hands in (the cycle of its palettes,
   or the editor's palette held); without it the water tweens through its own supply, so no page needs a request to
   draw. Hover and focus reach it only through a lit card's glow, and a pane's bar is painted by it. It starts in an
   idle moment once the renderer is known to be a GPU, and fades in with its first frame. */
const N = 64;
const DWELL = 6;
const TWEEN = 4.5;
const PERIOD = DWELL + TWEEN;
/* what the water says it paints, at most this often, in seconds */
const REPORT = 0.14;
const samples = (P: Palette): LCH[] =>
  Array.from({ length: N }, (_, i) => sampleLCH(P, i / (N - 1)));

export function Shader(props: {
  /** the wordmark's open bar: the source of the paint */
  bar: () => SVGRectElement | undefined;
  /** true once the water is drawn; false where WebGL is missing or lost, and the page shows its fallback; null while
      the page has taken the water away (`off`), with nothing in its place */
  onReady: (ready: boolean | null) => void;
  /** the colors at the bar as they tween: the light every field's rim and the header's bar follow */
  onStops: (colors: readonly string[]) => void;
  /** the paint at the source where the page decides it: the stops its bar shows */
  paint?: () => readonly string[];
  /** while true nothing is drawn and no fallback stands in; the context, its programs and the canvas stay, so the
      water comes back at once */
  off?: () => boolean;
  /** the water moves even under reduced motion: the sign-in page, whose wordmark moves with it */
  moves?: () => boolean;
}) {
  let layer!: HTMLDivElement;
  let canvas!: HTMLCanvasElement;
  let lit = false;
  let live: Flow | null = null;
  /* while the water moves and takes a lit card's glow in, the glow under a card is fainter */
  const syncGlow = (held: boolean) => waterTakesGlow(lit && !!live?.glows && !held);
  /* the water holds still under reduced motion, unless the page lets it move; it stops where it is, or moves on */
  const holds = () => reducedMotion() && !props.moves?.();
  createEffect(holds, held => {
    live?.motion();
    syncGlow(held);
  });
  /* held still, the water's clock stops and would keep the first page's paint, so new paint reseeds it at once */
  createEffect(
    () => (props.paint && holds() ? props.paint().join() : ""),
    key => {
      if (key) live?.reseed();
    }
  );
  const ready = (ok: boolean | null) => {
    if (!ok) barUnpainted();
    lit = !!ok;
    layer.toggleAttribute("data-lit", lit);
    syncGlow(reducesNow() && !props.moves?.());
    props.onReady(ok);
  };
  /* the page takes the water away or gives it back; the water answers once it has settled */
  let turn: ((off: boolean) => void) | undefined;
  createEffect(
    () => !!props.off?.(),
    off => {
      turn?.(off);
    }
  );

  onSettled(() => {
    let disposed = false;
    let flow: Flow | null = null;
    const supply = brandSupply(BRAND_SUPPLY);
    const first = supply();
    let a = samples(first);
    let b = samples(supply());
    let cycleStart = -1;
    let cycle = 0;
    /* the paint on screen now, sRGB triples across the bar */
    let shown: Triple[] | null = null;
    let painted = false;
    let reported = -1;
    const tell = (paint: readonly Triple[]) => props.onStops(paint.map(toHex));
    props.onStops(sampleStops(first, 32).map(s => s.hex));
    const ramp = (time: number): readonly Triple[] => {
      if (props.paint) {
        painted = true;
        shown = toSrgb(lchSamples(props.paint(), N));
        if (time - reported > REPORT) {
          reported = time;
          tell(shown);
        }
        return shown;
      }
      /* the page stopped handing in paint: carry on from the colors on screen toward the supply's next palette, so a
         change of route never restarts the water */
      if (painted) {
        painted = false;
        if (shown) a = lchSamples(shown.map(toHex), N);
        b = samples(supply());
        cycle = 0;
        cycleStart = time - DWELL;
      }
      if (cycleStart < 0) cycleStart = time;
      const elapsed = Math.max(0, time - cycleStart);
      for (const next = Math.floor(elapsed / PERIOD); cycle < next; cycle++) {
        a = b;
        b = samples(supply());
      }
      const phase = elapsed - cycle * PERIOD;
      /* the paint at the source moves the way the bar does: the same four moves in turn */
      const u = phase < DWELL ? 0 : (phase - DWELL) / TWEEN;
      shown = toSrgb(mixStops(a, b, u, MOVES[cycle % MOVES.length], cycle % 2 ? -1 : 1));
      /* the bar is a window on this paint, so whatever reads the bar is told each time the source moves */
      if (u > 0 || phase < 0.2) tell(shown);
      return shown;
    };
    /* the renderer works in the layer's own CSS pixels, which on a page are the viewport's */
    const rect = (el: Element) => el.getBoundingClientRect();
    const dark = () => document.documentElement.dataset.theme !== "light";
    /* the card whose glow is lit, where the water sees it: its corners read once per card */
    let rounded: Element | null = null;
    let radius = 0;
    const glow = () => {
      const card = glowing();
      if (!card) return null;
      if (card.el !== rounded) {
        rounded = card.el;
        radius = Number.parseFloat(getComputedStyle(card.el).borderTopLeftRadius) || 0;
      }
      return { rect: rect(card.el), radius, tiles: card.tiles };
    };
    /* a frame held under reduced motion is drawn where the bar was: a resize of the header redraws it */
    let resized: ResizeObserver | null = null;
    const watch = () => {
      const header = resized ? null : props.bar()?.closest("header");
      if (!header) return;
      resized = new ResizeObserver(() => flow?.refresh());
      resized.observe(header);
    };
    const wanted = () => !props.off?.();
    let starting = false;
    const start = async () => {
      if (disposed || flow || starting || !wanted()) return;
      starting = true;
      try {
        /* a software renderer keeps the fallback: the water would cost seconds to start and a core to run */
        if (!(await waterAllowed())) {
          if (!disposed && wanted()) ready(false);
          return;
        }
        const { startFlow } = await import("./flow.ts");
        if (disposed || flow || !wanted()) return;
        flow = startFlow(canvas, {
          window: () => {
            const el = props.bar();
            return el ? rect(el) : null;
          },
          /* a fixed destination keeps the water still while pages of other lengths replace one another */
          aim: () => ({ x: layer.clientWidth / 2, y: layer.clientHeight / 2 }),
          ramp,
          dark,
          reduced: holds,
          glow,
          strip: () => {
            const el = paneBar();
            return el ? { rect: rect(el), lit: barLight() } : null;
          },
          onFrame: paintBar,
          onFirstFrame: () => {
            if (!disposed) ready(true);
          },
          onFailure: () => {
            if (!disposed) ready(false);
          }
        });
        live = flow;
        if (!flow) ready(false);
        watch();
      } catch {
        if (!disposed) ready(false);
      } finally {
        starting = false;
      }
    };
    /* taken away: the flow frees its textures and keeps the context, programs and canvas; the canvas keeps its size,
       since resizing waits on the GPU and in a hidden tab that wait can hang */
    turn = off => {
      if (disposed) return;
      if (!off) return void start();
      flow?.stop();
      flow = live = null;
      ready(null);
    };
    const lost = (e: Event) => {
      e.preventDefault();
      flow?.stop();
      flow = live = null;
      if (disposed || !wanted()) return;
      if (shown) tell(shown);
      ready(false);
    };
    const restored = () => {
      cycleStart = -1;
      cycle = 0;
      if (!disposed) void start();
    };
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    /* a theme change from anywhere repaints */
    const theme = new MutationObserver(() => flow?.refresh());
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"]
    });
    /* start in an idle moment: the renderer check would otherwise compete with hydration on a small machine */
    let idle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (typeof requestIdleCallback === "function")
      idle = requestIdleCallback(
        () => {
          idle = undefined;
          void start();
        },
        { timeout: 1200 }
      );
    else timer = setTimeout(() => void start(), 50);
    return () => {
      disposed = true;
      if (idle !== undefined) cancelIdleCallback(idle);
      clearTimeout(timer);
      flow?.stop();
      flow = live = null;
      waterTakesGlow(false);
      barUnpainted();
      theme.disconnect();
      resized?.disconnect();
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
    };
  });

  return (
    <div ref={layer} class={styles.layer} aria-hidden="true">
      <canvas ref={canvas} class={styles.canvas} />
    </div>
  );
}
