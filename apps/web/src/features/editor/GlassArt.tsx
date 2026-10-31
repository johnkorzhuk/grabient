import { glassStillKey } from "@grabient/engine/glass-colors.ts";
import { createEffect, createSignal, onCleanup, onSettled, untrack } from "solid-js";
import styles from "./Editor.module.css";
import { loadStill, serverStill, stillUri } from "./glass-draw.ts";

/** How often the small picture is drawn while its palette, angle or shape keeps changing: a drag changes them every
    frame, and each still is a new image whose decoding (its filter, and the rib maps the filter reads) holds up the
    frame that shows it. A change after a rest is drawn at once; while the hand moves, at most once in this, and the
    last change once it rests. The big picture shows every change. */
const REST_MS = 250;

/** The fluted glass's still as a small picture filling its box: the Appearance menu's tile and the header's swatch.
    The server's still where it is this one (the head's style paints any holder that names it), otherwise drawn here
    once the still's code has come: at once as the box comes into sight, and after that once the palette rests. A tile
    made before its menu opens draws nothing until the menu shows it. */
export function GlassArt(props: {
  colors: readonly string[];
  angle: number;
  /** the glass's shape: 0 or none as designed */
  shape?: number | null;
  /** drawn as it mounts, where a tile waits to be in sight: a card's picture, which a list shows as it comes */
  eager?: boolean;
}) {
  let el!: HTMLSpanElement;
  const key = () => glassStillKey(props.colors, props.angle, props.shape ?? null);
  const [uri, setUri] = createSignal<string | null>(null);
  /* the still the box shows: until one is drawn, the one it names, which the server's may paint */
  const [showing, setShowing] = createSignal<string | null>(null);
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
  const draw = (colors: readonly string[], angle: number, shape: number | null, named: string) => {
    if (key() !== named) return;
    const made = stillUri(colors, angle, shape);
    if (made) {
      drawnAt = performance.now();
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
      const { named, colors, angle, shape } = next;
      const was = away;
      away = false;
      if (named === untrack(showing)) return;
      if (serverStill(named)) {
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
      data-glass-still={showing() ?? key()}
      style={{ background: uri() ? `url("${uri()}") 50% 50% / cover no-repeat` : undefined }}
    />
  );
}
