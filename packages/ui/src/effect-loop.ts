/* The loop that plays an effect whose every frame is one drawing of its loop's time: the rosette, the silk and the
   papercut. A kind brings its drawing (programs, uniforms, a frame at any time t); this does the rest, as the glass's
   player does it: the canvas at the screen's density from the browser's own count of its device pixels (capped at
   EFFECT_PIXELS_MAX), the first frame drawn at t = 0 (the still's own, so it takes over without a seam) and then the
   motion eased in from rest, frames at the address's rate at most (pace.ts), nothing drawn while the canvas is out of
   view or the page hidden, the first frame held for a reader who asks for less motion, and a new size laid out once it
   has settled. Nothing is allocated a frame. A renderer on the processor plays nothing (gl-build.ts): the still stays.
   A kind with no loop of its own, which moves only as it is led (the dimple's hollow, after the pointer), says so by
   its `lead`: its frames are drawn only as it moves, and none is asked for once it has come to rest. */
import { EFFECT_EASE_S, EFFECT_PIXELS_MAX, EFFECT_SETTLE_MS } from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { knownSoftwareRenderer, softwareContext } from "./gl-build.ts";
import { createPace } from "./pace.ts";

/** How an effect plays: its pace (1 as designed, 0 its first frame held) and its frames a second at most. */
export interface PlayView {
  speed: number;
  fps: number;
}

/** What a kind draws on its context. */
export interface EffectDrawing<V> {
  /** the palette and the view in a box of `width` by `height` device pixels */
  layout(palette: Palette, view: V, width: number, height: number): void;
  /** true once its programs are built, false while the GPU is at them, null where they failed (gl-build.ts) */
  built(): boolean | null;
  /** the frame at `t` seconds of the loop at speed 1 */
  draw(t: number): void;
  /** frees what it made on the context */
  destroy(): void;
  /** for a kind with no loop of its own, which moves only as it is led: told the seconds gone by at the view's speed
      (it is not asked while it is held: at speed 0, out of view, for a reader who asks for less motion), it moves and
      says whether it moved. The loop draws its frames only as it moves and asks for none once it rests, until
      whatever leads it calls the `wake` it was made with */
  lead?(seconds: number): boolean;
  /** for such a kind: back to where its first frame has it */
  home?(): void;
  /** for such a kind: where it has been led to in its box, 0 to 1 each way, null at its rest; and it put there at
      once, null back at its rest */
  where?(): readonly [number, number] | null;
  put?(place: readonly [number, number] | null): void;
}

export interface EffectPlayer<V> {
  /** a new palette or view: the motion carries on from where it is; at speed 0 it holds its frame */
  set(palette: Palette, view: V): void;
  /** back to the first frame, the still's own, from which the motion eases in again */
  rewind(): void;
  /** reads `reduced` again: the first frame held, or the motion going on */
  motion(): void;
  /** stop and let the context go */
  destroy(): void;
  /** a kind that is led (EffectDrawing's lead): where it has been led to in its box, 0 to 1 each way, null at its
      rest, so what stands in for the canvas once it goes can show that picture (a card's still, FxArt.tsx) */
  led?(): readonly [number, number] | null;
  /** and it put there at once, null back at its rest: a player taking over a picture left that way */
  lead?(place: readonly [number, number] | null): void;
}

export interface PlayOptions {
  /** false starts the motion at its pace, as a card's picture under the pointer does, where a page's picture eases in
      from rest */
  ease?: boolean;
  /** whether the reader asks for less motion, which holds the first frame: the caller's decision (the site's Settings,
      an embed's media query), read as it starts and on motion() */
  reduced?: () => boolean;
  /** a canvas that keeps its alpha, premultiplied, for a kind whose ground may let what is under the canvas through
      (the strings'); an opaque frame on it shows as on one that keeps none */
  alpha?: boolean;
}

/** Plays a kind's drawing into a canvas the page sizes with CSS. `onFirstFrame` is told once the first frame is on the
    canvas, so a page can fade it in over the still it drew before. Null where WebGL 2 is missing or drawn in software. */
export function playEffect<V extends PlayView>(
  canvas: HTMLCanvasElement,
  palette: Palette,
  view: V,
  make: (gl: WebGL2RenderingContext, wake: () => void) => EffectDrawing<V>,
  onFirstFrame?: () => void,
  options: PlayOptions = {}
): EffectPlayer<V> | null {
  const easing = options.ease === false ? 0 : EFFECT_EASE_S;
  if (knownSoftwareRenderer()) return null;
  const gl = canvas.getContext("webgl2", {
    alpha: options.alpha === true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false
  });
  if (!gl) return null;
  if (softwareContext(gl)) {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }
  /* a led kind's drawing wakes the loop as it is led; the loop's own wake is made below */
  let waker = () => {};
  const drawing = make(gl, () => waker());
  let palette_ = palette;
  let view_ = view;
  let size = { w: 0, h: 0 };
  /* the canvas's size in device pixels, as the browser lays it out, where it says (devicePixelContentBoxSize) */
  let device: { w: number; h: number } | null = null;
  /** the canvas at its size: laid out again for it */
  const resize = () => {
    const dpr = devicePixelRatio || 1;
    const css = canvas.getBoundingClientRect();
    /* a canvas off the page or hidden has no box: it keeps the layout it had, for the box it comes back to */
    if (!css.width || !css.height) return;
    const ew = Math.round(css.width * dpr);
    const eh = Math.round(css.height * dpr);
    /* the browser's own count where it agrees with the box at this density (an emulated density reports CSS pixels) */
    const exact = device && Math.abs(device.w - ew) <= 2 && Math.abs(device.h - eh) <= 2;
    const w0 = exact && device ? device.w : ew;
    const h0 = exact && device ? device.h : eh;
    const fit = Math.min(1, Math.sqrt(EFFECT_PIXELS_MAX / Math.max(1, w0 * h0)));
    const w = Math.max(1, Math.round(w0 * fit));
    const h = Math.max(1, Math.round(h0 * fit));
    /* a canvas given a size, even the one it has, throws its drawing buffer away and makes another */
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    size = { w, h };
    drawing.layout(palette_, view_, w, h);
  };

  /* the clock: seconds of the loop at speed 1, advanced by the speed, so a change of speed never jumps. It starts once
     the first frame, the still's own, is drawn, and eases in from rest (warm) whenever the motion starts again */
  let reduced = !!options.reduced?.();
  let t = 0;
  let warm = 0;
  let last = performance.now();
  let lastDrawn = -1;
  let changed = true;
  /* a led kind has moved since its last frame, which a frame not yet due at the view's rate still owes */
  let moved = false;
  let shown = true;
  let raf = 0;
  let first = true;
  let settle = 0;
  const playing = () => shown && !document.hidden && !reduced;
  const pace = createPace();
  const tick = (now: number) => {
    raf = 0;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const ready = size.w > 0 && drawing.built() === true;
    let led = false;
    if (!playing() || view_.speed === 0) warm = 0;
    else if (ready && !first) {
      if (drawing.lead) {
        led = drawing.lead(dt * view_.speed);
        moved ||= led;
      } else {
        warm = Math.min(easing, warm + dt);
        const e = easing ? warm / easing : 1;
        t += dt * view_.speed * e * e * (3 - 2 * e);
      }
    }
    if (ready) {
      const at = reduced ? 0 : t;
      if (changed || ((drawing.lead ? moved : at !== lastDrawn) && pace.due(now, view_.fps))) {
        drawing.draw(at);
        lastDrawn = at;
        changed = false;
        moved = false;
        if (first) {
          first = false;
          onFirstFrame?.();
        }
      }
    }
    /* held at speed 0, a frame comes only with a change, which wakes the loop (set, a size, the motion setting); while
       the GPU builds the programs, each frame asks again, until it is done or they failed (the still stays). A led
       kind asks for the next only while it moves, or owes a frame of having moved, or has its first still to draw */
    if (
      (playing() && view_.speed > 0 && (!drawing.lead || led || moved || first)) ||
      drawing.built() === false
    )
      raf = requestAnimationFrame(tick);
  };
  const wake = () => {
    /* a led kind, woken at every move of the pointer, keeps its last tick while the loop runs, so the time between
       its frames is counted whole */
    if (!(drawing.lead && raf)) last = performance.now();
    if (!raf) raf = requestAnimationFrame(tick);
  };
  waker = wake;
  /* the first size comes with the observer's first word, which the browser gives before the next paint */
  const sizes = new ResizeObserver(entries => {
    const box = entries[entries.length - 1]?.devicePixelContentBoxSize?.[0];
    device = box ? { w: box.inlineSize, h: box.blockSize } : null;
    clearTimeout(settle);
    settle = window.setTimeout(
      () => {
        resize();
        changed = true;
        wake();
      },
      size.w > 0 ? EFFECT_SETTLE_MS : 0
    );
  });
  try {
    sizes.observe(canvas, { box: "device-pixel-content-box" });
  } catch {
    sizes.observe(canvas);
  }
  const sight = new IntersectionObserver(entries => {
    shown = entries.some(e => e.isIntersecting);
    if (shown) wake();
  });
  sight.observe(canvas);
  const visible = () => {
    if (!document.hidden) wake();
  };
  document.addEventListener("visibilitychange", visible);
  const lost = (event: Event) => {
    event.preventDefault();
    cancelAnimationFrame(raf);
    raf = 0;
  };
  canvas.addEventListener("webglcontextlost", lost);

  return {
    set(palette: Palette, view: V) {
      palette_ = palette;
      view_ = view;
      if (size.w > 0) drawing.layout(palette, view, size.w, size.h);
      changed = true;
      wake();
    },
    rewind() {
      t = 0;
      warm = 0;
      drawing.home?.();
      changed = true;
      wake();
    },
    motion() {
      reduced = !!options.reduced?.();
      changed = true;
      wake();
    },
    ...(drawing.where && drawing.put
      ? {
          led: () => drawing.where?.() ?? null,
          lead(place: readonly [number, number] | null) {
            drawing.put?.(place);
            changed = true;
            wake();
          }
        }
      : {}),
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      clearTimeout(settle);
      sizes.disconnect();
      sight.disconnect();
      document.removeEventListener("visibilitychange", visible);
      canvas.removeEventListener("webglcontextlost", lost);
      drawing.destroy();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  };
}
