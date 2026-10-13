/* The editor's undo for one palette, kept apart from the browser's history, which holds pages: Back leaves a palette in
   one press however much it was edited. A step is one gesture. A press (Random, Invert, a keyframe added) is a step of
   its own; a drag is one step from press to release however long it pauses; keys that nudge a value are one step until
   they rest for QUIET_MS; and a key held down is one step however often it repeats. An edit after an undo drops the
   steps undone, and a gesture that ends where it began is no step. Values are strings (the editor's are
   `seed|before|after`), so a history entry can keep the steps and hand them back (snapshot, begin). The page keeps other steps beside these
   (journal.ts): `position` says where these stand among everything done, and `dropRedo` lets go of what was undone
   when something else is done. Nothing here touches the DOM: the page says when a pointer is down and closes the
   gesture when one lands or the last one lifts. */
import * as v from "valibot";

const QUIET_MS = 400;
/** the steps kept behind the present one; the oldest go first */
export const EDITS_LIMIT = 100;

export interface EditsSnapshot {
  steps: string[];
  at: number;
  /** how many steps went out of the front at the limit before these */
  base: number;
}

/* Stored browser data is untrusted: steps are short strings, at most one more than the limit. */
const Snapshot = v.pipe(
  v.object({
    steps: v.pipe(
      v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(256))),
      v.minLength(1),
      v.maxLength(EDITS_LIMIT + 1)
    ),
    at: v.pipe(v.number(), v.integer(), v.minValue(0)),
    base: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0)
  }),
  v.check(s => s.at < s.steps.length)
);
/** The steps a stored snapshot kept, or null when it holds no steps. */
export function readSnapshot(saved: unknown): EditsSnapshot | null {
  const result = v.safeParse(Snapshot, saved);
  return result.success ? { ...result.output, steps: [...result.output.steps] } : null;
}

/** The key whose binding is making an edit, and whether it is a held key's repeat. */
export type KeyPress = { code: string; repeat: boolean } | null;

export interface EditsOptions {
  first: string;
  /** the steps a history entry kept, taken when they end on `first` */
  saved?: unknown;
  /** puts a value back when an undo or a redo reaches it, told the value of the step it takes back or makes again and
      which way it went; it must not report that as an edit */
  apply: (value: string, edit: string, back: boolean) => void;
  /** whether two values are the same subject; the same string by default */
  same?: (a: string, b: string) => boolean;
  /** a pointer is down: a gesture it makes waits for the release */
  pressed?: () => boolean;
  /** the key press whose binding runs now, if any */
  keyPress?: () => KeyPress;
  /** told after every change, for whatever shows the steps */
  changed?: () => void;
}

export function createEdits(opts: EditsOptions) {
  const same = opts.same ?? ((a: string, b: string) => a === b);
  const pressed = opts.pressed ?? (() => false);
  const keyPress = opts.keyPress ?? (() => null);
  const changed = opts.changed ?? (() => {});
  let steps = [opts.first];
  let at = 0;
  let base = 0;
  const kept = readSnapshot(opts.saved);
  if (kept && same(kept.steps[kept.at], opts.first)) ({ steps, at, base } = kept);
  let gesture = false;
  /* the step a key's press made, while it stands as the last: that key's repeats carry it on */
  let press: { key: string; at: number } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  /** The gesture in progress ends: one that came back to where it began is no step. */
  function close() {
    clearTimeout(timer);
    timer = undefined;
    if (!gesture) return;
    gesture = false;
    if (at > 0 && same(steps[at], steps[at - 1])) {
      steps.splice(at, 1);
      at--;
      changed();
    }
  }
  /* a pointer's gesture waits for the release, which the page reports; the keys' for them to rest */
  const keepOpen = () => {
    clearTimeout(timer);
    timer = pressed() ? undefined : setTimeout(close, QUIET_MS);
  };

  return {
    close,
    canUndo: () => at > 0,
    canRedo: () => at < steps.length - 1,
    /** the value an undo returns to, for a hover to show; null with nothing to undo */
    undoValue: () => (at > 0 ? steps[at - 1] : null),
    redoValue: () => (at < steps.length - 1 ? steps[at + 1] : null),
    current: () => steps[at],
    /** how many steps stand behind the present one since the subject arrived, the ones gone at the limit included */
    position: () => base + at,
    undo() {
      close();
      press = null;
      if (!at) return;
      const edit = steps[at];
      at--;
      opts.apply(steps[at], edit, true);
      changed();
    },
    redo() {
      close();
      press = null;
      if (at >= steps.length - 1) return;
      at++;
      opts.apply(steps[at], steps[at], false);
      changed();
    },
    /** The subject is now `value`: a step of its own with `alone` (a press), otherwise part of the gesture under way. */
    edit(value: string, alone = false) {
      const key = keyPress();
      if (
        alone &&
        key?.repeat &&
        press?.key === key.code &&
        press.at === at &&
        at === steps.length - 1
      ) {
        steps[at] = value;
        gesture = true;
        keepOpen();
        changed();
        return;
      }
      press = null;
      if (alone) close();
      if (!gesture) {
        if (same(value, steps[at])) return;
        const cut = Math.max(0, at + 1 - EDITS_LIMIT);
        base += cut;
        steps = [...steps.slice(cut, at + 1), value];
        at = steps.length - 1;
        gesture = true;
      } else steps[at] = value;
      if (alone) {
        close();
        if (key) press = { key: key.code, at };
      } else keepOpen();
      changed();
    },
    /** A subject arrived: the steps a snapshot kept when they end on `value`, otherwise `value` alone. */
    begin(value: string, saved?: unknown) {
      close();
      press = null;
      const kept = readSnapshot(saved);
      if (kept && same(kept.steps[kept.at], value)) ({ steps, at, base } = kept);
      else {
        steps = [value];
        at = 0;
        base = 0;
      }
      changed();
    },
    /** The steps as they stand with the gesture under way closed, for a history entry to keep. */
    snapshot: (): EditsSnapshot =>
      at > 0 && same(steps[at], steps[at - 1])
        ? { steps: steps.slice(0, at), at: at - 1, base }
        : { steps: [...steps], at, base },
    /** Something other than an edit was done after an undo: the undone steps go. */
    dropRedo() {
      close();
      if (at < steps.length - 1) {
        steps = steps.slice(0, at + 1);
        changed();
      }
    }
  };
}
export type Edits = ReturnType<typeof createEdits>;
