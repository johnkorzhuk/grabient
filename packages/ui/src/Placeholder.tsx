import styles from "./Placeholder.module.css";

/** A still block at the size of what has not arrived (a line of words, a control, a picture), so nothing moves when it
    lands. It never pulses: two dozen moving boxes repaint every frame on a slow machine. */
export function Placeholder(props: {
  width?: string;
  height?: string;
  round?: "tight" | "control" | "surface";
}) {
  return (
    <span
      aria-hidden="true"
      class={styles.block}
      data-round={props.round}
      style={{ width: props.width ?? "100%", height: props.height ?? "9px" }}
    />
  );
}
