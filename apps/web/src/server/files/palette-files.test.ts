import { colorNamesText, preciseNamer } from "@grabient/engine/precise-names.ts";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { collectionForFiles, writtenWords } from "../collections/files.ts";
import golden from "./fixtures/file-bodies.json" with { type: "json" };
import { apiJsonAnswer, fileAnswer } from "./palette-files.ts";

vi.hoisted(() => Object.assign(globalThis, { __COLOR_NAMES__: "/assets/color-names-test.txt" }));
vi.mock("../collections/files.ts", () => ({
  isCollectionSlug: (name: string) =>
    /^(?:@[a-z0-9_-]{3,30}\/)?[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name),
  collectionForFiles: vi.fn(async () => null),
  texts: vi.fn(async () => []),
  writtenWords: vi.fn(() => null)
}));

const env = { DB: {} as D1Database, PUBLIC_ORIGIN: golden.origin };
const { seed } = golden;
const view = "steps=8&angle=45";
const at = (address: string) => new Request(`https://grabient.test${address}`);
const file = (address: string) => {
  const extension = /\.(\w+)$/.exec(new URL(address, "https://grabient.test").pathname)?.[1];
  return fileAnswer(at(address), env, extension as "css");
};
const base64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

beforeEach(() => vi.clearAllMocks());

describe("a palette's file", () => {
  test("CSS is the engine's file at the address's view, in OKLCH unless it asks for another spelling", async () => {
    const css = await file(`/${seed}.css?${view}`);
    expect([css.status, css.headers.get("Content-Type"), await css.text()]).toEqual([
      200,
      "text/css; charset=utf-8",
      golden.css.oklch
    ]);
    expect([css.headers.get("Cache-Control"), css.headers.get("CDN-Cache-Control")]).toEqual([
      "public, max-age=2592000",
      "max-age=604800"
    ]);
    expect(await (await file(`/${seed}.css?${view}&colors=hex`)).text()).toBe(golden.css.hex);
    expect(await (await file(`/${seed}.css?amp;steps=8&amp;angle=45&colors=cmyk`)).text()).toBe(
      golden.css.oklch
    );
  });

  test("SVG with style=bands is the animated file, which a browser keeps an hour", async () => {
    const svg = await file(`/${seed}.svg?style=bands&bands=7&w=320&h=200&steps=8`);
    expect([svg.status, svg.headers.get("Content-Type"), svg.headers.get("Cache-Control")]).toEqual(
      [200, "image/svg+xml; charset=utf-8", "public, max-age=3600"]
    );
    const text = await svg.text();
    expect(text).toContain('width="320" height="200" viewBox="0 0 320 200"');
    expect(text.match(/<linearGradient /g)).toHaveLength(4);
    expect(text).toContain("@keyframes");
    expect((await file(`/${seed}.svg?style=bands`)).headers.get("Cache-Control")).toBe(
      "public, max-age=3600"
    );
  });

  test("a link preview asking for the animated SVG gets a page whose card is its still frame", async () => {
    const asked = (agent: string) =>
      fileAnswer(
        new Request(`https://grabient.test/${seed}.svg?style=bands&w=1080&h=1080&junk=1`, {
          headers: { "User-Agent": agent }
        }),
        env,
        "svg"
      );
    const preview = await asked("Twitterbot/1.0");
    expect([preview.headers.get("Content-Type"), preview.headers.get("Cache-Control")]).toEqual([
      "text/html; charset=utf-8",
      "no-store"
    ]);
    const html = await preview.text();
    expect(html).toContain(
      `<meta property="og:image" content="${golden.origin}/api/og?style=bands&amp;seed=${seed}">`
    );
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain(`content="${golden.origin}/${seed}.svg?style=bands&amp;size=1080x1080"`);
    const browser = await asked("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/152.0.0.0");
    expect(browser.headers.get("Content-Type")).toBe("image/svg+xml; charset=utf-8");
  });

  test("SVG takes w and h before the view's size", async () => {
    const svg = await file(`/${seed}.svg?${view}`);
    expect([svg.headers.get("Content-Type"), await svg.text()]).toEqual([
      "image/svg+xml; charset=utf-8",
      golden.svg
    ]);
    const { width, height } = golden.svgSized.size;
    expect(
      await (await file(`/${seed}.svg?${view}&size=96x64&w=${width}&h=${height}`)).text()
    ).toBe(golden.svgSized.svg);
    expect(await (await file(`/${seed}.svg?${view}&size=${width}x${height}`)).text()).toBe(
      golden.svgSized.svg
    );
    expect(await (await file(`/${seed}.svg?${view}&w=10&h=64`)).text()).toBe(golden.svg);
  });

  test("JSON is the same at its file and at the API's two addresses, and stays out of search results", async () => {
    for (const answer of [
      await file(`/${seed}.json?${view}`),
      await apiJsonAnswer(at(`/api/palette?seed=${seed}&${view}`), env),
      await apiJsonAnswer(at(`/api/palette.json?seed=${seed}&${view}`), env)
    ]) {
      expect([answer.headers.get("Content-Type"), answer.headers.get("X-Robots-Tag")]).toEqual([
        "application/json",
        "noindex"
      ]);
      expect(await answer.json()).toEqual(golden.json);
    }
    const none = await apiJsonAnswer(at("/api/palette"), env);
    expect([none.status, await none.json()]).toEqual([404, { error: "Invalid palette seed." }]);
  });

  test("JSON names a palette by the title written for it while drawn as it was saved, at any angle, and is kept as text", async () => {
    const words = {
      title: "Dusk over the mesa",
      embed: "",
      view: { style: "linearGradient", steps: 8, angle: 45 }
    } as const;
    vi.mocked(writtenWords)
      .mockReturnValueOnce(words)
      .mockReturnValueOnce(words)
      .mockReturnValueOnce(words);
    const own = await file(`/${seed}.json?${view}`);
    expect(await own.json()).toEqual({ ...golden.json, title: "Dusk over the mesa" });
    expect([own.headers.get("Cache-Control"), own.headers.get("CDN-Cache-Control")]).toEqual([
      "public, max-age=3600",
      "max-age=86400, stale-while-revalidate=86400"
    ]);
    // a turn of the angle keeps it; another style draws another picture, which its colors name
    const turned = await (await file(`/${seed}.json?steps=8&angle=90`)).json();
    expect(turned).toMatchObject({ title: "Dusk over the mesa" });
    const other = await (await file(`/${seed}.json?style=radialSwatches&steps=8&angle=45`)).json();
    expect(other).not.toHaveProperty("title");
    expect(other).toHaveProperty("name");
  });

  test("swatch files are the engine's bytes, each with its media type", async () => {
    const types = {
      ase: "application/octet-stream",
      gpl: "text/plain; charset=utf-8",
      grd: "application/octet-stream",
      tokens: "application/design-tokens+json"
    } as const;
    for (const format of ["ase", "gpl", "grd", "tokens"] as const) {
      const answer = await file(`/${seed}.${format === "tokens" ? "tokens.json" : format}?${view}`);
      expect([
        format,
        answer.headers.get("Content-Type"),
        base64(await answer.arrayBuffer())
      ]).toEqual([format, types[format], golden.swatches[format]]);
    }
  });

  test("a swatch file names its colors precisely where the deploy holds the names", async () => {
    const list = colorNamesText([
      { name: "Lights Out", hex: "#000000" },
      { name: "Pure White", hex: "#ffffff" },
      { name: "Red Alert", hex: "#ff0000" },
      { name: "Blue Hour", hex: "#2244cc" },
      { name: "Meadow", hex: "#55aa44" }
    ]);
    const ASSETS = {
      fetch: async (url: string) =>
        new URL(url).pathname === "/assets/color-names-test.txt"
          ? new Response(list)
          : new Response(null, { status: 404 })
    } as unknown as Fetcher;
    const text = await (
      await fileAnswer(at(`/${seed}.gpl?${view}`), { ...env, ASSETS }, "gpl")
    ).text();
    const swatches = text.split("\n").slice(4).filter(Boolean);
    const name = preciseNamer(list);
    expect(swatches).toHaveLength(8);
    expect(swatches.map(line => line.split("\t")[1])).toEqual(
      swatches.map((line, i) => {
        const hex = `#${line
          .split("\t")[0]
          .trim()
          .split(/\s+/)
          .map(v => Number(v).toString(16).padStart(2, "0"))
          .join("")}`;
        return `${i + 1} ${name(hex)}`;
      })
    );
  });

  test("an old grabient.com id is the palette the migration made of it", async () => {
    const old = await file(
      "/_gQxgJrgI8f-cgENf8Gf3_f5vf1hgBDf-wgBu.css?style=radialGradient&steps=12"
    );
    const made = await file("/kY4mpDazO-mUuu_fuLqXU49dvVP6.css?style=radialGradient&steps=12");
    expect(await old.text()).toBe(await made.text());
  });

  test("a name that is no palette and no collection is 404", async () => {
    for (const address of ["/broken.css", "/Ocean.gpl", "/kAAAAAAAAAAAA.json", "/%E0%A4%A.svg"]) {
      const answer = await file(address);
      expect([address, answer.status, await answer.json()]).toEqual([
        address,
        404,
        { error: "Invalid palette seed." }
      ]);
    }
  });
});

describe("a collection's file", () => {
  const doc = {
    slug: "ocean-gradients",
    title: "Ocean gradients",
    description: "Blues and *greens* of the sea",
    tags: ["ocean", "blue"],
    itemCount: 2,
    owner: "Grabient",
    updatedAt: Date.parse("2026-10-01T12:00:00Z"),
    items: [
      { seed, style: "linearGradient" as const, steps: 8, angle: 45, title: "Sea [glass]" },
      { seed: "kQAAAAfwA_4", style: "radialSwatches" as const, steps: 5, angle: 90 }
    ]
  };

  test("is 404 where no public collection has the address", async () => {
    const answer = await file("/ocean-gradients.ase?junk=1");
    expect([answer.status, await answer.json()]).toEqual([
      404,
      { error: "No collection has this address." }
    ]);
    expect(collectionForFiles).toHaveBeenCalledWith(env, "ocean-gradients");
  });

  test("as a swatch file holds every palette in its order, a GIMP palette named for the collection", async () => {
    vi.mocked(collectionForFiles).mockResolvedValue({ ...doc, slug: "@ada/ocean-gradients" });
    const gpl = await file("/@ada/ocean-gradients.gpl");
    const text = await gpl.text();
    expect([
      gpl.status,
      gpl.headers.get("Content-Type"),
      gpl.headers.get("Cache-Control"),
      gpl.headers.get("CDN-Cache-Control"),
      gpl.headers.get("X-Robots-Tag")
    ]).toEqual([
      200,
      "text/plain; charset=utf-8",
      "public, max-age=0, must-revalidate",
      "max-age=300",
      "noindex"
    ]);
    expect(text.split("\n").slice(0, 4)).toEqual([
      "GIMP Palette",
      "Name: Ocean gradients",
      "Columns: 8",
      `# ${golden.origin}/${seed}?steps=8&angle=45`
    ]);
    expect(collectionForFiles).toHaveBeenCalledWith(env, "@ada/ocean-gradients");
  });
});
