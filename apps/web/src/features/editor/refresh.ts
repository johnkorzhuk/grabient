/* The screen's refresh rate, read once from the browser's own frames as the Appearance menu first asks: the most
   frames a second an effect's FPS reaches here, 60 until it is read and on a 60 Hz screen, the screen's own up to 120
   on a faster one (a 144 Hz screen offers 120). An address may still ask for more than this screen shows, and a
   screen that shows it plays it. */
import { EFFECT_FPS } from "@grabient/engine/effect.ts";
import { createSignal } from "solid-js";

const [rate, setRate] = createSignal<number>(EFFECT_FPS.default);
let asked = false;

/** The most frames a second this screen shows that an effect may ask for. */
export function screenFps(): number {
  if (!asked && typeof window !== "undefined") {
    asked = true;
    const times: number[] = [];
    const tick = (now: number) => {
      times.push(now);
      if (times.length < 32) {
        requestAnimationFrame(tick);
        return;
      }
      const gaps = times
        .slice(1)
        .map((t, i) => t - times[i])
        .sort((a, b) => a - b);
      /* the middle gap, which a dropped frame or a busy one leaves where it is */
      const hz = 1000 / gaps[gaps.length >> 1];
      if (Number.isFinite(hz))
        setRate(Math.max(EFFECT_FPS.default, Math.min(EFFECT_FPS.max, Math.round(hz))));
    };
    requestAnimationFrame(tick);
  }
  return rate();
}
