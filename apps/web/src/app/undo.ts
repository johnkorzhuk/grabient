import { createSignal } from "solid-js";

/* The page's undo: what a reader did to their own things (a heart, a change of the selection, palettes put into or
   taken out of their collections), taken back with Mod+Z and done again with Mod+Shift+Z on every page. In the editor
   the palette's edits join the walk (walkEdits), so one undo takes back the latest thing done, an edit or a step. An
   undo never leaves the page, opens or closes anything, or changes how things are drawn.

   Each history entry keeps its own steps in this tab's memory: Back and Forward bring them back, the selection opened
   over a page shares the page's, and a new page or a reload starts with none. While the selection stands over the
   page, only the steps made in it are walked. Steps are server writes, run one at a time in the order asked; one that
   could not be taken back stays where it was, and the page that made it says why. Browser only: nothing records a
   step while a page renders. */

export interface Step {
  /** puts things back as they were before the step; rejects when it could not */
  undo(): Promise<void>;
  /** does the step again; rejects when it could not */
  redo(): Promise<void>;
  /** says why an undo or a redo failed, where the step was made */
  fail?: (reason: unknown) => void;
}

/** The editor's edits, as this undo walks them beside its steps. */
export interface EditsWalk {
  /** where the edits stand among everything done since the palette arrived */
  position(): number;
  canUndo(): boolean;
  canRedo(): boolean;
  undo(): void;
  redo(): void;
  /** something other than an edit was done after an undo: the undone edits go */
  dropRedo(): void;
}

/* a step, with where the edits stood when it was done, and whether it was made in the selection */
interface Kept {
  step: Step;
  edit: number;
  selection: boolean;
}
interface Journal {
  steps: Kept[];
  at: number;
}

/** The steps an entry keeps behind the present. */
const LIMIT = 100;
const journals = new Map<number, Journal>();
let entry = 0;
let edits: EditsWalk | null = null;
let inSelection: () => boolean = () => false;
const [version, setVersion] = createSignal(0);
const changed = () => setVersion(n => n + 1);
function journal(): Journal {
  let j = journals.get(entry);
  if (!j) {
    j = { steps: [], at: 0 };
    journals.set(entry, j);
  }
  return j;
}

/* one at a time, in the order asked: each decides what it takes back when its turn comes */
let chain: Promise<void> = Promise.resolve();
const [waiting, setWaiting] = createSignal(0);
function inTurn(work: () => Promise<void> | void): Promise<void> {
  setWaiting(n => n + 1);
  const run = chain.then(work).finally(() => setWaiting(n => n - 1));
  chain = run.catch(() => {});
  return run;
}

/** The editor's edits join the walk while it is open, and leave it with null. */
export function walkEdits(walk: EditsWalk | null): void {
  edits = walk;
  changed();
}
/** Whether the selection stands over the page now: read when a step is recorded and walked. */
export function walkSelection(shown: () => boolean): void {
  inSelection = shown;
}
/** The editor made an edit: the steps undone before it go, as an edit drops the edits undone before it. */
export function edited(): void {
  void inTurn(() => {
    const j = journal();
    if (j.at < j.steps.length) {
      j.steps = j.steps.slice(0, j.at);
      changed();
    }
  });
}
/** Something was done: it joins the page's undo, and whatever was undone before it goes, the edits' included. */
export function record(step: Step): void {
  const selection = inSelection();
  void inTurn(() => {
    const j = journal();
    j.steps = [
      ...j.steps.slice(Math.max(0, j.at + 1 - LIMIT), j.at),
      { step, edit: edits?.position() ?? 0, selection }
    ];
    j.at = j.steps.length;
    edits?.dropRedo();
    changed();
  });
}

/** What an undo would take back now: one of the editor's edits, a step, or nothing. In the selection, only a step
    made there. */
export function nextUndo(): "edit" | "step" | null {
  version();
  const j = journal();
  const last = j.at > 0 ? j.steps[j.at - 1] : null;
  const edit = !!edits?.canUndo() && (!last || edits.position() > last.edit);
  if (inSelection()) return !edit && last?.selection ? "step" : null;
  return edit ? "edit" : last ? "step" : null;
}
/** What a redo would do again now. */
export function nextRedo(): "edit" | "step" | null {
  version();
  const j = journal();
  const next = j.at < j.steps.length ? j.steps[j.at] : null;
  const edit = !!edits?.canRedo() && (!next || edits.position() < next.edit);
  if (inSelection()) return !edit && next?.selection ? "step" : null;
  return edit ? "edit" : next ? "step" : null;
}
/** Whether an undo now would take back this step: a press that stands for it (a removed palette's Undo) takes the
    page's undo then, so a redo does it again. */
export function isNextUndo(step: Step): boolean {
  if (nextUndo() !== "step") return false;
  const j = journal();
  return j.steps[j.at - 1]?.step === step;
}
/** A step's undo or redo is on its way. */
export const undoing = (): boolean => waiting() > 0;

export function undo(): Promise<void> {
  return inTurn(async () => {
    const kind = nextUndo();
    if (kind === "edit") return edits?.undo();
    if (kind !== "step") return;
    const j = journal();
    const kept = j.steps[j.at - 1];
    try {
      await kept.step.undo();
    } catch (reason) {
      return kept.step.fail?.(reason);
    }
    j.at--;
    changed();
  });
}
export function redo(): Promise<void> {
  return inTurn(async () => {
    const kind = nextRedo();
    if (kind === "edit") return edits?.redo();
    if (kind !== "step") return;
    const j = journal();
    const kept = j.steps[j.at];
    try {
      await kept.step.redo();
    } catch (reason) {
      return kept.step.fail?.(reason);
    }
    j.at++;
    changed();
  });
}

/** A history entry is on screen (its place in the tab's history): its own steps, or a new journal. The selection
    opened over a page lands on the page's entry. */
export function landUndo(at: number): void {
  if (at !== entry) {
    entry = at;
    changed();
  }
}
/** Entries from `at` on are gone from the history (a page was opened after Back): their steps go with them. */
export function forgetUndoFrom(at: number): void {
  for (const key of journals.keys()) if (key >= at) journals.delete(key);
}
