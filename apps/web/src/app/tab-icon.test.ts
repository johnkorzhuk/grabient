import { dominantColors } from "@grabient/engine/dominant.ts";
import { expect, test } from "vitest";
import { iconColors, iconHrefs, iconLinks, type Tab } from "./tab-icon.ts";

const SEED = "kS7Q8Yy5S_SChv0";
const OTHERS = ["kS7CQ31Do6asvY-", "kSa1cV2jbUEYgzi"];
/* the palette along its curve at sixteen points */
const ALONG = [
  "#f6e4e0",
  "#efdad5",
  "#e5cdc8",
  "#d9beb8",
  "#ccada6",
  "#be9b94",
  "#b18a83",
  "#a47a73",
  "#986b64",
  "#8b5b55",
  "#7d4b45",
  "#703b36",
  "#632c28",
  "#571e1c",
  "#4d1112",
  "#46070b"
];
const tab = (over: Partial<Tab>): Tab => ({
  frame: "app",
  path: "/",
  words: "",
  seeds: [],
  ...over
});

test("a palette's page wears the palette along its whole curve", () => {
  expect(iconColors(tab({ path: `/${SEED}`, seeds: [SEED] }))).toEqual(ALONG);
});

test("a collection's page and a search wear the colors their palettes share most", () => {
  const seeds = [SEED, ...OTHERS];
  const shared = dominantColors(seeds);
  expect(shared.length).toBeGreaterThan(0);
  expect(iconColors(tab({ path: "/ocean-depths", seeds }))).toEqual(shared);
  expect(iconColors(tab({ path: "/@ada/warm-sunsets/rising", seeds }))).toEqual(shared);
  expect(iconColors(tab({ path: "/palettes", words: "blue", seeds }))).toEqual(shared);
  expect(iconColors(tab({ path: "/", words: "sunset", seeds }))).toEqual(shared);
});

test("a search by a palette wears that palette", () => {
  expect(iconColors(tab({ path: "/palettes/rising", words: SEED, seeds: OTHERS }))).toEqual(ALONG);
});

test("a list at its own address, a brand page and a page that paints nothing wear the week's", () => {
  const seeds = [SEED, ...OTHERS];
  for (const path of ["/", "/palettes", "/palettes/rising/3m", "/palettes/saved", "/collections"])
    expect([path, iconColors(tab({ path, seeds }))]).toEqual([path, []]);
  expect(iconColors(tab({ frame: "brand", path: "/about", seeds: [SEED] }))).toEqual([]);
  expect(iconColors(tab({ frame: "sheet", path: "/login", seeds: [SEED] }))).toEqual([]);
  expect(iconColors(tab({ path: "/no-such-collection" }))).toEqual([]);
});

test("the week's icon is two files at the week's own address, named by their picture", () => {
  expect(iconHrefs([], "2026-w40")).toEqual({
    light: "/favicon/2026-w40.svg?v=s7042r",
    dark: "/favicon/2026-w40-dark.svg?v=s7042r"
  });
  expect(iconHrefs([], "2026-w42")).toEqual({
    light: "/favicon/2026-w42.svg?v=12n5k8d",
    dark: "/favicon/2026-w42-dark.svg?v=12n5k8d"
  });
});

test("a page's colors are drawn as data addresses, one for each scheme", () => {
  const drawn =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3ClinearGradient id='b'%3E%3Cstop offset='0' stop-color='%23ff0080'/%3E%3Cstop offset='1' stop-color='%2340e0d0'/%3E%3C/linearGradient%3E%3Crect y='24' width='32' height='8' fill='url(%23b)'/%3E%3C/svg%3E";
  expect(iconHrefs(["#ff0080", "#40e0d0"], "2026-w42")).toEqual({ light: drawn, dark: drawn });
});

test("the head names a light icon and a dark one", () => {
  const links = iconLinks(
    tab({ path: "/about", frame: "brand" }),
    Date.parse("2026-10-12T12:00:00Z")
  );
  expect(links).toEqual([
    {
      rel: "icon",
      href: "/favicon/2026-w42.svg?v=12n5k8d",
      type: "image/svg+xml",
      sizes: "any",
      media: "(prefers-color-scheme: light)"
    },
    {
      rel: "icon",
      href: "/favicon/2026-w42-dark.svg?v=12n5k8d",
      type: "image/svg+xml",
      sizes: "any",
      media: "(prefers-color-scheme: dark)"
    }
  ]);
  expect(
    iconLinks(tab({ path: `/${SEED}`, seeds: [SEED] })).map(link => link.href.slice(0, 19))
  ).toEqual(["data:image/svg+xml,", "data:image/svg+xml,"]);
});
