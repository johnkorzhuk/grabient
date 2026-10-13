import { createEffect, createSignal, untrack } from "solid-js";

/* A big picture never flashes: the editor's artwork, which fills the screen, and the strip under it. Invert, Reverse,
   Random, an undo of one and the preview a press shows under the pointer each repaint the whole picture at once, and a
   held key asks for that thirty times a second. More than three flashes a second can set off a seizure (WCAG 2.3.1),
   where a flash is two opposite changes of a tenth of the luminance range or more, unless both sides are bright. So a
   repaint that would complete a flash waits until GAP after the change it turns back: a picture flips at most every
   250 ms, whatever asks. Nothing else waits: a first press, a drag and a change that goes one way paint at once, and
   only the picture is held, never the state behind it. */
const GAP = 250;
/* the picture is read at this many places along its colors: each is a band wide enough to flash on its own */
const PLACES = 12;
const JUMP = 0.1;
const BRIGHT = 0.8;

/* the light at each place: the color nearest it */
const places = (lights: readonly number[]): number[] =>
  Array.from({ length: PLACES }, (_, i) =>
    lights.length ? lights[Math.round((i / (PLACES - 1)) * (lights.length - 1))] : 0
  );
const jumps = (from: number, to: number) =>
  Math.abs(to - from) >= JUMP && Math.min(from, to) < BRIGHT;

/** The guard's clock, apart from any rendering: given the lights of the picture painted first, `paint(lights, now)`
    returns how long a picture with these lights must wait, in ms, or 0 when it may be painted now, which it records.
    Lights are each color's relative luminance, 0 to 1, in the order the picture draws them. */
export function flashClock(
  first: readonly number[]
): (lights: readonly number[], now: number) => number {
  let light = places(first);
  /* which way each place last jumped, and when */
  const way = new Array<number>(PLACES).fill(0);
  const at = new Array<number>(PLACES).fill(Number.NEGATIVE_INFINITY);
  return (lights, now) => {
    const to = places(lights);
    let until = 0;
    for (let i = 0; i < PLACES; i++)
      if (jumps(light[i], to[i]) && Math.sign(to[i] - light[i]) === -way[i])
        until = Math.max(until, at[i] + GAP);
    if (until > now) return until - now;
    for (let i = 0; i < PLACES; i++)
      if (jumps(light[i], to[i])) {
        way[i] = Math.sign(to[i] - light[i]);
        at[i] = now;
      }
    light = to;
    return 0;
  };
}

/** `target` as it may be painted: the same value, except that a change which would complete a flash is held until the
    gap is up, and then the newest value is painted. `lights` gives a value's luminances in the order it draws them. */
export function createFlashGuard<T>(
  target: () => T,
  lights: (value: T) => readonly number[]
): () => T {
  const first = untrack(target);
  const paint = flashClock(lights(first));
  /* boxed: a signal given a bare function would take it for its own computation */
  const [painted, setPainted] = createSignal({ value: first });
  let next = first;
  let shown = first;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const settle = () => {
    clearTimeout(timer);
    const wait = paint(lights(next), performance.now());
    if (wait) timer = setTimeout(settle, wait);
    else if (next !== shown) {
      shown = next;
      setPainted({ value: next });
    }
  };
  createEffect(target, value => {
    next = value;
    settle();
    return () => clearTimeout(timer);
  });
  return () => painted().value;
}
