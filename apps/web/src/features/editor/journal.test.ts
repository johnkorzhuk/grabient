import { expect, test } from "vitest";
import {
  canRedo,
  canUndo,
  type EditsWalk,
  edited,
  forgetUndoFrom,
  landUndo,
  nextUndo,
  record,
  redo,
  undo,
  walkEdits,
  walkSelection
} from "./journal.ts";

/* a stand-in for the editor's edits: a list of values and where it stands */
function fakeEdits(): EditsWalk & { values: string[]; at: number; edit(v: string): void } {
  return {
    values: ["a"],
    at: 0,
    edit(v) {
      this.values = [...this.values.slice(0, this.at + 1), v];
      this.at++;
    },
    position() {
      return this.at;
    },
    canUndo() {
      return this.at > 0;
    },
    canRedo() {
      return this.at < this.values.length - 1;
    },
    undo() {
      this.at--;
    },
    redo() {
      this.at++;
    },
    dropRedo() {
      this.values = this.values.slice(0, this.at + 1);
    }
  };
}
const settle = () => new Promise(done => setTimeout(done, 0));
const step = (log: string[], name: string) => ({
  undo: async () => void log.push(`undo ${name}`),
  redo: async () => void log.push(`redo ${name}`)
});

test("one undo takes back the latest thing done, an edit or a step", async () => {
  landUndo(1);
  const log: string[] = [];
  const e = fakeEdits();
  walkEdits(e);
  e.edit("b");
  edited();
  record(step(log, "like"));
  e.edit("c");
  edited();
  await settle();
  expect(nextUndo()).toBe("edit");
  await undo();
  expect(e.at).toBe(1);
  expect(nextUndo()).toBe("step");
  await undo();
  expect(log).toEqual(["undo like"]);
  await undo();
  expect(e.at).toBe(0);
  expect(canUndo()).toBe(false);
  await redo();
  await redo();
  expect(log).toEqual(["undo like", "redo like"]);
  expect(canRedo()).toBe(true);
  walkEdits(null);
});

test("a step recorded after an undo drops the edits undone", async () => {
  landUndo(2);
  const e = fakeEdits();
  walkEdits(e);
  e.edit("b");
  await undo();
  record(step([], "pick"));
  await settle();
  expect(e.values).toEqual(["a"]);
  walkEdits(null);
});

test("a step that fails stays where it was and says why", async () => {
  landUndo(3);
  const failed: unknown[] = [];
  record({
    undo: () => Promise.reject(new Error("offline")),
    redo: async () => {},
    fail: reason => failed.push(reason)
  });
  await undo();
  expect(failed).toHaveLength(1);
  expect(canUndo()).toBe(true);
});

test("each entry keeps its own steps, and the selection walks only its own", async () => {
  landUndo(4);
  record(step([], "page"));
  let shown = true;
  walkSelection(() => shown);
  await settle();
  expect(nextUndo()).toBeNull();
  record(step([], "selection"));
  await settle();
  expect(nextUndo()).toBe("step");
  shown = false;
  landUndo(5);
  expect(canUndo()).toBe(false);
  landUndo(4);
  expect(canUndo()).toBe(true);
  forgetUndoFrom(4);
  landUndo(6);
  landUndo(4);
  expect(canUndo()).toBe(false);
});
