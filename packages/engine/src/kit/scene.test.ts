import { expect, test } from "vitest";
import { decodePalette } from "../codec.ts";
import { EFFECT_KINDS, EFFECTS } from "../effect.ts";
import type { Palette } from "../palette.ts";
import demo from "./fields/demo.ts";
import { KIT_STEPS } from "./gen/kind-steps.ts";
import { isKitKind, KIT_KINDS } from "./kinds.ts";
import { kitEffect } from "./registry.ts";
import { kitPlace, kitScene, kitSheetColor, kitSteps } from "./scene.ts";
import { kitShadowSteps } from "./shade.ts";
import type { FieldEffect, SheetsRecipe } from "./types.ts";

const P = decodePalette("kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ") as Palette;
const BOX = { width: 320, height: 180 };
const sheets = demo.sheets as SheetsRecipe;
/* the demo's levels spaced by the view's steps, its stack running on, with lines and a soft shadow */
const spaced: FieldEffect = {
  ...demo,
  sheets: {
    ...sheets,
    count: null,
    colors: { hop: 0.05, offset: 0.2, wrap: "mirror" },
    shadow: { ...sheets.shadow!, steps: 3, spread: 0.5 }
  },
  lines: {
    base: 0.06,
    step: 0.12,
    half: 0.004,
    colors: { hop: 0.1, offset: 0, wrap: "cycle" },
    alpha: 0.5
  },
  steps: { least: 8, most: 40, designed: 20 }
};
const scene = (def: FieldEffect, steps?: number | null) =>
  kitScene(def, P, { angle: 90, shape: null, steps }, BOX);

test("a scene's levels at the designed steps are the recipe's own numbers, to the last bit", () => {
  for (const steps of [undefined, null, 20, 20.4]) {
    const m = scene(spaced, steps);
    expect(m.steps).toBe(20);
    expect(m.sheetStep).toBe(spaced.sheets!.step);
    expect(m.sheetHop).toBe(spaced.sheets!.colors.hop);
    expect(m.lineStep).toBe(spaced.lines!.step);
    expect(m.lineHop).toBe(0.1);
    expect(kitShadowSteps(m)).toEqual(kitShadowSteps({ def: spaced }));
  }
});

test("at n steps the levels come n / designed times as close, each one's color designed / n times as far, so the sweep stays", () => {
  const designed = scene(spaced);
  for (const [asked, n] of [
    [8, 8],
    [40, 40],
    [13, 13],
    [3, 8],
    [400, 40],
    [12.6, 13]
  ] as const) {
    const m = scene(spaced, asked);
    expect(m.steps, `${asked}`).toBe(n);
    expect(m.sheetStep).toBe(spaced.sheets!.step * (20 / n));
    expect(m.sheetHop).toBe(0.05 * (20 / n));
    expect(m.lineStep).toBe(0.12 * (20 / n));
    expect(m.lineHop).toBe(0.1 * (20 / n));
    /* a soft shadow's spread a share of the sheets' step as they lie */
    expect(kitShadowSteps(m).rise).toBeCloseTo(kitShadowSteps(designed).rise * (20 / n), 15);
    /* the palette's place a stretch of the field reaches is the same: the levels over it times each one's hop */
    const reach = (s: typeof m) => kitPlace(spaced.sheets!.colors, 1 / s.sheetStep, s.sheetHop);
    expect(reach(m)).toBeCloseTo(reach(designed), 12);
    /* each its own name, which keeps its traces apart */
    expect(m.view).toBe(`demo|90|0|${n}`);
  }
  /* the fewest steps draw the widest bands, the most the narrowest */
  expect(scene(spaced, 8).sheetStep).toBeGreaterThan(designed.sheetStep);
  expect(scene(spaced, 40).sheetStep).toBeLessThan(designed.sheetStep);
});

test("an effect that takes no steps draws its recipe whatever steps a view names, under the name it had", () => {
  for (const steps of [undefined, null, 4, 40]) {
    const m = scene(demo, steps);
    expect(m.steps).toBeNull();
    expect(m.sheetStep).toBe(sheets.step);
    expect(m.sheetHop).toBe(sheets.colors.hop);
    expect(m.lineStep).toBe(demo.lines!.step);
    expect(m.view).toBe("demo|90|0");
    expect(kitSteps(demo, steps)).toBeNull();
  }
  const out = new Float64Array(3);
  const back = new Float64Array(3);
  kitSheetColor(scene(demo, 30), 5, out);
  kitSheetColor(scene(demo), 5, back);
  expect(out).toEqual(back);
});

test("the sandstone takes 8 to 40 steps, 28 as designed, and the others none, as every page's start knows without a definition", () => {
  expect(kitEffect("strata").steps).toEqual({ least: 8, most: 40, designed: 28 });
  for (const kind of KIT_KINDS) {
    expect(KIT_STEPS[kind], kind).toEqual(kitEffect(kind).steps ?? null);
    expect(EFFECT_KINDS[kind].steps, kind).toEqual(KIT_STEPS[kind]);
  }
  /* the effects drawn by code of their own take none */
  for (const kind of EFFECTS) if (!isKitKind(kind)) expect(EFFECT_KINDS[kind].steps).toBeNull();
  const m = kitScene(kitEffect("strata"), P, { angle: 90, shape: null }, BOX);
  expect(m.steps).toBe(28);
  expect(m.sheetStep).toBe(kitEffect("strata").sheets!.step);
});
