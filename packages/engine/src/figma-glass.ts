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
   it. */
import {
  FIGMA_PAGE,
  type FigmaNode,
  figmaAt,
  figmaBlur,
  figmaColor,
  figmaLayers,
  figmaPasteHtml,
  figmaScene,
  figmaSolid
} from "./figma-paste.ts";
import { GLASS_DESIGN, glassDiscAt, glassField, glassGeometry } from "./glass.ts";

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
  angle: number;
  shape: number | null;
  width: number;
  height: number;
  /** the frame's name in Figma */
  name: string;
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

  const { nodes, add, group } = figmaLayers();
  const top = add("FRAME", view.name, FIGMA_PAGE, 0, W, H, 0, 0, {
    fillPaints: [],
    frameMaskDisabled: true
  });
  const glass = group("glass", top, 0, 0, 0, W, H);
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
  discs.forEach((d, i) => {
    const c = figmaColor(d.color);
    add(
      "ELLIPSE",
      `color ${i + 1}`,
      colors,
      i,
      2 * d.R * s,
      2 * d.R * s,
      (d.x - d.R - gx) * s,
      (d.y - d.R - gy) * s,
      {
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
      }
    );
  });

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
  return figmaScene(nodes);
}

/** The clipboard's text/html for the glass, which a paste into Figma reads as its layers. */
export function figmaGlassHtml(
  view: FigmaGlassView,
  pasteID = Math.floor(Math.random() * 0x7fffffff)
): string {
  return figmaPasteHtml(figmaGlassNodes(view), pasteID, "grabientPasteGlass00000");
}
