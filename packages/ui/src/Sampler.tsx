import { createSignal, For, onSettled, Show } from "solid-js";
import { Button } from "./Button.tsx";
import { t } from "./i18n.ts";
import { watchSize } from "./measure.ts";
import styles from "./Sampler.module.css";

/** A point a color is read from, across and down the picture from 0 to 1, with the color read under it. */
export interface SamplePoint {
  x: number;
  y: number;
  color: string;
}

/* A picture and the points its colors are read from, in the palette's order, with a line through them as the blend
   runs. A point is dragged or stepped with the arrows; the page reads the color under it again (`onMove`) and searches
   once it rests (`onRelease`). A double-click on the picture adds a point there (`onAdd`); Delete, Backspace or a
   double-click on a point takes it out (`onRemove`). The picture is shown whole, the same way in every language, since
   a picture is never mirrored. On a list's grid it is two columns wide, so the palettes made from it stand beside it. */
const STEPS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1]
};
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function Sampler(props: {
  /** the picture, and its size for its shape */
  src: string;
  width: number;
  height: number;
  /** what the picture is, to a screen reader */
  label: string;
  points: readonly SamplePoint[];
  /** a point moves, while it moves */
  onMove: (index: number, x: number, y: number) => void;
  /** a move came to rest: the page searches with the points' colors */
  onRelease: () => void;
  /** the points back where they were read first; given once one has moved */
  onReset?: () => void;
  /** a double-click on the picture: a point there, or in a nearer color's place once a palette is full */
  onAdd?: (x: number, y: number) => void;
  /** a point taken out; absent while there are as few as a palette needs */
  onRemove?: (index: number) => void;
}) {
  const [chosen, setChosen] = createSignal<number | null>(null);
  const [box, setBox] = createSignal({ left: 0, top: 0, width: 0, height: 0 });
  const [dragging, setDragging] = createSignal(false);
  let stage!: HTMLDivElement;
  let frame!: HTMLDivElement;
  const buttons: HTMLButtonElement[] = [];
  /* the picture whole: the largest frame of its shape the stage holds, half a point in from each side, so a point at
     the picture's edge is never cut */
  onSettled(() =>
    watchSize(stage, () => {
      const inset = (buttons[0]?.firstElementChild as HTMLElement | undefined)?.offsetWidth ?? 24;
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      const k = Math.max(0, Math.min((w - inset) / props.width, (h - inset) / props.height));
      setBox({
        width: props.width * k,
        height: props.height * k,
        left: (w - props.width * k) / 2,
        top: (h - props.height * k) / 2
      });
    })
  );
  const at = (e: { clientX: number; clientY: number }) => {
    const r = frame.getBoundingClientRect();
    return [
      clamp01((e.clientX - r.left) / r.width),
      clamp01((e.clientY - r.top) / r.height)
    ] as const;
  };
  /* the pointer a drag follows, by its id */
  let drag: { i: number; pointer: number } | null = null;
  const down = (i: number, e: PointerEvent & { currentTarget: HTMLButtonElement }) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag = { i, pointer: e.pointerId };
    setChosen(i);
    setDragging(true);
    e.currentTarget.focus({ preventScroll: true });
  };
  const move = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.pointer) props.onMove(drag.i, ...at(e));
  };
  const end = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    drag = null;
    setDragging(false);
    props.onRelease();
  };
  const onPoint = (e: MouseEvent) => !!(e.target as HTMLElement).closest("button");
  const remove = (i: number) => {
    if (!props.onRemove) return;
    setChosen(null);
    props.onRemove(i);
  };
  /* the arrows step a point a hundredth of the picture, a tenth with Shift; it searches once the key is let go */
  const key = (i: number, e: KeyboardEvent) => {
    const step = e.altKey || e.ctrlKey || e.metaKey ? undefined : STEPS[e.key];
    if (step) {
      e.preventDefault();
      const by = e.shiftKey ? 0.1 : 0.01;
      const p = props.points[i];
      setChosen(i);
      props.onMove(i, clamp01(p.x + step[0] * by), clamp01(p.y + step[1] * by));
    } else if (e.key === "Escape") setChosen(null);
    else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove(i);
    }
  };
  const route = () => props.points.map(p => `${p.x * 100},${p.y * 100}`).join(" ");
  return (
    <div class={styles.host}>
      {/* biome-ignore lint/a11y/useSemanticElements: a picture and the points on it, which a fieldset would box */}
      <div
        ref={stage}
        class={styles.stage}
        style={{ "aspect-ratio": `${props.width} / ${props.height}` }}
        role="group"
        aria-label={props.label}
      >
        {/* biome-ignore lint/a11y/noStaticElementInteractions: the picture's presses; every point is a button */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: the points take the keys, the picture only the pointer */}
        <div
          ref={frame}
          class={styles.frame}
          style={{
            left: `${box().left}px`,
            top: `${box().top}px`,
            width: `${box().width}px`,
            height: `${box().height}px`
          }}
          onClick={e => {
            if (!onPoint(e)) setChosen(null);
          }}
          onDblClick={e => {
            if (onPoint(e) || !props.onAdd) return;
            e.preventDefault();
            props.onAdd(...at(e));
          }}
        >
          <img class={styles.picture} src={props.src} alt="" draggable={false} />
          <svg
            class={styles.path}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline class={styles.under} points={route()} vector-effect="non-scaling-stroke" />
            <polyline class={styles.over} points={route()} vector-effect="non-scaling-stroke" />
          </svg>
          {/* kept by place, so a point's button stays while its color and place change under a drag */}
          <For each={props.points} keyed={false}>
            {(p, i) => (
              <button
                ref={el => {
                  buttons[i] = el;
                }}
                type="button"
                class={styles.point}
                data-dragging={dragging() && chosen() === i ? "" : undefined}
                style={{ left: `${p().x * 100}%`, top: `${p().y * 100}%` }}
                aria-label={t("Color {number}, {hex}", { number: i + 1, hex: p().color })}
                aria-pressed={chosen() === i ? "true" : "false"}
                onPointerDown={e => down(i, e)}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
                onLostPointerCapture={end}
                onClick={e => e.stopPropagation()}
                onDblClick={e => {
                  e.stopPropagation();
                  remove(i);
                }}
                onKeyDown={e => key(i, e)}
                onKeyUp={e => {
                  if (STEPS[e.key]) props.onRelease();
                }}
                onBlur={() => {
                  if (!drag && chosen() === i) setChosen(null);
                }}
              >
                <span
                  class={styles.dot}
                  data-chosen={chosen() === i ? "" : undefined}
                  style={{ "background-color": p().color }}
                />
              </button>
            )}
          </For>
        </div>
      </div>
      <div class={styles.line}>
        <For each={props.points} keyed={false}>
          {(p, i) => (
            <button
              type="button"
              class={styles.chip}
              data-on={chosen() === i ? "" : undefined}
              aria-label={t("Color {number}, {hex}", { number: i + 1, hex: p().color })}
              onClick={() => {
                setChosen(i);
                buttons[i]?.focus({ preventScroll: true });
              }}
            >
              <span class={styles.swatch} style={{ "background-color": p().color }} />
              <span class={styles.hex}>{p().color}</span>
            </button>
          )}
        </For>
        <Show when={props.onReset}>
          {reset => (
            <span class={styles.reset}>
              <Button size="sm" variant="ghost" onClick={() => reset()()}>
                {t("Reset")}
              </Button>
            </span>
          )}
        </Show>
      </div>
    </div>
  );
}
