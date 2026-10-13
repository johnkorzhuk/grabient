import type { Element } from "solid-js";
import styles from "./Status.module.css";

/** The line under a form that says what happened. Always drawn, empty too, so a message never moves the press beside
    it; an error is an alert in the danger ink. */
export function Status(props: { error?: boolean; children?: Element }) {
  return (
    <p
      role={props.error ? "alert" : "status"}
      aria-live="polite"
      class={styles.status}
      data-error={props.error ? "" : undefined}
    >
      {props.children}
    </p>
  );
}
