import { isServer } from "@solidjs/web";
import { type Accessor, createSignal, onCleanup } from "solid-js";

/* Whether a card is in the window or near it, for a view being set: while a field is stepped the cards in sight draw
   each value from the draft, and the rest keep the view the address has until it takes the value, or until they come
   into sight. A list keeps a screen of cards drawn above and below the window, and a collection's page all of its
   cards, each of which drew every value a hand passed through. One observer watches every card. */

/** How far past the window a card counts as in sight: those the next frames of a scroll bring in. */
const MARGIN = "25% 0px";

const told = new WeakMap<Element, (seen: boolean) => void>();
let watcher: IntersectionObserver | null = null;

/** Whether the card whose element `ref` is handed is in sight. True until the browser says, and on the server. */
export function createSight(): { inSight: Accessor<boolean>; ref: (el: HTMLElement) => void } {
  const [inSight, setInSight] = createSignal(true);
  let watched: HTMLElement | null = null;
  onCleanup(() => {
    if (!watched) return;
    watcher?.unobserve(watched);
    told.delete(watched);
  });
  return {
    inSight,
    ref: el => {
      if (isServer || typeof IntersectionObserver !== "function") return;
      watcher ??= new IntersectionObserver(
        entries => {
          for (const entry of entries) told.get(entry.target)?.(entry.isIntersecting);
        },
        { rootMargin: MARGIN }
      );
      watched = el;
      told.set(el, setInSight);
      watcher.observe(el);
    }
  };
}
