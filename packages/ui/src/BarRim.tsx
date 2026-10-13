import { useContext } from "solid-js";
import styles from "./BarRim.module.css";
import { BarLight } from "./contexts.ts";

/* eight samples are enough for a one pixel ring, and keep the style short as the bar tweens */
const eight = (stops: readonly string[]) =>
  stops.length <= 8
    ? stops
    : Array.from({ length: 8 }, (_, i) => stops[Math.round((i / 7) * (stops.length - 1))]);
const ramp = (stops: readonly string[]) =>
  `linear-gradient(90deg, ${stops.map((c, i) => `${c} ${((i / Math.max(1, stops.length - 1)) * 100).toFixed(1)}%`).join(", ")})`;

/** The bar's light on a field: a one pixel ring in the wordmark bar's colors, faint under the pointer and whole with
    focus (the host's --rim-hover and --rim-focus), following the bar as it tweens. One element a pixel larger than
    the opaque field in front of it, so only the ring shows. A field joined to a press beside it (`square`) keeps that
    side's corners square, so each part rings alone; where a phone's layout lets the press go, the corners come back,
    unless the press stays there too (`kept`). */
export function BarRim(props: { square?: "start" | "end"; kept?: boolean }) {
  const light = useContext(BarLight);
  return (
    <span
      class={styles.rim}
      data-square={props.square}
      data-kept={props.kept ? "" : undefined}
      style={light().length ? { "background-image": ramp(eight(light())) } : undefined}
      aria-hidden="true"
    />
  );
}
