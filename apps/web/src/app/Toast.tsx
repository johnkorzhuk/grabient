import styles from "./Toast.module.css";
import { toastMessage } from "./toast.ts";

/** The line toast() writes to, at the foot of the window on every page. */
export function Toast() {
  return (
    <div
      class={styles.toast}
      data-shown={toastMessage() ? "" : undefined}
      role="status"
      aria-live="polite"
    >
      {toastMessage()}
    </div>
  );
}
