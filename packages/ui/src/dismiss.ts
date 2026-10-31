import { flush } from "solid-js";

/* What puts away a panel that floats over the page (the color picker, the size sheet, the appearance menu): a press
   anywhere outside it and the press that opened it, heard before the page's own handlers, or the keyboard leaving it.
   And where the keyboard goes when the control it is on goes away. */

/* The panels that float over the page from a press (a color picker), each with that press: a panel opened from inside
   another is inside that one while it is there */
const pressOf = new WeakMap<Element, Element>();

/** Marks `panel`, mounted at the page's end, as opened by `press`: while it is there, a press or the keyboard in it is
    inside whatever holds that press, so the appearance menu a color field stands in stays open under its picker. */
export function openedBy(panel: Element, press: Element | undefined): void {
  if (press) pressOf.set(panel, press);
}

/** Whether `node` is in `el`, or in a panel a press in `el` opened, or in one a press in that opened. */
export function holds(el: Node | null | undefined, node: Node): boolean {
  if (!el) return false;
  let at: Node | null = node;
  for (let hops = 0; at && hops < 8; hops++) {
    if (el.contains(at)) return true;
    let panel: Node | null = at;
    while (panel && !(panel instanceof Element && pressOf.has(panel))) panel = panel.parentNode;
    at = panel instanceof Element ? (pressOf.get(panel) ?? null) : null;
  }
  return false;
}

/** Whether a key or a press comes from a panel a press in `root` opened: that panel answers it first. */
export const fromPanelOf = (root: Element, target: EventTarget | null): boolean =>
  target instanceof Node && !root.contains(target) && holds(root, target);

/** Calls `close` for a press outside every element `inside` names, until the returned function is called. */
export function pressOutside(
  inside: () => readonly (Node | null | undefined)[],
  close: () => void
): () => void {
  const away = (e: PointerEvent) => {
    const target = e.target as Node | null;
    if (!target || inside().some(el => holds(el, target))) return;
    close();
  };
  document.addEventListener("pointerdown", away, true);
  return () => document.removeEventListener("pointerdown", away, true);
}

/** Whether a focus moving away lands outside every element `inside` names, and every panel a press in one opened. A
    focus going nowhere (the window put away, the focused element taken from the page) is no leaving, nor is one into
    what stands over everything and gives the keyboard back (data-over: the ? list). */
export const focusLeft = (
  e: FocusEvent,
  ...inside: readonly (Node | null | undefined)[]
): boolean => {
  const to = e.relatedTarget as Node | null;
  if (!to || (to instanceof Element && to.closest("[data-over]"))) return false;
  return !inside.some(el => holds(el, to));
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
