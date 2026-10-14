import { type Axis, canonical, decodePalette, encodePalette, type Palette } from "@grabient/engine";
import { hexToSrgb, lchToP3, lchToSrgb, toCssP3, toHex } from "@grabient/engine/color.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import { addKeyframe, anchorHueWalls, type Lock, removeKeyframes } from "@grabient/engine/edits.ts";
import { clamp } from "@grabient/engine/math.ts";
import { hexAnchor } from "@grabient/engine/spec.ts";
import {
  clampSize,
  isStyle,
  type SizeChoice,
  STEPS_MAX,
  STEPS_MIN,
  type Style,
  sizeParam
} from "@grabient/engine/view.ts";
import { t } from "@grabient/i18n";
import type { PickMode } from "@grabient/ui/Keyframes.tsx";
import { keyPress } from "@grabient/ui/keys.ts";
import { isServer } from "@solidjs/web";
import { createMemo, createSignal, onCleanup, onSettled, untrack } from "solid-js";
import { toast } from "../../app/toast.ts";
import {
  edited,
  nextRedo,
  nextUndo,
  redo as redoPage,
  undo as undoPage,
  walkEdits
} from "../../app/undo.ts";
import { trackTool } from "../analytics/analytics.ts";
import { type ListView, rememberedView, rememberView } from "../list/appearance.ts";
import { type Locks, type Opened, SEED_SHAPE, type SeedPage } from "./address.ts";
import { createEdits, type EditsSnapshot } from "./edits.ts";
import * as ops from "./ops.ts";

/* The editor's state over one palette: the palette, how it is drawn, what Random keeps, which keyframes are held,
   what a press under the pointer would show, and the palette's undo. Every palette goes in through `canonical`, so
   what the editor holds is what its seed decodes to and the screen, the address and a reload agree bit for bit.
   Made by the editor's page, for as long as it is mounted, where a new address lands in it (`arrive`); and by a figure
   over a palette of its own (About's), whose undo is its own. */

/** A stop as the screen paints it: its hex always (the label and what files write), and its Display-P3 color where
    the screen shows more than sRGB, which painting prefers. */
export interface Paint {
  hex: string;
  paint?: string;
}
/** What a press under the pointer would write, painted before it is: a palette, a style, or both. */
interface Peek {
  palette?: Palette;
  style?: Style;
}

const stopsOf = (P: Palette, steps: number, wide: boolean): Paint[] =>
  sampleStops(P, ops.clampSteps(steps, P.anchors.length)).map(s => ({
    hex: s.hex,
    ...(wide ? { paint: toCssP3(lchToP3(...s.lch)) } : {})
  }));
/** One color per keyframe, at its place: a near gray's at its own tint's hue, whatever hue it carries. */
const keyframesOf = (P: Palette, wide: boolean): Paint[] =>
  P.anchors.map(a => {
    const h = a.own ?? a.h;
    return {
      hex: toHex(lchToSrgb(a.l, a.c, h)),
      ...(wide ? { paint: toCssP3(lchToP3(a.l, a.c, h)) } : {})
    };
  });

/* A step of the undo is the seed it leads to, then the stop count the edit found and left: an undo puts back the count
   the edit found if the count still stands where the edit left it, and a redo the other way, so a count the reader set
   since stays. */
const stepOf = (seed: string, before: number, after: number) => `${seed}|${before}|${after}`;
const partsOf = (value: string) => {
  const [seed, before, after] = value.split("|");
  return { seed, before: Number(before), after: Number(after) };
};

/** Whether the screen shows Display-P3, followed live: a laptop moved to another monitor changes it. */
function createWide() {
  const query = isServer ? null : matchMedia("(color-gamut: p3)");
  const able = () => !!query?.matches && CSS.supports("color", "color(display-p3 1 0 0)");
  const [wide, setWide] = createSignal(able());
  const follow = () => setWide(able());
  query?.addEventListener("change", follow);
  onCleanup(() => query?.removeEventListener("change", follow));
  return wide;
}

export function createPaletteEditor(
  start: SeedPage,
  saved?: { edits?: unknown; opened?: unknown },
  /** a figure's own palette, never a page's: nothing done to it is counted, said on the page's line or remembered for
      the tab, and its undo walks its own edits alone */
  own = false
) {
  const track = own ? () => {} : trackTool;
  const [palette, setPalette] = createSignal(start.palette);
  const [steps, setSteps] = createSignal(start.view.steps);
  const [style, setStyle] = createSignal(start.view.style);
  const [angle, setAngle] = createSignal(start.view.angle);
  const [size, setSize] = createSignal<SizeChoice | null>(start.view.size ?? null);
  const [locks, setLocks] = createSignal<Locks>(start.locks);
  const [selecting, setSelecting] = createSignal(start.selection);
  const [opened, setOpened] = createSignal<Opened>(openedOf(start, saved?.opened));
  /* the palette the page opened on, which an admin's Save replaces and a copy counts as used: its entry keeps it, so a
     reload of an edited palette still knows where it began */
  const [openedSeed, setOpenedSeed] = createSignal(seedIn(saved?.edits) ?? start.seed);
  const seed = createMemo(() => encodePalette(palette()));
  const K = () => palette().anchors.length;
  const wide = createWide();

  /* the hold: which keyframes the rows speak for, and where the last press that was no run landed */
  const [holdRaw, setHold] = createSignal<number[]>([]);
  let from = 0;
  const held = createMemo(() => ops.heldIn(holdRaw(), K()));
  const lead = () => held()[0] ?? -1;
  const whole = () => ops.isWhole(held(), K());
  const partial = () => ops.isPartial(held(), K());

  const [peek, setPeek] = createSignal<Peek | null>(null);
  /* where along the palette a plot or the color solid is being read, for the strip to lift that stop */
  const [reading, setReading] = createSignal<number | null>(null);

  const stops = createMemo(() => stopsOf(palette(), steps(), wide()));
  /* what a copy or a download takes: the palette as it is, never one a press under the pointer shows */
  const stopsTaken = () => sampleStops(palette(), ops.clampSteps(steps(), K()));
  const keyframes = createMemo(() => keyframesOf(palette(), wide()));
  const shownPalette = () => peek()?.palette ?? palette();
  const shownStyle = () => peek()?.style ?? style();
  const shownStops = createMemo(() => {
    const P = peek()?.palette;
    return P ? stopsOf(P, steps(), wide()) : stops();
  });
  const shownKeyframes = createMemo(() => {
    const P = peek()?.palette;
    return P ? keyframesOf(P, wide()) : keyframes();
  });

  /* the pointers down now: a gesture one makes waits for its release */
  const pointers = new Set<number>();
  /* the undo's own reads are plain; this makes what shows them follow */
  const [version, setVersion] = createSignal(0);
  const edits = createEdits({
    first: stepOf(start.seed, start.view.steps, start.view.steps),
    saved: saved?.edits,
    same: (a, b) => partsOf(a).seed === partsOf(b).seed,
    keyPress,
    pressed: () => pointers.size > 0,
    changed: () => setVersion(n => n + 1),
    apply(value, edit, back) {
      const P = decodePalette(partsOf(value).seed);
      if (!P) return;
      const made = partsOf(edit);
      const now = untrack(steps);
      const asked = back
        ? now === made.after
          ? made.before
          : undefined
        : now === made.before
          ? made.after
          : undefined;
      if (P.anchors.length !== untrack(K)) setHold([]);
      put(P, asked);
    }
  });
  /* what reads the undo reads it through the version, so it follows each change */
  const tracked =
    <T>(read: () => T) =>
    () => {
      version();
      return read();
    };
  /* the page's undo walks these edits with its steps while the editor is open */
  if (!own)
    onSettled(() => {
      walkEdits({
        position: tracked(edits.position),
        canUndo: tracked(edits.canUndo),
        canRedo: tracked(edits.canRedo),
        undo: edits.undo,
        redo: edits.redo,
        dropRedo: edits.dropRedo
      });
      return () => walkEdits(null);
    });

  /* A press closes every gesture under way, and the gesture a pointer made ends when the last pointer lifts, once the
     release itself has been handled. */
  if (!isServer) {
    const down = (e: PointerEvent) => {
      if (!pointers.size) edits.close();
      pointers.add(e.pointerId);
    };
    const lift = (e: PointerEvent) => {
      if (pointers.delete(e.pointerId) && !pointers.size) setTimeout(edits.close, 0);
    };
    /* a release outside the window can go unreported: a pointer moving with no button down has lifted */
    const moved = (e: PointerEvent) => {
      if (!e.buttons) lift(e);
    };
    const away = () => {
      pointers.clear();
      edits.close();
    };
    addEventListener("pointerdown", down, true);
    addEventListener("pointerup", lift, true);
    addEventListener("pointercancel", lift, true);
    addEventListener("pointermove", moved, true);
    addEventListener("blur", away);
    onCleanup(() => {
      removeEventListener("pointerdown", down, true);
      removeEventListener("pointerup", lift, true);
      removeEventListener("pointercancel", lift, true);
      removeEventListener("pointermove", moved, true);
      removeEventListener("blur", away);
      edits.close();
    });
  }

  /* the shapes the Chroma and Travel rows keep while a drag takes them to nothing; any other write forgets them */
  const shapes = ops.createShapes();
  /** A palette into the editor, canonical, the stop count riding it, without telling the undo. */
  function put(next: Palette, asked?: number) {
    const P = canonical(next);
    const before = untrack(steps);
    const after = ops.stepsAfter(before, untrack(K), P.anchors.length, asked);
    setPalette(P);
    setSteps(after);
    return { P, before, after };
  }
  /** An edit: a step of its own with `alone` (a press), otherwise part of the gesture under way. */
  function write(next: Palette, alone = false, keepShapes = false) {
    if (!keepShapes) shapes.forget();
    const { P, before, after } = put(next);
    const was = edits.position();
    edits.edit(stepOf(encodePalette(P), before, after), alone);
    if (!own && edits.position() > was) edited();
  }
  const now = () => untrack(palette);
  const nowHeld = () => untrack(held);

  function pick(i: number, mode: PickMode) {
    const next = ops.pick(nowHeld(), from, i, mode);
    from = next.from;
    setHold(next.held);
  }

  /* the view: never a step of the undo, never a history entry. A part the reader sets is theirs for the tab, as a
     list's is: the next page that draws palettes takes it. */
  const markSet = (part: keyof Opened["set"]) => {
    track(part);
    setOpened(o => ({ ...o, set: { ...o.set, [part]: true } }));
  };
  const remember = (patch: Partial<ListView>) => {
    if (!own) rememberView({ ...rememberedView(), ...patch });
  };
  /* a change told once a page as the tool that made it (analytics.ts) */
  const tool =
    <A extends unknown[]>(name: string, run: (...args: A) => void) =>
    (...args: A) => {
      track(name);
      run(...args);
    };

  return {
    palette,
    seed,
    K,
    steps,
    style,
    angle,
    size,
    locks,
    selecting,
    opened,
    openedSeed,
    setOpenedSeed,
    wide,
    held,
    lead,
    whole,
    partial,
    multi: () => held().length > 1,
    reading,
    setReading,
    stops,
    stopsTaken,
    keyframes,
    shownPalette,
    shownStyle,
    shownStops,
    shownKeyframes,
    setPeek: (P: Palette | null) => setPeek(P ? { palette: P } : null),
    peekStyle: (s: Style | null) => setPeek(s ? { style: s } : null),
    clearPeek: () => setPeek(null),

    /* the hold */
    pick,
    sweep(a: number, b: number) {
      from = a;
      setHold(ops.run(a, b));
    },
    holdAll: () => setHold(ops.run(0, untrack(K) - 1)),
    letGo: () => setHold([]),

    /* the keyframes' numbers and the plots */
    nudge(i: number, axis: Axis, v: number, start = now()) {
      track("plot");
      write(ops.nudgedTo(start, nowHeld(), i, axis, v));
    },
    heldMean: (axis: "l" | "c") => ops.heldMean(palette(), held(), axis),
    setHeldMean(axis: "l" | "c", v: number) {
      track(axis === "l" ? "lightness" : "chroma");
      write(ops.setHeldMean(now(), nowHeld(), axis, v));
    },
    /** a keyframe held alone as a hex: typed, a step of its own; picked, part of the picker's gesture */
    setHex(hex: string, alone = true): boolean {
      const i = lead();
      const next = i >= 0 ? hexKeyframe(now(), i, hex) : null;
      if (!next) return false;
      track(alone ? "hex" : "picker");
      write(next, alone);
      return true;
    },
    lightnessEnds: () => ops.lightnessEnds(palette()),
    setLightnessEnds: tool("lightness", (a: number, b: number) =>
      write(ops.withLightnessEnds(now(), a, b))
    ),
    shiftLightness: tool("lightness", (by: number) => {
      const next = ops.lightnessShifted(now(), by);
      if (next !== now()) write(next);
    }),
    chromaPeak: () => ops.chromaPeak(palette()),
    setChromaPeak: tool("chroma", (v: number) => write(shapes.chroma(now(), v), false, true)),
    hueStart: () => ops.hueStart(palette()),
    setHueStart: tool("hue", (wheel: number) => write(ops.hueRotated(now(), wheel))),
    setHeldHue: tool("hue", (wheel: number) => write(ops.heldHueTo(now(), nowHeld(), wheel))),
    travel: () => ops.travel(palette()),
    travelRange: () => ops.travelRange(palette()),
    setTravel: tool("travel", (v: number) => write(shapes.travel(now(), v), false, true)),
    travelSpan: () => ops.travelSpan(held(), K()),
    spanTravel: () => ops.spanTravelOf(palette(), ops.travelSpan(held(), K())),
    spanTravelRange: () => ops.spanTravelRange(palette(), ops.travelSpan(held(), K())),
    setSpanTravel: tool("travel", (v: number) =>
      write(ops.withSpanTravel(now(), ops.travelSpan(nowHeld(), untrack(K)), v))
    ),

    /* the presses */
    /** a palette put in whole, as a step of its own: a figure's Reset */
    set: (next: Palette) => write(next, true),
    addKeyframe() {
      const next = addKeyframe(now(), nowHeld());
      if (!next) return;
      track("add_keyframe");
      write(next.palette, true);
      setHold(next.held);
    },
    removeKeyframes() {
      const next = removeKeyframes(now(), nowHeld());
      if (!next) return;
      track("remove_keyframe");
      write(next.palette, true);
      setHold(next.held);
    },
    straightenSpan: () => ops.straightenSpan(held(), K()),
    canStraighten: () => ops.canStraighten(palette(), held()),
    straightened: () => ops.straightened(palette(), held()),
    straighten() {
      if (!ops.canStraighten(now(), nowHeld())) return;
      track("straighten");
      write(ops.straightened(now(), nowHeld()), true);
      if (!own) toast(t("Lightness straightened."));
    },
    canReverse: () => ops.canReverse(held()),
    reversed: () => ops.reversed(palette(), held()),
    reverse() {
      if (!ops.canReverse(nowHeld())) return;
      track("reverse");
      write(ops.reversed(now(), nowHeld()), true);
    },
    inverted: () => ops.inverted(palette(), held()),
    invert: tool("invert", () => write(ops.inverted(now(), nowHeld()), true)),
    locked: (k: Lock) => ops.keptLocks(locks(), partial()).includes(k),
    toggleLock: tool("lock", (k: Lock) =>
      setLocks(l => ops.toggledLocks(l, ops.isPartial(nowHeld(), untrack(K)), k))
    ),
    canRandom: () => ops.canRandom(locks(), partial()),
    /** Random keeps the keyframe count. A partial hold keeps its keyframes held for the next roll; a new palette lets
        them go, since the keyframes held are not the ones now on screen. */
    random() {
      const kept = untrack(locks);
      if (!ops.canRandom(kept, ops.isPartial(nowHeld(), untrack(K)))) return;
      const next = ops.rolled(now(), nowHeld(), kept);
      track("random");
      if (!next.kept) setHold([]);
      write(next.palette, true);
    },

    /* the undo: a page's walks the palette's edits with the page's steps (app/undo.ts), a figure's its own alone */
    canUndo: own ? tracked(edits.canUndo) : () => nextUndo() !== null,
    canRedo: own ? tracked(edits.canRedo) : () => nextRedo() !== null,
    undo: own ? edits.undo : tool("undo", () => void undoPage()),
    redo: own ? edits.redo : tool("redo", () => void redoPage()),
    /** the palette an undo would bring back, for a hover to show; none when it takes back a step, which is no palette */
    undoValue: tracked(() => (own || nextUndo() === "edit" ? decoded(edits.undoValue()) : null)),
    redoValue: tracked(() => (own || nextRedo() === "edit" ? decoded(edits.redoValue()) : null)),
    snapshot: (): EditsSnapshot => edits.snapshot(),

    /* the view */
    setStyle(s: Style) {
      markSet("style");
      setStyle(s);
      remember({ style: s });
    },
    setSteps(n: number) {
      markSet("steps");
      setSteps(ops.clampSteps(n, untrack(K)));
      /* the tab's count is the reader's, whatever this palette's keyframes raise it to */
      remember({ steps: clamp(Math.round(n) || STEPS_MIN, STEPS_MIN, STEPS_MAX) });
    },
    setAngle(a: number) {
      markSet("angle");
      const angle = clamp(Math.round(a) || 0, 0, 360);
      setAngle(angle);
      remember({ angle });
    },
    /** Parts of the view let go (all three with none named): as the page opened, steps kept to the keyframes, and
        the tab given back what it remembered then. */
    letViewGo(...parts: (keyof Opened["set"])[]) {
      track("reset_view");
      const was = untrack(opened);
      const all = parts.length ? parts : (["style", "steps", "angle"] as const);
      if (all.includes("style")) setStyle(was.style);
      if (all.includes("steps")) setSteps(ops.clampSteps(was.steps, untrack(K)));
      if (all.includes("angle")) setAngle(was.angle);
      setOpened(o => ({
        ...o,
        set: Object.fromEntries(
          Object.entries(o.set).map(([k, v]) => [k, all.includes(k as never) ? false : v])
        ) as Opened["set"]
      }));
      if (was.chosen)
        remember(
          Object.fromEntries(all.map(part => [part, was.chosen?.[part]])) as Partial<ListView>
        );
    },
    /** The size is the reader's for the tab too: the palette opened next stands at it. */
    setSize(next: SizeChoice | null) {
      const clamped = next && clampSize(next);
      const size = clamped && sizeParam(clamped) ? clamped : null;
      setSize(size);
      remember({ size });
    },
    setSelecting,

    /** Another address landed (Back, Forward, a link, a pasted address): its palette, view and locks, the undo its
        entry kept, and nothing held, since the keyframes held are not these. */
    arrive(page: SeedPage, kept?: { edits?: unknown; opened?: unknown }) {
      setHold([]);
      setPeek(null);
      shapes.forget();
      setPalette(page.palette);
      setSteps(page.view.steps);
      setStyle(page.view.style);
      setAngle(page.view.angle);
      setSize(page.view.size ?? null);
      setLocks(page.locks);
      setSelecting(page.selection);
      setOpened(openedOf(page, kept?.opened));
      setOpenedSeed(seedIn(kept?.edits) ?? page.seed);
      edits.begin(stepOf(page.seed, page.view.steps, page.view.steps), kept?.edits);
    },
    /** The undo as the page's history entry keeps it, with the palette the page opened on, and the view it opened
        with. */
    entry: () => ({
      edits: { ...edits.snapshot(), opened: untrack(openedSeed) },
      opened: untrack(opened)
    })
  };
}
export type PaletteEditor = ReturnType<typeof createPaletteEditor>;

const decoded = (value: string | null) => (value ? decodePalette(partsOf(value).seed) : null);
/** The palette an entry's undo says the page opened on, where it names one. Stored browser data is untrusted. */
function seedIn(kept: unknown): string | null {
  const seed = (kept as { opened?: unknown } | null | undefined)?.opened;
  return typeof seed === "string" && SEED_SHAPE.test(seed) && decodePalette(seed) ? seed : null;
}

/** Keyframe `i` as a typed or picked hex: the hue lands on the lap nearest its own, a gray keeps its hue, and the walls
    to its neighbors hold. */
function hexKeyframe(P: Palette, i: number, hex: string): Palette | null {
  const rgb = hexToSrgb(hex);
  const was = P.anchors[i];
  if (!rgb || !was) return null;
  const next = hexAnchor(rgb, was.h);
  const walls = anchorHueWalls(P, i);
  return {
    anchors: P.anchors.map((a, j) =>
      j === i ? { ...next, h: clamp(next.h, walls.lo, walls.hi) } : a
    )
  };
}

/* a part of the view as the tab remembers one: a value, or auto for each palette's own */
const choice = <T>(value: unknown, is: (v: unknown) => v is T): T | "auto" | undefined =>
  value === "auto" || is(value) ? value : undefined;
const isCount = (v: unknown): v is number => Number.isInteger(v);

/** What a page opened with: the record its entry kept or a card handed it, where it reads as one, else the address's
    own view. Stored browser data is untrusted. */
function openedOf(page: SeedPage, kept: unknown): Opened {
  const k = kept as Partial<Opened> | null | undefined;
  const valid =
    !!k &&
    typeof k.style === "string" &&
    Number.isInteger(k.steps) &&
    Number.isInteger(k.angle) &&
    !!k.set &&
    typeof k.set === "object";
  const base = valid
    ? {
        style: k.style as Style,
        steps: k.steps as number,
        angle: k.angle as number,
        set: {
          style: k.set?.style === true,
          steps: k.set?.steps === true,
          angle: k.set?.angle === true
        }
      }
    : {
        style: page.view.style,
        steps: page.view.steps,
        angle: page.view.angle,
        set: { style: false, steps: false, angle: false }
      };
  /* What the tab remembered as the page opened. A part a card handed over as set came from the tab's own memory, so
     letting it go here leaves the tab with no choice of it. */
  const tab = rememberedView();
  const chosen = {
    style: choice(k?.chosen?.style, isStyle) ?? (base.set.style ? "auto" : tab.style),
    steps: choice(k?.chosen?.steps, isCount) ?? (base.set.steps ? "auto" : tab.steps),
    angle: choice(k?.chosen?.angle, isCount) ?? (base.set.angle ? "auto" : tab.angle)
  };
  /* a view that is no longer what the page opened with was chosen since, here or on a page since */
  return {
    ...base,
    chosen,
    set: {
      style: base.set.style || page.view.style !== base.style,
      steps:
        base.set.steps || page.view.steps !== Math.max(base.steps, page.palette.anchors.length),
      angle: base.set.angle || page.view.angle !== base.angle
    }
  };
}
