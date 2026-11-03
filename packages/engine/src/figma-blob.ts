/* A palette's blob (blob.ts) as Figma's own layers (figma-paste.ts writes them to the clipboard), so a paste into Figma
   gives a frame that looks like the site's still and stays editable. Figma has no alpha threshold, the lift that melts
   the site's balls into one shape, so its blend modes make one. The frame clips to the box and takes the ground where
   the view has one; inside it one group, "blob", holds three parts.
   - shape, a luminance mask: the balls in white under one layer blur (the melt) on black, Figma's Texture on them for
     the frost's scatter (the site scatters before it lifts), then a Color burn rect and a Color dodge rect in grays
     that map the melt's alpha a to 2.2 (a - .27), clamped, the site's lift: Figma's burn and dodge compute it to
     within .003.
   - colors: the balls under the same blur in two copies over their mean color, so they are opaque where the mask lets
     them through, as the site's melted colors are; then the frost's speckle, a black Noise on them and a Color dodge
     rect in half its alpha over them. The noise darkens a color by its alpha times a draw of mean .5 and the dodge
     gives that back as a multiple, so a color keeps its mean and varies by a multiple, as the site's speckle
     multiplies it by an even draw from 1 - s to 1 + s; the alpha matches the site's spread, Figma's draw spreading .42
     where an even one spreads .29.
   - edge shade: black at s / (1 + s) outside the blob's core, since the site's speckle lifts the edge's alpha by
     1 + s and not its color, which reads as a faint dark ring on a lighter ground.
   Tuned against the site's still in a Figma lab (W/figma-clip/blob-lab, 31 Oct 2026), built through Figma's MCP,
   rendered by Figma and scored with the grain blurred out, 0 identical: 0.6 to 2.4 on seven palettes, at frost 0 to
   2, an angle, a shape, two grounds and boxes from 600 to 1920 by 1080, where the balls under a plain layer blur
   scored 7 to 25. At 1:1 the grain's spread is within 2% of the site's and clumps alike: the noise and the texture
   are 1.25 design units, the grain of the site's feTurbulence at 0.75. Every length is the site's at the box's scale
   (blobFit), so the design covers the box as the still covers it.
   While the blob plays, the paste moves as the site's SVG does, on Figma's own timeline (its Motion keyframes): each
   ball turns about its resting point, its blob's ring of balls turns about the blob's middle, and each blob breathes
   and wanders to and fro on the site's ease, starting midway, every motion whole laps of the loop (BLOB_LOOP over the
   speed) so it closes on itself. Figma turns and scales a layer about its own centre, so a ball's group holds a clear
   twin mirrored through its resting point and the ring's and the breath's groups a clear square about the middle. A
   keyframe's easing is that of the stretch arriving at it. Built in the lab and copied out of Figma, the motion
   scored 1.0 to 1.5 against the site's SVG frame by frame over its loop.
   Its soft and grain wrap the blob as the site paints them (figmaFinish), its ground with it: the ground leaves the
   frame's fill for a layer under the blob, so the blur takes it too and the grain lies over it, as the site's layer
   holds both. */
import {
  BLOB_DEPTH,
  BLOB_DESIGN,
  BLOB_EASE,
  BLOB_LOOP,
  type BlobView,
  blobFilter,
  blobFit,
  blobFrame,
  blobScene
} from "./blob.ts";
import { groundParts } from "./effect.ts";
import {
  FIGMA_PAGE,
  type FigmaField,
  type FigmaFinish,
  type FigmaMotion,
  type FigmaNode,
  figmaBlur,
  figmaCurveBetween,
  figmaFinish,
  figmaLayers,
  figmaPasteHtml,
  figmaScene,
  figmaSolid
} from "./figma-paste.ts";
import type { Palette } from "./palette.ts";

/** The lab's numbers: Figma's layer blur radius for a stdDeviation of Chrome's (fitted on the lab's tiles: radius 211
    draws as 92.5), the copies of the blurred colors over their mean (2 within .03 of 3 and 4), the noise's and the
    texture's grain in design units, the texture's radius for the site's scatter (.54 matched the edge's spray within
    2% at 1186 by 851), and the spread of Figma's noise draw. */
export const FIGMA_BLOB = {
  blur: 2.28,
  copies: 2,
  grain: 1.25,
  scatter: 0.54,
  spread: 0.42
} as const;

export interface FigmaBlobView extends Pick<BlobView, "shape" | "frost" | "bg"> {
  palette: Palette;
  /** how fast it moves, the loop BLOB_LOOP seconds over this; 0 or none, the first frame alone */
  speed?: number;
  width: number;
  height: number;
  /** the frame's name in Figma */
  name: string;
  /** the soft and the grain over it, none where absent */
  finish?: FigmaFinish | null;
}

type Blend = "COLOR_BURN" | "COLOR_DODGE";
type Effect =
  | { k: "blur"; r: number }
  | { k: "texture"; s: number; r: number }
  | { k: "noise"; s: number; a: number };
type Layer =
  | { t: "balls"; c?: string }
  | { t: "ball"; n: string; x: number; y: number; r: number; c: string | null }
  | { t: "pivot"; x: number; y: number; side: number }
  | {
      t: "rect";
      n: string;
      x: number;
      y: number;
      w: number;
      h: number;
      c: string;
      b?: Blend;
      op?: number;
    }
  | {
      t: "group";
      n: string;
      kids: Layer[];
      fx?: Effect[];
      mask?: "LUMINANCE";
      motion?: FigmaMotion;
    };
type Group = Extract<Layer, { t: "group" }>;
interface Ball {
  x: number;
  y: number;
  r: number;
  color: string;
}

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;
const gray = (v: number) =>
  `#${Math.round(Math.min(1, Math.max(0, v)) * 255)
    .toString(16)
    .padStart(2, "0")
    .repeat(3)}`;

/* the to-and-fro's ease from an end to its middle and from its middle to an end, for a swing that starts midway */
const toMiddle = figmaCurveBetween(BLOB_EASE, 0, 0.5);
const fromMiddle = figmaCurveBetween(BLOB_EASE, 0.5, 1);

/* Figma's effects as its file writes them: the plugin API's TEXTURE is GRAIN */
const effectOf = (e: Effect) => {
  const base = { offset: { x: 0, y: 0 }, visible: true, blendMode: "NORMAL", spread: 0 };
  if (e.k === "blur") return figmaBlur(e.r);
  if (e.k === "texture")
    return {
      ...base,
      type: "GRAIN",
      radius: e.r,
      noiseSize: { x: e.s, y: e.s },
      clipToShape: false,
      showShadowBehindNode: false,
      color: { r: 0, g: 0, b: 0, a: 1 }
    };
  return {
    ...base,
    type: "NOISE",
    noiseType: "MONOTONE",
    noiseSize: { x: e.s, y: e.s },
    density: 1,
    color: { r: 0, g: 0, b: 0, a: e.a },
    showShadowBehindNode: false
  };
};

/** The blob's layers as Figma's scene: the document, its page, the frame and everything in it. */
export function figmaBlobNodes(view: FigmaBlobView): FigmaNode[] {
  const { width: W, height: H } = view;
  const scene = blobScene(view.palette, BLOB_DESIGN, view);
  const filter = blobFilter(view, BLOB_DESIGN, scene);
  const fit = blobFit({ width: W, height: H });
  const k = fit.scale;
  const balls: Ball[] = blobFrame(scene, 0).map(d => ({
    x: fit.x + d.x * k,
    y: fit.y + d.y * k,
    r: d.r * k,
    color: d.color
  }));
  /* the balls' mean color, each weighted by its area */
  const sum = [0, 0, 0];
  let weight = 0;
  for (const d of balls) {
    const n = Number.parseInt(d.color.slice(1), 16);
    for (const [i, shift] of [16, 8, 0].entries()) sum[i] += ((n >> shift) & 255) * d.r * d.r;
    weight += d.r * d.r;
  }
  const mean = `#${sum
    .map(c =>
      Math.round(c / weight)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
  const scatter = filter.noise ? filter.scatter * k : 0;
  const speckle = filter.noise ? filter.speckle : 0;
  /* the site's lift: alpha slope a + lift, so 0 where the melt is `zero` and 1 where it is `full` */
  const zero = -filter.lift / filter.slope;
  const full = (1 - filter.lift) / filter.slope;

  const margin = Math.round(0.1 * Math.max(W, H));
  const cover = (n: string, c: string, more: { b?: Blend; op?: number } = {}): Layer => ({
    t: "rect",
    n,
    x: -margin,
    y: -margin,
    w: W + 2 * margin,
    h: H + 2 * margin,
    c,
    ...more
  });
  const blur = round(FIGMA_BLOB.blur * (filter.melt * k), 2);

  /* the motion, while the blob plays: a turn of whole laps a loop, clockwise on the screen for laps above 0 (Figma's
     file keeps an angle in radians, clockwise as CSS's, though its plugin API counts degrees the other way), and a
     to-and-fro from `from` to `to`, `laps` a loop, starting midway toward `to` (toward `from` for laps below 0), as the
     SVG's alternate animations do */
  const loop = view.speed ? BLOB_LOOP / view.speed : 0;
  const turn = (laps: number): FigmaMotion => ({
    field: "MOTION_ROTATION",
    base: 0,
    keys: [
      { t: 0, v: 0, e: null },
      { t: loop, v: 2 * Math.PI * laps, e: null }
    ]
  });
  const sweep = (field: FigmaField, from: number, to: number, laps: number): FigmaMotion => {
    const half = loop / (2 * Math.abs(laps));
    const middle = (from + to) / 2;
    const [first, second] = laps > 0 ? [to, from] : [from, to];
    const keys: FigmaMotion["keys"][number][] = [{ t: 0, v: middle, e: null }];
    for (let j = 0; j < 2 * Math.abs(laps); j++)
      keys.push({
        t: half / 2 + j * half,
        v: j % 2 === 0 ? first : second,
        e: j === 0 ? fromMiddle : BLOB_EASE
      });
    keys.push({ t: loop, v: middle, e: toMiddle });
    return { field, base: middle, keys };
  };
  /* each blob's balls as the SVG moves them, in the color `c` or each its own: a ball in its turn's group, the ring's
     turns in the ring's, the ring and the core in the breath's, which wanders down and across */
  const moving = (c?: string): Layer[] =>
    scene.blobs.map((b, bi) => {
      const X = (x: number) => fit.x + x * k;
      const Y = (y: number) => fit.y + y * k;
      let reach = 0;
      const turns = b.balls.map((ball, i) => {
        const hx = b.x + ball.x * b.R;
        const hy = b.y + ball.y * b.R;
        const fx = hx + ball.swing * b.R * Math.cos(2 * Math.PI * ball.phase);
        const fy = hy + ball.swing * b.R * Math.sin(2 * Math.PI * ball.phase);
        reach = Math.max(
          reach,
          Math.max(Math.abs(hx - b.x), Math.abs(hy - b.y)) + (ball.swing + ball.r) * b.R
        );
        const r = ball.r * b.R * k;
        const layer: Group = {
          t: "group",
          n: `turn ${i + 1}`,
          kids: [
            { t: "ball", n: `ball ${i + 1}`, x: X(fx), y: Y(fy), r, c: c ?? scene.color(ball.at) },
            { t: "ball", n: "pivot", x: X(2 * hx - fx), y: Y(2 * hy - fy), r, c: null }
          ],
          motion: turn(ball.laps)
        };
        return { ring: ball.ring, layer };
      });
      const side = 2 * (reach + 4) * k;
      const pivot: Layer = { t: "pivot", x: X(b.x) - side / 2, y: Y(b.y) - side / 2, side };
      const ring: Group = {
        t: "group",
        n: "ring",
        kids: [...turns.filter(q => q.ring).map(q => q.layer), pivot],
        motion: turn(b.spin)
      };
      let layer: Group = {
        t: "group",
        n: "breath",
        kids: [ring, ...turns.filter(q => !q.ring).map(q => q.layer), pivot],
        motion: sweep("MOTION_SCALE_XY", BLOB_DEPTH.far, BLOB_DEPTH.near, b.depth)
      };
      for (const [field, s, n] of [
        ["MOTION_TRANSLATION_Y", b.wander[1], "wander down"],
        ["MOTION_TRANSLATION_X", b.wander[0], "wander across"]
      ] as const)
        if (s.reach >= 0.5)
          layer = {
            t: "group",
            n,
            kids: [layer],
            motion: sweep(field, -s.reach * k, s.reach * k, s.laps)
          };
      return { ...layer, n: `blob ${bi + 1}` };
    });
  const melt = (n: string, c?: string): Layer => ({
    t: "group",
    n,
    kids: loop ? moving(c) : [{ t: "balls", ...(c ? { c } : {}) }],
    fx: [{ k: "blur", r: blur }]
  });
  const frost: Effect[] =
    scatter > 0
      ? [
          {
            k: "texture",
            s: round(FIGMA_BLOB.grain * k, 2),
            r: round(FIGMA_BLOB.scatter * scatter, 2)
          }
        ]
      : [];
  const scattered = (c: string): Layer =>
    frost.length ? { t: "group", n: "frost", kids: [melt("melt", c)], fx: frost } : melt("melt", c);
  /* the lift as burn then dodge: a burn in 1 - z sends z to 0, a dodge in d multiplies by 1 / (1 - d) */
  const lift = (z: number, slope: number): Layer[] => [
    cover("lift", gray(1 - z), { b: "COLOR_BURN" }),
    cover("slope", gray(1 - 1 / (slope * (1 - z))), { b: "COLOR_DODGE" })
  ];
  const shape: Layer = {
    t: "group",
    n: "shape",
    mask: "LUMINANCE",
    kids: [
      cover("black", "#000000"),
      scattered("#ffffff"),
      ...lift(zero, filter.slope * (1 + speckle))
    ]
  };
  /* the speckle's alpha: the site's spread, s / sqrt 3, from Figma's draw */
  const alpha =
    speckle > 0
      ? round(speckle / Math.sqrt(3) / (FIGMA_BLOB.spread + speckle / (2 * Math.sqrt(3))), 3)
      : 0;
  const colors: Layer = {
    t: "group",
    n: "colors",
    kids: [
      cover("mean", mean),
      ...Array.from({ length: FIGMA_BLOB.copies }, (_, i) => melt(`melt ${i + 1}`))
    ],
    fx: alpha ? [{ k: "noise", s: round(FIGMA_BLOB.grain * k, 2), a: alpha }] : []
  };
  const kids: Layer[] = [shape, colors];
  if (alpha) kids.push(cover("lighten", gray(alpha / 2), { b: "COLOR_DODGE" }));
  if (speckle > 0) {
    /* the core, where the plain lift reaches 1, back to where the lift times 1 + s does: black balls on white, lifted
       to 1 - a over that span */
    const from = (1 / (1 + speckle) - filter.lift) / filter.slope;
    kids.push({
      t: "group",
      n: "edge shade",
      kids: [
        {
          t: "group",
          n: "core",
          mask: "LUMINANCE",
          kids: [
            cover("white", "#ffffff"),
            scattered("#000000"),
            ...lift(1 - full, 1 / (full - from))
          ]
        },
        cover("shade", "#000000", { op: round(speckle / (1 + speckle), 3) })
      ]
    });
  }

  /* a layer's leaves in the frame's pixels: [x0, y0, x1, y1] */
  const bounds = (l: Layer): [number, number, number, number] => {
    if (l.t === "balls")
      return [
        Math.min(...balls.map(d => d.x - d.r)),
        Math.min(...balls.map(d => d.y - d.r)),
        Math.max(...balls.map(d => d.x + d.r)),
        Math.max(...balls.map(d => d.y + d.r))
      ];
    if (l.t === "rect") return [l.x, l.y, l.x + l.w, l.y + l.h];
    if (l.t === "ball") return [l.x - l.r, l.y - l.r, l.x + l.r, l.y + l.r];
    if (l.t === "pivot") return [l.x, l.y, l.x + l.side, l.y + l.side];
    const all = l.kids.map(bounds);
    return [
      Math.min(...all.map(b => b[0])),
      Math.min(...all.map(b => b[1])),
      Math.max(...all.map(b => b[2])),
      Math.max(...all.map(b => b[3]))
    ];
  };
  const { nodes, internal, add, group, animate } = figmaLayers();
  /* a layer under `parent`, whose corner stands at (ox, oy) in the frame; how many children it made there */
  const emit = (l: Layer, parent: FigmaNode, index: number, ox: number, oy: number): number => {
    if (l.t === "balls") {
      for (const [i, d] of balls.entries())
        add(
          "ELLIPSE",
          `ball ${i + 1}`,
          parent,
          index + i,
          2 * d.r,
          2 * d.r,
          d.x - d.r - ox,
          d.y - d.r - oy,
          {
            fillPaints: [figmaSolid(l.c ?? d.color)]
          }
        );
      return balls.length;
    }
    if (l.t === "ball") {
      add("ELLIPSE", l.n, parent, index, 2 * l.r, 2 * l.r, l.x - l.r - ox, l.y - l.r - oy, {
        fillPaints: [l.c ? figmaSolid(l.c) : figmaSolid("#000000", 0)]
      });
      return 1;
    }
    if (l.t === "pivot") {
      add("RECTANGLE", "pivot", parent, index, l.side, l.side, l.x - ox, l.y - oy, {
        fillPaints: [figmaSolid("#000000", 0)]
      });
      return 1;
    }
    if (l.t === "rect") {
      add("RECTANGLE", l.n, parent, index, l.w, l.h, l.x - ox, l.y - oy, {
        fillPaints: [figmaSolid(l.c)],
        ...(l.b ? { blendMode: l.b } : {}),
        ...(l.op !== undefined ? { opacity: l.op } : {})
      });
      return 1;
    }
    const [x0, y0, x1, y1] = bounds(l);
    /* NORMAL keeps the blend modes inside the group */
    const g = group(l.n, parent, index, x0 - ox, y0 - oy, x1 - x0, y1 - y0, {
      blendMode: "NORMAL",
      ...(l.fx?.length ? { effects: l.fx.map(effectOf) } : {}),
      ...(l.mask ? { mask: true, maskType: l.mask } : {}),
      ...(l.motion ? { parameterConsumptionMap: animate(l.motion) } : {})
    });
    let i = 0;
    for (const kid of l.kids) i += emit(kid, g, i, x0, y0);
    return 1;
  };
  const ground = view.bg ? groundParts(view.bg) : null;
  const finished = !!(view.finish?.soft || view.finish?.grain);
  const top = add("FRAME", view.name, FIGMA_PAGE, 0, W, H, 0, 0, {
    fillPaints: ground && !finished ? [figmaSolid(ground.hex, ground.alpha)] : [],
    frameMaskDisabled: false,
    ...(loop ? { timelineDuration: Math.round(loop * 1e6) } : {})
  });
  const into = figmaFinish({ add, group }, top, { width: W, height: H }, view.finish, {
    palette: view.palette,
    kind: "blob",
    bg: view.bg,
    angle: 90
  });
  let index = into.index;
  if (ground && finished)
    add("RECTANGLE", "ground", into.parent, index++, W, H, 0, 0, {
      fillPaints: [figmaSolid(ground.hex, ground.alpha)]
    });
  emit({ t: "group", n: "blob", kids }, into.parent, index, 0, 0);
  return figmaScene(nodes, internal);
}

/** The clipboard's text/html for the blob, which a paste into Figma reads as its layers. */
export function figmaBlobHtml(
  view: FigmaBlobView,
  pasteID = Math.floor(Math.random() * 0x7fffffff)
): string {
  return figmaPasteHtml(figmaBlobNodes(view), pasteID, "grabientPasteBlob000000");
}
