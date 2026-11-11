import { encodePalette } from "@grabient/engine/codec.ts";
import { blobShapeOf, EFFECT_LOOK, type Effect } from "@grabient/engine/effect.ts";
import { flush } from "solid-js";
import { expect, test } from "vitest";
import {
  AS_SAVED,
  cardEffect,
  createAppearance,
  drawnIn,
  inOrder,
  inView,
  type ListView,
  listViewOf,
  lookEffect,
  lookFinish,
  readListView,
  shownEffect,
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
  look: { shape: null, frost: 1.5, bg: "#112233", steps: null, zoom: null, path: null }
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
    effect: {
      kind: "blob",
      speed: 10,
      fps: 60,
      look: { shape: null, frost: 2, bg: null, steps: null, zoom: null, path: null }
    }
  });
});

test("the sandstone's steps are its look's on a list, in the gradients' steps' place; another effect's address leaves them", () => {
  const strata = readListView({ style: "strata", steps: 12, angle: 45 });
  expect(strata.steps).toBe("auto");
  expect(strata.effect?.look.steps).toBe(12);
  /* written where a gradient's steps stand, right after the style, and read back */
  expect(inView("/palettes", strata)).toBe("/palettes?style=strata&steps=12&angle=45");
  expect(listViewOf(new URLSearchParams("style=strata&steps=12"))).toEqual(
    readListView({ style: "strata", steps: 12 })
  );
  expect(inOrder({ q: "sea", angle: 45 }, viewParams({ effect: strata.effect }))).toEqual({
    q: "sea",
    style: "strata",
    steps: 12,
    angle: 45,
    soft: undefined,
    grain: undefined,
    size: undefined,
    speed: undefined,
    fps: undefined,
    frost: undefined,
    bg: undefined,
    selection: undefined
  });
  /* its designed steps leave the address; one past its range comes within it */
  expect(readListView({ style: "strata", steps: 28 }).effect?.look.steps).toBeNull();
  expect(readListView({ style: "strata", steps: 99 }).effect?.look.steps).toBe(40);
  expect(inView("/palettes", readListView({ style: "strata", steps: 28 }))).toBe(
    "/palettes?style=strata"
  );
  /* another effect takes none, and a gradient's steps stay the gradient's */
  expect(readListView({ style: "papercut", steps: 12 }).effect?.look.steps).toBeNull();
  expect(inView("/palettes", readListView({ style: "papercut", steps: 12 }))).toBe(
    "/palettes?style=papercut"
  );
  expect(inView("/palettes", readListView({ style: "linearSwatches", steps: 12 }))).toBe(
    "/palettes?style=linearSwatches&steps=12"
  );
  /* turned from the sandstone to the papercut, its steps leave with it */
  const papercut = readListView({ style: "papercut" }).effect;
  expect(papercut?.kind).toBe("papercut");
  expect(viewParams({ effect: papercut }).steps).toBeUndefined();
  /* a card plays the list's steps, and a list returned to takes a change of them made since */
  expect(cardEffect(strata.effect!, SEED).look.steps).toBe(12);
  const at20 = readListView({ style: "strata", steps: 20 });
  expect(viewSince(strata, strata, at20).effect?.look.steps).toBe(20);
  expect(viewSince(strata, at20, at20).effect?.look.steps).toBe(12);
});

test("a list's address, or a card's saved look, that names an effect the site plays no more plays none, as any word that is no style", () => {
  /* the zen garden (style=zen) was a field effect on staging from 8 to 10 Nov 2026 */
  for (const style of ["zen", "wobble"]) {
    /* the list draws every palette as saved, but for what else its address says, read as a gradient's */
    expect(readListView({ style, steps: 12, angle: 45, speed: 2 }), style).toEqual({
      ...AS_SAVED,
      steps: 12,
      angle: 45
    });
    expect(inView("/palettes", readListView({ style, steps: 12 })), style).toBe(
      "/palettes?steps=12"
    );
    /* a card whose save kept it draws its palette's gradient, with the soft and the grain the save kept */
    expect(lookEffect(SEED, `style=${style}&angle=45&shape=7`), style).toBeNull();
    expect(lookFinish(`style=${style}&soft=30&grain=20`), style).toEqual({ soft: 30, grain: 20 });
  }
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

test("the strings take the list's ground, every card on it: read, written after their look and read back", () => {
  const strings = readListView({ style: "strings", angle: 30, bg: "#f4efe680", shape: 12 });
  expect(strings.effect).toEqual({
    kind: "strings",
    speed: 1,
    fps: 60,
    look: { shape: null, frost: 1, bg: "#f4efe680", steps: null, zoom: null, path: null }
  });
  expect(inView("/palettes", strings)).toBe("/palettes?style=strings&angle=30&bg=%23f4efe680");
  expect(listViewOf(new URLSearchParams("style=strings&angle=30&bg=%23f4efe680"))).toEqual(strings);
  /* a clear one, and none, their designed one */
  expect(readListView({ style: "strings", bg: "#00000000" }).effect?.look.bg).toBe("#00000000");
  expect(readListView({ style: "strings" }).effect?.look.bg).toBeNull();
  /* every card plays the list's ground, in its palette's own shape */
  expect(cardEffect(strings.effect!, SEED).look.bg).toBe("#f4efe680");
  /* turned to an effect that takes none, the ground leaves with it */
  expect(readListView({ style: "silk", bg: "#f4efe6" }).effect?.look.bg).toBeNull();
  expect(viewParams({ effect: readListView({ style: "silk" }).effect }).bg).toBeUndefined();
});

test("a list's aurora stands upright on every card where the list sets no angle, and at the angle it sets", () => {
  /* a palette saved at 45 degrees: a list that leaves the angle to each palette turns its gradient and every other
     effect by it, and plays the aurora at 90 (John, 11 Nov 2026: "make auto 90 deg for this one") */
  const own = { seed: SEED, style: "linearGradient", steps: 7, angle: 45 } as const;
  const playing = (query: Record<string, unknown>) => readListView(query);
  expect(drawnIn(own, playing({ style: "aurora" })).angle).toBe(90);
  expect(drawnIn(own, playing({ style: "silk" })).angle).toBe(45);
  expect(drawnIn(own, playing({})).angle).toBe(45);
  /* an angle the list sets turns the aurora as any other effect */
  expect(drawnIn(own, playing({ style: "aurora", angle: 30 })).angle).toBe(30);
  /* while the menu sets the list's effect or its angle, the cards draw it at once */
  const aurora = playing({ style: "aurora" }).effect;
  expect(drawnIn(own, playing({}), { effect: aurora }).angle).toBe(90);
  expect(drawnIn(own, playing({ style: "aurora" }), { effect: null }).angle).toBe(45);
  expect(drawnIn(own, playing({ style: "aurora" }), { angle: 200 }).angle).toBe(200);
  expect(drawnIn(own, playing({ style: "aurora", angle: 30 }), { angle: "auto" }).angle).toBe(90);
});

test("a picture lies as what it shows lies: an effect a tile previews at its own Auto, a gradient at the palette's own, whatever the list plays", () => {
  /* John, 11 Nov 2026, of the aurora's Auto on staging: "i dont see it in staging". A list that plays no aurora
     previewed it on every card at the palette's own angle while the pointer rested on its tile, on its side for a
     palette saved at 0 or 180, and stood it upright only once it was chosen */
  const own = { seed: SEED, style: "linearGradient", steps: 7, angle: 45 } as const;
  const playing = (query: Record<string, unknown>) => readListView(query);
  const aurora = playing({ style: "aurora" }).effect;
  const silk = playing({ style: "silk" }).effect;
  /* the aurora previewed stands upright on a list as saved, on one in a style and on one that plays another effect */
  expect(drawnIn(own, playing({}), null, undefined, aurora).angle).toBe(90);
  expect(drawnIn(own, playing({ style: "radialSwatches" }), null, undefined, aurora).angle).toBe(
    90
  );
  expect(drawnIn(own, playing({ style: "silk" }), null, undefined, aurora).angle).toBe(90);
  /* and another effect previewed on a list that plays the aurora turns with the palette, as it will once chosen */
  expect(drawnIn(own, playing({ style: "aurora" }), null, undefined, silk).angle).toBe(45);
  /* a gradient's picture under a list that plays the aurora lies at the palette's own */
  expect(drawnIn(own, playing({ style: "aurora" }), null, undefined, null).angle).toBe(45);
  /* an angle the list sets, or one being set, is every picture's */
  expect(drawnIn(own, playing({ angle: 30 }), null, undefined, aurora).angle).toBe(30);
  expect(drawnIn(own, playing({ style: "aurora", angle: 30 }), null, undefined, null).angle).toBe(
    30
  );
  expect(drawnIn(own, playing({}), { angle: 200 }, undefined, aurora).angle).toBe(200);
  /* with nothing said of what it shows, the list's own effect turns it, as before */
  expect(drawnIn(own, playing({ style: "aurora" }), null, undefined, undefined).angle).toBe(90);
});

test("the aurora takes the list's path, every card behind it: read, written among its look as a word, and read back", () => {
  const walled = "line,0:30,20:30,20:55,35:55,35:38,100:38";
  const aurora = readListView({
    style: "aurora",
    angle: 30,
    path: walled,
    bg: "#102030",
    shape: 12
  });
  expect(aurora.effect).toEqual({
    kind: "aurora",
    speed: 1,
    fps: 60,
    look: { shape: null, frost: 1, bg: "#102030", steps: null, zoom: null, path: walled }
  });
  /* a path in another spelling is kept in its one spelling; the designed range and words that are no path are none */
  expect(readListView({ style: "aurora", path: "line,33.0,33" }).effect?.look.path).toBe(
    "line,33,33"
  );
  expect(readListView({ style: "aurora", path: "mountains" }).effect?.look.path).toBeNull();
  expect(readListView({ style: "aurora" }).effect?.look.path).toBeNull();
  /* written as a word, its commas and colons as they are, after how it plays and before its ground */
  expect(viewParams({ effect: aurora.effect })).toMatchObject({
    style: "aurora",
    path: walled,
    bg: "#102030"
  });
  const order = Object.entries(
    inOrder({ q: "sea", page: 2 }, viewParams({ style: "auto", effect: aurora.effect }))
  )
    .filter(([, value]) => value !== undefined)
    .map(([name]) => name);
  expect(order).toEqual(["q", "style", "path", "bg", "page"]);
  expect(inView("/palettes", aurora)).toBe(
    `/palettes?style=aurora&angle=30&path=${encodeURIComponent(walled)}&bg=%23102030`
  );
  expect(
    listViewOf(new URLSearchParams(`style=aurora&angle=30&path=${walled}&bg=%23102030`))
  ).toEqual(aurora);
  /* every card plays behind the list's path */
  expect(cardEffect(aurora.effect!, SEED).look.path).toBe(walled);
  /* a change of path alone is a choice of the list's look */
  const other = readListView({ style: "aurora", angle: 30, path: "line,33,33", bg: "#102030" });
  expect(viewSince(AS_SAVED, aurora, other).effect?.look.path).toBe("line,33,33");
  /* turned to an effect that takes none, the path leaves with it */
  expect(readListView({ style: "silk", path: walled }).effect?.look.path).toBeNull();
  expect(viewParams({ effect: readListView({ style: "silk" }).effect }).path).toBeUndefined();
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

test("the blob takes no soft: an address's soft is left while it plays, and a save's with it is none", () => {
  expect(readListView({ style: "blob", soft: 30, grain: 20 })).toEqual(
    readListView({ style: "blob", grain: 20 })
  );
  expect(listViewOf(new URLSearchParams("style=blob&soft=30")).soft).toBe(0);
  expect(inView("/palettes", { ...AS_SAVED, soft: 30, grain: 20, effect: BLOB })).toBe(
    "/palettes?style=blob&grain=20&frost=1.5&bg=%23112233"
  );
  // a turn to the blob takes the soft away; the glass keeps one
  expect(viewParams({ style: "auto", effect: BLOB })).toMatchObject({ soft: undefined });
  expect(inView("/palettes", { ...AS_SAVED, soft: 30, effect: GLASS })).toBe(
    "/palettes?style=glass&soft=30&speed=0.5&fps=30"
  );
  // a pasted blob's link leaves the list's soft out too
  const pasted = listViewOf(new URLSearchParams("style=blob"));
  expect(viewOver({ ...AS_SAVED, soft: 30 }, pasted).soft).toBe(0);
  // and a blob a save kept with a soft is drawn with none
  expect(lookFinish("style=blob&soft=35&grain=20&shape=3")).toEqual({ grain: 20 });
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

test("an effect's tile rested on plays the effect on the cards over the view's, and a style's preview takes its place", () => {
  const silk: Effect = { kind: "silk", speed: 1, fps: 60, look: EFFECT_LOOK };
  const glass: Effect = { kind: "glass", speed: 1, fps: 60, look: EFFECT_LOOK };
  const view = { ...AS_SAVED, effect: glass };
  expect(shownEffect(view, null, null, silk)).toBe(silk);
  expect(shownEffect(view, { effect: null }, null, silk)).toBe(silk);
  expect(shownEffect(view, null, "radialGradient", silk)).toBeNull();
  expect(shownEffect(view, null, null)).toBe(glass);
  const look = createAppearance(() => null);
  look.peekEffect(silk);
  flush();
  expect([look.peek(), look.peekedEffect()]).toEqual([null, silk]);
  look.setPeek("radialSwatches");
  flush();
  expect([look.peek(), look.peekedEffect()]).toEqual(["radialSwatches", null]);
  look.peekEffect(silk);
  look.setPeek(null);
  flush();
  expect([look.peek(), look.peekedEffect()]).toEqual([null, null]);
});
