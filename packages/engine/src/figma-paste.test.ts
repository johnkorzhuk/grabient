import { expect, test } from "vitest";
import { golden } from "../test/support.ts";
import { decodePalette } from "./codec.ts";
import { FIGMA_GLASS, figmaGlassHtml, figmaGlassNodes } from "./figma-paste.ts";
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

test("kiwi's bytes, written as kiwi's own encoder writes them, and read back", () => {
  const bytes = encodeKiwi(FIGMA_DEFS, "Message", fixture.message);
  expect(btoa(String.fromCharCode(...bytes))).toBe(fixture.bytes);
  const back = decodeKiwi(FIGMA_DEFS, "Message", bytes) as Node;
  expect(back.nodeChanges[1].name).toBe("rib 1 · ünïcode");
  expect(back.nodeChanges[1].effects[0].refractionIntensity).toBe(1.5);
  expect(back.nodeChanges[1].transform.m02).toBe(-300);
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
  /* every layer's parent stands before it, and no two siblings share a place */
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
