import { expect, test } from "vitest";
import { golden } from "../test/support.ts";
import { BLOB_DESIGN, blobFilter, blobFit, blobScene } from "./blob.ts";
import { decodePalette } from "./codec.ts";
import { FIGMA_BLOB, type FigmaBlobView, figmaBlobHtml, figmaBlobNodes } from "./figma-blob.ts";
import { FIGMA_GLASS, figmaGlassHtml, figmaGlassNodes } from "./figma-glass.ts";
import { FIGMA_DEFS, FIGMA_SCHEMA, FIGMA_VERSION } from "./figma-schema.ts";
import { glassColors, glassGeometry } from "./glass.ts";
import { decodeKiwi, encodeKiwi } from "./kiwi.ts";

// biome-ignore lint/suspicious/noExplicitAny: a decoded paste, read by the paths each test expects it to hold
type Node = Record<string, any>;
const colors = glassColors(decodePalette("kUMzO5Na871ukuyhHUJA")!);
const view = { colors, angle: 90, shape: null, width: 1000, height: 1000, name: "Navy and teal" };
const fixture = golden<{ message: Node; bytes: string }>("figma-kiwi");
const bytesOf = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

/* the clipboard HTML taken apart as Figma reads it: its name, then fig-kiwi's two chunks, the second inflated from
   deflate's stored blocks */
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
    expect(chunks[1][at] >> 1).toBe(0); /* a stored block */
    const length = chunks[1][at + 1] | (chunks[1][at + 2] << 8);
    expect(chunks[1][at + 3] | (chunks[1][at + 4] << 8)).toBe(~length & 0xffff);
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

test("kiwi's bytes, written as kiwi's own encoder writes them, and read back", () => {
  const bytes = encodeKiwi(FIGMA_DEFS, "Message", fixture.message);
  expect(btoa(String.fromCharCode(...bytes))).toBe(fixture.bytes);
  const back = decodeKiwi(FIGMA_DEFS, "Message", bytes) as Node;
  expect(back.nodeChanges[1].name).toBe("rib 1 · ünïcode");
  expect(back.nodeChanges[1].effects[0].refractionIntensity).toBe(1.5);
  expect(back.nodeChanges[1].transform.m02).toBe(-300);
  /* the blob's: a luminance mask, Figma's Texture (GRAIN) and Noise, a blend mode */
  expect(back.nodeChanges[2]).toMatchObject({ maskType: "LUMINANCE", blendMode: "NORMAL" });
  expect(back.nodeChanges[2].effects[0]).toMatchObject({
    type: "GRAIN",
    noiseSize: { x: 2.5, y: 2.5 }
  });
  expect(back.nodeChanges[2].effects[1]).toMatchObject({
    type: "NOISE",
    noiseType: "MONOTONE",
    density: 1
  });
  expect(back.nodeChanges[3].blendMode).toBe("COLOR_BURN");
});

test("kiwi refuses what Figma's schema lacks", () => {
  expect(() => encodeKiwi(FIGMA_DEFS, "Message", { type: "NODE_CHANGES", nope: 1 })).toThrow(
    /no field nope/
  );
  expect(() => encodeKiwi(FIGMA_DEFS, "Message", { type: "SIGNAL" })).toThrow(/has no SIGNAL/);
  expect(() => encodeKiwi(FIGMA_DEFS, "Vector", { x: 1 })).toThrow(/required/);
});

test("the paste is fig-kiwi: its version, the schema it is written in, and its message", () => {
  const paste = read(figmaGlassHtml(view, 42));
  expect(paste.signature).toBe("fig-kiwi");
  expect(paste.version).toBe(FIGMA_VERSION);
  expect(paste.chunks).toHaveLength(2);
  expect(paste.chunks[0]).toEqual(bytesOf(FIGMA_SCHEMA));
  expect(paste.meta).toMatchObject({ pasteID: 42, dataType: "scene" });
  expect(paste.message.pasteID).toBe(42);
  expect(paste.message.clipboardSelectionRegions[0].nodes).toEqual([
    paste.message.nodeChanges[2].guid
  ]);
});

test("the glass as Figma's layers: a frame, a masked group, the base, the discs under a blur and the ribs", () => {
  const nodes = figmaGlassNodes(view) as Node[];
  const named = (name: string) => nodes.filter(n => n.name === name);
  const [top] = named("Navy and teal");
  expect(top).toMatchObject({ type: "FRAME", size: { x: 1000, y: 1000 }, frameMaskDisabled: true });
  expect(named("mask")[0]).toMatchObject({
    type: "RECTANGLE",
    mask: true,
    size: { x: 1000, y: 1000 }
  });
  const design = glassGeometry({ width: 1000, height: 1000 });
  expect(named("colors")[0].effects[0]).toMatchObject({
    type: "FOREGROUND_BLUR",
    radius: 2 * design.sigma
  });
  expect(nodes.filter(n => n.name.startsWith("color "))).toHaveLength(12);
  const ribs = nodes.filter(n => n.name.startsWith("rib "));
  expect(ribs).toHaveLength(design.ribs.length - 1);
  for (const rib of ribs) {
    expect(rib).toMatchObject({
      type: "BOOLEAN_OPERATION",
      booleanOperation: "INTERSECT",
      fillPaints: []
    });
    expect(rib.effects[0]).toMatchObject({
      type: "GLASS",
      refractionIntensity: FIGMA_GLASS.refraction,
      refractionRadius: FIGMA_GLASS.depth,
      reflectionDistance: 0,
      specularIntensity: 0
    });
  }
  parentsFirst(nodes);
});

test("the design covers a box of another shape, every length scaled with it", () => {
  const nodes = figmaGlassNodes({ ...view, width: 1920, height: 1080 }) as Node[];
  const s = 1.92;
  const design = glassGeometry({ width: 1000, height: 1000 });
  expect(nodes.find(n => n.name === "mask")!.size).toEqual({ x: 1920, y: 1080 });
  expect(nodes.find(n => n.name === "colors")!.effects[0].radius).toBeCloseTo(
    2 * design.sigma * s,
    5
  );
  expect(nodes.find(n => n.name === "ribs")!.effects[0].radius).toBeCloseTo(
    FIGMA_GLASS.ribBlur * s,
    5
  );
  expect(nodes.find(n => n.name === "rib 1")!.effects[0].refractionRadius).toBeCloseTo(
    FIGMA_GLASS.depth * s,
    5
  );
  /* centered: the square of the design overhangs the box equally above and below */
  const base = nodes.find(n => n.name === "base")!;
  const overhang = base.transform.m12;
  expect(overhang + base.size.y / 2).toBeCloseTo(540, 5);
});

/* the blob */
const palette = decodePalette("kUMzO5Na871ukuyhHUJA")!;
const blobView: FigmaBlobView = {
  palette,
  angle: 90,
  shape: null,
  frost: 1,
  bg: null,
  width: 1000,
  height: 1000,
  name: "Navy and teal"
};
const filterOf = (v: FigmaBlobView) =>
  blobFilter(v, BLOB_DESIGN, blobScene(palette, BLOB_DESIGN, v));
/* a gray fill's level, 0 to 1 */
const level = (n: Node) => n.fillPaints[0].color.r as number;
/* what Figma's color burn in b, then color dodge in d, make of a gray a */
const burnDodge = (a: number, b: number, d: number) =>
  Math.min(1, Math.max(0, 1 - (1 - a) / b) / (1 - d));

test("the blob's paste is fig-kiwi too, its frame selected", () => {
  const paste = read(figmaBlobHtml(blobView, 7));
  expect(paste.signature).toBe("fig-kiwi");
  expect(paste.chunks[0]).toEqual(bytesOf(FIGMA_SCHEMA));
  expect(paste.message.pasteID).toBe(7);
  expect(paste.message.nodeChanges[2]).toMatchObject({ type: "FRAME", name: "Navy and teal" });
  expect(paste.message.clipboardSelectionRegions[0].nodes).toEqual([
    paste.message.nodeChanges[2].guid
  ]);
});

test("the blob as Figma's layers: the lift as a luminance mask, the melted colors, the speckle and the edge's shade", () => {
  const nodes = figmaBlobNodes(blobView) as Node[];
  const named = (name: string) => nodes.filter(n => n.name === name);
  const filter = filterOf(blobView);
  const k = blobFit(blobView).scale;
  expect(named("Navy and teal")[0]).toMatchObject({
    type: "FRAME",
    size: { x: 1000, y: 1000 },
    frameMaskDisabled: false,
    fillPaints: []
  });
  const [shape] = named("shape");
  expect(shape).toMatchObject({
    type: "FRAME",
    resizeToFit: true,
    mask: true,
    maskType: "LUMINANCE"
  });
  /* every melt is the balls under one blur, Figma's radius 2.28 times the site's deviation */
  const melts = nodes.filter(n => n.name === "melt" || n.name.startsWith("melt "));
  expect(melts).toHaveLength(4);
  for (const melt of melts) {
    expect(melt.effects[0]).toMatchObject({ type: "FOREGROUND_BLUR" });
    expect(melt.effects[0].radius).toBeCloseTo(FIGMA_BLOB.blur * filter.melt * k, 1);
    expect(nodes.filter(n => n.parentIndex?.guid.localID === melt.guid.localID)).toHaveLength(24);
  }
  /* the frost's scatter: Figma's Texture on the white melt, its grain 1.25 design units */
  const [frost] = nodes.filter(n => n.name === "frost");
  expect(frost.effects[0]).toMatchObject({
    type: "GRAIN",
    noiseSize: { x: 2.5, y: 2.5 },
    clipToShape: false
  });
  expect(frost.effects[0].radius).toBeCloseTo(FIGMA_BLOB.scatter * filter.scatter * k, 1);
  /* the burn and the dodge make the site's lift, slope (1 + s) times as steep, of the melt's alpha */
  const [lift] = named("lift");
  const [slope] = named("slope");
  expect(lift.blendMode).toBe("COLOR_BURN");
  expect(slope.blendMode).toBe("COLOR_DODGE");
  for (const a of [0.3, 0.4, 0.5, 0.6, 0.7]) {
    const site = Math.min(1, Math.max(0, (filter.slope * a + filter.lift) * (1 + filter.speckle)));
    expect(Math.abs(burnDodge(a, level(lift), level(slope)) - site)).toBeLessThan(0.02);
  }
  /* the speckle: black noise on the colors, a dodge giving its mean back */
  const [colors] = named("colors");
  expect(colors.effects[0]).toMatchObject({
    type: "NOISE",
    noiseType: "MONOTONE",
    noiseSize: { x: 2.5, y: 2.5 }
  });
  const alpha = colors.effects[0].color.a;
  expect(alpha).toBeCloseTo(0.129, 3);
  const [lighten] = named("lighten");
  expect(lighten.blendMode).toBe("COLOR_DODGE");
  expect(level(lighten)).toBeCloseTo(alpha / 2, 2);
  expect(named("shade")[0].opacity).toBeCloseTo(filter.speckle / (1 + filter.speckle), 3);
  expect(named("core")[0]).toMatchObject({ mask: true, maskType: "LUMINANCE" });
  parentsFirst(nodes);
});

test("the blob without frost draws no texture, noise or shade", () => {
  const nodes = figmaBlobNodes({ ...blobView, frost: 0 }) as Node[];
  const effects = nodes.flatMap(n => (n.effects ?? []) as Node[]).map(e => e.type);
  expect(new Set(effects)).toEqual(new Set(["FOREGROUND_BLUR"]));
  for (const name of ["frost", "lighten", "edge shade", "core", "shade"])
    expect(nodes.some(n => n.name === name)).toBe(false);
  /* the plain lift: 2.2 (a - .27) */
  const filter = filterOf({ ...blobView, frost: 0 });
  const lift = nodes.find(n => n.name === "lift")!;
  const slope = nodes.find(n => n.name === "slope")!;
  expect(
    Math.abs(burnDodge(0.5, level(lift), level(slope)) - (filter.slope * 0.5 + filter.lift))
  ).toBeLessThan(0.02);
});

test("the blob covers a box of another shape, every length scaled with it, on its ground", () => {
  const view = { ...blobView, frost: 2, bg: "#f0e6d280", width: 1920, height: 1080 };
  const nodes = figmaBlobNodes(view) as Node[];
  const fit = blobFit(view);
  expect(fit.scale).toBeCloseTo(3.84, 5);
  const filter = filterOf(view);
  const top = nodes.find(n => n.name === "Navy and teal")!;
  expect(top.size).toEqual({ x: 1920, y: 1080 });
  expect(top.fillPaints[0]).toMatchObject({ type: "SOLID", opacity: 128 / 255 });
  expect(top.fillPaints[0].color.r).toBeCloseTo(0xf0 / 255, 5);
  expect(nodes.find(n => n.name === "melt 1")!.effects[0].radius).toBeCloseTo(
    FIGMA_BLOB.blur * filter.melt * fit.scale,
    1
  );
  const frost = nodes.find(n => n.name === "frost")!;
  expect(frost.effects[0].noiseSize).toEqual({ x: 4.8, y: 4.8 });
  expect(frost.effects[0].radius).toBeCloseTo(FIGMA_BLOB.scatter * filter.scatter * fit.scale, 1);
  /* frost 2: twice the speckle, its alpha from the site's spread */
  expect(nodes.find(n => n.name === "colors")!.effects[0].color.a).toBeCloseTo(0.242, 3);
  /* the cover rects reach a tenth of the box past it, so the clip leaves no edge bare */
  expect(nodes.find(n => n.name === "black")!).toMatchObject({ size: { x: 2304, y: 1464 } });
  parentsFirst(nodes);
});
