import { encodePalette } from "@grabient/engine/codec.ts";
import { blobShapeOf, EFFECT_LOOK, type Effect } from "@grabient/engine/effect.ts";
import { expect, test } from "vitest";
import {
  AS_SAVED,
  cardEffect,
  drawnIn,
  inOrder,
  inView,
  type ListView,
  listViewOf,
  lookFinish,
  readListView,
  viewOver,
  viewParams,
  viewSince
} from "./appearance.ts";

const SEED = encodePalette({
  anchors: Array.from({ length: 8 }, (_, i) => ({ l: 0.2 + i * 0.1, c: 0.1, h: i * 30 }))
});

test("a list's address sets each part of the view, or leaves it to every palette", () => {
  expect(readListView({})).toEqual(AS_SAVED);
  expect(readListView({ style: "radialSwatches", steps: 2, angle: 45, size: "1200x630" })).toEqual({
    style: "radialSwatches",
    steps: 3,
    angle: 45,
    soft: 0,
    grain: 0,
    size: { width: 1200, height: 630 },
    effect: null
  });
  /* soft and grain, 1 to 100 each; none of either is every palette as saved */
  expect(readListView({ soft: "40", grain: 15 })).toEqual({ ...AS_SAVED, soft: 40, grain: 15 });
  expect(readListView({ soft: "0", grain: 101 })).toEqual(AS_SAVED);
  expect(viewParams({ soft: 40, grain: 0 })).toEqual({ soft: 40, grain: undefined });
  expect(readListView({ style: "auto", steps: "12", angle: 361, size: "39x39" })).toEqual({
    ...AS_SAVED,
    steps: 12
  });
  expect(readListView({ steps: 101, angle: -1 })).toEqual(AS_SAVED);
});

test("a view as search params leaves out what each palette keeps", () => {
  expect(viewParams({ style: "auto", steps: 9, angle: "auto", size: null })).toEqual({
    style: undefined,
    steps: 9,
    angle: undefined,
    size: undefined
  });
  expect(viewParams({ size: { width: "auto", height: 630 } })).toEqual({ size: "autox630" });
  expect(inView("/palettes", { ...AS_SAVED, style: "linearSwatches", steps: 7 })).toBe(
    "/palettes?style=linearSwatches&steps=7"
  );
  expect(inView("/", AS_SAVED)).toBe("/");
});

test("a change to a list's address is written in the lists' one order", () => {
  const written = (search: Record<string, unknown>, change: Record<string, unknown>) =>
    Object.entries(inOrder(search, change))
      .filter(([, value]) => value !== undefined)
      .map(([name]) => name);
  expect(
    written({ q: "blue", page: 2, limit: 48 }, viewParams({ style: "angularSwatches" }))
  ).toEqual(["q", "style", "page", "limit"]);
  expect(written({ steps: 9, page: 2, selection: "" }, { size: "1200x630", angle: 45 })).toEqual([
    "steps",
    "angle",
    "size",
    "page",
    "selection"
  ]);
  expect(written({ q: "blue", style: "linearSwatches" }, viewParams({ style: "auto" }))).toEqual([
    "q"
  ]);
  expect(written({ page: 3 }, { selection: "" })).toEqual(["page", "selection"]);
});

test("a card draws the list's view over its own, a draft over both, never fewer steps than keyframes", () => {
  const own = { seed: SEED, style: "angularGradient" as const, steps: 12, angle: 10 };
  expect(drawnIn(own, AS_SAVED)).toEqual(own);
  expect(drawnIn(own, { ...AS_SAVED, style: "linearGradient", steps: 3 })).toEqual({
    ...own,
    style: "linearGradient",
    steps: 8
  });
  expect(drawnIn(own, { ...AS_SAVED, angle: 90 }, { angle: 200, steps: 20 })).toEqual({
    ...own,
    steps: 20,
    angle: 200
  });
});

test("a card draws the soft and the grain its save kept while its list draws every palette as saved", () => {
  const own = { seed: SEED, style: "linearGradient" as const, steps: 8, angle: 90 };
  const kept = lookFinish("style=silk&angle=40&soft=35&grain=20&speed=2");
  expect(kept).toEqual({ soft: 35, grain: 20 });
  expect(lookFinish("soft=12")).toEqual({ soft: 12 });
  expect(lookFinish(null)).toEqual({});
  expect(lookFinish("style=glass")).toEqual({});
  /* as saved, the kept ones */
  expect(drawnIn(own, AS_SAVED, null, kept)).toEqual({ ...own, soft: 35, grain: 20 });
  /* the list's own, where it sets one, and the draft's over both */
  expect(drawnIn(own, { ...AS_SAVED, soft: 60 }, null, kept)).toEqual({
    ...own,
    soft: 60,
    grain: 20
  });
  expect(drawnIn(own, AS_SAVED, { grain: 0 }, kept)).toEqual({ ...own, soft: 35 });
  /* a list that draws every palette in its own style or plays its own effect draws none it did not set */
  expect(drawnIn(own, { ...AS_SAVED, style: "radialGradient" }, null, kept)).toEqual({
    ...own,
    style: "radialGradient"
  });
  const glass: Effect = { kind: "glass", speed: 1, fps: 60, look: EFFECT_LOOK };
  expect(drawnIn(own, { ...AS_SAVED, effect: glass }, null, kept)).toEqual(own);
  expect(drawnIn(own, AS_SAVED, { effect: null }, kept)).toEqual(own);
});

test("a list returned to takes each choice made since it was left, a cleared one included, over its own address", () => {
  const radial: ListView = { ...AS_SAVED, style: "radialGradient" };
  const own: ListView = { ...AS_SAVED, steps: 5 };
  // Radial was chosen on another list: the steps this address names stay
  expect(viewSince(own, AS_SAVED, radial)).toEqual({ ...own, style: "radialGradient" });
  // nothing was chosen since: the address stands, whatever the tab remembers
  expect(viewSince(own, radial, radial)).toEqual(own);
  // the steps were let go elsewhere, and a size chosen
  const sized: ListView = { ...AS_SAVED, size: { width: 1200, height: 630 } };
  expect(viewSince(own, own, sized)).toEqual(sized);
  // no record of the leaving, as after a reload: the list takes the tab's view whole
  expect(viewSince(own, undefined, radial)).toEqual(radial);
});

const GLASS: Effect = { kind: "glass", speed: 0.5, fps: 30, look: EFFECT_LOOK };
const BLOB: Effect = {
  kind: "blob",
  speed: 1,
  fps: 60,
  look: { shape: null, frost: 1.5, bg: "#112233" }
};

test("an effect's style names it, with how it plays and looks, and the steps leave", () => {
  // as the router reads an address: numbers as numbers, the ground's # decoded
  expect(readListView({ style: "glass", steps: 9, angle: 45, speed: 0.5, fps: 30 })).toEqual({
    ...AS_SAVED,
    angle: 45,
    effect: GLASS
  });
  // a list plays each card's own shape, whatever the address says
  expect(
    readListView({ style: "blob", frost: 1.5, bg: "#112233", shape: 12, size: "1200x630" })
  ).toEqual({ ...AS_SAVED, size: { width: 1200, height: 630 }, effect: BLOB });
  // as the Worker reads one, each parameter as it stands first, out of bounds at its default
  expect(
    listViewOf(new URLSearchParams("style=blob&speed=99&fps=0&frost=7&bg=zz&style=glass"))
  ).toEqual({
    ...AS_SAVED,
    effect: { kind: "blob", speed: 10, fps: 60, look: { shape: null, frost: 2, bg: null } }
  });
});

test("an effect is written in the style's place, then the angle and size, how it plays, its frost and ground", () => {
  expect(inView("/palettes", { ...AS_SAVED, steps: 9, angle: 45, effect: GLASS })).toBe(
    "/palettes?style=glass&angle=45&speed=0.5&fps=30"
  );
  expect(inView("/", { ...AS_SAVED, size: { width: 1200, height: 630 }, effect: BLOB })).toBe(
    "/?style=blob&size=1200x630&frost=1.5&bg=%23112233"
  );
  // a gradient chosen takes the effect's parameters away with it, and an effect the steps
  expect(viewParams({ style: "radialGradient", effect: null })).toEqual({
    style: "radialGradient",
    speed: undefined,
    fps: undefined,
    frost: undefined,
    bg: undefined
  });
  expect(viewParams({ style: "auto", effect: GLASS })).toMatchObject({
    style: "glass",
    steps: undefined
  });
  const order = Object.entries(
    inOrder(
      { q: "sea", steps: 9, page: 2, selection: "" },
      viewParams({ style: "auto", effect: BLOB })
    )
  )
    .filter(([, value]) => value !== undefined)
    .map(([name]) => name);
  expect(order).toEqual(["q", "style", "frost", "bg", "page", "selection"]);
});

test("the blob has no angle: an address's angle is left while it plays, and the glass keeps its own", () => {
  expect(readListView({ style: "blob", angle: 30, frost: 1.5, bg: "#112233" })).toEqual(
    readListView({ style: "blob", frost: 1.5, bg: "#112233" })
  );
  expect(listViewOf(new URLSearchParams("style=blob&angle=30")).angle).toBe("auto");
  expect(inView("/palettes", { ...AS_SAVED, angle: 30, effect: BLOB })).toBe(
    "/palettes?style=blob&frost=1.5&bg=%23112233"
  );
  // a turn to the blob takes the angle away with the steps; a turn back to the glass leaves it to the palettes
  expect(viewParams({ style: "auto", effect: BLOB })).toMatchObject({ angle: undefined });
  expect(viewParams({ angle: 30 })).toEqual({ angle: 30 });
  expect(inView("/palettes", { ...AS_SAVED, angle: 30, effect: GLASS })).toBe(
    "/palettes?style=glass&angle=30&speed=0.5&fps=30"
  );
  // a pasted blob's link leaves the list's angle out too
  const pasted = listViewOf(new URLSearchParams("style=blob"));
  expect(viewOver({ ...AS_SAVED, angle: 30 }, pasted).angle).toBe("auto");
});

test("a card plays the list's effect in its own palette's shape, the one its link opens", () => {
  expect(cardEffect(GLASS, SEED)).toBe(GLASS);
  expect(cardEffect(BLOB, SEED).look).toEqual({ ...BLOB.look, shape: blobShapeOf(SEED) });
});

test("an effect chosen since a list was left is taken as one with the style, the list's steps kept", () => {
  const own: ListView = { ...AS_SAVED, style: "linearSwatches", steps: 5 };
  const glass: ListView = { ...AS_SAVED, effect: GLASS };
  expect(viewSince(own, AS_SAVED, glass)).toEqual({ ...own, style: "auto", effect: GLASS });
  // the glass's pace changed since: the effect is taken whole
  const slower: ListView = { ...glass, effect: { ...GLASS, speed: 0.2 } };
  expect(viewSince({ ...AS_SAVED, effect: GLASS }, glass, slower)).toEqual(slower);
  // nothing chosen since: the list's own look stands
  expect(viewSince(own, glass, glass)).toEqual(own);
});

test("a pasted link's look is taken where a list sets neither a style nor an effect", () => {
  const link: ListView = { ...AS_SAVED, steps: 9, effect: GLASS };
  expect(viewOver(AS_SAVED, link)).toEqual(link);
  const bands: ListView = { ...AS_SAVED, style: "linearSwatches" };
  expect(viewOver(bands, link)).toEqual({ ...bands, steps: 9 });
  expect(
    viewOver({ ...AS_SAVED, effect: BLOB }, { ...AS_SAVED, style: "radialGradient", steps: 9 })
  ).toEqual({
    ...AS_SAVED,
    effect: BLOB
  });
});

test("an effect a field steps to is read back as the address keeps it", () => {
  const stepped: Effect = {
    kind: "blob",
    speed: 0.45000000000000007,
    fps: 60,
    look: { ...EFFECT_LOOK, frost: 0.9500000000000001 }
  };
  expect(readListView(viewParams({ effect: stepped })).effect).toEqual({
    ...stepped,
    speed: 0.45,
    look: { ...EFFECT_LOOK, frost: 0.95 }
  });
});
