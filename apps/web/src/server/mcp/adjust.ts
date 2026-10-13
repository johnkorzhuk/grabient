import { canonical, encodePalette } from "@grabient/engine/codec.ts";
import { fitChroma, hexToSrgb, lchToSrgb, srgbToOklab } from "@grabient/engine/color.ts";
import { sampleHex } from "@grabient/engine/curve.ts";
import { type Anchor, DH_MAX, DH_STEP, type Palette } from "@grabient/engine/palette.ts";
import { hexAnchor } from "@grabient/engine/spec.ts";
import { colorsToPalette, hexColor, hexOf, quoted } from "./colors.ts";

/* A palette changed by the numbers a call sends, in one fixed order: reversed, resampled, then each color turned,
   warmed, its chroma scaled and moved toward white or black. The notes say what the change could not reach. Pure. */

export interface Change {
  /** -1 to 1: the share of the way every color moves to white, or below 0 to black */
  lighten?: number;
  /** multiplies every color's chroma, 0 to 3 */
  chromaScale?: number;
  /** degrees every hue turns, -360 to 360 */
  hueShift?: number;
  /** -1 (cooler) to 1 (warmer): every color moves up to 0.06 along OKLab's line from blue to orange */
  warmth?: number;
  reverse?: boolean;
  /** resampled along the curve to this many colors, 2 to 8 */
  colorCount?: number;
  /** the colors that stay as they are, counted from 0 */
  hold?: number[];
}

// each number's least, its most and what it means, for a refusal's words
const RANGES = {
  lighten: [-1, 1, "the share of the way to white, or below 0 to black"],
  chromaScale: [0, 3, "what every color's chroma is multiplied by"],
  hueShift: [-360, 360, "the degrees every hue turns"],
  warmth: [-1, 1, "from cooler, toward blue, to warmer, toward orange"],
  colorCount: [2, 8, "how many colors the palette is resampled to"]
} as const;
/** Warmer is toward orange and cooler toward blue, one line through gray in OKLab; the whole of it moves a color 0.06. */
const WARM = 70;
const REACH = 0.06;
/** Chroma under which a color is a gray. */
const GRAY = 0.01;
/** Two colors this near in OKLab are one to the eye, and half of it is the least chroma worth a sentence. */
const SAME = 0.02;
const DEG = Math.PI / 180;

/** The chroma a color is drawn with, which is what makes it a gray: black keeps a stored chroma that draws as none. */
const drawn = (a: Anchor) =>
  Math.hypot(...srgbToOklab(...lchToSrgb(a.l, a.c, a.own ?? a.h)).slice(1));
const gray = (a: Anchor) => drawn(a) < GRAY;
const labOf = (hex: string) => srgbToOklab(...hexToSrgb(hex)!);

/** One change as a call sends it, read against the palette it changes. Ranges are checked here, where a refusal can
    say what a number means; `hold` names colors by hex, each the palette's nearest. */
export function readChange(value: unknown, palette: Palette): Change | { error: string } {
  const given = (value ?? {}) as Record<string, unknown>;
  const change: Change = {};
  for (const key of Object.keys(RANGES) as (keyof typeof RANGES)[]) {
    if (given[key] == null) continue;
    const [least, most, means] = RANGES[key];
    const v = Number(given[key]);
    if (!(v >= least && v <= most)) {
      const percent = key === "lighten" && Math.abs(v) >= 2 && Math.abs(v) <= 100;
      return {
        error: `${key} is ${least} to ${most}, ${means}${percent ? `, so ${v} is ${+(v / 100).toFixed(4)}` : `: ${v} was sent`}.`
      };
    }
    change[key] = v;
  }
  if (given.reverse === true) change.reverse = true;
  const named = (given.hold ?? []) as unknown[];
  const own = canonical(palette).anchors.map(hexOf);
  if (named.length && change.colorCount !== undefined) {
    return { error: "hold cannot go with colorCount: resampling makes every color anew." };
  }
  for (const [k, one] of named.entries()) {
    const hex = hexColor(one);
    if (!hex)
      return {
        error: `hold ${k + 1} is ${quoted(one)}, and a color is taken as hex: #rrggbb or #rgb.`
      };
    const lab = labOf(hex);
    const far = own.map(held => Math.hypot(...labOf(held).map((v, i) => v - lab[i]!)));
    const least = Math.min(...far);
    if (least > SAME)
      return { error: `hold "${hex}" is none of this palette's colors: ${own.join(", ")}.` };
    change.hold ??= [];
    change.hold.push(...far.flatMap((d, i) => (d === least ? [i] : [])));
  }
  return change;
}

/** The palette changed, and a sentence for each thing the change could not reach. A gray has no hue of its own:
    warmth leaves it as it is unless every color is gray, and it moves with the color beside it, so a neighbor that
    turned or stayed never recolors the blend between them. */
export function adjustPalette(
  palette: Palette,
  change: Change
): { palette: Palette; notes: string[] } {
  const from = canonical(palette);
  const count = Math.round(change.colorCount ?? from.anchors.length);
  const notes: string[] = [];
  let base = change.reverse ? [...from.anchors].reverse() : from.anchors;
  const held = new Set((change.hold ?? []).map(i => (change.reverse ? base.length - 1 - i : i)));
  if (count !== base.length) {
    // the curve's colors at even places, made a palette as composing makes one, so each blend goes the short way
    const curve = { anchors: base };
    const made = colorsToPalette(
      Array.from({ length: count }, (_, i) => sampleHex(curve, i / (count - 1)))
    );
    if ("palette" in made) base = made.palette.anchors;
  }
  const turn = change.hueShift ?? 0;
  const shift = REACH * (change.warmth ?? 0);
  const scale = change.chromaScale ?? 1;
  const by = change.lighten ?? 0;
  const wasGray = base.map(gray);
  const tint = shift !== 0 && wasGray.every(Boolean);
  const free = base.map((_, i) => i).filter(i => !held.has(i));
  const now = base.map((a, i): Anchor => {
    if (held.has(i)) return a;
    let c = a.c;
    let h = a.h + turn;
    if (tint) {
      c = Math.abs(shift);
      h = shift > 0 ? WARM : WARM + 180;
    } else if (shift && !wasGray[i]) {
      const x = c * Math.cos(h * DEG) + shift * Math.cos(WARM * DEG);
      const y = c * Math.sin(h * DEG) + shift * Math.sin(WARM * DEG);
      const d = Math.atan2(y, x) / DEG - h;
      c = Math.hypot(x, y);
      // the nearest way round from where the hue was, so the route to its neighbors is kept
      h += d - 360 * Math.round(d / 360);
    }
    // a near gray the change leaves as it is keeps its own tint (`own`); one it moved is read anew below
    return { ...a, l: by > 0 ? a.l + by * (1 - a.l) : a.l * (1 + by), c: c * scale, h };
  });
  /* A gray moves with the color on either side whose hue it was nearest, the one before it on a tie: the color
     composing gave it its hue from. Its hue is never read anew, which would recolor a palette made another way. */
  const isGray = now.map(gray);
  const beside = (i: number, d: number) => {
    for (let j = i + d; j >= 0 && j < now.length; j += d) if (!isGray[j]) return j;
    return -1;
  };
  const hues = now.map((a, i) => {
    if (!isGray[i] || tint) return a.h;
    const before = beside(i, -1);
    const after = beside(i, 1);
    const off = (j: number) => Math.abs(base[i]!.h - base[j]!.h);
    const j = before < 0 || (after >= 0 && off(after) < off(before)) ? after : before;
    return j < 0 ? base[i]!.h : now[j]!.h + base[i]!.h - base[j]!.h;
  });
  /* Whole turns come out of a step past 540 degrees, as few as fit, and out of one beside a gray that the change made
     longer than half a turn, which goes the short way as composing takes it; the colors after it go with it. */
  let out = 0;
  const turned = now.map((a, i) => {
    const d = i ? hues[i]! - hues[i - 1]! : 0;
    const short =
      Math.abs(d) > 180 &&
      (isGray[i] || isGray[i - 1]) &&
      Math.abs(base[i]!.h - base[i - 1]!.h) <= 180;
    out +=
      360 *
      (short
        ? Math.round(d / 360)
        : Math.sign(d) * Math.ceil(Math.max(0, Math.abs(d) - DH_MAX - DH_STEP / 2) / 360));
    return { ...a, h: hues[i]! - out };
  });
  /* The answer's colors are hex colors, as composing makes them: each one sRGB shows in full is kept as the hex it
     draws, which a seed holds as it is. One more vivid than sRGB keeps the chroma asked, as a keyframe on the seed's
     grid. A change of nothing is the palette itself. */
  const plain = canonical({ anchors: turned });
  const color = (a: Anchor) => a.own ?? a.h;
  const made =
    encodePalette(plain) === encodePalette(from)
      ? plain
      : canonical({
          anchors: turned.map(a =>
            fitChroma(a.l, a.c, color(a)) === a.c ? hexAnchor(hexToSrgb(hexOf(a))!, a.h) : a
          )
        });
  const said = (words: string, which: number[]) => {
    if (which.length)
      notes.push(`${words} ${[...new Set(which.map(i => hexOf(made.anchors[i]!)))].join(", ")}.`);
  };
  if (by > 0 && free.some(i => base[i]!.l === 1)) notes.push("White could not get lighter.");
  if (by < 0 && free.some(i => base[i]!.l === 0)) notes.push("Black could not get darker.");
  if (shift && !tint)
    said(
      "Warmth left the grays as they are:",
      free.filter(i => wasGray[i])
    );
  if (shift || scale > 1) {
    said(
      "More chroma was asked than sRGB shows at",
      free.filter(
        i =>
          made.anchors[i]!.c - drawn(made.anchors[i]!) - (base[i]!.c - drawn(base[i]!)) >= SAME / 2
      )
    );
  }
  const slipped = [...held].flatMap(i =>
    hexOf(made.anchors[i]!) === hexOf(base[i]!)
      ? []
      : [`${hexOf(base[i]!)} as ${hexOf(made.anchors[i]!)}`]
  );
  if (slipped.length)
    notes.push(
      `A held color the seed keeps on its grid came out a shade off: ${slipped.join(", ")}.`
    );
  if (encodePalette(made) === encodePalette(from))
    notes.push("The change left the palette as it was.");
  return { palette: made, notes };
}
