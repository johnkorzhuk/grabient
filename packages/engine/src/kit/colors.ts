/* The colors a field effect's picture is a blend of, anywhere in it and at any time of its loop: its ground, each of
   its stops (every sheet and line takes a color between two of them), its shadows at their deepest (the ink, or each
   stop darkened where a shadow takes the sheet below it) and its rims at their brightest (each stop lit by the rim's
   alpha toward white or toward its own color lifted). What a page reads to say which ink reads on it (apps/web
   features/examples/paint.ts), which loads it on demand, as no page's start carries the kit. */
import { toHex } from "../color.ts";
import type { Palette } from "../palette.ts";
import type { KitKind } from "./kinds.ts";
import { kitEffect } from "./registry.ts";
import { KIT_STOPS, kitScene } from "./scene.ts";

/** Every color a kit effect's picture of the palette is a blend of, each once. */
export function kitColors(kind: KitKind, P: Palette): string[] {
  const def = kitEffect(kind);
  const m = kitScene(def, P, { angle: 90, shape: null }, { width: 9, height: 9 });
  const S = def.sheets;
  const hex = (r: number, g: number, b: number) => toHex([r, g, b]);
  const out = [hex(m.ground[0], m.ground[1], m.ground[2])];
  const stops = Array.from({ length: KIT_STOPS }, (_, i) => [
    m.stops[3 * i],
    m.stops[3 * i + 1],
    m.stops[3 * i + 2]
  ]);
  for (const [r, g, b] of stops) out.push(hex(r, g, b));
  const shadow = S?.shadow;
  if (shadow?.tint === "below") {
    const d = shadow.depth ?? 0.55;
    for (const [r, g, b] of [m.ground, ...stops]) out.push(hex(r * d, g * d, b * d));
  } else if (shadow) out.push(hex(m.shade[0], m.shade[1], m.shade[2]));
  const rim = S?.rim;
  if (rim)
    for (const [r, g, b] of stops) {
      const l = rim.tint === "own" ? (rim.lift ?? 0.4) : 1;
      /* the rim's color, then the stop lit toward it by its alpha */
      const lit = [r, g, b].map(v => v + (1 - v) * l);
      out.push(
        hex(
          r + (lit[0] - r) * rim.alpha,
          g + (lit[1] - g) * rim.alpha,
          b + (lit[2] - b) * rim.alpha
        )
      );
    }
  return [...new Set(out)];
}
