import { Dynamic } from "@solidjs/web";
import { type Element, onSettled, useContext } from "solid-js";
import { BarLight, Still } from "./contexts.ts";
import styles from "./Pane.module.css";
import { barGone, barWorn } from "./panebar.ts";

/* the wordmark's bar along the pane's top edge. Outside a held frame of the design document the water paints it and
   takes its light in (panebar.ts) */
function Bar() {
  const light = useContext(BarLight);
  const still = useContext(Still);
  let el!: HTMLSpanElement;
  onSettled(() => {
    if (still) return;
    barWorn(el);
    return () => barGone(el);
  });
  return (
    /* the water paints --bar-live while it moves; --bar is the wordmark's colors */
    <span
      ref={el}
      class={styles.bar}
      style={
        light().length ? { "--bar": `linear-gradient(90deg, ${light().join(", ")})` } : undefined
      }
      aria-hidden="true"
    />
  );
}

/** The three surfaces: `frost` is a brand page's sheet over the water, with no border; `paper` a solid card for
    reading; `glass` a menu or popover. A pane may wear the wordmark's bar along its top edge (`bar`), a thin line in
    the bar's colors, dulled at rest and in its true colors under the pointer or with focus inside the pane. Never a
    pane inside a pane: sections inside one are parted by a Rule. */
export function Pane(props: {
  variant?: "frost" | "paper" | "glass";
  padding?: "none" | "sm" | "md" | "lg";
  /** the control radius, for a menu or popover */
  tight?: boolean;
  bar?: boolean;
  as?: "div" | "section" | "main" | "article";
  id?: string;
  role?: "menu" | "dialog" | "region" | "status" | "alert";
  children: Element;
}) {
  return (
    <Dynamic
      component={props.as ?? "div"}
      id={props.id}
      role={props.role}
      class={styles.pane}
      data-variant={props.variant ?? "frost"}
      data-padding={props.padding}
      data-tight={props.tight ? "" : undefined}
      data-bar={props.bar ? "" : undefined}
    >
      {props.bar && <Bar />}
      {props.children}
    </Dynamic>
  );
}
