/* The small core most callers need: a palette, its seed and its curve. Everything else is imported by its module's
   path (`@grabient/engine/css.ts`), so a bundle takes only the modules it uses. */
export { canonical, decodePalette, encodePalette } from "./codec.ts";
export { type Stop, sampleHex, sampleLCH, sampleSrgb, sampleStops } from "./curve.ts";
export { type Anchor, type Axis, C_MAX, DH_MAX, K_MAX, K_MIN, type Palette } from "./palette.ts";
