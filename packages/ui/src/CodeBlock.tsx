import { createMemo, createSignal, For, flush } from "solid-js";
import styles from "./CodeBlock.module.css";
import { matches } from "./keys.ts";

/* The code block, one for every place code is shown: solid paper with an edge at the control radius. A bar heads it,
   a row of tabs with the one Copy at its end; then the code, its lines numbered, on a ground of its own a step under
   the paper; then, back on the paper past a hairline, a quiet line that says what the code is or where it goes, so it
   is never read as code. CodeTabs is this block with its tabs, and CopyLine its paper with one line. The block grows
   to its code up to size.code or most of a short screen; longer code scrolls between the bar and that line, so the
   tabs, Copy and the line keep their places. A long line wraps under its own words. */

/* the comments the blocks show: a line comment runs to the line's end, a block comment to its close, across lines.
   One opens at a word's start, so the // of an address is never one */
const COMMENTS: readonly (readonly [open: string, close: string | null])[] = [
  ["//", null],
  ["/*", "*/"],
  ["<!--", "-->"]
];

/** An address in its parts: its scheme, its host, and each slash with what follows, where a narrow screen may break. */
export const addressParts = (address: string): string[] =>
  address.match(/^[^/]*\/\/|\/?[^/]+|\//g) ?? [address];

/** Selects an element's text, for a copy by hand. */
function selectText(el: Element | undefined): void {
  if (!el) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  const picked = getSelection();
  picked?.removeAllRanges();
  picked?.addRange(range);
}

/** A block's copy the browser refused: the code is selected for a copy by hand, and where Copy took more than is shown
    (an effect's first frame written whole in its tags), the code it took is shown in its place first, until the code
    shown changes. `shown` is the code the block shows for the code it would show. */
export function refusedCopy(code: () => Element | undefined) {
  const [refused, setRefused] = createSignal<{ shown: string; taken: string } | null>(null);
  return {
    shown: (text: string) => {
      const kept = refused();
      return kept?.shown === text ? kept.taken : text;
    },
    refuse: (text: string, taken: string) => {
      if (taken && taken !== text) {
        setRefused({ shown: text, taken });
        flush();
      }
      selectText(code());
    }
  };
}

interface Line {
  indent: string;
  words: { parts: string[]; comment: boolean }[];
}
/* A line longer than this (a picture inside a data URI) is one run of text the browser wraps, as no one reads its
   words: a span to each of its thousands of words held a press on its tab a tenth of a second. */
const LONG = 2000;
function lines(code: string): Line[] {
  let close: string | null = null;
  return code.split("\n").map(line => {
    const indent = /^ */.exec(line)?.[0] ?? "";
    if (line.length > LONG)
      return { indent, words: [{ parts: [line.slice(indent.length)], comment: false }] };
    let rest = false;
    const words = line.length > indent.length ? line.slice(indent.length).split(" ") : [];
    return {
      indent,
      words: words.map(word => {
        let comment = rest || close !== null;
        if (close !== null) {
          if (word.includes(close)) close = null;
        } else if (!rest) {
          const open = COMMENTS.find(([start]) => word.startsWith(start));
          if (open) {
            comment = true;
            if (open[1] === null) rest = true;
            else if (!word.includes(open[1], open[0].length)) close = open[1];
          }
        }
        return { parts: word.includes("://") ? addressParts(word) : [word], comment };
      })
    };
  });
}

/** The code, a line to a numbered row; the numbers are never selected or copied. With focus it keeps its keys
    (data-keys="own"): select all takes the code alone, and Escape hands the keys back. */
export function CodeLines(props: {
  code: string /** the code's own element, for a selection of it alone */;
  ref?: (el: HTMLElement) => void;
}) {
  let code!: HTMLElement;
  const rows = createMemo(() => lines(props.code));
  const own = (e: KeyboardEvent) => {
    if (matches(e, "Mod+A")) {
      e.preventDefault();
      selectText(code);
    } else if (matches(e, "Escape")) (e.currentTarget as HTMLElement).blur();
  };
  return (
    <pre class={styles.pre} dir="ltr" tabindex={0} data-keys="own" onKeyDown={own}>
      <code
        ref={el => {
          code = el;
          props.ref?.(el);
        }}
      >
        <For each={rows()} keyed={false}>
          {line => (
            <span class={styles.line} style={{ "--indent": String(line().indent.length) }}>
              {line().indent}
              <For each={line().words} keyed={false}>
                {(word, i) => (
                  <>
                    {i > 0 && " "}
                    <span class={styles.part} data-comment={word().comment ? "" : undefined}>
                      <For each={word().parts} keyed={false}>
                        {part => <span class={styles.part}>{part()}</span>}
                      </For>
                    </span>
                  </>
                )}
              </For>
            </span>
          )}
        </For>
      </code>
    </pre>
  );
}
