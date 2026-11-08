/* A field effect's SVG held to its CPU's frame (render.ts) as the conformance suite holds every vector effect's
   (effect-conformance.test.ts): any frame a plain SVG of its own that resvg draws within its limits of the CPU's frame
   at that time, at two sizes, three times of the loop and two looks; the still within the same limits of its first
   frame's SVG at the design square and at 320 by 180, where the suite holds it, a line thinner than two of the still's
   cells among them, and light enough as a CSS background for a list of cards; each sheet's shadow and rim in its own
   color where the recipe tints them, the first sheet's over the ground among them, each byte as kitByte takes it, a
   tie up. Then the tracer's own facts, on fields whose levels are known, and on fields that are not finite
   everywhere. */
import { beforeAll, describe, expect, it } from "vitest";
import { pathRuns } from "../../test/path-runs.ts";
import { type FrameDiff, frameDiff, rasterize, resvgReady } from "../../test/raster.ts";
import { decodePalette } from "../codec.ts";
import { FX_STILL_SIDE, fxCover } from "../fx-still.ts";
import type { Size } from "../view.ts";
import demo from "./fields/demo.ts";
import { kitRender } from "./render.ts";
import { type KitScene, type KitView, kitByte, kitHex, kitScene, kitSheetColor } from "./scene.ts";
import { kitRimColor, kitScratch, kitShadowColor } from "./shade.ts";
import {
  KIT_STILL_SIDE,
  type KitLayer,
  kitFileSvg,
  kitFrameLayers,
  kitFrameSvg,
  kitStillSteps,
  kitStillSvg
} from "./svg.ts";
import { type KitContour, kitFit, kitPath, kitTraceSteps } from "./trace.ts";
import type { FieldEffect } from "./types.ts";

const P = decodePalette("kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ")!;
/** The suite's sizes, looks, times and limits (effect-conformance.test.ts). */
const SIZES: Size[] = [
  { width: 320, height: 180 },
  { width: 640, height: 360 }
];
const LOOKS: KitView[] = [
  { angle: 90, shape: null },
  { angle: 210, shape: 417 }
];
const TIMES = [0, 0.37, 0.71];
const FRAME_LIMIT = { mean: 1.5, p99: 8, far: 0.006 };
const STILL_BYTES = 40 * 1024;
const within = (d: FrameDiff) =>
  d.mean < FRAME_LIMIT.mean && d.p99 < FRAME_LIMIT.p99 && d.far < FRAME_LIMIT.far;
const SQUARE: Size = { width: KIT_STILL_SIDE, height: KIT_STILL_SIDE };

/** The demo's recipe turned about, so every branch of the drawing runs: its sheets every whole level (no ground shows),
    colored there and back along the palette, a soft shadow of three layers, no rim, and lines colored by a cycle. */
const stripes: FieldEffect = {
  ...demo,
  kind: "stripes",
  sheets: {
    base: -0.03,
    step: 0.17,
    count: null,
    colors: { hop: 0.23, offset: 0.1, wrap: "mirror" },
    shadow: { angle: 200, distance: 0.008, alpha: 0.4, swing: 0, steps: 3, spread: 0.6 },
    rim: null
  },
  lines: {
    base: 0.05,
    step: 0.17,
    half: 0.006,
    colors: { hop: 0.31, offset: 0, wrap: "cycle" },
    alpha: 0.7
  }
};

/** The demo in a tinted light, as the zen garden is lit: each sheet's soft shadow (three layers, as the stripes') the
    sheet below it darkened to 0.35 of its color, the first sheet's the ground's, and each rim the sheet's own color
    lifted 0.55 of the way to white, so every sheet's shadow and rim is a color of its own (shade.ts kitShadowColor,
    kitRimColor); neither number is shade.ts's default (0.55 and 0.4), so a drawing that dropped one would draw other
    colors. Measured 8 Nov 2026 against the CPU's frames at 320 by 180 and 640 by
    360, two looks and three times: within a mean of 0.08, a p99 of 0.6 and none far. Its shadows and rims are thin, so
    its frames keep within those limits in the ink and white too (a mean of 0.11 and a p99 of 1.2 from the tinted CPU's
    at most, the same day): the test that reads each layer's fill holds the tints, not these. The zen garden's frames,
    drawn by the SVG in the ink and white as it drew them before it took the tints, lie a mean of 1.3 to 2.5, a p99 of
    8.9 to 10.7 and 0.6 to 1.5% far from its CPU's at the suite's size, looks and times; as promoted (8 Nov 2026, its
    shadows' tint the sheet below's at a depth of 0.55, its rims' lift 0.5) within 0.24, 0.8 and none far there (a p99
    of 0.9 at most over the suite's deep sweep). */
const tinted: FieldEffect = {
  ...demo,
  kind: "tinted",
  sheets: {
    ...demo.sheets!,
    shadow: { ...demo.sheets!.shadow!, steps: 3, spread: 0.6, tint: "below", depth: 0.35 },
    rim: { ...demo.sheets!.rim!, tint: "own", lift: 0.55 }
  }
};

/** Four ropes, each two waves crossing and a line along the nearer, as the guilloche candidate's are: the level is
    touched along each wave and never crossed, so the line's band is one level's thin loop about each wave, 1.4 px wide
    at 320 by 180, a cell and a tenth of the still's grid there. A grid of 180 cells broke it into dashes (its still 3
    to 6% far from its first frame), and whole pixels there set its edges 0.9 to 1.2% far (8 Nov 2026). */
const ropes: FieldEffect = {
  ...demo,
  kind: "ropes",
  field: (x, y, _U, F) => {
    let f = 1;
    for (let i = 0; i < 4; i++) {
      const v = y - 0.25 * i + 0.37;
      const s = 0.05 * Math.sin(9 * x + F[i] + 1.3 * i);
      const l1 = Math.abs(v - s);
      const l2 = Math.abs(v + s);
      /* the nearer, blended over 0.002 D where they cross, so the band's edge stays smooth */
      const b = 0.002;
      const h = Math.max(0, b - Math.abs(l1 - l2)) / b;
      f = Math.min(f, Math.min(l1, l2) - h * h * b * 0.25);
    }
    return f;
  },
  sheets: null,
  lines: { base: 0, step: 1, half: 0.003, colors: "lightest", alpha: 1 }
};

beforeAll(resvgReady);

describe.each([demo, stripes, tinted])("the $kind", def => {
  const cpu = (look: KitView, size: Size, t: number) => kitRender(kitScene(def, P, look, size), t);

  it.each(
    SIZES.flatMap(size =>
      LOOKS.map(look => ({ ...look, size, label: `${size.width}x${size.height}` }))
    )
  )(
    "is any frame as an SVG of its own, as the CPU draws it ($label, angle $angle, shape $shape)",
    ({ size, ...look }) => {
      const seen: string[] = [];
      for (const share of TIMES) {
        const t = share * def.loop;
        const svg = kitFrameSvg(def, P, look, size, t);
        seen.push(svg);
        /* plain shapes: nothing a design app's importer would resolve or drop */
        expect(svg).not.toMatch(
          /<use|<filter|<mask|<script|<foreignObject|href=|@keyframes|<animate/
        );
        const drawn = rasterize(svg, size.width);
        expect(
          frameDiff(drawn, cpu(look, size, t), size.width, size.height),
          `at ${t} s`
        ).toSatisfy(within);
        /* and the limits tell frames apart: the CPU's frame a moment later is not this SVG */
        expect(
          frameDiff(drawn, cpu(look, size, t + 0.13 * def.loop), size.width, size.height),
          "a frame later"
        ).not.toSatisfy(within);
      }
      /* it moves, and the same time writes the same SVG */
      expect(new Set(seen).size).toBe(seen.length);
      expect(kitFrameSvg(def, P, look, size, TIMES[1] * def.loop)).toBe(seen[1]);
    }
  );

  it.each(
    [SQUARE, SIZES[0]].flatMap(size =>
      LOOKS.map(look => ({ ...look, size, label: `${size.width}x${size.height}` }))
    )
  )("stills on its first frame ($label, angle $angle, shape $shape)", ({ size, ...look }) => {
    const still = rasterize(kitStillSvg(def, P, look, size), size.width);
    const first = rasterize(kitFrameSvg(def, P, look, size, 0), size.width);
    expect(frameDiff(still, first, size.width, size.height)).toSatisfy(within);
  });

  it("stills light enough for a list of cards, each its own CSS background", () => {
    /* measured 8 Nov 2026 over 30 looks of the demo, on the still's 240 cells: 9.7 KiB at the median, 11.2 at most */
    for (const look of [...LOOKS, { angle: 0, shape: 7 }])
      expect(fxCover(kitStillSvg(def, P, look)).length, `${look.angle} ${look.shape}`).toBeLessThan(
        STILL_BYTES
      );
  });
});

/** The stripes' levels spaced by the view's steps (types.ts KitSteps): their sheets, soft shadow and lines n / 8 times
    as close, from 4 to 16 steps. */
const spaced: FieldEffect = {
  ...stripes,
  kind: "spaced",
  steps: { least: 4, most: 16, designed: 8 }
};

describe("an effect the view's steps space", () => {
  const ends: KitView[] = [
    { angle: 90, shape: null, steps: 4 },
    { angle: 210, shape: 417, steps: 16 }
  ];
  it.each(
    SIZES.flatMap(size =>
      ends.map(look => ({ ...look, size, label: `${size.width}x${size.height}` }))
    )
  )(
    "is any frame as an SVG of its own at its fewest and most steps, as the CPU draws it ($label, steps $steps)",
    ({ size, ...look }) => {
      for (const share of TIMES) {
        const t = share * spaced.loop;
        const drawn = rasterize(kitFrameSvg(spaced, P, look, size, t), size.width);
        const cpu = kitRender(kitScene(spaced, P, look, size), t);
        expect(frameDiff(drawn, cpu, size.width, size.height), `at ${t} s`).toSatisfy(within);
      }
    }
  );

  it("stills each steps apart, on its first frame, light enough for a list of cards at its most", () => {
    const at = (steps: number | null) => kitStillSvg(spaced, P, { angle: 90, shape: null, steps });
    /* its designed steps are the steps none names; any other is another still, never one kept for another */
    expect(at(8)).toBe(at(null));
    expect(at(16)).not.toBe(at(8));
    expect(at(4)).not.toBe(at(8));
    expect(at(99)).toBe(at(16));
    const look: KitView = { angle: 90, shape: null, steps: 16 };
    const still = rasterize(kitStillSvg(spaced, P, look, SIZES[0]), SIZES[0].width);
    const first = rasterize(kitFrameSvg(spaced, P, look, SIZES[0], 0), SIZES[0].width);
    expect(frameDiff(still, first, SIZES[0].width, SIZES[0].height)).toSatisfy(within);
    expect(fxCover(at(16)).length).toBeLessThan(STILL_BYTES);
    /* more steps, more levels traced: the most steps' still the heaviest */
    expect(at(16).length).toBeGreaterThan(at(4).length);
  });
});

describe("the still and the file", () => {
  it("draws the still in the conformance suite's design square", () => {
    expect(KIT_STILL_SIDE).toBe(FX_STILL_SIDE);
    expect(kitStillSvg(demo, P, LOOKS[0])).toMatch(
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1000" height="1000" viewBox="0 0 1000 1000">/
    );
  });

  it("writes the still a step at a time, its traces kept by the view, its colors each palette's", () => {
    const look = { angle: 33, shape: 21 };
    let steps = 0;
    const run = kitStillSteps(demo, P, look);
    let step = run.next();
    for (; !step.done; step = run.next()) steps++;
    /* the grid's rows and cells 18 rows a step, then a level a step */
    expect(steps).toBeGreaterThan(30);
    expect(step.value).toBe(kitStillSvg(demo, P, look));
    /* kept: another palette at the view traces nothing, and writes its own colors about the same paths */
    const other = decodePalette("kUMzO5Na871ukuyhHUJA")!;
    const again = kitStillSteps(demo, other, look);
    expect(again.next().done).toBe(true);
    const paths = (svg: string) => [...svg.matchAll(/ d="([^"]*)"/g)].map(m => m[1]);
    expect(paths(kitStillSvg(demo, other, look))).toEqual(paths(step.value));
    expect(kitStillSvg(demo, other, look)).not.toBe(step.value);
    /* a variant of the recipe under the same name is traced as its own */
    const variant = { ...demo, lines: null };
    expect(kitStillSvg(variant, P, look)).not.toBe(step.value);
    expect(kitStillSvg(variant, P, look)).not.toMatch(/<path fill/);
  });

  it("lays each sheet's shadow and rim as a <use> of its path, a soft shadow's raised levels and the lines as paths", () => {
    const svg = kitStillSvg(demo, P, LOOKS[0]);
    const sheets = [...svg.matchAll(/<path id="(k\d+)"/g)].map(m => m[1]);
    expect(sheets.length).toBeGreaterThan(5);
    for (const id of sheets)
      expect(svg.match(new RegExp(`<use href="#${id}"`, "g"))).toHaveLength(3);
    expect(svg).not.toMatch(/<filter|<mask|<script|href="(?!#)/);
    /* the stripes' shadow is three layers, each a third of its alpha, the two raised ones moved as the first */
    const soft = kitStillSvg(stripes, P, LOOKS[0]);
    const [first] =
      /<use href="#k-?\d+" transform="([^"]*)" fill="(#\w+)" fill-opacity="([.\d]+)"\/>/
        .exec(soft)!
        .slice(1);
    const raised = [
      ...soft.matchAll(/<path transform="([^"]*)" fill="#\w+" fill-opacity="([.\d]+)" d=/g)
    ];
    expect(raised.length).toBeGreaterThan(soft.match(/<path id=/g)!.length);
    for (const [, move, alpha] of raised) {
      expect(move).toBe(first);
      expect(Number(alpha)).toBeCloseTo(0.4 / 3, 3);
    }
  });

  it("fills each sheet's shadow and rim in its own color as the shading takes it, each of the still's <use>s its own", () => {
    const c = kitScratch();
    const hexOf = (
      m: KitScene,
      paint: (m: KitScene, k: number, out: Float64Array) => void,
      k: number
    ) => {
      paint(m, k, c);
      return kitHex(c);
    };
    /* each shadow and rim layer of a frame in its sheet's colors */
    const tints = (m: KitScene, layers: readonly KitLayer[]) => {
      for (const l of layers) {
        const k = l.level;
        if (l.name === "shadow") expect(l.hex, l.group).toBe(hexOf(m, kitShadowColor, k));
        if (l.name === "rim") expect(l.hex, l.group).toBe(hexOf(m, kitRimColor, k));
      }
    };
    const look = LOOKS[1];
    const m = kitScene(tinted, P, look, SIZES[0]);
    /* a frame's layers, and its SVG's paths in their colors */
    const t = TIMES[1] * tinted.loop;
    const { layers } = kitFrameLayers(m, t);
    tints(m, layers);
    const frame = kitFrameSvg(tinted, P, look, SIZES[0], t);
    expect(
      [...frame.matchAll(/<path fill="(#\w+)"(?: fill-opacity="[.\d]+")? d="([^"]*)"\/>/g)].map(
        p => [p[1], p[2]]
      )
    ).toEqual(layers.map(l => [l.hex, l.d]));
    /* every sheet's its own: none the ink, none white */
    const shown = layers.filter(l => l.name === "sheet").length;
    const shadows = new Set(layers.filter(l => l.name === "shadow").map(l => l.hex));
    const rims = new Set(layers.filter(l => l.name === "rim").map(l => l.hex));
    expect(shown).toBeGreaterThan(3);
    expect(shadows.size).toBe(shown);
    expect(rims.size).toBe(shown);
    expect(shadows.has(kitHex(m.shade))).toBe(false);
    expect(rims.has("#ffffff")).toBe(false);
    /* the first sheet's shadow falls on the ground, the demo's stack being counted, and darkens the ground's color:
       the frame at the other look shows sheet 0, where this one shows sheets 3 to 8 and the still 1 to 10 */
    const m0 = kitScene(tinted, P, LOOKS[0], SIZES[0]);
    const first = kitFrameLayers(m0, t).layers;
    expect(first.some(l => l.level === 0 && l.name === "shadow")).toBe(true);
    tints(m0, first);
    /* the still: a sheet's path fixes no fill, its shadow's <use> and raised paths, its rim's <use> and its own each
       paint it in their layer's color */
    const still = kitStillSvg(tinted, P, look);
    const ids = still.match(/<path id=/g)!.length;
    expect(ids).toBeGreaterThan(5);
    expect(still.match(/<path id="k-?\d+" d="[^"]*"\/>/g)).toHaveLength(ids);
    const sheets = [
      ...still.matchAll(
        /<use href="#k(-?\d+)" transform="[^"]*" fill="(#\w+)" fill-opacity="[.\d]+"\/>((?:<path transform="[^"]*" fill="#\w+" fill-opacity="[.\d]+" d="[^"]*"\/>)*)<use href="#k\1" transform="[^"]*" fill="(#\w+)" fill-opacity="[.\d]+"\/><use href="#k\1" fill="(#\w+)"\/>/g
      )
    ];
    expect(sheets).toHaveLength(ids);
    for (const [, id, shadow, raised, rim, sheet] of sheets) {
      const k = Number(id);
      expect(shadow, `sheet ${k}`).toBe(hexOf(m, kitShadowColor, k));
      for (const [, fill] of raised.matchAll(/fill="(#\w+)"/g)) expect(fill).toBe(shadow);
      expect(rim, `sheet ${k}`).toBe(hexOf(m, kitRimColor, k));
      expect(sheet, `sheet ${k}`).toBe(hexOf(m, kitSheetColor, k));
    }
    /* where the recipe leaves them, the ink and white, as the still has always written them */
    const plain = kitStillSvg(demo, P, look);
    const fills = plain.matchAll(/<use href="#k-?\d+" transform="[^"]*" fill="(#\w+)"/g);
    expect(new Set([...fills].map(f => f[1]))).toEqual(new Set([kitHex(m.shade), "#fff"]));
  });

  it("writes the tints' bytes as kitByte does, a tie up", () => {
    /* every sheet on a stop's midpoint, and its shadow and rim its color as it is (depth 1, lift 0), so a channel of
       their fills may be two bytes' mean, half a level, which Math.round takes down where its double lies a hair
       under the half and every format takes up (scene.ts KIT_TIE): of the 72 channels of this palette's twelve sheets'
       tints, 32 are such ties and Math.round takes 4 of them down (8 Nov 2026) */
    const ties: FieldEffect = {
      ...tinted,
      sheets: {
        ...tinted.sheets!,
        colors: { hop: 1 / 15, offset: 1 / 30, wrap: "clamp" },
        shadow: { ...tinted.sheets!.shadow!, depth: 1 },
        rim: { ...tinted.sheets!.rim!, lift: 0 }
      }
    };
    const m = kitScene(ties, P, LOOKS[0], SIZES[0]);
    const c = kitScratch();
    let down = 0;
    for (const l of kitFrameLayers(m, TIMES[1] * ties.loop).layers) {
      if (l.name !== "shadow" && l.name !== "rim") continue;
      (l.name === "shadow" ? kitShadowColor : kitRimColor)(m, l.level, c);
      expect(l.hex, `${l.group} ${l.name}`).toBe(kitHex(c));
      for (const v of c) if (Math.round(v * 255) !== kitByte(v)) down++;
    }
    /* and the frame holds such a tie, which Math.round would have written a level down */
    expect(down).toBeGreaterThan(0);
  });

  it("keeps a line along a valley of the field whole in the still, a cell and a tenth of its grid wide", () => {
    const size = SIZES[0];
    for (const look of LOOKS) {
      const first = rasterize(kitFrameSvg(ropes, P, look, size, 0), size.width);
      /* the frame draws the ropes as the CPU does, and the still draws them as the frame */
      const cpu = kitRender(kitScene(ropes, P, look, size), 0);
      expect(frameDiff(first, cpu, size.width, size.height), "frame").toSatisfy(within);
      const still = rasterize(kitStillSvg(ropes, P, look, size), size.width);
      expect(frameDiff(still, first, size.width, size.height), "still").toSatisfy(within);
    }
  });

  it("writes the file as its first frame at any speed, its paths its frame's layers in painter's order", () => {
    const size = { width: 1200, height: 800 };
    expect(kitFileSvg(demo, P, LOOKS[1], size)).toBe(kitFrameSvg(demo, P, LOOKS[1], size, 0));
    const { ground, layers } = kitFrameLayers(kitScene(demo, P, LOOKS[1], size));
    const svg = kitFileSvg(demo, P, LOOKS[1], size);
    expect(svg).toContain(`fill="${ground}"`);
    expect([...svg.matchAll(/<path [^>]*d="([^"]*)"/g)].map(m => m[1])).toEqual(
      layers.map(l => l.d)
    );
    /* in painter's order: each sheet's shadow, rim and itself, then the lines */
    const names = layers.map(l => (l.group === "lines" ? "line" : l.name));
    expect(names.slice(0, 3)).toEqual(["shadow", "rim", "sheet"]);
    expect(names.indexOf("line")).toBe(names.lastIndexOf("sheet") + 1);
  });
});

describe("the tracer", () => {
  const box = { width: 200, height: 120 };
  /* rings about a point: the level r0 - |p - c| */
  const cone = (cx: number, cy: number) => (x: number, y: number) => -Math.hypot(x - cx, y - cy);
  const traceOf = (field: (x: number, y: number) => number, levels: number[], reach = 4) => {
    const run = kitTraceSteps(field, box, { step: 3, reach }, () => levels);
    let step = run.next();
    while (!step.done) step = run.next();
    return step.value;
  };
  const trace = (field: (x: number, y: number) => number, levels: number[], reach = 4) =>
    traceOf(field, levels, reach).traced;

  it("puts every point of a level's loop on it, its tangent along it, the field above on its right", () => {
    const [ring] = trace(cone(90, 60), [-40]) as KitContour[][];
    expect(ring).toHaveLength(1);
    const c = ring[0];
    for (let p = 0; p < c.x.length; p++) {
      expect(c.on[p]).toBe(1);
      expect(Math.abs(Math.hypot(c.x[p] - 90, c.y[p] - 60) - 40)).toBeLessThan(1e-6);
      /* the tangent across the slope, the disc (where the field is above the level) on its right, y down */
      const [rx, ry] = [-c.ty[p], c.tx[p]];
      expect(rx * (90 - c.x[p]) + ry * (60 - c.y[p])).toBeGreaterThan(0.99 * 40);
    }
    /* fitted, its cubics stay within the tolerance of the circle */
    const d = kitPath([kitFit(c, { tolerance: 0.1, places: 2 })], 2);
    expect(d).toMatch(/^M[\d.]+ [\d.]+(c[-\d. ]+)+z$/);
  });

  it("says a level the box lies wholly above or below, and closes a loop that leaves the box along the margin", () => {
    /* the box lies wholly above -200 and below 10; -90 cuts it, and runs past the grid's top and bottom */
    const [all, cut, none] = trace(cone(100, 60), [-200, -90, 10]);
    expect(all).toBe("all");
    expect(none).toBe("none");
    const loops = cut as KitContour[];
    expect(loops).toHaveLength(1);
    const c = loops[0];
    /* its points off the level lie on the margin's ring, past the box by the reach and two cells */
    const off = c.x.map((_, p) => p).filter(p => !c.on[p]);
    expect(off.length).toBeGreaterThan(0);
    for (const p of off)
      expect(c.x[p] < -6 || c.x[p] > box.width + 6 || c.y[p] < -6 || c.y[p] > box.height + 6).toBe(
        true
      );
    /* written, the ring's stretches are lines, the level's cubics */
    const d = kitPath([kitFit(c, { tolerance: 0.1, places: 1 })], 1);
    expect(d).toMatch(/l/);
    expect(d).toMatch(/c/);
  });

  it("runs a loop the other way round as asked, so a band's two edges fill alike by either rule", () => {
    const [ring] = trace(cone(90, 60), [-40]) as KitContour[][];
    /* a path's signed area, its cubics read at 64 points each: positive clockwise on the screen (y down) */
    const area = (d: string) =>
      pathRuns(d).reduce((sum, { cubics }) => {
        const p = cubics.flatMap(c =>
          Array.from({ length: 64 }, (_, i) => {
            const t = i / 64;
            const s = 1 - t;
            const w = [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t];
            return [0, 1].map(k => w.reduce((v, b, j) => v + b * c[j][k], 0));
          })
        );
        return (
          sum +
          p.reduce(
            (a, [x, y], i) => a + x * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * y,
            0
          ) /
            2
        );
      }, 0);
    const fit = { tolerance: 0.1, places: 2 };
    const forward = area(kitPath([kitFit(ring[0], fit)], 2));
    const back = area(kitPath([kitFit(ring[0], fit, true)], 2));
    /* the disc on its right: clockwise round it, its area the circle's within the fit's 0.1 px of its 40 */
    expect(Math.abs(forward / (Math.PI * 40 * 40) - 1)).toBeLessThan(0.005);
    expect(Math.abs(back / forward + 1)).toBeLessThan(0.002);
  });

  it("draws a line's band where the box's lowest field lies inside it, its lower edge the whole box", () => {
    /* a ramp whose lowest value in the box (-0.4) lies inside line 0's band, -0.41 to -0.39 */
    const ramp: FieldEffect = {
      ...demo,
      kind: "ramp",
      field: x => 0.6 * x,
      sheets: null,
      lines: { base: -0.4, step: 0.5, half: 0.01, colors: "lightest", alpha: 0.8 }
    };
    const size = { width: 320, height: 180 };
    const m = kitScene(ramp, P, { angle: 90, shape: null }, size);
    const lo = ramp.field(-size.width / 2 / m.D, 0, m.U, []);
    expect(lo).toBeGreaterThan(-0.41);
    expect(lo).toBeLessThan(-0.39);
    const svg = kitFrameSvg(ramp, P, { angle: 90, shape: null }, size, 0);
    const d = frameDiff(rasterize(svg, size.width), kitRender(m, 0), size.width, size.height);
    expect(d).toSatisfy(within);
  });

  it("closes every loop round where the field is not finite, its levels over the finite values", () => {
    /* the grid's nodes lie 3 px apart from -15, so (99, 60) is one: a pole of minus infinity there, one of plus
       infinity, and a dome that is not a number past its edge, 40 px out */
    const sink = (x: number, y: number) => 0.1 * Math.log((x - 99) ** 2 + (y - 60) ** 2);
    const peak = (x: number, y: number) => 1 / ((x - 99) ** 2 + (y - 60) ** 2);
    const dome = (x: number, y: number) => Math.sqrt(1600 - (x - 99) ** 2 - (y - 60) ** 2) - 20;
    /* each point a cell's diagonal or so from the next, the last from the first: no chain left open */
    const closed = (c: KitContour) =>
      c.x.every((x, p) => {
        const q = (p + 1) % c.x.length;
        return Math.hypot(c.x[q] - x, c.y[q] - c.y[p]) < 1.5 * 3 * Math.SQRT2;
      });
    for (const [field, levels, rings] of [
      [sink, [0, 0.5, 0.8], [null, Math.exp(2.5), Math.exp(4)]],
      [peak, [0.0004, 0.01], [50, 10]],
      [dome, [-30, -10], [null, Math.sqrt(1500)]]
    ] as const) {
      const { lo, hi, traced } = traceOf(field, [...levels]);
      expect(Number.isFinite(lo) && Number.isFinite(hi)).toBe(true);
      for (const [k, level] of traced.entries()) {
        expect(Array.isArray(level), `${field.name} at ${levels[k]}`).toBe(true);
        for (const c of level as KitContour[]) {
          expect(closed(c), `${field.name} at ${levels[k]}`).toBe(true);
          /* a ring's points on the level are on its circle, within a hundredth of a pixel */
          const r = rings[k];
          if (r !== null)
            for (let p = 0; p < c.x.length; p++)
              if (c.on[p] && Math.hypot(c.x[p] - 99, c.y[p] - 60) < r + 10)
                expect(Math.abs(Math.hypot(c.x[p] - 99, c.y[p] - 60) - r)).toBeLessThan(0.01);
        }
      }
    }
    /* the dome's -30, below every finite value, runs round where it is finite, on no level: the disc, a cell or less
       inside its edge, not the whole box */
    const [edge] = traceOf(dome, [-30]).traced as KitContour[][];
    expect(edge).toHaveLength(1);
    expect(edge[0].on.every(on => on === 0)).toBe(true);
    const area = edge[0].x.reduce(
      (a, x, p, xs) =>
        a + (x * edge[0].y[(p + 1) % xs.length] - xs[(p + 1) % xs.length] * edge[0].y[p]) / 2,
      0
    );
    expect(area).toBeGreaterThan(Math.PI * 37 * 37);
    expect(area).toBeLessThan(Math.PI * 40 * 40);
  });

  it("draws a pole on a node of the grid as the CPU draws it, a field with no finite value as its ground, and refuses one past a thousand levels", () => {
    /* minus infinity at the design's middle, a node of a frame's grid in an even box, which no pixel's middle is */
    const pole: FieldEffect = {
      ...demo,
      kind: "pole",
      field: (x, y, _U, F) => 0.1 * Math.log(x * x + y * y) + 0.05 * Math.sin(4 * x + F[0])
    };
    const size = SIZES[0];
    for (const look of LOOKS) {
      const svg = kitFrameSvg(pole, P, look, size, 0);
      const cpu = kitRender(kitScene(pole, P, look, size), 0);
      expect(frameDiff(rasterize(svg, size.width), cpu, size.width, size.height)).toSatisfy(within);
    }
    const blank = kitFrameSvg(
      { ...demo, kind: "blank", field: () => Number.NaN },
      P,
      LOOKS[0],
      size,
      0
    );
    expect(blank).not.toMatch(/<path/);
    /* a constant off by powers of ten: its lines would be millions */
    expect(() =>
      kitFrameSvg({ ...demo, kind: "steep", field: x => 1e6 * x }, P, LOOKS[0], size, 0)
    ).toThrow(
      /^steep: its field runs from -?[\d.e+]+ to [\d.e+]+ over the box, \d+ levels, past the 1000/
    );
  });
});
