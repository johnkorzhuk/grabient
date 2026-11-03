import { decodePalette } from "@grabient/engine";
import { toHex } from "@grabient/engine/color.ts";
import { contrast, luminance } from "@grabient/engine/contrast.ts";
import type { Effect } from "@grabient/engine/effect.ts";
import { effectColors } from "@grabient/engine/effect-code.ts";
import { effectRgba } from "@grabient/engine/fx-frame.ts";
import { glassGeometry } from "@grabient/engine/glass.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { PAPERCUT_LOOP, papercutScene } from "@grabient/engine/papercut.ts";
import { renderPapercut } from "@grabient/engine/papercut-render.ts";
import { rosetteColors, rosetteDesign, rosetteScene } from "@grabient/engine/rosette.ts";
import { renderRosette } from "@grabient/engine/rosette-render.ts";
import { bakeDye, SILK_DESIGN, SILK_LOOP, silkDesign, silkScene } from "@grabient/engine/silk.ts";
import { renderSilk } from "@grabient/engine/silk-render.ts";
import { softSigma } from "@grabient/engine/soft.ts";
import type { Style } from "@grabient/engine/view.ts";
import { describe, expect, test } from "vitest";
import {
  colorsOfParts,
  colorsUnder,
  contrastLevel,
  drawnColors,
  groundOn,
  inkOn,
  lineSigma,
  mirrored,
  PAPERCUT_SHEETS,
  type Shown,
  shownColors,
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

/* real palettes, light and dark, quiet and vivid */
const SEEDS = [
  "kWPgBjqiK5UIirpZorp5IA6Y",
  "kWTATrcQ7MeMxv1MwbbLKq84",
  "kWnCIwwC47igfOklkTlShq44",
  "kWede9SdS_WExOrXTdG1szDY",
  "kUzkiw66E-e4YQltnUXg",
  "kUMzO5Na871ukuyhHUJA"
];
const real = (seed: string): Palette => {
  const P = decodePalette(seed);
  if (!P) throw new Error(`no palette ${seed}`);
  return P;
};
const fx = (
  kind: "silk" | "rosette" | "papercut",
  seed: string,
  angle: number,
  shape: number | null
): Shown => ({
  seed,
  palette: real(seed),
  view: { style: "linearGradient", steps: 7, angle },
  effect: { kind, speed: 1, fps: 60, look: { shape, frost: 1, bg: null } }
});
const rgbOf = (hex: string) => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16));

describe("the silk, the rosette and the papercut", () => {
  test("are drawn from their palette at six places, and the papercut from its twelve sheets, as the editor lists them", () => {
    const P = real(SEEDS[0]);
    for (const kind of ["silk", "rosette", "papercut"] as const)
      expect(drawnColors(fx(kind, SEEDS[0], 90, null))).toEqual(
        effectColors(P, fx(kind, SEEDS[0], 90, null).effect as Effect)
      );
  });

  test("the silk's colors are its dye's, dyed, lit and shaded, as the engine bakes them, whatever its shape", () => {
    for (const seed of SEEDS) {
      const dye = bakeDye(real(seed), SILK_DESIGN);
      const all = new Set([...dye.base, ...dye.lift, ...dye.shade]);
      expect(new Set(shownColors(fx("silk", seed, 90, null)))).toEqual(all);
      /* a shape moves the folds and turns the dye's line, never its colors */
      for (const shape of [1, 7, 500]) expect(bakeDye(real(seed), silkDesign(shape))).toEqual(dye);
    }
    for (let shape = 1; shape <= 999; shape++) {
      const { tilt } = silkDesign(shape);
      expect(tilt).toBeGreaterThanOrEqual(-32);
      expect(tilt).toBeLessThanOrEqual(-16);
    }
    expect(SILK_DESIGN.tilt).toBe(-24);
  });

  test("the papercut's colors are its sheets' faces, lit cuts and shadows, as the engine makes them", () => {
    for (const seed of SEEDS) {
      const m = papercutScene(real(seed), { angle: 90, shape: null }, { width: 16, height: 9 });
      expect(m.n).toBe(PAPERCUT_SHEETS);
      expect(new Set(shownColors(fx("papercut", seed, 90, null)))).toEqual(
        new Set([...m.hex, ...m.wallHex, ...m.shadowHex])
      );
    }
  });

  test("the rosette's colors reach as light and as dark as the engine's petals, heart and ground, whatever its shape", () => {
    for (const seed of SEEDS) {
      const mine = shownColors(fx("rosette", seed, 90, null)).map(luminance);
      for (const shape of [null, 1, 2, 3, 7, 42, 500, 999]) {
        const c = rosetteColors(real(seed), rosetteDesign(shape));
        const theirs = [...c.grads.flat(), c.heart, c.ground].map(rgb => luminance(toHex(rgb)));
        expect(Math.max(...mine)).toBeGreaterThanOrEqual(Math.max(...theirs) - 0.002);
        expect(Math.min(...mine)).toBeLessThanOrEqual(Math.min(...theirs) + 0.002);
      }
    }
  });

  test("every pixel the engine draws over their loops is a blend of the colors the page reads under its part", () => {
    const size = (aspect: number) =>
      aspect >= 1
        ? { width: 48, height: Math.round(48 / aspect) }
        : { width: Math.round(48 * aspect), height: 48 };
    const frames = [0, 0.13, 0.37, 0.61, 0.89];
    /* the box in a grid of parts, and the whole of it */
    const parts = [
      { x0: 0, y0: 0, x1: 1, y1: 1 },
      ...Array.from({ length: 12 }, (_, i) => ({
        x0: (i % 4) / 4,
        y0: Math.floor(i / 4) / 3,
        x1: ((i % 4) + 1) / 4,
        y1: (Math.floor(i / 4) + 1) / 3
      }))
    ];
    for (const [i, seed] of SEEDS.slice(0, 3).entries())
      for (const kind of ["silk", "rosette", "papercut"] as const)
        for (const [shape, angle, aspect] of [
          [null, 90, 16 / 9],
          [7, 160, 0.6],
          [123, 45 + 30 * i, 1.4]
        ] as const) {
          const s = fx(kind, seed, angle, shape);
          const box = size(aspect);
          const view = { angle, shape };
          const draw =
            kind === "silk"
              ? (() => {
                  const scene = silkScene(s.palette, view, box);
                  return (f: number) => renderSilk(scene, f * SILK_LOOP);
                })()
              : kind === "rosette"
                ? (() => {
                    const scene = rosetteScene(s.palette, view, box);
                    return (f: number) => renderRosette(scene, f);
                  })()
                : (() => {
                    const scene = papercutScene(s.palette, view, box);
                    return (f: number) => renderPapercut(scene, f * PAPERCUT_LOOP);
                  })();
          const colorsOf = colorsOfParts(s, box.width / box.height);
          const bounds = parts.map(part => {
            const within = colorsOf(part).map(rgbOf);
            return [0, 1, 2].map(k => [
              Math.min(...within.map(c => c[k])) - 1,
              Math.max(...within.map(c => c[k])) + 1
            ]);
          });
          for (const f of frames) {
            const px = draw(f);
            for (let y = 0; y < box.height; y++)
              for (let x = 0; x < box.width; x++) {
                const [u, v] = [(x + 0.5) / box.width, (y + 0.5) / box.height];
                parts.forEach((part, p) => {
                  if (u < part.x0 || u > part.x1 || v < part.y0 || v > part.y1) return;
                  for (let k = 0; k < 3; k++) {
                    const c = px[4 * (y * box.width + x) + k];
                    const [lo, hi] = bounds[p][k];
                    if (c < lo || c > hi)
                      throw new Error(
                        `${kind} ${seed} shape ${shape} angle ${angle}: pixel ${x},${y} channel ${k} ${c} outside ${lo}..${hi} of part ${p} at ${f}`
                      );
                  }
                });
              }
          }
        }
  });
});

describe("the glass", () => {
  test("its ribs light its colors no darker and no lighter than the page reads them, whatever its angle and shape", () => {
    for (const shape of [null, 1, 7, 500, 999])
      for (const angle of [0, 45, 90, 160]) {
        const { shadeTable } = glassGeometry({ width: 1000, height: 1000 }, angle, shape);
        expect(2 * Math.min(...shadeTable)).toBeGreaterThanOrEqual(0.94);
        expect(2 * Math.max(...shadeTable)).toBeLessThanOrEqual(1.03);
      }
  });
  test("words the page reads on it read on the engine's own glass, wherever they stand", async () => {
    const box = { width: 320, height: 180 };
    const parts = Array.from({ length: 12 }, (_, i) => ({
      x0: (i % 4) / 4,
      y0: Math.floor(i / 4) / 3,
      x1: ((i % 4) + 1) / 4,
      y1: (Math.floor(i / 4) + 1) / 3
    }));
    for (const seed of SEEDS)
      for (const angle of [45, 90, 160]) {
        const P = real(seed);
        const effect: Effect = {
          kind: "glass",
          speed: 1,
          fps: 60,
          look: { shape: null, frost: 1, bg: null }
        };
        const s: Shown = {
          seed,
          palette: P,
          view: { style: "linearGradient", steps: 7, angle },
          effect
        };
        const px = await effectRgba(P, effect, angle, box, null);
        const colorsOf = colorsOfParts(s, box.width / box.height);
        for (const part of parts) {
          const read = inkOn(colorsOf(part));
          if (read.ratio < 4.5) continue;
          for (let y = Math.ceil(part.y0 * box.height); y < part.y1 * box.height; y++)
            for (let x = Math.ceil(part.x0 * box.width); x < part.x1 * box.width; x++) {
              const o = 4 * (y * box.width + x);
              const shown = toHex([px[o] / 255, px[o + 1] / 255, px[o + 2] / 255]);
              expect(contrast(read.ink, shown)).toBeGreaterThanOrEqual(4.5);
            }
        }
      }
  });
});

describe("a soft look", () => {
  test("blurs along its line as far as the engine's soft does", () => {
    const styles: Style[] = ["linearSwatches", "radialGradient", "angularSwatches"];
    for (const style of styles)
      for (const soft of [1, 20, 48, 72, 100])
        expect(lineSigma(style, soft)).toBeCloseTo(softSigma(style, soft), 12);
  });

  test("a soft band's part takes the bands its blur reaches, and a cone's wraps round the turn's start", () => {
    const middle = { x0: 0.45, y0: 0, x1: 0.55, y1: 1 };
    const bands = shown("linearSwatches", 90, 5);
    const stops = drawnColors(bands);
    expect(colorsOfParts(bands, 1)(middle)).toEqual([stops[2]]);
    expect(colorsOfParts({ ...bands, view: { ...bands.view, soft: 100 } }, 1)(middle)).toEqual(
      stops.slice(1, 4)
    );
    /* just after a cone's start: its last band too, once soft */
    const cone = shown("angularSwatches", 0, 6);
    const start = { x0: 0.52, y0: 0, x1: 0.56, y1: 0.1 };
    const last = drawnColors(cone)[5];
    expect(colorsOfParts(cone, 1)(start)).not.toContain(last);
    expect(colorsOfParts({ ...cone, view: { ...cone.view, soft: 72 } }, 1)(start)).toContain(last);
  });

  test("every pixel of the engine's first frames, plain and soft, is a blend of the colors the page reads under its part", async () => {
    const box = { width: 64, height: 36 };
    const parts = Array.from({ length: 12 }, (_, i) => ({
      x0: (i % 4) / 4,
      y0: Math.floor(i / 4) / 3,
      x1: ((i % 4) + 1) / 4,
      y1: (Math.floor(i / 4) + 1) / 3
    }));
    for (const seed of SEEDS.slice(0, 3))
      for (const kind of ["glass", "silk", "rosette", "papercut"] as const)
        for (const soft of [0, 32, 72]) {
          const s: Shown = {
            ...fx(kind === "glass" ? "silk" : kind, seed, 45, null),
            view: { style: "linearGradient", steps: 7, angle: 45, ...(soft ? { soft } : {}) }
          };
          const effect: Effect = {
            kind,
            speed: 1,
            fps: 60,
            look: { shape: null, frost: 1, bg: null }
          };
          const look = { ...s, effect };
          const px = await effectRgba(look.palette, effect, 45, box, soft || null);
          const colorsOf = colorsOfParts(look, box.width / box.height);
          for (const part of parts) {
            const within = colorsOf(part).map(rgbOf);
            const [lo, hi] = [0, 1].map(end =>
              [0, 1, 2].map(k => (end ? Math.max : Math.min)(...within.map(c => c[k])))
            );
            for (let y = 0; y < box.height; y++)
              for (let x = 0; x < box.width; x++) {
                const [u, v] = [(x + 0.5) / box.width, (y + 0.5) / box.height];
                if (u < part.x0 || u > part.x1 || v < part.y0 || v > part.y1) continue;
                for (let k = 0; k < 3; k++) {
                  const c = px[4 * (y * box.width + x) + k];
                  if (c < lo[k] - 2 || c > hi[k] + 2)
                    throw new Error(
                      `${kind} ${seed} soft ${soft}: pixel ${x},${y} channel ${k} ${c} outside ${lo[k]}..${hi[k]}`
                    );
                }
              }
          }
        }
  });
});
