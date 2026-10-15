import { numeral } from "@grabient/engine/typed.ts";
import { createEffect, createSignal, untrack } from "solid-js";
import { BarRim } from "./BarRim.tsx";
import { Icon } from "./Icon.tsx";
import joined from "./joined.module.css";
import { composing } from "./keys.ts";
import styles from "./Scrub.module.css";
import { fixed, scrubDrag, snapGrain } from "./scrub.ts";
import { tooltip } from "./Tooltip.tsx";

/* The number field: its name inside the box at the start, its value at the end. A drag anywhere on it scrubs (Shift
   coarse, Alt fine), a click types (Enter or leaving commits, Escape puts the number back), the arrows step and a
   double-click resets. Enter and Escape keep the keyboard on the field, which then passes the page its keys until a key
   that types takes it again. A finger's tap types from its touchend, where every phone opens the keyboard, and its
   Enter puts the keyboard away; a finger that goes on to scroll the page leaves the field alone. A hairline along the
   foot shows the value in its range, from zero.
   With `onLock`, a lock is joined to its end past a line the two share, a toggle the drag never reaches. The field
   reads left to right in every language, as its drag does. */
export interface ScrubProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  /** an arrow's step; the drag's pace comes from the range, or from this where it has no ends */
  step?: number;
  /** what a committed value is rounded to: the number on screen is one the address reproduces */
  grain?: number;
  /** a double-click commits this */
  def?: number;
  /** where a drag or an arrow starts while the field reads Auto under its floor: the number Auto comes to */
  origin?: number;
  fmt?: (v: number) => string;
  /** typed text to a number, after its digits are read in any script */
  parse?: (s: string) => number;
  /** the 32px height of a dense row */
  small?: boolean;
  /** inert for now: dimmed, still editable */
  muted?: boolean;
  /** the lock joined to the field's end is closed */
  locked?: boolean;
  /** the lock's name, which aria-pressed completes: what it keeps */
  lockLabel?: string;
  /** the lock's tip while it is closed: what a press does then */
  unlockLabel?: string;
  onLock?: () => void;
  /** the lock stands apart from the field, since it keeps more than this number */
  lockApart?: boolean;
  /** what the field says on rest, focus or a long press: why it stands dimmed */
  tip?: string;
  onInput: (v: number) => void;
}

const DOUBLE_MS = 400;
const TAP_FALLBACK_MS = 300;

export function Scrub(props: ScrubProps) {
  let root!: HTMLDivElement;
  let input!: HTMLInputElement;
  const tipped = "tip" in props ? tooltip(() => props.tip) : undefined;
  const [editing, setEditing] = createSignal(false);
  /* synchronous truth: a signal written now reads its old value until the write settles, and a blur right after Enter
     must already see the field as done */
  let edit = false;
  /* a finger's tap opened the typing: its end puts the phone's keyboard away */
  let finger = false;
  const fmt = (v: number) =>
    (props.fmt ?? (x => fixed(x, props.grain && props.grain < 1 ? 2 : 0)))(v);
  const parse = (s: string) => (props.parse ?? Number.parseFloat)(numeral(s));
  const lo = () => props.min ?? Number.NEGATIVE_INFINITY;
  const hi = () => props.max ?? Number.POSITIVE_INFINITY;
  const span = () => (Number.isFinite(lo()) && Number.isFinite(hi()) ? hi() - lo() : 0);
  const step = () => props.step ?? (span() ? span() / 100 : 1);
  const clamp = (v: number) => Math.min(hi(), Math.max(lo(), v));
  const commit = (v: number) => {
    if (Number.isFinite(v)) props.onInput(clamp(snapGrain(v, props.grain)));
  };

  /* the text follows the value only while nobody types: the markup sets defaultValue alone, since a bound value is
     written again on every run of the input's bindings and would wipe a number being typed */
  createEffect(
    () => [fmt(props.value), editing()] as const,
    ([text, typing]) => {
      if (!typing) input.value = text;
    }
  );
  const setEdit = (on: boolean) => {
    edit = on;
    setEditing(on);
    input.readOnly = !on;
  };
  /* only changed text commits: the field shows a rounded number, and tabbing through would write the rounding over the
     palette, a new seed and an undo step each time */
  const done = (apply: boolean) => {
    if (!edit) return;
    const text = input.value;
    setEdit(false);
    if (apply && text.trim() !== fmt(props.value).trim()) commit(parse(text));
    if (finger) input.blur();
    input.value = fmt(props.value);
  };
  const type = (byFinger = false) => {
    finger = byFinger;
    setEdit(true);
    input.focus();
    input.setSelectionRange(0, input.value.length);
  };

  const drag = scrubDrag(() => (span() ? span() / 180 : step() * 2));
  let dragValue = 0;
  /* the value the drag began from, and whether it has moved it */
  let start = 0;
  let dragged = false;
  let pointer: number | null = null;
  let lastTap = 0;
  let tapped = false;
  const release = () => {
    if (pointer !== null && root.hasPointerCapture(pointer)) root.releasePointerCapture(pointer);
    pointer = null;
  };
  const down = (e: PointerEvent) => {
    /* a second finger is a pinch, the page's to zoom */
    if (pointer !== null && e.pointerId !== pointer) return cancel();
    if (edit) {
      /* a second click soon after the one that started typing resets */
      if (
        e.pointerType !== "touch" &&
        props.def !== undefined &&
        performance.now() - lastTap < DOUBLE_MS
      ) {
        e.preventDefault();
        setEdit(false);
        input.blur();
        commit(props.def);
      }
      return;
    }
    e.preventDefault();
    dragValue = props.origin ?? props.value;
    start = props.value;
    dragged = false;
    pointer = e.pointerId;
    tapped = false;
    drag.down(e);
    root.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (pointer === null) return;
    drag.move(e, dv => {
      dragValue = clamp(dragValue + dv);
      dragged = true;
      commit(dragValue);
    });
  };
  const up = (e: PointerEvent) => {
    if (pointer === null) return;
    release();
    if (drag.up()) return;
    lastTap = performance.now();
    if (e.pointerType !== "touch") return type();
    tapped = true;
    /* a touch screen that sends no touch events still types, if without the keyboard's promise */
    setTimeout(() => {
      if (tapped && root.isConnected) {
        tapped = false;
        type(true);
      }
    }, TAP_FALLBACK_MS);
  };
  /* a finger's tap types from its touchend, whichever of it and the pointerup comes first; taking the touchend's default
     leaves no click after it to take the focus the keyboard came up for */
  const touchEnd = (e: TouchEvent) => {
    if (pointer !== null) {
      release();
      if (!drag.up()) {
        lastTap = performance.now();
        tapped = true;
      }
    }
    if (!tapped) return;
    tapped = false;
    e.preventDefault();
    type(true);
  };
  /* the page took the finger, for a scroll or a pinch's zoom wherever its other finger landed: no tap, the keyboard
     stays down, and what the drag moved goes back */
  function cancel() {
    tapped = false;
    if (pointer === null) return;
    release();
    drag.up();
    if (dragged) props.onInput(start);
  }
  const keys = (e: KeyboardEvent) => {
    if (composing(e)) return;
    if (e.key === "Enter") done(true);
    else if (e.key === "Escape") {
      if (!edit) return;
      e.stopPropagation();
      input.value = fmt(props.value);
      done(false);
    } else if (
      !edit &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete")
    ) {
      /* a key that types, its character landing in the field it takes */
      setEdit(true);
      input.select();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const by = (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1) * step();
      /* text that is no number (Auto, a half-typed sign) steps from the value it stands for */
      const read = edit ? parse(input.value) : props.value;
      const typed = Number.isFinite(read) ? read : props.value;
      const from = props.origin !== undefined && typed === props.value ? props.origin : typed;
      const next = clamp(snapGrain(from + by, props.grain));
      commit(next);
      if (edit) input.value = fmt(next);
    }
  };
  /* where the value stands in its range, from zero: none for a field without ends */
  const fill = () => {
    if (!span() || hi() <= lo()) return null;
    const at = (x: number) => Math.min(1, Math.max(0, (x - lo()) / span()));
    const p = at(props.value);
    const zero = at(0);
    return {
      from: Math.min(p, zero),
      width: Math.abs(p - zero),
      zero,
      signed: zero > 0.001 && zero < 0.999
    };
  };
  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const locking = untrack(() => !!props.onLock);
  const apart = () => !!props.lockApart;
  const field = (
    <div
      ref={el => {
        root = el;
        el.addEventListener("touchend", touchEnd, { passive: false });
        el.addEventListener("touchcancel", cancel);
      }}
      class={styles.scrub}
      data-editing={editing() ? "" : undefined}
      data-muted={props.muted ? "" : undefined}
      data-small={props.small ? "" : undefined}
      data-joined={locking ? (apart() ? "apart" : "end") : undefined}
      dir="ltr"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
    >
      <BarRim square={locking && !apart() ? "end" : undefined} kept />
      <div class={styles.box}>
        <span class={styles.label}>{props.label}</span>
        {/* a spin button, so a screen reader says what an arrow's step comes to */}
        <input
          ref={el => {
            input = el;
            tipped?.(el);
          }}
          class={styles.input}
          type="text"
          role="spinbutton"
          inputmode={lo() < 0 ? "text" : "decimal"}
          enterkeyhint="done"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          readonly
          aria-label={props.label}
          aria-valuenow={Number.isFinite(props.value) ? props.value : undefined}
          aria-valuemin={Number.isFinite(lo()) ? lo() : undefined}
          aria-valuemax={Number.isFinite(hi()) ? hi() : undefined}
          aria-valuetext={fmt(props.value)}
          defaultValue={fmt(props.value)}
          onKeyDown={keys}
          onChange={e => {
            if (edit) done(true);
            else if (!e.isTrusted) commit(parse(input.value));
          }}
          onBlur={() => done(true)}
          onFocus={() => {
            if (edit) return;
            finger = false;
            setEdit(true);
            input.select();
          }}
        />
        {/* the value in its range, at once: no transition */}
        <span
          class={styles.bar}
          style={{ "--at": pct(fill()?.from ?? 0), "--aw": pct(fill()?.width ?? 0) }}
          aria-hidden="true"
        />
        {fill()?.signed && (
          <span
            class={styles.tick}
            style={{ "--at0": pct(fill()?.zero ?? 0) }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
  if (!locking) return field;
  /* the name stays as it is, as a heart's does: aria-pressed says whether it is closed, the tip what a press does */
  const tip = tooltip(
    () => (props.locked ? (props.unlockLabel ?? props.lockLabel) : props.lockLabel),
    {
      turns: true
    }
  );
  return (
    <div class={styles.host} data-apart={apart() ? "" : undefined} dir="ltr">
      {field}
      <span class={joined.part}>
        <button
          ref={tip}
          type="button"
          class={[joined.end, styles.lock]}
          data-size={props.small ? "md" : undefined}
          data-apart={apart() ? "" : undefined}
          aria-label={props.lockLabel}
          aria-pressed={props.locked ? "true" : "false"}
          onClick={() => props.onLock?.()}
        >
          <Icon name={props.locked ? "lock" : "lockOpen"} size={14} />
        </button>
      </span>
    </div>
  );
}
