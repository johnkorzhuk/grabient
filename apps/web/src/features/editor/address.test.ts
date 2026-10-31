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

/* An effect's address says only what its picture shows: its style, the angle, the size and how it plays, never the
   gradient's steps; a speed of 0 holds its first frame and stays. */
test.each([
  [`/${SEED}?style=glass&steps=12`, `/${SEED}?style=glass`],
  [
    `/${SEED}?fps=60&speed=1.6&angle=77&style=glass`,
    `/${SEED}?style=glass&angle=77&speed=1.6&fps=60`
  ],
  [`/${SEED}?style=glass&speed=0`, `/${SEED}?style=glass&speed=0`],
  [`/${SEED}?style=glass&speed=1&fps=0`, `/${SEED}?style=glass`],
  [`/${SEED}?style=glass&speed=99&fps=240`, `/${SEED}?style=glass&speed=10&fps=60`],
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
  expect(
    canonicalSeedAddress(`/${SEED}?style=blob&shape=7&frost=1.5&fill=1&depth=0&bg=%23aabbcc`)
  ).toBe(`/${SEED}?style=blob&depth=0&fill=1&frost=1.5&shape=7&bg=%23aabbcc`);
});
