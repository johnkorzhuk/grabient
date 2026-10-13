import tip from "@grabient/ui/Tooltip.module.css";
import type { Element } from "solid-js";
import styles from "./HeldTip.module.css";

/** A tooltip as the site draws it, held open under its control for a reader to see at rest: the design system's own
    bubble, set in the page's flow instead of over the window. */
export function HeldTip(props: { text: string; children: Element }) {
  return (
    <span class={styles.held}>
      {props.children}
      <span class={tip.bubble} data-open="" style={{ position: "static" }}>
        {props.text}
      </span>
    </span>
  );
}
