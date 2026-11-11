/* The dimple roaming as Figma's own layers, for Copy for Figma (John, 11 Nov 2026: "Try to get something that can be
   exported as a figma clipboard copy"): the layers built and played in Figma through its plugin API (the lab file's
   "dimple lab" page), written as Figma's clipboard nodes with figma-paste.ts.

   Figma's timeline moves, turns and scales layers and changes no fill, so a disc, whose colors change as the hollow
   roams, is a round clip over a strip: a rectangle filled with the palette from end to end. The frame (clipping to
   the box), bottom to top:
     under the discs ellipse, the ground: a round gradient about the hollow, moving with it (TRANSLATION_X, _Y);
                     named apart from "ground", which a finished paste's own layer is (figma-paste.ts)
     disc ...        group, the bottom of the stack first, moving as the sheet is drawn in toward the hollow
                     (TRANSLATION_X, _Y)
       clip          ellipse, the disc, a mask
       toward the hollow   group, the rotor: turned to point at the hollow (ROTATION) and, for a disc at the hollow's
                     heart, drawn larger so the disc shows less of its run (SCALE_XY)
         pivot       a clear rectangle about the clip's middle, as long as the strip's whole travel: Figma turns and
                     scales a layer about its own middle, and this keeps the rotor's on the clip's
         palette     rectangle, the strip: slid along the rotor's own axis so the disc's place along the palette
                     lies under the clip's middle (TRANSLATION_X)
   The stack never changes as the hollow moves (the dimple's own rule), so the layers' order is fixed. Probed in
   Figma: a layer's motion turns and scales it about its own middle and adds to its rest; its translation runs along
   its parent's axes, so a strip slides along its rotor's.

   A track is keyed at its turning points, so each stretch rises or falls, and split where a stretch lies farther
   than a tolerance from the track; a stretch is the cubic through its ends with the track's slopes there, which
   Figma's cubic-bezier easing with its handles at a third and two thirds of the time is. Measured 11 Nov 2026 at 800
   by 450: as designed 277 discs, 1,111 tracks and 10,368 keyframes, at zoom 2 89, 371 and 3,578, at zoom 4 31, 131
   and 1,317; the layers played as Figma plays them lie from the CPU's drawing by a mean of 0.5 to 0.7 levels, and
   Figma's own video of them by 2.2 to 2.7, its coding included. */
import { toHex } from "./color.ts";
import {
  DIMPLE_GROUND_STEPS,
  DIMPLE_LOOK,
  DIMPLE_ROAM_S,
  DIMPLE_STOPS,
  type DimpleView,
  dimpleDisc,
  dimpleDiscBlank,
  dimpleGround,
  dimpleLevel,
  dimpleRamp,
  dimpleRoamAt,
  dimpleScene
} from "./dimple.ts";
import {
  FIGMA_PAGE,
  type FigmaCurve,
  type FigmaField,
  type FigmaFinish,
  type FigmaMotion,
  type FigmaNode,
  figmaColor,
  figmaFinish,
  figmaLayers,
  figmaLinear,
  figmaPasteHtmlPacked,
  figmaScene,
  figmaSolid
} from "./figma-paste.ts";
import type { Underlay } from "./fx-finish.ts";
import type { Palette } from "./palette.ts";
import type { Size } from "./view.ts";

export interface FigmaDimpleView extends DimpleView {
  palette: Palette;
  width: number;
  height: number;
  /** the frame's name in Figma */
  name: string;
  /** the roam's pace: 0 pastes the still, its layers with no tracks */
  speed: number;
  finish?: FigmaFinish;
  underlay?: Underlay | null;
}

/** A keyframe: seconds into the loop, the value, and the easing of the stretch arriving at it as the y of a
    cubic-bezier's two handles, whose x are a third and two thirds; none for an even pace. */
export type DimpleKey = readonly [number, number, number?, number?];
export interface DimpleDiscLayers {
  /** the clip's middle at rest */
  x: number;
  y: number;
  /** the clip's motion from its rest */
  mx: DimpleKey[] | null;
  my: DimpleKey[] | null;
  /** the rotor: its turn at rest (radians, clockwise on screen) and its scale at rest (1, but for a disc at the
      hollow's heart), and its motion from them: a turn (radians clockwise) and a scale (times its rest's) */
  turn: number;
  scale: number;
  rot: DimpleKey[] | null;
  sc: DimpleKey[] | null;
  /** the strip: its middle along the rotor's axis from the clip's middle at rest, before the rotor's scale, and its
      slide from there */
  slide0: number;
  slide: DimpleKey[] | null;
}
export interface DimpleLayers {
  width: number;
  height: number;
  /** seconds the loop lasts */
  loop: number;
  /** a disc's radius */
  r: number;
  /** the strip unscaled: its length and height, where the palette's ends lie along it (0 to 1), and the pivot's
      length (its height the strip's) */
  strip: { w: number; h: number; from: number; to: number; pivot: number };
  stops: string[];
  ground: {
    x: number;
    y: number;
    r: number;
    stops: string[];
    mx: DimpleKey[] | null;
    my: DimpleKey[] | null;
  };
  discs: DimpleDiscLayers[];
}

/** The least a disc keeps of its run at the hollow's heart, in layers: its strip is drawn one over this larger at
    most, where the site's drawing flattens it wholly (dimple.ts's `least`); an eighth of a run is 2% of the palette
    across a disc. */
const K_MIN = 1 / 8;
/** Samples of the loop a track is read at before its keyframes are chosen. */
const SAMPLES = 480;
/** How far a track's eased stretches may lie from it: pixels a clip moves and a strip slides (at the lab's 800 by
    450; scaled with the box), radians a rotor turns (a strip turned 0.04 off shifts no color by half a percent of
    the palette), and a rotor's scale as a share. Looser ones save few keyframes, since most stand at turning points. */
const TOLERANCE = { move: 0.4, turn: 0.04, scale: 0.02, slide: 0.6 };

/* a stretch's value at a share s of its time: the cubic through its ends with handles y1, y2 */
const eased = (va: number, vb: number, y1: number, y2: number, s: number) =>
  va + (vb - va) * (3 * (1 - s) * (1 - s) * s * y1 + 3 * (1 - s) * s * s * y2 + s * s * s);

/* keyframes whose eased stretches stay within `tol` of the samples: a keyframe at every turning point, then
   stretches split where they lie farthest off; null for a track that never leaves its rest by `tol` */
function keysOf(values: Float64Array, loop: number, tol: number): DimpleKey[] | null {
  const n = values.length - 1;
  let flat = true;
  for (let i = 1; i <= n; i++) if (Math.abs(values[i] - values[0]) > tol) flat = false;
  if (flat) return null;
  const slope = (i: number) => {
    const a = Math.max(0, i - 1);
    const b = Math.min(n, i + 1);
    return (values[b] - values[a]) / (b - a);
  };
  const cuts = new Set<number>([0, n]);
  for (let i = 1; i < n; i++)
    if ((values[i] - values[i - 1]) * (values[i + 1] - values[i]) < 0) cuts.add(i);
  /* a rising stretch's handles: its end slopes over its mean slope, held to what a cubic that never turns back has */
  const handles = (a: number, b: number): [number, number] | null => {
    const dv = values[b] - values[a];
    if (Math.abs(dv) < 1e-12) return null;
    const mean = dv / (b - a);
    const held = (v: number) => Math.min(3, Math.max(0, v));
    return [held(slope(a) / mean) / 3, 1 - held(slope(b) / mean) / 3];
  };
  const stack: [number, number][] = [];
  const sorted = () => [...cuts].sort((p, q) => p - q);
  let order = sorted();
  for (let i = 0; i + 1 < order.length; i++) stack.push([order[i], order[i + 1]]);
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    if (b - a < 2) continue;
    const h = handles(a, b);
    let worst = 0;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const v = h ? eased(values[a], values[b], h[0], h[1], (i - a) / (b - a)) : values[a];
      const e = Math.abs(values[i] - v);
      if (e > worst) {
        worst = e;
        at = i;
      }
    }
    if (worst > tol && at > 0) {
      cuts.add(at);
      stack.push([a, at], [at, b]);
    }
  }
  order = sorted();
  const r4 = (v: number) => Math.floor(v * 1e4 + 0.5) / 1e4;
  const out: DimpleKey[] = [[0, values[0]]];
  for (let i = 1; i < order.length; i++) {
    const h = handles(order[i - 1], order[i]);
    const t = (loop * order[i]) / n;
    out.push(h ? [t, values[order[i]], r4(h[0]), r4(h[1])] : [t, values[order[i]]]);
  }
  return out;
}

/** The roaming dimple as layers and their tracks: every disc that shows at some time of the loop, the bottom of the
    stack first. At speed 0 it is the still: the layers at rest, no track. */
export function dimpleLayers(
  P: Palette,
  view: DimpleView,
  size: Size,
  speed: number
): DimpleLayers {
  const m = dimpleScene(P, view, size);
  const L = DIMPLE_LOOK;
  const loop = speed ? DIMPLE_ROAM_S / speed : 0;
  const r = m.r;
  /* a tolerance is a length at the lab's box: it grows with the box, so a larger paste has no more keyframes */
  const unit = m.D / 800;
  const tol = {
    move: TOLERANCE.move * unit,
    slide: TOLERANCE.slide * unit,
    turn: TOLERANCE.turn,
    scale: TOLERANCE.scale
  };
  /* the palette's whole length along a strip, and the strip around it: a disc's own radius and a quarter past each
     end and over its height, so a turned, sliding strip always covers its clip */
  const span = r / L.run;
  const pad = r * 1.25;
  const strip = {
    w: span + 2 * pad,
    h: 2 * pad,
    from: pad / (span + 2 * pad),
    to: (pad + span) / (span + 2 * pad),
    pivot: 2 * span + 2 * pad
  };
  const stops: string[] = [];
  for (let i = 0; i < DIMPLE_STOPS; i++) stops.push(toHex(m.stops.slice(3 * i, 3 * i + 3)));
  const n = speed ? SAMPLES : 0;
  const hollows: [number, number][] = [];
  for (let k = 0; k <= n; k++) hollows.push(dimpleRoamAt(m, (DIMPLE_ROAM_S * k) / SAMPLES));
  const disc = dimpleDiscBlank();
  const discs: DimpleDiscLayers[] = [];
  const X = new Float64Array(n + 1);
  const Y = new Float64Array(n + 1);
  const SL = new Float64Array(n + 1);
  const ROT = new Float64Array(n + 1);
  const SC = new Float64Array(n + 1);
  for (let q = 0; q < m.places.length; q += 2) {
    let shows = false;
    let last = 0;
    for (let k = 0; k <= n; k++) {
      dimpleDisc(m, m.places[q], m.places[q + 1], hollows[k][0], hollows[k][1], disc);
      X[k] = disc.x;
      Y[k] = disc.y;
      if (disc.x > -r && disc.x < m.width + r && disc.y > -r && disc.y < m.height + r) shows = true;
      /* the way to the hollow, clockwise on screen, unwound; on the hollow itself it has none: the last holds */
      let phi = disc.ux || disc.uy ? Math.atan2(disc.uy, disc.ux) : last;
      if (k > 0) {
        while (phi - last > Math.PI) phi -= 2 * Math.PI;
        while (phi - last < -Math.PI) phi += 2 * Math.PI;
      }
      last = phi;
      ROT[k] = phi;
      SC[k] = 1 / Math.max(K_MIN, disc.k);
      SL[k] = (0.5 - disc.t) * span;
    }
    if (!shows) continue;
    /* the first sample is the rest: everything moves from it */
    const x0 = X[0];
    const y0 = Y[0];
    const sl0 = SL[0];
    const rot0 = ROT[0];
    const sc0 = SC[0];
    for (let k = 0; k <= n; k++) {
      X[k] -= x0;
      Y[k] -= y0;
      SL[k] -= sl0;
      ROT[k] -= rot0;
      SC[k] /= sc0;
    }
    discs.push({
      x: x0,
      y: y0,
      mx: keysOf(X, loop, tol.move),
      my: keysOf(Y, loop, tol.move),
      turn: rot0,
      scale: sc0,
      rot: keysOf(ROT, loop, tol.turn),
      sc: keysOf(SC, loop, tol.scale / sc0),
      slide0: sl0,
      slide: keysOf(SL, loop, tol.slide)
    });
  }
  /* the ground: a round gradient about the hollow, as far as its farthest corner ever lies, its colors those the
     site's ground has at each distance */
  const GX = new Float64Array(n + 1);
  const GY = new Float64Array(n + 1);
  let far = 0;
  for (let k = 0; k <= n; k++) {
    GX[k] = hollows[k][0] - hollows[0][0];
    GY[k] = hollows[k][1] - hollows[0][1];
    far = Math.max(far, dimpleGround(m, hollows[k][0], hollows[k][1]).far);
  }
  const groundStops: string[] = [];
  const c = [0, 0, 0];
  for (let k = 0; k <= DIMPLE_GROUND_STEPS; k++) {
    dimpleRamp(m, dimpleLevel(m, (far * k) / DIMPLE_GROUND_STEPS) - L.under, c, 0);
    groundStops.push(toHex(c));
  }
  return {
    width: m.width,
    height: m.height,
    loop,
    r,
    strip,
    stops,
    ground: {
      x: hollows[0][0],
      y: hollows[0][1],
      r: far,
      stops: groundStops,
      mx: keysOf(GX, loop, tol.move),
      my: keysOf(GY, loop, tol.move)
    },
    discs
  };
}

/** A track's value at a time: each stretch eased as its arriving keyframe says; `rest` where it has none. What a
    check draws the layers by, as Figma plays them. */
export function dimpleTrackAt(track: readonly DimpleKey[] | null, t: number, rest = 0): number {
  if (!track) return rest;
  let a = 0;
  let b = track.length - 1;
  if (t <= track[0][0]) return track[0][1];
  if (t >= track[b][0]) return track[b][1];
  while (b - a > 1) {
    const mid = (a + b) >> 1;
    if (track[mid][0] <= t) a = mid;
    else b = mid;
  }
  const [t0, v0] = track[a];
  const [t1, v1, y1, y2] = track[b];
  const s = (t - t0) / (t1 - t0);
  return y1 === undefined || y2 === undefined ? v0 + (v1 - v0) * s : eased(v0, v1, y1, y2, s);
}

/* a track as Figma keys it: the property, its value at rest, and each keyframe's easing as a cubic-bezier */
const motionOf = (
  field: FigmaField,
  track: readonly DimpleKey[],
  base: number,
  times = 1
): FigmaMotion => ({
  field,
  base,
  keys: track.map(([t, v, y1, y2]) => ({
    t,
    v: v * times,
    e: y1 === undefined || y2 === undefined ? null : ([1 / 3, y1, 2 / 3, y2] as FigmaCurve)
  }))
});

/** The dimple's paste nodes: the document, its page, the frame and its layers, and its keyframe tracks. */
export function figmaDimpleNodes(view: FigmaDimpleView): FigmaNode[] {
  const { width: W, height: H, speed } = view;
  const layers = dimpleLayers(view.palette, view, { width: W, height: H }, speed);
  const { nodes, internal, add, group, animate } = figmaLayers();
  /* the tracks a layer takes its motion from, or nothing where it has none */
  const moved = (...motions: (FigmaMotion | null)[]) => {
    const entries = motions.flatMap(m => (m ? animate(m).entries : []));
    return entries.length ? { parameterConsumptionMap: { entries } } : {};
  };
  const track = (field: FigmaField, keys: readonly DimpleKey[] | null, base: number, times = 1) =>
    keys ? motionOf(field, keys, base, times) : null;
  const g = layers.ground;
  const top = add("FRAME", view.name, FIGMA_PAGE, 0, W, H, 0, 0, {
    fillPaints: [figmaSolid(g.stops[g.stops.length - 1])],
    frameMaskDisabled: false,
    ...(speed ? { timelineDuration: Math.round(layers.loop * 1e6) } : {})
  });
  const into = figmaFinish(
    { add, group },
    top,
    { width: W, height: H },
    view.finish,
    view.underlay
  );
  let index = into.index;
  add("ELLIPSE", "under the discs", into.parent, index++, 2 * g.r, 2 * g.r, g.x - g.r, g.y - g.r, {
    fillPaints: [
      {
        type: "GRADIENT_RADIAL",
        opacity: 1,
        visible: true,
        blendMode: "NORMAL",
        transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
        stops: g.stops.map((hex, i) => ({
          color: figmaColor(hex),
          position: i / (g.stops.length - 1)
        }))
      }
    ],
    ...moved(track("MOTION_TRANSLATION_X", g.mx, 0), track("MOTION_TRANSLATION_Y", g.my, 0))
  });
  const st = layers.strip;
  const r = layers.r;
  /* the palette along a strip's length, its ends held past the palette's own */
  const at = layers.stops.map(
    (_, i) => st.from + ((st.to - st.from) * i) / (layers.stops.length - 1)
  );
  for (const [i, d] of layers.discs.entries()) {
    /* the rotor at its rest's scale, turned about its middle, which lies on the clip's; the disc's group fits it */
    const k = d.scale;
    const w = st.pivot * k;
    const h = st.h * k;
    const cs = Math.cos(d.turn);
    const sn = Math.sin(d.turn);
    const hx = (Math.abs(cs) * w + Math.abs(sn) * h) / 2;
    const hy = (Math.abs(sn) * w + Math.abs(cs) * h) / 2;
    const disc = group(`disc ${i + 1}`, into.parent, index++, d.x - hx, d.y - hy, 2 * hx, 2 * hy, {
      blendMode: "NORMAL",
      ...moved(track("MOTION_TRANSLATION_X", d.mx, 0), track("MOTION_TRANSLATION_Y", d.my, 0))
    });
    add("ELLIPSE", "clip", disc, 0, 2 * r, 2 * r, hx - r, hy - r, {
      fillPaints: [figmaSolid("#000000")],
      mask: true,
      maskType: "ALPHA"
    });
    const rotor = group("toward the hollow", disc, 1, 0, 0, w, h, {
      blendMode: "NORMAL",
      transform: {
        m00: cs,
        m01: -sn,
        m02: hx - (cs * w) / 2 + (sn * h) / 2,
        m10: sn,
        m11: cs,
        m12: hy - (sn * w) / 2 - (cs * h) / 2
      },
      ...moved(track("MOTION_ROTATION", d.rot, 0), track("MOTION_SCALE_XY", d.sc, 1))
    });
    add("RECTANGLE", "pivot", rotor, 0, w, h, 0, 0, { fillPaints: [figmaSolid("#000000", 0)] });
    const sw = st.w * k;
    add("RECTANGLE", "palette", rotor, 1, sw, h, (w - sw) / 2 + d.slide0 * k, 0, {
      fillPaints: [figmaLinear(layers.stops, 90, sw, h, at)],
      /* the strip slides along the rotor's own axis, at the rotor's rest scale */
      ...moved(track("MOTION_TRANSLATION_X", d.slide, 0, k))
    });
  }
  return figmaScene(nodes, internal);
}

/** The clipboard's text/html for the dimple, which a paste into Figma reads as its layers: its message deflated,
    since a roam as designed is some 13,000 nodes (1.5 MB of text stored, 0.3 deflated). */
export function figmaDimpleHtml(
  view: FigmaDimpleView,
  pasteID = Math.floor(Math.random() * 0x7fffffff)
): Promise<string> {
  return figmaPasteHtmlPacked(figmaDimpleNodes(view), pasteID, "grabientPasteDimple0000");
}
