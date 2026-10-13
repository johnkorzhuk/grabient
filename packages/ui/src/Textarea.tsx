import { createUniqueId, Show } from "solid-js";
import { BarRim } from "./BarRim.tsx";
import field from "./Field.module.css";
import { Label } from "./Label.tsx";
import styles from "./Textarea.module.css";

/** A Field for more than one line: the same paper, rim and help line, resizable only downward. Spellcheck stays on:
    this is prose. */
export function Textarea(props: {
  label: string;
  name: string;
  value?: string;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  disabled?: boolean;
  maxlength?: number;
  invalid?: boolean;
  help?: string;
  onInput?: (value: string) => void;
}) {
  const id = createUniqueId();
  return (
    <div class={field.field}>
      <label for={id}>
        <Label field>{props.label}</Label>
      </label>
      <div class={field.box} data-disabled={props.disabled ? "" : undefined}>
        <BarRim />
        <span class={field.paper} aria-hidden="true" />
        <textarea
          id={id}
          class={styles.input}
          dir={props.value ? "auto" : undefined}
          name={props.name}
          value={props.value ?? ""}
          placeholder={props.placeholder}
          rows={props.rows ?? 5}
          required={props.required}
          disabled={props.disabled}
          maxlength={props.maxlength}
          spellcheck="true"
          aria-invalid={props.invalid ? "true" : undefined}
          aria-describedby={props.help ? `${id}-help` : undefined}
          onInput={e => props.onInput?.(e.currentTarget.value)}
        />
      </div>
      <Show when={props.help}>
        <p
          id={`${id}-help`}
          aria-live="polite"
          class={field.help}
          data-error={props.invalid ? "" : undefined}
        >
          {props.help}
        </p>
      </Show>
    </div>
  );
}
