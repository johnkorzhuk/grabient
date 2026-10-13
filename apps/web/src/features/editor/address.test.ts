import { expect, test } from "vitest";
import {
  canonicalSeedAddress,
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
