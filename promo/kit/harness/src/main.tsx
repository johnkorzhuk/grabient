/* The promo's water and wordmark: the site's own modules on a 1600x900 page, driven a frame at a time.
   The water is startFlow (packages/ui/src/flow.ts) on a canvas behind the page, as Shader.tsx starts it; its source is
   the bar of the wordmark (Logo.tsx in window mode), wherever the driver puts the wordmark; the paint at the source is
   what the app's createWater (apps/web/src/app/water.ts) gives the bar: a held palette, a brand page's arrival sweep,
   or createBarCycle over the page's palettes. The driver hands in each frame's inputs with __frame, which flushes them
   and runs the frame's requestAnimationFrame callbacks at its exact time (public/shim.js). */
import "@grabient/ui/tokens.css";
import "@grabient/ui/base.css";
import { toHex } from "@grabient/engine/color.ts";
import { lchSamples, toSrgb } from "@grabient/ui/bartween.ts";
import { startFlow } from "@grabient/ui/flow.ts";
import type { GlowTile } from "@grabient/ui/glow.ts";
import { Logo } from "@grabient/ui/Logo.tsx";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { createWater, RESTING } from "@web/app/water.ts";
import { hexesOf } from "@web/lib/palette.ts";

type View = { seed: string; style: string; steps: number; angle: number };
type Box = { x: number; y: number; w: number; h: number };
export interface FrameInput {
  /** the clock, in ms */
  t: number;
  /** the wordmark's box: its left, top and height in CSS px */
  mark: { x: number; y: number; h: number };
  /** what the page hands the bar: the hero palette alone, or the page's palettes */
  paint: "hero" | "page";
  /** a brand page: a palette handed in alone arrives from the water's colors in a sweep */
  brand: boolean;
  /** where the current heads, CSS px */
  aim: { x: number; y: number };
  /** the lit card's picture and its corner radius, or none */
  glow: (Box & { r: number }) | null;
}

const N = 64;
/* how often the water tells the bar what it paints, as Shader.tsx does */
const REPORT = 0.14;

declare global {
  interface Window {
    __setup(cfg: { hero: View; page: View[]; glowView: View; heroHexes?: string[] }): void;
    __frame(input: FrameInput): { bar: Box; box: Box; ink: string[]; ticks: number };
    __layer(kind: "water" | "mark" | "both"): void;
    __tick(t: number): number;
    __ready: boolean;
  }
}

window.__setup = cfg => {
  /* the held palette, or colors given as they are (the check against a page of the site) */
  const hero = cfg.heroHexes ?? hexesOf(cfg.hero);
  const page = cfg.page.slice(0, 8).map(hexesOf);
  const tiles: readonly GlowTile[] = [
    { stops: hexesOf(cfg.glowView), style: cfg.glowView.style as GlowTile["style"], angle: cfg.glowView.angle }
  ];
  const [held, setHeld] = createSignal(true);
  const [brand, setBrand] = createSignal(true);
  const [mark, setMark] = createSignal({ x: 0, y: 0, h: 48 });
  const palettes = () => (held() ? [hero] : page);
  let aim = { x: 800, y: 450 };
  let glow: { rect: DOMRect; radius: number; tiles: readonly GlowTile[] } | null = null;
  let bar: SVGRectElement | undefined;
  let canvas!: HTMLCanvasElement;
  let wrap!: HTMLDivElement;
  /* two pictures of each frame: the water alone (the wordmark laid out but not drawn, so the water's source stays its
     bar), and the wordmark alone on no ground, its open bar showing the water there, which the composition stands over
     the page's cards; or both as one, as a page shows them */
  window.__layer = kind => {
    const mark = kind === "mark";
    document.documentElement.toggleAttribute("data-mark-layer", mark);
    wrap.style.visibility = kind === "water" ? "hidden" : "visible";
    if (!mark || !bar) {
      canvas.style.clipPath = "";
      return;
    }
    const b = bar.getBoundingClientRect();
    canvas.style.clipPath = `inset(${b.top}px ${innerWidth - b.right}px ${innerHeight - b.bottom}px ${b.left}px)`;
  };

  render(() => {
    const water = createWater({ palettes, brand });
    /* the paint at the source, read by the flow each time it writes a row of its memory: Shader.tsx's ramp */
    let reported = -1;
    const ramp = (time: number) => {
      const paint = water.paint();
      const shown = toSrgb(lchSamples(paint ? paint() : RESTING, N));
      if (time - reported > REPORT) {
        reported = time;
        water.setInk(shown.map(toHex));
      }
      return shown;
    };
    queueMicrotask(() => {
      const flow = startFlow(canvas, {
        window: () => bar?.getBoundingClientRect() ?? null,
        aim: () => aim,
        ramp,
        dark: () => document.documentElement.dataset.theme !== "light",
        reduced: () => false,
        glow: () => glow,
        onFirstFrame: () => water.setLit(true),
        onFailure: () => water.setLit(false)
      });
      if (!flow) throw new Error("no water: WebGL2 is missing");
      window.__layer("water");
      window.__ready = true;
    });
    window.__frame = input => {
      setMark(input.mark);
      setHeld(input.paint === "hero");
      setBrand(input.brand);
      aim = input.aim;
      const g = input.glow;
      glow = g ? { rect: new DOMRect(g.x, g.y, g.w, g.h), radius: g.r, tiles } : null;
      flush();
      const ticks = window.__tick(input.t);
      const b = bar!.getBoundingClientRect();
      const m = wrap.firstElementChild!.getBoundingClientRect();
      return {
        bar: { x: b.x, y: b.y, w: b.width, h: b.height },
        box: { x: m.x, y: m.y, w: m.width, h: m.height },
        ink: [...water.light()].filter((_, i, all) => i % Math.max(1, Math.floor(all.length / 8)) === 0),
        ticks
      };
    };
    return (
      <>
        <canvas
          ref={canvas}
          style={{ position: "fixed", inset: "0", width: "100%", height: "100%", "z-index": "-2" }}
        />
        <div
          ref={wrap}
          style={{
            position: "absolute",
            left: `${mark().x}px`,
            top: `${mark().y}px`,
            height: `${mark().h}px`,
            color: "var(--color-ink)",
            "line-height": "0"
          }}
        >
          <Logo
            stops={water.light()}
            mode="window"
            height={mark().h}
            barRef={el => {
              bar = el;
            }}
          />
        </div>
      </>
    );
  }, document.body);
};
