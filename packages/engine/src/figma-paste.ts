/* A palette's fluted glass as Figma's own layers, in the form Figma reads off the clipboard, so a paste into Figma gives
   real layers that look like the site's still: one frame holding a group masked to the box, the palette's base past
   the box's edge, the discs as ellipses under one layer blur, and the ribs as crescents (a circle minus the one before,
   cut to a square past the box) with Figma's Glass on each and a light blur over them all.

   Tuned against the site's own still in a Figma lab (W/figma-clip, 31 Oct 2026), rendered by Figma and scored on five
   palette views: a mask, not the frame's clip, since a clipping frame lets the glass read past the box and draws teeth
   at its edges; the Glass at depth 100 (the whole rib a lens), no light, no dispersion, splay 0 (Figma's 0.61 when the
   Glass is added by hand softens the ribs) and refraction 1.5, which only a paste reaches (the plugin API stops at 1)
   and which matched the site best on every palette tried; a 4 px blur over the ribs. Figma's blur radius is twice the
   SVG's standard deviation. Every length is the 1000 px design's, scaled to cover the box as the site's still covers
   it.

   The clipboard's text/html carries two attributes: (figmeta), base64 JSON naming the paste, and (figma), base64 of
   "fig-kiwi", the format's version, then two chunks, each its length and its deflated bytes: the schema the message is
   written in (figma-schema.ts, the part of Figma's a paste uses) and the message, kiwi-encoded (kiwi.ts), stored in
   deflate's uncompressed blocks so the whole paste is made at once, inside the press that copies it. */
import { FIGMA_DEFS, FIGMA_SCHEMA, FIGMA_VERSION } from "./figma-schema.ts";
import { GLASS_DESIGN, glassDiscAt, glassField, glassGeometry } from "./glass.ts";
import { encodeKiwi } from "./kiwi.ts";

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

type Node = Record<string, unknown> & { guid: { sessionID: number; localID: number } };

/* the platform's, in a browser, a Worker and Node alike; the engine's types name no platform */
declare const TextEncoder: new () => { encode(text: string): Uint8Array };
declare function btoa(data: string): string;
declare function atob(data: string): string;

const rgb = (hex: string, a = 1) => {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a };
};
const at = (x = 0, y = 0) => ({ m00: 1, m01: 0, m02: x, m10: 0, m11: 1, m12: y });
const solid = (hex: string) => ({
  type: "SOLID",
  color: rgb(hex),
  opacity: 1,
  visible: true,
  blendMode: "NORMAL"
});
const blur = (radius: number) => ({
  type: "FOREGROUND_BLUR",
  offset: { x: 0, y: 0 },
  radius,
  visible: true,
  blendMode: "NORMAL",
  spread: 0,
  showShadowBehindNode: true,
  color: { r: 0, g: 0, b: 0, a: 1 }
});
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

const DOCUMENT = { sessionID: 0, localID: 0 };
const PAGE = { sessionID: 0, localID: 1 };

/** The glass's layers as Figma's scene: the document, its page, the frame and everything in it. */
export function figmaGlassNodes(view: FigmaGlassView): Node[] {
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

  let local = 1;
  const nodes: Node[] = [];
  const add = (
    type: string,
    name: string,
    parent: Node | typeof PAGE,
    index: number,
    w: number,
    h: number,
    x: number,
    y: number,
    extra: Record<string, unknown> = {}
  ): Node => {
    const node: Node = {
      guid: { sessionID: 1, localID: local++ },
      phase: "CREATED",
      parentIndex: {
        guid: "guid" in parent ? parent.guid : parent,
        position: String.fromCharCode(33 + index)
      },
      type,
      name,
      visible: true,
      opacity: 1,
      size: { x: w, y: h },
      transform: at(x, y),
      strokeWeight: 1,
      strokeAlign: "INSIDE",
      strokeJoin: "MITER",
      ...extra
    };
    nodes.push(node);
    return node;
  };
  const group = (
    name: string,
    parent: Node,
    index: number,
    x: number,
    y: number,
    w: number,
    h: number,
    extra = {}
  ) =>
    add("FRAME", name, parent, index, w, h, x, y, {
      fillPaints: [],
      frameMaskDisabled: false,
      resizeToFit: true,
      ...extra
    });

  const top = add("FRAME", view.name, PAGE, 0, W, H, 0, 0, {
    fillPaints: [],
    frameMaskDisabled: true
  });
  const glass = group("glass", top, 0, 0, 0, W, H);
  add("RECTANGLE", "mask", glass, 0, W, H, 0, 0, {
    fillPaints: [solid("#000000")],
    mask: true,
    maskType: "ALPHA"
  });
  const bleed = FIGMA_GLASS.bleed + 100;
  const side = GLASS_DESIGN.width + 2 * bleed;
  add("RECTANGLE", "base", glass, 1, side * s, side * s, X(-bleed), Y(-bleed), {
    fillPaints: [solid(field.base)]
  });

  const gx = Math.min(...discs.map(d => d.x - d.R));
  const gy = Math.min(...discs.map(d => d.y - d.R));
  const gw = Math.max(...discs.map(d => d.x + d.R)) - gx;
  const gh = Math.max(...discs.map(d => d.y + d.R)) - gy;
  const colors = group("colors", glass, 2, X(gx), Y(gy), gw * s, gh * s, {
    effects: [blur(2 * design.sigma * s)]
  });
  discs.forEach((d, i) => {
    const c = rgb(d.color);
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
            transform: at(),
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
    effects: [blur(FIGMA_GLASS.ribBlur * s)]
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
        fillPaints: [solid("#ffffff")]
      }
    );
    add("ELLIPSE", "outer", crescent, 0, 2 * b.r * s, 2 * b.r * s, 0, 0, {
      fillPaints: [solid("#ffffff")]
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
        fillPaints: [solid("#ffffff")]
      }
    );
    add("RECTANGLE", "bleed", rib, 1, (hi - lo) * s, (hi - lo) * s, (lo - ix) * s, (lo - iy) * s, {
      fillPaints: [solid("#ffffff")]
    });
  }
  const identity = at();
  return [
    {
      guid: DOCUMENT,
      phase: "CREATED",
      type: "DOCUMENT",
      name: "Document",
      visible: true,
      opacity: 1,
      transform: identity
    },
    {
      guid: PAGE,
      phase: "CREATED",
      parentIndex: { guid: DOCUMENT, position: "!" },
      type: "CANVAS",
      name: "Page 1",
      visible: true,
      opacity: 1,
      transform: identity,
      backgroundOpacity: 1,
      backgroundEnabled: true
    },
    ...nodes,
    {
      guid: { sessionID: 20006994, localID: 2 },
      phase: "CREATED",
      parentIndex: { guid: DOCUMENT, position: '"' },
      type: "CANVAS",
      name: "Internal Only Canvas",
      visible: false,
      opacity: 1,
      transform: identity,
      backgroundOpacity: 1,
      backgroundEnabled: true,
      internalOnly: true
    }
  ];
}

/* deflate's uncompressed blocks: what Figma inflates, made at once */
function stored(bytes: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(bytes.length / 65535));
  const out = new Uint8Array(bytes.length + blocks * 5);
  let o = 0;
  for (let i = 0; i < blocks; i++) {
    const part = bytes.subarray(i * 65535, (i + 1) * 65535);
    const len = part.length;
    out[o++] = i === blocks - 1 ? 1 : 0;
    out[o++] = len & 255;
    out[o++] = len >> 8;
    out[o++] = ~len & 255;
    out[o++] = (~len >> 8) & 255;
    out.set(part, o);
    o += len;
  }
  return out;
}

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

const FILE_KEY = "grabientPasteGlass00000";

/** The clipboard's text/html for the glass, which a paste into Figma reads as its layers. */
export function figmaGlassHtml(
  view: FigmaGlassView,
  pasteID = Math.floor(Math.random() * 0x7fffffff)
): string {
  const nodes = figmaGlassNodes(view);
  const message = {
    type: "NODE_CHANGES",
    sessionID: 0,
    ackID: 0,
    pasteID,
    pasteOffset: { x: 0, y: 0 },
    pasteFileKey: FILE_KEY,
    pasteIsPartiallyOutsideEnclosingFrame: false,
    pastePageId: PAGE,
    isCut: false,
    pasteEditorType: "DESIGN",
    clipboardSelectionRegions: [
      {
        parent: PAGE,
        nodes: [nodes[2].guid],
        enclosingFrameOffset: { x: 0, y: 0 },
        pasteIsPartiallyOutsideEnclosingFrame: false,
        focusType: "NONE"
      }
    ],
    pasteAssetType: "UNKNOWN",
    nodeChangeOrder: "GUID",
    nodeChanges: nodes
  };
  const schema = fromBase64(FIGMA_SCHEMA);
  const body = stored(encodeKiwi(FIGMA_DEFS, "Message", message));
  const buffer = new Uint8Array(12 + 4 + schema.length + 4 + body.length);
  const view32 = new DataView(buffer.buffer);
  buffer.set(new TextEncoder().encode("fig-kiwi"), 0);
  view32.setUint32(8, FIGMA_VERSION, true);
  view32.setUint32(12, schema.length, true);
  buffer.set(schema, 16);
  view32.setUint32(16 + schema.length, body.length, true);
  buffer.set(body, 20 + schema.length);
  const meta = btoa(
    `${JSON.stringify({ fileKey: FILE_KEY, pasteID, dataType: "scene", editorType: "design" })}\n`
  );
  return `<meta charset="utf-8"><span data-metadata="<!--(figmeta)${meta}(/figmeta)-->"></span><span data-buffer="<!--(figma)${toBase64(buffer)}(/figma)-->"></span><span style="white-space:pre-wrap;"></span>`;
}
