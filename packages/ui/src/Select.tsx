import { createSignal, createUniqueId, onSettled, Show } from "solid-js";
import { BarRim } from "./BarRim.tsx";
import { Icon } from "./Icon.tsx";
import { t } from "./i18n.ts";
import { Label } from "./Label.tsx";
import { type MenuItem, MenuList } from "./Menu.tsx";
import styles from "./Select.module.css";

export interface SelectOption {
  value: string;
  label: string;
  detail?: string;
}

/** A choice from a short list on the input recipe. It opens the design system's own menu, so it looks the same on
    every platform. The arrows open it and move, Enter picks, Escape closes. A choice that should stay in
    view is a Segmented. */
export function Select(props: {
  /** a label above; without one, give an aria-label */
  label?: string;
  "aria-label"?: string;
  name?: string;
  value: string;
  options: readonly SelectOption[];
  /** the prompt while the value is empty */
  placeholder?: string;
  /** the 40px height, beside other 40px controls */
  size?: "md" | "lg";
  onChange?: (value: string) => void;
}) {
  const id = createUniqueId();
  /* the name is the label, then the value (Style Linear), so a screen reader hears the value and voice control can
     say the word the button shows */
  const labelId = `${id}-label`;
  const valueId = `${id}-value`;
  const [open, setOpen] = createSignal(false);
  let host!: HTMLDivElement;
  let trigger!: HTMLButtonElement;
  onSettled(() => {
    const outside = (e: PointerEvent) => {
      if (open() && !host.contains(e.target as Node)) setOpen(false);
    };
    /* Escape closes it, and takes the keyboard back to the field only from inside the menu */
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !open()) return;
      setOpen(false);
      if (!host.contains(document.activeElement)) return;
      e.stopPropagation();
      trigger.focus();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", onEscape, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", onEscape, true);
    };
  });
  const current = () => props.options.find(o => o.value === props.value);
  const pick = (item: MenuItem) => {
    props.onChange?.(item.value);
    trigger.focus();
  };
  return (
    <div class={styles.field}>
      <Show
        when={props.label}
        fallback={
          <span id={labelId} hidden>
            {props["aria-label"]}
          </span>
        }
      >
        <label id={labelId} for={id}>
          <Label field>{props.label}</Label>
        </label>
      </Show>
      <div ref={host} class={styles.host}>
        <BarRim />
        <input type="hidden" name={props.name} value={props.value} />
        <button
          ref={trigger}
          id={id}
          type="button"
          class={styles.trigger}
          data-size={props.size}
          aria-haspopup="menu"
          aria-expanded={open() ? "true" : "false"}
          aria-labelledby={`${labelId} ${valueId}`}
          onClick={() => setOpen(!open())}
          onKeyDown={e => {
            if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open()) {
              e.preventDefault();
              setOpen(true);
            }
          }}
        >
          <span
            id={valueId}
            class={styles.value}
            data-prompt={!current() && props.placeholder ? "" : undefined}
          >
            {current()?.label ?? props.placeholder ?? ""}
          </span>
          <span class={styles.chevron} data-open={open() ? "" : undefined}>
            <Icon name="chevron" size={14} />
          </span>
        </button>
        <Show when={open()}>
          <MenuList
            items={props.options}
            value={props.value}
            label={props["aria-label"] ?? props.label ?? t("Options")}
            onPick={pick}
            onClose={() => {
              const inside = host.contains(document.activeElement);
              setOpen(false);
              if (inside) trigger.focus({ preventScroll: true });
            }}
          />
        </Show>
      </div>
    </div>
  );
}
