/* A reader turns a part of a palette's examples page to another look (looks.ts's looksFor): a finger or a pointer drawn
   across it sideways, further than up or down and past REACH, turns it on (drawn toward the line's start) or back; a
   press on it anywhere but its own controls turns it on; Enter or Space on it when it has the focus turns it on; and
   the arrow keys turn the part in play (turnInPlay, state.ts's examplesBindings), each through the turn the part
   gave. A finger's scroll up and down stays the page's (the stage's touch-action: pan-y), and the press a drag ends
   with does nothing else. */

/** How far a drag goes before it is a swipe, in CSS pixels. */
const REACH = 48;
/** How far a pointer moves before its drag holds the text still. */
const SLOP = 6;
/** What a press or a drag on a part leaves to itself: its controls, a tile that turns on its own, code, words held. */
const OWN =
  "button, a, input, select, textarea, label, summary, [role=button], [role=tab], [data-turns], [data-keys=own], [data-hold]";

/** Each part's turn, as turnsOn was given it, for the keys that turn the part in play. */
const turns = new WeakMap<Element, (by: 1 | -1) => void>();

/** Turns `el`'s part on a swipe across it, a press on it or Enter and Space on it, and on the arrow keys while it is
    in play; returns what lets go of it. */
export function turnsOn(el: HTMLElement, turn: (by: 1 | -1) => void): () => void {
  turns.set(el, turn);
  let start: { x: number; y: number; id: number } | null = null;
  let swiped = false;
  const end = () => {
    start = null;
    delete el.dataset.dragging;
    removeEventListener("pointermove", move);
    removeEventListener("pointerup", up);
    removeEventListener("pointercancel", end);
  };
  const move = (e: PointerEvent) => {
    if (start && e.pointerId === start.id && Math.abs(e.clientX - start.x) > SLOP)
      el.dataset.dragging = "";
  };
  const up = (e: PointerEvent) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    end();
    if (Math.abs(dx) < REACH || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    swiped = true;
    const toStart = dx < 0 !== (getComputedStyle(el).direction === "rtl");
    turn(toStart ? 1 : -1);
  };
  const down = (e: PointerEvent) => {
    if (e.button !== 0 || !e.isPrimary) return;
    swiped = false;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    addEventListener("pointermove", move, { passive: true });
    addEventListener("pointerup", up);
    addEventListener("pointercancel", end);
  };
  /* the press a swipe ends with turns nothing more, a tile's own included */
  const held = (e: MouseEvent) => {
    if (!swiped) return;
    swiped = false;
    e.preventDefault();
    e.stopPropagation();
  };
  const press = (e: MouseEvent) => {
    if (e.defaultPrevented || (e.target as Element | null)?.closest(OWN)) return;
    turn(1);
  };
  const key = (e: KeyboardEvent) => {
    if (e.target !== el || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    turn(1);
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("click", held, true);
  el.addEventListener("click", press);
  el.addEventListener("keydown", key);
  return () => {
    end();
    turns.delete(el);
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("click", held, true);
    el.removeEventListener("click", press);
    el.removeEventListener("keydown", key);
  };
}

/** Turns the part in play on or back, as a swipe across it would: the part holding the focus, else the one under the
    pointer, else the one whose middle stands nearest the window's (each marked data-look). */
export function turnInPlay(by: 1 | -1) {
  const parts = [...document.querySelectorAll<HTMLElement>("[data-look]")];
  const focused = document.activeElement?.closest<HTMLElement>("[data-look]");
  const hovered = parts.find(part => part.matches(":hover"));
  const mid = innerHeight / 2;
  const nearest = parts
    .map(part => {
      const box = part.getBoundingClientRect();
      return { part, off: Math.abs(box.top + box.height / 2 - mid) };
    })
    .sort((a, b) => a.off - b.off)[0]?.part;
  const part = focused ?? hovered ?? nearest;
  if (part) turns.get(part)?.(by);
}
