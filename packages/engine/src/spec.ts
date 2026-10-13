/* The palette as a JSON spec, the form agents and exports read and write, and palettes made from hex colors. */
import { canonical, keyframeHex } from "./codec.ts";
import { hexToSrgb, srgbToLch, type Triple } from "./color.ts";
import { clamp, clamp01, shortTurn } from "./math.ts";
import { type Anchor, C_MAX, DH_MAX, GRAY, K_MAX, K_MIN, type Palette } from "./palette.ts";
import type { View } from "./view.ts";

/** A keyframe the seed holds as a hex color names it in `hex`, which is then the color read: its l and c are for the
    reader, and its h names the lap. */
export interface SpecAnchor {
  l: number;
  c: number;
  h: number;
  hex?: string;
}
export interface Spec {
  anchors: SpecAnchor[];
}

/** Each number is rounded inside half its seed code (l and c to three decimals, h to one, since a hue code is 0.70° on
    the first anchor and 1.06° after it), so `fromSpec` reads a written spec back as the seed it came from. */
export const toSpec = (P: Palette): Spec => ({
  anchors: canonical(P).anchors.map(a => {
    const hex = keyframeHex(a);
    return { l: +a.l.toFixed(3), c: +a.c.toFixed(3), h: +a.h.toFixed(1), ...(hex ? { hex } : {}) };
  })
});

/** The keyframes as JSON, with the view that draws them. */
export const specJson = (P: Palette, view: Pick<View, "style" | "steps" | "angle">) =>
  JSON.stringify(
    { ...toSpec(P), style: view.style, steps: view.steps, angle: view.angle },
    null,
    2
  );

/** A hex color as a keyframe, its hue in the lap nearest `near`. A gray has no hue of its own and takes `near`; a near
    gray carries `near` too and keeps its faint tint as `own`. */
export function hexAnchor(rgb: Triple, near: number): Anchor {
  const [l, c, own] = srgbToLch(rgb);
  if (rgb[0] === rgb[1] && rgb[1] === rgb[2]) return { l, c: 0, h: near };
  return c < GRAY
    ? { l, c, h: near, own }
    : { l, c, h: own + 360 * Math.round((near - own) / 360) };
}

const wallSteps = (anchors: Anchor[]) => {
  for (let i = 1; i < anchors.length; i++) {
    anchors[i].h = anchors[i - 1].h + clamp(anchors[i].h - anchors[i - 1].h, -DH_MAX, DH_MAX);
  }
};
/* A near gray the seed holds by its own hue is written with that hue rounded to a tenth: within half of that (and the
   last digit toFixed may round) it is still its own, so the spec reads back as the seed it came from. */
function specHexAnchor(rgb: Triple, h: number): Anchor {
  const a = hexAnchor(rgb, h);
  if (a.own === undefined || Math.abs(shortTurn(h - a.own)) > 0.05 + 1e-9) return a;
  return { l: a.l, c: a.c, h: a.own + 360 * Math.round((h - a.own) / 360) };
}

/** The palette a spec names, canonical; null unless `anchors` holds 2 to 8 keyframes with finite l, c and h. Numbers
    are clamped to their ranges and hue steps to the wall. */
export function fromSpec(spec: unknown): Palette | null {
  const list = (spec as { anchors?: unknown } | null)?.anchors;
  if (!Array.isArray(list) || list.length < K_MIN || list.length > K_MAX) return null;
  const anchors: Anchor[] = [];
  for (const item of list) {
    const a = item as Partial<Record<keyof SpecAnchor, unknown>> | null;
    if (!a || typeof a !== "object") return null;
    const { l, c, h } = a;
    if (![l, c, h].every(v => typeof v === "number" && Number.isFinite(v))) return null;
    const rgb = typeof a.hex === "string" ? hexToSrgb(a.hex) : null;
    anchors.push(
      rgb
        ? specHexAnchor(rgb, h as number)
        : { l: clamp01(l as number), c: clamp(c as number, 0, C_MAX), h: h as number }
    );
  }
  wallSteps(anchors);
  return canonical({ anchors });
}

/** A palette of 2 to 8 hex colors (`#rrggbb` or `rrggbb`), each held as its hex; null for any other list. A colored hue
    is unwrapped the short way from the hue before. A gray or near gray carries the running hue, so black, white or an
    off-white never adds a lap; grays that come first borrow the first colored hue, and of several grays between two
    colors the last takes the hue after it, so the turn falls where nothing shows it. */
export function anchorsFromHexes(hexes: readonly string[]): Palette | null {
  if (hexes.length < K_MIN || hexes.length > K_MAX) return null;
  const anchors: Anchor[] = [];
  let last: number | null = null;
  let colored = false;
  for (const hex of hexes) {
    const rgb = hexToSrgb(hex);
    if (!rgb) return null;
    const [l, c, raw] = srgbToLch(rgb);
    const gray = rgb[0] === rgb[1] && rgb[1] === rgb[2];
    let h = raw;
    if (c < GRAY && last != null) h = last;
    else if (last != null && colored) h = last + shortTurn(h - last);
    if (c >= GRAY && !colored) {
      colored = true;
      for (const a of anchors) a.h = h;
    }
    last = h;
    anchors.push(
      gray ? { l, c: 0, h } : c < GRAY ? { l, c, h, own: raw } : { l, c: clamp(c, 0, C_MAX), h }
    );
  }
  for (let i = 1; i + 1 < anchors.length; i++) {
    if (anchors[i].c < GRAY && anchors[i - 1].c < GRAY && anchors[i + 1].c >= GRAY)
      anchors[i].h = anchors[i + 1].h;
  }
  return { anchors };
}
