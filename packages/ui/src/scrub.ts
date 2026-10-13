/* The drag every number field shares: pointer math alone, so the field keeps the DOM, typing and focus.
   A browser's movementX stands for the pointer's travel where it gives one; synthetic pointers report 0 for real motion,
   so the clientX delta stands in. There is no pointer lock (a hidden cursor and an Esc banner read as broken): the gain
   rises with speed instead, so a slow push is fine control and a flick crosses a range in about 150px. Shift and Alt
   scale each step and override that boost. A mouse's click wanders under 3px and a finger's tap further, so a finger
   keeps SLOP of room, and one that strays past it in any direction was never a tap. */
import { SLOP } from "./press.ts";

const MOUSE_SLOP = 3;

export interface ScrubDrag {
  down(e: PointerEvent): void;
  /** `apply` gets each value step once the press is a drag; true while it is one */
  move(e: PointerEvent, apply: (dv: number) => void): boolean;
  /** true when the press became a drag or a finger strayed: no tap */
  up(): boolean;
}

/** The drag of one press at a time, `perPx` value units to a pixel. */
export function scrubDrag(perPx: () => number): ScrubDrag {
  let pointer: number | null = null;
  let x0 = 0;
  let y0 = 0;
  let lastX = 0;
  let lastT = 0;
  let travel = 0;
  let vel = 0;
  let slop = MOUSE_SLOP;
  let finger = false;
  let moved = false;
  let strayed = false;
  const scale = (e: PointerEvent, boost: number) =>
    perPx() * (e.shiftKey ? 10 : e.altKey ? 0.1 : boost);
  return {
    down(e) {
      pointer = e.pointerId;
      x0 = lastX = e.clientX;
      y0 = e.clientY;
      lastT = e.timeStamp;
      travel = vel = 0;
      finger = e.pointerType !== "mouse";
      slop = finger ? SLOP : MOUSE_SLOP;
      moved = strayed = false;
    },
    move(e, apply) {
      if (e.pointerId !== pointer) return moved;
      if (finger && !strayed && Math.hypot(e.clientX - x0, e.clientY - y0) >= slop) strayed = true;
      const dx = e.movementX || e.clientX - lastX;
      lastX = e.clientX;
      const dt = Math.max(1, e.timeStamp - lastT);
      lastT = e.timeStamp;
      if (dx === 0) return moved;
      if (!moved) {
        travel += dx;
        if (Math.abs(travel) < slop) return false;
        moved = true;
        apply(travel * scale(e, 1));
        return true;
      }
      vel = vel * 0.7 + (Math.abs(dx) / dt) * 0.3;
      apply(dx * scale(e, 1 + Math.min(3, Math.max(0, (vel - 0.4) * 2.5))));
      return true;
    },
    up() {
      const was = moved || strayed;
      pointer = null;
      moved = strayed = false;
      return was;
    }
  };
}

/** A value rounded to its grain, so the number on screen is one the address reproduces; no grain, no rounding. */
export const snapGrain = (v: number, grain?: number): number =>
  grain ? Math.round(v / grain) * grain : v;

/** toFixed without a negative zero: the sign follows the rounded number. */
export function fixed(v: number, digits: number): string {
  const s = v.toFixed(digits);
  return /^-0(\.0*)?$/.test(s) ? s.slice(1) : s;
}
