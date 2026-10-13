/* The editor's rules over a palette and the keyframes held, as values: which keyframes a press holds, the stop count a
   new keyframe count leaves, the numbers each row shows and what a new number writes, Straighten, Reverse, Invert and
   Random under its locks. The engine changes palettes (edits.ts); this module decides which change a control asks for.
   About's figure keeps a palette by the same rules. Nothing here is reactive. */
import { type Axis, C_MAX, canonical, encodePalette, type Palette } from "@grabient/engine";
import {
  anchorHueWalls,
  hueInTurn,
  hueTravel,
  hueTravelLimits,
  invert,
  invertAnchors,
  LOCKS,
  type Lock,
  lockedWhole,
  nudgeAnchors,
  randomizeLocked,
  reverse,
  reverseAnchors,
  rotateHue,
  scaleChroma,
  setAnchorHueWheel,
  setHueTravel,
  setLightnessEnds,
  setSpanTravel,
  shiftLightness,
  spanTravel,
  spanTravelLimits,
  straightenL
} from "@grabient/engine/edits.ts";
import { clamp, onWheel } from "@grabient/engine/math.ts";
import { STEPS_MAX, STEPS_MIN } from "@grabient/engine/view.ts";
import type { PickMode } from "@grabient/ui/Keyframes.tsx";
import type { Locks } from "./address.ts";

/* Stops never fewer than keyframes, since a stop between two keyframes drops one from the picture, and never fewer
   than three, the fewest that show a curve. */
export const clampSteps = (n: number, floor: number) =>
  clamp(Math.round(n) || floor, Math.max(STEPS_MIN, floor), STEPS_MAX);

/** The stop count a write leaves. While the count sits on the keyframes it rides them, so taking a keyframe away lowers
    it too; above them the count is the reader's and stays. `asked` is a count an undo puts back. */
export const stepsAfter = (
  steps: number,
  keyframesBefore: number,
  keyframes: number,
  asked?: number
) => clampSteps(asked ?? (steps <= keyframesBefore ? keyframes : steps), keyframes);

/** The held keyframes as the palette has them: in range, each once, in curve order. */
export const heldIn = (raw: readonly number[], K: number): number[] =>
  [...new Set(raw.filter(i => Number.isInteger(i) && i >= 0 && i < K))].sort((a, b) => a - b);

/** What a press on keyframe `i` holds: alone or let go (a plain press), alone whatever was held (the arrows), added or
    taken out (Ctrl or Cmd, a long press), or the run from `from`, where the last press that was no run landed. */
export function pick(
  held: readonly number[],
  from: number,
  i: number,
  mode: PickMode
): { held: number[]; from: number } {
  if (mode === "only") return { held: [i], from: i };
  if (mode === "one") return { held: held.includes(i) ? held.filter(x => x !== i) : [i], from: i };
  if (mode === "toggle")
    return {
      held: held.includes(i) ? held.filter(x => x !== i) : [...held, i].sort((a, b) => a - b),
      from: i
    };
  return { held: run(from, i), from };
}
/** Exactly the keyframes from `a` to `b`, either way round. */
export const run = (a: number, b: number): number[] =>
  Array.from({ length: Math.abs(b - a) + 1 }, (_, k) => Math.min(a, b) + k);

/** Nothing held or everything held: the rows speak for the whole palette. */
export const isWhole = (held: readonly number[], K: number) =>
  held.length === 0 || held.length === K;
/** Some keyframes held and not all: the rows speak for them, and Random draws the rest. */
export const isPartial = (held: readonly number[], K: number) => held.length > 0 && held.length < K;

/** Keyframe `i`'s field set to `v`, clamped to its bounds, a hue inside its neighbors' reach. */
function withField(P: Palette, i: number, axis: Axis, v: number): Palette {
  const walls = axis === "h" ? anchorHueWalls(P, i) : { lo: 0, hi: axis === "l" ? 1 : C_MAX };
  const value = clamp(v, walls.lo, walls.hi);
  return { anchors: P.anchors.map((a, j) => (j === i ? { ...a, [axis]: value } : a)) };
}
/** Keyframe `i` taken to `v` on `axis`. Held with others, every held keyframe moves by the same amount; alone or outside
    the hold, the field is set. A drag passes the palette it began on, so rounding never feeds back. */
export function nudgedTo(
  P: Palette,
  held: readonly number[],
  i: number,
  axis: Axis,
  v: number
): Palette {
  if (!P.anchors[i]) return P;
  const target = axis === "l" ? clamp(v, 0, 1) : axis === "c" ? clamp(v, 0, C_MAX) : v;
  if (held.length <= 1 || !held.includes(i)) return withField(P, i, axis, target);
  const by = target - P.anchors[i][axis];
  return nudgeAnchors(P, held, axis === "l" ? { dl: by } : axis === "c" ? { dc: by } : { dh: by });
}
/** The held keyframes' lightness or chroma as one number, their mean, written so each moves by as much: at the held
    keyframe with the most room that way, so the others go on until each meets its own end. */
export const heldMean = (P: Palette, held: readonly number[], axis: "l" | "c") =>
  held.length ? held.reduce((sum, i) => sum + P.anchors[i][axis], 0) / held.length : 0;
export function setHeldMean(P: Palette, held: readonly number[], axis: "l" | "c", v: number) {
  const by = v - heldMean(P, held, axis);
  if (!by || !held.length) return P;
  const at = held.reduce(
    (best, i) =>
      (
        by > 0
          ? P.anchors[i][axis] < P.anchors[best][axis]
          : P.anchors[i][axis] > P.anchors[best][axis]
      )
        ? i
        : best,
    held[0]
  );
  return nudgedTo(P, held, at, axis, P.anchors[at][axis] + by);
}

/* the whole palette's rows */

export const lightnessEnds = (P: Palette) => ({
  start: P.anchors[0].l,
  end: P.anchors[P.anchors.length - 1].l
});
/** Each end lands where asked. Each writes its own end even when the two are equal: the seed's 8-bit lightness snaps
    near ends together, and ends tied together would stay tied. */
export const withLightnessEnds = (P: Palette, start: number, end: number) =>
  setLightnessEnds(P, clamp(start, 0, 1), clamp(end, 0, 1));
/** Every lightness moved by `by`, held to the curve's headroom so the gap between the ends is kept: a clamp per
    keyframe would press the palette flat against 0 or 1. */
export function lightnessShifted(P: Palette, by: number): Palette {
  const L = P.anchors.map(a => a.l);
  const d = clamp(by, -Math.min(...L), 1 - Math.max(...L));
  return d === 0 ? P : shiftLightness(P, d);
}
export const chromaPeak = (P: Palette) => Math.max(...P.anchors.map(a => a.c));
/** Where the palette's hue starts, on the wheel: a range input would pin a wound palette's thumb at an end. */
export const hueStart = (P: Palette) => onWheel(P.anchors[0].h);
/** The palette turned so keyframe 0 lands at `wheel` inside the turn it is in: the wheel never adds a lap. */
export const hueRotated = (P: Palette, wheel: number) => {
  const h0 = P.anchors[0].h;
  return rotateHue(P, hueInTurn(h0, wheel) - h0);
};
/** The held keyframes' hue from the wheel: the lead lands inside its own turn and the rest move by as much. */
export function heldHueTo(P: Palette, held: readonly number[], wheel: number): Palette {
  const lead = held[0] ?? 0;
  if (held.length <= 1) return setAnchorHueWheel(P, lead, wheel);
  const h = P.anchors[lead].h;
  return nudgeAnchors(P, held, { dh: hueInTurn(h, wheel) - h });
}

/* Travel: how far the hue turns, laps included. The range is what the walls allow, capped at four laps so a palette
   near zero still has a usable field; a seed that holds more widens it. */
const TRAVEL_CAP = 1440;
const capped = (lim: { lo: number; hi: number }, T: number) => {
  const need = Math.max(TRAVEL_CAP, Math.ceil(Math.abs(T) / 360) * 360);
  return { lo: Math.max(lim.lo, -need), hi: Math.min(lim.hi, need) };
};
export const travel = hueTravel;
export const travelRange = (P: Palette) => capped(hueTravelLimits(P), hueTravel(P));

/** The span a held keyframe's Travel turns: the stretch after it, which a stop owns. The last keyframe has none
    (null); several held turn from the first to the last; nothing held is the whole palette. */
export function travelSpan(held: readonly number[], K: number): { a: number; b: number } | null {
  if (!held.length) return { a: 0, b: K - 1 };
  if (held.length === 1) return held[0] === K - 1 ? null : { a: held[0], b: held[0] + 1 };
  return { a: held[0], b: held[held.length - 1] };
}
export const spanTravelOf = (P: Palette, span: { a: number; b: number } | null) =>
  span ? spanTravel(P, span.a, span.b) : 0;
export const spanTravelRange = (P: Palette, span: { a: number; b: number } | null) =>
  span
    ? capped(spanTravelLimits(P, span.a, span.b), spanTravel(P, span.a, span.b))
    : { lo: 0, hi: 0 };
export function withSpanTravel(P: Palette, span: { a: number; b: number } | null, T: number) {
  if (!span) return P;
  const range = spanTravelRange(P, span);
  return setSpanTravel(P, span.a, span.b, clamp(T, range.lo, range.hi));
}

/** The shapes the Chroma and Travel rows keep while a drag takes them to nothing: scaling chroma or travel by zero
    loses the envelope and the zigzag, so a drag back restores the last shape that had any. Any other write forgets
    them. */
export function createShapes() {
  let chroma: { cs: number[]; peak: number } | null = null;
  let route: { offs: number[]; T: number } | null = null;
  return {
    forget() {
      chroma = null;
      route = null;
    },
    /** the palette with its chroma peak at `v` */
    chroma(P: Palette, v: number): Palette {
      const peak = chromaPeak(P);
      const ask = clamp(v, 0, C_MAX);
      const kept = chroma;
      route = null;
      if (peak > 1e-6) {
        /* under 0.01 the seed's 8-bit chromas are a staircase, and scaling it back up would be coarser than the drag */
        chroma = peak > 0.01 ? { cs: P.anchors.map(a => a.c), peak } : kept;
        return scaleChroma(P, ask / peak);
      }
      if (kept && kept.cs.length === P.anchors.length && ask > 1e-6) {
        const k = ask / kept.peak;
        return { anchors: P.anchors.map((a, i) => ({ ...a, c: clamp(kept.cs[i] * k, 0, C_MAX) })) };
      }
      return { anchors: P.anchors.map(a => ({ ...a, c: ask })) };
    },
    /** the palette with its travel at `v` */
    travel(P: Palette, v: number): Palette {
      const T0 = hueTravel(P);
      const range = travelRange(P);
      const ask = clamp(v, range.lo, range.hi);
      const kept = route;
      chroma = null;
      if (Math.abs(T0) > 1e-6) {
        const h0 = P.anchors[0].h;
        route = Math.abs(T0) > 1 ? { offs: P.anchors.map(a => a.h - h0), T: T0 } : kept;
        return setHueTravel(P, ask);
      }
      if (kept && kept.offs.length === P.anchors.length && Math.abs(ask) > 1e-6) {
        const k = ask / kept.T;
        const h0 = P.anchors[0].h;
        return { anchors: P.anchors.map((a, i) => ({ ...a, h: h0 + kept.offs[i] * k })) };
      }
      return setHueTravel(P, ask);
    }
  };
}

/* Straighten, Reverse and Invert speak for the whole palette with nothing or everything held, and for the held
   keyframes otherwise. Each is canonical, as the press writes it, since a hover shows it first. */

/** The span Straighten lightness acts over: one interior keyframe drops onto the line between its neighbors. */
export function straightenSpan(held: readonly number[], K: number): { a: number; b: number } {
  if (isWhole(held, K)) return { a: 0, b: K - 1 };
  if (held.length === 1) return { a: held[0] - 1, b: held[0] + 1 };
  return { a: held[0], b: held[held.length - 1] };
}
const hasInterior = (span: { a: number; b: number }, K: number) =>
  span.a >= 0 && span.b < K && span.b - span.a >= 2;
export const straightened = (P: Palette, held: readonly number[]) => {
  const span = straightenSpan(held, P.anchors.length);
  return canonical(straightenL(P, span.a, span.b));
};
/** Straighten has an interior to act on and would change something. */
export const canStraighten = (P: Palette, held: readonly number[]) =>
  hasInterior(straightenSpan(held, P.anchors.length), P.anchors.length) &&
  encodePalette(straightened(P, held)) !== encodePalette(P);
export const reversed = (P: Palette, held: readonly number[]) =>
  canonical(isWhole(held, P.anchors.length) ? reverse(P) : reverseAnchors(P, held));
export const inverted = (P: Palette, held: readonly number[]) =>
  canonical(isWhole(held, P.anchors.length) ? invert(P) : invertAnchors(P, held));
/** One keyframe has nothing to swap with. */
export const canReverse = (held: readonly number[]) => held.length !== 1;

/** What Random keeps of the keyframes the rows speak for: a partial hold keeps everything until a lock is opened. */
export const keptLocks = (locks: Locks, partial: boolean): Lock[] =>
  partial ? LOCKS.filter(k => !locks.unlock.includes(k)) : [...locks.lock];
/** The locks after a press on `k`'s lock: the address's `unlock` under a partial hold, its `lock` otherwise. */
export function toggledLocks(locks: Locks, partial: boolean, k: Lock): Locks {
  const side = partial ? "unlock" : "lock";
  const on = locks[side];
  return { ...locks, [side]: LOCKS.filter(x => (x === k ? !on.includes(k) : on.includes(x))) };
}
/** Random has something to draw: not while every keyframe is kept whole. */
export const canRandom = (locks: Locks, partial: boolean) =>
  !lockedWhole(keptLocks(locks, partial), partial);
/** A roll keeps the keyframe count. With some keyframes held they keep what is locked and the rest are drawn (`kept`);
    with none or all held, a new palette keeps what `lock` names. */
export function rolled(
  P: Palette,
  held: readonly number[],
  locks: Locks,
  rand: () => number = Math.random
): { palette: Palette; kept: boolean } {
  const kept = isPartial(held, P.anchors.length);
  return { palette: randomizeLocked(P, held, keptLocks(locks, kept), rand), kept };
}
