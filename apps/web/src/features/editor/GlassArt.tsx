import { glassStillKey } from "@grabient/engine/glass-colors.ts";
import { createEffect, createSignal, onCleanup, onSettled, untrack } from "solid-js";
import styles from "./Editor.module.css";
import {
  gpuStill,
  loadGpuStill,
  loadStill,
  serverField,
  serverStill,
  stillField,
  stillUri
} from "./glass-draw.ts";

/** How often the small picture is drawn while its palette, angle or shape keeps changing: a drag changes them every
    frame. A change after a rest is drawn at once; while the hand moves, at most once in this, and the last change once
    it rests. The big picture shows every change. */
const REST_MS = 120;
/** How long a picture shown waits for its first paint before the GPU's still is made ready. */
const TILE_WAIT_MS = 1000;

/* A GPU still costs a few milliseconds, more where its ribs are laid out for another angle or box: a frame draws those
   it has time for and the rest wait for the next, so a page of cards never draws them all in one task. */
const FRAME_MS = 6;
const waiting = new Set<() => void>();
let frameEnd = Number.NEGATIVE_INFINITY;
let ticking = false;
const drawWaiting = () => {
  frameEnd = performance.now() + FRAME_MS;
  for (const draw of waiting) {
    if (performance.now() >= frameEnd) break;
    waiting.delete(draw);
    draw();
  }
  ticking = waiting.size > 0;
  if (ticking) requestAnimationFrame(drawWaiting);
};
/** Draws now where this frame has time left, else in the next that has; the way out takes its turn back. */
function inTime(draw: () => void): () => void {
  if (!ticking) {
    ticking = true;
    frameEnd = performance.now() + FRAME_MS;
    requestAnimationFrame(drawWaiting);
  }
  if (!waiting.size && performance.now() < frameEnd) draw();
  else waiting.add(draw);
  return () => waiting.delete(draw);
}

/** The fluted glass's still as a small picture filling its box: the Appearance menu's tile, the header's swatch and a
    card's picture. The server's still where it is this one (the head's style paints any holder that names it),
    otherwise drawn here: on the GPU where the browser has WebGL 2 (ui/glass-still.ts), the first frame a player of
    this size starts from, in a few milliseconds, else as the still's SVG, whose filter the browser takes about a
    tenth of a second to paint at a tile's size. Until the GPU's first still is drawn the box shows the still's field,
    its colors where they lie without the ribs, which the server painted where it drew the page, and the still fades
    in over it; one drawn at once takes the box's place in a frame. A page of them draws a few a frame, and only those
    within a screen of the window. At once as the box comes into sight, and after that as the palette, the angle or
    the shape changes. A tile made before its menu opens draws nothing until the menu shows it. */
export function GlassArt(props: {
  colors: readonly string[];
  angle: number;
  /** the glass's shape: 0 or none as designed */
  shape?: number | null;
  /** drawn as it mounts, where a tile waits to be in sight: a card's picture, which a list shows as it comes */
  eager?: boolean;
}) {
  let el!: HTMLSpanElement;
  let canvas!: HTMLCanvasElement;
  const key = () => glassStillKey(props.colors, props.angle, props.shape ?? null);
  const [uri, setUri] = createSignal<string | null>(null);
  /* the still's field, while the GPU's still is on its way and no style of the server's paints it, and whether the
     box showed one, which the still then fades in over */
  const [field, setField] = createSignal<string | null>(null);
  const [fades, setFades] = createSignal(false);
  /* the still the box shows: until one is drawn, the one it names, which the server's may paint */
  const [showing, setShowing] = createSignal<string | null>(null);
  /* the GPU's bitmap is on the canvas, over the box */
  const [painted, setPainted] = createSignal(false);
  /* the box is in the page with a size, and that size: a GPU still drawn at another is drawn again at this one, where
     it would be stretched to the box (the window made narrower), and a card's player would not take it over */
  const [seen, setSeen] = createSignal(untrack(() => props.eager === true));
  const [box, setBox] = createSignal("");
  /* within a screen of the window: a card far down a long page draws nothing, and gives its still back once far */
  const [near, setNear] = createSignal(true);
  onSettled(() => {
    const sizes = new ResizeObserver(() => {
      setSeen(el.clientWidth > 0 && el.clientHeight > 0);
      setBox(`${el.clientWidth}x${el.clientHeight}`);
    });
    sizes.observe(el);
    const sight = new IntersectionObserver(
      entries => setNear(entries[entries.length - 1].isIntersecting),
      { rootMargin: "100% 0px" }
    );
    sight.observe(el);
    return () => {
      sizes.disconnect();
      sight.disconnect();
    };
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  /* out of sight since the last still: the next one is drawn at once */
  let away = true;
  /* when the last still was drawn */
  let drawnAt = Number.NEGATIVE_INFINITY;
  /* the GPU drew nothing here once: the SVG from then on */
  let noGpu = false;
  /* the box the GPU's last still was drawn for */
  let drawnBox = "";
  /* the GPU's still asked for, ahead of a change */
  let warming = false;
  /* the still's field while the box waits for its first still: the server's, or made here */
  const showField = (
    colors: readonly string[],
    angle: number,
    shape: number | null,
    named: string
  ) => {
    if (untrack(painted)) return;
    if (serverField(named)) return setFades(true);
    const shown = () => {
      const made = untrack(key) === named && !untrack(painted) && stillField(colors, angle, shape);
      if (made) {
        setField(made);
        setFades(true);
      }
      return made;
    };
    if (!shown()) void loadStill().then(shown);
  };
  /* a still asked for, drawn in a frame with time for it, its field shown meanwhile */
  let cancel: (() => void) | undefined;
  const request = (
    colors: readonly string[],
    angle: number,
    shape: number | null,
    named: string
  ) => {
    cancel?.();
    if (!untrack(seen) || !untrack(near)) return;
    let drawn = false;
    cancel = inTime(() => {
      drawn = true;
      draw(colors, angle, shape, named);
    });
    if (!drawn && !noGpu) showField(colors, angle, shape, named);
  };
  const draw = (colors: readonly string[], angle: number, shape: number | null, named: string) => {
    if (untrack(key) !== named) return;
    if (!noGpu) {
      const dpr = devicePixelRatio || 1;
      /* the server's field stands under the box's first still */
      if (!untrack(painted) && serverField(named)) setFades(true);
      const bitmap = gpuStill(colors, angle, shape, el.clientWidth * dpr, el.clientHeight * dpr);
      if (bitmap === undefined) {
        showField(colors, angle, shape, named);
        void loadGpuStill().then(
          () => request(colors, angle, shape, named),
          () => {
            noGpu = true;
            request(colors, angle, shape, named);
          }
        );
        return;
      }
      if (bitmap) {
        canvas.getContext("bitmaprenderer")?.transferFromImageBitmap(bitmap);
        drawnBox = `${el.clientWidth}x${el.clientHeight}`;
        drawnAt = performance.now();
        setPainted(true);
        setUri(null);
        setShowing(named);
        return;
      }
      noGpu = true;
    }
    const made = stillUri(colors, angle, shape);
    if (made) {
      drawnAt = performance.now();
      setPainted(false);
      setUri(made);
      setShowing(named);
    } else void loadStill().then(() => request(colors, angle, shape, named));
  };
  createEffect(
    () =>
      seen() && near()
        ? {
            named: key(),
            colors: props.colors,
            angle: props.angle,
            shape: props.shape ?? null,
            at: box()
          }
        : null,
    next => {
      clearTimeout(timer);
      if (next === null) {
        away = true;
        cancel?.();
        /* the GPU's bitmap goes with the box out of reach, and is drawn again as it comes back */
        if (untrack(painted)) {
          canvas.getContext("bitmaprenderer")?.transferFromImageBitmap(null);
          drawnBox = "";
          setPainted(false);
          setShowing(null);
        }
        return;
      }
      /* the GPU's still code, and its canvas as the page idles, once a page shows the glass and before a change asks
         for a still: a tile in a menu still closed asks for nothing, and an open menu's tile waits for its first paint,
         which a context made meanwhile would wait on (painted.ts) */
      if (!warming && !import.meta.env.SSR) {
        warming = true;
        void import("./painted.ts")
          .then(p => p.elementPainted(el, TILE_WAIT_MS))
          .then(loadGpuStill)
          .catch(() => {});
      }
      const { named, colors, angle, shape } = next;
      const was = away;
      away = false;
      /* the same still, unless the GPU drew it for another box: the server's and the SVG cover any box */
      if (named === untrack(showing) && (!untrack(painted) || next.at === drawnBox)) return;
      /* the server's still where it is this one, until a change asks for another */
      if (serverStill(named) && !untrack(painted)) {
        setUri(null);
        setShowing(named);
        return;
      }
      const wait = drawnAt + REST_MS - performance.now();
      if (was || wait <= 0) request(colors, angle, shape, named);
      else timer = setTimeout(() => request(colors, angle, shape, named), wait);
    }
  );
  onCleanup(() => {
    clearTimeout(timer);
    cancel?.();
  });
  return (
    <span
      ref={el}
      class={styles.glassArt}
      /* painted.ts's TILE_TIMING: the GPU's still is made ready once the browser has painted this */
      elementtiming="effect-tile"
      data-glass-still={showing() ?? key()}
      style={{
        background: uri() ? `url("${uri()}") 50% 50% / cover no-repeat` : (field() ?? undefined)
      }}
    >
      <canvas
        ref={canvas}
        class={styles.glassArtCanvas}
        data-painted={painted() ? "" : undefined}
        data-fades={fades() ? "" : undefined}
      />
    </span>
  );
}
