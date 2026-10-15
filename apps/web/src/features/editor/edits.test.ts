import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createEdits, type KeyPress, readSnapshot } from "./edits.ts";

const golden = JSON.parse(
  readFileSync(new URL("fixtures/edits-semantics.json", import.meta.url), "utf8")
);
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/* the same run of edits the fixture recorded, with the clock moved instead of waited on */
test("steps, gestures, held keys, snapshots and the limit behave as recorded", () => {
  let key: KeyPress = null;
  const applied: [string, string, boolean][] = [];
  const e = createEdits({
    first: "a",
    apply: (value, edit, back) => applied.push([value, edit, back]),
    keyPress: () => key
  });
  const by = (code: string, repeat: boolean, run: () => void) => {
    key = { code, repeat };
    run();
    key = null;
  };
  const s = () => ({
    snap: e.snapshot(),
    cur: e.current(),
    pos: e.position(),
    canUndo: e.canUndo(),
    canRedo: e.canRedo(),
    undoValue: e.undoValue(),
    redoValue: e.redoValue()
  });
  const log: unknown[] = [];
  e.edit("b", true);
  log.push(["press b", s()]);
  e.edit("c");
  e.edit("d");
  log.push(["gesture c,d open", s()]);
  vi.advanceTimersByTime(450);
  log.push(["gesture closed after quiet", s()]);
  e.edit("e");
  e.edit("d");
  vi.advanceTimersByTime(450);
  log.push(["gesture that returns to start is no step", s()]);
  e.undo();
  log.push(["undo", s()]);
  e.edit("x", true);
  log.push(["edit after undo drops redo", s()]);
  by("KeyB", false, () => e.edit("r1", true));
  by("KeyB", true, () => e.edit("r2", true));
  by("KeyB", true, () => e.edit("r3", true));
  vi.advanceTimersByTime(450);
  log.push(["held key: one step", s()]);
  by("KeyB", false, () => e.edit("t1", true));
  log.push(["tap after hold", s()]);
  const kept = e.snapshot();
  e.begin("t1", kept);
  log.push(["begin with kept snapshot", s()]);
  e.begin("zzz", kept);
  log.push(["begin with snapshot for another value", s()]);
  e.begin("a", { steps: ["a"], at: 0, base: -1 });
  log.push(["begin with negative base (rejected)", s()]);
  e.begin("q", { steps: ["p", "q"], at: 1, base: 3 });
  log.push(["begin with base", s()]);
  const f = createEdits({ first: "0", apply: () => {} });
  for (let i = 1; i <= 130; i++) f.edit(String(i), true);
  const snap = f.snapshot();
  log.push([
    "limit",
    {
      len: snap.steps.length,
      at: snap.at,
      base: snap.base,
      pos: f.position(),
      first: snap.steps[0]
    }
  ]);
  expect(log).toEqual(golden.log);
  expect(applied).toEqual(golden.applied);
});

test("a pointer's gesture waits for its release however long it rests", () => {
  let down = true;
  const e = createEdits({ first: "a", apply: () => {}, pressed: () => down });
  e.edit("b");
  vi.advanceTimersByTime(900);
  e.edit("c");
  down = false;
  e.close();
  expect(e.snapshot()).toEqual({ steps: ["a", "c"], at: 1, base: 0 });
});

test("a gesture taken back puts the subject where it began and leaves no step", () => {
  const applied: [string, string, boolean][] = [];
  const e = createEdits({
    first: "a",
    apply: (value, edit, back) => applied.push([value, edit, back])
  });
  e.edit("b", true);
  e.edit("c");
  e.edit("d");
  e.revert();
  expect(applied).toEqual([["b", "d", true]]);
  expect(e.snapshot()).toEqual({ steps: ["a", "b"], at: 1, base: 0 });
  // with no gesture under way there is nothing to take back
  e.revert();
  expect(applied).toHaveLength(1);
  expect(e.canRedo()).toBe(false);
});

test("stored steps are read only when they are steps", () => {
  expect(readSnapshot({ steps: ["a", "b"], at: 1 })).toEqual({ steps: ["a", "b"], at: 1, base: 0 });
  expect(readSnapshot({ steps: [], at: 0 })).toBeNull();
  expect(readSnapshot({ steps: ["a"], at: 1 })).toBeNull();
  expect(readSnapshot({ steps: ["a", ""], at: 0 })).toBeNull();
  expect(readSnapshot({ steps: ["x".repeat(257)], at: 0 })).toBeNull();
  expect(readSnapshot({ steps: Array(102).fill("a"), at: 0 })).toBeNull();
  expect(readSnapshot({ steps: ["a"], at: 0.5 })).toBeNull();
  expect(readSnapshot("steps")).toBeNull();
});
