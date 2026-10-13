/* A palette is 2 to 8 keyframes (anchors) in OKLCH, the curve through them a Catmull-Rom spline (curve.ts). Hue is in
   unwrapped degrees, so 210 to 570 is one turn clockwise, and adjacent anchors differ by at most DH_MAX. The app holds
   only canonical palettes (codec.ts) and never changes one in place. */

/** `own` is a near gray's own faint tint, where that is not the hue it carries along the curve: the color is
    (l, c, own), and (l, c, h) to code that knows of none. */
export interface Anchor {
  l: number;
  c: number;
  h: number;
  own?: number;
}
/** One of the three numbers a keyframe is set by. */
export type Axis = "l" | "c" | "h";
export interface Palette {
  readonly anchors: readonly Anchor[];
}

export const K_MIN = 2;
export const K_MAX = 8;
export const C_MAX = 0.35;
/** The most hue between adjacent anchors: a lap and a half, the seed's field. */
export const DH_MAX = 540;
/** One code of the seed's hue step: 10 bits over ±540°, about 1.06°. */
export const DH_STEP = (2 * DH_MAX) / 1022;
/** Under this chroma a color is a gray to the eye and its hue is noise. */
export const GRAY = 0.01;
