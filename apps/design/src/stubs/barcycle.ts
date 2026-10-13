/* A stand-in for @grabient/ui/barcycle.ts until the design system lands it, with grabient4's name and options: the
   wordmark's bar dwells on each palette, then tweens to the next with the next move (bartween.ts). Under reduced
   motion it holds; a hidden tab stops the clock. Deleted at the merge. */
import {
  type LCH,
  lchSamples,
  MOVES,
  type Move,
  mixStops,
  toHexes
} from "@grabient/ui/bartween.ts";
import { reducedMotion } from "@grabient/ui/motion.ts";
import { createSignal, onSettled } from "solid-js";

export function createBarCycle(
  palettes: () => readonly (readonly string[])[],
  opts: { n?: number; dwell?: number; tween?: number; moves?: readonly Move[] } = {}
) {
  const n = opts.n ?? 32;
  const dwell = opts.dwell ?? 4;
  const tween = opts.tween ?? 2.2;
  const moves = opts.moves ?? MOVES;
  const list = palettes();
  const [stops, setStops] = createSignal<readonly string[]>(toHexes(lchSamples(list[0] ?? [], n)));
  onSettled(() => {
    let a: LCH[] = lchSamples(list[0] ?? [], n);
    let b = a;
    let index = 0;
    let count = 0;
    let phase = tween;
    let last = 0;
    let frame = 0;
    const tick = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      if (!reducedMotion() && !document.hidden && list.length > 1) {
        phase += dt;
        const move = moves[(count - 1 + moves.length) % moves.length];
        if (phase < tween)
          setStops(toHexes(mixStops(a, b, phase / tween, move, count % 2 ? 1 : -1)));
        else if (phase >= tween + dwell) {
          index = (index + 1) % list.length;
          a = b;
          b = lchSamples(list[index], n);
          count++;
          phase = 0;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  });
  return { stops };
}
