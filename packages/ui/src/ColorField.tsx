import { createEffect, createSignal, Show } from "solid-js";
import { BarRim } from "./BarRim.tsx";
import own from "./ColorField.module.css";
import { ColorPicker } from "./ColorPicker.tsx";
import styles from "./HexField.module.css";
import { Icon, type IconName } from "./Icon.tsx";
import { t } from "./i18n.ts";
import { composing } from "./keys.ts";
import { tooltip } from "./Tooltip.tsx";

/* A color written any way CSS writes one, its alpha too, as HexField draws a hex: its name at the start, the value in
   mono at the end, on the input recipe with the bar's rim. A swatch of the color over a checkerboard, which shows how
   much of what is behind it comes through, leads the box and pops the color picker up; the picker sets the color and
   keeps its alpha, but a wholly clear one's, which a color picked makes whole. Once there is one, a press at the end
   clears it, and an empty field reads `empty`; where none stands for a color of its own (`auto`: the strings' designed
   ground), the swatch shows that one and the picker opens on it, and the press says it goes back to it (`clear`).
   Enter or leaving commits what `read` makes of the text (the hex an address keeps); empty text clears it, and text
   that is no color goes back to the color it had. Enter and Escape keep the keyboard on the field, read only and
   passing the page its keys until a key that types takes it again. Left to right in every language.
   With no picker (`onPick`) it has no swatch, and is a field for any words `read` keeps in one spelling: the
   Appearance menu's Path (the aurora's range as its address writes it), which says its own name aloud (`name`).
   With `action`, a press stands at the box's very end, after the clear, which no typing starts from: the Path's dice,
   which makes another path. */
export function ColorField(props: {
  /** its name */
  label: string;
  /** its name aloud, where it holds no color: the label's own words */
  name?: string;
  /** the color as #rrggbb or #rrggbbaa, or null for none */
  value: string | null;
  /** what the field reads with no color */
  empty: string;
  /** the color none stands for, #rrggbb, where it is one: shown in the swatch, and where the picker opens */
  auto?: string;
  /** the name of the press that takes the color away: Clear unless said */
  clear?: string;
  /** typed text as the color it keeps: a hex, null for none, undefined for text that is no color */
  read: (text: string) => string | null | undefined;
  onCommit: (value: string | null) => void;
  /** each move of the color picker the swatch opens */
  onPick?: (value: string) => void;
  /** the panel the field stands in: the picker stands beside it, toward the line's start */
  beside?: () => HTMLElement | undefined;
  /** a press at the box's end, after the clear: its icon, its name, which its tip says too, and what it does */
  action?: { icon: IconName; label: string; onPress: () => void };
}) {
  let input!: HTMLInputElement;
  const [swatch, setSwatch] = createSignal<HTMLButtonElement>();
  const [editing, setEditing] = createSignal(false);
  const [open, setOpen] = createSignal(false);
  const tip = tooltip(() => t("Color picker"));
  const clearName = () => props.clear ?? t("Clear");
  const clearTip = tooltip(clearName);
  const actionTip = tooltip(() => props.action?.label);
  createEffect(
    () => [props.value, editing()] as const,
    ([value, typing]) => {
      if (!typing) input.value = value ?? "";
    }
  );
  const take = () => {
    input.readOnly = false;
    setEditing(true);
  };
  let finger = false;
  const commit = () => {
    const read = props.read(input.value);
    if (read !== undefined && read !== props.value) props.onCommit(read);
    else input.value = props.value ?? "";
    setEditing(false);
  };
  /* the picker's hex with the alpha the color has, a wholly clear one's made whole: a color picked is to be seen */
  const withAlpha = (hex: string) =>
    `${hex.toLowerCase()}${props.value?.length === 9 && !props.value.endsWith("00") ? props.value.slice(7) : ""}`;
  /* what the swatch shows: the color, or the one none stands for */
  const shown = () => props.value ?? props.auto ?? null;
  return (
    <div class={styles.host} dir="ltr">
      <BarRim />
      <div
        class={[styles.box, own.box]}
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
              class={[styles.chip, own.chip]}
              data-open={open() ? "" : undefined}
              data-empty={shown() ? undefined : ""}
              style={{ "--chip": shown() ?? "transparent" }}
            />
          </button>
        </Show>
        <span class={styles.label} data-quiet="">
          {props.label}
        </span>
        <input
          ref={input}
          class={[styles.input, own.input]}
          type="text"
          spellcheck="false"
          autocomplete="off"
          placeholder={props.empty}
          aria-label={props.name ?? t("{label} color", { label: props.label })}
          defaultValue={props.value ?? ""}
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
              if (e.ctrlKey || e.metaKey || e.altKey) return;
              if (e.key.length !== 1 && e.key !== "Backspace" && e.key !== "Delete") return;
              take();
              input.select();
            } else if (e.key === "Enter" || e.key === "Escape") {
              e.stopPropagation();
              if (e.key === "Escape") input.value = props.value ?? "";
              if (finger) return input.blur();
              commit();
              input.readOnly = true;
              input.select();
            }
          }}
        />
        <Show when={props.value}>
          <button
            ref={el => clearTip(el)}
            type="button"
            class={own.press}
            aria-label={clearName()}
            onClick={() => {
              /* the field empty at once, its focus taken to type another */
              input.value = "";
              props.onCommit(null);
              input.focus();
            }}
          >
            <Icon name="close" size={12} />
          </button>
        </Show>
        <Show when={props.action}>
          {action => (
            <button
              ref={el => actionTip(el)}
              type="button"
              class={own.press}
              aria-label={action().label}
              onClick={() => action().onPress()}
            >
              <Icon name={action().icon} size={14} />
            </button>
          )}
        </Show>
      </div>
      <Show when={open() && props.onPick ? swatch() : undefined} keyed>
        {at => (
          <ColorPicker
            value={(shown() ?? "#808080").slice(0, 7)}
            onInput={hex => props.onPick?.(withAlpha(hex))}
            onCommit={hex => props.onCommit(withAlpha(hex))}
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
