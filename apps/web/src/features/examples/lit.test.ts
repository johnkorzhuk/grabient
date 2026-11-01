import { createRoot, flush } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import { createLit } from "./lit.ts";

/* A picture of the examples lit: its effect plays once the pointer rests on it with the page still, or while the
   keyboard's focus is in it. */

/** The window's events, which Node has none of, for the tests that point at a picture. */
function windowEvents(): EventTarget {
  const page = new EventTarget();
  Object.assign(globalThis, {
    addEventListener: page.addEventListener.bind(page),
    removeEventListener: page.removeEventListener.bind(page)
  });
  return page;
}

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(globalThis, "addEventListener");
  Reflect.deleteProperty(globalThis, "removeEventListener");
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
    vi.advanceTimersByTime(40);
    flush();
    expect(lit.on()).toBe(true);
    lit.leave();
    flush();
    expect(lit.on()).toBe(false);
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
    lit.focus();
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

test("a picture the server drew lets go of nothing of the window's, which a Worker lacks", () => {
  expect(() =>
    createRoot(dispose => {
      createLit();
      dispose();
    })
  ).not.toThrow();
});
