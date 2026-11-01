import { createRoot, flush } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import { createLit } from "./lit.ts";

/* A picture of the examples lit: its effect plays once the pointer rests on it with the page still, or while the
   keyboard's focus is in it. */

/** The window's events and frames, which Node has none of, for the tests that point at a picture: a frame each 16 ms
    of the fake clock. */
function windowEvents(): EventTarget {
  const page = new EventTarget();
  Object.assign(globalThis, {
    addEventListener: page.addEventListener.bind(page),
    removeEventListener: page.removeEventListener.bind(page),
    requestAnimationFrame: (run: () => void) => setTimeout(run, 16),
    cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id)
  });
  return page;
}

/** A focus the keyboard gave, which the browser shows (:focus-visible), and one a press or a tap gave, which it doesn't. */
const KEYBOARD = { target: { matches: (selector: string) => selector === ":focus-visible" } };
const PRESS = { target: { matches: () => false } };

afterEach(() => {
  vi.useRealTimers();
  for (const name of [
    "addEventListener",
    "removeEventListener",
    "requestAnimationFrame",
    "cancelAnimationFrame"
  ])
    Reflect.deleteProperty(globalThis, name);
});

test("a picture lights once the pointer has rested on it with the page still, and goes dark as it leaves", () => {
  vi.useFakeTimers();
  const page = windowEvents();
  createRoot(dispose => {
    const lit = createLit();
    lit.enter();
    vi.advanceTimersByTime(100);
    // the page scrolled under the pointer: the wait starts again
    page.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(100);
    flush();
    expect(lit.on()).toBe(false);
    // the rest, then the next frame
    vi.advanceTimersByTime(40);
    flush();
    expect(lit.on()).toBe(true);
    lit.leave();
    flush();
    expect(lit.on()).toBe(false);
    dispose();
  });
});

test("a scroll the page tells of only with its next frame, held meanwhile, lights nothing", () => {
  vi.useFakeTimers();
  const page = windowEvents();
  createRoot(dispose => {
    const lit = createLit();
    lit.enter();
    // the rest is over while no frame came; the next one tells of a scroll first
    vi.advanceTimersByTime(125);
    page.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(100);
    flush();
    expect(lit.on()).toBe(false);
    vi.advanceTimersByTime(40);
    flush();
    expect(lit.on()).toBe(true);
    dispose();
  });
});

test("a pointer that passes over lights nothing, and the keyboard's focus lights at once until it goes", () => {
  vi.useFakeTimers();
  windowEvents();
  createRoot(dispose => {
    const lit = createLit();
    lit.enter();
    vi.advanceTimersByTime(50);
    lit.leave();
    vi.advanceTimersByTime(500);
    flush();
    expect(lit.on()).toBe(false);
    lit.focus(KEYBOARD);
    flush();
    expect(lit.on()).toBe(true);
    // the pointer leaving a picture the focus is in leaves it lit
    lit.enter();
    lit.leave();
    flush();
    expect(lit.on()).toBe(true);
    lit.blur();
    flush();
    expect(lit.on()).toBe(false);
    dispose();
  });
});

test("a press or a tap that focuses a picture lights nothing, so it goes dark as the pointer leaves", () => {
  vi.useFakeTimers();
  windowEvents();
  createRoot(dispose => {
    const lit = createLit();
    lit.enter();
    vi.advanceTimersByTime(200);
    lit.focus(PRESS);
    flush();
    expect(lit.on()).toBe(true);
    lit.leave();
    flush();
    expect(lit.on()).toBe(false);
    // a tap: the pointer comes and goes at once, and the focus stays
    lit.enter();
    lit.focus(PRESS);
    lit.leave();
    vi.advanceTimersByTime(500);
    flush();
    expect(lit.on()).toBe(false);
    dispose();
  });
});

test("a picture the server drew lets go of nothing of the window's, which a Worker lacks", () => {
  expect(() =>
    createRoot(dispose => {
      createLit();
      dispose();
    })
  ).not.toThrow();
});
