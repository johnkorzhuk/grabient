import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createDone } from "../src/done.ts";
import { createHold, SLOP } from "../src/press.ts";

const finger = (pointerId: number, clientX = 0, clientY = 0) =>
  ({ pointerId, clientX, clientY }) as PointerEvent;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("a finger on a control", () => {
  test("lifted where it landed it is a tap", () => {
    const hold = createHold(() => {});
    hold.down(finger(1));
    vi.advanceTimersByTime(200);
    expect(hold.up(finger(1))).toBe("tap");
  });

  test("held still it is a long press, reported before it lifts", () => {
    const long = vi.fn();
    const hold = createHold(long);
    hold.down(finger(1, 10, 10));
    hold.move(finger(1, 10 + SLOP - 1, 10));
    vi.advanceTimersByTime(450);
    expect(long).toHaveBeenCalledOnce();
    expect(hold.up(finger(1))).toBe("long");
  });

  test("past the slop it is a drag or a scroll, and nothing is reported", () => {
    const long = vi.fn();
    const hold = createHold(long);
    hold.down(finger(1, 0, 0));
    hold.move(finger(1, 0, SLOP + 1));
    vi.advanceTimersByTime(1000);
    expect(long).not.toHaveBeenCalled();
    expect(hold.up(finger(1))).toBe("none");
  });

  test("an iPad's finger numbered below zero is a finger", () => {
    const long = vi.fn();
    const hold = createHold(long);
    hold.down(finger(-1525662976));
    vi.advanceTimersByTime(450);
    expect(long).toHaveBeenCalledOnce();
    expect(hold.up(finger(-1525662976))).toBe("long");
  });

  test("another finger lifting is not this press, and a cancel reports nothing", () => {
    const long = vi.fn();
    const hold = createHold(long);
    hold.down(finger(662156864));
    expect(hold.up(finger(0))).toBe("none");
    hold.cancel();
    vi.advanceTimersByTime(1000);
    expect(long).not.toHaveBeenCalled();
  });
});

test("a control's confirmation clears itself", () => {
  const [done, mark] = createDone<string>(1200);
  mark("copied");
  expect(done()).toBe("copied");
  vi.advanceTimersByTime(1199);
  expect(done()).toBe("copied");
  vi.advanceTimersByTime(1);
  expect(done()).toBeNull();
});
