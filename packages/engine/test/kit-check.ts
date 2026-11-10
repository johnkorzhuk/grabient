/* The gate a field effect passes before anyone looks at it (kit/README.md): each check the site's suites hold a
   registered effect to, run on one file, a line each with its numbers, PASS or FAIL, and exit 1 on any failure.

     node packages/engine/test/kit-check.ts def=W/kit/candidates/<slug>/<slug>.ts
     node packages/engine/test/kit-check.ts def=packages/engine/src/kit/fields/strata.ts palettes=all json=strata.json

   def: a module whose default export is a FieldEffect, its kernel in that file (a candidate importing the kit by
   absolute path, or a registered kit/fields/<kind>.ts); palettes: names of kit-checks.ts's KIT_PALETTES or palettes'
   seeds, or all seven (vivid,pastel,dark unless said), checks 6 and 7 drawn in each and the rest in the first; json: a
   file every check's numbers are written to, for the gallery. The checks, with the limits of the suites that hold a
   registered effect (compile.test.ts, fields.test.ts, effect-conformance.test.ts with CONFORMANCE=deep, svg.test.ts):
   1. kernel: it compiles (kit/compile.ts), costing at most KIT_KERNEL_BUDGET.
   2. design: its kind lower-case letters, its loop and span positive, and at its designed seed and at 7 and 417 every
      list as long as `uniforms` says and no other, `tracks` tracks, every number kitRound's, whole cycles, and the
      same design asked twice.
   3. finite: its kernel finite wherever a box shows it, turned to any angle with its shadow's and rim's points, at
      every shape and time (kit-checks.ts kitFinite, kitReach).
   4. loop: the loop ends on its first frame: in the suite's two looks at 320 by 180, the CPU's step over its end (the
      frame 1/60 s before it against its first) at most twice the larger of the steps beside it. Frames at t and
      t + loop always match, since kitFrameAt reduces t to the loop; a track making part of a cycle jumps here.
   5. moves: in each of the deep sweep's four looks, twelve frames across the loop (160 by 90) every two apart, and the
      frame 0.13 of the loop after each of them (320 by 180) past the frame limits from it, as the suite's "a frame
      later" holds an SVG: a design symmetric about the half loop draws one frame twice.
   6. frames: each frame as an SVG (kitFrameSvg, drawn by resvg) within the frame limits of the CPU's (kitRender) at
      320 by 180 and 640 by 360, angle 90 as designed and 210 at shape 417, 0, 0.37 and 0.71 of the loop.
   7. still: run a step at a time (kitStillSteps) in the design square, its CSS background (fx-still.ts fxCover) under
      40 KiB at angle 90 as designed, 210 at 417 and 0 at 7, the first two within the frame limits of their first
      frame's SVG there and at 320 by 180, and its trace's ms, with what a list's first screen of stills costs the
      server at that pace (reported, held to no limit).
   8. crowding: levels under a pixel apart (kit-checks.ts kitCrowding) on at most 0.2% of a frame at 320 by 180, in
      three looks at three times.
   An effect that takes the view's steps (types.ts KitSteps) is checked at its designed steps, and at the ends of its
   range where they are hardest to keep: its levels' crowding and its still's bytes at its most steps (checks 8 and 7),
   its motion at its fewest (check 5), where its bands are widest; check 2 holds its range itself.
   9. cost: kitRender's ns a pixel at 480 by 270, a card's pixels drawn within KIT_CARD_DEMOS times the demo's (drawn
      in turn with it, so the machine's other work weighs on both alike), and its clips' weight (video.ts
      kitVideoWeight). A candidate's clips' bitrate can't be measured here: the clips' module holds the kernels of the
      registered effects alone (kit:gen), so a registered effect's is measured once its kernel is in (video.ts
      VIDEO_QUALITY).
   The frame limits are the suite's: OKLab mean < 1.5, p99 < 8, far < 0.6% (raster.ts frameDiff). Measured 8 Nov 2026,
   five files at once on this machine: 19 to 38 s a file in three palettes, 44 to 64 s in seven, most of it checks 5
   to 7. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { kitShadowRun } from "../scripts/kit-gen.ts";
import { decodePalette } from "../src/codec.ts";
import { srgbToOklab } from "../src/color.ts";
import { fxCover } from "../src/fx-still.ts";
import { compileKernel, KIT_KERNEL_BUDGET } from "../src/kit/compile.ts";
import demo from "../src/kit/fields/demo.ts";
import { kitRender } from "../src/kit/render.ts";
import { type KitView, kitRound, kitScene } from "../src/kit/scene.ts";
import { KIT_STILL_SIDE, kitFrameSvg, kitStillSteps, kitStillSvg } from "../src/kit/svg.ts";
import type { FieldEffect } from "../src/kit/types.ts";
import type { Palette } from "../src/palette.ts";
import { kitVideoWeight } from "../src/video.ts";
import type { Size } from "../src/view.ts";
import {
  KIT_CROWDED,
  KIT_CROWDING_SIZE,
  KIT_PALETTES,
  KIT_SHAPES,
  kitCrowding,
  kitFinite,
  kitReach
} from "./kit-checks.ts";
import { type FrameDiff, frameDiff, rasterize, resvgReady } from "./raster.ts";

/** What a check found: whether it passed, its words and numbers, and its numbers alone for the gallery. */
export interface KitFound {
  pass: boolean;
  says: string;
  numbers: Record<string, unknown>;
}
/** A check as it ran: its number and name in the gate's order, and how long it took. */
export interface KitCheck extends KitFound {
  n: number;
  name: string;
  ms: number;
}
/** The palettes checks 6 and 7 draw in, each by its name. */
export type Palettes = readonly (readonly [string, Palette])[];
/** Two drawings' difference, and where. */
interface Compared {
  d: FrameDiff;
  at: string;
}

const FRAME_LIMIT = { mean: 1.5, p99: 8, far: 0.006 };
const within = (d: FrameDiff) =>
  d.mean < FRAME_LIMIT.mean && d.p99 < FRAME_LIMIT.p99 && d.far < FRAME_LIMIT.far;
/** How near a difference comes to the limits, 1 at them. */
const toLimit = (d: FrameDiff) =>
  Math.max(d.mean / FRAME_LIMIT.mean, d.p99 / FRAME_LIMIT.p99, d.far / FRAME_LIMIT.far);
const STILL_BYTES = 40 * 1024;
/** The stills a list's first screen names, each traced at its own palette's shape (apps/web server/stills.ts
    FIRST_SCREEN_STILLS), which the server draws into the page: 16 stills of the strings took 1.1 s here, the
    sandstone's 0.7 to 0.9, the papercut's 0.2 (8 Nov 2026). Held to no limit: reported. */
const FIRST_SCREEN = 16;
/** Two frames whose mean OKLab difference is under this are the one picture, as the suite's loop's end reads them. */
const ALIKE = 0.05;

/** The suite's looks, and the deep sweep's two more. */
const LOOKS: KitView[] = [
  { angle: 90, shape: null },
  { angle: 210, shape: 417 }
];
const DEEP_LOOKS: KitView[] = [...LOOKS, { angle: 0, shape: 7 }, { angle: 137, shape: 999 }];
const TIMES = [0, 0.37, 0.71];
const SMALL: Size = { width: 320, height: 180 };
const SIZES: Size[] = [SMALL, { width: 640, height: 360 }];
const SQUARE: Size = { width: KIT_STILL_SIDE, height: KIT_STILL_SIDE };

const lookText = (look: KitView) =>
  `angle ${look.angle}, shape ${look.shape ?? 0}${look.steps == null ? "" : `, ${look.steps} steps`}`;
/** Looks at a number of steps, for an effect that takes them: none for one that takes none. */
const atSteps = (def: FieldEffect, looks: readonly KitView[], end: "least" | "most"): KitView[] =>
  def.steps ? looks.map(look => ({ ...look, steps: def.steps?.[end] })) : [];
const diffText = (d: FrameDiff) =>
  `mean ${d.mean.toFixed(2)}, p99 ${d.p99.toFixed(2)}, far ${(d.far * 100).toFixed(2)}%`;
const diffNumbers = (d: FrameDiff) => ({
  mean: +d.mean.toFixed(3),
  p99: +d.p99.toFixed(3),
  far: +d.far.toFixed(5)
});
/** A few of a list's words, and how many more. */
const some = (list: string[], most = 3) =>
  list.slice(0, most).join("; ") + (list.length > most ? `; and ${list.length - most} more` : "");

/** 1. The kernel compiles from its file, within the budget. */
export function kernelCheck(def: FieldEffect, source: string, file?: string): KitFound {
  const { kind, uniforms, tracks } = def;
  const { cost } = compileKernel(source, { name: def.field.name, kind, uniforms, tracks, file });
  return {
    pass: cost <= KIT_KERNEL_BUDGET,
    says: `${def.field.name} compiles, costing ${cost} of ${KIT_KERNEL_BUDGET}`,
    numbers: { cost, budget: KIT_KERNEL_BUDGET }
  };
}

/** 2. The design is what the effect says it holds, in numbers every format writes alike, the same each time. */
export function designCheck(def: FieldEffect): KitFound {
  const problems: string[] = [];
  if (!/^[a-z]+$/.test(def.kind)) problems.push(`its kind "${def.kind}" is not lower-case letters`);
  if (!(def.loop > 0) || !(def.span > 0))
    problems.push(`its loop ${def.loop}, its span ${def.span}`);
  const seeds = [def.designedSeed, 7, 417];
  for (const seed of seeds) {
    const d = def.design(seed);
    if (JSON.stringify(d) !== JSON.stringify(def.design(seed)))
      problems.push(`seed ${seed}: asked again, another design`);
    for (const [name, length] of Object.entries(def.uniforms))
      if (d.U[name]?.length !== length)
        problems.push(
          `seed ${seed}: ${name} holds ${d.U[name]?.length ?? "no"} numbers, not ${length}`
        );
    for (const name of Object.keys(d.U))
      if (!(name in def.uniforms)) problems.push(`seed ${seed}: ${name}, a list uniforms lacks`);
    if (d.tracks.length !== def.tracks)
      problems.push(`seed ${seed}: ${d.tracks.length} tracks, not ${def.tracks}`);
    const numbers: [string, number][] = [
      ...Object.entries(d.U).flatMap(([name, list]) =>
        [...list].map((v, i): [string, number] => [`${name}[${i}]`, v])
      ),
      ...d.tracks.flatMap((v, i): [string, number][] => [
        [`tracks[${i}].rest`, v.rest],
        [`tracks[${i}].swing`, v.swing],
        [`tracks[${i}].psi`, v.psi]
      ])
    ];
    for (const [name, v] of numbers)
      if (!(Number.isFinite(v) && v === kitRound(v)))
        problems.push(`seed ${seed}: ${name} ${v}, not kitRound's`);
    d.tracks.forEach((v, i) => {
      if (!Number.isInteger(v.cycles))
        problems.push(`seed ${seed}: tracks[${i}] makes ${v.cycles} cycles`);
    });
  }
  /* the view's steps, where it takes them: whole numbers from 1, the designed between the fewest and the most, and a
     stack that runs on, since a counted stack's count stays as its levels close and its top would fall with them */
  const range = def.steps;
  if (range) {
    const { least, most, designed } = range;
    if (
      ![least, most, designed].every(Number.isInteger) ||
      !(1 <= least && least <= designed && designed <= most)
    )
      problems.push(
        `its steps ${least} to ${most}, ${designed} as designed: whole numbers from 1, the designed between`
      );
    if (def.sheets && def.sheets.count !== null)
      problems.push(
        `its ${def.sheets.count} sheets take steps: a counted stack's top falls as its levels close, so give steps to a stack that runs on (count null)`
      );
  }
  return {
    pass: problems.length === 0,
    says: problems.length
      ? some(problems)
      : `seeds ${seeds.join(", ")}: its ${Object.keys(def.uniforms).length} lists and ${def.tracks} tracks as said, every number kitRound's, whole cycles, the same twice${range ? `; its steps ${range.least} to ${range.most}, ${range.designed} as designed` : ""}`,
    numbers: { seeds, problems, ...(range ? { steps: range } : {}) }
  };
}

/** 3. The kernel is finite wherever a box shows it. */
export function finiteCheck(def: FieldEffect, P: Palette): KitFound {
  const { samples, failed, first } = kitFinite(def, P);
  const reach = +kitReach(def).toFixed(3);
  return {
    pass: failed === 0,
    says: failed
      ? `${failed} of ${samples} reads not finite within ${reach} D of the middle: ${some(first)}`
      : `finite at ${samples} reads within ${reach} D of the middle (a turned box's corners, its shadow's and rim's points), ${KIT_SHAPES.length} shapes and 5 times of the loop`,
    numbers: { samples, failed, first, reach }
  };
}

/** A frame step at speed 1: a 60 fps player's. */
const STEP = 1 / 60;
/** How many times the larger of the steps beside it the step over the loop's end may be: 0.95 to 1.05 in every
    effect and candidate of 8 Nov 2026, 1.8 to 95 where a track makes a cycle and a half, two and a half, or 1.01. */
const WRAP_TIMES = 2;
/** Steps this small are the one picture, whatever the steps beside them (the mean's ALIKE, and a p99 as far under
    any eye's notice), so a still or near still loop's noise is no jump. */
const WRAP_FLOOR = { mean: ALIKE, p99: 0.5 };

/** 4. The loop ends on its first frame: in each look, the step over its end, from a frame step before it to its
    first frame, no bigger than the steps beside it. kitFrameAt reduces t to the loop before any phase, so the frame
    at t + loop is the frame at t whatever the design: what parts is the motion either side of the end, as a track
    making part of a cycle leaves it. */
export function loopCheck(def: FieldEffect, P: Palette): KitFound {
  const keys = ["mean", "p99"] as const;
  const looks = LOOKS.map(look => {
    const m = kitScene(def, P, look, SMALL);
    const [end2, end1, first, next] = [def.loop - 2 * STEP, def.loop - STEP, 0, STEP].map(t =>
      kitRender(m, t)
    );
    const step = (a: Uint8ClampedArray, b: Uint8ClampedArray) =>
      frameDiff(a, b, SMALL.width, SMALL.height);
    const over = step(end1, first);
    const beside = [step(end2, end1), step(first, next)];
    const most = (k: (typeof keys)[number]) => Math.max(...beside.map(d => d[k]));
    /* how many times the larger step beside it the step over the end is, by whichever of its mean and p99 moves */
    const times = keys.filter(k => most(k) > 0).map(k => over[k] / most(k));
    return {
      at: lookText(look),
      over,
      beside,
      jumps: keys.some(k => over[k] > Math.max(WRAP_TIMES * most(k), WRAP_FLOOR[k])),
      times: times.length ? Math.max(...times) : null
    };
  });
  const jumps = looks.filter(l => l.jumps);
  const worst = looks.reduce((a, b) => ((b.times ?? 0) > (a.times ?? 0) ? b : a));
  const stepText = (l: (typeof looks)[number]) =>
    `${l.at}: a mean of ${l.over.mean.toFixed(3)}, p99 ${l.over.p99.toFixed(2)} over it, ${l.beside.map(d => `${d.mean.toFixed(3)}, p99 ${d.p99.toFixed(2)}`).join(" and ")} beside it`;
  return {
    pass: jumps.length === 0,
    says: jumps.length
      ? `it jumps at its end: ${some(jumps.map(stepText), 2)}`
      : worst.times === null
        ? "no frame steps over its end or beside it: a still"
        : `the step over its end, from 1/60 s before it to its first frame, at most ${worst.times.toFixed(2)} times the larger beside it, of ${WRAP_TIMES}${worst.times > WRAP_TIMES ? `, steps under a mean of ${WRAP_FLOOR.mean} and a p99 of ${WRAP_FLOOR.p99} the one picture` : ""} (${stepText(worst)})`,
    numbers: {
      step: STEP,
      limit: WRAP_TIMES,
      looks: looks.map(l => ({
        at: l.at,
        over: diffNumbers(l.over),
        beside: l.beside.map(diffNumbers),
        times: l.times === null ? null : +l.times.toFixed(3),
        jumps: l.jumps
      }))
    }
  };
}

/* a frame's pixels in OKLab, and two frames' mean difference in hundredths: raster.ts frameDiff's mean */
function oklab(px: Uint8ClampedArray): Float64Array {
  const out = new Float64Array((px.length / 4) * 3);
  for (let i = 0, o = 0; i < px.length; i += 4, o += 3)
    out.set(srgbToOklab(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255), o);
  return out;
}
function meanApart(a: Float64Array, b: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 3)
    sum += Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1], a[i + 2] - b[i + 2]);
  return (sum / (a.length / 3)) * 100;
}

/** 5. It moves: no two frames of twelve across its loop are one picture, and none lies within the frame limits of the
    frame 0.13 of the loop on. */
export function movesCheck(def: FieldEffect, P: Palette): KitFound {
  const pairs: { mean: number; at: string }[] = [];
  const later: Compared[] = [];
  /* and at its fewest steps, where it takes them: its widest bands */
  for (const look of [...DEEP_LOOKS, ...atSteps(def, DEEP_LOOKS, "least")]) {
    const small = kitScene(def, P, look, { width: 160, height: 90 });
    const frames = Array.from({ length: 12 }, (_, i) =>
      oklab(kitRender(small, (i * def.loop) / 12))
    );
    for (let i = 0; i < 12; i++)
      for (let j = i + 1; j < 12; j++)
        pairs.push({
          mean: meanApart(frames[i], frames[j]),
          at: `${lookText(look)}, frames ${i} and ${j} of 12`
        });
    const m = kitScene(def, P, look, SMALL);
    for (let i = 0; i < 12; i++) {
      const t = (i * def.loop) / 12;
      later.push({
        d: frameDiff(kitRender(m, t), kitRender(m, t + 0.13 * def.loop), SMALL.width, SMALL.height),
        at: `${lookText(look)}, t ${+t.toFixed(2)}`
      });
    }
  }
  const closest = pairs.reduce((a, b) => (b.mean < a.mean ? b : a));
  const alike = pairs.filter(p => p.mean < ALIKE).map(p => p.at);
  const nearest = later.reduce((a, b) => (toLimit(b.d) < toLimit(a.d) ? b : a));
  const still = later.filter(c => within(c.d)).map(c => c.at);
  return {
    pass: alike.length === 0 && still.length === 0,
    says: [
      alike.length
        ? `one picture twice: ${some(alike)}`
        : `12 distinct frames in each of ${DEEP_LOOKS.length} looks${def.steps ? `, and at ${def.steps.least} steps in each` : ""}, the closest two a mean of ${closest.mean.toFixed(2)} apart (${closest.at})`,
      still.length
        ? `0.13 of the loop on, within the frame limits: ${some(still)}`
        : `0.13 of the loop on, past the frame limits everywhere, nearest them at ${nearest.at}: ${diffText(nearest.d)}`
    ].join("; "),
    numbers: {
      closest: { mean: +closest.mean.toFixed(3), at: closest.at },
      later: { ...diffNumbers(nearest.d), at: nearest.at },
      alike,
      still
    }
  };
}

/** 6. Each frame as an SVG of its own, as the CPU draws it. */
export async function framesCheck(def: FieldEffect, palettes: Palettes): Promise<KitFound> {
  await resvgReady();
  const compared: Compared[] = [];
  for (const [name, P] of palettes)
    for (const size of SIZES)
      for (const look of LOOKS) {
        const m = kitScene(def, P, look, size);
        for (const share of TIMES) {
          const t = share * def.loop;
          const drawn = rasterize(kitFrameSvg(def, P, look, size, t), size.width);
          compared.push({
            d: frameDiff(drawn, kitRender(m, t), size.width, size.height),
            at: `${name}, ${size.width} by ${size.height}, ${lookText(look)}, ${share} of the loop`
          });
        }
      }
  const worst = {
    mean: Math.max(...compared.map(c => c.d.mean)),
    p99: Math.max(...compared.map(c => c.d.p99)),
    far: Math.max(...compared.map(c => c.d.far))
  };
  const nearest = compared.reduce((a, b) => (toLimit(b.d) > toLimit(a.d) ? b : a));
  const over = compared.filter(c => !within(c.d)).map(c => `${c.at}: ${diffText(c.d)}`);
  return {
    pass: over.length === 0,
    says: over.length
      ? `${over.length} of ${compared.length} frames past the limits: ${some(over, 2)}`
      : `${compared.length} frames within the limits, at worst ${diffText(worst)} (nearest them: ${nearest.at}, ${diffText(nearest.d)})`,
    numbers: {
      frames: compared.length,
      worst: diffNumbers(worst),
      nearest: { ...diffNumbers(nearest.d), at: nearest.at },
      over
    }
  };
}

/** 7. The still: light enough for a list of cards, and its first frame. */
export async function stillCheck(def: FieldEffect, palettes: Palettes): Promise<KitFound> {
  await resvgReady();
  const looks: KitView[] = [...LOOKS, { angle: 0, shape: 7 }];
  /* an effect that takes steps weighs most at its most steps, its levels closest: those stills' bytes, by palette */
  const most = atSteps(def, looks, "most");
  const kibMost: Record<string, number[]> = {};
  const kib: Record<string, number[]> = {};
  const heavy: string[] = [];
  const traceMs: number[] = [];
  const compared: Compared[] = [];
  /* a still against its first frame's SVG, both drawn by resvg */
  const onFirst = (P: Palette, look: KitView, size: Size, still: string, at: string) => {
    const first = rasterize(kitFrameSvg(def, P, look, size, 0), size.width);
    compared.push({
      d: frameDiff(rasterize(still, size.width), first, size.width, size.height),
      at
    });
  };
  for (const [p, [name, P]] of palettes.entries()) {
    kib[name] = [];
    for (const look of looks) {
      const t0 = performance.now();
      const steps = kitStillSteps(def, P, look);
      let step = steps.next();
      while (!step.done) step = steps.next();
      /* the first palette's stills trace their views; the others' find the traces kept by the view (svg.ts) */
      if (p === 0) traceMs.push(performance.now() - t0);
      const bytes = fxCover(step.value).length;
      kib[name].push(+(bytes / 1024).toFixed(1));
      if (bytes >= STILL_BYTES)
        heavy.push(`${name}, ${lookText(look)}: ${(bytes / 1024).toFixed(1)} KiB`);
      if (look !== looks[2])
        onFirst(P, look, SQUARE, step.value, `${name}, the design square, ${lookText(look)}`);
    }
    for (const look of LOOKS)
      onFirst(
        P,
        look,
        SMALL,
        kitStillSvg(def, P, look, SMALL),
        `${name}, 320 by 180, ${lookText(look)}`
      );
    if (most.length) kibMost[name] = [];
    for (const look of most) {
      const bytes = fxCover(kitStillSvg(def, P, look)).length;
      kibMost[name].push(+(bytes / 1024).toFixed(1));
      if (bytes >= STILL_BYTES)
        heavy.push(`${name}, ${lookText(look)}: ${(bytes / 1024).toFixed(1)} KiB`);
    }
    /* and on its first frame at its most steps, where its levels lie closest */
    if (most.length)
      onFirst(
        P,
        most[0],
        SMALL,
        kitStillSvg(def, P, most[0], SMALL),
        `${name}, 320 by 180, ${lookText(most[0])}`
      );
  }
  const heaviest = Math.max(...Object.values(kib).flat());
  const heaviestMost = most.length ? Math.max(...Object.values(kibMost).flat()) : null;
  const listMs = (FIRST_SCREEN * traceMs.reduce((a, b) => a + b, 0)) / traceMs.length;
  const worst = compared.reduce((a, b) => (toLimit(b.d) > toLimit(a.d) ? b : a));
  const apart = compared.filter(c => !within(c.d)).map(c => `${c.at}: ${diffText(c.d)}`);
  return {
    pass: heavy.length === 0 && apart.length === 0,
    says: [
      heavy.length
        ? `over 40 KiB: ${some(heavy)}`
        : `at most ${heaviest.toFixed(1)} KiB of 40${heaviestMost === null ? "" : ` (${heaviestMost.toFixed(1)} at ${def.steps?.most} steps)`}`,
      apart.length
        ? `apart from its first frame: ${some(apart, 2)}`
        : `on its first frame within ${diffText(worst.d)} (${worst.at})`,
      `traced in ${Math.min(...traceMs).toFixed(0)} to ${Math.max(...traceMs).toFixed(0)} ms (a list's first screen, ${FIRST_SCREEN} stills the server draws, about ${listMs.toFixed(0)} ms: the strings' about 1,100 here)`
    ].join("; "),
    numbers: {
      kib,
      most: heaviest,
      ...(heaviestMost === null ? {} : { kibMost, mostAtMost: heaviestMost }),
      vsFirst: { ...diffNumbers(worst.d), at: worst.at },
      traceMs: traceMs.map(v => +v.toFixed(1)),
      listMs: +listMs.toFixed(0),
      heavy,
      apart
    }
  };
}

/** 8. Its levels lie a pixel apart or more, where the CPU's shading and the SVG agree. */
export function crowdingCheck(def: FieldEffect, P: Palette): KitFound {
  let most = { share: 0, at: "" };
  const looks: KitView[] = [...LOOKS, { angle: 0, shape: 7 }];
  /* and at its most steps, where it takes them: its levels closest */
  for (const look of [...looks, ...atSteps(def, looks, "most")]) {
    const m = kitScene(def, P, look, KIT_CROWDING_SIZE);
    for (const share of TIMES) {
      const c = kitCrowding(def, m, share * def.loop);
      if (c >= most.share) most = { share: c, at: `${lookText(look)}, ${share} of the loop` };
    }
  }
  return {
    pass: most.share <= KIT_CROWDED,
    says: `${(most.share * 100).toFixed(2)}% of a frame crowded at most, of ${KIT_CROWDED * 100}% (${most.at})`,
    numbers: { crowded: +most.share.toFixed(5), at: most.at, limit: KIT_CROWDED }
  };
}

/** How many times the demo's a card's drawing may take, drawn in turn with it: the demo draws a card's pixels in 0.48
    to 0.57 s here (630 to 757 ns a pixel at 480 by 270, 8 Nov 2026), so a card within 1.5 of it is drawn in 0.86 s at
    most, and coded with a soft and a grain (0.13 to 0.19 s more a card) in about 1 s: the Worker's 3 s on
    Cloudflare's slower machines, up to three times as long, as apps/web lib/picture-size.ts KIT_PICTURE_BOUNDS
    reasons. The site's, the sandstone, 0.4 of the demo's; the costliest it has played, the zen garden (8 to 10 Nov
    2026), 0.9 to 1.0. Timed against the demo, where ns alone ran up to 1.6 times as long with five candidates gated
    at once (coral 1,419 ns a pixel there, about 900 quiet). */
export const KIT_CARD_DEMOS = 1.5;
const CARD_PIXELS = 1200 * 630;

/** 9. What it costs: the CPU's frame a pixel, the least of three, against the demo's drawn in turn, and its clips'
    weight from the kernel's cost. */
export function costCheck(def: FieldEffect, P: Palette, cost: number | null): KitFound {
  const size = { width: 480, height: 270 };
  const m = kitScene(def, P, LOOKS[0], size);
  const md = kitScene(demo, P, LOOKS[0], size);
  const px = new Uint8ClampedArray(size.width * size.height * 4);
  let least = Infinity;
  let leastDemo = Infinity;
  for (const share of [0.17, 0.5, 0.83]) {
    const t0 = performance.now();
    kitRender(m, share * def.loop, px);
    const t1 = performance.now();
    kitRender(md, share * demo.loop, px);
    least = Math.min(least, t1 - t0);
    leastDemo = Math.min(leastDemo, performance.now() - t1);
  }
  const perPixel = (ms: number) => (ms * 1e6) / (size.width * size.height);
  const ns = perPixel(least);
  const demos = least / leastDemo;
  const card = (ns * CARD_PIXELS) / 1e9;
  const weight = cost === null ? null : kitVideoWeight(def, cost, kitShadowRun(def));
  /* its file's clipWeight, measured for this kernel (test/kit-weight.ts), or kitVideoWeight's estimate */
  const measured = cost !== null && def.clipWeight?.cost === cost;
  return {
    pass: demos <= KIT_CARD_DEMOS,
    says: `kitRender ${ns.toFixed(0)} ns a pixel at 480 by 270 (a 1200 by 630 card ${card.toFixed(2)} s), ${demos.toFixed(2)} times the demo's drawn in turn (${perPixel(leastDemo).toFixed(0)} ns), of ${KIT_CARD_DEMOS}; ${weight === null ? "its clips' weight unknown while its kernel does not compile" : `its clips weigh ${weight.toFixed(1)}${measured ? ", its clipWeight, measured" : " by kitVideoWeight's estimate, until kit-weight.ts measures it once the effect is registered"} (the glass 1, the strings 17)`}`,
    numbers: {
      nsPerPixel: +ns.toFixed(0),
      demoNsPerPixel: +perPixel(leastDemo).toFixed(0),
      demos: +demos.toFixed(3),
      limit: KIT_CARD_DEMOS,
      cardSeconds: +card.toFixed(3),
      weight: weight === null ? null : +weight.toFixed(2),
      weightMeasured: measured
    }
  };
}

/** Every check on an effect and its file's text, each reported as it ends; a check that throws fails, saying why. */
export async function kitCheck(
  def: FieldEffect,
  source: string,
  palettes: Palettes,
  file?: string,
  report: (check: KitCheck) => void = () => {}
): Promise<KitCheck[]> {
  const P = palettes[0][1];
  let cost: number | null = null;
  const checks: [string, () => KitFound | Promise<KitFound>][] = [
    [
      "kernel",
      () => {
        const found = kernelCheck(def, source, file);
        cost = found.numbers.cost as number;
        return found;
      }
    ],
    ["design", () => designCheck(def)],
    ["finite", () => finiteCheck(def, P)],
    ["loop", () => loopCheck(def, P)],
    ["moves", () => movesCheck(def, P)],
    ["frames", () => framesCheck(def, palettes)],
    ["still", () => stillCheck(def, palettes)],
    ["crowding", () => crowdingCheck(def, P)],
    ["cost", () => costCheck(def, P, cost)]
  ];
  /* the cost is timed before the SVGs are traced, after which kitRender runs a quarter to three quarters slower for
     the rest of the process (the demo's 630 to 730 ns a pixel, then 820 to 1150, a collection between leaving it so,
     8 Nov 2026), and reported in its place */
  const order = [0, 1, 2, 3, 8, 4, 5, 6, 7];
  const done: KitCheck[] = [];
  let reported = 0;
  for (const i of order) {
    const [name, run] = checks[i];
    const t0 = performance.now();
    let found: KitFound;
    try {
      found = await run();
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      found = { pass: false, says: `threw: ${why.split("\n")[0]}`, numbers: { threw: why } };
    }
    done[i] = { n: i + 1, name, ...found, ms: Math.round(performance.now() - t0) };
    while (done[reported]) report(done[reported++]);
  }
  return done;
}

/** A check as its line says it. */
export const kitCheckLine = (c: KitCheck): string =>
  `${c.pass ? "PASS" : "FAIL"} ${c.n} ${c.name}: ${c.says}`;

if (import.meta.main) {
  const args = Object.fromEntries(
    process.argv.slice(2).map(a => [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)])
  );
  if (!args.def) throw new Error("def=<a module whose default export is a FieldEffect>");
  const file = resolve(args.def);
  const def: FieldEffect = (await import(pathToFileURL(file).href)).default;
  if (!def?.field) throw new Error(`${args.def} exports no FieldEffect as its default`);
  const names =
    args.palettes === "all"
      ? Object.keys(KIT_PALETTES)
      : (args.palettes ?? "vivid,pastel,dark").split(",");
  const palettes = names.map(name => {
    const P = decodePalette(KIT_PALETTES[name] ?? name);
    if (!P) throw new Error(`no palette ${name}`);
    return [name, P] as const;
  });
  console.log(`${def.kind}: ${args.def}, palettes ${names.join(", ")}`);
  const t0 = performance.now();
  const checks = await kitCheck(def, readFileSync(file, "utf8"), palettes, args.def, check =>
    console.log(kitCheckLine(check))
  );
  const seconds = +((performance.now() - t0) / 1000).toFixed(1);
  const failed = checks.filter(c => !c.pass);
  console.log(
    `${def.kind}: ${failed.length ? `FAIL (${failed.map(c => `${c.n} ${c.name}`).join(", ")})` : "PASS"}, ${seconds} s`
  );
  if (args.json)
    writeFileSync(
      args.json,
      `${JSON.stringify({ def: file, kind: def.kind, palettes: names, pass: !failed.length, seconds, checks }, null, 1)}\n`
    );
  process.exitCode = failed.length ? 1 : 0;
}
