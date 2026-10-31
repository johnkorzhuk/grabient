import { glassStillKey } from "@grabient/engine/glass-colors.ts";
import { createEffect, createSignal, onCleanup, onSettled, untrack } from "solid-js";
import styles from "./Editor.module.css";
import { gpuStill, loadGpuStill, loadStill, serverStill, stillUri } from "./glass-draw.ts";

/** How often the small picture is drawn while its palette, angle or shape keeps changing: a drag changes them every
    frame. A change after a rest is drawn at once; while the hand moves, at most once in this, and the last change once
    it rests. The big picture shows every change. */
const REST_MS = 120;
/** How long a picture shown waits for its first paint before the GPU's still is made ready. */
const TILE_WAIT_MS = 1000;

/** The fluted glass's still as a small picture filling its box: the Appearance menu's tile, the header's swatch and a
    card's picture. The server's still where it is this one (the head's style paints any holder that names it),
    otherwise drawn here: on the GPU where the browser has WebGL 2 (ui/glass-still.ts), the first frame a player of
    this size starts from, in a few milliseconds, else as the still's SVG, whose filter the browser takes about a
    tenth of a second to paint at a tile's size. At once as the box comes into sight, and after that as the palette,
    the angle or the shape changes. A tile made before its menu opens draws nothing until the menu shows it. */
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
  /* the still the box shows: until one is drawn, the one it names, which the server's may paint */
  const [showing, setShowing] = createSignal<string | null>(null);
  /* the GPU's bitmap is on the canvas, over the box */
  const [painted, setPainted] = createSignal(false);
  /* the box is in the page with a size */
  const [seen, setSeen] = createSignal(untrack(() => props.eager === true));
  onSettled(() => {
    const sizes = new ResizeObserver(() => setSeen(el.clientWidth > 0));
    sizes.observe(el);
    return () => sizes.disconnect();
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  /* out of sight since the last still: the next one is drawn at once */
  let away = true;
  /* when the last still was drawn */
  let drawnAt = Number.NEGATIVE_INFINITY;
  /* the GPU drew nothing here once: the SVG from then on */
  let noGpu = false;
  /* the GPU's still asked for, ahead of a change */
  let warming = false;
  const draw = (colors: readonly string[], angle: number, shape: number | null, named: string) => {
    if (key() !== named) return;
    if (!noGpu) {
      const dpr = devicePixelRatio || 1;
      const bitmap = gpuStill(colors, angle, shape, el.clientWidth * dpr, el.clientHeight * dpr);
      if (bitmap === undefined) {
        void loadGpuStill().then(
          () => draw(colors, angle, shape, named),
          () => {
            noGpu = true;
            draw(colors, angle, shape, named);
          }
        );
        return;
      }
      if (bitmap) {
        canvas.getContext("bitmaprenderer")?.transferFromImageBitmap(bitmap);
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
    } else void loadStill().then(() => draw(colors, angle, shape, named));
  };
  createEffect(
    () =>
      seen()
        ? { named: key(), colors: props.colors, angle: props.angle, shape: props.shape ?? null }
        : null,
    next => {
      clearTimeout(timer);
      if (next === null) {
        away = true;
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
      if (named === untrack(showing)) return;
      /* the server's still where it is this one, until a change asks for another */
      if (serverStill(named) && !untrack(painted)) {
        setUri(null);
        setShowing(named);
        return;
      }
      const wait = drawnAt + REST_MS - performance.now();
      if (was || wait <= 0) draw(colors, angle, shape, named);
      else timer = setTimeout(() => draw(colors, angle, shape, named), wait);
    }
  );
  onCleanup(() => clearTimeout(timer));
  return (
    <span
      ref={el}
      class={styles.glassArt}
      /* painted.ts's TILE_TIMING: the GPU's still is made ready once the browser has painted this */
      elementtiming="effect-tile"
      data-glass-still={showing() ?? key()}
      style={{ background: uri() ? `url("${uri()}") 50% 50% / cover no-repeat` : undefined }}
    >
      <canvas
        ref={canvas}
        class={styles.glassArtCanvas}
        data-painted={painted() ? "" : undefined}
      />
    </span>
  );
}
