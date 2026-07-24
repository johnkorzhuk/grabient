import { describe, expect, it, vi } from "vitest";
import app from "../src/index";

const SEED = "_gH0gH0gH0gH0gH0gH0gPogPogPogAAgFNgKb";

function env() {
  return {
    DB: {},
    PUBLIC_ORIGIN: "https://grabient-lite.jkorzhuk.workers.dev",
    AI: {
      run: vi.fn(async () => ({ data: [[0.1, 0.2]] })),
    },
    VECTORIZE: {
      query: vi.fn(async () => ({
        matches: [
          {
            score: 0.91,
            metadata: {
              seed: SEED,
              tags: ["sunset"],
              style: "linearGradient",
              steps: 7,
              angle: 135,
              likesCount: 12,
              createdAt: 1_700_000_000_000,
            },
          },
        ],
      })),
    },
    SEARCH_CACHE: {
      get: vi.fn(async () => null),
      put: vi.fn(async () => {}),
    },
  };
}

describe("semantic search route", () => {
  it("canonicalizes the query and SSRs an indexable result landing page", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bindings = env();
    const redirect = await app.request(
      "http://local.test/palettes/Warm-Sunset?style=radialGradient&sort=newest",
      {},
      bindings,
    );
    expect(redirect.status).toBe(301);
    expect(redirect.headers.get("location")).toBe(
      "/palettes/warm-sunset?style=radialGradient&sort=newest",
    );

    const response = await app.request(
      "http://local.test/palettes/warm-sunset?style=radialGradient&sort=newest",
      {},
      bindings,
    );
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("<title>Warm sunset palettes | Grabient</title>");
    expect(html).toContain(
      '<link rel="canonical" href="https://grabient-lite.jkorzhuk.workers.dev/palettes/warm-sunset">',
    );
    expect(html).toContain('id="palette-search-input"');
    expect(html).toContain('placeholder="Search palettes..."');
    expect(html).toContain('id="palette-search-input" name="q" type="text" value=""');
    expect(html).toContain("data-drag-scroll");
    expect(html).toContain('href="/palettes/charcoal-%26-chocolate"');
    expect(html).toContain('id="query-sort"');
    expect(html).toContain('<input type="hidden" name="sort" value="newest">');
    expect(html).toContain('"@type":"ItemList"');
    expect(html).toContain(`href="/${SEED}?style=radialGradient`);
    expect(html).not.toContain('<meta name="robots" content="noindex');
    warn.mockRestore();
  });

  it("supports the no-JS form endpoint", async () => {
    const response = await app.request(
      "http://local.test/palettes?q=Warm%20Sunset",
      {},
      env(),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/palettes/warm-sunset");
  });

  it("parses a pasted Grabient link into its seed, view params, and result context", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const paletteUrl = `https://grabient-lite.jkorzhuk.workers.dev/${SEED}?style=radialGradient&angle=45&steps=11&page=3`;
    const redirect = await app.request(
      `http://local.test/palettes?q=${encodeURIComponent(paletteUrl)}`,
      {},
      env(),
    );
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe(
      `/palettes/${SEED}?style=radialGradient&angle=45&steps=11`,
    );

    const response = await app.request(
      `http://local.test/palettes/${SEED}?style=radialGradient&steps=11&angle=45`,
      {},
      env(),
    );
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("Showing results for seed:");
    expect(html).toContain(`href="/${SEED}?style=radialGradient`);
    expect(html).not.toContain(`${paletteUrl} palettes`);
    warn.mockRestore();
  });
});
