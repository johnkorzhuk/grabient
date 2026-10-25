import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { paletteFile } from "../../lib/page-meta.ts";
import {
  collectionsSitemap,
  MAX_SHARDS,
  pagesSitemap,
  paletteShard,
  palettesSitemap,
  searchesSitemap,
  sitemapHeaders,
  sitemapIndex
} from "./sitemaps.ts";

const golden = (name: string) =>
  readFileSync(new URL(`fixtures/sitemap-${name}.xml`, import.meta.url), "utf8");
const ORIGIN = "https://grabient.com";

describe("the sitemaps, as grabient.com serves them", () => {
  test("the index names the pages, the searches, the collections and each palette file", () => {
    expect(sitemapIndex(ORIGIN, 2)).toBe(golden("index.sample"));
  });

  test("the site's own pages are listed in every language, each naming the others, and Privacy, Terms and the newsletter in English", () => {
    const text = pagesSitemap(ORIGIN, true);
    expect(text).toBe(golden("pages.production"));
    expect(text.match(/<url>/g)).toHaveLength(9 * 16 + 3);
    for (const path of ["/ja/bindings", "/privacy", "/terms"])
      expect(text).toContain(`<loc>${ORIGIN}${path}</loc>`);
    expect(text).not.toContain("/ja/privacy");
  });

  test("the newsletter is listed once an admin has turned it on, and not before", () => {
    const hidden = pagesSitemap(ORIGIN, false);
    expect(hidden).not.toContain("/newsletter");
    expect(hidden.match(/<url>/g)).toHaveLength(9 * 16 + 2);
  });

  test("a search is listed at its canonical address, once, as its page writes its words", () => {
    expect(searchesSitemap(ORIGIN, ["blue", " Warm   Sunset ", "BLUE", "pastel", ""])).toBe(
      golden("searches.sample")
    );
  });

  test("a collection is listed once, with the day it last changed and its card, then in each language it reads in", () => {
    const ocean = {
      slug: "ocean-gradients",
      updatedAt: 1_760_000_000_000,
      // the later of the collection's change and its translation's dates each language's page
      languages: [
        { locale: "de", updatedAt: 1_750_000_000_000 },
        { locale: "ja", updatedAt: 1_770_000_000_000 }
      ] as const
    };
    expect(collectionsSitemap(ORIGIN, [ocean, ocean])).toBe(golden("collections.sample"));
  });

  test("a palette is listed at its own address, in the view it was saved in, with its picture in that view, once", () => {
    const saved = { style: "linearSwatches", steps: 9, angle: 45 } as const;
    const text = palettesSitemap(ORIGIN, [
      {
        seed: "kS7Q8Yy5S_SChv0",
        view: saved,
        createdAt: 1_700_000_000_000,
        image: paletteFile("kS7Q8Yy5S_SChv0", saved, "png")
      },
      { seed: "not a seed", createdAt: 1_700_000_000_000 },
      // eight keyframes and no view saved: its own address carries its stop count
      { seed: "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ", createdAt: "2024-01-02T00:00:00Z" },
      { seed: "kS7Q8Yy5S_SChv0", createdAt: 1_700_000_000_000 }
    ]);
    expect(text).toBe(golden("palettes.sample"));
  });
});

test("a palette file's name says its place, from the first to the last the index may name", () => {
  expect(paletteShard("palettes")).toBe(1);
  expect(paletteShard("palettes-2")).toBe(2);
  expect(paletteShard(`palettes-${MAX_SHARDS}`)).toBe(MAX_SHARDS);
  for (const name of [
    "palettes-0",
    "palettes-1",
    "palettes-02",
    `palettes-${MAX_SHARDS + 1}`,
    "other"
  ]) {
    expect([name, paletteShard(name)]).toEqual([name, null]);
  }
  expect(() => sitemapIndex(ORIGIN, MAX_SHARDS + 1)).toThrow();
});

test("what changes as palettes and collections are made is kept five minutes at the edge, the rest a day", () => {
  for (const name of ["index", "palettes", "palettes-7", "collections"]) {
    expect(sitemapHeaders(name)).toMatchObject({
      "Cache-Control": "public, max-age=60",
      "CDN-Cache-Control": "max-age=300"
    });
  }
  for (const name of ["pages", "searches"]) {
    expect(sitemapHeaders(name)).toMatchObject({
      "Cache-Control": "public, max-age=3600",
      "CDN-Cache-Control": "max-age=86400, stale-while-revalidate=86400"
    });
  }
});
