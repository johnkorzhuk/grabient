import { createEffect, createSignal, onSettled, untrack } from "solid-js";
import { lchSamples, MOVES, type Move, mixStops, toHexes } from "./bartween.ts";
import { reducedMotion } from "./motion.ts";
import { waterAllowed } from "./renderer.ts";

/* The wordmark's bar cycling through the palettes in view: it dwells on each, then tweens to the next with the next of
   four moves. A new list (compared by its colors, since a page may hand in a fresh array of the same palettes) tweens
   at once from wherever the bar is. While `follow` gives colors (a brand page's water, a held palette such as the
   editor's) the bar mirrors them instead, so the next tween starts from what was on screen. Under reduced motion the
   bar holds and a new list lands at once; on a software renderer each change lands in one frame, since every frame of
   a tween repaints the header's glass. Paced by time; the clock stops while the tab is hidden. It asks for frames only
   while the bar moves or mirrors: through a dwell it waits on a timer, which a new list or colors to mirror cut short.
   Browser only. */
export function createBarCycle(
  palettes: () => readonly (readonly string[])[],
  opts: {
    n?: number;
    dwell?: number;
    tween?: number;
    follow?: () => readonly string[] | null | undefined;
  } = {}
): () => readonly string[] {
  const n = opts.n ?? 32;
  const dwell = opts.dwell ?? 4;
  const tween = opts.tween ?? 2.2;
  const keyOf = (list: readonly (readonly string[])[]) => list.map(p => p.join(",")).join("|");
  let list = untrack(palettes);
  let key = keyOf(list);
  let a = lchSamples(list[0] ?? [], n);
  let b = a;
  let current = a;
  const [stops, setStops] = createSignal<readonly string[]>(toHexes(a));
  let index = 0;
  let count = 0;
  let phase = dwell;
  let running = false;
  let still = false;
  let stepped = false;
  let dir: 1 | -1 = 1;
  let move: Move = MOVES[0];
  /* from wherever the bar is, to the palette, with the next move; in steps it lands in this frame */
  const go = (target: readonly string[]) => {
    a = current;
    b = lchSamples(target, n);
    move = MOVES[count % MOVES.length];
    dir = count % 2 ? -1 : 1;
    count++;
    phase = 0;
    if (stepped) {
      current = a = b;
      phase = tween;
      setStops(toHexes(b));
    }
  };
  createEffect(
    () => keyOf(palettes()),
    fresh => {
      if (fresh === key) return;
      key = fresh;
      list = untrack(palettes);
      index = 0;
      if (!list.length) return;
      if (still || !running) {
        current = a = b = lchSamples(list[0], n);
        setStops(toHexes(current));
        return;
      }
      go(list[0]);
      loop?.wake();
    }
  );
  let loop: { start(): void; stop(): void; wake(): void } | null = null;
  // colors to mirror end a dwell's wait at once
  createEffect(
    () => !!opts.follow?.()?.length,
    following => {
      if (following) loop?.wake();
    }
  );
  /* reduced, the bar stops where it is; moving again, it carries on from there */
  createEffect(reducedMotion, reduce => {
    still = reduce;
    if (reduce) loop?.stop();
    else loop?.start();
  });
  onSettled(() => {
    let last = 0;
    let raf = 0;
    let rest: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    void waterAllowed().then(ok => {
      if (!ok) stepped = true;
    });
    const frame = () => {
      clearTimeout(rest);
      rest = undefined;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const tick = (now: number) => {
      raf = 0;
      if (stopped || !running) return;
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      const followed = opts.follow?.();
      if (followed?.length) {
        current = a = b = lchSamples(followed, n);
        phase = tween;
        setStops(followed);
      } else {
        phase += dt;
        if (phase < tween) {
          current = mixStops(a, b, phase / tween, move, dir);
          setStops(toHexes(current));
        } else if (phase >= tween + dwell && list.length) {
          index = (index + 1) % list.length;
          go(list[index]);
        }
        if (phase >= tween) {
          // still until the dwell ends: no frames until then
          rest = setTimeout(
            () => {
              rest = undefined;
              phase = Math.max(phase, tween + dwell);
              last = 0;
              frame();
            },
            (tween + dwell - phase) * 1000
          );
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    const halt = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      clearTimeout(rest);
      rest = undefined;
    };
    const visible = () => {
      if (document.hidden) {
        halt();
        last = 0;
      } else if (running) frame();
    };
    loop = {
      start() {
        if (running || stopped) return;
        running = true;
        last = 0;
        frame();
      },
      stop() {
        running = false;
        halt();
      },
      wake() {
        if (running && !stopped && !document.hidden) frame();
      }
    };
    document.addEventListener("visibilitychange", visible);
    still = reducedMotion();
    if (!still) loop.start();
    return () => {
      stopped = true;
      loop?.stop();
      loop = null;
      document.removeEventListener("visibilitychange", visible);
    };
  });
  return stops;
}
