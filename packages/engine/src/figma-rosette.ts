/* The rosette as Figma's own layers, for Copy for Figma: the layer list the rosette's lab built and checked in Figma
   through its plugin API, written as Figma's clipboard nodes with figma-paste.ts. The frame (clipping to the box),
   bottom to top:
     ground          rectangle, the ground's solid color
     petals          group, a rotation track (an even turn a loop) while it moves
       petals        group, a scale track (the zoom in its eased stretches)
         pivot       a clear square about the heart: Figma turns and scales a layer about its own middle
         petal ...   outer first, each a lens (the intersection of two ellipses) filled with its ring's radial gradient
                     in its own box
     heart           ellipse, the heart's color fading out
   Everything is a rectangle, an ellipse or a lens, filled with a solid or a radial gradient: what a paste can carry.
   Figma's radial gradient transform G reads a layer's own point p (0 to 1 across its box) at G p, its middle at
   (0.5, 0.5) and its rim 0.5 out: a gradient whose middle is c and radii r (box shares) has
   G = [[0.5 / rx, 0, 0.5 - 0.5 cx / rx], [0, 0.5 / ry, 0.5 - 0.5 cy / ry]]. Figma's file keeps an angle in radians,
   clockwise as CSS's. A boolean operation's shapes stand in its own box, as the glass's ribs' do. Its soft and grain
   wrap the three as the site paints them (figmaFinish), still while the petals turn. */
import { toHex } from "./color.ts";
import {
  FIGMA_PAGE,
  type FigmaFinish,
  type FigmaMotion,
  type FigmaNode,
  figmaColor,
  figmaFinish,
  figmaLayers,
  figmaPasteHtml,
  figmaScene
} from "./figma-paste.ts";
import type { Underlay } from "./fx-finish.ts";
import type { Palette } from "./palette.ts";
import {
  HEART_STOPS,
  type RosettePetal,
  type RosetteScene,
  rosettePetals,
  rosetteScene
} from "./rosette.ts";
import { zoomKeys } from "./rosette-svg.ts";

export type Mat = [number, number, number, number, number, number];
export interface Stop {
  at: number;
  color: string;
  a: number;
}
export type Paint =
  | { type: "SOLID"; color: string; a: number }
  | { type: "GRADIENT_RADIAL"; g: Mat; stops: Stop[] };
export interface Layer {
  kind: "frame" | "group" | "rect" | "ellipse" | "lens";
  name: string;
  /** the layer's own box, w by h, placed in its parent by m: x' = m0 x + m1 y + m2, y' = m3 x + m4 y + m5 */
  w: number;
  h: number;
  m: Mat;
  fill?: Paint;
  /** a lens: its two circles' radius and centers in its own box */
  lens?: { R: number; c: [[number, number], [number, number]] };
  motion?: FigmaMotion[];
  kids?: Layer[];
}

const at = (x: number, y: number): Mat => [1, 0, x, 0, 1, y];
/** The gradient transform that puts a radial gradient's middle at box share (cx, cy), its radii (rx, ry). */
export const radialG = (cx: number, cy: number, rx: number, ry: number): Mat => [
  0.5 / rx,
  0,
  0.5 - (0.5 * cx) / rx,
  0,
  0.5 / ry,
  0.5 - (0.5 * cy) / ry
];

/** A petal's box placed in the frame: the petal turned th about the heart, its anchor at radius r; the box's corner
    lies at (x0, -w) of the petal's own frame (anchor shares). */
export function petalMat(sc: RosetteScene, p: RosettePetal): Mat {
  const L = sc.lens;
  const c = Math.cos(p.th);
  const s = Math.sin(p.th);
  const bx = L.x0 * p.r;
  const by = -L.w * p.r;
  return [c, -s, sc.box.width / 2 + c * bx - s * by, s, c, sc.box.height / 2 + s * bx + c * by];
}

/** The petal group's tracks over a loop at a speed: an even turn, and the zoom in its eased stretches. */
export function motionOf(sc: RosetteScene, speed: number): FigmaMotion[] {
  const L = sc.design.loop / speed;
  const keys = zoomKeys(sc);
  return [
    {
      field: "MOTION_ROTATION",
      base: 0,
      keys: [
        { t: 0, v: 0, e: null },
        { t: L, v: sc.lattice.beta, e: null }
      ]
    },
    {
      field: "MOTION_SCALE_XY",
      base: 1,
      keys: keys.map((k, i) => ({ t: k.at * L, v: k.scale, e: i === 0 ? null : keys[i - 1].ease }))
    }
  ];
}

/** The layer list for a scene: speed 0 is the still (its petals, no tracks), any other moves on the timeline. */
export function rosetteLayers(sc: RosetteScene, speed = 1, name = "rosette"): Layer {
  const W = sc.box.width;
  const H = sc.box.height;
  const L = sc.lens;
  const d = sc.design;
  const cx = W / 2;
  const cy = H / 2;
  const petals = rosettePetals(sc, speed > 0);
  const { cu, cv, ru, rv } = d.grad;
  const g = radialG(cu, cv, ru, rv);
  const fills = sc.colors.grads.map(
    (stops): Paint => ({
      type: "GRADIENT_RADIAL",
      g,
      stops: d.stops.map(([o], j) => ({ at: o, color: toHex(stops[j]), a: 1 }))
    })
  );
  const len = L.x1 - L.x0;
  const lens = (p: RosettePetal): Layer => ({
    kind: "lens",
    name: "petal",
    w: len * p.r,
    h: 2 * L.w * p.r,
    m: petalMat(sc, p),
    lens: {
      R: L.rho * p.r,
      c: [
        [(L.xm - L.x0) * p.r, (L.w + L.d) * p.r],
        [(L.xm - L.x0) * p.r, (L.w - L.d) * p.r]
      ]
    },
    fill: fills[p.key]
  });
  /* the pivot covers every petal's box however it turns, so the group's bounds, and so its middle, are the pivot's */
  const corner = Math.hypot(Math.max(Math.abs(L.x0), Math.abs(L.x1)), L.w);
  const reach = Math.max(...petals.map(p => p.r * corner)) * 1.01;
  const pivot: Layer = {
    kind: "rect",
    name: "pivot",
    w: 2 * reach,
    h: 2 * reach,
    m: at(cx - reach, cy - reach),
    fill: { type: "SOLID", color: "#000000", a: 0 }
  };
  const heartR = d.heartOut * sc.S;
  const span = d.heartOut - d.heartIn;
  const heart: Layer = {
    kind: "ellipse",
    name: "heart",
    w: 2 * heartR,
    h: 2 * heartR,
    m: at(cx - heartR, cy - heartR),
    fill: {
      type: "GRADIENT_RADIAL",
      g: radialG(0.5, 0.5, 0.5, 0.5),
      stops: [
        { at: 0, color: toHex(sc.colors.heart), a: 1 },
        ...HEART_STOPS.map(([x, a]) => ({
          at: (d.heartIn + x * span) / d.heartOut,
          color: toHex(sc.colors.heart),
          a
        }))
      ]
    }
  };
  return {
    kind: "frame",
    name,
    w: W,
    h: H,
    m: at(0, 0),
    kids: [
      {
        kind: "rect",
        name: "ground",
        w: W,
        h: H,
        m: at(0, 0),
        fill: { type: "SOLID", color: toHex(sc.colors.ground), a: 1 }
      },
      {
        kind: "group",
        name: "petals",
        w: 0,
        h: 0,
        m: at(0, 0),
        kids: [pivot, ...petals.map(lens)],
        ...(speed > 0 ? { motion: motionOf(sc, speed) } : {})
      },
      heart
    ]
  };
}

/* ---- the paste: the layer list in Figma's own nodes ---- */

const figmaMat = (m: Mat) => ({ m00: m[0], m01: m[1], m02: m[2], m10: m[3], m11: m[4], m12: m[5] });
const figmaPaint = (p: Paint) =>
  p.type === "SOLID"
    ? {
        type: "SOLID",
        color: figmaColor(p.color),
        opacity: p.a,
        visible: true,
        blendMode: "NORMAL"
      }
    : {
        type: "GRADIENT_RADIAL",
        opacity: 1,
        visible: true,
        blendMode: "NORMAL",
        transform: figmaMat(p.g),
        stops: p.stops.map(s => ({ color: figmaColor(s.color, s.a), position: s.at }))
      };
const figmaSolid0 = () => ({
  type: "SOLID",
  color: figmaColor("#ffffff"),
  opacity: 1,
  visible: true,
  blendMode: "NORMAL"
});
const hasMotion = (l: Layer): boolean => !!l.motion || (l.kids ?? []).some(hasMotion);
const loopOf = (l: Layer): number =>
  l.motion
    ? Math.max(...l.motion.flatMap(m => m.keys.map(k => k.t)))
    : Math.max(0, ...(l.kids ?? []).map(loopOf));

/** The paste's nodes: groups are frames fit to their children, placed by the bounds of what they hold; a group with two
    tracks is two groups, the second track on the inner one. The soft and the grain wrap the frame's layers, a soft
    one over `underlay`. */
export function rosetteNodes(
  root: Layer,
  finish?: FigmaFinish | null,
  underlay: Underlay | null = null
): FigmaNode[] {
  const { nodes, internal, add, group, animate } = figmaLayers();
  const bounds = (l: Layer): [number, number, number, number] => {
    if (l.kind === "group") {
      const b = (l.kids ?? []).map(bounds);
      return [
        Math.min(...b.map(v => v[0])),
        Math.min(...b.map(v => v[1])),
        Math.max(...b.map(v => v[2])),
        Math.max(...b.map(v => v[3]))
      ];
    }
    const xs = [0, l.w].flatMap(x => [0, l.h].map(y => l.m[0] * x + l.m[1] * y + l.m[2]));
    const ys = [0, l.w].flatMap(x => [0, l.h].map(y => l.m[3] * x + l.m[4] * y + l.m[5]));
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  const top = add("FRAME", root.name, FIGMA_PAGE, 0, root.w, root.h, 0, 0, {
    fillPaints: [],
    frameMaskDisabled: false,
    ...(hasMotion(root) ? { timelineDuration: Math.round(loopOf(root) * 1e6) } : {})
  });
  const put = (l: Layer, parent: FigmaNode, index: number, ox: number, oy: number) => {
    const m: Mat = [l.m[0], l.m[1], l.m[2] - ox, l.m[3], l.m[4], l.m[5] - oy];
    if (l.kind === "group") {
      const [x0, y0, x1, y1] = bounds(l);
      const extra: Record<string, unknown> = l.motion
        ? { parameterConsumptionMap: animate(l.motion[0]) }
        : {};
      let g = group(l.name, parent, index, x0 - ox, y0 - oy, x1 - x0, y1 - y0, extra);
      if (l.motion && l.motion.length > 1)
        g = group(l.name, g, 0, 0, 0, x1 - x0, y1 - y0, {
          parameterConsumptionMap: animate(l.motion[1])
        });
      (l.kids ?? []).forEach((k, i) => {
        put(k, g, i, x0, y0);
      });
      return;
    }
    const fill = l.fill ? [figmaPaint(l.fill)] : [];
    if (l.kind === "lens") {
      const b = add("BOOLEAN_OPERATION", l.name, parent, index, l.w, l.h, 0, 0, {
        transform: figmaMat(m),
        booleanOperation: "INTERSECT",
        fillPaints: fill
      });
      const { R, c } = l.lens!;
      c.forEach(([x, y], i) => {
        add("ELLIPSE", i ? "lower" : "upper", b, i, 2 * R, 2 * R, x - R, y - R, {
          fillPaints: [figmaSolid0()]
        });
      });
      return;
    }
    add(l.kind === "rect" ? "RECTANGLE" : "ELLIPSE", l.name, parent, index, l.w, l.h, 0, 0, {
      transform: figmaMat(m),
      fillPaints: fill
    });
  };
  const into = figmaFinish(
    { add, group },
    top,
    { width: root.w, height: root.h },
    finish,
    underlay
  );
  (root.kids ?? []).forEach((k, i) => {
    put(k, into.parent, into.index + i, 0, 0);
  });
  return figmaScene(nodes, internal);
}

/** A rosette to paste: its palette and look, the frame's size and name, its pace (0 the still), and its soft and
    grain. */
export interface FigmaRosetteView {
  palette: Palette;
  angle: number;
  shape: number | null;
  width: number;
  height: number;
  name: string;
  speed: number;
  finish?: FigmaFinish | null;
  /** the gradient a soft rosette's edges go to (fx-finish.ts effectUnderlay), none for none */
  underlay?: Underlay | null;
}

/** The rosette's paste nodes: the document, its page, the frame and its layers, and its keyframe tracks. */
export const figmaRosetteNodes = (view: FigmaRosetteView): FigmaNode[] =>
  rosetteNodes(
    rosetteLayers(
      rosetteScene(
        view.palette,
        { angle: view.angle, shape: view.shape },
        { width: view.width, height: view.height }
      ),
      view.speed,
      view.name
    ),
    view.finish,
    view.underlay
  );

/** The clipboard's text/html for the rosette, which a paste into Figma reads as its layers. */
export const figmaRosetteHtml = (
  view: FigmaRosetteView,
  pasteID = Math.floor(Math.random() * 0x7fffffff)
): string => figmaPasteHtml(figmaRosetteNodes(view), pasteID, "grabientPasteRosette001");
