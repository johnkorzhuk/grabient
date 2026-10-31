import { expect, test } from "vitest";
import { decodePalette } from "./codec.ts";
import {
  GLASS_LOOP,
  glassColors,
  glassDiscAt,
  glassField,
  glassGeometry,
  glassSvg
} from "./glass.ts";
import { glassMap, glassMapRows, glassRenderer } from "./glass-render.ts";

const P = decodePalette("kS4mdDYzY8lhFPW")!;
const size = { width: 120, height: 150 };
const scene = () => {
  const geometry = glassGeometry(size);
  return { geometry, field: glassField(geometry, glassColors(P)) };
};

test("the glass takes six of a palette's colors along its curve", () => {
  const colors = glassColors(P);
  expect(colors).toHaveLength(6);
  for (const c of colors) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  expect(colors[0]).not.toBe(colors[5]);
});

test("the ribs depend on the size alone, and the filter's region holds every read", () => {
  const { geometry } = scene();
  expect(glassGeometry(size)).toEqual(geometry);
  expect(geometry.ribs.length).toBeGreaterThan(3);
  const { region, scale } = geometry;
  expect(region.x).toBeLessThan(-scale / 2);
  expect(region.y).toBeLessThan(-scale / 2);
  expect(region.x + region.w).toBeGreaterThan(size.width + scale / 2);
  expect(region.y + region.h).toBeGreaterThan(size.height + scale / 2);
});

test("the first frame's SVG holds no motion, and the moving one makes its laps at the speed asked", () => {
  const { geometry, field } = scene();
  const still = glassSvg(geometry, field, { still: true });
  expect(still).not.toMatch(/@keyframes|animation:/);
  expect(still).toContain("feDisplacementMap");
  expect(still).toContain(`fill="${field.base}"`);
  const moving = glassSvg(geometry, field, { speed: 2 });
  const durations = [...moving.matchAll(/animation:fgs ([\d.]+)s/g)].map(m => Number(m[1]));
  expect(durations).toHaveLength(2 * field.discs.length);
  expect(Math.max(...durations)).toBeCloseTo(GLASS_LOOP / 2, 2);
  expect(moving).toContain("prefers-reduced-motion");
});

test("the rib map baked a slice at a time is the map baked at once", () => {
  const { geometry } = scene();
  const whole = glassMap(geometry);
  const sliced = new Uint8Array(whole.length);
  for (let y = 0; y < size.height; y += 7)
    glassMapRows(geometry, sliced, y, Math.min(size.height, y + 7));
  expect(sliced).toEqual(whole);
});

test("a disc rides its ellipse along the ribs: at its start half an axis along them, and back after a lap", () => {
  const { geometry, field } = scene();
  const d = field.discs[0];
  const out = new Float32Array(2);
  const along = (geometry.alpha * Math.PI) / 180;
  glassDiscAt(geometry, d, d.delay, out, 0);
  expect(out[0]).toBeCloseTo(d.cx + d.a * Math.cos(along), 3);
  expect(out[1]).toBeCloseTo(d.cy + d.a * Math.sin(along), 3);
  const start = [out[0], out[1]];
  glassDiscAt(geometry, d, d.delay + d.dur, out, 0);
  expect(out[0]).toBeCloseTo(start[0], 3);
  expect(out[1]).toBeCloseTo(start[1], 3);
});

test("the CPU's frames: the box's pixels, opaque, the same twice, moving, in the palette's colors", () => {
  const { geometry, field } = scene();
  const drawn = glassRenderer(geometry);
  const first = drawn.frame(field, 0);
  expect(first).toHaveLength(size.width * size.height * 4);
  expect(drawn.frame(field, 0)).toEqual(first);
  expect(drawn.frame(field, 2)).not.toEqual(first);
  let red = 0;
  let blue = 0;
  for (let i = 0; i < first.length; i += 4) {
    expect(first[i + 3]).toBe(255);
    red += first[i];
    blue += first[i + 2];
  }
  /* a yellow to orange palette stays warm */
  expect(red).toBeGreaterThan(2 * blue);
});

test("a shape draws ribs and discs of its own, and 0 is the glass as designed", () => {
  const at = (shape: number | null) => {
    const geometry = glassGeometry(size, 90, shape);
    return { geometry, field: glassField(geometry, glassColors(P)) };
  };
  const designed = at(null);
  expect(at(0)).toEqual(designed);
  expect(designed.geometry.shape).toBe(0);
  const other = at(12);
  expect(other.geometry.shape).toBe(12);
  expect(other.field.discs.map(d => d.cx)).not.toEqual(designed.field.discs.map(d => d.cx));
  expect(other.geometry.ribs).not.toEqual(designed.geometry.ribs);
  // the same shape draws the same glass, and a recolor keeps it
  expect(at(12)).toEqual(other);
  const recolored = glassField(other.geometry, glassColors(decodePalette("kS7Q8Yy5S_SChv0")!));
  expect(recolored.discs.map(d => [d.cx, d.cy, d.R])).toEqual(
    other.field.discs.map(d => [d.cx, d.cy, d.R])
  );
});
