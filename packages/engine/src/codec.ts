/* The seed: a palette's identity and address, `k` and a bit stream in base64url, most significant bit first, zero
   bits filling the last character. README.md has the layout. A field never changes width or meaning in place: a
   change needs a new version value (2 and 3, and the reserved bit, are free) and a decode branch for every older seed. */
import { deltaE, lchToSrgb, srgbToLch, srgbToOklab, toHex } from "./color.ts";
import { clamp, onWheel, shortTurn } from "./math.ts";
import { type Anchor, C_MAX, DH_MAX, GRAY, K_MAX, K_MIN, type Palette } from "./palette.ts";

export const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/* L, C and ΔH use an odd-level quantizer, 2^bits − 2 steps, so both ends of each range, a gray's zero chroma and an
   unchanged hue are exact codes. The first hue takes 512 steps around the circle. */
interface Field {
  lo: number;
  hi: number;
  bits: number;
}
const LIGHTNESS: Field = { lo: 0, hi: 1, bits: 8 };
const CHROMA: Field = { lo: 0, hi: C_MAX, bits: 8 };
const STEP: Field = { lo: -DH_MAX, hi: DH_MAX, bits: 10 };
const levels = (f: Field) => (1 << f.bits) - 2;
const toCode = (f: Field, v: number) =>
  clamp(Math.round(((v - f.lo) / (f.hi - f.lo)) * levels(f)), 0, levels(f));
const fromCode = (f: Field, n: number) => f.lo + (n / levels(f)) * (f.hi - f.lo);

/* What a keyframe is exactly: a code on the grid (none of these), an sRGB hex color with a hue of its own, a near gray
   that carries another hue than its tint's, or one of the 256 grays, whose hue is free. Version 0 writes each as its
   kind; a palette of grid keyframes alone is version 1. */
const GRID = 0;
const HEX = 1;
const GRAY_LEVEL = 2;
const NEAR_GRAY = 3;
type Exact =
  | { kind: typeof HEX; hex: number }
  | { kind: typeof NEAR_GRAY; hex: number }
  | { kind: typeof GRAY_LEVEL; level: number };

/** Nearer than this a keyframe is a grid code, a gray or a hex color: far under one code of any of them, far over the
    last digits two JavaScript engines may differ in. */
const SAME = 1e-7;
const onGrid = (v: number, f: Field) => Math.abs(v - fromCode(f, toCode(f, v))) < SAME;
const hexLch = (n: number) => srgbToLch([(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]);
const grayL = (level: number) => srgbToOklab(level / 255, level / 255, level / 255)[0];
const isGray = (n: number) => n >> 16 === ((n >> 8) & 255) && n >> 16 === (n & 255);

function exactAt(l: number, c: number, h: number): Exact | null {
  const [r, g, b] = lchToSrgb(l, c, h).map(v => Math.round(v * 255));
  if (r === g && g === b) {
    return c < SAME && Math.abs(l - grayL(r)) < SAME ? { kind: GRAY_LEVEL, level: r } : null;
  }
  const hex = (r << 16) | (g << 8) | b;
  return deltaE([l, c, h], hexLch(hex)) < SAME ? { kind: HEX, hex } : null;
}
/* An `own` that names no hex color counts for nothing. */
function exactOf(a: Anchor): Exact | null {
  const tint = a.own === undefined ? null : exactAt(a.l, a.c, a.own);
  if (tint && tint.kind === HEX && a.own !== undefined) {
    return a.c < GRAY && Math.abs(shortTurn(a.own - a.h)) > 1e-6
      ? { kind: NEAR_GRAY, hex: tint.hex }
      : tint;
  }
  return onGrid(a.l, LIGHTNESS) && onGrid(a.c, CHROMA) ? null : exactAt(a.l, a.c, a.h);
}
/** The hex color a keyframe is exactly, where the seed holds it as one; null for a keyframe on the grid. */
export const keyframeHex = (a: Anchor): string | null =>
  exactOf(a) ? toHex(lchToSrgb(a.l, a.c, a.own ?? a.h)) : null;

function writer() {
  const bits: number[] = [];
  return {
    put(n: number, width: number) {
      for (let i = width - 1; i >= 0; i--) bits.push((n >> i) & 1);
    },
    seed() {
      let seed = "k";
      for (let i = 0; i < bits.length; i += 6) {
        let n = 0;
        for (let j = 0; j < 6; j++) n = (n << 1) | (bits[i + j] ?? 0);
        seed += BASE64URL[n];
      }
      return seed;
    }
  };
}
type Writer = ReturnType<typeof writer>;

/* Version 1 measures each hue step from the hue before it as given, so rounding accumulates along the palette. Every
   hue is shifted by whole turns so the first lands in [0, 360): a palette turned by whole turns is the same seed. */
function writeGrid(w: Writer, A: readonly Anchor[]) {
  const shift = 360 * Math.floor(A[0].h / 360);
  w.put(toCode(LIGHTNESS, A[0].l), 8);
  w.put(toCode(CHROMA, A[0].c), 8);
  w.put(Math.round((onWheel(A[0].h - shift) / 360) * 512) % 512, 9);
  let previous = A[0].h - shift;
  for (const a of A.slice(1)) {
    w.put(toCode(LIGHTNESS, a.l), 8);
    w.put(toCode(CHROMA, a.c), 8);
    const dh = clamp(a.h - shift - previous, -DH_MAX, DH_MAX);
    w.put(toCode(STEP, dh), 10);
    previous = previous + dh;
  }
}
/* Version 0 measures each hue from the hue the seed holds for the keyframe before, so no rounding reaches a hex
   color's own hue. A hex keyframe's hue is its own; from the second keyframe on a turn says which way round it lies:
   the short way, a lap more or a lap less, whichever is nearest the step asked for. */
function writeExact(w: Writer, A: readonly Anchor[], exact: readonly (Exact | null)[]) {
  let h = 0;
  let shift = 0;
  A.forEach((a, i) => {
    const e = exact[i];
    if (e?.kind === HEX) {
      const own = hexLch(e.hex)[2];
      w.put(HEX, 2);
      w.put(e.hex, 24);
      if (i === 0) {
        h = onWheel(own);
        shift = 360 * Math.round((a.h - h) / 360);
        return;
      }
      const way = shortTurn(own - h);
      const ways = [way, way + 360, way - 360];
      const want = clamp(a.h - shift - h, -DH_MAX, DH_MAX);
      let turn = 0;
      for (let j = 1; j < 3; j++)
        if (Math.abs(ways[j] - want) < Math.abs(ways[turn] - want)) turn = j;
      w.put(turn, 2);
      h += ways[turn];
      return;
    }
    w.put(e ? e.kind : GRID, 2);
    if (!e) {
      w.put(toCode(LIGHTNESS, a.l), 8);
      w.put(toCode(CHROMA, a.c), 8);
    } else if (e.kind === NEAR_GRAY) w.put(e.hex, 24);
    else w.put(e.level, 8);
    if (i > 0) {
      const n = toCode(STEP, a.h - shift - h);
      w.put(n, 10);
      h += fromCode(STEP, n);
      return;
    }
    shift = 360 * Math.floor(a.h / 360);
    let n = Math.round(((a.h - shift) / 360) * 512);
    if (n === 512) {
      n = 0;
      shift += 360;
    }
    w.put(n, 9);
    h = (n / 512) * 360;
  });
}

/** The seed of a palette. Anchors past K_MAX are dropped; a hue step past ±540° is clamped; NaN writes as 0. */
export function encodePalette(P: Palette): string {
  if (P.anchors.length < K_MIN) throw new RangeError("A palette has at least two keyframes.");
  const A = P.anchors.slice(0, K_MAX);
  const exact = A.map(exactOf);
  const w = writer();
  const grid = exact.every(e => !e);
  w.put(grid ? 1 : 0, 2);
  w.put(A.length - 2, 3);
  w.put(0, 1);
  if (grid) writeGrid(w, A);
  else writeExact(w, A, exact);
  return w.seed();
}

const INDEX = new Map([...BASE64URL].map((ch, i) => [ch, i]));
function reader(body: string) {
  const codes: number[] = [];
  for (const ch of body) {
    const n = INDEX.get(ch);
    if (n === undefined) return null;
    codes.push(n);
  }
  let at = 0;
  return {
    take(width: number) {
      let n = 0;
      for (let k = 0; k < width; k++, at++)
        n = (n << 1) | (((codes[(at / 6) | 0] ?? 0) >> (5 - (at % 6))) & 1);
      return n;
    },
    /** Whether the stream ends in the character that holds its last bit: a seed cut short or padded is no seed. */
    exact: () => codes.length === Math.ceil(at / 6)
  };
}

/** The palette a seed holds; null for anything else. A set reserved bit or non-zero fill bits still decode: such a
    spelling is not canonical, and the app leads it to the seed `encodePalette` writes. */
export function decodePalette(seed: unknown): Palette | null {
  if (typeof seed !== "string" || seed[0] !== "k") return null;
  const r = reader(seed.slice(1));
  if (!r) return null;
  const version = r.take(2);
  if (version > 1) return null;
  const K = r.take(3) + 2;
  if (K > K_MAX) return null;
  r.take(1);
  const hue = (i: number, h: number) =>
    i ? h + fromCode(STEP, r.take(10)) : (r.take(9) / 512) * 360;
  const anchors: Anchor[] = [];
  let h = 0;
  for (let i = 0; i < K; i++) {
    const kind = version === 1 ? GRID : r.take(2);
    if (kind === HEX || kind === NEAR_GRAY) {
      const hex = r.take(24);
      const [l, c, own] = hexLch(hex);
      const turn = kind === HEX && i ? r.take(2) : 0;
      /* a gray has no hue of its own: it is kind 2 */
      if (turn === 3 || isGray(hex)) return null;
      if (kind === NEAR_GRAY) {
        h = hue(i, h);
        anchors.push({ l, c, h, own });
        continue;
      }
      const way = shortTurn(own - h);
      h = i ? h + [way, way + 360, way - 360][turn] : onWheel(own);
      anchors.push({ l, c, h });
      continue;
    }
    const l = kind === GRAY_LEVEL ? grayL(r.take(8)) : fromCode(LIGHTNESS, r.take(8));
    const c = kind === GRAY_LEVEL ? 0 : fromCode(CHROMA, r.take(8));
    h = hue(i, h);
    anchors.push({ l, c, h });
  }
  return r.exact() ? { anchors } : null;
}

/** The palette as the seed holds it: decode after encode. Idempotent, and it encodes to the same seed again. */
export const canonical = (P: Palette): Palette => decodePalette(encodePalette(P)) as Palette;
