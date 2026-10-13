import styles from "./Icon.module.css";
import { ICONS, type IconName } from "./icons.data.ts";

export { ICONS, type IconName };

/* the glyphs that point along the line of reading, which a right-to-left page turns round: back points right and on
   points left, undo and reset turn back the way a line is read, and the way out to another site leaves toward the
   line's end */
const TURNS = new Set<IconName>([
  "back",
  "arrow",
  "chevronLeft",
  "chevronRight",
  "undo",
  "redo",
  "reset",
  "external"
]);

/** A line icon from the set, in the current ink. It says nothing to a screen reader: the control around it carries
    the name. */
export function Icon(props: {
  name: IconName;
  /** in CSS px */
  size?: number;
  /** filled with the current ink: the liked heart, the star */
  fill?: boolean;
  /** false keeps an arrow as drawn in a right-to-left page: one that points along a palette or an axis, which read
      left to right in every language */
  mirror?: boolean;
}) {
  const size = () => props.size ?? 15;
  return (
    <svg
      class={styles.icon}
      data-turns={props.mirror !== false && TURNS.has(props.name) ? "" : undefined}
      width={size()}
      height={size()}
      viewBox="0 0 24 24"
      fill={props.fill ? "currentColor" : "none"}
      stroke="currentColor"
      stroke-width="1.9"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[props.name]} />
    </svg>
  );
}
