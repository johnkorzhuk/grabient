import { flush } from "solid-js";

/* What puts away a panel that floats over the page (the color picker, the size sheet, the appearance menu): a press
   anywhere outside it and the press that opened it, heard before the page's own handlers, or the keyboard leaving it.
   And where the keyboard goes when the control it is on goes away. */

/** Calls `close` for a press outside every element `inside` names, until the returned function is called. */
export function pressOutside(
  inside: () => readonly (Node | null | undefined)[],
  close: () => void
): () => void {
  const away = (e: PointerEvent) => {
    const target = e.target as Node | null;
    if (!target || inside().some(el => el?.contains(target))) return;
    close();
  };
  document.addEventListener("pointerdown", away, true);
  return () => document.removeEventListener("pointerdown", away, true);
}

/** Whether a focus moving away lands outside every element `inside` names. A focus going nowhere (the window put away,
    the focused element taken from the page) is no leaving, nor is one into what stands over everything and gives the
    keyboard back (data-over: the ? list). */
export const focusLeft = (
  e: FocusEvent,
  ...inside: readonly (Node | null | undefined)[]
): boolean => {
  const to = e.relatedTarget as Node | null;
  if (!to || (to instanceof Element && to.closest("[data-over]"))) return false;
  return !inside.some(el => el?.contains(to));
};

/** Runs `act`, and if it takes the control the keyboard is on off the page, gives the keyboard to the neighbor `next`
    finds once the page has changed, so it never falls back to the page's start. A neighbor out of view is scrolled
    into it, so its ring is seen. */
export function keepKeyboard(act: () => void, next: () => HTMLElement | null | undefined): void {
  const had = document.activeElement;
  act();
  if (!had || had === document.body) return;
  flush();
  if (!had.isConnected) next()?.focus();
}

/** Whether a key goes to a field being typed in inside `root`, which takes Escape to put its text back first. */
export const typingIn = (root: Element, target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement && !target.readOnly && root.contains(target);
