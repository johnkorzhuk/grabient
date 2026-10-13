import { createSignal } from "solid-js";

/** A confirmation that lives on the control that acted: for a moment its glyph is a check and its word may say
    Copied. No toast, nothing elsewhere on the page. `mark` says what just happened; it clears itself after `ms`. */
export function createDone<T = true>(ms = 1200): [done: () => T | null, mark: (value: T) => void] {
  const [done, setDone] = createSignal<T | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const mark = (value: T) => {
    /* a function form, so a value that is itself a function is kept as it is */
    setDone(() => value);
    clearTimeout(timer);
    timer = setTimeout(() => setDone(null), ms);
  };
  return [done, mark];
}
