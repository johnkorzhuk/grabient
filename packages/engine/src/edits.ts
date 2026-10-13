/* Every change the editor makes to a palette: whole-palette edits, edits scoped to the held keyframes, the hue wheel
   and travel, the keyframe count, and Random under holds and locks. Each returns a new palette, which the editor keeps
   in its canonical form (codec.ts); the hue edits keep each step within the seed's ±540° themselves. */
import { canonical } from "./codec.ts";
import { sampleLCH } from "./curve.ts";
import { clamp, clamp01, lerp, shortTurn } from "./math.ts";
import { type Anchor, C_MAX, DH_MAX, DH_STEP, K_MAX, K_MIN, type Palette } from "./palette.ts";
import { randomPalette } from "./random.ts";

const mapAnchors = (P: Palette, fn: (a: Anchor, i: number) => Anchor): Palette => ({
  anchors: P.anchors.map(fn)
});
const indicesOf = (P: Palette) => P.anchors.map((_, i) => i);

export const reverse = (P: Palette): Palette => ({ anchors: [...P.anchors].reverse() });
/** The photographic negative: lightness mirrored about mid gray, hue turned half a turn. */
export const invert = (P: Palette) =>
  mapAnchors(P, a => ({ ...a, l: clamp01(1 - a.l), h: a.h + 180 }));
export const rotateHue = (P: Palette, deg: number) => mapAnchors(P, a => ({ ...a, h: a.h + deg }));
export const scaleChroma = (P: Palette, k: number) =>
  mapAnchors(P, a => ({ ...a, c: clamp(a.c * k, 0, C_MAX) }));
export const shiftLightness = (P: Palette, d: number) =>
  mapAnchors(P, a => ({ ...a, l: clamp01(a.l + d) }));
/** The lightness ends land where asked, each anchor moving by the lerp of the two end corrections at its place, so
    the interior never moves more than the larger correction and a fused pair of ends comes apart. */
export function setLightnessEnds(P: Palette, l0: number, l1: number): Palette {
  const A = P.anchors;
  const K = A.length;
  const d0 = clamp01(l0) - A[0].l;
  const d1 = clamp01(l1) - A[K - 1].l;
  return mapAnchors(P, (a, i) => ({
    ...a,
    l: clamp01(a.l + lerp(d0, d1, K === 1 ? 0 : i / (K - 1)))
  }));
}

/** The hues an anchor may take before a step to a neighbor passes the wall. */
export function anchorHueWalls(P: Palette, i: number): { lo: number; hi: number } {
  let lo = -Infinity;
  let hi = Infinity;
  for (const j of [i - 1, i + 1]) {
    const a = P.anchors[j];
    if (!a) continue;
    lo = Math.max(lo, a.h - DH_MAX);
    hi = Math.min(hi, a.h + DH_MAX);
  }
  return { lo, hi };
}
/** The top of the hue wheel, a whole degree under the turn: a hue step code is about 1.06°, so 359.99 would round into
    the next turn through the seed, and a held drag would wind a lap at each step. */
export const HUE_WHEEL_MAX = 359;
/** A wheel position in the turn a hue is in: the inverse of the wheel's `h mod 360`, so the thumb and the hue agree. */
export const hueInTurn = (h: number, wheelDeg: number) =>
  Math.floor(h / 360) * 360 + clamp(wheelDeg, 0, HUE_WHEEL_MAX);
/** A keyframe's hue from the wheel: it picks a color and never winds a lap, which is Travel's job. */
export function setAnchorHueWheel(P: Palette, i: number, wheelDeg: number): Palette {
  const a = P.anchors[i];
  if (!a) return P;
  const walls = anchorHueWalls(P, i);
  const h = clamp(hueInTurn(a.h, wheelDeg), walls.lo, walls.hi);
  return mapAnchors(P, (x, j) => (j === i ? { ...x, h } : x));
}

/** Net hue rotation across the palette, laps included. */
export const hueTravel = (P: Palette) => P.anchors[P.anchors.length - 1].h - P.anchors[0].h;
/** Hue rotation across anchors a to b. One keyframe's travel is the segment into it, [i − 1, i]. */
export const spanTravel = (P: Palette, a: number, b: number) => P.anchors[b].h - P.anchors[a].h;
const isSpan = (P: Palette, a: number, b: number) => a >= 0 && b < P.anchors.length && a < b;
/** The travel a span may be asked for: scaled when it has net travel, a ramp added when it has none, either way no
    step past the wall, the seam into b + 1 included. Both contain the current travel. */
export function spanTravelLimits(P: Palette, a: number, b: number): { lo: number; hi: number } {
  const A = P.anchors;
  if (!isSpan(P, a, b)) return { lo: 0, hi: 0 };
  const T0 = A[b].h - A[a].h;
  const deltas = A.slice(a + 1, b + 1).map((x, j) => x.h - A[a + j].h);
  let lo: number;
  let hi: number;
  if (Math.abs(T0) > 1e-6) {
    const span = Math.abs(T0) * (DH_MAX / Math.max(...deltas.map(Math.abs), 1e-9));
    lo = -span;
    hi = span;
  } else {
    lo = -Infinity;
    hi = Infinity;
    for (const d of deltas) {
      lo = Math.max(lo, (-DH_MAX - d) * (b - a));
      hi = Math.min(hi, (DH_MAX - d) * (b - a));
    }
  }
  if (b + 1 < A.length) {
    const next = A[b + 1].h - A[b].h;
    lo = Math.max(lo, T0 + next - DH_MAX);
    hi = Math.min(hi, T0 + next + DH_MAX);
  }
  return { lo, hi };
}
/** The span's travel set to T within its limits, h[a] held. Net travel scales the span's steps, laps and all; a span
    with none takes a ramp. Anchors outside the span never move: the seam into b + 1 takes the change. */
export function setSpanTravel(P: Palette, a: number, b: number, T: number): Palette {
  const A = P.anchors;
  if (!isSpan(P, a, b)) return P;
  const limits = spanTravelLimits(P, a, b);
  const ask = clamp(T, limits.lo, limits.hi);
  const T0 = A[b].h - A[a].h;
  const ha = A[a].h;
  if (Math.abs(T0) > 1e-6) {
    const k = ask / T0;
    return mapAnchors(P, (x, j) => (j <= a || j > b ? x : { ...x, h: ha + (x.h - ha) * k }));
  }
  return mapAnchors(P, (x, j) =>
    j <= a || j > b ? x : { ...x, h: x.h + (ask * (j - a)) / (b - a) }
  );
}
export const hueTravelLimits = (P: Palette) => spanTravelLimits(P, 0, P.anchors.length - 1);
export const setHueTravel = (P: Palette, T: number) => setSpanTravel(P, 0, P.anchors.length - 1, T);

/** The interior lightness of [a, b] onto the line between its ends; needs b − a ≥ 2, else the palette as it is. */
export function straightenL(P: Palette, a: number, b: number): Palette {
  const A = P.anchors;
  if (!(a >= 0 && b < A.length && b - a >= 2)) return P;
  const la = A[a].l;
  const lb = A[b].l;
  return mapAnchors(P, (x, j) =>
    j <= a || j >= b ? x : { ...x, l: lerp(la, lb, (j - a) / (b - a)) }
  );
}
/** One change to every selected anchor, fields clamped, then hue steps walled left to right: nudging every hue is
    rotateHue, and a selection near the wall presses against it. */
export function nudgeAnchors(
  P: Palette,
  indices: readonly number[],
  d: { dl?: number; dc?: number; dh?: number }
): Palette {
  const selected = new Set(indices);
  const anchors = P.anchors.map((a, i) =>
    selected.has(i)
      ? {
          l: clamp01(a.l + (d.dl ?? 0)),
          c: clamp(a.c + (d.dc ?? 0), 0, C_MAX),
          h: a.h + (d.dh ?? 0)
        }
      : { ...a }
  );
  for (let i = 1; i < anchors.length; i++) {
    anchors[i].h = anchors[i - 1].h + clamp(anchors[i].h - anchors[i - 1].h, -DH_MAX, DH_MAX);
  }
  return { anchors };
}

/* The hue weave under every scoped edit. The moved slots of A carry new colors in any hue representation; each moved
   hue takes the lap nearest its predecessor, walled so the step stays within ±540° and the remaining steps can still
   reach the next held hue (540° of room per step). Hue is delta-coded, so a held anchor's hue re-rounds through its
   neighbors' new codes; passes fold each held run's drift into the nearest moved segment before it, which keeps it
   within half a code. L and C are held exactly. Expects a canonical P: drift is measured against it. */
function weave(P: Palette, A: Anchor[], held: ReadonlySet<number>): Palette {
  const K = A.length;
  const nextHeld: (number | null)[] = Array(K).fill(null);
  for (let i = K - 1, next: number | null = null; i >= 0; i--) {
    nextHeld[i] = next;
    if (held.has(i)) next = i;
  }
  /* a fresh draw lies in [0, 360) and a wound palette may not: the first anchor moves toward the first held one */
  const first = nextHeld[0];
  if (!held.has(0) && first !== null) A[0].h += 360 * Math.round((A[first].h - A[0].h) / 360);
  const walk = (rewrap: boolean) => {
    for (let i = 1; i < K; i++) {
      if (held.has(i)) continue;
      const prev = A[i - 1].h;
      let lo = prev - DH_MAX;
      let hi = prev + DH_MAX;
      const j = nextHeld[i];
      if (j !== null) {
        const room = DH_MAX * (j - i);
        lo = Math.max(lo, A[j].h - room);
        hi = Math.min(hi, A[j].h + room);
      }
      A[i].h = clamp(rewrap ? prev + shortTurn(A[i].h - prev) : A[i].h, lo, hi);
    }
  };
  walk(true);
  const runStarts = [...held].sort((x, y) => x - y).filter(i => !held.has(i - 1));
  const drifted = (B: Anchor[]) => {
    const Q = canonical({ anchors: B });
    let worst = 0;
    for (const i of runStarts)
      worst = Math.max(worst, Math.abs(shortTurn(Q.anchors[i].h - P.anchors[i].h)));
    return { Q, worst };
  };
  /* a fold that lands on the wall is cut short and the next pass overshoots the other way: keep the best seen */
  let best = A.map(a => ({ ...a }));
  let bestDrift = drifted(A).worst;
  for (let pass = 0; pass < 4 && bestDrift > DH_STEP; pass++) {
    const { Q } = drifted(A);
    for (const i of runStarts) {
      /* once per run: its later members share the run's exact codes */
      const r = shortTurn(Q.anchors[i].h - P.anchors[i].h);
      if (Math.abs(r) < 1e-6) continue;
      let moved = -1;
      for (let j = i - 1; j >= 0; j--) {
        if (!held.has(j)) {
          moved = j;
          break;
        }
      }
      if (moved >= 0) A[moved].h -= r;
    }
    walk(false);
    const d = drifted(A).worst;
    if (d < bestDrift) {
      bestDrift = d;
      best = A.map(a => ({ ...a }));
    }
  }
  return { anchors: best };
}
const unselected = (P: Palette, selected: (i: number) => boolean) =>
  new Set(indicesOf(P).filter(i => !selected(i)));

/** The selected keyframes reversed among themselves, the rest held. A reversed wound span cannot keep both its ends
    and its laps, so the route between swapped colors is the nearest way round. All selected is reverse. */
export function reverseAnchors(P: Palette, indices: readonly number[]): Palette {
  const K = P.anchors.length;
  const sel = [...new Set(indices.filter(i => i >= 0 && i < K))].sort((x, y) => x - y);
  if (sel.length <= 1) return P;
  if (sel.length === K) return reverse(P);
  const A = P.anchors.map(a => ({ ...a }));
  sel.forEach((slot, i) => {
    A[slot] = { ...P.anchors[sel[sel.length - 1 - i]] };
  });
  return weave(
    P,
    A,
    unselected(P, i => sel.includes(i))
  );
}
/** The selected keyframes inverted, the rest held. All selected is invert. */
export function invertAnchors(P: Palette, indices: readonly number[]): Palette {
  const K = P.anchors.length;
  const sel = new Set(indices.filter(i => i >= 0 && i < K));
  if (sel.size === 0) return P;
  if (sel.size === K) return invert(P);
  const A = P.anchors.map((a, i) =>
    sel.has(i) ? { l: clamp01(1 - a.l), c: a.c, h: a.h + 180 } : { ...a }
  );
  return weave(
    P,
    A,
    unselected(P, i => sel.has(i))
  );
}

/** The same palette with K anchors: the curve sampled at K even t, canonical. Anchors sit at even t, so a new count
    is a resample, never a splice. */
export function resampleK(P: Palette, K: number): Palette {
  const n = clamp(Math.round(K), K_MIN, K_MAX);
  if (n === P.anchors.length) return canonical(P);
  return canonical({
    anchors: Array.from({ length: n }, (_, i) => {
      const [l, c, h] = sampleLCH(P, i / (n - 1));
      return { l, c, h };
    })
  });
}

/** A keyframe added: the curve resampled at K + 1 (a splice would re-space every anchor and bend the palette), with
    the hold it leaves, the new keyframe joining the end of a held run. Null at the most keyframes. */
export function addKeyframe(
  P: Palette,
  held: readonly number[]
): { palette: Palette; held: number[] } | null {
  const K = P.anchors.length;
  if (K >= K_MAX) return null;
  return {
    palette: resampleK(P, K + 1),
    held: held.length ? [...held, held[held.length - 1] + 1] : []
  };
}
/** Keyframes dropped, nothing resampled, so the rest survives exactly. A partial hold drops its keyframes from its end
    as far as the floor allows; nothing or everything held drops the last keyframe. The hold lands where the first
    dropped keyframe was. Null at the fewest keyframes. */
export function removeKeyframes(
  P: Palette,
  held: readonly number[]
): { palette: Palette; held: number[] } | null {
  const K = P.anchors.length;
  if (K <= K_MIN) return null;
  const whole = !held.length || held.length === K;
  const drop = whole ? [K - 1] : held.slice(held.length - Math.min(held.length, K - K_MIN));
  return {
    palette: { anchors: P.anchors.filter((_, j) => !drop.includes(j)) },
    held: whole ? [] : [Math.min(drop[0], K - drop.length - 1)]
  };
}

/** What Random can keep of a keyframe. */
export type Lock = "l" | "c" | "h";
export const LOCKS: readonly Lock[] = ["l", "c", "h"];
/** Whether a roll would change nothing: every keyframe kept whole. A partial hold never is, since the rest are drawn. */
export const lockedWhole = (locks: readonly Lock[], partial: boolean) =>
  !partial && LOCKS.every(k => locks.includes(k));
/** Random under holds and locks: the keyframes it speaks for (the held ones, or all with none held) keep their locked
    axes, and the rest is drawn by `randomPalette`. Kept hues are woven into the new route. A keyframe kept whole is P's
    own, so a hex keyframe stays that hex. Expects a canonical P. */
export function randomizeLocked(
  P: Palette,
  held: readonly number[],
  locks: readonly Lock[],
  rand: () => number
): Palette {
  const K = P.anchors.length;
  const hold = new Set(held.filter(i => i >= 0 && i < K));
  const partial = hold.size > 0 && hold.size < K;
  const [l, c, h] = LOCKS.map(k => locks.includes(k));
  const A = randomPalette(rand, K).anchors.map((r, i) => {
    const a = P.anchors[i];
    if (partial && !hold.has(i)) return { ...r };
    return l && c && h ? { ...a } : { l: l ? a.l : r.l, c: c ? a.c : r.c, h: h ? a.h : r.h };
  });
  return h && partial ? weave(P, A, hold) : { anchors: A };
}
