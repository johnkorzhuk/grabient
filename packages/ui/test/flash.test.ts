import { describe, expect, test } from "vitest";
import { flashClock } from "../src/flash.ts";

const dark = [0.02, 0.03, 0.05];
const light = [0.7, 0.75, 0.78];

/* Asks for a picture at each time and paints it as the guard does: at once when it may, else when its wait is up,
   with whatever was asked for last by then. Returns the times the picture on screen changed. */
function run(asks: [time: number, lights: readonly number[]][]): number[] {
  const paint = flashClock(dark);
  const flips: number[] = [];
  let shown: readonly number[] = dark;
  let newest: readonly number[] = dark;
  /* when a held picture may be asked for again */
  let due = Number.POSITIVE_INFINITY;
  const settle = (now: number) => {
    const wait = paint(newest, now);
    due = wait ? now + wait : Number.POSITIVE_INFINITY;
    if (wait) return;
    if (newest !== shown) flips.push(now);
    shown = newest;
  };
  for (const [time, lights] of asks) {
    while (due <= time) settle(due);
    newest = lights;
    if (due === Number.POSITIVE_INFINITY) settle(time);
  }
  while (due !== Number.POSITIVE_INFINITY) settle(due);
  return flips;
}

describe("the flash guard", () => {
  test("a first change paints at once", () => {
    expect(flashClock(dark)(light, 0)).toBe(0);
  });

  test("a change back within 250 ms waits for the rest of the gap", () => {
    const paint = flashClock(dark);
    expect(paint(light, 1000)).toBe(0);
    expect(paint(dark, 1100)).toBe(150);
    expect(paint(dark, 1250)).toBe(0);
  });

  test("a change that goes on the same way paints at once", () => {
    const paint = flashClock(dark);
    expect(paint([0.3, 0.3, 0.3], 0)).toBe(0);
    expect(paint(light, 10)).toBe(0);
  });

  test("a small change and a change between bright pictures never wait", () => {
    const small = flashClock([0.4]);
    expect(small([0.45], 0)).toBe(0);
    expect(small([0.4], 1)).toBe(0);
    const bright = flashClock([0.85]);
    expect(bright([1], 0)).toBe(0);
    expect(bright([0.85], 1)).toBe(0);
  });

  test("a held key asking thirty times a second flips the picture at most every 250 ms", () => {
    const asks: [number, readonly number[]][] = Array.from({ length: 90 }, (_, i) => [
      i * 33,
      i % 2 ? dark : light
    ]);
    const flips = run(asks);
    for (let i = 1; i < flips.length; i++)
      expect(flips[i] - flips[i - 1]).toBeGreaterThanOrEqual(250);
    expect(flips.length).toBeGreaterThan(8);
  });

  test("a picture is read at twelve places, so a band that flashes alone is held", () => {
    const paint = flashClock([0.1, 0.1, 0.1, 0.1]);
    expect(paint([0.1, 0.1, 0.1, 0.6], 0)).toBe(0);
    expect(paint([0.1, 0.1, 0.1, 0.1], 100)).toBe(150);
  });
});
