/* A picture of the examples lit, its effect playing (EffectArt's `active`): while the keyboard's focus is in it, or once
   the pointer rests on it with the page still. A page scrolled under a resting pointer lights nothing until it rests,
   since each picture passing under the pointer would start a player for a moment's sight: a WebGL context and its
   programs, a long task on the page's thread. */
import { createSignal, onCleanup } from "solid-js";

/** How long the pointer rests on a picture, the page still, before it lights. */
const REST_MS = 120;

/** The picture's light, and the handlers its element takes. */
export function createLit() {
  const [on, setOn] = createSignal(false);
  let over = false;
  let focused = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let frame = 0;
  /* a scroll while the pointer rests starts the wait again; heard only while it waits, in the browser */
  let waiting = false;
  const wait = () => {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    timer = setTimeout(rested, REST_MS);
  };
  const quiet = () => {
    clearTimeout(timer);
    if (!waiting) return;
    cancelAnimationFrame(frame);
    waiting = false;
    removeEventListener("scroll", wait, true);
  };
  /* lit in the next frame, whose scroll comes before it: a page whose GPU holds its frames tells of no scroll until
     then, though it moves */
  const rested = () => {
    frame = requestAnimationFrame(() => {
      quiet();
      setOn(true);
    });
  };
  onCleanup(quiet);
  return {
    on,
    enter() {
      over = true;
      if (!waiting) addEventListener("scroll", wait, { capture: true, passive: true });
      waiting = true;
      wait();
    },
    leave() {
      over = false;
      quiet();
      if (!focused) setOn(false);
    },
    /* a press or a tap focuses a tile too, and the focus stays after the pointer goes: the keyboard's alone lights */
    focus(e: { target: { matches(selector: string): boolean } }) {
      if (!e.target.matches(":focus-visible")) return;
      focused = true;
      setOn(true);
    },
    blur() {
      focused = false;
      if (!over) setOn(false);
    }
  };
}
