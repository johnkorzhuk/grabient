/* A field effect's scene: everything a frame of it is drawn from, for a palette, a view and a box, the same numbers in
   every format (render.ts on the CPU, the shaders, the clips' module, the SVG's tracer): the unit D, the view's turn,
   the design's constants and tracks, the ground, the palette's stops, the shadow's color. And a frame's numbers at t:
   the phases and the shadow's and the rim's moves.

   Units: q is the box in D units, centered, y down; D is the box's longer side times the effect's span. The kernel
   reads the point turned by the view's angle: every direction of the design turned clockwise on the screen by
   angle - 90 degrees, as the strings' are, so 90 is the design as made. */
import { lchToSrgb, srgbToLch } from "../color.ts";
import { sampleSrgb } from "../curve.ts";
import type { Palette } from "../palette.ts";
import type { Size } from "../view.ts";
import {
  type ColorMap,
  type FieldEffect,
  type KitSteps,
  kitFrameSize,
  type Track
} from "./types.ts";

/** The palette's stops every color of a field effect is read from, evenly along its curve. */
export const KIT_STOPS = 16;
/** Sheets drawn at a pixel past the one under it that covers it whole: each with its shadow and its rim. Four keep the
    sheets exact while their levels lie a quarter of a pixel apart or more. */
export const KIT_EDGE = 4;

/** mulberry32: a design's random numbers, the same in every format that draws them. */
export function kitRng(seed: number): () => number {
  let a = Math.imul(seed, 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A design's number to a millionth, so every format writes the same one. */
export const kitRound = (v: number): number => {
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) ? 0 : r;
};

export interface KitView {
  angle: number;
  /** 0 or none: as designed */
  shape: number | null;
  /** the view's steps, for an effect that takes them (FieldEffect.steps): none as designed, any other number clamped
      to its range (kitSteps); an effect that takes none leaves them be */
  steps?: number | null;
}

/** The steps a view draws an effect at: its own, rounded and clamped to the effect's range, the designed where it names
    none; null for an effect that takes none. */
export function kitSteps(def: FieldEffect, steps: number | null | undefined): number | null {
  const range: KitSteps | undefined = def.steps;
  if (!range) return null;
  if (steps === null || steps === undefined || !Number.isFinite(steps)) return range.designed;
  return Math.min(range.most, Math.max(range.least, Math.round(steps)));
}

export interface KitScene {
  def: FieldEffect;
  width: number;
  height: number;
  D: number;
  /** the view's turn: the cosine and sine of angle - 90 degrees */
  cos: number;
  sin: number;
  /** the kernel's constants */
  U: Readonly<Record<string, Float64Array>>;
  tracks: readonly Track[];
  /** the ground, the stops (KIT_STOPS of them, three channels each) and the shadow's color: 0..1, each a byte */
  ground: number[];
  stops: Float64Array;
  shade: number[];
  /** the lines' one color where they take the palette's lightest or darkest stop, else null */
  lineFixed: number[] | null;
  /** the steps the view draws it at (kitSteps), null for an effect that takes none */
  steps: number | null;
  /** the levels as those steps space them (types.ts KitSteps), what every format reads in place of the recipe's: the
      sheets' step and their colors' hop, the lines' step and hop (0 where the effect has none), each the recipe's own
      number at the designed steps and for an effect that takes none */
  sheetStep: number;
  sheetHop: number;
  lineStep: number;
  lineHop: number;
  /** the view's name, which traced stills are kept by: its kind, angle and shape, and its steps where it takes them */
  view: string;
}

const byte = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255) / 255;
const bytes = (rgb: readonly number[]) => rgb.map(byte);

/** What every format adds before it takes a pixel's channel to a byte (kitByte): a sheet whose color map lands on a
    stop's midpoint is two bytes' mean, exactly half a level, which double precision (the CPU, the SVG's fills, the
    clips) and a GPU's float32 rounded opposite ways, a level apart on a whole sheet (8 Nov 2026: 8,799 of the zen
    garden's 230,400 pixels at 640 by 360 on the RTX, kit/gl.ts). Raised by 2^-10, a tie rounds up in each, far past
    float32's error at 255 (about 2^-16), and a channel moves only where it lay within 2^-10 under a half. */
export const KIT_TIE = 2 ** -10;
/** A channel 0..1 to its byte as every format writes it: the nearest, a tie up (KIT_TIE). */
export const kitByte = (v: number): number =>
  Math.min(255, Math.max(0, Math.floor(v * 255 + 0.5 + KIT_TIE)));
export const kitHex = (rgb: ArrayLike<number>): string =>
  `#${[rgb[0], rgb[1], rgb[2]].map(v => kitByte(v).toString(16).padStart(2, "0")).join("")}`;

/** The design a shape draws, checked against what the effect says it holds. */
function designOf(def: FieldEffect, shape: number | null) {
  const d = def.design(shape || def.designedSeed);
  const U: Record<string, Float64Array> = {};
  for (const [name, length] of Object.entries(def.uniforms)) {
    const list = d.U[name];
    if (!list || list.length !== length)
      throw new Error(
        `${def.kind}: its design's ${name} holds ${list?.length} numbers, not ${length}`
      );
    U[name] = Float64Array.from(list);
  }
  if (d.tracks.length !== def.tracks)
    throw new Error(`${def.kind}: its design has ${d.tracks.length} tracks, not ${def.tracks}`);
  return { U, tracks: d.tracks };
}

/** The scene a palette and a view draw in a box. */
export function kitScene(def: FieldEffect, P: Palette, view: KitView, size: Size): KitScene {
  const { width, height } = size;
  const D = def.span * Math.max(width, height);
  const rad = ((view.angle - 90) * Math.PI) / 180;
  /* the palette's darkest and lightest colors, of seventeen along its curve */
  let darkest = sampleSrgb(P, 0);
  let lightest = darkest;
  let dl = 2;
  let ll = -1;
  for (let i = 0; i <= 16; i++) {
    const c = sampleSrgb(P, i / 16);
    const l = srgbToLch(c)[0];
    if (l < dl) {
      dl = l;
      darkest = c;
    }
    if (l > ll) {
      ll = l;
      lightest = c;
    }
  }
  const G = def.ground;
  const dark = G.pick === "darkest";
  const [L0, C0, H0] = srgbToLch(dark ? darkest : lightest);
  const Lg0 = dark
    ? Math.min(G.bound, L0 * G.lightness)
    : Math.max(G.bound, 1 - (1 - L0) * G.lightness);
  const ground = bytes(lchToSrgb(Lg0, C0 * G.chroma, H0));
  const Lg = srgbToLch(ground)[0];
  /* the stops, each moved off the ground where it would sink into it */
  const stops = new Float64Array(KIT_STOPS * 3);
  for (let i = 0; i < KIT_STOPS; i++) {
    const c = sampleSrgb(P, i / (KIT_STOPS - 1));
    const [L, C, H] = srgbToLch(c);
    const lifted =
      G.lift <= 0
        ? c
        : dark
          ? L >= Lg + G.lift
            ? c
            : lchToSrgb(Lg + G.lift, C, H)
          : L <= Lg - G.lift
            ? c
            : lchToSrgb(Lg - G.lift, C, H);
    stops.set(bytes(lifted), 3 * i);
  }
  /* the shadow: the palette's darkest hue, near black */
  const [, Cd, Hd] = srgbToLch(darkest);
  const shade = bytes(lchToSrgb(0.13, Math.min(0.05, Cd * 0.6), Hd));
  const { U, tracks } = designOf(def, view.shape);
  /* the levels n / designed times as close and each one's color designed / n times as far: a ratio of exactly 1 at
     the designed steps, so every number there is the recipe's to the last bit */
  const steps = kitSteps(def, view.steps);
  const apart = steps === null || !def.steps ? 1 : def.steps.designed / steps;
  /* the lines' one color, the stop farthest from black or nearest it */
  const lc = def.lines?.colors;
  let lineFixed: number[] | null = null;
  if (lc === "lightest" || lc === "darkest") {
    let best = 0;
    let bestL = lc === "lightest" ? -1 : 2;
    for (let i = 0; i < KIT_STOPS; i++) {
      const l = srgbToLch([stops[3 * i], stops[3 * i + 1], stops[3 * i + 2]])[0];
      if (lc === "lightest" ? l > bestL : l < bestL) {
        bestL = l;
        best = i;
      }
    }
    lineFixed = [stops[3 * best], stops[3 * best + 1], stops[3 * best + 2]];
  }
  return {
    def,
    width,
    height,
    D,
    cos: Math.cos(rad),
    sin: Math.sin(rad),
    U,
    tracks,
    ground,
    stops,
    shade,
    lineFixed,
    steps,
    sheetStep: def.sheets ? def.sheets.step * apart : 0,
    sheetHop: def.sheets ? def.sheets.colors.hop * apart : 0,
    lineStep: def.lines ? def.lines.step * apart : 0,
    lineHop: typeof lc === "object" ? lc.hop * apart : 0,
    view: `${def.kind}|${view.angle}|${view.shape || 0}${steps === null ? "" : `|${steps}`}`
  };
}

const TAU = Math.PI * 2;

/** The frame at t seconds of the loop at speed 1, into `at` (kitFrameSize numbers): each track's phase, reduced to one
    turn, then the shadow's move (D units on the screen, toward where it falls) and the rim's (toward the light). What
    the CPU computes a frame, and what the player sends as uniforms. */
export function kitFrameAt(m: KitScene, time: number, at: Float64Array | Float32Array) {
  const def = m.def;
  const loop = def.loop;
  const t = time - loop * Math.floor(time / loop);
  let i = 0;
  for (const v of m.tracks) {
    const p = v.rest + v.swing * Math.sin((TAU * v.cycles * t) / loop + v.psi);
    at[i++] = p - TAU * Math.floor(p / TAU);
  }
  const S = def.sheets;
  const sh = S?.shadow;
  const angle = sh ? ((sh.angle + sh.swing * Math.sin((TAU * t) / loop)) * Math.PI) / 180 : 0;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const d = sh ? sh.distance : 0;
  const r = S?.rim ? S.rim.distance : 0;
  at[i] = d * c;
  at[i + 1] = d * s;
  at[i + 2] = -r * c;
  at[i + 3] = -r * s;
}

/** A frame's numbers at t, as a new list. */
export function kitFrame(m: KitScene, t: number): Float64Array {
  const at = new Float64Array(kitFrameSize(m.def));
  kitFrameAt(m, t, at);
  return at;
}

/** The point the kernel reads for a screen point q (D units, centered, y down): q turned out of the view's angle. */
export function kitTurnX(m: KitScene, qx: number, qy: number): number {
  return m.cos * qx + m.sin * qy;
}
export function kitTurnY(m: KitScene, qx: number, qy: number): number {
  return -m.sin * qx + m.cos * qy;
}

/** The palette's place a color map gives level k, 0..1, each level `hop` along it (the map's own unless said: a
    scene's, kitScene's sheetHop and lineHop, where the view's steps space the levels). */
export function kitPlace(map: ColorMap, k: number, hop = map.hop): number {
  const u = k * hop + map.offset;
  if (map.wrap === "clamp") return Math.min(1, Math.max(0, u));
  if (map.wrap === "cycle") return u - Math.floor(u);
  const w = u - 2 * Math.floor(u / 2);
  return w <= 1 ? w : 2 - w;
}

/** The stops' color at a place 0..1, into out[o..o + 2]: read between the two stops either side, as every format reads
    it. */
export function kitStop(m: KitScene, place: number, out: Float64Array | number[], o = 0) {
  const x = Math.min(1, Math.max(0, place)) * (KIT_STOPS - 1);
  const i = Math.min(KIT_STOPS - 2, Math.floor(x));
  const f = x - i;
  const s = m.stops;
  out[o] = s[3 * i] + (s[3 * i + 3] - s[3 * i]) * f;
  out[o + 1] = s[3 * i + 1] + (s[3 * i + 4] - s[3 * i + 1]) * f;
  out[o + 2] = s[3 * i + 2] + (s[3 * i + 5] - s[3 * i + 2]) * f;
}

/** Sheet k's color. */
export function kitSheetColor(m: KitScene, k: number, out: Float64Array | number[], o = 0) {
  const S = m.def.sheets;
  if (!S) throw new Error(`${m.def.kind} has no sheets`);
  kitStop(m, kitPlace(S.colors, k, m.sheetHop), out, o);
}

/** Line j's color. */
export function kitLineColor(m: KitScene, j: number, out: Float64Array | number[], o = 0) {
  const L = m.def.lines;
  if (!L) throw new Error(`${m.def.kind} has no lines`);
  if (m.lineFixed) {
    out[o] = m.lineFixed[0];
    out[o + 1] = m.lineFixed[1];
    out[o + 2] = m.lineFixed[2];
    return;
  }
  kitStop(m, kitPlace(L.colors as ColorMap, j, m.lineHop), out, o);
}
