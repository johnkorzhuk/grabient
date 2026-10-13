import { t } from "./i18n.ts";
import styles from "./Switch.module.css";

/** A setting that applies at once, with no save: a button that reads On or Off, the word being the state, with no
    track and no knob. Armed (`armed`), it reads what the next press does instead: a switch whose change reaches every
    visitor confirms on itself, and turning such a thing off reads in danger ink. */
export function Switch(props: {
  checked: boolean;
  /** the words of the next press, while it waits for a second one */
  armed?: string;
  "aria-labelledby"?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  disabled?: boolean;
  /** a state held at rest, for the design document */
  state?: "hover" | "focus" | "pressed";
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      class={styles.switch}
      data-on={props.checked || props.armed ? "" : undefined}
      data-danger={props.armed && props.checked ? "" : undefined}
      data-state={props.state}
      aria-checked={props.checked ? "true" : "false"}
      aria-labelledby={props["aria-labelledby"]}
      aria-label={props["aria-label"]}
      aria-describedby={props["aria-describedby"]}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
    >
      {props.armed ?? (props.checked ? t("On") : t("Off"))}
    </button>
  );
}
