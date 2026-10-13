import styles from "./Rule.module.css";

/** The one separator: a faint dashed line, two pixels of ink on a six pixel period. `inset` keeps it off a pane's
    edges. */
export function Rule(props: { inset?: boolean }) {
  return <hr class={styles.rule} data-inset={props.inset ? "" : undefined} />;
}
