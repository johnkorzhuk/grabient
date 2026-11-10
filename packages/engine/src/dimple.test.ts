import { describe, expect, it } from "vitest";
import { decodePalette } from "./codec.ts";
import { srgbToLch } from "./color.ts";
import {
  DIMPLE_ACROSS,
  DIMPLE_REACH_ZOOM,
  DIMPLE_STOPS,
  type DimpleAt,
  type DimpleScene,
  dimpleGround,
  dimpleHollow,
  dimpleRank,
  dimpleScene,
  dimpleShade,
  dimpleStops
} from "./dimple.ts";
import { renderDimple } from "./dimple-render.ts";
import { dimpleFileSvg, dimpleFrameSvg, dimpleStillSvg } from "./dimple-svg.ts";
import { fxStillBackground } from "./fx-still.ts";
import type { Palette } from "./palette.ts";

const SEEDS = ["kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ", "kGV8QJWoI08eJKkh64nEHz0Og", "kQTIPV6CvNg"];
const P = decodePalette(SEEDS[0]) as Palette;
const scene = (zoom: number | null = null, angle = 90, width = 320, height = 180) =>
  dimpleScene(P, { angle, zoom }, { width, height });
/* where each lattice place stands in the stack, the bottom disc 0 */
const stackOf = (m: DimpleScene): Map<string, number> =>
  new Map(
    Array.from({ length: m.places.length / 2 }, (_, n) => [
      `${m.places[n * 2]},${m.places[n * 2 + 1]}`,
      n
    ])
  );

describe("the dimple's design", () => {
  it("is as designed at zoom 1 and none, the hollow in the box's middle", () => {
    const m = scene();
    expect(m.p).toBe(320 / DIMPLE_ACROSS);
    expect(scene(1)).toEqual(m);
    expect([m.ox, m.oy]).toEqual([160, 90]);
    expect(dimpleHollow(m)).toEqual([160, 90]);
    expect(dimpleHollow(m, [3, 4])).toEqual([3, 4]);
  });

  it("draws its discs and its hollow larger as it zooms, the palette's reach with them to a 16:9 box's corner", () => {
    /* John, 10 Nov 2026, of its shapes 0 to 999: "theres barely any difference", then "lets repalce shape with a
       zoom option for this style" */
    const one = scene();
    let discs = one.places.length;
    for (const zoom of [1.25, 1.5, 2, 3, 4]) {
      const m = scene(zoom);
      expect(m.p, `zoom ${zoom}`).toBeCloseTo(one.p * zoom, 9);
      expect(m.r, `zoom ${zoom}`).toBeCloseTo(one.r * zoom, 9);
      expect(m.pinchOver, `zoom ${zoom}`).toBeCloseTo(one.pinchOver * zoom, 9);
      expect(m.heart, `zoom ${zoom}`).toBeCloseTo(one.heart * zoom, 9);
      expect(m.reach, `zoom ${zoom}`).toBeCloseTo(one.reach * Math.min(zoom, DIMPLE_REACH_ZOOM), 9);
      expect([m.ox, m.oy]).toEqual([160, 90]);
      /* fewer discs the larger: never more than the designed look's, whose still is as heavy as a card's may be */
      expect(m.places.length, `zoom ${zoom}`).toBeLessThan(discs);
      discs = m.places.length;
    }
    /* the whole palette in a 16:9 box at any zoom: its far end comes within the box's half-diagonal */
    const corner = Math.hypot(160, 90);
    expect(scene(4).reach).toBeLessThanOrEqual(corner);
    expect(scene(DIMPLE_REACH_ZOOM).reach).toBeGreaterThan(corner * 0.98);
  });

  it("lays the palette with its darker end in the hollow", () => {
    for (const seed of SEEDS) {
      const stops = dimpleStops(decodePalette(seed) as Palette);
      expect(stops).toHaveLength(DIMPLE_STOPS * 3);
      const first = srgbToLch(stops.slice(0, 3))[0];
      const last = srgbToLch(stops.slice(-3))[0];
      expect(first, seed).toBeLessThanOrEqual(last);
      /* each channel a byte's */
      for (const v of stops) expect(Math.abs(v * 255 - Math.round(v * 255))).toBeLessThan(1e-9);
    }
  });

  it("frames one design by the box's longer side, centered: a wide box shows a square's middle rows", () => {
    for (const zoom of [null, 2.5]) {
      const square = renderDimple(scene(zoom, 210, 200, 200));
      const wide = renderDimple(scene(zoom, 210, 200, 114));
      let unlike = 0;
      let apart = 0;
      for (let y = 0; y < 114; y++)
        for (let x = 0; x < 200; x++)
          for (let q = 0; q < 3; q++) {
            const e = Math.abs(wide[(y * 200 + x) * 4 + q] - square[((y + 43) * 200 + x) * 4 + q]);
            if (e) unlike++;
            apart = Math.max(apart, e);
          }
      /* the same arithmetic 43 rows down: a channel rounds the other way at most here and there */
      expect(apart, `zoom ${zoom}`).toBeLessThanOrEqual(1);
      expect(unlike, `zoom ${zoom}`).toBeLessThan(200 * 114 * 3 * 0.001);
    }
  });
});

describe("the dimple's stack", () => {
  it("has one disc at the heart, on the hollow's rest, over all six about it", () => {
    for (const [zoom, angle] of [
      [null, 90],
      [2.5, 210],
      [1.7, 0],
      [4, 137]
    ] as const) {
      const m = scene(zoom, angle, 640, 360);
      const stack = stackOf(m);
      const top = m.places.length / 2 - 1;
      /* lattice place (0, 0) lies on the rest and is the last painted */
      expect(stack.get("0,0"), `zoom ${zoom}`).toBe(top);
      expect(dimpleRank(m, 0, 0)).toBe(0);
      const ring = [
        [0, -1],
        [1, -1],
        [1, 0],
        [0, 1],
        [-1, 1],
        [-1, 0]
      ];
      for (const [i, j] of ring) {
        expect(dimpleRank(m, i, j)).toBeGreaterThan(0);
        expect(stack.get(`${i},${j}`)).toBeLessThan(top);
      }
      /* the six are as far from the rest as each other: among them the one on the lit wall lies over the next, so
         no two that overlap tie, and every form reads one order */
      const ranks = ring.map(([i, j]) => dimpleRank(m, i, j));
      for (let n = 0; n < 6; n++)
        expect(Math.abs(ranks[n] - ranks[(n + 1) % 6]) / ranks[n]).toBeGreaterThan(0.005);
    }
  });

  it("lies as designed with the lower of two discs as far from the rest over the upper", () => {
    const m = scene(null, 90, 640, 360);
    const stack = stackOf(m);
    const at = (i: number, j: number) => stack.get(`${i},${j}`) as number;
    /* bottom over lower sides over upper sides over top */
    expect(at(0, 1)).toBeGreaterThan(at(1, 0));
    expect(at(0, 1)).toBeGreaterThan(at(-1, 1));
    expect(at(1, 0)).toBeGreaterThan(at(1, -1));
    expect(at(-1, 1)).toBeGreaterThan(at(-1, 0));
    expect(at(1, -1)).toBeGreaterThan(at(0, -1));
    expect(at(-1, 0)).toBeGreaterThan(at(0, -1));
  });

  it("holds every disc it could show wherever the hollow is, each once", () => {
    const m = scene(2.5, 210, 320, 180);
    const stack = stackOf(m);
    expect(stack.size).toBe(m.places.length / 2);
    /* the ranks fall from the bottom of the stack to its top */
    let last = Infinity;
    for (let n = 0; n < m.places.length; n += 2) {
      const rank = dimpleRank(m, m.places[n], m.places[n + 1]);
      expect(rank).toBeLessThanOrEqual(last);
      last = rank;
    }
  });
});

describe("the dimple's drawing", () => {
  const PLACES: DimpleAt[] = [null, [38.4, 36], [288, 118.8], [160.3, 89.8], [0, 90], [320, 180]];

  it("paints disc by disc the picture the shader's shading finds pixel by pixel", () => {
    for (const [zoom, angle] of [
      [null, 90],
      [2.5, 210],
      [1.7, 17]
    ] as const) {
      const m = scene(zoom, angle);
      for (const at of PLACES) {
        const px = renderDimple(m, at);
        const [cx, cy] = dimpleHollow(m, at);
        const ground = dimpleGround(m, cx, cy);
        const c = [0, 0, 0];
        let n = 0;
        for (let y = 0; y < 180; y += 3)
          for (let x = (y / 3) % 3; x < 320; x += 3) {
            dimpleShade(m, cx, cy, ground, x + 0.5, y + 0.5, c);
            for (let q = 0; q < 3; q++)
              expect(px[(y * 320 + x) * 4 + q], `zoom ${zoom} at ${at} pixel ${x},${y}`).toBe(
                Math.floor(Math.min(1, Math.max(0, c[q])) * 255 + 0.5)
              );
            n++;
          }
        expect(n).toBeGreaterThan(6000);
        /* opaque */
        for (let i = 3; i < px.length; i += 4000) expect(px[i]).toBe(255);
      }
    }
  });

  it("moves no pixel by more than a sliding edge's worth as the hollow moves a fifth of a pixel", () => {
    /* John, 10 Nov 2026: "the z index of the area around the hovered cells changing doesnt look good". Ordered by
       the hollow, a disc changing places with its neighbour changed a whole overlap by up to 69 levels in one such
       step, and at 64 places along the palette a whole disc stepped by up to 29 */
    for (const [seed, zoom] of [
      [SEEDS[1], null],
      [SEEDS[0], 2.5]
    ] as const) {
      const m = dimpleScene(
        decodePalette(seed) as Palette,
        { angle: 90, zoom },
        { width: 480, height: 270 }
      );
      let before = renderDimple(m, [190, 108]);
      let most = 0;
      for (let n = 1; n <= 150; n++) {
        const now = renderDimple(m, [190 + n * 0.19, 108 + n * 0.06]);
        for (let i = 0; i < now.length; i++) {
          const e = Math.abs(now[i] - before[i]);
          if (e > most) most = e;
        }
        before = now;
      }
      expect(most, `${seed} zoom ${zoom}`).toBeLessThanOrEqual(9);
    }
  }, 60_000);

  it("is the same picture wherever a pointer has been, once the hollow is back at its rest", () => {
    const m = scene(2.5, 210);
    const still = renderDimple(m);
    renderDimple(m, [12, 150]);
    expect(Buffer.compare(Buffer.from(renderDimple(m)), Buffer.from(still))).toBe(0);
    expect(Buffer.compare(Buffer.from(renderDimple(m, [m.ox, m.oy])), Buffer.from(still))).toBe(0);
  });
});

describe("the dimple's SVG", () => {
  const view = { angle: 90, zoom: null };
  const size = { width: 640, height: 360 };

  it("is plain shapes: two gradients, a circle a disc, no filter, script or animation", () => {
    const svg = dimpleStillSvg(P, view, size);
    expect(svg).toMatch(
      /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="640" height="360" viewBox="0 0 640 360">/
    );
    expect(svg.match(/<(linear|radial)Gradient\b/g)).toHaveLength(2);
    expect(svg).not.toMatch(
      /<filter|<script|<animate|@keyframes|<foreignObject|<image|<mask|<clipPath/
    );
    const discs = (svg.match(/<(circle|ellipse|use)\b/g) ?? []).length - 1;
    expect(discs).toBeGreaterThan(200);
    /* the discs past the palette's reach stand at one place along the gradient and share one circle */
    expect((svg.match(/<use href="#f"/g) ?? []).length).toBeGreaterThan(discs * 0.25);
  });

  it("is its still as a file, and the same writer's picture with the hollow anywhere", () => {
    expect(dimpleFileSvg(P, view, size)).toBe(dimpleStillSvg(P, view, size));
    expect(dimpleFrameSvg(P, view, size)).toBe(dimpleStillSvg(P, view, size));
    expect(dimpleFrameSvg(P, view, size, [100, 80])).not.toBe(dimpleStillSvg(P, view, size));
    /* the disc at the heart, with less than its run, is an ellipse widened back to a circle */
    expect(dimpleStillSvg(P, view, size)).toMatch(
      /<ellipse cx="[^"]+" rx="[^"]+" ry="[^"]+" transform="rotate\([^)]+\)translate\([^)]+\)scale\(256 1\)translate\([^)]+\)"\/>/
    );
  });

  it("stills light enough for a list's cards at every zoom and angle", () => {
    /* 34.5 KiB as designed, the heaviest: no zoom draws more discs across the box (dimple.ts DIMPLE_ACROSS) */
    let most = 0;
    for (let zoom = 1; zoom <= 4; zoom += 0.25)
      for (const angle of [90, 14, 210]) {
        const bytes = fxStillBackground("dimple", P, {
          angle,
          shape: null,
          steps: null,
          zoom: zoom === 1 ? null : zoom,
          bg: null
        }).length;
        most = Math.max(most, bytes);
      }
    expect(most).toBeLessThan(36 * 1024);
  });
});
