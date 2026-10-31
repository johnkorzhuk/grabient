/* An effect as Figma's own layers, in the form Figma reads off the clipboard, so a paste into Figma gives real layers
   that look like the site's still: what the glass's paste (figma-glass.ts) and the blob's (figma-blob.ts) share. Each
   loads alone, on the press that copies it, with its own effect's code.

   The clipboard's text/html carries two attributes: (figmeta), base64 JSON naming the paste, and (figma), base64 of
   "fig-kiwi", the format's version, then two chunks, each its length and its deflated bytes: the schema the message is
   written in (figma-schema.ts, the part of Figma's a paste uses) and the message, kiwi-encoded (kiwi.ts), stored in
   deflate's uncompressed blocks so the whole paste is made at once, inside the press that copies it. A layer is a node
   of Figma's scene, placed under its parent by an index; a group is a frame that fits its children. */
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

const DOCUMENT = { sessionID: 0, localID: 0 };
/** The page a paste's top frame stands on. */
export const FIGMA_PAGE = { sessionID: 0, localID: 1 };

/** Layers made in order, each under a parent made before it: `add` makes one at an index among its parent's children,
    at (x, y) in its parent, `w` by `h`; `group` makes a group, a frame that fits its children. */
export function figmaLayers() {
  let local = 1;
  const nodes: FigmaNode[] = [];
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
        position: String.fromCharCode(33 + index)
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
  return { nodes, add, group };
}

/** Layers as Figma's scene: the document, its page, the layers (the first the frame a paste selects) and Figma's
    internal canvas. */
export function figmaScene(layers: readonly FigmaNode[]): FigmaNode[] {
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
