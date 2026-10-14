import { t } from "@grabient/i18n";
import type { Sample } from "@grabient/search/picture.ts";
import { Button } from "@grabient/ui/Button.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { createSignal, For, onSettled, Show } from "solid-js";
import styles from "./Sampler.module.css";

/* A picture and the points its colors are read from, in the palette's order, with a line through them as the blend
   runs. A point is dragged or stepped with the arrow keys; the page reads the color under it again (`onMove`) and
   searches once it rests (`onRelease`). A double-click on the picture adds a point there (`onAdd`), and Delete,
   Backspace or a double-click on a point takes it out (`onRemove`). The picture is shown whole; on a list's grid it is
   two columns wide, so the palettes made from it stand beside it. */

/* arrows step a point a hundredth of the picture, a tenth with Shift, the same way in every language: a picture is
   never mirrored */
const STEPS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1]
};
const clamp = (v: number) => Math.min(1, Math.max(0, v));

export function Sampler(props: {
  src: string;
  width: number;
  height: number;
  /** what the picture is, said to a screen reader */
  label: string;
  /** the points in the palette's order, across and down from 0 to 1, each with the color read under it */
  points: readonly Sample[];
  onMove: (index: number, x: number, y: number) => void;
  /** a move came to rest: the page searches with the points' colors */
  onRelease: () => void;
  /** the points back where they were read first; shown once one has moved */
  onReset?: () => void;
  /** a double-click on the picture: a point added there, or put in a nearer color's place once a palette is full */
  onAdd?: (x: number, y: number) => void;
  /** a point taken out; absent while there are as few as a palette needs */
  onRemove?: (index: number) => void;
}) {
  const [chosen, setChosen] = createSignal<number | null>(null);
  const [box, setBox] = createSignal({ left: 0, top: 0, width: 0, height: 0 });
  const [dragging, setDragging] = createSignal(false);
  let stage!: HTMLFieldSetElement;
  let frame!: HTMLDivElement;
  const buttons: HTMLButtonElement[] = [];

  /* the picture is shown whole: the largest of its shape the stage holds, half a point in from each side, so a point
     at its edge is never cut */
  const fit = () => {
    const inset = (buttons[0]?.firstElementChild as HTMLElement | undefined)?.offsetWidth ?? 24;
    const scale = Math.max(
      0,
      Math.min(
        (stage.clientWidth - inset) / props.width,
        (stage.clientHeight - inset) / props.height
      )
    );
    const width = props.width * scale;
    const height = props.height * scale;
    setBox({
      width,
      height,
      left: (stage.clientWidth - width) / 2,
      top: (stage.clientHeight - height) / 2
    });
  };
  onSettled(() => {
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => observer.disconnect();
  });

  const at = (e: { clientX: number; clientY: number }) => {
    const r = frame.getBoundingClientRect();
    return [clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height)] as const;
  };
  /* the pointer a drag follows, by its id, which may be any integer */
  let drag: { i: number; pid: number } | null = null;
  const down = (i: number, e: PointerEvent & { currentTarget: HTMLButtonElement }) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag = { i, pid: e.pointerId };
    setChosen(i);
    setDragging(true);
    e.currentTarget.focus({ preventScroll: true });
  };
  const move = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.pid) props.onMove(drag.i, ...at(e));
  };
  const release = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pid) return;
    drag = null;
    setDragging(false);
    props.onRelease();
  };
  const onPoint = (e: MouseEvent) => !!(e.target as Element).closest("button");
  const remove = (i: number) => {
    if (!props.onRemove) return;
    setChosen(null);
    props.onRemove(i);
  };
  const key = (i: number, e: KeyboardEvent) => {
    const step = e.altKey || e.ctrlKey || e.metaKey ? undefined : STEPS[e.key];
    if (step) {
      e.preventDefault();
      const by = e.shiftKey ? 0.1 : 0.01;
      const p = props.points[i];
      setChosen(i);
      props.onMove(i, clamp(p.x + step[0] * by), clamp(p.y + step[1] * by));
    } else if (e.key === "Escape") setChosen(null);
    else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove(i);
    }
  };
  const choose = (i: number) => {
    setChosen(i);
    buttons[i]?.focus({ preventScroll: true });
  };
  const route = () => props.points.map(p => `${p.x * 100},${p.y * 100}`).join(" ");
  const named = (i: number, hex: string) => t("Color {number}, {hex}", { number: i + 1, hex });

  return (
    <div class={styles.host}>
      <fieldset
        ref={stage}
        class={styles.stage}
        style={{ "aspect-ratio": `${props.width} / ${props.height}` }}
        aria-label={props.label}
      >
        {/* a press on the picture lets the chosen point go; a double-click adds one there */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: a pointer's shortcut; the points and their keys do the rest */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: the points take the keys, each its own press */}
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
          {/* kept by place, so a point's press stays the same while its color and place change under a drag */}
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
                aria-label={named(i, p().hex)}
                aria-pressed={chosen() === i ? "true" : "false"}
                onPointerDown={e => down(i, e)}
                onPointerMove={move}
                onPointerUp={release}
                onPointerCancel={release}
                onLostPointerCapture={release}
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
                  if (!drag) setChosen(c => (c === i ? null : c));
                }}
              >
                <span
                  class={styles.dot}
                  data-chosen={chosen() === i ? "" : undefined}
                  style={{ "background-color": p().hex }}
                />
              </button>
            )}
          </For>
        </div>
      </fieldset>
      <div class={styles.line}>
        <For each={props.points} keyed={false}>
          {(p, i) => (
            <button
              type="button"
              class={styles.chip}
              data-on={chosen() === i ? "" : undefined}
              aria-label={named(i, p().hex)}
              onClick={() => choose(i)}
            >
              <span class={styles.swatch} style={{ "background-color": p().hex }} />
              <Text variant="mono" dir="ltr">
                {p().hex}
              </Text>
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
