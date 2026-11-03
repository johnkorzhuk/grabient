import { expect, test } from "vitest";
import { decodePalette } from "./codec.ts";
import { sampleStops } from "./curve.ts";
import {
  PAPERCUT_LOOK,
  PAPERCUT_LOOP,
  PAPERCUT_MAX_BUMPS,
  PAPERCUT_SPAN,
  papercutDither,
  papercutField,
  papercutFrameAt,
  papercutFrameSize,
  papercutModel,
  papercutScene,
  papercutShade
} from "./papercut.ts";
import {
  PAPERCUT_FIELD_FS,
  PAPERCUT_SHADE_FS,
  papercutFieldSize,
  papercutFrameUniforms,
  papercutSceneUniforms
} from "./papercut-gl.ts";
import { papercutRows, renderPapercut } from "./papercut-render.ts";
import {
  PAPERCUT_STEPS,
  papercutFileOf,
  papercutFileSvg,
  papercutStillOf,
  papercutStillSteps,
  papercutStillSvg
} from "./papercut-svg.ts";

const P = decodePalette("kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ")!;
const Q = decodePalette("kUMzO5Na871ukuyhHUJA")!;

/** The frame with the field taken at every pixel, the drawing papercut-render.ts's quarter field stands in for. */
function exact(m: ReturnType<typeof papercutScene>, t: number): Uint8ClampedArray {
  const at = new Float64Array(papercutFrameSize(m));
  papercutFrameAt(m, t, at);
  const f = new Float64Array(4);
  const c = new Float64Array(3);
  const px = new Uint8ClampedArray(m.width * m.height * 4);
  for (let y = 0, o = 0; y < m.height; y++)
    for (let x = 0; x < m.width; x++, o += 4) {
      papercutField(m, at, (x + 0.5 - m.width / 2) / m.D, (y + 0.5 - m.height / 2) / m.D, f);
      papercutShade(m, f[0], f[1], f[2], f[3], at[at.length - 2], at[at.length - 1], c);
      const n = papercutDither(x, y);
      for (let k = 0; k < 3; k++) px[o + k] = Math.round((c[k] + n) * 255);
      px[o + 3] = 255;
    }
  return px;
}

/** The mean and the 99th percentile of two pictures' channel differences. */
function apart(a: ArrayLike<number>, b: ArrayLike<number>) {
  const counts = new Array(256).fill(0);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.length; i += 4)
    for (let k = 0; k < 3; k++) {
      const d = Math.abs(a[i + k] - b[i + k]);
      counts[d]++;
      sum += d;
      n++;
    }
  let seen = counts[0];
  let p99 = 0;
  while (seen < 0.99 * n) seen += counts[++p99];
  return { mean: sum / n, p99 };
}

test("a shape lays the same relief out every time, and shape 0 is the designed one", () => {
  const box = { width: 160, height: 90 };
  const a = papercutScene(P, { angle: 90, shape: 42 }, box);
  expect(papercutScene(P, { angle: 90, shape: 42 }, box)).toEqual(a);
  expect(papercutScene(P, { angle: 90, shape: 0 }, box)).toEqual(
    papercutScene(P, { angle: 90, shape: null }, box)
  );
  expect(a.bumps).not.toEqual(papercutScene(P, { angle: 90, shape: null }, box).bumps);
  for (let shape = 1; shape <= 999; shape += 61) {
    const m = papercutScene(P, { angle: 90, shape }, box);
    expect(m.bumps.length).toBeGreaterThanOrEqual(4);
    expect(m.bumps.length).toBeLessThanOrEqual(PAPERCUT_MAX_BUMPS);
    expect(m.levels).toEqual([...m.levels].sort((x, y) => x - y));
  }
});

test("every sheet is one of the palette's colors, at even steps along it", () => {
  const m = papercutScene(P, { angle: 90, shape: null }, { width: 64, height: 36 });
  expect(m.n).toBe(PAPERCUT_LOOK.sheets);
  expect(m.hex).toEqual(sampleStops(P, PAPERCUT_LOOK.sheets).map(s => s.hex));
  expect(m.levels).toHaveLength(m.n - 1);
});

test("the relief is laid out from the box's longer side, so every box shows the one its square shows, centered", () => {
  const square = papercutScene(Q, { angle: 30, shape: 7 }, { width: 400, height: 400 });
  const wide = papercutScene(Q, { angle: 30, shape: 7 }, { width: 400, height: 226 });
  const tall = papercutScene(Q, { angle: 30, shape: 7 }, { width: 226, height: 400 });
  expect(wide.levels).toEqual(square.levels);
  expect(tall.levels).toEqual(square.levels);
  expect(wide.D).toBe(PAPERCUT_SPAN * 400);
  const s = renderPapercut(square, 0);
  const w = renderPapercut(wide, 0);
  /* the wide box is the square's middle rows, (400 - 226) / 2 rows down, but for the dither, which is the pixel's own,
     and the field's samples, every fourth pixel from each box's corner */
  const rows = s.subarray(87 * 400 * 4, (87 + 226) * 400 * 4);
  const d = apart(w, rows);
  expect(d.mean).toBeLessThan(0.2);
  expect(d.p99).toBeLessThanOrEqual(1);
});

test("the angle lays the palette out: its first color at the angle's tail, its last at its head", () => {
  const box = { width: 96, height: 54 };
  /* a column's mean green: the palette runs from cream to deep red, whose green is far the lower */
  const green = (px: Uint8ClampedArray, x: number) => {
    let sum = 0;
    for (let y = 0; y < box.height; y++) sum += px[(y * box.width + x) * 4 + 1];
    return sum / box.height;
  };
  const toward90 = renderPapercut(papercutScene(P, { angle: 90, shape: null }, box), 0);
  const toward270 = renderPapercut(papercutScene(P, { angle: 270, shape: null }, box), 0);
  expect(green(toward90, 2)).toBeGreaterThan(green(toward90, box.width - 3) + 60);
  expect(green(toward270, box.width - 3)).toBeGreaterThan(green(toward270, 2) + 60);
});

test("the loop ends on its first frame, and the frame at t is the frame a loop later", () => {
  const m = papercutScene(Q, { angle: 200, shape: 512 }, { width: 120, height: 80 });
  expect(renderPapercut(m, PAPERCUT_LOOP)).toEqual(renderPapercut(m, 0));
  expect(renderPapercut(m, PAPERCUT_LOOP + 61.3)).toEqual(renderPapercut(m, 61.3));
  expect(renderPapercut(m, 61.3)).not.toEqual(renderPapercut(m, 0));
});

test("the CPU drawing's quarter field is the field at every pixel within a level", () => {
  for (const [P_, view, box, t] of [
    [P, { angle: 90, shape: null }, { width: 640, height: 360 }, 0],
    [Q, { angle: 30, shape: 7 }, { width: 400, height: 600 }, 61.3]
  ] as const) {
    const m = papercutScene(P_, view, box);
    const d = apart(renderPapercut(m, t), exact(m, t));
    expect(d.mean).toBeLessThan(0.1);
    expect(d.p99).toBeLessThanOrEqual(1);
  }
});

test("the still is a cheap list card: one path a sheet, its shadow stepped, no filter", () => {
  const svg = papercutStillSvg(P, { angle: 90, shape: null }, { width: 1000, height: 1000 });
  expect(svg).toMatch(/^<svg[^>]*width="1000" height="1000"/);
  expect(svg).not.toMatch(/<filter|<image|<foreignObject|url\(data/);
  expect(svg.length).toBeLessThan(24_000);
  const sheets = svg.match(/<path id="c\d+"/g)?.length ?? 0;
  expect(sheets).toBeGreaterThan(6);
  expect(sheets).toBeLessThan(PAPERCUT_LOOK.sheets);
  /* each sheet: its shadow's fill and strokes, the lit cut over the contact's stroke, the face */
  expect(svg.match(/<use /g)).toHaveLength(sheets * (PAPERCUT_STEPS.strokes.length + 2));
  expect(svg.match(/<[a-zA-Z]/g)?.length ?? 0).toBeLessThan(80);
  expect(svg).toContain('paint-order="stroke"');
});

test("the file's SVG blurs each shadow, as Figma's importer takes a layer blur, clipped to its box", () => {
  const svg = papercutFileSvg(Q, { angle: 30, shape: 7 }, { width: 640, height: 360 });
  expect(svg).toMatch(/^<svg[^>]*width="640" height="360"/);
  expect(svg).toMatch(/<feGaussianBlur stdDeviation="[\d.]+"\/>/);
  expect(svg).toContain('clip-path="url(#pcbox)"');
  expect(svg).not.toMatch(/<image|url\(data/);
});

test("the shaders' uniforms are plain numbers, filled a frame with no allocation, and the passes read them", () => {
  const m = papercutScene(Q, { angle: 120, shape: 3 }, { width: 640, height: 360 });
  const u = papercutSceneUniforms(m);
  for (const v of [
    ...u.level,
    ...u.face,
    ...u.wall,
    ...u.shadow,
    ...u.sheet,
    ...u.reach,
    ...u.misc
  ])
    expect(Number.isFinite(v)).toBe(true);
  const at = new Float32Array(papercutFrameSize(m));
  const bump = new Float32Array(PAPERCUT_MAX_BUMPS * 4);
  const rest = new Float32Array(6);
  papercutFrameUniforms(m, 12.5, at, bump, rest);
  for (const v of [...bump, ...rest]) expect(Number.isFinite(v)).toBe(true);
  expect(Math.hypot(rest[4], rest[5])).toBeCloseTo(1, 6);
  expect(papercutFieldSize(m)).toEqual({ w: 163, h: 93 });
  for (const name of ["uSize", "uD", "uRamp", "uWarp", "uPhase", "uBumps", "uBump"])
    expect(PAPERCUT_FIELD_FS).toMatch(new RegExp(`uniform [^;]+\\b${name}\\b`));
  for (const name of ["uLight", "uSheets", "uLevel", "uFace", "uWallC", "uShade", "uSheet"])
    expect(PAPERCUT_SHADE_FS).toMatch(new RegExp(`uniform [^;]+\\b${name}\\b`));
});

test("every sheet has paper: the levels climb, a speck nested in another kept rather than two levels met", () => {
  const box = { width: 64, height: 36 };
  /* the views whose specks moved two levels to one place (styles-lab/sg/papercut/fix/levels-sweep.ts), and a sweep */
  const views: [number, number][] = [
    [0, 543],
    [30, 572],
    [120, 533],
    [180, 381],
    [240, 844],
    [315, 944]
  ];
  for (let shape = 1; shape < 1000; shape += 53)
    for (const angle of [0, 90, 135, 270]) views.push([angle, shape]);
  for (const [angle, shape] of views) {
    const { levels } = papercutScene(Q, { angle, shape }, box);
    for (let k = 1; k < levels.length; k++) expect(levels[k]).toBeGreaterThan(levels[k - 1]);
  }
});

test("a box of a pixel or two divides by no sigma of 0", () => {
  const f = new Float64Array(4);
  const c = new Float64Array(3);
  for (const side of [1, 2, 3]) {
    const m = papercutScene(P, { angle: 90, shape: null }, { width: side, height: side });
    for (const v of [...m.isigma, m.icsigma]) expect(Number.isFinite(v)).toBe(true);
    for (const v of Object.values(papercutSceneUniforms(m)).flatMap(u => [...u]))
      expect(Number.isFinite(v)).toBe(true);
    /* every color it shades is a number, at points all over the box (a byte would hide a NaN as 0) */
    const at = new Float64Array(papercutFrameSize(m));
    papercutFrameAt(m, 0, at);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        papercutField(
          m,
          at,
          ((x + 0.5) / 16 - 0.5) * (side / m.D),
          ((y + 0.5) / 16 - 0.5) * (side / m.D),
          f
        );
        papercutShade(m, f[0], f[1], f[2], f[3], at[at.length - 2], at[at.length - 1], c);
        for (const v of c) expect(Number.isFinite(v)).toBe(true);
      }
  }
});

test("what a view keeps (its levels, its stills' cuts) draws what drawing afresh does, for every palette", () => {
  /* a look equal to the designed one but not it: its scene keeps nothing, so it is drawn afresh each time */
  const afresh = { ...PAPERCUT_LOOK };
  for (const [palette, view, box] of [
    [P, { angle: 30, shape: 7 }, { width: 1000, height: 1000 }],
    [Q, { angle: 30, shape: 7 }, { width: 1000, height: 1000 }],
    [Q, { angle: 200, shape: null }, { width: 480, height: 270 }],
    [P, { angle: 200, shape: null }, { width: 480, height: 270 }]
  ] as const) {
    const kept = papercutScene(palette, view, box);
    const fresh = papercutModel(palette, view, box.width, box.height, afresh);
    expect(fresh.view).toBeNull();
    expect(kept.levels).toEqual(fresh.levels);
    expect(papercutStillOf(kept)).toBe(papercutStillOf(fresh));
    expect(papercutFileOf(kept)).toBe(papercutFileOf(fresh));
  }
});

test("the still a step at a time is the still, and the CPU drawing a band of rows at a time is the drawing", () => {
  const m = papercutScene(Q, { angle: 315, shape: 77 }, { width: 1000, height: 1000 });
  const steps = papercutStillSteps(
    papercutModel(Q, { angle: 315, shape: 77 }, 1000, 1000, { ...PAPERCUT_LOOK })
  );
  let step = steps.next();
  let n = 0;
  for (; !step.done; step = steps.next()) n++;
  expect(n).toBeGreaterThan(20);
  expect(step.value).toBe(papercutStillOf(m));
  const box = papercutScene(P, { angle: 135, shape: 3 }, { width: 203, height: 117 });
  const frame = papercutRows(box, 12.5);
  let bands = 0;
  for (let rows = 7; !frame.rows(rows); rows += 7) bands++;
  expect(bands).toBe(Math.ceil(box.height / 7) - 1);
  expect(frame.px).toEqual(renderPapercut(box, 12.5));
});
