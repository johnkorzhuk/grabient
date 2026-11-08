import { expect, test } from "vitest";
import { golden } from "../test/support.ts";
import { BLOB_DEPTH, BLOB_DESIGN, BLOB_LOOP, blobFilter, blobFit, blobScene } from "./blob.ts";
import { decodePalette } from "./codec.ts";
import { blobShapeOf, EFFECT_KINDS, type Effect } from "./effect.ts";
import { FIGMA_BLOB, type FigmaBlobView, figmaBlobHtml, figmaBlobNodes } from "./figma-blob.ts";
import { FIGMA_GLASS, figmaGlassHtml, figmaGlassNodes } from "./figma-glass.ts";
import { figmaPapercutHtml, figmaPapercutNodes } from "./figma-papercut.ts";
import {
  FIGMA_FINISH,
  FIGMA_INTERNAL,
  FIGMA_PAGE,
  type FigmaCubic,
  type FigmaFinish,
  type FigmaNode,
  figmaColor,
  figmaLinear,
  figmaNoise,
  figmaPathLoops,
  figmaPathRuns,
  figmaVectorNetwork
} from "./figma-paste.ts";
import { figmaRosetteHtml, figmaRosetteNodes } from "./figma-rosette.ts";
import { FIGMA_DEFS, FIGMA_SCHEMA, FIGMA_VERSION } from "./figma-schema.ts";
import { type FigmaSilkView, figmaSilkHtml, figmaSilkNodes } from "./figma-silk.ts";
import {
  type FigmaStringsView,
  figmaStringsHtml,
  figmaStringsNodes,
  figmaStringsOutline
} from "./figma-strings.ts";
import { effectBlurSigma, effectUnderlay } from "./fx-finish.ts";
import {
  GLASS_DESIGN,
  GLASS_LOOP,
  glassColors,
  glassDiscAt,
  glassField,
  glassGeometry
} from "./glass.ts";
import { figmaKitNodes } from "./kit/figma.ts";
import { kitRecord } from "./kit/kinds.ts";
import { kitEffect } from "./kit/registry.ts";
import { decodeKiwi, encodeKiwi } from "./kiwi.ts";
import { papercutScene } from "./papercut.ts";
import { HEART_STOPS, rosettePetals, rosetteScene } from "./rosette.ts";
import { zoomKeys } from "./rosette-svg.ts";
import { centresAt, SILK_LOOP, silkScene } from "./silk.ts";
import { stringsHex, stringsScene } from "./strings.ts";
import { stringsThreads } from "./strings-svg.ts";

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
  /* the moving blob's: a timeline, a group taking its turn from a track, and a keyframe late in the loop */
  expect(back.nodeChanges[4].timelineDuration).toBe(16_000_000);
  expect(back.nodeChanges[4].parameterConsumptionMap.entries[0].variableField).toBe(
    "MOTION_ROTATION"
  );
  expect(back.nodeChanges[5].type).toBe("KEYFRAME_TRACK");
  expect(back.nodeChanges[7]).toMatchObject({
    timelinePosition: 16_000_000,
    keyframeValue: { valueType: "VECTOR" },
    easingData: { easingType: "CUSTOM_CUBIC" }
  });
});

test("kiwi writes 64-bit integers past 32 bits and below 0", () => {
  for (const at of [0, 1, -1, 2 ** 31 + 5, -(2 ** 40), 2 ** 52]) {
    const node = { guid: { sessionID: 1, localID: 1 }, type: "KEYFRAME", timelinePosition: at };
    const bytes = encodeKiwi(FIGMA_DEFS, "NodeChange", node);
    expect((decodeKiwi(FIGMA_DEFS, "NodeChange", bytes) as Node).timelinePosition).toBe(at);
  }
  expect(() =>
    encodeKiwi(FIGMA_DEFS, "NodeChange", {
      guid: { sessionID: 1, localID: 1 },
      timelinePosition: 0.5
    })
  ).toThrow(/out of range/);
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

test("the playing blob moves on Figma's timeline: each ball turns about its rest, the ring about the middle, the blob breathes and wanders", () => {
  const nodes = figmaBlobNodes({ ...blobView, speed: 1 }) as Node[];
  const scene = blobScene(palette, BLOB_DESIGN, blobView);
  const fit = blobFit(blobView);
  const byId = new Map(nodes.map(n => [`${n.guid.sessionID}:${n.guid.localID}`, n]));
  const key = (g: Node) => `${g.sessionID}:${g.localID}`;
  expect(nodes.find(n => n.name === "Navy and teal")!.timelineDuration).toBe(BLOB_LOOP * 1e6);
  /* every animated group takes its value from a track under the internal canvas, whose keyframes it holds */
  const moving = nodes.filter(n => n.parameterConsumptionMap);
  const tracks = nodes.filter(n => n.type === "KEYFRAME_TRACK");
  expect(tracks).toHaveLength(moving.length);
  const motion = (n: Node) => {
    const entry = n.parameterConsumptionMap.entries[0];
    const [rest, from] = entry.variableData.value.expressionValue.expressionArguments;
    const track = byId.get(
      key(from.value.keyframeTrackParameterValue.parameters[0].value.manual.keyframeTrackId.guid)
    )!;
    expect(track.parentIndex.guid).toEqual(FIGMA_INTERNAL);
    const keys = nodes.filter(
      k => k.type === "KEYFRAME" && key(k.parentIndex.guid) === key(track.guid)
    );
    return { field: entry.variableField, rest: rest.value, keys };
  };
  /* per copy of the balls: a turn for each ball and one for each ring, and a breath for each blob */
  const per = scene.blobs.length * (scene.blobs[0].balls.length + 2);
  expect(
    moving.filter(n => n.name.startsWith("turn ") || n.name === "ring").length %
      (per - scene.blobs.length)
  ).toBe(0);
  /* the first blob's first ball: its laps a loop, clockwise for laps above 0, about its resting point */
  const ball = scene.blobs[0].balls[0];
  const first = nodes.find(n => n.name === "turn 1")!;
  const turn = motion(first);
  expect(turn.field).toBe("MOTION_ROTATION");
  expect(turn.keys.map(k => k.timelinePosition ?? 0)).toEqual([0, BLOB_LOOP * 1e6]);
  expect(turn.keys[1].keyframeValue.value.floatValue).toBeCloseTo(2 * Math.PI * ball.laps, 6);
  expect(turn.keys.every(k => k.easingData.easingType === "LINEAR")).toBe(true);
  /* the turn's group is centred on the ball's resting point, about which Figma turns it: its ball and the clear twin
     mirrored through that point */
  const [b0] = scene.blobs;
  const rest = {
    x: fit.x + (b0.x + ball.x * b0.R) * fit.scale,
    y: fit.y + (b0.y + ball.y * b0.R) * fit.scale
  };
  let x = first.transform.m02 + first.size.x / 2;
  let y = first.transform.m12 + first.size.y / 2;
  for (
    let up = byId.get(key(first.parentIndex.guid));
    up && up.name !== "Navy and teal";
    up = byId.get(key(up.parentIndex.guid))
  ) {
    x += up.transform.m02;
    y += up.transform.m12;
  }
  expect(x).toBeCloseTo(rest.x, 3);
  expect(y).toBeCloseTo(rest.y, 3);
  /* the breath: from its middle to near or far and back, whole laps, on the site's ease and its halves */
  const breath = motion(nodes.find(n => n.name === "breath")!);
  expect(breath.field).toBe("MOTION_SCALE_XY");
  expect(breath.rest.vectorValue).toEqual({ x: 1, y: 1 });
  const values = breath.keys.map(k => k.keyframeValue.value.vectorValue.x);
  expect(values[0]).toBeCloseTo(1, 6);
  expect(values.at(-1)).toBeCloseTo(1, 6);
  for (const v of values.slice(1, -1)) expect([BLOB_DEPTH.far, BLOB_DEPTH.near]).toContain(v);
  expect(breath.keys.length).toBe(2 * Math.abs(b0.depth) + 2);
  expect(breath.keys[1].easingData.easingValue.bezierEasing).toEqual({
    p1x: 0.315,
    p1y: 0.5,
    p2x: 0.63,
    p2y: 1
  });
  expect(breath.keys[breath.keys.length - 1].easingData.easingValue.bezierEasing).toEqual({
    p1x: 0.37,
    p1y: 0,
    p2x: 0.685,
    p2y: 0.5
  });
  parentsFirst(nodes);
});

test("the blob moves at its speed, and holds still at speed 0 with no timeline", () => {
  const twice = figmaBlobNodes({ ...blobView, speed: 2 }) as Node[];
  expect(twice.find(n => n.name === "Navy and teal")!.timelineDuration).toBe((BLOB_LOOP / 2) * 1e6);
  const still = figmaBlobNodes({ ...blobView, speed: 0 }) as Node[];
  expect(
    still.some(n => n.type === "KEYFRAME_TRACK" || n.parameterConsumptionMap || n.timelineDuration)
  ).toBe(false);
  expect(JSON.stringify(still)).toBe(JSON.stringify(figmaBlobNodes(blobView)));
  /* the moving paste writes and reads back whole */
  const paste = read(figmaBlobHtml({ ...blobView, speed: 1 }, 9));
  const kinds = paste.message.nodeChanges.map((n: Node) => n.type);
  expect(kinds.filter((t: string) => t === "KEYFRAME_TRACK").length).toBeGreaterThan(100);
  expect(kinds.filter((t: string) => t === "KEYFRAME").length).toBeGreaterThan(300);
});

/* a track as Figma plays it: each stretch from one keyframe to the next on the easing its arriving keyframe gives */
function trackOf(nodes: Node[], layer: Node) {
  const key = (g: Node) => `${g.sessionID}:${g.localID}`;
  const [, from] =
    layer.parameterConsumptionMap.entries[0].variableData.value.expressionValue.expressionArguments;
  const id = key(
    from.value.keyframeTrackParameterValue.parameters[0].value.manual.keyframeTrackId.guid
  );
  return nodes
    .filter(k => k.type === "KEYFRAME" && key(k.parentIndex.guid) === id)
    .map(k => {
      const b = k.easingData.easingValue.bezierEasing;
      return {
        t: (k.timelinePosition ?? 0) / 1e6,
        v: k.keyframeValue.value.floatValue as number,
        e: k.easingData.easingType === "LINEAR" ? null : [b.p1x, b.p1y, b.p2x, b.p2y]
      };
    });
}
function played(keys: ReturnType<typeof trackOf>, t: number) {
  const curve = (u: number, a: number, b: number) =>
    3 * (1 - u) ** 2 * u * a + 3 * (1 - u) * u ** 2 * b + u ** 3;
  for (let k = 1; k < keys.length; k++) {
    if (t > keys[k].t) continue;
    const [a, b] = [keys[k - 1], keys[k]];
    const x = (t - a.t) / (b.t - a.t);
    let lo = 0;
    let hi = 1;
    if (b.e)
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (curve(mid, b.e[0], b.e[2]) < x) lo = mid;
        else hi = mid;
      }
    return a.v + (b.v - a.v) * (b.e ? curve((lo + hi) / 2, b.e[1], b.e[3]) : x);
  }
  return keys[keys.length - 1].v;
}

test("the playing glass's colors drift on Figma's timeline along the site's orbits, within a percent of them", () => {
  for (const [angle, shape, width, height, speed] of [
    [90, null, 1000, 1000, 1],
    [45, 7, 1186, 851, 2]
  ] as const) {
    const v = { ...view, angle, shape, width, height, speed };
    const nodes = figmaGlassNodes(v) as Node[];
    const loop = GLASS_LOOP / speed;
    expect(nodes.find(n => n.name === "Navy and teal")!.timelineDuration).toBe(loop * 1e6);
    expect(nodes.filter(n => n.type === "KEYFRAME_TRACK")).toHaveLength(24);
    const design = glassGeometry(GLASS_DESIGN, angle, shape);
    const field = glassField(design, colors);
    const s = Math.max(width, height) / GLASS_DESIGN.width;
    const at = new Float32Array(2);
    const at0 = new Float32Array(2);
    for (const [i, d] of field.discs.entries()) {
      const across = nodes.find(n => n.name === `drift ${i + 1}`)!;
      const down = nodes.find(
        n => n.name === "drift down" && n.parentIndex.guid.localID === across.guid.localID
      )!;
      const [kx, ky] = [trackOf(nodes, across), trackOf(nodes, down)];
      glassDiscAt(design, d, 0, at0, 0);
      for (let t = 0; t <= loop; t += loop / 120) {
        glassDiscAt(design, d, t * speed, at, 0);
        const miss = Math.hypot(
          (at[0] - at0[0]) * s - played(kx, t),
          (at[1] - at0[1]) * s - played(ky, t)
        );
        expect(miss).toBeLessThan(0.01 * Math.max(d.a, d.b) * s);
      }
    }
    parentsFirst(nodes);
  }
});

test("the glass held at speed 0 is its still paste, with no timeline", () => {
  const still = figmaGlassNodes({ ...view, speed: 0 }) as Node[];
  expect(
    still.some(n => n.type === "KEYFRAME_TRACK" || n.parameterConsumptionMap || n.timelineDuration)
  ).toBe(false);
  expect(JSON.stringify(still)).toBe(JSON.stringify(figmaGlassNodes(view)));
});

/* where a point of a layer's own box falls on its frame: its own place and every group's above it, to the top frame */
function onFrame(nodes: Node[], layer: Node, x: number, y: number): [number, number] {
  const key = (g: Node) => `${g.sessionID}:${g.localID}`;
  const byId = new Map(nodes.map(n => [key(n.guid), n]));
  let p: [number, number] = [x, y];
  for (let n: Node | undefined = layer; n; n = byId.get(key(n.parentIndex.guid))) {
    if (key(n.parentIndex.guid) === key(FIGMA_PAGE)) break;
    const t = n.transform;
    p = [t.m00 * p[0] + t.m01 * p[1] + t.m02, t.m10 * p[0] + t.m11 * p[1] + t.m12];
  }
  return p;
}
const middleOf = (nodes: Node[], layer: Node) =>
  onFrame(nodes, layer, layer.size.x / 2, layer.size.y / 2);
const childrenOf = (nodes: Node[], layer: Node) =>
  nodes.filter(
    n => n.parentIndex?.guid.localID === layer.guid.localID && n.parentIndex.guid.sessionID === 1
  );

/* the silk */
const silkView: FigmaSilkView = {
  palette,
  angle: 135,
  shape: 7,
  width: 1200,
  height: 800,
  name: "Navy and teal",
  speed: 0
};

test("the silk's paste is fig-kiwi, its frame selected, still and moving", () => {
  for (const speed of [0, 1]) {
    const paste = read(figmaSilkHtml({ ...silkView, speed }, 5));
    expect(paste.signature).toBe("fig-kiwi");
    expect(paste.chunks[0]).toEqual(bytesOf(FIGMA_SCHEMA));
    expect(paste.message.pasteID).toBe(5);
    expect(paste.message.nodeChanges[2]).toMatchObject({ type: "FRAME", name: "Navy and teal" });
    expect(paste.message.clipboardSelectionRegions[0].nodes).toEqual([
      paste.message.nodeChanges[2].guid
    ]);
    const tracks = paste.message.nodeChanges.filter((n: Node) => n.type === "KEYFRAME_TRACK");
    expect(tracks).toHaveLength(
      speed ? 2 * silkScene(palette, silkView, { width: 1200, height: 800 }).folds.length : 0
    );
  }
});

test("the silk as Figma's layers: the dye along its line, the valleys and the crests as alpha masks of rings about the gather", () => {
  const nodes = figmaSilkNodes(silkView) as Node[];
  const scene = silkScene(palette, silkView, { width: 1200, height: 800 });
  const named = (name: string) => nodes.filter(n => n.name === name);
  expect(named("Navy and teal")[0]).toMatchObject({
    type: "FRAME",
    size: { x: 1200, y: 800 },
    frameMaskDisabled: false
  });
  /* the dye: the palette's stops from the line's start to its end, whatever the box */
  const [dye] = named("dye");
  expect(dye).toMatchObject({ type: "RECTANGLE", size: { x: 1200, y: 800 } });
  const paint = dye.fillPaints[0];
  expect(paint.type).toBe("GRADIENT_LINEAR");
  expect(paint.stops).toHaveLength(scene.dye.base.length);
  const along = (x: number, y: number) =>
    paint.transform.m00 * (x / 1200) + paint.transform.m01 * (y / 800) + paint.transform.m02;
  expect(along(scene.x1, scene.y1)).toBeCloseTo(0, 9);
  expect(along(scene.x2, scene.y2)).toBeCloseTo(1, 9);
  expect(along((scene.x1 + scene.x2) / 2, (scene.y1 + scene.y2) / 2)).toBeCloseTo(0.5, 9);
  /* the shade and the lift lie over it through their masks */
  for (const [group, mask, over] of [
    ["valleys", "valley folds", "shade"],
    ["crests", "crest folds", "lift"]
  ]) {
    const [g] = named(group);
    const kids = childrenOf(nodes, g);
    expect(kids.map(k => k.name)).toEqual([mask, over]);
    expect(kids[0]).toMatchObject({ type: "FRAME", mask: true, maskType: "ALPHA" });
    expect(kids[1].fillPaints[0].type).toBe("GRADIENT_LINEAR");
    const folds = childrenOf(nodes, kids[0]);
    expect(folds).toHaveLength(scene.folds.length);
    const at = new Float64Array(2 * scene.folds.length);
    centresAt(scene, 0, at);
    for (const [i, fold] of folds.entries()) {
      /* Figma turns a group about its middle: the gather, its clear twin mirroring the ring through it */
      const [mx, my] = middleOf(nodes, fold);
      expect(mx).toBeCloseTo(scene.gx, 6);
      expect(my).toBeCloseTo(scene.gy, 6);
      /* the ring stands at its first frame's turn, its stops the profile from R - w to R + w */
      const [ring] = childrenOf(nodes, fold);
      const f = scene.folds[i];
      expect(ring).toMatchObject({
        type: "ELLIPSE",
        size: { x: 2 * (f.R + f.w), y: 2 * (f.R + f.w) }
      });
      const [rx, ry] = middleOf(nodes, ring);
      expect(rx).toBeCloseTo(at[2 * i], 6);
      expect(ry).toBeCloseTo(at[2 * i + 1], 6);
      const stops = ring.fillPaints[0].stops.map((s: Node) => s.position as number);
      expect(stops[0]).toBeCloseTo((f.R - f.w) / (f.R + f.w), 9);
      expect(stops.at(-1)).toBeCloseTo(1, 9);
    }
  }
  parentsFirst(nodes);
});

test("the playing silk swings each fold on Figma's timeline as the site swings it", () => {
  for (const speed of [1, 2]) {
    const v = { ...silkView, speed };
    const nodes = figmaSilkNodes(v) as Node[];
    const scene = silkScene(palette, v, { width: 1200, height: 800 });
    const loop = SILK_LOOP / speed;
    expect(nodes.find(n => n.name === "Navy and teal")!.timelineDuration).toBe(loop * 1e6);
    const at0 = new Float64Array(2 * scene.folds.length);
    const at = new Float64Array(2 * scene.folds.length);
    centresAt(scene, 0, at0);
    for (const mask of ["valley folds", "crest folds"]) {
      const folds = childrenOf(nodes, nodes.find(n => n.name === mask)!);
      for (const [i, fold] of folds.entries()) {
        const keys = trackOf(nodes, fold);
        expect(keys[0]).toMatchObject({ t: 0, v: 0 });
        expect(keys.at(-1)!.t).toBeCloseTo(loop, 6);
        for (let t = 0; t <= loop; t += loop / 97) {
          centresAt(scene, t * speed, at);
          /* the ring's middle as Figma plays the turn: clockwise radians about the gather */
          const a = played(keys, t);
          const px = at0[2 * i] - scene.gx;
          const py = at0[2 * i + 1] - scene.gy;
          const x = scene.gx + Math.cos(a) * px - Math.sin(a) * py;
          const y = scene.gy + Math.sin(a) * px + Math.cos(a) * py;
          expect(Math.hypot(x - at[2 * i], y - at[2 * i + 1])).toBeLessThan(0.05);
        }
      }
    }
    parentsFirst(nodes);
  }
});

/* the rosette */
const rosetteView = { ...silkView, angle: 60, shape: 12 };
const rosetteBox = { width: 1200, height: 800 };

test("the rosette's paste is fig-kiwi, its frame selected, still and moving", () => {
  for (const speed of [0, 1]) {
    const paste = read(figmaRosetteHtml({ ...rosetteView, speed }, 3));
    expect(paste.signature).toBe("fig-kiwi");
    expect(paste.chunks[0]).toEqual(bytesOf(FIGMA_SCHEMA));
    expect(paste.message.nodeChanges[2]).toMatchObject({ type: "FRAME", name: "Navy and teal" });
    expect(paste.message.clipboardSelectionRegions[0].nodes).toEqual([
      paste.message.nodeChanges[2].guid
    ]);
    const tracks = paste.message.nodeChanges.filter((n: Node) => n.type === "KEYFRAME_TRACK");
    expect(tracks).toHaveLength(speed ? 2 : 0);
  }
});

test("the rosette as Figma's layers: its ground, every petal a lens of two circles in its ring's gradient, the heart over them", () => {
  for (const speed of [0, 1]) {
    const nodes = figmaRosetteNodes({ ...rosetteView, speed }) as Node[];
    const sc = rosetteScene(palette, rosetteView, rosetteBox);
    const petals = rosettePetals(sc, speed > 0);
    const L = sc.lens;
    const named = (name: string) => nodes.filter(n => n.name === name);
    expect(named("Navy and teal")[0]).toMatchObject({
      type: "FRAME",
      size: { x: 1200, y: 800 },
      frameMaskDisabled: false
    });
    expect(named("ground")[0]).toMatchObject({ type: "RECTANGLE", size: { x: 1200, y: 800 } });
    expect(named("ground")[0].fillPaints[0].color.r).toBeCloseTo(
      Math.round(sc.colors.ground[0] * 255) / 255,
      2
    );
    /* the petals' groups turn and zoom about the heart: their middles are the frame's */
    const groups = named("petals");
    expect(groups).toHaveLength(speed ? 2 : 1);
    for (const g of groups) {
      const [x, y] = middleOf(nodes, g);
      expect(x).toBeCloseTo(600, 6);
      expect(y).toBeCloseTo(400, 6);
    }
    const [pivot] = named("pivot");
    const [px0, py0] = onFrame(nodes, pivot, 0, 0);
    const lenses = nodes.filter(n => n.type === "BOOLEAN_OPERATION");
    expect(lenses).toHaveLength(petals.length);
    for (const [i, lens] of lenses.entries()) {
      const p = petals[i];
      expect(lens.booleanOperation).toBe("INTERSECT");
      /* the lens's middle lies on its ray from the heart, at its middle's radius */
      const [mx, my] = middleOf(nodes, lens);
      expect(mx).toBeCloseTo(600 + Math.cos(p.th) * L.xm * p.r, 6);
      expect(my).toBeCloseTo(400 + Math.sin(p.th) * L.xm * p.r, 6);
      /* its circles meet at the box's ends and reach its sides */
      const circles = childrenOf(nodes, lens);
      expect(circles.map(c => c.type)).toEqual(["ELLIPSE", "ELLIPSE"]);
      const R = circles[0].size.x / 2;
      const [a, b] = circles.map(c => [c.transform.m02 + R, c.transform.m12 + R]);
      const half = Math.abs(a[1] - b[1]) / 2;
      expect(a[0]).toBeCloseTo(lens.size.x / 2, 6);
      expect(a[0] - Math.sqrt(R * R - half * half)).toBeCloseTo(0, 6);
      expect(R - half).toBeCloseTo(lens.size.y / 2, 6);
      /* its box lies inside the pivot's square, so the groups fit the pivot */
      for (const [x, y] of [
        [0, 0],
        [lens.size.x, 0],
        [0, lens.size.y],
        [lens.size.x, lens.size.y]
      ]) {
        const [fx, fy] = onFrame(nodes, lens, x, y);
        expect(fx).toBeGreaterThan(px0);
        expect(fy).toBeGreaterThan(py0);
        expect(fx).toBeLessThan(px0 + pivot.size.x);
        expect(fy).toBeLessThan(py0 + pivot.size.y);
      }
      expect(lens.fillPaints[0].stops).toHaveLength(sc.design.stops.length);
    }
    /* the heart's glow, out from the middle */
    const [heart] = named("heart");
    expect(heart.size.x).toBeCloseTo(2 * sc.design.heartOut * sc.S, 6);
    expect(middleOf(nodes, heart)[0]).toBeCloseTo(600, 6);
    expect(heart.fillPaints[0].stops.at(-1).color.a).toBe(HEART_STOPS.at(-1)![1]);
    parentsFirst(nodes);
  }
});

test("the playing rosette turns and zooms on Figma's timeline as its moving SVG does", () => {
  for (const speed of [1, 2]) {
    const nodes = figmaRosetteNodes({ ...rosetteView, speed }) as Node[];
    const sc = rosetteScene(palette, rosetteView, rosetteBox);
    const loop = sc.design.loop / speed;
    expect(nodes.find(n => n.name === "Navy and teal")!.timelineDuration).toBe(
      Math.round(loop * 1e6)
    );
    const [turn, zoom] = nodes.filter(n => n.name === "petals");
    expect(turn.parameterConsumptionMap.entries[0].variableField).toBe("MOTION_ROTATION");
    expect(zoom.parameterConsumptionMap.entries[0].variableField).toBe("MOTION_SCALE_XY");
    /* an even turn, clockwise radians as CSS's rotate turns it */
    const keys = trackOf(nodes, turn);
    expect(keys.map(k => k.t)).toEqual([0, loop]);
    expect(keys[1].v).toBeCloseTo(sc.lattice.beta, 9);
    expect(keys[1].e).toBe(null);
    /* the zoom's eased stretches, the SVG's keyframes */
    const key = (g: Node) => `${g.sessionID}:${g.localID}`;
    const [, from] =
      zoom.parameterConsumptionMap.entries[0].variableData.value.expressionValue
        .expressionArguments;
    const id = key(
      from.value.keyframeTrackParameterValue.parameters[0].value.manual.keyframeTrackId.guid
    );
    const scales = nodes.filter(k => k.type === "KEYFRAME" && key(k.parentIndex.guid) === id);
    const svg = zoomKeys(sc);
    expect(scales).toHaveLength(svg.length);
    for (const [i, k] of scales.entries()) {
      expect((k.timelinePosition ?? 0) / 1e6).toBeCloseTo(svg[i].at * loop, 5);
      expect(k.keyframeValue.value.vectorValue.x).toBeCloseTo(svg[i].scale, 9);
      expect(k.easingData.easingType).toBe(i ? "CUSTOM_CUBIC" : "LINEAR");
    }
  }
});

/* the soft and the grain, and the gradient the site lays under a soft effect */
const underlayOf = (kind: Effect["kind"], angle: number, soft: number, bg: string | null = null) =>
  effectUnderlay(palette, { kind, look: { shape: null, frost: 1, bg, steps: null } }, angle, soft);
/* the gradient a press makes for a view, for a soft one alone */
const madeFor = (
  kind: Effect["kind"],
  angle: number,
  finish?: FigmaFinish,
  bg: string | null = null
) => (finish?.soft ? underlayOf(kind, angle, finish.soft, bg) : null);
const box = { width: 1200, height: 800 };
/* the strings, a still at any pace: as designed, a nest of closed loops in its middle and hairpins at either side */
const stringsView: FigmaStringsView = {
  palette,
  angle: 90,
  shape: null,
  bg: null,
  ...box,
  name: "Navy and teal"
};
/* each effect's paste in a box, finished or not, as the moving ones play (the strings at any speed alike): the
   papercut, a still at any pace, has its own test */
const pastes: Record<
  Exclude<Effect["kind"], "papercut">,
  (finish?: FigmaFinish, speed?: number) => Node[]
> = {
  glass: (finish, speed = 0) =>
    figmaGlassNodes({
      ...view,
      ...box,
      angle: 135,
      speed,
      finish,
      underlay: madeFor("glass", 135, finish)
    }) as Node[],
  blob: (finish, speed = 0) =>
    figmaBlobNodes({
      ...blobView,
      ...box,
      shape: blobShapeOf("kUMzO5Na871ukuyhHUJA"),
      bg: "#f0e6d2",
      speed,
      finish,
      underlay: madeFor("blob", 90, finish, "#f0e6d2")
    }) as Node[],
  silk: (finish, speed = 0) =>
    figmaSilkNodes({
      ...silkView,
      speed,
      finish,
      underlay: madeFor("silk", 135, finish)
    }) as Node[],
  rosette: (finish, speed = 0) =>
    figmaRosetteNodes({
      ...rosetteView,
      speed,
      finish,
      underlay: madeFor("rosette", 60, finish)
    }) as Node[],
  strings: finish =>
    figmaStringsNodes({ ...stringsView, finish, underlay: madeFor("strings", 90, finish) })
      .nodes as Node[],
  /* the field effects, each a still at any pace as the strings are (kit/figma.ts) */
  ...kitRecord(
    kind => (finish?: FigmaFinish) =>
      figmaKitNodes(kitEffect(kind), {
        ...stringsView,
        angle: 210,
        steps: null,
        finish,
        underlay: madeFor(kind, 210, finish)
      }).nodes as Node[]
  )
};
const angleOf: Record<keyof typeof pastes, number> = {
  glass: 135,
  blob: 90,
  silk: 135,
  rosette: 60,
  strings: 90,
  ...kitRecord(() => 210)
};
/* the kinds pasted so, every kind but the papercut, and those that move on Figma's timeline */
const pasted = Object.keys(pastes) as (keyof typeof pastes)[];
const playing = pasted.filter(kind => EFFECT_KINDS[kind].figma === "moving");
/* a layer's children in their order */
const kidsOf = (nodes: Node[], parent: Node) =>
  childrenOf(nodes, parent).sort((a, b) =>
    a.parentIndex.position < b.parentIndex.position ? -1 : 1
  );
/* a layer's subtree as its names, types and paints, the finish's groups' own places left out */
const shapeOf = (nodes: Node[], parent: Node): unknown[] =>
  kidsOf(nodes, parent).map(n => [n.name, n.type, n.fillPaints, n.effects, shapeOf(nodes, n)]);

test("Figma's Noise as the grain: black and white specks a design unit each, at the alpha that matches the tile", () => {
  for (const grain of [1, 20, 50, 100]) {
    const noise = figmaNoise(grain);
    expect(noise).toMatchObject({
      type: "NOISE",
      noiseType: "DUOTONE",
      noiseSize: { x: 1, y: 1 },
      density: FIGMA_FINISH.density
    });
    expect(noise.color).toMatchObject({ r: 0, g: 0, b: 0 });
    expect(noise.secondaryColor).toMatchObject({ r: 1, g: 1, b: 1 });
    expect(noise.color.a).toBeCloseTo((FIGMA_FINISH.alpha * grain) / 100, 3);
    expect(noise.secondaryColor.a).toBe(noise.color.a);
  }
});

test("a linear gradient runs along CSS's line: its start and end at the corners the angle points from and to", () => {
  /* the box's own point (0 to 1 each way) to the gradient's place along its line */
  const along = (t: ReturnType<typeof figmaLinear>["transform"], x: number, y: number) =>
    t.m00 * x + t.m01 * y + t.m02;
  for (const [angle, from, to] of [
    [90, [0, 0.5], [1, 0.5]],
    [0, [0.5, 1], [0.5, 0]],
    [180, [0.5, 0], [0.5, 1]],
    [45, [0, 1], [1, 0]],
    [135, [0, 0], [1, 1]],
    [300, [1, 0.75], [0, 0.25]]
  ] as const) {
    const { transform } = figmaLinear(["#000000", "#ffffff"], angle, 1200, 800);
    if (angle === 300) {
      /* off the corners, CSS's line runs through the middle: the middle is halfway along it */
      expect(along(transform, 0.5, 0.5)).toBeCloseTo(0.5, 9);
      continue;
    }
    expect(along(transform, from[0], from[1])).toBeCloseTo(0, 9);
    expect(along(transform, to[0], to[1])).toBeCloseTo(1, 9);
  }
  const stops = figmaLinear(["#ff0000", "#00ff00", "#0000ff"], 90, 10, 10, [0, 0.2, 1]).stops;
  expect(stops.map(s => s.position)).toEqual([0, 0.2, 1]);
  expect(stops[1].color).toMatchObject({ r: 0, g: 1, b: 0, a: 1 });
});

test("every effect's soft and grain wrap its drawing: the grain's noise over a masked group, the gradient under, the drawing blurred, itself masked to the box", () => {
  for (const kind of pasted) {
    const nodes = pastes[kind]({ soft: 50, grain: 50 });
    const plain = pastes[kind]();
    const [top] = nodes.filter(n => n.name === "Navy and teal");
    const size = { x: top.size.x, y: top.size.y };
    /* the glass's grain is a layer of its own over its finish; every other effect's is the finish's own noise */
    const [outer, ...over] = kidsOf(nodes, top);
    if (kind === "glass") {
      expect(outer).toMatchObject({ type: "FRAME", resizeToFit: true, name: "finish", size });
      expect(outer.effects).toBeUndefined();
      expect(over).toHaveLength(1);
      expect(over[0]).toMatchObject({
        type: "RECTANGLE",
        name: "grain",
        blendMode: "HARD_LIGHT",
        size
      });
      expect(over[0].effects).toEqual([figmaNoise(50)]);
    } else {
      expect(outer).toMatchObject({ type: "FRAME", resizeToFit: true, name: "grain", size });
      expect(outer.effects).toEqual([figmaNoise(50)]);
      expect(over).toEqual([]);
    }
    const [mask, gradient, soft] = kidsOf(nodes, outer);
    expect(mask).toMatchObject({ type: "RECTANGLE", mask: true, maskType: "ALPHA", size });
    /* the palette's gradient at the effect's angle (the blob's left to right), its stops blurred by the soft */
    expect(gradient).toMatchObject({ type: "RECTANGLE", name: "gradient", size });
    const underlay = underlayOf(kind, angleOf[kind], 50, kind === "blob" ? "#f0e6d2" : null)!;
    expect(gradient.fillPaints[0]).toEqual(
      figmaLinear(
        underlay.stops.map(s => s.hex),
        underlay.angle,
        size.x,
        size.y,
        underlay.at
      )
    );
    expect(underlay.angle).toBe(kind === "blob" ? 90 : angleOf[kind]);
    /* the blur: Figma's radius 2.351 times the site's sigma */
    expect(soft).toMatchObject({ type: "FRAME", resizeToFit: true, name: "soft", size });
    expect(soft.effects[0]).toMatchObject({ type: "FOREGROUND_BLUR" });
    expect(soft.effects[0].radius).toBeCloseTo(
      FIGMA_FINISH.blur * effectBlurSigma(50, { width: size.x, height: size.y }),
      2
    );
    const [picture] = kidsOf(nodes, soft);
    const [clip, ...drawing] = kidsOf(nodes, picture);
    expect(clip).toMatchObject({ type: "RECTANGLE", mask: true, size });
    /* the drawing itself unchanged, the blob's ground a layer under it in the frame's place */
    const own = drawing.filter(
      n => n.name !== "ground" || kind === "rosette" || kind === "strings"
    );
    expect(own.map(n => shapeOf(nodes, n))).toEqual(
      kidsOf(plain, plain[2]).map(n => shapeOf(plain, n))
    );
    if (kind === "blob") {
      expect(drawing[0]).toMatchObject({ type: "RECTANGLE", name: "ground", size });
      expect(drawing[0].fillPaints[0].color.r).toBeCloseTo(0xf0 / 255, 5);
      expect(top.fillPaints).toEqual([]);
      expect(plain[2].fillPaints[0].color.r).toBeCloseTo(0xf0 / 255, 5);
    }
    parentsFirst(nodes);
  }
});

test("a grain alone lays the noise over the drawing, a soft alone blurs it with no noise, and neither leaves the paste as it was", () => {
  for (const kind of pasted) {
    const grained = pastes[kind]({ grain: 20 });
    const top = grained[2];
    const kids = kidsOf(grained, top);
    if (kind === "glass") {
      /* the glass as it was, and its grain over it */
      const plain = pastes.glass();
      expect(kids.map(n => n.name)).toEqual(["glass", "grain"]);
      expect(shapeOf(grained, kids[0])).toEqual(shapeOf(plain, kidsOf(plain, plain[2])[0]));
      expect(kids[1].effects).toEqual([figmaNoise(20)]);
    } else {
      expect(kids).toHaveLength(1);
      expect(kids[0].name).toBe("grain");
      expect(kids[0].effects).toEqual([figmaNoise(20)]);
    }
    expect(grained.some(n => n.name === "soft" || n.name === "gradient")).toBe(false);
    const softened = pastes[kind]({ soft: 30 });
    const [outer, ...rest] = kidsOf(softened, softened[2]);
    expect(outer.name).toBe("finish");
    expect(rest).toEqual([]);
    expect(outer.effects).toBeUndefined();
    expect(
      softened.some(n =>
        n.effects?.some((e: Node) => e.type === "NOISE" && e.noiseType === "DUOTONE")
      )
    ).toBe(false);
    expect(JSON.stringify(pastes[kind]({ soft: 0, grain: 0 }))).toBe(
      JSON.stringify(pastes[kind]())
    );
  }
  /* a blob with no ground has no gradient under its blur: its edges go clear */
  const clear = figmaBlobNodes({
    ...blobView,
    finish: { soft: 40, grain: 10 },
    underlay: null
  }) as Node[];
  expect(clear.some(n => n.name === "gradient" || n.name === "ground")).toBe(false);
  expect(clear.some(n => n.name === "soft")).toBe(true);
});

test("the glass's grain is a layer of its own, 50% gray in Hard Light over all of it: no group above Figma's Glass carries a noise, which the Glass would take in", () => {
  for (const finish of [{ grain: 50 }, { soft: 60, grain: 100 }] as const) {
    for (const speed of [0, 1]) {
      const nodes = pastes.glass(finish, speed);
      const top = nodes[2];
      const kids = kidsOf(nodes, top);
      const grain = kids[kids.length - 1];
      expect(grain).toMatchObject({
        type: "RECTANGLE",
        name: "grain",
        blendMode: "HARD_LIGHT",
        size: { x: box.width, y: box.height },
        transform: { m02: 0, m12: 0 }
      });
      expect(grain.fillPaints).toEqual([
        expect.objectContaining({
          type: "SOLID",
          color: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
          opacity: 1
        })
      ]);
      expect(grain.effects).toEqual([figmaNoise(finish.grain)]);
      expect(grain.parameterConsumptionMap).toBeUndefined();
      /* the one noise in the paste is the grain's */
      expect(nodes.filter(n => n.effects?.some((e: Node) => e.type === "NOISE"))).toEqual([grain]);
    }
  }
});

test("a soft blob lays the gradient its press made under it, none for one that stands clear, its ground at its own alpha", () => {
  for (const bg of ["#f0e6d2", "#f0e6d240", null]) {
    const underlay = madeFor("blob", 90, { soft: 50 }, bg);
    const nodes = figmaBlobNodes({
      ...blobView,
      ...box,
      bg,
      finish: { soft: 50, grain: 30 },
      underlay
    }) as Node[];
    expect(nodes.some(n => n.name === "gradient")).toBe(underlay !== null);
    const ground = nodes.find(n => n.name === "ground");
    if (!bg) expect(ground).toBeUndefined();
    else expect(ground!.fillPaints[0].opacity).toBeCloseTo(bg.length === 9 ? 0x40 / 255 : 1, 5);
    expect(nodes[2].fillPaints).toEqual([]);
  }
});

test("a soft glass given no gradient blurs over nothing: its edges go clear", () => {
  const nodes = figmaGlassNodes({ ...view, finish: { soft: 50 } }) as Node[];
  expect(nodes.some(n => n.name === "soft")).toBe(true);
  expect(nodes.some(n => n.name === "gradient")).toBe(false);
});

test("a moving paste keeps its soft and grain still: the finish's groups take no track, the moving layers move inside them", () => {
  expect(playing).toContain("glass");
  for (const kind of playing) {
    const nodes = pastes[kind]({ soft: 60, grain: 40 }, 1);
    const byId = new Map(nodes.map(n => [n.guid.localID, n]));
    const finishGroups = nodes.filter(n =>
      ["finish", "grain", "soft", "picture", "gradient", "mask"].includes(n.name)
    );
    for (const g of finishGroups) expect(g.parameterConsumptionMap).toBeUndefined();
    const moving = nodes.filter(n => n.parameterConsumptionMap);
    expect(moving.length).toBeGreaterThan(0);
    /* every moving layer stands inside the blurred picture */
    for (const m of moving) {
      let up = byId.get(m.parentIndex.guid.localID);
      while (up && up.name !== "picture") up = byId.get(up.parentIndex.guid.localID);
      expect(up?.name).toBe("picture");
    }
    expect(nodes[2].timelineDuration).toBeGreaterThan(0);
  }
});

test("a finished paste writes and reads back whole, its noise with both colors, the glass's grain in Hard Light", () => {
  const html = figmaSilkHtml(
    { ...silkView, finish: { soft: 50, grain: 50 }, underlay: madeFor("silk", 135, { soft: 50 }) },
    11
  );
  const nodes = read(html).message.nodeChanges as FigmaNode[] as Node[];
  const grain = nodes.find(n => n.name === "grain")!;
  expect(grain.effects[0]).toMatchObject({
    type: "NOISE",
    noiseType: "DUOTONE",
    density: 0.5,
    noiseSize: { x: 1, y: 1 },
    secondaryColor: { r: 1, g: 1, b: 1 }
  });
  expect(grain.effects[0].color.a).toBeCloseTo(0.375, 6);
  const gradient = nodes.find(n => n.name === "gradient")!;
  expect(gradient.fillPaints[0].type).toBe("GRADIENT_LINEAR");
  expect(nodes.find(n => n.name === "soft")!.effects[0].type).toBe("FOREGROUND_BLUR");
  const glass = read(figmaGlassHtml({ ...view, finish: { grain: 50 } }, 12)).message
    .nodeChanges as FigmaNode[] as Node[];
  const layer = glass.find(n => n.name === "grain")!;
  expect(layer).toMatchObject({ type: "RECTANGLE", blendMode: "HARD_LIGHT" });
  expect(layer.fillPaints[0].color).toMatchObject({ r: 0.5, g: 0.5, b: 0.5 });
  expect(layer.effects[0]).toMatchObject({ type: "NOISE", noiseType: "DUOTONE" });
});

test("a path's loops as Figma's vector network: each segment's handles from its own vertex, every loop in one odd region", () => {
  /* relative and absolute, a line and a curve, a minus its only separator, numbers with no zero before the point */
  const loops = figmaPathLoops("M10 10c0 5 5 10 10 10l5-5z M30 30L40 30 40 40Z");
  expect(loops).toEqual([
    [
      [
        [10, 10],
        [10, 15],
        [15, 20],
        [20, 20]
      ],
      [
        [20, 20],
        [20, 20],
        [25, 15],
        [25, 15]
      ],
      [
        [25, 15],
        [25, 15],
        [10, 10],
        [10, 10]
      ]
    ],
    [
      [
        [30, 30],
        [30, 30],
        [40, 30],
        [40, 30]
      ],
      [
        [40, 30],
        [40, 30],
        [40, 40],
        [40, 40]
      ],
      [
        [40, 40],
        [40, 40],
        [30, 30],
        [30, 30]
      ]
    ]
  ]);
  expect(figmaPathLoops("M.5-.5c.1 0 .2.1 .3.2z")[0][0]).toEqual([
    [0.5, -0.5],
    [0.6, -0.5],
    [0.7, -0.4],
    [0.8, -0.3]
  ]);
  /* the same subpaths with whether a Z closes each, left open where none does */
  const runs = figmaPathRuns("M10 10c0 5 5 10 10 10l5-5z M30 30L40 30 40 40");
  expect(runs.map(r => [r.cubics.length, r.closed])).toEqual([
    [2, true],
    [2, false]
  ]);
  expect(runs[0].cubics).toEqual(loops[0].slice(0, 2));
  /* h and v, relative and absolute, as the kit's box loop runs round (kit/trace.ts kitBoxLoop): each a line from where
     the pen stands, the other coordinate held */
  const line = (a: [number, number], b: [number, number]) => [a, a, b, b];
  expect(figmaPathRuns("M-7-7h334v194h-334z M1 2H5V9")).toEqual([
    {
      cubics: [line([-7, -7], [327, -7]), line([327, -7], [327, 187]), line([327, 187], [-7, 187])],
      closed: true
    },
    { cubics: [line([1, 2], [5, 2]), line([5, 2], [5, 9])], closed: false }
  ]);
  /* in the layout Figma's own clipboard writes (W/figma-clip samples/01): counts, then vertices, segments, regions */
  const bytes = figmaVectorNetwork(loops);
  const v = new DataView(bytes.buffer);
  const u = (at: number) => v.getUint32(at, true);
  const f = (at: number) => v.getFloat32(at, true);
  expect([u(0), u(4), u(8)]).toEqual([6, 6, 1]);
  expect([u(12), f(16), f(20)]).toEqual([0, 10, 10]);
  const segment = 12 + 6 * 12;
  /* the first: from vertex 0, its handle 5 down, to vertex 1, its handle 5 left */
  expect([u(segment + 4), f(segment + 8), f(segment + 12), u(segment + 16)]).toEqual([0, 0, 5, 1]);
  expect([f(segment + 20), f(segment + 24)]).toEqual([-5, 0]);
  /* a loop's last segment closes on its first vertex */
  expect(u(segment + 2 * 28 + 16)).toBe(0);
  expect(u(segment + 5 * 28 + 16)).toBe(3);
  const region = segment + 6 * 28;
  /* the region's style over its winding bit, 0 for the odd rule, then two loops of three segments each */
  expect([u(region), u(region + 4), u(region + 8)]).toEqual([0, 2, 3]);
  expect([u(region + 12), u(region + 16), u(region + 20)]).toEqual([0, 1, 2]);
  expect([u(region + 24), u(region + 28), u(region + 32), u(region + 36)]).toEqual([3, 3, 4, 5]);
  expect(bytes.length).toBe(region + 8 + 2 * 16);
});

test("the papercut as Figma's layers: each sheet a group of its shadow, its contact, its wall and its face, vectors whose networks the paste carries", () => {
  const view = {
    palette,
    angle: 135,
    shape: 7,
    width: 1200,
    height: 800,
    name: "Navy and teal"
  };
  const { blobs } = figmaPapercutNodes(view);
  const pasted = read(figmaPapercutHtml(view, 7));
  expect(pasted.signature).toBe("fig-kiwi");
  const message = pasted.message;
  const all = message.nodeChanges as Node[];
  parentsFirst(all);
  /* the networks the vectors name, as they were made */
  expect(message.blobs.map((b: { bytes: number[] }) => Uint8Array.from(b.bytes))).toEqual(blobs);
  const frame = all.find(n => n.name === "Navy and teal")!;
  expect(frame).toMatchObject({ type: "FRAME", size: { x: 1200, y: 800 } });
  const sheets = all.filter(n => /^sheet \d+$/.test(n.name));
  const m = papercutScene(palette, { angle: 135, shape: 7 }, { width: 1200, height: 800 });
  expect(sheets.length).toBeGreaterThan(m.n / 2);
  for (const sheet of sheets) {
    const k = Number(sheet.name.slice(6));
    const layers = kidsOf(all, sheet);
    expect(layers.map(n => [n.type, n.name])).toEqual([
      ["VECTOR", "shadow"],
      ["VECTOR", "contact"],
      ["VECTOR", "wall"],
      ["VECTOR", "face"]
    ]);
    const [shadow, contact, wall, face] = layers;
    expect(shadow.opacity).toBeCloseTo(m.alpha[k], 6);
    expect(shadow.effects[0]).toMatchObject({ type: "FOREGROUND_BLUR" });
    expect(shadow.effects[0].radius).toBeCloseTo(FIGMA_FINISH.blur * m.sigma[k], 2);
    expect(contact.effects[0].radius).toBeCloseTo(FIGMA_FINISH.blur * m.csigma, 2);
    expect(contact.opacity).toBeCloseTo(m.calpha, 6);
    /* Figma keeps a color's channels as 32-bit floats: the same byte each */
    const byte = (c: { r: number; g: number; b: number }) =>
      [c.r, c.g, c.b].map(x => Math.round(x * 255));
    expect(byte(wall.fillPaints[0].color)).toEqual(byte(figmaColor(m.wallHex[k])));
    expect(byte(face.fillPaints[0].color)).toEqual(byte(figmaColor(m.hex[k])));
    for (const layer of layers) {
      const { vectorNetworkBlob, normalizedSize } = layer.vectorData;
      expect(normalizedSize).toEqual(layer.size);
      /* its network's vertices stand inside its own box */
      const net = new DataView(Uint8Array.from(message.blobs[vectorNetworkBlob].bytes).buffer);
      const count = net.getUint32(0, true);
      for (let i = 0; i < count; i++) {
        expect(net.getFloat32(12 + i * 12 + 4, true)).toBeGreaterThanOrEqual(-1e-3);
        expect(net.getFloat32(12 + i * 12 + 8, true)).toBeLessThanOrEqual(layer.size.y + 1e-3);
      }
      /* read as Sketch's .fig reader reads one (fig2sketch's vector_network.py), to its last byte: one region by the
         odd rule, its loops naming every segment once */
      const segments = net.getUint32(4, true);
      expect(net.getUint32(8, true)).toBe(1);
      let at = 12 + count * 12 + segments * 28;
      expect(net.getUint32(at, true) & 1).toBe(0);
      const loops = net.getUint32(at + 4, true);
      at += 8;
      const named: number[] = [];
      for (let l = 0; l < loops; l++) {
        const n = net.getUint32(at, true);
        for (let i = 0; i < n; i++) named.push(net.getUint32(at + 4 + 4 * i, true));
        at += 4 + 4 * n;
      }
      expect(at).toBe(net.byteLength);
      expect(named.sort((x, y) => x - y)).toEqual([...Array(segments).keys()]);
    }
  }
  /* soft and grain wrap it as every effect's: the noise over all, the gradient under the blurred drawing */
  const finished = figmaPapercutNodes({
    ...view,
    finish: { soft: 50, grain: 50 },
    underlay: effectUnderlay(
      palette,
      { kind: "papercut", look: { shape: 7, frost: 1, bg: null, steps: null } },
      135,
      50
    )
  }).nodes as Node[];
  const grain = finished.find(n => n.name === "grain")!;
  expect(grain.effects[0]).toMatchObject({ type: "NOISE" });
  expect(kidsOf(finished, grain).map(n => n.name)).toEqual(["mask", "gradient", "soft"]);
  expect(finished.find(n => n.name === "soft")!.effects[0].radius).toBeCloseTo(
    FIGMA_FINISH.blur * effectBlurSigma(50, { width: 1200, height: 800 }),
    2
  );
});

/* the strings */
const bezier = (c: FigmaCubic, t: number): [number, number] => {
  const s = 1 - t;
  return [
    s * s * s * c[0][0] + 3 * s * s * t * c[1][0] + 3 * s * t * t * c[2][0] + t * t * t * c[3][0],
    s * s * s * c[0][1] + 3 * s * s * t * c[1][1] + 3 * s * t * t * c[2][1] + t * t * t * c[3][1]
  ];
};
/* loops of cubics as closed polylines, each cubic in 16 lines */
const flattened = (loops: readonly (readonly FigmaCubic[])[]) =>
  loops.map(loop => loop.flatMap(c => Array.from({ length: 16 }, (_, i) => bezier(c, i / 16))));
/* the area loops of cubics fill by the odd rule, and by the nonzero rule (everything any loop goes round), in rows a
   twentieth of a pixel apart */
function fills(loops: readonly (readonly FigmaCubic[])[]) {
  const dy = 0.05;
  const lines = flattened(loops).flatMap(p =>
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
/* whether loops of cubics fill a point by the odd rule: the lines a ray from it to its right crosses */
function fillsPoint(loops: readonly (readonly FigmaCubic[])[], x: number, y: number) {
  const lines = flattened(loops).flatMap(p => p.map((a, i) => [a, p[(i + 1) % p.length]]));
  const crossed = lines.filter(
    ([a, b]) => a[1] <= y !== b[1] <= y && a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]) > x
  );
  return crossed.length % 2 === 1;
}
/* a vector network's loops as cubics, read as Sketch's .fig reader reads one: each segment from its start and its
   handle there to its end and its handle there, its region's loops naming them */
function networkLoops(bytes: Uint8Array): FigmaCubic[][] {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vertices = v.getUint32(0, true);
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
  let at = 12 + vertices * 12 + v.getUint32(4, true) * 28;
  const count = v.getUint32(at + 4, true);
  at += 8;
  const loops: FigmaCubic[][] = [];
  for (let l = 0; l < count; l++) {
    const n = v.getUint32(at, true);
    loops.push(Array.from({ length: n }, (_, i) => cubic(v.getUint32(at + 4 + 4 * i, true))));
    at += 4 + 4 * n;
  }
  return loops;
}
/* a path's length, each cubic in 64 lines, a closed subpath's step back to its start as well */
const pathLength = (d: string) =>
  figmaPathRuns(d).reduce((sum, { cubics, closed }) => {
    const p: (readonly [number, number])[] = cubics.flatMap(c =>
      Array.from({ length: 64 }, (_, i) => bezier(c, i / 64))
    );
    p.push(closed ? cubics[0][0] : cubics[cubics.length - 1][3]);
    return sum + p.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);
  }, 0);

test("the strings' paste is fig-kiwi, its frame selected, a still with nothing on Figma's timeline", () => {
  const { blobs } = figmaStringsNodes(stringsView);
  const pasted = read(figmaStringsHtml(stringsView, 3));
  expect(pasted.signature).toBe("fig-kiwi");
  expect(pasted.chunks[0]).toEqual(bytesOf(FIGMA_SCHEMA));
  expect(pasted.meta).toMatchObject({ pasteID: 3, fileKey: "grabientPasteStrings001" });
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

test("the strings as Figma's layers: the ground in its color, then a group of one vector a thread, filled in the thread's color where its stroke lies", () => {
  const { nodes, blobs } = figmaStringsNodes(stringsView) as { nodes: Node[]; blobs: Uint8Array[] };
  const m = stringsScene(palette, stringsView, box);
  const threads = stringsThreads(m);
  const [ground, group] = kidsOf(nodes, nodes[2]);
  expect(ground).toMatchObject({ type: "RECTANGLE", name: "ground", size: { x: 1200, y: 800 } });
  /* Figma keeps a color's channels as 32-bit floats: the same byte each */
  const byte = (c: { r: number; g: number; b: number }) =>
    [c.r, c.g, c.b].map(x => Math.round(x * 255));
  expect(byte(ground.fillPaints[0].color)).toEqual(byte(figmaColor(m.groundHex)));
  expect(group).toMatchObject({ type: "FRAME", name: "strings", resizeToFit: true });
  const vectors = kidsOf(nodes, group);
  const levels = [...threads.keys()].sort((a, b) => a - b);
  /* the ribbons' levels, -(N - 1) to N - 1, most of them showing somewhere */
  expect(levels.length).toBeGreaterThan(20);
  expect(levels.length).toBeLessThanOrEqual(2 * m.n - 1);
  expect(vectors.map(v => [v.type, v.name])).toEqual(levels.map(k => ["VECTOR", `thread ${k}`]));
  for (const [i, vector] of vectors.entries()) {
    const k = levels[i];
    expect(byte(vector.fillPaints[0].color)).toEqual(byte(figmaColor(stringsHex(m, k))));
    expect(vector.vectorData.normalizedSize).toEqual(vector.size);
    /* its outline, on the frame, holds its thread's path and lies a half width past it at most, and the fit's
       tolerance */
    const ox = group.transform.m02 + vector.transform.m02;
    const oy = group.transform.m12 + vector.transform.m12;
    const bounds = (points: [number, number][]) =>
      points.reduce(
        (b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)],
        [Infinity, Infinity, -Infinity, -Infinity]
      );
    const outline = bounds(
      flattened(networkLoops(blobs[vector.vectorData.vectorNetworkBlob])).flatMap(p =>
        p.map(([x, y]) => [x + ox, y + oy] as [number, number])
      )
    );
    const path = bounds(
      figmaPathRuns(threads.get(k)!).flatMap(({ cubics }) =>
        cubics.flatMap(c => Array.from({ length: 9 }, (_, j) => bezier(c, j / 8)))
      )
    );
    for (const [edge, out] of [-1, -1, 1, 1].entries()) {
      expect(out * (outline[edge] - path[edge])).toBeGreaterThan(-1e-3);
      expect(out * (outline[edge] - path[edge])).toBeLessThan(m.hw + 0.1);
    }
    /* one region by the odd rule, its vertices in the vector's own box */
    const net = new DataView(blobs[vector.vectorData.vectorNetworkBlob].buffer);
    expect(net.getUint32(8, true)).toBe(1);
    expect(
      net.getUint32(12 + net.getUint32(0, true) * 12 + net.getUint32(4, true) * 28, true)
    ).toBe(0);
    for (let v = 0; v < net.getUint32(0, true); v++) {
      expect(net.getFloat32(12 + v * 12 + 4, true)).toBeGreaterThanOrEqual(-1e-3);
      expect(net.getFloat32(12 + v * 12 + 8, true)).toBeLessThanOrEqual(vector.size.y + 1e-3);
    }
  }
  parentsFirst(nodes);
});

test("the strings' paste lays their ground at its color and alpha, none where it is clear, and their threads in the colors it lifts", () => {
  const byte = (c: { r: number; g: number; b: number }) =>
    [c.r, c.g, c.b].map(x => Math.round(x * 255));
  for (const bg of ["#f4efe6", "#10203080", "#00000000"]) {
    const view = { ...stringsView, bg };
    const { nodes } = figmaStringsNodes(view) as { nodes: Node[]; blobs: Uint8Array[] };
    const m = stringsScene(palette, view, box);
    const kids = kidsOf(nodes, nodes[2]);
    const ground = kids.find(n => n.name === "ground");
    if (m.alpha === 0) expect(ground, bg).toBeUndefined();
    else {
      expect(ground, bg).toMatchObject({ type: "RECTANGLE", size: { x: 1200, y: 800 } });
      expect(byte(ground!.fillPaints[0].color)).toEqual(byte(figmaColor(bg.slice(0, 7))));
      expect(ground!.fillPaints[0].opacity).toBeCloseTo(m.alpha, 6);
    }
    /* the threads' group follows it, or stands first where there is no ground */
    const group = kids.find(n => n.name === "strings")!;
    expect(kids.indexOf(group)).toBe(m.alpha === 0 ? 0 : 1);
    const vectors = kidsOf(nodes, group);
    for (const vector of vectors)
      expect(byte(vector.fillPaints[0].color)).toEqual(
        byte(figmaColor(stringsHex(m, Number(vector.name.slice(7)))))
      );
    parentsFirst(nodes);
  }
});

test("each thread's outline fills by the odd rule all its loops go round, no overlap left a hole, and its length times its width", () => {
  let rings = 0;
  /* as designed, and a look whose hairpins' legs overlap: its sides, each carried a half width alone, overlap in 7
     threads, leaving holes of up to 2.7 px2 (5 Nov 2026) */
  for (const look of [{}, { angle: 135, shape: 464 }]) {
    const view = { ...stringsView, ...look };
    const { nodes, blobs } = figmaStringsNodes(view) as { nodes: Node[]; blobs: Uint8Array[] };
    const m = stringsScene(palette, view, box);
    const threads = stringsThreads(m);
    for (const vector of nodes.filter(n => n.type === "VECTOR")) {
      const loops = networkLoops(blobs[vector.vectorData.vectorNetworkBlob]);
      const { odd, nonzero } = fills(loops);
      /* the odd rule fills what the loops go round once: overlapping loops would leave a hole it fills not */
      expect(Math.abs(odd - nonzero)).toBeLessThan(0.05);
      /* a stroke's area is its length times its width, less where a hairpin's legs overlap, more at a round join (5
         Nov 2026, 3750 threads of 44 looks at 1920 by 1080 and others: within 1.6%) */
      const d = threads.get(Number(vector.name.slice(7)))!;
      expect(Math.abs(odd / (pathLength(d) * m.lw) - 1)).toBeLessThan(0.03);
      /* a closed thread's ring: its inner loop runs round the other way, a hole */
      const turns = flattened(loops).map(p =>
        p.reduce(
          (a, q, i) => a + q[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * q[1],
          0
        )
      );
      if (/z/i.test(d) && turns.some(a => a < 0)) rings++;
      expect(turns.filter(a => a > 0).length).toBeGreaterThan(0);
    }
  }
  expect(rings).toBeGreaterThan(0);
});

test("a thread bent tighter than half its width, its legs within a width to their ends, its tip overshot by the fit, or a ring too small for a hole: outlined as its stroke covers it, once", () => {
  const hw = 1.5;
  const once = (d: string) => {
    const loops = figmaStringsOutline(d, hw);
    const { odd, nonzero } = fills(loops);
    expect(Math.abs(odd - nonzero)).toBeLessThan(0.05);
    return { loops, area: odd };
  };
  /* a hairpin 0.6 px wide, its legs within a width of each other to their butt ends: the 3.6 px band they cover, the
     longer leg's last 0.4 px, and the tip's half disc, 76.9 px2, where each leg's own outline would give 121.6 */
  const hairpin = once("M-.3 20L-.3 0C-.3-.4 .3-.4 .3 0L.3 19.6");
  expect(hairpin.loops).toHaveLength(1);
  expect(
    Math.abs(hairpin.area / (3.6 * 19.6 + 3 * 0.4 + (Math.PI * 1.8 ** 2) / 2) - 1)
  ).toBeLessThan(0.01);
  /* two sharp corners, each a round join outside and the legs' edges meeting inside */
  once("M-6 15L-.1 0 .1 0 6 15");
  /* a cubic the fit overshot at a hairpin's tip (5 Nov 2026, angle 210, shape 458): its stroke's round end stays */
  const tip = once("M5.1 3.5L8.2 4.7C9.2 5.1 12 6.5 11.1 6L8 8.8C7 8.9 3 8.6 2 8.6");
  expect(fillsPoint(tip.loops, 12.5, 6.1)).toBe(true);
  expect(fillsPoint(tip.loops, 13, 6.1)).toBe(false);
  /* a ring of radius 4 leaves a hole of 2.5; one of 0.8 none, its disc of 2.3 whole (within the fit's 0.08 px round
     its 14 px, 7%) */
  const circle = (r: number) => {
    const k = 0.5523 * r;
    return `M${r} 0C${r} ${k} ${k} ${r} 0 ${r}C${-k} ${r} ${-r} ${k} ${-r} 0C${-r} ${-k} ${-k} ${-r} 0 ${-r}C${k} ${-r} ${r} ${-k} ${r} 0z`;
  };
  const ring = once(circle(4));
  expect(ring.loops).toHaveLength(2);
  expect(Math.abs(ring.area / (Math.PI * (5.5 ** 2 - 2.5 ** 2)) - 1)).toBeLessThan(0.01);
  expect(fillsPoint(ring.loops, 0, 0)).toBe(false);
  const dot = once(circle(0.8));
  expect(dot.loops).toHaveLength(1);
  expect(Math.abs(dot.area / (Math.PI * 2.3 ** 2) - 1)).toBeLessThan(0.04);
  expect(fillsPoint(dot.loops, 0, 0)).toBe(true);
});
