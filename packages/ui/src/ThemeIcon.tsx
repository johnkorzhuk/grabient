import styles from "./ThemeIcon.module.css";

const RAYS =
  "M12 4V2M12 22v-2M4.9 4.9 3.5 3.5M20.5 20.5l-1.4-1.4M4 12H2M22 12h-2M4.9 19.1l-1.4 1.4M20.5 3.5l-1.4 1.4";
const MOON = "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z";

/** The theme button's glyph: the sun on a dark page (the light a press brings), the moon on a light one. They turn
    over only while a change is on screen (`moving`), so the first read of the stored theme after hydration swaps them
    at once, and the turn ends well inside the page's own change, so the button answers the press first. */
export function ThemeIcon(props: { dark: boolean; moving?: boolean; size?: number }) {
  const size = () => props.size ?? 15;
  return (
    <svg
      class={styles.icon}
      data-dark={props.dark ? "" : undefined}
      data-moving={props.moving ? "" : undefined}
      width={size()}
      height={size()}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.9"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <g class={styles.sun}>
        <circle cx="12" cy="12" r="5" />
        <path d={RAYS} />
      </g>
      <path class={styles.moon} d={MOON} />
    </svg>
  );
}
