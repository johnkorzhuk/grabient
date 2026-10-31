import { glassStillKey } from "@grabient/engine/glass-colors.ts";
import { createEffect, createSignal, onCleanup, onSettled } from "solid-js";
import styles from "./Editor.module.css";
import { loadStill, serverStill, stillUri } from "./glass-draw.ts";

/** How long a palette stands before the small picture is drawn for it: a drag changes the palette every frame, and
    each still is a new image whose decoding (its filter, and the rib maps the filter reads) holds up the frame that
    shows it. The big picture shows every change; this one catches up once the hand rests. */
const REST_MS = 250;

/** The fluted glass's still as a small picture filling its box: the Appearance menu's tile and the header's swatch.
    The server's still where it is this one (the head's style paints any holder that names it), otherwise drawn here
    once the still's code has come: at once as the box comes into sight, and after that once the palette rests. A tile
    made before its menu opens draws nothing until the menu shows it. */
export function GlassArt(props: { colors: readonly string[]; angle: number }) {
  let el!: HTMLSpanElement;
  const key = () => glassStillKey(props.colors, props.angle);
  const [uri, setUri] = createSignal<string | null>(null);
  /* the still the box shows: until one is drawn, the one it names, which the server's may paint */
  const [showing, setShowing] = createSignal<string | null>(null);
  /* the box is in the page with a size */
  const [seen, setSeen] = createSignal(false);
  onSettled(() => {
    const sizes = new ResizeObserver(() => setSeen(el.clientWidth > 0));
    sizes.observe(el);
    return () => sizes.disconnect();
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  /* out of sight since the last still: the next one is drawn at once */
  let away = true;
  const draw = (colors: readonly string[], angle: number, named: string) => {
    if (key() !== named) return;
    const made = stillUri(colors, angle);
    if (made) {
      setUri(made);
      setShowing(named);
    } else void loadStill().then(() => draw(colors, angle, named));
  };
  createEffect(
    () => (seen() ? key() : null),
    named => {
      clearTimeout(timer);
      if (named === null) {
        away = true;
        return;
      }
      const was = away;
      away = false;
      if (named === showing()) return;
      if (serverStill(named)) {
        setUri(null);
        setShowing(named);
        return;
      }
      const colors = props.colors;
      const angle = props.angle;
      if (was) draw(colors, angle, named);
      else timer = setTimeout(() => draw(colors, angle, named), REST_MS);
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
