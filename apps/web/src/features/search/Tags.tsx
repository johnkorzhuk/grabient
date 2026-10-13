import styles from "./Tags.module.css";

/* Stands in for the search area's tags row (U07, U03 G) until it lands: the row's room, so nothing beneath moves when
   its tags arrive. */
export function Tags(_props: { surface: "home" | "palettes"; words: string }) {
  return <div class={styles.row} aria-hidden="true" />;
}
