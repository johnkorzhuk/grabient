import { expect, test } from "vitest";
import { glassDiscAt, glassField } from "./glass.ts";
import { GLASS_MODEL } from "./glass-page.ts";
import { glassCover, glassPlan } from "./glass-render.ts";

/* the pages' JavaScript, run as a page runs it */
const model = new Function(`${GLASS_MODEL}\nreturn { cover, plan, field, discAt, hexRgb };`)() as {
  cover: (
    w: number,
    h: number,
    angle: number,
    shape: number | null
  ) => ReturnType<typeof glassCover>;
  plan: typeof glassPlan;
  field: typeof glassField;
  discAt: typeof glassDiscAt;
  hexRgb: (hex: string) => number[];
};

const COLORS = ["#0b0a3c", "#5b2a86", "#b8336a", "#f08a4b", "#f6d743", "#fdf6e3"];
const SIZES: [number, number][] = [
  [1, 1],
  [20, 20],
  [83, 61],
  [333, 777],
  [390, 844],
  [500, 500],
  [800, 400],
  [1366, 768],
  [1920, 1080],
  [2560, 1440],
  [3840, 2160]
];

test("the pages work out the player's layout, field and blur to the last bit", () => {
  for (const [w, h] of SIZES)
    for (const angle of [0, 45, 90, 137, 300, 360])
      for (const shape of [null, 0, 7, 500, 999]) {
        const site = glassCover({ width: w, height: h }, 1, angle, shape);
        const page = model.cover(w, h, angle, shape);
        expect(page, `${w}x${h} ${angle} ${shape}`).toEqual(site);
        expect(model.plan(page.geometry)).toEqual(glassPlan(site.geometry));
        expect(model.field(page.geometry, COLORS)).toEqual(glassField(site.geometry, COLORS));
      }
});

test("the pages place each disc where the player does, at any time", () => {
  const { geometry } = glassCover({ width: 1920, height: 1080 }, 1, 137, 999);
  const field = glassField(geometry, COLORS);
  const site = new Float32Array(2);
  const page = new Float32Array(2);
  for (const t of [0, 0.016666666666666666, 0.4, 1.6, 7.3, 28, 55.983333, 56.25, 3600.5])
    for (const d of field.discs) {
      glassDiscAt(geometry, d, t, site, 0);
      model.discAt(geometry, d, t, page, 0);
      expect(Array.from(page)).toEqual(Array.from(site));
    }
});

test("the pages read a color as the player does", () => {
  expect(model.hexRgb("#ff8000")).toEqual([1, 128 / 255, 0]);
});
