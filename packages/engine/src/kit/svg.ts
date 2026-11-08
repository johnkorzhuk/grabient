/* A field effect as SVG (types.ts): any frame of it is a plain SVG of flat shapes, the field's levels traced
   (trace.ts), laid as kitShade (shade.ts) lays its pixel, in painter's order: a rect of the ground, or of the highest
   sheet that covers the box whole; then each sheet above it, its shadow (its path moved by the shadow's move, in its
   color at the shadow's alpha; a soft shadow's every layer the contour of the sheet's level raised, moved so, in that
   color at its share of the alpha), its rim (its path moved toward the light, in its color at the rim's alpha) and
   itself, a sheet's shadow the ink or the sheet below it darkened and its rim white or its own color lit, as shade.ts's
   kitShadowColor and kitRimColor give them; then each line, the band between its two edges' levels, its upper edge's
   loops run the other way, so the band fills alike by either rule, whichever a design app's importer takes. Where
   kitShade covers a pixel by a ramp a pixel wide across an edge, a rasterizer covers it by the path's area: the same
   picture wherever the levels lie a pixel apart or more. The loops depend on the effect, the view (its angle and
   shape), the box and the time alone, never on the palette, so a still's and a file's are kept by these
   (KIT_TRACES_KEPT), and each palette writes its colors about them.
   - The still (kitStillSvg, kitStillSteps): the frame at t = 0 in the design square, traced coarser, each sheet's path
     written once and its shadow and its rim a <use> of it moved, written a step at a time; what a list's card, a
     page's first paint and the stylesheet paint.
   - Any frame's SVG (kitFrameSvg) and the file's (kitFileSvg: the first frame, at any speed, as the papercut's and the
     strings' are), traced finer, every layer a path of its own with no <use>, no filter and no mask, which a design
     app's importer takes as it is, Figma's among them, which is how a field effect goes into Figma (kitFrameLayers). */
import type { Palette } from "../palette.ts";
import { type FitHow, svgNumber as fmt } from "../svg-fit.ts";
import type { Size } from "../view.ts";
import { KIT_KINDS } from "./kinds.ts";
import {
  type KitScene,
  type KitView,
  kitFrame,
  kitHex,
  kitLineColor,
  kitScene,
  kitSheetColor,
  kitTurnX,
  kitTurnY
} from "./scene.ts";
import { kitRimColor, kitScratch, kitShadowColor, kitShadowSteps } from "./shade.ts";
import {
  type KitLoop,
  type KitTraceHow,
  kitBoxLoop,
  kitFitSteps,
  kitPath,
  kitTraceSteps
} from "./trace.ts";
import type { FieldEffect } from "./types.ts";

/** The side of the square a still is drawn in, as fx-still.ts's FX_STILL_SIDE (which kit/svg.test.ts holds it to):
    its numbers are a box's, scaled to cover it. */
export const KIT_STILL_SIDE = 1000;
const SQUARE: Size = { width: KIT_STILL_SIDE, height: KIT_STILL_SIDE };

/** How a drawing traces its levels: the grid's step (px), how its curves are fitted and written, and how its lines'
    are where theirs differ. */
interface Trace extends FitHow {
  step: number;
  lines?: FitHow;
}

/** The still's trace: a grid of 240 cells across the longer side (4.2 px at the design square's thousand, 1.3 at 320
    by 180), curves within 0.4 px at the thousand, every coordinate a whole pixel there but a line's, a half, the
    shadows' and the rims' moves exact in their <use>s. A line along a valley of the field, whose band is one level's
    loop about the valley's floor, falls into dashes where it is thinner than a cell, as the guilloche candidate's ropes
    (1.5 to 1.9 px wide in a 320 px box) did on 180 cells: its still 0.9% far from its first frame at 320 by 180, and
    0.6% at the design square (svg.test.ts's ropes hold the grid to it). Measured 8 Nov 2026 against the first frame's
    SVG over the twelve candidates, the demo and the tracer's test fields (jumps, kinks, seams, soft shadows, the
    ropes), at 320 by 180, 640 by 360 and the design square, four looks each: on 240 cells every one lies within a mean
    of 0.53, a p99 of 3.7 and 0.20% far in the two boxes, and of 0.74, 7.5 and 0.39% at the design square, its worst
    the whole pixels there on the two candidates of fine lines, the guilloche's and one of rings of ink. A line's band
    in whole pixels there has both its edges rounded, up to a pixel too wide or too narrow, and the rings, lines alone,
    ink near black on pale paper in the near-black palette (test/kit-checks.ts's black, the most contrast a palette
    gives), lay a p99 of 8.3 to 8.8 and 0.45 to 0.53% far from their first frame at the design square over four looks,
    past kit-check's 8; their lines in halves of a pixel, 5.2 to 5.4 and 0.02 to 0.05% (4.4 at most in the six other
    palettes), their background 25.4 to 33.5 KiB over 30 shapes and four angles where whole pixels wrote 19.9 to 26.2 (a
    decimal took the p99 to 4.5 and the background to 39.9 KiB; a grid of 360 or 480 cells changed neither). A sheet's
    edge keeps its whole pixel: the next level's color lies a step of the palette away, and the zen garden's and the
    sandstone's stills lie within a p99 of 2.1 and 1.0 of their first frames there. The demo's still at the design
    square takes 25 to 36 ms a view no still has kept (15 to 20 on 180 cells), 98 thousand reads of its field, in some
    100 steps of 1.4 ms at most; over 30 shapes and four angles the zen garden's 29 to 51 ms in 153 to 173 steps, and
    the sandstone's 27 to 51 in 146 to 192 (35 to 71 in 197 to 260 at its 40 steps), 32 and 33 at the median, each
    still's longest step 1.4 ms at the median (8 Nov 2026). Kept by the view, a list of cards at one look traces
    once. */
const STILL_TRACE = (m: KitScene): Trace => {
  const side = Math.max(m.width, m.height);
  /* a still drawn in a box under the design square's keeps a whole pixel of that square, a tenth of one at 320 by
     180, where the candidate's rings of ink, a still of whole pixels there, lay 1.9 to 2.2 from their first frame
     (8 Nov 2026) */
  const places = Math.max(0, Math.ceil(Math.log10(KIT_STILL_SIDE / side) - 1e-9));
  const tolerance = (0.4 * side) / 1000;
  /* a line's band in half pixels where the sheets are whole, each written with its decimal */
  const lines = places ? undefined : { tolerance, places: 1, unit: 0.5 };
  return { step: side / 240, tolerance, places, lines };
};
/** A frame's and the file's trace: a grid of 480 cells across the longer side, a pixel at least and three at most,
    curves within 0.1 px, a decimal each. The demo has room to spare in it for an effect of finer detail: its frames
    keep within a mean of 0.1 and a p99 of 0.7 of the CPU's at 320 by 180 and 640 by 360 even on a grid of 60 cells
    (7 Nov 2026). A frame at 1920 by 1080 takes 60 to 75 ms quiet (105 to 117 loaded) and 16 to 20 KiB, where the CPU
    draws it in 1.6 s; the candidates' frames at that size lie within a p99 of 1.8 of the CPU's (8 Nov 2026). */
const FRAME_TRACE = (m: KitScene): Trace => ({
  step: Math.min(3, Math.max(1, Math.max(m.width, m.height) / 480)),
  tolerance: 0.1,
  places: 1
});

/** A frame's levels as the drawing lays them, the palette's colors aside: the highest sheet that covers the box whole
    (null for none: the ground shows), each sheet above it that shows (its loops, and those of its soft shadow's
    raised levels that show) and each line, its loops, the frame's shadow's and rim's moves (px), and the decimals
    its sheets' and its lines' paths are written with. */
interface Traced {
  base: number | null;
  sheets: { k: number; loops: KitLoop[]; raised: KitLoop[][] }[];
  lines: { j: number; loops: KitLoop[] }[];
  shadow: readonly [number, number];
  rim: readonly [number, number];
  places: number;
  linePlaces: number;
}

/** The most levels a frame traces: ten times the busiest candidate's (the op art's 92 at 640 by 360, 8 Nov 2026). A
    field spanning more is one gone wrong (a pole its kernel leaves unguarded, a constant off by powers of ten), which
    fails here, by its effect's name, where it would trace on for minutes and write megabytes. */
const KIT_LEVELS = 1000;

/** The levels a drawing traces for a field running from lo to hi over the grid: each sheet's from the highest that
    lies below lo (which covers the box whole) to the first above hi, its soft shadow's layers past its own (`steps`,
    each `rise` above the one before: kitShadowSteps), and each line's two edges; ascending, each once. The levels
    are the scene's, as the view's steps space them (kitScene's sheetStep and lineStep). */
function plan(m: KitScene, lo: number, hi: number, steps: number, rise: number) {
  const def = m.def;
  const sheets: { k: number; level: number; raised: number[] }[] = [];
  const lines: { j: number; lo: number; hi: number }[] = [];
  /* a field the grid found no finite value of shows no level */
  if (!(lo <= hi)) return { levels: [], sheets, lines };
  const S = def.sheets;
  const L = def.lines;
  const sheetStep = m.sheetStep;
  const lineStep = m.lineStep;
  let k0 = 0;
  let k1 = -1;
  if (S) {
    k0 = Math.floor((lo - S.base) / sheetStep);
    k1 = Math.ceil((hi - S.base) / sheetStep);
    if (S.count !== null) {
      k0 = Math.min(S.count - 1, Math.max(0, k0));
      k1 = Math.min(S.count - 1, Math.max(0, k1));
    }
  }
  const j0 = L ? Math.ceil((lo - L.half - L.base) / lineStep) : 0;
  const j1 = L ? Math.floor((hi + L.half - L.base) / lineStep) : -1;
  const count = (k1 - k0 + 1) * Math.max(1, steps) + 2 * (j1 - j0 + 1);
  if (!(count <= KIT_LEVELS))
    throw new Error(
      `${def.kind}: its field runs from ${lo} to ${hi} over the box, ${count} levels, past the ${KIT_LEVELS} a drawing traces`
    );
  if (S)
    for (let k = k0; k <= k1; k++) {
      const level = S.base + k * sheetStep;
      sheets.push({
        k,
        level,
        raised: Array.from({ length: steps - 1 }, (_, s) => level + (s + 1) * rise)
      });
    }
  if (L)
    for (let j = j0; j <= j1; j++) {
      const level = L.base + j * lineStep;
      lines.push({ j, lo: level - L.half, hi: level + L.half });
    }
  const levels = [
    ...new Set([
      ...sheets.flatMap(s => [s.level, ...s.raised]),
      ...lines.flatMap(l => [l.lo, l.hi])
    ])
  ].sort((a, b) => a - b);
  return { levels, sheets, lines };
}

/** A frame's levels at t traced (Traced), a step at a time: the trace's (trace.ts), then each sheet's and line's loops
    fitted. */
function* tracedSteps(m: KitScene, how: Trace, t: number): Generator<void, Traced> {
  const def = m.def;
  const { width: W, height: H, D, U } = m;
  const at = kitFrame(m, t);
  const F = at.subarray(0, def.tracks);
  const n = def.tracks;
  const shadow = [at[n] * D, at[n + 1] * D] as const;
  const rim = [at[n + 2] * D, at[n + 3] * D] as const;
  const S = def.sheets;
  /* a sheet's copies reach as far as their moves, and a pixel's ramp past them */
  const reach =
    1 + Math.max(S?.shadow ? Math.hypot(...shadow) : 0, S?.rim ? Math.hypot(...rim) : 0);
  const field = (x: number, y: number) => {
    const qx = (x - W / 2) / D;
    const qy = (y - H / 2) / D;
    return def.field(kitTurnX(m, qx, qy), kitTurnY(m, qx, qy), U, F);
  };
  const trace: KitTraceHow = { step: how.step, reach };
  const { steps, rise } = kitShadowSteps(m);
  const { lo, hi, levels, traced } = yield* kitTraceSteps(
    field,
    m,
    trace,
    (a, b) => plan(m, a, b, steps, rise).levels
  );
  const laid = plan(m, lo, hi, steps, rise);
  const of = (level: number) => traced[levels.indexOf(level)];
  let base: number | null = null;
  for (const s of laid.sheets) if (of(s.level) === "all") base = s.k;
  const sheets: Traced["sheets"] = [];
  for (const s of laid.sheets) {
    const loops = of(s.level);
    if ((base !== null && s.k <= base) || !Array.isArray(loops)) continue;
    yield;
    const fitted = yield* kitFitSteps(loops, how);
    /* a raised level that covers the box whole lies under its sheet, which covers it too */
    const raised: KitLoop[][] = [];
    for (const r of s.raised.map(of)) if (Array.isArray(r)) raised.push(yield* kitFitSteps(r, how));
    sheets.push({ k: s.k, loops: fitted, raised });
  }
  const lines: Traced["lines"] = [];
  const fit = how.lines ?? how;
  for (const l of laid.lines) {
    const below = of(l.lo);
    const above = of(l.hi);
    /* the band is where the field is above its lower edge's level and not its upper's */
    if (below === "none" || above === "all") continue;
    yield;
    const loops = below === "all" ? [kitBoxLoop(m, trace)] : yield* kitFitSteps(below, fit);
    if (above !== "none") loops.push(...(yield* kitFitSteps(above, fit, true)));
    lines.push({ j: l.j, loops });
  }
  return { base, sheets, lines, shadow, rim, places: how.places, linePlaces: fit.places };
}

/** Traces kept by the scene's effect, view and box, the least lately used out first: a still's (a list's cards at one
    angle and shape trace them once, each card writing its colors about them) and a file's first frame (its SVG). The
    effect is told apart by the object it is, not its name alone, so a recipe tried in variants under one name draws
    each its own. A still's are as many as a list's thirty cards and two more, and one for each field effect besides,
    the Appearance menu's tile of each at the palette's look (apps/web Corner.tsx): with 32 alone, 40 field effects'
    tiles put out their own traces in one pass, so a palette changed while the menu stood open traced every tile again,
    1.6 to 2.4 s where 30 effects' took 12 to 16 ms (8 Nov 2026). A trace at the design square holds about a still's
    background, 11 to 29 KiB (up to 23 at the sandstone's 40 steps). */
export const KIT_TRACES_KEPT = { still: 32 + KIT_KINDS.length, file: 4 } as const;
const stillTraces = new Map<string, Traced>();
const fileTraces = new Map<string, Traced>();
const effects = new WeakMap<FieldEffect, number>();
let named = 0;
function* kept(
  map: Map<string, Traced>,
  most: number,
  m: KitScene,
  trace: () => Generator<void, Traced>
): Generator<void, Traced> {
  let effect = effects.get(m.def);
  if (effect === undefined) {
    effect = ++named;
    effects.set(m.def, effect);
  }
  const key = `${effect}|${m.view}|${m.width}|${m.height}`;
  let traced = map.get(key);
  if (traced !== undefined) map.delete(key);
  else {
    traced = yield* trace();
    /* another drawing of the view may have kept them meanwhile */
    map.delete(key);
    if (map.size >= most) map.delete(map.keys().next().value as string);
  }
  map.set(key, traced);
  return traced;
}

/** Steps run through at once. */
function atOnce<T>(steps: Generator<void, T>): T {
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

const svgOpen = ({ width: W, height: H }: KitScene) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
/* each color written into a Float64Array, as kitShade writes them a pixel: a plain array handed to the same writers
   left every later call of theirs in the isolate slower, a zen garden's still for a page's head taking another field
   effect's card that followed (kitRender at 1200 by 630) from 0.82 s to 1.9 s (8 Nov 2026) */
const sheetHex = (m: KitScene, k: number) => {
  const c = kitScratch();
  kitSheetColor(m, k, c);
  return kitHex(c);
};
const lineHex = (m: KitScene, j: number) => {
  const c = kitScratch();
  kitLineColor(m, j, c);
  return kitHex(c);
};
const groundHex = (m: KitScene, base: number | null) =>
  base === null ? kitHex(m.ground) : sheetHex(m, base);
/* sheet k's shadow's and rim's colors, each as the shading takes it: the ink and white where the recipe leaves them */
const shadowHex = (m: KitScene, k: number) => {
  const c = kitScratch();
  kitShadowColor(m, k, c);
  return kitHex(c);
};
const rimHex = (m: KitScene, k: number) => {
  const c = kitScratch();
  kitRimColor(m, k, c);
  return kitHex(c);
};
const opacity = (alpha: number) => (alpha < 1 ? ` fill-opacity="${fmt(alpha, 3)}"` : "");

/** A layer of a frame's drawing over its ground, as its SVG lays it: its path's data (evenodd), its color and alpha,
    its name and its group's ("sheet 1" and "line 1" the lowest the frame shows, counted up from there), and the level
    it draws (its sheet's k or its line's j), which its color is worked out from and no name shows: a periodic sheet's k
    runs below 0, and a stack's lowest sheets folded into the ground leave its first shown at 3 or more. */
export interface KitLayer {
  group: string;
  name: string;
  level: number;
  d: string;
  hex: string;
  alpha: number;
}
/** A frame's drawing: the box's fill under every layer, and the layers bottom to top. */
export interface KitLayers {
  ground: string;
  layers: KitLayer[];
}

/** A traced frame's layers in a palette's colors. */
function layersOf(m: KitScene, d: Traced): KitLayers {
  const S = m.def.sheets;
  const L = m.def.lines;
  /* each of a shadow's layers in the sheet's shadow's color, at its share of the shadow's alpha */
  const share = S?.shadow ? S.shadow.alpha / kitShadowSteps(m).steps : 0;
  const layers: KitLayer[] = [];
  for (const [n, { k, loops, raised }] of d.sheets.entries()) {
    const group = `sheet ${n + 1}`;
    if (S?.shadow) {
      const hex = shadowHex(m, k);
      for (const ls of [loops, ...raised])
        layers.push({
          group,
          name: "shadow",
          level: k,
          d: kitPath(ls, d.places, ...d.shadow),
          hex,
          alpha: share
        });
    }
    if (S?.rim)
      layers.push({
        group,
        name: "rim",
        level: k,
        d: kitPath(loops, d.places, ...d.rim),
        hex: rimHex(m, k),
        alpha: S.rim.alpha
      });
    layers.push({
      group,
      name: "sheet",
      level: k,
      d: kitPath(loops, d.places),
      hex: sheetHex(m, k),
      alpha: 1
    });
  }
  if (L)
    for (const [n, { j, loops }] of d.lines.entries())
      layers.push({
        group: "lines",
        name: `line ${n + 1}`,
        level: j,
        d: kitPath(loops, d.linePlaces),
        hex: lineHex(m, j),
        alpha: L.alpha
      });
  return { ground: groundHex(m, d.base), layers };
}

/** A frame's SVG of its layers: every layer a path of its own, its fill, its alpha and its rule on it or its group,
    no <use> and no transform for an importer to resolve. */
function frameOf(m: KitScene, { ground, layers }: KitLayers): string {
  const paths = layers.map(l => `<path fill="${l.hex}"${opacity(l.alpha)} d="${l.d}"/>`);
  return (
    `${svgOpen(m)}<rect width="${m.width}" height="${m.height}" fill="${ground}"/>` +
    `<g fill-rule="evenodd">${paths.join("")}</g></svg>`
  );
}

/** The still's SVG of its traces: each sheet's path once, and its shadow, its rim and itself each a <use> of it (a
    soft shadow's raised levels each a path moved as the <use>s are), each <use> in its own layer's color.
    Measured at the design square over the conformance suite's four looks and test/kit-checks.ts's seven palettes
    (8 Nov 2026, on 240 cells, the lines in half pixels; each the same in every palette, a fill being seven characters
    whatever its color): the demo's background 10.4 to 11.4 KiB, where the same still with every layer a path of its
    own is 13.1 to 15.0 (each sheet's path written three times); the zen garden's 26.4 to 27.7, where it would be 69.3
    to 73.2. The sandstone's sheets, with neither shadow nor rim, have no layer to share a path with: each is a path and
    a <use> of it. A tinted shadow costs nothing, each <use> writing its fill already, and a tinted rim three bytes a
    sheet past white's #fff: the zen garden's 42 bytes more than in the ink and white. */
function stillOf(m: KitScene, d: Traced): string {
  const S = m.def.sheets;
  const L = m.def.lines;
  const share = S?.shadow ? S.shadow.alpha / kitShadowSteps(m).steps : 0;
  const move = ([x, y]: readonly [number, number]) => `translate(${fmt(x, 2)} ${fmt(y, 2)})`;
  const defs: string[] = [];
  const body: string[] = [];
  for (const { k, loops, raised } of d.sheets) {
    const id = `k${k}`;
    /* the path fixes no fill of its own: each <use> paints it in its layer's color */
    defs.push(`<path id="${id}" d="${kitPath(loops, d.places)}"/>`);
    if (S?.shadow) {
      const paint = `transform="${move(d.shadow)}" fill="${shadowHex(m, k)}"${opacity(share)}`;
      body.push(`<use href="#${id}" ${paint}/>`);
      /* a soft shadow's raised levels, each used once */
      for (const ls of raised) body.push(`<path ${paint} d="${kitPath(ls, d.places)}"/>`);
    }
    if (S?.rim) {
      /* white as #fff, three bytes lighter */
      const lit = rimHex(m, k);
      body.push(
        `<use href="#${id}" transform="${move(d.rim)}" fill="${lit === "#ffffff" ? "#fff" : lit}"${opacity(S.rim.alpha)}/>`
      );
    }
    body.push(`<use href="#${id}" fill="${sheetHex(m, k)}"/>`);
  }
  if (L)
    for (const { j, loops } of d.lines)
      body.push(
        `<path fill="${lineHex(m, j)}"${opacity(L.alpha)} d="${kitPath(loops, d.linePlaces)}"/>`
      );
  return (
    `${svgOpen(m)}<defs>${defs.join("")}</defs>` +
    `<rect width="${m.width}" height="${m.height}" fill="${groundHex(m, d.base)}"/>` +
    `<g fill-rule="evenodd">${body.join("")}</g></svg>`
  );
}

/** The still of a scene written a step at a time (its trace's grid 18 rows a step, then a level a step), unless its
    view's traces are kept; it returns the still. */
function* stillSteps(m: KitScene): Generator<void, string> {
  const traced = yield* kept(stillTraces, KIT_TRACES_KEPT.still, m, () =>
    tracedSteps(m, STILL_TRACE(m), 0)
  );
  return stillOf(m, traced);
}

/** The still of a palette and a view in the design square, written a step at a time, so a page drawing a list of them
    can give each frame its share and never hold the page; its scene too is made in the first step, not when the steps
    are asked for. */
export function* kitStillSteps(
  def: FieldEffect,
  P: Palette,
  view: KitView
): Generator<void, string> {
  return yield* stillSteps(kitScene(def, P, view, SQUARE));
}

/** The still of a palette and a view in a box, the design square unless said. */
export const kitStillSvg = (
  def: FieldEffect,
  P: Palette,
  view: KitView,
  size: Size = SQUARE
): string => atOnce(stillSteps(kitScene(def, P, view, size)));

/** The layers of a scene's frame at t (seconds of the loop at speed 1), traced as a frame is; the first frame's kept
    by the view: what the file's SVG draws. */
export const kitFrameLayers = (m: KitScene, t = 0): KitLayers =>
  layersOf(
    m,
    atOnce(
      t
        ? tracedSteps(m, FRAME_TRACE(m), t)
        : kept(fileTraces, KIT_TRACES_KEPT.file, m, () => tracedSteps(m, FRAME_TRACE(m), 0))
    )
  );

/** The frame at t seconds of the loop at speed 1 as a plain SVG of its own. */
export const kitFrameSvg = (
  def: FieldEffect,
  P: Palette,
  view: KitView,
  size: Size,
  t: number
): string => {
  const m = kitScene(def, P, view, size);
  return frameOf(m, kitFrameLayers(m, t));
};

/** The file's SVG of a palette and a view in a box: its first frame, at any speed. */
export const kitFileSvg = (def: FieldEffect, P: Palette, view: KitView, size: Size): string =>
  kitFrameSvg(def, P, view, size, 0);
