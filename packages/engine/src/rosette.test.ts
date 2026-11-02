import { expect, test } from "vitest";
import { decodePalette } from "./codec.ts";
import { rosetteDesign, rosettePetals, rosetteScene } from "./rosette.ts";
import { ROSETTE_FS, ROSETTE_MAX_KEYS, rosetteGroup, rosetteUniforms } from "./rosette-gl.ts";
import { renderRosette, renderRosetteFloat, rosetteBytes } from "./rosette-render.ts";
import { rosetteMovingSvg, rosetteStillSvg } from "./rosette-svg.ts";

const P = decodePalette("kUMzO5Na871ukuyhHUJA")!;
const Q = decodePalette("kY4mpDazO-mUuu_fuLqXU49dvVP6")!;
const box = { width: 96, height: 64 };

test("a shape draws the same design every time, and shape 0 is the designed rings", () => {
  expect(rosetteDesign(7)).toEqual(rosetteDesign(7));
  expect(rosetteDesign(0)).toEqual(rosetteDesign(null));
  const designed = rosetteDesign(null);
  expect(designed.coloring).toBe("rings");
  expect(designed.flow).toBe(34);
  expect(designed.loop).toBe(120);
  /* the shapes pick the coloring, the period and the density among their few */
  const picked = new Set(Array.from({ length: 200 }, (_, i) => rosetteDesign(i + 1).coloring));
  expect(picked).toEqual(new Set(["rings", "angular"]));
  for (let shape = 1; shape <= 999; shape += 37) {
    const d = rosetteDesign(shape);
    expect([21, 34]).toContain(d.flow);
    expect(d.loop).toBeGreaterThan(0);
  }
});

test("a loop ends on its first frame, so the rings ripple out with no seam", () => {
  for (const shape of [null, 7, 512]) {
    /* a box big enough that no petal at the heart is smaller than float rounding */
    const sc = rosetteScene(P, { angle: 120, shape }, { width: 480, height: 320 });
    const petals = rosettePetals(sc, true);
    const a = renderRosetteFloat(sc, 0, petals);
    const b = renderRosetteFloat(sc, 1 - 1e-12, petals);
    let worst = 0;
    for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
    expect(worst * 255).toBeLessThan(1.01);
  }
});

test("the still is the frame the moving drawing starts on", () => {
  const sc = rosetteScene(Q, { angle: 90, shape: null }, box);
  const still = renderRosette(sc, 0, true);
  const moving = rosetteBytes(sc, renderRosetteFloat(sc, 0));
  let worst = 0;
  for (let i = 0; i < still.length; i++) worst = Math.max(worst, Math.abs(still[i] - moving[i]));
  expect(worst).toBeLessThanOrEqual(1);
});

test("the still SVG stays a cheap list card: plain shapes and gradients, no filters", () => {
  const svg = rosetteStillSvg(
    rosetteScene(P, { angle: 90, shape: null }, { width: 1920, height: 1080 })
  );
  expect(svg.length).toBeLessThan(30_000);
  const elements = svg.match(/<[a-zA-Z]/g)?.length ?? 0;
  expect(elements).toBeLessThan(260);
  expect(svg).not.toMatch(/<filter|<image|<foreignObject|url\(data/);
  /* the gradients are shared: one per ring the palette shows, and the heart's */
  const gradients = svg.match(/<radialGradient/g)?.length ?? 0;
  expect(gradients).toBeLessThanOrEqual(ROSETTE_MAX_KEYS + 1);
});

test("the moving SVG turns and grows one group, in the loop's own time", () => {
  const sc = rosetteScene(P, { angle: 90, shape: null }, { width: 800, height: 400 });
  const svg = rosetteMovingSvg(sc, 2);
  expect(svg).toContain(`animation:r ${sc.design.loop / 2}s linear infinite`);
  expect(svg).toContain("prefers-reduced-motion:reduce");
  expect(svg.match(/class="m"/g)).toHaveLength(1);
});

test("the shader's uniforms are all the pass reads, and in bounds", () => {
  const sc = rosetteScene(P, { angle: 30, shape: 999 }, { width: 640, height: 360 });
  const u = rosetteUniforms(sc);
  for (const name of Object.keys(u)) expect(ROSETTE_FS).toMatch(new RegExp(`\\b${name}\\b`));
  expect(ROSETTE_FS).toMatch(/\buGroup\b/);
  expect(u.uRange[0]).toBeLessThan(u.uRange[1]);
  expect(Math.max(...u.uKeyOfSlot)).toBeLessThan(sc.colors.grads.length);
  for (const v of u.uStop) expect(Number.isFinite(v)).toBe(true);
  const [zoom, turn] = rosetteGroup(sc, 0.5);
  expect(zoom).toBeCloseTo(sc.lattice.k * sc.design.flow * 0.5);
  expect(Number.isFinite(turn)).toBe(true);
});
