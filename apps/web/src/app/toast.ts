import { isServer } from "@solidjs/web";
import { createSignal } from "solid-js";

/* The line every page can say a thing on that has no place of its own (a sign-out refused, a key that did nothing):
   a polite live region at the foot of the window, gone after a few seconds. Written only in the browser. */
const SHOWN_MS = 3200;
const [message, setMessage] = createSignal("");
let timer: ReturnType<typeof setTimeout> | undefined;

/** What the line says now, or nothing. */
export const toastMessage = message;

/** Says `text` on the line, in place of what it said. */
export function toast(text: string): void {
  if (isServer) return;
  setMessage(text);
  clearTimeout(timer);
  timer = setTimeout(() => setMessage(""), SHOWN_MS);
}
