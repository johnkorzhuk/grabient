import { readFileSync } from "node:fs";
import type { PaletteWords } from "@grabient/engine/markdown.ts";
import { seedName } from "@grabient/engine/name.ts";
import { parseView } from "@grabient/engine/view.ts";
import { beforeAll, describe, expect, test } from "vitest";
import files from "../files/fixtures/file-bodies.json" with { type: "json" };
import { readyOldIds } from "./legacy.ts";
import {
  type CollectionWords,
  collectionMarkdown,
  type MarkdownReads,
  markdownFile
} from "./markdown.ts";

// the old addresses' maps load on first need; these tests read them through the plain functions
beforeAll(readyOldIds);

const ORIGIN = "https://grabient-lite.jkorzhuk.workers.dev";
const golden = readFileSync(new URL("fixtures/collection-markdown.md", import.meta.url), "utf8");

/** The collection grabient-lite served, read back from its own Markdown: each palette's seed, view and title. A
    title the palette's colors would give it anyway is left for the file to say. */
function brightGradients(): CollectionWords {
  const items = [...golden.matchAll(/^\d+\. \[(.+?)\]\(([^)]+)\): /gm)].map(([, name, address]) => {
    const url = new URL(address);
    const { style, steps, angle } = parseView(url.searchParams);
    const seed = url.pathname.slice(1);
    return {
      seed,
      style,
      steps,
      angle,
      ...(seedName(seed, style, steps) === name ? {} : { title: name })
    };
  });
  return {
    slug: "bright-gradients",
    title: "Bright gradients",
    description:
      "Bright yellow, orange, coral, pink, cyan, blue, violet, lime, and green sweep through vivid midtones and luminous highlights.",
    tags: ["bright gradients", "yellow", "pink", "cyan", "blue", "green", "violet", "vibrant"],
    itemCount: 30,
    owner: "Grabient",
    updatedAt: 1_790_892_165_883,
    items
  };
}

const reads = (found: Partial<MarkdownReads> = {}): MarkdownReads => ({
  paletteWords: async () => ({ written: null, heldBy: [] }),
  collection: async () => null,
  isCollection: name => /^(@[a-z0-9_-]{3,30}\/)?[a-z0-9]+(-[a-z0-9]+)*$/.test(name),
  ...found
});
const get = (path: string) => new Request(`https://grabient.com${path}`);

describe("a collection as Markdown", () => {
  test("is the file grabient-lite served, with its sheet under its words and its files at its own address among its forms", () => {
    const doc = brightGradients();
    expect(doc.items).toHaveLength(30);
    // some titles are the palettes' own names, which the file writes from their colors
    expect(doc.items.filter(item => !item.title).length).toBeGreaterThan(0);
    expect(collectionMarkdown(doc, ORIGIN)).toBe(golden);
  });

  test("is served out of search results, naming its page as the form to read, kept five minutes at the edge", async () => {
    const response = await markdownFile(
      "bright-gradients",
      get("/bright-gradients.md"),
      ORIGIN,
      reads({
        collection: async () => brightGradients()
      })
    );
    expect(response.status).toBe(200);
    expect(Object.fromEntries(response.headers)).toMatchObject({
      "content-type": "text/markdown; charset=utf-8",
      link: `<${ORIGIN}/bright-gradients>; rel="alternate"; type="text/html"`,
      "x-robots-tag": "noindex",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=0, must-revalidate",
      "cdn-cache-control": "max-age=300"
    });
  });

  test("writes its words as plain text, an account's collection at its own address", () => {
    const text = collectionMarkdown(
      {
        slug: "@ada/ocean-gradients",
        title: "Ocean gradients",
        description: "Blues and *greens* of the sea",
        tags: ["ocean", "blue"],
        itemCount: 2,
        owner: "Ada",
        updatedAt: Date.parse("2026-10-01T12:00:00Z"),
        items: [
          { seed: files.seed, style: "linearGradient", steps: 8, angle: 45, title: "Sea [glass]" },
          { seed: "kQAAAAfwA_4", style: "radialSwatches", steps: 5, angle: 90 }
        ]
      },
      files.origin
    );
    expect(text.split("\n").slice(0, 11)).toEqual([
      "# Ocean gradients",
      "",
      "Blues and \\*greens\\* of the sea",
      "",
      `![Ocean gradients: a collection of color palettes](${files.origin}/@ada/ocean-gradients.png?t=${Date.parse("2026-10-01T12:00:00Z")})`,
      "",
      `- Page: ${files.origin}/@ada/ocean-gradients`,
      "- Palettes: 2",
      "- Tags: ocean, blue",
      "- Collected by: Ada",
      "- Updated: 2026-10-01"
    ]);
    expect(text).toContain(
      `1. [Sea \\[glass\\]](${files.origin}/${files.seed}?steps=8&angle=45): linear gradient, \`#4052d2\` \`#4d24ea\``
    );
    expect(text).toContain(
      `(${files.origin}/kQAAAAfwA_4?style=radialSwatches&steps=5): radial swatches, \`#000000\``
    );
    expect(text).toContain(`- [GPL](${files.origin}/@ada/ocean-gradients.gpl)\n`);
  });

  test("is a 404 for an address no public collection has", async () => {
    const response = await markdownFile("no-such-collection-xyz", get("/x.md"), ORIGIN, reads());
    expect([response.status, await response.json()]).toEqual([
      404,
      { error: "No collection has this address." }
    ]);
  });
});

describe("a palette as Markdown", () => {
  test("names its canonical seed, takes the view, and is kept a day at the edge", async () => {
    const response = await markdownFile(
      "kS7Q8Yy5S_SChv0",
      get("/kS7Q8Yy5S_SChv0.md?steps=9&style=radialSwatches"),
      "https://grabient.com",
      reads()
    );
    const text = await response.text();
    expect(text.startsWith("# Analogous gray, brown and maroon radial swatches\n")).toBe(true);
    expect(text).toContain("- Drawn as: radial swatches, 9 steps, 90 degrees");
    expect(Object.fromEntries(response.headers)).toMatchObject({
      link: '<https://grabient.com/kS7Q8Yy5S_SChv0>; rel="alternate"; type="text/html"',
      "x-robots-tag": "noindex",
      "cache-control": "public, max-age=3600",
      "cdn-cache-control": "max-age=86400, stale-while-revalidate=86400"
    });
  });

  test("names as its page the palette's own address, in the view it was saved in", async () => {
    const response = await markdownFile(
      "kS7Q8Yy5S_SChv0",
      get("/kS7Q8Yy5S_SChv0.md?style=radialSwatches"),
      "https://grabient.com",
      reads({
        paletteWords: async () => ({
          saved: { style: "linearSwatches", steps: 9, angle: 90 },
          written: null,
          heldBy: []
        })
      })
    );
    expect(response.headers.get("Link")).toBe(
      '<https://grabient.com/kS7Q8Yy5S_SChv0?style=linearSwatches&steps=9>; rel="alternate"; type="text/html"'
    );
  });

  test("is the file grabient.com served, with the words written for it too", async () => {
    const plain = await markdownFile(
      files.seed,
      get(`/${files.seed}.md?steps=8&angle=45`),
      files.origin,
      reads()
    );
    expect(await plain.text()).toBe(files.markdown);
    const written = await markdownFile(
      files.written.seed,
      get(`/${files.written.seed}.md`),
      files.origin,
      reads({
        paletteWords: async () => ({
          written: files.written.written as PaletteWords,
          heldBy: files.written.heldBy
        })
      })
    );
    expect(await written.text()).toBe(files.written.markdown);
  });

  test("reads its view as its cache key does: a key a crawler copied as amp;steps, and the last of a repeated one", async () => {
    const at = async (query: string) =>
      (
        await markdownFile(files.seed, get(`/${files.seed}.md?${query}`), files.origin, reads())
      ).text();
    expect(await at("amp;steps=8&amp;angle=45")).toBe(files.markdown);
    expect(await at("angle=10&steps=8&angle=45")).toBe(files.markdown);
  });

  test("says the words written for it and the collections that hold it, and goes on without them when they fail", async () => {
    const words = reads({
      paletteWords: async () => ({
        written: {
          title: "Dusk over the mesa",
          lead: "Warm browns settle into maroon.",
          view: { style: "linearGradient", steps: 7, angle: 90 }
        },
        heldBy: [{ slug: "ocean-gradients", title: "Ocean gradients" }]
      })
    });
    const written = await markdownFile(
      "kS7Q8Yy5S_SChv0",
      get("/kS7Q8Yy5S_SChv0.md"),
      "https://grabient.com",
      words
    );
    const text = await written.text();
    expect(text.startsWith("# Dusk over the mesa\n\nWarm browns settle into maroon.\n")).toBe(true);
    expect(text).toMatch(/\n- Also called: .+ linear gradient\n/);
    expect(text).toContain("- [Ocean gradients](https://grabient.com/ocean-gradients)");
    // drawn another way than it was saved, its colors name it alone
    const other = await (
      await markdownFile(
        "kS7Q8Yy5S_SChv0",
        get("/kS7Q8Yy5S_SChv0.md?style=radialSwatches"),
        "https://grabient.com",
        words
      )
    ).text();
    expect(other).not.toContain("Dusk over the mesa");
    expect(other).not.toContain("Warm browns");
    expect(other).not.toContain("Also called");
    expect(other).toMatch(/^# .+ radial swatches\n/);
    expect(other).toContain("- [Ocean gradients](https://grabient.com/ocean-gradients)");
    const failed = await markdownFile(
      "kS7Q8Yy5S_SChv0",
      get("/kS7Q8Yy5S_SChv0.md"),
      "https://grabient.com",
      reads({
        paletteWords: () => Promise.reject(new Error("D1 is down"))
      })
    );
    expect(failed.status).toBe(200);
  });

  test("an old grabient.com id leads to the palette the maps hold for it", async () => {
    const response = await markdownFile(
      "_gQxgJrgI8f-cgENf8Gf3_f5vf1hgBDf-wgBu",
      get("/_gQxgJrgI8f-cgENf8Gf3_f5vf1hgBDf-wgBu.md"),
      "https://grabient.com",
      reads()
    );
    expect(response.headers.get("Link")).toBe(
      '<https://grabient.com/kY4mpDazO-mUuu_fuLqXU49dvVP6>; rel="alternate"; type="text/html"'
    );
  });

  test("a name that is neither a palette nor a collection's address is a 404", async () => {
    const response = await markdownFile(
      "not a palette",
      get("/x.md"),
      "https://grabient.com",
      reads()
    );
    expect([response.status, await response.json()]).toEqual([
      404,
      { error: "Invalid palette seed." }
    ]);
  });
});
