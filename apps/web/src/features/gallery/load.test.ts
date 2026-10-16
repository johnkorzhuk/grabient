import { QueryClient } from "@tanstack/solid-query";
import { expect, test, vi } from "vitest";
import { paletteAddress } from "../../lib/page-meta.ts";
import { galleryPlace } from "./address.ts";
import { loadHome, loadPalettes } from "./load.ts";

/* The gallery's loaders over reads already answered: the addresses they hand the page's structured data are the ones
   the cards link, each palette in the view it was saved in. */

const items = vi.hoisted(() => [
  { kseed: "kS7Q8Yy5S_SChv0", style: "linearSwatches", steps: 9, angle: 45 },
  { kseed: "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ", style: "linearGradient", steps: 8, angle: 90 }
]);
const page = vi.hoisted(() => ({
  items,
  totalPages: 1,
  fetchedAt: 0,
  indexable: true,
  tier: "free"
}));
vi.mock("./sources.ts", () => ({
  pageQuery: () => ({ options: { queryKey: ["page"], queryFn: () => page } }),
  keptPage: () => page
}));
vi.mock("./queries.ts", () => ({
  failed: () => false,
  framesQuery: () => ({ queryKey: ["frames"], queryFn: () => ["1w"] }),
  homeHeadQuery: () => ({ queryKey: ["head"], queryFn: () => ({ palettes: items, tier: "free" }) }),
  homeCollectionsQuery: () => ({
    queryKey: ["home-collections"],
    queryFn: () => ({ items: [], totalPages: 1 })
  })
}));
vi.mock("./drawing.ts", () => ({ paintOf: () => [], homePaint: () => [] }));

const addresses = items.map(item =>
  paletteAddress(item.kseed, item as Parameters<typeof paletteAddress>[1])
);

test("a list and the home hand on each palette at the address its card links, the view it was saved in", async () => {
  expect(addresses[0]).toBe("/kS7Q8Yy5S_SChv0?style=linearSwatches&steps=9&angle=45");
  const list = galleryPlace("/palettes", "");
  if (list?.kind !== "list") throw new Error("no list");
  expect((await loadPalettes(new QueryClient(), list)).palettes).toEqual(addresses);
  const home = galleryPlace("/", "");
  if (home?.kind !== "home") throw new Error("no home");
  expect((await loadHome(new QueryClient(), home.params)).palettes).toEqual(addresses);
});
