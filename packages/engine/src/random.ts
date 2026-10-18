/* Random palettes with structure. Repeated draws must look different, so the generator draws a structure first (the
   lightness arc, the chroma envelope, the hue route, the anchor count) and then the numbers inside it. It reads only
   the `rand` it is given, and the order of its draws is fixed: a seeded `rand` gives the same palettes every time. */
import { canonical } from "./codec.ts";
import { clamp, clamp01, lerp } from "./math.ts";
import { type Anchor, C_MAX, DH_MAX, K_MAX, K_MIN, type Palette } from "./palette.ts";

function dice(rand: () => number) {
  return {
    R: (a: number, b: number) => a + (b - a) * rand(),
    pick: <T>(xs: readonly T[]): T => xs[Math.min(xs.length - 1, Math.floor(rand() * xs.length))],
    odds: (p: number) => rand() < p,
    sign: () => (rand() < 0.5 ? -1 : 1)
  };
}
type Dice = ReturnType<typeof dice>;

const smoothstep = (t: number) => {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
};
const evenT = (K: number) => Array.from({ length: K }, (_, i) => (K < 2 ? 0 : i / (K - 1)));
const norm01 = (u: number[]) => {
  const a = u[0];
  const b = u[u.length - 1];
  return Math.abs(b - a) < 1e-12 ? u.map(() => 0) : u.map(v => (v - a) / (b - a));
};

/** A monotone profile from 0 to 1. Where a ramp spends its time is most of what tells two ramps between the same ends
    apart, so its shape is drawn too. */
function pMono(d: Dice, K: number): number[] {
  const kind = d.pick(["linear", "eased", "late", "early", "plateau", "plateau"] as const);
  const p = d.R(1.4, 2.4);
  const q = d.R(0.42, 0.74);
  const at = d.R(0.3, 0.7);
  const w = d.R(0.28, 0.9);
  const ww = Math.min(w, 2 * Math.min(at, 1 - at));
  const f = (t: number) =>
    kind === "linear"
      ? t
      : kind === "eased"
        ? smoothstep(t)
        : kind === "late"
          ? t ** p
          : kind === "early"
            ? t ** q
            : smoothstep((t - at + ww / 2) / ww);
  return norm01(evenT(K).map(f));
}
/** An arch: 0 at both ends, 1 at the pivot. Two anchors have no interior and stay flat. */
function pArch(K: number, at: number): number[] {
  const q = clamp(at, 0.15, 0.85);
  return evenT(K).map(t =>
    K < 3 ? 0 : t <= q ? smoothstep(t / q) : smoothstep((1 - t) / (1 - q))
  );
}
/** Two plateaus and one handoff: a route that reads as two colors. */
function pStep(K: number, at: number, w: number): number[] {
  const q = clamp(at, 0.2, 0.8);
  const ww = clamp(w, 0.08, 2 * Math.min(q, 1 - q));
  return norm01(evenT(K).map(t => smoothstep((t - q + ww / 2) / ww)));
}
/** The ripples K anchors can hold. A faster one aliases, and adding a keyframe would then move the artwork. */
const cycOpts = (K: number): readonly number[] =>
  K >= 7 ? [0.5, 1, 1.5] : K >= 5 ? [0.5, 1] : [0.5];
/** A ripple of ±1 that is zero at both ends, so laid over an axis it moves no endpoint. */
function pRipple(K: number, cyc: number, ph: number): number[] {
  const w = (t: number) => Math.sin(2 * Math.PI * (cyc * t + ph));
  const v = evenT(K).map(t => w(t) - lerp(w(0), w(1), t));
  const mx = Math.max(...v.map(Math.abs));
  return mx < 1e-9 ? v.map(() => 0) : v.map(x => x / mx);
}
/** A chroma envelope between lo and hi, its shape drawn so five draws do not all peak in one place. */
function cEnv(d: Dice, K: number, lo: number, hi: number): number[] {
  const kind = d.pick(["flat", "rise", "fall", "arch", "dip"] as const);
  const at = d.R(0.25, 0.75);
  const level = d.R(0.3, 0.8);
  if (kind === "flat") return evenT(K).map(() => lerp(lo, hi, level));
  if (kind === "rise") return pMono(d, K).map(u => lerp(lo, hi, u));
  if (kind === "fall") return pMono(d, K).map(u => lerp(hi, lo, u));
  const a = pArch(K, at);
  return kind === "arch" ? a.map(u => lerp(lo, hi, u)) : a.map(u => lerp(hi, lo, u));
}
/** Travel shrunk until no step reaches the wall, where the seed would clamp it and reload another palette. */
function fitWall(u: number[], T: number, wobble: number): number {
  let mx = 0;
  for (let i = 1; i < u.length; i++) mx = Math.max(mx, Math.abs(u[i] - u[i - 1]));
  const room = (DH_MAX - 12 - 2 * wobble) / Math.max(mx, 1e-9);
  return clamp(T, -room, room);
}
/** A profile blended toward the straight line until it bends its axis by no more than `budget`. The ends are fixed
    points of the blend. A hard ease through a long sweep puts more hue into one step than keyframes can hold. */
function straighten(u: number[], swing: number, budget: number): number[] {
  const t = evenT(u.length);
  let dev = 0;
  for (let i = 0; i < u.length; i++) dev = Math.max(dev, Math.abs(u[i] - t[i]));
  const bend = dev * Math.abs(swing);
  if (bend <= budget) return u;
  const k = budget / bend;
  return u.map((v, i) => lerp(t[i], v, k));
}
/** A hue route from h0 with net travel T: an eased sweep or a two-plateau handoff, either with a wobble over it. */
function hRoute(
  d: Dice,
  K: number,
  h0: number,
  T: number,
  wobble = 0,
  kind?: "sweep" | "handoff"
): number[] {
  const k = kind ?? d.pick(["sweep", "sweep", "sweep", "handoff"] as const);
  const at = d.R(0.3, 0.7);
  const w = d.R(0.14, 0.5);
  const ph = d.R(0, 1);
  const cyc = d.pick(cycOpts(K));
  const raw = k === "handoff" ? pStep(K, at, w) : pMono(d, K);
  const ripple = wobble > 0 ? pRipple(K, cyc, ph) : raw.map(() => 0);
  const Tw = fitWall(raw, T, wobble);
  const u = straighten(raw, Tw, 55);
  return u.map((v, i) => h0 + Tw * v + wobble * ripple[i]);
}
/** A lightness span in a band, running either way: which end is light is half of what tells two ramps apart. */
function lPair(d: Dice, span: number, lo: number, hi: number): [number, number] {
  const s = Math.min(span, hi - lo);
  const a = d.R(lo, hi - s);
  return d.odds(0.5) ? [a + s, a] : [a, a + s];
}
const lRamp = (d: Dice, K: number, a: number, b: number) => pMono(d, K).map(u => lerp(a, b, u));
/** Two arms meeting at a pivot: a light middle between dark ends, or the reverse. */
function pivot(K: number, a: number, mid: number, b: number, at: number): number[] {
  const q = clamp(at, 0.18, 0.82);
  return evenT(K).map(t =>
    t <= q ? lerp(a, mid, smoothstep(t / q)) : lerp(mid, b, smoothstep((t - q) / (1 - q)))
  );
}
/** The anchors as a canonical palette, walled first: a route past the wall would reload as another palette. */
function finish(Ls: number[], Cs: number[], Hs: number[]): Palette {
  const out: Anchor[] = Ls.map((l, i) => ({ l: clamp01(l), c: clamp(Cs[i], 0, C_MAX), h: Hs[i] }));
  for (let i = 1; i < out.length; i++) {
    out[i].h = out[i - 1].h + clamp(out[i].h - out[i - 1].h, -DH_MAX, DH_MAX);
  }
  return canonical({ anchors: out });
}

const RANDOM_K = [2, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 7, 8] as const;
const KINDS = [
  "ramp",
  "ramp",
  "ramp",
  "ramp",
  "arch",
  "arch",
  "level",
  "cycle",
  "duo",
  "wave",
  "mono",
  "gray"
] as const;
const KINDS_OF_TWO = ["ramp", "ramp", "ramp", "mono", "level", "gray"] as const;

/** A random palette: the family first (a ramp, an arch through a pivot, a near-level sweep, a lap, two plateaus, a
    wave, one hue, or grays), then the numbers. `keepK` keeps the keyframe count. */
export function randomPalette(rand: () => number = Math.random, keepK?: number): Palette {
  const d = dice(rand);
  const K = keepK ? clamp(Math.round(keepK), K_MIN, K_MAX) : d.pick(RANDOM_K);
  const kind = K < 3 ? d.pick(KINDS_OF_TWO) : d.pick(KINDS);
  const h0 = d.R(0, 360);
  const wobble = d.odds(0.3) ? d.R(5, 26) : 0;
  const cLo = d.R(0, 0.07);
  const cHi = clamp(cLo + d.R(0.03, 0.26), 0, 0.3);
  let Cs = cEnv(d, K, cLo, cHi);
  let Ls: number[];
  let Hs: number[];
  switch (kind) {
    case "arch": {
      const bright = d.odds(0.55);
      const arm = bright ? d.R(0.1, 0.4) : d.R(0.6, 0.9);
      const mid = bright ? d.R(0.78, 0.97) : d.R(0.05, 0.28);
      Ls = pivot(K, arm, mid, clamp01(arm + d.R(-0.12, 0.12)), d.R(0.3, 0.7));
      Hs = hRoute(d, K, h0, d.sign() * d.R(40, 260), wobble);
      break;
    }
    case "level": {
      /* hue does the work; lightness barely moves */
      const level = d.R(0.28, 0.9);
      const amp = d.R(0.01, 0.06);
      const cyc = d.pick(cycOpts(K));
      const ph = d.R(0, 1);
      Ls = pRipple(K, cyc, ph).map(u => clamp01(level + amp * u));
      Hs = hRoute(d, K, h0, d.sign() * d.R(70, 420), wobble, "sweep");
      break;
    }
    case "cycle": {
      /* one or two whole laps, back where it started */
      const laps = K >= 5 && d.odds(0.3) ? 2 : 1;
      const level = d.R(0.34, 0.84);
      const amp = d.odds(0.6) ? d.R(0.05, 0.2) : 0;
      const cyc = d.pick(cycOpts(K));
      const ph = d.pick([0, 0.5] as const);
      Ls = pRipple(K, cyc, ph).map(u => clamp01(level + amp * u));
      Hs = hRoute(d, K, h0, d.sign() * (360 * laps + d.R(-25, 35)), wobble, "sweep");
      break;
    }
    case "duo": {
      /* two hue plateaus, lightness carrying the ramp */
      const [a, b] = lPair(d, d.R(0.35, 0.75), 0.08, 0.95);
      Ls = lRamp(d, K, a, b);
      Hs = hRoute(d, K, h0, d.sign() * d.R(80, 200), wobble, "handoff");
      break;
    }
    case "wave": {
      const level = d.R(0.3, 0.7);
      const amp = d.R(0.12, 0.34);
      const cyc = d.pick(cycOpts(K));
      const ph = d.R(0, 1);
      Ls = pRipple(K, cyc, ph).map(u => clamp01(level + amp * u));
      Hs = hRoute(d, K, h0, d.sign() * d.R(20, 200), wobble);
      break;
    }
    case "mono": {
      const [a, b] = lPair(d, d.R(0.35, 0.8), 0.08, 0.96);
      Ls = lRamp(d, K, a, b);
      Hs = hRoute(d, K, h0, d.sign() * d.R(0, 14), 0, "sweep");
      break;
    }
    case "gray": {
      const [a, b] = lPair(d, d.R(0.3, 0.85), 0.05, 0.97);
      Ls = lRamp(d, K, a, b);
      Cs = cEnv(d, K, 0, d.R(0.004, 0.02));
      Hs = hRoute(d, K, h0, d.sign() * d.R(0, 40), 0, "sweep");
      break;
    }
    default: {
      const [a, b] = lPair(d, d.R(0.3, 0.85), 0.06, 0.97);
      Ls = lRamp(d, K, a, b);
      Hs = hRoute(d, K, h0, d.sign() * d.R(10, 300), wobble);
    }
  }
  /* the lightness ends never tie: a tied pair would flatten setLightnessEnds to one level */
  if (Math.abs(Ls[K - 1] - Ls[0]) < 0.03) Ls[K - 1] = clamp01(Ls[0] + (Ls[0] > 0.5 ? -0.03 : 0.03));
  return finish(Ls, Cs, Hs);
}

/** A text as a number, by FNV-1a: the same text, the same number. */
export function fnv1a(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A rand a text decides, its FNV-1a into mulberry32: the same text draws the same numbers wherever it is drawn. */
export function textRand(text: string): () => number {
  let s = fnv1a(text);
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
