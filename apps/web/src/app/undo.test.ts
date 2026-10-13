import { afterEach, expect, test } from "vitest";
import {
  forgetUndoFrom,
  landUndo,
  nextRedo,
  nextUndo,
  record,
  redo,
  type Step,
  undo,
  walkEdits,
  walkSelection
} from "./undo.ts";

/* a thing done to a list, which its undo and redo walk */
function step(list: string[], value: string): Step {
  list.push(value);
  return {
    undo: async () => void list.splice(list.indexOf(value), 1),
    redo: async () => void list.push(value)
  };
}
const settled = () => new Promise(resolve => setTimeout(resolve));

afterEach(() => {
  walkEdits(null);
  walkSelection(() => false);
  forgetUndoFrom(0);
  landUndo(0);
});

test("undo takes back the latest step and redo does it again, in order", async () => {
  const list: string[] = [];
  record(step(list, "a"));
  record(step(list, "b"));
  await settled();
  await undo();
  expect(list).toEqual(["a"]);
  await undo();
  expect(list).toEqual([]);
  await undo();
  await redo();
  expect(list).toEqual(["a"]);
  /* a new step drops what was undone */
  record(step(list, "c"));
  await settled();
  expect(nextRedo()).toBeNull();
});

test("each history entry keeps its own steps, and a page opened after Back drops the later ones", async () => {
  const list: string[] = [];
  landUndo(1);
  record(step(list, "on page 1"));
  landUndo(2);
  record(step(list, "on page 2"));
  await settled();
  landUndo(1);
  await undo();
  expect(list).toEqual(["on page 2"]);
  forgetUndoFrom(2);
  landUndo(2);
  expect(nextUndo()).toBeNull();
});

test("the editor's edits and the steps are walked in the order they were done", async () => {
  let position = 0;
  let top = 0;
  walkEdits({
    position: () => position,
    canUndo: () => position > 0,
    canRedo: () => position < top,
    undo: () => void position--,
    redo: () => void position++,
    dropRedo: () => {
      top = position;
    }
  });
  const list: string[] = [];
  position = top = 1;
  record(step(list, "liked"));
  await settled();
  position = top = 2;
  expect(nextUndo()).toBe("edit");
  await undo();
  expect(nextUndo()).toBe("step");
  await undo();
  expect(list).toEqual([]);
  expect(nextUndo()).toBe("edit");
});

test("in the selection over a page only the steps made there are walked", async () => {
  const list: string[] = [];
  record(step(list, "page"));
  let shown = true;
  walkSelection(() => shown);
  record(step(list, "selection"));
  await settled();
  await undo();
  expect(list).toEqual(["page"]);
  expect(nextUndo()).toBeNull();
  shown = false;
  expect(nextUndo()).toBe("step");
});
