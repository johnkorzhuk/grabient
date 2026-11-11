import { blobShapeOf } from "@grabient/engine/effect.ts";
import { expect, test } from "vitest";
import {
  canonicalSeedAddress,
  isSeed,
  openedFrom,
  readSeedPage,
  sameAddress,
  seedAddress,
  seedSearch
} from "./address.ts";
import { lookQuery, readLook } from "./look.ts";

const SEED = "kS7Q8Yy5S_SChv0";
const EIGHT = "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ";

test.each([
  [`/${SEED}?steps=7&angle=90`, `/${SEED}`],
  [`/${SEED}?size=0100x0100&lock=hue,lightness`, `/${SEED}?size=100x100&lock=lightness,hue`],
  [`/${SEED}?angle=105&style=radialSwatches&junk=1`, `/${SEED}?style=radialSwatches&angle=105`],
  [`/${SEED}?view=3d&graph=big`, `/${SEED}`],
  [`/${SEED}?steps=2`, `/${SEED}?steps=3`],
  [`/${EIGHT}`, `/${EIGHT}?steps=8`],
  [
    `/${SEED}?selection&lock=chroma&unlock=hue,chroma`,
    `/${SEED}?lock=chroma&unlock=chroma,hue&selection`
  ],
  [`/${SEED}?size=autoxauto`, `/${SEED}`]
])("%s is answered at %s", (address, canonical) =>
  expect(canonicalSeedAddress(address)).toBe(canonical)
);

test("a canonical address, or the router's spelling of one, stays as it is", () => {
  expect(canonicalSeedAddress(`/${SEED}?steps=3`)).toBe(`/${SEED}?steps=3`);
  const spelled = `/${SEED}?lock=lightness%2Chue&selection=`;
  expect(canonicalSeedAddress(spelled)).toBe(spelled);
  expect(sameAddress(spelled, `/${SEED}?lock=lightness,hue&selection`)).toBe(true);
  // campaign tags say where a reader came from, nothing of the page
  expect(sameAddress(`/${SEED}?utm_source=news&steps=3&gclid=x`, `/${SEED}?steps=3`)).toBe(true);
  expect(sameAddress(`/${SEED}?utm_source=news&steps=3`, `/${SEED}?steps=4`)).toBe(false);
});

test("anything but a seed is another rule's", () => {
  expect(canonicalSeedAddress("/ocean-gradients")).toBeNull();
  expect(canonicalSeedAddress("/kAAA")).toBeNull();
  expect(canonicalSeedAddress(`/${SEED}/rising`)).toBeNull();
  expect(canonicalSeedAddress("/palettes?q=blue")).toBeNull();
});

test("the router's search object keeps the canonical order", () => {
  const page = readSeedPage(SEED, new URLSearchParams("selection&angle=45&steps=9&lock=hue"));
  expect(page && seedSearch(page)).toEqual({ steps: 9, angle: 45, lock: "hue", selection: "" });
  expect(page && Object.keys(seedSearch(page))).toEqual(["steps", "angle", "lock", "selection"]);
  expect(page && seedAddress(page)).toBe(`/${SEED}?steps=9&angle=45&lock=hue&selection`);
});

test("an effect's address keeps the soft and the grain, after its angle", () => {
  const glass = readSeedPage(
    SEED,
    new URLSearchParams("grain=12&style=glass&soft=40&angle=45&speed=2")
  );
  expect(glass && seedAddress(glass)).toBe(
    `/${SEED}?style=glass&angle=45&soft=40&grain=12&speed=2`
  );
  expect(glass && seedSearch(glass)).toMatchObject({ soft: 40, grain: 12 });
  /* the blob has no angle: they follow its style */
  const blob = readSeedPage(SEED, new URLSearchParams("style=blob&grain=5&shape=3"));
  expect(blob && seedAddress(blob)).toBe(`/${SEED}?style=blob&grain=5&shape=3`);
});

test("a blob takes no soft: its address leaves out any it is given, and its page reads none", () => {
  expect(canonicalSeedAddress(`/${SEED}?style=blob&soft=40&grain=5&shape=3`)).toBe(
    `/${SEED}?style=blob&grain=5&shape=3`
  );
  expect(readSeedPage(SEED, new URLSearchParams("style=blob&soft=40&shape=3"))?.view.soft).toBe(
    undefined
  );
  /* the editor keeps the reader's soft while the blob plays, to give back to the others */
  const view = { style: "linearGradient", steps: 7, angle: 90, soft: 40 } as const;
  const blob = readSeedPage(SEED, new URLSearchParams("style=blob&shape=3"))?.effect;
  expect(seedAddress({ seed: SEED, view, effect: blob })).toBe(`/${SEED}?style=blob&shape=3`);
  expect(seedAddress({ seed: SEED, view, effect: null })).toBe(`/${SEED}?soft=40`);
});

test("the sandstone keeps its steps in its address and its look, 8 to 40, none at its designed 28; every other effect drops them", () => {
  for (const [address, canonical] of [
    [`/${SEED}?steps=12&style=strata`, `/${SEED}?style=strata&steps=12`],
    [`/${SEED}?style=strata&steps=28`, `/${SEED}?style=strata`],
    [`/${SEED}?style=strata&steps=3`, `/${SEED}?style=strata&steps=8`],
    [`/${SEED}?style=strata&steps=400`, `/${SEED}?style=strata&steps=40`],
    [`/${SEED}?style=strata&steps=twelve`, `/${SEED}?style=strata`],
    [
      `/${SEED}?style=strata&shape=7&speed=2&steps=12&angle=30&soft=20`,
      `/${SEED}?style=strata&angle=30&soft=20&speed=2&steps=12&shape=7`
    ],
    [`/${SEED}?style=papercut&steps=12`, `/${SEED}?style=papercut`],
    [`/${SEED}?style=glass&steps=12&shape=3`, `/${SEED}?style=glass&shape=3`]
  ])
    expect(canonicalSeedAddress(address), address).toBe(canonical);
  /* its steps are its look's, never the gradient's the editor keeps under it to give back */
  const page = readSeedPage(SEED, new URLSearchParams("style=strata&steps=12"))!;
  expect(page.effect?.look.steps).toBe(12);
  expect(page.view.steps).toBe(7);
  expect(seedSearch(page)).toEqual({ style: "strata", steps: 12 });
  expect(readSeedPage(SEED, new URLSearchParams("style=strata"))?.effect?.look.steps).toBeNull();
  expect(
    readSeedPage(SEED, new URLSearchParams("style=papercut&steps=12"))?.effect?.look.steps
  ).toBeNull();
  /* a save keeps them in its look, and reads them back */
  expect(lookQuery(page.view, page.effect ?? null)).toBe("style=strata&steps=12");
  expect(readLook(SEED, "style=strata&steps=12")?.effect?.look.steps).toBe(12);
  /* a gradient's steps are the gradient's, as they were */
  expect(readSeedPage(SEED, new URLSearchParams("style=linearSwatches&steps=12"))?.view.steps).toBe(
    12
  );
});

test("a style that names no gradient and no effect is none, an effect the site plays no more as any other word: the address is the palette's own", () => {
  /* the zen garden (style=zen) was a field effect on staging from 8 to 10 Nov 2026: an address that still names it
     plays nothing, and what else it says is read as a gradient's address reads it */
  for (const style of ["zen", "wobble"]) {
    const page = readSeedPage(SEED, new URLSearchParams(`style=${style}&shape=7&speed=2`));
    expect(page?.effect, style).toBeNull();
    expect(page?.view, style).toEqual({ style: "linearGradient", steps: 7, angle: 90 });
    expect(canonicalSeedAddress(`/${SEED}?style=${style}`), style).toBe(`/${SEED}`);
    expect(
      canonicalSeedAddress(`/${SEED}?style=${style}&steps=12&angle=30&grain=20&shape=7&speed=2`),
      style
    ).toBe(`/${SEED}?steps=12&angle=30&grain=20`);
  }
});

test("soft and grain stand in the router's search as numbers, which the router writes bare", () => {
  /* a string the router writes quoted (soft=%2240%22), which a reload reads as no number and the canonical address
     then leaves out */
  const page = readSeedPage(SEED, new URLSearchParams("grain=12&soft=40&style=linearSwatches"));
  expect(page && seedSearch(page)).toEqual({ style: "linearSwatches", soft: 40, grain: 12 });
  expect(page && seedAddress(page)).toBe(`/${SEED}?style=linearSwatches&soft=40&grain=12`);
  expect(canonicalSeedAddress(`/${SEED}?style=linearSwatches&soft=40&grain=12`)).toBe(
    `/${SEED}?style=linearSwatches&soft=40&grain=12`
  );
});

test("a seed is what decodes to a palette, never what only has a seed's shape", () => {
  expect(isSeed(SEED)).toBe(true);
  expect(isSeed(EIGHT)).toBe(true);
  // a collection's address may begin with k and be as long as a seed
  expect(isSeed("kerala-flower-carpet")).toBe(false);
  expect(isSeed("ocean-gradients")).toBe(false);
  expect(isSeed("_gH0gH0gH0gH0gH0gH0gPogPogPogAAgFNgKa")).toBe(false);
  expect(isSeed("")).toBe(false);
});

test("a card hands on the parts its page set, over the palette's own view", () => {
  const own = { style: "linearGradient", steps: 7, angle: 90 } as const;
  expect(openedFrom(own, { style: "auto", steps: "auto", angle: "auto" })).toBeUndefined();
  expect(openedFrom(own, { style: "radialSwatches", steps: "auto", angle: 45 })).toEqual({
    opened: { ...own, set: { style: true, steps: false, angle: true } }
  });
  // a part set to what the palette already has is still the reader's: Reset lets it go
  expect(openedFrom(own, { style: "auto", steps: 7, angle: "auto" })).toEqual({
    opened: { ...own, set: { style: false, steps: true, angle: false } }
  });
});

test("a card under an effect that stands upright hands on the palette's own angle, which its address cannot say", () => {
  /* a list that plays the aurora and sets no angle opens a palette at /{seed}?style=aurora, upright: handed its own
     angle over the view that address reads, the palette's page gives it back to a gradient chosen there */
  const saved = { style: "radialGradient", steps: 9, angle: 180 } as const;
  const none = { style: "auto", steps: "auto", angle: "auto" } as const;
  const aurora = readSeedPage(SEED, new URLSearchParams("style=aurora"))!;
  const silk = readSeedPage(SEED, new URLSearchParams("style=silk"))!.effect;
  expect(openedFrom(saved, { ...none, effect: aurora.effect })).toEqual({
    opened: {
      style: aurora.view.style,
      steps: aurora.view.steps,
      angle: 180,
      set: { style: false, steps: false, angle: false }
    }
  });
  /* nothing where the effect lies at the palette's own, which its address then names, or the palette lies at the
     effect's Auto already */
  expect(openedFrom(saved, { ...none, effect: silk })).toBeUndefined();
  expect(openedFrom({ ...saved, angle: 90 }, { ...none, effect: aurora.effect })).toBeUndefined();
  /* a part the page set is handed as ever, over the palette's own view */
  expect(openedFrom(saved, { ...none, angle: 30, effect: aurora.effect })).toEqual({
    opened: { ...saved, set: { style: false, steps: false, angle: true } }
  });
});

/* An effect's address says only what its picture shows: its style, the angle, the size, how it plays and its look,
   never the gradient's steps; a speed of 0 holds its first frame and stays, and 60 frames a second is no setting. */
test.each([
  [`/${SEED}?style=glass&steps=12`, `/${SEED}?style=glass`],
  [
    `/${SEED}?fps=30&speed=1.6&angle=77&style=glass`,
    `/${SEED}?style=glass&angle=77&speed=1.6&fps=30`
  ],
  [`/${SEED}?style=glass&fps=60`, `/${SEED}?style=glass`],
  [`/${SEED}?style=glass&speed=0`, `/${SEED}?style=glass&speed=0`],
  [`/${SEED}?style=glass&speed=1&fps=0`, `/${SEED}?style=glass`],
  [`/${SEED}?style=glass&speed=99&fps=240`, `/${SEED}?style=glass&speed=10&fps=120`],
  [`/${SEED}?style=glass&shape=0`, `/${SEED}?style=glass`],
  [`/${SEED}?shape=12&style=glass`, `/${SEED}?style=glass&shape=12`],
  // a shape is 0 to 999; a longer number names none, the glass as designed
  [`/${SEED}?style=glass&shape=999`, `/${SEED}?style=glass&shape=999`],
  [`/${SEED}?style=glass&shape=1000`, `/${SEED}?style=glass`],
  [`/${SEED}?style=glass&speed=0.04`, `/${SEED}?style=glass&speed=0.1`],
  [`/${SEED}?style=glass&size=400x300&lock=hue`, `/${SEED}?style=glass&size=400x300&lock=hue`],
  [`/${SEED}?speed=3&fps=24`, `/${SEED}`]
])("an effect: %s is answered at %s", (address, canonical) =>
  expect(canonicalSeedAddress(address)).toBe(canonical)
);

test("an address says whether it names a style, which one that names none leaves to the reader", () => {
  expect(readSeedPage(SEED, new URLSearchParams(""))).toMatchObject({
    effect: null,
    styled: false
  });
  expect(readSeedPage(SEED, new URLSearchParams("style=linearSwatches"))).toMatchObject({
    effect: null,
    styled: true
  });
  expect(readSeedPage(SEED, new URLSearchParams("style=glass&speed=0&fps=12"))).toMatchObject({
    effect: { kind: "glass", speed: 0, fps: 12 },
    styled: true
  });
});

test("the router keeps an effect's numbers as numbers, so it writes none of them quoted", () => {
  const page = readSeedPage(SEED, new URLSearchParams("style=glass&speed=1.5&fps=30&angle=45"));
  expect(page && seedSearch(page)).toEqual({ style: "glass", angle: 45, speed: 1.5, fps: 30 });
});

test("a blob always has a shape: the palette's own suggestion where its address names none", () => {
  const page = readSeedPage(SEED, new URLSearchParams("style=blob"));
  expect(page?.effect?.look.shape).toEqual(expect.any(Number));
  const shape = page?.effect?.look.shape;
  expect(canonicalSeedAddress(`/${SEED}?style=blob`)).toBe(`/${SEED}?style=blob&shape=${shape}`);
  // a shape is 0 to 999: a longer number names none, so the palette's own suggestion
  expect(canonicalSeedAddress(`/${SEED}?style=blob&shape=999`)).toBe(
    `/${SEED}?style=blob&shape=999`
  );
  expect(canonicalSeedAddress(`/${SEED}?style=blob&shape=1000`)).toBe(
    `/${SEED}?style=blob&shape=${shape}`
  );
  // its old depth and fill are no more, nor any angle, which the blob has none of; its ground keeps its alpha
  expect(
    canonicalSeedAddress(
      `/${SEED}?style=blob&shape=7&frost=1.5&fill=1&depth=0&bg=%23aabbcc80&angle=30`
    )
  ).toBe(`/${SEED}?style=blob&frost=1.5&shape=7&bg=%23aabbcc80`);
  // the glass keeps its angle
  expect(canonicalSeedAddress(`/${SEED}?style=glass&angle=30`)).toBe(
    `/${SEED}?style=glass&angle=30`
  );
  /* the strings keep a ground, after their shape, its alpha too, a clear one as the one clear ground; none is their
     designed ground; an effect that takes none leaves one out */
  expect(canonicalSeedAddress(`/${SEED}?bg=%23F4EFE6&style=strings&shape=7&angle=30`)).toBe(
    `/${SEED}?style=strings&angle=30&shape=7&bg=%23f4efe6`
  );
  expect(canonicalSeedAddress(`/${SEED}?style=strings&bg=%2310203080&soft=20`)).toBe(
    `/${SEED}?style=strings&soft=20&bg=%2310203080`
  );
  expect(canonicalSeedAddress(`/${SEED}?style=strings&bg=%23ff000000`)).toBe(
    `/${SEED}?style=strings&bg=%2300000000`
  );
  expect(canonicalSeedAddress(`/${SEED}?style=strings&bg=%2300000000`)).toBe(
    `/${SEED}?style=strings&bg=%2300000000`
  );
  expect(canonicalSeedAddress(`/${SEED}?style=silk&bg=%23f4efe6`)).toBe(`/${SEED}?style=silk`);
  expect(readSeedPage(SEED, new URLSearchParams("style=strings&bg=fff"))?.effect?.look.bg).toBe(
    "#ffffff"
  );
});

test("a save keeps a palette's whole look as its address writes it, and reads it back for the palette", () => {
  const look = (query: string) => {
    const page = readSeedPage(SEED, new URLSearchParams(query))!;
    return lookQuery(page.view, page.effect ?? null);
  };
  // an effect and its settings, in the canonical order, defaults left out; the size is no part of a look
  expect(look("speed=2&style=glass&shape=7&angle=30&size=1200x630")).toBe(
    "style=glass&angle=30&speed=2&shape=7"
  );
  expect(look("style=blob&frost=0.5&bg=%23101014&shape=12")).toBe(
    "style=blob&frost=0.5&shape=12&bg=%23101014"
  );
  expect(look("style=strings&bg=%23f4efe680&shape=12")).toBe(
    "style=strings&shape=12&bg=%23f4efe680"
  );
  // a gradient's view as the address writes it
  expect(look("style=radialSwatches&steps=9&angle=45")).toBe(
    "style=radialSwatches&steps=9&angle=45"
  );
  // read back: the same view and effect, which written again are the same look
  for (const query of [
    "style=glass&angle=30&speed=2&shape=7",
    "style=blob&frost=0.5&shape=12&bg=%23101014",
    "style=radialSwatches&steps=9&angle=45"
  ]) {
    const read = readLook(SEED, query)!;
    expect(lookQuery(read.view, read.effect)).toBe(query);
  }
  // a blob kept with no shape plays the palette's own, as its address does
  expect(readLook(SEED, "style=blob")?.effect?.look.shape).toBe(blobShapeOf(SEED));
  expect(readLook("nothing", "style=glass")).toBeNull();
});
