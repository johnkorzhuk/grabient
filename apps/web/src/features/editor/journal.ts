import { createSignal } from "solid-js";

/* The page's undo: what a reader did to their own things, taken back with Mod+Z and done again with Mod+Shift+Z on every
   page. A step is a palette saved or let go (its heart), a change of the selection of palettes, palettes put into or
   taken out of the reader's own collections, a collection made with them. In the editor the palette's edits (edits.ts)
   are walked with the steps in the order they were done, so one undo takes back the latest thing done, whichever kind
   it was. An undo never leaves the page, opens or closes anything, or changes how things are drawn.

   Each history entry keeps its own steps in this tab's memory: Back and Forward bring them back, the selection opened
   over a page shares the page's, and a reload starts with none. While the selection stands over the page only the
   steps made in it are walked. A step's undo and redo are writes to the server, run one at a time in the order asked;
   one that fails stays where it was, and the page that made it says why. Written only in the browser. */

export interface Step {
  /** puts things back as they were before the step; rejects when it could not */
  undo(): Promise<void>;
  /** does the step again; rejects when it could not */
  redo(): Promise<void>;
  /** says why an undo or a redo failed, where the step was made */
  fail?: (reason: unknown) => void;
}
/** The editor's edits as this undo walks them beside its steps. */
export interface EditsWalk {
  /** where the edits stand among everything done since the palette arrived */
  position(): number;
  canUndo(): boolean;
  canRedo(): boolean;
  undo(): void;
  redo(): void;
  dropRedo(): void;
}

/* a step with the place the edits stood when it was done: it stands after every edit up to that place and before every
   one after it. `selection` says it was made in the selection opened over the page */
interface Kept {
  step: Step;
  edit: number;
  selection: boolean;
}
const LIMIT = 100;
const journals = new Map<number, { steps: Kept[]; at: number }>();
let entry = 0;
let edits: EditsWalk | null = null;
let inSelection: () => boolean = () => false;
const [version, setVersion] = createSignal(0);
const changed = () => setVersion(n => n + 1);
function journal() {
  const kept = journals.get(entry);
  if (kept) return kept;
  const fresh = { steps: [] as Kept[], at: 0 };
  journals.set(entry, fresh);
  return fresh;
}

/* one write at a time, in the order asked: each decides what it takes back when its turn comes */
let chain: Promise<void> = Promise.resolve();
const [waiting, setWaiting] = createSignal(0);
function inTurn(work: () => Promise<void> | void): Promise<void> {
  setWaiting(n => n + 1);
  const turn = chain.then(work).finally(() => setWaiting(n => n - 1));
  chain = turn.catch(() => {});
  return turn;
}

/** The editor's edits join the walk while an editor is open, and leave it with null. */
export function walkEdits(walk: EditsWalk | null) {
  edits = walk;
  changed();
}
/** Whether the selection stands over the page now, as the page reads it. */
export function walkSelection(shown: () => boolean) {
  inSelection = shown;
}
/** The editor made an edit: the steps undone before it go, as an edit drops the edits undone before it. */
export function edited() {
  void inTurn(() => {
    const j = journal();
    if (j.at < j.steps.length) {
      j.steps = j.steps.slice(0, j.at);
      changed();
    }
  });
}
/** Something was done: it joins the page's undo, and whatever was undone before it goes, edits included. */
export function record(step: Step) {
  const kept = { step, edit: edits?.position() ?? 0, selection: inSelection() };
  void inTurn(() => {
    const j = journal();
    j.steps = [...j.steps.slice(Math.max(0, j.at + 1 - LIMIT), j.at), kept];
    j.at = j.steps.length;
    edits?.dropRedo();
    changed();
  });
}

/** What an undo would take back now: an edit, a step, or nothing. In the selection, only a step made there. */
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
/** Whether an undo now takes back this step: a press that stands for it (a removed palette's Undo) takes the page's
    undo then, so a redo does it again. */
export function isNextUndo(step: Step): boolean {
  if (nextUndo() !== "step") return false;
  const j = journal();
  return j.steps[j.at - 1]?.step === step;
}
export const canUndo = () => nextUndo() !== null;
export const canRedo = () => nextRedo() !== null;
/** A step's undo or redo is on its way. */
export const undoing = () => waiting() > 0;

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
      kept.step.fail?.(reason);
      return;
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
      kept.step.fail?.(reason);
      return;
    }
    j.at++;
    changed();
  });
}

/** A history entry is on screen, by its place in the history: its steps, or new ones. The selection opened over a
    page names the page's entry. */
export function landUndo(at: number) {
  if (at === entry) return;
  entry = at;
  changed();
}
/** Entries from `at` on left the history (a page was opened after Back): their steps go with them. */
export function forgetUndoFrom(at: number) {
  for (const key of [...journals.keys()]) if (key >= at) journals.delete(key);
}
