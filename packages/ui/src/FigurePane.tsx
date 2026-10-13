import { createUniqueId, type Element, Show } from "solid-js";
import styles from "./FigurePane.module.css";
import { Label } from "./Label.tsx";
import { Pane } from "./Pane.tsx";

/* A figure in a paper pane, the code block's own frame: its name at the head, and at the head's end its presses. What
   takes the figure away (its copies and files) shows while the pointer or the keyboard is in the pane, and always where
   nothing hovers; a press that undoes something the reader did to the figure stays in sight before them. A figure
   drawn to a height (`fill`) has all the height the pane is given and never sets it; any other is as tall as it is,
   and takes more where the pane is taller (`stretch`). A figure in an article says what it shows in a quiet line at
   its foot instead of a name, with its one press at the line's end. */
export function FigurePane(props: {
  /** the figure's name, at its head */
  name?: string;
  /** what copies and saves the figure */
  aside?: Element;
  /** a press that stays in sight, before them */
  pinned?: Element;
  /** what the figure shows, in a line under it */
  note?: Element;
  /** the line's one press, at its end */
  act?: Element;
  fill?: boolean;
  stretch?: boolean;
  center?: boolean;
  /** the figure's box, for one drawn to a height */
  body?: (el: HTMLDivElement) => void;
  children: Element;
}) {
  const noteId = createUniqueId();
  return (
    /* a named figure is a group by its name; one without a name is named by its line */
    <figure
      class={styles.pane}
      role={props.name ? "group" : undefined}
      aria-label={props.name}
      aria-labelledby={!props.name && props.note ? noteId : undefined}
    >
      <Pane variant="paper" padding="sm" tight>
        <div class={styles.in}>
          <Show when={props.name}>
            <div class={styles.head}>
              <Label>{props.name}</Label>
              <span class={styles.end}>
                {props.pinned}
                <span class={styles.aside}>{props.aside}</span>
              </span>
            </div>
          </Show>
          <div
            ref={el => props.body?.(el)}
            class={styles.body}
            data-center={props.center ? "" : undefined}
            data-stretch={props.stretch ? "" : undefined}
            data-fill={props.fill ? "" : undefined}
          >
            {props.children}
          </div>
          <Show when={props.note || props.act}>
            <div class={styles.foot}>
              <span id={noteId} class={styles.note}>
                {props.note}
              </span>
              <Show when={props.act}>
                <span class={styles.act}>{props.act}</span>
              </Show>
            </div>
          </Show>
        </div>
      </Pane>
    </figure>
  );
}
