import { For } from "solid-js";
import hidden from "./hidden.module.css";
import { Icon } from "./Icon.tsx";
import { t } from "./i18n.ts";
import styles from "./Keyframes.module.css";
import { createHold, SLOP } from "./press.ts";
import { tooltip } from "./Tooltip.tsx";

/** How a press holds a keyframe. `one`: holds it alone, or lets it go where it was held; `only`: holds it alone
    whatever was held (the arrows, which walk the chips without letting go); `range`: from the last press to this one;
    `toggle`: adds it to the hold or lets it go. */
export type PickMode = "one" | "only" | "range" | "toggle";

/** The mode a mouse or a key press asks for by its modifiers. */
export const pickModeOf = (e: MouseEvent | KeyboardEvent): PickMode =>
  e.shiftKey ? "range" : e.metaKey || e.ctrlKey ? "toggle" : "one";

/* The keyframes at the head of the panel: a chip each in its own color, the held ones ringed in ink, the one the numbers
   read carrying a caret, and at the end the count between the presses that change it. A click holds one alone, Shift
   extends, Ctrl or Cmd adds, and a press that sweeps across the chips holds the run it crossed. A finger's tap is the
   click, its long press Ctrl or Cmd, its slide along the row the sweep, and up or down it scrolls the page holding
   nothing. Left to right in every language, as the palette and the arrows run. */
export function Keyframes(props: {
  /** one per keyframe: its hex, and the wider paint where the screen shows it */
  stops: readonly { hex: string; paint?: string }[];
  /** the held keyframes' indices */
  selection: readonly number[];
  /** the keyframe the numbers read */
  lead?: number;
  onPick: (i: number, mode: PickMode) => void;
  /** a press that swept from one chip to another */
  onSweep?: (from: number, to: number) => void;
  min: number;
  max: number;
  onAdd: () => void;
  onRemove: () => void;
  /** what the minus does now: the last keyframe, or the held ones */
  removeLabel?: string;
}) {
  let strip!: HTMLDivElement;
  const held = (i: number) => props.selection.includes(i);
  const count = () => props.stops.length;
  let from = -1;
  let last = -1;
  let pointer: number | null = null;
  const chipAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-i]");
    return el && strip.contains(el) ? Number(el.dataset.i) : -1;
  };
  const sweepFrom = (i: number, id: number) => {
    from = last = i;
    pointer = id;
    strip.setPointerCapture(id);
  };
  /* a finger waits to show what it is: nothing changes as it lands, since it may start a scroll */
  let finger: { i: number; x0: number } | null = null;
  const hold = createHold(() => {
    if (finger) props.onPick(finger.i, "toggle");
  });
  const down = (e: PointerEvent, i: number) => {
    if (e.pointerType === "touch") {
      finger = { i, x0: e.clientX };
      hold.down(e);
      return;
    }
    if (e.button !== 0) return;
    const mode = pickModeOf(e);
    props.onPick(i, mode);
    if (mode === "one" && props.onSweep) sweepFrom(i, e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (finger && pointer === null) {
      hold.move(e);
      /* along the row a finger sweeps; up or down the page has taken it before this hears it */
      if (!props.onSweep || Math.abs(e.clientX - finger.x0) <= SLOP) return;
      hold.cancel();
      sweepFrom(finger.i, e.pointerId);
    }
    if (e.pointerId !== pointer) return;
    const j = chipAt(e.clientX, e.clientY);
    if (j >= 0 && j !== last) {
      last = j;
      props.onSweep?.(from, j);
    }
  };
  const release = () => {
    if (pointer !== null && strip.hasPointerCapture(pointer)) strip.releasePointerCapture(pointer);
    pointer = null;
    from = -1;
  };
  const up = (e: PointerEvent) => {
    if (finger) {
      const f = finger;
      const swept = pointer !== null;
      finger = null;
      if (hold.up(e) === "tap" && !swept) props.onPick(f.i, "one");
    }
    if (e.pointerId === pointer) release();
  };
  /* the page took the finger for a scroll: nothing was held, and nothing is */
  const cancel = (e: PointerEvent) => {
    if (finger) {
      finger = null;
      hold.cancel();
    }
    if (e.pointerId === pointer) release();
  };
  const walk = (e: KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const j = Math.max(0, Math.min(count() - 1, i + step));
    strip.querySelector<HTMLElement>(`[data-i="${j}"]`)?.focus();
    /* the arrows hold the chip they reach alone: as a press, one already held would be let go */
    props.onPick(j, e.shiftKey ? "range" : "only");
  };
  const removeLabel = () => props.removeLabel ?? t("Remove keyframe");
  const tipRemove = tooltip(removeLabel);
  const tipAdd = tooltip(() => t("Add keyframe"));
  return (
    <div class={styles.row} dir="ltr">
      <div
        ref={strip}
        class={styles.strip}
        role="listbox"
        aria-multiselectable="true"
        aria-label={t("Keyframes")}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
      >
        <For each={props.stops} keyed={false}>
          {(stop, i) => {
            const tip = tooltip(() =>
              t("Keyframe {number} · {hex}", { number: i + 1, hex: stop().hex })
            );
            return (
              <button
                ref={tip}
                type="button"
                role="option"
                class={styles.chip}
                data-i={i}
                data-held={held(i) ? "" : undefined}
                data-lead={props.lead === i ? "" : undefined}
                aria-selected={held(i) ? "true" : "false"}
                tabindex={(props.lead ?? 0) === i ? 0 : -1}
                style={{ "--c": stop().paint ?? stop().hex }}
                onPointerDown={e => down(e, i)}
                onKeyDown={e => walk(e, i)}
                onContextMenu={e => e.preventDefault()}
                onClick={e => {
                  /* Enter or Space: a pointer has picked on its own press already */
                  if (e.detail === 0) props.onPick(i, pickModeOf(e));
                }}
              >
                <span class={hidden.text}>
                  {t("Keyframe {number}, {hex}", { number: i + 1, hex: stop().hex })}
                </span>
              </button>
            );
          }}
        </For>
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: two presses and the count they change, which a fieldset would box */}
      <div class={styles.count} role="group" aria-label={t("Keyframe count")}>
        {/* at its limit a press stays where it is and says it cannot, rather than take the keyboard away with it */}
        <button
          ref={tipRemove}
          type="button"
          class={styles.press}
          aria-disabled={count() <= props.min ? "true" : undefined}
          aria-label={removeLabel()}
          onClick={() => {
            if (count() > props.min) props.onRemove();
          }}
        >
          <Icon name="minus" size={13} />
        </button>
        <span class={styles.number} aria-hidden="true">
          {count()}
        </span>
        <button
          ref={tipAdd}
          type="button"
          class={styles.press}
          aria-disabled={count() >= props.max ? "true" : undefined}
          aria-label={t("Add keyframe")}
          onClick={() => {
            if (count() < props.max) props.onAdd();
          }}
        >
          <Icon name="plus" size={13} />
        </button>
      </div>
    </div>
  );
}
