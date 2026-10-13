import { canonical, decodePalette, encodePalette } from "@grabient/engine/codec.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import {
  addKeyframe,
  hueTravel,
  hueTravelLimits,
  invertAnchors,
  type Lock,
  lockedWhole,
  nudgeAnchors,
  randomizeLocked,
  removeKeyframes,
  reverseAnchors,
  rotateHue,
  scaleChroma,
  setHueTravel,
  setLightnessEnds,
  shiftLightness,
  straightenL
} from "@grabient/engine/edits.ts";
import { type Axis, C_MAX, type Palette } from "@grabient/engine/palette.ts";
import { STEPS_MAX, STEPS_MIN } from "@grabient/engine/view.ts";
import type { PickMode } from "@grabient/ui/Keyframes.tsx";
import { createMemo, createSignal } from "solid-js";

/* A palette of About's own, never the address's, changed by the editor's rules (the engine's edits): a dot dragged
   moves its keyframe, or every held one by as much; keyframes are added and removed; Random, Straighten, Reverse and
   Invert apply to the held keyframes or the whole palette; steps follow the keyframe count while they stand on it. Its
   undo lasts while the page is open, and a drag is one step. Steps are how the palette is drawn, never an undo step. */

/** A drag's moves within this long of each other are one undo step. */
const QUIET_MS = 400;
const EDITS_KEPT = 100;
const clampSteps = (steps: number, K: number) =>
  Math.min(STEPS_MAX, Math.max(STEPS_MIN, K, Math.round(steps)));

export function createFigure(first: Palette, firstSteps = 7) {
  const start = canonical(first);
  const startSeed = encodePalette(start);
  const [palette, setPalette] = createSignal<Palette>(start);
  const [held, setHeld] = createSignal<number[]>([]);
  const [rawSteps, setRawSteps] = createSignal(clampSteps(firstSteps, start.anchors.length));
  /* what Random keeps of each keyframe */
  const [locks, setLocks] = createSignal<readonly Lock[]>([]);
  /* what a press under the pointer would make, painted while it rests there */
  const [peek, setPeek] = createSignal<Palette | null>(null);
  const [edits, setEdits] = createSignal({ list: [startSeed], at: 0 });
  const anchors = createMemo(() => palette().anchors);
  const K = () => anchors().length;
  const selection = createMemo(() =>
    [...new Set(held().filter(i => i >= 0 && i < K()))].sort((a, b) => a - b)
  );
  const steps = () => clampSteps(rawSteps(), K());
  const shown = () => peek() ?? palette();

  /* the palette in, canonical, with the steps riding the keyframe count while they stand on it */
  const put = (P: Palette) => {
    const c = canonical(P);
    if (rawSteps() <= K()) setRawSteps(c.anchors.length);
    setPalette(c);
  };
  let lastEdit = 0;
  /** A change, as one step of the undo; a drag's moves close together are one, `alone` always its own. */
  const write = (P: Palette, alone = false) => {
    const seed = encodePalette(canonical(P));
    const now = Date.now();
    const joins = !alone && now - lastEdit < QUIET_MS;
    lastEdit = alone ? 0 : now;
    setEdits(e => {
      if (e.list[e.at] === seed) return e;
      const kept = e.list.slice(0, joins && e.at > 0 ? e.at : e.at + 1);
      const list = [...kept, seed].slice(-EDITS_KEPT);
      return { list, at: list.length - 1 };
    });
    put(P);
  };
  const walkTo = (at: number) => {
    const e = edits();
    const P = decodePalette(e.list[at]);
    if (!P) return;
    if (P.anchors.length !== K()) setHeld([]);
    lastEdit = 0;
    setEdits({ list: e.list, at });
    put(P);
  };

  /* the hold, by the editor's rule: a press holds a keyframe alone or lets a held one go, Shift takes the run from the
     last press, Ctrl or Cmd adds or lets go */
  let lastPressed = 0;
  const pick = (i: number, mode: PickMode) => {
    const s = selection();
    if (mode !== "range") lastPressed = i;
    if (mode === "only") setHeld([i]);
    else if (mode === "one") setHeld(s.includes(i) ? s.filter(x => x !== i) : [i]);
    else if (mode === "toggle") setHeld(s.includes(i) ? s.filter(x => x !== i) : [...s, i]);
    else {
      const [a, b] = [Math.min(lastPressed, i), Math.max(lastPressed, i)];
      setHeld(Array.from({ length: b - a + 1 }, (_, k) => a + k));
    }
  };
  const sweep = (a: number, b: number) => {
    lastPressed = a;
    const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
    setHeld(Array.from({ length: hi - lo + 1 }, (_, k) => lo + k));
  };
  /* what an action speaks for: the held keyframes, or every one */
  const scope = () => (selection().length ? selection() : anchors().map((_, i) => i));
  const straightenSpan = () => {
    const s = selection();
    return s.length >= 3 ? { a: s[0], b: s[s.length - 1] } : { a: 0, b: K() - 1 };
  };
  const straightened = () => straightenL(palette(), straightenSpan().a, straightenSpan().b);
  const lEnds = () => ({ start: anchors()[0].l, end: anchors()[K() - 1].l });
  const chromaPeak = () => Math.max(...anchors().map(a => a.c));

  return {
    palette,
    shown,
    anchors,
    K,
    selection,
    steps,
    seed: createMemo(() => encodePalette(palette())),
    /** the keyframes as the chips and the plots' dots paint them: each sits at its own place on the curve */
    anchorStops: createMemo(() =>
      sampleStops(shown(), shown().anchors.length).map(stop => ({ hex: stop.hex }))
    ),
    lead: () => selection()[0] ?? -1,
    multi: () => selection().length > 1,
    whole: () => selection().length === 0 || selection().length === K(),
    dirty: () => encodePalette(palette()) !== startSeed || steps() !== clampSteps(firstSteps, K()),
    pick,
    sweep,
    letGo: () => setHeld([]),
    holdAll: () => setHeld(anchors().map((_, i) => i)),
    setPeek,
    /** a dot dragged to a value, from the palette the drag began on: alone, or every held keyframe by as much */
    nudge: (i: number, axis: Axis, value: number, from: Palette = palette()) => {
      const moved = selection().includes(i) ? selection() : [i];
      const was = from.anchors[i][axis];
      const by = value - was;
      write(
        nudgeAnchors(
          from,
          moved,
          axis === "l" ? { dl: by } : axis === "c" ? { dc: by } : { dh: by }
        )
      );
    },
    lEnds,
    setLEnds: (l0: number, l1: number) => write(setLightnessEnds(palette(), l0, l1)),
    /** every keyframe's lightness moved by as much: the line dragged with nothing held */
    shiftLightness: (by: number) => write(shiftLightness(palette(), by)),
    chromaPeak,
    setChromaPeak: (peak: number) => {
      const now = chromaPeak();
      if (now > 0) write(scaleChroma(palette(), Math.min(C_MAX, peak) / now));
    },
    hueStart: () => ((anchors()[0].h % 360) + 360) % 360,
    setHueStart: (deg: number) =>
      write(rotateHue(palette(), deg - (((anchors()[0].h % 360) + 360) % 360))),
    travel: () => hueTravel(palette()),
    travelRange: () => hueTravelLimits(palette()),
    setTravel: (deg: number) => write(setHueTravel(palette(), deg)),
    locked: (lock: Lock) => locks().includes(lock),
    toggleLock: (lock: Lock) =>
      setLocks(now => (now.includes(lock) ? now.filter(l => l !== lock) : [...now, lock])),
    /* with every axis locked and nothing held apart there is nothing left to draw */
    canRandom: () => !lockedWhole(locks(), selection().length > 0 && selection().length < K()),
    random: () => {
      write(randomizeLocked(palette(), selection(), locks(), Math.random), true);
      if (!selection().length || selection().length === K()) setHeld([]);
    },
    straightenSpan,
    straightened,
    canStraighten: () => straightenSpan().b - straightenSpan().a >= 2,
    straighten: () => write(straightened(), true),
    reversed: () => reverseAnchors(palette(), scope()),
    canReverse: () => scope().length > 1,
    reverse: () => write(reverseAnchors(palette(), scope()), true),
    inverted: () => invertAnchors(palette(), scope()),
    invert: () => write(invertAnchors(palette(), scope()), true),
    addKeyframe: () => {
      const next = addKeyframe(palette(), selection());
      if (!next) return;
      write(next.palette, true);
      setHeld(next.held);
    },
    removeKeyframes: () => {
      const next = removeKeyframes(palette(), selection());
      if (!next) return;
      write(next.palette, true);
      setHeld(next.held);
    },
    setSteps: (n: number) => setRawSteps(clampSteps(n, K())),
    canUndo: () => edits().at > 0,
    canRedo: () => edits().at < edits().list.length - 1,
    undoPalette: () => decodePalette(edits().list[edits().at - 1]),
    redoPalette: () => decodePalette(edits().list[edits().at + 1]),
    undo: () => {
      if (edits().at > 0) walkTo(edits().at - 1);
    },
    redo: () => {
      if (edits().at < edits().list.length - 1) walkTo(edits().at + 1);
    },
    /** the palette the page opened with, as one step the undo can take back */
    reset: () => {
      setHeld([]);
      write(start, true);
      setRawSteps(clampSteps(firstSteps, start.anchors.length));
    }
  };
}
export type Figure = ReturnType<typeof createFigure>;
