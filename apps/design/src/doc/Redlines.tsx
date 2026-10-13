import { For, Show } from "solid-js";
import styles from "./Redlines.module.css";

/** A redline in its host's pixels: a dimension between two points with its value beside its middle, or a dashed
    guide (`guide`) with its name past its end. */
export interface Mark {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  guide?: boolean;
}
const TICK = 4;

/* a dimension's two ticks, square to it at each end */
const ticks = (m: Mark) => {
  const across = m.y1 === m.y2;
  return [
    [m.x1, m.y1],
    [m.x2, m.y2]
  ].map(([x, y]) =>
    across
      ? { x1: x, y1: y - TICK, x2: x, y2: y + TICK }
      : { x1: x - TICK, y1: y, x2: x + TICK, y2: y }
  );
};
/* where a mark's words stand: past a guide's end, over the middle of a dimension across, beside one down */
function label(m: Mark): {
  x: number;
  y: number;
  anchor: "start" | "middle";
  baseline: "middle" | "auto";
} {
  if (m.guide)
    return { x: Math.max(m.x1, m.x2) + TICK + 2, y: m.y1, anchor: "start", baseline: "middle" };
  if (m.y1 === m.y2)
    return { x: (m.x1 + m.x2) / 2, y: m.y1 - TICK - 4, anchor: "middle", baseline: "auto" };
  return { x: m.x1 + TICK + 4, y: (m.y1 + m.y2) / 2, anchor: "start", baseline: "middle" };
}

/** Measurements drawn over a specimen in the accent, which marks measurement and nothing else. The host is
    positioned; the marks are in its pixels, and each new measure moves the same lines. */
export function Redlines(props: { marks: readonly Mark[] }) {
  return (
    <svg class={styles.lines} aria-hidden="true">
      <For each={props.marks} keyed={false}>
        {m => (
          <g>
            <line
              class={m().guide ? styles.guide : styles.line}
              x1={m().x1}
              y1={m().y1}
              x2={m().x2}
              y2={m().y2}
            />
            <Show when={!m().guide}>
              <For each={ticks(m())} keyed={false}>
                {tick => (
                  <line
                    class={styles.line}
                    x1={tick().x1}
                    y1={tick().y1}
                    x2={tick().x2}
                    y2={tick().y2}
                  />
                )}
              </For>
            </Show>
            <text
              class={styles.label}
              x={label(m()).x}
              y={label(m()).y}
              text-anchor={label(m()).anchor}
              dominant-baseline={label(m()).baseline}
            >
              {m().label}
            </text>
          </g>
        )}
      </For>
    </svg>
  );
}

/** Measures now, once the fonts are in, and whenever the element changes size. Returns the cleanup. */
export function watch(el: HTMLElement, measure: () => void): () => void {
  const sizes = new ResizeObserver(measure);
  sizes.observe(el);
  measure();
  void document.fonts.ready.then(() => el.isConnected && measure());
  return () => sizes.disconnect();
}
