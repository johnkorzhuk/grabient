/* An effect as Figma's own layers, in the form Figma reads off the clipboard, so a paste into Figma gives real layers
   that look like the site's still: what the pastes of the glass (figma-glass.ts), the blob (figma-blob.ts), the silk
   (figma-silk.ts) and the rosette (figma-rosette.ts) share. Each loads alone, on the press that copies it, with its own
   effect's code.

   The clipboard's text/html carries two attributes: (figmeta), base64 JSON naming the paste, and (figma), base64 of
   "fig-kiwi", the format's version, then two chunks, each its length and its deflated bytes: the schema the message is
   written in (figma-schema.ts, the part of Figma's a paste uses) and the message, kiwi-encoded (kiwi.ts), stored in
   deflate's uncompressed blocks so the whole paste is made at once, inside the press that copies it. A layer is a node
   of Figma's scene, placed under its parent by an index; a group is a frame that fits its children. A paste that moves
   keeps its keyframe tracks under Figma's internal canvas, as Figma's own copies do. */
import { FIGMA_DEFS, FIGMA_SCHEMA, FIGMA_VERSION } from "./figma-schema.ts";
import { encodeKiwi } from "./kiwi.ts";

export type FigmaNode = Record<string, unknown> & { guid: { sessionID: number; localID: number } };

/* the platform's, in a browser, a Worker and Node alike; the engine's types name no platform */
declare const TextEncoder: new () => { encode(text: string): Uint8Array };
declare function btoa(data: string): string;
declare function atob(data: string): string;

/** A #rrggbb color as Figma's, each channel 0 to 1. */
export const figmaColor = (hex: string, a = 1) => {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a };
};
/** A layer's place: a translation. */
export const figmaAt = (x = 0, y = 0) => ({ m00: 1, m01: 0, m02: x, m10: 0, m11: 1, m12: y });
export const figmaSolid = (hex: string, opacity = 1) => ({
  type: "SOLID",
  color: figmaColor(hex),
  opacity,
  visible: true,
  blendMode: "NORMAL"
});
/** Figma's layer blur (the plugin API's LAYER_BLUR) of a radius. */
export const figmaBlur = (radius: number) => ({
  type: "FOREGROUND_BLUR",
  offset: { x: 0, y: 0 },
  radius,
  visible: true,
  blendMode: "NORMAL",
  spread: 0,
  showShadowBehindNode: true,
  color: { r: 0, g: 0, b: 0, a: 1 }
});

/** A property Figma's Motion keys on a layer. */
export type FigmaField =
  | "MOTION_ROTATION"
  | "MOTION_SCALE_XY"
  | "MOTION_TRANSLATION_X"
  | "MOTION_TRANSLATION_Y";
/** A cubic-bezier's four numbers, as CSS writes one. */
export type FigmaCurve = readonly [number, number, number, number];
/** A motion as Figma keys it: the property, its value at rest, and keyframes (seconds, value, and the easing of the
    stretch arriving at it: a cubic-bezier, or null for an even pace). Angles are radians, clockwise on the screen as
    CSS's are, though Figma's plugin API counts degrees the other way. */
export interface FigmaMotion {
  field: FigmaField;
  base: number;
  keys: readonly { t: number; v: number; e: FigmaCurve | null }[];
}

type Point = readonly [number, number];
const toward = (p: Point, q: Point, t: number): Point => [
  p[0] + (q[0] - p[0]) * t,
  p[1] + (q[1] - p[1]) * t
];
/* a cubic split at t (de Casteljau): its part before and its part after */
const split = ([a, b, c, d]: readonly Point[], t: number): [Point[], Point[]] => {
  const ab = toward(a, b, t);
  const bc = toward(b, c, t);
  const cd = toward(c, d, t);
  const abc = toward(ab, bc, t);
  const bcd = toward(bc, cd, t);
  const m = toward(abc, bcd, t);
  return [
    [a, ab, abc, m],
    [m, bcd, cd, d]
  ];
};
/** The part of a timing curve between two of its times (0 to 1), a timing curve of its own, to a millionth: what a
    stretch follows that starts or ends partway along a swing (the curve's time rises with its parameter, so halving
    finds where it is `from` and `to`). */
export function figmaCurveBetween(curve: FigmaCurve, from: number, to: number): FigmaCurve {
  const [x1, y1, x2, y2] = curve;
  const x = (u: number) => 3 * (1 - u) ** 2 * u * x1 + 3 * (1 - u) * u ** 2 * x2 + u ** 3;
  const at = (time: number) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 64; i++) {
      const mid = (lo + hi) / 2;
      if (x(mid) < time) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const u0 = from <= 0 ? 0 : at(from);
  const u1 = to >= 1 ? 1 : at(to);
  const [before] = split(
    [
      [0, 0],
      [x1, y1],
      [x2, y2],
      [1, 1]
    ],
    u1
  );
  const [, [p0, p1, p2, p3]] = split(before, u1 > 0 ? u0 / u1 : 0);
  const r = (v: number) => Math.round(v * 1e6) / 1e6;
  const nx = (v: number) => r((v - p0[0]) / (p3[0] - p0[0]));
  const ny = (v: number) => r((v - p0[1]) / (p3[1] - p0[1]));
  return [nx(p1[0]), ny(p1[1]), nx(p2[0]), ny(p2[1])];
}

/* a keyframe's value and its easing as Figma's file writes them: a scale as a vector, an even pace as LINEAR */
const keyValue = (field: FigmaField, v: number) =>
  field === "MOTION_SCALE_XY" ? { vectorValue: { x: v, y: v } } : { floatValue: v };
const keyType = (field: FigmaField) => (field === "MOTION_SCALE_XY" ? "VECTOR" : "FLOAT");
const easing = (e: FigmaCurve | null) => ({
  easingType: e ? "CUSTOM_CUBIC" : "LINEAR",
  easingValue: {
    bezierEasing: e
      ? { p1x: e[0], p1y: e[1], p2x: e[2], p2y: e[3] }
      : { p1x: 0, p1y: 0, p2x: 1, p2y: 1 }
  }
});

const DOCUMENT = { sessionID: 0, localID: 0 };
/** The page a paste's top frame stands on. */
export const FIGMA_PAGE = { sessionID: 0, localID: 1 };
/** Figma's internal canvas, which holds a paste's keyframe tracks. */
export const FIGMA_INTERNAL = { sessionID: 20006994, localID: 2 };

/** A child's place among its siblings: Figma orders them by these strings, so they rise with the index, a "~" leading
    past the 90th as in Figma's own. */
export const figmaPosition = (index: number): string =>
  index < 90 ? String.fromCharCode(33 + index) : `~${figmaPosition(index - 90)}`;

/** Layers made in order, each under a parent made before it: `add` makes one at an index among its parent's children,
    at (x, y) in its parent, `w` by `h`; `group` makes a group, a frame that fits its children; `bare` makes a node with
    no place on the canvas, kept apart in `internal`; `animate` makes a motion's keyframe track (under the internal
    canvas, as Figma's own copies keep them) and its keyframes, and gives what a layer carries to take its value from
    it (its parameterConsumptionMap). */
export function figmaLayers() {
  let local = 1;
  const nodes: FigmaNode[] = [];
  const internal: FigmaNode[] = [];
  const add = (
    type: string,
    name: string,
    parent: FigmaNode | typeof FIGMA_PAGE,
    index: number,
    w: number,
    h: number,
    x: number,
    y: number,
    extra: Record<string, unknown> = {}
  ): FigmaNode => {
    const node: FigmaNode = {
      guid: { sessionID: 1, localID: local++ },
      phase: "CREATED",
      parentIndex: {
        guid: "guid" in parent ? parent.guid : parent,
        position: figmaPosition(index)
      },
      type,
      name,
      visible: true,
      opacity: 1,
      size: { x: w, y: h },
      transform: figmaAt(x, y),
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
    parent: FigmaNode,
    index: number,
    x: number,
    y: number,
    w: number,
    h: number,
    extra: Record<string, unknown> = {}
  ) =>
    add("FRAME", name, parent, index, w, h, x, y, {
      fillPaints: [],
      frameMaskDisabled: false,
      resizeToFit: true,
      ...extra
    });
  const bare = (
    type: string,
    name: string,
    parent: FigmaNode | typeof FIGMA_INTERNAL,
    index: number,
    extra: Record<string, unknown> = {}
  ): FigmaNode => {
    const node: FigmaNode = {
      guid: { sessionID: 1, localID: local++ },
      phase: "CREATED",
      parentIndex: {
        guid: "guid" in parent ? parent.guid : parent,
        position: figmaPosition(index)
      },
      type,
      name,
      visible: true,
      ...extra
    };
    internal.push(node);
    return node;
  };
  let tracks = 0;
  const animate = (m: FigmaMotion) => {
    const track = bare("KEYFRAME_TRACK", "Keyframe Track", FIGMA_INTERNAL, tracks++);
    const type = keyType(m.field);
    for (const [j, key] of m.keys.entries())
      bare("KEYFRAME", "Keyframe", track, j, {
        ...(key.t ? { timelinePosition: Math.round(key.t * 1e6) } : {}),
        keyframeValue: { value: keyValue(m.field, key.v), valueType: type },
        easingData: easing(key.e)
      });
    return {
      entries: [
        {
          variableData: {
            value: {
              expressionValue: {
                expressionFunction: "KEYFRAME",
                expressionArguments: [
                  { value: keyValue(m.field, m.base), dataType: type, resolvedDataType: type },
                  {
                    value: {
                      keyframeTrackParameterValue: {
                        parameters: [
                          {
                            value: { manual: { keyframeTrackId: { guid: track.guid } } },
                            type: "MANUAL"
                          }
                        ]
                      }
                    },
                    dataType: "KEYFRAME_TRACK_PARAMETER_DATA",
                    resolvedDataType: "KEYFRAME_TRACK_PARAMETER_DATA"
                  }
                ]
              }
            },
            dataType: "EXPRESSION",
            resolvedDataType: type
          },
          variableField: m.field
        }
      ]
    };
  };
  return { nodes, internal, add, group, bare, animate };
}

/** Layers as Figma's scene: the document, its page, the layers (the first the frame a paste selects), Figma's
    internal canvas and what it holds (`internal`, a moving paste's keyframe tracks). */
export function figmaScene(
  layers: readonly FigmaNode[],
  internal: readonly FigmaNode[] = []
): FigmaNode[] {
  const identity = figmaAt();
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
      guid: FIGMA_PAGE,
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
    ...layers,
    {
      guid: FIGMA_INTERNAL,
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
    },
    ...internal
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

/** The clipboard's text/html for a scene (figmaScene), which a paste into Figma reads as its layers, the scene's top
    frame selected. `fileKey` names the file the paste says it comes from. */
export function figmaPasteHtml(
  scene: readonly FigmaNode[],
  pasteID: number,
  fileKey: string
): string {
  const message = {
    type: "NODE_CHANGES",
    sessionID: 0,
    ackID: 0,
    pasteID,
    pasteOffset: { x: 0, y: 0 },
    pasteFileKey: fileKey,
    pasteIsPartiallyOutsideEnclosingFrame: false,
    pastePageId: FIGMA_PAGE,
    isCut: false,
    pasteEditorType: "DESIGN",
    clipboardSelectionRegions: [
      {
        parent: FIGMA_PAGE,
        nodes: [scene[2].guid],
        enclosingFrameOffset: { x: 0, y: 0 },
        pasteIsPartiallyOutsideEnclosingFrame: false,
        focusType: "NONE"
      }
    ],
    pasteAssetType: "UNKNOWN",
    nodeChangeOrder: "GUID",
    nodeChanges: scene
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
    `${JSON.stringify({ fileKey, pasteID, dataType: "scene", editorType: "design" })}\n`
  );
  return `<meta charset="utf-8"><span data-metadata="<!--(figmeta)${meta}(/figmeta)-->"></span><span data-buffer="<!--(figma)${toBase64(buffer)}(/figma)-->"></span><span style="white-space:pre-wrap;"></span>`;
}
