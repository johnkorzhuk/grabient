import { numeral, typedHex } from "@grabient/engine/typed.ts";
import { describe, expect, test } from "vitest";
import { fixed, scrubDrag, snapGrain } from "../src/scrub.ts";
import { golden } from "./support.ts";

const cases = golden<{
  numeral: [string, string][];
  snapGrain: [number, number | null, number][];
  fixed: [number, number, string][];
  typedHex: [string, string | null][];
}>("scrub");

describe("number fields", () => {
  test("typed numbers read in every script, and hexes in any width", () => {
    for (const [text, want] of cases.numeral) expect(numeral(text)).toBe(want);
    for (const [text, want] of cases.typedHex) expect(typedHex(text)).toBe(want);
  });

  test("values snap to the grain the address keeps, and no zero is negative", () => {
    for (const [v, grain, want] of cases.snapGrain)
      expect(snapGrain(v, grain ?? undefined)).toBeCloseTo(want, 12);
    for (const [v, digits, want] of cases.fixed) expect(fixed(v, digits)).toBe(want);
  });

  const press = (x: number, type = "mouse", more: Partial<PointerEvent> = {}) =>
    ({
      pointerId: 7,
      pointerType: type,
      clientX: x,
      clientY: 0,
      movementX: 0,
      timeStamp: x,
      ...more
    }) as PointerEvent;

  test("a mouse drags past 3px, scaled by Shift and Alt, and a short press is a click", () => {
    const drag = scrubDrag(() => 0.5);
    const steps: number[] = [];
    drag.down(press(0));
    expect(drag.move(press(2), v => steps.push(v))).toBe(false);
    expect(drag.move(press(4), v => steps.push(v))).toBe(true);
    expect(steps).toEqual([2]);
    drag.move(press(5, "mouse", { shiftKey: true }), v => steps.push(v));
    expect(steps[1]).toBe(5);
    expect(drag.up()).toBe(true);
    drag.down(press(0));
    drag.move(press(2), () => {});
    expect(drag.up()).toBe(false);
  });

  test("a finger that strays past the slop is no tap, whichever way it went", () => {
    const drag = scrubDrag(() => 1);
    drag.down(press(0, "touch"));
    drag.move({ ...press(0, "touch"), clientY: 12 } as PointerEvent, () => {});
    expect(drag.up()).toBe(true);
  });

  test("another pointer moves nothing", () => {
    const drag = scrubDrag(() => 1);
    drag.down(press(0));
    expect(drag.move({ ...press(40), pointerId: -3 } as PointerEvent, () => {})).toBe(false);
  });
});
