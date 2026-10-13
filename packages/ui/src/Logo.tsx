import { createSignal, createUniqueId, For } from "solid-js";
import styles from "./Logo.module.css";
import { LOGO_BAR, LOGO_PATH, LOGO_VIEWBOX } from "./logo.data.ts";

const bar = LOGO_BAR;

/** The wordmark. The letters take the current ink and the bar under the b shows the palette in view; while the mark
    is under the pointer or pressed (or `glow`), two blurred copies of the bar spill its light. `window` empties the
    bar, so a canvas behind the page shows through it, and `barRef` tells that canvas where the bar is. The height sets
    the size and the width follows. */
export function Logo(props: {
  /** the bar's ramp in order: the palette in view, or a resting one */
  stops: readonly string[];
  /** in CSS px: 48 in the header, 38 on a phone, 24 in a line */
  height?: number;
  mode?: "fill" | "window";
  barRef?: (el: SVGRectElement) => void;
  /** the spill held on, for a parent that owns the hover */
  glow?: boolean;
}) {
  const id = createUniqueId();
  const [over, setOver] = createSignal(false);
  const [down, setDown] = createSignal(false);
  const lit = () => !!props.glow || over() || down();
  const offset = (i: number) =>
    `${props.stops.length > 1 ? (i / (props.stops.length - 1)) * 100 : 0}%`;
  return (
    <svg
      class={styles.logo}
      data-window={props.mode === "window" ? "" : undefined}
      data-lit={lit() ? "" : undefined}
      viewBox={LOGO_VIEWBOX}
      height={props.height ?? "100%"}
      role="img"
      aria-label="Grabient"
      onPointerEnter={() => setOver(true)}
      onPointerLeave={() => {
        setOver(false);
        setDown(false);
      }}
      onPointerDown={() => setDown(true)}
      onPointerUp={() => setDown(false)}
      onPointerCancel={() => setDown(false)}
    >
      <defs>
        <linearGradient id={`${id}-ramp`} x1="0%" y1="0%" x2="100%" y2="0%">
          <For each={props.stops} keyed={false}>
            {(color, i) => <stop class={styles.stop} offset={offset(i)} stop-color={color()} />}
          </For>
        </linearGradient>
        <filter id={`${id}-near`} x="-40%" y="-200%" width="180%" height="500%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
        <filter id={`${id}-far`} x="-120%" y="-600%" width="340%" height="1300%">
          <feGaussianBlur stdDeviation="4.5" />
        </filter>
      </defs>
      <path fill="currentColor" d={LOGO_PATH} />
      <rect
        class={styles.far}
        x={bar.x - 1}
        y={bar.y - 1}
        width={bar.w + 2}
        height={bar.h + 2}
        fill={`url(#${id}-ramp)`}
        filter={`url(#${id}-far)`}
      />
      <rect
        class={styles.near}
        x={bar.x}
        y={bar.y}
        width={bar.w}
        height={bar.h}
        fill={`url(#${id}-ramp)`}
        filter={`url(#${id}-near)`}
      />
      <rect
        ref={el => props.barRef?.(el)}
        class={styles.bar}
        x={bar.x}
        y={bar.y}
        width={bar.w}
        height={bar.h}
        fill={`url(#${id}-ramp)`}
      />
    </svg>
  );
}
