import { readFileSync } from "node:fs";
import { canonical, decodePalette, encodePalette, type Palette } from "@grabient/engine";
import { addKeyframe, removeKeyframes } from "@grabient/engine/edits.ts";
import { KEYMAP } from "@grabient/ui/keymap.ts";
import { describe, expect, test } from "vitest";
import { NO_LOCKS } from "./address.ts";
import {
  canRandom,
  canReverse,
  canStraighten,
  clampSteps,
  createShapes,
  heldIn,
  heldMean,
  nudgedTo,
  pick,
  rolled,
  run,
  setHeldMean,
  stepsAfter,
  straightenSpan,
  toggledLocks,
  travelSpan
} from "./ops.ts";

const fixture = JSON.parse(
  readFileSync(new URL("fixtures/kstate-ops-and-keymap.json", import.meta.url), "utf8")
);
const P = decodePalette("kY4mpDazO-mUuu_fuLqXU49dvVP6") as Palette;
const lcg = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
};

test("the default palette is the warm three-keyframe ramp", () => {
  const P = canonical({
    anchors: [
      { l: 0.93, c: 0.05, h: 78 },
      { l: 0.66, c: 0.16, h: 32 },
      { l: 0.34, c: 0.13, h: 336 }
    ]
  });
  expect(encodePalette(P)).toBe(fixture.DEFAULT_SEED);
});

test.each(fixture.clampSteps as [number | null, number, number][])(
  "%s steps over %s keyframes clamp to %s",
  (n, floor, out) => expect(clampSteps(n ?? Number.NaN, floor)).toBe(out)
);

describe("the stop count rides the keyframes while it sits on them", () => {
  test("eight keyframes raise seven stops to eight, and taking them back returns seven", () => {
    expect(stepsAfter(7, 7, 8)).toBe(8);
    expect(stepsAfter(8, 8, 7)).toBe(7);
  });
  test("a count above the keyframes is the reader's and stays", () =>
    expect(stepsAfter(12, 5, 6)).toBe(12));
  test("the ride stops at three", () => expect(stepsAfter(3, 3, 2)).toBe(3));
  test("an undo puts back the count it is told", () => expect(stepsAfter(9, 6, 5, 7)).toBe(7));
});

test("keyframes removed and added keep the hold the editor expects", () => {
  for (const [held, out] of fixture.removed) {
    const r = removeKeyframes(P, held);
    expect(r && { K: r.palette.anchors.length, held: r.held }).toEqual(out);
  }
  for (const [held, out] of fixture.added) {
    const r = addKeyframe(P, held);
    expect(r && { K: r.palette.anchors.length, held: r.held }).toEqual(out);
  }
});

test("Random keeps the keyframe count, and a partial hold keeps the palette", () => {
  const rand = lcg(7);
  for (const [held, out] of fixture.rolled) {
    const r = rolled(P, held, NO_LOCKS, rand);
    expect({ kept: r.kept, K: r.palette.anchors.length }).toEqual(out);
  }
});

test("a held keyframe moves the rest of the hold by as much; one outside it moves alone", () => {
  const n = nudgedTo(P, [1, 2], 1, "l", P.anchors[1].l + 0.1);
  expect(
    [P.anchors[1].l, P.anchors[2].l, n.anchors[1].l, n.anchors[2].l].map(x => +x.toFixed(4))
  ).toEqual(fixture.nudgedGroup);
  const m = nudgedTo(P, [1, 2], 3, "c", 2);
  expect([+m.anchors[3].c.toFixed(4), 0.35]).toEqual(fixture.nudgedOutsideHoldIsSingleClamped);
});

test("a new mean moves each held keyframe by as much, past one that meets its end", () => {
  const two = canonical({
    anchors: [
      { l: 0.9, c: 0.1, h: 10 },
      { l: 0.5, c: 0.1, h: 20 },
      { l: 0.2, c: 0.1, h: 30 }
    ]
  });
  const next = setHeldMean(two, [0, 1], "l", heldMean(two, [0, 1], "l") + 0.2);
  expect(next.anchors[0].l).toBe(1);
  expect(next.anchors[1].l).toBeCloseTo(0.7, 2);
});

describe("pick modes", () => {
  test("a plain press holds an unheld keyframe alone and lets a held one go", () => {
    expect(pick([1, 3], 1, 2, "one").held).toEqual([2]);
    expect(pick([1, 3], 1, 3, "one").held).toEqual([1]);
  });
  test("the arrows hold the one they reach alone", () =>
    expect(pick([1, 3], 1, 2, "only").held).toEqual([2]));
  test("Ctrl or Cmd adds or takes out", () => {
    expect(pick([1, 3], 1, 2, "toggle").held).toEqual([1, 2, 3]);
    expect(pick([1, 3], 1, 3, "toggle").held).toEqual([1]);
  });
  test("Shift holds the run from the last press that was no run", () => {
    const a = pick([], 0, 2, "one");
    const b = pick(a.held, a.from, 5, "range");
    expect(b).toEqual({ held: [2, 3, 4, 5], from: 2 });
    expect(pick(b.held, b.from, 0, "range").held).toEqual([0, 1, 2]);
  });
  test("a sweep holds exactly the run, either way round", () =>
    expect(run(4, 1)).toEqual([1, 2, 3, 4]));
  test("a hold is read in range, each once, in order", () =>
    expect(heldIn([3, -1, 1, 3, 9], 4)).toEqual([1, 3]));
});

test("the spans Travel and Straighten act over", () => {
  expect(travelSpan([], 5)).toEqual({ a: 0, b: 4 });
  expect(travelSpan([2], 5)).toEqual({ a: 2, b: 3 });
  expect(travelSpan([4], 5)).toBeNull();
  expect(travelSpan([1, 3], 5)).toEqual({ a: 1, b: 3 });
  expect(straightenSpan([], 5)).toEqual({ a: 0, b: 4 });
  expect(straightenSpan([0, 1, 2, 3, 4], 5)).toEqual({ a: 0, b: 4 });
  expect(straightenSpan([2], 5)).toEqual({ a: 1, b: 3 });
  expect(straightenSpan([0], 5).a).toBe(-1);
});

test("Straighten needs an interior and a change; Reverse needs two", () => {
  expect(canStraighten(P, [0])).toBe(false);
  expect(canStraighten(P, [])).toBe(true);
  expect(canReverse([2])).toBe(false);
  expect(canReverse([])).toBe(true);
});

describe("locks", () => {
  test("with nothing held a press closes and opens `lock`", () => {
    const one = toggledLocks(NO_LOCKS, false, "h");
    expect(one).toEqual({ lock: ["h"], unlock: [] });
    expect(toggledLocks(toggledLocks(one, false, "l"), false, "h")).toEqual({
      lock: ["l"],
      unlock: []
    });
  });
  test("a partial hold starts with every lock closed and a press opens one in `unlock`", () =>
    expect(toggledLocks(NO_LOCKS, true, "h")).toEqual({ lock: [], unlock: ["h"] }));
  test("Random rests while every keyframe is kept whole", () => {
    expect(canRandom({ lock: ["l", "c", "h"], unlock: [] }, false)).toBe(false);
    expect(canRandom({ lock: ["l", "c", "h"], unlock: [] }, true)).toBe(true);
    expect(canRandom(NO_LOCKS, false)).toBe(true);
  });
});

describe("shapes kept through a drag to nothing", () => {
  test("chroma dragged to gray and back restores the envelope", () => {
    const shapes = createShapes();
    const gray = shapes.chroma(P, 0);
    expect(Math.max(...gray.anchors.map(a => a.c))).toBe(0);
    const back = shapes.chroma(gray, 0.2);
    const ratio = (Q: Palette) => Q.anchors.map(a => a.c / Math.max(...Q.anchors.map(b => b.c)));
    expect(ratio(back).map(r => r.toFixed(6))).toEqual(ratio(P).map(r => r.toFixed(6)));
  });
  test("any other write forgets the shape", () => {
    const shapes = createShapes();
    const gray = shapes.chroma(P, 0);
    shapes.forget();
    const back = shapes.chroma(gray, 0.2);
    expect(new Set(back.anchors.map(a => a.c)).size).toBe(1);
  });
  test("travel dragged to zero and back restores the route", () => {
    const shapes = createShapes();
    const flat = shapes.travel(P, 0);
    const back = shapes.travel(flat, P.anchors[P.anchors.length - 1].h - P.anchors[0].h);
    expect(back.anchors.map(a => a.h.toFixed(6))).toEqual(P.anchors.map(a => a.h.toFixed(6)));
  });
});

/* the design document's own Escape rows have no id and no place in the site's key map */
test("the key map's rows are the editor's", () => {
  const rows = fixture.keymap.filter((row: { id?: string }) => row.id);
  expect(KEYMAP.map(({ id, keys, label, scope }) => ({ id, keys, label, scope }))).toEqual(
    rows.map(({ id, keys, label, scope }: Record<string, unknown>) => ({ id, keys, label, scope }))
  );
});
