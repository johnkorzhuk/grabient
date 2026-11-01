import { decodePalette } from "@grabient/engine";
import type { Effect } from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import type { Style } from "@grabient/engine/view.ts";
import { describe, expect, test } from "vitest";
import {
  colorsOfParts,
  colorsUnder,
  contrastLevel,
  drawnColors,
  groundOn,
  inkOn,
  mirrored,
  type Shown,
  THEME_GROUND,
  themeOn,
  twoPlaces,
  worstContrast
} from "./paint.ts";

/* black to white along the curve: its stops are grays from #000000 to #ffffff */
const GRAYS: Palette = {
  anchors: [
    { l: 0, c: 0, h: 0 },
    { l: 1, c: 0, h: 0 }
  ]
};
const shown = (style: Style, angle = 90, steps = 5, effect: Effect | null = null): Shown => ({
  seed: "kTest",
  palette: GRAYS,
  view: { style, steps, angle },
  effect
});
const light = (hex: string) => parseInt(hex.slice(1, 3), 16);
const blob = (bg: string | null): Effect => ({
  kind: "blob",
  speed: 1,
  fps: 60,
  look: { shape: 1, frost: 1, bg }
});

describe("drawnColors", () => {
  test("a gradient's stops at the view's steps, the glass's six, the blob's nine", () => {
    expect(drawnColors(shown("linearGradient", 90, 5))).toEqual([
      "#000000",
      expect.any(String),
      expect.any(String),
      expect.any(String),
      "#ffffff"
    ]);
    expect(
      drawnColors(shown("linearGradient", 90, 5, { ...blob(null), kind: "glass" }))
    ).toHaveLength(6);
    expect(drawnColors(shown("linearGradient", 90, 5, blob(null)))).toHaveLength(9);
  });
});

describe("colorsUnder", () => {
  test("a linear gradient at 90° shows its start on the left and its end on the right", () => {
    const left = colorsUnder(shown("linearGradient"), { x0: 0, y0: 0, x1: 0.2, y1: 1 }, 1.6);
    const right = colorsUnder(shown("linearGradient"), { x0: 0.8, y0: 0, x1: 1, y1: 1 }, 1.6);
    expect(Math.max(...left.map(light))).toBeLessThan(80);
    expect(Math.min(...right.map(light))).toBeGreaterThan(175);
  });
  test("at 0° the line runs from the foot to the top", () => {
    const top = colorsUnder(shown("linearGradient", 0), { x0: 0, y0: 0, x1: 1, y1: 0.05 }, 1.6);
    expect(Math.min(...top.map(light))).toBeGreaterThan(230);
  });
  test("a band is one color across its width", () => {
    const first = colorsUnder(shown("linearSwatches"), { x0: 0.02, y0: 0, x1: 0.18, y1: 1 }, 1);
    expect(first).toEqual(["#000000"]);
  });
  test("a radial gradient starts at the center and ends at the corners", () => {
    const center = colorsUnder(
      shown("radialGradient"),
      { x0: 0.49, y0: 0.49, x1: 0.51, y1: 0.51 },
      1
    );
    const corner = colorsUnder(shown("radialGradient"), { x0: 0.97, y0: 0.97, x1: 1, y1: 1 }, 1);
    expect(Math.max(...center.map(light))).toBeLessThan(10);
    expect(Math.min(...corner.map(light))).toBeGreaterThan(230);
  });
  test("a conic gradient turns from its angle: the part just after it starts dark, a part around the center has all", () => {
    const after = colorsUnder(
      shown("angularGradient", 0),
      { x0: 0.52, y0: 0, x1: 0.6, y1: 0.1 },
      1
    );
    expect(Math.max(...after.map(light))).toBeLessThan(60);
    const around = colorsUnder(
      shown("angularGradient", 0),
      { x0: 0.2, y0: 0.2, x1: 0.8, y1: 0.8 },
      1
    );
    expect(Math.max(...around.map(light)) - Math.min(...around.map(light))).toBeGreaterThan(200);
  });
  test("a blob shows all its colors over its ground, both themes' grounds where it has none", () => {
    const bare = colorsUnder(
      shown("linearGradient", 90, 5, blob(null)),
      { x0: 0, y0: 0, x1: 0.1, y1: 0.1 },
      1
    );
    expect(bare).toEqual(expect.arrayContaining([THEME_GROUND.dark, THEME_GROUND.light]));
    const grounded = colorsUnder(
      shown("linearGradient", 90, 5, blob("#123456")),
      { x0: 0, y0: 0, x1: 0.1, y1: 0.1 },
      1
    );
    expect(grounded).toContain("#123456");
    expect(grounded).not.toContain(THEME_GROUND.light);
  });
  test("a part mirrored for a right-to-left page stands as far from the other side", () => {
    expect(mirrored({ x0: 0, y0: 0.1, x1: 0.3, y1: 0.2 })).toEqual({
      x0: 0.7,
      y0: 0.1,
      x1: 1,
      y1: 0.2
    });
  });
});

describe("inks", () => {
  test("white on dark colors, black on light ones, with the least contrast", () => {
    expect(inkOn(["#000000", "#202020"])).toEqual({
      ink: "#ffffff",
      ratio: worstContrast("#ffffff", ["#202020"])
    });
    expect(inkOn(["#ffffff"])).toEqual({ ink: "#000000", ratio: 21 });
  });
  test("a theme reads where its ink reaches the contrast asked, and neither reads across black and white", () => {
    expect(themeOn(["#0c0c0e", "#202020"])).toBe("dark");
    expect(themeOn(["#ffffff", "#e0e0e0"])).toBe("light");
    expect(themeOn(["#000000", "#ffffff"], 3)).toBeNull();
  });
  test("the ground for a blob's clear parts is the palette's color that stands out most from the page", () => {
    const colors = drawnColors(shown("linearGradient", 90, 5));
    expect(groundOn(THEME_GROUND.dark, colors)).toBe("#ffffff");
    expect(groundOn(THEME_GROUND.light, colors)).toBe("#000000");
  });
  test("a contrast as the page writes it, never rounded up, and the level it reaches", () => {
    expect(twoPlaces(4.496)).toBe(4.49);
    expect(contrastLevel(4.49)).toBe("AA Large");
    expect(contrastLevel(4.5)).toBe("AA");
    expect(contrastLevel(7)).toBe("AAA");
    expect(contrastLevel(2.99)).toBeNull();
  });
  test("a real palette: black, brown, blue and gray reads white on its start", () => {
    const P = decodePalette("kWPgBjqiK5UIirpZorp5IA6Y") as Palette;
    const s: Shown = {
      seed: "kWPgBjqiK5UIirpZorp5IA6Y",
      palette: P,
      view: { style: "linearGradient", steps: 7, angle: 90 },
      effect: null
    };
    expect(inkOn(colorsUnder(s, { x0: 0, y0: 0, x1: 0.15, y1: 1 }, 1.6)).ink).toBe("#ffffff");
  });
});

describe("colorsOfParts", () => {
  const RISE = shown("linearGradient", 90, 5);
  test("a gradient's part holds the colors at the ends of its stretch and each stop between", () => {
    const stops = drawnColors(RISE);
    const part = colorsOfParts(RISE, 2)({ x0: 0.2, y0: 0, x1: 0.6, y1: 1 });
    expect(part).toHaveLength(4);
    expect(part.slice(1, 3)).toEqual([stops[1], stops[2]]);
    expect(light(part[0])).toBeLessThan(light(stops[1]));
    expect(light(part[3])).toBeGreaterThan(light(stops[2]));
  });
  test("a stop between the points colorsUnder reads is held all the same", () => {
    const s = shown("linearGradient", 0, 3);
    const middle = drawnColors(s)[1];
    expect(colorsOfParts(s, 2)({ x0: 0, y0: 0.4, x1: 1, y1: 0.6 })).toContain(middle);
  });
  test("bands give each band the part crosses", () => {
    const s = shown("linearSwatches", 90, 5);
    expect(colorsOfParts(s, 1)({ x0: 0.1, y0: 0, x1: 0.5, y1: 1 })).toEqual(
      drawnColors(s).slice(0, 3)
    );
  });
  test("a circle's part runs from its point nearest the center, the center's own color where it holds it", () => {
    const s = shown("radialGradient", 90, 5);
    const [first] = drawnColors(s);
    expect(colorsOfParts(s, 1)({ x0: 0.3, y0: 0.3, x1: 0.7, y1: 0.7 })[0]).toBe(first);
    expect(colorsOfParts(s, 1)({ x0: 0.9, y0: 0.9, x1: 1, y1: 1 })).not.toContain(first);
  });
  test("a cone's part across the turn's start holds both ends of the line, and one holding the center the whole of it", () => {
    const s = shown("angularGradient", 0, 5);
    const stops = drawnColors(s);
    const across = colorsOfParts(s, 1)({ x0: 0.4, y0: 0, x1: 0.6, y1: 0.2 });
    expect(across).toContain(stops[0]);
    expect(across).toContain(stops[4]);
    expect(colorsOfParts(s, 1)({ x0: 0.45, y0: 0.45, x1: 0.55, y1: 0.55 })).toEqual(stops);
  });
  test("every point of a part shows a blend of the part's colors: no channel lighter than their most, nor darker than their least", () => {
    const styles: Style[] = [
      "linearGradient",
      "linearSwatches",
      "angularGradient",
      "angularSwatches",
      "radialGradient",
      "radialSwatches"
    ];
    const bytes = (hex: string) => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16));
    let seed = 3;
    const next = () => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return seed / 2 ** 32;
    };
    for (let i = 0; i < 200; i++) {
      const s = shown(
        styles[i % styles.length],
        Math.floor(next() * 360),
        2 + Math.floor(next() * 9)
      );
      const [x, y] = [next(), next()];
      const part = {
        x0: x * 0.8,
        y0: y * 0.8,
        x1: x * 0.8 + next() * 0.2,
        y1: y * 0.8 + next() * 0.2
      };
      const colorsOf = colorsOfParts(s, 0.5 + next() * 2);
      const within = colorsOf(part).map(bytes);
      /* a point is a part of no size: the one color there */
      for (let a = 0; a <= 12; a++)
        for (let b = 0; b <= 12; b++) {
          const px = part.x0 + ((part.x1 - part.x0) * a) / 12;
          const py = part.y0 + ((part.y1 - part.y0) * b) / 12;
          const [c] = colorsOf({ x0: px, y0: py, x1: px, y1: py }).map(bytes);
          for (let k = 0; k < 3; k++) {
            expect(c[k]).toBeGreaterThanOrEqual(Math.min(...within.map(w => w[k])) - 1);
            expect(c[k]).toBeLessThanOrEqual(Math.max(...within.map(w => w[k])) + 1);
          }
        }
    }
  });
});
