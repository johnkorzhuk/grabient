/* A field effect's Copy for Figma, held to what figma-paste.test.ts holds the papercut's and the strings' pastes to:
   fig-kiwi with its frame selected and nothing on the timeline, each layer a vector whose network the paste carries,
   read as Sketch's .fig reader reads one, to its last byte, filled by the odd rule as by the nonzero (no loop crosses
   another). The kit's example is no site effect, so it is held here, reading the paste back with copies of that file's
   helpers; the site's field effects join its shared table (`pastes`), which holds their soft and grain as every
   effect's. */
import { expect, test } from "vitest";
import { decodePalette } from "../codec.ts";
import { type FigmaCubic, figmaColor, figmaPathLoops } from "../figma-paste.ts";
import { FIGMA_DEFS, FIGMA_SCHEMA, FIGMA_VERSION } from "../figma-schema.ts";
import { decodeKiwi } from "../kiwi.ts";
import demo from "./fields/demo.ts";
import { type FigmaKitView, figmaKitFileKey, figmaKitHtml, figmaKitNodes } from "./figma.ts";
import { kitHex, kitScene, kitSheetColor } from "./scene.ts";
import { kitRimColor, kitScratch, kitShadowColor } from "./shade.ts";
import { kitFrameLayers } from "./svg.ts";
import type { FieldEffect } from "./types.ts";

// biome-ignore lint/suspicious/noExplicitAny: a decoded paste, read by the paths each test expects it to hold
type Node = Record<string, any>;
const palette = decodePalette("kUMzO5Na871ukuyhHUJA")!;
const view: FigmaKitView = {
  steps: null,
  palette,
  angle: 135,
  shape: 7,
  width: 1200,
  height: 800,
  name: "Navy and teal"
};
const bytesOf = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

/* the clipboard HTML taken apart as Figma reads it (figma-paste.test.ts's read) */
function read(html: string) {
  const meta = JSON.parse(atob(/\(figmeta\)([^(]*)\(\/figmeta\)/.exec(html)![1]));
  const buffer = bytesOf(/\(figma\)([^(]*)\(\/figma\)/.exec(html)![1]);
  const data = new DataView(buffer.buffer);
  const chunks: Uint8Array[] = [];
  for (let at = 12; at < buffer.length; ) {
    const length = data.getUint32(at, true);
    chunks.push(buffer.subarray(at + 4, at + 4 + length));
    at += 4 + length;
  }
  const body: number[] = [];
  for (let at = 0, last = 0; !last; ) {
    last = chunks[1][at] & 1;
    const length = chunks[1][at + 1] | (chunks[1][at + 2] << 8);
    body.push(...chunks[1].subarray(at + 5, at + 5 + length));
    at += 5 + length;
  }
  return {
    meta,
    signature: new TextDecoder().decode(buffer.subarray(0, 8)),
    version: data.getUint32(8, true),
    chunks,
    message: decodeKiwi(FIGMA_DEFS, "Message", new Uint8Array(body)) as Node
  };
}
/* every layer's parent stands before it, and no two siblings share a place */
function parentsFirst(nodes: Node[]) {
  const seen = new Set<string>();
  const places = new Set<string>();
  for (const n of nodes) {
    if (n.parentIndex) {
      expect(seen.has(JSON.stringify(n.parentIndex.guid))).toBe(true);
      const place = `${JSON.stringify(n.parentIndex.guid)} ${n.parentIndex.position}`;
      expect(places.has(place)).toBe(false);
      places.add(place);
    }
    seen.add(JSON.stringify(n.guid));
  }
}
/* a layer's children in their order */
const kidsOf = (nodes: Node[], parent: Node) =>
  nodes
    .filter(
      n => n.parentIndex?.guid.localID === parent.guid.localID && n.parentIndex.guid.sessionID === 1
    )
    .sort((a, b) => (a.parentIndex.position < b.parentIndex.position ? -1 : 1));
/* a vector network's loops as cubics, read as Sketch's .fig reader reads one (fig2sketch's vector_network.py): each
   segment from its start and its handle there to its end and its handle there, its one region's loops naming them;
   and that the region fills by the odd rule and its loops name every segment once, to the network's last byte */
function networkLoops(bytes: Uint8Array): FigmaCubic[][] {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vertices = v.getUint32(0, true);
  const segments = v.getUint32(4, true);
  expect(v.getUint32(8, true)).toBe(1);
  const point = (i: number): [number, number] => [
    v.getFloat32(12 + i * 12 + 4, true),
    v.getFloat32(12 + i * 12 + 8, true)
  ];
  const cubic = (s: number): FigmaCubic => {
    const at = 12 + vertices * 12 + s * 28;
    const a = point(v.getUint32(at + 4, true));
    const b = point(v.getUint32(at + 16, true));
    return [
      a,
      [a[0] + v.getFloat32(at + 8, true), a[1] + v.getFloat32(at + 12, true)],
      [b[0] + v.getFloat32(at + 20, true), b[1] + v.getFloat32(at + 24, true)],
      b
    ];
  };
  let at = 12 + vertices * 12 + segments * 28;
  expect(v.getUint32(at, true) & 1).toBe(0);
  const count = v.getUint32(at + 4, true);
  at += 8;
  const loops: FigmaCubic[][] = [];
  const named: number[] = [];
  for (let l = 0; l < count; l++) {
    const n = v.getUint32(at, true);
    const ids = Array.from({ length: n }, (_, i) => v.getUint32(at + 4 + 4 * i, true));
    named.push(...ids);
    loops.push(ids.map(cubic));
    at += 4 + 4 * n;
  }
  expect(at).toBe(bytes.byteLength);
  expect(named.sort((x, y) => x - y)).toEqual([...Array(segments).keys()]);
  return loops;
}
const bezier = (c: FigmaCubic, t: number): [number, number] => {
  const s = 1 - t;
  return [
    s * s * s * c[0][0] + 3 * s * s * t * c[1][0] + 3 * s * t * t * c[2][0] + t * t * t * c[3][0],
    s * s * s * c[0][1] + 3 * s * s * t * c[1][1] + 3 * s * t * t * c[2][1] + t * t * t * c[3][1]
  ];
};
/* the area loops of cubics fill by the odd rule, and by the nonzero rule (everything any loop goes round), in rows
   `dy` apart (figma-paste.test.ts's fills) */
function fills(loops: readonly (readonly FigmaCubic[])[], dy: number) {
  const lines = loops
    .map(loop => loop.flatMap(c => Array.from({ length: 16 }, (_, i) => bezier(c, i / 16))))
    .flatMap(p =>
      p.map((a, i) => [...a, ...p[(i + 1) % p.length]] as [number, number, number, number])
    );
  const top = lines.reduce((t, l) => Math.min(t, l[1], l[3]), Infinity);
  const rows: [number, number][][] = [];
  for (const [ax, ay, bx, by] of lines)
    for (let r = Math.max(0, Math.floor((Math.min(ay, by) - top) / dy - 0.5)); ; r++) {
      const y = top + (r + 0.5) * dy;
      if (y >= Math.max(ay, by)) break;
      if (y < Math.min(ay, by)) continue;
      rows[r] ??= [];
      rows[r].push([ax + ((y - ay) / (by - ay)) * (bx - ax), by > ay ? 1 : -1]);
    }
  let odd = 0;
  let nonzero = 0;
  for (const row of rows) {
    if (!row) continue;
    row.sort((a, b) => a[0] - b[0]);
    let w = 0;
    for (let i = 0; i + 1 < row.length; i++) {
      w += row[i][1];
      if (i % 2 === 0) odd += row[i + 1][0] - row[i][0];
      if (w !== 0) nonzero += row[i + 1][0] - row[i][0];
    }
  }
  return { odd: odd * dy, nonzero: nonzero * dy };
}
/* Figma keeps a color's channels as 32-bit floats: the same byte each */
const byte = (c: { r: number; g: number; b: number }) =>
  [c.r, c.g, c.b].map(x => Math.round(x * 255));

test("the demo's paste is fig-kiwi, its frame selected, a still with nothing on Figma's timeline", () => {
  const { blobs } = figmaKitNodes(demo, view);
  const pasted = read(figmaKitHtml(demo, view, 3));
  expect(pasted.signature).toBe("fig-kiwi");
  expect(pasted.version).toBe(FIGMA_VERSION);
  expect(pasted.chunks[0]).toEqual(bytesOf(FIGMA_SCHEMA));
  /* its file named as the other effects' are, 23 letters */
  expect(figmaKitFileKey(demo)).toBe("grabientPasteDemo000000");
  expect(pasted.meta).toMatchObject({ pasteID: 3, fileKey: figmaKitFileKey(demo) });
  const message = pasted.message;
  const all = message.nodeChanges as Node[];
  expect(all[2]).toMatchObject({ type: "FRAME", name: "Navy and teal", size: { x: 1200, y: 800 } });
  expect(message.clipboardSelectionRegions[0].nodes).toEqual([all[2].guid]);
  expect(
    all.some(n => n.type === "KEYFRAME_TRACK" || n.parameterConsumptionMap || n.timelineDuration)
  ).toBe(false);
  /* the networks the vectors name, as they were made */
  expect(message.blobs.map((b: { bytes: number[] }) => Uint8Array.from(b.bytes))).toEqual(blobs);
  parentsFirst(all);
});

test("the demo as Figma's layers: the ground, each sheet a group of its shadow, its rim and itself, then the lines, every layer its file's path", () => {
  const { nodes, blobs } = figmaKitNodes(demo, view) as { nodes: Node[]; blobs: Uint8Array[] };
  const m = kitScene(demo, palette, view, view);
  const { ground, layers } = kitFrameLayers(m);
  const [drawing] = kidsOf(nodes, nodes[2]);
  expect(drawing).toMatchObject({ type: "FRAME", name: "demo", resizeToFit: true });
  const [rect, ...groups] = kidsOf(nodes, drawing);
  expect(rect).toMatchObject({ type: "RECTANGLE", name: "ground", size: { x: 1200, y: 800 } });
  expect(byte(rect.fillPaints[0].color)).toEqual(byte(figmaColor(ground)));
  /* the sheets that show, bottom to top, then the lines */
  const sheets = groups.slice(0, -1);
  expect(sheets.length).toBeGreaterThan(5);
  expect(groups[groups.length - 1].name).toBe("lines");
  /* named from the lowest the frame shows, "sheet 1" and "line 1", counted up: no level's own number, which runs
     below 0 where the sheets repeat */
  expect(sheets.map(g => g.name)).toEqual(sheets.map((_, n) => `sheet ${n + 1}`));
  const S = demo.sheets!;
  const shade = kitHex(m.shade);
  let laid = 0;
  for (const group of groups) {
    const vectors = kidsOf(nodes, group);
    if (group.name === "lines") {
      expect(vectors.length).toBeGreaterThan(5);
      expect(vectors.map(v => v.name)).toEqual(vectors.map((_, n) => `line ${n + 1}`));
      for (const v of vectors) expect(v.opacity).toBeCloseTo(demo.lines!.alpha, 6);
    } else {
      /* the sheet's level, which its colors are worked out from, as its layers in the file carry it */
      const k = layers[laid].level;
      expect(vectors.map(v => [v.type, v.name])).toEqual([
        ["VECTOR", "shadow"],
        ["VECTOR", "rim"],
        ["VECTOR", "sheet"]
      ]);
      const [shadow, rim, sheet] = vectors;
      expect(shadow.opacity).toBeCloseTo(S.shadow!.alpha, 6);
      expect(byte(shadow.fillPaints[0].color)).toEqual(byte(figmaColor(shade)));
      expect(rim.opacity).toBeCloseTo(S.rim!.alpha, 6);
      expect(byte(rim.fillPaints[0].color)).toEqual([255, 255, 255]);
      expect(sheet.opacity).toBe(1);
      const c: number[] = [];
      kitSheetColor(m, k, c);
      expect(byte(sheet.fillPaints[0].color)).toEqual(byte(figmaColor(kitHex(c))));
    }
    for (const v of vectors) {
      const layer = layers[laid++];
      expect([group.name, v.name]).toEqual([layer.group, layer.name]);
      const { vectorNetworkBlob, normalizedSize } = v.vectorData;
      expect(normalizedSize).toEqual(v.size);
      /* its network's loops, placed on the frame, are its file's path's (to float32's precision) */
      const loops = networkLoops(blobs[vectorNetworkBlob]);
      const ox = group.transform.m02 + v.transform.m02;
      const oy = group.transform.m12 + v.transform.m12;
      const path = figmaPathLoops(layer.d);
      expect(loops.map(l => l.length)).toEqual(path.map(l => l.length));
      for (const [i, loop] of loops.entries())
        for (const [j, cubic] of loop.entries())
          for (const [p, [x, y]] of cubic.entries()) {
            expect(Math.abs(x + ox - path[i][j][p][0])).toBeLessThan(2e-3);
            expect(Math.abs(y + oy - path[i][j][p][1])).toBeLessThan(2e-3);
          }
      /* and its vertices stand inside its own box */
      for (const loop of loops)
        for (const [[x, y]] of loop) {
          expect(x).toBeGreaterThanOrEqual(-1e-3);
          expect(y).toBeLessThanOrEqual(v.size.y + 1e-3);
        }
    }
  }
  expect(laid).toBe(layers.length);
  parentsFirst(nodes);
});

test("a line band over the field's least value, traced as the box loop's h and v (trace.ts kitBoxLoop), pastes as its loops", () => {
  /* the demo at 640 by 360, shape 8, angle 90: its lowest line holds the box's least value, its lower edge the box */
  const at: FigmaKitView = { ...view, angle: 90, shape: 8, width: 640, height: 360 };
  const { layers } = kitFrameLayers(kitScene(demo, palette, at, at));
  const boxed = layers.filter(l => /[hv]/.test(l.d));
  expect(boxed.map(l => [l.group, l.name])).toEqual([["lines", "line 1"]]);
  /* its loops read back whole, the box's first: no number lost to a letter the reader skipped */
  const [box] = figmaPathLoops(boxed[0].d);
  const corners = box.map(([from]) => from);
  const margin = -corners[0][0];
  expect(margin).toBeGreaterThan(0);
  expect(corners).toEqual([
    [-margin, -margin],
    [640 + margin, -margin],
    [640 + margin, 360 + margin],
    [-margin, 360 + margin]
  ]);
  /* and the paste's every number finite: the lines' group and each line sized and placed */
  const { nodes } = figmaKitNodes(demo, at) as { nodes: Node[] };
  const unfinite: string[] = [];
  JSON.stringify(nodes, (key, v) => {
    if (typeof v === "number" && !Number.isFinite(v)) unfinite.push(key);
    return v;
  });
  expect(unfinite).toEqual([]);
});

test("a soft shadow pastes as its layers, each the sheet's level raised, at its share of the shadow's opacity", () => {
  const soft = {
    ...demo,
    sheets: { ...demo.sheets!, shadow: { ...demo.sheets!.shadow!, steps: 3, spread: 0.6 } }
  };
  const nodes = figmaKitNodes(soft, view).nodes as Node[];
  const { layers } = kitFrameLayers(kitScene(soft, palette, view, view));
  let raised = 0;
  for (const group of nodes.filter(n => /^sheet \d+$/.test(n.name))) {
    const names = kidsOf(nodes, group).map(v => v.name);
    const shadows = names.filter(n => n === "shadow").length;
    /* the sheet's own level and the two raised ones that show, then the rim and the sheet */
    expect(shadows).toBeGreaterThanOrEqual(1);
    expect(shadows).toBeLessThanOrEqual(3);
    expect(names.slice(shadows)).toEqual(["rim", "sheet"]);
    raised += shadows - 1;
    for (const v of kidsOf(nodes, group).slice(0, shadows))
      expect(v.opacity).toBeCloseTo(demo.sheets!.shadow!.alpha / 3, 6);
  }
  expect(raised).toBeGreaterThan(5);
  expect(nodes.filter(n => n.type === "VECTOR")).toHaveLength(layers.length);
});

test("a tinted shadow and rim paste each sheet's in its own solid color, as the shading takes them", () => {
  /* svg.test.ts's tinted demo: each soft shadow the sheet below darkened to 0.35 of its color, each rim the sheet's
     own color lifted 0.55 of the way to white, neither shade.ts's default */
  const tinted: FieldEffect = {
    ...demo,
    sheets: {
      ...demo.sheets!,
      shadow: { ...demo.sheets!.shadow!, steps: 3, spread: 0.6, tint: "below", depth: 0.35 },
      rim: { ...demo.sheets!.rim!, tint: "own", lift: 0.55 }
    }
  };
  const nodes = figmaKitNodes(tinted, view).nodes as Node[];
  const m = kitScene(tinted, palette, view, view);
  /* each group's sheet's level, as its layers in the file carry it */
  const levels = new Map(kitFrameLayers(m).layers.map(l => [l.group, l.level]));
  const c = kitScratch();
  const shadows = new Set<string>();
  const rims = new Set<string>();
  let sheets = 0;
  for (const group of nodes.filter(n => /^sheet \d+$/.test(n.name))) {
    const k = levels.get(group.name)!;
    kitShadowColor(m, k, c);
    const shadow = kitHex(c);
    kitRimColor(m, k, c);
    const rim = kitHex(c);
    const vectors = kidsOf(nodes, group);
    for (const v of vectors.filter(v => v.name === "shadow")) {
      expect(byte(v.fillPaints[0].color), group.name).toEqual(byte(figmaColor(shadow)));
      expect(v.opacity).toBeCloseTo(demo.sheets!.shadow!.alpha / 3, 6);
    }
    const [lit] = vectors.filter(v => v.name === "rim");
    expect(byte(lit.fillPaints[0].color), group.name).toEqual(byte(figmaColor(rim)));
    expect(lit.opacity).toBeCloseTo(demo.sheets!.rim!.alpha, 6);
    shadows.add(shadow);
    rims.add(rim);
    sheets++;
  }
  /* every sheet's its own: none the ink, none white */
  expect(sheets).toBeGreaterThan(5);
  expect(shadows.size).toBe(sheets);
  expect(rims.size).toBe(sheets);
  expect(shadows.has(kitHex(m.shade))).toBe(false);
  expect(rims.has("#ffffff")).toBe(false);
});

test("every layer fills alike by the odd rule and the nonzero: no loop crosses another, and a line's upper edge runs the other way round its lower", () => {
  /* a smaller frame, so the rows a twentieth of a pixel apart stay few */
  const small = { ...view, width: 320, height: 200 };
  const { nodes, blobs } = figmaKitNodes(demo, small) as { nodes: Node[]; blobs: Uint8Array[] };
  let lines = 0;
  for (const vector of nodes.filter(n => n.type === "VECTOR")) {
    const { odd, nonzero } = fills(networkLoops(blobs[vector.vectorData.vectorNetworkBlob]), 0.05);
    expect(odd).toBeGreaterThan(0);
    expect(Math.abs(odd - nonzero)).toBeLessThan(0.05);
    if (vector.name.startsWith("line")) lines++;
  }
  expect(lines).toBeGreaterThan(3);
});
