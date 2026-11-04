import { QueryClient } from "@tanstack/solid-query";
import { afterEach, expect, test, vi } from "vitest";
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
  PUBLIC_TTL: 300_000,
  RISING_TTL: 60_000,
  failed: () => false,
  framesQuery: () => ({ queryKey: ["frames"], queryFn: () => ["1w"] }),
  homeHeadQuery: () => ({
    queryKey: ["head"],
    queryFn: () => ({ palettes: items, tier: "free" })
  }),
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

afterEach(() => {
  vi.useRealTimers();
});

const NOW = 1_800_000_000_000;
const keptFor = async (path: string, search = "") => {
  const place = galleryPlace(path, search);
  if (place?.kind !== "list") throw new Error("no list");
  return (await loadPalettes(new QueryClient(), place)).edge;
};

test("a list's page is kept at the edge until the moment its data goes stale in the browser, Rising's a minute", async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  page.fetchedAt = NOW - 20_000;
  expect(await keptFor("/palettes/rising")).toBe(40);
  expect(await keptFor("/palettes/rising/3m")).toBe(40);
  expect(await keptFor("/palettes")).toBe(280);
  // a search's answer stays fresh five minutes in every order
  expect(await keptFor("/palettes/rising", "?q=blue")).toBe(280);
  page.fetchedAt = NOW - 90_000;
  expect(await keptFor("/palettes/rising")).toBe(0);
  page.fetchedAt = 0;
});

test("the home, read as it is drawn, is kept as long as its reads stay fresh", async () => {
  const home = galleryPlace("/", "");
  if (home?.kind !== "home") throw new Error("no home");
  expect((await loadHome(new QueryClient(), home.params)).edge).toBe(300);
});
