/* A finger on a control. A touch screen has no hover and no modifier keys, so a press is read by how long it stays
   and where it goes: lifted where it landed it is a tap, held still for LONG_MS it is a long press (the touch
   screen's Ctrl or Cmd click), and past SLOP it is a drag or a scroll, which the control or the page takes.
   A pointer is followed by its id, and no pointer is null: an id is any integer, and iPad Safari numbers its fingers
   from a base of its own, as often below zero as above it, so reading the sign would take such a finger for none. */
const LONG_MS = 450;
/** How far a finger may drift and still press where it landed, in CSS px. */
export const SLOP = 8;

export interface Hold {
  /** a finger came down: the timing starts */
  down(e: PointerEvent): void;
  /** the finger moved: past SLOP it is no longer a press */
  move(e: PointerEvent): void;
  /** the finger lifted: a tap, a long press (already reported), or neither (it travelled) */
  up(e: PointerEvent): "tap" | "long" | "none";
  /** the page took the gesture (a scroll) or the control did (a drag): nothing is reported */
  cancel(): void;
}

/** Times one finger at a time. `onLong` runs the moment a press becomes a long one, with a short buzz where the device
    has one, so the finger knows before it lifts. */
export function createHold(onLong: () => void, ms = LONG_MS): Hold {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finger: number | null = null;
  let x = 0;
  let y = 0;
  let fired = false;
  let travelled = false;
  const stop = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  return {
    down(e) {
      stop();
      finger = e.pointerId;
      x = e.clientX;
      y = e.clientY;
      fired = false;
      travelled = false;
      timer = setTimeout(() => {
        timer = undefined;
        if (travelled || finger === null) return;
        fired = true;
        /* a device buzzes only for a page the reader has already pressed */
        if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(10);
        onLong();
      }, ms);
    },
    move(e) {
      if (e.pointerId !== finger || travelled) return;
      if (Math.hypot(e.clientX - x, e.clientY - y) > SLOP) {
        travelled = true;
        stop();
      }
    },
    up(e) {
      if (e.pointerId !== finger) return "none";
      stop();
      finger = null;
      return fired ? "long" : travelled ? "none" : "tap";
    },
    cancel() {
      stop();
      finger = null;
      travelled = true;
    }
  };
}
