import { describe, expect, it, vi } from "vitest";
import app from "../src/index";
import { OG_RENDER_VERSION } from "../src/seo";

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
      "http://local.test/palettes/Warm-Sunset?style=radialGradient&steps=11&angle=45&sort=newest",
      {},
      bindings,
    );
    expect(redirect.status).toBe(301);
    expect(redirect.headers.get("location")).toBe(
      "/palettes/warm-sunset?style=radialGradient&steps=11&angle=45&sort=newest",
    );

    const response = await app.request(
      "http://local.test/palettes/warm-sunset?style=radialGradient&steps=11&angle=45&sort=newest",
      {},
      bindings,
    );
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain(
      // The URL pins style=radialGradient, so the heading names what that view
    // renders (owner rule, 2026-08-18) instead of the generic phrase. The
    // param-free canonical below still carries both nouns, and that is the
    // variant Google indexes.
    "<title>Warm sunset gradients — CSS Gradients | Grabient</title>",
    );
    expect(html).toContain(
      '<link rel="canonical" href="https://grabient-lite.jkorzhuk.workers.dev/palettes/warm-sunset">',
    );
    expect(html).toContain('id="palette-search-input"');
    expect(html).toContain('placeholder="Search palettes..."');
    expect(html).toContain('id="palette-search-input" name="q" type="text" value=""');
    expect(html).toContain("data-drag-scroll");
    expect(html).toContain(
      'data-search-tag href="/palettes/charcoal-%26-chocolate?style=radialGradient&amp;steps=11&amp;angle=45"',
    );
    for (const [name, hex] of [
      ["blue", "#0000ff"],
      ["purple", "#800080"],
      ["cyan", "#00ffff"],
      ["rose", "#ff007f"],
    ]) {
      expect(html).toMatch(
        new RegExp(
          `data-search-tag href="/palettes/${name}\\?[^"]*"[^>]*><span aria-hidden="true" class="inline-flex items-center gap-0.5"><span title="${hex}"[^>]*></span></span><span>${name}</span>`,
        ),
      );
    }
    expect(html).toMatch(
      /data-search-tag href="\/palettes\/teal%2C-azure%2C-navy\?[^"]*"[^>]*><span aria-hidden="true" class="inline-flex items-center gap-0.5"><span title="#008080"[^>]*><\/span><span title="#f0ffff"[^>]*><\/span><span title="#000080"[^>]*><\/span><\/span><span>teal, azure, navy<\/span>/,
    );
    expect(html).toContain('id="query-sort"');
    expect(html).toContain('<input type="hidden" name="sort" value="newest">');
    expect(html).toContain('"@type":"ItemList"');
    expect(html).toContain(
      `href="/${SEED}?style=radialGradient&amp;steps=11&amp;angle=45`,
    );
    expect(html).toContain('data-search-feedback-group data-query="warm sunset"');
    expect(html).toContain(`data-seed="${SEED}"`);
    expect(html).toContain('data-search-feedback="good"');
    expect(html).toContain('data-tip="Good match"');
    expect(html).toContain('data-search-feedback="bad"');
    expect(html).toContain('data-tip="Poor match"');
    expect(html).not.toContain('<meta name="robots" content="noindex');
    const ogImage = html
      .match(/<meta property="og:image" content="([^"]+)">/)?.[1]
      ?.replaceAll("&amp;", "&");
    expect(ogImage).toBeDefined();
    const ogUrl = new URL(ogImage);
    // "warm sunset" is not in the curated vocabulary, so it advertises the
    // static brand card rather than a bespoke montage. Rendering one costs an
    // embedding, a vector search and a rasterization that cannot be cached, and
    // pointing og:image at a URL queryRenderGate would redirect anyway just
    // spends a scraper round trip. Both "warm" and "sunset" are curated
    // individually — the phrase is not — so adding it to CURATED_THEMES is the
    // lever if this query ever deserves its own card.
    expect(ogUrl.pathname).toBe("/grabient.png");
    warn.mockRestore();
  });

  it("still renders a bespoke card for a curated query", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await app.request("http://local.test/palettes/sunset", {}, env());
    const html = await response.text();
    const ogImage = html
      .match(/<meta property="og:image" content="([^"]+)">/)?.[1]
      ?.replaceAll("&amp;", "&");
    const ogUrl = new URL(ogImage);
    expect(ogUrl.pathname).toBe("/api/og/query");
    expect(ogUrl.searchParams.get("query")).toBe("sunset");
    expect(ogUrl.searchParams.get("v")).toBe(String(OG_RENDER_VERSION));
    warn.mockRestore();
  });

  it("renders shared predefined-color swatches in a named-color heading", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await app.request(
      "http://local.test/palettes/blue-purple-cyan-rose",
      {},
      env(),
    );
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('title="#0000ff"');
    expect(html).toContain('title="#800080"');
    expect(html).toContain('title="#00ffff"');
    expect(html).toContain('title="#ff007f"');
    expect(html).toMatch(
      /id="list-h1"[^>]*>.*Blue.*purple.*cyan.*rose.*gradient palettes<\/h1>/s,
    );
    const heading = html.match(/<h1 id="list-h1"[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "";
    expect(heading).toContain('class="whitespace-nowrap"');
    expect(heading).toContain("mr-2");
    expect(heading).toContain("align-[0.1em]");
    expect(heading).toContain("border-2 border-background ring-1 ring-foreground/40");
    expect(heading).not.toContain("inline-flex items-center gap-1.5");
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

// `/palettes/{query}` renders the path into <title>, <h1> and og:title, so an
// ungated route lets anyone mint an indexable grabient.com page saying
// anything. The guard used to key off result count, but Vectorize returns
// nearest neighbours for any input at all, so it never fired.
describe("query landing pages are only indexable when we vouch for the query", () => {
  function envScoring(score) {
    const bindings = env();
    bindings.VECTORIZE.query = vi.fn(async () => ({
      matches: [
        {
          score,
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
    }));
    return bindings;
  }

  async function robotsFor(query, score) {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await app.request(
      `http://local.test/palettes/${query}`,
      {},
      envScoring(score),
    );
    const html = await response.text();
    warn.mockRestore();
    return html.match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? null;
  }

  it("noindexes an injected query even though results came back", async () => {
    // 0.29 is roughly what "buy cheap viagra" actually scored against the live
    // index on 2026-08-17.
    expect(await robotsFor("buy-cheap-viagra", 0.29)).toBe("noindex,follow");
  });

  it("keeps a curated query indexable at a weak score", async () => {
    // "lagoon" is curated and genuinely scores low (0.3796 measured), so the
    // curated list has to win over the score, not the other way round.
    expect(await robotsFor("lagoon", 0.3796)).toBeNull();
  });

  it("lets a novel query in on a confident score alone", async () => {
    expect(await robotsFor("bioluminescent-abyss", 0.61)).toBeNull();
  });

  it("follows even when it does not index, so seed pages stay reachable", async () => {
    // Seed pages have no other inbound links; dropping `follow` would strand
    // them entirely.
    expect(await robotsFor("free-crypto-giveaway", 0.2766)).toContain("follow");
  });
});
