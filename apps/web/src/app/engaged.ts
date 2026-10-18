import { isServer } from "@solidjs/web";
import { createSignal } from "solid-js";

/* Whether a person has reached for the page: its first pointer move or press, key, wheel or touch. A crawler that
   renders a page to read it makes none of these (a scroll it scripts is none), so what a page asks for its reader
   alone waits for one: a palette's credit, whose name no crawler is to read (gallery/credit.ts), and the palettes
   like it, a search of 96 that only a reader moving down the page uses. The tab keeps it across client navigations. */

const [engaged, setEngaged] = createSignal(false);
const EVENTS = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const;

if (!isServer) {
  const reached = () => {
    setEngaged(true);
    for (const type of EVENTS) removeEventListener(type, reached, true);
  };
  for (const type of EVENTS) addEventListener(type, reached, { capture: true, passive: true });
}

/** Whether a person has moved, pressed, typed, scrolled by wheel or touched the page since it loaded. Reactive. */
export { engaged };
