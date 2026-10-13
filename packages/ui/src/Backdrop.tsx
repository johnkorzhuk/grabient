import styles from "./Backdrop.module.css";

/** The light behind the paper where the water cannot run (no WebGL, or it failed): the bar's stops as soft washes,
    blurred and dimmed to the theme, `strong` behind the sign-in sheet. A fallback, never chosen over the water. */
export function Backdrop(props: { stops: readonly string[]; strong?: boolean }) {
  const at = (u: number) => {
    const s = props.stops;
    return s[Math.min(s.length - 1, Math.max(0, Math.round(u * (s.length - 1))))] ?? "transparent";
  };
  const washes = () =>
    `radial-gradient(40% 55% at 18% 30%, ${at(0)} 0%, transparent 70%), ` +
    `radial-gradient(45% 60% at 70% 20%, ${at(0.5)} 0%, transparent 70%), ` +
    `radial-gradient(50% 50% at 60% 85%, ${at(1)} 0%, transparent 70%)`;
  return (
    <div class={styles.layer} aria-hidden="true">
      <div
        class={styles.wash}
        data-strong={props.strong ? "" : undefined}
        style={{ "background-image": washes() }}
      />
    </div>
  );
}
