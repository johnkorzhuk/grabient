import type { Namer } from "@grabient/engine/precise-names.ts";
import { createSignal } from "solid-js";

/* The precise names swatch files give colors (packages/engine/src/precise-names.ts), from the file the build writes
   under /assets/ (scripts/color-names.ts). It is fetched once something is about to write a swatch file and kept by
   the browser's cache and the service worker, so no page's first load carries it. Until it is read, and wherever it
   can't be, a file names its colors with the broad names in the reader's language. Browser only. */

const [held, setHeld] = createSignal<Namer | null>(null);
let reading: Promise<Namer | null> | null = null;

/** The precise names, read once; null while they can't be had, and the next call tries again. */
export function preciseNames(): Promise<Namer | null> {
  reading ??= Promise.resolve()
    .then(() =>
      Promise.all([
        fetch(__COLOR_NAMES__).then(answer =>
          answer.ok ? answer.text() : Promise.reject(new Error(`${answer.status}`))
        ),
        import("@grabient/engine/precise-names.ts")
      ])
    )
    .then(([text, { preciseNamer }]) => {
      const names = preciseNamer(text);
      setHeld(() => names);
      return names;
    })
    .catch(() => {
      reading = null;
      return null;
    });
  return reading;
}

/** The precise names once read, else null: what draws them shows them as they arrive. */
export const namesNow = held;

/** The precise names, waiting no longer than `ms` for them: a file is never held up long for its names. */
export const namesWithin = (ms = 2000): Promise<Namer | null> =>
  Promise.race([preciseNames(), new Promise<null>(done => setTimeout(() => done(null), ms))]);
