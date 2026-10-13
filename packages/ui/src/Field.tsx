import { createUniqueId, Show } from "solid-js";
import { BarRim } from "./BarRim.tsx";
import styles from "./Field.module.css";
import { Label } from "./Label.tsx";

/** A labeled 40px text input: the buttons' radius, solid on any surface, with an edge. Its rim is the wordmark's bar,
    faint under the pointer and whole with focus; nothing else reacts. The help line under it is the one place for
    validation, so the row keeps its height, and a screen reader hears it as it changes. A value the browser fills in
    is drawn exactly as a typed one. */
export function Field(props: {
  label: string;
  name: string;
  type?: "text" | "email" | "password";
  value?: string;
  placeholder?: string;
  autocomplete?: string;
  inputmode?: "email" | "text" | "numeric" | "decimal";
  required?: boolean;
  disabled?: boolean;
  maxlength?: number;
  /** the value fails validation: the help line is the error */
  invalid?: boolean;
  help?: string;
  /** a state held at rest, for the design document */
  state?: "hover" | "focus";
  onInput?: (value: string) => void;
}) {
  const id = createUniqueId();
  return (
    <div class={styles.field}>
      <label for={id}>
        <Label field>{props.label}</Label>
      </label>
      <div
        class={styles.box}
        data-state={props.state}
        data-disabled={props.disabled ? "" : undefined}
      >
        <BarRim />
        <span class={styles.paper} aria-hidden="true" />
        {/* what is typed reads in its own direction (an English title in an Arabic page); empty, the field and its
            placeholder keep the page's. An address reads left to right in every language */}
        <input
          id={id}
          class={styles.input}
          dir={props.type === "email" ? "ltr" : props.value ? "auto" : undefined}
          type={props.type ?? "text"}
          name={props.name}
          value={props.value ?? ""}
          placeholder={props.placeholder}
          autocomplete={props.autocomplete}
          inputmode={props.inputmode}
          required={props.required}
          disabled={props.disabled}
          maxlength={props.maxlength}
          spellcheck="false"
          aria-invalid={props.invalid ? "true" : undefined}
          aria-describedby={props.help ? `${id}-help` : undefined}
          onInput={e => props.onInput?.(e.currentTarget.value)}
        />
      </div>
      <Show when={props.help}>
        <p
          id={`${id}-help`}
          aria-live="polite"
          class={styles.help}
          data-error={props.invalid ? "" : undefined}
        >
          {props.help}
        </p>
      </Show>
    </div>
  );
}
