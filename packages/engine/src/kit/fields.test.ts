/* What every field effect's kernel owes every format (types.ts FieldKernel): a finite number wherever a box can show it,
   at any shape an address names and any time of its loop. The tracer copes with a field that is not (trace.ts), but the
   CPU's pixel would be NaN, black, and a GPU's anything; so a kernel guards its 1/r, log r and square roots, and this
   holds each to it. And the shading ends wherever the field lies, so a slip draws a wrong pixel, never a hung Worker. */
import { describe, expect, it } from "vitest";
import { kitFinite } from "../../test/kit-checks.ts";
import { decodePalette } from "../codec.ts";
import demo from "./fields/demo.ts";
import { KIT_KINDS } from "./kinds.ts";
import { kitEffect } from "./registry.ts";
import { kitScene } from "./scene.ts";
import { kitScratch, kitShade } from "./shade.ts";
import type { FieldEffect } from "./types.ts";

const palette = decodePalette("kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ");
if (!palette) throw new Error("no palette");
const EFFECTS: FieldEffect[] = [demo, ...KIT_KINDS.map(kitEffect)];

/* the points, shapes and times are kit-checks.ts's, which kit-check.ts holds a candidate to alike */
describe.each(EFFECTS.map(def => [def.kind, def] as const))("the %s's kernel", (_, def) => {
  it("is finite wherever a box shows it, at every shape and time", () => {
    expect(kitFinite(def, palette).first).toEqual([]);
  });
});

describe("the shading", () => {
  it("ends and draws a color wherever the field lies, however far or infinite", () => {
    const m = kitScene(demo, palette, { angle: 90, shape: null }, { width: 64, height: 64 });
    const c = kitScratch();
    const out = kitScratch();
    for (const f of [Infinity, -Infinity, 2 ** 60, -(2 ** 60), 0.3]) {
      kitShade(m, f, 0.01, f, f, c, out);
      expect(out.every(v => v >= 0 && v <= 1)).toBe(true);
    }
    kitShade(m, Number.NaN, 0.01, Number.NaN, Number.NaN, c, out);
  });
});
