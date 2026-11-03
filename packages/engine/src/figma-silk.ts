/* The silk as Figma's own layers, for Copy for Figma: the layer list the silk's lab built and checked in Figma through
   its plugin API (styles-lab/lite/silk: the still within 1.2 levels of the CPU's, the moving frame's export within 2),
   written as Figma's clipboard nodes with figma-paste.ts. The frame (clipping to the box), bottom to top:
   1. "dye": a rectangle filling the box with a linear gradient of the palette's 32 stops along the dye's line;
   2. "valleys": a group of
        "valley folds", an alpha mask: a group a fold ("fold i"), each holding the fold's ring (an ellipse of radius
        R + w whose radial gradient holds the valley profile between R - w and R + w) and a clear twin mirrored through
        the gather, so the group's middle, Figma's pivot for a turn, is the gather;
        "shade": the dye's line in the shade's stops, seen through the mask;
   3. "crests": the same with the crest profile and the lift's stops.
   While it moves each "fold i" group carries one track, a turn keyed by the same keys the CPU, the player and the SMIL
   read; Figma's canvas shows a layer at its own turn, not its track's rest, so each fold is placed at its t = 0 turn
   and the keys hold the turn from there: the canvas is the still, and playing adds the swing. Its soft and grain wrap
   the three as the site paints them (figmaFinish), still while the folds turn. */
import {
  FIGMA_PAGE,
  type FigmaFinish,
  type FigmaMotion,
  type FigmaNode,
  figmaFinish,
  figmaLayers,
  figmaPasteHtml,
  figmaScene,
  figmaSolid
} from "./figma-paste.ts";
import type { Underlay } from "./fx-finish.ts";
import type { Palette } from "./palette.ts";
import { PROF_N, SILK_LOOP, type SilkScene, silkScene } from "./silk.ts";

/** A silk to paste: its palette and look, the frame's size and name, its pace (0 the still), and its soft and grain. */
export interface FigmaSilkView {
  palette: Palette;
  angle: number;
  shape: number | null;
  width: number;
  height: number;
  name: string;
  speed: number;
  finish?: FigmaFinish | null;
  /** the gradient a soft silk's edges go to (fx-finish.ts effectUnderlay), none for none */
  underlay?: Underlay | null;
}

type Mat = [[number, number, number], [number, number, number]];
interface Stop {
  position: number;
  color: { r: number; g: number; b: number; a: number };
}
interface Layer {
  kind: "RECTANGLE" | "ELLIPSE" | "GROUP";
  name: string;
  /** place and size in the frame, px (a group's are its children's bounds) */
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: { type: "GRADIENT_LINEAR" | "GRADIENT_RADIAL"; transform: Mat; stops: Stop[] };
  mask?: "ALPHA";
  children?: Layer[];
  /** a turn's keys: seconds on the timeline, degrees counterclockwise (the plugin's sense) */
  keys?: { t: number; v: number; e: readonly [number, number, number, number] | null }[];
}

const rgb = (hex: string, a = 1) => {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a };
};

/** A linear gradient's transform for a W x H node: gradient x runs 0..1 along the dye's line. */
function lineTransform(scene: SilkScene): Mat {
  const { W, H } = scene;
  const dx = scene.x2 - scene.x1;
  const dy = scene.y2 - scene.y1;
  const l2 = dx * dx + dy * dy;
  return [
    [(W * dx) / l2, (H * dy) / l2, -(scene.x1 * dx + scene.y1 * dy) / l2],
    [(-W * dy) / l2, (H * dx) / l2, 0.5 + (scene.x1 * dy - scene.y1 * dx) / l2]
  ];
}

/** A fold's ring centre at its t = 0 turn about the gather (y down, clockwise as SVG's). */
function restCentre(scene: SilkScene, i: number): [number, number] {
  const f = scene.folds[i];
  const th = (f.track[0].v * Math.PI) / 180;
  const px = f.cx - scene.gx;
  const py = f.cy - scene.gy;
  return [
    scene.gx + Math.cos(th) * px - Math.sin(th) * py,
    scene.gy + Math.sin(th) * px + Math.cos(th) * py
  ];
}

/** The silk's layers in a box, moving at `speed` (0: the still). */
function silkLayers(scene: SilkScene, speed: number): Layer[] {
  const { W, H, dye } = scene;
  const lin = (hexes: readonly string[]) => ({
    type: "GRADIENT_LINEAR" as const,
    transform: lineTransform(scene),
    stops: hexes.map((h, i) => ({ position: i / (hexes.length - 1), color: rgb(h) }))
  });
  const rect = (name: string, hexes: readonly string[]): Layer => ({
    kind: "RECTANGLE",
    name,
    x: 0,
    y: 0,
    width: W,
    height: H,
    fill: lin(hexes)
  });
  const folds = (profile: { k: number[]; a: number[] }) =>
    scene.folds.map((f, i): Layer => {
      const out = f.R + f.w;
      const [cx, cy] = restCentre(scene, i);
      const ring: Layer = {
        kind: "ELLIPSE",
        name: "ring",
        x: cx - out,
        y: cy - out,
        width: 2 * out,
        height: 2 * out,
        fill: {
          type: "GRADIENT_RADIAL",
          transform: [
            [1, 0, 0],
            [0, 1, 0]
          ],
          stops: profile.k.map((k, j) => ({
            position: (f.R + f.w * (-1 + (2 * k) / (PROF_N - 1))) / out,
            color: { r: 1, g: 1, b: 1, a: profile.a[j] / 255 }
          }))
        }
      };
      const twin: Layer = {
        kind: "ELLIPSE",
        name: "pivot",
        x: 2 * scene.gx - cx - out,
        y: 2 * scene.gy - cy - out,
        width: 2 * out,
        height: 2 * out
      };
      const x0 = Math.min(ring.x, twin.x);
      const y0 = Math.min(ring.y, twin.y);
      const track = f.track;
      return {
        kind: "GROUP",
        name: `fold ${i + 1}`,
        x: x0,
        y: y0,
        width: Math.max(ring.x, twin.x) + 2 * out - x0,
        height: Math.max(ring.y, twin.y) + 2 * out - y0,
        children: [ring, twin],
        ...(speed
          ? { keys: track.map(k => ({ t: k.t / speed, v: -(k.v - track[0].v), e: k.e })) }
          : {})
      };
    });
  const masked = (
    name: string,
    maskName: string,
    profile: { k: number[]; a: number[] },
    hexes: readonly string[]
  ): Layer => ({
    kind: "GROUP",
    name,
    x: 0,
    y: 0,
    width: W,
    height: H,
    children: [
      {
        kind: "GROUP",
        name: maskName,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        mask: "ALPHA",
        children: folds(profile)
      },
      rect(name === "valleys" ? "shade" : "lift", hexes)
    ]
  });
  return [
    rect("dye", dye.base),
    masked("valleys", "valley folds", scene.valley, dye.shade),
    masked("crests", "crest folds", scene.crest, dye.lift)
  ];
}

const figmaMat = (m: Mat) => ({
  m00: m[0][0],
  m01: m[0][1],
  m02: m[0][2],
  m10: m[1][0],
  m11: m[1][1],
  m12: m[1][2]
});

/** The silk's paste nodes: the document, its page, the frame and its layers, and its keyframe tracks. */
export function figmaSilkNodes(view: FigmaSilkView): FigmaNode[] {
  const { width: W, height: H, speed } = view;
  const scene = silkScene(
    view.palette,
    { angle: view.angle, shape: view.shape },
    { width: W, height: H }
  );
  const { nodes, internal, add, group, animate } = figmaLayers();
  const top = add("FRAME", view.name, FIGMA_PAGE, 0, W, H, 0, 0, {
    fillPaints: [],
    frameMaskDisabled: false,
    ...(speed ? { timelineDuration: Math.round((SILK_LOOP / speed) * 1e6) } : {})
  });
  const paint = (f: NonNullable<Layer["fill"]>) => ({
    type: f.type,
    opacity: 1,
    visible: true,
    blendMode: "NORMAL",
    transform: figmaMat(f.transform),
    stops: f.stops.map(s => ({ color: s.color, position: s.position }))
  });
  const bounds = (l: Layer): [number, number, number, number] => {
    if (!l.children) return [l.x, l.y, l.x + l.width, l.y + l.height];
    const b = l.children.map(bounds);
    return [
      Math.min(...b.map(q => q[0])),
      Math.min(...b.map(q => q[1])),
      Math.max(...b.map(q => q[2])),
      Math.max(...b.map(q => q[3]))
    ];
  };
  const emit = (l: Layer, parent: FigmaNode, index: number, ox: number, oy: number) => {
    if (l.kind !== "GROUP") {
      add(l.kind, l.name, parent, index, l.width, l.height, l.x - ox, l.y - oy, {
        fillPaints: l.fill ? [paint(l.fill)] : [figmaSolid("#000000", 0)]
      });
      return;
    }
    const [x0, y0, x1, y1] = bounds(l);
    /* the file keeps a turn in radians, clockwise as SVG's: the keys' degrees counterclockwise, back */
    const motion: FigmaMotion | null = l.keys?.length
      ? {
          field: "MOTION_ROTATION",
          base: 0,
          keys: l.keys.map(k => ({ t: k.t, v: (-k.v * Math.PI) / 180, e: k.e }))
        }
      : null;
    const g = group(l.name, parent, index, x0 - ox, y0 - oy, x1 - x0, y1 - y0, {
      blendMode: "NORMAL",
      ...(l.mask ? { mask: true, maskType: l.mask } : {}),
      ...(motion ? { parameterConsumptionMap: animate(motion) } : {})
    });
    (l.children ?? []).forEach((kid, i) => {
      emit(kid, g, i, x0, y0);
    });
  };
  const into = figmaFinish(
    { add, group },
    top,
    { width: W, height: H },
    view.finish,
    view.underlay
  );
  silkLayers(scene, speed).forEach((l, i) => {
    emit(l, into.parent, into.index + i, 0, 0);
  });
  return figmaScene(nodes, internal);
}

/** The clipboard's text/html for the silk, which a paste into Figma reads as its layers. */
export function figmaSilkHtml(
  view: FigmaSilkView,
  pasteID = Math.floor(Math.random() * 0x7fffffff)
): string {
  return figmaPasteHtml(figmaSilkNodes(view), pasteID, "grabientPasteSilk000000");
}
