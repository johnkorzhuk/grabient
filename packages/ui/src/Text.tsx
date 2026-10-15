import { Dynamic } from "@solidjs/web";
import type { Element } from "solid-js";
import styles from "./Text.module.css";

/* Every piece of type, by its role in the page: a variant fixes the family, size, weight, line height, tracking and
   ink together, so a page never invents a size. Poppins sets most; `lede` and `num` take the system stack and `mono`
   sets code, hex and seeds. */
export type TextVariant =
  | "title"
  | "h2"
  | "h3"
  | "lede"
  | "body"
  | "ui"
  | "small"
  | "caption"
  | "micro"
  | "num"
  | "mono";
type TextTag = "h1" | "h2" | "h3" | "p" | "span" | "div" | "dt" | "dd" | "figcaption" | "label";

const TAGS: Partial<Record<TextVariant, TextTag>> = {
  title: "h1",
  h2: "h2",
  h3: "h3",
  lede: "p",
  body: "p"
};

export function Text(props: {
  variant: TextVariant;
  /** the element, so a heading keeps its level in the outline; by default the variant's own */
  as?: TextTag;
  /** the ink lifted to primary, for a line that carries the answer */
  strong?: boolean;
  danger?: boolean;
  /** one line, cut at its end: a feed's heading, so a long title never moves the cards below it */
  truncate?: boolean;
  id?: string;
  /** `auto` for words a person or an agent wrote, so they read in their own direction in a right-to-left page */
  dir?: "auto" | "ltr" | "rtl";
  children: Element;
}) {
  return (
    <Dynamic
      component={props.as ?? TAGS[props.variant] ?? "span"}
      id={props.id}
      dir={props.dir}
      class={styles.text}
      data-variant={props.variant}
      data-strong={props.strong ? "" : undefined}
      data-danger={props.danger ? "" : undefined}
      data-truncate={props.truncate ? "" : undefined}
    >
      {props.truncate ? <span class={styles.cut}>{props.children}</span> : props.children}
    </Dynamic>
  );
}
