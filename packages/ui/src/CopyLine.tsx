import { createMemo, For } from "solid-js";
import { addressParts } from "./CodeBlock.tsx";
import { CopyButton } from "./CopyButton.tsx";
import styles from "./CopyLine.module.css";

/** One line to copy on the code block's paper, Copy at its end: an address or an email a reader takes whole. An
    address is held in its parts, so a narrow screen breaks it between them, and inside one only when that part alone
    is wider than the row. One press selects the whole line, for a copy by hand. On a phone Copy keeps its glyph. */
export function CopyLine(props: {
  text: string;
  /** the press's name, saying what it copies */
  "aria-label": string;
  /** a specimen's state, held: Copied */
  state?: "copied";
}) {
  const parts = createMemo(() => addressParts(props.text));
  return (
    <div class={styles.line}>
      <code class={styles.text}>
        <span class={styles.parts} dir="ltr">
          <For each={parts()} keyed={false}>
            {part => <span class={styles.part}>{part()}</span>}
          </For>
        </span>
      </code>
      <CopyButton text={props.text} aria-label={props["aria-label"]} compact state={props.state} />
    </div>
  );
}
