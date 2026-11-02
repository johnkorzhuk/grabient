import { expect, test } from "vitest";
import { decodePalette } from "./codec.ts";
import { MAX_FOLDS, SILK_LOOP, silkDesign, silkScene } from "./silk.ts";
import { bandUniforms, foldUniforms, SILK_FS, sceneUniforms } from "./silk-gl.ts";
import { renderSilk } from "./silk-render.ts";
import { silkMovingSvg, silkStillSvg } from "./silk-svg.ts";

const P = decodePalette("kcgI_BPOBA0BgwZI1sK2LpDueoxrwLsS764_g")!;
const box = { width: 96, height: 64 };

test("a shape draws the same drape every time, and shape 0 is the silk as designed", () => {
  expect(silkDesign(42)).toEqual(silkDesign(42));
  expect(silkDesign(0)).toEqual(silkDesign(null));
  for (let shape = 1; shape <= 999; shape += 53) {
    const d = silkDesign(shape);
    expect(d.folds.length).toBeGreaterThanOrEqual(6);
    expect(d.folds.length).toBeLessThanOrEqual(MAX_FOLDS);
  }
});

test("the angle turns the cloth, and the loop ends on its first frame", () => {
  const a = renderSilk(silkScene(P, { angle: 90, shape: null }, box), 0);
  const b = renderSilk(silkScene(P, { angle: 200, shape: null }, box), 0);
  expect(a).not.toEqual(b);
  const sc = silkScene(P, { angle: 30, shape: 7 }, box);
  expect(renderSilk(sc, SILK_LOOP)).toEqual(renderSilk(sc, 0));
  expect(renderSilk(sc, SILK_LOOP + 37)).toEqual(renderSilk(sc, 37));
});

test("the still SVG stays a cheap list card: shared gradients, no filters", () => {
  const svg = silkStillSvg(P, { angle: 90, shape: null }, { width: 1920, height: 1080 });
  expect(svg.length).toBeLessThan(12_000);
  expect(svg.match(/<[a-zA-Z]/g)?.length ?? 0).toBeLessThan(200);
  expect(svg).not.toMatch(/<filter|<image|<foreignObject|url\(data/);
  expect(svg).not.toMatch(/animateTransform/);
});

test("the moving SVG swings each fold once, in the loop's own time", () => {
  const sc = silkScene(P, { angle: 90, shape: null }, { width: 800, height: 400 });
  const svg = silkMovingSvg(P, { angle: 90, shape: null }, { width: 800, height: 400 }, 2);
  expect(svg.match(/<animateTransform/g)).toHaveLength(sc.folds.length);
  expect(svg).toContain(`dur="${SILK_LOOP / 2}s"`);
});

test("the shader's uniforms fill without allocating, and the pass reads them", () => {
  const sc = silkScene(P, { angle: 120, shape: 3 }, { width: 640, height: 360 });
  const S = new Float32Array(4);
  const G = new Float32Array(2 * MAX_FOLDS);
  const F = new Float32Array(4 * MAX_FOLDS);
  sceneUniforms(sc, S);
  bandUniforms(sc, G);
  foldUniforms(sc, 12.5, F);
  for (const v of [...S, ...G, ...F]) expect(Number.isFinite(v)).toBe(true);
  for (const name of ["D", "F", "G", "N", "T", "S"])
    expect(SILK_FS).toMatch(new RegExp(`uniform [^;]+\\b${name}\\b`));
});
