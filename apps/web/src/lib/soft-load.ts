/* The blur's code (engine/soft.ts), which loads only where a view is soft, never with a page's start: a document whose
   address names a soft waits for it before it hydrates (client.tsx), a route that draws one waits for it with its data
   (finishReady), and the Appearance menu asks for it as it opens. Its own module, so the entry that waits for it
   carries nothing else. */
import { createSignal } from "solid-js";

type Soft = typeof import("@grabient/engine/soft.ts");
let soft: Soft | null = null;
let asked: Promise<void> | null = null;
/* followed by the pictures that read it, so a picture drawn plain while it came is drawn again */
const [here, setHere] = createSignal(false);

/** Done once the blur's code is here: at once where it is. */
export function loadSoft(): Promise<void> {
  asked ??= import("@grabient/engine/soft.ts").then(
    m => {
      soft = m;
      setHere(true);
    },
    reason => {
      asked = null;
      throw reason;
    }
  );
  return asked;
}

/** The blur's code where it is here, followed: null while it comes. Read plain once loaded, as a write to a signal
    reads its old value until it settles. */
export const softNow = (): Soft | null => {
  here();
  return soft;
};

/** Done once a view's pictures can be drawn as it asks: at once for one with no soft. A route that draws palettes
    waits for it with its data, as for an effect's code (list/appearance.ts effectsReady). */
export const finishReady = (view: { soft?: number | null }): Promise<void> =>
  view.soft ? loadSoft().catch(() => {}) : Promise.resolve();
