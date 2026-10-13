import { type Element, onSettled } from "solid-js";
import { mountAnnouncer } from "./announce.ts";
import styles from "./PageRoot.module.css";

/** The root of a page and the `page` container every layout below it queries, so a component lays out the same in
    the app's window and in a frame of the design document. Its side padding keeps content clear of a landscape
    phone's notch. `bare` sits inside a shell that already paints the ground. */
export function PageRoot(props: { bare?: boolean; children: Element }) {
  onSettled(() => mountAnnouncer());
  return (
    <div class={styles.root} data-bare={props.bare ? "" : undefined}>
      {props.children}
    </div>
  );
}
