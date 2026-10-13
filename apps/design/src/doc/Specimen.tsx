import { Icon } from "@grabient/ui/Icon.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { type Element, For, Show } from "solid-js";
import styles from "./Specimen.module.css";

/** Where a specimen stands: solid paper, or a picture (`art`, a CSS background) for what sits over artwork. Its
    contents are centered with room around them. */
export function Stage(props: {
  art?: string;
  /** a stage as tall as its row's tallest, with less room: a cell of a grid */
  tight?: boolean;
  /** the contents left aligned and stacked */
  column?: boolean;
  /** a page of this theme, whatever the document's */
  theme?: "dark" | "light";
  children: Element;
}) {
  return (
    <div
      class={styles.stage}
      data-art={props.art ? "" : undefined}
      data-tight={props.tight ? "" : undefined}
      data-column={props.column ? "" : undefined}
      data-theme={props.theme}
      style={props.art ? { "background-image": props.art } : undefined}
    >
      {props.children}
    </div>
  );
}

/** A specimen and the line under it that says what it is; `column` stacks it from the top, so cells side by side
    line up their contents. */
export function Cell(props: {
  caption: string;
  art?: string;
  column?: boolean;
  children: Element;
}) {
  return (
    <figure class={styles.cell}>
      <Stage art={props.art} tight column={props.column}>
        {props.children}
      </Stage>
      <figcaption class={styles.caption}>
        <Text variant="mono">{props.caption}</Text>
      </figcaption>
    </figure>
  );
}

/** Cells side by side, as many as fit at `min` wide. */
export function Cells(props: { min?: number; children: Element }) {
  return (
    <div class={styles.cells} style={{ "--min": `${props.min ?? 200}px` }}>
      {props.children}
    </div>
  );
}

/** One component drawn across two axes: a row per value of one, a column per value of the other, each named once at
    its edge. `art` gives a cell a picture to stand on. */
export function Matrix<R extends string, C extends string>(props: {
  rows: readonly R[];
  cols: readonly C[];
  /** the names of the two axes, in the corner */
  axes?: string;
  art?: (row: R, col: C) => string | undefined;
  cell: (row: R, col: C) => Element;
}) {
  return (
    <div class={styles.matrix} style={{ "--cols": String(props.cols.length) }}>
      <span class={styles.corner}>
        <Show when={props.axes}>{axes => <Text variant="micro">{axes()}</Text>}</Show>
      </span>
      <For each={props.cols}>
        {col => (
          <span class={styles.colHead}>
            <Text variant="mono">{col}</Text>
          </span>
        )}
      </For>
      <For each={props.rows}>
        {row => (
          <>
            <span class={styles.rowHead}>
              <Text variant="mono">{row}</Text>
            </span>
            <For each={props.cols}>
              {col => (
                <Stage art={props.art?.(row, col)} tight>
                  {props.cell(row, col)}
                </Stage>
              )}
            </For>
          </>
        )}
      </For>
    </div>
  );
}

/** A specimen judged: drawn on paper, then a mark that says Do or Don't and one short line. */
export function Verdict(props: {
  ok?: boolean;
  caption: string;
  art?: string;
  /** a specimen that is a line of words: less height */
  compact?: boolean;
  children: Element;
}) {
  return (
    <figure class={styles.verdict}>
      <div
        class={styles.judged}
        data-ok={props.ok ? "" : undefined}
        data-compact={props.compact ? "" : undefined}
        style={props.art ? { "background-image": props.art } : undefined}
      >
        {props.children}
      </div>
      <figcaption class={styles.mark} data-ok={props.ok ? "" : undefined}>
        <Icon name={props.ok ? "check" : "close"} size={14} />
        <Text variant="ui" strong={props.ok} danger={!props.ok}>
          {props.ok ? "Do" : "Don't"}
        </Text>
        <Text variant="small">{props.caption}</Text>
      </figcaption>
    </figure>
  );
}

/** Verdicts side by side: a Do and its Don't as a pair, or `columns` to a row. */
export function Verdicts(props: { pair?: boolean; columns?: number; children: Element }) {
  return (
    <div
      class={styles.verdicts}
      style={{ "--columns": String(props.pair ? 2 : (props.columns ?? 4)) }}
    >
      {props.children}
    </div>
  );
}
