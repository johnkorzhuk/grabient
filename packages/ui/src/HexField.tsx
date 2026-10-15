import { typedHex } from "@grabient/engine/typed.ts";
import { createEffect, createSignal, Show } from "solid-js";
import { BarRim } from "./BarRim.tsx";
import { ColorPicker } from "./ColorPicker.tsx";
import styles from "./HexField.module.css";
import { msg, t } from "./i18n.ts";
import { composing } from "./keys.ts";
import { tooltip } from "./Tooltip.tsx";

/* A color as hex: its name at the start, the value in mono at the end, on the input recipe with the bar's rim. Enter or
   leaving commits a six-digit hex, and anything else goes back to the color it had. Enter and Escape keep the keyboard
   on the field, read only and passing the page its keys until a key that types takes it again, as a number field does;
   in a field a finger opened they put the phone's keyboard away. With a picker (`onPick`) a swatch of the color leads
   the box, as a fill's does in a design tool, and a press on it pops the color picker up over the page, beside the
   panel the field stands in (`beside`) or hung from the swatch, so nothing moves. Left to right in every language. */
export function HexField(props: {
  /** its name; Hex by default */
  label?: string;
  /** the name drawn as a number field draws its own */
  quiet?: boolean;
  value: string;
  /** a typed hex; false puts the field back */
  onCommit: (hex: string) => unknown;
  /** each move of the color picker the swatch opens */
  onPick?: (hex: string) => void;
  /** the panel the field stands in, whose controls the picker changes: it stands beside it, toward the line's start */
  beside?: () => HTMLElement | undefined;
}) {
  let input!: HTMLInputElement;
  const [swatch, setSwatch] = createSignal<HTMLButtonElement>();
  const [editing, setEditing] = createSignal(false);
  const [open, setOpen] = createSignal(false);
  const tip = tooltip(() => t("Color picker"));
  createEffect(
    () => [props.value, editing()] as const,
    ([hex, typing]) => {
      if (!typing) input.value = hex;
    }
  );
  const take = () => {
    input.readOnly = false;
    setEditing(true);
  };
  /* a finger's tap opened the typing */
  let finger = false;
  /* the hex on screen is the keyframe's color rounded to 8 bits, so text that never changed is not written back:
     tabbing through would move the keyframe to its rounding */
  const commit = () => {
    const hex = typedHex(input.value);
    const same = !!hex && hex === props.value.toLowerCase();
    const ok = same || (!!hex && props.onCommit(hex) !== false);
    if (!ok || same) input.value = props.value;
    setEditing(false);
  };
  return (
    <div class={styles.host} dir="ltr">
      <BarRim />
      <div
        class={styles.box}
        data-swatched={props.onPick ? "" : undefined}
        data-editing={editing() ? "" : undefined}
      >
        <Show when={props.onPick}>
          <button
            ref={el => {
              setSwatch(el);
              tip(el);
            }}
            type="button"
            class={styles.swatch}
            aria-label={t("Color picker")}
            aria-haspopup="dialog"
            aria-expanded={open() ? "true" : "false"}
            onClick={() => setOpen(!open())}
          >
            <span
              class={styles.chip}
              data-open={open() ? "" : undefined}
              style={{ background: props.value }}
            />
          </button>
        </Show>
        <span class={styles.label} data-quiet={props.quiet ? "" : undefined}>
          {props.label ?? "Hex"}
        </span>
        <input
          ref={input}
          class={styles.input}
          type="text"
          spellcheck="false"
          autocomplete="off"
          aria-label={t(props.label ? msg("{label} color") : msg("Hex color"), {
            label: props.label
          })}
          defaultValue={props.value}
          onPointerDown={e => {
            finger = e.pointerType === "touch";
          }}
          onFocus={() => {
            take();
            input.select();
          }}
          onBlur={() => {
            if (editing()) commit();
            input.readOnly = false;
            finger = false;
          }}
          onKeyDown={e => {
            if (composing(e)) return;
            if (!editing()) {
              /* a key that types, its character landing in the field it takes */
              if (e.ctrlKey || e.metaKey || e.altKey) return;
              if (e.key.length !== 1 && e.key !== "Backspace" && e.key !== "Delete") return;
              take();
              input.select();
            } else if (e.key === "Enter" || e.key === "Escape") {
              e.stopPropagation();
              if (e.key === "Escape") input.value = props.value;
              /* a finger's field lets go, which puts the phone's keyboard away and commits */
              if (finger) return input.blur();
              commit();
              input.readOnly = true;
              input.select();
            }
          }}
        />
      </div>
      <Show when={open() && props.onPick ? swatch() : undefined} keyed>
        {at => (
          <ColorPicker
            value={props.value}
            onInput={hex => props.onPick?.(hex)}
            onCommit={hex => props.onCommit(hex)}
            anchor={at}
            beside={props.beside?.()}
            toward="start"
            onClose={() => setOpen(false)}
          />
        )}
      </Show>
    </div>
  );
}
