import type { Element } from "solid-js";
import styles from "./Label.module.css";

/** The quiet uppercase label above a field (`field`) or as a section's eyebrow. Never a heading or a button. */
export function Label(props: { field?: boolean; id?: string; children: Element }) {
  return (
    <span id={props.id} class={styles.label} data-field={props.field ? "" : undefined}>
      {props.children}
    </span>
  );
}
