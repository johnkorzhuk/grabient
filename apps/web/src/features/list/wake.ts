import { createSignal, onSettled, untrack } from "solid-js";
import { effectsReady, type ListView } from "./appearance.ts";

/** How long a page waits for an idle moment before its glass cards are drawn live, at most. */
const WAKE_MS = 1000;

/** Whether a page whose feed drew cards the server left still, until the reader moves, draws them live once it idles:
    the glass's still is drawn in the browser, which a still card cannot do. Never while the page hydrates, so the
    server's cards are claimed as it drew them. The cards' effect code is asked for as the page settles, so the cards
    the reader's first move draws live have it, and these wait for it: a card drawn without it stands empty a moment.
    Until they wake, the GPU draws the glass's stills into the still cards themselves as soon as its canvas is made,
    which the page asks for at once: they showed their fields alone, without the ribs, until the page idled. */
export function createGlassWake(view: () => ListView): () => boolean {
  const [idle, setIdle] = createSignal(false);
  onSettled(() => {
    let gone = false;
    if (untrack(view).effect?.kind === "glass")
      void import("../editor/glass-draw.ts")
        .then(m => m.loadGpuStill(true).then(() => gone || m.paintStills()))
        .catch(() => {});
    const ready = effectsReady(untrack(view));
    const wake = () => void ready.then(() => gone || setIdle(true));
    if (typeof requestIdleCallback !== "function") {
      const timer = setTimeout(wake, WAKE_MS);
      return () => {
        gone = true;
        clearTimeout(timer);
      };
    }
    const id = requestIdleCallback(wake, { timeout: WAKE_MS });
    return () => {
      gone = true;
      cancelIdleCallback(id);
    };
  });
  return () => idle() && view().effect?.kind === "glass";
}
