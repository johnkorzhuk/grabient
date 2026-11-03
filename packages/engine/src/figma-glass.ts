/* A palette's fluted glass as Figma's own layers (figma-paste.ts writes them to the clipboard): one frame holding a
   group masked to the box, the palette's base past the box's edge, the discs as ellipses under one layer blur, and the
   ribs as crescents (a circle minus the one before, cut to a square past the box) with Figma's Glass on each and a
   light blur over them all.

   Tuned against the site's own still in a Figma lab (W/figma-clip, 31 Oct 2026), rendered by Figma and scored on five
   palette views: a mask, not the frame's clip, since a clipping frame lets the glass read past the box and draws teeth
   at its edges; the Glass at depth 100 (the whole rib a lens), no light, no dispersion, splay 0 (Figma's 0.61 when the
   Glass is added by hand softens the ribs) and refraction 1.5, which only a paste reaches (the plugin API stops at 1)
   and which matched the site best on every palette tried; a 4 px blur over the ribs. Figma's blur radius is twice the
   SVG's standard deviation. Every length is the 1000 px design's, scaled to cover the box as the site's still covers
   it.
   While the glass plays, its colors drift on Figma's own timeline as the site's do: each disc travels its ellipse
   along the ribs, one or two laps a loop (GLASS_LOOP over the speed). An ellipse is no turn Figma can key, but each of
   its screen axes is a plain wave, so a disc's group moves across and its inner group down, each keyed at the wave's
   turning points on the ease a sine's swing follows, a stretch that starts or ends partway on that part of it. The
   ribs stay still, as on the site. Its soft and grain wrap the masked group as the site paints them (figmaFinish),
   still while the colors move. */
import {
  FIGMA_PAGE,
  type FigmaCurve,
  type FigmaField,
  type FigmaFinish,
  type FigmaMotion,
  type FigmaNode,
  figmaAt,
  figmaBlur,
  figmaColor,
  figmaCurveBetween,
  figmaFinish,
  figmaLayers,
  figmaPasteHtml,
  figmaScene,
  figmaSolid
} from "./figma-paste.ts";
import { GLASS_DESIGN, GLASS_LOOP, glassDiscAt, glassField, glassGeometry } from "./glass.ts";
import type { Palette } from "./palette.ts";

/** The Glass a rib carries, in the clipboard's names: refractionIntensity is Figma's Refraction, refractionRadius its
    Depth, specularIntensity and specularAngle its Light, chromaticAberration its Dispersion, reflectionDistance its
    Splay and radius its Frost. */
export const FIGMA_GLASS = {
  refraction: 1.5,
  depth: 100,
  ribBlur: 4,
  bleed: 300
} as const;

export interface FigmaGlassView {
  /** the six colors the glass takes (glassColors) */
  colors: readonly string[];
  /** its palette, whose gradient a soft glass's edges go to */
  palette?: Palette;
  angle: number;
  shape: number | null;
  width: number;
  height: number;
  /** the frame's name in Figma */
  name: string;
  /** how fast the colors drift, the loop GLASS_LOOP seconds over this; 0 or none, the first frame alone */
  speed?: number;
  /** the soft and the grain over it, none where absent */
  finish?: FigmaFinish | null;
}

/** The ease of a cosine's swing from one end to the other (CSS's easeInOutSine), within half a percent of it. */
const SINE: FigmaCurve = [0.37, 0, 0.63, 1];

/* A plain wave, A cos(rate t + phase), as keyframes of its change from t = 0 over a loop of whole periods: its turning
   points, and its start and end where they fall between two (cos is even, so a falling rate is a rising one with the
   phase turned back) */
function wave(
  field: FigmaField,
  A: number,
  rate: number,
  phase: number,
  loop: number
): FigmaMotion {
  const w = Math.abs(rate);
  const start = rate < 0 ? -phase : phase;
  const at0 = A * Math.cos(start);
  const half = Math.PI / w;
  const h0 = start / Math.PI;
  const into = h0 - Math.floor(h0);
  const turns = Math.round((loop * w) / Math.PI);
  const keys: FigmaMotion["keys"][number][] = [{ t: 0, v: 0, e: null }];
  const end = (k: number) => A * (k % 2 === 0 ? 1 : -1) - at0;
  if (into < 1e-9 || into > 1 - 1e-9) {
    const k0 = Math.round(h0);
    for (let j = 1; j <= turns; j++) keys.push({ t: j * half, v: end(k0 + j), e: SINE });
    return { field, base: 0, keys };
  }
  const k0 = Math.floor(h0) + 1;
  for (let j = 0; j < turns; j++)
    keys.push({
      t: (1 - into) * half + j * half,
      v: end(k0 + j),
      e: j === 0 ? figmaCurveBetween(SINE, into, 1) : SINE
    });
  keys.push({ t: loop, v: 0, e: figmaCurveBetween(SINE, 0, into) });
  return { field, base: 0, keys };
}

const glassEffect = (depth: number) => ({
  type: "GLASS",
  offset: { x: 0, y: 4 },
  radius: 0,
  visible: true,
  blendMode: "NORMAL",
  spread: 0,
  showShadowBehindNode: false,
  color: { r: 0, g: 0, b: 0, a: 0.25 },
  secondaryColor: { r: 1, g: 1, b: 1, a: 0 },
  refractionRadius: depth,
  specularAngle: -45,
  specularIntensity: 0,
  bevelSize: 1,
  chromaticAberration: 0,
  reflectionDistance: 0,
  refractionIntensity: FIGMA_GLASS.refraction
});

/** The glass's layers as Figma's scene: the document, its page, the frame and everything in it. */
export function figmaGlassNodes(view: FigmaGlassView): FigmaNode[] {
  const design = glassGeometry(GLASS_DESIGN, view.angle, view.shape);
  const field = glassField(design, view.colors);
  const place = new Float32Array(2);
  const discs = field.discs.map(d => {
    glassDiscAt(design, d, 0, place, 0);
    return { x: place[0], y: place[1], R: d.R, color: d.color };
  });
  /* the design covers the box, as the site's still does */
  const { width: W, height: H } = view;
  const s = Math.max(W, H) / GLASS_DESIGN.width;
  const ox = (W - GLASS_DESIGN.width * s) / 2;
  const oy = (H - GLASS_DESIGN.height * s) / 2;
  const X = (x: number) => ox + x * s;
  const Y = (y: number) => oy + y * s;

  const { nodes, internal, add, group, animate } = figmaLayers();
  const loop = view.speed ? GLASS_LOOP / view.speed : 0;
  const top = add("FRAME", view.name, FIGMA_PAGE, 0, W, H, 0, 0, {
    fillPaints: [],
    frameMaskDisabled: true,
    ...(loop ? { timelineDuration: Math.round(loop * 1e6) } : {})
  });
  const into = figmaFinish(
    { add, group },
    top,
    { width: W, height: H },
    view.finish,
    view.palette ? { palette: view.palette, kind: "glass", angle: view.angle } : null
  );
  const glass = group("glass", into.parent, into.index, 0, 0, W, H);
  add("RECTANGLE", "mask", glass, 0, W, H, 0, 0, {
    fillPaints: [figmaSolid("#000000")],
    mask: true,
    maskType: "ALPHA"
  });
  const bleed = FIGMA_GLASS.bleed + 100;
  const side = GLASS_DESIGN.width + 2 * bleed;
  add("RECTANGLE", "base", glass, 1, side * s, side * s, X(-bleed), Y(-bleed), {
    fillPaints: [figmaSolid(field.base)]
  });

  const gx = Math.min(...discs.map(d => d.x - d.R));
  const gy = Math.min(...discs.map(d => d.y - d.R));
  const gw = Math.max(...discs.map(d => d.x + d.R)) - gx;
  const gh = Math.max(...discs.map(d => d.y + d.R)) - gy;
  const colors = group("colors", glass, 2, X(gx), Y(gy), gw * s, gh * s, {
    effects: [figmaBlur(2 * design.sigma * s)]
  });
  /* each disc's orbit as two waves on the screen: an ellipse of half-axes a (along the ribs) and b, turned to the
     ribs' angle, swept at the disc's own pace from where it starts */
  const al = (design.alpha * Math.PI) / 180;
  for (const [i, d] of discs.entries()) {
    const c = figmaColor(d.color);
    const x = (d.x - d.R - gx) * s;
    const y = (d.y - d.R - gy) * s;
    const side = 2 * d.R * s;
    let parent = colors;
    let index = i;
    let ox = x;
    let oy = y;
    if (loop) {
      const orbit = field.discs[i];
      const rate = (orbit.dir * 2 * Math.PI * (view.speed ?? 1)) / orbit.dur;
      const ang0 = (orbit.dir * 2 * Math.PI * -orbit.delay) / orbit.dur;
      const ca = Math.cos(al);
      const sa = Math.sin(al);
      const across = wave(
        "MOTION_TRANSLATION_X",
        Math.hypot(orbit.a * ca, orbit.b * sa) * s,
        rate,
        ang0 + Math.atan2(orbit.b * sa, orbit.a * ca),
        loop
      );
      const down = wave(
        "MOTION_TRANSLATION_Y",
        Math.hypot(orbit.a * sa, orbit.b * ca) * s,
        rate,
        ang0 + Math.atan2(-orbit.b * ca, orbit.a * sa),
        loop
      );
      const outer = group(`drift ${i + 1}`, colors, i, x, y, side, side, {
        parameterConsumptionMap: animate(across)
      });
      parent = group("drift down", outer, 0, 0, 0, side, side, {
        parameterConsumptionMap: animate(down)
      });
      index = 0;
      ox = 0;
      oy = 0;
    }
    add("ELLIPSE", `color ${i + 1}`, parent, index, side, side, ox, oy, {
      fillPaints: [
        {
          type: "GRADIENT_RADIAL",
          opacity: 1,
          visible: true,
          blendMode: "NORMAL",
          transform: figmaAt(),
          stops: [
            { color: c, position: 0 },
            { color: c, position: field.core },
            { color: { ...c, a: 0 }, position: 1 }
          ]
        }
      ]
    });
  }

  /* rib k: circle k + 1 minus circle k, cut to the square the bleed reaches */
  const lo = -FIGMA_GLASS.bleed;
  const hi = GLASS_DESIGN.width + FIGMA_GLASS.bleed;
  const ribs = group("ribs", glass, 3, X(lo), Y(lo), (hi - lo) * s, (hi - lo) * s, {
    effects: [figmaBlur(FIGMA_GLASS.ribBlur * s)]
  });
  for (let k = 0; k < design.ribs.length - 1; k++) {
    const a = design.ribs[k];
    const b = design.ribs[k + 1];
    const ox0 = b.cx - b.r;
    const oy0 = b.cy - b.r;
    const ix = Math.max(ox0, lo);
    const iy = Math.max(oy0, lo);
    const iw = Math.min(ox0 + 2 * b.r, hi) - ix;
    const ih = Math.min(oy0 + 2 * b.r, hi) - iy;
    const rib = add(
      "BOOLEAN_OPERATION",
      `rib ${k + 1}`,
      ribs,
      k,
      iw * s,
      ih * s,
      (ix - lo) * s,
      (iy - lo) * s,
      {
        booleanOperation: "INTERSECT",
        fillPaints: [],
        effects: [glassEffect(FIGMA_GLASS.depth * s)]
      }
    );
    const crescent = add(
      "BOOLEAN_OPERATION",
      "crescent",
      rib,
      0,
      2 * b.r * s,
      2 * b.r * s,
      (ox0 - ix) * s,
      (oy0 - iy) * s,
      {
        booleanOperation: "SUBTRACT",
        fillPaints: [figmaSolid("#ffffff")]
      }
    );
    add("ELLIPSE", "outer", crescent, 0, 2 * b.r * s, 2 * b.r * s, 0, 0, {
      fillPaints: [figmaSolid("#ffffff")]
    });
    add(
      "ELLIPSE",
      "inner",
      crescent,
      1,
      2 * a.r * s,
      2 * a.r * s,
      (a.cx - a.r - ox0) * s,
      (a.cy - a.r - oy0) * s,
      {
        fillPaints: [figmaSolid("#ffffff")]
      }
    );
    add("RECTANGLE", "bleed", rib, 1, (hi - lo) * s, (hi - lo) * s, (lo - ix) * s, (lo - iy) * s, {
      fillPaints: [figmaSolid("#ffffff")]
    });
  }
  return figmaScene(nodes, internal);
}

/** The clipboard's text/html for the glass, which a paste into Figma reads as its layers. */
export function figmaGlassHtml(
  view: FigmaGlassView,
  pasteID = Math.floor(Math.random() * 0x7fffffff)
): string {
  return figmaPasteHtml(figmaGlassNodes(view), pasteID, "grabientPasteGlass00000");
}
